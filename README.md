# Pizarra local

Versión modificada de [Excalidraw](https://github.com/excalidraw/excalidraw) para
colaborar entre dos ventanas en la misma PC, sin internet ni servicios en la nube.

> Proyecto derivado, no afiliado a Excalidraw. Ver [NOTICE.md](NOTICE.md).

## Cambios respecto del original

- La colaboración usa un servidor local (`servidor.js`, Socket.IO) en vez del servidor de Excalidraw.
- No se guarda la escena en Firebase; las imágenes pegadas se guardan (cifradas) en memoria del servidor local.
- El service worker se autodestruye para no cachear versiones viejas.
- `?sinpuntero` en la URL oculta el puntero del colaborador (útil para grabar con OBS).
- Cámara remota (`app/camara.js`): la ventana abierta con `?proyeccion` informa su vista
  por el servidor local, y las demás ventanas de la sala muestran un marco que la
  representa y permite moverla y hacer zoom. `?sincamara` desactiva el marco.
  Requiere que el bundle exponga la API como `window.__pizarraAPI` (una línea agregada
  antes de `editorLifecycleEvents.emit("editor:mount", …)` en `App.tsx`).

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
- `cambios-al-codigo.diff` — parche sobre el código fuente de Excalidraw.

## Licencia

MIT. Incluye el copyright original de Excalidraw; ver [LICENSE](LICENSE) y [NOTICE.md](NOTICE.md).
