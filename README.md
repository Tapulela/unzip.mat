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
  Un tercer generador, **Tabla de verdad**, arma tablas de verdad de expresiones
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
  **Plantillas** no se parametriza: se marcan definiciones fijas de
  uso frecuente (relaciones binarias: reflexiva, simétrica, transitiva,
  antisimétrica, arreflexiva, asimétrica, atransitiva; estructuras
  algebraicas: L.C.I., asociativa, neutro, inverso, conmutativa,
  distributiva; funciones: inyectiva, sobreyectiva, biyectiva, creciente,
  decreciente) y se insertan como texto, una debajo de otra, con el nombre a
  la izquierda y la fórmula alineada. La pertenencia a R se puede escribir
  `(x, y) ∈ R` o `x R y`, y los dos operadores de las estructuras
  algebraicas se eligen (por defecto `*` y `+`).
  Todos los gráficos llevan un título (opción «Títulos», activada por
  defecto): «Tabla de verdad», «Circuito de interruptores», «Mapa de
  Karnaugh», «Circuito lógico», «Gráfico cartesiano», «Diagrama sagital»,
  «Grafo dirigido», «Recta real» y «Gráfico de funciones».
  Cada generador se define en el objeto `GEN` (contenido, opciones del panel y
  función de dibujo); el dibujo guarda en su primer elemento las opciones y su
  distancia al origen, para regenerarlo en el mismo lugar.

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
