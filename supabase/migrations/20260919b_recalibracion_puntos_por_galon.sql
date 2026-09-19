-- ============================================================
-- 20260919b — RECALIBRACIÓN DE PUNTOS PLUS (programa de consumo)
-- ============================================================
-- Fuente: "Recalibración de Puntos Plus" v1.1 (7-sep-2026), aprobada por
-- el dueño el 19-sep-2026. Solo socios particulares (Business va aparte).
-- Se decide ANTES del GO-LIVE: después, cada número es una promesa.
--
--   C1  Se ELIMINA el descuento de canje por nivel (0/10/15 %). El punto
--       vale lo mismo para todos los niveles.
--   C2  El punto pasa a valer Q0.10 (10 pts = Q1) SUBIENDO los precios
--       del catálogo — la acumulación no se toca por esta vía. Tabla
--       aprobada: vales = valor × 10; lavados × 1.25. Los SALDOS de los
--       socios NO se ajustan (decisión del dueño).
--   C3  Puntos POR GALÓN, no por quetzal: el costo del programa deja de
--       depender del precio del combustible.
--   C4  Tasas (opción A): ORO 3.5 · PLATINO 4.0 · BLACK 4.5 pts/galón.
--   C5  rewards.min_tier → premios disponibles DESDE un nivel (reemplaza
--       al descuento de canje como beneficio del nivel).
--   C6  Redondeo con round(), no floor().
--   C7  program_config.tiers queda con FORMA de aceptar tasa por tipo de
--       combustible (ptsPerGalFuel) — NO se construye la edición.
--   C8  Términos actualizados (los legales de la app viven en
--       src/views/client/menu/MenuTerms.jsx; acá los de program_config).
--
-- NO se tocan: eventos especiales (evtPts), motor de promociones, bonus
-- de registro/encuestas/referidos, costo del boleto de rifa, API de
-- PROPER (los galones reales de la factura ya son el input).
--
-- El divisor por nivel sigue decidiéndose con el tier PREVIO a la compra.
-- Idempotente: el recálculo de precios corre UNA sola vez (lo marca
-- program_config.general.pointValue).
-- ============================================================

