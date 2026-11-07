# Puntos Plus — Referencia Técnica del Proyecto
## Última actualización: 7 de noviembre de 2026 (reconciliada contra el repo y la base de datos; cubre los cierres del 21-sep al 16-oct-2026)

> **Este documento es solo REFERENCIA TÉCNICA** (stack, estructura, schema,
> RPCs, endpoints, variables de entorno, accesos, reglas de negocio vigentes).
> Se reconcilia con la realidad del repo cuando cambia algo estructural.
>
> **El plan maestro (fases, decisiones D1–D37, track de seguridad SEC, deuda
> técnica y changelog) vive en [`ROADMAP.md`](./ROADMAP.md).** Las reglas
> operativas para trabajar el código están en [`CLAUDE.md`](./CLAUDE.md).
> La API pública para el POS de PROPER está documentada en
> [`docs/API-PROPER.md`](./docs/API-PROPER.md) y el diseño de Puntos Plus
> Business (flotas) en [`docs/PUNTOS-PLUS-BUSINESS.md`](./docs/PUNTOS-PLUS-BUSINESS.md).

---

## 1. Identidad y estado

- **Producto:** Puntos Plus (antes "Club Turkaj"), plataforma de fidelización
  independiente. Primer cliente: Gasolineras Turkaj I, II y III
  (Chichicastenango, Guatemala). Una instancia por empresa (D-arquitectura en
  ROADMAP §2).
- **Estado:** PWA en producción activa con socios reales. Plan v3.0 ejecutado
  en ~95 % (ROADMAP v4.6). Pendiente: checklist de GO-LIVE (interruptores
  apagados a propósito), decisión del dueño sobre Puntos Plus Business y
  gestiones externas. **Desde el 16-oct-2026 las pestañas Vehículos y Rifa
  están en BETA CONTROLADA** (PRÓXIMAMENTE salvo probadores del admin).
  PROPER integra contra producción desde el 16-sep (aún con socios de prueba).
- **Producción:** https://puntosplus.vercel.app (sin guión —
  `puntos-plus.vercel.app` es un proyecto AJENO).
- **Repo:** github.com/victorsut/puntos-plus, rama `main` → Vercel auto-deploy.
- **Supabase project:** `rfharnrsatgliynzcuwp`.

---

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 (JSX) + Vite 6, sin framework de UI (estilos inline + `src/styles/global.css`) |
| Backend | Supabase: PostgreSQL 15 + Auth (Google OAuth) + Realtime + Storage + RLS |
| Serverless | Vercel Functions (`api/`), 2 crons diarios |
| Push | `web-push` + VAPID, Service Worker propio (`public/sw.js`) |
| QR | `qrcode.react` (generación local) + `html5-qrcode` (escáner del operador) |
| Biometría | `@simplewebauthn/browser` + `@simplewebauthn/server` (passkeys) |
| OTP teléfono | Twilio Verify (`api/verify-phone.js`, apagado hasta GO-LIVE) |
| 3D | `three` (visor 3D de vehículos, EN PAUSA; chunk perezoso) |
| Android | Capacitor 8 (`android/`, `capacitor.config.json` apunta a la web viva) |

**Dependencias** (`package.json`): `react`, `react-dom`, `@supabase/supabase-js`,
`html5-qrcode`, `qrcode.react`, `web-push`, `three`, `@simplewebauthn/browser`,
`@simplewebauthn/server`, `@capacitor/core`, `@capacitor/android`.
Dev: `vite`, `@vitejs/plugin-react`, `@capacitor/cli`, `@capacitor/assets`.

**Scripts:** `npm run dev` (puerto 3000) · `npm run build` (→ `dist/`, el plugin
`swVersionPlugin` estampa `CACHE_NAME` en `sw.js`) · `npm run preview`.

**Code splitting:** vistas de operador y admin en `React.lazy` (el cliente es
eager); la ventana Vehículos y cada arte de vehículo son chunks propios;
`ChunkBoundary` recarga una vez si un chunk desaparece tras un deploy y
`vercel.json` excluye `/assets/` del rewrite SPA (404 limpio, no HTML).

---

## 3. Estructura del repo (686 archivos en git; 292 en `src/`)

