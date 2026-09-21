-- ============================================================
-- 20260921e — SEC.C.7: CIERRE DE RPCs ADMINISTRATIVAS SIN SESIÓN
-- ============================================================
-- Diagnóstico de seguridad del 21-sep-2026 (pedido del dueño tras la
-- recalibración). Hallazgos:
--
--  A. CINCO funciones SECURITY DEFINER ejecutables por `anon` (la llave
--     pública del frontend) que escriben datos administrativos SIN validar
--     ninguna sesión — solo recibían p_admin_id "para auditoría", que
--     cualquiera puede inventar:
--        create_operator            → crear un operador con contraseña propia
--                                     y entrar a la vista de operador
--        update_operator_password   → tomar la cuenta de cualquier operador
--        toggle_operator_active     → desactivar operadores (denegación)
--        update_fuel_prices         → alterar precios (la app del operador
--                                     deriva galones de monto/precio → puntos)
--        set_degradation_enabled    → encender/apagar la degradación
--     Son anteriores a SEC.B (sesiones) y la auditoría SEC.C.6 no las
--     cubrió (igual que las api_* el 19-sep). Corrección: p_session_token
--     validado como ADMIN (estricto) en las cinco; DROP + CREATE para no
--     dejar la firma vieja como sobrecarga.
--
--  B. Funciones internas ejecutables por anon sin motivo:
--        vehicles_sync_from_json(uuid,jsonb) → insertar vehículos a cualquier socio
--        vehicles_mirror_to_member(uuid)
--        hash_member_password(text), pick_best_promo(...),
--        auto_enable_rls(), rls_auto_enable()
--     Corrección: REVOKE EXECUTE (solo las llaman otras funciones / triggers).
--
--  C. Tres vistas con SECURITY DEFINER (saltan RLS) legibles por anon:
--        raffle_participants (nombres de socios y boletos),
--        daily_survey_count, operator_rating_avg.
--     Corrección: security_invoker + REVOKE a anon/authenticated (el
--     frontend ya lee los participantes por list_raffle_participants).
--
--  D. Nueve funciones con search_path mutable (aviso del linter):
--     ALTER FUNCTION ... SET search_path = public.
--
-- Frontend (mismo commit): operatorAuthService, adminRpcServices y
-- Settings envían p_session_token de admin. Ejecutar esta migración
-- INMEDIATAMENTE después del deploy (antes, las cinco acciones del panel
-- fallarían por "function not found"; después del deploy y sin la
-- migración, siguen funcionando pero abiertas).
-- ============================================================

-- ── A. Cinco RPCs con sesión de admin obligatoria ─────────────

-- A.1 create_operator
DROP FUNCTION IF EXISTS public.create_operator(text, text, text, text, text, uuid, text, text, text, text, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.create_operator(
  p_session_token text,
  p_name          text,
  p_username      text,
  p_password      text,
  p_dpi           text,
  p_gafete        text,
  p_station_id    uuid DEFAULT NULL,
  p_phone         text DEFAULT NULL,
  p_email         text DEFAULT NULL,
  p_bomba         text DEFAULT NULL,
  p_turno         text DEFAULT 'Matutino',
  p_admin_id      uuid DEFAULT NULL,
  p_admin_name    text DEFAULT NULL,
  p_admin_email   text DEFAULT NULL,
  p_reason_text   text DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, username text, dpi text, gafete text, phone text, email text, station_id uuid, bomba text, turno text, active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_username  text := lower(trim(p_username));
  v_row       operators%ROWTYPE;
  v_new_value jsonb;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'create_operator', false, NULL);

  IF coalesce(trim(p_password), '') = '' THEN
    RAISE EXCEPTION 'La contraseña no puede estar vacía';
  END IF;
  IF length(p_password) < 4 THEN
    RAISE EXCEPTION 'La contraseña es demasiado corta';
  END IF;

  INSERT INTO public.operators (
    name, username, password_hash, dpi, gafete,
    phone, email, station_id, bomba, turno, active
  )
  VALUES (
    p_name, v_username,
    extensions.crypt(p_password, extensions.gen_salt('bf', 6)),
    p_dpi, p_gafete, p_phone, p_email, p_station_id, p_bomba,
    coalesce(p_turno, 'Matutino'), true
  )
  RETURNING * INTO v_row;

  IF p_admin_id IS NOT NULL THEN
    -- WHITELIST explícita: nunca password_hash
    v_new_value := jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'username', v_row.username,
      'dpi', v_row.dpi, 'gafete', v_row.gafete, 'phone', v_row.phone,
      'email', v_row.email, 'station_id', v_row.station_id,
      'bomba', v_row.bomba, 'turno', v_row.turno, 'active', v_row.active
    );
    PERFORM public.log_admin_action(
      p_admin_id    => p_admin_id,
      p_admin_name  => p_admin_name,
      p_admin_email => p_admin_email,
      p_action      => 'create_operator',
      p_entity_type => 'operator',
      p_entity_id   => v_row.id::text,
      p_reason_text => p_reason_text,
      p_old_value   => NULL,
      p_new_value   => v_new_value
    );
  END IF;

  RETURN QUERY SELECT
    v_row.id, v_row.name, v_row.username, v_row.dpi, v_row.gafete,
    v_row.phone, v_row.email, v_row.station_id, v_row.bomba,
    v_row.turno, v_row.active;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.create_operator(text, text, text, text, text, text, uuid, text, text, text, text, uuid, text, text, text) TO anon, authenticated;

