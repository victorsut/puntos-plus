-- ============================================================
-- BETA CONTROLADA DE SECCIONES: VEHÍCULOS Y RIFA (16-oct-2026)
-- ============================================================
-- Decisión del dueño (16-oct): volver a BLOQUEAR las pestañas Vehículos
-- y Rifa del cliente (placeholder PRÓXIMAMENTE) y habilitarlas solo a
-- los socios que el administrador configure. Excepción inicial: Emanuel
-- Martinez, SOLO durante octubre de 2026 (en noviembre vuelve a ver
-- PRÓXIMAMENTE) — por eso cada probador lleva un vencimiento opcional.
--
-- Diseño (generaliza la beta de F6 E1 retirada el 4-sep, mig 20260904):
--   1. program_config 'features_beta' = {"vehicles":{"public":bool},
--      "raffle":{"public":bool}} — interruptor GLOBAL por sección
--      (lectura pública: un boolean no filtra nada). Nace APAGADO.
--   2. Tabla feature_beta (feature × member_id, until opcional) CERRADA
--      a la API abierta: los uuid de los probadores no viajan.
--   3. feature_enabled_for(feature, member) — helper interno (REVOKE):
--      público OR probador vigente. La decisión SIEMPRE la toma el server.
--   4. get_my_features(token) → {vehicles, raffle} para la PWA (sesión
--      de miembro). list_my_vehicles vuelve a devolver beta REAL.
--   5. Servidor: buy_raffle_tickets rechaza compras de MIEMBROS sin la
--      rifa habilitada (el flujo del operador no cambia); las alertas
--      push de servicio (cron) omiten a socios sin Vehículos habilitado.
--   6. Admin: admin_list_feature_beta / admin_set_feature_beta (sesión
--      de admin STRICT + log_admin_action). UI: Admin → Configuración →
--      "Secciones en beta".
--   7. SEGURIDAD (hallazgo de hoy): existía una sobrecarga LEGADA
--      buy_raffle_tickets(uuid, uuid, int, text DEFAULT NULL) ejecutable
--      por anon con p_allow_null=true — sin token compraba boletos a
--      nombre de CUALQUIER socio. Se elimina (ningún cliente la usa:
--      la PWA y OpRaffle siempre mandan p_session_role).
-- ============================================================

-- ── 1. interruptor global por sección ─────────────────────────
INSERT INTO public.program_config (key, value)
VALUES ('features_beta', '{"vehicles": {"public": false}, "raffle": {"public": false}}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 2. lista cerrada de probadores (con vencimiento opcional) ─
CREATE TABLE IF NOT EXISTS public.feature_beta (
  feature   text        NOT NULL CHECK (feature IN ('vehicles', 'raffle')),
  member_id uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  until     timestamptz,                      -- NULL = sin vencimiento
  added_at  timestamptz NOT NULL DEFAULT now(),
  added_by  text,
  PRIMARY KEY (feature, member_id)
);
ALTER TABLE public.feature_beta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feature_beta FROM anon, authenticated;

-- ── 3. helper interno: ¿la sección está habilitada para el socio? ─
CREATE OR REPLACE FUNCTION public.feature_enabled_for(p_feature text, p_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT (value -> p_feature ->> 'public')::boolean
                     FROM program_config WHERE key = 'features_beta'), false)
      OR EXISTS (SELECT 1 FROM feature_beta b
                  WHERE b.feature = p_feature
                    AND b.member_id = p_member_id
                    AND (b.until IS NULL OR b.until > now()));