```
puntos-plus/
├── api/                          # Vercel Functions (Node, service key)
│   ├── _lib/apiAuth.js           # núcleo API pública: API key bcrypt vs api_clients
│   ├── _lib/push.js              # motor de push (web-push + tabla notifications)
│   ├── v1/{stations,members,purchases,redemptions}.js   # API REST para PROPER (F7a)
│   ├── send-push.js              # envío genérico (type rutea el click en sw.js)
│   ├── log-notification.js       # registra el push que el SW realmente mostró
│   ├── degradation-alerts.js     # cron 09:00 GT — avisos de inactividad (D-degradación)
│   ├── vehicle-service-alerts.js # cron 09:10 GT — próximo servicio del vehículo (D24)
│   ├── upload-avatar.js          # bucket avatars (foto de perfil del socio)
│   ├── upload-promo-image.js     # bucket promo-images (imagen 900×1200 de la promo)
│   ├── verify-phone.js           # OTP Twilio Verify al registrarse (F5)
│   └── webauthn.js               # login con huella/rostro (passkeys)
├── public/                       # manifest.json, sw.js, favicon/icon/logo, privacidad.html, eliminacion.html
├── src/
│   ├── main.jsx                  # bootstrap + registro del SW + recarga por vite:preloadError
│   ├── views/App.jsx             # estado global, rol por URL, ctx para todas las vistas
│   ├── views/ScreenRouter.jsx    # imports de vistas (eager/lazy), BottomNav, ChunkBoundary
│   ├── views/client/             # ClientHome, ClientLogin, GoogleProfile, PhoneVerifyStep,
│   │                             #   ClientMenu, ClientPromos, ClientRaffle, HistorySheet,
│   │                             #   NotificationsSheet, RewardQrSheet, TermsSheet,
│   │                             #   CompanySelect, VehiclesScreen
│   │   ├── history/              # HistoryFilters (fila de períodos + embudo de tipo del historial)
│   │   ├── home/                 # HomeHeader, PromoBentoTile, VehicleBentoTile, TierDetailModal,
│   │   │                         #   WifiModal, StationsMapModal, SurveyStationsModal
│   │   ├── menu/                 # MenuAccount, MenuInfo, MenuTerms, AvatarEditor,
│   │   │                         #   PhoneChangeSection, DeleteAccountSection, menuUi
│   │   ├── raffle/               # RafflePrizeCarousel (carrusel de meses con arrastre)
│   │   └── vehicles/             # VehiclesHome, VehicleForm, VehicleFuel (+FuelLogForm,
│   │                             #   FuelHistoryRow, FuelEventRow, fuelFmt), VehicleCharts,
│   │                             #   ServiceConfirmSheet
│   ├── views/operator/           # OperatorLogin, OpHome, OpClients, OpRedeem, OpRaffle
│   ├── views/admin/              # AdminShell (menú lateral), AdminDash (+dash/DashTops),
│   │                             #   Members, MemberDetail(+Modals), OpManagement,
│   │                             #   AdminManagement (admins), AdminCatalog, AdminPremios,
│   │                             #   AdminPromos/AdminPromoForm, PromoRules/PromoRuleForm,
│   │                             #   AdminRaffle/AdminRaffleForm, AdminStations, AuditLog,
│   │                             #   Settings (+settings/ApiKeyModal, ApiClientsCard,
│   │                             #   FuelPricesCard, FuelPricesModal, ProperPricesSwitch,
│   │                             #   ServiceAlertsCard, FeatureBetaCard), analytics/An{Clientes,
│   │                             #   Operadores,Promos,Integridad}
│   ├── views/shared/             # Catalog (admin + cliente), Rules
│   ├── components/               # modales y hojas globales: AppModals, OpRatingModal,
│   │                             #   SurveyResultModal, RedeemConfirm*, PurchaseConfirmSheet,
│   │                             #   RaffleWinnerModal, SpecialDayBonusModal, ClientQrSheet,
│   │                             #   SplashIntro (monedas 3D), UpdateAvailable, ComingSoon
│   │                             #   (VehiclesSoon/RaffleSoon, beta controlada)
│   ├── components/tour/          # tutorial interactivo: ClientTour (motor), ClientTourGate, tourSteps
│   ├── components/ui/            # 142 archivos: BottomNav, BentoTile, BottomSheet, GrowModal,
│   │                             #   QRCode, QRScanner, TierCardBento, GalaxyStars/Dust,
│   │                             #   ModeToggle, Toast, ChunkBoundary, DrumDatePicker,
│   │                             #   PeriodPicker, ChipScroller, AddressPicker, RewardIcon,
│   │                             #   VehicleIcons, VehicleArt (+53 *Art.jsx y *Trace.js
│   │                             #   calcados por modelo), vehicle3d/ (three.js), FeatureGate
│   ├── hooks/                    # useAuthBoot, useSessionGuard, useMemberRealtime,
│   │                             #   useNotificationsInbox, useBusinessActions, useStaffData,
│   │                             #   useSurveyFlow, useBackLayer, useSwipeTrack, useToast,
│   │                             #   useShortScreen, useCountUp, useMemberFeatures (beta)
│   ├── services/                 # bootLoader (carga inicial), rpcCore/rpcServices,
│   │                             #   adminRpcServices, secureReads (lecturas con sesión),
│   │                             #   authService / operatorAuthService / adminAuthService,
│   │                             #   sessionTokens / sessionExpiry, promoService,
│   │                             #   vehicleService, featureService (get_my_features), dataService
│   ├── lib/                      # supabaseClient, pushNotifications, swRegistration,
│   │                             #   webauthnClient, tierSystem, cardCodes, receiptModel/
│   │                             #   receiptPrinter (impresión térmica), inputMasks, dates,
│   │                             #   geo, mapMember, motionOrigin, backStack, text,
│   │                             #   fuelEconomy (respaldo del cálculo km/gal), tour
│   ├── constants/                # config.js (DEFAULT_CONFIG, CARD_PREFIX…), styles.js,
│   │                             #   vehicleCatalog.js (marcas/modelos + bodyFor), geoGt.js
│   └── styles/global.css
├── supabase/migrations/          # 116 migraciones SQL (se ejecutan A MANO en el SQL Editor)
├── docs/                         # API-PROPER.md v1.4 (+html, Postman), NOVEDADES/ (un documento de novedades de la API por versión, md+html), TIENDAS.md
├── tools/
│   ├── artes/                    # pipeline de calco de artes (motor, comparador, historico)
│   ├── harness/                  # arneses visuales (Vite puerto 3100 + Edge headless)
│   └── recuperar-transcript.cjs
├── android/                      # proyecto Capacitor (APK de prueba vía GitHub Actions)
├── .github/workflows/android-apk.yml
├── REFERENCIAS INTERFAZ/         # capturas de referencia del dueño (diseño + vehículos)
├── CLAUDE.md · ROADMAP.md · ESTADO-PROYECTO.md · DEPLOY.md
├── index.html · vite.config.js · vercel.json · capacitor.config.json
└── .mcp.json                     # MCP de Supabase y Vercel para Claude Code
```

