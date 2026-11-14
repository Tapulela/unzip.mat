# Avisos de terceros / Third-party notices

Este proyecto es un **derivado de [Excalidraw](https://github.com/excalidraw/excalidraw)**
(licencia MIT, Copyright (c) 2020 Excalidraw). No está afiliado ni respaldado por el
proyecto Excalidraw. "Excalidraw", "Excalidraw+" y su logo son marcas del proyecto
original: la licencia MIT cubre el código, no la marca. Por eso unzip.mat usa
nombre e íconos propios, y `app/entorno.js` oculta el logo de la pantalla de
bienvenida y los enlaces a Excalidraw+ y a las redes del proyecto original.

## Qué es de quién

| Parte | Origen | Licencia |
|---|---|---|
| `app/` (build compilado de la interfaz) | Excalidraw, con las modificaciones de `cambios-al-codigo.diff` | MIT (ver `LICENSE`) |
| `cambios-al-codigo.diff` | Modificaciones propias sobre el código fuente de Excalidraw | MIT |
| `servidor.js`, `Iniciar pizarra.bat`, `LEEME.txt` | Propio | MIT |
| `app/fonts/` | Fuentes incluidas en el build de Excalidraw | Ver abajo |
| `build/armar-exe.mjs`, `.github/workflows/exe.yml` | Propio | MIT |
| `unzip.mat.exe` (Releases) | Node.js (MIT) + `servidor.js` y `socket.io` empaquetados + `app/` | Ver «Ejecutable de Windows» abajo |
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

Estas fuentes tienen sus propias licencias: SIL Open Font License 1.1 (OFL), que
permite redistribuirlas junto con software siempre que se conserven sus avisos de
copyright y no se vendan por separado; Comic Shanns es MIT. El texto de cada licencia
está junto a la fuente, en `app/fonts/<Fuente>/LICENSE.txt` (la de Assistant, cuyo
archivo está en la raíz de `app/`, en `app/fonts/Assistant/LICENSE.txt`;
`Cascadia.woff2` y `Virgil.woff2` de la raíz usan las de CascadiaCode y Virgil).

| Fuente | Licencia | Origen |
|---|---|---|
| Assistant | OFL 1.1 | Google Fonts |
| Cascadia Code | OFL 1.1 | Microsoft |
| Comic Shanns | MIT | Shannon Miwa |
| Excalifont | OFL 1.1 | Excalidraw / DizajnDesign |
| Liberation Sans | OFL 1.1 | Liberation Fonts |
| Lilita One | OFL 1.1 | Google Fonts |
| Nunito | OFL 1.1 | Google Fonts |
| Virgil | OFL 1.1 | Ellinor Rapp |
| Xiaolai | OFL 1.1 | LXGW (Kose Font) |

## Dependencias npm

`socket.io` (MIT) y sus dependencias transitivas. Se instalan con `npm install`;
cada paquete conserva su propia licencia dentro de `node_modules/`.

## Ejecutable de Windows (`unzip.mat.exe`)

Es una copia de `node.exe` (Node.js, licencia MIT, Copyright Node.js contributors;
incluye componentes de terceros como V8, OpenSSL, ICU y libuv, con licencias
permisivas listadas en <https://github.com/nodejs/node/blob/main/LICENSE>) con ícono
y datos de versión propios, a la que se le agregó `servidor.js` empaquetado con
`socket.io` y sus dependencias (MIT; esbuild conserva sus avisos de licencia al final
del código empaquetado) y la carpeta `app/` completa, con las licencias de las fuentes
indicadas arriba. Se distribuye junto con `LICENSE` y este archivo en el repositorio.
