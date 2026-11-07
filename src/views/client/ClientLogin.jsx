// src/views/client/ClientLogin.jsx
// FORMATO GENERAL (referencia maestra): encabezado tipográfico grande a la
// izquierda como el home, campos rellenos sin borde, paleta de marca
// naranja/negro/blanco. "Regístrate" entra DIRECTO al wizard (la bienvenida
// intermedia se eliminó — decisión del dueño 22-jul).
import { useState, useEffect, useRef } from 'react';
import { sb, OAUTH_RETURN_HASH } from '../../lib/supabaseClient';
import { inputFlat, btnStyle, BRAND_ORANGE } from '../../constants/styles';
import { GoogleLogo, Phone, Lock, Fingerprint, HelpCircle } from '../../components/ui/Icons';
import PasswordInput from '../../components/ui/PasswordInput';
import { phoneMask } from '../../lib/inputMasks';
import { signInWithPhone } from '../../services/authService';
import { mapMember } from '../../lib/mapMember';
import { biometricsAvailable, loginBiometric, isUserCancel } from '../../lib/webauthnClient';
import Wordmark from '../../components/ui/Wordmark';
import LegalFooter from '../../components/ui/LegalFooter';
import ModeToggle from '../../components/ui/ModeToggle';
import SupportSheet from '../../components/ui/SupportSheet';
import { isInAppBrowser, inAppBrowserName, isAndroid, openInChrome, copyLink } from '../../lib/inAppBrowser';

import { openExternal } from '../../lib/openExternal';
// UX-01 (7-nov-2026): dentro de WhatsApp/Instagram/Facebook (WebView)
// Google rechaza el OAuth con "403 disallowed_useragent". Se evalúa una
// sola vez: el user agent no cambia durante la sesión.
const IN_APP = isInAppBrowser();
const IN_APP_NAME = IN_APP ? inAppBrowserName() : null;