Regla de modularidad: ningún archivo de `src/` supera las 500 líneas.

---

## 4. Acceso por rol

| Rol | URL | Autenticación |
|---|---|---|
| Socio (cliente) | `puntosplus.vercel.app` | Google OAuth (Supabase Auth) → sesión propia en `member_sessions` (180 días); alternativas: teléfono + contraseña (`authenticate_member`) y passkey (`api/webauthn`) |
| Operador | `?rol=operador` | RPC `authenticate_operator` (bcrypt server-side) → `operator_sessions` |
| Admin | `?rol=admin` | RPC `authenticate_admin` (bcrypt) → `admin_sessions`; gestión en Admin → Configuración → Administradores |

Deep-links: `?goto=pendientes` (canjes pendientes) y `?goto=vehiculo&vehicle=<id>`
(confirmación de servicio desde el push). `?station=` para las encuestas por
estación.

Todas las RPCs sensibles validan el token con `validate_session_token(token,
rol, nombre_rpc, strict, …)`; las tablas con PII están CERRADAS a la API
anónima (track SEC.C completo, ver ROADMAP).

---

## 5. Supabase — schema (43 tablas, 3 vistas, 148 funciones)

### Tablas por dominio
- **Socios y sesiones:** `members` (puntos, galones, tier, `card_id`, `degrade_stage`, espejo `vehicles` jsonb), `member_credentials` (teléfono + hash), `member_sessions`, `webauthn_challenges`, `phone_verifications`, `referrals`, `card_history`, `physical_cards` (13 seed `CTOD-00001..13` en `status='inactive'`; tarjeta física EN PAUSA).
- **Personal:** `operators` (+ `external_id` para colaboradores PROPER), `operator_sessions`, `operator_ratings`, `admins`, `admin_sessions`, `admin_audit_log`.
- **Operación:** `purchases` (`station_id`, `fuel_type`, `gallons`, `amount`, `points_earned`, `invoice_no` único, `vehicle_id`, `km_reading`, `full_tank`, `at_reserve`, `gap_before`), `redemptions` (`confirm_status`, `redemption_code`, `collected`), `rewards`, `partner_stores`, `activity_log` (libro mayor del socio), `print_logs`, `surveys`, `special_days`.
- **Promociones:** `promotions` (cards con imagen), `promo_rules` + `promo_applications` (motor PROMO-1/2: dobles puntos, bonus por día/producto/monto).
- **Rifa:** `raffle_calendar`, `raffle_tickets`, `raffle_entries`.
- **Vehículos (F6):** `vehicles` (fuente de verdad; `alerts_muted`, `last_service`, `next_service`, `next_service_km`, `tank_gal`, `fuel_pref`…), `vehicle_fuel_logs` (consumos manuales fuera de Turkaj; `full_tank`, `at_reserve`, `gap_before`), `vehicle_events` (alta, edición, servicio, silencio — historial del vehículo, 21-sep).
- **Push:** `push_subscriptions`, `notifications` (todo envío; inbox de la campana y dedupe).
- **API pública:** `api_clients` (API keys bcrypt), `api_requests` (idempotencia + log; el DPI del colaborador se guarda enmascarado), `operator_external_ids` (v1.4: varios usuarios de PROPER por operador, unidos por DPI), `fuel_price_observations` (precio por factura de PROPER, estación × combustible, racha; 23-sep).
- **Config y guardas:** `stations` (+ `fuel_prices` propio por estación, D4), `program_config` (jsonb por clave: `general`, `tiers`, `degradation`, `degradation_enabled`, `fuel_prices`, `fuel_prices_mode`, `fuel_prices_auto`, `features_beta`, `company`, `support`, `service_alerts`, `terms_*`, `phone_verification`), `feature_beta` (probadores por sección, vencimiento opcional; cerrada a anon), `rpc_rate_hits` (límite por IP de `check_member_exists`), `points_write_violations`, `session_violations`.

