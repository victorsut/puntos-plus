-- ============================================================
-- 20260921d — HISTORIAL DEL VEHÍCULO: EVENTOS (F6 E3g)
-- ============================================================
-- Pedido del dueño (21-sep): "en el historial del vehículo, registra
-- cuando se realizan los servicios y otros movimientos en el vehículo
-- que registre la app". Hasta hoy el historial solo tenía CARGAS; los
-- servicios confirmados solo dejaban last_service/last_service_km en la
-- ficha (sin rastro de los anteriores).
--
-- Piezas:
--   1. Tabla vehicle_events (cerrada; lectura por RPC con sesión):
--        event_type  'created'      vehículo agregado         data: {vtype, brand, model, plate}
--                    'updated'      datos editados            data: {changes: {campo: {from, to}}}
--                    'service'      servicio realizado        data: {done_on, km, next_service, next_service_km}
--                    'alerts_muted' recordatorios on/off      data: {muted}
--   2. vehicle_changes(old, new) — diff whitelisteado (helper interno).
--   3. save_my_vehicle → escribe 'created' / 'updated' / 'alerts_muted'.
--   4. confirm_my_vehicle_service → escribe 'service'.
--   5. list_my_vehicle_events(p_session_token, p_vehicle_id, p_limit).
--   6. Relleno histórico: 'created' en vehicles.created_at para todos y
--      'service' fechado en last_service para los que ya lo tenían.
--
-- Idempotente (el relleno no duplica si se re-ejecuta).
-- ============================================================

-- ── 1. Tabla ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES public.members(id)  ON DELETE CASCADE,
  vehicle_id  uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN ('created','updated','service','alerts_muted')),
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicle_events_vehicle ON public.vehicle_events (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_events_member  ON public.vehicle_events (member_id, created_at DESC);

COMMENT ON TABLE public.vehicle_events IS
'F6 E3g: movimientos del vehículo registrados por la app (alta, edición de datos, servicio realizado, silencio de recordatorios). Se muestran en el Historial del vehículo junto con las cargas. Solo RPCs con sesión.';

ALTER TABLE public.vehicle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_events FROM PUBLIC, anon, authenticated;

-- ── 2. Diff whitelisteado ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vehicle_changes(p_old jsonb, p_new jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('from', p_old->k, 'to', p_new->k)), '{}'::jsonb)
  FROM unnest(ARRAY['vtype','brand','model','version','color','plate','km','oil_type',
                    'next_service','next_service_km','tank_gal','fuel_pref']) AS k
  WHERE p_old->k IS DISTINCT FROM p_new->k;
