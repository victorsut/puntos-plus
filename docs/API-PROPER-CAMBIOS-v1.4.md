# API Puntos Plus ⇄ PROPER — Novedades de la versión 1.4

**Fecha:** 19 de septiembre de 2026
**Aplica sobre:** documento de integración v1.3 (31 de julio de 2026)
**Emite:** Puntos Plus — Gasolineras Turkaj, Chichicastenango

Este documento contiene **únicamente lo que cambió** respecto a la v1.3, a
partir de sus respuestas a los apartados 10 y 11. El documento completo
(v1.4) sigue siendo la referencia general; acá está solo lo nuevo.

> **Todo es aditivo.** Ningún campo existente cambió de nombre, tipo ni
> significado, y ningún campo nuevo es obligatorio. Lo que ya tienen
> integrado **sigue funcionando sin tocarlo**; los cambios se adoptan cuando
> les resulte conveniente.

---

## 1. Resumen

| # | Cambio | Tipo | Qué debe hacer PROPER |
|---|---|---|---|
| 2.1 | `operator.dpi` — DPI del colaborador | Integración nueva | Enviar el DPI en `operator` (recomendado) |
| 2.2 | `reward_value` — valor monetario del premio | Integración nueva (solicitada por PROPER) | Leer el campo; tolerar `null` |
| 2.3 | `expires_at` — vencimiento del premio | Integración nueva | Opcional: mostrarlo; tolerar `null` |
| 3.1 | Códigos de estación configurados | Modificación | Enviar su código en `operator.station` |
| 3.2 | Varios combustibles en una factura | Criterio confirmado | Nada — se mantiene lo que ya hacen |
| 3.3 | Nombre real del colaborador | Modificación | Enviar el nombre real en `operator.name` |
| 3.4 | `total_amount` = total de la factura | Aclaración | Enviar el total con tienda cuando aplique |
| 4.1 | Error `expired` | Corrección | Manejar `422 expired` en canjes |
| 4.2 | Tarjetas no activas | Corrección | Nada — mismo error `member_not_found` |
| 4.3 | Códigos de ejemplo vs. códigos de prueba | Aclaración | Usar los códigos del apartado 8 |

---

## 2. Integraciones nuevas

### 2.1 `operator.dpi` — el DPI como identificador estable del colaborador

**Por qué.** Nos indicaron que el identificador interno del usuario puede
variar si al colaborador se le crea otro usuario en una sucursal distinta, y
propusieron el DPI como dato en común. Lo adoptamos.

**Qué cambia.** El objeto `operator` acepta un campo nuevo, **opcional**:

```json
"operator": {
  "external_id": "351",
  "name": "Juan Pérez",
  "dpi": "2990123450101",
  "station": "17261015-1"
}
```

Aplica en los dos lugares donde viaja `operator`:
`POST /v1/purchases` y `POST /v1/redemptions` (acción `deliver`).

**Cómo lo usamos.**

| Situación | Resultado |
|---|---|
| `external_id` ya conocido | Se usa ese colaborador (como hasta hoy). Si aún no teníamos su DPI, lo guardamos |
| `external_id` **nuevo** + DPI que ya conocemos | Se une al **mismo colaborador**: conserva su historial de atención y calificaciones |
| `external_id` nuevo + DPI desconocido (o sin DPI) | Se crea el colaborador, como hasta hoy |

**Reglas del campo.**

- 13 dígitos. Se acepta con espacios o guiones (`2990 12345 0101`): los
  quitamos de nuestro lado.
- Un DPI con otro largo **se ignora**: la compra o la entrega se procesa
  igual, solo que sin esa unión.
- `external_id` **sigue siendo obligatorio** — el DPI lo complementa, no lo
  reemplaza.
- El DPI **nunca** se devuelve en ninguna respuesta y en nuestra bitácora de
  llamadas se guarda enmascarado (solo los últimos 4 dígitos).

---

### 2.2 `reward_value` — valor monetario del premio

**Por qué.** Solicitaron que, al consultar un canje, el JSON incluya el valor
monetario al que equivale el premio.

