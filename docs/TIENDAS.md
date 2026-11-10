# Puntos Plus en Play Store y App Store — Checklist

> Auditoría 14-ago-2026. La app se empaqueta como TWA (Android) o wrapper
> (iOS) sobre https://puntosplus.vercel.app — el paquete de tienda carga el
> mismo JS del servidor, así que toda mejora web aplica a la app de tienda.

## ✅ Ya cumplido en el código (14-ago)

- **PWA completa:** HTTPS, service worker con offline básico, instalable.
- **manifest.json completo:** `id`, `scope`, `orientation: portrait`, `lang`,
  `categories`, descripción larga, iconos **192 y 512** en variantes `any` y
  `maskable` (los 192 se generaron de los 512 oficiales).
- **Política de privacidad pública:** `/privacidad.html` — corregida: decía
  login con *Facebook* (era de una versión vieja); ahora declara **Google**,
  la **ubicación opcional** del beneficio WiFi (no se almacena) y las
  **notificaciones push** opcionales.
- **Eliminación de datos:** `/eliminacion.html` con la opción EN LA APP como
  vía principal (Menú → Mi Cuenta → Eliminar cuenta, RPC `delete_my_account`,
  inmediata) + correo + presencial.
- **Borrado de cuenta dentro de la app:** obligatorio en ambas tiendas
  (Apple 5.1.1(v) y Play desde 2024) — ✅ implementado desde el 6-ago.
- **Arranque liviano:** code splitting por rol (cliente 354 kB).

## 📱 Google Play (TWA — PWABuilder o Bubblewrap)

1. **Generar el paquete:** pwabuilder.com → URL `https://puntosplus.vercel.app`
   → paquete Android (elegir un `package_name` definitivo, p. ej.
   `com.turkaj.puntosplus` — NO se puede cambiar después).
2. **⚠️ assetlinks.json (CRÍTICO):** sin él la app abre con la barra del
   navegador visible. Crear `public/.well-known/assetlinks.json` con la
   huella SHA-256 del certificado de **firma de Play** (Play Console →
   Configuración → Firma de apps → certificado de la clave de firma de apps):

   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.turkaj.puntosplus",
       "sha256_cert_fingerprints": ["AA:BB:CC:...huella de Play Console..."]
     }
   }]
   ```
   Avisar a Claude con el package name y la huella para dejarlo desplegado.
3. **Play Console** (cuenta de desarrollador, USD 25 una única vez):
   - Ficha: descripción, mínimo 2 capturas de teléfono, ícono 512, gráfico
     de funciones 1024×500.
   - **Data Safety** (debe COINCIDIR con privacidad.html): se recopilan
     nombre, teléfono, correo, DPI, fecha de nacimiento, historial de
     compras; ubicación solo en uso y no persistida; datos cifrados en
     tránsito; el usuario puede pedir eliminación. Encargados: Supabase,
     Vercel, Google (auth).
   - URL de política de privacidad: `https://puntosplus.vercel.app/privacidad.html`
   - URL de eliminación de cuenta: `https://puntosplus.vercel.app/eliminacion.html`
   - Clasificación de contenido (apta para todos) y público objetivo (18+
     recomendado por ser programa de combustible, evita requisitos de niños).
4. **Push:** el TWA usa el web push del navegador — ya funciona, nada extra.
5. **Cámara:** solo la usa el rol operador (escáneres QR). El TWA pide el
   permiso vía web al usarla; no requiere declaración nativa adicional.

## 🍎 App Store (iOS) — más exigente

1. **Empaquetado:** PWABuilder iOS genera un proyecto Xcode; se necesita Mac
   y cuenta Apple Developer (USD 99/año).
2. **⚠️ Sign in with Apple (guideline 4.8) — DECISIÓN PENDIENTE del dueño:**
   como la app ofrece login con Google, Apple EXIGE ofrecer también
   "Sign in with Apple". Opciones:
   - (a) Implementarlo — Supabase Auth lo soporta (provider `apple`); requiere
     la cuenta de Apple Developer para las llaves.
   - (b) Ocultar el botón de Google SOLO en el build iOS y dejar únicamente
     teléfono + contraseña (sin login de terceros la regla no aplica).
3. **⚠️ Push en iOS:** el wrapper (WKWebView) NO soporta web push — la
   versión de App Store quedaría sin notificaciones, salvo que se integre
   push nativo (APNs) en el paquete. Nota: la PWA instalada desde Safari
   (iOS 16.4+) SÍ soporta web push sin pasar por la tienda — es una
   alternativa válida para iPhone mientras tanto.
4. **Riesgo guideline 4.2 (minimum functionality):** Apple rechaza "sitios
   envueltos" sin valor de app. Mitigación: en las notas de revisión
   describir la funcionalidad real (tarjeta digital con QR, niveles,
   canjes con confirmación en vivo, rifas, push) y proveer una cuenta demo
   de prueba (miembro con puntos) al revisor.
5. **Permisos con texto (Info.plist del wrapper):**
   - `NSLocationWhenInUseUsageDescription` — "Detecta si estás en una
     estación Turkaj para mostrarte la red WiFi del beneficio."
   - Cámara: NO declararla si el paquete de tienda es solo para clientes
     (el escáner es del operador).