$function$;
REVOKE ALL ON FUNCTION public.vehicle_changes(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 3. save_my_vehicle — con eventos ──────────────────────────
-- Misma validación y whitelist de 20260904b; se agrega la escritura
-- de eventos (alta / edición con diff / cambio de silencio).
CREATE OR REPLACE FUNCTION public.save_my_vehicle(
  p_session_token text,
  p_vehicle jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mid     uuid;
  v_id      uuid;
  v_count   integer;
  v_vtype   text;
  v_color   text;
  v_km      integer;
  v_next    date;
  v_next_km integer;
  v_tank    numeric;
  v_fuel    text;
  v_muted   boolean;
  v_old     vehicles%ROWTYPE;
  v_row     vehicles%ROWTYPE;
  v_changes jsonb;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'save_my_vehicle', false, NULL);

  v_vtype := COALESCE(NULLIF(p_vehicle->>'vtype', ''), 'liviano');
  IF v_vtype NOT IN ('camion','camion_ligero','picop','microbus','liviano','mototaxi','moto','otro') THEN
    RAISE EXCEPTION 'Tipo de vehículo inválido' USING ERRCODE = '22023';
  END IF;

  v_color := NULLIF(p_vehicle->>'color', '');
  IF v_color IS NOT NULL AND v_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Color inválido' USING ERRCODE = '22023';
  END IF;

  v_km := NULL;
  IF NULLIF(p_vehicle->>'km', '') IS NOT NULL THEN
    v_km := (p_vehicle->>'km')::integer;
    IF v_km < 0 OR v_km > 2000000 THEN
      RAISE EXCEPTION 'Kilometraje fuera de rango' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_next_km := NULL;
  IF NULLIF(p_vehicle->>'next_service_km', '') IS NOT NULL THEN
    v_next_km := (p_vehicle->>'next_service_km')::integer;
    IF v_next_km < 0 OR v_next_km > 2000000 THEN
      RAISE EXCEPTION 'Kilometraje de servicio fuera de rango' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_tank := NULL;
  IF NULLIF(p_vehicle->>'tank_gal', '') IS NOT NULL THEN
    v_tank := (p_vehicle->>'tank_gal')::numeric;
    IF v_tank <= 0 OR v_tank > 200 THEN
      RAISE EXCEPTION 'Capacidad del tanque fuera de rango' USING ERRCODE = '22023';
    END IF;
    v_tank := round(v_tank, 1);
  END IF;

  v_fuel := NULLIF(p_vehicle->>'fuel_pref', '');
  IF v_fuel IS NOT NULL AND v_fuel NOT IN ('regular','super','diesel') THEN
    RAISE EXCEPTION 'Combustible inválido' USING ERRCODE = '22023';
  END IF;

  v_next := NULL;
  IF NULLIF(p_vehicle->>'next_service', '') IS NOT NULL THEN
    v_next := (p_vehicle->>'next_service')::date;
  END IF;

  v_muted := COALESCE((NULLIF(p_vehicle->>'alerts_muted', ''))::boolean, false);

  IF length(COALESCE(p_vehicle->>'brand', ''))    > 40  OR
     length(COALESCE(p_vehicle->>'model', ''))    > 60  OR
     length(COALESCE(p_vehicle->>'version', ''))  > 40  OR
     length(COALESCE(p_vehicle->>'oil_type', '')) > 40  OR
     length(COALESCE(p_vehicle->>'plate', ''))    > 12 THEN
    RAISE EXCEPTION 'Campo demasiado largo' USING ERRCODE = '22023';
  END IF;

  v_id := NULLIF(p_vehicle->>'id', '')::uuid;

  IF v_id IS NULL THEN
    SELECT count(*) INTO v_count FROM vehicles WHERE member_id = v_mid;
    IF v_count >= 10 THEN
      RAISE EXCEPTION 'Máximo 10 vehículos por cuenta' USING ERRCODE = '22023';
    END IF;
    INSERT INTO vehicles (member_id, vtype, brand, model, version, color, plate, km, km_updated_at, oil_type, next_service, next_service_km, tank_gal, fuel_pref, alerts_muted)
    VALUES (
      v_mid, v_vtype,
      NULLIF(p_vehicle->>'brand', ''), NULLIF(p_vehicle->>'model', ''),
      NULLIF(p_vehicle->>'version', ''), v_color,
      NULLIF(p_vehicle->>'plate', ''), v_km,
      CASE WHEN v_km IS NULL THEN NULL ELSE now() END,
      NULLIF(p_vehicle->>'oil_type', ''), v_next, v_next_km, v_tank, v_fuel, v_muted
    )
    RETURNING * INTO v_row;

    -- E3g: alta
    INSERT INTO vehicle_events (member_id, vehicle_id, event_type, data)
    VALUES (v_mid, v_row.id, 'created', jsonb_build_object(
      'vtype', v_row.vtype, 'brand', v_row.brand, 'model', v_row.model, 'plate', v_row.plate, 'km', v_row.km));
  ELSE
    SELECT * INTO v_old FROM vehicles WHERE id = v_id AND member_id = v_mid;
    IF v_old.id IS NULL THEN
      RAISE EXCEPTION 'Vehículo no encontrado' USING ERRCODE = '22023';
    END IF;

    UPDATE vehicles SET
      vtype = v_vtype,
      brand = NULLIF(p_vehicle->>'brand', ''),
      model = NULLIF(p_vehicle->>'model', ''),
      version = NULLIF(p_vehicle->>'version', ''),
      color = v_color,
      plate = NULLIF(p_vehicle->>'plate', ''),
      km = v_km,
      km_updated_at = CASE WHEN v_km IS DISTINCT FROM km THEN now() ELSE km_updated_at END,
      oil_type = NULLIF(p_vehicle->>'oil_type', ''),
      next_service = v_next,
      next_service_km = v_next_km,
      tank_gal = v_tank,
      fuel_pref = v_fuel,
      alerts_muted = v_muted,
      updated_at = now()
    WHERE id = v_id AND member_id = v_mid
    RETURNING * INTO v_row;

    -- E3g: edición (solo si cambió algo de la ficha) y silencio aparte
    v_changes := public.vehicle_changes(to_jsonb(v_old), to_jsonb(v_row));
    IF v_changes <> '{}'::jsonb THEN
      INSERT INTO vehicle_events (member_id, vehicle_id, event_type, data)
      VALUES (v_mid, v_row.id, 'updated', jsonb_build_object('changes', v_changes));
    END IF;
    IF v_old.alerts_muted IS DISTINCT FROM v_row.alerts_muted THEN
      INSERT INTO vehicle_events (member_id, vehicle_id, event_type, data)
      VALUES (v_mid, v_row.id, 'alerts_muted', jsonb_build_object('muted', v_row.alerts_muted));
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'vehicle', jsonb_build_object(
    'id', v_row.id, 'vtype', v_row.vtype, 'brand', v_row.brand, 'model', v_row.model,
    'version', v_row.version, 'color', v_row.color, 'plate', v_row.plate,
    'km', v_row.km, 'km_updated_at', v_row.km_updated_at,
    'oil_type', v_row.oil_type, 'next_service', v_row.next_service,
    'next_service_km', v_row.next_service_km,
    'last_service', v_row.last_service, 'last_service_km', v_row.last_service_km,
    'tank_gal', v_row.tank_gal, 'fuel_pref', v_row.fuel_pref,
    'alerts_muted', v_row.alerts_muted,
    'last_fuel_at', v_row.last_fuel_at, 'created_at', v_row.created_at
  ));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_my_vehicle(text, jsonb) TO anon, authenticated;

