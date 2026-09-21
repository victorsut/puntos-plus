// src/views/admin/settings/ApiClientsCard.jsx
// 20260921 (checklist GO-LIVE): tarjeta "API externa" de Admin →
// Configuración. Antes solo tenía el botón de generar llave; ahora
// LISTA las llaves existentes (nombre, prefijo, estado, uso) y permite
// DESACTIVAR / REACTIVAR cada una con motivo obligatorio y auditoría
// (RPCs list_api_clients / toggle_api_client_active, migración
// 20260921). Nunca se ve la llave completa: solo el prefijo de 16
// chars que la identifica. Desactivar es REVERSIBLE: api_authenticate
// responde 401 mientras active=false y vuelve a aceptar la misma llave
// al reactivarla.
import { useState, useEffect, useCallback } from 'react';
import { sMono, adminTheme as AT } from '../../../constants/styles';
import ReasonModal from '../../../components/ui/ReasonModal';
import ApiKeyModal from './ApiKeyModal';
import { fetchApiClients, toggleApiClientActive } from '../../../services/adminAuthService';

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
};

// "hoy" · "ayer" · "hace 5 días" · fecha si es más viejo de 30 días
const fmtAgo = (iso) => {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'nunca';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days <= 30) return `hace ${days} días`;
  return `el ${fmtDate(iso)}`;
};

const SCOPE_LABEL = {
  'purchases:write': 'Acumular',
  'redemptions:read': 'Consultar canjes',
  'redemptions:write': 'Entregar canjes',
};

export default function ApiClientsCard({ fire, loggedAdmin, card, cardTitle, cardHint, ghostCardBtn }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [pending, setPending] = useState(null); // { client, newActive }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setList(await fetchApiClients());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const audit = (reason) => ({
    adminId: loggedAdmin?.id, adminName: loggedAdmin?.name,
    adminEmail: loggedAdmin?.email, reasonText: reason,
  });

  const askToggle = (c) => {
    if (!loggedAdmin?.id) { fire('Sesión de admin no disponible. Cerrá sesión y volvé a ingresar.', 'error'); return; }
    setPending({ client: c, newActive: !c.active });
  };

  const confirmToggle = async (reason) => {
    if (!pending) return;
    setSaving(true);
    const res = await toggleApiClientActive(pending.client.id, pending.newActive, audit(reason));
    setSaving(false);
    const { client, newActive } = pending;
    setPending(null);
    if (res?.error) { fire(res.error, 'error'); return; }
    fire(newActive
      ? `Llave «${client.name}» reactivada`
      : `Llave «${client.name}» desactivada — el sistema que la use ya recibe 401`, 'success');
    load();
  };

  const actionLabel = pending
    ? (pending.newActive
      ? `reactivar la llave «${pending.client.name}» (vuelve a aceptarse la misma llave)`
      : `desactivar la llave «${pending.client.name}» (el sistema que la use recibirá 401 de inmediato)`)
    : '';

  // ── estilos (FORMATO GENERAL Admin v2) ──────────────────
  const row = (active) => ({
    display: 'flex', alignItems: 'flex-start', gap: 12,
    background: 'rgba(255,255,255,.03)', border: `1px solid ${AT.border}`,
    borderRadius: 14, padding: '12px 14px', marginBottom: 8, opacity: active ? 1 : .6,
  });
  const pill = (active) => ({
    fontSize: 9.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
    padding: '3px 8px', borderRadius: 999, flexShrink: 0,
    background: active ? 'rgba(46,125,50,.18)' : 'rgba(255,255,255,.08)',
    color: active ? '#81C784' : '#9E9E9E',
  });
  const chip = {
    fontSize: 10, fontWeight: 700, color: '#80CBC4', padding: '2px 7px', borderRadius: 6,
    background: 'rgba(128,203,196,.10)', border: '1px solid rgba(128,203,196,.25)',
  };
  const miniBtn = (color) => ({
    padding: '7px 11px', borderRadius: 9, border: `1px solid ${AT.border}`,
    background: 'transparent', color, fontSize: 11, fontWeight: 700,
    cursor: 'pointer', fontFamily: "'DM Sans'", flexShrink: 0, alignSelf: 'center',
  });
  const meta = { fontSize: 11, color: '#777', lineHeight: 1.6 };

  return (
    <div style={card}>
      <div style={cardTitle}>API Externa (PROPER)</div>
      <div style={cardHint}>
        Llaves de acceso para sistemas externos que acumulan puntos y entregan
        premios (POS de PROPER). Cada llave se muestra una sola vez al generarla;
        desactivarla corta el acceso al instante y se puede revertir.
      </div>

      {loading && list.length === 0 && (
        <div style={{ ...meta, marginBottom: 10 }}>Cargando llaves…</div>
      )}
      {!loading && list.length === 0 && (
        <div style={{ ...meta, marginBottom: 10 }}>
          No hay llaves registradas (o falta ejecutar la migración 20260921).
        </div>
      )}

      {list.map(c => {
        const legacy = c.key_prefix === 'pp_live_';
        return (
          <div key={c.id} style={row(c.active)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{c.name}</span>
                <span style={pill(c.active)}>{c.active ? 'Activa' : 'Desactivada'}</span>
              </div>
              <div style={{ ...sMono, fontSize: 11.5, color: '#BDBDBD', marginBottom: 6 }}>
                {legacy ? 'pp_live_' : c.key_prefix}…
                {legacy && <span style={{ ...meta, marginLeft: 8, fontFamily: "'DM Sans'" }}>prefijo legado</span>}
              </div>
              <div style={meta}>
                Creada {fmtDate(c.created_at) || '—'} · Último uso {fmtAgo(c.last_used_at)}
                {' · '}{c.requests_total ?? 0} llamadas
                {c.requests_7d ? ` (${c.requests_7d} en 7 días)` : ''}
              </div>
              {!c.active && c.deactivated_at && (
                <div style={{ ...meta, color: '#FF8F00' }}>
                  Desactivada {fmtAgo(c.deactivated_at)}{c.deactivated_by ? ` por ${c.deactivated_by}` : ''}
                </div>
              )}
              {Array.isArray(c.scopes) && c.scopes.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
                  {c.scopes.map(s => <span key={s} style={chip}>{SCOPE_LABEL[s] || s}</span>)}
                </div>
              )}
            </div>
            <button onClick={() => askToggle(c)} disabled={saving}
              style={miniBtn(c.active ? '#FF8F00' : '#81C784')}>
              {c.active ? 'Desactivar' : 'Reactivar'}
            </button>
          </div>
        );
      })}

      <button onClick={() => setShowKeyModal(true)} style={{ ...ghostCardBtn('#80CBC4'), marginTop: list.length ? 6 : 0 }}>
        Generar llave de API
      </button>

      {showKeyModal && (
        <ApiKeyModal fire={fire} onClose={() => setShowKeyModal(false)}
          audit={audit(null)} onCreated={load} />
      )}

      <ReasonModal
        open={!!pending}
        onClose={() => { if (!saving) setPending(null); }}
        onConfirm={confirmToggle}
        actionLabel={actionLabel}
        loading={saving}
      />
    </div>
  );
}