-- ── 1. Helpers internos ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tier_rank(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(COALESCE(p_tier, 'ORO'))
    WHEN 'BLACK' THEN 3 WHEN 'PLATINO' THEN 2 ELSE 1 END;
$$;

-- Tasa de puntos por galón del nivel. C7: si algún día existe
-- tiers.<nivel>.ptsPerGalFuel.<super|regular|diesel>, manda sobre la
-- tasa general del nivel (hoy nadie la escribe).
CREATE OR REPLACE FUNCTION public.tier_pts_per_gal(p_tier text, p_fuel text DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    NULLIF((SELECT (value -> lower(COALESCE(p_tier, 'oro')) -> 'ptsPerGalFuel' ->> lower(COALESCE(p_fuel, '')))::numeric
              FROM program_config WHERE key = 'tiers'), 0),
    NULLIF((SELECT (value -> lower(COALESCE(p_tier, 'oro')) ->> 'ptsPerGal')::numeric
              FROM program_config WHERE key = 'tiers'), 0),
    CASE upper(COALESCE(p_tier, 'ORO')) WHEN 'BLACK' THEN 4.5 WHEN 'PLATINO' THEN 4.0 ELSE 3.5 END
  );
$$;
REVOKE ALL ON FUNCTION public.tier_pts_per_gal(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tier_pts_per_gal(text, text) TO service_role;

-- ── 2. Premios disponibles DESDE un nivel (C5) ───────────────
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS min_tier text;

UPDATE public.rewards
   SET min_tier = upper(tier_exclusive)
 WHERE min_tier IS NULL AND upper(COALESCE(tier_exclusive, '')) IN ('PLATINO', 'BLACK');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rewards_min_tier_check') THEN
    ALTER TABLE public.rewards
      ADD CONSTRAINT rewards_min_tier_check CHECK (min_tier IS NULL OR min_tier IN ('PLATINO', 'BLACK'));
  END IF;
END $$;

COMMENT ON COLUMN public.rewards.min_tier IS
'Recalibración C5: nivel MÍNIMO para canjear (NULL = todos; PLATINO = PLATINO y
BLACK; BLACK = solo BLACK). El catálogo del socio lo muestra bloqueado al final
si no alcanza. tier_exclusive queda como espejo para bundles viejos.';

-- ── 3. Configuración + recálculo de precios (UNA sola vez) ───
DO $$
DECLARE
  v_gen   jsonb;
  v_old   jsonb;
  v_new   jsonb;
  v_rw    jsonb;
BEGIN
  SELECT value INTO v_gen FROM program_config WHERE key = 'general';
  IF v_gen ? 'pointValue' THEN
    RAISE NOTICE 'Recalibración ya aplicada (general.pointValue existe): se omite el paso 3.';
    RETURN;
  END IF;

  -- 3a. Tasas por galón; el descuento de canje queda en 0 (la clave se
  --     conserva para que los bundles cacheados no fallen) y se retira
  --     el divisor por quetzal.
  SELECT value INTO v_old FROM program_config WHERE key = 'tiers';
  v_new := v_old;
  v_new := jsonb_set(v_new, '{oro}',     ((v_new->'oro')     - 'qPerPt') || '{"ptsPerGal":3.5,"discRedeem":0}'::jsonb);
  v_new := jsonb_set(v_new, '{platino}', ((v_new->'platino') - 'qPerPt') || '{"ptsPerGal":4.0,"discRedeem":0}'::jsonb);
  v_new := jsonb_set(v_new, '{black}',   ((v_new->'black')   - 'qPerPt') || '{"ptsPerGal":4.5,"discRedeem":0}'::jsonb);
  UPDATE program_config SET value = v_new WHERE key = 'tiers';

  INSERT INTO admin_audit_log (admin_name, action, entity_type, entity_id, reason_text, old_value, new_value, metadata)
  VALUES ('Migración 20260919b', 'update_loyalty_config', 'config', 'tiers',
          'Recalibración de Puntos Plus v1.1: puntos por galón 3.5/4.0/4.5 y retiro del descuento de canje',
          v_old, v_new, jsonb_build_object('via', 'migration'));

  -- 3b. Catálogo (C2): tabla aprobada por el dueño para los activos…
  SELECT jsonb_agg(jsonb_build_object('name', name, 'points_cost', points_cost) ORDER BY points_cost)
    INTO v_rw FROM rewards WHERE points_cost > 0;

  UPDATE rewards SET points_cost = 100  WHERE name = 'Vale Q10 Combustible'      AND points_cost = 80;
  UPDATE rewards SET points_cost = 250  WHERE name = 'Vale Q25 Combustible'      AND points_cost = 200;
  UPDATE rewards SET points_cost = 500  WHERE name = 'Vale Q50 Combustible'      AND points_cost = 400;
  UPDATE rewards SET points_cost = 1000 WHERE name = 'Vale Q100 Combustible'     AND points_cost = 800;
  UPDATE rewards SET points_cost = 150  WHERE name = 'Lavado Estandar'           AND points_cost = 120;
  UPDATE rewards SET points_cost = 250  WHERE name = 'Lavado VIP + Shampoo Cera' AND points_cost = 200;
  -- …y × 1.25 (redondeado a decenas) para los INACTIVOS con precio, para
  -- que al reactivarlos ya estén en la escala nueva. Los premios ocultos
  -- de rifa/promoción cuestan 0 y no se tocan.
  UPDATE rewards SET points_cost = (round(points_cost * 1.25 / 10.0) * 10)::integer
   WHERE COALESCE(active, true) = false AND points_cost > 0;

  INSERT INTO admin_audit_log (admin_name, action, entity_type, entity_id, reason_text, old_value, new_value, metadata)
  VALUES ('Migración 20260919b', 'update_reward', 'reward', 'catalogo',
          'Recalibración C2: el punto pasa a Q0.10 subiendo los precios del catálogo (vales = valor × 10; resto × 1.25)',
          v_rw,
          (SELECT jsonb_agg(jsonb_build_object('name', name, 'points_cost', points_cost) ORDER BY points_cost)
             FROM rewards WHERE points_cost > 0),
          jsonb_build_object('via', 'migration'));

  -- 3c. Valor del punto (KPIs del panel) + retiro del divisor global.
  UPDATE program_config
     SET value = (value - 'qPerPt') || '{"pointValue":0.10}'::jsonb
   WHERE key = 'general';
END $$;

-- ── 4. Términos de program_config (C8) ───────────────────────
UPDATE program_config
   SET value = (
     SELECT jsonb_agg(to_jsonb(replace(t, 'Club Turkaj', 'Puntos Plus')))
     FROM jsonb_array_elements_text(value) AS t
   ) || '["Los puntos se acumulan por galón de combustible, según la tasa vigente para el nivel del socio publicada en la aplicación."]'::jsonb
 WHERE key = 'terms_use' AND value::text NOT LIKE '%por galón%';

UPDATE program_config
   SET value = value || '["El costo en puntos de cada premio es el mismo para todos los niveles.", "Algunos premios están disponibles únicamente a partir de los niveles PLATINO o BLACK."]'::jsonb
 WHERE key = 'terms_canje' AND value::text NOT LIKE '%mismo para todos los niveles%';

-- ── 5. CORE del registro de compra: puntos por galón (C3, C4, C6) ──
-- Fuente: pg_get_functiondef de la BD viva (19-sep). ÚNICO cambio: el
-- cálculo de v_points.
CREATE OR REPLACE FUNCTION public.register_purchase_core(p_member_id uuid, p_operator_id uuid, p_station_id uuid, p_fuel_amount numeric, p_total_amount numeric, p_gallons numeric, p_fuel_type text, p_invoice_no text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_points       integer;
  v_purchase_id  uuid;
  v_old_gallons  numeric;
  v_new_gallons  numeric;
  v_old_tier     text;
  v_new_tier     text;
  v_card_id      uuid;
  v_old_code     text;
  v_new_code     text;
  v_correlative  text;
  v_tier_prefix  text;
  v_promo        jsonb;
  v_extra        integer := 0;
  v_points_final integer;
  v_promo_suffix text := '';
  v_redemption_code text;
  v_redemption_id   uuid;
  v_grant_count     integer := 0;
  v_effect          jsonb;
BEGIN
  SELECT gallons, card_id INTO v_old_gallons, v_card_id
  FROM members WHERE id = p_member_id;

  IF v_old_gallons IS NULL THEN
    RETURN jsonb_build_object('error', 'member_not_found');
  END IF;

  v_new_gallons := v_old_gallons + p_gallons;
  v_old_tier := public.get_member_tier(v_old_gallons);
  v_new_tier := public.get_member_tier(v_new_gallons);

  -- RECALIBRACIÓN (19-sep-2026): puntos POR GALÓN con la tasa del TIER
  -- previo a la compra (ORO 3.5 · PLATINO 4.0 · BLACK 4.5, editable en
  -- admin) y redondeo al entero más cercano. El monto en Q ya no
  -- interviene: el costo del programa no depende del precio del galón.
  v_points := ROUND(p_gallons * public.tier_pts_per_gal(v_old_tier, p_fuel_type))::integer;

  -- PROMO-1: la promo de mayor beneficio (sin stacking), tier previo.
  v_promo := public.pick_best_promo(
    p_fuel_amount, p_fuel_type, p_station_id, v_old_tier, v_points, p_member_id
  );
  IF v_promo IS NOT NULL THEN
    v_extra := (v_promo->>'extra_points')::integer;
    IF v_promo->>'effect_type' = 'grant_reward' THEN
      v_promo_suffix := ' · 🎁 ' || (v_promo->>'reward_name') || ' gratis';
    ELSIF v_promo->>'effect_type' = 'points_multiplier' THEN
      v_promo_suffix := ' · 🎉 x' || (v_promo->>'effect_value') || ' (+' || v_extra || ')';
    ELSE
      v_promo_suffix := ' · 🎉 +' || v_extra;
    END IF;
  END IF;
  v_points_final := v_points + v_extra;

  INSERT INTO purchases (
    member_id, operator_id, station_id, amount, total_amount,
    fuel_type, gallons, points_earned, invoice_no
  )
  VALUES (
    p_member_id, p_operator_id, p_station_id, p_fuel_amount, p_total_amount,
    p_fuel_type, p_gallons, v_points_final, p_invoice_no
  )
  RETURNING id INTO v_purchase_id;

  -- PROMO-1b: premio gratis → canje cost-0 por el flujo NORMAL de
  -- redemptions (código TK, entrega app/POS, comprobante al entregar).
  IF v_promo IS NOT NULL AND v_promo->>'effect_type' = 'grant_reward' THEN
    v_redemption_code := 'TK-' || upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));
    INSERT INTO redemptions (
      member_id, reward_id, operator_id,
      points_spent, discount_applied, redemption_code
    )
    VALUES (p_member_id, (v_promo->>'reward_id')::uuid, NULL, 0, 0, v_redemption_code)
    RETURNING id INTO v_redemption_id;
    v_grant_count := 1;
    v_promo := v_promo || jsonb_build_object(
      'redemption_code', v_redemption_code,
      'redemption_id',   v_redemption_id
    );
  END IF;

  -- PROMO-1: trazabilidad (desglose base/final + snapshot del efecto)
  IF v_promo IS NOT NULL THEN
    v_effect := jsonb_build_object(
      'type',         v_promo->>'effect_type',
      'value',        (v_promo->>'effect_value')::numeric,
      'extra_points', v_extra
    );
    IF v_grant_count = 1 THEN
      v_effect := v_effect || jsonb_build_object(
        'reward_id',       v_promo->>'reward_id',
        'reward_name',     v_promo->>'reward_name',
        'redemption_id',   v_redemption_id,
        'redemption_code', v_redemption_code
      );
    END IF;
    INSERT INTO promo_applications (
      promo_rule_id, member_id, purchase_id, points_base, points_final, effect
    )
    VALUES (
      (v_promo->>'rule_id')::uuid, p_member_id, v_purchase_id,
      v_points, v_points_final, v_effect
    );
  END IF;

  -- Autoriza el trigger BEFORE UPDATE de FB.7 (cuando exista).
  PERFORM set_config('app.allow_points_write', 'true', true);

  UPDATE members SET
    points  = points + v_points_final,
    gallons = gallons + p_gallons,
    spent   = spent + p_fuel_amount,
    visits  = visits + 1,
    redeemed_count = COALESCE(redeemed_count, 0) + v_grant_count,
    last_buy = now(),
    last_operator_id = p_operator_id,
    updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO activity_log (
    member_id, activity_type, description, points_change, amount, station_id
  )
  VALUES (
    p_member_id, 'compra',
    'Compra ' || p_gallons || ' gal ' || p_fuel_type || ' · Q' || p_fuel_amount || v_promo_suffix,
    v_points_final, p_fuel_amount, p_station_id
  );

  IF v_old_tier <> v_new_tier AND v_card_id IS NOT NULL THEN
    SELECT card_code INTO v_old_code FROM physical_cards WHERE id = v_card_id;
    v_correlative := substring(v_old_code FROM '\d+$');
    IF v_correlative IS NOT NULL THEN
      v_tier_prefix := CASE v_new_tier
        WHEN 'ORO'     THEN 'CTOD'
        WHEN 'PLATINO' THEN 'CTPD'
        WHEN 'BLACK'   THEN 'CTBD'
        ELSE 'CTOD'
      END;
      v_new_code := v_tier_prefix || '-' || v_correlative;
      UPDATE physical_cards
      SET card_code = v_new_code, tier = v_new_tier, updated_at = now()
      WHERE id = v_card_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'purchase_id',    v_purchase_id,
    'points_final',   v_points_final,
    'points_base',    v_points,
    'points_extra',   v_extra,
    'gallons',        p_gallons,
    'old_tier',       v_old_tier,
    'new_tier',       v_new_tier,
    'tier_changed',   v_old_tier <> v_new_tier,
    'new_card_code',  v_new_code,
    'promo',          v_promo,
    'points_balance', (SELECT points FROM members WHERE id = p_member_id)
  );
