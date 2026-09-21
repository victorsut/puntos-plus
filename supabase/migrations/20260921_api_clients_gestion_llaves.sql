-- ============================================================
-- 20260921 — GESTIÓN DE LLAVES DE LA API EXTERNA (checklist GO-LIVE)
-- ============================================================
-- Hasta hoy Admin → Configuración → API externa solo GENERABA llaves:
-- no había forma de ver cuáles existen ni de desactivar una (la llave
-- 'Pruebas' sigue activa desde julio). Esta migración agrega:
--
--   1. api_clients.deactivated_at / deactivated_by — rastro de la baja.
--   2. list_api_clients(p_session_token) — lista para el admin (nunca
--      devuelve key_hash; el prefijo identifica la llave sin revelarla)
--      con conteo de llamadas (total y últimos 7 días) desde api_requests.
--   3. toggle_api_client_active(...) — desactiva/reactiva una llave con
--      MOTIVO obligatorio (≥ 8 chars) y auditoría en admin_audit_log.
--      api_authenticate ya rechaza las llaves con active=false
--      (401 invalid_api_key), así que el efecto es inmediato y
--      REVERSIBLE: reactivar vuelve a aceptar la misma llave.
--   4. api_create_client gana auditoría opcional (quién generó la llave
--      y por qué). Se hace DROP + CREATE para no dejar sobrecargas
--      (PostgREST no sabría elegir). Sigue abierta a anon: valida la
--      sesión de admin adentro (única api_* que lo hace).
--
-- Idempotente. NO cambia el estado de ninguna llave existente.
-- ============================================================

-- ── 1. Rastro de la baja ────────────────────────────────────────
ALTER TABLE public.api_clients
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by text;

COMMENT ON COLUMN public.api_clients.deactivated_at IS
'20260921: momento de la última desactivación (NULL si está activa o nunca se desactivó).';
COMMENT ON COLUMN public.api_clients.deactivated_by IS
'20260921: correo del admin que desactivó la llave por última vez.';

-- ── 2. Lista de llaves para el admin ────────────────────────────
CREATE OR REPLACE FUNCTION public.list_api_clients(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'list_api_clients', false, NULL);

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',             c.id,
      'name',           c.name,
      'key_prefix',     c.key_prefix,
      'scopes',         to_jsonb(c.scopes),
      'active',         c.active,
      'created_at',     c.created_at,
      'last_used_at',   c.last_used_at,
      'deactivated_at', c.deactivated_at,
      'deactivated_by', c.deactivated_by,
      'requests_total', (SELECT count(*) FROM api_requests r WHERE r.api_client_id = c.id),
      'requests_7d',    (SELECT count(*) FROM api_requests r
                          WHERE r.api_client_id = c.id AND r.created_at >= now() - interval '7 days')
    ) ORDER BY c.created_at)
    FROM api_clients c
  ), '[]'::jsonb);
END;
$function$;

COMMENT ON FUNCTION public.list_api_clients(text) IS
'20260921: llaves de la API externa para Admin → Configuración. Requiere
sesión de admin. Nunca expone key_hash; el prefijo (16 chars) identifica
la llave. Incluye conteo de llamadas desde api_requests.';

-- ── 3. Desactivar / reactivar con motivo y auditoría ───────────
CREATE OR REPLACE FUNCTION public.toggle_api_client_active(
  p_session_token text,
  p_client_id     uuid,
  p_new_active    boolean,
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
  v_c api_clients%ROWTYPE;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'toggle_api_client_active', false, NULL);

  IF p_admin_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Sesión de admin no disponible');
  END IF;
  IF length(trim(COALESCE(p_reason_text, ''))) < 8 THEN
    RETURN jsonb_build_object('error', 'El motivo es obligatorio (mínimo 8 caracteres)');
  END IF;

  SELECT * INTO v_c FROM api_clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Llave no encontrada');
  END IF;
  IF v_c.active = p_new_active THEN
    RETURN jsonb_build_object('error',
      CASE WHEN p_new_active THEN 'La llave ya está activa' ELSE 'La llave ya está desactivada' END);
  END IF;

  UPDATE api_clients SET
    active         = p_new_active,
    deactivated_at = CASE WHEN p_new_active THEN deactivated_at ELSE now() END,
    deactivated_by = CASE WHEN p_new_active THEN deactivated_by ELSE p_admin_email END
  WHERE id = p_client_id;

  PERFORM public.log_admin_action(
    p_admin_id    => p_admin_id,
    p_admin_name  => p_admin_name,
    p_admin_email => p_admin_email,
    p_action      => 'toggle_api_client_active',
    p_entity_type => 'api_client',
    p_entity_id   => p_client_id::text,
    p_reason_text => p_reason_text,
    p_old_value   => jsonb_build_object('name', v_c.name, 'key_prefix', v_c.key_prefix, 'active', v_c.active),
    p_new_value   => jsonb_build_object('name', v_c.name, 'key_prefix', v_c.key_prefix, 'active', p_new_active)
  );

  RETURN jsonb_build_object('ok', true, 'active', p_new_active);
