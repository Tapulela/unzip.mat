**[Acceder a esta herramienta online aquí](https://tapulela.github.io/unzip.mat/)**

[![Descarga esta herramienta para poder usarla sin internet](https://img.shields.io/badge/Descarga_esta_herramienta_para_poder_usarla_sin_internet-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Tapulela/unzip.mat/releases/latest/download/unzip.mat.exe)

# unzip.mat

![unzip.mat](app/logo.svg)

Pizarra para clases de matemática. Versión modificada de [Excalidraw](https://github.com/excalidraw/excalidraw) para
colaborar entre dos ventanas en la misma PC, sin internet ni servicios en la nube.

> Proyecto derivado, no afiliado a Excalidraw. Ver [NOTICE.md](NOTICE.md).

## Cambios respecto del original

- La colaboración usa un servidor local (`servidor.js`, Socket.IO) en vez del servidor de Excalidraw.
- No se guarda la escena en Firebase; las imágenes pegadas se guardan (cifradas) en memoria del servidor local.
- El service worker se autodestruye para no cachear versiones viejas.
- Rutas relativas para poder publicarlo en una subcarpeta (GitHub Pages). Además del
  parche, se editó el build: `index.html` (rutas y `EXCALIDRAW_ASSET_PATH` calculado
  desde la URL), el registro de `sw.js` en `assets/index-*.js`, el `url()` de la
  fuente Assistant en `assets/index-*.css` y el helper de precarga en
  `assets/mermaid-to-excalidraw-*.js`. Si se recompila, hay que compilar con
  `base: "./"` y conservar estos cambios.
- `?sinpuntero` en la URL oculta el puntero del colaborador (útil para grabar con OBS).
- Compresión de PNG (`app/compresion.js`): al exportar como PNG o copiar como PNG, la
  imagen se guarda con paleta de colores (PNG indexado). Como pngquant / iLoveIMG, se usa
  la paleta más chica (desde 4 colores) cuyo error medio no pase `RMSE_OBJETIVO`, sin
  que ningún color visible cambie más de `ERROR_COLOR_MAX`. Si ni con 256 colores
  alcanza (por ejemplo, con fotos pegadas), se usa el PNG original. Se activa o
  desactiva en menú principal → Preferencias → «Comprimir imágenes PNG» (activada por
  defecto). Requiere dos cambios en el build (`assets/index-*.js`): en la exportación
  a PNG y a portapapeles, `u5(d)` pasa a ser
  `window.__pizarraPng?window.__pizarraPng(d,u5):u5(d)`, y el interruptor se agrega
  como otro `OPS` en el submenú Preferencias.
  Como el navegador vuelve a codificar lo que copia al portapapeles (y se pierde la
  compresión), con el servidor local en Windows «Copiar como PNG» manda el PNG comprimido
  a `servidor.js` (`POST /portapapeles`), que lo guarda en `%TEMP%\unzip.mat` (se borra a
  las 24 h) y con PowerShell lo pone en el portapapeles a la vez como archivo, como
  formato `PNG` (los bytes comprimidos) y como imagen común (sobre fondo blanco). Para eso
  la rama de portapapeles del build empieza con
  `if(window.__pizarraCopiarPng&&await window.__pizarraCopiarPng(d,u5))return;`. Si el
  servidor no responde, o en la versión online, se copia como siempre.
- Comprimir las imágenes del archivo (menú principal → «Comprimir imágenes», también en
  `app/compresion.js`): comprime las imágenes pegadas en la pizarra (las seleccionadas,
  o todas si no hay ninguna seleccionada). Si una imagen se muestra a menos de la mitad
  de su tamaño real (y no está recortada), se achica al doble de lo que se ve; después
  se prueba el PNG con paleta y, si no alcanza (fotos), JPEG (o WebP si tiene
  transparencia) con calidad 0,85. Solo se reemplaza si queda al menos un 10 % más
  chica. La imagen nueva entra como archivo nuevo y se sincroniza con la sala; Ctrl+Z
  la deshace. Requiere un ítem en el menú principal del build (`assets/index-*.js`),
  después de `Bt.DefaultItems.SaveAsImage`, que llama a
  `window.__pizarraComprimirImagenes()`.
- Al pegar, arrastrar o insertar una imagen (PNG, JPEG, WebP o BMP), se achica a 1440 px
  de lado como máximo (lo mismo que ya hacía Excalidraw) y se comprime igual que arriba,
  antes de calcular su id; si no queda al menos un 10 % más chica, se usa la original.
  Se activa o desactiva en Preferencias → «Comprimir imágenes al pegar» (activada por
  defecto). Cambios en el build (`assets/index-*.js`): al empezar `initializeImage`, antes
  de `const s=i.type`, se agrega
  `window.__pizarraComprimirAlPegar&&(i=await window.__pizarraComprimirAlPegar(i));`, y
  el interruptor es otro `OPS` en el submenú Preferencias.
- Opciones de la imagen seleccionada (`app/imagenes.js`): al seleccionar una imagen (o
  varias copias de la misma) aparece una barra debajo de la selección con «Ver copias»
  (une con líneas punteadas todas las copias, es decir los elementos que usan el mismo
  archivo; las líneas se dibujan en una capa encima del lienzo y no se guardan ni se
  sincronizan), «Información» (peso del archivo, cuánto ocupa en el archivo guardado,
  tamaño original, copias) y «Comprimir» (comprime el archivo y pasa todas sus copias
  al comprimido, con `window.__pizarraComprimirArchivo(fileId)` de `compresion.js`;
  Ctrl+Z lo deshace). La barra se esconde mientras se arrastra, se recorta o se cambia
  el tamaño. No requiere cambios en el bundle, solo el `<script>` en `index.html`.
- Cámara remota (`app/camara.js`): la ventana marcada como proyección (botón agregado al
  final de la barra de herramientas, o `?proyeccion`) informa su vista por el servidor
  local, y las demás ventanas de la sala muestran un marco que la representa y permite
  moverla, hacer zoom y volver al 100%. Solo una proyección por sala. `?sincamara`
  desactiva todo.
  Requiere que el bundle exponga la API como `window.__pizarraAPI` (una línea agregada
  antes de `editorLifecycleEvents.emit("editor:mount", …)` en `App.tsx`).
- Generadores (`app/generadores.js`, prototipo): botón al final de la barra de
  herramientas que abre un menú desplegable (con las clases del menú «Más
  herramientas», así hereda el estilo y el tema) con un ítem por generador,
  ordenados en secciones con la unidad del programa de la materia
  (`MENU_ORDEN`): Plantillas suelta; «Lógica proposicional (Unidad 1)»
  (Tablas de verdad, Simplificación paso a paso, Razonamiento deductivo); «Teoría de conjuntos (Unidad 2)» (Conjuntos, Relaciones
  binarias, Estructuras algebraicas, Simplificación paso a paso); «Álgebra de
  Boole (Unidad 3)» (Funciones booleanas, Simplificación paso a paso); «Sistemas numéricos (Unidad 5)» (Recta real, Combinatoria, MCM y
  MCD, Expresiones con valor absoluto, Factorización de polinomios, Inecuaciones de segundo grado, Inecuaciones racionales); «Funciones (Unidad 6)» (Gráfico de funciones) y «Números complejos
  (Unidad 7)» (Formas y operaciones, Raíces n-ésimas). Al elegir uno se abre el panel
  con ese generador. Uno de ellos genera una recta real con intervalos (fracciones, π, √, ∞, uniones). Se inserta como elementos nativos agrupados
  (flecha, marcas, rayado, corchetes/paréntesis y textos), así que se sincroniza
  con la sala y se puede editar. Las opciones quedan en `customData` del grupo:
  al seleccionar la recta con el panel abierto, se regenera en vivo.
  Los elementos se crean en orden de "dibujo" (útil para animar la escena, por
  ejemplo con excalidraw-animate): recta y graduación (más el marco de la
  referencia); luego, por cada conjunto, su línea en la referencia y, por cada
  intervalo, sus extremos escritos y el intervalo (signo izquierdo, rayado de
  izquierda a derecha, signo derecho); por último la operación y su resultado.
  La recta tiene un estilo alternativo, "Líneas": cada conjunto es una línea
  horizontal de su color por encima de la recta (una altura por conjunto), con
  puntos llenos/vacíos en los extremos y flecha hacia ∞.
  El mismo panel tiene un segundo generador, **Funciones**: cada fila es una
  función anónima de JavaScript (`x => x**2 - 3`, con `Math` disponible sin
  prefijo) que se grafica sobre ejes cartesianos con cuadrícula, dominio y rango
  configurables. Las curvas son elementos `line` (muestreo + Douglas-Peucker) que
  se cortan en asíntotas, saltos y puntos no definidos. Cada función puede
  tener un dominio propio (desigualdad o intervalos) donde se grafica, con los
  extremos marcados como punto lleno (incluido) o vacío (excluido). También puede
  tener valores de x a marcar: antes de su curva se dibujan, por cada valor,
  líneas de trazos grises desde los ejes y una cruz del color de la función en
  (x, f(x)), simulando el graficado manual con tabla de valores. El código de las
  funciones se ejecuta en la página y viaja dentro del dibujo (`customData`) a
  las otras ventanas de la sala.
  Un tercer generador, **Lógica proposicional**, arma tablas de verdad de expresiones
  de lógica proposicional: se elige la cantidad de variables (1 a 5) y sus
  nombres, y cada fila es una expresión (¬ ∧ ∨ ⊻ → ↔, con equivalentes en ASCII
  como `~ & | -> <->`). Agrega columnas intermedias en el orden en que se
  resuelve, puede clasificar cada expresión (tautología, contradicción,
  contingencia) o dejar vacías las columnas calculadas para completar.
  También simplifica cada expresión (Quine-McCluskey sobre la tabla: forma
  normal disyuntiva o conjuntiva mínima) y dibuja su circuito de
  interruptores (∧ en serie, ∨ en paralelo; →, ↔, ⊻ y las negaciones de
  expresiones compuestas se reescriben antes, con De Morgan), con interruptores
  abiertos/cerrados o con espacios en blanco con la variable escrita.
  **Álgebra de Boole** usa las mismas variables en notación de Boole
  (`AB + A'C`, `⊕`, `⊙`) o por índices (`m(1, 3, 5)`, `M(0, 2)`): tabla de
  verdad, formas canónicas Σm y ΠM, mapa de Karnaugh (hasta 4 variables,
  agrupando unos o ceros, con los grupos de colores, partidos si dan la vuelta)
  y la simplificada. Dibuja el circuito lógico de la expresión escrita y/o de
  la simplificada con una sola entrada por variable: una línea vertical por
  variable (y por su negada, que sale de un NOT), puntos en las bifurcaciones
  y saltos donde dos cables se cruzan sin unirse.
  El cuarto, **Conjuntos**, hace cálculos de teoría de conjuntos sobre un
  universo finito (por extensión) o ℕ, ℤ, ℚ, ℝ. Cada fila es un conjunto por
  extensión (`{1, 2, ..., 10}`), por comprensión (una función de JavaScript
  que recibe cada elemento de U y devuelve verdadero o falso, `x => x % 2 == 0`;
  los conjuntos de filas anteriores se usan como funciones: `x => A(x) && !B(x)`)
  o una operación con las filas anteriores (∪ ∩ − Δ, complemento `A'`, ×,
  `P(A)`, paréntesis). Cada conjunto se escribe por extensión con un límite de
  elementos y puntos suspensivos; los universos infinitos se recorren en orden
  (ℚ por altura |p| + q, hasta 20000 elementos), y en ℝ los conjuntos que no
  se pueden listar se escriben por comprensión.
  El quinto, **Relaciones**, define conjuntos finitos y relaciones binarias
  `R ⊆ A × B` por extensión (`{(1, a), (2, b)}`) o por comprensión
  (`(x, y) => x < y`, pudiendo usar conjuntos `A(x)` y relaciones `R(x, y)` de
  filas anteriores). Cada relación se dibuja como gráfico cartesiano, diagrama
  sagital y grafo dirigido (con lazos y flechas curvas si están los dos
  sentidos); opcionalmente escribe dominio, imagen y propiedades (reflexiva,
  simétrica, antisimétrica, transitiva, con contraejemplos).
  **Estructuras** define operaciones binarias por fila (`x * y = x + y - 3`,
  con el conjunto en «en»; el símbolo es lo que está entre las dos variables)
  y desarrolla ley de composición interna, asociatividad, conmutatividad,
  neutro, inverso y la distributividad de la primera sobre la segunda: título,
  definición general, la expresión original (sin cuantificadores) y los
  reemplazos con la definición, sin resolver. En
  cada paso se reemplazan todas las operaciones de más adentro (operandos
  compuestos entre paréntesis), hasta que no queda ninguna.
  **Combinatoria** resuelve un cálculo por fila (`6 V 2`, `6 C 2`, `P 5`,
  `3 VR 2`, `4 CR 2`, `PR 6; 3, 2`): nombre, fórmula general, reemplazo con
  factoriales y resolución paso a paso, simplificando
  (`6 · 5 · 4! / 4!`, tachando lo que se cancela) o desarrollando los
  factoriales completos; fracciones con barra o en una línea, pasos uno
  debajo de otro o en un renglón (cálculos exactos con BigInt, hasta 30!).
  **MCM y MCD** toma una lista de números por fila (`12, 18, 30`), los
  descompone en factores primos con la tabla de divisiones sucesivas, escribe
  cada factorización y calcula el MCD (comunes con el menor exponente) y el
  MCM (comunes y no comunes con el mayor exponente).
  **Números complejos** define un número por fila en forma binómica
  (`3 + 4i`), par ordenado (`(3, 4)`), polar (`[5; 53,13°]`, `5∠30°`) o
  trigonométrica (`5(cos 30° + i sen 30°)`), u operaciones entre filas
  (`z₁ · z₂`). Escribe el pasaje a las formas elegidas paso a paso (módulo con
  `√(a² + b²)`, argumento con `arctg(b/a)` y el ajuste según el cuadrante,
  `a = ρ · cos φ`...) y las operaciones en forma binómica (distributiva,
  conjugado) y/o polar. Opcionalmente grafica el plano complejo: cada número
  como vector desde el origen, el arco de su argumento φ (con la lista de
  ángulos debajo, y φ₃ = φ₁ ± φ₂ en productos y cocientes) y el paralelogramo
  de sumas y restas.
  **Simplificación paso a paso** (en Lógica proposicional, Teoría de conjuntos
  y Álgebra de Boole, cada una con su notación) usa un mismo motor de leyes:
  definiciones (→, ↔, ⊕, −, Δ), doble negación, De Morgan, dominación,
  identidad, idempotencia, complemento, absorción, factor común, consenso y
  distributiva, en ese orden de preferencia. Cada renglón es la expresión
  actual con la ley que se le aplica a la derecha, en un color; en el renglón
  siguiente, lo que cambió va en ese color (el motor marca el subárbol que
  reemplaza cada ley y la escritura sale en tramos marcados o no). Nombres de
  las leyes: «Ley de De Morgan», «Ley de involución», «Inversa distributiva
  (factor común)», «Ley de complemento», «Ley de identidad», etc. Cada paso se verifica con la tabla de verdad. Aclara que es solo un
  ejemplo y que puede haber simplificaciones más cortas. El consenso se aplica
  solo si acorta (quita un término o agrega uno que absorbe a otro) y se
  escribe en un paso o desarrollado con leyes básicas (identidad,
  complemento, distributiva, absorción); eso se elige en «Configuración
  avanzada», una sección plegable del panel (`ui.avanzado`).
  **Plantillas** no se parametriza: se marcan definiciones fijas de
  uso frecuente (relaciones binarias: reflexiva, simétrica, transitiva,
  antisimétrica, arreflexiva, asimétrica, atransitiva; estructuras
  algebraicas: L.C.I., asociativa, neutro, inverso, conmutativa,
  distributiva; funciones: inyectiva, sobreyectiva, biyectiva, creciente,
  decreciente, las que nombran A o B como doble implicación
  `f: A → B es ... ↔ ...`; sucesiones aritméticas y geométricas: definición,
  término general, término n conociendo aₖ, suma de los n primeros, distancia
  y razón (una fórmula escrita como `r = √[n−1](aₙ / a₁)` se dibuja con la
  raíz como línea, el índice como texto aparte y el radicando como fracción);
  combinatoria: las fórmulas de permutaciones, variaciones y
  combinaciones, simples y con repetición) y se insertan como texto, una debajo de otra, con el nombre a
  la izquierda y la fórmula alineada. La pertenencia a R se puede escribir
  `(x, y) ∈ R` o `x R y`, y los dos operadores de las estructuras
  algebraicas se eligen (por defecto `*` y `+`); las de combinatoria con
  repetición se escriben `VR` o `V'`.
  Todos los gráficos llevan un título (opción «Títulos», activada por
  defecto): «Tabla de verdad», «Circuito de interruptores», «Mapa de
  Karnaugh», «Circuito lógico», «Gráfico cartesiano», «Diagrama sagital»,
  «Grafo dirigido», «Recta real» y «Gráfico de funciones». Los circuitos de
  la expresión simplificada lo aclaran: «Circuito de interruptores
  (simplificado)», «Circuito lógico (simplificado)».
  Cada generador se define en el objeto `GEN` (contenido, opciones del panel y
  función de dibujo); el dibujo guarda en su primer elemento las opciones y su
  distancia al origen, para regenerarlo en el mismo lugar.

- Hojas A4 (`app/hojas.js`), para armar material que se va a imprimir (por ejemplo,
  solucionarios): en el menú de Generadores, sección «Impresión» → «Hojas A4». «Agregar
  hoja» crea un marco (frame) nativo con proporción A4 (vertical o apaisada) llamado «Hoja N», a la
  derecha de la última (la primera, en el centro de la vista sin taparse con lo que ya
  hay). Escala: al 100 % la hoja mide una A4 a 96 ppp (794 × 1123) y el texto M sale de
  unos 15 pt; al 80 % (predeterminada) mide 1,25 veces más y el texto M sale de unos
  12 pt. Los márgenes (arriba, abajo, lomo y afuera, en mm; predeterminados 20, 20, 25
  y 15) y el doble faz (el lomo va a la izquierda en las hojas impares y a la derecha
  en las pares) se guardan en `customData.pizarraHoja` de cada marco, así los ve toda
  la sala. Las guías de los márgenes no son elementos: se dibujan en una capa encima
  del lienzo, así que no se mueven ni se imprimen. Lo que toca una hoja y se sale del
  área útil se marca en rojo y el panel lo lista («Ver» lo selecciona). «Aplicar a
  todas» pasa la escala, los márgenes y el doble faz del panel a las hojas existentes;
  «Renumerar» las numera por su lugar (por filas, de arriba abajo y de izquierda a
  derecha). «Imprimir / PDF» exporta cada hoja como SVG con la exportación de
  Excalidraw (recortada al marco, en tema claro, con fuentes e imágenes incrustadas;
  entran los elementos que tocan la hoja y no están en otro marco, aunque no estén
  enganchados al marco), las arma en un iframe con `@page` A4 sin márgenes (una página
  por hoja, opcionalmente numerada) y abre el diálogo de impresión, desde donde se
  imprime o se guarda como PDF (papel A4, márgenes «Ninguno», escala 100 %). El
  «Título» del panel es el nombre que propone el PDF. Requiere un cambio en el build
  (`assets/index-*.js`): `window.__pizarraAPI=this.api,` pasa a ser
  `window.__pizarraAPI=this.api,window.__pizarraSvg=xE,` (`xE` es la `exportToSvg`
  interna, la que usa «Exportar imagen» → SVG; el nombre cambia si se recompila). Los
  ids de cada SVG llevan un prefijo por página, porque los recortes de los marcos usan
  el id del marco y se pisarían entre hojas.
  Orientación: las hojas nuevas pueden ser apaisadas, y «Girar hoja» pasa las hojas
  seleccionadas de vertical a apaisada o al revés. Una hoja apaisada se imprime girada
  90° a la izquierda dentro de una página vertical, para encuadernarla con las demás: su
  borde de arriba va al lado izquierdo del papel (el lomo en las hojas impares) y sus
  márgenes se reparten según ese giro. Si el centro de la vista cae en una hoja, los
  generadores insertan el dibujo nuevo dentro de ella: al comienzo del área útil o 8 mm
  debajo de lo que ya tiene, enganchado a su marco (al redibujarlo sigue enganchado).
  «Repartir en hojas» corta lo seleccionado en renglones (lo que se superpone en
  vertical va junto; los grupos propios y el texto de sus contenedores no se separan),
  deja en su hoja lo que entra en el área útil y pasa el resto a las hojas siguientes,
  al comienzo de su área útil. Usa las hojas siguientes si están vacías; si no, inserta
  hojas nuevas después y corre a la derecha, con su contenido y renumeradas, las que
  siguen. El grupo común a toda la selección (un dibujo de los generadores) se parte en
  un grupo por hoja y deja de estar vinculado a su generador.
  Cabecera y pie de página: «Crear cabecera y pie» agrega dos marcos especiales
  («Cabecera» y «Pie de página», con `customData.pizarraBanda`) del ancho del área útil
  del papel y del alto elegido (predeterminados 15 y 12 mm), arriba de la Hoja 1. Se
  arman con un contenido inicial (el título y una línea; una línea y «Hoja {n} de {total}» centrado)
  y se dibujan con las herramientas de la pizarra. Se repiten en todas las hojas, salvo
  en la primera si está marcada «Sin cabecera ni pie en la primera hoja (portada)»: se
  descuentan del área útil (con 4 mm de separación), en la pizarra se ven como una imagen
  tenue en cada hoja (generada con la misma exportación a SVG, en segundo plano) y al
  imprimir se pegan en cada página. Siguen al papel: en una hoja apaisada quedan sobre su
  borde derecho, girados. En sus textos, `{n}` se reemplaza por el número de hoja,
  `{total}` por la cantidad de hojas y `{titulo}` por el título del panel. Con pie de
  página, el número centrado de «Numerar las páginas» no se agrega.
  El contenido sigue a su hoja: si una hoja (o la cabecera o el pie) se mueve sin su
  contenido, como al alinear o distribuir con Ctrl+Shift+flechas, lo enganchado a su
  marco y lo suelto cuyo centro estaba en ella se mueve lo mismo. Ese ajuste no queda
  como un paso aparte del historial: al deshacer, el contenido vuelve con la hoja.

- Los archivos `.excalidraw` (y la escena incrustada en PNG/SVG) se guardan sin los
  elementos borrados. Excalidraw los conserva marcados con `isDeleted` para el
  deshacer y la colaboración, pero en el archivo solo ocupan lugar (un archivo
  llegó a pesar 6 MB con 2400 elementos borrados). El filtro se aplica solo a la
  copia que se escribe, así que la escena en memoria y Ctrl+Z no cambian. Cambio
  en el build (`assets/index-*.js`), en `serializeAsJSON`: `elements:e` pasa a ser
  `elements:i==="local"?e.filter(x=>!x.isDeleted):e`.
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

### Ejecutable de Windows (`unzip.mat.exe`)

Un solo archivo (~110 MB) con Node, `servidor.js` y toda la carpeta `app/` adentro
([Node SEA](https://nodejs.org/api/single-executable-applications.html)): doble clic,
sin instalar nada y sin internet. Hace lo mismo que `Iniciar pizarra.bat` (sesión
nueva, link copiado, navegador abierto); si ya hay uno abierto, solo abre una sesión
nueva, y si el puerto 3000 está ocupado por otro programa prueba el siguiente.

- Armarlo a mano (Windows, Node 24+): `npm install` y `npm run exe` → `dist/unzip.mat.exe`
  y su SHA-256 (script: [`build/armar-exe.mjs`](build/armar-exe.mjs)).
- Publicarlo: al subir un tag `v*` (`git tag v1.2.0` y `git push github v1.2.0`), el
  workflow [`.github/workflows/exe.yml`](.github/workflows/exe.yml) lo arma en Windows
  y lo sube a un Release. La versión online muestra en el menú principal «Descargar
  para Windows (sin internet)», que apunta a `releases/latest/download/unzip.mat.exe`.
- No está firmado: Windows SmartScreen avisa la primera vez («Más información» →
  «Ejecutar de todas formas»).
- `servidor.js` sigue funcionando igual con `node servidor.js`; con `--abrir` además
  abre una sesión nueva como el ejecutable.

### Versión web (GitHub Pages)

La carpeta `app/` también funciona como sitio estático: el workflow
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) la publica en GitHub
Pages en cada push a `main` (en el repo: Settings → Pages → Source: «GitHub Actions»).
Las rutas son relativas, así que funciona en `usuario.github.io/nombre-del-repo/`.

Sin `servidor.js` no hay colaboración entre ventanas, cámara remota ni imágenes
compartidas: `app/entorno.js` define `window.PIZARRA_SIN_SERVIDOR = true` y oculta
esos botones. `servidor.js` sirve ese mismo archivo con la bandera en `false`.
Dibujar, guardar, exportar y todos los generadores funcionan igual.

## Estructura

- `app/` — build compilado de Excalidraw (con las modificaciones).
- `app/entorno.js` — detecta si hay servidor y oculta la marca y los enlaces de Excalidraw/Excalidraw+.
- `app/hojas.js` — hojas A4 con márgenes para preparar material imprimible.
- `servidor.js` — servidor HTTP + Socket.IO.
- `build/armar-exe.mjs` — arma `dist/unzip.mat.exe` (`npm run exe`).
- `nueva-sesion.js` — genera el link de una sesión compartida nueva (lo usa `Iniciar pizarra.bat`).
- `cambios-al-codigo.diff` — parche sobre el código fuente de Excalidraw.

## Licencia

MIT. Incluye el copyright original de Excalidraw; ver [LICENSE](LICENSE) y [NOTICE.md](NOTICE.md).