END;
$function$;

-- ── 6. preview_promo (simulador del admin): misma fórmula ────
-- El simulador recibe un MONTO; los galones se derivan del precio
-- vigente (igual que register_purchase de la app del operador).
CREATE OR REPLACE FUNCTION public.preview_promo(p_amount numeric, p_fuel_type text, p_station_id uuid DEFAULT NULL::uuid, p_tier text DEFAULT 'ORO'::text, p_session_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gallons numeric;
  v_points  integer;
  v_promo   jsonb;
BEGIN
  PERFORM public.validate_session_token(
    p_session_token, 'admin', 'preview_promo', false, NULL
  );

  IF p_amount IS NULL OR p_amount < 10 THEN
    RETURN jsonb_build_object('error', 'Mínimo Q10');
  END IF;

  v_gallons := ROUND(p_amount / public.fuel_price_for(p_station_id, p_fuel_type), 2);
  v_points  := ROUND(v_gallons * public.tier_pts_per_gal(p_tier, p_fuel_type))::integer;
  v_promo   := public.pick_best_promo(
    p_amount, p_fuel_type, p_station_id, p_tier, v_points, NULL
  );

  RETURN jsonb_build_object(
    'gallons',      v_gallons,
    'base_points',  v_points,
    'final_points', v_points + COALESCE((v_promo->>'extra_points')::integer, 0),
    'promo',        v_promo
  );
END;
$function$;

-- El divisor por quetzal ya no tiene consumidores.
DROP FUNCTION IF EXISTS public.tier_q_per_pt(text);

-- ── 7. redeem_reward: sin descuento de canje + nivel mínimo (C1, C5) ──
CREATE OR REPLACE FUNCTION public.redeem_reward(p_member_id uuid, p_reward_id uuid, p_operator_id uuid DEFAULT NULL::uuid, p_session_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_reward    rewards%ROWTYPE;
  v_member    members%ROWTYPE;
  v_tier      text;
  v_cost      integer;
  v_code      text;
  v_redemption_id uuid;
BEGIN
  -- SEC.C.6: opera SIEMPRE sobre el miembro de la sesión, no sobre el
  -- p_member_id que mandó el cliente.
  p_member_id := public.validate_session_token(p_session_token, 'member', 'redeem_reward', false, NULL);

  SELECT * INTO v_reward FROM rewards WHERE id = p_reward_id AND COALESCE(active, true) = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Premio no disponible');
  END IF;

  SELECT * INTO v_member FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Miembro no encontrado');
  END IF;

  v_tier := public.get_member_tier(v_member.gallons);

  -- C5: premio disponible DESDE un nivel (reemplaza al descuento de canje).
  IF v_reward.min_tier IS NOT NULL
     AND public.tier_rank(v_tier) < public.tier_rank(v_reward.min_tier) THEN
    RETURN jsonb_build_object(
      'error', 'Premio disponible desde el nivel ' || v_reward.min_tier
    );
  END IF;

  -- C1: el premio cuesta lo MISMO para todos los niveles.
  v_cost := v_reward.points_cost;

  IF v_member.points < v_cost THEN
    RETURN jsonb_build_object('error', 'Puntos insuficientes');
  END IF;

  v_code := 'TK-' || upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));

  INSERT INTO redemptions (
    member_id, reward_id, operator_id,
    points_spent, discount_applied, redemption_code
  )
  VALUES (
    p_member_id, p_reward_id, p_operator_id,
    v_cost, 0, v_code
  )
  RETURNING id INTO v_redemption_id;

  PERFORM set_config('app.allow_points_write', 'true', true);

  UPDATE members SET
    points          = points - v_cost,
    redeemed_count  = COALESCE(redeemed_count, 0) + 1,
    updated_at      = now()
  WHERE id = p_member_id;

  INSERT INTO activity_log (
    member_id, activity_type, description, points_change
  )
  VALUES (
    p_member_id, 'canje',
    'Canjeó: ' || v_reward.name || ' ' || COALESCE(v_reward.icon, ''),
    -v_cost
  );

  RETURN jsonb_build_object(
    'redemption_id', v_redemption_id,
    'code',          v_code,
    'cost',          v_cost,
    'discount',      0,
    'reward_name',   v_reward.name,
    'reward_icon',   v_reward.icon
  );
