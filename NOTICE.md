# Avisos de terceros / Third-party notices

Este proyecto es un **derivado de [Excalidraw](https://github.com/excalidraw/excalidraw)**
(licencia MIT, Copyright (c) 2020 Excalidraw). No está afiliado ni respaldado por el
proyecto Excalidraw. "Excalidraw" es el nombre del proyecto original.

## Qué es de quién

| Parte | Origen | Licencia |
|---|---|---|
| `app/` (build compilado de la interfaz) | Excalidraw, con las modificaciones de `cambios-al-codigo.diff` | MIT (ver `LICENSE`) |
| `cambios-al-codigo.diff` | Modificaciones propias sobre el código fuente de Excalidraw | MIT |
| `servidor.js`, `Iniciar pizarra.bat`, `LEEME.txt` | Propio | MIT |
| `app/fonts/` | Fuentes incluidas en el build de Excalidraw | Ver abajo |
| `node_modules/` (no se versiona) | Dependencias npm (`socket.io` y sus dependencias) | MIT (cada paquete trae su `LICENSE`) |

## Excalidraw (MIT)

El aviso de copyright y de permiso de la licencia MIT debe acompañar todas las copias
o porciones sustanciales del software. Se cumple conservando el archivo `LICENSE`.
Texto original: <https://github.com/excalidraw/excalidraw/blob/master/LICENSE>

Las modificaciones se hicieron sobre el código fuente de Excalidraw; el parche exacto
está en `cambios-al-codigo.diff` (archivos `excalidraw-app/collab/Collab.tsx`,
`excalidraw-app/data/firebase.ts`, `excalidraw-app/vite.config.mts`,
`packages/excalidraw/clients.ts`). El `app/` se generó compilando esa versión.

## Fuentes (`app/fonts/`)

Carpetas incluidas: CascadiaCode, ComicShanns, Excalifont, LiberationSans, Lilita,
Nunito, Virgil, Xiaolai (y `Assistant-Regular.woff2`, `Cascadia.woff2`, `Virgil.woff2`
en la raíz de `app/`).

Estas fuentes tienen sus propias licencias, en general SIL Open Font License 1.1
(OFL), que permite redistribuirlas junto con software siempre que se conserven sus
avisos de copyright y no se vendan por separado. Comic Shanns es MIT. Consulta la
licencia de cada fuente en el repositorio de Excalidraw
(`packages/excalidraw/fonts/`) o en su sitio de origen antes de redistribuir.

## Dependencias npm

`socket.io` (MIT) y sus dependencias transitivas. Se instalan con `npm install`;
cada paquete conserva su propia licencia dentro de `node_modules/`.