**Vistas:** `raffle_participants`, `daily_survey_count`, `operator_rating_avg`.
**Buckets de Storage:** `promo-images`, `avatars` (solo service role; subida por `api/upload-*`).
**Extensiones:** `pgcrypto` (bcrypt), `uuid-ossp`, `pg_stat_statements`, `supabase_vault`.

### Realtime (publicación `supabase_realtime`)
`members` (REPLICA IDENTITY FULL), `purchases` (INSERT dispara el modal de
calificación; SELECT abierto solo 15 min y columnas mínimas), `redemptions`
(flujo de confirmación), `operator_ratings`, `notifications`.

### Triggers relevantes
- `members_guard_points_write` — ninguna escritura directa de puntos fuera de RPCs.
- `purchases_auto_vehicle` / `purchases_stamp_fuel` — asigna la compra al vehículo principal y sella `last_fuel_at`.
- `trg_vehicles_mirror` / `trg_members_sync_vehicles` — la tabla `vehicles` es la verdad; `members.vehicles`/`plate` son espejo; los escritores legados del jsonb se reconcilian por placa (solo se borran filas legadas sin marca/modelo/telemetría).
- `update_updated_at_column`, `rls_auto_enable`.

### RPCs (125) — familias
- **Sesión:** `authenticate_member` / `create_member_session_oauth` / `issue_member_session` / `set_member_password_oauth`, `authenticate_operator`, `authenticate_admin`, `validate_session_token`, `revoke_*_session`.
- **Socio:** `register_member`, `get_my_member`, `update_my_profile`, `update_member_password`, `delete_my_account`, `check_member_exists`, `get_my_redemptions`, `get_my_notifications` / `mark_my_notifications_read` / `clear_my_notifications`, `save_push_subscription`, `rate_operator`, `complete_survey` / `count_my_surveys_today`, `buy_raffle_tickets`, `mark_raffle_winner_seen`, `list_activity`, `list_raffle_participants`, `respond_redemption_confirm`, `redeem_reward`, `get_my_features` (secciones en beta; fail closed).
- **Vehículos:** `list_my_vehicles`, `save_my_vehicle`, `delete_my_vehicle`, `assign_purchase_vehicle`, `list_my_vehicle_stats` (única fuente de las ventanas: `windows[]`, `anchors[]`, `trend_pct`, `km_per_gal_method`), `list_my_fuel_history`, `list_my_vehicle_events`, `add_my_fuel_log` / `delete_my_fuel_log`, `set_my_fuel_load_state` / `set_my_fuel_load_gap`, `confirm_my_vehicle_service`, `list_vehicle_service_alerts` (service_role). Helper `assert_vehicle_km` (REVOKE; km monótonos + tope por dedazo).
- **Operador:** `register_purchase` → `register_purchase_core` (compartido con la API), `resolve_card`, `list_operator_purchases`, `list_member_pending_redemptions`, `get_redemption_by_code`, `get_redemption_status`, `list_operator_redemptions`, `operator_set_redemption_confirm`, `deliver_redemption`, `log_print`, `get_member_full`, `list_members_full`, `list_member_stations`.
- **Admin:** `create_operator` / `update_operator_password` / `update_operator_profile` / `toggle_operator_active` / `list_operators_full`, `list_admins` / `create_admin` / `update_admin_password` / `toggle_admin_active`, `update_member_with_audit`, `modify_member_points`, `admin_reset_member_password`, `admin_write_catalog` (rewards, promotions, special_days, raffle_calendar, stations, partner_stores), `manage_promo_rule` / `preview_promo` / `pick_best_promo`, `set_loyalty_config`, `set_degradation_enabled`, `set_company_info`, `set_support_phone`, `update_fuel_prices`, `set_fuel_prices_mode` / `update_station_fuel_prices` (+ `fuel_price_for`), `set_fuel_prices_auto`, `set_service_alerts_config`, `admin_list_feature_beta` / `admin_set_feature_beta` (secciones en beta), `list_api_clients` / `toggle_api_client_active` (llaves de la API), `get_admin_kpis` (combustible, estaciones y canjes reales), `get_dash_monthly`, `get_station_top_members`, `get_admin_audit_log`, `log_admin_action`, `report_*` (canjes, consumo_segmentos, operadores, promos, rifas, integridad_*).
- **Motores:** `apply_due_degradations` (perezoso al abrir la app; APAGADO), `list_degradation_alerts` (cron), `draw_due_raffles` (sorteo automático al cierre del mes), `grant_special_day_bonus`.
- **API pública (PROPER):** `api_authenticate`, `api_create_client`, `api_resolve_member`, `api_resolve_station`, `api_upsert_operator`, `api_register_purchase`, `api_redemption_confirm`, `api_list_pending_redemptions`, `api_get_redemption`, `api_log_request`, `api_replay`, `api_merge_mirror_operator` (v1.4, fusión por DPI), `api_observe_fuel_price` (23-sep). Todas REVOCADAS a anon/authenticated salvo `api_create_client`.
- **Guardas (REVOKE a anon):** `feature_enabled_for`, `rate_limit_allow` + `request_client_ip`, `validate_session_token`.