$function$;
REVOKE ALL ON FUNCTION public.feature_enabled_for(text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 4a. get_my_features — la PWA pregunta qué pestañas mostrar ─
CREATE OR REPLACE FUNCTION public.get_my_features(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mid uuid;
BEGIN
  BEGIN
    v_mid := public.validate_session_token(p_session_token, 'member', 'get_my_features', false, NULL);
  EXCEPTION WHEN SQLSTATE '28000' THEN
    RETURN jsonb_build_object('error', 'invalid_session');
  END;
  RETURN jsonb_build_object(
    'ok', true,
    'features', jsonb_build_object(
      'vehicles', public.feature_enabled_for('vehicles', v_mid),
      'raffle',   public.feature_enabled_for('raffle', v_mid)
    )
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_features(text) TO anon, authenticated;

-- ── 4b. list_my_vehicles — 'beta' vuelve a ser la decisión REAL ─
-- (el modal de calificación y el cuadro del inicio la consumen)
CREATE OR REPLACE FUNCTION public.list_my_vehicles(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mid  uuid;
  v_rows jsonb;
BEGIN
  v_mid := public.validate_session_token(p_session_token, 'member', 'list_my_vehicles', false, NULL);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'vtype', t.vtype, 'brand', t.brand, 'model', t.model,
           'version', t.version, 'color', t.color, 'plate', t.plate,
           'km', t.km, 'km_updated_at', t.km_updated_at,
           'oil_type', t.oil_type, 'next_service', t.next_service,
           'next_service_km', t.next_service_km,
           'last_service', t.last_service, 'last_service_km', t.last_service_km,
           'tank_gal', t.tank_gal, 'fuel_pref', t.fuel_pref,
           'alerts_muted', t.alerts_muted,
           'last_fuel_at', t.last_fuel_at, 'created_at', t.created_at
         ) ORDER BY t.last_fuel_at DESC NULLS LAST, t.created_at ASC), '[]'::jsonb)
    INTO v_rows
  FROM vehicles t
  WHERE t.member_id = v_mid;

  RETURN jsonb_build_object(
    'ok', true,
    'beta', public.feature_enabled_for('vehicles', v_mid),
    'vehicles', v_rows
  );
END;
$function$;

-- ── 5a. buy_raffle_tickets — miembros solo con la rifa habilitada ─
-- Primero se elimina la sobrecarga legada SIN rol (ver cabecera, 7).
DROP FUNCTION IF EXISTS public.buy_raffle_tickets(uuid, uuid, integer, text);

CREATE OR REPLACE FUNCTION public.buy_raffle_tickets(
  p_member_id uuid,
  p_raffle_id uuid,
  p_quantity integer,
  p_session_token text DEFAULT NULL::text,
  p_session_role text DEFAULT 'member'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ticket_pts     integer;
  v_raffle_pts     integer;
  v_cost           integer;
  v_member_points  integer;
  v_member_tickets integer;
  v_session_role_id uuid;
BEGIN
  -- SEC.C.1: se cierra el allow_null. member → solo para sí mismo;
  -- operator → cualquier miembro (flujo OpRaffle).
  IF p_session_role NOT IN ('member', 'operator') THEN
    RAISE EXCEPTION 'Sesión inválida' USING ERRCODE = '28000', DETAIL = 'invalid_role';
  END IF;
  v_session_role_id := public.validate_session_token(
    p_session_token, p_session_role, 'buy_raffle_tickets', false,
    jsonb_build_object('member_id', p_member_id, 'raffle_id', p_raffle_id, 'quantity', p_quantity)
  );
  IF p_session_role = 'member' AND v_session_role_id <> p_member_id THEN
    RAISE EXCEPTION 'Sesión inválida' USING ERRCODE = '28000', DETAIL = 'member_mismatch';
  END IF;

  -- 16-oct: la rifa en beta — un socio sin la sección habilitada no
  -- compra boletos aunque fuerce la RPC (la PWA ni le muestra la pestaña).
  IF p_session_role = 'member' AND NOT public.feature_enabled_for('raffle', p_member_id) THEN
    RETURN jsonb_build_object('error', 'La rifa aún no está disponible para tu cuenta');
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RETURN jsonb_build_object('error', 'Cantidad inválida');
  END IF;

  SELECT ticket_points INTO v_raffle_pts
  FROM raffle_calendar WHERE id = p_raffle_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Rifa no encontrada');
  END IF;

  IF v_raffle_pts IS NOT NULL AND v_raffle_pts >= 1 THEN
    v_ticket_pts := v_raffle_pts;
  ELSE
    SELECT (value->>'ticketPts')::integer INTO v_ticket_pts
    FROM program_config WHERE key = 'general';
    IF v_ticket_pts IS NULL THEN v_ticket_pts := 5; END IF;
  END IF;

  v_cost := p_quantity * v_ticket_pts;

  SELECT points, tickets INTO v_member_points, v_member_tickets
  FROM members WHERE id = p_member_id;
  IF v_member_points IS NULL THEN
    RETURN jsonb_build_object('error', 'Miembro no encontrado');
  END IF;
  IF v_member_points < v_cost THEN
    RETURN jsonb_build_object('error', 'Puntos insuficientes');
  END IF;

  INSERT INTO raffle_tickets (member_id, raffle_id, quantity, points_spent)
  VALUES (p_member_id, p_raffle_id, p_quantity, v_cost);

  PERFORM set_config('app.allow_points_write', 'true', true);
  UPDATE members SET
    points     = points - v_cost,
    tickets    = COALESCE(tickets, 0) + p_quantity,
    updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO activity_log (member_id, activity_type, description, points_change)
  VALUES (p_member_id, 'rifa',
    'Compró ' || p_quantity || ' boleto' || CASE WHEN p_quantity > 1 THEN 's' ELSE '' END || ' de rifa',
    -v_cost);

  RETURN jsonb_build_object(
    'tickets',          p_quantity,
    'cost',             v_cost,
    'remaining_points', v_member_points - v_cost,
    'new_ticket_total', COALESCE(v_member_tickets, 0) + p_quantity
  );
END;
$function$;

-- ── 5b. alertas push de servicio: solo socios con Vehículos habilitado ─
-- (el push abre la pestaña Vehículos; sin la sección verían PRÓXIMAMENTE)
CREATE OR REPLACE FUNCTION public.list_vehicle_service_alerts()
RETURNS TABLE(member_id uuid, vehicle_id uuid, vehicle_name text, kind text, days_left integer, km_left integer, next_service date, next_service_km integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH cfg AS (
    SELECT COALESCE((value->>'days')::integer, 7) AS days,
           COALESCE((value->>'km')::integer, 500)  AS km
    FROM program_config WHERE key = 'service_alerts'
    UNION ALL SELECT 7, 500
    LIMIT 1
  )
  SELECT v.member_id, v.id,
         COALESCE(NULLIF(trim(concat_ws(' ', v.brand, v.model)), ''), 'tu vehículo'),
         'fecha'::text,
         (v.next_service - current_date)::integer,
         NULL::integer,
         v.next_service, v.next_service_km
  FROM vehicles v, cfg
  WHERE v.next_service IS NOT NULL
    AND NOT v.alerts_muted
    AND (v.next_service - current_date) <= cfg.days
    AND public.feature_enabled_for('vehicles', v.member_id)
  UNION ALL
  SELECT v.member_id, v.id,
         COALESCE(NULLIF(trim(concat_ws(' ', v.brand, v.model)), ''), 'tu vehículo'),
         'km'::text,
         NULL::integer,
         (v.next_service_km - v.km)::integer,
         v.next_service, v.next_service_km
  FROM vehicles v, cfg
  WHERE v.next_service_km IS NOT NULL AND v.km IS NOT NULL
    AND NOT v.alerts_muted
    AND (v.next_service_km - v.km) <= cfg.km
    AND public.feature_enabled_for('vehicles', v.member_id);
$function$;
REVOKE ALL ON FUNCTION public.list_vehicle_service_alerts() FROM PUBLIC, anon, authenticated;

-- ── 6a. admin_list_feature_beta — estado para el panel ────────
CREATE OR REPLACE FUNCTION public.admin_list_feature_beta(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg  jsonb;
  v_rows jsonb;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'admin_list_feature_beta', false, NULL);

  SELECT value INTO v_cfg FROM program_config WHERE key = 'features_beta';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'feature',   b.feature,
           'member_id', b.member_id,
           'name',      m.name,
           'card_code', (SELECT c.card_code FROM physical_cards c WHERE c.id = m.card_id),
           'until',     b.until,
           'active',    (b.until IS NULL OR b.until > now()),
           'added_at',  b.added_at,
           'added_by',  b.added_by
         ) ORDER BY b.feature, b.added_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM feature_beta b
  JOIN members m ON m.id = b.member_id;

  RETURN jsonb_build_object(
    'ok', true,
    'features', jsonb_build_object(
      'vehicles', jsonb_build_object('public', COALESCE((v_cfg -> 'vehicles' ->> 'public')::boolean, false)),
      'raffle',   jsonb_build_object('public', COALESCE((v_cfg -> 'raffle'   ->> 'public')::boolean, false))
    ),
    'members', v_rows
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_list_feature_beta(text) TO anon, authenticated;

-- ── 6b. admin_set_feature_beta — gestión auditada ─────────────
-- p_member_id + p_add (+ p_until): agrega/actualiza o quita un probador.
-- p_public (opcional): enciende/apaga la sección para TODOS.
-- El admin auditado sale de la SESIÓN (SEC.C.7); p_admin_* solo completan
-- nombre/correo del registro.
CREATE OR REPLACE FUNCTION public.admin_set_feature_beta(
  p_session_token text,
  p_feature text,
  p_member_id uuid DEFAULT NULL,
  p_add boolean DEFAULT true,
  p_until timestamptz DEFAULT NULL,
  p_public boolean DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL,
  p_admin_name text DEFAULT NULL,
  p_admin_email text DEFAULT NULL,
  p_reason_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aid uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_aid := public.validate_session_token(p_session_token, 'admin', 'admin_set_feature_beta', false,
             jsonb_build_object('feature', p_feature, 'member_id', p_member_id, 'add', p_add, 'public', p_public));

  IF p_feature IS NULL OR p_feature NOT IN ('vehicles', 'raffle') THEN
    RETURN jsonb_build_object('error', 'Sección desconocida');
  END IF;
  IF p_member_id IS NULL AND p_public IS NULL THEN
    RETURN jsonb_build_object('error', 'Nada que cambiar');
  END IF;

  SELECT value INTO v_old FROM program_config WHERE key = 'features_beta';

  IF p_member_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM members WHERE id = p_member_id) THEN
      RETURN jsonb_build_object('error', 'Socio no encontrado');
    END IF;
    IF p_add THEN
      INSERT INTO feature_beta (feature, member_id, until, added_by)
      VALUES (p_feature, p_member_id, p_until, COALESCE(p_admin_name, p_admin_email))
      ON CONFLICT (feature, member_id) DO UPDATE
        SET until = EXCLUDED.until, added_by = EXCLUDED.added_by, added_at = now();
    ELSE
      DELETE FROM feature_beta WHERE feature = p_feature AND member_id = p_member_id;
    END IF;
  END IF;

  IF p_public IS NOT NULL THEN
    v_new := jsonb_set(
      COALESCE(v_old, '{"vehicles": {"public": false}, "raffle": {"public": false}}'::jsonb),
      ARRAY[p_feature, 'public'], to_jsonb(p_public), true);
    INSERT INTO program_config (key, value) VALUES ('features_beta', v_new)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;

  PERFORM public.log_admin_action(
    p_admin_id    => COALESCE(p_admin_id, v_aid),
    p_admin_name  => p_admin_name,
    p_admin_email => p_admin_email,
    p_action      => 'feature_beta_update',
    p_entity_type => 'config',
    p_entity_id   => p_feature,
    p_reason_text => p_reason_text,
    p_old_value   => jsonb_build_object('features_beta', v_old),
    p_new_value   => jsonb_build_object('member_id', p_member_id, 'add', p_add, 'until', p_until, 'public', p_public),
    p_metadata    => NULL
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_beta(text, text, uuid, boolean, timestamptz, boolean, uuid, text, text, text) TO anon, authenticated;

-- ── 7. Excepción inicial: Emanuel Martinez, solo octubre 2026 ──
-- (decisión del dueño 16-oct; vence al empezar noviembre, hora de Guatemala)
INSERT INTO public.feature_beta (feature, member_id, until, added_by)
SELECT f, 'a0310613-e6cc-4956-9026-f15ef64bae83'::uuid,
       '2026-11-01 00:00:00-06'::timestamptz, 'migración 20261016 (decisión del dueño)'
FROM unnest(ARRAY['vehicles', 'raffle']) AS f
WHERE EXISTS (SELECT 1 FROM public.members WHERE id = 'a0310613-e6cc-4956-9026-f15ef64bae83')
ON CONFLICT (feature, member_id) DO NOTHING;

-- ============================================================
-- VERIFICAR tras ejecutar:
--   1. SELECT value FROM program_config WHERE key = 'features_beta';
--        → {"vehicles":{"public":false},"raffle":{"public":false}}
--   2. SELECT feature, member_id, until FROM feature_beta;
--        → 2 filas de Emanuel con until = 2026-11-01 06:00+00
--   3. SELECT public.feature_enabled_for('raffle', 'a0310613-e6cc-4956-9026-f15ef64bae83');
--        → true (hasta el 31-oct); con cualquier otro uuid → false
--   4. SELECT proname, pg_get_function_identity_arguments(oid)
--        FROM pg_proc WHERE proname = 'buy_raffle_tickets';
--        → UNA sola fila (la de 5 argumentos)
--   5. Diagnóstico SEC.C.7 (funciones ejecutables por anon que escriben
--      sin validate_session_token) → sin filas nuevas.
--   6. En la PWA: un socio cualquiera ve PRÓXIMAMENTE en Vehículos y
--      Rifa; Emanuel ve ambas pestañas; Admin → Configuración →
--      "Secciones en beta" lista a Emanuel con vencimiento 1-nov.
-- ============================================================
