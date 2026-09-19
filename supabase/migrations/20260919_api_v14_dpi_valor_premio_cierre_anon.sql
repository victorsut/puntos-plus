-- ============================================================
-- 20260919 — API PROPER v1.4 (respuesta de PROPER del 19-sep-2026)
-- ============================================================
-- Decisiones del dueño tras la respuesta de PROPER a §10/§11 del
-- contrato:
--   1. CÓDIGOS DE ESTACIÓN de PROPER cargados en stations.external_code.
--   2. DPI COMO IDENTIFICADOR DEL COLABORADOR: el identificador interno
--      de PROPER puede variar (otro usuario en otra sucursal) — el DPI
--      une todos sus usuarios en UN solo operador. Y si el DPI coincide
--      con un operador PROPIO (los que ya existen en Personal), se
--      FUSIONA con él: conserva su historial de calificaciones.
--   3. VALOR MONETARIO DEL PREMIO (rewards.cash_value, puede quedar
--      vacío) expuesto como `reward_value` en las respuestas de canje.
--   4. Varios combustibles en una factura: se acepta tal cual (una
--      factura por producto es instrucción operativa, sin cambios acá).
--
-- Correcciones detectadas en la revisión del 19-sep:
--   5. ⚠️ SEGURIDAD: las funciones api_* eran EJECUTABLES POR anon
--      (grants por defecto de Supabase). api_register_purchase confía
--      en p_api_client_id sin validar la llave → cualquiera con la
--      llave pública del frontend podía acreditarse puntos por
--      /rest/v1/rpc/. Los endpoints usan la SERVICE KEY: se revoca
--      anon/authenticated de todas (menos api_create_client, que el
--      panel llama con sesión de admin validada adentro).
--   6. Solo api_resolve_member validaba physical_cards.status='active':
--      ahora también acumulación, pendientes por tarjeta y consulta.
--   7. `expires_at` expuesto en las consultas de canje (el error
--      'expired' de D22 existía sin forma de anticiparlo).
--
-- ACUMULACIÓN TARDÍA — decisión del dueño (19-sep): NO existe. Los
-- puntos se asignan SIEMPRE en el mismo momento de la factura (el POS
-- muestra el botón de escanear al cerrar la factura; si se emite otra
-- factura, la anterior quedó sin asignar). Lo que SÍ se agrega:
--   8. CANDADO DE FACTURA ÚNICA: invoice_no pasa a ser obligatorio en
--      la API y una factura solo acredita UNA vez (índice único +
--      error 'invoice_already_credited'). Hasta hoy la única barrera
--      era el header Idempotency-Key, que controla PROPER.
--
-- LECCIÓN SEC.C.6: agregar un parámetro crea una SOBRECARGA — acá se
-- hace DROP de cada firma vieja antes de crear la nueva, y cada
-- función nueva lleva su REVOKE explícito (DROP+CREATE resetea ACLs).
-- Compatibilidad de despliegue: los parámetros nuevos tienen DEFAULT,
-- así que el código viejo de los endpoints sigue funcionando contra
-- esta migración, y el código nuevo solo envía p_operator_dpi cuando
-- PROPER lo manda.
-- ============================================================

-- ── 1. Códigos de estación de PROPER ─────────────────────────
-- Idempotente: no pisa un código que el admin ya haya cargado.
UPDATE public.stations SET external_code = '17261015-1'
 WHERE name = 'Turkaj I'   AND external_code IS NULL;
UPDATE public.stations SET external_code = '17261015-2'
 WHERE name = 'Turkaj II'  AND external_code IS NULL;
UPDATE public.stations SET external_code = '105978272-3'
 WHERE name = 'Turkaj III' AND external_code IS NULL;