-- ── 4. confirm_my_vehicle_service — con evento 'service' ──────
CREATE OR REPLACE FUNCTION public.confirm_my_vehicle_service(
  p_session_token   text,
  p_vehicle_id      uuid,
  p_done_on         date,
  p_km              integer DEFAULT NULL,
  p_next_service    date    DEFAULT NULL,
  p_next_service_km integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mid uuid;
  v_row vehicles%ROWTYPE;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'confirm_my_vehicle_service', false, NULL);

  IF p_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Vehículo requerido' USING ERRCODE = '22023';
  END IF;
  IF p_done_on IS NULL OR p_done_on > current_date OR p_done_on < current_date - 365 THEN
    RAISE EXCEPTION 'Fecha del servicio inválida' USING ERRCODE = '22023';
  END IF;
  IF p_km IS NOT NULL AND (p_km < 0 OR p_km > 2000000) THEN
    RAISE EXCEPTION 'Kilometraje fuera de rango' USING ERRCODE = '22023';
  END IF;
  IF p_next_service IS NULL AND p_next_service_km IS NULL THEN
    RAISE EXCEPTION 'Anota el próximo servicio (fecha o kilometraje)' USING ERRCODE = '22023';
  END IF;
  IF p_next_service IS NOT NULL AND p_next_service <= p_done_on THEN
    RAISE EXCEPTION 'El próximo servicio debe ser posterior al realizado' USING ERRCODE = '22023';
  END IF;
  IF p_next_service_km IS NOT NULL AND (p_next_service_km < 0 OR p_next_service_km > 2000000) THEN
    RAISE EXCEPTION 'Kilometraje de servicio fuera de rango' USING ERRCODE = '22023';
  END IF;
  IF p_next_service_km IS NOT NULL AND p_km IS NOT NULL AND p_next_service_km <= p_km THEN
    RAISE EXCEPTION 'El kilometraje del próximo servicio debe ser mayor al actual' USING ERRCODE = '22023';
  END IF;

  UPDATE vehicles SET
    last_service    = p_done_on,
    last_service_km = COALESCE(p_km, last_service_km),
    km              = CASE WHEN p_km IS NOT NULL AND (km IS NULL OR p_km >= km) THEN p_km ELSE km END,
    km_updated_at   = CASE WHEN p_km IS NOT NULL AND (km IS NULL OR p_km >= km) THEN now() ELSE km_updated_at END,
    next_service    = p_next_service,
    next_service_km = p_next_service_km,
    updated_at      = now()
  WHERE id = p_vehicle_id AND member_id = v_mid
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Vehículo no encontrado' USING ERRCODE = '22023';
  END IF;

  -- E3g: el servicio queda en el historial, fechado el día en que se hizo
  INSERT INTO vehicle_events (member_id, vehicle_id, event_type, data, created_at)
  VALUES (v_mid, v_row.id, 'service', jsonb_build_object(
      'done_on', p_done_on, 'km', p_km,
      'next_service', p_next_service, 'next_service_km', p_next_service_km),
    LEAST(now(), (p_done_on::timestamp + interval '12 hours') AT TIME ZONE 'America/Guatemala'));

  RETURN jsonb_build_object('ok', true, 'vehicle', jsonb_build_object(
    'id', v_row.id, 'vtype', v_row.vtype, 'brand', v_row.brand, 'model', v_row.model,
    'version', v_row.version, 'color', v_row.color, 'plate', v_row.plate,
    'km', v_row.km, 'km_updated_at', v_row.km_updated_at,
    'oil_type', v_row.oil_type, 'next_service', v_row.next_service,
    'next_service_km', v_row.next_service_km,
    'last_service', v_row.last_service, 'last_service_km', v_row.last_service_km,
    'tank_gal', v_row.tank_gal, 'fuel_pref', v_row.fuel_pref,
    'alerts_muted', v_row.alerts_muted,
    'last_fuel_at', v_row.last_fuel_at, 'created_at', v_row.created_at
  ));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_my_vehicle_service(text, uuid, date, integer, date, integer) TO anon, authenticated;