export default function ClientLogin(ctx) {
  const { loginPhone, setLoginPhone, loginPass, setLoginPass, authError, setAuthError,
    clearAuthErr, setAuthScreen, setMe, setRegProfile, setGoogleStep, custs, fire,
    dark, setUiMode, cfg, oauthBusy } = ctx;

  // Canal de asistencia (4-ago): disponible desde el login
  const [supportOpen, setSupportOpen] = useState(false);

  // Ver/ocultar contraseña (regla 4-ago: todo campo de contraseña
  // lleva el ojito a la derecha)

  const ink = dark ? '#fff' : '#0D0D0D';
  const sub = dark ? 'rgba(255,255,255,.55)' : '#9E9E9E';
  // Campos rellenos: versión oscura del inputFlat (#F5F5F7 en claro)
  const field = { ...inputFlat, background: dark ? 'rgba(255,255,255,.08)' : '#F5F5F7', color: ink };

  // "¿Olvidaste tu contraseña?" aparece unos segundos después de
  // escribir el teléfono completo (8 dígitos).
  const [showForgot, setShowForgot] = useState(false);
  const fpTimer = useRef(null);

  useEffect(() => {
    clearTimeout(fpTimer.current);
    if ((loginPhone || '').replace(/\D/g, '').length >= 8) {
      fpTimer.current = setTimeout(() => setShowForgot(true), 1500);
    } else {
      setShowForgot(false);
    }
    return () => clearTimeout(fpTimer.current);
  }, [loginPhone]);

  // Recuperación por WhatsApp (decisión del dueño 4-ago — sustituye al
  // sheet SMS/correo "próximamente"): abre el chat del canal de
  // asistencia con la solicitud pre-escrita y el número que digitó.
  const requestPasswordReset = () => {
    const support = (cfg?.supportPhone || '49741067').replace(/\D/g, '');
    const phone = (loginPhone || '').replace(/\D/g, '');
    const msg = `Hola, olvidé mi contraseña de Puntos Plus y quiero restablecerla. Mi número registrado es ${phoneMask.format(phone)}.`;
    openExternal(`https://wa.me/502${support}?text=${encodeURIComponent(msg)}`);
  };

  // SEC-lite (25-jul): la contraseña se verifica en el SERVIDOR
  // (RPC authenticate_member, bcrypt). Antes solo se buscaba el
  // teléfono en la lista local — cualquier contraseña entraba.
  const [loggingIn, setLoggingIn] = useState(false);
  const doLogin = async () => {
    if (loggingIn) return;
    clearAuthErr();
    if (!loginPhone || !loginPass) { setAuthError('Ingresa teléfono y contraseña'); return; }
    setLoggingIn(true);
    try {
      const res = await signInWithPhone(loginPhone, loginPass);
      if (!res.ok) { setAuthError(res.error); return; }
      // SEC.C.1: el perfil viene del servidor con la sesión; custs queda
      // como fallback transitorio (RPC vieja sin member).
      const found = res.member ? mapMember(res.member) : custs.find(c => c.id === res.memberId);
      if (!found) { setAuthError('No se pudo cargar tu perfil. Recarga la app e intenta de nuevo.'); return; }
      setMe(found); setAuthScreen('logged'); fire('Bienvenido ' + found.name, 'success');
    } finally {
      setLoggingIn(false);
    }
  };

  // UX-13 (7-nov-2026): estado de carga de Google. Se enciende al tocar
  // el botón (la página se va a Google), arranca encendido si la URL
  // trae el token de vuelta (Supabase aún lo procesa) y sigue mientras
  // el servidor emite la sesión (oauthBusy). Se apaga con el resultado,
  // con un error o a los 20 s por si el flujo murió a medio camino.
  const [googleBusy, setGoogleBusy] = useState(() => /access_token=/.test(OAUTH_RETURN_HASH));
  const sawOauthBusy = useRef(false);
  // Google devolvió un error (p. ej. el socio canceló): decirlo, no callar.
  useEffect(() => {
    const m = OAUTH_RETURN_HASH.match(/error_description=([^&]+)/);
    if (!m && !/error=/.test(OAUTH_RETURN_HASH)) return;
    let desc = '';
    try { desc = decodeURIComponent(m?.[1] || '').replace(/\+/g, ' '); } catch { /* noop */ }
    setAuthError(/denied|cancel/i.test(desc) ? 'Cancelaste el ingreso con Google.' : 'Google no completó el ingreso. Intenta de nuevo.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (oauthBusy) sawOauthBusy.current = true;
    else if (sawOauthBusy.current) setGoogleBusy(false);
  }, [oauthBusy]);
  useEffect(() => { if (authError) setGoogleBusy(false); }, [authError]);
  useEffect(() => {
    if (!googleBusy) return undefined;
    const t = setTimeout(() => setGoogleBusy(false), 20000);
    return () => clearTimeout(t);
  }, [googleBusy]);
  const gBusy = googleBusy || !!oauthBusy;

  const doGoogle = () => {
    if (IN_APP || gBusy) return; // el botón no se muestra en WebViews (UX-01)
    if (!sb) { setAuthError('No se pudo conectar con el servidor. Intenta de nuevo.'); return; }
    clearAuthErr();
    setGoogleBusy(true);
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
      .then(({ error }) => { if (error) { setGoogleBusy(false); setAuthError('No se pudo abrir Google. Intenta de nuevo.'); } })
      .catch(() => { setGoogleBusy(false); setAuthError('No se pudo abrir Google. Intenta de nuevo.'); });
  };

  // UX-01: salir del WebView. Android → intent:// a Chrome (si no está,
  // el navegador por defecto); iOS → copiar el enlace y abrirlo en Safari.
  const [linkCopied, setLinkCopied] = useState(false);
  const leaveInApp = async () => {
    if (isAndroid() && openInChrome()) return;
    const ok = await copyLink();
    setLinkCopied(ok);
    fire(ok ? 'Enlace copiado: pégalo en Chrome o Safari' : 'No se pudo copiar. Toca los tres puntos y elige "Abrir en el navegador".', ok ? 'success' : 'warn');
  };

  // ── Biometría (passkeys): el botón solo aparece si el navegador
  // soporta autenticador de plataforma (in-app browsers no) ──
  const [bioAvail, setBioAvail] = useState(false);
  const [bioBusy, setBioBusy]   = useState(false);
  useEffect(() => { biometricsAvailable().then(setBioAvail); }, []);

  const doBiometric = async () => {
    if (bioBusy) return;
    clearAuthErr();
    setBioBusy(true);
    try {
      const res = await loginBiometric();
      const found = res.member ? mapMember(res.member) : custs.find(c => c.id === res.memberId);
      if (!found) { setAuthError('No se pudo cargar tu perfil. Recarga la app e intenta de nuevo.'); return; }
      setMe(found); setAuthScreen('logged'); fire('Bienvenido ' + found.name, 'success');
    } catch (err) {
      if (!isUserCancel(err)) setAuthError(err.message || 'No se pudo verificar tu identidad');
    } finally {
      setBioBusy(false);
    }
  };

  // Registro directo al wizard: crea el usuario temporal y abre el paso 1
  const startRegister = () => {
    setMe({
      id: 'temp-' + Date.now(),
      name: '', email: '', phone: '', avatar: '',
      dpi: '', plate: '', nit: '', bday: '',
      points: 0, gallons: 0, spent: 0, visits: 0,
      tickets: 0, redeemed: 0, referrals: 0,
      registered: new Date().toISOString().split('T')[0],
      lastBuy: '', station: '', cardId: '',
      supabaseUser: false, authProvider: 'manual',
    });
    setRegProfile({ name: '', nickname: '', dpi: '', plate: '', email: '', bday: '', nit: '', phone: '' });
    setGoogleStep('step1');
    setAuthError('');
    setAuthScreen('googleProfile');
  };

  const iconBox = { position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9E9E9E', display: 'flex', zIndex: 1 };

  return (
    <div style={{ padding: '48px 24px 120px', position: 'relative', zIndex: 1 }}>
      {/* Header — como el saludo del home: logo arriba, tipografía grande a la
          izquierda; sol/luna arriba a la derecha (modo claro/oscuro). */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <img src="/logo.png" alt="Puntos Plus" style={{ width: 64, height: 64, borderRadius: 16, display: 'block' }} />
          {/* Ayuda + modo claro/oscuro — la ayuda vive en el header
              (como en el home) para no confundirse con "Regístrate" */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setSupportOpen(true)} aria-label="Asistencia y ayuda"
              style={{ width: 38, height: 38, border: 'none', cursor: 'pointer', background: 'none', color: ink, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <HelpCircle />
            </button>
            <ModeToggle dark={dark} setUiMode={setUiMode} />
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, color: ink, lineHeight: 1.15 }}>Bienvenido a</div>
        <div style={{ lineHeight: 1.1, marginBottom: 10 }}>
          <Wordmark size={38} color={ink} accent={BRAND_ORANGE} />
        </div>
        <div style={{ fontSize: 14, color: sub }}>Inicia sesión para continuar</div>
      </div>

      {/* Error */}
      {authError && (
        <div style={{
          background: dark ? 'rgba(214,40,26,.18)' : '#FFEBEE', color: dark ? '#FF8A80' : '#C62828', padding: '10px 14px',
          borderRadius: 12, fontSize: 12, fontWeight: 700, marginBottom: 16, textAlign: 'center',
        }}>
          {authError}
        </div>
      )}

      {/* Phone + Password */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <div style={iconBox}><Phone /></div>
          <input placeholder="Número de teléfono" value={phoneMask.format(loginPhone || '')} inputMode="numeric"
            onChange={e => { setLoginPhone(phoneMask.clean(e.target.value)); clearAuthErr(); }} style={{ ...field, paddingLeft: 44 }} />
        </div>
        <PasswordInput placeholder="Contraseña" value={loginPass}
          onChange={e => { setLoginPass(e.target.value); clearAuthErr(); }}
          style={{ ...field, paddingLeft: 44, paddingRight: 50 }}
          leftIcon={<div style={iconBox}><Lock /></div>} />
        {showForgot && (
          <button onClick={requestPasswordReset}
            style={{ background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-end', padding: 0, fontSize: 12, fontWeight: 700, color: BRAND_ORANGE, fontFamily: "'DM Sans'", animation: 'fadeIn .3s ease' }}>
            ¿Olvidaste tu contraseña?
          </button>
        )}
        <button onClick={doLogin} disabled={loggingIn} style={{ ...btnStyle, background: BRAND_ORANGE, color: '#fff', opacity: loggingIn ? .7 : 1 }}>
          {loggingIn ? 'Ingresando...' : 'Iniciar sesión'}
        </button>
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
        <div style={{ flex: 1, height: 1, background: dark ? 'rgba(255,255,255,.12)' : '#F0F0F0' }} />
        <span style={{ fontSize: 12, color: sub, fontWeight: 600 }}>o continuar con</span>
        <div style={{ flex: 1, height: 1, background: dark ? 'rgba(255,255,255,.12)' : '#F0F0F0' }} />
      </div>

      {/* OAuth — en un WebView (WhatsApp/Instagram/Facebook) Google no
          funciona: en su lugar se explica cómo abrir la app en el
          navegador (UX-01). Teléfono + contraseña siguen disponibles. */}
      {IN_APP ? (
        <div style={{
          background: dark ? 'rgba(255,255,255,.06)' : '#FFF4EC',
          border: `1.5px solid ${dark ? 'rgba(255,255,255,.12)' : '#FFD8BF'}`,
          borderRadius: 16, padding: '14px 16px', marginBottom: 24, textAlign: 'left',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: ink, fontSize: 13.5, fontWeight: 800 }}>
            <GoogleLogo /> Entrar con Google
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: dark ? 'rgba(255,255,255,.75)' : '#48484A', marginBottom: 12 }}>
            {IN_APP_NAME ? `Estás dentro de ${IN_APP_NAME} y ` : 'Este navegador '}
            no permite iniciar sesión con Google. Abre Puntos Plus en Chrome
            {isAndroid() ? '' : ' o Safari'} para usar tu cuenta de Google, o entra arriba con tu teléfono y contraseña.
          </div>
          <button onClick={leaveInApp} style={{
            ...btnStyle, background: dark ? 'rgba(255,255,255,.1)' : '#fff',
            border: dark ? '1.5px solid rgba(255,255,255,.14)' : '1.5px solid #ECECEE',
            color: ink, minHeight: 44,
          }}>
            {isAndroid() ? 'Abrir en Chrome' : (linkCopied ? 'Enlace copiado ✓' : 'Copiar enlace de la app')}
          </button>
        </div>
      ) : (
        <button onClick={doGoogle} disabled={gBusy} aria-busy={gBusy} style={{
          ...btnStyle,
          background: dark ? 'rgba(255,255,255,.08)' : '#fff',
          border: dark ? '1.5px solid rgba(255,255,255,.14)' : '1.5px solid #ECECEE',
          color: dark ? '#fff' : '#333', opacity: gBusy ? .7 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24,
        }}>
          <GoogleLogo /> {gBusy ? 'Conectando con Google…' : 'Continuar con Google'}
        </button>
      )}

      {/* Biometría (passkey): huella / rostro / patrón del celular */}
      {bioAvail && (
        <button onClick={doBiometric} disabled={bioBusy} style={{
          ...btnStyle,
          background: dark ? 'rgba(255,255,255,.08)' : '#fff',
          border: dark ? '1.5px solid rgba(255,255,255,.14)' : '1.5px solid #ECECEE',
          color: dark ? '#fff' : '#333',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: -14, marginBottom: 24, opacity: bioBusy ? .7 : 1,
        }}>
          <span style={{ color: BRAND_ORANGE, display: 'flex' }}><Fingerprint /></span>
          {bioBusy ? 'Verificando...' : 'Usar huella o rostro'}
        </button>
      )}

      {/* Registro — link de texto, directo al wizard */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 13, color: sub }}>¿No tienes cuenta? </span>
        <button onClick={startRegister}
          style={{ background: 'none', border: 'none', color: BRAND_ORANGE, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans'", padding: 0 }}>
          Regístrate
        </button>
      </div>

      {/* Disclaimer legal D28 */}
      <LegalFooter />

      {/* Canal de asistencia (WhatsApp / llamada + horario en vivo) */}
      {supportOpen && (
        <SupportSheet onClose={() => setSupportOpen(false)} dark={dark} phone={cfg?.supportPhone} />
      )}
    </div>
  );
}