INSERT INTO public.admin_audit_log (admin_name, action, entity_type, entity_id, reason_text, new_value, metadata)
SELECT 'Migración 20260919', 'update_station', 'station', s.id::text,
       'Códigos de estación entregados por PROPER (19-sep-2026)',
       jsonb_build_object('external_code', s.external_code),
       jsonb_build_object('via', 'migration')
FROM public.stations s
WHERE s.external_code IN ('17261015-1', '17261015-2', '105978272-3')
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_audit_log a
    WHERE a.entity_type = 'station' AND a.entity_id = s.id::text
      AND a.metadata->>'via' = 'migration' AND a.admin_name = 'Migración 20260919');

-- ── 2. Varios identificadores de PROPER por operador ─────────
-- Un colaborador puede tener VARIOS usuarios en PROPER (uno por
-- sucursal): todos apuntan al mismo operador nuestro.
CREATE TABLE IF NOT EXISTS public.operator_external_ids (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id     uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  external_source text NOT NULL DEFAULT 'proper',
  external_id     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_source, external_id)
);
CREATE INDEX IF NOT EXISTS operator_external_ids_op_idx ON public.operator_external_ids (operator_id);
ALTER TABLE public.operator_external_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operator_external_ids FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.operator_external_ids IS
'API v1.4: identificadores del colaborador en el sistema externo (PROPER).
Varios por operador — el DPI los une. Fuente de búsqueda de
api_upsert_operator; operators.external_id queda como el PRIMER id visto.';

INSERT INTO public.operator_external_ids (operator_id, external_source, external_id)
SELECT id, external_source, external_id FROM public.operators
WHERE external_id IS NOT NULL AND external_source IS NOT NULL
ON CONFLICT (external_source, external_id) DO NOTHING;

