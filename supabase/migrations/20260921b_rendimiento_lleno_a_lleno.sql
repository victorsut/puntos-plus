-- ============================================================
-- 20260921b — RENDIMIENTO "DE LLENO A LLENO" (F6 E3f)
-- ============================================================
-- Problema (reportado por el dueño con la Navi de Ezer, 21-sep): el
-- rendimiento por tramo dividía los km desde la lectura anterior entre
-- los galones de la carga que cerraba el tramo. Eso solo es correcto si
-- el tanque estaba lleno en AMBAS lecturas. Con cargas parciales el
-- error es enorme en las dos direcciones: Q10 (0.21 gal) tras 119 km
-- → 567 km/gal; el llenado siguiente (0.90 gal) tras 30 km → 33 km/gal.
--
-- Algoritmo nuevo (método estándar de las apps de consumo):
--   • Cada carga puede marcarse como TANQUE LLENO (full_tank: true /
--     false / NULL = no respondió). Si es NULL y el vehículo tiene
--     capacidad de tanque, se INFIERE lleno cuando gallons ≥ 85 % de
--     tank_gal.
--   • ANCLA = carga con km recorridos Y tanque lleno. Entre dos anclas
--     consecutivas A→B: km = B − A; galones = TODAS las cargas después
--     de A hasta B inclusive (las parciales se suman a la ventana).
--   • Ventana válida: km ≥ 10 y galones > 0.
--   • Rendimiento titular = Σkm / Σgal de las ventanas válidas
--     (promedio PONDERADO, no promedio de tramos). method = 'full'.
--   • Sin ninguna ancla: estimador anterior (primera a última lectura,
--     galones después de la primera hasta la última) con method =
--     'estimate' — la UI lo etiqueta como estimado.
--   • km/día no cambia.
--
-- Piezas:
--   1. purchases.full_tank y vehicle_fuel_logs.full_tank (boolean NULL).
--   2. assign_purchase_vehicle(+ p_full_tank) y add_my_fuel_log(+ p_full_tank)
--      — DROP + CREATE (firma nueva; evitar sobrecargas).
--   3. list_my_fuel_history devuelve full_tank por fila.
--   4. set_my_fuel_load_full — marcar/desmarcar lleno desde el historial
--      (compras dentro de la ventana de 30 días; manuales sin límite).
--   5. list_my_vehicle_stats con el algoritmo nuevo: km_per_gal,
--      km_per_gal_method ('full' | 'estimate' | NULL), km_per_gal_windows,
--      km_per_gal_last, km_per_day.
--
-- Idempotente. Los datos existentes no cambian (full_tank queda NULL:
-- la inferencia por tanque ya arregla el caso de Ezer sin tocar nada).
-- Nota de vocabulario (dueño, 21-sep): en la UI ya no se dice
-- "odómetro" sino "kilómetros recorridos".
-- ============================================================

-- ── 1. Columnas ────────────────────────────────────────────────
ALTER TABLE public.purchases         ADD COLUMN IF NOT EXISTS full_tank boolean;
ALTER TABLE public.vehicle_fuel_logs ADD COLUMN IF NOT EXISTS full_tank boolean;

COMMENT ON COLUMN public.purchases.full_tank IS
'F6 E3f: ¿quedó el tanque lleno con esta carga? true/false según el socio; NULL = no respondió (se infiere por tank_gal, umbral 85 %). Base del rendimiento de lleno a lleno.';
COMMENT ON COLUMN public.vehicle_fuel_logs.full_tank IS
'F6 E3f: ¿quedó el tanque lleno con esta carga? (ver purchases.full_tank).';

