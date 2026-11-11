# Pizarra local

Versión modificada de [Excalidraw](https://github.com/excalidraw/excalidraw) para
colaborar entre dos ventanas en la misma PC, sin internet ni servicios en la nube.

> Proyecto derivado, no afiliado a Excalidraw. Ver [NOTICE.md](NOTICE.md).

## Cambios respecto del original

- La colaboración usa un servidor local (`servidor.js`, Socket.IO) en vez del servidor de Excalidraw.
- No se guarda la escena en Firebase; las imágenes pegadas se guardan (cifradas) en memoria del servidor local.
- El service worker se autodestruye para no cachear versiones viejas.
- `?sinpuntero` en la URL oculta el puntero del colaborador (útil para grabar con OBS).
- Cámara remota (`app/camara.js`): la ventana marcada como proyección (botón agregado al
  final de la barra de herramientas, o `?proyeccion`) informa su vista por el servidor
  local, y las demás ventanas de la sala muestran un marco que la representa y permite
  moverla, hacer zoom y volver al 100%. Solo una proyección por sala. `?sincamara`
  desactiva todo.
  Requiere que el bundle exponga la API como `window.__pizarraAPI` (una línea agregada
  antes de `editorLifecycleEvents.emit("editor:mount", …)` en `App.tsx`).
- Generadores (`app/generadores.js`, prototipo): botón al final de la barra de
  herramientas que abre un panel para generar una recta real con intervalos
  (fracciones, π, √, ∞, uniones). Se inserta como elementos nativos agrupados
  (flecha, marcas, rayado, corchetes/paréntesis y textos), así que se sincroniza
  con la sala y se puede editar. Las opciones quedan en `customData` del grupo:
  al seleccionar la recta con el panel abierto, se regenera en vivo.

- Sin servicios externos: se quitó la analítica (Simple Analytics), el CDN de fuentes de Excalidraw, Google Fonts y la redirección a Excalidraw+. Estos cambios se hicieron directamente sobre `app/index.html` y `app/assets/*.css` (no están en el diff). La fuente de la interfaz (Assistant) usa solo el peso Regular local.

El detalle exacto del código fuente está en [`cambios-al-codigo.diff`](cambios-al-codigo.diff).

## Uso

Requiere [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm start
```

Abre <http://localhost:3000>. En Windows también sirve `Iniciar pizarra.bat`.
Instrucciones completas en [LEEME.txt](LEEME.txt).

## Estructura

- `app/` — build compilado de Excalidraw (con las modificaciones).
- `servidor.js` — servidor HTTP + Socket.IO.
- `nueva-sesion.js` — genera el link de una sesión compartida nueva (lo usa `Iniciar pizarra.bat`).
- `cambios-al-codigo.diff` — parche sobre el código fuente de Excalidraw.

## Licencia

MIT. Incluye el copyright original de Excalidraw; ver [LICENSE](LICENSE) y [NOTICE.md](NOTICE.md).
