-- ============================================================================
-- 20260922 — MANTENIMIENTO: índices duplicados, índices de llaves foráneas
--            y límite de consultas a check_member_exists (10 por hora e IP)
-- ----------------------------------------------------------------------------
-- Origen: deudas menores del diagnóstico integral del 21-sep (linter de
-- Supabase) y decisión del dueño (22-sep): límite de 10 consultas.
--
-- Verificado ANTES de escribir esta migración (22-sep, contra producción):
--   · members.phone tenía TRES índices idénticos: las restricciones UNIQUE
--     `members_phone_key` y `members_phone_unique` (duplicado exacto) y el
--     índice simple `idx_members_phone` (nunca usado; redundante con el
--     índice único). Solo `members_phone_key` se menciona por nombre en
--     código (update_member_with_audit compara SQLERRM con '%phone%' o
--     '%members_phone_key%') → se conserva ESA y se eliminan las otras dos.
--     Ninguna función, política o trigger referencia `members_phone_unique`
--     ni `idx_members_phone`. La unicidad del teléfono sigue garantizada.
--   · Las 20 llaves foráneas sin índice coinciden exactamente con el
--     reporte del linter; ningún nombre de índice nuevo colisiona con
--     los existentes. Crear índices es aditivo: no cambia resultados,
--     solo planes de ejecución.
--   · check_member_exists solo la llama el registro (GoogleProfile.jsx,
--     una vez por "Continuar" del paso 1, ahora con teléfono y DPI en la
--     misma llamada). register_member vuelve a validar duplicados por su
--     cuenta ('phone_exists' / 'dpi_exists'), así que cuando el límite se
--     alcanza el registro CONTINÚA sin el aviso temprano y el duplicado se
--     detecta igual al finalizar: el límite nunca bloquea a un socio
--     legítimo (importante en el WiFi de las estaciones, donde muchos
--     comparten la misma IP).
--
-- Idempotente: se puede ejecutar más de una vez.
-- ============================================================================

-- ─── 1. members.phone: dejar UNA sola restricción única ─────────────────────
ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_phone_unique;
DROP INDEX IF EXISTS public.idx_members_phone;