**Qué cambia.** Todas las respuestas de `/v1/redemptions` incluyen ahora
`reward_value`, en **quetzales**:

| Llamada | Dónde aparece |
|---|---|
| `GET /v1/redemptions?code=TK-…` | En la raíz de la respuesta |
| `GET /v1/redemptions?card_code=CT…` | En cada elemento de `pending[]` |
| `POST /v1/redemptions` · `action: request` | En la raíz de la respuesta |
| `POST /v1/redemptions` · `action: deliver` | En la raíz (payload del comprobante) |

```json
{
  "ok": true,
  "redemption_id": "4b2c...",
  "code": "TK-54C5E8",
  "reward_name": "Vale Q10 Combustible",
  "category": "combustible",
  "reward_value": 10.00,
  "points_spent": 80,
  "member_name": "Cliente Prueba 1",
  "card_code": "CTOD-95176",
  "created_at": "2026-07-31T19:03:04.640Z",
  "expires_at": null,
  "delivered": false,
  "delivered_at": null,
  "confirm_status": "none"
}
```

**A tener en cuenta.**

- Tipo `number` con hasta 2 decimales, o **`null`**. Es `null` cuando el
  premio no tiene un valor monetario definido (por ejemplo, un artículo
  promocional): el POS debe tolerarlo y no asumir cero.
- Es el **valor del premio**, no un monto cobrado: los premios se pagan con
  puntos (`points_spent`) y el cliente no paga nada al recibirlos.
- El descuento de canje que tienen algunos niveles reduce los **puntos**
  gastados, no el valor del premio.
- Los premios obtenidos por promoción o por rifa (`points_spent: 0`) también
  traen su valor cuando está definido.

---

### 2.3 `expires_at` — fecha límite para reclamar el premio

Las dos consultas `GET /v1/redemptions` incluyen ahora `expires_at`:

- `null` → el premio **no vence** (el caso normal de los canjes).
- Fecha ISO 8601 UTC → fecha límite. Hoy solo la llevan los **premios de
  rifa**. Pasada esa fecha, `request` y `deliver` responden `422 expired`
  (ver 4.1).

Sirve para avisarle al colaborador **antes** de iniciar la entrega, en lugar
de descubrirlo con el error.

---

## 3. Modificaciones y criterios confirmados

### 3.1 Códigos de estación — ya configurados

Cargamos de nuestro lado los códigos que nos entregaron:

| `operator.station` | Estación en Puntos Plus |
|---|---|
| `17261015-1` | Turkaj I |
| `17261015-2` | Turkaj II |
| `105978272-3` | Turkaj III (Estación de Servicio La Cruz) |

En sus pruebas vimos que resolvieron la estación enviando nuestro
identificador interno (`03643c23-…`). **Eso sigue funcionando**, pero ya
pueden enviar directamente su propio código, que es lo previsto en el
contrato. Un código que no esté en esta tabla responde `422
unknown_station`; si abren una sucursal nueva, avísennos para agregarla.

### 3.2 Varios combustibles en una misma factura — se mantiene su criterio

Confirmado tal como lo tienen: `fuel_amount`, `gallons` y `total_amount` van
**sumados**, y en `fuel_type` el **primer combustible de la lista** (los
productos que no son combustible quedan fuera de `fuel_amount`). No
necesitamos un arreglo de líneas. Los puntos se calculan sobre `fuel_amount`,
así que no se ven afectados.

De nuestro lado, la instrucción a los colaboradores será emitir **una
factura por producto**, por lo que este caso debería ser excepcional.

### 3.3 Nombre real del colaborador

En las pruebas recibimos `operator.name = "PROPER"` para todas las compras.
En producción necesitamos el **nombre real** de quien atendió: es el que ve
el cliente en su notificación ("Atendido por Juan") y al calificar la
atención. Solo lo tomamos la primera vez que aparece el colaborador; después
respetamos el nombre que tengamos registrado.

### 3.4 `total_amount` es el total de la factura

En las pruebas `total_amount` llegó siempre igual a `fuel_amount`. El criterio
es:

