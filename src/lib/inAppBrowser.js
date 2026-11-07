// src/lib/inAppBrowser.js — detección de navegadores "in-app" (UX-01, 7-nov-2026).
//
// El enlace de la app casi siempre llega por WhatsApp/Instagram/Facebook y
// esos abren la web en un WebView propio. Google BLOQUEA el inicio de
// sesión OAuth dentro de WebViews ("403 disallowed_useragent"), así que en
// ese caso no se ofrece el botón de Google: se explica cómo abrir la app en
// Chrome y queda a mano la entrada por teléfono y contraseña.
//
// La app instalada desde las tiendas (TWA de Play Store) corre sobre Chrome
// con un user agent normal → NO cae en esta detección y Google funciona.
// El APK de prueba de Capacitor usa el WebView del sistema ("; wv") → SÍ
// cae (Google también lo bloquearía allí).

const IN_APP_RE = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|Twitter|Snapchat|TikTok|MicroMessenger|WhatsApp/i;
// WebView de Android: "; wv)" en el UA (Chrome WebView) — las apps de
// mensajería de Android lo usan aunque no se identifiquen por nombre.
const ANDROID_WV_RE = /;\s?wv\)/;

export function isAndroid(ua = navigator.userAgent || '') {
  return /Android/i.test(ua);
}

export function isIOS(ua = navigator.userAgent || '') {
  return /iPhone|iPad|iPod/i.test(ua);
}

/** true cuando la app corre dentro de un navegador in-app / WebView. */
export function isInAppBrowser(ua = navigator.userAgent || '') {
  if (IN_APP_RE.test(ua)) return true;
  if (isAndroid(ua) && ANDROID_WV_RE.test(ua)) return true;
  // WKWebView de iOS: tiene AppleWebKit pero NO "Safari" (Safari y
  // SFSafariViewController sí lo llevan, y en esos Google funciona).
  if (isIOS(ua) && /AppleWebKit/i.test(ua) && !/Safari/i.test(ua)) return true;
  return false;
}

/** Nombre amigable de la app que envuelve la web, para el mensaje. */
export function inAppBrowserName(ua = navigator.userAgent || '') {
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/Messenger/i.test(ua)) return 'Messenger';
  if (/WhatsApp/i.test(ua)) return 'WhatsApp';
  if (/TikTok/i.test(ua)) return 'TikTok';
  return null;
}

/**
 * Android: abre la URL actual en Chrome mediante un intent://. Si Chrome no
 * está, el sistema usa `browser_fallback_url` (el navegador por defecto).
 * iOS no tiene equivalente: el caller ofrece copiar el enlace.
 */
export function openInChrome(url = window.location.href) {
  if (!isAndroid()) return false;
  const u = new URL(url);
  const intent = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};` +
    `package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  window.location.href = intent;
  return true;
}

/** Copia el enlace al portapapeles (con respaldo para WebViews viejos). */
export async function copyLink(url = window.location.href) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); return true; }
  } catch { /* sin permiso: respaldo abajo */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
