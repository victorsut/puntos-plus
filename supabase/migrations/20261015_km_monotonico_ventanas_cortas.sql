-- ============================================================
-- 20261015 — TELEMETRÍA E3h: km monótonos, arrastre de ventanas
--            cortas, cargas sin registrar, ventanas por RESERVA,
--            plausibilidad y el servidor como ÚNICA fuente de las
--            ventanas.
-- ============================================================
-- Diagnóstico del 15-oct-2026 (pedido del dueño) sobre el rendimiento
-- de lleno a lleno (20260921b/c). Decisiones del dueño en esta misma
-- sesión: (a) reglas duras de km; (b) arrastrar las ventanas < 10 km;
-- (c) afrontar consumos NO registrados sin comprometer la telemetría;
-- (d) el servidor devuelve las ventanas (el cliente deja de calcular
-- el titular con sus 40 cargas) filtrando las confiables; (e) UNA sola
-- pregunta al cargar con tres respuestas: TANQUE LLENO · LLEGUÉ EN
-- RESERVA · CARGA PARCIAL (la reserva como segunda referencia).
--
-- 1. LECTURAS DE KM (assert_vehicle_km, REVOKE a anon):
--      · km < última lectura del vehículo hasta esa fecha → rechazo
--      · km > una lectura POSTERIOR (reasignar compra vieja) → rechazo
--      · km > última + 1,500 + 500 × días desde esa lectura → rechazo
--    Mismas constantes en src/lib/fuelEconomy.js (KM_JUMP_BASE /
--    KM_PER_DAY_MAX). La ficha (save_my_vehicle) solo se compara contra
--    las cargas (un dedazo en la ficha debe poder corregirse). El km de
--    la ficha solo AVANZA con las cargas.
--
-- 2. ESTADO DEL TANQUE (una pregunta, tres respuestas):
--      · 'full'    → full_tank = true,  at_reserve = NULL  (nivel conocido DESPUÉS de cargar)
--      · 'reserve' → full_tank = NULL,  at_reserve = true  (nivel conocido ANTES de cargar;
--                    si cargó ≥85 % del tanque se infiere ADEMÁS lleno)
--      · 'partial' → full_tank = false, at_reserve = false
--      · sin respuesta → NULL/NULL (lleno se infiere por tamaño, como antes)
--    Columna nueva at_reserve en purchases y vehicle_fuel_logs.
--
-- 3. CARGA SIN REGISTRAR (gap_before boolean): "cargué en otro lado y
--    no lo registré" → esa carga REINICIA la medición (puede ser ancla
--    pero NO cierra la ventana anterior, cuyos galones se descartan).
--
-- 4. ALGORITMO (list_my_vehicle_stats; espejo en fuelEconomy.js):
--      · Cadena LLENO: ancla = km + lleno; ventana A→B = km B−A, galones
--        de las cargas DESPUÉS de A hasta B inclusive.
--      · Cadena RESERVA: ancla = km + reserva; ventana R1→R2 = km R2−R1,
--        galones desde R1 INCLUSIVE hasta antes de R2 (al llegar a R2 el
--        tanque está otra vez en reserva). Se descarta toda ventana de
--        reserva que se solape en el tiempo con una de lleno (la de
--        lleno es más precisa; no se cuenta dos veces el combustible).
--      · Ventana < 10 km: NO cierra ni mueve el ancla; sus galones se
--        ARRASTRAN (antes se descartaban).
--      · grade: 'exact' | 'inferred' (algún extremo de lleno fue inferido
--        por tamaño, no respondido) | 'implausible'.
--      · PLAUSIBILIDAD: con ≥3 ventanas, una ventana > 1.5 × mediana o
--        < 0.5 × mediana → 'implausible'; siempre, > tope por tipo
--        (moto 250 · mototaxi 150 · liviano 90 · picop 60 · camión
--        ligero 45 · microbús 45 · camión 25 · otro 250 km/gal) →
--        'implausible'. Las implausibles NO entran al titular ni a la
--        tendencia (típicamente: una carga sin registrar).
--      · Titular = Σkm/Σgal de las confiables (exact + inferred).
--      · Tendencia = última ventana vs promedio ponderado de la BASE:
--        exactas si hay ≥3; si no, confiables si hay ≥3; si no, nula.
--      · Sin ventanas confiables → estimador (primera→última lectura).
--    Devuelve además: windows[] (start_id, end_id, km, gal, kmgal, from,
--    to, kind, grade), anchors[] (ids), excluded (n implausibles) y
--    trend_pct — el cliente ya no recalcula.
--
-- Piezas: columnas · vehicle_km_bounds · assert_vehicle_km ·
-- assign_purchase_vehicle (firma nueva, DROP de la de 5 args) ·
-- add_my_fuel_log (firma nueva, DROP de la de 6 args) · save_my_vehicle
-- · list_my_fuel_history · set_my_fuel_load_state (reemplaza a
-- set_my_fuel_load_full, que se elimina) · set_my_fuel_load_gap ·
-- list_my_vehicle_stats.
-- Idempotente. Datos existentes: sin cambios (columnas nuevas NULL).
-- ============================================================

