-- ============================================================
-- PRECIOS DE COMBUSTIBLE DESDE PROPER (23-sep-2026)
-- ============================================================
-- Pedido del dueño: que al acumular por la API de PROPER nuestro
-- sistema adopte el precio del combustible que PROPER usó, para que
-- los precios de Puntos Plus se actualicen solos.
--
-- Hallazgo (23-sep): PROPER NO manda el precio unitario, pero manda
-- `gallons` con 5 decimales; fuel_amount / gallons reproduce su precio
-- exacto (23 facturas reales del 17-18 sep → Q37.29 en todas, incluso
-- las de Q10). Nuestros precios llevaban desde el 4-sep en Q44.99.
--
-- Diseño:
--   1. Tabla fuel_price_observations (estación × combustible): último
--      precio derivado, racha de facturas seguidas que coinciden al
--      centavo, última factura, último precio adoptado. Cerrada a la
--      API abierta (lectura por RPC con sesión de admin).
--   2. api_observe_fuel_price(...) — la llama api_register_purchase en
--      CADA acumulación exitosa (nunca falla la compra: va en un
--      sub-bloque con EXCEPTION). Deriva el precio con el cuerpo crudo
--      (antes del redondeo a 2 decimales de purchases.gallons), exige
--      precisión suficiente en los galones (error máximo < medio
--      centavo), rango Q1–Q100 y registra la observación SIEMPRE, esté
--      o no encendido el interruptor.
--   3. Adopción (fuel_price_adopt) SOLO con program_config
--      'fuel_prices_auto' = {"enabled": true} y con 2 facturas seguidas
--      coincidentes (filtra facturas mixtas de varios combustibles y
--      galones redondeados). Escribe en el precio GLOBAL o en el de la
--      ESTACIÓN según el modo D4 vigente; en modo global, si otra
--      estación confirmó un precio DISTINTO en los últimos 3 días, no
--      adopta ('stations_disagree' — el admin debe activar precios por
--      estación). Cada adopción deja fila en admin_audit_log con
--      admin_name 'PROPER (API)' y action 'update_fuel_prices_auto'.
--   4. set_fuel_prices_auto(sesión admin, auditado): interruptor.
--      NACE APAGADO (decisión del dueño 23-sep: se enciende cuando ya
--      se opere con PROPER). Al ENCENDER, adopta de inmediato las
--      observaciones ya confirmadas (racha ≥ 2).
--   5. list_fuel_price_observations(sesión admin): para la tarjeta.
--
-- Los puntos NO cambian: la API acredita con galones reales. El precio
-- solo lo usan la app del operador propio (Q → galones), la vista
-- previa de puntos y los KPIs en Q del panel.
-- Idempotente. Ejecutar completo en el SQL Editor.
-- ============================================================

