-- ============================================================
-- E3i (16-oct-2026) — RENDIMIENTO APROXIMADO POR TRAMOS
-- Pedido del dueño: "¿qué sucede con clientes que nunca llenan el
-- tanque pero tampoco llegan a usar la reserva? ¿también es posible que
-- el sistema calcule las ventanas de rendimiento?" → opción 1 aprobada:
-- tramos largos entre cargas con km SIN nivel conocido.
--
-- Regla (misma en src/lib/fuelEconomy.js — APPROX_LOADS=8, APPROX_TANKS=4):
--   · Ancla del tramo = primera carga con km (o la siguiente a un
--     gap_before / a una referencia de lleno o reserva con km).
--   · Cierra en la carga con km que acumula ≥8 cargas con km después
--     del ancla y, si el vehículo tiene tank_gal, ≥4 tanques cargados
--     (la incertidumbre de ± un tanque queda diluida); ventana ≥10 km.
--   · La carga del ancla NO cuenta; la que cierra SÍ; las cargas sin km
--     en medio suman sus galones.
--   · Toda referencia (lleno/reserva con km) REINICIA el tramo → un tramo
--     aproximado nunca se solapa con una ventana exacta: quien llena
--     seguido nunca ve tramos; quien llenó una vez y luego solo parciales
--     ve su ventana exacta y, después, tramos aproximados.
--   · kind='approx', grade='approx'. Misma plausibilidad (tope por tipo
--     y [0.5, 1.5] × mediana con ≥3 ventanas). Entra al titular; en la
--     tendencia cuenta como "confiable" (nunca como base exacta).
--   · km_per_gal_method: 'full' si hay AL MENOS una ventana de
--     referencia (exact/inferred); 'approx' si solo hay tramos;
--     'estimate' (primera→última lectura) mientras no cierre ninguno.
--   · Campo NUEVO aditivo: km_per_gal_approx (tramos confiables).
--
-- Solo redefine list_my_vehicle_stats (misma firma y GRANT). Nada de
-- esquema. Reversible: volver a ejecutar la sección 5 de 20261015.
-- ============================================================

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
  -- tramo APROXIMADO (E3i: sin nivel conocido; APPROX_LOADS=8 cargas con km, APPROX_TANKS=4 tanques)
  a_id  uuid; a_km integer; a_at timestamptz; a_n integer; a_gal numeric;
  v_nrel integer;   -- ventanas de referencia confiables (exact + inferred)
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
    a_id := NULL; a_km := NULL; a_at := NULL; a_n := 0; a_gal := 0;
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
        f_id := NULL; f_gal := 0; r_id := NULL; r_gal := 0; a_id := NULL; a_n := 0; a_gal := 0;
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

      -- APROXIMADO (E3i): tramo entre dos cargas con km SIN nivel conocido.
      -- La carga del ancla no cuenta; la que cierra sí. Toda referencia
      -- (lleno/reserva con km) reinicia el tramo → nunca se solapa con
      -- una ventana exacta. Cierra con ≥8 cargas con km después del ancla
      -- y, si se conoce el tanque, ≥4 tanques cargados (mismas constantes
      -- APPROX_LOADS/APPROX_TANKS de fuelEconomy.js).
      IF c.km_reading IS NOT NULL THEN
        IF a_id IS NULL OR c.is_full OR c.at_reserve THEN
          a_id := c.id; a_km := c.km_reading; a_at := c.created_at; a_n := 0; a_gal := 0;
        ELSE
          a_n := a_n + 1; a_gal := a_gal + COALESCE(c.gallons, 0);
          IF a_n >= 8
             AND (r.tank_gal IS NULL OR r.tank_gal <= 0 OR a_gal >= 4 * r.tank_gal)
             AND c.km_reading - a_km >= 10 AND a_gal > 0 THEN
            v_raw := v_raw || jsonb_build_object(
              'start_id', a_id, 'end_id', c.id, 'km', c.km_reading - a_km, 'gal', round(a_gal, 2),
              'kmgal', round((c.km_reading - a_km) / a_gal, 1), 'from', a_at, 'to', c.created_at,
              'kind', 'approx', 'grade', 'approx');
            a_id := c.id; a_km := c.km_reading; a_at := c.created_at; a_n := 0; a_gal := 0;
          END IF;
        END IF;
      ELSIF a_id IS NOT NULL THEN
        a_gal := a_gal + COALESCE(c.gallons, 0);   -- sin km: sus galones sí se consumieron en el tramo
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

    -- Titular con las confiables (exact + inferred + approx)
    SELECT COALESCE(sum((k.e->>'km')::numeric), 0), COALESCE(sum((k.e->>'gal')::numeric), 0),
           count(*), count(*) FILTER (WHERE k.e->>'grade' = 'exact'),
           count(*) FILTER (WHERE k.e->>'grade' IN ('exact', 'inferred'))
    INTO v_sum_km, v_sum_gal, v_n, v_nexact, v_nrel
    FROM jsonb_array_elements(v_win) AS k(e)
    WHERE k.e->>'grade' <> 'implausible';

    IF v_n > 0 AND v_sum_gal > 0 THEN
      v_kmgal := round(v_sum_km / v_sum_gal, 1);
      -- 'full' en cuanto exista UNA ventana de referencia; solo tramos → 'approx'
      v_method := CASE WHEN v_nrel > 0 THEN 'full' ELSE 'approx' END;
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
      'km_per_gal_approx', v_n - v_nrel,
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
--   1. SELECT prosrc LIKE '%''approx''%' FROM pg_proc WHERE proname = 'list_my_vehicle_stats' → true.
--   2. list_my_vehicle_stats(<token de Ezer>) → la Navi NO cambia
--      (154.6 km/gal, method full, 5 ventanas, km_per_gal_approx 0):
--      todas sus cargas con km son llenos o están a <8 cargas de uno.
--   3. Un vehículo con ≥9 cargas con km sin lleno ni reserva (y, con
--      tanque conocido, ≥4 tanques cargados) → method 'approx', una
--      ventana kind 'approx' cuyo end_id es la 9ª carga con km.
-- ============================================================