---

## 6. Endpoints serverless (Vercel)

| Ruta | Uso | Auth |
|---|---|---|
| `GET /api/v1/stations`, `GET /api/v1/members`, `POST /api/v1/purchases`, `GET/POST /api/v1/redemptions` | API REST para el POS de PROPER (`docs/API-PROPER.md`) | API key bcrypt (`api_clients`), scopes |
| `POST /api/send-push` | push directo a socios (compra manual del operador, avisos) | sesión de operador/admin |
| `POST /api/log-notification` | el SW registra el push que sí mostró | id de notificación |
| `POST /api/upload-avatar`, `POST /api/upload-promo-image` | subida a Storage (service role) | sesión socio / admin |
| `POST /api/verify-phone` | OTP Twilio al registrarse (interruptor `phone_verification`) | — |
| `POST /api/webauthn` | registro y login con passkey | challenge en `webauthn_challenges` |
| `GET /api/degradation-alerts` | cron diario 09:00 GT (`0 15 * * *` UTC) | `Bearer CRON_SECRET` |
| `GET /api/vehicle-service-alerts` | cron diario 09:10 GT (`10 15 * * *` UTC) | `Bearer CRON_SECRET` |

---

## 7. Variables de entorno (Vercel)

```
VITE_SUPABASE_URL           # cliente y funciones
VITE_SUPABASE_ANON_KEY      # cliente
SUPABASE_SERVICE_KEY        # SOLO funciones api/ (nunca al navegador)
VITE_VAPID_PUBLIC_KEY       # suscripción push en el cliente
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   # web-push server-side
CRON_SECRET                 # autoriza los dos crons
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID   # OTP (pendiente contratar)
```