END;
$function$;

-- ── 8. set_loyalty_config: tasa por galón en lugar de Q por punto ──
CREATE OR REPLACE FUNCTION public.set_loyalty_config(p_session_token text, p_data jsonb, p_admin_id uuid DEFAULT NULL::uuid, p_admin_name text DEFAULT NULL::text, p_admin_email text DEFAULT NULL::text, p_reason_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old   jsonb;
  v_new   jsonb;
  v_tier  text;
  v_raw   text;
  v_patch jsonb;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'set_loyalty_config', false, NULL);

  SELECT value INTO v_old FROM program_config WHERE key = 'tiers';
  v_new := COALESCE(v_old, '{}'::jsonb);

  FOREACH v_tier IN ARRAY ARRAY['oro', 'platino', 'black'] LOOP
    IF p_data ? v_tier THEN
      v_patch := '{}'::jsonb;

      -- Recalibración: puntos por galón (hasta 2 decimales, 0.1–20).
      IF p_data -> v_tier ? 'ptsPerGal' THEN
        v_raw := p_data -> v_tier ->> 'ptsPerGal';
        IF v_raw !~ '^[0-9]+(\.[0-9]{1,2})?$' OR v_raw::numeric < 0.1 OR v_raw::numeric > 20 THEN
          RETURN jsonb_build_object('error', 'Puntos por galón: número entre 0.1 y 20, máximo 2 decimales (' || v_tier || ')');
        END IF;
        v_patch := v_patch || jsonb_build_object('ptsPerGal', v_raw::numeric);
      END IF;

      IF p_data -> v_tier ? 'evtPts' THEN
        v_raw := p_data -> v_tier ->> 'evtPts';
        IF v_raw !~ '^[0-9]+$' OR v_raw::integer > 1000 THEN
          RETURN jsonb_build_object('error', 'Puntos de evento: entero entre 0 y 1000 (' || v_tier || ')');
        END IF;
        v_patch := v_patch || jsonb_build_object('evtPts', v_raw::integer);
      END IF;

      IF v_patch <> '{}'::jsonb THEN
        v_new := jsonb_set(v_new, ARRAY[v_tier], COALESCE(v_new -> v_tier, '{}'::jsonb) || v_patch);
      END IF;
    END IF;
  END LOOP;

  IF v_new = COALESCE(v_old, '{}'::jsonb) THEN
    RETURN jsonb_build_object('error', 'Nada que actualizar');
  END IF;

  INSERT INTO program_config (key, value) VALUES ('tiers', v_new)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  PERFORM public.log_admin_action(
    p_admin_id    => p_admin_id,
    p_admin_name  => p_admin_name,
    p_admin_email => p_admin_email,
    p_action      => 'update_loyalty_config',
    p_entity_type => 'config',
    p_entity_id   => 'tiers',
    p_reason_text => p_reason_text,
    p_old_value   => v_old,
    p_new_value   => v_new
  );

  RETURN v_new;