-- DPI de Guatemala: 13 dígitos. Cualquier otra cosa se ignora (NULL).
CREATE OR REPLACE FUNCTION public.normalize_dpi(p_dpi text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE WHEN regexp_replace(COALESCE(p_dpi, ''), '\D', '', 'g') ~ '^[0-9]{13}$'
              THEN regexp_replace(p_dpi, '\D', '', 'g') END;
$function$;

-- ── 3. Fusión de un operador ESPEJO dentro de otro operador ──
-- Caso: el espejo nació por external_id ANTES de que PROPER mandara
-- el DPI, y el DPI resulta ser de un operador propio (o de otro
-- espejo). Todo su historial se muda y el espejo queda inactivo.
CREATE OR REPLACE FUNCTION public.api_merge_mirror_operator(p_from uuid, p_to uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from operators%ROWTYPE;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN RETURN; END IF;
  SELECT * INTO v_from FROM operators WHERE id = p_from FOR UPDATE;
  -- Solo se fusiona un ESPEJO (nunca una cuenta que puede loguearse).
  IF NOT FOUND OR v_from.password_hash <> '!' THEN RETURN; END IF;

  UPDATE purchases        SET operator_id = p_to WHERE operator_id = p_from;
  UPDATE redemptions      SET operator_id = p_to WHERE operator_id = p_from;
  UPDATE operator_ratings SET operator_id = p_to WHERE operator_id = p_from;
  UPDATE print_logs       SET operator_id = p_to WHERE operator_id = p_from;
  UPDATE members     SET last_operator_id = p_to WHERE last_operator_id = p_from;
  UPDATE operator_external_ids SET operator_id = p_to WHERE operator_id = p_from;

  UPDATE operators SET active = false, updated_at = now() WHERE id = p_from;

  INSERT INTO admin_audit_log (admin_name, action, entity_type, entity_id, reason_text, old_value, new_value, metadata)
  VALUES ('API PROPER', 'merge_operator', 'operator', p_to::text,
          'Fusión automática por DPI: el espejo de PROPER se unió a este operador',
          jsonb_build_object('mirror_id', p_from, 'mirror_name', v_from.name, 'mirror_external_id', v_from.external_id),
          jsonb_build_object('operator_id', p_to),
          jsonb_build_object('via', 'api_upsert_operator'));
END;
$function$;
REVOKE ALL ON FUNCTION public.api_merge_mirror_operator(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. api_upsert_operator: + DPI (firma nueva → DROP de la vieja) ──
DROP FUNCTION IF EXISTS public.api_upsert_operator(text, text, uuid);

CREATE OR REPLACE FUNCTION public.api_upsert_operator(
  p_external_id text,
  p_name        text,
  p_station_id  uuid DEFAULT NULL,
  p_dpi         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id     uuid;   -- operador dueño del external_id
  v_dpi    text := public.normalize_dpi(p_dpi);
  v_dpi_op uuid;   -- operador dueño del DPI
  v_cur    operators%ROWTYPE;
BEGIN
  SELECT operator_id INTO v_id FROM operator_external_ids
  WHERE external_source = 'proper' AND external_id = p_external_id;

  IF v_dpi IS NOT NULL THEN
    -- Prefiere la cuenta PROPIA (la que puede loguearse) sobre un espejo.
    SELECT id INTO v_dpi_op FROM operators
    WHERE regexp_replace(COALESCE(dpi, ''), '\D', '', 'g') = v_dpi
    ORDER BY (password_hash <> '!') DESC, active DESC NULLS LAST, created_at
    LIMIT 1;
  END IF;

  IF v_id IS NULL AND v_dpi_op IS NOT NULL THEN
    -- Usuario NUEVO de PROPER para una persona que ya conocemos.
    v_id := v_dpi_op;

  ELSIF v_id IS NULL THEN
    BEGIN
      INSERT INTO operators (
        name, username, password_hash, dpi, gafete,
        station_id, active, external_id, external_source
      ) VALUES (
        COALESCE(NULLIF(trim(p_name), ''), 'Colaborador PROPER'),
        'proper_' || regexp_replace(lower(p_external_id), '[^a-z0-9]', '', 'g'),
        '!',                       -- hash imposible: no puede loguearse en la app
        COALESCE(v_dpi, 'PROPER-' || p_external_id),  -- DPI real si vino; si no, placeholder
        'PROPER-' || p_external_id,
        p_station_id, true, p_external_id, 'proper'
      )
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      -- Dos facturas simultáneas del mismo colaborador nuevo.
      SELECT id INTO v_id FROM operators
      WHERE external_source = 'proper' AND external_id = p_external_id;
      IF v_id IS NULL THEN RAISE; END IF;
    END;

  ELSIF v_dpi_op IS NOT NULL AND v_dpi_op <> v_id THEN
    -- El external_id ya tenía operador y el DPI pertenece a OTRO: si
    -- el actual es un espejo con DPI placeholder, se fusiona hacia el
    -- dueño del DPI. Si el actual tiene DPI real distinto, manda el
    -- external_id (no se mueve nada: dato inconsistente de origen).
    SELECT * INTO v_cur FROM operators WHERE id = v_id;
    IF v_cur.password_hash = '!' AND v_cur.dpi LIKE 'PROPER-%' THEN
      PERFORM public.api_merge_mirror_operator(v_id, v_dpi_op);
      v_id := v_dpi_op;
    END IF;
  END IF;

  INSERT INTO operator_external_ids (operator_id, external_source, external_id)
  VALUES (v_id, 'proper', p_external_id)
  ON CONFLICT (external_source, external_id) DO NOTHING;

  UPDATE operators SET
    -- El nombre de PROPER solo RELLENA el placeholder del alta: si el
    -- admin ya completó/corrigió la ficha, su versión se respeta.
    name       = CASE WHEN name = 'Colaborador PROPER'
                      THEN COALESCE(NULLIF(trim(p_name), ''), name)
                      ELSE name END,
    -- El DPI real reemplaza SOLO al placeholder del espejo.
    dpi        = CASE WHEN v_dpi IS NOT NULL AND dpi LIKE 'PROPER-%' THEN v_dpi ELSE dpi END,
    -- La estación SÍ viaja con cada factura (modelo 30-jul): acá queda
    -- la última donde despachó.
    station_id = COALESCE(p_station_id, station_id),
    updated_at = now()
  WHERE id = v_id;

  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.api_upsert_operator(text, text, uuid, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.api_upsert_operator(text, text, uuid, text) IS
'API v1.4: alta/refresh del operador de PROPER. Busca por external_id
(operator_external_ids) y, si viene DPI válido (13 dígitos), une al
colaborador con el operador que ya tenga ese DPI — propio o espejo —
fusionando el espejo previo si hacía falta. El nombre solo rellena el
placeholder; la estación se refresca con cada factura.';

-- ── 4b. Candado de factura única ─────────────────────────────
-- Global (no por estación): mandar la misma factura con otra estación
-- no debe saltarse el candado. Verificado el 19-sep: 0 duplicados en
-- las compras existentes y la app propia nunca envía invoice_no.
CREATE UNIQUE INDEX IF NOT EXISTS purchases_invoice_no_uniq
  ON public.purchases (upper(btrim(invoice_no)))
  WHERE invoice_no IS NOT NULL AND btrim(invoice_no) <> '';

-- ── 5. api_register_purchase: + p_operator_dpi, solo tarjetas activas,
--      factura obligatoria y única ──
DROP FUNCTION IF EXISTS public.api_register_purchase(uuid, text, numeric, numeric, text, text, text, text, text, text, numeric);

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

-- ── 6. Valor monetario del premio ────────────────────────────
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS cash_value numeric;
COMMENT ON COLUMN public.rewards.cash_value IS
'API v1.4: valor del premio en quetzales (NULL = sin valor definido).
Viaja a PROPER como reward_value. El descuento de canje por nivel baja
los PUNTOS gastados, no este valor.';

-- Premios de rifa ya sorteados: heredan el valor de su rifa.
UPDATE public.rewards rw SET cash_value = rc.prize_value
FROM public.raffle_calendar rc
WHERE rw.cash_value IS NULL AND rw.active = false AND rw.points_cost = 0
  AND rc.prize_value IS NOT NULL AND rc.winner_id IS NOT NULL
  AND rw.name = rc.prize_name
  AND rw.description LIKE 'Premio de la rifa de %';

-- ── 7. Consultas de canje: + reward_value, + expires_at, tarjeta activa ──
CREATE OR REPLACE FUNCTION public.api_get_redemption(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r RECORD;
BEGIN
  SELECT rd.id, rd.redemption_code, rd.points_spent, rd.collected, rd.collected_at,
         rd.created_at, rd.confirm_status, rd.expires_at,
         rw.name AS reward_name, rw.category, rw.cash_value,
         m.name AS member_name, pc.card_code
    INTO v_r
  FROM redemptions rd
  LEFT JOIN rewards rw ON rw.id = rd.reward_id
  LEFT JOIN members m  ON m.id  = rd.member_id
  LEFT JOIN physical_cards pc ON pc.assigned_to = rd.member_id AND pc.status = 'active'
  WHERE rd.redemption_code = upper(trim(COALESCE(p_code, '')))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'redemption_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'redemption_id',   v_r.id,
    'code',            v_r.redemption_code,
    'reward_name',     v_r.reward_name,
    'category',        v_r.category,
    'reward_value',    v_r.cash_value,
    'points_spent',    v_r.points_spent,
    'member_name',     v_r.member_name,
    'card_code',       v_r.card_code,
    'created_at',      v_r.created_at,
    'expires_at',      v_r.expires_at,
    'delivered',       v_r.collected,
    'delivered_at',    v_r.collected_at,
    'confirm_status',  v_r.confirm_status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_list_pending_redemptions(p_card_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code   text := upper(trim(COALESCE(p_card_code, '')));
  v_member RECORD;
  v_items  jsonb;
BEGIN
  IF v_code !~ '^CT[OPB]D-[0-9]+$' THEN
    RETURN jsonb_build_object('error', 'invalid_card_code');
  END IF;

  SELECT m.id, m.name INTO v_member
  FROM physical_cards pc
  JOIN members m ON m.id = pc.assigned_to
  WHERE pc.card_code = v_code
    AND pc.status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'member_not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code',         rd.redemption_code,
           'reward_name',  rw.name,
           'category',     rw.category,
           'reward_value', rw.cash_value,
           'points_spent', rd.points_spent,
           'created_at',   rd.created_at,
           'expires_at',   rd.expires_at,
           'confirm_status', rd.confirm_status
         ) ORDER BY rd.created_at DESC), '[]'::jsonb)
    INTO v_items
  FROM redemptions rd
  LEFT JOIN rewards rw ON rw.id = rd.reward_id
  WHERE rd.member_id = v_member.id AND rd.collected = false;

  RETURN jsonb_build_object(
    'ok', true,
    'member_name', v_member.name,
    'card_code',   v_code,
    'pending',     v_items
  );
END;
$function$;

-- ── 8. api_redemption_confirm: + p_operator_dpi, + reward_value ──
DROP FUNCTION IF EXISTS public.api_redemption_confirm(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.api_redemption_confirm(
  p_api_client_id uuid,
  p_code          text,
  p_action        text,
  p_operator_ext  text DEFAULT NULL::text,
  p_operator_name text DEFAULT NULL::text,
  p_operator_dpi  text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text := upper(trim(COALESCE(p_code, '')));
  v_r    RECORD;
  v_op   uuid;
BEGIN
  IF p_action NOT IN ('request', 'cancel', 'deliver') THEN
    RETURN jsonb_build_object('error', 'invalid_action',
      'detail', 'Acciones válidas: request, cancel, deliver');
  END IF;

  SELECT rd.id, rd.member_id, rd.collected, rd.confirm_status,
         rd.points_spent, rd.redemption_code, rd.created_at, rd.expires_at,
         rd.reward_id, rw.name AS reward_name, rw.icon AS reward_icon,
         rw.category, rw.cash_value, m.name AS member_name
    INTO v_r
  FROM redemptions rd
  LEFT JOIN rewards rw ON rw.id = rd.reward_id
  LEFT JOIN members m  ON m.id  = rd.member_id
  WHERE rd.redemption_code = v_code
  FOR UPDATE OF rd;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'redemption_not_found');
  END IF;
  IF v_r.collected THEN
    RETURN jsonb_build_object('error', 'already_delivered',
      'detail', 'Este canje ya fue entregado');
  END IF;
  -- D22: premio con plazo vencido — ni solicitar ni entregar (cancel sí).
  IF p_action <> 'cancel' AND v_r.expires_at IS NOT NULL AND now() > v_r.expires_at THEN
    RETURN jsonb_build_object('error', 'expired',
      'detail', 'El plazo para reclamar este premio venció el ' ||
                to_char(v_r.expires_at AT TIME ZONE 'America/Guatemala', 'DD/MM/YYYY'),
      'expired_at', v_r.expires_at);
  END IF;

  IF p_action = 'request' THEN
    UPDATE redemptions SET
      confirm_status = 'pending',
      confirm_requested_at = now()
    WHERE id = v_r.id;
    -- member_id/reward_id/redemption_id son para el BROADCAST del
    -- endpoint (se quitan de la respuesta pública; el handler del
    -- cliente exige el UUID en payload.redemptionId).
    RETURN jsonb_build_object(
      'ok', true, 'status', 'pending',
      'code', v_r.redemption_code,
      'reward_name', v_r.reward_name,
      'reward_value', v_r.cash_value,
      'member_name', v_r.member_name,
      'member_id', v_r.member_id,
      'reward_id', v_r.reward_id,
      'redemption_id', v_r.id,
      'reward_icon', v_r.reward_icon,
      'points_spent', v_r.points_spent
    );
  END IF;

  IF p_action = 'cancel' THEN
    UPDATE redemptions SET confirm_status = 'none' WHERE id = v_r.id;
    RETURN jsonb_build_object('ok', true, 'status', 'none',
      'code', v_r.redemption_code, 'member_id', v_r.member_id,
      'redemption_id', v_r.id);
  END IF;

  -- deliver: misma invariante server-side que deliver_redemption —
  -- la entrega EXIGE la confirmación del cliente en su dispositivo.
  IF v_r.confirm_status <> 'confirmed' THEN
    RETURN jsonb_build_object('error', 'not_confirmed',
      'detail', 'El cliente aún no ha confirmado la entrega en su app');
  END IF;

  -- Operador para la atribución (mismo patrón de purchases).
  IF COALESCE(trim(p_operator_ext), '') = '' THEN
    RETURN jsonb_build_object('error', 'missing_operator');
  END IF;
  v_op := public.api_upsert_operator(trim(p_operator_ext), p_operator_name, NULL, p_operator_dpi);

  UPDATE redemptions SET
    collected      = true,
    collected_at   = now(),
    confirm_status = 'none',
    operator_id    = v_op
  WHERE id = v_r.id;

  INSERT INTO activity_log (member_id, activity_type, description, points_change)
  VALUES (v_r.member_id, 'entrega',
          'Premio entregado: ' || COALESCE(v_r.reward_name, 'Premio'), 0);

  -- Payload del COMPROBANTE: PROPER lo imprime desde su app (la
  -- impresión solo existe en la entrega, nunca al acumular).
  RETURN jsonb_build_object(
    'ok', true, 'status', 'delivered',
    'code',          v_r.redemption_code,
    'reward_name',   v_r.reward_name,
    'category',      v_r.category,
    'reward_value',  v_r.cash_value,
    'points_spent',  v_r.points_spent,
    'member_name',   v_r.member_name,
    'redeemed_at',   v_r.created_at,
    'delivered_at',  now(),
    'member_id',     v_r.member_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.api_redemption_confirm(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- ── 9. Panel: los operadores propios ligados a PROPER llevan badge ──
CREATE OR REPLACE FUNCTION public.list_operators_full(p_session_token text, p_role text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_role NOT IN ('operator', 'admin') THEN
    RAISE EXCEPTION 'Sesión inválida' USING ERRCODE = '28000', DETAIL = 'invalid_role';
  END IF;
  PERFORM public.validate_session_token(p_session_token, p_role, 'list_operators_full', false, NULL);
  RETURN QUERY
    SELECT jsonb_build_object(
      'id', o.id, 'name', o.name, 'username', o.username,
      'dpi', o.dpi, 'gafete', o.gafete, 'phone', o.phone, 'email', o.email,
      'station_id', o.station_id, 'station_name', s.name,
      'bomba', o.bomba, 'turno', o.turno, 'active', o.active,
      -- v1.4: un operador PROPIO unido a PROPER por DPI también se
      -- marca 'proper' (su estación pasa a seguir a cada factura).
      'external_source', COALESCE(o.external_source,
        (SELECT x.external_source FROM operator_external_ids x WHERE x.operator_id = o.id LIMIT 1)),
      'external_id', o.external_id,
      'external_ids', (SELECT COALESCE(jsonb_agg(x.external_id ORDER BY x.created_at), '[]'::jsonb)
                         FROM operator_external_ids x WHERE x.operator_id = o.id)
    )
    FROM operators o
    LEFT JOIN stations s ON s.id = o.station_id
    ORDER BY o.name;  -- nunca password_hash
END;
$function$;

-- ── 10. El sorteo estampa el valor del premio ────────────────
CREATE OR REPLACE FUNCTION public.draw_due_raffles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  r            record;
  v_total      integer;
  v_pick       integer;
  v_winner     uuid;
  v_reward_id  uuid;
  v_code       text;
  v_month_name text;
  v_drawn      integer := 0;
  v_claim_days integer;
  v_station    uuid;
  months       text[] := ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
BEGIN
  FOR r IN
    SELECT rc.* FROM raffle_calendar rc
    WHERE rc.winner_id IS NULL
      -- el mes de la rifa ya terminó en hora de Guatemala
      AND (make_date(rc.year, rc.month, 1) + interval '1 month') <= ((now() AT TIME ZONE 'America/Guatemala')::date)
      AND EXISTS (SELECT 1 FROM raffle_tickets rt WHERE rt.raffle_id = rc.id)
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_total
    FROM raffle_tickets WHERE raffle_id = r.id;
    IF v_total <= 0 THEN CONTINUE; END IF;

    -- Boleto ganador al azar en [1..total]; el ganador es el miembro en
    -- cuyo rango acumulado cae — ponderación exacta por boletos.
    v_pick := floor(random() * v_total)::integer + 1;

    SELECT member_id INTO v_winner
    FROM (
      SELECT member_id, SUM(SUM(quantity)) OVER (ORDER BY member_id) AS cum
      FROM raffle_tickets
      WHERE raffle_id = r.id
      GROUP BY member_id
    ) s
    WHERE s.cum >= v_pick
    ORDER BY s.cum
    LIMIT 1;

    IF v_winner IS NULL THEN CONTINUE; END IF;

    UPDATE raffle_calendar SET winner_id = v_winner, drawn_at = now()
    WHERE id = r.id;

    v_month_name := months[r.month];

    -- D22: plazo y estación de reclamo (defaults 15 días / primera
    -- estación por nombre = Turkaj 1).
    v_claim_days := COALESCE(r.claim_days, 15);
    v_station := COALESCE(
      r.claim_station_id,
      (SELECT id FROM stations ORDER BY name LIMIT 1)
    );

    -- Premio como canje EXCLUSIVO del ganador: reward oculto del catálogo
    -- (active=false) + redemption costo 0 con código TK estándar.
    -- D17: el reward nace localizado en la estación de reclamo.
    -- API v1.4: hereda el valor en Q de la rifa (reward_value).
    INSERT INTO rewards (name, icon, points_cost, category, active, description, station_ids, cash_value)
    VALUES (
      r.prize_name, COALESCE(r.prize_icon, '🎁'), 0, 'merch', false,
      'Premio de la rifa de ' || v_month_name || ' ' || r.year ||
      ' (Q' || r.prize_value || '). Exclusivo del ganador del sorteo.',
      CASE WHEN v_station IS NULL THEN NULL ELSE ARRAY[v_station] END,
      r.prize_value
    )
    RETURNING id INTO v_reward_id;

    v_code := 'TK-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

    -- D22: el canje del premio VENCE claim_days después del sorteo.
    INSERT INTO redemptions (member_id, reward_id, points_spent, redemption_code, collected, confirm_status, expires_at)
    VALUES (v_winner, v_reward_id, 0, v_code, false, 'none',
            now() + (v_claim_days || ' days')::interval);

    INSERT INTO activity_log (member_id, activity_type, description, points_change)
    VALUES (
      v_winner, 'rifa',
      'Ganaste la rifa de ' || v_month_name || ': ' || r.prize_name, 0
    );

    v_drawn := v_drawn + 1;
  END LOOP;

  RETURN jsonb_build_object('drawn', v_drawn);
END;
$$;

-- ── 11. admin_write_catalog: cash_value en el whitelist de 'reward' ──
-- Fuente: pg_get_functiondef de la BD viva (19-sep). ÚNICO cambio:
-- rewards.cash_value en el INSERT y el UPDATE de la entidad 'reward'.
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
    IF p_action = 'create' THEN
      INSERT INTO rewards (name, icon, points_cost, category, tier_exclusive, active, sort_order, description,
                           station_ids, store_ids, cash_value)
      VALUES (p_data->>'name', p_data->>'icon',
              COALESCE((p_data->>'points_cost')::integer, 0), p_data->>'category',
              NULLIF(p_data->>'tier_exclusive', ''),
              COALESCE((p_data->>'active')::boolean, true),
              NULLIF(p_data->>'sort_order', '')::integer, p_data->>'description',
              public.jsonb_uuid_array(p_data->'station_ids'),
              public.jsonb_uuid_array(p_data->'store_ids'),
              NULLIF(p_data->>'cash_value', '')::numeric)
      RETURNING id INTO v_id;
    ELSE
      UPDATE rewards SET
        name           = CASE WHEN p_data ? 'name'           THEN p_data->>'name' ELSE name END,
        icon           = CASE WHEN p_data ? 'icon'           THEN p_data->>'icon' ELSE icon END,
        points_cost    = CASE WHEN p_data ? 'points_cost'    THEN (p_data->>'points_cost')::integer ELSE points_cost END,
        category       = CASE WHEN p_data ? 'category'       THEN p_data->>'category' ELSE category END,
        tier_exclusive = CASE WHEN p_data ? 'tier_exclusive' THEN NULLIF(p_data->>'tier_exclusive', '') ELSE tier_exclusive END,
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

-- ── 12. ⚠️ CIERRE DE SEGURIDAD: api_* fuera del alcance de anon ──
-- Los endpoints de /api/v1 corren con la SERVICE KEY (service_role
-- conserva EXECUTE). Se conserva abierto SOLO api_create_client: lo
-- llama el panel y valida la sesión de admin adentro.
REVOKE ALL ON FUNCTION public.api_authenticate(text, text)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_resolve_member(text)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_resolve_station(text)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_get_redemption(text)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_list_pending_redemptions(text)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_log_request(uuid, text, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_replay(uuid, text)                           FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.api_authenticate(text, text)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.api_resolve_member(text)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.api_resolve_station(text)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.api_get_redemption(text)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.api_list_pending_redemptions(text)               TO service_role;
GRANT EXECUTE ON FUNCTION public.api_log_request(uuid, text, text, jsonb, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_replay(uuid, text)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.api_upsert_operator(text, text, uuid, text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.api_merge_mirror_operator(uuid, uuid)            TO service_role;
GRANT EXECUTE ON FUNCTION public.api_register_purchase(uuid, text, numeric, numeric, text, text, text, text, text, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_redemption_confirm(uuid, text, text, text, text, text) TO service_role;

-- ============================================================
-- VERIFICAR tras ejecutar:
--   1. Sin sobrecargas ni anon (esperado: 1 fila por función y proacl
--      SIN 'anon=' salvo api_create_client):
--        SELECT proname, pg_get_function_identity_arguments(oid), proacl::text
--        FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--          AND proname LIKE 'api\_%' ORDER BY 1;
--   2. SELECT name, external_code FROM stations ORDER BY name;  → 3 códigos
--   3. Desde fuera, con la llave PÚBLICA (anon):
--        POST /rest/v1/rpc/api_resolve_member {"p_card_code":"X"}
--      → 401/403 "permission denied for function" (antes: JSON de negocio).
--   4. GET /api/v1/redemptions?card_code=CTOD-95176 con la llave de API
--      → cada pendiente trae reward_value y expires_at.
--   5. POST /api/v1/purchases sigue acreditando (los campos nuevos son
--      opcionales; invoice_no pasa a obligatorio — PROPER ya lo envía
--      en el 100 % de sus llamadas).
--   6. Repetir el MISMO invoice_no sin Idempotency-Key → 409
--      invoice_already_credited (same_card true + purchase_id si es la
--      misma tarjeta); con otra tarjeta → 409 same_card false.
-- ============================================================