-- ── 2a. assign_purchase_vehicle (+ p_full_tank) ───────────────
DROP FUNCTION IF EXISTS public.assign_purchase_vehicle(text, uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.assign_purchase_vehicle(
  p_session_token text,
  p_purchase_id   uuid,
  p_vehicle_id    uuid,
  p_km            integer DEFAULT NULL,
  p_full_tank     boolean DEFAULT NULL
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

  IF p_km IS NOT NULL AND (p_km < 0 OR p_km > 2000000) THEN
    RAISE EXCEPTION 'Kilometraje fuera de rango' USING ERRCODE = '22023';
  END IF;

  UPDATE purchases SET
    vehicle_id = p_vehicle_id,
    km_reading = COALESCE(p_km, CASE WHEN vehicle_id IS DISTINCT FROM p_vehicle_id THEN NULL ELSE km_reading END),
    -- full_tank: lo dado; si no vino, se conserva (el dato es de la
    -- carga, no del vehículo: sobrevive a la reasignación)
    full_tank  = COALESCE(p_full_tank, full_tank)
  WHERE id = p_purchase_id;

  UPDATE vehicles SET
    last_fuel_at  = GREATEST(COALESCE(last_fuel_at, '-infinity'::timestamptz), v_p.created_at),
    km            = CASE WHEN p_km IS NOT NULL THEN p_km ELSE km END,
    km_updated_at = CASE WHEN p_km IS NOT NULL THEN now() ELSE km_updated_at END,
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

GRANT EXECUTE ON FUNCTION public.assign_purchase_vehicle(text, uuid, uuid, integer, boolean) TO anon, authenticated;

-- ── 2b. add_my_fuel_log (+ p_full_tank) ───────────────────────
DROP FUNCTION IF EXISTS public.add_my_fuel_log(text, uuid, numeric, numeric, integer);

CREATE OR REPLACE FUNCTION public.add_my_fuel_log(
  p_session_token text,
  p_vehicle_id    uuid,
  p_gallons       numeric,
  p_amount        numeric DEFAULT NULL,
  p_km            integer DEFAULT NULL,
  p_full_tank     boolean DEFAULT NULL
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
  IF p_km IS NOT NULL AND (p_km < 0 OR p_km > 2000000) THEN
    RAISE EXCEPTION 'Kilometraje fuera de rango' USING ERRCODE = '22023';
  END IF;

  INSERT INTO vehicle_fuel_logs (member_id, vehicle_id, gallons, amount, km_reading, full_tank)
  VALUES (v_mid, p_vehicle_id, round(p_gallons, 2), round(p_amount, 2), p_km, p_full_tank)
  RETURNING * INTO v_log;

  UPDATE vehicles SET
    last_fuel_at  = GREATEST(COALESCE(last_fuel_at, '-infinity'::timestamptz), v_log.created_at),
    km            = CASE WHEN p_km IS NOT NULL THEN p_km ELSE km END,
    km_updated_at = CASE WHEN p_km IS NOT NULL THEN now() ELSE km_updated_at END,
    updated_at    = now()
  WHERE id = p_vehicle_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true,
    'log', jsonb_build_object('id', v_log.id, 'created_at', v_log.created_at,
      'gallons', v_log.gallons, 'amount', v_log.amount,
      'vehicle_id', v_log.vehicle_id, 'km_reading', v_log.km_reading,
      'full_tank', v_log.full_tank),
    'vehicle', jsonb_build_object('id', v_row.id, 'km', v_row.km,
      'km_updated_at', v_row.km_updated_at, 'last_fuel_at', v_row.last_fuel_at));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_my_fuel_log(text, uuid, numeric, numeric, integer, boolean) TO anon, authenticated;

-- ── 3. list_my_fuel_history — con full_tank ────────────────────
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
               'full_tank', p.full_tank
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
               'full_tank', l.full_tank
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

-- ── 4. set_my_fuel_load_full — marcar lleno desde el historial ─
CREATE OR REPLACE FUNCTION public.set_my_fuel_load_full(
  p_session_token text,
  p_load_id       uuid,
  p_source        text,      -- 'turkaj' (compra) | 'manual'
  p_full          boolean    -- true / false / NULL (= sin respuesta)
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
  v_mid := public.validate_session_token(p_session_token, 'member', 'set_my_fuel_load_full', false, NULL);

  IF p_source = 'manual' THEN
    UPDATE vehicle_fuel_logs SET full_tank = p_full
    WHERE id = p_load_id AND member_id = v_mid;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    -- misma ventana que la reasignación (30 días)
    UPDATE purchases SET full_tank = p_full
    WHERE id = p_load_id AND member_id = v_mid
      AND created_at >= now() - interval '30 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Carga no encontrada o fuera de la ventana de edición' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('ok', true, 'full_tank', p_full);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_my_fuel_load_full(text, uuid, text, boolean) TO anon, authenticated;

-- ── 5. list_my_vehicle_stats — de lleno a lleno ────────────────
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
  f       RECORD;
  v_first RECORD;
  v_last  RECORD;
  v_gal   numeric;
  v_kmgal numeric;
  v_kmday numeric;
  v_days  numeric;
  v_method text;
  -- lleno a lleno
  v_anchor_km  integer;
  v_win_gal    numeric;
  v_sum_km     numeric;
  v_sum_gal    numeric;
  v_windows    integer;
  v_last_kmgal numeric;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'list_my_vehicle_stats', false, NULL);

  FOR r IN
    SELECT f.vehicle_id AS vid,
           count(*) AS n,
           round(sum(f.gallons)::numeric, 2) AS gal,
           round(sum(COALESCE(f.amount, 0))::numeric, 2) AS amt,
           max(f.created_at) AS last_at,
           v.tank_gal
    FROM (
      SELECT p.vehicle_id, p.created_at, p.gallons, p.amount FROM purchases p WHERE p.vehicle_id IS NOT NULL
      UNION ALL
      SELECT l.vehicle_id, l.created_at, l.gallons, l.amount FROM vehicle_fuel_logs l
    ) f
    JOIN vehicles v ON v.id = f.vehicle_id
    WHERE v.member_id = v_mid
    GROUP BY f.vehicle_id, v.tank_gal
  LOOP
    v_kmgal := NULL; v_kmday := NULL; v_method := NULL;
    v_anchor_km := NULL; v_win_gal := 0; v_sum_km := 0; v_sum_gal := 0; v_windows := 0; v_last_kmgal := NULL;

    -- Recorrido cronológico: anclas = km + lleno (dado o inferido ≥85 % del tanque)
    FOR f IN
      SELECT t.created_at, t.gallons, t.km_reading,
             COALESCE(t.full_tank,
                      r.tank_gal IS NOT NULL AND r.tank_gal > 0 AND t.gallons >= 0.85 * r.tank_gal) AS is_full
      FROM (
        SELECT p.created_at, p.gallons, p.km_reading, p.full_tank FROM purchases p WHERE p.vehicle_id = r.vid
        UNION ALL
        SELECT l.created_at, l.gallons, l.km_reading, l.full_tank FROM vehicle_fuel_logs l WHERE l.vehicle_id = r.vid
      ) t
      ORDER BY t.created_at ASC
    LOOP
      v_win_gal := v_win_gal + COALESCE(f.gallons, 0);
      IF f.km_reading IS NOT NULL AND f.is_full THEN
        IF v_anchor_km IS NOT NULL AND f.km_reading - v_anchor_km >= 10 AND v_win_gal > 0 THEN
          v_sum_km  := v_sum_km + (f.km_reading - v_anchor_km);
          v_sum_gal := v_sum_gal + v_win_gal;
          v_windows := v_windows + 1;
          v_last_kmgal := round((f.km_reading - v_anchor_km) / v_win_gal, 1);
        END IF;
        v_anchor_km := f.km_reading;
        v_win_gal := 0;
      END IF;
    END LOOP;

    IF v_windows > 0 AND v_sum_gal > 0 THEN
      v_kmgal := round(v_sum_km / v_sum_gal, 1);
      v_method := 'full';
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
      'km_per_gal_windows', v_windows,
      'km_per_gal_last', v_last_kmgal,
      'km_per_day', v_kmday
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'stats', v_out);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_my_vehicle_stats(text) TO anon, authenticated;

-- ============================================================
-- VERIFICAR tras ejecutar:
--   1. SELECT proname, pronargs FROM pg_proc WHERE proname IN
--        ('assign_purchase_vehicle','add_my_fuel_log') → 1 fila cada una (5 y 6 args).
--   2. list_my_vehicle_stats(<token de Ezer>) → la Navi con
--      km_per_gal ≈ 170, km_per_gal_method 'full', km_per_gal_windows 2
--      (ventanas 2-sep→14-sep = 318 km / 1.64 gal = 194; 14-sep→20-sep =
--      149 km / 1.11 gal = 134). Antes: tramos de 567 y 33 km/gal.
--   3. list_my_fuel_history → cada fila trae full_tank (NULL hoy).
-- ============================================================