-- A.2 update_operator_password
DROP FUNCTION IF EXISTS public.update_operator_password(uuid, text, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.update_operator_password(
  p_session_token text,
  p_id            uuid,
  p_new_password  text,
  p_admin_id      uuid DEFAULT NULL,
  p_admin_name    text DEFAULT NULL,
  p_admin_email   text DEFAULT NULL,
  p_reason_text   text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count     integer;
  v_username  text;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'update_operator_password', false, NULL);

  IF coalesce(trim(p_new_password), '') = '' THEN
    RAISE EXCEPTION 'La contraseña no puede estar vacía';
  END IF;
  IF length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'La contraseña es demasiado corta';
  END IF;

  UPDATE public.operators
     SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 6)),
         updated_at    = now()
   WHERE id = p_id
   RETURNING username INTO v_username;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 AND p_admin_id IS NOT NULL THEN
    PERFORM public.log_admin_action(
      p_admin_id    => p_admin_id,
      p_admin_name  => p_admin_name,
      p_admin_email => p_admin_email,
      p_action      => 'update_operator_password',
      p_entity_type => 'operator',
      p_entity_id   => p_id::text,
      p_reason_text => p_reason_text,
      p_old_value   => NULL,
      p_new_value   => jsonb_build_object('operator_id', p_id, 'operator_username', v_username, 'password_changed', true)
    );
  END IF;

  RETURN v_count > 0;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.update_operator_password(text, uuid, text, uuid, text, text, text) TO anon, authenticated;