- `fuel_amount` → suma de **combustibles** (base de los puntos). ✔ Ya lo envían así.
- `total_amount` → **total facturado**, incluyendo tienda, lubricantes, etc.

No afecta los puntos; solo lo guardamos para conciliar. Si la factura es
solo de combustible, ambos valores coinciden y está bien.

### 3.5 Combustible por bomba — cerrado

Entendido: el producto es general y el número de bomba es un parámetro
aparte. No lo necesitamos; `fuel_type` sigue siendo `super`, `regular` o
`diesel`.

---

## 4. Correcciones

### 4.1 Error `expired` — ahora documentado y con su código HTTP correcto

Un premio con plazo vencido ya era rechazado, pero el error no figuraba en
la tabla del apartado 6 y respondía con HTTP 400. Desde esta versión:

| HTTP | `error` | Cuándo | Campos extra |
|---|---|---|---|
| 422 | `expired` | `request` o `deliver` sobre un premio cuyo `expires_at` ya pasó | `expired_at` (ISO 8601) |

```json
{
  "error": "expired",
  "message": "El plazo para reclamar este premio venció el 15/09/2026",
  "expired_at": "2026-09-15T18:00:00.000Z"
}
```

`cancel` sí se acepta sobre un premio vencido (para cerrar una solicitud que
hubiera quedado abierta).

### 4.2 Tarjetas no activas — mismo comportamiento en todos los endpoints

Una tarjeta bloqueada o inactiva ya no identificaba al cliente en
`GET /v1/members`. Ahora el criterio es el mismo en `POST /v1/purchases` y en
`GET /v1/redemptions?card_code=`: responden `404 member_not_found`. **No hay
códigos de error nuevos.**

### 4.3 Códigos de ejemplo y parámetros de consulta

Dos observaciones de la bitácora de sus pruebas, por si ayudan:

- `TK-3F9A2C` y `CTOD-00042` son **ejemplos ilustrativos** del documento y no
  existen (responden 404). Los códigos reales de prueba son los del
  apartado 8: tarjetas `CTOD-95176` y `CTOD-93935`, y la lista viva de
  canjes se obtiene con `GET /v1/redemptions?card_code=CTOD-95176`.
- `GET /v1/members` y `GET /v1/redemptions` leen sus parámetros de la **query
  string** (`?card_code=…` o `?code=…`). Sin parámetro responden `400
  invalid_card_code` / `404 redemption_not_found`.

---

## 5. Pendientes

| Tema | Quién | Estado |
|---|---|---|
| **Volumen estimado** (transacciones por día y por estación) | PROPER | Pendiente — lo necesitamos para dimensionar límites de uso |
| **Acumulación posterior** (cliente sin tarjeta escaneada al facturar) | Puntos Plus | En definición. Hasta que les enviemos la regla, la acumulación se hace **únicamente al momento de la factura** |
| Modelo de llamada servidor ⇄ API | — | Confirmado: la llave vive solo en el servidor de PROPER |

---

## 6. Pruebas sugeridas para esta versión

- [ ] Compra con `operator.station = "17261015-1"` → `station: "Turkaj I"` en la respuesta
- [ ] Compra con `operator.station = "105978272-3"` → `station: "Turkaj III"`
- [ ] Dos compras con el **mismo** `operator.dpi` y `external_id` distintos → nos confirman y verificamos que quedaron en el mismo colaborador
- [ ] Compra con `operator.dpi` inválido (menos de 13 dígitos) → acredita normal
- [ ] `GET /v1/redemptions?code=…` → trae `reward_value` y `expires_at`
- [ ] `GET /v1/redemptions?card_code=…` → cada pendiente trae `reward_value` y `expires_at`
- [ ] Premio sin valor definido → `reward_value: null` sin romper el POS
- [ ] `deliver` → el comprobante incluye `reward_value`

La colección de Postman actualizada (`PuntosPlus-PROPER.postman_collection.json`,
v1.4) ya incluye `operator.dpi` y el código de estación en sus variables.
