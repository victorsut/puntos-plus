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
navegador, sin destellos, sin gestos de página web) y que la animación de
entrada aparezca de inmediato.

### 📌 Registro de decisiones para los lanzamientos (Claude: recordarlas todas cuando el dueño pregunte)

| # | Fecha | Decisión | Estado |
|---|---|---|---|
| T1 | 10-nov | La animación de entrada es LO PRIMERO que se ve al abrir: vive en `index.html` (HTML + CSS puros) y corre EN BUCLE mientras carga la app; `SplashIntro.jsx` solo la retira (arranque listo + mínimo 2.4 s, tap para saltar, tope 9 s). | ✅ En producción (`f0b4abd`) |
| T2 | 10-nov | El CENTRO de la animación es el **ícono de la app** (cuadrado naranja de bordes redondeados con PP, `/logo.png`) con contorno de progreso naranja; las monedas PP caen y rebotan alrededor. | ✅ Hecho |
| T3 | 10-nov | La pantalla del SISTEMA (Android al tocar el ícono / launch screen de iOS) debe ser IGUAL al primer cuadro: fondo perla `#EDE7E1` + el mismo ícono cuadrado al centro, mismo tamaño y posición → un solo movimiento. `manifest.json` `background_color` ya es perla. | ✅ PWA · 📋 configurar en cada paquete de tienda |
| T4 | 10-nov | Android 12+: ícono ANIMADO del sistema (AnimatedVectorDrawable, ≤1 s) que empalme con el volteo del ícono de la animación. | 📋 Deseado para Play Store |
| T5 | 10-nov | Abrir SIN esperar la red: el service worker sirve el HTML guardado al instante y lo renueva en segundo plano (antes esperaba hasta 4 s con señal floja). | ✅ Hecho |
| T6 | 10-nov | Sensación de app: sin "jalar para recargar" ni rebote del scroll; en táctil, mantener presionado no selecciona texto ni abre menús (campos de texto y `.pp-selectable` sí). | ✅ Hecho |
| T7 | 10-nov | Android: publicar como **TWA** (corre sobre Chrome: web push, cámara y Google funcionan igual). El proyecto Capacitor (`android/`) usa WebView SIN web push → solo para pruebas, salvo que se agregue push nativo (FCM). | 💡 Recomendado, confirmar con el dueño |
| T8 | 10-nov | iOS: launch screen estática (perla + ícono, regla de Apple) y **Capacitor iOS con los archivos empaquetados** + push nativo (APNs) — abre sin red y baja el riesgo de rechazo 4.2. Requiere Mac + Apple Developer. | 💡 Recomendado, confirmar con el dueño |

**Pendientes del dueño para los lanzamientos:**
- Color de la barra de estado y de navegación (hoy `theme_color` amarillo `#FBBC04`; opciones: perla durante la apertura o el color de la marca).
- **Nombre del paquete DEFINITIVO** (no se puede cambiar después): el proyecto Capacitor usa `com.puntosplus.app`; este documento sugería `com.turkaj.puntosplus`. Elegir uno antes de crear la ficha en Play.
- Cuentas: Google Play (USD 25 una vez) y Apple Developer (USD 99/año).
- Sign in with Apple: implementarlo u ocultar el botón de Google en iOS (ver App Store, punto 2).

### Cómo se ve la apertura

**Lo que NINGUNA app puede evitar:** al tocar el ícono, el sistema pinta
una pantalla propia ESTÁTICA (Android 12+: ícono al centro sobre un color;
iOS: la *launch screen*, que Apple exige estática). La técnica de las apps
formales es que esa pantalla sea IDÉNTICA al primer cuadro de la animación:

```
toque → pantalla del sistema (perla #EDE7E1 + ícono cuadrado PP al centro, fijo)
      → el ícono cobra vida: volteo, contorno naranja, lluvia de monedas PP,
        PUNTOS PLUS (index.html, en bucle mientras carga)
      → la app aparece con fundido cuando terminó de cargar
```

En la PWA instalada desde Chrome la pantalla del sistema la arma Android con
el ícono y `background_color` del manifest (no se puede animar ni quitar);
el color perla llega a los celulares cuando Chrome actualiza la app
instalada (días) o al reinstalarla.

### Android (Play Store)
1. **Envoltorio: TWA** (Bubblewrap/PWABuilder, ver Google Play arriba) — T7.
2. **Pantalla del sistema = primer cuadro (T3):** en el proyecto Android
   generado, `windowSplashScreenBackground` perla y como ícono el cuadrado PP.
3. **Opcional (T4):** `windowSplashScreenAnimatedIcon` con el volteo inicial.
4. **Splash del TWA** (imagen + color + fundido, configurable en Bubblewrap):
   el mismo ícono sobre perla, fundido corto (~300 ms).
5. **Barras del sistema:** colores definidos en el paquete (pendiente del dueño).
6. **assetlinks.json** (Google Play, punto 2): sin él aparece la barra del
   navegador y se pierde todo lo "formal".

### iOS (App Store)
- Launch screen (storyboard) estática: perla + ícono cuadrado en la posición
  del ícono de la animación; luego arranca `index.html` (T3, T8).
- Capacitor iOS empaquetado + APNs + decisión de Sign in with Apple (T8).

### Ajustes de código previos (hechos el 10-nov, aplican ya a la PWA)
- ✅ HTML desde la copia guardada al instante + renovación en segundo plano
  (`public/sw.js`, solo para `/` y rutas de la SPA; `privacidad.html` y demás
  siguen red primero). Una copia vieja tras un deploy se corrige sola con la
  recarga automática ante chunks faltantes (`vite:preloadError`) — T5.
- ✅ `overscroll-behavior-y: none` y sin selección/menú de mantener
  presionado en táctil (`src/styles/global.css`) — T6.
- 📋 Verificar en el TWA: botón atrás de Android cerrando hojas y modales
  antes de salir (`useBackLayer`) y enlaces externos (Waze, WhatsApp,
  encuesta Shell) abriendo su app o el navegador (`lib/openExternal.js`).
- 📋 Ícono adaptable: revisar que el `maskable` no recorte el PP en
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