-- A.3 toggle_operator_active
DROP FUNCTION IF EXISTS public.toggle_operator_active(uuid, boolean, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.toggle_operator_active(
  p_session_token text,
  p_id            uuid,
  p_new_active    boolean,
  p_admin_id      uuid DEFAULT NULL,
  p_admin_name    text DEFAULT NULL,
  p_admin_email   text DEFAULT NULL,
  p_reason_text   text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count      integer;
  v_old_active boolean;
  v_username   text;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'toggle_operator_active', false, NULL);

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'p_id es obligatorio' USING ERRCODE = '22023';
  END IF;

  SELECT active, username INTO v_old_active, v_username FROM public.operators WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.operators SET active = p_new_active, updated_at = now() WHERE id = p_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 AND p_admin_id IS NOT NULL THEN
    PERFORM public.log_admin_action(
      p_admin_id    => p_admin_id,
      p_admin_name  => p_admin_name,
      p_admin_email => p_admin_email,
      p_action      => 'toggle_operator_active',
      p_entity_type => 'operator',
      p_entity_id   => p_id::text,
      p_reason_text => p_reason_text,
      p_old_value   => jsonb_build_object('operator_id', p_id, 'operator_username', v_username, 'active', v_old_active),
      p_new_value   => jsonb_build_object('operator_id', p_id, 'operator_username', v_username, 'active', p_new_active)
    );
  END IF;

  RETURN v_count > 0;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.toggle_operator_active(text, uuid, boolean, uuid, text, text, text) TO anon, authenticated;

-- A.4 update_fuel_prices
DROP FUNCTION IF EXISTS public.update_fuel_prices(jsonb, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.update_fuel_prices(
  p_session_token text,
  p_prices        jsonb,
  p_admin_id      uuid DEFAULT NULL,
  p_admin_name    text DEFAULT NULL,
  p_admin_email   text DEFAULT NULL,
  p_reason_text   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_super numeric;
  v_regular numeric;
  v_diesel numeric;
  v_old_value jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'update_fuel_prices', false, NULL);

  IF p_prices ? 'super' = false OR p_prices ? 'regular' = false OR p_prices ? 'diesel' = false THEN
    RAISE EXCEPTION 'Faltan precios obligatorios. Se requieren las claves: super, regular, diesel.';
  END IF;
  v_super := (p_prices->>'super')::numeric;
  v_regular := (p_prices->>'regular')::numeric;
  v_diesel := (p_prices->>'diesel')::numeric;
  IF v_super < 1 OR v_super > 100 THEN
    RAISE EXCEPTION 'Precio de super fuera de rango (Q1.00 a Q100.00): %', v_super;
  END IF;
  IF v_regular < 1 OR v_regular > 100 THEN
    RAISE EXCEPTION 'Precio de regular fuera de rango (Q1.00 a Q100.00): %', v_regular;
  END IF;
  IF v_diesel < 1 OR v_diesel > 100 THEN
    RAISE EXCEPTION 'Precio de diesel fuera de rango (Q1.00 a Q100.00): %', v_diesel;
  END IF;

  IF p_admin_id IS NOT NULL THEN
    SELECT value INTO v_old_value FROM public.program_config WHERE key = 'fuel_prices';
  END IF;

  INSERT INTO public.program_config (key, value, updated_at)
  VALUES ('fuel_prices', jsonb_build_object('super', v_super, 'regular', v_regular, 'diesel', v_diesel), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
  RETURNING value INTO v_result;

  IF p_admin_id IS NOT NULL THEN
    PERFORM public.log_admin_action(
      p_admin_id    => p_admin_id,
      p_admin_name  => p_admin_name,
      p_admin_email => p_admin_email,
      p_action      => 'update_fuel_prices',
      p_entity_type => 'fuel_prices',
      p_entity_id   => 'fuel_prices',
      p_reason_text => p_reason_text,
      p_old_value   => v_old_value,
      p_new_value   => v_result
    );
  END IF;

  RETURN v_result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.update_fuel_prices(text, jsonb, uuid, text, text, text) TO anon, authenticated;

-- A.5 set_degradation_enabled
DROP FUNCTION IF EXISTS public.set_degradation_enabled(boolean, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.set_degradation_enabled(
  p_session_token text,
  p_enabled       boolean,
  p_admin_id      uuid,
  p_admin_name    text,
  p_admin_email   text,
  p_reason_text   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_old   jsonb;
  v_value jsonb;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'set_degradation_enabled', false, NULL);

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'enabled es obligatorio' USING ERRCODE = '22023';
  END IF;
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_id es obligatorio' USING ERRCODE = '22023';
  END IF;

  SELECT value INTO v_old FROM program_config WHERE key = 'degradation_enabled';

  v_value := jsonb_build_object(
    'enabled', p_enabled,
    'enabled_at', CASE WHEN p_enabled THEN to_jsonb(now())
                       ELSE COALESCE(v_old -> 'enabled_at', 'null'::jsonb) END
  );

  INSERT INTO program_config (key, value) VALUES ('degradation_enabled', v_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  PERFORM public.log_admin_action(
    p_admin_id    => p_admin_id,
    p_admin_name  => p_admin_name,
    p_admin_email => p_admin_email,
    p_action      => CASE WHEN p_enabled THEN 'enable_degradation' ELSE 'disable_degradation' END,
    p_entity_type => 'config',
    p_entity_id   => 'degradation_enabled',
    p_reason_text => p_reason_text,
    p_old_value   => v_old,
    p_new_value   => v_value
  );

  RETURN v_value;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.set_degradation_enabled(text, boolean, uuid, text, text, text) TO anon, authenticated;

-- ── B. Funciones internas: fuera del alcance de anon ──────────
REVOKE ALL ON FUNCTION public.vehicles_sync_from_json(uuid, jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vehicles_mirror_to_member(uuid)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hash_member_password(text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pick_best_promo(numeric, text, uuid, text, integer, uuid) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF to_regprocedure('public.auto_enable_rls()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.auto_enable_rls() FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ── C. Vistas: dejan de saltar RLS y de ser públicas ──────────
ALTER VIEW public.raffle_participants  SET (security_invoker = true);
ALTER VIEW public.daily_survey_count   SET (security_invoker = true);
ALTER VIEW public.operator_rating_avg  SET (security_invoker = true);
REVOKE ALL ON public.raffle_participants  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.daily_survey_count   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.operator_rating_avg  FROM PUBLIC, anon, authenticated;

-- ── D. search_path fijo en las funciones señaladas por el linter ──
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('update_updated_at_column','get_member_tier','jsonb_uuid_array','vehicles_json_norm',
                        'plate_norm','normalize_dpi','normalize_nit','tier_rank','vehicle_changes')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;

-- ============================================================
-- VERIFICAR tras ejecutar:
--   1. SELECT proname, pronargs FROM pg_proc WHERE proname IN
--        ('create_operator','update_operator_password','toggle_operator_active',
--         'update_fuel_prices','set_degradation_enabled')  → 1 fila cada una,
--        con p_session_token como primer argumento (15/7/7/6/6 args).
--   2. Con la llave pública, POST /rest/v1/rpc/update_fuel_prices sin
--      p_session_token → error 28000 (sesión requerida). Antes: 200.
--   3. SELECT has_table_privilege('anon','public.raffle_participants','SELECT') → false.
--   4. Admin → Personal: crear operador / reset de contraseña / activar;
--      Admin → Configuración: precios y degradación → funcionan con sesión.
-- ============================================================