-- ── 5. list_my_vehicle_events ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_my_vehicle_events(
  p_session_token text,
  p_vehicle_id    uuid    DEFAULT NULL,   -- NULL = todos los vehículos del socio
  p_limit         integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mid  uuid;
  v_rows jsonb;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'list_my_vehicle_events', false, NULL);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    p_limit := 60;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', e.id, 'vehicle_id', e.vehicle_id, 'event_type', e.event_type,
           'data', e.data, 'created_at', e.created_at
         ) ORDER BY e.created_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT * FROM vehicle_events
    WHERE member_id = v_mid AND (p_vehicle_id IS NULL OR vehicle_id = p_vehicle_id)
    ORDER BY created_at DESC
    LIMIT p_limit
  ) e;

  RETURN jsonb_build_object('ok', true, 'events', v_rows);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_my_vehicle_events(text, uuid, integer) TO anon, authenticated;

-- ── 6. Relleno histórico (idempotente) ────────────────────────
-- 'created' para cada vehículo existente, fechado en su alta
INSERT INTO vehicle_events (member_id, vehicle_id, event_type, data, created_at)
SELECT v.member_id, v.id, 'created',
       jsonb_build_object('vtype', v.vtype, 'brand', v.brand, 'model', v.model, 'plate', v.plate, 'backfill', true),
       v.created_at
FROM vehicles v
WHERE NOT EXISTS (SELECT 1 FROM vehicle_events e WHERE e.vehicle_id = v.id AND e.event_type = 'created');

-- 'service' para los que ya confirmaron un servicio (solo el último, que
-- es el único dato que se conservaba), fechado el día del servicio
INSERT INTO vehicle_events (member_id, vehicle_id, event_type, data, created_at)
SELECT v.member_id, v.id, 'service',
       jsonb_build_object('done_on', v.last_service, 'km', v.last_service_km,
                          'next_service', v.next_service, 'next_service_km', v.next_service_km, 'backfill', true),
       (v.last_service::timestamp + interval '12 hours') AT TIME ZONE 'America/Guatemala'
FROM vehicles v
WHERE v.last_service IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM vehicle_events e WHERE e.vehicle_id = v.id AND e.event_type = 'service');

-- ============================================================
-- VERIFICAR tras ejecutar:
--   1. SELECT event_type, count(*) FROM vehicle_events GROUP BY 1;
--      → 'created' = nº de vehículos; 'service' = vehículos con last_service.
--   2. list_my_vehicle_events(<token>) → eventos del socio, más recientes primero.
--   3. Editar un vehículo desde la app → fila 'updated' con data.changes.
-- ============================================================