-- ── 0. Columnas ────────────────────────────────────────────────
ALTER TABLE public.purchases         ADD COLUMN IF NOT EXISTS at_reserve boolean;
ALTER TABLE public.purchases         ADD COLUMN IF NOT EXISTS gap_before boolean;
ALTER TABLE public.vehicle_fuel_logs ADD COLUMN IF NOT EXISTS at_reserve boolean;
ALTER TABLE public.vehicle_fuel_logs ADD COLUMN IF NOT EXISTS gap_before boolean;

COMMENT ON COLUMN public.purchases.at_reserve IS
'E3h: ¿llegó a cargar con el tanque en reserva? (respuesta "Llegué en reserva"). Ancla de la cadena de reserva. NULL = no respondió.';
COMMENT ON COLUMN public.purchases.gap_before IS
'E3h: ¿hubo cargas sin registrar antes de esta? Reinicia la medición (no cierra la ventana anterior).';
COMMENT ON COLUMN public.vehicle_fuel_logs.at_reserve IS 'E3h: ver purchases.at_reserve.';
COMMENT ON COLUMN public.vehicle_fuel_logs.gap_before IS 'E3h: ver purchases.gap_before.';

-- ── 1a. vehicle_km_bounds ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vehicle_km_bounds(
  p_vehicle_id       uuid,
  p_at               timestamptz,
  p_exclude_purchase uuid    DEFAULT NULL,
  p_exclude_log      uuid    DEFAULT NULL,
  p_include_vehicle  boolean DEFAULT true,
  OUT lo    integer,
  OUT lo_at timestamptz,
  OUT hi    integer,
  OUT hi_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH k AS (
    SELECT p.km_reading AS km, p.created_at AS at
    FROM purchases p
    WHERE p.vehicle_id = p_vehicle_id AND p.km_reading IS NOT NULL
      AND p.id IS DISTINCT FROM p_exclude_purchase
    UNION ALL
    SELECT l.km_reading, l.created_at
    FROM vehicle_fuel_logs l
    WHERE l.vehicle_id = p_vehicle_id AND l.km_reading IS NOT NULL
      AND l.id IS DISTINCT FROM p_exclude_log
    UNION ALL
    -- el km de la ficha cuenta solo hacia atrás (cota inferior): nunca
    -- como lectura "posterior", porque lo actualiza cada carga con km
    SELECT v.km, COALESCE(v.km_updated_at, v.created_at)
    FROM vehicles v
    WHERE p_include_vehicle AND v.id = p_vehicle_id AND v.km IS NOT NULL
      AND COALESCE(v.km_updated_at, v.created_at) <= p_at
  ),
  b AS (SELECT km, at FROM k WHERE at <= p_at ORDER BY km DESC LIMIT 1),
  a AS (SELECT km, at FROM k WHERE at >  p_at ORDER BY km ASC  LIMIT 1)
  SELECT b.km, b.at, a.km, a.at
  FROM (SELECT 1) x
  LEFT JOIN b ON true
  LEFT JOIN a ON true;
$function$;

REVOKE ALL ON FUNCTION public.vehicle_km_bounds(uuid, timestamptz, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ── 1b. assert_vehicle_km ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_vehicle_km(
  p_vehicle_id       uuid,
  p_at               timestamptz,
  p_km               integer,
  p_exclude_purchase uuid    DEFAULT NULL,
  p_exclude_log      uuid    DEFAULT NULL,
  p_include_vehicle  boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  b      RECORD;
  v_cap  numeric;
  v_days numeric;
BEGIN
  IF p_km IS NULL THEN RETURN; END IF;
  IF p_km < 0 OR p_km > 2000000 THEN
    RAISE EXCEPTION 'Kilometraje fuera de rango' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO b FROM public.vehicle_km_bounds(p_vehicle_id, p_at, p_exclude_purchase, p_exclude_log, p_include_vehicle);

  IF b.lo IS NOT NULL AND p_km < b.lo THEN
    RAISE EXCEPTION 'Los km (%) son menores que tu última lectura (%). Revisa el tablero.',
      to_char(p_km, 'FM999,999,999'), to_char(b.lo, 'FM999,999,999') USING ERRCODE = '22023';
  END IF;

  IF b.hi IS NOT NULL AND p_km > b.hi THEN
    RAISE EXCEPTION 'Los km (%) superan una lectura posterior de este vehículo (%).',
      to_char(p_km, 'FM999,999,999'), to_char(b.hi, 'FM999,999,999') USING ERRCODE = '22023';
  END IF;

  -- Tope por dedazo: 1,500 km + 500 km por día desde la última lectura
  -- (KM_JUMP_BASE / KM_PER_DAY_MAX en src/lib/fuelEconomy.js)
  IF b.lo IS NOT NULL THEN
    v_days := GREATEST(EXTRACT(EPOCH FROM (p_at - b.lo_at)) / 86400.0, 0);
    v_cap  := b.lo + 1500 + 500 * v_days;
    IF p_km > v_cap THEN
      RAISE EXCEPTION 'Los km (%) están muy por encima de tu última lectura (%). ¿Sobra un dígito?',
        to_char(p_km, 'FM999,999,999'), to_char(b.lo, 'FM999,999,999') USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_vehicle_km(uuid, timestamptz, integer, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ── 2a. assign_purchase_vehicle (+ p_at_reserve, + p_gap_before) ─
DROP FUNCTION IF EXISTS public.assign_purchase_vehicle(text, uuid, uuid, integer, boolean);

CREATE OR REPLACE FUNCTION public.assign_purchase_vehicle(
  p_session_token text,
  p_purchase_id   uuid,
  p_vehicle_id    uuid,
  p_km            integer DEFAULT NULL,
  p_full_tank     boolean DEFAULT NULL,
  p_at_reserve    boolean DEFAULT NULL,
  p_gap_before    boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mid uuid;
  v_p   purchases%ROWTYPE;
  v_row vehicles%ROWTYPE;
  v_answered boolean := p_full_tank IS NOT NULL OR p_at_reserve IS NOT NULL;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'assign_purchase_vehicle', false, NULL);

  SELECT * INTO v_p FROM purchases WHERE id = p_purchase_id AND member_id = v_mid;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'Compra no encontrada' USING ERRCODE = '22023';
  END IF;
  IF v_p.created_at < now() - interval '30 days' THEN
    RAISE EXCEPTION 'Esta compra ya no se puede reasignar' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM vehicles WHERE id = p_vehicle_id AND member_id = v_mid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehículo no encontrado' USING ERRCODE = '22023';
  END IF;

  -- E3h: la lectura debe ser coherente con las demás del vehículo A LA
  -- FECHA DE LA COMPRA (la compra puede ser de días atrás)
  PERFORM public.assert_vehicle_km(p_vehicle_id, v_p.created_at, p_km, p_purchase_id, NULL, true);

  UPDATE purchases SET
    vehicle_id = p_vehicle_id,
    km_reading = COALESCE(p_km, CASE WHEN vehicle_id IS DISTINCT FROM p_vehicle_id THEN NULL ELSE km_reading END),
    -- estado del tanque: si vino respuesta se reemplaza el PAR
    -- (full_tank, at_reserve); si no, se conserva (el dato es de la
    -- carga, no del vehículo: sobrevive a la reasignación)
    full_tank  = CASE WHEN v_answered THEN p_full_tank  ELSE full_tank  END,
    at_reserve = CASE WHEN v_answered THEN p_at_reserve ELSE at_reserve END,
    gap_before = COALESCE(p_gap_before, gap_before)
  WHERE id = p_purchase_id;

  UPDATE vehicles SET
    last_fuel_at  = GREATEST(COALESCE(last_fuel_at, '-infinity'::timestamptz), v_p.created_at),
    -- E3h: el km de la ficha solo AVANZA (una compra vieja con lectura
    -- menor no lo retrocede)
    km            = CASE WHEN p_km IS NOT NULL AND (km IS NULL OR p_km >= km) THEN p_km ELSE km END,
    km_updated_at = CASE WHEN p_km IS NOT NULL AND (km IS NULL OR p_km >= km) THEN now() ELSE km_updated_at END,
    updated_at    = now()
  WHERE id = p_vehicle_id
  RETURNING * INTO v_row;

  IF v_p.vehicle_id IS NOT NULL AND v_p.vehicle_id <> p_vehicle_id THEN
    UPDATE vehicles v SET
      last_fuel_at = (SELECT max(p2.created_at) FROM purchases p2 WHERE p2.vehicle_id = v.id),
      updated_at = now()
    WHERE v.id = v_p.vehicle_id AND v.member_id = v_mid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'vehicle', jsonb_build_object(
    'id', v_row.id, 'km', v_row.km, 'km_updated_at', v_row.km_updated_at,
    'last_fuel_at', v_row.last_fuel_at
  ));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_purchase_vehicle(text, uuid, uuid, integer, boolean, boolean, boolean) TO anon, authenticated;

-- ── 2b. add_my_fuel_log (+ p_at_reserve, + p_gap_before) ───────
DROP FUNCTION IF EXISTS public.add_my_fuel_log(text, uuid, numeric, numeric, integer, boolean);

CREATE OR REPLACE FUNCTION public.add_my_fuel_log(
  p_session_token text,
  p_vehicle_id    uuid,
  p_gallons       numeric,
  p_amount        numeric DEFAULT NULL,
  p_km            integer DEFAULT NULL,
  p_full_tank     boolean DEFAULT NULL,
  p_at_reserve    boolean DEFAULT NULL,
  p_gap_before    boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mid uuid;
  v_log vehicle_fuel_logs%ROWTYPE;
  v_row vehicles%ROWTYPE;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'add_my_fuel_log', false, NULL);

  PERFORM 1 FROM vehicles WHERE id = p_vehicle_id AND member_id = v_mid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehículo no encontrado' USING ERRCODE = '22023';
  END IF;
  IF p_gallons IS NULL OR p_gallons <= 0 OR p_gallons > 200 THEN
    RAISE EXCEPTION 'Galones fuera de rango' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NOT NULL AND (p_amount < 0 OR p_amount > 100000) THEN
    RAISE EXCEPTION 'Monto fuera de rango' USING ERRCODE = '22023';
  END IF;

  -- E3h: km monótonos + tope por dedazo (el manual se registra al momento)
  PERFORM public.assert_vehicle_km(p_vehicle_id, now(), p_km, NULL, NULL, true);

  INSERT INTO vehicle_fuel_logs (member_id, vehicle_id, gallons, amount, km_reading, full_tank, at_reserve, gap_before)
  VALUES (v_mid, p_vehicle_id, round(p_gallons, 2), round(p_amount, 2), p_km, p_full_tank, p_at_reserve, p_gap_before)
  RETURNING * INTO v_log;

  UPDATE vehicles SET
    last_fuel_at  = GREATEST(COALESCE(last_fuel_at, '-infinity'::timestamptz), v_log.created_at),
    km            = CASE WHEN p_km IS NOT NULL AND (km IS NULL OR p_km >= km) THEN p_km ELSE km END,
    km_updated_at = CASE WHEN p_km IS NOT NULL AND (km IS NULL OR p_km >= km) THEN now() ELSE km_updated_at END,
    updated_at    = now()
  WHERE id = p_vehicle_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true,
    'log', jsonb_build_object('id', v_log.id, 'created_at', v_log.created_at,
      'gallons', v_log.gallons, 'amount', v_log.amount,
      'vehicle_id', v_log.vehicle_id, 'km_reading', v_log.km_reading,
      'full_tank', v_log.full_tank, 'at_reserve', v_log.at_reserve, 'gap_before', v_log.gap_before),
    'vehicle', jsonb_build_object('id', v_row.id, 'km', v_row.km,
      'km_updated_at', v_row.km_updated_at, 'last_fuel_at', v_row.last_fuel_at));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_my_fuel_log(text, uuid, numeric, numeric, integer, boolean, boolean, boolean) TO anon, authenticated;

-- ── 2c. save_my_vehicle — assert contra las cargas al cambiar el km ─
-- (cuerpo idéntico al de producción, 20260921d, más el assert)
CREATE OR REPLACE FUNCTION public.save_my_vehicle(p_session_token text, p_vehicle jsonb)
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

    -- E3h: el km de la ficha no puede quedar por debajo de una carga
    -- con km (ni disparado hacia arriba). Se compara SOLO contra las
    -- cargas: un dedazo en la propia ficha debe poder corregirse.
    IF v_km IS NOT NULL AND v_km IS DISTINCT FROM v_old.km THEN
      PERFORM public.assert_vehicle_km(v_id, now(), v_km, NULL, NULL, false);
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

-- ── 3. list_my_fuel_history — con at_reserve y gap_before ──────
CREATE OR REPLACE FUNCTION public.list_my_fuel_history(
  p_session_token text,
  p_limit integer DEFAULT 40
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
  v_mid := public.validate_session_token(p_session_token, 'member', 'list_my_fuel_history', false, NULL);

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    p_limit := 40;
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT u.created_at, u.row_data FROM (
      SELECT p.created_at,
             jsonb_build_object(
               'id', p.id, 'source', 'turkaj',
               'created_at', p.created_at,
               'station_id', p.station_id, 'station_name', s.name,
               'fuel_type', p.fuel_type,
               'gallons', round(p.gallons::numeric, 2),
               'amount', round(p.amount::numeric, 2),
               'vehicle_id', p.vehicle_id, 'km_reading', p.km_reading,
               'full_tank', p.full_tank, 'at_reserve', p.at_reserve, 'gap_before', p.gap_before
             ) AS row_data
      FROM purchases p
      LEFT JOIN stations s ON s.id = p.station_id
      WHERE p.member_id = v_mid
      UNION ALL
      SELECT l.created_at,
             jsonb_build_object(
               'id', l.id, 'source', 'manual',
               'created_at', l.created_at,
               'station_id', NULL, 'station_name', NULL,
               'fuel_type', NULL,
               'gallons', round(l.gallons, 2),
               'amount', round(l.amount, 2),
               'vehicle_id', l.vehicle_id, 'km_reading', l.km_reading,
               'full_tank', l.full_tank, 'at_reserve', l.at_reserve, 'gap_before', l.gap_before
             ) AS row_data
      FROM vehicle_fuel_logs l
      WHERE l.member_id = v_mid
    ) u
    ORDER BY u.created_at DESC
    LIMIT p_limit
  ) t;

  RETURN jsonb_build_object('ok', true, 'loads', v_rows, 'editable_days', 30);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_my_fuel_history(text, integer) TO anon, authenticated;

-- ── 4a. set_my_fuel_load_state — reemplaza a set_my_fuel_load_full ─
DROP FUNCTION IF EXISTS public.set_my_fuel_load_full(text, uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.set_my_fuel_load_state(
  p_session_token text,
  p_load_id       uuid,
  p_source        text,      -- 'turkaj' (compra) | 'manual'
  p_state         text       -- 'full' | 'reserve' | 'partial' | NULL (= sin respuesta)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mid  uuid;
  v_n    integer;
  v_full boolean;
  v_res  boolean;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'set_my_fuel_load_state', false, NULL);

  IF p_state IS NOT NULL AND p_state NOT IN ('full', 'reserve', 'partial') THEN
    RAISE EXCEPTION 'Estado del tanque inválido' USING ERRCODE = '22023';
  END IF;
  v_full := CASE p_state WHEN 'full' THEN true WHEN 'partial' THEN false ELSE NULL END;
  v_res  := CASE p_state WHEN 'reserve' THEN true WHEN 'partial' THEN false ELSE NULL END;

  IF p_source = 'manual' THEN
    UPDATE vehicle_fuel_logs SET full_tank = v_full, at_reserve = v_res
    WHERE id = p_load_id AND member_id = v_mid;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    -- misma ventana que la reasignación (30 días)
    UPDATE purchases SET full_tank = v_full, at_reserve = v_res
    WHERE id = p_load_id AND member_id = v_mid
      AND created_at >= now() - interval '30 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Carga no encontrada o fuera de la ventana de edición' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('ok', true, 'state', p_state);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_my_fuel_load_state(text, uuid, text, text) TO anon, authenticated;

-- ── 4b. set_my_fuel_load_gap — "hubo cargas sin registrar antes" ─
CREATE OR REPLACE FUNCTION public.set_my_fuel_load_gap(
  p_session_token text,
  p_load_id       uuid,
  p_source        text,
  p_gap           boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mid uuid;
  v_n   integer;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'set_my_fuel_load_gap', false, NULL);

  IF p_source = 'manual' THEN
    UPDATE vehicle_fuel_logs SET gap_before = p_gap
    WHERE id = p_load_id AND member_id = v_mid;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    UPDATE purchases SET gap_before = p_gap
    WHERE id = p_load_id AND member_id = v_mid
      AND created_at >= now() - interval '30 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Carga no encontrada o fuera de la ventana de edición' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('ok', true, 'gap_before', p_gap);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_my_fuel_load_gap(text, uuid, text, boolean) TO anon, authenticated;

-- ── 5. list_my_vehicle_stats — ventanas confiables desde el servidor ─
CREATE OR REPLACE FUNCTION public.list_my_vehicle_stats(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mid   uuid;
  v_out   jsonb := '{}'::jsonb;
  r       RECORD;
  c       RECORD;   -- fila del recorrido cronológico (no usar f: es el alias de la subconsulta del FOR externo)
  v_first RECORD;
  v_last  RECORD;
  v_gal   numeric;
  v_kmgal numeric;
  v_kmday numeric;
  v_days  numeric;
  v_method text;
  -- ventanas
  v_raw     jsonb;    -- todas las ventanas crudas (lleno + reserva)
  v_kept    jsonb;    -- sin las de reserva solapadas por una de lleno
  v_win     jsonb;    -- con grade final (plausibilidad)
  v_anchors jsonb;
  v_med     numeric;
  v_cap     numeric;
  v_sum_km  numeric;
  v_sum_gal numeric;
  v_n       integer;
  v_nexact  integer;
  v_last_kmgal numeric;
  v_trend   numeric;
  v_base    text;
  v_b_km    numeric;
  v_b_gal   numeric;
  v_b_last  numeric;
  -- cadena LLENO (nivel conocido DESPUÉS de cargar)
  f_id  uuid; f_km integer; f_at timestamptz; f_inf boolean; f_gal numeric;
  -- cadena RESERVA (nivel conocido ANTES de cargar)
  r_id  uuid; r_km integer; r_at timestamptz; r_gal numeric;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'list_my_vehicle_stats', false, NULL);

  FOR r IN
    SELECT f.vehicle_id AS vid,
           count(*) AS n,
           round(sum(f.gallons)::numeric, 2) AS gal,
           round(sum(COALESCE(f.amount, 0))::numeric, 2) AS amt,
           max(f.created_at) AS last_at,
           v.tank_gal, v.vtype
    FROM (
      SELECT p.vehicle_id, p.created_at, p.gallons, p.amount FROM purchases p WHERE p.vehicle_id IS NOT NULL
      UNION ALL
      SELECT l.vehicle_id, l.created_at, l.gallons, l.amount FROM vehicle_fuel_logs l
    ) f
    JOIN vehicles v ON v.id = f.vehicle_id
    WHERE v.member_id = v_mid
    GROUP BY f.vehicle_id, v.tank_gal, v.vtype
  LOOP
    v_kmgal := NULL; v_kmday := NULL; v_method := NULL; v_trend := NULL; v_last_kmgal := NULL;
    v_raw := '[]'::jsonb; v_anchors := '[]'::jsonb;
    f_id := NULL; f_km := NULL; f_at := NULL; f_inf := false; f_gal := 0;
    r_id := NULL; r_km := NULL; r_at := NULL; r_gal := 0;
    -- tope absoluto de km/gal por tipo (KMGAL_CAP en fuelEconomy.js)
    v_cap := CASE r.vtype
      WHEN 'moto' THEN 250 WHEN 'mototaxi' THEN 150 WHEN 'liviano' THEN 90 WHEN 'picop' THEN 60
      WHEN 'camion_ligero' THEN 45 WHEN 'microbus' THEN 45 WHEN 'camion' THEN 25 ELSE 250 END;

    -- Recorrido cronológico
    FOR c IN
      SELECT t.id, t.created_at, t.gallons, t.km_reading,
             COALESCE(t.at_reserve, false) AS at_reserve,
             COALESCE(t.gap_before, false) AS gap_before,
             COALESCE(t.full_tank,
                      r.tank_gal IS NOT NULL AND r.tank_gal > 0 AND t.gallons >= 0.85 * r.tank_gal) AS is_full,
             (t.full_tank IS NULL AND r.tank_gal IS NOT NULL AND r.tank_gal > 0 AND t.gallons >= 0.85 * r.tank_gal) AS is_inferred
      FROM (
        SELECT p.id, p.created_at, p.gallons, p.km_reading, p.full_tank, p.at_reserve, p.gap_before FROM purchases p WHERE p.vehicle_id = r.vid
        UNION ALL
        SELECT l.id, l.created_at, l.gallons, l.km_reading, l.full_tank, l.at_reserve, l.gap_before FROM vehicle_fuel_logs l WHERE l.vehicle_id = r.vid
      ) t
      ORDER BY t.created_at ASC
    LOOP
      -- carga sin registrar antes: nada de lo acumulado sirve
      IF c.gap_before THEN
        f_id := NULL; f_gal := 0; r_id := NULL; r_gal := 0;
      END IF;

      -- RESERVA: la ventana cierra ANTES de sumar esta carga
      IF c.km_reading IS NOT NULL AND c.at_reserve THEN
        IF r_id IS NULL THEN
          r_id := c.id; r_km := c.km_reading; r_at := c.created_at; r_gal := 0;
          v_anchors := v_anchors || to_jsonb(c.id);
        ELSIF c.km_reading - r_km >= 10 THEN
          IF r_gal > 0 THEN
            v_raw := v_raw || jsonb_build_object(
              'start_id', r_id, 'end_id', c.id, 'km', c.km_reading - r_km, 'gal', round(r_gal, 2),
              'kmgal', round((c.km_reading - r_km) / r_gal, 1), 'from', r_at, 'to', c.created_at,
              'kind', 'reserve', 'grade', 'exact');
          END IF;
          r_id := c.id; r_km := c.km_reading; r_at := c.created_at; r_gal := 0;
          v_anchors := v_anchors || to_jsonb(c.id);
        END IF;
        -- < 10 km: arrastre (ni cierra ni mueve el ancla)
      END IF;
      r_gal := r_gal + COALESCE(c.gallons, 0);   -- la carga del ancla de reserva SÍ cuenta

      -- LLENO: la carga del ancla NO cuenta; la que cierra SÍ
      f_gal := f_gal + COALESCE(c.gallons, 0);
      IF c.km_reading IS NOT NULL AND c.is_full THEN
        IF f_id IS NULL THEN
          f_id := c.id; f_km := c.km_reading; f_at := c.created_at; f_inf := c.is_inferred; f_gal := 0;
          v_anchors := v_anchors || to_jsonb(c.id);
        ELSIF c.km_reading - f_km >= 10 THEN
          IF f_gal > 0 THEN
            v_raw := v_raw || jsonb_build_object(
              'start_id', f_id, 'end_id', c.id, 'km', c.km_reading - f_km, 'gal', round(f_gal, 2),
              'kmgal', round((c.km_reading - f_km) / f_gal, 1), 'from', f_at, 'to', c.created_at,
              'kind', 'full', 'grade', CASE WHEN f_inf OR c.is_inferred THEN 'inferred' ELSE 'exact' END);
          END IF;
          f_id := c.id; f_km := c.km_reading; f_at := c.created_at; f_inf := c.is_inferred; f_gal := 0;
          v_anchors := v_anchors || to_jsonb(c.id);
        END IF;
        -- < 10 km: arrastre
      END IF;
    END LOOP;

    -- Reserva solo donde NO hay una ventana de lleno encima (en el tiempo)
    SELECT COALESCE(jsonb_agg(w.e ORDER BY (w.e->>'to')::timestamptz, w.ord), '[]'::jsonb)
    INTO v_kept
    FROM jsonb_array_elements(v_raw) WITH ORDINALITY AS w(e, ord)
    WHERE w.e->>'kind' = 'full'
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_raw) AS fw(e)
         WHERE fw.e->>'kind' = 'full'
           AND (fw.e->>'from')::timestamptz < (w.e->>'to')::timestamptz
           AND (fw.e->>'to')::timestamptz   > (w.e->>'from')::timestamptz);

    -- Plausibilidad: mediana (con ≥3 ventanas) y tope por tipo
    SELECT CASE WHEN count(*) >= 3
                THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY (k.e->>'kmgal')::numeric) END
    INTO v_med
    FROM jsonb_array_elements(v_kept) AS k(e);

    SELECT COALESCE(jsonb_agg(
             k.e || jsonb_build_object('grade',
               CASE WHEN (k.e->>'kmgal')::numeric > v_cap
                      OR (v_med IS NOT NULL AND ((k.e->>'kmgal')::numeric > 1.5 * v_med
                                                 OR (k.e->>'kmgal')::numeric < 0.5 * v_med))
                    THEN 'implausible' ELSE k.e->>'grade' END)
             ORDER BY k.ord), '[]'::jsonb)
    INTO v_win
    FROM jsonb_array_elements(v_kept) WITH ORDINALITY AS k(e, ord);

    -- Titular con las confiables (exact + inferred)
    SELECT COALESCE(sum((k.e->>'km')::numeric), 0), COALESCE(sum((k.e->>'gal')::numeric), 0),
           count(*), count(*) FILTER (WHERE k.e->>'grade' = 'exact')
    INTO v_sum_km, v_sum_gal, v_n, v_nexact
    FROM jsonb_array_elements(v_win) AS k(e)
    WHERE k.e->>'grade' <> 'implausible';

    IF v_n > 0 AND v_sum_gal > 0 THEN
      v_kmgal := round(v_sum_km / v_sum_gal, 1);
      v_method := 'full';
      SELECT (k.e->>'kmgal')::numeric INTO v_last_kmgal
      FROM jsonb_array_elements(v_win) WITH ORDINALITY AS k(e, ord)
      WHERE k.e->>'grade' <> 'implausible' ORDER BY k.ord DESC LIMIT 1;

      -- Tendencia: base = exactas si ≥3; si no, confiables si ≥3
      v_base := CASE WHEN v_nexact >= 3 THEN 'exact' WHEN v_n >= 3 THEN 'reliable' END;
      IF v_base IS NOT NULL THEN
        SELECT sum((k.e->>'km')::numeric), sum((k.e->>'gal')::numeric),
               (array_agg((k.e->>'kmgal')::numeric ORDER BY k.ord DESC))[1]
        INTO v_b_km, v_b_gal, v_b_last
        FROM jsonb_array_elements(v_win) WITH ORDINALITY AS k(e, ord)
        WHERE (v_base = 'exact' AND k.e->>'grade' = 'exact')
           OR (v_base = 'reliable' AND k.e->>'grade' <> 'implausible');
        IF v_b_gal > 0 THEN
          v_trend := round((v_b_last - v_b_km / v_b_gal) / (v_b_km / v_b_gal) * 100);
        END IF;
      END IF;
    END IF;

    -- Primera y última lectura de km (ritmo km/día; y estimador de respaldo)
    SELECT km_reading, created_at INTO v_first
    FROM (
      SELECT p.km_reading, p.created_at FROM purchases p WHERE p.vehicle_id = r.vid AND p.km_reading IS NOT NULL
      UNION ALL
      SELECT l.km_reading, l.created_at FROM vehicle_fuel_logs l WHERE l.vehicle_id = r.vid AND l.km_reading IS NOT NULL
    ) k ORDER BY created_at ASC LIMIT 1;

    SELECT km_reading, created_at INTO v_last
    FROM (
      SELECT p.km_reading, p.created_at FROM purchases p WHERE p.vehicle_id = r.vid AND p.km_reading IS NOT NULL
      UNION ALL
      SELECT l.km_reading, l.created_at FROM vehicle_fuel_logs l WHERE l.vehicle_id = r.vid AND l.km_reading IS NOT NULL
    ) k ORDER BY created_at DESC LIMIT 1;

    IF v_first.km_reading IS NOT NULL AND v_last.km_reading IS NOT NULL
       AND v_last.created_at > v_first.created_at
       AND v_last.km_reading > v_first.km_reading THEN
      IF v_kmgal IS NULL THEN
        SELECT COALESCE(sum(gallons), 0) INTO v_gal
        FROM (
          SELECT p.gallons, p.created_at FROM purchases p WHERE p.vehicle_id = r.vid
          UNION ALL
          SELECT l.gallons, l.created_at FROM vehicle_fuel_logs l WHERE l.vehicle_id = r.vid
        ) g
        WHERE g.created_at > v_first.created_at
          AND g.created_at <= v_last.created_at;
        IF v_gal > 0 THEN
          v_kmgal := round((v_last.km_reading - v_first.km_reading) / v_gal, 1);
          v_method := 'estimate';
        END IF;
      END IF;
      v_days := EXTRACT(EPOCH FROM (v_last.created_at - v_first.created_at)) / 86400.0;
      IF v_days >= 1 THEN
        v_kmday := round((v_last.km_reading - v_first.km_reading) / v_days, 1);
      END IF;
    END IF;

    v_out := v_out || jsonb_build_object(r.vid::text, jsonb_build_object(
      'fuel_count', r.n,
      'total_gallons', r.gal,
      'total_amount', r.amt,
      'last_fuel_at', r.last_at,
      'km_per_gal', v_kmgal,
      'km_per_gal_method', v_method,
      'km_per_gal_windows', v_n,
      'km_per_gal_last', v_last_kmgal,
      'km_per_day', v_kmday,
      'trend_pct', v_trend,
      'excluded', jsonb_array_length(v_win) - v_n,
      'windows', v_win,
      'anchors', (SELECT COALESCE(jsonb_agg(DISTINCT a.e), '[]'::jsonb) FROM jsonb_array_elements(v_anchors) AS a(e))
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'stats', v_out);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_my_vehicle_stats(text) TO anon, authenticated;

-- ============================================================
-- VERIFICAR tras ejecutar:
--   1. SELECT proname, pronargs FROM pg_proc WHERE proname IN
--        ('assign_purchase_vehicle','add_my_fuel_log') → 1 fila cada una (7 y 8 args);
--      set_my_fuel_load_full ya no existe; set_my_fuel_load_state y _gap sí.
--   2. SELECT has_function_privilege('anon', 'public.assert_vehicle_km(uuid,timestamptz,integer,uuid,uuid,boolean)', 'EXECUTE')
--      → false (igual para vehicle_km_bounds).
--   3. SELECT * FROM public.vehicle_km_bounds('44be4393-28f4-4bd3-80f3-8eef3905563f', now())
--      → lo = 19686 (Navi de Ezer), hi NULL.
--   4. list_my_vehicle_stats(<token de Ezer>) → la Navi: 5 ventanas
--      (194 · 134 · 146 · 135 · 130); con mediana 134.6 la primera
--      (193.9 > 1.5 × 134.6 = 201.9? NO) sigue confiable → titular 154.6,
--      trend −16 %, excluded 0. Ver nota en la memoria del proyecto.
--   5. list_my_fuel_history → cada fila trae at_reserve y gap_before (NULL hoy).
-- ============================================================