6. **Borrado de cuenta en-app:** ✅ ya cumplido.

## 🎬 Apertura formal con la animación de entrada (10-nov-2026, pedido del dueño)

Meta: que al tocar el ícono se vea como una app habitual (sin barra de
navegador, sin destellos) y que la animación de las monedas PP aparezca de
inmediato. Desde el 10-nov la animación vive en `index.html` (HTML + CSS
puros, en bucle mientras carga) — ya es lo primero que dibuja la app.

**Lo que NINGUNA app puede evitar:** al tocar el ícono, el sistema pinta
una pantalla propia ESTÁTICA (Android 12+: ícono al centro sobre un color;
iOS: la *launch screen*, que Apple exige estática). La técnica de las apps
formales es que esa pantalla sea IDÉNTICA al primer cuadro de la animación,
para que el ojo vea un solo movimiento:

```
toque → pantalla del sistema (perla #EDE7E1 + moneda PP al centro, fija)
      → la moneda empieza a moverse: lluvia, anillo, PUNTOS PLUS (index.html)
      → la app aparece con fundido cuando terminó de cargar
```

### Android (Play Store)
1. **Envoltorio: TWA** (Bubblewrap/PWABuilder, como arriba). ⚠️ El
   proyecto Capacitor del repo (`android/`, APK de prueba) carga la web en
   un **WebView, que NO soporta web push** — publicado así, los socios se
   quedarían sin notificaciones salvo que se agregue push nativo (FCM). El
   TWA corre sobre Chrome: push, cámara y sesión de Google funcionan igual
   que hoy. Recomendación: TWA para la tienda; el APK Capacitor queda solo
   para pruebas.
2. **Pantalla del sistema = primer cuadro:** fondo perla `#EDE7E1` y como
   ícono la **moneda PP** (no el logotipo cuadrado), del mismo tamaño y
   posición que la moneda héroe. En el proyecto Android generado:
   `windowSplashScreenBackground` + `windowSplashScreenAnimatedIcon`.
3. **Opcional (Android 12+):** ícono ANIMADO del sistema (AnimatedVector
   Drawable, máx. ~1 s): la moneda entra con el volteo y el anillo empieza
   a llenarse, y la página continúa exactamente desde ahí. Es el único
   punto donde el sistema permite animación.
4. **Splash del TWA** (imagen + color + fundido, configurable en Bubblewrap):
   la misma moneda sobre perla, con fundido corto (~300 ms).
5. **Barras del sistema:** color de la barra de estado y de navegación
   definidos en el paquete (hoy `theme_color` es amarillo `#FBBC04`;
   decidir con el dueño: perla durante la apertura o el color de la marca).
6. **assetlinks.json** (punto 2 de Google Play arriba): sin él aparece la
   barra del navegador y se pierde todo lo "formal".

### iOS (App Store)
- La *launch screen* (storyboard) es obligatoriamente estática: perla +
  moneda PP centrada en la posición de la moneda héroe; luego arranca la
  animación de `index.html`. Apple pide justamente que la launch screen se
  parezca a la primera pantalla.
- Envoltorio sugerido: **Capacitor iOS** (ya está en el repo) con los
  archivos de la app EMPAQUETADOS (no solo la URL remota) — abre sin red,
  baja el riesgo de rechazo 4.2 "sitio envuelto" — + push nativo (APNs) +
  decisión de Sign in with Apple. Requiere Mac y cuenta Apple Developer.

### Antes de publicar (código, se puede hacer ya y beneficia a la PWA)
- **Abrir sin esperar la red:** hoy el service worker pide `index.html` a
  la red y solo usa la copia guardada si no responde en 4 s — con señal
  floja la pantalla del sistema se alarga hasta 4 s. Cambiar a "copia
  guardada al instante + actualización en segundo plano" para el HTML
  (cuidando que la copia vieja no apunte a archivos de un deploy anterior:
  ya existe la recarga automática ante chunks faltantes y el aviso de
  actualización).
- **Gestos de navegador fuera:** `overscroll-behavior: none` (hoy jalar
  hacia abajo RECARGA la app en Chrome/TWA, delata que es una web),
  sin selección de texto ni menú de mantener presionado en botones y
  tarjetas (`user-select`/`-webkit-touch-callout`), conservando la
  selección en campos de texto.
- **Botón atrás** de Android cerrando hojas y modales antes de salir (ya
  existe `useBackLayer`; verificar en el TWA) y enlaces externos (Waze,
  WhatsApp, encuesta Shell) abriendo su app o el navegador, nunca dentro
  de la app (`lib/openExternal.js`).
- **Ícono adaptable:** revisar que el `maskable` no recorte la moneda en
  launchers redondos/squircle.

## Opcionales que suman

- **Screenshots en el manifest** (`screenshots`): mejoran el diálogo de
  instalación de la PWA y el score de PWABuilder — capturar 2-3 pantallas
  del cliente (inicio, canjes, tarjeta) en 1080×1920 y avisar para
  agregarlas.
- **`user-scalable=no`** en index.html: Apple a veces lo observa por
  accesibilidad (bloquea el zoom). Riesgo bajo; si la revisión lo objeta,
  se quita en un cambio de una línea.
- **Cuenta demo para revisores** (ambas tiendas): un miembro de prueba con
  puntos y un canje disponible.