-- ── 1. Interruptor (nace apagado) ─────────────────────────────
INSERT INTO public.program_config (key, value)
VALUES ('fuel_prices_auto', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 2. Observaciones por estación × combustible ───────────────
CREATE TABLE IF NOT EXISTS public.fuel_price_observations (
  station_id      uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  fuel_type       text NOT NULL CHECK (fuel_type IN ('super', 'regular', 'diesel')),
  last_price      numeric(10,2) NOT NULL,
  streak          integer NOT NULL DEFAULT 1,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_invoice_no text,
  adopted_price   numeric(10,2),
  adopted_at      timestamptz,
  PRIMARY KEY (station_id, fuel_type)
);
COMMENT ON TABLE public.fuel_price_observations IS
  'Precio de combustible derivado de cada factura de PROPER (fuel_amount / gallons). streak = facturas seguidas que coinciden al centavo; se adopta con streak >= 2 y fuel_prices_auto encendido.';

ALTER TABLE public.fuel_price_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fuel_price_observations FROM PUBLIC, anon, authenticated;

-- ── 3. Adopción (helper interno) ──────────────────────────────
-- Escribe el precio confirmado en el destino vigente (global o
-- estación) y audita. Devuelve jsonb con adopted true/false y reason.
CREATE OR REPLACE FUNCTION public.fuel_price_adopt(
  p_station_id uuid, p_fuel_type text, p_price numeric,
  p_invoice_no text, p_streak integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_per       boolean;
  v_global    jsonb;
  v_old       jsonb;
  v_new       jsonb;
  v_current   numeric;
  v_entity    text;
  v_station   text;
  v_conflicts integer;
BEGIN
  SELECT name INTO v_station FROM stations WHERE id = p_station_id;
  SELECT COALESCE((value->>'per_station')::boolean, false) INTO v_per
  FROM program_config WHERE key = 'fuel_prices_mode';
  SELECT value INTO v_global FROM program_config WHERE key = 'fuel_prices';
  v_global := COALESCE(v_global, '{}'::jsonb);

  IF COALESCE(v_per, false) THEN
    -- Precio propio de la estación. Si no tenía, nace con los
    -- globales como base para que la tarjeta no muestre Q0.00.
    SELECT fuel_prices INTO v_old FROM stations WHERE id = p_station_id;
    v_current := (v_old->>p_fuel_type)::numeric;
    IF v_current IS NOT NULL AND v_current = p_price THEN
      RETURN jsonb_build_object('adopted', false, 'reason', 'unchanged', 'scope', 'station');
    END IF;
    v_new := COALESCE(v_old, v_global) || jsonb_build_object(p_fuel_type, p_price);
    UPDATE stations SET fuel_prices = v_new WHERE id = p_station_id;
    v_entity := p_station_id::text;
  ELSE
    -- Modo global: si otra estación confirmó un precio DISTINTO hace
    -- poco, no se adopta (evita que el global oscile entre estaciones).
    SELECT count(*) INTO v_conflicts
    FROM fuel_price_observations o
    WHERE o.fuel_type = p_fuel_type
      AND o.station_id <> p_station_id
      AND o.streak >= 2
      AND o.last_seen_at > now() - interval '3 days'
      AND o.last_price <> p_price;
    IF v_conflicts > 0 THEN
      RETURN jsonb_build_object('adopted', false, 'reason', 'stations_disagree', 'scope', 'global');
    END IF;
    v_old := v_global;
    v_current := (v_old->>p_fuel_type)::numeric;
    IF v_current IS NOT NULL AND v_current = p_price THEN
      RETURN jsonb_build_object('adopted', false, 'reason', 'unchanged', 'scope', 'global');
    END IF;
    v_new := v_old || jsonb_build_object(p_fuel_type, p_price);
    INSERT INTO program_config (key, value, updated_at) VALUES ('fuel_prices', v_new, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
    v_entity := 'fuel_prices';
  END IF;

  -- Auditoría: fila propia (log_admin_action exige admin_id).
  INSERT INTO admin_audit_log (admin_id, admin_name, admin_email, action, entity_type, entity_id,
                               reason_text, old_value, new_value, metadata)
  VALUES (NULL, 'PROPER (API)', NULL, 'update_fuel_prices_auto', 'fuel_prices', v_entity,
    'Precio de ' || p_fuel_type || ' adoptado automáticamente de PROPER: Q' || to_char(p_price, 'FM9990.00')
      || ' (' || COALESCE(v_station, 'estación') || ', factura ' || COALESCE(p_invoice_no, '?')
      || ', confirmado por ' || p_streak || ' facturas seguidas)',
    v_old, v_new,
    jsonb_build_object('source', 'proper', 'station_id', p_station_id, 'station', v_station,
      'fuel_type', p_fuel_type, 'price', p_price, 'previous', v_current,
      'invoice_no', p_invoice_no, 'streak', p_streak,
      'scope', CASE WHEN COALESCE(v_per, false) THEN 'station' ELSE 'global' END));

  UPDATE fuel_price_observations
     SET adopted_price = p_price, adopted_at = now()
   WHERE station_id = p_station_id AND fuel_type = p_fuel_type;

  RETURN jsonb_build_object('adopted', true, 'price', p_price, 'previous', v_current,
    'scope', CASE WHEN COALESCE(v_per, false) THEN 'station' ELSE 'global' END,
    'station', v_station, 'fuel_type', p_fuel_type);
END;
$$;
REVOKE ALL ON FUNCTION public.fuel_price_adopt(uuid, text, numeric, text, integer)
  FROM PUBLIC, anon, authenticated;

-- ── 4. Observación por factura (la llama api_register_purchase) ──
CREATE OR REPLACE FUNCTION public.api_observe_fuel_price(
  p_station_id uuid, p_fuel_type text, p_fuel_amount numeric,
  p_gallons numeric, p_invoice_no text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_price  numeric;
  v_err    numeric;
  v_streak integer;
  v_auto   boolean;
BEGIN
  IF p_station_id IS NULL OR p_fuel_type NOT IN ('super', 'regular', 'diesel')
     OR p_gallons IS NULL OR p_gallons <= 0 OR p_fuel_amount IS NULL OR p_fuel_amount <= 0 THEN
    RETURN jsonb_build_object('observed', false, 'reason', 'invalid');
  END IF;

  v_price := round(p_fuel_amount / p_gallons, 2);
  IF v_price < 1 OR v_price > 100 THEN
    RETURN jsonb_build_object('observed', false, 'reason', 'out_of_range', 'price', v_price);
  END IF;

  -- Precisión: el redondeo de los galones (medio dígito del último
  -- decimal) no puede mover el precio más de medio centavo. Con los 5
  -- decimales de PROPER pasa hasta Q10 (0.26816 gal); con 2 decimales
  -- solo pasarían compras enormes.
  v_err := (0.5 * power(10::numeric, -scale(p_gallons))) / p_gallons * v_price;
  IF v_err > 0.005 THEN
    RETURN jsonb_build_object('observed', false, 'reason', 'imprecise', 'price', v_price);
  END IF;

  INSERT INTO fuel_price_observations (station_id, fuel_type, last_price, streak, last_seen_at, last_invoice_no)
  VALUES (p_station_id, p_fuel_type, v_price, 1, now(), p_invoice_no)
  ON CONFLICT (station_id, fuel_type) DO UPDATE SET
    streak          = CASE WHEN fuel_price_observations.last_price = EXCLUDED.last_price
                           THEN LEAST(fuel_price_observations.streak + 1, 999) ELSE 1 END,
    last_price      = EXCLUDED.last_price,
    last_seen_at    = now(),
    last_invoice_no = EXCLUDED.last_invoice_no
  RETURNING streak INTO v_streak;

  SELECT COALESCE((value->>'enabled')::boolean, false) INTO v_auto
  FROM program_config WHERE key = 'fuel_prices_auto';
  IF NOT COALESCE(v_auto, false) THEN
    RETURN jsonb_build_object('observed', true, 'price', v_price, 'streak', v_streak,
      'adopted', false, 'reason', 'auto_off');
  END IF;
  IF v_streak < 2 THEN
    RETURN jsonb_build_object('observed', true, 'price', v_price, 'streak', v_streak,
      'adopted', false, 'reason', 'awaiting_confirmation');
  END IF;

  RETURN jsonb_build_object('observed', true, 'price', v_price, 'streak', v_streak)
      || public.fuel_price_adopt(p_station_id, p_fuel_type, v_price, p_invoice_no, v_streak);
END;
$$;
REVOKE ALL ON FUNCTION public.api_observe_fuel_price(uuid, text, numeric, numeric, text)
  FROM PUBLIC, anon, authenticated;

-- ── 5. Interruptor con sesión de admin + auditoría ────────────
CREATE OR REPLACE FUNCTION public.set_fuel_prices_auto(
  p_session_token text,
  p_enabled       boolean,
  p_admin_id      uuid DEFAULT NULL,
  p_admin_name    text DEFAULT NULL,
  p_admin_email   text DEFAULT NULL,
  p_reason_text   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old     jsonb;
  v_value   jsonb;
  v_obs     RECORD;
  v_res     jsonb;
  v_adopted jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'set_fuel_prices_auto', false, NULL);
  IF p_enabled IS NULL THEN
    RETURN jsonb_build_object('error', 'Valor requerido');
  END IF;

  SELECT value INTO v_old FROM program_config WHERE key = 'fuel_prices_auto';
  v_value := jsonb_build_object('enabled', p_enabled,
    'changed_at', now(), 'changed_by', COALESCE(p_admin_name, 'admin'));

  INSERT INTO program_config (key, value, updated_at) VALUES ('fuel_prices_auto', v_value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  IF p_admin_id IS NOT NULL THEN
    PERFORM public.log_admin_action(
      p_admin_id    => p_admin_id,
      p_admin_name  => p_admin_name,
      p_admin_email => p_admin_email,
      p_action      => 'set_fuel_prices_auto',
      p_entity_type => 'fuel_prices',
      p_entity_id   => 'fuel_prices_auto',
      p_reason_text => p_reason_text,
      p_old_value   => v_old,
      p_new_value   => v_value
    );
  END IF;

  -- Al ENCENDER: adoptar de una vez lo que ya está confirmado.
  IF p_enabled THEN
    FOR v_obs IN
      SELECT station_id, fuel_type, last_price, last_invoice_no, streak
      FROM fuel_price_observations
      WHERE streak >= 2
      ORDER BY last_seen_at
    LOOP
      v_res := public.fuel_price_adopt(v_obs.station_id, v_obs.fuel_type, v_obs.last_price,
                                       v_obs.last_invoice_no, v_obs.streak);
      IF COALESCE((v_res->>'adopted')::boolean, false) THEN
        v_adopted := v_adopted || jsonb_build_array(v_res);
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'enabled', p_enabled,
    'adopted', v_adopted,
    'fuel_prices', (SELECT value FROM program_config WHERE key = 'fuel_prices'),
    'stations', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'fuel_prices', fuel_prices)), '[]'::jsonb)
                 FROM stations)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_fuel_prices_auto(text, boolean, uuid, text, text, text) TO anon, authenticated;

-- ── 6. Lectura para la tarjeta del admin ──────────────────────
CREATE OR REPLACE FUNCTION public.list_fuel_price_observations(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'list_fuel_price_observations', false, NULL);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'station_id', o.station_id, 'station', s.name, 'fuel_type', o.fuel_type,
      'price', o.last_price, 'streak', o.streak, 'seen_at', o.last_seen_at,
      'invoice_no', o.last_invoice_no, 'adopted_price', o.adopted_price, 'adopted_at', o.adopted_at
    ) ORDER BY s.name, o.fuel_type)
    FROM fuel_price_observations o JOIN stations s ON s.id = o.station_id
  ), '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_fuel_price_observations(text) TO anon, authenticated;

