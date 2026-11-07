-- ============================================================
-- UX-07 (7-nov-2026) — confirm_my_vehicle_service valida el km
-- "al hacerlo" con assert_vehicle_km a la FECHA del servicio.
--
-- Antes la RPC solo acotaba 0–2,000,000 y hacía km = p_km si era mayor
-- que la ficha: un dedazo (520000 por 52000) dejaba la ficha envenenada
-- y TODAS las cargas reales posteriores rechazadas ("menores que tu
-- última lectura"). Ahora rige la misma regla que assign_purchase_vehicle,
-- add_my_fuel_log y save_my_vehicle: nunca por debajo de la última
-- lectura anterior a esa fecha, nunca por encima de una posterior, y
-- nunca más de 1,500 km + 500 km/día desde la última lectura. El cliente
-- (ServiceConfirmSheet, kmReadingProblem) bloquea lo mismo antes de enviar.
-- También se verifica la propiedad del vehículo ANTES de la validación
-- (que el mensaje no revele lecturas de un vehículo ajeno).
-- Cuerpo idéntico al de 20260921d salvo esos dos bloques.
-- ============================================================

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
  v_at  timestamptz;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'confirm_my_vehicle_service', false, NULL);

  IF p_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Vehículo requerido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vehicles WHERE id = p_vehicle_id AND member_id = v_mid) THEN
    RAISE EXCEPTION 'Vehículo no encontrado' USING ERRCODE = '22023';
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

  -- UX-07: la lectura debe ser coherente con la cadena de km del vehículo
  -- a la fecha del servicio (mediodía de Guatemala, igual que el evento).
  v_at := LEAST(now(), (p_done_on::timestamp + interval '12 hours') AT TIME ZONE 'America/Guatemala');
  IF p_km IS NOT NULL THEN
    PERFORM public.assert_vehicle_km(p_vehicle_id, v_at, p_km, NULL, NULL, true);
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
    v_at);

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

-- ============================================================
-- VERIFICAR tras ejecutar (con un vehículo cuya ficha marque p. ej. 52,000 km):
--   1. confirm_my_vehicle_service(<token>, <veh>, current_date, 520000, NULL, 525000)
--      → ERROR 'Los km (520,000) están muy por encima de tu última lectura (52,000). ¿Sobra un dígito?'
--   2. confirm_my_vehicle_service(<token>, <veh>, current_date, 51000, NULL, 56000)
--      → ERROR 'Los km (51,000) son menores que tu última lectura (52,000)…'
--   3. confirm_my_vehicle_service(<token>, <veh>, current_date, 52300, NULL, 57300)
--      → ok, vehicles.km = 52300 y fila 'service' en vehicle_events.
--   4. Diagnóstico SEC.C.7: la función sigue validando sesión (sin cambios).
-- ============================================================