END;
$function$;

COMMENT ON FUNCTION public.toggle_api_client_active(text, uuid, boolean, uuid, text, text, text) IS
'20260921: desactiva o reactiva una llave de la API externa. Sesión de
admin + motivo obligatorio + auditoría (admin_audit_log). Una llave
desactivada recibe 401 invalid_api_key de inmediato (api_authenticate);
reactivarla vuelve a aceptar la MISMA llave.';

-- ── 4. api_create_client con auditoría opcional ────────────────
-- DROP explícito: la firma cambia y CREATE OR REPLACE dejaría una
-- sobrecarga (text,text,text[]) al lado de la nueva.
DROP FUNCTION IF EXISTS public.api_create_client(text, text, text[]);

CREATE OR REPLACE FUNCTION public.api_create_client(
  p_session_token text,
  p_name          text,
  p_scopes        text[] DEFAULT ARRAY['purchases:write','redemptions:read','redemptions:write'],
  p_admin_id      uuid   DEFAULT NULL,
  p_admin_name    text   DEFAULT NULL,
  p_admin_email   text   DEFAULT NULL,
  p_reason_text   text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key text;
  v_id  uuid;
  v_try integer := 0;
BEGIN
  PERFORM public.validate_session_token(p_session_token, 'admin', 'api_create_client', false, NULL);
  IF length(trim(COALESCE(p_name, ''))) = 0 THEN
    RETURN jsonb_build_object('error', 'El nombre del sistema es obligatorio');
  END IF;

  -- pp_live_<48 hex>; prefijo identificador = primeros 16 chars
  -- ('pp_live_' + 8 hex). Si el prefijo colisionara (improbable),
  -- se regenera la llave completa. (Lógica de 20260731c, intacta.)
  LOOP
    v_try := v_try + 1;
    v_key := 'pp_live_' || encode(extensions.gen_random_bytes(24), 'hex');
    BEGIN
      INSERT INTO api_clients (name, key_prefix, key_hash, scopes)
      VALUES (trim(p_name), left(v_key, 16), extensions.crypt(v_key, extensions.gen_salt('bf', 8)), p_scopes)
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  -- Auditoría (si el frontend manda quién generó la llave).
  IF p_admin_id IS NOT NULL THEN
    PERFORM public.log_admin_action(
      p_admin_id    => p_admin_id,
      p_admin_name  => p_admin_name,
      p_admin_email => p_admin_email,
      p_action      => 'api_create_client',
      p_entity_type => 'api_client',
      p_entity_id   => v_id::text,
      p_reason_text => p_reason_text,
      p_new_value   => jsonb_build_object('name', trim(p_name), 'key_prefix', left(v_key, 16), 'scopes', to_jsonb(p_scopes))
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'client_id', v_id, 'api_key', v_key);
END;
$function$;

COMMENT ON FUNCTION public.api_create_client(text, text, text[], uuid, text, text, text) IS
'F7a: genera una llave de la API externa (pp_live_ + 48 hex, bcrypt en
BD, se muestra UNA vez). Única api_* abierta a anon: valida la sesión de
admin adentro. 20260921: auditoría opcional en admin_audit_log.';

-- ── Verificación sugerida ──────────────────────────────────────
-- SELECT proname, pronargs FROM pg_proc WHERE proname IN
--   ('api_create_client','list_api_clients','toggle_api_client_active');
--   → 1 fila por función (sin sobrecargas), 7 / 1 / 7 argumentos.
-- SELECT name, key_prefix, active, deactivated_at FROM api_clients;
--   → ambas llaves siguen active = true (esta migración no toca estados).
