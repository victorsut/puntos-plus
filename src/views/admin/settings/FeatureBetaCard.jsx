// src/views/admin/settings/FeatureBetaCard.jsx
// Beta de secciones (16-oct-2026) — Tarjeta de Admin → Configuración
// para las pestañas del cliente en BETA controlada (Vehículos y Rifa):
// por sección, interruptor "Disponible para todos" y lista cerrada de
// PROBADORES (buscar un socio sobre las fichas ya cargadas del admin,
// vencimiento opcional "hasta", quitar). Todo por admin_set_feature_beta
// (sesión de admin STRICT + auditoría server-side); el estado se lee con
// admin_list_feature_beta. Generaliza la VehiclesBetaCard de F6 E1.
import { useEffect, useMemo, useState } from 'react';
import { adminTheme as AT, inputStyleDark } from '../../../constants/styles';
import { FEATURES, adminListFeatureBeta, adminSetFeatureBeta } from '../../../services/featureService';

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  // El vencimiento se guarda a las 00:00 del día siguiente al elegido:
  // se muestra el último día en que la sección sigue habilitada.
  d.setMinutes(d.getMinutes() - 1);
  return d.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
};

// "Hasta" del formulario (yyyy-mm-dd, inclusive) → ISO de las 00:00
// locales del día SIGUIENTE (el socio ve la sección todo ese día).
const untilIso = (ymd) => {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d + 1, 0, 0, 0).toISOString();
};

