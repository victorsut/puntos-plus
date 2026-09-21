# Novedades de la API Puntos Plus ⇄ PROPER

Un documento por versión del contrato, con **solo lo que cambió**
(integraciones nuevas, modificaciones y correcciones). Es lo que se envía a
PROPER cuando sale una versión nueva; el contrato completo sigue siendo
[`../API-PROPER.md`](../API-PROPER.md).

| Versión | Fecha | Documento | PDF (se envía a PROPER) | Página publicada |
|---|---|---|---|---|
| 1.4 | 19-sep-2026 | [`API-PROPER-CAMBIOS-v1.4.md`](./API-PROPER-CAMBIOS-v1.4.md) · [`html`](./api-proper-cambios-v1.4.html) | [`API-PROPER-Novedades-v1.4.pdf`](./API-PROPER-Novedades-v1.4.pdf) | https://claude.ai/artifact/34F7J47LJYMKWw9UThnrRT |

## Cómo agregar una versión

1. Redactar `API-PROPER-CAMBIOS-vX.Y.md` en esta carpeta (misma estructura
   que el anterior: resumen, integraciones nuevas, modificaciones,
   correcciones, pendientes y pruebas sugeridas).
2. Generar su versión web con la identidad del contrato y el PDF que se
   envía a PROPER: `node tools/docs/build-cambios.cjs X.Y` →
   `api-proper-cambios-vX.Y.html` + `API-PROPER-Novedades-vX.Y.pdf`
   (el PDF lo imprime Microsoft Edge en modo headless; `--no-pdf` lo omite).
3. Publicar el HTML, agregar la fila a la tabla de arriba y actualizar el
   historial de versiones al final de `../API-PROPER.md`.

Qué se le envía a PROPER en cada versión: el **PDF de novedades** (lo
principal), el contrato completo `../api-proper.html` y la colección
`../PuntosPlus-PROPER.postman_collection.json`.

Regla: todo cambio al contrato es **compatible** con lo que PROPER ya
integró (campos nuevos opcionales, nada se renombra ni cambia de tipo).