Local: `.env` con las tres `VITE_*`. Las migraciones NO se aplican por CLI:
se ejecutan a mano en el SQL Editor de Supabase (regla de CLAUDE.md §9).

---

## 8. Funcionalidad vigente por vista

### Socio (PWA, modo claro/oscuro por `ctx.dark`; identidad visual por nivel)
- Splash con monedas 3D; login Google / teléfono+contraseña / passkey; registro con wizard (dirección, vehículos, OTP opcional).
- Inicio en bento: tarjeta de nivel (progreso en galones), Promociones (carrusel), Vehículo (arte del principal), WiFi (PLATINO/BLACK), Encuesta de Satisfacción, Ubicación (mapa + Waze/Maps), Historial de canjes, Historial de compras; campana con inbox de notificaciones; canal de asistencia (WhatsApp).
- QR dinámico con prefijo por tier; modal de calificación del operador por compra (Realtime) con selector de vehículo y odómetro; encuestas Shell (5/día, espera oculta de 75 s, resultado persistente).
- Canjes con confirmación en dos pasos y comprobante QR; rifa mensual con carrusel de meses (arrastre) y compra de boletos (**en BETA CONTROLADA desde el 16-oct**: PRÓXIMAMENTE salvo probadores; `buy_raffle_tickets` rechaza a quien no la tiene); historial con una fila de períodos (Todo · años · Hoy · meses) y filtro de tipo en un icono de embudo. Historial, Canjes y Rifa son contenedores fijos al viewport: título y filtros quedan quietos y solo se desplazan las filas, los premios o los participantes.
- Vehículos (F6; para todos del 4-sep al 16-oct, **desde entonces en BETA CONTROLADA**): carrusel de artes con arrastre (53 modelos), ficha (kilómetros recorridos, aceite, próximo servicio por fecha/km, tanque, combustible habitual), telemetría (km/gal DE LLENO A LLENO y de RESERVA A RESERVA — pregunta única "¿Cómo fue la carga?": Tanque lleno / Llegué en reserva / Carga parcial, en el modal de calificación y en el registro manual; inferencia de lleno ≥85 % del tanque; ventanas <10 km arrastran sus galones; carga sin registrar reinicia la medición; km monótonos con tope por dedazo; plausibilidad por tipo y mediana; tramos APROXIMADOS de 8+ cargas para quien nunca llena — E3h/E3i, 15/16-oct; el servidor `list_my_vehicle_stats` es la única fuente y `src/lib/fuelEconomy.js` el respaldo —, km/día, costo por km con el último precio pagado, gráficas), consumos manuales al momento, historial DEL VEHÍCULO (cargas + movimientos — `vehicle_events`) con reasignación y corrección del estado de la carga, confirmación de servicio desde el push, silencio de recordatorios por vehículo, zona de riesgo para eliminar.
- Menú: cuenta (avatar, teléfono con OTP, contraseña, eliminar cuenta), información, términos, modo claro/oscuro.