export default function FeatureBetaCard({ custs, loggedAdmin, fire, card, cardTitle, cardHint }) {
  const [info, setInfo] = useState(null); // { features, members[] } | null=cargando | false=RPC ausente
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState({});       // búsqueda por sección
  const [until, setUntil] = useState({}); // "hasta" por sección (yyyy-mm-dd)

  const load = () => {
    adminListFeatureBeta().then(({ data, error }) => {
      if (error || !data?.ok) { setInfo(false); return; }
      setInfo({ features: data.features || {}, members: data.members || [] });
    });
  };
  useEffect(load, []);

  const audit = {
    adminId: loggedAdmin?.id, adminName: loggedAdmin?.name,
    adminEmail: loggedAdmin?.email, reasonText: null,
  };

  const change = async (args, okMsg) => {
    if (busy) return;
    setBusy(true);
    const { error } = await adminSetFeatureBeta({ ...args, audit });
    setBusy(false);
    if (error) { fire('Error: ' + (error.message || 'no se pudo aplicar'), 'error'); return; }
    fire(okMsg, 'success');
    setQ(p => ({ ...p, [args.feature]: '' }));
    load();
  };

  const byFeature = useMemo(() => {
    const map = {};
    for (const f of FEATURES) map[f.id] = (info?.members || []).filter(m => m.feature === f.id);
    return map;
  }, [info]);

  const results = (fid) => {
    const s = (q[fid] || '').trim().toLowerCase();
    if (s.length < 2) return [];
    const inBeta = new Set(byFeature[fid].map(m => m.member_id));
    return (custs || [])
      .filter(c => !inBeta.has(c.id) && (
        c.name?.toLowerCase().includes(s) || c.phone?.includes(s) || c.cardId?.toLowerCase().includes(s)
      ))
      .slice(0, 5);
  };

  const pill = (on) => ({
    padding: '7px 14px', borderRadius: 18, border: 'none', cursor: 'pointer',
    background: on ? 'rgba(46,125,50,.25)' : 'rgba(255,255,255,.08)',
    color: on ? '#69F0AE' : '#9E9E9E',
    fontFamily: "'DM Sans'", fontWeight: 800, fontSize: 11.5,
  });

  return (
    <div style={card}>
      <div style={cardTitle}>Secciones en beta</div>
      <div style={cardHint}>
        Vehículos y Rifa solo las ven los socios de cada lista (el resto ve PRÓXIMAMENTE).
        El interruptor de cada sección la habilita para TODOS. El "hasta" es opcional:
        ese día es el último en que el socio la ve.
      </div>

      {info === null && <div style={{ fontSize: 12, color: '#777', fontWeight: 600 }}>Cargando...</div>}
      {info === false && (
        <div style={{ fontSize: 12, color: '#EF5350', fontWeight: 600, lineHeight: 1.5 }}>
          Falta ejecutar la migración 20261016 en el SQL Editor.
        </div>
      )}

      {info && FEATURES.map((f, fi) => {
        const pub = info.features?.[f.id]?.public === true;
        const members = byFeature[f.id];
        return (
          <div key={f.id} style={{ paddingTop: fi ? 14 : 0, marginTop: fi ? 14 : 0, borderTop: fi ? `1px solid ${AT.border}` : 'none' }}>
            {/* Interruptor global de la sección */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{f.label}</div>
                <div style={{ fontSize: 11, color: '#777', fontWeight: 600 }}>
                  {pub ? 'Disponible para todos' : `Solo probadores (${members.length})`}
                </div>
              </div>
              <button disabled={busy}
                onClick={() => change({ feature: f.id, isPublic: !pub }, pub ? `${f.label}: de vuelta a beta cerrada` : `${f.label} habilitada para TODOS`)}
                style={pill(pub)}>{pub ? 'PARA TODOS' : 'BETA'}</button>
            </div>

            {/* Buscar y agregar probador (+ hasta opcional) */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={q[f.id] || ''} onChange={e => setQ(p => ({ ...p, [f.id]: e.target.value }))}
                placeholder="Buscar socio (nombre, teléfono o tarjeta)"
                style={{ ...inputStyleDark, flex: 1, minWidth: 0, boxSizing: 'border-box', fontSize: 12.5 }} />
              <input type="date" value={until[f.id] || ''} onChange={e => setUntil(p => ({ ...p, [f.id]: e.target.value }))}
                title="Hasta (opcional)" aria-label="Hasta (opcional)"
                style={{ ...inputStyleDark, width: 138, boxSizing: 'border-box', fontSize: 12, colorScheme: 'dark' }} />
            </div>
            {results(f.id).map(c => (
              <button key={c.id} disabled={busy}
                onClick={() => change(
                  { feature: f.id, memberId: c.id, add: true, until: untilIso(until[f.id]) },
                  `${c.name} agregado a la beta de ${f.label}${until[f.id] ? ' hasta el ' + fmtDate(untilIso(until[f.id])) : ''}`,
                )}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                  marginTop: 6, padding: '9px 12px', borderRadius: 10, border: `1px solid ${AT.border}`,
                  background: 'transparent', color: '#E0E0E0', cursor: 'pointer',
                  fontFamily: "'DM Sans'", fontSize: 12.5, fontWeight: 700, textAlign: 'left',
                }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ color: '#80CBC4', fontWeight: 800, flexShrink: 0, marginLeft: 8 }}>
                  + Agregar{until[f.id] ? ' (hasta)' : ''}
                </span>
              </button>
            ))}

            {/* Probadores actuales */}
            {members.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {members.map(m => (
                  <div key={m.member_id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    padding: '7px 0', borderBottom: `1px solid ${AT.border}`, fontSize: 12.5,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: m.active ? '#E0E0E0' : '#777', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: m.active ? '#9E9E9E' : '#EF9A9A', fontWeight: 600 }}>
                        {m.until ? (m.active ? `hasta el ${fmtDate(m.until)}` : `venció el ${fmtDate(m.until)}`) : 'sin vencimiento'}
                        {m.card_code ? ` · ${m.card_code}` : ''}
                      </div>
                    </div>
                    <button disabled={busy}
                      onClick={() => change({ feature: f.id, memberId: m.member_id, add: false }, `${m.name} fuera de la beta de ${f.label}`)}
                      style={{
                        border: 'none', background: 'transparent', color: '#EF5350', cursor: 'pointer',
                        fontFamily: "'DM Sans'", fontSize: 11.5, fontWeight: 800, flexShrink: 0,
                      }}>Quitar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
