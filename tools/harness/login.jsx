// Arnés de verificación visual del LOGIN del socio (ClientLogin) — UX-01
// (7-nov-2026): dentro de un navegador in-app (WhatsApp/Instagram) el botón
// de Google se sustituye por el aviso "abrí la app en Chrome".
//   ?dark=1
// La detección lee navigator.userAgent al cargar el módulo: para simular
// el WebView hay que capturar con un user agent de WhatsApp/Instagram:
//   node tools/harness/shot.cjs --out <dir> --ua=whatsapp login-wa=tools/harness/login.html
//   node tools/harness/shot.cjs --out <dir> --ua=instagram "login-ig=tools/harness/login.html?dark=1"
//   node tools/harness/shot.cjs --out <dir> login=tools/harness/login.html   (Chrome normal → botón de Google)
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/styles/global.css';

const q = new URLSearchParams(location.search);
const dark = q.get('dark') === '1';

const { default: ClientLogin } = await import('../../src/views/client/ClientLogin');

function Harness() {
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [authError, setAuthError] = useState('');
  const ctx = {
    loginPhone, setLoginPhone, loginPass, setLoginPass, authError, setAuthError,
    clearAuthErr: () => setAuthError(''), setAuthScreen: () => {}, setMe: () => {},
    setRegProfile: () => {}, setGoogleStep: () => {}, custs: [],
    fire: (m, t) => console.log('[toast]', t || '', m), dark, setUiMode: () => {},
    cfg: { supportPhone: '49741067' },
  };
  return (
    <div style={{ minHeight: '100vh', background: dark ? '#0D0D0F' : '#fff', maxWidth: 480, margin: '0 auto' }}>
      <ClientLogin {...ctx} />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);