### Operador
- Login (usuario + contraseña; bcrypt server-side). Panel con ventas del día, rating en vivo (Realtime), estación de la última venta.
- Registrar compra: escáner QR (`resolve_card`), galones reales, promociones aplicadas por el motor, push de calificación al socio.
- Canjes: por código, confirmación al socio (Realtime), entrega atómica con comprobante e impresión térmica (`window.print`, `print_logs`). Rifa: venta de boletos.
- Con PROPER activo el colaborador NO usa esta vista: el POS llama a la API y la estación viaja en cada factura.

- Tutorial interactivo (21-sep): 31 coach marks que recorren todas las pestañas (cada paso declara `screen`; los pasos sin elemento se saltan); aparece al crear la cuenta y al abrir sesión; reapertura desde Asistencia y ayuda (`components/tour/`, anclas `data-tour`). Validado por el dueño el 16-oct.

### Admin (shell lateral, desktop-first)
- Dashboard con KPIs reales (Q por combustible y por estación, puntos canjeados = suma de `points_spent`) y tops; Socios (ficha completa, ajustes de puntos auditados, reset de contraseña); Personal (operadores + admins); Catálogo de premios (localizaciones y tiendas asociadas); Promociones (cards con imagen) y Reglas de promoción (motor); Rifas; Estaciones (WiFi, horario, coordenadas, código PROPER); Días especiales.
- Configuración: identidad de la empresa, puntos por nivel y eventos, precios de combustible (globales o por estación, D4; interruptor "Adoptar precios de PROPER" con los últimos precios recibidos por factura, 23-sep, nace apagado), degradación (interruptor), soporte, alertas de servicio (umbrales D24), administradores, Secciones en beta (`FeatureBetaCard`: interruptor "para todos" por sección + probadores con vencimiento, 16-oct), API externa (lista de llaves con estado y uso; generar y desactivar/reactivar con motivo auditado, 21-sep), términos.
- Análisis: clientes, operadores, promociones, integridad (cuentas de personal, repetidos, afinidad). Auditoría (`admin_audit_log`) con filtros.

---

## 9. Reglas de negocio vigentes (resumen; el detalle manda en CLAUDE.md §1)

- **Puntos POR GALÓN (recalibración 19-sep-2026):** ORO 3.5 · PLATINO 4.0 · BLACK 4.5 pts/galón, `round(galones × tasa)` con el tier PREVIO a la compra; editable en Admin. El punto vale Q0.10 (10 pts = Q1) para todos los niveles. Eventos especiales: 25 / 35 / 50 pts.
- **Tiers por galones:** ORO 0–149 · PLATINO 150–499 · BLACK 500+. Card codes `CTOD-` / `CTPD-` / `CTBD-`.
- **Degradación por inactividad:** 15 días de gracia, caída progresiva desde el día 16, reinicio total a los 45 días de caer a ORO. Motor APAGADO hasta GO-LIVE (`program_config.degradation_enabled`).
- **Encuestas:** 5/día, espera 75 s oculta, la 5ª da boleto de rifa.
- **Descuento en canjes: ELIMINADO** (19-sep-2026) — lo reemplazan los premios con nivel mínimo (`rewards.min_tier`; el socio los ve bloqueados al final del catálogo). Descuentos por galón RETIRADOS.
- **Rifa:** sorteo automático al cierre del mes ponderado por boletos; multi-año.
- **PROPER (NIT):** socio con NIT → solo CF o su NIT; sin NIT → solo CF. El comprobante de premio se imprime SOLO al entregar.
- **Alertas de servicio (D24):** umbrales globales editables (default 7 días / 500 km; recordatorios de vencido cada 7 días por fecha y cada 14 por km); silencio por vehículo.
- **Tarjeta física:** deseo a futuro, no implementar sin pedido explícito.
- **Secciones en beta (16-oct-2026):** Vehículos y Rifa bloqueadas (PRÓXIMAMENTE) salvo probadores configurados por el admin; la decisión la toma siempre el servidor (`feature_enabled_for`); sin servidor, todo bloqueado. Rollout = interruptor "para todos".
- **Precios desde PROPER (23-sep-2026):** con `fuel_prices_auto` encendido (nace apagado), dos facturas seguidas iguales adoptan el precio (global o por estación); el precio nunca afecta los puntos de la API.
- **Telemetría de vehículos:** km monótonos (nunca retroceden; tope última + 1,500 km + 500 km/día), registros manuales al momento, "kilómetros recorridos" (nunca "odómetro"), el servidor es la única fuente de las ventanas de rendimiento.

