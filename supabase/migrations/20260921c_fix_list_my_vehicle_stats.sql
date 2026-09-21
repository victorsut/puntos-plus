-- ============================================================
-- 20260921c — FIX de list_my_vehicle_stats (20260921b)
-- ============================================================
-- La versión de 20260921b usaba `f` como alias de la subconsulta del
-- FOR externo Y como variable RECORD del bucle interno → PostgreSQL
-- fallaba con "record f is not assigned yet" al pedir las estadísticas.
-- Solo se recrea la función (misma lógica de lleno a lleno). El archivo
-- 20260921b quedó corregido en el repo para ejecuciones futuras.
-- ============================================================

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
  c       RECORD;   -- fila del recorrido cronológico (no usar f: es el alias de la subconsulta del FOR externo)
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
    FOR c IN
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
      v_win_gal := v_win_gal + COALESCE(c.gallons, 0);
      IF c.km_reading IS NOT NULL AND c.is_full THEN
        IF v_anchor_km IS NOT NULL AND c.km_reading - v_anchor_km >= 10 AND v_win_gal > 0 THEN
          v_sum_km  := v_sum_km + (c.km_reading - v_anchor_km);
          v_sum_gal := v_sum_gal + v_win_gal;
          v_windows := v_windows + 1;
          v_last_kmgal := round((c.km_reading - v_anchor_km) / v_win_gal, 1);
        END IF;
        v_anchor_km := c.km_reading;
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

-- VERIFICAR: list_my_vehicle_stats(<token miembro>) responde sin error;
-- la Navi de Ezer → km_per_gal ≈ 170, method full, windows 2.