END;
$function$;

-- ── 9. admin_write_catalog: min_tier en el whitelist de 'reward' ──
-- Fuente: migración 20260919 (ya en la BD). Cambios: min_tier normalizado,
-- tier_exclusive como espejo.
CREATE OR REPLACE FUNCTION public.admin_write_catalog(p_session_token text, p_entity text, p_action text, p_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT '{}'::jsonb, p_admin_id uuid DEFAULT NULL::uuid, p_admin_name text DEFAULT NULL::text, p_admin_email text DEFAULT NULL::text, p_reason_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_id  uuid := p_id;
  v_min text;               -- nivel mínimo normalizado (NULL = todos)
  v_has_min boolean := false;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'admin_write_catalog', false, NULL);

  IF p_entity NOT IN ('reward','promotion','special_day','raffle','station','store') THEN
    RETURN jsonb_build_object('error', 'Entidad inválida');
  END IF;
  IF p_action NOT IN ('create','update','delete') THEN
    RETURN jsonb_build_object('error', 'Acción inválida');
  END IF;
  IF p_action <> 'create' AND p_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Falta el identificador');
  END IF;

  -- ── Snapshot previo (auditoría) ──
  IF p_id IS NOT NULL THEN
    SELECT CASE p_entity
      WHEN 'reward'      THEN (SELECT to_jsonb(t) FROM rewards t WHERE t.id = p_id)
      WHEN 'promotion'   THEN (SELECT to_jsonb(t) FROM promotions t WHERE t.id = p_id)
      WHEN 'special_day' THEN (SELECT to_jsonb(t) FROM special_days t WHERE t.id = p_id)
      WHEN 'raffle'      THEN (SELECT to_jsonb(t) FROM raffle_calendar t WHERE t.id = p_id)
      WHEN 'station'     THEN (SELECT to_jsonb(t) FROM stations t WHERE t.id = p_id)
      WHEN 'store'       THEN (SELECT to_jsonb(t) FROM partner_stores t WHERE t.id = p_id)
    END INTO v_old;
    IF v_old IS NULL THEN
      RETURN jsonb_build_object('error', 'Registro no encontrado');
    END IF;
  END IF;

  -- ── DELETE ──
  IF p_action = 'delete' THEN
    IF p_entity = 'station' THEN
      RETURN jsonb_build_object('error', 'Las estaciones no se eliminan');
    END IF;
    IF p_entity = 'special_day' AND COALESCE((v_old->>'system')::boolean, false) THEN
      RETURN jsonb_build_object('error', 'Los días del sistema no se eliminan');
    END IF;
    CASE p_entity
      WHEN 'reward'      THEN DELETE FROM rewards        WHERE id = p_id;
      WHEN 'promotion'   THEN DELETE FROM promotions     WHERE id = p_id;
      WHEN 'special_day' THEN DELETE FROM special_days   WHERE id = p_id;
      WHEN 'raffle'      THEN DELETE FROM raffle_calendar WHERE id = p_id;
      WHEN 'store'       THEN
        UPDATE rewards
          SET store_ids = NULLIF(array_remove(store_ids, p_id), ARRAY[]::uuid[])
          WHERE store_ids @> ARRAY[p_id];
        DELETE FROM partner_stores WHERE id = p_id;
    END CASE;

  -- ── CREATE / UPDATE (whitelist por entidad) ──
  ELSIF p_entity = 'reward' THEN
    -- Recalibración C5: nivel MÍNIMO del premio. Se acepta min_tier y,
    -- por compatibilidad con paneles cacheados, el viejo tier_exclusive.
    -- 'ORO' / 'todos' / vacío = disponible para todos (NULL).
    IF p_data ? 'min_tier' OR p_data ? 'tier_exclusive' THEN
      v_has_min := true;
      v_min := upper(NULLIF(trim(COALESCE(p_data->>'min_tier', p_data->>'tier_exclusive', '')), ''));
      IF v_min IN ('ORO', 'TODOS') THEN v_min := NULL; END IF;
      IF v_min IS NOT NULL AND v_min NOT IN ('PLATINO', 'BLACK') THEN
        RETURN jsonb_build_object('error', 'Nivel mínimo inválido (PLATINO, BLACK o todos)');
      END IF;
    END IF;
    IF p_action = 'create' THEN
      INSERT INTO rewards (name, icon, points_cost, category, tier_exclusive, active, sort_order, description,
                           station_ids, store_ids, cash_value, min_tier)
      VALUES (p_data->>'name', p_data->>'icon',
              COALESCE((p_data->>'points_cost')::integer, 0), p_data->>'category',
              v_min,   -- tier_exclusive = espejo de min_tier (bundles viejos)
              COALESCE((p_data->>'active')::boolean, true),
              NULLIF(p_data->>'sort_order', '')::integer, p_data->>'description',
              public.jsonb_uuid_array(p_data->'station_ids'),
              public.jsonb_uuid_array(p_data->'store_ids'),
              NULLIF(p_data->>'cash_value', '')::numeric,
              v_min)
      RETURNING id INTO v_id;
    ELSE
      UPDATE rewards SET
        name           = CASE WHEN p_data ? 'name'           THEN p_data->>'name' ELSE name END,
        icon           = CASE WHEN p_data ? 'icon'           THEN p_data->>'icon' ELSE icon END,
        points_cost    = CASE WHEN p_data ? 'points_cost'    THEN (p_data->>'points_cost')::integer ELSE points_cost END,
        category       = CASE WHEN p_data ? 'category'       THEN p_data->>'category' ELSE category END,
        tier_exclusive = CASE WHEN v_has_min THEN v_min ELSE tier_exclusive END,
        min_tier       = CASE WHEN v_has_min THEN v_min ELSE min_tier END,
        active         = CASE WHEN p_data ? 'active'         THEN (p_data->>'active')::boolean ELSE active END,
        sort_order     = CASE WHEN p_data ? 'sort_order'     THEN NULLIF(p_data->>'sort_order','')::integer ELSE sort_order END,
        description    = CASE WHEN p_data ? 'description'    THEN p_data->>'description' ELSE description END,
        station_ids    = CASE WHEN p_data ? 'station_ids'    THEN public.jsonb_uuid_array(p_data->'station_ids') ELSE station_ids END,
        store_ids      = CASE WHEN p_data ? 'store_ids'      THEN public.jsonb_uuid_array(p_data->'store_ids') ELSE store_ids END,
        cash_value     = CASE WHEN p_data ? 'cash_value'     THEN NULLIF(p_data->>'cash_value','')::numeric ELSE cash_value END
      WHERE id = p_id;
    END IF;

  ELSIF p_entity = 'promotion' THEN
    IF p_action = 'create' THEN
      INSERT INTO promotions (title, description, icon, bg_gradient, text_color, active, sort_order,
                              image_url, category, valid_until, conditions, promo_rule_id, text_colors)
      VALUES (p_data->>'title', p_data->>'description', p_data->>'icon',
              p_data->>'bg_gradient', p_data->>'text_color',
              COALESCE((p_data->>'active')::boolean, true),
              NULLIF(p_data->>'sort_order','')::integer,
              NULLIF(p_data->>'image_url',''), NULLIF(p_data->>'category',''),
              NULLIF(p_data->>'valid_until','')::date, p_data->>'conditions',
              NULLIF(p_data->>'promo_rule_id','')::uuid, p_data->'text_colors')
      RETURNING id INTO v_id;
    ELSE
      UPDATE promotions SET
        title         = CASE WHEN p_data ? 'title'         THEN p_data->>'title' ELSE title END,
        description   = CASE WHEN p_data ? 'description'   THEN p_data->>'description' ELSE description END,
        icon          = CASE WHEN p_data ? 'icon'          THEN p_data->>'icon' ELSE icon END,
        bg_gradient   = CASE WHEN p_data ? 'bg_gradient'   THEN p_data->>'bg_gradient' ELSE bg_gradient END,
        text_color    = CASE WHEN p_data ? 'text_color'    THEN p_data->>'text_color' ELSE text_color END,
        active        = CASE WHEN p_data ? 'active'        THEN (p_data->>'active')::boolean ELSE active END,
        sort_order    = CASE WHEN p_data ? 'sort_order'    THEN NULLIF(p_data->>'sort_order','')::integer ELSE sort_order END,
        image_url     = CASE WHEN p_data ? 'image_url'     THEN NULLIF(p_data->>'image_url','') ELSE image_url END,
        category      = CASE WHEN p_data ? 'category'      THEN NULLIF(p_data->>'category','') ELSE category END,
        valid_until   = CASE WHEN p_data ? 'valid_until'   THEN NULLIF(p_data->>'valid_until','')::date ELSE valid_until END,
        conditions    = CASE WHEN p_data ? 'conditions'    THEN p_data->>'conditions' ELSE conditions END,
        promo_rule_id = CASE WHEN p_data ? 'promo_rule_id' THEN NULLIF(p_data->>'promo_rule_id','')::uuid ELSE promo_rule_id END,
        text_colors   = CASE WHEN p_data ? 'text_colors'   THEN p_data->'text_colors' ELSE text_colors END,
        updated_at    = now()
      WHERE id = p_id;
    END IF;

  ELSIF p_entity = 'special_day' THEN
    -- `system` NUNCA se escribe desde el panel (marca los días del motor).
    IF p_action = 'create' THEN
      INSERT INTO special_days (name, month, day, points, icon, active, message, system)
      VALUES (p_data->>'name', (p_data->>'month')::integer, (p_data->>'day')::integer,
              COALESCE((p_data->>'points')::integer, 0), p_data->>'icon',
              COALESCE((p_data->>'active')::boolean, true), p_data->>'message', false)
      RETURNING id INTO v_id;
    ELSE
      UPDATE special_days SET
        name    = CASE WHEN p_data ? 'name'    THEN p_data->>'name' ELSE name END,
        month   = CASE WHEN p_data ? 'month'   THEN (p_data->>'month')::integer ELSE month END,
        day     = CASE WHEN p_data ? 'day'     THEN (p_data->>'day')::integer ELSE day END,
        points  = CASE WHEN p_data ? 'points'  THEN (p_data->>'points')::integer ELSE points END,
        icon    = CASE WHEN p_data ? 'icon'    THEN p_data->>'icon' ELSE icon END,
        active  = CASE WHEN p_data ? 'active'  THEN (p_data->>'active')::boolean ELSE active END,
        message = CASE WHEN p_data ? 'message' THEN p_data->>'message' ELSE message END
      WHERE id = p_id;
    END IF;

  ELSIF p_entity = 'raffle' THEN
    -- winner_id / drawn_at / winner_seen_at los escribe SOLO el sorteo
    -- (draw_due_raffles) — no se exponen acá.
    -- D22: claim_days / claim_station_id configurables por rifa.
    IF p_action = 'create' THEN
      INSERT INTO raffle_calendar (month, year, prize_name, prize_icon, prize_value,
                                   prize_image_url, prize_detail, ticket_points,
                                   claim_days, claim_station_id)
      VALUES ((p_data->>'month')::integer, (p_data->>'year')::integer,
              p_data->>'prize_name', p_data->>'prize_icon',
              NULLIF(p_data->>'prize_value','')::numeric,
              NULLIF(p_data->>'prize_image_url',''), p_data->>'prize_detail',
              NULLIF(p_data->>'ticket_points','')::integer,
              NULLIF(p_data->>'claim_days','')::integer,
              NULLIF(p_data->>'claim_station_id','')::uuid)
      RETURNING id INTO v_id;
    ELSE
      UPDATE raffle_calendar SET
        month            = CASE WHEN p_data ? 'month'            THEN (p_data->>'month')::integer ELSE month END,
        year             = CASE WHEN p_data ? 'year'             THEN (p_data->>'year')::integer ELSE year END,
        prize_name       = CASE WHEN p_data ? 'prize_name'       THEN p_data->>'prize_name' ELSE prize_name END,
        prize_icon       = CASE WHEN p_data ? 'prize_icon'       THEN p_data->>'prize_icon' ELSE prize_icon END,
        prize_value      = CASE WHEN p_data ? 'prize_value'      THEN NULLIF(p_data->>'prize_value','')::numeric ELSE prize_value END,
        prize_image_url  = CASE WHEN p_data ? 'prize_image_url'  THEN NULLIF(p_data->>'prize_image_url','') ELSE prize_image_url END,
        prize_detail     = CASE WHEN p_data ? 'prize_detail'     THEN p_data->>'prize_detail' ELSE prize_detail END,
        ticket_points    = CASE WHEN p_data ? 'ticket_points'    THEN NULLIF(p_data->>'ticket_points','')::integer ELSE ticket_points END,
        claim_days       = CASE WHEN p_data ? 'claim_days'       THEN NULLIF(p_data->>'claim_days','')::integer ELSE claim_days END,
        claim_station_id = CASE WHEN p_data ? 'claim_station_id' THEN NULLIF(p_data->>'claim_station_id','')::uuid ELSE claim_station_id END
      WHERE id = p_id;
    END IF;

  ELSIF p_entity = 'station' THEN
    IF p_action = 'create' THEN
      RETURN jsonb_build_object('error', 'Las estaciones no se crean desde el panel');
    END IF;
    UPDATE stations SET
      name          = CASE WHEN p_data ? 'name'          THEN p_data->>'name' ELSE name END,
      address       = CASE WHEN p_data ? 'address'       THEN p_data->>'address' ELSE address END,
      lat           = CASE WHEN p_data ? 'lat'           THEN NULLIF(p_data->>'lat','')::numeric ELSE lat END,
      lng           = CASE WHEN p_data ? 'lng'           THEN NULLIF(p_data->>'lng','')::numeric ELSE lng END,
      schedule      = CASE WHEN p_data ? 'schedule'      THEN p_data->>'schedule' ELSE schedule END,
      wifi_ssid     = CASE WHEN p_data ? 'wifi_ssid'     THEN p_data->>'wifi_ssid' ELSE wifi_ssid END,
      wifi_password = CASE WHEN p_data ? 'wifi_password' THEN p_data->>'wifi_password' ELSE wifi_password END,
      external_code = CASE WHEN p_data ? 'external_code' THEN NULLIF(p_data->>'external_code','') ELSE external_code END,
      active        = CASE WHEN p_data ? 'active'        THEN (p_data->>'active')::boolean ELSE active END
    WHERE id = p_id;

  ELSIF p_entity = 'store' THEN
    IF p_action = 'create' THEN
      IF COALESCE(trim(p_data->>'name'), '') = '' THEN
        RETURN jsonb_build_object('error', 'El nombre de la tienda es obligatorio');
      END IF;
      INSERT INTO partner_stores (name, address, active)
      VALUES (trim(p_data->>'name'),
              NULLIF(trim(COALESCE(p_data->>'address', '')), ''),
              COALESCE((p_data->>'active')::boolean, true))
      RETURNING id INTO v_id;
    ELSE
      IF p_data ? 'name' AND COALESCE(trim(p_data->>'name'), '') = '' THEN
        RETURN jsonb_build_object('error', 'El nombre de la tienda es obligatorio');
      END IF;
      UPDATE partner_stores SET
        name       = CASE WHEN p_data ? 'name'    THEN trim(p_data->>'name') ELSE name END,
        address    = CASE WHEN p_data ? 'address' THEN NULLIF(trim(COALESCE(p_data->>'address','')),'') ELSE address END,
        active     = CASE WHEN p_data ? 'active'  THEN (p_data->>'active')::boolean ELSE active END,
        updated_at = now()
      WHERE id = p_id;
    END IF;
  END IF;

  -- ── Snapshot posterior + auditoría atómica ──
  IF p_action <> 'delete' THEN
    SELECT CASE p_entity
      WHEN 'reward'      THEN (SELECT to_jsonb(t) FROM rewards t WHERE t.id = v_id)
      WHEN 'promotion'   THEN (SELECT to_jsonb(t) FROM promotions t WHERE t.id = v_id)
      WHEN 'special_day' THEN (SELECT to_jsonb(t) FROM special_days t WHERE t.id = v_id)
      WHEN 'raffle'      THEN (SELECT to_jsonb(t) FROM raffle_calendar t WHERE t.id = v_id)
      WHEN 'station'     THEN (SELECT to_jsonb(t) FROM stations t WHERE t.id = v_id)
      WHEN 'store'       THEN (SELECT to_jsonb(t) FROM partner_stores t WHERE t.id = v_id)
    END INTO v_new;
  END IF;

  IF p_admin_id IS NOT NULL THEN
    PERFORM public.log_admin_action(
      p_admin_id    => p_admin_id,
      p_admin_name  => p_admin_name,
      p_admin_email => p_admin_email,
      p_action      => p_action || '_' || p_entity,
      p_entity_type => p_entity,
      p_entity_id   => COALESCE(v_id, p_id)::text,
      p_reason_text => p_reason_text,
      p_old_value   => v_old,
      p_new_value   => v_new
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', COALESCE(v_id, p_id), 'row', v_new);
END;
$function$;

-- ============================================================
-- VERIFICAR tras ejecutar:
--   1. SELECT value FROM program_config WHERE key IN ('tiers','general');
--      → ptsPerGal 3.5/4/4.5, discRedeem 0, sin qPerPt, pointValue 0.1
--   2. SELECT name, points_cost, cash_value, min_tier FROM rewards
--      WHERE active ORDER BY points_cost;  → 100/150/250/250/500/1000
--   3. Compra de prueba por la API: 0.27 gal en PLATINO → round(0.27×4)=1;
--      8.06 gal en ORO → round(28.21)=28 pts.
--   4. Canje de un socio PLATINO/BLACK: points_spent = precio de lista
--      (sin −10 %/−15 %), discount_applied = 0.
--   5. Volver a ejecutar el archivo NO vuelve a subir los precios.
-- ============================================================