-- ── 7. api_register_purchase: observa el precio tras acreditar ──
-- Misma firma que la v1.4 (CREATE OR REPLACE conserva el REVOKE).
-- Único cambio: el bloque "Precio de PROPER" antes del RETURN.
CREATE OR REPLACE FUNCTION public.api_register_purchase(
  p_api_client_id uuid, p_card_code text, p_fuel_amount numeric,
  p_gallons numeric, p_fuel_type text, p_nit text, p_invoice_no text,
  p_operator_ext text, p_operator_name text DEFAULT NULL::text,
  p_station_ext text DEFAULT NULL::text, p_total_amount numeric DEFAULT NULL::numeric,
  p_operator_dpi text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_member      RECORD;
  v_code        text := upper(trim(COALESCE(p_card_code, '')));
  v_nit         text := public.normalize_nit(p_nit);
  v_member_nit  text;
  v_operator_id uuid;
  v_station_id  uuid;
  v_fuel        text := lower(COALESCE(p_fuel_type, 'regular'));
  v_core        jsonb;
  v_invoice     text := NULLIF(btrim(COALESCE(p_invoice_no, '')), '');
  v_prev        RECORD;
BEGIN
  -- ── Validaciones de entrada ──
  IF v_code !~ '^CT[OPB]D-[0-9]+$' THEN
    RETURN jsonb_build_object('error', 'invalid_card_code');
  END IF;
  -- Candado de factura única: sin número de factura no hay candado.
  IF v_invoice IS NULL THEN
    RETURN jsonb_build_object('error', 'missing_invoice_no',
      'detail', 'Falta el número de factura (invoice_no): es obligatorio para acumular');
  END IF;
  IF p_fuel_amount IS NULL OR p_fuel_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'no_fuel_in_invoice',
      'detail', 'La factura no incluye consumo de combustible: no acumula puntos');
  END IF;
  IF p_fuel_amount < 10 THEN
    RETURN jsonb_build_object('error', 'amount_too_low',
      'detail', 'El consumo mínimo de combustible para acumular es Q10');
  END IF;
  IF p_gallons IS NULL OR p_gallons <= 0 THEN
    RETURN jsonb_build_object('error', 'invalid_gallons');
  END IF;
  IF v_fuel NOT IN ('super', 'regular', 'diesel') THEN
    RETURN jsonb_build_object('error', 'invalid_fuel_type',
      'detail', 'Valores válidos: super, regular, diesel');
  END IF;
  IF COALESCE(trim(p_operator_ext), '') = '' THEN
    RETURN jsonb_build_object('error', 'missing_operator');
  END IF;

  -- Solo tarjetas ACTIVAS (mismo criterio de api_resolve_member).
  SELECT m.id, m.nit, m.gallons, m.card_id, m.name
    INTO v_member
  FROM physical_cards pc
  JOIN members m ON m.id = pc.assigned_to
  WHERE pc.card_code = v_code
    AND pc.status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'member_not_found');
  END IF;

  -- ── FACTURA ÚNICA: una factura acredita una sola vez ──
  -- same_card dice si fue a ESTA tarjeta (reintento del POS sin
  -- Idempotency-Key → se devuelven los datos de la acreditación
  -- original) o a otra (nunca se revela a quién).
  SELECT pu.id, pu.member_id, pu.points_earned, pu.created_at INTO v_prev
  FROM purchases pu
  WHERE pu.invoice_no IS NOT NULL AND upper(btrim(pu.invoice_no)) = upper(v_invoice)
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'error', 'invoice_already_credited',
      'detail', CASE WHEN v_prev.member_id = v_member.id
                  THEN 'Esta factura ya acreditó puntos a esta tarjeta'
                  ELSE 'Esta factura ya acreditó puntos a otra tarjeta' END,
      'invoice_no', v_invoice,
      'same_card', v_prev.member_id = v_member.id,
      'credited_at', v_prev.created_at)
      || CASE WHEN v_prev.member_id = v_member.id
           THEN jsonb_build_object('purchase_id', v_prev.id, 'points_earned', v_prev.points_earned)
           ELSE '{}'::jsonb END;
  END IF;

  -- ── REGLA DE NIT ──
  -- La factura YA se emitió: el mensaje le explica al CLIENTE qué
  -- debe ajustar en su app para la próxima (no se le pide nada al POS).
  v_member_nit := public.normalize_nit(v_member.nit);
  IF v_member.nit IS NULL OR trim(v_member.nit) = '' THEN
    IF v_nit <> 'CF' THEN
      RETURN jsonb_build_object(
        'error', 'nit_not_registered',
        'detail', 'Esta factura se emitió con NIT, pero el cliente no tiene NIT registrado en Puntos Plus. '
               || 'Puede agregarlo desde su app en Menú → Mi Cuenta, o pedir la factura con CF.',
        'member_name', v_member.name,
        'invoice_nit', v_nit);
    END IF;
  ELSE
    IF v_nit <> 'CF' AND v_nit <> v_member_nit THEN
      RETURN jsonb_build_object(
        'error', 'nit_mismatch',
        'detail', 'El NIT de la factura no coincide con el registrado por el cliente en Puntos Plus. '
               || 'Solo acumulan las facturas con su propio NIT o con CF.',
        'member_name', v_member.name,
        'invoice_nit', v_nit,
        'registered_nit_masked', '****' || right(v_member_nit, 4));
    END IF;
  END IF;

  -- ── Estación: de la FACTURA (viaja con el colaborador) ──
  v_station_id := public.api_resolve_station(p_station_ext);
  v_operator_id := public.api_upsert_operator(trim(p_operator_ext), p_operator_name, v_station_id, p_operator_dpi);
  IF v_station_id IS NULL THEN
    -- Sin código válido: la última donde despachó el colaborador.
    SELECT station_id INTO v_station_id FROM operators WHERE id = v_operator_id;
  END IF;
  IF v_station_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unknown_station',
      'detail', 'No pudimos determinar la estación del colaborador. '
             || 'Configurá su código de estación en Puntos Plus o envialo en station.');
  END IF;

  -- ── Núcleo compartido: puntos por tier + promos + persistencia ──
  -- El índice único cubre la carrera de dos envíos simultáneos de la
  -- misma factura: el segundo cae acá y no acredita.
  BEGIN
    v_core := public.register_purchase_core(
      v_member.id, v_operator_id, v_station_id,
      p_fuel_amount, p_total_amount, p_gallons, v_fuel, v_invoice
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'invoice_already_credited',
      'detail', 'Esta factura ya acreditó puntos',
      'invoice_no', v_invoice);
  END;
  IF v_core ? 'error' THEN
    RETURN jsonb_build_object('error', 'member_not_found');
  END IF;

  -- ── Precio de PROPER (23-sep): observar y, si el interruptor está
  --    encendido, adoptar. Con los galones CRUDOS (5 decimales), no
  --    con los 2 decimales que guarda purchases. Nunca afecta la
  --    acreditación: cualquier error queda en el sub-bloque. ──
  BEGIN
    PERFORM public.api_observe_fuel_price(v_station_id, v_fuel, p_fuel_amount, p_gallons, v_invoice);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_id',   v_core->'purchase_id',
    'member_name',   v_member.name,
    'points_earned', v_core->'points_final',
    'points_base',   v_core->'points_base',
    'points_promo',  v_core->'points_extra',
    'points_balance',v_core->'points_balance',
    'gallons',       p_gallons,
    'fuel_amount',   p_fuel_amount,
    'station',       (SELECT name FROM stations WHERE id = v_station_id),
    'tier',          v_core->'new_tier',
    'tier_changed',  v_core->'tier_changed',
    'new_card_code', v_core->'new_card_code',
    'promo',         v_core->'promo',
    -- Campos INTERNOS para el push server-side del endpoint (el
    -- endpoint los quita antes de responder a PROPER):
    'member_id',     v_member.id,
    'operator_id',   v_operator_id,
    'operator_name', (SELECT name FROM operators WHERE id = v_operator_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.api_register_purchase(uuid, text, numeric, numeric, text, text, text, text, text, text, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_register_purchase(uuid, text, numeric, numeric, text, text, text, text, text, text, numeric, text)
  TO service_role;

-- ── 8. Semilla de observaciones con las facturas YA recibidas ──
-- Reconstruye la racha por estación × combustible desde api_requests
-- (cuerpo crudo, galones con 5 decimales) para que al encender el
-- interruptor haya precio confirmado sin esperar facturas nuevas.
-- Solo facturas reales (excluye las de prueba TEST/VERIF/RECAL).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      public.api_resolve_station(COALESCE(q.request->'operator'->>'station', q.request->>'station')) AS station_id,
      lower(q.request->>'fuel_type') AS fuel_type,
      (q.request->>'fuel_amount')::numeric AS fuel_amount,
      (q.request->>'gallons')::numeric AS gallons,
      q.request->>'invoice_no' AS invoice_no,
      q.created_at
    FROM api_requests q
    WHERE q.endpoint = 'POST /v1/purchases' AND q.status_code = 201
      AND (q.request->>'gallons') ~ '^[0-9.]+$'
      AND (q.request->>'fuel_amount') ~ '^[0-9.]+$'
      AND COALESCE(q.request->>'invoice_no', '') !~* '^(TEST|VERIF|RECAL)'
    ORDER BY q.created_at
  LOOP
    CONTINUE WHEN r.station_id IS NULL;
    -- Misma lógica de api_observe_fuel_price pero sin adoptar (el
    -- interruptor nace apagado) y con la fecha real de la factura.
    PERFORM public.api_observe_fuel_price(r.station_id, r.fuel_type, r.fuel_amount, r.gallons, r.invoice_no);
    UPDATE fuel_price_observations SET last_seen_at = r.created_at
     WHERE station_id = r.station_id AND fuel_type = r.fuel_type AND last_invoice_no = r.invoice_no;
  END LOOP;
END $$;

-- ── Verificación ──────────────────────────────────────────────
-- SELECT s.name, o.* FROM fuel_price_observations o JOIN stations s ON s.id=o.station_id;
--   → Turkaj I · super · 37.29 · streak 23 (facturas del 17-18 sep)
-- SELECT value FROM program_config WHERE key='fuel_prices_auto';  → enabled false
-- SELECT proname, proacl FROM pg_proc WHERE proname IN
--   ('api_observe_fuel_price','fuel_price_adopt','api_register_purchase');  → sin anon=