-- ─── 2. Índices de llaves foráneas (20, reporte del linter 0001) ────────────
CREATE INDEX IF NOT EXISTS idx_activity_log_station     ON public.activity_log (station_id);
CREATE INDEX IF NOT EXISTS idx_card_history_card        ON public.card_history (card_id);
CREATE INDEX IF NOT EXISTS idx_card_history_member      ON public.card_history (member_id);
CREATE INDEX IF NOT EXISTS idx_members_card             ON public.members (card_id);
CREATE INDEX IF NOT EXISTS idx_members_last_operator    ON public.members (last_operator_id);
CREATE INDEX IF NOT EXISTS idx_members_referred_by      ON public.members (referred_by);
CREATE INDEX IF NOT EXISTS idx_operator_ratings_member  ON public.operator_ratings (member_id);
CREATE INDEX IF NOT EXISTS idx_operator_ratings_purchase ON public.operator_ratings (purchase_id);
CREATE INDEX IF NOT EXISTS idx_operators_station        ON public.operators (station_id);
CREATE INDEX IF NOT EXISTS idx_physical_cards_assigned  ON public.physical_cards (assigned_to);
CREATE INDEX IF NOT EXISTS idx_print_logs_member        ON public.print_logs (member_id);
CREATE INDEX IF NOT EXISTS idx_print_logs_reprint_of    ON public.print_logs (reprint_of);
CREATE INDEX IF NOT EXISTS idx_promo_apps_member        ON public.promo_applications (member_id);
CREATE INDEX IF NOT EXISTS idx_promo_rules_reward       ON public.promo_rules (reward_id);
CREATE INDEX IF NOT EXISTS idx_promotions_rule          ON public.promotions (promo_rule_id);
CREATE INDEX IF NOT EXISTS idx_raffle_calendar_winner   ON public.raffle_calendar (winner_id);
CREATE INDEX IF NOT EXISTS idx_raffle_entries_raffle    ON public.raffle_entries (raffle_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_operator     ON public.redemptions (operator_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_reward       ON public.redemptions (reward_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer       ON public.referrals (referrer_id);

-- ─── 3. Límite de consultas por IP a check_member_exists ────────────────────
-- Tabla de golpes (una fila por consulta permitida; se purgan las viejas
-- en cada llamada). Cerrada a la API abierta: solo la toca el helper.
CREATE TABLE IF NOT EXISTS public.rpc_rate_hits (
  key    text        NOT NULL,
  hit_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpc_rate_hits_key_at ON public.rpc_rate_hits (key, hit_at);
ALTER TABLE public.rpc_rate_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rpc_rate_hits FROM PUBLIC, anon, authenticated;

-- IP del cliente según las cabeceras que PostgREST expone en
-- request.headers (Cloudflare pone cf-connecting-ip; x-forwarded-for
-- como respaldo). NULL si la llamada no vino por la API (SQL directo).
CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE h jsonb;
BEGIN
  BEGIN
    h := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN NULLIF(trim(COALESCE(
    h->>'cf-connecting-ip',
    NULLIF(split_part(COALESCE(h->>'x-forwarded-for', ''), ',', 1), ''),
    h->>'x-real-ip', '')), '');
END;
$$;
REVOKE ALL ON FUNCTION public.request_client_ip() FROM PUBLIC, anon, authenticated;

-- ¿Se permite un golpe más para esta llave dentro de la ventana?
-- Registra el golpe solo cuando se permite (la ventana no se alarga
-- mientras se está bloqueado: pasada una hora del último permitido,
-- vuelve a haber cupo).
CREATE OR REPLACE FUNCTION public.rate_limit_allow(p_key text, p_max integer, p_window interval)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_n integer;
BEGIN
  DELETE FROM rpc_rate_hits WHERE key = p_key AND hit_at < now() - p_window;
  SELECT count(*) INTO v_n FROM rpc_rate_hits WHERE key = p_key AND hit_at >= now() - p_window;
  IF v_n >= p_max THEN
    RETURN false;
  END IF;
  INSERT INTO rpc_rate_hits (key) VALUES (p_key);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_allow(text, integer, interval) FROM PUBLIC, anon, authenticated;

-- Misma firma y mismas llaves de respuesta que antes (SEC.C.1, 28-jul).
-- Con el cupo agotado responde sin revelar nada y marca `limited: true`;
-- el registro continúa y register_member valida los duplicados al final.
CREATE OR REPLACE FUNCTION public.check_member_exists(p_phone text DEFAULT NULL, p_dpi text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_ip text := public.request_client_ip();
BEGIN
  IF v_ip IS NOT NULL
     AND NOT public.rate_limit_allow('check_member_exists:' || v_ip, 10, interval '1 hour') THEN
    RETURN jsonb_build_object('phone_exists', false, 'dpi_exists', false, 'limited', true);
  END IF;
  RETURN jsonb_build_object(
    'phone_exists', COALESCE(trim(p_phone), '') <> '' AND EXISTS (SELECT 1 FROM members WHERE phone = trim(p_phone)),
    'dpi_exists',   COALESCE(trim(p_dpi), '')   <> '' AND EXISTS (SELECT 1 FROM members WHERE dpi = trim(p_dpi))
  );
END;
$$;
COMMENT ON FUNCTION public.check_member_exists(text, text) IS
'Chequeo de duplicados del registro (solo booleanos). Límite 10 consultas por hora e IP (22-sep-2026); al agotarse responde limited=true sin revelar nada y el registro sigue: register_member valida los duplicados al final.';

-- ─── Verificación sugerida tras ejecutar ────────────────────────────────────
-- SELECT indexname FROM pg_indexes WHERE tablename='members' AND indexname LIKE '%phone%';  → solo members_phone_key
-- SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('idx_activity_log_station','idx_referrals_referrer'); → 2
-- SELECT has_function_privilege('anon','public.rate_limit_allow(text,integer,interval)','EXECUTE'); → false
-- Desde la app (o curl con la llave pública) llamar check_member_exists 11 veces: la 11ª devuelve limited=true
-- y `SELECT key, count(*) FROM rpc_rate_hits GROUP BY 1` muestra la IP real.