---

## 10. Estaciones y encuestas

| Estación | Dirección | Coordenadas | Encuesta Shell |
|---|---|---|---|
| Turkaj I | 7a Av 6-10 Z1, Chichicastenango | 14.942641, -91.109861 | https://tellshell.shell.com/GTM?source=smartQR&s=10700531 |
| Turkaj II | 8a Av 12-43 Z1, Chichicastenango | 14.937885, -91.110859 | https://tellshell.shell.com/GTM?source=smartQR&s=10700717 |
| Turkaj III | Km 148, La Cruz, Chulumal I | 14.964534, -91.102676 | https://tellshell.shell.com/GTM?source=smartQR&s=10700211 |

Editables en Admin → Estaciones (tabla `stations`); las URLs de encuesta y el
WiFi por estación viven ahí.

---

## 11. Verificación visual y herramientas

- `tools/harness/`: páginas Vite (`home-tile`, `raffle`, `history`, `catalog`, `d24`, `d4`, `fuel` (+`?approx=1|2`), `tour` (`?step=N`), `rating`, `soon`) que montan
  componentes del cliente con datos simulados. Servidor:
  `npx vite --config tools/harness/vite.harness.config.js` (puerto 3100) y
  captura con Edge headless (`msedge --headless=new --screenshot=… --window-size=390,900 --virtual-time-budget=15000 <url>`).
- `tools/artes/`: pipeline de calco de las 53 artes de vehículos (motor de
  trazado `trace-mix` con flags `lightKeep`/`specialClasses`/`passes` para
  referencias planas, comparador ref-vs-arte, analizador de manchas,
  histórico). Ver su `README.md`.
- APK Android de prueba: GitHub Actions → workflow "APK Android (debug)" →
  artifact `puntos-plus-debug-apk`; carga la web viva (no hay que recompilar
  por cada deploy).

---

## 12. Pendiente (fuente: ROADMAP v4.6, 7-nov-2026)

- **Decisiones del dueño:** (1) Puntos Plus Business — traer el plan completo
  (se compara contra el doc v0.4b antes de construir) o arrancar B-E1 con
  `ptsPerGal` provisional — el 7-nov el dueño indicó que SIGUE en
  construcción, pendiente; (2) ~~Fernando Morales en la beta de Rifa~~ —
  resuelto 7-nov: se mantiene FUERA; (3) rollout de Vehículos y Rifa
  (interruptor "para todos"); (4) Sign in with Apple para la versión de App
  Store. Tarjeta física: proyecto a futuro que puede realizarse u omitirse
  (7-nov).
- **GO-LIVE (≈4-8 hs):** encender degradación (`set_degradation_enabled`),
  encender `phone_verification` (requiere Twilio), desactivar la llave API
  "Pruebas" (Admin → API externa), limpiar operadores espejo (PROPER 351,
  TEST-001, EMP-017) y socios "Cliente Prueba" cuando PROPER termine de
  probar, encender "Adoptar precios de PROPER" al operar en real,
  verificación general con factura real.
- **Deudas menores:** 6 socios con saldo ≠ libro mayor (legado de pruebas; el
  saldo manda); retirar `beta: true` de compatibilidad en `list_my_vehicles`;
  `OpRaffle` vende boletos a socios fuera de la beta de Rifa; verificar E3i
  con el primer socio que cierre un tramo; benchmark anónimo de rendimiento
  (a futuro); depurar reglas de permisos de Claude Code.
- **Gestiones del dueño:** PROPER (volumen estimado, paso a producción real),
  Twilio / WhatsApp Business, cuentas Google Play y Apple Developer (track
  TIENDAS en `docs/TIENDAS.md`).
- **F8 Puntos Plus Business:** diseño v0.4b (39 decisiones B1-B39, 186-259 hs
  en 7 etapas) en `docs/PUNTOS-PLUS-BUSINESS.md`; nada construido · F9
  reportería opcional.
