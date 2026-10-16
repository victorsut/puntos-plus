// ============================================================
// Puntos Plus — Feature Service (beta de secciones, 16-oct-2026)
// ============================================================
// Wrappers de las RPCs de la migración 20261016: las pestañas
// Vehículos y Rifa del cliente están en BETA controlada — la decisión
// de mostrarlas la toma el SERVER (interruptor global por sección en
// program_config 'features_beta' + lista cerrada feature_beta con
// vencimiento opcional). La PWA solo pregunta "¿qué veo yo?" con su
// sesión de miembro; la gestión va con sesión de admin (auditada).
// ============================================================

import { sb } from '../lib/supabaseClient';
import { callRpc } from './rpcCore';
import { getMemberToken, getAdminToken } from './sessionTokens';

export const FEATURES = [
  { id: 'vehicles', label: 'Vehículos' },
  { id: 'raffle', label: 'Rifa' },
];

// Todo bloqueado: respuesta por defecto cuando no hay servidor o la
// migración aún no corrió (la sección nunca se abre "por accidente").
export const LOCKED_FEATURES = Object.freeze({ vehicles: false, raffle: false });

// ¿Qué secciones ve el socio con sesión? → { data: { ok, features:
// { vehicles, raffle } } } o { error }.
export async function getMyFeatures() {
  if (!sb) return { data: null, error: { message: 'Sin conexión al servidor' } };
  return callRpc('get_my_features', {}, { sessionToken: getMemberToken()?.token ?? null });
}

// ── Admin: estado de la beta (interruptores + probadores con nombre) ──
export async function adminListFeatureBeta() {
  if (!sb) return { data: null, error: { message: 'Sin conexión al servidor' } };
  return callRpc('admin_list_feature_beta', {}, { sessionToken: getAdminToken()?.token ?? null });
}

// ── Admin: agregar/quitar probador (con vencimiento opcional) o
// encender/apagar la sección para TODOS. `until` = ISO o null.
export async function adminSetFeatureBeta({ feature, memberId = null, add = true, until = null, isPublic = null, audit = {} }) {
  if (!sb) return { data: null, error: { message: 'Sin conexión al servidor' } };
  return callRpc('admin_set_feature_beta', {
    p_feature: feature,
    p_member_id: memberId,
    p_add: add,
    p_until: until,
    p_public: isPublic,
    p_admin_id: audit.adminId ?? null,
    p_admin_name: audit.adminName ?? null,
    p_admin_email: audit.adminEmail ?? null,
    p_reason_text: audit.reasonText ?? null,
  }, { sessionToken: getAdminToken()?.token ?? null });
}
