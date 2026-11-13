// Generadores de dibujos matematicos (prototipo):
//  - Recta real con intervalos.
//  - Graficos de funciones de variable real, definidas como funciones anonimas
//    de JavaScript (x => x**2 - 3).
// Boton "Generadores" en la barra de herramientas: abre un menu desplegable
// (como el de «Más herramientas») con un item por generador; al elegir uno se
// abre el panel a la derecha con ese generador.
//  - Los dibujos se insertan en el centro de la vista como elementos nativos de
//    Excalidraw (agrupados, editables, se sincronizan con las otras ventanas de
//    la sala como cualquier dibujo).
//  - Si se selecciona un dibujo generado, el panel lo carga y los cambios se
//    aplican en vivo sobre el (manteniendo su posicion). Ctrl+Z deshace.
//  - Los tamanos de texto usan las unidades de Excalidraw: S, M, L, XL.
//  - Los elementos se crean en orden de "dibujo" (util para animar la escena).
// Usa window.__pizarraAPI (expuesta por el bundle).
(function () {
  function api() { return window.__pizarraAPI; }

  // ------------------------------------------------------------ constantes
  var TAMANOS = { S: 16, M: 20, L: 28, XL: 36 };
  // ids de fuente de Excalidraw y su interlineado (metricas del bundle)
  var FUENTES = {
    normal: { id: 6, css: "Nunito", lh: 1.25, nombre: "Normal" },
    mano: { id: 5, css: "Excalifont", lh: 1.25, nombre: "A mano" },
    codigo: { id: 3, css: "Cascadia", lh: 1.2, nombre: "Código" },
  };
  var COLORES = ["#1971c2", "#e03131", "#2f9e44", "#f08c00", "#9c36b5", "#0c8599"];
  var TINTA = "#1e1e1e";
  var GRIS = "#ced4da";  // cuadricula
  var GUIA = "#868e96";  // lineas de trazos de los puntos marcados

  function rnd() { return Math.floor(Math.random() * 2147483647); }
  function nuevoId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function copiar(o) { return JSON.parse(JSON.stringify(o)); }
  function colorFila(i) { return COLORES[i % COLORES.length]; }

  // -------------------------------------------------------------- numeros
  // Evalua un numero escrito: enteros, decimales, fracciones, π, √, potencias.
  // Ej: "1/2", "-3/2", "2π/3", "√2", "1+√2", "0,5", "-2pi".
  function evaluar(s) {
    s = String(s).replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/pi/gi, "π")
      .replace(/sqrt/gi, "√").replace(/,/g, ".").replace(/[·×]/g, "*");
    var i = 0;
    function expr() {
      var v = term();
      while (s[i] === "+" || s[i] === "-") { var op = s[i++], t = term(); v = op === "+" ? v + t : v - t; }
      return v;
    }
    function term() {
      var v = factor();
      for (;;) {
        var c = s[i];
        if (c === "*" || c === "/") { i++; var f = factor(); v = c === "/" ? v / f : v * f; }
        else if (c && /[\d.(π√]/.test(c)) v *= factor(); // multiplicacion implicita: 2π
        else return v;
      }
    }
    function factor() {
      if (s[i] === "-") { i++; return -factor(); }
      if (s[i] === "+") { i++; return factor(); }
      var b = atomo();
      if (s[i] === "^") { i++; return Math.pow(b, factor()); }
      return b;
    }
    function atomo() {
      var c = s[i];
      if (c === "(") { i++; var v = expr(); if (s[i++] !== ")") throw 0; return v; }
      if (c === "π") { i++; return Math.PI; }
      if (c === "√") { i++; return Math.sqrt(atomo()); }
      var m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!m) throw 0;
      i += m[0].length;
      return parseFloat(m[0]);
    }
    if (!s) return NaN;
    try { var v = expr(); return i === s.length && isFinite(v) ? v : NaN; } catch (e) { return NaN; }
  }

  function formatear(v) {
    if (Math.abs(v) < 1e-9) return "0";
    return String(Number(v.toFixed(6))).replace(".", ",").replace("-", "−");
  }

  function pasoLindo(rango, soloEnteros) {
    var crudo = rango / 10, p = Math.pow(10, Math.floor(Math.log10(crudo))), f = crudo / p;
    var paso = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
    return soloEnteros ? Math.max(1, Math.round(paso)) : paso;
  }
  // siguiente paso "lindo": 1 -> 2 -> 5 -> 10 -> 20...
  function pasoSiguiente(paso) {
    var p10 = Math.pow(10, Math.floor(Math.log10(paso) + 1e-9)), man = Math.round(paso / p10);
    return (man < 2 ? 2 : man < 5 ? 5 : 10) * p10;
  }

  // ------------------------------------------------- construccion de elementos
  var lienzo = document.createElement("canvas").getContext("2d");
  function medir(texto, tam, fuente) {
    lienzo.font = tam + "px " + fuente.css + ", sans-serif";
    return Math.ceil(lienzo.measureText(texto).width);
  }

  function base(tipo, p) {
    var ahora = Date.now();
    var e = {
      id: nuevoId(), type: tipo, x: 0, y: 0, width: 0, height: 0, angle: 0,
      strokeColor: TINTA, backgroundColor: "transparent", fillStyle: "solid",
      strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100,
      groupIds: [], frameId: null, index: null, roundness: null,
      seed: rnd(), version: 1, versionNonce: rnd(), isDeleted: false,
      boundElements: null, updated: ahora, created: ahora, link: null, locked: false,
    };
    for (var k in p) e[k] = p[k];
    return e;
  }

  function linea(x, y, puntos, p) {
    var xs = puntos.map(function (q) { return q[0]; }), ys = puntos.map(function (q) { return q[1]; });
    var props = {
      x: x, y: y, points: puntos,
      width: Math.max.apply(null, xs) - Math.min.apply(null, xs),
      height: Math.max.apply(null, ys) - Math.min.apply(null, ys),
      startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null,
    };
    for (var k in p) props[k] = p[k];
    var tipo = props.type || "line";
    delete props.type;
    if (tipo === "line") props.polygon = false;
    else props.elbowed = false;
    return base(tipo, props);
  }

  // linea a partir de puntos absolutos (el primero pasa a ser el origen)
  function trazo(abs, p) {
    var x0 = abs[0][0], y0 = abs[0][1];
    return linea(x0, y0, abs.map(function (q) { return [q[0] - x0, q[1] - y0]; }), p);
  }

  function texto(x, y, str, tam, fuente, color, alineacion) {
    var w = medir(str, tam, fuente);
    return base("text", {
      x: alineacion === "center" ? x - w / 2 : alineacion === "right" ? x - w : x,
      y: y, width: w, height: tam * fuente.lh,
      strokeColor: color, text: str, originalText: str, fontSize: tam, fontFamily: fuente.id,
      textAlign: alineacion || "left", verticalAlign: "top", containerId: null,
      autoResize: true, lineHeight: fuente.lh,
    });
  }

  // ------------------------------------------------------------ titulos
  // Cada grafico puede llevar un titulo ("Tabla de verdad", "Diagrama
  // sagital"...) arriba a la izquierda, un tamaño mas grande que su texto.
  function tamTitulo(tam) { return tam < 20 ? 20 : tam < 28 ? 28 : 36; }

  // Dibuja con `dibujar` (en cualquier lugar) y lo pone con su esquina superior
  // izquierda en (x, y), con el titulo encima si hay. Devuelve { w, h } del total.
  function colocarConTitulo(dibujar, x, y, titulo, tam, fuente, agregar) {
    var tmp = [];
    dibujar(function (e) { tmp.push(e); return e; });
    if (!tmp.length) return { w: 0, h: 0 };
    var dy = 0, wt = 0;
    if (titulo) {
      var ts = tamTitulo(tam);
      agregar(texto(x, y, titulo, ts, fuente, TINTA, "left"));
      dy = ts * fuente.lh + 12;
      wt = medir(titulo, ts, fuente);
    }
    var b = cajaDe(tmp);
    tmp.forEach(function (e) { e.x += x - b.x0; e.y += y + dy - b.y0; agregar(e); });
    return { w: Math.max(b.x1 - b.x0, wt), h: b.y1 - b.y0 + dy };
  }

  // Dibuja con `dibujar` donde corresponda y agrega antes un titulo encima de todo.
  function conTitulo(titulo, tam, fuente, agregar, dibujar) {
    if (!titulo) { dibujar(agregar); return; }
    var tmp = [];
    dibujar(function (e) { tmp.push(e); return e; });
    if (!tmp.length) return;
    var b = cajaDe(tmp), ts = tamTitulo(tam);
    agregar(texto(b.x0, b.y0 - ts * fuente.lh - 14, titulo, ts, fuente, TINTA, "left"));
    tmp.forEach(agregar);
  }

  // =================================================== GENERADOR: RECTA REAL
  var LARGOS = { corta: 500, media: 800, larga: 1100 };
  var RAYADOS = { poco: 26, normal: 18, denso: 11 };
  // parentesis y corchetes: media altura, ancho y grosor del trazo
  var SIGNOS = {
    S: { h: 13, w: 7, trazo: 2 },
    M: { h: 18, w: 9, trazo: 2.5 },
    L: { h: 26, w: 12, trazo: 3 },
    XL: { h: 36, w: 16, trazo: 3.5 },
  };

  function leerExtremo(txt) {
    var t = txt.trim(), n = t.replace(/\s+/g, "").replace(/[−–]/g, "-").toLowerCase();
    var m = /^([+-]?)(∞|inf|infinito|oo)$/.exec(n);
    if (m) return { texto: t, valor: m[1] === "-" ? -Infinity : Infinity };
    return { texto: t, valor: evaluar(t) };
  }

  // Un texto puede tener varios intervalos unidos con ∪ (o " U ").
  // Devuelve [{izq, der, cizq, cder, original}] o [{error, original}]
  function leerIntervalos(texto) {
    return texto.split(/∪|\s[uU]\s/).map(function (p) { return p.trim(); }).filter(Boolean)
      .map(leerIntervalo);
  }

  function leerIntervalo(t) {
    var r = { original: t };
    var a = t[0], c = t[t.length - 1];
    if (a !== "(" && a !== "[") return (r.error = "Debe empezar con ( o ["), r;
    if (c !== ")" && c !== "]") return (r.error = "Debe terminar con ) o ]"), r;
    var interior = t.slice(1, -1);
    var partes = interior.indexOf(";") >= 0 ? interior.split(";") : interior.split(",");
    if (partes.length !== 2) {
      return (r.error = partes.length > 2
        ? "Si usás decimales con coma, separá los extremos con ;"
        : "Faltan los dos extremos separados por coma"), r;
    }
    var izq = leerExtremo(partes[0]), der = leerExtremo(partes[1]);
    if (isNaN(izq.valor)) return (r.error = "No se entiende el extremo «" + izq.texto + "»"), r;
    if (isNaN(der.valor)) return (r.error = "No se entiende el extremo «" + der.texto + "»"), r;
    if (izq.valor === Infinity) return (r.error = "+∞ no puede ser el extremo izquierdo"), r;
    if (der.valor === -Infinity) return (r.error = "−∞ no puede ser el extremo derecho"), r;
    if ((izq.valor === -Infinity && a === "[") || (der.valor === Infinity && c === "]"))
      return (r.error = "∞ siempre va con paréntesis"), r;
    if (izq.valor > der.valor) return (r.error = "El extremo izquierdo es mayor que el derecho"), r;
    if (izq.valor === der.valor && (a === "(" || c === ")")) return (r.error = "Ese intervalo está vacío"), r;
    r.izq = izq; r.der = der; r.cizq = a; r.cder = c;
    return r;
  }

  // ------------------------------------------- operaciones entre conjuntos
  // Un conjunto es una lista de tramos {a, b, ca, cb, ta, tb}: extremos, si son
  // cerrados y su texto tal como se escribio (para mostrar "1/2" y no 0,5).
  function tramo(r) {
    return { a: r.izq.valor, b: r.der.valor, ca: r.cizq === "[", cb: r.cder === "]",
      ta: r.izq.texto, tb: r.der.texto };
  }

  // ordena y junta tramos que se tocan o se pisan
  function normalizar(lista) {
    var t = lista.slice().sort(function (x, y) { return x.a - y.a || (y.ca ? 1 : 0) - (x.ca ? 1 : 0); });
    var res = [];
    t.forEach(function (n) {
      var c = res[res.length - 1];
      if (c && (n.a < c.b || (n.a === c.b && (c.cb || n.ca)))) {
        if (n.a === c.a) c.ca = c.ca || n.ca;
        if (n.b > c.b) { c.b = n.b; c.cb = n.cb; c.tb = n.tb; }
        else if (n.b === c.b) c.cb = c.cb || n.cb;
      } else {
        res.push({ a: n.a, b: n.b, ca: n.ca, cb: n.cb, ta: n.ta, tb: n.tb });
      }
    });
    return res;
  }

  function unir(A, B) { return normalizar(A.concat(B)); }

  function intersecar(A, B) {
    var res = [];
    A.forEach(function (x) {
      B.forEach(function (y) {
        var izq = x.a > y.a ? x : y.a > x.a ? y : null;
        var der = x.b < y.b ? x : y.b < x.b ? y : null;
        var t = {
          a: izq ? izq.a : x.a, ca: izq ? izq.ca : x.ca && y.ca, ta: izq ? izq.ta : x.ta,
          b: der ? der.b : x.b, cb: der ? der.cb : x.cb && y.cb, tb: der ? der.tb : x.tb,
        };
        if (t.a < t.b || (t.a === t.b && t.ca && t.cb)) res.push(t);
      });
    });
    return normalizar(res);
  }

  function textoResultado(lista) {
    if (!lista.length) return "∅";
    return lista.map(function (t) {
      var ta = t.a === -Infinity ? "-∞" : t.ta, tb = t.b === Infinity ? "∞" : t.tb;
      if (t.a === t.b) return "{" + ta + "}";
      var sep = /,/.test(ta + tb) ? "; " : ", "; // decimales con coma
      return (t.ca ? "[" : "(") + ta + sep + tb + (t.cb ? "]" : ")");
    }).join(" ∪ ");
  }

  // margen en % (0 a 40) -> fraccion
  function margen(p) {
    p = Number(p);
    if (!isFinite(p)) p = 10;
    return Math.max(0, Math.min(40, p)) / 100;
  }

  // Arma todos los elementos de la recta. (ox, oy) = extremo izquierdo de la recta.
  // ORDEN DE LOS ELEMENTOS: se crean en el orden en que conviene verlos
  // aparecer (por ejemplo al animar la escena con excalidraw-animate):
  //  1. recta con graduacion y el marco vacio de la referencia
  //  2. por cada conjunto (fila): su linea en la referencia; y por cada
  //     intervalo del conjunto: sus extremos escritos debajo de la recta y
  //     luego el intervalo (signo izquierdo, rayado de izquierda a derecha,
  //     signo derecho; o el punto si es [a, a])
  //  3. la operacion y su resultado, de izquierda a derecha
  function generarRecta(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal;
    var tamG = TAMANOS[op.tamGrilla] || 16, tamE = TAMANOS[op.tamExtremos] || 28;
    var L = LARGOS[op.largo] || 800, sep = RAYADOS[op.rayado] || 18;

    // intervalos validos, en orden (la direccion del rayado alterna);
    // conjuntos = una entrada por fila con sus intervalos validos
    var ints = [], conjuntos = [];
    op.filas.forEach(function (f) {
      var propios = leerIntervalos(f.texto || "").filter(function (r) { return !r.error; });
      propios.forEach(function (r) { r.color = f.color; r.idx = ints.length; ints.push(r); });
      if (propios.length) conjuntos.push({ color: f.color, ints: propios });
    });
    var simbolo = op.operacion === "interseccion" ? " ∩ " : " ∪ ";
    function textoConjunto(c, entreParentesis) {
      var t = c.ints.map(function (r) { return r.original; }).join(" ∪ ");
      return entreParentesis && c.ints.length > 1 ? "(" + t + ")" : t;
    }

    // rango visible
    var finitos = [];
    ints.forEach(function (r) {
      if (isFinite(r.izq.valor)) finitos.push(r.izq.valor);
      if (isFinite(r.der.valor)) finitos.push(r.der.valor);
    });
    var lo = finitos.length ? Math.min.apply(null, finitos) : -1;
    var hi = finitos.length ? Math.max.apply(null, finitos) : 1;
    if (lo === hi) lo -= 1, hi += 1;
    // margenes: porcentaje del largo visible antes del extremo finito mas chico
    // y despues del mas grande. Si el total visible es T: lo - mi*T .. hi + md*T,
    // con T = (hi - lo) / (1 - mi - md)
    var mi = margen(op.margenIzq), md = margen(op.margenDer);
    var total = (hi - lo) / (1 - mi - md);
    var vmin = lo - mi * total, vmax = hi + md * total;
    var x0 = ox + 30, x1 = ox + L - 30;
    function X(v) {
      // los infinitos llegan hasta casi la punta de la flecha
      if (v === -Infinity) return ox + 22;
      if (v === Infinity) return ox + L - 22;
      return x0 + ((v - vmin) / (vmax - vmin)) * (x1 - x0);
    }

    // 1. recta con flechas
    agregar(linea(ox, oy, [[0, 0], [L, 0]], {
      type: "arrow", startArrowhead: "arrow", endArrowhead: "arrow",
    }));

    // estilo "lineas": cada conjunto es una linea horizontal de su color, a una
    // altura propia por encima de la recta (el primero, el mas alto), con un
    // punto lleno en los extremos incluidos y vacio en los excluidos; los
    // infinitos terminan en flecha. Estilo "rayado": sobre la recta, con
    // parentesis/corchetes y rayado.
    var lineas = op.estilo === "lineas";

    // marcas y numeracion de la grilla (la del 0, el doble de larga).
    // La numeracion empieza debajo de los parentesis/corchetes para no taparse.
    var sg = SIGNOS[op.tamSignos] || SIGNOS.M;
    var yGrilla = oy + (lineas ? 22 : Math.max(22, sg.h + 6));
    var paso = pasoLindo(vmax - vmin, op.soloEnteros);
    // si los numeros no entran entre marca y marca, se agranda el paso (1, 2, 5, 10...)
    if (!op.ocultarNumeros) {
      for (var intento = 0; intento < 12; intento++) {
        var ancho = 0;
        for (var j = Math.ceil(vmin / paso); j * paso <= vmax + 1e-9; j++)
          ancho = Math.max(ancho, medir(formatear(j * paso), tamG, fuente));
        if (X(paso) - X(0) >= ancho + 12) break;
        paso = pasoSiguiente(paso);
      }
    }
    for (var k = Math.ceil(vmin / paso); k * paso <= vmax + 1e-9; k++) {
      var v = k * paso, xv = X(v), cero = Math.abs(v) < 1e-9, m = cero ? 14 : 7;
      agregar(linea(xv, oy - m, [[0, 0], [0, 2 * m]], {}));
      if (!op.ocultarNumeros || cero) agregar(texto(xv, yGrilla, formatear(v), tamG, fuente, TINTA, "center"));
    }

    var yExtremos = yGrilla + tamG * fuente.lh + 8;
    var dx = Math.max(4, Math.round(sep * 0.35)), dy = 12, h = sg.h, w = sg.w;

    // 1. (cont.) marco de la referencia: cuadro arriba a la derecha
    var ref = null;
    if (op.referencia && conjuntos.length) {
      ref = { tam: TAMANOS[{ XL: "L", L: "M", M: "S", S: "S" }[op.tamExtremos] || "S"], muestra: 24, relleno: 10 };
      ref.altoFila = Math.max(ref.tam * fuente.lh, 16) + 6;
      var anchoTxt = 0;
      conjuntos.forEach(function (c) { anchoTxt = Math.max(anchoTxt, medir(textoConjunto(c), ref.tam, fuente)); });
      ref.ancho = ref.relleno * 2 + ref.muestra + 10 + anchoTxt;
      ref.alto = ref.relleno * 2 + ref.altoFila * conjuntos.length - 6;
    }

    // alturas de las lineas (estilo "lineas"): una por conjunto, separadas
    // como los renglones de la referencia para que queden a la par
    var sepNivel = Math.max(30, ref ? ref.altoFila : 0);
    function nivelY(i) { return oy - 40 - (conjuntos.length - 1 - i) * sepNivel; }
    var radio = { S: 4, M: 5, L: 6.5, XL: 8 }[op.tamSignos] || 5;

    if (ref) {
      if (lineas) {
        // a la derecha de la recta, con cada renglon a la altura de su linea
        ref.x = ox + L + 16;
        ref.y = nivelY(0) - ref.relleno - (ref.altoFila - 6) / 2;
      } else {
        ref.x = ox + L - ref.ancho;
        ref.y = oy - h - 16 - ref.alto;
      }
      agregar(base("rectangle", {
        x: ref.x, y: ref.y, width: ref.ancho, height: ref.alto, strokeWidth: 1, roundness: { type: 3 },
      }));
    }

    // 2.1 linea del conjunto en la referencia: muestra (rayada, o una linea en
    // el estilo "lineas") + texto en su color
    function filaReferencia(c, i) {
      var fy = ref.y + ref.relleno + i * ref.altoFila, alto = ref.altoFila - 6;
      if (lineas) {
        agregar(linea(ref.x + ref.relleno, fy + alto / 2, [[0, 0], [ref.muestra, 0]],
          { strokeColor: c.color, strokeWidth: sg.trazo }));
      } else {
        agregar(base("rectangle", {
          x: ref.x + ref.relleno, y: fy + alto / 2 - 7, width: ref.muestra, height: 14,
          strokeColor: c.color, backgroundColor: c.color, fillStyle: "hachure", strokeWidth: 1,
        }));
      }
      agregar(texto(ref.x + ref.relleno + ref.muestra + 10, fy + (alto - ref.tam * fuente.lh) / 2,
        textoConjunto(c), ref.tam, fuente, c.color, "left"));
    }

    // 2.2 extremos finitos escritos debajo (sin repetir un mismo valor en el mismo lugar)
    var etiquetas = {};
    function extremos(r) {
      [[r.izq, X(r.izq.valor)], [r.der, X(r.der.valor)]].forEach(function (q) {
        if (!isFinite(q[0].valor)) return;
        var clave = q[0].texto + "@" + Math.round(q[1]);
        if (etiquetas[clave]) return;
        etiquetas[clave] = true;
        agregar(texto(q[1], yExtremos, q[0].texto, tamE, fuente, r.color, "center"));
      });
    }

    // 2.3 el intervalo: signo izquierdo, rayado (izquierda a derecha), signo derecho
    function signo(xs, car, izquierdo, c) {
      var d = izquierdo ? w : -w; // hacia dentro del intervalo
      var pts = car === "[" || car === "]"
        ? [[0, 0], [-d, 0], [-d, 2 * h], [0, 2 * h]]
        : [[0, 0], [-d, h], [0, 2 * h]];
      agregar(linea(xs + d, oy - h, pts, {
        strokeColor: c, strokeWidth: sg.trazo, roundness: car === "(" || car === ")" ? { type: 2 } : null,
      }));
    }
    // punto del estilo "lineas": lleno si el extremo esta incluido, vacio si no
    function punto(x, y, lleno, c) {
      agregar(base("ellipse", {
        x: x - radio, y: y - radio, width: 2 * radio, height: 2 * radio,
        strokeColor: c, strokeWidth: Math.max(1.5, sg.trazo * 0.7),
        backgroundColor: lleno ? c : "#ffffff", fillStyle: "solid",
      }));
    }
    // 2.3 (estilo "lineas") punto izquierdo, linea, punto derecho. La linea
    // arranca y termina en el borde de los puntos; hacia un infinito, flecha.
    function intervaloLinea(r, nivel) {
      var xa = X(r.izq.valor), xb = X(r.der.valor), c = r.color, y = nivelY(nivel);
      var infIzq = !isFinite(r.izq.valor), infDer = !isFinite(r.der.valor);
      if (xa === xb) { punto(xa, y, true, c); return; } // [a, a]
      if (!infIzq) punto(xa, y, r.cizq === "[", c);
      var a = infIzq ? xa : xa + radio, b = infDer ? xb : xb - radio;
      if (b > a) {
        agregar(linea(a, y, [[0, 0], [b - a, 0]], {
          type: infIzq || infDer ? "arrow" : "line", strokeColor: c, strokeWidth: sg.trazo,
          startArrowhead: infIzq ? "arrow" : null, endArrowhead: infDer ? "arrow" : null,
        }));
      }
      if (!infDer) punto(xb, y, r.cder === "]", c);
    }

    function intervalo(r) {
      var xa = X(r.izq.valor), xb = X(r.der.valor), c = r.color;
      if (xa === xb) { // [a, a] es solo el punto
        agregar(base("ellipse", {
          x: xa - 5, y: oy - 5, width: 10, height: 10, strokeColor: c, backgroundColor: c,
        }));
        return;
      }
      if (isFinite(r.izq.valor)) signo(xa, r.cizq, true, c);
      for (var x = xa; x + dx <= xb + 0.5; x += sep) {
        agregar(r.idx % 2 === 0
          ? linea(x, oy - dy, [[0, 0], [dx, 2 * dy]], { strokeColor: c, strokeWidth: 1.5 })
          : linea(x + dx, oy - dy, [[0, 0], [-dx, 2 * dy]], { strokeColor: c, strokeWidth: 1.5 }));
      }
      if (isFinite(r.der.valor)) signo(xb, r.cder, false, c);
    }

    conjuntos.forEach(function (c, i) {
      if (ref) filaReferencia(c, i);
      c.ints.forEach(function (r) {
        extremos(r);
        if (lineas) intervaloLinea(r, i); else intervalo(r);
      });
    });

    // 3. operacion entre los conjuntos (una fila = un conjunto). Con interseccion,
    // una fila que ya es union de varios intervalos va entre parentesis.
    // Con el resultado activado se agrega "= ..." (o solo el resultado si la
    // operacion no se escribe).
    // Un texto de Excalidraw tiene un solo color, asi que la linea se arma con
    // varios textos seguidos: cada intervalo en el color de su conjunto y los
    // simbolos (∪, ∩, =, parentesis) y el resultado en negro.
    if ((op.mostrarUnion || op.mostrarResultado) && conjuntos.length) {
      var inter = op.operacion === "interseccion";
      var tramos = [];
      var poner = function (t, color) {
        var u = tramos[tramos.length - 1];
        if (u && u.color === color) u.t += t; // se juntan los seguidos del mismo color
        else tramos.push({ t: t, color: color });
      };
      if (op.mostrarUnion) {
        conjuntos.forEach(function (c, i) {
          if (i) poner(simbolo, TINTA);
          var parentesis = inter && c.ints.length > 1;
          if (parentesis) poner("(", TINTA);
          c.ints.forEach(function (r, j) {
            if (j) poner(" ∪ ", TINTA);
            poner(r.original, c.color);
          });
          if (parentesis) poner(")", TINTA);
        });
      }
      if (op.mostrarResultado) {
        var res = conjuntos.map(function (c) { return normalizar(c.ints.map(tramo)); })
          .reduce(function (A, B) { return inter ? intersecar(A, B) : unir(A, B); });
        poner((op.mostrarUnion ? " = " : "= ") + textoResultado(res), TINTA);
      }
      var xt = ox, yt = yExtremos + tamE * fuente.lh + 14;
      tramos.forEach(function (s) {
        // los espacios de los bordes se avanzan pero no quedan dentro del texto
        var izq = s.t.length - s.t.replace(/^\s+/, "").length;
        var limpio = s.t.trim();
        xt += medir(s.t.slice(0, izq), tamE, fuente);
        if (limpio) {
          agregar(texto(xt, yt, limpio, tamE, fuente, s.color, "left"));
          xt += medir(limpio, tamE, fuente);
        }
        xt += medir(s.t.slice(izq + limpio.length), tamE, fuente);
      });
    }
  }

  // ================================================ GENERADOR: FUNCIONES
  var ANCHOS = { chico: 500, medio: 800, grande: 1100 };
  var GROSORES = { fino: 1.5, normal: 2.5, grueso: 4 };
  var NOMBRES = ["f", "g", "h", "p", "q", "r", "s", "t"];

  // Compila el texto de una funcion anonima de JavaScript (x => ..., function (x) {...}).
  // Las funciones y constantes de Math se pueden usar sin "Math." (sin, sqrt, PI...).
  // OJO: es codigo JavaScript que se ejecuta en esta pagina (lo escribe quien usa la
  // pizarra; tambien llega a las otras ventanas de la sala dentro del dibujo).
  var cacheFunciones = {};
  function compilar(codigo) {
    var src = String(codigo || "").trim();
    if (!src) return { error: "Escribí una función, por ejemplo x => x**2" };
    if (cacheFunciones[src]) return cacheFunciones[src];
    var r;
    if (/[^*]\^|^\^/.test(src)) {
      r = { error: "En JavaScript la potencia es ** (x**2); ^ es otra operación" };
    } else {
      try {
        /* jshint evil:true */
        var f = new Function("M", "with (M) { return (" + src + "\n); }")(Math);
        if (typeof f !== "function") r = { error: "Tiene que ser una función, por ejemplo x => x**2" };
        else {
          f(0.5); // detecta errores como variables inexistentes
          r = { f: f };
        }
      } catch (e) {
        r = { error: (e instanceof SyntaxError ? "Error de escritura: " : "Error al calcular: ") + e.message };
      }
    }
    cacheFunciones[src] = r;
    return r;
  }

  // Texto legible para la referencia: f(x) = x² − 3.
  // El nombre lo elige quien escribe la funcion: "f" se completa con la
  // variable (f(x)); si ya trae parentesis ("f(x)", "P(t)") se usa tal cual.
  function textoFuncion(nombre, codigo) {
    var m = /^\s*\(?\s*([a-zA-Z_$][\w$]*)\s*\)?\s*=>\s*([^{][\s\S]*)$/.exec(codigo || "");
    var nom = /\(/.test(nombre) ? nombre : nombre + "(" + (m ? m[1] : "x") + ")";
    if (!m) return nom;
    var cuerpo = m[2].trim().replace(/Math\./g, "")
      .replace(/\*\*\s*2(?![\d.])/g, "²").replace(/\*\*\s*3(?![\d.])/g, "³")
      .replace(/\s*\*\s*/g, "·").replace(/-/g, "−");
    return nom + " = " + cuerpo;
  }
  function nombrePorDefecto(i) { return NOMBRES[i % NOMBRES.length]; }

  // Puntos a marcar: valores de x separados por coma ("-2, -1, 0, 1/2, π").
  // Con decimales con coma se separan con punto y coma ("0,5; 1,5").
  function leerPuntos(texto) {
    var t = String(texto || "").trim();
    if (!t) return [];
    return t.split(t.indexOf(";") >= 0 ? ";" : ",").map(function (s) { return s.trim(); })
      .filter(Boolean).map(function (s) {
        var v = evaluar(s);
        return isNaN(v) ? { texto: s, error: "No se entiende el valor «" + s + "»" } : { texto: s, valor: v };
      });
  }

  // Dominio propio de una funcion (opcional), para graficarla solo en una parte:
  //  - como intervalo(s): (1, ∞), [-2, 3), (-∞, 0) ∪ (1, ∞)
  //  - como desigualdad: x > 1, x >= 1, x ≤ 3, -2 < x <= 3 (≥ y ≤ tambien)
  // Devuelve { tramos: [{a, b, ca, cb}] } (ca/cb: extremo cerrado), { tramos: null }
  // si esta vacio (sin restriccion) o { error }.
  function leerRestriccion(texto) {
    var t = String(texto || "").trim();
    if (!t) return { tramos: null };
    if (/^[\[(]/.test(t)) {
      var rs = leerIntervalos(t), mal = rs.filter(function (r) { return r.error; });
      if (mal.length) return { error: mal.map(function (r) { return r.original + ": " + r.error; }).join(" · ") };
      return { tramos: rs.map(function (r) {
        return { a: r.izq.valor, b: r.der.valor, ca: r.cizq === "[", cb: r.cder === "]" };
      }) };
    }
    var s = t.replace(/\s+/g, "").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[−–]/g, "-");
    var m, d;
    if ((m = /^(.+?)(<=|<)[a-zA-Z]\w*(<=|<)(.+)$/.exec(s))) {
      d = { a: evaluar(m[1]), b: evaluar(m[4]), ca: m[2] === "<=", cb: m[3] === "<=" };
    } else if ((m = /^[a-zA-Z]\w*(>=|>|<=|<)(.+)$/.exec(s))) {
      var v = evaluar(m[2]);
      d = m[1][0] === ">" ? { a: v, b: Infinity, ca: m[1] === ">=", cb: false }
        : { a: -Infinity, b: v, ca: false, cb: m[1] === "<=" };
    } else {
      return { error: "Escribí un intervalo, como (1, ∞), o una desigualdad, como x > 1" };
    }
    if (isNaN(d.a) || isNaN(d.b)) return { error: "No se entiende un número de «" + t + "»" };
    if (!(d.a < d.b || (d.a === d.b && d.ca && d.cb))) return { error: "Ese dominio está vacío" };
    return { tramos: [d] };
  }

  function dentroDe(tramos, x) {
    if (!tramos) return true;
    return tramos.some(function (d) {
      return (x > d.a || (d.ca && x === d.a)) && (x < d.b || (d.cb && x === d.b));
    });
  }

  // linea de la referencia: f(x) = x², x > 1
  function textoReferencia(fn) {
    return textoFuncion(fn.nombre, fn.codigo) + textoRestriccion(fn.dominio, fn.codigo);
  }

  // texto del dominio para la referencia: ", x > 1" o ", x ∈ (1, ∞)"
  function textoRestriccion(texto, codigo) {
    var t = String(texto || "").trim();
    if (!t || leerRestriccion(t).error) return "";
    var m = /^\s*\(?\s*([a-zA-Z_$][\w$]*)/.exec(codigo || ""), v = m ? m[1] : "x";
    if (/^[\[(]/.test(t)) return ", " + v + " ∈ " + t;
    return ", " + t.replace(/>=/g, "≥").replace(/<=/g, "≤");
  }

  // puntos validos de una funcion dentro del dominio, con su valor y
  function valorEnPuntos(fn, xmin, xmax) {
    var res = [];
    fn.puntos.forEach(function (p) {
      if (p.valor < xmin - 1e-9 || p.valor > xmax + 1e-9) return;
      if (!dentroDe(fn.tramos, p.valor)) return;
      var y;
      try { y = Number(fn.f(p.valor)); } catch (e) { y = NaN; }
      if (isFinite(y)) res.push({ x: p.valor, y: y });
    });
    return res;
  }

  // avisos del dominio propio de una fila
  function erroresRestriccion(fila) {
    var r = leerRestriccion(fila.dominio);
    return r.error ? [r.error] : [];
  }

  // avisos de los puntos de una fila: mal escritos, fuera del dominio o donde
  // la funcion no esta definida
  function erroresPuntos(fila, op, i) {
    var pts = leerPuntos(fila.puntos);
    var errores = pts.filter(function (p) { return p.error; }).map(function (p) { return p.error; });
    var c = compilar(fila.texto), dom = leerDominio(op), restr = leerRestriccion(fila.dominio);
    if (!c.f) return errores;
    var nombre = String(fila.nombre || "").trim() || nombrePorDefecto(i);
    pts.forEach(function (p) {
      if (p.error) return;
      if (!dom.error && (p.valor < dom.a - 1e-9 || p.valor > dom.b + 1e-9)) {
        errores.push("x = " + p.texto + " está fuera del eje x del gráfico");
        return;
      }
      if (!restr.error && !dentroDe(restr.tramos, p.valor)) {
        errores.push("x = " + p.texto + " está fuera del dominio de " + nombre.replace(/\(.*$/, ""));
        return;
      }
      var y;
      try { y = Number(c.f(p.valor)); } catch (e) { y = NaN; }
      if (!isFinite(y)) errores.push(nombre.replace(/\(.*$/, "") + " no está definida en x = " + p.texto);
    });
    return errores;
  }

  // Recorre la funcion y arma los tramos visibles de la curva, en pixeles.
  // Corta donde no esta definida, donde sale del rango y en los saltos
  // (asintotas, funciones partidas); al salir/entrar del rango agrega el punto del borde.
  function tramosCurva(f, xmin, xmax, ymin, ymax, X, Y, n) {
    var tramos = [], actual = null, prev = null;
    function cerrar() { if (actual && actual.length > 1) tramos.push(actual); actual = null; }
    function borde(a, b, yb) { return [X(a.x + (b.x - a.x) * (yb - a.y) / (b.y - a.y)), Y(yb)]; }
    for (var i = 0; i <= n; i++) {
      var x = xmin + (xmax - xmin) * i / n, y;
      try { y = Number(f(x)); } catch (e) { y = NaN; }
      var p = { x: x, y: y, ok: isFinite(y), dentro: isFinite(y) && y >= ymin && y <= ymax };
      if (!p.ok) { cerrar(); prev = p; continue; }
      if (prev && prev.ok) {
        if (prev.dentro && p.dentro) {
          if (Math.abs(Y(p.y) - Y(prev.y)) > 30) { cerrar(); actual = [[X(p.x), Y(p.y)]]; }
          else actual.push([X(p.x), Y(p.y)]);
        } else if (prev.dentro) {
          actual.push(borde(prev, p, p.y > ymax ? ymax : ymin));
          cerrar();
        } else if (p.dentro) {
          actual = [borde(prev, p, prev.y > ymax ? ymax : ymin), [X(p.x), Y(p.y)]];
        }
      } else if (p.dentro) {
        actual = [[X(p.x), Y(p.y)]];
      }
      prev = p;
    }
    cerrar();
    return tramos;
  }

  // Ramer-Douglas-Peucker: saca puntos que no cambian la forma (tolerancia en px)
  function simplificar(pts, tol) {
    if (pts.length < 3) return pts;
    var queda = pts.map(function () { return false; });
    queda[0] = queda[pts.length - 1] = true;
    var pila = [[0, pts.length - 1]];
    while (pila.length) {
      var r = pila.pop(), a = r[0], b = r[1], dmax = 0, idx = -1;
      var ax = pts[a][0], ay = pts[a][1], vx = pts[b][0] - ax, vy = pts[b][1] - ay;
      var largo = Math.sqrt(vx * vx + vy * vy) || 1;
      for (var i = a + 1; i < b; i++) {
        var d = Math.abs(vy * (pts[i][0] - ax) - vx * (pts[i][1] - ay)) / largo;
        if (d > dmax) dmax = d, idx = i;
      }
      if (dmax > tol) { queda[idx] = true; pila.push([a, idx], [idx, b]); }
    }
    return pts.filter(function (p, i) { return queda[i]; });
  }

  // dominio y rango escritos en el panel (admiten π, fracciones, etc.)
  function leerDominio(op) {
    var a = evaluar(op.xMin), b = evaluar(op.xMax);
    if (!(a < b)) return { error: "El eje x tiene que ir de un número menor a uno mayor" };
    return { a: a, b: b };
  }
  function leerRango(op) {
    var a = evaluar(op.yMin), b = evaluar(op.yMax);
    if (!(a < b)) return { error: "El eje y tiene que ir de un número menor a uno mayor" };
    return { a: a, b: b };
  }

  // Arma el grafico. (ox, oy) = esquina superior izquierda de la zona del grafico.
  // ORDEN: ejes (x e y), cuadricula, marcas y numeracion, marco de la referencia; despues
  // por cada funcion su linea en la referencia, sus puntos marcados (trazos y
  // cruz, en el orden escrito) y su curva (de izquierda a derecha).
  function generarFunciones(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal;
    var tamN = TAMANOS[op.tamNumeros] || 16;
    var W = ANCHOS[op.tamano] || 800, H = Math.round(W * 0.62);
    var grosor = GROSORES[op.grosor] || 2.5;

    var funciones = [];
    op.filas.forEach(function (fila, i) {
      var c = compilar(fila.texto);
      var nombre = String(fila.nombre || "").trim() || nombrePorDefecto(i);
      var puntos = leerPuntos(fila.puntos).filter(function (p) { return !p.error; });
      var restr = leerRestriccion(fila.dominio), tramos = restr.error ? null : restr.tramos;
      if (c.f) funciones.push({
        f: c.f, color: fila.color, codigo: fila.texto, nombre: nombre, puntos: puntos,
        tramos: tramos, dominio: restr.error ? "" : fila.dominio,
        // la funcion "recortada": fuera de su dominio propio no existe
        fd: tramos ? function (x) { return dentroDe(tramos, x) ? c.f(x) : NaN; } : c.f,
      });
    });

    var dom = leerDominio(op);
    var xmin = dom.error ? -5 : dom.a, xmax = dom.error ? 5 : dom.b;

    // rango y: manual, o automatico mirando los valores (sin los extremos
    // mas raros, para que una asintota no aplaste todo)
    var ymin, ymax;
    var rango = op.yAuto ? { error: true } : leerRango(op);
    if (!rango.error) { ymin = rango.a; ymax = rango.b; }
    else {
      var valores = [];
      funciones.forEach(function (fn) {
        for (var i = 0; i <= 400; i++) {
          var y;
          try { y = Number(fn.fd(xmin + (xmax - xmin) * i / 400)); } catch (e) { y = NaN; }
          if (isFinite(y)) valores.push(y);
        }
      });
      valores.sort(function (a, b) { return a - b; });
      if (valores.length) {
        var cut = valores.length > 50 ? Math.floor(valores.length * 0.02) : 0;
        ymin = valores[cut]; ymax = valores[valores.length - 1 - cut];
      } else { ymin = -1; ymax = 1; }
      // los puntos marcados siempre tienen que verse
      funciones.forEach(function (fn) {
        valorEnPuntos(fn, xmin, xmax).forEach(function (p) {
          ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y);
        });
      });
      if (ymax - ymin < 1e-9) ymin -= 1, ymax += 1;
      var pad = (ymax - ymin) * 0.08;
      ymin -= pad; ymax += pad;
    }

    // misma escala en x y en y: el alto sale de la proporcion (con limites);
    // si no entra, se ajusta el rango y alrededor de su centro
    if (op.escalaIgual) {
      var pxu = W / (xmax - xmin);
      H = Math.round(Math.max(W * 0.3, Math.min(W * 1.2, (ymax - ymin) * pxu)));
      var cy = (ymin + ymax) / 2, mitad = H / pxu / 2;
      ymin = cy - mitad; ymax = cy + mitad;
    }

    function X(v) { return ox + (v - xmin) / (xmax - xmin) * W; }
    function Y(v) { return oy + H - (v - ymin) / (ymax - ymin) * H; }

    // pasos de la graduacion (se agrandan si los numeros no entran)
    var pasoX = pasoLindo(xmax - xmin, op.soloEnteros), pasoY = pasoLindo(ymax - ymin, op.soloEnteros);
    if (!op.ocultarNumeros) {
      for (var n1 = 0; n1 < 12; n1++) {
        var anchoMax = 0;
        for (var j = Math.ceil(xmin / pasoX); j * pasoX <= xmax + 1e-9; j++)
          anchoMax = Math.max(anchoMax, medir(formatear(j * pasoX), tamN, fuente));
        if (pasoX / (xmax - xmin) * W >= anchoMax + 10) break;
        pasoX = pasoSiguiente(pasoX);
      }
      for (var n2 = 0; n2 < 12; n2++) {
        if (pasoY / (ymax - ymin) * H >= tamN * fuente.lh + 4) break;
        pasoY = pasoSiguiente(pasoY);
      }
    }
    // cuadricula cuadrada: el alto se elige para que cada cuadro mida lo mismo
    // en x y en y, y el rango y se extiende hasta multiplos de su paso (asi la
    // cuadricula cierra justo arriba y abajo). Si queda demasiado alto, se usa
    // un paso y mas grande. Con misma escala, el paso y es el mismo que el x.
    if (op.cuadrada) {
      var lado = pasoX / (xmax - xmin) * W; // px de cada cuadro
      if (op.escalaIgual) pasoY = pasoX;
      for (var n3 = 0; n3 < 20; n3++) {
        var ya = Math.floor(ymin / pasoY + 1e-9) * pasoY, yb = Math.ceil(ymax / pasoY - 1e-9) * pasoY;
        var alto = (yb - ya) / pasoY * lado;
        if (alto <= W * 1.2 || op.escalaIgual) { ymin = ya; ymax = yb; H = alto; break; }
        pasoY = pasoSiguiente(pasoY);
      }
    }
    var marcasX = [], marcasY = [];
    for (var a = Math.ceil(xmin / pasoX - 1e-9); a * pasoX <= xmax + 1e-9; a++) marcasX.push(a * pasoX);
    for (var b = Math.ceil(ymin / pasoY - 1e-9); b * pasoY <= ymax + 1e-9; b++) marcasY.push(b * pasoY);

    // los ejes pasan por el 0; si el 0 no se ve, van por el borde
    var yEje = ymin <= 0 && ymax >= 0 ? Y(0) : (ymin > 0 ? oy + H : oy);
    var xEje = xmin <= 0 && xmax >= 0 ? X(0) : (xmin > 0 ? ox : ox + W);

    // 1. ejes con flecha en el sentido positivo y su nombre
    agregar(linea(ox - 10, yEje, [[0, 0], [W + 30, 0]], { type: "arrow", endArrowhead: "arrow" }));
    agregar(texto(ox + W + 24, yEje + 6, "x", tamN, fuente, TINTA, "left"));
    agregar(linea(xEje, oy + H + 10, [[0, 0], [0, -(H + 30)]], { type: "arrow", endArrowhead: "arrow" }));
    agregar(texto(xEje + 8, oy - 26 - tamN * fuente.lh / 2, "y", tamN, fuente, TINTA, "left"));

    // cuadricula, recien despues de los dos ejes. Queda por encima de ellos,
    // pero cada linea cruza su eje justo donde va una marca de la graduacion
    // (que se dibuja despues, en negro), asi que el eje no se ve cortado.
    if (op.cuadricula) {
      marcasX.forEach(function (v) {
        if (Math.abs(X(v) - xEje) > 0.5) agregar(linea(X(v), oy, [[0, 0], [0, H]], { strokeColor: GRIS, strokeWidth: 1 }));
      });
      marcasY.forEach(function (v) {
        if (Math.abs(Y(v) - yEje) > 0.5) agregar(linea(ox, Y(v), [[0, 0], [W, 0]], { strokeColor: GRIS, strokeWidth: 1 }));
      });
    }

    // marcas y numeracion (el 0 se escribe una sola vez, en el cruce de los ejes)
    var origenVisible = xmin <= 0 && xmax >= 0 && ymin <= 0 && ymax >= 0;
    marcasX.forEach(function (v) {
      var x = X(v), cero = Math.abs(v) < 1e-9;
      if (cero && Math.abs(x - xEje) < 0.5) return;
      agregar(linea(x, yEje - 5, [[0, 0], [0, 10]], {}));
      if (!op.ocultarNumeros) agregar(texto(x, yEje + 8, formatear(v), tamN, fuente, TINTA, "center"));
    });
    marcasY.forEach(function (v) {
      var y = Y(v), cero = Math.abs(v) < 1e-9;
      if (cero && Math.abs(y - yEje) < 0.5) return;
      agregar(linea(xEje - 5, y, [[0, 0], [10, 0]], {}));
      if (!op.ocultarNumeros) agregar(texto(xEje - 8, y - tamN * fuente.lh / 2, formatear(v), tamN, fuente, TINTA, "right"));
    });
    if (origenVisible) agregar(texto(xEje - 6, yEje + 6, "0", tamN, fuente, TINTA, "right"));

    // 1. (cont.) marco de la referencia: una funcion por renglon, fuera de la
    // cuadricula. "derecha": a la derecha del grafico, alineada arriba (pasando
    // la flecha y el nombre del eje x). "arriba": encima del grafico, alineada
    // a la derecha (pasando la flecha y el nombre del eje y).
    var ref = null;
    if (op.referencia && funciones.length) {
      ref = { tam: tamN, muestra: 24, relleno: 8 };
      ref.altoFila = ref.tam * fuente.lh + 4;
      var anchoTxt = 0;
      funciones.forEach(function (fn) { anchoTxt = Math.max(anchoTxt, medir(textoReferencia(fn), ref.tam, fuente)); });
      ref.ancho = ref.relleno * 2 + ref.muestra + 8 + anchoTxt;
      ref.alto = ref.relleno * 2 + ref.altoFila * funciones.length - 4;
      if (op.posReferencia === "arriba") {
        ref.x = ox + W - ref.ancho;
        ref.y = oy - 30 - tamN * fuente.lh - ref.alto;
      } else {
        ref.x = ox + W + 30 + medir("x", tamN, fuente) + 16;
        ref.y = oy;
      }
      agregar(base("rectangle", {
        x: ref.x, y: ref.y, width: ref.ancho, height: ref.alto, strokeWidth: 1, roundness: { type: 3 },
      }));
    }

    // 2. por cada funcion: su linea en la referencia, sus puntos marcados "a
    // mano" y despues su curva. Cada punto: linea de trazos vertical desde el
    // eje x, linea de trazos horizontal desde el eje y, y una cruz del color de
    // la funcion en la interseccion (como cuando se grafica con una tabla de valores).
    var muestras = Math.round(W * 1.5), brazo = 7;
    var guia = { strokeColor: GUIA, strokeWidth: 1.5, strokeStyle: "dashed" };
    funciones.forEach(function (fn, i) {
      if (ref) {
        var rx = ref.x + ref.relleno;
        var fy = ref.y + ref.relleno + i * ref.altoFila + (ref.altoFila - 4) / 2;
        agregar(linea(rx, fy, [[0, 0], [ref.muestra, 0]], { strokeColor: fn.color, strokeWidth: grosor }));
        agregar(texto(rx + ref.muestra + 8, fy - ref.tam * fuente.lh / 2,
          textoReferencia(fn), ref.tam, fuente, fn.color, "left"));
      }
      valorEnPuntos(fn, xmin, xmax).forEach(function (p) {
        if (p.y < ymin || p.y > ymax) return; // fuera del rango y elegido
        var px = X(p.x), py = Y(p.y);
        if (Math.abs(py - yEje) > 0.5) agregar(linea(px, yEje, [[0, 0], [0, py - yEje]], guia));
        if (Math.abs(px - xEje) > 0.5) agregar(linea(xEje, py, [[0, 0], [px - xEje, 0]], guia));
        var cruz = { strokeColor: fn.color, strokeWidth: Math.max(2, grosor) };
        agregar(linea(px - brazo, py - brazo, [[0, 0], [2 * brazo, 2 * brazo]], cruz));
        agregar(linea(px - brazo, py + brazo, [[0, 0], [2 * brazo, -2 * brazo]], cruz));
      });
      // la curva: en todo el dominio del grafico, o solo en las partes del
      // dominio propio de la funcion (muestreando desde cada extremo exacto)
      var partes = fn.tramos ? fn.tramos.map(function (d) {
        return { a: Math.max(d.a, xmin), b: Math.min(d.b, xmax) };
      }).filter(function (d) { return d.a < d.b; }) : [{ a: xmin, b: xmax }];
      partes.forEach(function (d) {
        var n = Math.max(20, Math.round(muestras * (d.b - d.a) / (xmax - xmin)));
        tramosCurva(fn.f, d.a, d.b, ymin, ymax, X, Y, n).forEach(function (pts) {
          pts = simplificar(pts, 0.3);
          if (pts.length > 1) agregar(trazo(pts, { strokeColor: fn.color, strokeWidth: grosor }));
        });
      });
      // extremos del dominio propio: punto lleno si esta incluido, vacio si no
      if (fn.tramos && op.marcarExtremos) {
        fn.tramos.forEach(function (d) {
          [[d.a, d.ca], [d.b, d.cb]].forEach(function (q, k) {
            if (k === 1 && d.a === d.b) return; // [a, a]: un solo punto
            var x = q[0];
            if (!isFinite(x) || x < xmin - 1e-9 || x > xmax + 1e-9) return;
            var y;
            try { y = Number(fn.f(x)); } catch (e) { y = NaN; }
            if (!isFinite(y) || y < ymin || y > ymax) return;
            var r = Math.max(4.5, grosor * 1.8);
            agregar(base("ellipse", {
              x: X(x) - r, y: Y(y) - r, width: 2 * r, height: 2 * r,
              strokeColor: fn.color, strokeWidth: Math.max(1.5, grosor * 0.8),
              backgroundColor: q[1] ? fn.color : "#ffffff", fillStyle: "solid",
            }));
          });
        });
      }
    });
  }

  // ========================================= GENERADOR: TABLAS DE VERDAD
  // Expresiones de logica proposicional. Conectivos (de mayor a menor prioridad):
  //   ¬ (~ ! - no not)   ∧ (& && ^ · y and)   ∨ (| || + o or v) y ⊻ (⊕ xor)
  //   → (-> => ⇒, asocia a derecha)   ↔ (<-> <=> ⇔ ≡)
  // Constantes: V F 1 0 ⊤ ⊥ (V y F solo si no son nombres de variables).
  var LETRAS = ["p", "q", "r", "s", "t", "u"];
  var MAX_VARIABLES = 5;
  var CONECTIVOS = { y: "∧", o: "∨", xo: "⊻", entonces: "→", sii: "↔" };
  var PALABRAS = { no: "no", not: "no", y: "y", and: "y", o: "o", or: "o", v: "o", xor: "xo" };
  var SIMBOLOS_LOGICOS = [
    ["<->", "sii"], ["<=>", "sii"], ["↔", "sii"], ["⇔", "sii"], ["≡", "sii"],
    ["->", "entonces"], ["=>", "entonces"], ["→", "entonces"], ["⇒", "entonces"],
    ["&&", "y"], ["||", "o"], ["∧", "y"], ["&", "y"], ["^", "y"], ["·", "y"],
    ["∨", "o"], ["|", "o"], ["+", "o"], ["⊻", "xo"], ["⊕", "xo"],
    ["¬", "no"], ["~", "no"], ["!", "no"], ["-", "no"], ["−", "no"],
    ["(", "("], ["[", "("], [")", ")"], ["]", ")"],
  ];
  var IDENT = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ_0-9]*/;

  // Variables de la tabla: las primeras n de los nombres escritos (completando
  // con p, q, r... si faltan). Devuelve { vars, error }.
  function leerVariables(op) {
    var n = Math.max(1, Math.min(MAX_VARIABLES, Number(op.nVars) || 2));
    var vars = [], errores = [];
    String(op.nombres || "").split(/[\s,;]+/).filter(Boolean).forEach(function (v) {
      if (vars.length >= n) return;
      var m = IDENT.exec(v);
      if (!m || m[0] !== v) errores.push("«" + v + "» no sirve como nombre (usá letras)");
      else if (vars.indexOf(v) >= 0) errores.push("«" + v + "» está repetida");
      else vars.push(v);
    });
    for (var i = 0; vars.length < n; i++) {
      var l = i < LETRAS.length ? LETRAS[i] : "x" + (i - LETRAS.length + 1);
      if (vars.indexOf(l) < 0) vars.push(l);
    }
    return { vars: vars, error: errores.join(" · ") };
  }

  function tokensLogicos(s, vars) {
    var res = [], i = 0;
    while (i < s.length) {
      if (/\s/.test(s[i])) { i++; continue; }
      var resto = s.slice(i), sim = null;
      for (var k = 0; k < SIMBOLOS_LOGICOS.length && !sim; k++)
        if (resto.indexOf(SIMBOLOS_LOGICOS[k][0]) === 0) sim = SIMBOLOS_LOGICOS[k];
      if (sim) { res.push({ t: sim[1], txt: sim[0] }); i += sim[0].length; continue; }
      var m = IDENT.exec(resto);
      if (m) {
        var w = m[0];
        if (vars.indexOf(w) >= 0) res.push({ t: "var", n: w, txt: w });
        else if (PALABRAS[w.toLowerCase()]) res.push({ t: PALABRAS[w.toLowerCase()], txt: w });
        else if (w === "V" || w === "F") res.push({ t: "const", v: w === "V", txt: w });
        else throw "«" + w + "» no es una variable (las variables son " + vars.join(", ") + ")" +
          (w.length > 1 && w.length <= 3 ? "; separá con espacios: " + w.split("").join(" ") : "");
        i += w.length;
        continue;
      }
      if (/[01⊤⊥]/.test(s[i])) { res.push({ t: "const", v: s[i] === "1" || s[i] === "⊤", txt: s[i] }); i++; continue; }
      throw "No se entiende «" + s[i] + "»";
    }
    return res;
  }

  // Arma el arbol de la expresion: { arbol } o { error }.
  // Nodos: {t:"var", n} {t:"const", v, txt} {t:"no", a} {t:"bin", op, a, b};
  // par: "(" o "[" si estaba entre parentesis (se respetan al escribirla).
  function analizarLogica(texto, vars) {
    var s = String(texto || "").trim();
    if (!s) return { error: "Escribí una expresión, por ejemplo p → q" };
    try {
      var tk = tokensLogicos(s, vars), i = 0;
      var es = function (t) { return tk[i] && tk[i].t === t; };
      var bicond = function () {
        var a = cond();
        while (es("sii")) { i++; a = { t: "bin", op: "sii", a: a, b: cond() }; }
        return a;
      };
      var cond = function () {
        var a = disy();
        if (es("entonces")) { i++; return { t: "bin", op: "entonces", a: a, b: cond() }; }
        return a;
      };
      var disy = function () {
        var a = conj();
        while (es("o") || es("xo")) { var o = tk[i++].t; a = { t: "bin", op: o, a: a, b: conj() }; }
        return a;
      };
      var conj = function () {
        var a = neg();
        while (es("y")) { i++; a = { t: "bin", op: "y", a: a, b: neg() }; }
        return a;
      };
      var neg = function () {
        if (es("no")) { i++; return { t: "no", a: neg() }; }
        return atomo();
      };
      var atomo = function () {
        var k = tk[i];
        if (!k) throw i ? "Falta algo después de «" + tk[i - 1].txt + "»" : "Expresión vacía";
        if (k.t === "var") { i++; return { t: "var", n: k.n }; }
        if (k.t === "const") { i++; return { t: "const", v: k.v, txt: k.txt }; }
        if (k.t === "(") {
          i++;
          var e = bicond();
          if (!es(")")) throw "Falta cerrar «" + k.txt + "»";
          var cierre = tk[i++].txt, debe = k.txt === "[" ? "]" : ")";
          if (cierre !== debe) throw "«" + k.txt + "» se cierra con «" + debe + "»";
          e.par = k.txt;
          return e;
        }
        if (k.t === ")") throw "Sobra «" + k.txt + "» o falta algo antes";
        throw "Falta algo antes de «" + k.txt + "»";
      };
      var arbol = bicond();
      if (i < tk.length) {
        throw tk[i].t === ")" ? "Sobra «" + tk[i].txt + "»"
          : "Falta un conectivo antes de «" + tk[i].txt + "»";
      }
      return { arbol: arbol };
    } catch (e) {
      if (typeof e === "string") return { error: e };
      throw e;
    }
  }

  // la expresion escrita con los simbolos de siempre (y los parentesis del autor)
  function imprimirLogica(n, conPar) {
    var s;
    if (n.t === "var") s = n.n;
    else if (n.t === "const") s = n.txt;
    else if (n.t === "no") s = "¬" + imprimirLogica(n.a, true);
    else s = imprimirLogica(n.a, true) + " " + CONECTIVOS[n.op] + " " + imprimirLogica(n.b, true);
    if (conPar && n.par) s = n.par + s + (n.par === "[" ? "]" : ")");
    return s;
  }

  function valorLogico(n, env) {
    switch (n.t) {
      case "var": return env[n.n];
      case "const": return n.v;
      case "no": return !valorLogico(n.a, env);
    }
    var a = valorLogico(n.a, env), b = valorLogico(n.b, env);
    switch (n.op) {
      case "y": return a && b;
      case "o": return a || b;
      case "xo": return a !== b;
      case "entonces": return !a || b;
      default: return a === b;
    }
  }

  // Calcula columnas, valores y medidas de la tabla (sin dibujar).
  // Columnas: las variables; despues, por cada expresion, sus subexpresiones en
  // el orden en que se resuelven (si se piden) y la expresion completa.
  function armarTabla(op) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal;
    var tam = TAMANOS[op.tamTexto] || 20;
    var vars = leerVariables(op).vars, nFilas = Math.pow(2, vars.length);
    var cols = vars.map(function (v) { return { texto: v, nodo: { t: "var", n: v }, color: TINTA, variable: true }; });
    var porTexto = {};
    cols.forEach(function (c) { porTexto[c.texto] = c; });
    var exprs = [];
    op.filas.forEach(function (f) {
      var r = analizarLogica(f.texto, vars);
      if (r.error) return;
      var color = op.colorResultado ? f.color : TINTA;
      (function visitar(n, raiz) {
        if (n.t === "no") visitar(n.a, false);
        else if (n.t === "bin") { visitar(n.a, false); visitar(n.b, false); }
        else if (!raiz) return; // variables y constantes sueltas no son columnas
        if (!raiz && !op.intermedias) return;
        var k = imprimirLogica(n, false), ya = porTexto[k];
        if (ya) { if (raiz && !ya.variable) { ya.color = color; ya.raiz = true; } return; }
        var c = { texto: k, nodo: n, color: raiz ? color : TINTA, raiz: raiz };
        porTexto[k] = c;
        cols.push(c);
      })(r.arbol, true);
      exprs.push({ arbol: r.arbol, texto: imprimirLogica(r.arbol, false), color: color });
    });

    // valores: fila 0 = todas V (o todas F); la primera variable cambia cada
    // mitad, la ultima en cada fila
    var envs = [];
    for (var r = 0; r < nFilas; r++) {
      var env = {};
      vars.forEach(function (v, j) {
        var bit = (r >> (vars.length - 1 - j)) & 1;
        env[v] = op.primero === "F" ? bit === 1 : bit === 0;
      });
      envs.push(env);
    }
    cols.forEach(function (c) { c.valores = envs.map(function (e) { return valorLogico(c.nodo, e); }); });
    exprs.forEach(function (e) {
      var vs = envs.map(function (en) { return valorLogico(e.arbol, en); });
      e.clase = vs.every(Boolean) ? "Tautología" : vs.some(Boolean) ? "Contingencia" : "Contradicción";
      // valores por "mascara": la variable j es verdadera si su bit (de izquierda a derecha) es 1
      var porMascara = [];
      for (var m = 0; m < nFilas; m++) {
        var en = {};
        vars.forEach(function (v, j) { en[v] = ((m >> (vars.length - 1 - j)) & 1) === 1; });
        porMascara.push(valorLogico(e.arbol, en));
      }
      e.minima = expresionMinima(vars, porMascara, op.forma);
    });

    var V = op.valores === "10" ? "1" : "V", F = op.valores === "10" ? "0" : "F";
    var padX = Math.round(tam * 0.6), padY = Math.round(tam * 0.3);
    var anchoValor = Math.max(medir(V, tam, fuente), medir(F, tam, fuente));
    var anchos = cols.map(function (c) {
      return Math.max(medir(c.texto, tam, fuente), anchoValor, tam) + 2 * padX;
    });
    var altoFila = Math.round(tam * fuente.lh + 2 * padY);
    var W = anchos.reduce(function (a, b) { return a + b; }, 0);
    var H = altoFila * (nFilas + 1);
    var altoClases = op.clasificar && exprs.length ? 14 + exprs.length * (tam * fuente.lh + 4) : 0;
    return { fuente: fuente, tam: tam, vars: vars, cols: cols, exprs: exprs, nFilas: nFilas,
      V: V, F: F, anchos: anchos, altoFila: altoFila, W: W, H: H, Htotal: H + altoClases };
  }

  // --------------------------------------------- simplificacion (Quine-McCluskey)
  // Un implicante es { v: bits fijos, x: bits libres }; cubre la mascara m si
  // coincide en todos los bits que no son libres.
  function implicantesPrimos(unos) {
    var grupo = unos.map(function (m) { return { v: m, x: 0 }; }), primos = [], vistos = {};
    while (grupo.length) {
      var usados = {}, sig = [], nuevos = {};
      for (var i = 0; i < grupo.length; i++) {
        for (var j = i + 1; j < grupo.length; j++) {
          var a = grupo[i], b = grupo[j], d = a.v ^ b.v;
          if (a.x !== b.x || !d || (d & (d - 1))) continue; // tienen que diferir en un solo bit
          usados[i] = usados[j] = true;
          var c = { v: a.v & ~d, x: a.x | d }, k = c.v + "/" + c.x;
          if (!nuevos[k]) { nuevos[k] = true; sig.push(c); }
        }
      }
      grupo.forEach(function (g, i) {
        var k = g.v + "/" + g.x;
        if (!usados[i] && !vistos[k]) { vistos[k] = true; primos.push(g); }
      });
      grupo = sig;
    }
    return primos;
  }
  function cubreMascara(p, m) { return (m & ~p.x) === p.v; }
  function cantLiterales(p, n) {
    var c = 0;
    for (var j = 0; j < n; j++) if (!(p.x & (1 << j))) c++;
    return c;
  }

  // cobertura con la menor cantidad de terminos (y, a igualdad, de literales):
  // primero los implicantes esenciales y despues una busqueda por tamano
  // creciente (si fuera demasiado larga, se completa eligiendo el que mas cubre)
  function coberturaMinima(primos, unos, n) {
    var elegidos = [], faltan = unos.slice(), cambio = true;
    var cubierto = function (m) { return elegidos.some(function (p) { return cubreMascara(p, m); }); };
    while (cambio) {
      cambio = false;
      faltan.forEach(function (m) {
        var qs = primos.filter(function (p) { return cubreMascara(p, m); });
        if (qs.length === 1 && elegidos.indexOf(qs[0]) < 0) { elegidos.push(qs[0]); cambio = true; }
      });
      faltan = faltan.filter(function (m) { return !cubierto(m); });
    }
    if (!faltan.length) return elegidos;
    var resto = primos.filter(function (p) {
      return elegidos.indexOf(p) < 0 && faltan.some(function (m) { return cubreMascara(p, m); });
    });
    var combos = 1;
    for (var k = 1; k <= resto.length; k++) {
      combos = combos * (resto.length - k + 1) / k;
      if (combos > 200000) break;
      var mejor = null, mejorLit = Infinity, sel = [];
      (function rec(i) {
        if (sel.length === k) {
          if (faltan.every(function (m) { return sel.some(function (p) { return cubreMascara(p, m); }); })) {
            var l = sel.reduce(function (s, p) { return s + cantLiterales(p, n); }, 0);
            if (l < mejorLit) { mejorLit = l; mejor = sel.slice(); }
          }
          return;
        }
        for (var j = i; j <= resto.length - (k - sel.length); j++) { sel.push(resto[j]); rec(j + 1); sel.pop(); }
      })(0);
      if (mejor) return elegidos.concat(mejor);
    }
    while (faltan.length) { // voraz
      var p = resto.slice().sort(function (a, b) {
        var ca = faltan.filter(function (m) { return cubreMascara(a, m); }).length;
        var cb = faltan.filter(function (m) { return cubreMascara(b, m); }).length;
        return cb - ca || cantLiterales(a, n) - cantLiterales(b, n);
      })[0];
      elegidos.push(p);
      faltan = faltan.filter(function (m) { return !cubreMascara(p, m); });
    }
    return elegidos;
  }

  // Expresion minima equivalente, como arbol. forma "fnd": disyuncion de
  // conjunciones (a partir de las filas verdaderas); "fnc": conjuncion de
  // disyunciones (a partir de las falsas). Tautologia -> V, contradiccion -> F.
  // implicantes elegidos para cubrir los unos (fnc = false) o los ceros (true),
  // en un orden estable: primero los que tienen mas variables fijas a la izquierda
  function coberturaLogica(valores, n, fnc) {
    var obj = [];
    valores.forEach(function (v, m) { if (v !== fnc) obj.push(m); });
    if (!obj.length) return [];
    var cob = coberturaMinima(implicantesPrimos(obj), obj, n);
    cob.sort(function (a, b) { return a.x - b.x || b.v - a.v; });
    return cob;
  }

  function expresionMinima(vars, valores, forma) {
    var n = vars.length;
    if (valores.every(Boolean)) return { t: "const", v: true, txt: "V" };
    if (!valores.some(Boolean)) return { t: "const", v: false, txt: "F" };
    var fnc = forma === "fnc", cob = coberturaLogica(valores, n, fnc);
    var terminos = cob.map(function (p) {
      var lits = [];
      vars.forEach(function (nombre, j) {
        var bit = 1 << (n - 1 - j);
        if (p.x & bit) return;
        var positivo = !!(p.v & bit) !== fnc; // en la FNC cada clausula niega la fila falsa
        lits.push(positivo ? { t: "var", n: nombre } : { t: "no", a: { t: "var", n: nombre } });
      });
      return lits.reduce(function (a, b) { return { t: "bin", op: fnc ? "o" : "y", a: a, b: b }; });
    });
    if (terminos.length > 1) terminos.forEach(function (t) { if (t.t === "bin") t.par = "("; });
    return terminos.reduce(function (a, b) { return { t: "bin", op: fnc ? "y" : "o", a: a, b: b }; });
  }

  // ------------------------------------------------------- circuito logico
  // El arbol de la expresion pasa a compuertas: ∧ -> AND, ∨ -> OR (las cadenas
  // A·B·C son una sola compuerta de varias entradas), ¬ -> NOT, ⊕ -> XOR,
  // ⊙ (↔) -> XNOR y p → q -> OR de ¬p y q. Las variables (y sus negaciones
  // directas) son hojas que se toman de la linea de cada variable.
  function aCircuito(n) {
    if (n.t === "var") return { tipo: "entrada", v: n.n, neg: false };
    if (n.t === "const") return { tipo: "const", nombre: n.v ? "1" : "0" };
    if (n.t === "no" && n.a.t === "var") return { tipo: "entrada", v: n.a.n, neg: true };
    if (n.t === "no") return { tipo: "not", hijos: [aCircuito(n.a)] };
    if (n.op === "y" || n.op === "o") {
      var hijos = [];
      (function juntar(m) {
        if (m.t === "bin" && m.op === n.op) { juntar(m.a); juntar(m.b); } else hijos.push(aCircuito(m));
      })(n);
      return { tipo: n.op === "y" ? "and" : "or", hijos: hijos };
    }
    if (n.op === "xo") return { tipo: "xor", hijos: [aCircuito(n.a), aCircuito(n.b)] };
    if (n.op === "sii") return { tipo: "xnor", hijos: [aCircuito(n.a), aCircuito(n.b)] };
    var b = aCircuito(n.b); // p → q = ¬p ∨ q
    return { tipo: "or", hijos: [{ tipo: "not", hijos: [aCircuito(n.a)] }].concat(b.tipo === "or" ? b.hijos : [b]) };
  }

  function curvaCuadratica(p0, c, p1, pasos) {
    var pts = [];
    for (var i = 0; i <= pasos; i++) {
      var t = i / pasos, u = 1 - t;
      pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
    }
    return pts;
  }

  // Dibuja una compuerta con el borde izquierdo en x y el centro vertical en yc,
  // para k entradas. Devuelve { xSalida, pin(y) -> x donde termina el cable de entrada }.
  function compuerta(tipo, x, yc, k, agregar) {
    var h = Math.max(36, k * 18), y0 = yc - h / 2, trazoG = { strokeWidth: 2 }, r = 5;
    var burbuja = function (xb) {
      agregar(base("ellipse", { x: xb, y: yc - r, width: 2 * r, height: 2 * r, strokeWidth: 2 }));
      return xb + 2 * r;
    };
    if (tipo === "not") {
      var L = 32, hn = 28;
      agregar(trazo([[x, yc - hn / 2], [x + L, yc], [x, yc + hn / 2], [x, yc - hn / 2]], trazoG));
      return { xSalida: burbuja(x + L), pin: function () { return x; } };
    }
    if (tipo === "and") {
      var w0 = 26, ra = h / 2, pts = [[x, y0], [x + w0, y0]];
      for (var i = 1; i < 16; i++) {
        var a = -Math.PI / 2 + Math.PI * i / 16;
        pts.push([x + w0 + ra * Math.cos(a), yc + ra * Math.sin(a)]);
      }
      pts.push([x + w0, y0 + h], [x, y0 + h], [x, y0]);
      agregar(trazo(pts, trazoG));
      return { xSalida: x + w0 + ra, pin: function () { return x; } };
    }
    // OR, XOR y XNOR: dorso curvo hacia adentro y frente en punta
    var ex = tipo === "or" ? 0 : 9, bx = x + ex, Lo = 34 + h * 0.4, d = h * 0.16;
    var forma = curvaCuadratica([bx, y0], [bx + Lo * 0.55, y0], [bx + Lo, yc], 10)
      .concat(curvaCuadratica([bx + Lo, yc], [bx + Lo * 0.55, y0 + h], [bx, y0 + h], 10).slice(1))
      .concat(curvaCuadratica([bx, y0 + h], [bx + 2 * d, yc], [bx, y0], 10).slice(1));
    agregar(trazo(forma, trazoG));
    if (ex) agregar(trazo(curvaCuadratica([x, y0 + h], [x + 2 * d, yc], [x, y0], 10), trazoG));
    var salida = bx + Lo;
    if (tipo === "xnor") salida = burbuja(salida);
    return {
      xSalida: salida,
      // x del dorso a la altura y (la curva es lineal en y)
      pin: function (y) { var t = (y0 + h - y) / h; return x + 4 * d * t * (1 - t); },
    };
  }

  // Circuito de una expresion con una sola entrada por variable:
  //  - Cada variable usada tiene una linea vertical (con su nombre arriba). Si
  //    se usa negada, desde arriba sale una rama a una compuerta NOT y de ahi
  //    baja otra linea vertical (la de A').
  //  - Las compuertas van a la derecha, por niveles. Cada vez que una compuerta
  //    usa una variable, el cable sale de su linea (con un punto en la
  //    bifurcacion) y va hacia la derecha.
  //  - Si un cable cruza a otro sin estar unido, el horizontal hace un salto.
  // ORDEN: nombres y lineas de las variables (con sus NOT); despues las
  // compuertas de izquierda a derecha, cada una con los cables que le llegan;
  // la salida al final.
  // negar(v): como se escribe la variable negada (A' o ¬A)
  function dibujarCircuito(arbol, vars, etiqueta, color, tam, fuente, agregar, negar) {
    var raiz = aCircuito(arbol), lh = tam * fuente.lh;
    var SLOT = Math.max(38, tam * 1.9), COL = 150, R_SALTO = 6, R_PUNTO = 3.5, Y_NOT = 26;
    var cable = { strokeWidth: 1.5 };

    // hojas y niveles
    var hojas = [], porNivel = [];
    (function medir2(nd) {
      if (nd.tipo === "entrada" || nd.tipo === "const") { nd.nivel = 0; nd.alto = SLOT; return; }
      nd.hijos.forEach(medir2);
      nd.nivel = 1 + Math.max.apply(null, nd.hijos.map(function (h) { return h.nivel; }));
      nd.alto = nd.hijos.reduce(function (s, h) { return s + h.alto; }, 0);
    })(raiz);
    var Y0 = Y_NOT + 40;
    (function ubicar(nd, y) {
      if (nd.nivel === 0) { nd.y = y + nd.alto / 2; hojas.push(nd); return; }
      var yy = y;
      nd.hijos.forEach(function (h) { ubicar(h, yy); yy += h.alto; });
      nd.y = nd.hijos.length === 1 ? nd.hijos[0].y : (nd.hijos[0].y + nd.hijos[nd.hijos.length - 1].y) / 2;
      (porNivel[nd.nivel] = porNivel[nd.nivel] || []).push(nd);
    })(raiz, Y0);

    // lineas de las variables, en el orden de la tabla
    var lineas = {}, x = 0, ordenLineas = [];
    vars.forEach(function (v) {
      var pos = hojas.some(function (h) { return h.v === v && !h.neg; });
      var neg = hojas.some(function (h) { return h.v === v && h.neg; });
      if (!pos && !neg) return;
      var lp = { v: v, x: x, top: 0, taps: [], neg: false };
      lineas[v + "+"] = lp;
      ordenLineas.push(lp);
      if (neg) {
        var ln = { v: v, x: x + 74, top: Y_NOT, taps: [], neg: true };
        lineas[v + "-"] = ln;
        ordenLineas.push(ln);
        lp.taps.push(Y_NOT); // la rama hacia el NOT
        x += 74;
      }
      x += 46;
    });
    var XB = x - 46 + 50; // las compuertas empiezan a la derecha de las lineas

    // segmentos de cable: { pts: [[x, y]...], color }. Se arman todos antes de
    // dibujar, para encontrar los cruces.
    var cables = [];
    hojas.forEach(function (h) {
      if (h.tipo === "const") { h.xSalida = XB - 20; return; }
      var l = lineas[h.v + (h.neg ? "-" : "+")];
      l.taps.push(h.y);
      h.xSalida = l.x;
      h.linea = l;
    });
    var gates = [];
    for (var nv = 1; nv < porNivel.length; nv++) {
      (porNivel[nv] || []).forEach(function (nd) {
        var gx = XB + 30 + (nv - 1) * COL, k = nd.hijos.length;
        var h = Math.max(36, k * 18), sp = h / k;
        var forma = [], g = compuerta(nd.tipo, gx, nd.y, k, function (e) { forma.push(e); });
        var propios = [];
        nd.hijos.forEach(function (hj, i) {
          var py = nd.tipo === "not" ? nd.y : nd.y - h / 2 + sp * (i + 0.5), px = g.pin(py);
          var pts = Math.abs(hj.y - py) < 0.5 ? [[hj.xSalida, hj.y], [px, py]] : (function () {
            var xm = gx - 14 - (k > 1 ? Math.abs(i - (k - 1) / 2) * 7 : 0);
            return [[hj.xSalida, hj.y], [xm, hj.y], [xm, py], [px, py]];
          })();
          var c = { pts: pts, desde: hj };
          cables.push(c);
          propios.push(c);
        });
        nd.xSalida = g.xSalida;
        gates.push({ forma: forma, cables: propios });
      });
    }
    var xs = raiz.xSalida;
    var salida = { pts: [[xs, raiz.y], [xs + 36, raiz.y]], color: color, desde: raiz };
    if (raiz.nivel === 0) salida.pts[1][0] = Math.max(xs + 36, XB + 30); // F = A: un solo cable
    cables.push(salida);

    // tramos verticales (lineas de variables y codos de los cables), para los saltos
    ordenLineas.forEach(function (l) { l.bottom = Math.max.apply(null, l.taps.concat([l.top])); });
    var verticales = ordenLineas.map(function (l) { return { x: l.x, y0: l.top, y1: l.bottom }; });
    cables.forEach(function (c) {
      for (var i = 1; i < c.pts.length; i++) {
        var a = c.pts[i - 1], b = c.pts[i];
        if (Math.abs(a[0] - b[0]) < 0.5) verticales.push({ x: a[0], y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) });
      }
    });
    // un tramo horizontal con un salto (semicirculo hacia arriba) en cada cruce
    function conSaltos(pts) {
      var res = [pts[0]];
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i];
        if (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(a[0] - b[0]) > 0.5) {
          var dir = b[0] > a[0] ? 1 : -1, y = a[1];
          var xsCruce = verticales.filter(function (v) {
            return v.x > Math.min(a[0], b[0]) + R_SALTO + 1 && v.x < Math.max(a[0], b[0]) - R_SALTO - 1 &&
              y > v.y0 + 1 && y < v.y1 - 1;
          }).map(function (v) { return v.x; }).sort(function (p, q) { return (p - q) * dir; });
          xsCruce.forEach(function (xc) {
            for (var k = 0; k <= 8; k++) {
              var t = Math.PI * k / 8;
              res.push([xc - dir * R_SALTO * Math.cos(t), y - R_SALTO * Math.sin(t)]);
            }
          });
        }
        res.push(b);
      }
      return res;
    }
    function dibujarCable(c) { agregar(trazo(conSaltos(c.pts), { strokeWidth: 1.5, strokeColor: c.color || TINTA })); }
    function punto(px, py) {
      agregar(base("ellipse", { x: px - R_PUNTO, y: py - R_PUNTO, width: 2 * R_PUNTO, height: 2 * R_PUNTO, backgroundColor: TINTA }));
    }

    // 1. variables: nombre, linea (y su NOT con la linea negada)
    ordenLineas.forEach(function (l) {
      if (!l.neg) {
        agregar(texto(l.x, l.top - lh - 6, l.v, tam, fuente, TINTA, "center"));
        agregar(linea(l.x, l.top, [[0, 0], [0, l.bottom - l.top]], cable));
        return;
      }
      // rama al NOT: sale de la linea positiva a la altura Y_NOT
      var lp = lineas[l.v + "+"], gx = lp.x + 14;
      var forma = [], g = compuerta("not", gx, Y_NOT, 1, function (e) { forma.push(e); });
      agregar(trazo([[lp.x, Y_NOT], [gx, Y_NOT]], cable));
      if (lp.bottom > Y_NOT + 0.5) punto(lp.x, Y_NOT);
      forma.forEach(agregar);
      agregar(trazo([[g.xSalida, Y_NOT], [l.x, Y_NOT], [l.x, l.bottom]], cable));
      agregar(texto(l.x + 6, Y_NOT - lh - 2, (negar || function (v) { return v + "'"; })(l.v), tam * 0.8, fuente, GUIA, "left"));
    });

    // 2. compuertas, cada una con sus cables (los que salen de una linea de
    //    variable llevan un punto si la linea sigue mas abajo)
    hojas.forEach(function (h) {
      if (h.tipo === "const") agregar(texto(h.xSalida - 6, h.y - lh / 2, h.nombre, tam, fuente, TINTA, "right"));
    });
    gates.forEach(function (gt) {
      gt.cables.forEach(function (c) {
        dibujarCable(c);
        var hj = c.desde;
        if (hj.linea && hj.y < hj.linea.bottom - 0.5) punto(hj.linea.x, hj.y);
      });
      gt.forma.forEach(agregar);
    });

    // 3. salida
    dibujarCable(salida);
    if (raiz.linea && raiz.y < raiz.linea.bottom - 0.5) punto(raiz.linea.x, raiz.y);
    var xf = salida.pts[1][0];
    agregar(texto(xf + 8, raiz.y - lh / 2, etiqueta, tam, fuente, color, "left"));
  }

  // Dibuja la tabla. (ox, oy) = esquina superior izquierda.
  // ORDEN: marco, linea bajo los encabezados, lineas verticales, lineas entre
  // filas; los encabezados de izquierda a derecha; despues los valores columna
  // por columna (de arriba abajo, en el orden en que se resuelve); la
  // clasificacion y la simplificacion de cada expresion.
  function generarTabla(op, ox, oy, agregar) {
    var t = armarTabla(op), fuente = t.fuente, tam = t.tam, af = t.altoFila;
    var y = oy, alto = tam * fuente.lh + 4;
    if (op.mostrarTabla !== false) {
      var tb = colocarConTitulo(function (ag) { dibujarCuerpoTabla(t, op, 0, 0, ag); }, ox, oy,
        op.titulos && "Tabla de verdad", tam, fuente, agregar);
      y = oy + tb.h + 14;
    }
    if (op.clasificar) {
      t.exprs.forEach(function (e) {
        agregar(texto(ox, y, e.texto + ": " + e.clase, tam, fuente, e.color, "left"));
        y += alto;
      });
    }
    if (op.simplificar) {
      t.exprs.forEach(function (e) {
        var m = imprimirLogica(e.minima, false);
        agregar(texto(ox, y, e.texto + " ≡ " + m + (m === e.texto ? "   (ya es mínima)" : ""), tam, fuente, e.color, "left"));
        y += alto;
      });
    }
    if (op.interruptores) {
      y += 24;
      t.exprs.forEach(function (e) {
        var cuales = op.circuitoDe === "simple" ? [e.minima] : op.circuitoDe === "ambas" ? [e.arbol, e.minima] : [e.arbol];
        if (cuales.length === 2 && imprimirLogica(cuales[1], false) === e.texto) cuales.pop();
        cuales.forEach(function (arbol) {
          // el de la expresion simplificada lo dice en el titulo
          var simp = arbol === e.minima && op.circuitoDe !== "original" ? " (simplificado)" : "";
          var c = colocarConTitulo(function (ag) {
            dibujarInterruptores(arbol, imprimirLogica(arbol, false), e.color, op.diseno, tam, fuente, ag);
          }, ox, y, op.titulos && "Circuito de interruptores" + simp, tam, fuente, agregar);
          y += c.h + 36;
        });
      });
    }
  }

  // ------------------------------------------------ circuito de interruptores
  // La expresion pasa a una red serie-paralelo: ∧ en serie, ∨ en paralelo y
  // en las hojas un interruptor por variable (negada o no). Lo demas se
  // reescribe antes: p → q = ¬p ∨ q; p ↔ q = (p ∧ q) ∨ (¬p ∧ ¬q);
  // p ⊻ q = (p ∧ ¬q) ∨ (¬p ∧ q); y la negacion de algo compuesto se lleva
  // hasta las variables con De Morgan. V es un cable y F un corte.
  function aSerieParalelo(n, neg) {
    var S = function (h) { return { tipo: "serie", hijos: h }; };
    var P = function (h) { return { tipo: "paralelo", hijos: h }; };
    var r = aSerieParalelo;
    if (n.t === "var") return { tipo: "lit", v: n.n, neg: neg };
    if (n.t === "const") return { tipo: "const", v: n.v !== neg };
    if (n.t === "no") return r(n.a, !neg);
    var a = n.a, b = n.b;
    switch (n.op) {
      case "y": return neg ? P([r(a, true), r(b, true)]) : S([r(a, false), r(b, false)]);
      case "o": return neg ? S([r(a, true), r(b, true)]) : P([r(a, false), r(b, false)]);
      case "entonces": return neg ? S([r(a, false), r(b, true)]) : P([r(a, true), r(b, false)]);
    }
    // ⊻ y ↔ (uno es la negacion del otro)
    var distintos = (n.op === "xo") !== neg;
    return distintos ? P([S([r(a, false), r(b, true)]), S([r(a, true), r(b, false)])])
      : P([S([r(a, false), r(b, false)]), S([r(a, true), r(b, true)])]);
  }

  // junta las series dentro de series y los paralelos dentro de paralelos
  function aplanarSP(nd) {
    if (nd.tipo !== "serie" && nd.tipo !== "paralelo") return nd;
    var hijos = [];
    nd.hijos.map(aplanarSP).forEach(function (h) {
      if (h.tipo === nd.tipo) hijos = hijos.concat(h.hijos); else hijos.push(h);
    });
    return { tipo: nd.tipo, hijos: hijos };
  }

  // Medidas: w (ancho), asc / desc (alto por encima / debajo del cable).
  function medirSP(nd, d) {
    if (nd.tipo === "lit") {
      var txt = d.diseno === "casilla" && nd.neg ? "¬" + nd.v : nd.v;
      nd.txt = txt;
      if (d.diseno === "casilla") {
        nd.w = Math.max(76, medir(txt, d.tam, d.fuente) + 52);
        nd.asc = nd.desc = d.caja / 2 + 4;
      } else {
        nd.w = Math.max(76, medir(txt, d.tam, d.fuente) + 40);
        nd.asc = d.lh + 0.45 * (nd.w - 28) + 8;
        nd.desc = 10;
      }
      return;
    }
    if (nd.tipo === "const") { nd.w = 56; nd.asc = nd.desc = 10; return; }
    nd.hijos.forEach(function (h) { medirSP(h, d); });
    if (nd.tipo === "serie") {
      nd.w = nd.hijos.reduce(function (s, h) { return s + h.w; }, 0);
      nd.asc = Math.max.apply(null, nd.hijos.map(function (h) { return h.asc; }));
      nd.desc = Math.max.apply(null, nd.hijos.map(function (h) { return h.desc; }));
      return;
    }
    // paralelo: ramas una debajo de otra; ys relativas al borde de arriba
    var y = 0, ys = [];
    nd.hijos.forEach(function (h, i) {
      if (i) y += d.sep;
      y += h.asc;
      ys.push(y);
      y += h.desc;
    });
    var c = (ys[0] + ys[ys.length - 1]) / 2;
    nd.ys = ys.map(function (v) { return v - c; }); // relativas al cable de entrada
    nd.asc = c;
    nd.desc = y - c;
    nd.w = Math.max.apply(null, nd.hijos.map(function (h) { return h.w; })) + 2 * d.margen;
  }

  function dibujarSP(nd, x, cy, d, agregar) {
    var cable = { strokeWidth: 2 };
    var punto = function (px, py) {
      agregar(base("ellipse", { x: px - 3.5, y: py - 3.5, width: 7, height: 7, backgroundColor: TINTA }));
    };
    if (nd.tipo === "lit") {
      if (d.diseno === "casilla") {
        // un espacio en blanco en el cable con la variable escrita (y ¬ si esta negada)
        var bx = x + 16, bw = nd.w - 32;
        agregar(linea(x, cy, [[0, 0], [bx - x, 0]], cable));
        agregar(texto(bx + bw / 2, cy - d.lh / 2, nd.txt, d.tam, d.fuente, d.color, "center"));
        agregar(linea(bx + bw, cy, [[0, 0], [x + nd.w - bx - bw, 0]], cable));
        return;
      }
      // contactos y palanca: cerrada si la variable va sin negar, abierta si va negada
      var c1 = x + 14, c2 = x + nd.w - 14, r = 3.5;
      agregar(linea(x, cy, [[0, 0], [c1 - r - x, 0]], cable));
      agregar(base("ellipse", { x: c1 - r, y: cy - r, width: 2 * r, height: 2 * r, strokeWidth: 2 }));
      agregar(base("ellipse", { x: c2 - r, y: cy - r, width: 2 * r, height: 2 * r, strokeWidth: 2 }));
      var largo = c2 - c1;
      agregar(nd.neg
        ? linea(c1 + 2, cy - 2, [[0, 0], [largo * 0.9, -largo * 0.45]], { strokeWidth: 2.5, strokeColor: d.color })
        : linea(c1 + 2, cy - 2, [[0, 0], [largo - 4, 0]], { strokeWidth: 2.5, strokeColor: d.color }));
      agregar(linea(c2 + r, cy, [[0, 0], [x + nd.w - c2 - r, 0]], cable));
      agregar(texto(x + nd.w / 2, cy - nd.asc + 2, nd.txt, d.tam, d.fuente, d.color, "center"));
      return;
    }
    if (nd.tipo === "const") { // V: cable; F: cable cortado
      if (nd.v) agregar(linea(x, cy, [[0, 0], [nd.w, 0]], cable));
      else {
        agregar(linea(x, cy, [[0, 0], [nd.w * 0.35, 0]], cable));
        agregar(linea(x + nd.w * 0.65, cy, [[0, 0], [nd.w * 0.35, 0]], cable));
      }
      return;
    }
    if (nd.tipo === "serie") {
      var cx = x;
      nd.hijos.forEach(function (h) { dibujarSP(h, cx, cy, d, agregar); cx += h.w; });
      return;
    }
    // paralelo: barra a cada lado y una rama por hijo
    var x2 = x + nd.w, y1 = cy + nd.ys[0], y2 = cy + nd.ys[nd.ys.length - 1];
    agregar(linea(x, y1, [[0, 0], [0, y2 - y1]], cable));
    agregar(linea(x2, y1, [[0, 0], [0, y2 - y1]], cable));
    punto(x, cy);
    punto(x2, cy);
    nd.hijos.forEach(function (h, i) {
      var yi = cy + nd.ys[i];
      if (i > 0 && i < nd.hijos.length - 1 && Math.abs(yi - cy) > 1) { punto(x, yi); punto(x2, yi); }
      agregar(linea(x, yi, [[0, 0], [d.margen, 0]], cable));
      dibujarSP(h, x + d.margen, yi, d, agregar);
      var fin = x + d.margen + h.w;
      if (x2 - fin > 0.5) agregar(linea(fin, yi, [[0, 0], [x2 - fin, 0]], cable));
    });
  }

  // Circuito de interruptores de una expresion, entre dos bornes, con la
  // expresion escrita arriba. diseno: "abierto" (interruptor cerrado = variable,
  // abierto = variable negada; solo se escribe la letra) o "casilla" (espacios
  // en blanco con la variable, con ¬ si esta negada).
  // ORDEN: titulo, borne de entrada y de izquierda a derecha los interruptores
  // (en un paralelo, rama por rama de arriba abajo); el borne de salida al final.
  function dibujarInterruptores(arbol, etiqueta, color, diseno, tam, fuente, agregar) {
    var lh = tam * fuente.lh;
    var d = { diseno: diseno === "casilla" ? "casilla" : "abierto", tam: tam, fuente: fuente, lh: lh,
      caja: Math.round(lh + 14), sep: Math.max(16, tam), margen: 24, color: color };
    var nd = aplanarSP(aSerieParalelo(arbol, false));
    medirSP(nd, d);
    var cy = lh + 16 + nd.asc, borne = 6, x0 = 0, lead = 34;
    agregar(texto(0, 0, etiqueta, tam, fuente, color, "left"));
    agregar(base("ellipse", { x: x0, y: cy - borne, width: 2 * borne, height: 2 * borne, strokeWidth: 2 }));
    agregar(linea(x0 + 2 * borne, cy, [[0, 0], [lead, 0]], { strokeWidth: 2 }));
    var xi = x0 + 2 * borne + lead;
    dibujarSP(nd, xi, cy, d, agregar);
    var xf = xi + nd.w;
    agregar(linea(xf, cy, [[0, 0], [lead, 0]], { strokeWidth: 2 }));
    agregar(base("ellipse", { x: xf + lead, y: cy - borne, width: 2 * borne, height: 2 * borne, strokeWidth: 2 }));
  }

  function dibujarCuerpoTabla(t, op, ox, oy, agregar) {
    var fuente = t.fuente, tam = t.tam, af = t.altoFila;
    agregar(base("rectangle", { x: ox, y: oy, width: t.W, height: t.H, strokeWidth: 2 }));
    agregar(linea(ox, oy + af, [[0, 0], [t.W, 0]], { strokeWidth: 2 }));
    var xs = [ox];
    t.anchos.forEach(function (a, j) { xs.push(xs[j] + a); });
    for (var j = 1; j < t.cols.length; j++) {
      // linea mas gruesa entre las variables y las columnas calculadas
      agregar(linea(xs[j], oy, [[0, 0], [0, t.H]], { strokeWidth: j === t.vars.length ? 2 : 1 }));
    }
    if (op.lineasFilas) {
      for (var r = 1; r < t.nFilas; r++)
        agregar(linea(ox, oy + af * (r + 1), [[0, 0], [t.W, 0]], { strokeWidth: 1 }));
    }
    var dy = (af - tam * fuente.lh) / 2;
    t.cols.forEach(function (c, j) {
      agregar(texto((xs[j] + xs[j + 1]) / 2, oy + dy, c.texto, tam, fuente, c.color, "center"));
    });
    t.cols.forEach(function (c, j) {
      if (op.ocultar && !c.variable) return; // para completar a mano
      c.valores.forEach(function (v, r) {
        agregar(texto((xs[j] + xs[j + 1]) / 2, oy + af * (r + 1) + dy, v ? t.V : t.F, tam, fuente, c.color, "center"));
      });
    });
  }

  function erroresLogica(t, op) {
    var r = analizarLogica(t, leerVariables(op).vars);
    return r.error ? [r.error] : [];
  }

  // ========================================== GENERADOR: ALGEBRA DE BOOLE
  // Mismas variables que la tabla de verdad, en notacion de Boole:
  //   suma (O): +  ∨  |      producto (Y): AB  A·B  A*B  ∧  &
  //   negacion: A'  (A + B)'  ¬A  ~A  !A      O exclusivo: ⊕    equivalencia: ⊙
  //   constantes 0 y 1. Si todas las variables son de una letra, AB es A·B.
  // Una funcion tambien se puede dar por sus indices: m(1, 3, 5) (o Σm(...))
  // son los minitérminos; M(0, 2) (o ΠM(...)), los maxitérminos.
  // El indice de una fila es el numero binario de sus valores, con la primera
  // variable como bit mas significativo (con A, B, C: m5 = AB'C).
  var NOMBRES_BOOLE = ["F", "G", "H", "K", "L", "Q"];
  function nombreBoole(i) { return NOMBRES_BOOLE[i % NOMBRES_BOOLE.length]; }
  var SIMBOLOS_BOOLE = [
    ["⊕", "xo"], ["⊙", "sii"], ["'", "prima"], ["’", "prima"], ["′", "prima"],
    ["¬", "no"], ["~", "no"], ["!", "no"], ["+", "o"], ["∨", "o"], ["|", "o"],
    ["·", "y"], ["⋅", "y"], ["*", "y"], ["∧", "y"], ["&", "y"], [".", "y"],
    ["(", "("], ["[", "("], [")", ")"], ["]", ")"],
  ];

  // { arbol, valores } o { indices: "m" | "M", lista, valores } o { error }.
  // valores[m] = valor de la funcion en la fila de indice m.
  function analizarBoole(texto, vars) {
    var s = String(texto || "").trim(), n = vars.length, total = 1 << n;
    if (!s) return { error: "Escribí una expresión (AB + A'C) o los minitérminos m(1, 3, 5)" };
    var mi = /^(?:[Σ∑Π∏]\s*)?(m|M)\s*\(([\d\s,;]*)\)$/.exec(s);
    if (mi) {
      var nums = mi[2].split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean).map(Number);
      var malos = nums.filter(function (x) { return !(x >= 0 && x < total); });
      if (malos.length) {
        return { error: "No existe " + mi[1] + "(" + malos.join(", ") + ") con " + n +
          (n > 1 ? " variables" : " variable") + ": van de 0 a " + (total - 1) };
      }
      var en = {};
      nums.forEach(function (x) { en[x] = true; });
      var valores = [];
      for (var m = 0; m < total; m++) valores.push(mi[1] === "m" ? !!en[m] : !en[m]);
      return { indices: mi[1], lista: Object.keys(en).map(Number).sort(function (a, b) { return a - b; }), valores: valores };
    }
    var simple = vars.every(function (v) { return v.length === 1; });
    try {
      var tk = [], i = 0;
      while (i < s.length) {
        if (/\s/.test(s[i])) { i++; continue; }
        var sim = null;
        for (var k = 0; k < SIMBOLOS_BOOLE.length && !sim; k++) if (s.indexOf(SIMBOLOS_BOOLE[k][0], i) === i) sim = SIMBOLOS_BOOLE[k];
        if (sim) { tk.push({ t: sim[1], txt: sim[0] }); i += sim[0].length; continue; }
        if (s[i] === "0" || s[i] === "1") { tk.push({ t: "const", v: s[i] === "1", txt: s[i] }); i++; continue; }
        var mm = IDENT.exec(s.slice(i));
        if (!mm) throw "No se entiende «" + s[i] + "»";
        var w = simple ? s[i] : mm[0];
        if (vars.indexOf(w) < 0) {
          throw "«" + w + "» no es una variable (las variables son " + vars.join(", ") + ")";
        }
        tk.push({ t: "var", n: w, txt: w });
        i += w.length;
      }
      i = 0;
      var es = function (t) { return tk[i] && tk[i].t === t; };
      var empieza = function () { return tk[i] && /^(var|const|\(|no)$/.test(tk[i].t); };
      var expr = function () {
        var a = term();
        while (es("o") || es("xo") || es("sii")) { var o = tk[i++].t; a = { t: "bin", op: o, a: a, b: term() }; }
        return a;
      };
      var term = function () {
        var a = factor();
        for (;;) {
          if (es("y")) { i++; a = { t: "bin", op: "y", a: a, b: factor() }; }
          else if (empieza()) a = { t: "bin", op: "y", a: a, b: factor() }; // AB = A·B
          else return a;
        }
      };
      var factor = function () {
        if (es("no")) { i++; return { t: "no", a: factor() }; }
        var a = atomo();
        while (es("prima")) { i++; a = { t: "no", a: a }; }
        return a;
      };
      var atomo = function () {
        var k2 = tk[i];
        if (!k2) throw i ? "Falta algo después de «" + tk[i - 1].txt + "»" : "Expresión vacía";
        i++;
        if (k2.t === "var") return { t: "var", n: k2.n };
        if (k2.t === "const") return { t: "const", v: k2.v, txt: k2.txt };
        if (k2.t === "(") {
          var e = expr();
          if (!es(")")) throw "Falta cerrar «" + k2.txt + "»";
          i++;
          return e;
        }
        if (k2.t === ")") throw "Sobra «" + k2.txt + "» o falta algo antes";
        if (k2.t === "prima") throw "La ' va después de una variable o de un paréntesis: A' o (A + B)'";
        throw "Falta algo antes de «" + k2.txt + "»";
      };
      var arbol = expr();
      if (i < tk.length) throw tk[i].t === ")" ? "Sobra «" + tk[i].txt + "»" : "No se entiende «" + tk[i].txt + "»";
      var vals = [];
      for (var m2 = 0; m2 < total; m2++) {
        var env = {};
        vars.forEach(function (v, j) { env[v] = ((m2 >> (n - 1 - j)) & 1) === 1; });
        vals.push(valorLogico(arbol, env));
      }
      return { arbol: arbol, valores: vals };
    } catch (e) {
      if (typeof e === "string") return { error: e };
      throw e;
    }
  }

  // formato de escritura: prima (A') o barra (¬A); junto (AB) o con punto (A·B)
  function formatoBoole(op, vars) {
    var prima = op.negacion !== "barra";
    var f = { prima: prima, junto: prima && op.producto !== "punto" && vars.every(function (v) { return v.length === 1; }) };
    f.neg = function (v) { return prima ? v + "'" : "¬" + v; };
    f.por = f.junto ? "" : "·";
    return f;
  }

  // expresion en notacion de Boole, con los parentesis justos
  function imprimirBoole(n, fmt) {
    function cadena(m, op, res) {
      if (m.t === "bin" && m.op === op) { cadena(m.a, op, res); cadena(m.b, op, res); } else res.push(m);
      return res;
    }
    function rec(m) {
      if (m.t === "var") return m.n;
      if (m.t === "const") return m.v ? "1" : "0";
      if (m.t === "no") {
        if (m.a.t === "var" || m.a.t === "const") return fmt.neg(rec(m.a));
        return fmt.prima ? "(" + rec(m.a) + ")'" : "¬(" + rec(m.a) + ")";
      }
      if (m.op === "y") {
        return cadena(m, "y", []).map(function (h) { return h.t === "bin" ? "(" + rec(h) + ")" : rec(h); }).join(fmt.por);
      }
      if (m.op === "o") {
        return cadena(m, "o", []).map(function (h) { return h.t === "bin" && h.op !== "y" ? "(" + rec(h) + ")" : rec(h); }).join(" + ");
      }
      var s = m.op === "xo" ? " ⊕ " : " ⊙ ";
      var lado = function (h) { return h.t === "bin" && h.op !== "y" ? "(" + rec(h) + ")" : rec(h); };
      return lado(m.a) + s + lado(m.b);
    }
    return rec(n);
  }

  // literales de un implicante (bits fijos): en la suma de productos la
  // variable va tal cual si su bit es 1; en el producto de sumas, si es 0
  function literalesImplicante(p, vars, fnc, fmt) {
    var n = vars.length, lits = [];
    vars.forEach(function (v, j) {
      var bit = 1 << (n - 1 - j);
      if (p.x & bit) return;
      lits.push(!!(p.v & bit) !== fnc ? v : fmt.neg(v));
    });
    return lits;
  }
  function textoImplicante(p, vars, fnc, fmt, conParentesis) {
    var lits = literalesImplicante(p, vars, fnc, fmt);
    if (!lits.length) return fnc ? "0" : "1";
    if (!fnc) return lits.join(fmt.por);
    return conParentesis && lits.length > 1 ? "(" + lits.join(" + ") + ")" : lits.join(" + ");
  }

  // arbol de una suma de productos (fnc = false) o producto de sumas (true)
  function arbolDeCobertura(cob, vars, fnc) {
    var n = vars.length;
    if (!cob.length) return { t: "const", v: fnc, txt: fnc ? "1" : "0" };
    return cob.map(function (p) {
      var lits = [];
      vars.forEach(function (v, j) {
        var bit = 1 << (n - 1 - j);
        if (p.x & bit) return;
        lits.push(!!(p.v & bit) !== fnc ? { t: "var", n: v } : { t: "no", a: { t: "var", n: v } });
      });
      if (!lits.length) return { t: "const", v: !fnc, txt: fnc ? "0" : "1" };
      return lits.reduce(function (a, b) { return { t: "bin", op: fnc ? "o" : "y", a: a, b: b }; });
    }).reduce(function (a, b) { return { t: "bin", op: fnc ? "y" : "o", a: a, b: b }; });
  }

  // Escribe piezas de texto de colores en una linea que se corta (antes de una
  // pieza con corte: true) si no entra en maxW; las lineas siguientes van con
  // sangria hasta el final de la primera pieza. Devuelve la y siguiente.
  function escribirPiezas(x0, y0, piezas, maxW, tam, fuente, agregar) {
    var alto = tam * fuente.lh + 6, y = y0, run = null, xFin = x0, sangria = 0;
    var ancho = function (t) { return medir(t, tam, fuente); };
    function emitir() {
      if (run && run.t.trim()) agregar(texto(run.x, y, run.t, tam, fuente, run.color, "left"));
      if (run) xFin = run.x + ancho(run.t);
    }
    piezas.forEach(function (p, i) {
      var fin = run ? run.x + ancho(run.t) : xFin;
      var t = p.t;
      if (i > 0 && p.corte && fin + ancho(t.replace(/\s+$/, "")) > x0 + maxW && fin > x0 + sangria + 1) {
        emitir();
        y += alto;
        run = null;
        xFin = x0 + sangria;
        fin = xFin;
        t = t.replace(/^\s+/, "");
      }
      if (run && run.color === p.color) run.t += t;
      else { emitir(); run = { x: fin, t: t, color: p.color }; }
      if (i === 0) sangria = Math.min(ancho(t), maxW / 2);
    });
    emitir();
    return y + alto;
  }

  // tabla de verdad compacta: indice, variables y la funcion (con 0 y 1)
  function dibujarTablaBoole(vars, valores, nombre, color, tam, fuente, agregar) {
    var lh = tam * fuente.lh, af = Math.round(lh + tam * 0.5), pad = Math.round(tam * 0.55);
    var cols = [{ t: "m", color: GUIA }].concat(vars.map(function (v) { return { t: v, color: TINTA }; }), [{ t: nombre, color: color }]);
    var anchos = cols.map(function (c) { return Math.max(medir(c.t, tam, fuente), medir(String(valores.length - 1), tam, fuente), tam) + 2 * pad; });
    var xs = [0];
    anchos.forEach(function (a, j) { xs.push(xs[j] + a); });
    var W = xs[xs.length - 1], H = af * (valores.length + 1), dy = (af - lh) / 2;
    agregar(base("rectangle", { x: 0, y: 0, width: W, height: H, strokeWidth: 2 }));
    agregar(linea(0, af, [[0, 0], [W, 0]], { strokeWidth: 2 }));
    for (var j = 1; j < cols.length; j++) {
      agregar(linea(xs[j], 0, [[0, 0], [0, H]], { strokeWidth: j === 1 || j === cols.length - 1 ? 2 : 1 }));
    }
    cols.forEach(function (c, j) { agregar(texto((xs[j] + xs[j + 1]) / 2, dy, c.t, tam, fuente, c.color, "center")); });
    var n = vars.length;
    valores.forEach(function (v, m) {
      var y = af * (m + 1) + dy;
      agregar(texto(xs[0] + anchos[0] / 2, y, String(m), tam, fuente, GUIA, "center"));
      vars.forEach(function (x, j) {
        agregar(texto((xs[j + 1] + xs[j + 2]) / 2, y, String((m >> (n - 1 - j)) & 1), tam, fuente, TINTA, "center"));
      });
      agregar(texto((xs[n + 1] + xs[n + 2]) / 2, y, v ? "1" : "0", tam, fuente, color, "center"));
    });
  }

  // Mapa de Karnaugh (1 a 4 variables): filas con las primeras variables y
  // columnas con las ultimas, en codigo Gray (00, 01, 11, 10). Cada grupo de
  // la cobertura es un rectangulo de color (partido si da la vuelta por el borde).
  function dibujarKarnaugh(vars, valores, cob, fnc, fmt, indices, tam, fuente, agregar) {
    var n = vars.length, nr = n >> 1, nc = n - nr, lh = tam * fuente.lh;
    var gray = function (k) { return k === 0 ? [0] : k === 1 ? [0, 1] : [0, 1, 3, 2]; };
    var R = gray(nr), C = gray(nc), s = Math.max(tam * 2.4, 46);
    var bits = function (v, k) { var t = v.toString(2); while (t.length < k) t = "0" + t; return t; };
    var sep = fmt.junto ? "" : ",";
    var esquina = (nr ? vars.slice(0, nr).join(sep) + " \\ " : "") + vars.slice(nr).join(sep);
    var anchoFilas = R.reduce(function (m, r) { return Math.max(m, medir(bits(r, nr), tam, fuente)); }, 0);
    var gx = Math.max(anchoFilas + 16, medir(esquina, tam, fuente) + 12), gy = lh + 12;
    var W = C.length * s, H = R.length * s;
    agregar(base("rectangle", { x: gx, y: gy, width: W, height: H, strokeWidth: 2 }));
    for (var c = 1; c < C.length; c++) agregar(linea(gx + c * s, gy, [[0, 0], [0, H]], { strokeWidth: 1 }));
    for (var r = 1; r < R.length; r++) agregar(linea(gx, gy + r * s, [[0, 0], [W, 0]], { strokeWidth: 1 }));
    agregar(texto(gx - 8, 0, esquina, tam, fuente, TINTA, "right"));
    C.forEach(function (cv, ci) { agregar(texto(gx + (ci + 0.5) * s, 0, bits(cv, nc), tam, fuente, TINTA, "center")); });
    if (nr) R.forEach(function (rv, ri) { agregar(texto(gx - 8, gy + (ri + 0.5) * s - lh / 2, bits(rv, nr), tam, fuente, TINTA, "right")); });
    var chico = Math.max(10, Math.round(tam * 0.55));
    R.forEach(function (rv, ri) {
      C.forEach(function (cv, ci) {
        var m = (rv << nc) | cv, x = gx + ci * s, y = gy + ri * s;
        if (indices) agregar(texto(x + 4, y + 2, String(m), chico, fuente, GUIA, "left"));
        agregar(texto(x + s / 2, y + (s - lh) / 2, valores[m] ? "1" : "0", tam, fuente, valores[m] ? TINTA : GUIA, "center"));
      });
    });
    var filasFijas = ((1 << nr) - 1) << nc, colsFijas = (1 << nc) - 1;
    var tramos = function (ok) {
      var res = [], ini = -1;
      ok.forEach(function (v, i) {
        if (v && ini < 0) ini = i;
        if (!v && ini >= 0) { res.push([ini, i - 1]); ini = -1; }
      });
      if (ini >= 0) res.push([ini, ok.length - 1]);
      return res;
    };
    cob.forEach(function (p, g) {
      var fr = ~p.x & filasFijas, fc = ~p.x & colsFijas;
      var filas = tramos(R.map(function (rv) { return ((rv << nc) & fr) === (p.v & fr); }));
      var columnas = tramos(C.map(function (cv) { return (cv & fc) === (p.v & fc); }));
      var inset = 5 + (g % 4) * 3, colorG = COLORES[g % COLORES.length];
      filas.forEach(function (fr2) {
        columnas.forEach(function (cr) {
          agregar(base("rectangle", {
            x: gx + cr[0] * s + inset, y: gy + fr2[0] * s + inset,
            width: (cr[1] - cr[0] + 1) * s - 2 * inset, height: (fr2[1] - fr2[0] + 1) * s - 2 * inset,
            strokeColor: colorG, strokeWidth: 2, roundness: { type: 3 },
          }));
        });
      });
    });
  }

  // Por cada funcion, de arriba abajo: su definicion; la tabla y el mapa de
  // Karnaugh (uno al lado del otro); las formas canonicas; la simplificada
  // (con cada termino del color de su grupo en el mapa) y los circuitos.
  function generarBoole(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var vars = leerVariables(op).vars, n = vars.length, fmt = formatoBoole(op, vars);
    var fnc = op.agrupar === "max", maxW = 1000, y = oy;
    var escribir = function (piezas) { y = escribirPiezas(ox, y, piezas, maxW, tam, fuente, agregar); };
    // una lista de terminos como piezas: "F = t1 + t2 + ..."
    var terminos = function (prefijo, color, lista, sep) {
      var piezas = [{ t: prefijo, color: color }];
      lista.forEach(function (t, j) {
        if (j) piezas.push({ t: sep, color: TINTA });
        piezas.push({ t: t.t, color: t.color || color, corte: j > 0 });
      });
      return piezas;
    };
    var colocar = function (dibujar, x, yTop, titulo) {
      return colocarConTitulo(dibujar, x, yTop, op.titulos && titulo, tam, fuente, agregar);
    };

    op.filas.forEach(function (f, i) {
      var nombre = String(f.nombre || "").trim() || nombreBoole(i);
      var r = analizarBoole(f.texto, vars);
      if (r.error) return;
      var color = f.color, valores = r.valores;
      var unos = [], ceros = [];
      valores.forEach(function (v, m) { (v ? unos : ceros).push(m); });
      var def = r.indices ? (r.indices === "m" ? "Σm(" : "ΠM(") + r.lista.join(", ") + ")" : imprimirBoole(r.arbol, fmt);
      escribir([{ t: nombre + " = " + def, color: color }]);
      y += 10;

      // tabla y mapa
      var cob = coberturaLogica(valores, n, fnc), conMapa = op.karnaugh && n <= 4;
      var x = ox, alto = 0;
      if (op.tabla) {
        var tb = colocar(function (ag) { dibujarTablaBoole(vars, valores, nombre, color, tam, fuente, ag); }, x, y, "Tabla de verdad");
        x += tb.w + 60;
        alto = Math.max(alto, tb.h);
      }
      if (conMapa) {
        var km = colocar(function (ag) { dibujarKarnaugh(vars, valores, cob, fnc, fmt, op.indices, tam, fuente, ag); }, x, y,
          "Mapa de Karnaugh (" + (fnc ? "maxitérminos" : "minitérminos") + ")");
        alto = Math.max(alto, km.h);
      }
      if (alto) y += alto + 20;
      if (op.karnaugh && n > 4) escribir([{ t: "(El mapa de Karnaugh se dibuja hasta 4 variables)", color: GUIA }]);

      // formas canonicas
      if (op.minterminos) {
        escribir([{ t: nombre + " = Σm(" + unos.join(", ") + ")", color: color }]);
        escribir(terminos(nombre + " = ", color, unos.length ? unos.map(function (m) {
          return { t: textoImplicante({ v: m, x: 0 }, vars, false, fmt) };
        }) : [{ t: "0" }], " + "));
      }
      if (op.maxiterminos) {
        escribir([{ t: nombre + " = ΠM(" + ceros.join(", ") + ")", color: color }]);
        escribir(terminos(nombre + " = ", color, ceros.length ? ceros.map(function (m) {
          return { t: textoImplicante({ v: m, x: 0 }, vars, true, fmt, ceros.length > 1) };
        }) : [{ t: "1" }], fmt.por));
      }

      // simplificada (con el color de cada grupo si se dibuja el mapa)
      var simple = arbolDeCobertura(cob, vars, fnc);
      if (op.simplificar) {
        var lista = cob.length ? cob.map(function (p, g) {
          return { t: textoImplicante(p, vars, fnc, fmt, cob.length > 1), color: conMapa ? COLORES[g % COLORES.length] : color };
        }) : [{ t: fnc ? "1" : "0" }];
        var piezas = terminos(nombre + " = ", color, lista, fnc ? fmt.por : " + ");
        piezas.unshift({ t: "Simplificada (" + (fnc ? "maxitérminos" : "minitérminos") + "): ", color: GUIA });
        escribir(piezas);
      }

      // circuitos
      if (op.circuito) {
        var escrita = r.arbol || arbolDeCobertura((r.indices === "m" ? unos : ceros).map(function (m) {
          return { v: m, x: 0 };
        }), vars, r.indices === "M");
        var cuales = op.circuitoDe === "simple" ? [simple] : op.circuitoDe === "escrita" ? [escrita] : [escrita, simple];
        if (cuales.length === 2 && imprimirBoole(cuales[0], fmt) === imprimirBoole(cuales[1], fmt)) cuales.pop();
        y += 20;
        cuales.forEach(function (arbol, k) {
          // el de la expresion simplificada lo dice en el titulo; si se dibujan
          // los dos, el otro aclara que es el de la expresion escrita
          var cual = arbol === simple && op.circuitoDe !== "escrita" && (cuales.length === 2 || op.circuitoDe === "simple")
            ? " (simplificado)" : cuales.length === 2 ? " (expresión escrita)" : "";
          var c = colocar(function (ag) {
            dibujarCircuito(arbol, vars, nombre + " = " + imprimirBoole(arbol, fmt), color, tam, fuente, ag, fmt.neg);
          }, ox, y, "Circuito lógico" + cual);
          y += c.h + 40;
        });
      }
      y += 40;
    });
  }

  function erroresBoole(t, op) {
    var r = analizarBoole(t, leerVariables(op).vars);
    return r.error ? [r.error] : [];
  }

  // ============================================== GENERADOR: CONJUNTOS
  // Un universo U (finito, escrito por extension, o ℕ, ℤ, ℚ, ℝ) y una fila por
  // conjunto. Cada fila puede ser:
  //  - por extension: {1, 2, 3}, {a, e, i}, {1, 2, ..., 10}, {1..10}
  //  - por comprension: una funcion de JavaScript que recibe cada elemento de U
  //    y devuelve verdadero o falso: x => x % 2 == 0
  //  - una operacion con los conjuntos de las filas anteriores:
  //    A ∪ B, A ∩ B, A − B, A Δ B, A' (complemento), A × B, P(A), (A ∪ B)'
  // Elementos: { v: valor, t: texto a mostrar, k: clave para comparar }.
  // Conjuntos: { lista: elementos (si se conocen todos) o null, tiene(e), deU }.
  var UNIVERSOS = { N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ" };
  var NOMBRES_CONJ = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
  var ANCHOS_CONJ = { angosto: 600, medio: 900, ancho: 1200 };
  var BUSQUEDA = 20000; // elementos de un universo infinito que se revisan como maximo
  var SIM_CONJ = { union: "∪", inter: "∩", dif: "−", simdif: "Δ", prod: "×" };
  var OPS_CONJ = [
    ["∪", "union"], ["|", "union"], ["+", "union"], ["∩", "inter"], ["&", "inter"],
    ["−", "dif"], ["-", "dif"], ["∖", "dif"], ["\\", "dif"], ["–", "dif"],
    ["Δ", "simdif"], ["∆", "simdif"], ["△", "simdif"], ["⊕", "simdif"], ["^", "simdif"],
    ["×", "prod"], ["*", "prod"], ["'", "comp"], ["′", "comp"], ["ᶜ", "comp"],
    ["~", "neg"], ["¬", "neg"], ["∅", "vacio"],
    ["(", "("], ["[", "("], [")", ")"], ["]", ")"],
  ];

  function nombreConj(i) { return NOMBRES_CONJ[i % NOMBRES_CONJ.length]; }
  function claveNum(v) { return "n:" + Number(v.toPrecision(12)); }
  function elemNum(v, t) { return { v: v, t: t != null ? t : formatear(v), k: claveNum(v) }; }
  function elemTxt(s) { return { v: s, t: s, k: "s:" + s }; }

  // Elementos escritos por extension, con o sin llaves. Separados por coma (o
  // por punto y coma si hay decimales con coma). "1, 2, ..., 10" y "1..10"
  // completan la sucesion. Lo que no es un numero queda como texto.
  function leerElementos(texto) {
    var t = String(texto || "").trim(), errores = [];
    if (t[0] === "{") {
      if (t[t.length - 1] !== "}") return { elems: [], errores: ["Falta cerrar la llave }"] };
      t = t.slice(1, -1);
    }
    if (!t.trim()) return { elems: [], errores: [] };
    var SUSP = {}, res = [];
    t.split(t.indexOf(";") >= 0 ? ";" : ",").forEach(function (p) {
      p = p.trim();
      if (!p) { errores.push("Hay un elemento vacío (dos comas seguidas)"); return; }
      if (p === "..." || p === "…") { res.push(SUSP); return; }
      var m = /^([+-]?\d+)\s*\.\.\s*([+-]?\d+)$/.exec(p.replace(/[−–]/g, "-"));
      if (m) {
        var a = Number(m[1]), b = Number(m[2]), d = a <= b ? 1 : -1;
        if (Math.abs(b - a) > 10000) { errores.push("«" + p + "» tiene demasiados elementos"); return; }
        for (var x = a; d > 0 ? x <= b : x >= b; x += d) res.push(elemNum(x));
        return;
      }
      var q = /^["'](.*)["']$/.exec(p);
      if (q) { res.push(elemTxt(q[1])); return; }
      var v = evaluar(p);
      res.push(isNaN(v) ? elemTxt(p) : elemNum(v, p.replace(/^-/, "−")));
    });
    // puntos suspensivos entre dos numeros: 1, 2, ..., 10 o 2, 4, ..., 20
    var elems = [];
    res.forEach(function (e, j) {
      if (e !== SUSP) { elems.push(e); return; }
      var a = res[j - 1], b = res[j + 1], c = res[j - 2];
      var num = function (z) { return z && z !== SUSP && typeof z.v === "number"; };
      if (!num(a) || !num(b)) { errores.push("Los … tienen que ir entre dos números: 1, 2, ..., 10"); return; }
      var paso = num(c) ? a.v - c.v : (b.v >= a.v ? 1 : -1);
      var n = (b.v - a.v) / paso;
      if (!paso || n < 1 || Math.abs(n - Math.round(n)) > 1e-9) {
        errores.push("No se puede ir de " + a.t + " a " + b.t + " de " + formatear(Math.abs(paso)) + " en " + formatear(Math.abs(paso)));
        return;
      }
      if (n > 10000) { errores.push("Los … generan demasiados elementos"); return; }
      for (var i = 1; i < Math.round(n); i++) elems.push(elemNum(a.v + i * paso));
    });
    var vistos = {};
    elems = elems.filter(function (e) { if (vistos[e.k]) return false; vistos[e.k] = true; return true; });
    return { elems: elems, errores: errores };
  }

  function mcd(a, b) { while (b) { var r = a % b; a = b; b = r; } return a; }

  // recorre un universo infinito: ℕ = 1, 2, 3...; ℤ = 0, 1, −1, 2, −2...;
  // ℚ por "altura" |p| + q: 0, 1, −1, 2, −2, 1/2, −1/2, 3, −3, 1/3...
  function enumerador(tipo, cero) {
    if (tipo === "N") { var n = cero ? 0 : 1; return function () { return elemNum(n++); }; }
    if (tipo === "Z") {
      var z = 0;
      return function () { var i = z++; return elemNum(i === 0 ? 0 : i % 2 ? (i + 1) / 2 : -i / 2); };
    }
    var pend = [], h = 1;
    return function () {
      while (!pend.length) {
        for (var q = 1; q <= h; q++) {
          var p = h - q;
          if (p === 0) { if (q === 1) pend.push(elemNum(0, "0")); continue; }
          if (mcd(p, q) !== 1) continue;
          var t = q === 1 ? String(p) : p + "/" + q;
          pend.push(elemNum(p / q, t), elemNum(-p / q, "−" + t));
        }
        h++;
      }
      return pend.shift();
    };
  }

  function leerUniverso(op) {
    var tipo = op.universo;
    if (UNIVERSOS[tipo]) {
      var cero = tipo === "N" && !!op.conCero;
      return {
        infinito: true, tipo: tipo, simbolo: cero ? "ℕ₀" : UNIVERSOS[tipo], lista: null, error: "",
        contiene: function (e) {
          if (typeof e.v !== "number" || !isFinite(e.v)) return false;
          if (tipo === "Q" || tipo === "R") return true;
          return Number.isInteger(e.v) && (tipo === "Z" || e.v >= (cero ? 0 : 1));
        },
        enumerar: tipo === "R" ? null : function () { return enumerador(tipo, cero); },
      };
    }
    var r = leerElementos(op.universoTexto), claves = {};
    r.elems.forEach(function (e) { claves[e.k] = true; });
    return {
      infinito: false, simbolo: "U", lista: r.elems,
      error: r.errores.join(" · ") || (r.elems.length ? "" : "Escribí los elementos de U, por ejemplo 1, 2, ..., 10"),
      contiene: function (e) { return !!claves[e.k]; },
    };
  }

  // conjunto con todos sus elementos conocidos (en un orden lindo: el de U si
  // es finito, de menor a mayor si son numeros)
  function desdeLista(lista, U, deU) {
    var claves = {}, sin = [];
    lista.forEach(function (e) { if (!claves[e.k]) { claves[e.k] = true; sin.push(e); } });
    if (deU && !U.infinito) sin = U.lista.filter(function (e) { return claves[e.k]; });
    else if (sin.every(function (e) { return typeof e.v === "number"; })) sin.sort(function (a, b) { return a.v - b.v; });
    return { lista: sin, tiene: function (e) { return !!claves[e.k]; }, deU: deU };
  }

  // elemento a partir de un valor que usa una funcion (numero o texto)
  function elemDeValor(v) {
    if (typeof v === "number") return elemNum(v);
    if (typeof v === "string") return elemTxt(v);
    return { v: v, t: String(v), k: "?" };
  }

  // Compila la funcion de una fila por comprension. Adentro se pueden usar
  // Math sin prefijo y los conjuntos de las filas anteriores como funciones
  // que dicen si un valor pertenece: x => A(x) && !B(x). Cada fila tiene su
  // propio ambito (solo ve los conjuntos definidos antes que ella), asi que no
  // hay referencias circulares. Un conjunto que se llame como algo de Math (E)
  // lo tapa.
  // rels (opcional): relaciones de filas anteriores, usables como R(x, y)
  function compilarCondicion(src, conj, rels) {
    if (/[^*]\^|^\^/.test(src)) return { error: "En JavaScript la potencia es ** (x**2); ^ es otra operación" };
    var ambito = {};
    Object.keys(conj).forEach(function (n) {
      var S = conj[n];
      ambito[n] = function (v) { return S.tiene(elemDeValor(v)); };
    });
    Object.keys(rels || {}).forEach(function (n) {
      var R = rels[n];
      ambito[n] = function (x, y) { return R.tiene(elemDeValor(x), elemDeValor(y)); };
    });
    try {
      /* jshint evil:true */
      var f = new Function("M", "C", "with (M) { with (C) { return (" + src + "\n); } }")(Math, ambito);
      return typeof f === "function" ? { f: f } : { error: "Tiene que ser una función, por ejemplo x => x % 2 == 0" };
    } catch (e) {
      return { error: "Error de escritura: " + e.message };
    }
  }

  // la condicion escrita "a mano": x => x % 2 === 0 && x > 3  ->  x mod 2 = 0 ∧ x > 3
  // Los conjuntos usados como funciones se escriben con ∈: A(x) -> x ∈ A, !B(x) -> x ∉ B
  // Con dos variables ((x, y) => ...) devuelve v = "(x, y)"; R(x, y) -> (x, y) ∈ R.
  function textoCondicion(codigo, nombres) {
    var m = /^\s*(?:\(\s*([a-zA-Z_$][\w$]*(?:\s*,\s*[a-zA-Z_$][\w$]*)*)\s*\)|([a-zA-Z_$][\w$]*))\s*=>\s*([^{][\s\S]*)$/.exec(codigo || "");
    if (!m) return { v: "x", cond: String(codigo || "").trim() };
    var params = (m[1] || m[2]).split(/\s*,\s*/);
    var v = params.length > 1 ? "(" + params.join(", ") + ")" : params[0];
    var c = m[3].trim().replace(/Math\./g, "");
    var arg = function (a) {
      a = a.trim();
      return a.indexOf(",") >= 0 ? "(" + a.split(/\s*,\s*/).join(", ") + ")" : a;
    };
    (nombres || []).forEach(function (n) {
      var esc = n.replace(/[$]/g, "\\$");
      c = c.replace(new RegExp("!\\s*" + esc + "\\s*\\(([^()]+)\\)", "g"), function (t, a) { return arg(a) + " ∉ " + n; })
        .replace(new RegExp("(^|[^\\w$.])" + esc + "\\s*\\(([^()]+)\\)", "g"), function (t, p, a) { return p + arg(a) + " ∈ " + n; });
    });
    c = c
      .replace(/\s*!==?\s*/g, " ≠ ").replace(/\s*===?\s*/g, " = ")
      .replace(/\s*<=\s*/g, " ≤ ").replace(/\s*>=\s*/g, " ≥ ")
      .replace(/\s*&&\s*/g, " ∧ ").replace(/\s*\|\|\s*/g, " ∨ ").replace(/!/g, "¬")
      .replace(/\s*%\s*/g, " mod ").replace(/\*\*\s*2(?![\d.])/g, "²").replace(/\*\*\s*3(?![\d.])/g, "³")
      .replace(/\s*\*\s*/g, "·").replace(/-/g, "−").replace(/\s+/g, " ");
    return { v: v, cond: c };
  }

  // expresion con conjuntos: arbol o { error }. nombres = conjuntos ya definidos
  function analizarConjunto(texto, nombres) {
    var s = String(texto || "").trim();
    try {
      var tk = [], i = 0;
      while (i < s.length) {
        if (/\s/.test(s[i])) { i++; continue; }
        if (s[i] === "{") {
          var fin = s.indexOf("}", i);
          if (fin < 0) throw "Falta cerrar la llave }";
          tk.push({ t: "lit", txt: s.slice(i, fin + 1) });
          i = fin + 1;
          continue;
        }
        var resto = s.slice(i), sim = null;
        for (var k = 0; k < OPS_CONJ.length && !sim; k++) if (resto.indexOf(OPS_CONJ[k][0]) === 0) sim = OPS_CONJ[k];
        if (sim) { tk.push({ t: sim[1], txt: sim[0] }); i += sim[0].length; continue; }
        var m = IDENT.exec(resto);
        if (!m) throw "No se entiende «" + s[i] + "»";
        var w = m[0];
        i += w.length;
        if (w === "P" && /^\s*\(/.test(s.slice(i))) tk.push({ t: "partes", txt: "P" });
        else if (w === "U") tk.push({ t: "U", txt: "U" });
        else if (/^vac[ií]o$/i.test(w)) tk.push({ t: "vacio", txt: w });
        else if (nombres.indexOf(w) >= 0) tk.push({ t: "ref", n: w, txt: w });
        else throw "«" + w + "» no es un conjunto definido en una fila anterior" +
          (nombres.length ? " (hay: " + nombres.join(", ") + ")" : "");
      }
      i = 0;
      var es = function (t) { return tk[i] && tk[i].t === t; };
      var expr = function () {
        var a = term();
        while (es("union") || es("dif") || es("simdif")) { var o = tk[i++].t; a = { t: "bin", op: o, a: a, b: term() }; }
        return a;
      };
      var term = function () {
        var a = prod();
        while (es("inter")) { i++; a = { t: "bin", op: "inter", a: a, b: prod() }; }
        return a;
      };
      var prod = function () {
        var a = unario();
        while (es("prod")) { i++; a = { t: "bin", op: "prod", a: a, b: unario() }; }
        return a;
      };
      var unario = function () {
        if (es("neg")) { i++; return { t: "comp", a: unario() }; }
        var a = atomo();
        while (es("comp")) { i++; a = { t: "comp", a: a }; }
        return a;
      };
      var atomo = function () {
        var k = tk[i];
        if (!k) throw i ? "Falta algo después de «" + tk[i - 1].txt + "»" : "Escribí un conjunto";
        i++;
        if (k.t === "ref") return { t: "ref", n: k.n };
        if (k.t === "U" || k.t === "vacio") return { t: k.t };
        if (k.t === "lit") {
          var r = leerElementos(k.txt);
          if (r.errores.length) throw r.errores.join(" · ");
          return { t: "lit", txt: k.txt, elems: r.elems };
        }
        if (k.t === "partes") {
          i++; // el "("
          var a = expr();
          if (!es(")")) throw "Falta cerrar el paréntesis de P(";
          i++;
          return { t: "partes", a: a };
        }
        if (k.t === "(") {
          var e = expr();
          if (!es(")")) throw "Falta cerrar «" + k.txt + "»";
          var cierre = tk[i++].txt, debe = k.txt === "[" ? "]" : ")";
          if (cierre !== debe) throw "«" + k.txt + "» se cierra con «" + debe + "»";
          e.par = k.txt;
          return e;
        }
        if (k.t === ")") throw "Sobra «" + k.txt + "» o falta algo antes";
        throw "Falta un conjunto antes de «" + k.txt + "»";
      };
      var arbol = expr();
      if (i < tk.length) throw tk[i].t === ")" ? "Sobra «" + tk[i].txt + "»" : "Falta una operación antes de «" + tk[i].txt + "»";
      return { arbol: arbol };
    } catch (e) {
      if (typeof e === "string") return { error: e };
      throw e;
    }
  }

  function imprimirConjunto(n, conPar) {
    var s;
    switch (n.t) {
      case "ref": s = n.n; break;
      case "U": s = "U"; break;
      case "vacio": s = "∅"; break;
      case "lit": s = "{" + n.elems.map(function (e) { return e.t; }).join(", ") + "}"; break;
      case "partes": s = "P(" + imprimirConjunto(n.a, false) + ")"; break;
      case "comp":
        s = imprimirConjunto(n.a, true);
        if (n.a.t === "bin" && !n.a.par) s = "(" + s + ")";
        s += "'";
        break;
      default: s = imprimirConjunto(n.a, true) + " " + SIM_CONJ[n.op] + " " + imprimirConjunto(n.b, true);
    }
    if (conPar && n.par) s = n.par + s + (n.par === "[" ? "]" : ")");
    return s;
  }

  // condicion de pertenencia de una operacion (para ℝ, donde no se puede listar):
  // A ∪ B' -> x ∈ A ∨ x ∉ B
  function predicadoConjunto(n, U) {
    function nombre(m) {
      return m.t === "ref" ? m.n : m.t === "U" ? U.simbolo : m.t === "vacio" ? "∅" : imprimirConjunto(m, false);
    }
    function hijo(m, op) {
      var p = predicadoConjunto(m, U);
      return m.t === "bin" && m.op !== op ? "(" + p + ")" : p;
    }
    if (n.t === "comp") {
      return n.a.t === "bin" ? "¬(" + predicadoConjunto(n.a, U) + ")" : n.a.t === "comp"
        ? predicadoConjunto(n.a.a, U) : "x ∉ " + nombre(n.a);
    }
    if (n.t !== "bin") return "x ∈ " + nombre(n);
    if (n.op === "dif") return hijo(n.a, "inter") + " ∧ " + hijo({ t: "comp", a: n.b }, "inter");
    var s = { union: "∨", inter: "∧", simdif: "⊻" }[n.op];
    if (!s) return "x ∈ " + imprimirConjunto(n, false);
    return hijo(n.a, n.op) + " " + s + " " + hijo(n.b, n.op);
  }

  // operando de × o P( ): un conjunto escrito ahi mismo no tiene que estar en U
  // ({1, 2} × {a, b} aunque U = ℕ)
  function evaluarOperandoLibre(n, ctx) {
    if (n.t !== "lit") return evaluarConjunto(n, ctx);
    return desdeLista(n.elems, ctx.U, n.elems.every(ctx.U.contiene));
  }

  function evaluarConjunto(n, ctx) {
    var U = ctx.U;
    switch (n.t) {
      case "ref": return ctx.conj[n.n];
      case "U": return U.infinito ? { lista: null, tiene: U.contiene, deU: true } : desdeLista(U.lista, U, true);
      case "vacio": return desdeLista([], U, true);
      case "lit":
        var fuera = n.elems.filter(function (e) { return !U.contiene(e); });
        if (fuera.length) {
          ctx.avisos.push(fuera.map(function (e) { return e.t; }).join(", ") +
            (fuera.length > 1 ? " no están" : " no está") + " en " + U.simbolo + " (se ignora" + (fuera.length > 1 ? "n" : "") + ")");
        }
        return desdeLista(n.elems.filter(U.contiene), U, true);
      case "partes":
        var a = evaluarOperandoLibre(n.a, ctx);
        if (!a.lista) throw "P( ) necesita un conjunto finito";
        if (a.lista.length > 8) throw "P( ) admite conjuntos de hasta 8 elementos (256 subconjuntos)";
        var subs = [];
        for (var m = 0; m < 1 << a.lista.length; m++) {
          var parte = a.lista.filter(function (e, j) { return m & (1 << j); });
          subs.push({
            v: parte, n: parte.length,
            t: parte.length ? "{" + parte.map(function (e) { return e.t; }).join(", ") + "}" : "∅",
            k: "{" + parte.map(function (e) { return e.k; }).sort().join(",") + "}",
          });
        }
        subs.sort(function (x, y) { return x.n - y.n; });
        return desdeLista(subs, U, false);
      case "comp":
        var c = evaluarConjunto(n.a, ctx);
        if (!c.deU) throw "El complemento es respecto de U: no se aplica a pares ni a conjuntos de partes";
        return {
          lista: U.lista ? U.lista.filter(function (e) { return !c.tiene(e); }) : null,
          tiene: function (e) { return U.contiene(e) && !c.tiene(e); }, deU: true,
        };
    }
    var ev = n.op === "prod" ? evaluarOperandoLibre : evaluarConjunto;
    var A = ev(n.a, ctx), B = ev(n.b, ctx);
    var no =function (S) { return function (e) { return !S.tiene(e); }; };
    switch (n.op) {
      case "union":
        if (A.lista && B.lista) return desdeLista(A.lista.concat(B.lista), U, A.deU && B.deU);
        return { lista: null, tiene: function (e) { return A.tiene(e) || B.tiene(e); }, deU: A.deU && B.deU };
      case "inter":
        if (A.lista) return desdeLista(A.lista.filter(B.tiene), U, A.deU || B.deU);
        if (B.lista) return desdeLista(B.lista.filter(A.tiene), U, A.deU || B.deU);
        return { lista: null, tiene: function (e) { return A.tiene(e) && B.tiene(e); }, deU: true };
      case "dif":
        if (A.lista) return desdeLista(A.lista.filter(no(B)), U, A.deU);
        return { lista: null, tiene: function (e) { return A.tiene(e) && !B.tiene(e); }, deU: A.deU };
      case "simdif":
        if (A.lista && B.lista) return desdeLista(A.lista.filter(no(B)).concat(B.lista.filter(no(A))), U, A.deU && B.deU);
        return { lista: null, tiene: function (e) { return A.tiene(e) !== B.tiene(e); }, deU: A.deU && B.deU };
      default: // producto cartesiano
        if (!A.lista || !B.lista) throw "× necesita conjuntos finitos (con todos sus elementos conocidos)";
        if (A.lista.length * B.lista.length > 2000) throw "× da demasiados pares (más de 2000)";
        var pares = [];
        A.lista.forEach(function (x) {
          B.lista.forEach(function (y) {
            pares.push({ v: [x.v, y.v], t: "(" + x.t + ", " + y.t + ")", k: "(" + x.k + "," + y.k + ")" });
          });
        });
        return desdeLista(pares, U, false);
    }
  }

  // Analiza el universo y todas las filas: { U, filas: [{ nombre, color, tipo,
  // errores, conj, arbol, codigo }] }. Una fila con errores no queda definida.
  function analizarConjuntos(op) {
    var U = leerUniverso(op), conj = {}, filas = [];
    op.filas.forEach(function (f, i) {
      var nombre = String(f.nombre || "").trim() || nombreConj(i);
      var r = { nombre: nombre, color: f.color, errores: [] };
      filas.push(r);
      var m = IDENT.exec(nombre);
      if (!m || m[0] !== nombre) r.errores.push("«" + nombre + "» no sirve como nombre (usá letras)");
      else if (nombre === "U" || nombre === "P") r.errores.push("«" + nombre + "» está reservado (U es el universo, P( ) el conjunto de partes)");
      else if (conj[nombre]) r.errores.push("Ya hay un conjunto «" + nombre + "» más arriba");
      var src = String(f.texto || "").trim();
      if (!src) r.errores.push("Escribí un conjunto: {1, 2, 3}, x => x % 2 == 0 o A ∪ B");
      if (r.errores.length) return;
      var S;
      if (/=>|^function\b/.test(src)) {
        r.tipo = "comprension";
        r.codigo = src;
        r.previos = Object.keys(conj);
        var c = compilarCondicion(src, conj);
        if (c.error) { r.errores.push(c.error); return; }
        var prueba = U.lista || (U.enumerar ? (function () {
          var sig = U.enumerar(), l = [];
          for (var j = 0; j < 30; j++) l.push(sig());
          return l;
        })() : [0, 0.5, -1, 2, Math.PI].map(function (v) { return elemNum(v); }));
        for (var j = 0; j < prueba.length; j++) {
          try { c.f(prueba[j].v); } catch (e) {
            var falta = e instanceof ReferenceError && /^(\S+) is not defined/.exec(e.message);
            r.errores.push(falta
              ? "«" + falta[1] + "» no es un conjunto definido en una fila anterior" +
                (r.previos.length ? " (hay: " + r.previos.join(", ") + ")" : "")
              : "Error al calcular con " + textoCondicion(src).v + " = " + prueba[j].t + ": " + e.message);
            return;
          }
        }
        var pertenece = function (e) { try { return !!c.f(e.v); } catch (err) { return false; } };
        S = U.lista ? desdeLista(U.lista.filter(pertenece), U, true)
          : { lista: null, tiene: function (e) { return U.contiene(e) && pertenece(e); }, deU: true };
      } else {
        var a = analizarConjunto(src, Object.keys(conj));
        if (a.error) { r.errores.push(a.error); return; }
        r.tipo = a.arbol.t === "lit" ? "extension" : "operacion";
        r.arbol = a.arbol;
        var ctx = { U: U, conj: conj, avisos: [] };
        try { S = evaluarConjunto(a.arbol, ctx); } catch (e) {
          if (typeof e !== "string") throw e;
          r.errores.push(e);
          return;
        }
        r.avisos = ctx.avisos;
      }
      r.conj = S;
      conj[nombre] = S;
    });
    return { U: U, filas: filas };
  }

  // Los elementos a escribir de un conjunto, hasta `L`. Devuelve { items, card }
  // (items: textos, con "…" donde se corta) o { texto } (∅, o por comprension en ℝ).
  //  - Si se conocen todos: los primeros L − 1, "…" y el ultimo.
  //  - Si no (universo infinito): se recorre U buscando los primeros L; si hay
  //    mas, "…" al final (y al principio en ℤ si siguen hacia los negativos).
  function listarConjunto(S, U, L, comprension) {
    if (S.lista) {
      var l = S.lista;
      if (!l.length) return { texto: "∅", card: 0 };
      var ts = l.map(function (e) { return e.t; });
      if (l.length <= L) return { items: ts, card: l.length };
      return { items: ts.slice(0, Math.max(1, L - 1)).concat(["…", ts[ts.length - 1]]), card: l.length };
    }
    if (!U.enumerar) return { texto: comprension() };
    var sig = U.enumerar(), hall = [], arriba = false, abajo = false, min = Infinity, max = -Infinity;
    for (var n = 0; n < BUSQUEDA; n++) {
      var e = sig();
      if (!S.tiene(e)) continue;
      if (hall.length < L) { hall.push(e); min = Math.min(min, e.v); max = Math.max(max, e.v); continue; }
      if (U.tipo !== "Z") { arriba = true; break; }
      if (e.v > max) arriba = true; else if (e.v < min) abajo = true;
      if (arriba && abajo) break;
    }
    if (!hall.length) return { texto: "∅" };
    if (U.tipo !== "Q") hall.sort(function (a, b) { return a.v - b.v; });
    var items = hall.map(function (e) { return e.t; });
    if (abajo) items.unshift("…");
    if (arriba) items.push("…");
    return { items: items };
  }

  // Escribe lineas de texto una debajo de otra desde (ox, y).
  // lista(): "prefijo{a, b, c}sufijo", cortada en varias lineas (con sangria
  // hasta la llave) si no entra en maxW. lst = { items } o { texto }.
  function nuevoEscritor(ox, y, maxW, tam, fuente, agregar) {
    var alto = tam * fuente.lh + 6, w = { y: y, alto: alto };
    w.linea = function (str, color) {
      agregar(texto(ox, w.y, str, tam, fuente, color, "left"));
      w.y += alto;
    };
    w.lista = function (prefijo, lst, color, suf) {
      suf = suf || "";
      if (!lst.items) { w.linea(prefijo + lst.texto + suf, color); return; }
      var linea = prefijo + "{", x = ox;
      var sangria = Math.min(medir(linea, tam, fuente), maxW / 2);
      lst.items.forEach(function (it, j) {
        var pieza = it + (j < lst.items.length - 1 ? ", " : "}");
        var conPieza = linea + pieza;
        if (x + medir(conPieza.replace(/\s+$/, ""), tam, fuente) > ox + maxW && /[,{]\s*$/.test(linea) && linea !== prefijo + "{") {
          agregar(texto(x, w.y, linea.replace(/\s+$/, ""), tam, fuente, color, "left"));
          w.y += alto;
          x = ox + sangria;
          linea = pieza;
        } else linea = conPieza;
      });
      agregar(texto(x, w.y, linea + suf, tam, fuente, color, "left"));
      w.y += alto;
    };
    return w;
  }

  // Dibuja el universo y una linea (o mas, si no entra) por conjunto:
  //   U = {1, 2, ..., 10}
  //   A = {x ∈ U / x mod 2 = 0} = {2, 4, 6, 8, 10}
  //   C = A ∪ B = {1, 2, 3, 4, 5, 6, 8, 10}
  // ORDEN: el universo y despues cada conjunto, de arriba abajo.
  function generarConjuntos(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var maxW = ANCHOS_CONJ[op.ancho] || 900;
    var an = analizarConjuntos(op), U = an.U;
    var L = !U.infinito && op.mostrar === "todos" ? Infinity : Math.max(1, Math.min(500, Number(op.limite) || 10));
    var esc = nuevoEscritor(ox, oy, maxW, tam, fuente, agregar);
    function escribir(prefijo, lst, color, nombreCard) {
      esc.lista(prefijo, lst, color, op.cardinal && lst.card != null ? "     |" + nombreCard + "| = " + lst.card : "");
    }

    if (op.escribirU) {
      if (U.infinito) esc.linea("U = " + U.simbolo, TINTA);
      else escribir("U = ", listarConjunto(desdeLista(U.lista, U, true), U, L), TINTA, "U");
    }
    an.filas.forEach(function (f) {
      if (f.errores.length) return;
      var def = "", comp;
      if (f.tipo === "comprension") {
        var tc = textoCondicion(f.codigo, f.previos);
        def = "{" + tc.v + " ∈ " + U.simbolo + " / " + tc.cond + "}";
        comp = function () { return def; };
      } else {
        if (f.tipo === "operacion") def = imprimirConjunto(f.arbol, false);
        comp = function () { return "{x ∈ " + U.simbolo + " / " + predicadoConjunto(f.arbol, U) + "}"; };
      }
      var lst = listarConjunto(f.conj, U, L, comp);
      // la definicion no se repite si es lo mismo que el resultado (comprension en ℝ)
      var pre = f.nombre + " = " + (op.mostrarDef && def && def !== lst.texto ? def + " = " : "");
      escribir(pre, lst, f.color, f.nombre);
    });
  }

  function erroresConjunto(t, op, i) {
    var f = analizarConjuntos(op).filas[i];
    return f ? f.errores.concat(f.avisos || []) : [];
  }

  // ======================================= GENERADOR: RELACIONES BINARIAS
  // Filas: conjuntos finitos y relaciones. El campo "⊆" de cada fila dice de
  // donde se toman los elementos:
  //  - conjunto por extension u operacion: {1, 2, 3}, A ∪ B   (⊆ opcional)
  //  - conjunto por comprension: x => x % 2 == 0              (⊆ A)
  //  - relacion por extension: {(1, a), (2, b)}               (⊆ A × B)
  //  - relacion por comprension: (x, y) => x < y              (⊆ A × B)
  // Las funciones pueden usar los conjuntos (A(x)) y relaciones (R(x, y)) de
  // las filas anteriores. Cada relacion se dibuja como grafico cartesiano,
  // diagrama sagital y/o grafo dirigido.
  // Relacion: { A, B (conjuntos), pares: [[a, b]], tiene(a, b) }.
  var MAX_PARES = 2500;
  // sin universo: los elementos escritos valen todos (los conjuntos son finitos)
  var UNIVERSO_LIBRE = { infinito: true, simbolo: "U", lista: null, error: "", contiene: function () { return true; } };

  // separa por las comas (o ;) que no estan dentro de parentesis
  function partirPares(s) {
    var res = [], prof = 0, ini = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === "(") prof++;
      else if (c === ")") prof--;
      else if ((c === "," || c === ";") && prof === 0) { res.push(s.slice(ini, i)); ini = i + 1; }
    }
    res.push(s.slice(ini));
    return res.map(function (p) { return p.trim(); }).filter(Boolean);
  }

  function textoPar(a, b) { return "(" + a.t + ", " + b.t + ")"; }

  function nuevaRelacion(A, B, pares) {
    var claves = {}, lista = [], posA = {}, posB = {};
    A.lista.forEach(function (e, i) { posA[e.k] = i; });
    B.lista.forEach(function (e, i) { posB[e.k] = i; });
    pares.forEach(function (p) {
      var k = p[0].k + "|" + p[1].k;
      if (!claves[k]) { claves[k] = true; lista.push(p); }
    });
    lista.sort(function (p, q) { return posA[p[0].k] - posA[q[0].k] || posB[p[1].k] - posB[q[1].k]; });
    return { A: A, B: B, pares: lista, tiene: function (x, y) { return !!claves[x.k + "|" + y.k]; } };
  }

  function analizarRelaciones(op) {
    var conj = {}, rels = {}, filas = [];
    op.filas.forEach(function (f, i) {
      var nombre = String(f.nombre || "").trim() || nombreConj(i);
      var r = { nombre: nombre, color: f.color, errores: [], avisos: [] };
      filas.push(r);
      var m = IDENT.exec(nombre);
      if (!m || m[0] !== nombre) r.errores.push("«" + nombre + "» no sirve como nombre (usá letras)");
      else if (nombre === "U" || nombre === "P") r.errores.push("«" + nombre + "» está reservado");
      else if (conj[nombre] || rels[nombre]) r.errores.push("Ya hay un conjunto o relación «" + nombre + "» más arriba");
      var src = String(f.texto || "").trim(), base = String(f.base || "").trim();
      if (!src) r.errores.push("Escribí un conjunto ({1, 2, 3}) o una relación ((x, y) => x < y o {(1, 2), (2, 3)})");
      if (r.errores.length) return;

      var ctx = { U: UNIVERSO_LIBRE, conj: conj, avisos: r.avisos };
      var finito = function (texto, que) {
        var a = analizarConjunto(texto, Object.keys(conj));
        if (a.error) throw que + a.error;
        var S = evaluarConjunto(a.arbol, ctx);
        if (!S.lista) throw (que ? que + "t" : "T") + "iene que ser un conjunto finito (acá no hay universo: en lugar del complemento usá −)";
        return { S: S, arbol: a.arbol };
      };
      var previos = Object.keys(conj).concat(Object.keys(rels));
      var errorCalculo = function (e, valor) {
        var falta = e instanceof ReferenceError && /^(\S+) is not defined/.exec(e.message);
        return falta ? "«" + falta[1] + "» no es un conjunto ni una relación de una fila anterior" +
          (previos.length ? " (hay: " + previos.join(", ") + ")" : "")
          : "Error al calcular con " + textoCondicion(src).v + " = " + valor + ": " + e.message;
      };
      var esFuncion = /=>|^function\b/.test(src);
      var dosVariables = esFuncion && /^\s*(?:function\s*)?\(\s*[\w$]+\s*,/.test(src);
      try {
        if (dosVariables || /^\{\s*\(/.test(src)) {
          r.clase = "relacion";
          if (!base) throw "En «⊆» escribí el producto cartesiano donde está la relación, por ejemplo A × B o A × A";
          var ab = analizarConjunto(base, Object.keys(conj));
          if (ab.error) throw "«⊆»: " + ab.error;
          if (ab.arbol.t !== "bin" || ab.arbol.op !== "prod") throw "«⊆» tiene que ser un producto cartesiano, por ejemplo A × B";
          var A = evaluarConjunto(ab.arbol.a, ctx), B = evaluarConjunto(ab.arbol.b, ctx);
          if (!A.lista || !B.lista) throw "Los conjuntos del producto tienen que ser finitos";
          if (A.lista.length * B.lista.length > MAX_PARES) throw "El producto tiene demasiados pares (más de " + MAX_PARES + ")";
          r.base = imprimirConjunto(ab.arbol, false);
          var pares = [];
          if (esFuncion) {
            r.tipo = "comprension";
            r.codigo = src;
            r.previos = previos;
            var c = compilarCondicion(src, conj, rels);
            if (c.error) throw c.error;
            A.lista.forEach(function (a) {
              B.lista.forEach(function (b) {
                var v;
                try { v = c.f(a.v, b.v); } catch (e) { throw errorCalculo(e, textoPar(a, b)); }
                if (v) pares.push([a, b]);
              });
            });
          } else {
            r.tipo = "extension";
            if (src[src.length - 1] !== "}") throw "Falta cerrar la llave }";
            var buscar = function (S, x) { return S.lista.filter(function (e) { return e.k === x.k; })[0]; };
            var fuera = [];
            partirPares(src.slice(1, -1)).forEach(function (p) {
              var mp = /^\((.*)\)$/.exec(p);
              if (!mp) throw "«" + p + "» tiene que ser un par (a, b)";
              var partes = mp[1].split(mp[1].indexOf(";") >= 0 ? ";" : ",");
              if (partes.length !== 2) throw "«" + p + "» tiene que tener dos elementos: (a, b)";
              var x = leerElementos(partes[0]).elems[0], y = leerElementos(partes[1]).elems[0];
              if (!x || !y) throw "«" + p + "» tiene un elemento vacío";
              var xa = buscar(A, x), yb = buscar(B, y);
              if (!xa || !yb) fuera.push(p); else pares.push([xa, yb]);
            });
            if (fuera.length) {
              r.avisos.push(fuera.join(", ") + (fuera.length > 1 ? " no están" : " no está") + " en " + r.base +
                " (se ignora" + (fuera.length > 1 ? "n" : "") + ")");
            }
          }
          r.rel = nuevaRelacion(A, B, pares);
          r.homogenea = A.lista.length === B.lista.length && A.lista.every(B.tiene);
          rels[nombre] = r.rel;
        } else {
          r.clase = "conjunto";
          var S;
          if (esFuncion) {
            r.tipo = "comprension";
            if (!base) throw "En «⊆» escribí el conjunto de donde se toman los elementos, por ejemplo A";
            var bs = finito(base, "«⊆»: ");
            r.base = imprimirConjunto(bs.arbol, false);
            r.codigo = src;
            r.previos = previos;
            var c2 = compilarCondicion(src, conj, rels);
            if (c2.error) throw c2.error;
            S = desdeLista(bs.S.lista.filter(function (e) {
              try { return !!c2.f(e.v); } catch (err) { throw errorCalculo(err, e.t); }
            }), UNIVERSO_LIBRE, false);
          } else {
            var e1 = finito(src, "");
            r.tipo = e1.arbol.t === "lit" ? "extension" : "operacion";
            r.arbol = e1.arbol;
            S = e1.S;
            if (base) {
              var b1 = finito(base, "«⊆»: ");
              var fuera2 = S.lista.filter(function (e) { return !b1.S.tiene(e); });
              if (fuera2.length) {
                r.avisos.push(fuera2.map(function (e) { return e.t; }).join(", ") +
                  (fuera2.length > 1 ? " no están" : " no está") + " en " + base);
              }
            }
          }
          r.conj = S;
          conj[nombre] = S;
        }
      } catch (e) {
        if (typeof e !== "string") throw e;
        r.errores.push(e);
      }
    });
    return { filas: filas };
  }

  // propiedades de una relacion en A × A, con un contraejemplo si no se cumple
  function propiedadesRelacion(f) {
    var R = f.rel, A = R.A.lista, n = f.nombre, P = R.pares, res = [];
    var noRef = A.filter(function (a) { return !R.tiene(a, a); })[0];
    var noSim = P.filter(function (p) { return !R.tiene(p[1], p[0]); })[0];
    var noAnti = P.filter(function (p) { return p[0].k !== p[1].k && R.tiene(p[1], p[0]); })[0];
    var noTra = null;
    P.some(function (p) {
      return P.some(function (q) {
        if (q[0].k !== p[1].k || R.tiene(p[0], q[1])) return false;
        noTra = [p, q];
        return true;
      });
    });
    res.push(noRef ? n + " no es reflexiva: " + textoPar(noRef, noRef) + " ∉ " + n : n + " es reflexiva");
    res.push(noSim ? n + " no es simétrica: " + textoPar(noSim[0], noSim[1]) + " ∈ " + n + " y " +
      textoPar(noSim[1], noSim[0]) + " ∉ " + n : n + " es simétrica");
    res.push(noAnti ? n + " no es antisimétrica: " + textoPar(noAnti[0], noAnti[1]) + " y " +
      textoPar(noAnti[1], noAnti[0]) + " ∈ " + n : n + " es antisimétrica");
    res.push(noTra ? n + " no es transitiva: " + textoPar(noTra[0][0], noTra[0][1]) + ", " +
      textoPar(noTra[1][0], noTra[1][1]) + " ∈ " + n + " y " + textoPar(noTra[0][0], noTra[1][1]) + " ∉ " + n
      : n + " es transitiva");
    if (!noRef && !noSim && !noTra) res.push(n + " es una relación de equivalencia");
    if (!noRef && !noAnti && !noTra) res.push(n + " es una relación de orden");
    return res;
  }

  function anchoMaximo(lista, tam, fuente) {
    return lista.reduce(function (m, e) { return Math.max(m, medir(e.t, tam, fuente)); }, 0);
  }

  // grafico cartesiano: A en el eje horizontal, B en el vertical, un punto por par
  function dibujarCartesiano(f, tam, fuente, agregar) {
    var A = f.rel.A.lista, B = f.rel.B.lista, lh = tam * fuente.lh;
    var sx = Math.max(tam * 2, anchoMaximo(A, tam, fuente) + 14), sy = Math.max(tam * 1.6, lh + 8);
    var W = (A.length + 1) * sx, H = (B.length + 1) * sy;
    var posA = {}, posB = {};
    A.forEach(function (e, i) { posA[e.k] = i; });
    B.forEach(function (e, j) { posB[e.k] = j; });
    function X(i) { return (i + 1) * sx; }
    function Y(j) { return H - (j + 1) * sy; }
    var nombres = f.base.split(" × ");
    agregar(linea(0, H, [[0, 0], [W, 0]], { type: "arrow", endArrowhead: "arrow" }));
    agregar(linea(0, H, [[0, 0], [0, -H + sy * 0.2]], { type: "arrow", endArrowhead: "arrow" }));
    agregar(texto(W + 10, H - lh / 2, nombres[0], tam, fuente, TINTA, "left"));
    agregar(texto(0, sy * 0.2 - lh - 8, nombres[1] || nombres[0], tam, fuente, TINTA, "center"));
    var guia = { strokeColor: GRIS, strokeWidth: 1, strokeStyle: "dashed" };
    A.forEach(function (e, i) { agregar(linea(X(i), H, [[0, 0], [0, -(H - sy * 0.6)]], guia)); });
    B.forEach(function (e, j) { agregar(linea(0, Y(j), [[0, 0], [W - sx * 0.6, 0]], guia)); });
    A.forEach(function (e, i) {
      agregar(linea(X(i), H - 5, [[0, 0], [0, 10]], {}));
      agregar(texto(X(i), H + 8, e.t, tam, fuente, TINTA, "center"));
    });
    B.forEach(function (e, j) {
      agregar(linea(-5, Y(j), [[0, 0], [10, 0]], {}));
      agregar(texto(-10, Y(j) - lh / 2, e.t, tam, fuente, TINTA, "right"));
    });
    var rad = Math.max(4.5, tam * 0.27);
    f.rel.pares.forEach(function (p) {
      agregar(base("ellipse", {
        x: X(posA[p[0].k]) - rad, y: Y(posB[p[1].k]) - rad, width: 2 * rad, height: 2 * rad,
        strokeColor: f.color, backgroundColor: f.color, fillStyle: "solid",
      }));
    });
  }

  // diagrama sagital: A y B en dos ovalos, una flecha por par
  function dibujarSagital(f, tam, fuente, agregar) {
    var A = f.rel.A.lista, B = f.rel.B.lista, lh = tam * fuente.lh, fila = lh + 12;
    var nombres = f.base.split(" × ");
    // el ovalo contiene al rectangulo del contenido si es √2 veces mas grande
    function ovalo(lista) {
      var cw = anchoMaximo(lista, tam, fuente) + 30, ch = Math.max(lista.length, 1) * fila;
      return { cw: cw, ch: ch, w: cw * 1.42 + 16, h: ch * 1.42 + 16 };
    }
    var oa = ovalo(A), ob = ovalo(B), H = Math.max(oa.h, ob.h), gap = Math.max(140, tam * 7);
    var xa = 0, xb = oa.w + gap, cy = H / 2;
    var cxa = xa + oa.w / 2, cxb = xb + ob.w / 2;
    agregar(base("ellipse", { x: xa, y: cy - oa.h / 2, width: oa.w, height: oa.h, strokeWidth: 2 }));
    agregar(base("ellipse", { x: xb, y: cy - ob.h / 2, width: ob.w, height: ob.h, strokeWidth: 2 }));
    agregar(texto(cxa, -lh - 8, nombres[0], tam, fuente, TINTA, "center"));
    agregar(texto(cxb, -lh - 8, nombres[1] || nombres[0], tam, fuente, TINTA, "center"));
    var pa = {}, pb = {}, r = 3.5;
    A.forEach(function (e, i) {
      var y = cy - oa.ch / 2 + (i + 0.5) * fila, x = cxa + oa.cw / 2 - 6;
      pa[e.k] = [x, y];
      agregar(texto(x - 14, y - lh / 2, e.t, tam, fuente, TINTA, "right"));
      agregar(base("ellipse", { x: x - r, y: y - r, width: 2 * r, height: 2 * r, backgroundColor: TINTA }));
    });
    B.forEach(function (e, j) {
      var y = cy - ob.ch / 2 + (j + 0.5) * fila, x = cxb - ob.cw / 2 + 6;
      pb[e.k] = [x, y];
      agregar(texto(x + 14, y - lh / 2, e.t, tam, fuente, TINTA, "left"));
      agregar(base("ellipse", { x: x - r, y: y - r, width: 2 * r, height: 2 * r, backgroundColor: TINTA }));
    });
    f.rel.pares.forEach(function (p) {
      var a = pa[p[0].k], b = pb[p[1].k];
      agregar(trazo([[a[0] + 6, a[1]], [b[0] - 7, b[1]]], {
        type: "arrow", endArrowhead: "arrow", strokeColor: f.color, strokeWidth: 1.5,
      }));
    });
  }

  // grafo dirigido: los elementos de A (y de B, si es otro conjunto) en un
  // circulo; una flecha por par, un lazo si es (a, a) y flechas curvas si
  // estan los dos sentidos
  function dibujarGrafo(f, tam, fuente, agregar) {
    var lh = tam * fuente.lh, nodos = f.rel.A.lista.slice();
    f.rel.B.lista.forEach(function (e) { if (!f.rel.A.tiene(e)) nodos.push(e); });
    var n = nodos.length, rn = Math.max(tam * 0.9, anchoMaximo(nodos, tam, fuente) / 2 + 8);
    var R = n === 1 ? 0 : Math.max(rn * 4, n * (2 * rn + 70) / (2 * Math.PI));
    var c = R + rn + 50, pos = {}, ang = {};
    nodos.forEach(function (e, i) {
      var t = -Math.PI / 2 + 2 * Math.PI * i / n;
      pos[e.k] = [c + R * Math.cos(t), c + R * Math.sin(t)];
      ang[e.k] = t;
      agregar(base("ellipse", { x: pos[e.k][0] - rn, y: pos[e.k][1] - rn, width: 2 * rn, height: 2 * rn, strokeWidth: 2 }));
      agregar(texto(pos[e.k][0], pos[e.k][1] - lh / 2, e.t, tam, fuente, TINTA, "center"));
    });
    var flecha = { type: "arrow", endArrowhead: "arrow", strokeColor: f.color, strokeWidth: 1.5, roundness: { type: 2 } };
    f.rel.pares.forEach(function (p) {
      var a = pos[p[0].k], b = pos[p[1].k];
      if (p[0].k === p[1].k) {
        var t = ang[p[0].k];
        var punto = function (dt, d) { return [a[0] + d * Math.cos(t + dt), a[1] + d * Math.sin(t + dt)]; };
        agregar(trazo([punto(-0.45, rn), punto(-0.4, rn + 36), punto(0.4, rn + 36), punto(0.45, rn + 3)], flecha));
        return;
      }
      var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy);
      dx /= d; dy /= d;
      var s = [a[0] + dx * rn, a[1] + dy * rn], e = [b[0] - dx * (rn + 3), b[1] - dy * (rn + 3)];
      if (f.rel.tiene(p[1], p[0])) {
        var m = [(s[0] + e[0]) / 2 - dy * 22, (s[1] + e[1]) / 2 + dx * 22];
        agregar(trazo([s, m, e], flecha));
      } else agregar(trazo([s, e], flecha));
    });
  }

  // Dibuja las lineas de texto (conjuntos, relaciones por extension, dominio
  // e imagen, propiedades) y despues, por cada relacion, sus diagramas uno al
  // lado del otro. ORDEN: los textos de arriba abajo; despues cada relacion:
  // su titulo y sus diagramas (cartesiano, sagital, grafo), cada uno con sus
  // ejes/ovalos/nodos primero y los pares al final, en orden.
  function generarRelaciones(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var an = analizarRelaciones(op);
    var esc = nuevoEscritor(ox, oy, ANCHOS_CONJ[op.ancho] || 900, tam, fuente, agregar);
    an.filas.forEach(function (f) {
      if (f.errores.length) return;
      var def = "";
      if (f.tipo === "comprension") {
        var tc = textoCondicion(f.codigo, f.previos);
        def = "{" + tc.v + " ∈ " + f.base + " / " + tc.cond + "}";
      } else if (f.tipo === "operacion") def = imprimirConjunto(f.arbol, false);
      var pre = f.nombre + " = " + (op.mostrarDef && def ? def + " = " : "");
      if (f.clase === "conjunto") {
        if (op.escribir) esc.lista(pre, listarConjunto(f.conj, null, Infinity), f.color);
        return;
      }
      var P = f.rel.pares;
      if (op.escribir) {
        esc.lista(pre, listarConjunto({ lista: P.map(function (p) { return { t: textoPar(p[0], p[1]) }; }) }, null, Infinity), f.color);
      }
      if (op.dominio) {
        var dom = f.rel.A.lista.filter(function (a) { return P.some(function (p) { return p[0].k === a.k; }); });
        var im = f.rel.B.lista.filter(function (b) { return P.some(function (p) { return p[1].k === b.k; }); });
        esc.lista("Dom(" + f.nombre + ") = ", listarConjunto({ lista: dom }, null, Infinity), f.color);
        esc.lista("Im(" + f.nombre + ") = ", listarConjunto({ lista: im }, null, Infinity), f.color);
      }
      if (op.propiedades && f.homogenea) propiedadesRelacion(f).forEach(function (t) { esc.linea(t, f.color); });
    });

    dibujarCartesiano.titulo = "Gráfico cartesiano";
    dibujarSagital.titulo = "Diagrama sagital";
    dibujarGrafo.titulo = "Grafo dirigido";
    var dibujos = [op.cartesiano && dibujarCartesiano, op.sagital && dibujarSagital, op.grafo && dibujarGrafo]
      .filter(Boolean);
    if (!dibujos.length) return;
    var y = esc.y + (esc.y > oy ? 30 : 0);
    an.filas.forEach(function (f) {
      if (f.errores.length || f.clase !== "relacion" || !f.rel.A.lista.length || !f.rel.B.lista.length) return;
      agregar(texto(ox, y, f.nombre + " ⊆ " + f.base, tam, fuente, f.color, "left"));
      y += tam * fuente.lh + 30;
      var x = ox, alto = 0;
      dibujos.forEach(function (dibujar) {
        var c = colocarConTitulo(function (ag) { dibujar(f, tam, fuente, ag); }, x, y,
          op.titulos && dibujar.titulo, tam, fuente, agregar);
        x += c.w + 90;
        alto = Math.max(alto, c.h);
      });
      y += alto + 60;
    });
  }

  function erroresRelacion(t, op, i) {
    var f = analizarRelaciones(op).filas[i];
    return f ? f.errores.concat(f.avisos || []) : [];
  }

  // ====================================================== PLANTILLAS
  // Definiciones fijas de uso frecuente. Se marcan las que se quieren y se
  // insertan una debajo de otra: el nombre a la izquierda y la formula
  // alineada a su derecha. La pertenencia a R se escribe segun la
  // notacion elegida: (x, y) ∈ R o x R y (enR).
  function enR(a, b, n, no) {
    return n === "infija" ? (no ? "¬(" + a + " R " + b + ")" : a + " R " + b) : "(" + a + ", " + b + ") " + (no ? "∉" : "∈") + " R";
  }
  var PLANTILLAS = [
    { grupo: "Relaciones binarias (R ⊆ A × A)", items: [
      ["reflexiva", "Reflexiva", function (n) { return "∀x: x ∈ A → " + enR("x", "x", n); }],
      ["simetrica", "Simétrica", function (n) { return "∀x, y ∈ A: " + enR("x", "y", n) + " → " + enR("y", "x", n); }],
      ["transitiva", "Transitiva", function (n) {
        return "∀x, y, z ∈ A: " + enR("x", "y", n) + " ∧ " + enR("y", "z", n) + " → " + enR("x", "z", n); }],
      ["antisimetrica", "Antisimétrica", function (n) {
        return "∀x, y ∈ A: " + enR("x", "y", n) + " ∧ " + enR("y", "x", n) + " → x = y"; }],
      ["arreflexiva", "Arreflexiva", function (n) { return "∀x ∈ A: " + enR("x", "x", n, true); }],
      ["asimetrica", "Asimétrica", function (n) { return "∀x, y ∈ A: " + enR("x", "y", n) + " → " + enR("y", "x", n, true); }],
      ["atransitiva", "Atransitiva", function (n) {
        return "∀x, y, z ∈ A: " + enR("x", "y", n) + " ∧ " + enR("y", "z", n) + " → " + enR("x", "z", n, true); }],
    ] },
    // `*` y `+` se reemplazan por los operadores elegidos (op1 y op2)
    { grupo: "Estructuras algebraicas", items: [
      ["lci", "L.C.I.", "∀x, y: x ∈ A ∧ y ∈ A → x * y ∈ A"],
      ["asociativa", "Asociativa", "∀x, y, z ∈ A: x * (y * z) = (x * y) * z"],
      ["neutro", "Elemento neutro", "∃e ∈ A / ∀x ∈ A: x * e = e * x = x"],
      ["inverso", "Elemento inverso", "∀x ∈ A, ∃x' ∈ A / x * x' = x' * x = e"],
      ["conmutativa", "Conmutativa", "∀x, y ∈ A: x * y = y * x"],
      ["distributiva", "Distributiva de * sobre +", "∀x, y, z ∈ A: x * (y + z) = (x * y) + (x * z)"],
    ].map(function (it) {
      var conOps = function (t, op) {
        var a = String(op.op1 || "").trim() || "*", b = String(op.op2 || "").trim() || "+";
        return t.replace(/[*+]/g, function (c) { return c === "*" ? a : b; });
      };
      return [it[0], function (op) { return conOps(it[1], op); }, function (n, op) { return conOps(it[2], op); }];
    }) },
    // las que nombran el dominio A o el codominio B se escriben como doble
    // implicacion: f: A → B es ... ↔ definicion
    { grupo: "Funciones (f: A → B)", items: [
      ["inyectiva", "Inyectiva", "f: A → B es inyectiva ↔ ∀a, b ∈ A: f(a) = f(b) → a = b"],
      ["sobreyectiva", "Sobreyectiva", "f: A → B es sobreyectiva ↔ ∀y ∈ B, ∃x ∈ A / f(x) = y"],
      ["biyectiva", "Biyectiva", "f es inyectiva ∧ f es sobreyectiva"],
      ["creciente", "Creciente", "f: A → B es creciente ↔ ∀a, b ∈ A: a < b → f(a) ≤ f(b)"],
      ["decreciente", "Decreciente", "f: A → B es decreciente ↔ ∀a, b ∈ A: a < b → f(a) ≥ f(b)"],
    ] },
    // sucesiones: el termino siguiente se obtiene sumando la distancia d
    // (aritmetica) o multiplicando por la razon r (geometrica)
    { grupo: "Sucesión aritmética", items: [
      ["ar_definicion", "Definición", "aₙ₊₁ = aₙ + d", "Sucesión aritmética"],
      ["ar_general", "Término general", "aₖ = a₁ + (k − 1)d", "Término general (aritmética)"],
      ["ar_desdek", "Término n conociendo aₖ", "aₙ = aₖ + (n − k)d", "Término n conociendo aₖ (aritmética)"],
      ["ar_suma", "Suma de los n primeros", "Sₙ = n(a₁ + aₙ) / 2", "Suma de los n primeros (aritmética)"],
      ["ar_d1", "Distancia (con a₁ y aₙ)", "d = (aₙ − a₁) / (n − 1)"],
      ["ar_dk", "Distancia (con aₖ y aₙ)", "d = (aₙ − aₖ) / (n − k)"],
    ] },
    { grupo: "Sucesión geométrica", items: [
      ["ge_definicion", "Definición", "aₙ₊₁ = aₙ × r", "Sucesión geométrica"],
      ["ge_general", "Término general", "aₖ = a₁ × rᵏ⁻¹", "Término general (geométrica)"],
      ["ge_desdek", "Término n conociendo aₖ", "aₙ = aₖ × rⁿ⁻ᵏ", "Término n conociendo aₖ (geométrica)"],
      ["ge_suma", "Suma de los n primeros", "Sₙ = a₁(rⁿ − 1) / (r − 1)", "Suma de los n primeros (geométrica)"],
      ["ge_r1", "Razón (con a₁ y aₙ)", "r = √[n−1](aₙ / a₁)"],
      ["ge_rm", "Razón (con aₘ y aₙ)", "r = √[n−m](aₙ / aₘ)"],
    ] },
    // las mismas formulas que escribe el generador de combinatoria
    { grupo: "Combinatoria", items: [
      ["permutaciones", "Permutaciones", "Pₙ = n!"],
      ["variaciones", "Variaciones simples", "Vₙ,ₖ = n! / (n − k)!"],
      ["combinaciones", "Combinaciones simples", "Cₙ,ₖ = n! / (k! · (n − k)!)"],
      ["variacionesR", "Variaciones con repetición", "VRₙ,ₖ = nᵏ"],
      ["combinacionesR", "Combinaciones con repetición", "CRₙ,ₖ = (n + k − 1)! / (k! · (n − 1)!)"],
      ["permutacionesR", "Permutaciones con repetición", "PRₙ(a, b, c) = n! / (a! · b! · c! ···)"],
    ].map(function (it) {
      // con repeticion: VR, CR, PR o V', C', P' (opcion «Con repetición»)
      return [it[0], it[1], function (n, op) {
        return op.repeticion === "prima" ? it[2].replace(/^([VCP])R/, "$1'") : it[2];
      }];
    }) },
  ];
  // 4.º elemento (opcional): el nombre que se escribe en la pizarra, cuando el
  // del panel solo se entiende dentro de su grupo (Término general...)
  PLANTILLAS.forEach(function (g) {
    g.items = g.items.map(function (it) { return { clave: "pl_" + it[0], nombre: it[1], formula: it[2], escrito: it[3] }; });
  });
  var CLAVES_PLANTILLAS = [];
  PLANTILLAS.forEach(function (g) { g.items.forEach(function (it) { CLAVES_PLANTILLAS.push(it.clave); }); });
  function marcarPlantillas(lista) {
    var d = {};
    CLAVES_PLANTILLAS.forEach(function (k) { d[k] = lista.indexOf(k) >= 0; });
    return d;
  }

  function generarPlantillas(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var lh = tam * fuente.lh, sep = op.espaciado ? lh * 0.9 : lh * 0.35;
    var lineas = [];
    PLANTILLAS.forEach(function (g) {
      g.items.forEach(function (it) {
        if (!op[it.clave]) return;
        var f = typeof it.formula === "function" ? it.formula(op.notacion, op) : it.formula;
        var nom = it.escrito || (typeof it.nombre === "function" ? it.nombre(op) : it.nombre);
        lineas.push({ nombre: nom + ":", formula: f });
      });
    });
    var anchoNombre = 0;
    if (op.nombres) lineas.forEach(function (l) { anchoNombre = Math.max(anchoNombre, medir(l.nombre, tam, fuente)); });
    var xf = ox + (op.nombres ? anchoNombre + tam * 0.8 : 0), y = oy;
    lineas.forEach(function (l) {
      var r = leerRaiz(l.formula);
      if (!r) {
        if (op.nombres) agregar(texto(ox, y, l.nombre, tam, fuente, op.colorNombre ? COLORES[0] : TINTA, "left"));
        agregar(texto(xf, y, l.formula, tam, fuente, TINTA, "left"));
        y += lh + sep;
        return;
      }
      // renglon con raiz: el nombre y el resto del texto, centrados en la raiz
      var d = dibujarRaiz(r, xf, y, tam, fuente, TINTA, agregar);
      if (op.nombres) agregar(texto(ox, d.medio - lh / 2, l.nombre, tam, fuente, op.colorNombre ? COLORES[0] : TINTA, "left"));
      y += d.alto + sep;
    });
  }

  // Formulas con raiz: "r = √[n−1](aₙ / a₁)" (indice entre corchetes y
  // radicando entre parentesis). La raiz se dibuja con una linea y el indice
  // es un texto aparte, mas chico y mas arriba, sobre el gancho de la raiz.
  function leerRaiz(f) {
    var m = /^(.*?)√\[(.+?)\]\((.+)\)(.*)$/.exec(f);
    return m && { antes: m[1], indice: m[2], dentro: m[3], despues: m[4] };
  }

  // Dibuja «antes √[indice](dentro) despues» desde (x, y) (arriba a la
  // izquierda). Un radicando «a / b» se escribe como fraccion con barra.
  // Devuelve { alto, medio } (medio: altura de la linea del texto de al lado).
  function dibujarRaiz(r, x, y, tam, fuente, color, agregar) {
    var lh = tam * fuente.lh, partes = r.dentro.split(" / "), frac = partes.length === 2;
    var tamIdx = Math.round(tam * 0.6), idxW = medir(r.indice, tamIdx, fuente), idxH = tamIdx * fuente.lh;
    var arriba = 6, yT = y + arriba;                   // linea de arriba de la raiz
    var Hr = frac ? 2 * lh + 14 : lh + 6, yB = yT + Hr; // alto del radicando
    var medio = frac ? yT + 4 + lh + 4 : yT + Hr / 2;
    if (r.antes) { agregar(texto(x, medio - lh / 2, r.antes, tam, fuente, color, "left")); x += medir(r.antes, tam, fuente); }
    var w = tam * 0.7, codo = yB - Hr * 0.5;           // ancho del gancho y altura del quiebre
    var x0 = x + tam * 0.15 + Math.max(0, idxW - w * 0.45 + 2);
    var rx = x0 + w + tam * 0.2;                       // donde empieza el radicando
    var rw = frac ? Math.max(medir(partes[0], tam, fuente), medir(partes[1], tam, fuente)) + tam * 0.4
      : medir(r.dentro, tam, fuente);
    var fin = rx + rw + tam * 0.15;
    agregar(trazo([[x0, codo + tam * 0.25], [x0 + w * 0.25, codo], [x0 + w * 0.55, yB], [x0 + w, yT], [fin, yT],
      [fin, yT + tam * 0.25]], { strokeColor: color }));
    // indice: arriba del quiebre, terminando sobre el gancho
    agregar(texto(x0 + w * 0.45 - idxW, codo - idxH - 2, r.indice, tamIdx, fuente, color, "left"));
    if (frac) {
      var wn = medir(partes[0], tam, fuente), wd = medir(partes[1], tam, fuente);
      agregar(texto(rx + (rw - wn) / 2, yT + 4, partes[0], tam, fuente, color, "left"));
      agregar(trazo([[rx, medio], [rx + rw, medio]], { strokeColor: color }));
      agregar(texto(rx + (rw - wd) / 2, medio + 4, partes[1], tam, fuente, color, "left"));
    } else {
      agregar(texto(rx, yT + 4, r.dentro, tam, fuente, color, "left"));
    }
    if (r.despues) agregar(texto(fin + tam * 0.2, medio - lh / 2, r.despues, tam, fuente, color, "left"));
    return { alto: arriba + Hr, medio: medio };
  }

  // ======================================= ECUACIONES CON VALOR ABSOLUTO
  // No resuelve: arma la plantilla. La ecuacion va arriba con una llave
  // debajo; de la llave baja una linea que se abre en los dos casos del valor
  // absoluto de mas a la izquierda (E ≥ 0 y E < 0), cada uno con una flecha
  // hasta la ecuacion de ese caso (|E| reemplazado por E y por −(E)). Debajo
  // de cada caso queda espacio en blanco para resolverlo paso a paso.
  var RELACIONES_ABS = "=<>≤≥≠";
  // caracteres despues de los cuales un «−» es resta y una «|» cierra
  function esOperandoAbs(c) { return !!c && /[A-Za-z0-9α-ωΑ-Ω)\]}'!°π¹²³⁰-⁹₀-₉.,]/.test(c); }

  // Normaliza la escritura (− · ≤ ≥ potencias y espacios) y marca cada barra
  // como apertura o cierre. Devuelve { s, abre, cierra } con las posiciones
  // (en s) de la barra de apertura del valor absoluto de mas a la izquierda y
  // de la que lo cierra, o { error }.
  function leerEcuacionAbs(txt) {
    var t = String(txt || "").trim();
    if (!t) return { error: "Escribí la ecuación, por ejemplo: |x + 7/4| = 9/4" };
    t = t.replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠").replace(/[-–]/g, "−").replace(/\*/g, "·")
      .replace(/\^(\d+)/g, function (_, d) { return d.split("").map(function (c) { return SUPER[c]; }).join(""); })
      .replace(/\s+/g, "");
    var s = "", prev = "", pila = 0, abre = -1, cierra = -1, nivel = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (c === "|") {
        var cierre = pila > 0 && esOperandoAbs(prev);
        if (cierre) {
          if (s.slice(-1) === " ") s = s.slice(0, -1);
          pila--;
          if (pila === 0 && cierra < 0) cierra = s.length;
        } else {
          if (pila === 0 && abre < 0) abre = s.length;
          pila++;
        }
        s += c;
        prev = cierre ? ")" : "(";
        continue;
      }
      if (c === "(" || c === "[") nivel++;
      if (c === ")" || c === "]") nivel--;
      var binario = (c === "+" || c === "−") && esOperandoAbs(prev);
      if (RELACIONES_ABS.indexOf(c) >= 0 || binario) {
        s = s.replace(/ $/, "") + " " + c + " ";
      } else s += c;
      prev = c;
    }
    s = s.trim();
    if (abre < 0) return { error: "Falta el valor absoluto entre barras: |x + 1| = 3" };
    if (pila !== 0 || cierra < 0) return { error: "Las barras | del valor absoluto no cierran" };
    if (nivel !== 0) return { error: "Los paréntesis no están balanceados" };
    if (!/[=<>≤≥≠]/.test(s)) return { error: "Falta el «=» (o la desigualdad)" };
    var E = s.slice(abre + 1, cierra).trim();
    if (!E) return { error: "El valor absoluto está vacío" };
    return { s: s, abre: abre, cierra: cierra, E: E };
  }

  // ¿E tiene un + o − afuera de todo parentesis (o empieza con signo)?
  function tieneSumaAbs(E) {
    var n = 0, barras = 0;
    for (var i = 0; i < E.length; i++) {
      var c = E[i];
      if (c === "(" || c === "[") n++;
      else if (c === ")" || c === "]") n--;
      else if (c === "|") barras ^= 1;
      else if ((c === "+" || c === "−") && n === 0 && !barras) return true;
    }
    return false;
  }

  // Los dos casos: { cond: [E ≥ 0, E < 0], ec: [ecuacion con E, con −(E)] }
  function casosAbs(a, estricto) {
    var antes = a.s.slice(0, a.abre), despues = a.s.slice(a.cierra + 1), E = a.E;
    var ultimo = antes.replace(/\s+$/, "").slice(-1), primero = despues.replace(/^\s+/, "")[0] || "";
    // a la izquierda nada, una relacion o un parentesis; a la derecha nada,
    // una relacion, una suma o un parentesis: |E| esta suelto en un termino
    var izqLibre = !ultimo || RELACIONES_ABS.indexOf(ultimo) >= 0 || ultimo === "(" || ultimo === "[";
    var izqSuma = izqLibre || ultimo === "+";
    var derLibre = !primero || RELACIONES_ABS.indexOf(primero) >= 0 || /[+−)\]]/.test(primero);
    var suma = tieneSumaAbs(E), atomo = /^[A-Za-z0-9α-ωΑ-Ω.,']+$/.test(E);
    var pos = suma && !(izqSuma && derLibre) || (!atomo && /^[¹²³⁰-⁹]/.test(primero)) ? "(" + E + ")" : E;
    var neg = "−" + (atomo ? E : "(" + E + ")");
    if (!(izqLibre && derLibre)) neg = atomo ? "(" + neg + ")" : "[" + neg + "]";
    return {
      cond: [E + (estricto ? " > 0" : " ≥ 0"), E + (estricto ? " ≤ 0" : " < 0")],
      ec: [antes + pos + despues, antes + neg + despues],
    };
  }

  // ancho de lo que esta antes de la primera relacion (para alinear los «=»)
  function antesDelIgualAbs(s, tam, fuente) {
    var m = /[=<>≤≥≠]/.exec(s);
    return medir(m ? s.slice(0, m.index) : s, tam, fuente);
  }

  function generarAbs(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var lh = tam * fuente.lh, renglones = Math.max(0, Math.round(Number(op.renglones) || 0));
    var y = oy;
    op.filas.forEach(function (fila) {
      var a = leerEcuacionAbs(fila.texto);
      if (a.error) return;
      var cs = casosAbs(a, op.casos === "estricto");
      var color = op.colorLineas ? fila.color : TINTA;
      var ln = { strokeColor: color, strokeWidth: 2 };
      var fl = { type: "arrow", endArrowhead: "arrow", strokeColor: color, strokeWidth: 2 };
      // 1) la ecuacion y la llave debajo
      var wEc = medir(a.s, tam, fuente);
      agregar(texto(ox, y, a.s, tam, fuente, TINTA, "left"));
      var yLlave = y + lh + tam * 0.3, pata = tam * 0.4;
      agregar(trazo([[ox - 4, yLlave - pata], [ox - 4, yLlave], [ox + wEc + 4, yLlave], [ox + wEc + 4, yLlave - pata]], ln));
      // 2) posiciones de los dos casos (cada uno deja `renglones` vacios abajo)
      var xTallo = ox + tam * 1.2, xCond = xTallo + tam * 3;
      var wCond = Math.max(medir(cs.cond[0], tam, fuente), medir(cs.cond[1], tam, fuente));
      var xFlecha0 = xCond + wCond + tam * 0.8, xFlecha1 = xFlecha0 + Math.max(tam * 5, 80);
      var wIzq = Math.max(antesDelIgualAbs(cs.ec[0], tam, fuente), antesDelIgualAbs(cs.ec[1], tam, fuente));
      var xIgual = xFlecha1 + tam * 0.6 + wIzq;
      var y1 = yLlave + lh * 0.7, y2 = y1 + lh * (1 + renglones) + lh * 0.8;
      var medios = [y1 + lh / 2, y2 + lh / 2];
      // 3) el tallo que baja de la llave y las ramas, en orden de dibujo
      agregar(trazo([[xTallo, yLlave], [xTallo, medios[1]]], ln));
      [0, 1].forEach(function (k) {
        var yk = k ? y2 : y1, ym = medios[k];
        agregar(trazo([[xTallo, ym], [xCond - tam * 0.5, ym]], fl));
        agregar(texto(xCond, yk, cs.cond[k], tam, fuente, TINTA, "left"));
        agregar(trazo([[xFlecha0, ym], [xFlecha1, ym]], fl));
        agregar(texto(xIgual - antesDelIgualAbs(cs.ec[k], tam, fuente), yk, cs.ec[k], tam, fuente, TINTA, "left"));
      });
      y = y2 + lh * (1 + renglones) + lh * 1.5;
    });
  }

  // ============================================ ESTRUCTURAS ALGEBRAICAS
  // Cada fila define una operacion binaria con su formula: "x * y = x + y - 3"
  // (el simbolo de la operacion es lo que esta entre las dos variables). Para
  // cada propiedad se escribe su titulo, su definicion general y despues los
  // reemplazos con la definicion, sin resolver nada: en cada paso se
  // reemplazan todas las operaciones cuyos dos operandos ya no tienen la
  // operacion (las de mas adentro), hasta que no queda ninguna.
  var LETRAS_EST = "A-Za-zα-ωΑ-Ω";
  var IDENT_EST = "[" + LETRAS_EST + "](?:'+|[₀-₉]+)?";
  var FUNCIONES_TXT = { sin: 1, sen: 1, cos: 1, tan: 1, tg: 1, ln: 1, log: 1, sqrt: 1, exp: 1,
    max: 1, min: 1, mod: 1, abs: 1, mcd: 1, mcm: 1 };
  var SUPER = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

  function esAtomo(s) { return new RegExp("^(" + IDENT_EST + "|\\d+(?:[.,]\\d+)?)$").test(s); }

  function leerOperacion(txt) {
    var t = String(txt || "").trim();
    if (!t) return { error: "Escribí la operación, por ejemplo: x * y = x + y − 3" };
    var i = t.indexOf("=");
    if (i < 0) return { error: "Falta el «=»: x * y = x + y − 3" };
    var izq = t.slice(0, i), der = t.slice(i + 1).trim();
    var m = new RegExp("^\\s*(" + IDENT_EST + ")\\s*(\\S+?)\\s*(" + IDENT_EST + ")\\s*$").exec(izq);
    if (!m) return { error: "A la izquierda del «=» van dos variables y el símbolo: x * y" };
    if (m[1] === m[3]) return { error: "Las dos variables tienen que ser distintas: x * y" };
    if (!der) return { error: "Falta la definición a la derecha del «=»" };
    var nivel = 0;
    for (var k = 0; k < der.length; k++) {
      if (der[k] === "(") nivel++;
      if (der[k] === ")" && --nivel < 0) break;
    }
    if (nivel !== 0) return { error: "Los paréntesis no están balanceados" };
    // forma de escribir: − en vez de -, · para el producto, potencias numericas en superindice
    der = der.replace(/-/g, "−").replace(/\*/g, "·")
      .replace(/\^(\d+)/g, function (_, d) { return d.split("").map(function (c) { return SUPER[c]; }).join(""); });
    return { a: m[1], op: m[2], b: m[3], der: der };
  }

  // reemplaza en la definicion las dos variables por los operandos (los
  // compuestos van entre parentesis). Las letras pegadas (2xy) son variables
  // sueltas, salvo los nombres de funciones conocidas (sin, ln...).
  function reemplazar(def, a, b) {
    var envolver = function (s) { return esAtomo(s) ? s : "(" + s + ")"; };
    return def.der.replace(new RegExp("[" + LETRAS_EST + "]+(?:'+|[₀-₉]+)*", "g"), function (run) {
      if (FUNCIONES_TXT[run.toLowerCase()]) return run;
      return run.replace(new RegExp(IDENT_EST, "g"), function (v) {
        return v === def.a ? envolver(a) : v === def.b ? envolver(b) : v;
      });
    });
  }

  // arboles: { v: "x" } variable; { txt } ya reemplazado; { k, a, b } operacion k
  function esOp(n) { return n.k !== undefined; }
  function imprimirEstructura(n, defs, arriba) {
    if (n.v) return n.v;
    if (n.txt !== undefined) return arriba || esAtomo(n.txt) ? n.txt : "(" + n.txt + ")";
    var s = imprimirEstructura(n.a, defs) + " " + defs[n.k].op + " " + imprimirEstructura(n.b, defs);
    return arriba ? s : "(" + s + ")";
  }
  function pasoEstructura(n, defs) {
    if (!esOp(n)) return n;
    if (!esOp(n.a) && !esOp(n.b)) {
      var t = function (h) { return h.v || h.txt; };
      return { txt: reemplazar(defs[n.k], t(n.a), t(n.b)) };
    }
    return { k: n.k, a: pasoEstructura(n.a, defs), b: pasoEstructura(n.b, defs) };
  }

  var PROPIEDADES_EST = [
    { clave: "lci", titulo: "Ley de composición interna", lados: function (o) { return [o(0, "x", "y")]; },
      pre: function (S) { return "∀x, y: x ∈ " + S + " ∧ y ∈ " + S + " → "; }, suf: function (S) { return " ∈ " + S; } },
    { clave: "asociativa", titulo: "Asociatividad",
      lados: function (o) { return [o(0, "x", o(0, "y", "z")), o(0, o(0, "x", "y"), "z")]; },
      pre: function (S) { return "∀x, y, z ∈ " + S + ": "; } },
    { clave: "conmutativa", titulo: "Conmutatividad", lados: function (o) { return [o(0, "x", "y"), o(0, "y", "x")]; },
      pre: function (S) { return "∀x, y ∈ " + S + ": "; } },
    { clave: "neutro", titulo: "Existencia de elemento neutro",
      lados: function (o) { return [o(0, "x", "e"), o(0, "e", "x"), { v: "x" }]; },
      pre: function (S) { return "∃e ∈ " + S + " / ∀x ∈ " + S + ": "; } },
    { clave: "inverso", titulo: "Existencia de elemento inverso",
      lados: function (o) { return [o(0, "x", "x'"), o(0, "x'", "x"), { v: "e" }]; },
      pre: function (S) { return "∀x ∈ " + S + ", ∃x' ∈ " + S + " / "; } },
  ];
  var DISTRIBUTIVA = {
    clave: "distributiva", titulo: "Distributividad",
    lados: function (o) { return [o(0, "x", o(1, "y", "z")), o(1, o(0, "x", "y"), o(0, "x", "z"))]; },
    pre: function (S) { return "∀x, y, z ∈ " + S + ": "; },
  };

  // titulo, definicion general y pasos de una propiedad (lineas de texto)
  function desarrollarPropiedad(p, defs, S, op) {
    var o = function (k, a, b) {
      var h = function (x) { return typeof x === "string" ? { v: x } : x; };
      return { k: k, a: h(a), b: h(b) };
    };
    var lados = p.lados(o), pre = p.pre(S), suf = p.suf ? p.suf(S) : "";
    var ecuacion = function () { return lados.map(function (n) { return imprimirEstructura(n, defs, true); }).join(" = "); };
    // el primer paso es la expresion original, sin cuantificadores
    var res = { general: pre + ecuacion() + suf, pasos: [ecuacion() + suf] };
    for (var vuelta = 0; vuelta < 20 && lados.some(esOp); vuelta++) {
      lados = lados.map(function (n) { return pasoEstructura(n, defs); });
      res.pasos.push(ecuacion() + suf);
    }
    return res;
  }

  function generarEstructuras(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var lh = tam * fuente.lh, sangria = Math.round(tam * 1.5), y = oy;
    var filas = op.filas.map(function (f) {
      return { f: f, d: leerOperacion(f.texto), S: String(f.conjunto || "").trim() || "A" };
    }).filter(function (x) { return !x.d.error; });
    function bloque(p, defs, S, color) {
      var r = desarrollarPropiedad(p, defs, S, op);
      var titulo = p === DISTRIBUTIVA ? "Distributividad de " + defs[0].op + " sobre " + defs[1].op : p.titulo;
      if (op.titulos) { agregar(texto(ox, y, titulo, tam, fuente, color, "left")); y += lh + 6; }
      var x = ox + (op.titulos ? sangria : 0);
      if (op.general) { agregar(texto(x, y, r.general, tam, fuente, TINTA, "left")); y += lh + 6; }
      r.pasos.forEach(function (s) {
        agregar(texto(x + (op.general ? sangria : 0), y, s, tam, fuente, TINTA, "left"));
        y += lh + 6;
      });
      y += lh * 0.8;
    }
    filas.forEach(function (x) {
      if (op.escribirOperacion) {
        agregar(texto(ox, y, x.d.a + " " + x.d.op + " " + x.d.b + " = " + x.d.der + ",  con " +
          x.d.a + ", " + x.d.b + " ∈ " + x.S, tam, fuente, x.f.color, "left"));
        y += lh + lh * 0.8;
      }
      PROPIEDADES_EST.forEach(function (p) { if (op[p.clave]) bloque(p, [x.d], x.S, x.f.color); });
    });
    if (op.distributiva && filas.length >= 2) bloque(DISTRIBUTIVA, [filas[0].d, filas[1].d], filas[0].S, filas[0].f.color);
  }

  // ====================================================== COMBINATORIA
  // Cada fila es un calculo: "6 V 2", "5 C 3", "P 4", "3 VR 2", "4 CR 2",
  // "PR 6; 3, 2" (o V(6, 2), C6,2, 6!...). Se escribe la formula general, el
  // reemplazo en la formula con factoriales y la resolucion paso a paso:
  // simplificando (6 · 5 · 4! / 4!, tachando lo que se cancela) o desarrollando
  // todos los factoriales. Los calculos se hacen con BigInt.
  var MAX_COMB = 30;
  var SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", n: "ₙ", k: "ₖ", ",": "," };
  var SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", k: "ᵏ" };
  var NOMBRES_COMB = {
    P: "Permutaciones", V: "Variaciones simples", C: "Combinaciones simples",
    VR: "Variaciones con repetición", CR: "Combinaciones con repetición", PR: "Permutaciones con repetición",
  };
  function subindice(s) { return String(s).split("").map(function (c) { return SUB[c] || c; }).join(""); }
  function superindice(s) { return String(s).split("").map(function (c) { return SUP[c] || c; }).join(""); }
  function miles(b) { return b.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function factorialBig(n) { var r = 1n; for (var i = 2; i <= n; i++) r *= BigInt(i); return r; }

  function leerCombinatoria(txt) {
    var s = String(txt || "").trim().replace(/[’´`′]/g, "'").replace(/[₀-₉]/g, function (c) { return "₀₁₂₃₄₅₆₇₈₉".indexOf(c); });
    if (!s) return { error: "Escribí un cálculo, por ejemplo: 6 V 2" };
    var T = "(VR|CR|PR|V'|C'|P'|V|C|P)", N = "(\\d+)", m, r = null;
    var tipo = function (t) { t = t.toUpperCase(); return t.length === 2 && t[1] === "'" ? t[0] + "R" : t; };
    var lista = function (l) { return l.split(",").map(function (x) { return parseInt(x, 10); }); };
    if ((m = /^(\d+)\s*!$/.exec(s))) r = { tipo: "P", n: +m[1] };
    else if ((m = new RegExp("^" + N + "\\s*" + T + "\\s*" + N + "$", "i").exec(s))) {
      r = { tipo: tipo(m[2]), n: +m[1], k: +m[3] };
      if (r.tipo === "P") r.tipo = "V"; // nPr de las calculadoras
      if (r.tipo === "PR") r = { tipo: "PR", n: r.n, reps: [r.k] };
    }
    else if ((m = new RegExp("^" + T + "\\s*\\(?\\s*" + N + "\\s*[,;]\\s*" + N + "\\s*\\)?$", "i").exec(s)) && !/^P/i.test(m[1]))
      r = { tipo: tipo(m[1]), n: +m[2], k: +m[3] };
    else if ((m = /^(?:P|PR|P')\s*\(?\s*(\d+)\s*\)?$/i.exec(s)) || (m = /^(\d+)\s*P$/i.exec(s))) {
      if (/^P(R|')/i.test(s)) return { error: "Faltan las repeticiones: PR 6; 3, 2" };
      r = { tipo: "P", n: +m[1] };
    }
    else if ((m = /^(?:PR|P')\s*\(?\s*(\d+)\s*[;:]\s*(\d+(?:\s*,\s*\d+)*)\s*\)?$/i.exec(s)) ||
      (m = /^(\d+)\s*(?:PR|P')\s*(\d+(?:\s*,\s*\d+)*)$/i.exec(s)))
      r = { tipo: "PR", n: +m[1], reps: lista(m[2]) };
    else if ((m = /^(?:PR|P')\s*\(\s*(\d+(?:\s*,\s*\d+)+)\s*\)$/i.exec(s))) {
      var l = lista(m[1]);
      r = { tipo: "PR", n: l.reduce(function (a, b) { return a + b; }, 0), reps: l };
    }
    if (!r) return { error: "No entiendo el cálculo. Ejemplos: 6 V 2, 5 C 3, P 4, 3 VR 2, 4 CR 2, PR 6; 3, 2" };
    var tope = r.tipo === "CR" ? r.n + r.k - 1 : r.tipo === "VR" ? 0 : r.n;
    if (tope > MAX_COMB || r.n > MAX_COMB) return { error: "Hasta " + MAX_COMB + "! como máximo" };
    if ((r.tipo === "V" || r.tipo === "C") && r.k > r.n) return { error: "k no puede ser mayor que n (" + r.k + " > " + r.n + ")" };
    if (r.tipo === "CR" && r.n < 1) return { error: "En CR, n tiene que ser al menos 1" };
    if (r.tipo === "VR" && r.k > 60) return { error: "El exponente es demasiado grande" };
    if (r.tipo === "PR") {
      var suma = r.reps.reduce(function (a, b) { return a + b; }, 0);
      if (suma > r.n) return { error: "Las repeticiones suman " + suma + ", más que n = " + r.n };
    }
    return r;
  }

  // simbolo del calculo: V₆,₂ / V(6, 2); PR₆(3, 2) / PR(6; 3, 2)
  function simboloComb(c, op, letras) {
    var nom = c.tipo[0] + (c.tipo.length > 1 ? (op.repeticion === "prima" ? "'" : "R") : "");
    var n = letras ? "n" : c.n, k = letras ? "k" : c.k;
    var reps = letras ? "a, b, c" : (c.reps || []).join(", ");
    if (op.notacion === "paren") {
      if (c.tipo === "P") return nom + "(" + n + ")";
      if (c.tipo === "PR") return nom + "(" + n + "; " + reps + ")";
      return nom + "(" + n + ", " + k + ")";
    }
    if (c.tipo === "P") return nom + subindice(n);
    if (c.tipo === "PR") return nom + subindice(n) + "(" + reps + ")";
    return nom + subindice(n) + subindice(",") + subindice(k);
  }

  // un renglon es { num: [segmentos], den: [segmentos] | null }; segmento { t, tachar }
  function sg(t, tachar) { return { t: t, tachar: !!tachar }; }
  function plano(t) { return { num: [sg(t)], den: null }; }
  function fraccion(num, den) {
    return { num: typeof num === "string" ? [sg(num)] : num, den: typeof den === "string" ? [sg(den)] : den };
  }
  function producto(desde, hasta) { // desde · (desde − 1) · ... · hasta
    var p = [];
    for (var i = desde; i >= hasta; i--) p.push(i);
    return p.length ? p.join(" · ") : "1";
  }
  function factorialDesarrollado(d) { return d <= 1 ? "1" : producto(d, 1); }
  function unir(lista) { return lista.join(" · "); }
  function paren(s, muchos) { return muchos && / /.test(s) ? "(" + s + ")" : s; }

  // pasos de N! / (d1! · d2! · ...) despues del reemplazo
  function resolverFactoriales(N, ds, modo, tachar) {
    var lineas = [], valor = factorialBig(N);
    ds.forEach(function (d) { valor /= factorialBig(d); });
    var denFact = function (lst) { return unir(lst.map(function (d) { return d + "!"; })); };
    if (!ds.length) {
      if (N >= 2) lineas.push(plano(producto(N, 1)));
      lineas.push(plano(miles(valor)));
      return lineas;
    }
    var expDen = function (lst) {
      return unir(lst.map(function (d) { return paren(factorialDesarrollado(d), lst.length > 1); }));
    };
    var valDen = function (lst) { return lst.reduce(function (a, d) { return a * factorialBig(d); }, 1n); };
    var numFact = [], resto = ds.slice();
    if (modo === "completo") {
      lineas.push(fraccion(factorialDesarrollado(N), expDen(resto)));
      numFact = N >= 2 ? null : [];
    } else {
      var d = Math.max.apply(null, ds), i = ds.indexOf(d);
      if (d >= 2) {
        // N! = N · ... · (d + 1) · d!, y d! se cancela con el del denominador
        var num = d < N ? [sg(producto(N, d + 1) + " · "), sg(d + "!", tachar)] : [sg(N + "!", tachar)];
        var den = [];
        ds.forEach(function (x, j) {
          if (j) den.push(sg(" · "));
          den.push(sg(x + "!", tachar && j === i));
        });
        lineas.push(fraccion(num, den));
        resto.splice(i, 1);
        for (var x = N; x > d; x--) numFact.push(x);
        if (resto.length) lineas.push(fraccion(numFact.length ? unir(numFact) : "1", denFact(resto)));
        else lineas.push(plano(numFact.length ? unir(numFact) : "1"));
      } else {
        numFact = null; // nada para cancelar: se desarrolla N!
      }
      if (resto.length) {
        var numTxt = numFact === null ? factorialDesarrollado(N) : numFact.length ? unir(numFact) : "1";
        lineas.push(fraccion(numTxt, expDen(resto)));
      }
    }
    var numVal = numFact === null ? factorialBig(N) : numFact.reduce(function (a, x) { return a * BigInt(x); }, 1n);
    if (resto.length) {
      var dv = resto.map(function (x) { return factorialBig(x); });
      if (dv.length > 1 && dv.some(function (v) { return v > 1n; })) {
        lineas.push(fraccion(miles(numVal), unir(dv.map(miles))));
      }
      if (valDen(resto) !== 1n) lineas.push(fraccion(miles(numVal), miles(valDen(resto))));
    }
    lineas.push(plano(miles(valor)));
    return lineas;
  }

  // formula general, reemplazo y pasos de un calculo
  function desarrollarComb(c, op) {
    var res = { nombre: NOMBRES_COMB[c.tipo], simboloGral: simboloComb(c, op, true), simbolo: simboloComb(c, op) };
    var den = function (l) { return unir(l); };
    if (c.tipo === "P") {
      res.general = plano("n!");
      res.pasos = [plano(c.n + "!")].concat(resolverFactoriales(c.n, [], op.desarrollo, op.tachar));
    } else if (c.tipo === "V") {
      res.general = fraccion("n!", "(n − k)!");
      res.pasos = [fraccion(c.n + "!", "(" + c.n + " − " + c.k + ")!"), fraccion(c.n + "!", (c.n - c.k) + "!")]
        .concat(resolverFactoriales(c.n, [c.n - c.k], op.desarrollo, op.tachar));
    } else if (c.tipo === "C") {
      res.general = fraccion("n!", "k! · (n − k)!");
      res.pasos = [fraccion(c.n + "!", c.k + "! · (" + c.n + " − " + c.k + ")!"),
        fraccion(c.n + "!", den([c.k + "!", (c.n - c.k) + "!"]))]
        .concat(resolverFactoriales(c.n, [c.k, c.n - c.k], op.desarrollo, op.tachar));
    } else if (c.tipo === "CR") {
      var N = c.n + c.k - 1;
      res.general = fraccion("(n + k − 1)!", "k! · (n − 1)!");
      res.pasos = [fraccion("(" + c.n + " + " + c.k + " − 1)!", c.k + "! · (" + c.n + " − 1)!"),
        fraccion(N + "!", den([c.k + "!", (c.n - 1) + "!"]))]
        .concat(resolverFactoriales(N, [c.k, c.n - 1], op.desarrollo, op.tachar));
    } else if (c.tipo === "PR") {
      res.general = fraccion("n!", "a! · b! · c! ···");
      res.pasos = [fraccion(c.n + "!", den(c.reps.map(function (r) { return r + "!"; })))]
        .concat(resolverFactoriales(c.n, c.reps, op.desarrollo, op.tachar));
    } else { // VR
      res.general = plano("n" + SUP.k);
      var v = BigInt(c.n) ** BigInt(c.k);
      res.pasos = [plano(c.n + superindice(c.k))];
      if (c.k >= 2 && c.k <= 12) res.pasos.push(plano(unir(Array(c.k).fill(c.n))));
      res.pasos.push(plano(miles(v)));
    }
    // sin renglones repetidos seguidos
    var vistos = "";
    res.pasos = res.pasos.filter(function (l) {
      var k = JSON.stringify([l.num.map(function (s) { return s.t; }), l.den && l.den.map(function (s) { return s.t; })]);
      if (k === vistos) return false;
      vistos = k;
      return true;
    });
    return res;
  }

  function generarCombinatoria(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var lh = tam * fuente.lh, y = oy, barra = op.fracciones !== "linea", sangria = Math.round(tam * 1.5);
    var ancho = function (segs) { return medir(segs.map(function (s) { return s.t; }).join(""), tam, fuente); };

    // escribe los segmentos desde (x, y), tachando los marcados
    function segmentos(segs, x, yy, color) {
      var txt = segs.map(function (s) { return s.t; }).join("");
      agregar(texto(x, yy, txt, tam, fuente, color, "left"));
      var pre = "";
      segs.forEach(function (s) {
        if (s.tachar) {
          var x0 = x + medir(pre, tam, fuente), x1 = x0 + medir(s.t, tam, fuente);
          agregar(trazo([[x0 - 2, yy + lh * 0.85], [x1 + 2, yy + lh * 0.15]], { strokeColor: COLORES[1] }));
        }
        pre += s.t;
      });
    }
    // un renglon: devuelve { w, h, medio } (medio = altura del "=")
    function medidas(l) {
      if (!l.den) return { w: ancho(l.num), h: lh, medio: lh / 2 };
      if (barra) return { w: Math.max(ancho(l.num), ancho(l.den)) + tam * 0.6, h: lh * 2 + 10, medio: lh + 5 };
      return { w: ancho(enLinea(l)), h: lh, medio: lh / 2 };
    }
    function enLinea(l) {
      var muchos = function (segs) { return / /.test(segs.map(function (s) { return s.t; }).join("")); };
      var n = l.num.slice(), d = l.den.slice();
      if (muchos(n)) { n.unshift(sg("(")); n.push(sg(")")); }
      if (muchos(d)) { d.unshift(sg("(")); d.push(sg(")")); }
      return n.concat([sg(" / ")], d);
    }
    function renglon(l, x, yy, color) {
      var m = medidas(l);
      if (!l.den) segmentos(l.num, x, yy, color);
      else if (!barra) segmentos(enLinea(l), x, yy, color);
      else {
        var wn = ancho(l.num), wd = ancho(l.den);
        segmentos(l.num, x + (m.w - wn) / 2, yy, color);
        agregar(trazo([[x, yy + lh + 5], [x + m.w, yy + lh + 5]], { strokeColor: color }));
        segmentos(l.den, x + (m.w - wd) / 2, yy + lh + 10, color);
      }
      return m;
    }
    // "simbolo = renglon" y debajo "= renglon" con los "=" alineados
    function recuadrar(x, yy, m, color) {
      var p = tam * 0.3;
      agregar(base("rectangle", {
        x: x - p, y: yy - p * 0.6, width: m.w + 2 * p, height: m.h + p * 1.2,
        strokeColor: color, strokeWidth: 2, roundness: { type: 3 },
      }));
    }
    function igualdad(simbolo, lineas, x, color, colorFinal) {
      var wSim = medir(simbolo + " ", tam, fuente), wIg = medir("= ", tam, fuente);
      if (op.disposicion === "derecha") {
        // todo en un renglon, con los "=" a la altura de las barras de fraccion
        var ms = lineas.map(medidas);
        var arriba = Math.max.apply(null, ms.map(function (m) { return m.medio; }));
        var abajo = Math.max.apply(null, ms.map(function (m) { return m.h - m.medio; }));
        var xx = x + wSim;
        agregar(texto(x, y + arriba - lh / 2, simbolo, tam, fuente, color, "left"));
        lineas.forEach(function (l, i) {
          var m = ms[i], ultimo = i === lineas.length - 1 && colorFinal, yy = y + arriba - m.medio;
          agregar(texto(xx, y + arriba - lh / 2, "=", tam, fuente, color, "left"));
          xx += wIg + (ultimo && op.recuadro ? tam * 0.3 : 0);
          renglon(l, xx, yy, ultimo ? colorFinal : color);
          if (ultimo && op.recuadro) recuadrar(xx, yy, m, colorFinal);
          xx += m.w + wIg * 0.6;
        });
        y += arriba + abajo + 8;
        return;
      }
      lineas.forEach(function (l, i) {
        var m = medidas(l), yy = y, ultimo = i === lineas.length - 1 && colorFinal;
        var c = ultimo ? colorFinal : color, xr = x + wSim + wIg + (ultimo && op.recuadro ? tam * 0.3 : 0);
        if (!i) agregar(texto(x, y + m.medio - lh / 2, simbolo, tam, fuente, color, "left"));
        agregar(texto(x + wSim, y + m.medio - lh / 2, "=", tam, fuente, color, "left"));
        renglon(l, xr, yy, c);
        if (ultimo && op.recuadro) recuadrar(xr, yy, m, colorFinal);
        y += m.h + (l.den && barra ? 12 : 6);
      });
    }

    op.filas.forEach(function (f) {
      var c = leerCombinatoria(f.texto);
      if (c.error) return;
      var r = desarrollarComb(c, op);
      if (op.titulos) { agregar(texto(ox, y, r.nombre, tam, fuente, f.color, "left")); y += lh + 8; }
      var x = ox + (op.titulos ? sangria : 0);
      if (op.formula) { igualdad(r.simboloGral, [r.general], x, TINTA); y += lh * 0.4; }
      igualdad(r.simbolo, r.pasos, x, TINTA, op.colorResultado ? f.color : null);
      y += lh * 1.2;
    });
  }

  // ======================================================== MCM Y MCD
  // Cada fila es una lista de numeros naturales: "12, 18, 30". Se descompone
  // cada uno en factores primos (con la tabla de divisiones sucesivas), se
  // escribe su factorizacion y despues:
  //   MCD = factores comunes con el menor exponente
  //   MCM = factores comunes y no comunes con el mayor exponente
  var MAX_MCM = 1e9;

  function leerNumerosMcm(txt) {
    var t = String(txt || "").trim();
    if (!t) return { error: "Escribí los números separados por coma, por ejemplo: 12, 18, 30" };
    var partes = t.split(/[,;\s]+/).filter(function (x) { return x; }), nums = [];
    for (var i = 0; i < partes.length; i++) {
      var p = partes[i].replace(/\./g, "");
      if (!/^\d+$/.test(p)) return { error: "«" + partes[i] + "» no es un número natural" };
      var n = parseInt(p, 10);
      if (n < 1) return { error: "Los números tienen que ser mayores que 0" };
      if (n > MAX_MCM) return { error: "Hasta " + miles(MAX_MCM) + " como máximo" };
      nums.push(n);
    }
    if (nums.length < 2) return { error: "Hacen falta al menos dos números" };
    if (nums.length > 6) return { error: "Hasta 6 números" };
    return { nums: nums };
  }

  // divisiones sucesivas: [{ n, p }] (el ultimo renglon es 1, sin primo)
  function escalera(n) {
    var filas = [], p = 2;
    while (n > 1) {
      if (p * p > n) p = n; // lo que queda es primo
      if (n % p === 0) { filas.push({ n: n, p: p }); n /= p; } else p += p === 2 ? 1 : 2;
    }
    filas.push({ n: 1, p: null });
    return filas;
  }
  // { primo: exponente }
  function factores(n) {
    var f = {};
    escalera(n).forEach(function (r) { if (r.p) f[r.p] = (f[r.p] || 0) + 1; });
    return f;
  }
  // "2² · 3 · 5" (1 si no hay factores)
  function escribirFactores(f, por) {
    var ps = Object.keys(f).map(Number).filter(function (p) { return f[p] > 0; }).sort(function (a, b) { return a - b; });
    if (!ps.length) return "1";
    return ps.map(function (p) { return p + (f[p] > 1 ? superindice(f[p]) : ""); }).join(por);
  }
  function valorFactores(f) {
    var v = 1n;
    for (var p in f) v *= BigInt(p) ** BigInt(f[p]);
    return v;
  }

  function calcularMcm(nums) {
    var fs = nums.map(factores), primos = {};
    fs.forEach(function (f) { for (var p in f) primos[p] = true; });
    var mcd = {}, mcm = {};
    Object.keys(primos).forEach(function (p) {
      var exps = fs.map(function (f) { return f[p] || 0; });
      var menor = Math.min.apply(null, exps), mayor = Math.max.apply(null, exps);
      if (menor > 0) mcd[p] = menor;
      mcm[p] = mayor;
    });
    return { fs: fs, mcd: mcd, mcm: mcm, vMcd: valorFactores(mcd), vMcm: valorFactores(mcm) };
  }

  function generarMcm(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var lh = tam * fuente.lh, por = op.producto === "x" ? " × " : " · ";
    var sangria = Math.round(tam * 1.5);
    var nom = op.notacion === "puntos" ? { mcm: "m.c.m.", mcd: "m.c.d." } : { mcm: "MCM", mcd: "MCD" };

    op.filas.forEach(function (fila) {
      var l = leerNumerosMcm(fila.texto);
      if (l.error) return;
      var nums = l.nums, r = calcularMcm(nums), lista = nums.map(miles).join(", ");
      var y = this.y, x = ox;
      var color = fila.color, finales = op.colorResultado ? color : TINTA;
      if (op.titulos) {
        var que = [op.mcm && nom.mcm, op.mcd && nom.mcd].filter(Boolean).join(" y ") || nom.mcm;
        agregar(texto(ox, y, que + " de " + lista.replace(/, ([^,]*)$/, " y $1"), tam, fuente, color, "left"));
        y += lh + 10;
        x = ox + sangria;
      }
      // 1) tablas de divisiones sucesivas, una al lado de la otra
      if (op.tablas) {
        var xt = x, alto = 0;
        nums.forEach(function (n) {
          var esc = escalera(n);
          var wn = Math.max.apply(null, esc.map(function (e) { return medir(miles(e.n), tam, fuente); }));
          var wp = Math.max.apply(null, esc.map(function (e) { return e.p ? medir(String(e.p), tam, fuente) : 0; }));
          var gap = tam * 0.4, xl = xt + wn + gap; // linea vertical
          esc.forEach(function (e, i) {
            agregar(texto(xt + wn, y + i * lh, miles(e.n), tam, fuente, TINTA, "right"));
            if (e.p) agregar(texto(xl + gap, y + i * lh, String(e.p), tam, fuente, color, "left"));
          });
          agregar(trazo([[xl, y], [xl, y + esc.length * lh]], { strokeColor: TINTA }));
          alto = Math.max(alto, esc.length * lh);
          xt = xl + gap + wp + tam * 2.2;
        });
        y += alto + lh * 0.8;
      }
      // 2) factorizacion de cada numero, con los "=" alineados
      var wMax = Math.max.apply(null, nums.map(function (n) { return medir(miles(n), tam, fuente); }));
      var wIg = medir(" = ", tam, fuente);
      nums.forEach(function (n, i) {
        agregar(texto(x + wMax, y, miles(n), tam, fuente, TINTA, "right"));
        agregar(texto(x + wMax, y, " = " + escribirFactores(r.fs[i], por), tam, fuente, TINTA, "left"));
        y += lh + 4;
      });
      y += lh * 0.6;
      // 3) resultados
      function resultado(cual, f, v, regla) {
        if (op.regla) {
          agregar(texto(x, y, regla, Math.round(tam * 0.8), fuente, GUIA, "left"));
          y += tam * 0.8 * fuente.lh + 4;
        }
        var izq = cual + "(" + lista + ") = ", fac = escribirFactores(f, por), val = miles(v);
        var cuerpo = fac === val ? "" : fac + " = ";
        agregar(texto(x, y, izq + cuerpo, tam, fuente, TINTA, "left"));
        var xv = x + medir(izq + cuerpo, tam, fuente);
        agregar(texto(xv, y, val, tam, fuente, finales, "left"));
        if (op.recuadro) {
          var p = tam * 0.25, wv = medir(val, tam, fuente);
          agregar(base("rectangle", { x: xv - p, y: y - p * 0.6, width: wv + 2 * p, height: lh + p * 1.2,
            strokeColor: finales, strokeWidth: 2, roundness: { type: 3 } }));
        }
        y += lh + 10;
      }
      if (op.mcd) resultado(nom.mcd, r.mcd, r.vMcd, r.vMcd === 1n ? "No hay factores primos comunes: el " + nom.mcd + " es 1"
        : "Factores comunes con el menor exponente");
      if (op.mcm) resultado(nom.mcm, r.mcm, r.vMcm, "Factores comunes y no comunes con el mayor exponente");
      this.y = y + lh;
    }, { y: oy });
  }

  // ================================================= NUMEROS COMPLEJOS
  // Cada fila es un numero complejo con nombre (z₁, z₂...) escrito en
  // cualquier forma, o una operacion entre filas de arriba (z₁ · z₂):
  //   binomica       3 + 4i, −2i, 1/2 + √3/2 i
  //   par ordenado   (3, 4)  o  (0,5; 2)
  //   polar          [5; 53,13°], [2; π/4], 5∠30°
  //   trigonometrica 5(cos 30° + i sen 30°), 2(cos(π/4) + i sin(π/4))
  // Los angulos con ° van en grados; sin ° en radianes (admiten π).
  // Se escribe el pasaje a las otras formas elegidas, paso a paso (modulo con
  // √(a² + b²), argumento con arctg(b/a) segun el cuadrante, a = ρ · cos φ...)
  // y las operaciones (+, −, ·, /) en forma binomica y/o polar.
  var EPS_C = 1e-9;
  function nombreComplejo(i) { return "z" + subindice(i + 1); }
  function normNombreC(s) {
    return String(s || "").replace(/\s+/g, "").replace(/[₀-₉]/g, function (c) { return "₀₁₂₃₄₅₆₇₈₉".indexOf(c); });
  }
  var NOMBRE_C = "[A-Za-zα-ωΑ-Ω][A-Za-z0-9₀-₉']*";

  function leerAnguloC(s) {
    s = String(s).trim();
    var grados = /[°º]$/.test(s), v = evaluar(s.replace(/[°º]$/, ""));
    return isNaN(v) ? null : grados ? v * Math.PI / 180 : v;
  }

  // numero complejo escrito: { re, im, forma, rho, phi } o { error }
  function leerComplejo(txt) {
    var s = String(txt || "").trim().replace(/[−–]/g, "-").replace(/\bsin\b/gi, "sen");
    if (!s) return { error: "Escribí un número, por ejemplo 3 + 4i, (3, 4), [5; 53,13°] o 5(cos 30° + i sen 30°)" };
    var m, rho, phi;
    function polar(forma, r, f) {
      rho = evaluar(r); phi = leerAnguloC(f);
      if (isNaN(rho)) return { error: "No entiendo el módulo «" + r.trim() + "»" };
      if (phi === null) return { error: "No entiendo el ángulo «" + f.trim() + "» (en grados con °, o en radianes: π/4)" };
      if (rho < 0) return { error: "El módulo no puede ser negativo" };
      return { re: rho * Math.cos(phi), im: rho * Math.sin(phi), forma: forma, rho: rho, phi: phi };
    }
    // trigonometrica: ρ(cos φ + i sen φ)
    m = /^(.*?)\s*[·*]?\s*\(\s*cos\s*\(?\s*([^()]+?)\s*\)?\s*\+\s*i\s*[·*]?\s*sen\s*\(?\s*([^()]+?)\s*\)?\s*\)$/i.exec(s);
    if (m) {
      var f1 = leerAnguloC(m[2]), f2 = leerAnguloC(m[3]);
      if (f1 !== null && f2 !== null && Math.abs(f1 - f2) > 1e-9) return { error: "El ángulo del coseno y el del seno tienen que ser iguales" };
      return polar("trig", m[1].trim() || "1", m[2]);
    }
    // polar: [ρ; φ], [ρ, φ] o ρ∠φ
    if ((m = /^\[\s*([^;]+?)\s*;\s*([^;]+?)\s*\]$/.exec(s)) || (m = /^\[\s*([^,;]+?)\s*,\s*([^,;]+?)\s*\]$/.exec(s)) ||
      (m = /^([^∠]+?)\s*∠\s*(.+)$/.exec(s))) return polar("polar", m[1], m[2]);
    // par ordenado: (a, b) o (a; b)
    if ((m = /^\(\s*([^;]+?)\s*;\s*([^;]+?)\s*\)$/.exec(s)) || (m = /^\(\s*([^,;()]+?)\s*,\s*([^,;()]+?)\s*\)$/.exec(s))) {
      var a = evaluar(m[1]), b = evaluar(m[2]);
      if (isNaN(a) || isNaN(b)) return { error: "En el par ordenado (a, b) van dos números reales" };
      return { re: a, im: b, forma: "par" };
    }
    // binomica: terminos sumados; el que tiene i es la parte imaginaria
    var t = s.replace(/\s+/g, "").replace(/pi/gi, "π"), terminos = [], ini = 0, nivel = 0;
    for (var k = 0; k < t.length; k++) {
      var c = t[k];
      if (c === "(") nivel++;
      if (c === ")") nivel--;
      if ((c === "+" || c === "-") && nivel === 0 && k > ini && !/[+\-*\/^(·×]/.test(t[k - 1])) {
        terminos.push(t.slice(ini, k)); ini = k;
      }
    }
    terminos.push(t.slice(ini));
    var re = 0, im = 0;
    for (var j = 0; j < terminos.length; j++) {
      var term = terminos[j], n = (term.match(/i/g) || []).length;
      if (n > 1) return { error: "No entiendo «" + term + "»: una sola i por término" };
      if (n === 1) {
        var coef = term.replace("i", "").replace(/[·*×]$/, "").replace(/^([+-]?)[·*×]/, "$1");
        var v = coef === "" || coef === "+" ? 1 : coef === "-" ? -1 : evaluar(coef);
        if (isNaN(v)) return { error: "No entiendo «" + term + "»" };
        im += v;
      } else {
        var w = evaluar(term);
        if (isNaN(w)) return { error: "No entiendo «" + term + "». Formas: 3 + 4i, (3, 4), [5; 53,13°], 5(cos 30° + i sen 30°)" };
        re += w;
      }
    }
    return { re: re, im: im, forma: "binomica" };
  }

  // filas: numeros y operaciones, con sus valores y errores
  function analizarComplejos(op) {
    var defs = {}, filas = [];
    var reOp = new RegExp("^(" + NOMBRE_C + ")\\s*([+\\-−·*×/÷:])\\s*(" + NOMBRE_C + ")$");
    op.filas.forEach(function (f, i) {
      var nombre = String(f.nombre || "").trim() || nombreComplejo(i), clave = normNombreC(nombre);
      var r = { nombre: nombre, color: f.color, errores: [] }, t = String(f.texto || "").trim();
      var m = reOp.exec(t);
      if (m && m[1] !== "i" && m[3] !== "i") {
        var a = defs[normNombreC(m[1])], b = defs[normNombreC(m[3])];
        [[a, m[1]], [b, m[3]]].forEach(function (x) {
          if (!x[0]) r.errores.push("No hay un número llamado " + x[1] + " en las filas de arriba");
        });
        if (!r.errores.length) {
          var s = { "+": "+", "-": "−", "−": "−", "·": "·", "*": "·", "×": "·", "/": "/", "÷": "/", ":": "/" }[m[2]];
          r.forma = "op"; r.op = { a: a, b: b, s: s };
          var ar = a.re, ai = a.im, br = b.re, bi = b.im;
          if (s === "+") { r.re = ar + br; r.im = ai + bi; }
          else if (s === "−") { r.re = ar - br; r.im = ai - bi; }
          else if (s === "·") { r.re = ar * br - ai * bi; r.im = ar * bi + ai * br; }
          else {
            var d = br * br + bi * bi;
            if (d < EPS_C) r.errores.push("No se puede dividir por 0 (" + b.nombre + " = 0)");
            else { r.re = (ar * br + ai * bi) / d; r.im = (ai * br - ar * bi) / d; }
          }
        }
      } else {
        var c = leerComplejo(t);
        if (c.error) r.errores.push(c.error);
        else for (var k in c) r[k] = c[k];
      }
      if (defs[clave]) r.errores.push("Ya hay otro número llamado " + nombre);
      if (!r.errores.length) defs[clave] = r;
      filas.push(r);
    });
    return filas;
  }
  function erroresComplejo(t, op, i) {
    var f = analizarComplejos(op)[i];
    return f ? f.errores : [];
  }

  // herramientas de escritura segun las opciones (decimales, unidad de los angulos...)
  function herramientasC(op) {
    var dec = +op.decimales || 2, grados = op.unidad !== "rad", r360 = op.rango !== "180", H = {};
    H.num = function (v) {
      if (Math.abs(v) < EPS_C) v = 0;
      var r = Math.round(v);
      if (Math.abs(v - r) < EPS_C) return { t: String(r).replace("-", "−"), ex: true };
      var f = Number(v.toFixed(dec));
      if (f === 0) f = 0;
      return { t: String(f).replace(".", ",").replace("-", "−"), ex: Math.abs(f - v) < EPS_C };
    };
    H.n = function (v) { return H.num(v).t; };
    H.ex = function (v) { return H.num(v).ex; };
    H.p = function (v) { return v < -EPS_C ? "(" + H.n(v) + ")" : H.n(v); };   // con parentesis si es negativo
    H.sq = function (v) { return (v < -EPS_C || !H.num(v).ex && /,/.test(H.n(v)) ? "(" + H.n(v) + ")" : H.n(v)) + "²"; };
    // angulo: en grados (53,13°) o en radianes (3π/4, o 2,21 rad)
    H.piTxt = function (rad) {
      var k = rad / Math.PI;
      for (var den = 1; den <= 12; den++) {
        var num = k * den;
        if (Math.abs(num - Math.round(num)) < 1e-9) {
          num = Math.round(num);
          if (num === 0) return "0";
          return (num < 0 ? "−" : "") + (Math.abs(num) === 1 ? "" : Math.abs(num)) + "π" + (den > 1 ? "/" + den : "");
        }
      }
      return null;
    };
    H.ang = function (rad, sinUnidad) {
      if (grados) return H.n(rad * 180 / Math.PI) + "°";
      return H.piTxt(rad) || H.n(rad) + (sinUnidad ? "" : " rad");
    };
    H.angEx = function (rad) { return grados ? H.ex(rad * 180 / Math.PI) : !!H.piTxt(rad) || H.ex(rad); };
    H.vuelta = grados ? "360°" : "2π";
    H.media = grados ? "180°" : "π";
    // lleva el angulo al rango elegido: [0, 2π) o (−π, π]
    H.normal = function (rad) {
      var v = rad % (2 * Math.PI);
      if (r360) { if (v < -EPS_C) v += 2 * Math.PI; if (Math.abs(v - 2 * Math.PI) < EPS_C) v = 0; }
      else { if (v <= -Math.PI + EPS_C) v += 2 * Math.PI; if (v > Math.PI + EPS_C) v -= 2 * Math.PI; }
      return Math.abs(v) < EPS_C ? 0 : v;
    };
    H.r360 = r360;
    // formas escritas
    H.imag = function (v) { // 4i, −2i, i, −i
      var c = Math.abs(Math.abs(v) - 1) < EPS_C ? "" : H.n(Math.abs(v));
      return (v < 0 ? "−" : "") + c + "i";
    };
    H.binom = function (re, im) {
      var zr = Math.abs(re) < EPS_C, zi = Math.abs(im) < EPS_C;
      if (zi) return H.n(re);
      if (zr) return H.imag(im);
      return H.n(re) + (im < 0 ? " − " : " + ") + H.imag(Math.abs(im));
    };
    H.par = function (re, im) {
      var a = H.n(re), b = H.n(im);
      return "(" + a + (/,/.test(a + b) ? "; " : ", ") + b + ")";
    };
    H.polarTxt = function (r, f) { return op.notacionPolar === "angulo" ? r + "∠" + f : "[" + r + "; " + f + "]"; };
    H.polar = function (rho, phi) { return H.polarTxt(H.n(rho), H.ang(phi)); };
    H.trig = function (rho, phi) {
      var a = H.ang(phi), r = Math.abs(rho - 1) < EPS_C ? "" : H.n(rho);
      if (a[0] === "−") a = "(" + a + ")";
      return r + "(cos " + a + " + i sen " + a + ")";
    };
    return H;
  }

  // Una cadena de igualdades: { izq, partes: [{ t, ap }] }; ap = va con ≈
  function cadenaC(izq, partes) {
    var out = [];
    partes.forEach(function (p) { if (p && (!out.length || out[out.length - 1].t !== p.t)) out.push(p); });
    return { izq: izq, partes: out };
  }

  // modulo y argumento desde a y b
  function pasosPolarC(re, im, H, nombre) {
    var quien = "El número complejo " + (nombre || "z");
    var L = [], a2 = re * re, b2 = im * im, s = a2 + b2, rho = Math.sqrt(s), phi = 0;
    L.push(cadenaC("ρ = |z|", [{ t: "√(a² + b²)" },
      { t: "√(" + H.sq(re) + " + " + H.sq(im) + ")", ap: !H.ex(re) || !H.ex(im) },
      { t: "√(" + H.n(a2) + " + " + H.n(b2) + ")", ap: !H.ex(a2) || !H.ex(b2) },
      { t: "√" + (/[ ,]/.test(H.n(s)) ? "(" + H.n(s) + ")" : H.n(s)), ap: !H.ex(s) },
      { t: H.n(rho), ap: !H.ex(rho) }]));
    if (rho < EPS_C) {
      L.push(quien + " es 0: su argumento no está definido (se toma φ = 0)");
      return { lineas: L, rho: 0, phi: 0 };
    }
    if (Math.abs(re) < EPS_C) {
      phi = H.normal(im > 0 ? Math.PI / 2 : -Math.PI / 2);
      L.push(quien + " está sobre el eje imaginario porque a = 0 y b " + (im > 0 ? "> 0," : "< 0,"));
      L.push("por lo tanto, su ángulo es: φ = " + H.ang(phi));
    } else if (Math.abs(im) < EPS_C) {
      phi = re > 0 ? 0 : Math.PI;
      L.push(quien + " está sobre el eje real porque b = 0 y a " + (re > 0 ? "> 0," : "< 0,"));
      L.push("por lo tanto, su ángulo es: φ = " + H.ang(phi));
    } else {
      var cuad = re > 0 ? (im > 0 ? 1 : 4) : (im > 0 ? 2 : 3);
      var suma = cuad === 2 ? Math.PI : cuad === 3 ? (H.r360 ? Math.PI : -Math.PI) : cuad === 4 && H.r360 ? 2 * Math.PI : 0;
      var sumaTxt = !suma ? "" : (suma > 0 ? " + " : " − ") + (Math.abs(suma) > 4 ? H.vuelta : H.media);
      L.push(quien + " está en el " + ["", "1.er", "2.º", "3.er", "4.º"][cuad] + " cuadrante porque a " +
        (re > 0 ? "> 0" : "< 0") + " y b " + (im > 0 ? "> 0," : "< 0,"));
      L.push("por lo tanto, su ángulo es: φ = arctg(b/a)" + sumaTxt);
      // cociente b/a: como fraccion si los dos son enteros
      var coc, q = im / re;
      if (H.ex(re) && H.ex(im) && Math.abs(re - Math.round(re)) < EPS_C && Math.abs(im - Math.round(im)) < EPS_C &&
        Math.abs(q - Math.round(q)) > EPS_C) coc = (q < 0 ? "−" : "") + H.n(Math.abs(im)) + "/" + H.n(Math.abs(re));
      else coc = H.n(q);
      var base = Math.atan(q);
      phi = base + suma;
      L.push(cadenaC("φ", [{ t: "arctg(" + H.p(im) + "/" + H.p(re) + ")" + sumaTxt, ap: !H.ex(re) || !H.ex(im) },
        { t: "arctg(" + coc + ")" + sumaTxt, ap: !H.ex(q) && !/\//.test(coc) },
        suma ? { t: H.ang(base, true) + sumaTxt, ap: !H.angEx(base) } : null,
        { t: H.ang(phi), ap: !H.angEx(phi) }]));
    }
    return { lineas: L, rho: rho, phi: phi };
  }

  // a y b desde ρ y φ
  function pasosBinomicaC(rho, phi, H) {
    var L = [], a = rho * Math.cos(phi), b = rho * Math.sin(phi);
    [["a", "cos", Math.cos(phi), a], ["b", "sen", Math.sin(phi), b]].forEach(function (x) {
      L.push(cadenaC(x[0], [{ t: "ρ · " + x[1] + " φ" },
        { t: H.n(rho) + " · " + x[1] + " " + H.ang(phi), ap: !H.ex(rho) || !H.angEx(phi) },
        H.ex(x[2]) ? { t: H.n(rho) + " · " + H.p(x[2]) } : null,
        { t: H.n(x[3]), ap: !H.ex(x[3]) }]));
    });
    return { lineas: L, re: a, im: b };
  }

  // pasos de una operacion: [{ titulo, cadena (en varios renglones) }]
  function pasosOperacionC(r, H, op) {
    var A = r.op.a, B = r.op.b, s = r.op.s, out = [];
    var izq = A.nombre + " " + s + " " + B.nombre, ba = "(" + H.binom(A.re, A.im) + ")", bb = "(" + H.binom(B.re, B.im) + ")";
    var fin = { t: H.binom(r.re, r.im), ap: !H.ex(r.re) || !H.ex(r.im) };
    var apOps = !H.ex(A.re) || !H.ex(A.im) || !H.ex(B.re) || !H.ex(B.im);
    var verBin = s === "+" || s === "−" || op.operarEn !== "polar";
    var verPol = (s === "·" || s === "/") && op.operarEn !== "binomica";
    var nombres = { "+": "Suma", "−": "Resta", "·": "Producto", "/": "Cociente" };
    if (verBin) {
      var p = [{ t: ba + " " + s + " " + bb, ap: apOps }];
      if (s === "+" || s === "−") {
        var sg = s === "+" ? " + " : " − ";
        p.push({ t: "(" + H.n(A.re) + sg + H.p(B.re) + ") + (" + H.n(A.im) + sg + H.p(B.im) + ")i", ap: apOps });
      } else if (s === "·") {
        // propiedad distributiva, i² = −1
        var fa = [[A.re, 0], [A.im, 1]], fb = [[B.re, 0], [B.im, 1]], prods = [];
        var fac = function (x) {
          if (!x[1]) return H.p(x[0]);
          var t = H.imag(x[0]); return x[0] < 0 ? "(" + t + ")" : t;
        };
        fa.forEach(function (x) {
          fb.forEach(function (y) { if (Math.abs(x[0]) > EPS_C && Math.abs(y[0]) > EPS_C) prods.push([x, y]); });
        });
        if (prods.length > 1) {
          p.push({ t: prods.map(function (q) { return fac(q[0]) + " · " + fac(q[1]); }).join(" + "), ap: apOps });
          var term = function (v, pot) {
            return pot === 0 ? H.n(v) : pot === 1 ? H.imag(v) : H.imag(v) + "²";
          };
          var junta = function (lst) {
            return lst.map(function (t, k) { return k ? (t[0] === "−" ? " − " + t.slice(1) : " + " + t) : t; }).join("");
          };
          var ts = prods.map(function (q) { return [q[0][0] * q[1][0], q[0][1] + q[1][1]]; });
          p.push({ t: junta(ts.map(function (x) { return term(x[0], x[1]); })), ap: ts.some(function (x) { return !H.ex(x[0]); }) });
          if (ts.some(function (x) { return x[1] === 2; })) {
            p.push({ t: junta(ts.map(function (x) { return x[1] === 2 ? H.n(-x[0]) : term(x[0], x[1]); })) + "   (i² = −1)",
              ap: ts.some(function (x) { return !H.ex(x[0]); }) });
          }
        }
      } else {
        // por el conjugado del divisor: (c + di)(c − di) = c² + d²
        var conj = "(" + H.binom(B.re, -B.im) + ")", d = B.re * B.re + B.im * B.im;
        var nr = A.re * B.re + A.im * B.im, ni = A.im * B.re - A.re * B.im;
        p.push({ t: ba + " · " + conj + " / (" + bb + " · " + conj + ")", ap: apOps });
        p.push({ t: "(" + H.binom(nr, ni) + ") / (" + H.sq(B.re) + " + " + H.sq(B.im) + ")",
          ap: !H.ex(nr) || !H.ex(ni) || !H.ex(B.re) || !H.ex(B.im) });
        p.push({ t: "(" + H.binom(nr, ni) + ") / " + H.n(d), ap: !H.ex(nr) || !H.ex(ni) || !H.ex(d) });
        if (Math.abs(d - 1) > EPS_C) {
          var parte = function (v) { return H.n(v) + "/" + H.n(d); };
          var txt = Math.abs(ni) < EPS_C ? parte(nr) : Math.abs(nr) < EPS_C ? "(" + parte(ni) + ")i"
            : parte(nr) + " + (" + parte(ni) + ")i";
          p.push({ t: txt, ap: !H.ex(nr) || !H.ex(ni) || !H.ex(d) });
        }
      }
      p.push(fin);
      out.push({ titulo: nombres[s] + " en forma binómica", cadena: cadenaC(izq, p) });
    }
    if (verPol) {
      var pa = { rho: Math.hypot(A.re, A.im), phi: Math.atan2(A.im, A.re) };
      var pb = { rho: Math.hypot(B.re, B.im), phi: Math.atan2(B.im, B.re) };
      if (A.rho !== undefined) pa = { rho: A.rho, phi: A.phi }; // como se escribio
      if (B.rho !== undefined) pb = { rho: B.rho, phi: B.phi };
      pa.phi = A.rho !== undefined ? pa.phi : H.normal(pa.phi);
      pb.phi = B.rho !== undefined ? pb.phi : H.normal(pb.phi);
      var por = s === "·", rr = por ? pa.rho * pb.rho : pa.rho / pb.rho, ff = por ? pa.phi + pb.phi : pa.phi - pb.phi;
      var i1 = subindice(1), i2 = subindice(2);
      var q2 = [{ t: H.polarTxt("ρ" + i1 + (por ? " · " : " / ") + "ρ" + i2, "φ" + i1 + (por ? " + " : " − ") + "φ" + i2) },
        { t: H.polarTxt(H.n(pa.rho) + (por ? " · " : " / ") + H.n(pb.rho),
          H.ang(pa.phi, true) + (por ? " + " : " − ") + (pb.phi < -EPS_C ? "(" + H.ang(pb.phi, true) + ")" : H.ang(pb.phi, true))),
          ap: !H.ex(pa.rho) || !H.ex(pb.rho) || !H.angEx(pa.phi) || !H.angEx(pb.phi) },
        { t: H.polar(rr, ff), ap: !H.ex(rr) || !H.angEx(ff) }];
      var fn = H.normal(ff);
      if (Math.abs(fn - ff) > EPS_C) q2.push({ t: H.polar(rr, fn), ap: !H.ex(rr) || !H.angEx(fn) });
      out.push({ titulo: nombres[s] + " en forma polar", cadena: cadenaC(izq, q2), polar: { rho: rr, phi: fn } });
    }
    return out;
  }

  // bloques de una fila: [{ titulo, lineas: [cadena o texto], varias }]
  function desarrollarComplejo(r, H, op) {
    var bloques = [], quiere = { binomica: op.fBinomica, par: op.fPar, polar: op.fPolar, trig: op.fTrig };
    var hecho = {}, pol = null, bin = null;
    var origen = r.forma;
    if (origen === "op") {
      pasosOperacionC(r, H, op).forEach(function (b) {
        bloques.push({ titulo: b.titulo, lineas: [b.cadena], varias: true });
        if (b.polar) { pol = b.polar; pol.ap = !H.ex(pol.rho) || !H.angEx(pol.phi); hecho.polar = true; }
        else hecho.binomica = true;
      });
      if (!op.convertirResultado) return bloques;
      origen = "binomica";
    }
    hecho[origen] = true;
    if (origen === "polar" || origen === "trig") pol = { rho: r.rho, phi: r.phi, ap: false };
    var titulos = { binomica: "Forma binómica", par: "Par ordenado", polar: "Forma polar", trig: "Forma trigonométrica" };
    ["binomica", "par", "polar", "trig"].forEach(function (f) {
      if (!quiere[f] || hecho[f]) return;
      var L = [];
      if (f === "binomica" || f === "par") {
        if (origen === "par" || origen === "binomica" || bin) {
          var ig = bin && bin.ap || !H.ex(r.re) || !H.ex(r.im) ? " ≈ " : " = ";
          L.push(f === "binomica" ? "z" + ig + "a + bi" + ig + H.binom(r.re, r.im) : "z" + ig + "(a, b)" + ig + H.par(r.re, r.im));
        } else {
          var pb = pasosBinomicaC(pol.rho, pol.phi, H);
          L = L.concat(pb.lineas);
          var apx = !H.ex(pb.re) || !H.ex(pb.im);
          L.push(f === "binomica" ? "z " + (apx ? "≈" : "=") + " a + bi " + (apx ? "≈" : "=") + " " + H.binom(pb.re, pb.im)
            : "z " + (apx ? "≈" : "=") + " (a, b) " + (apx ? "≈" : "=") + " " + H.par(pb.re, pb.im));
          bin = pb; bin.ap = apx;
        }
      } else {
        if (pol) {
          var igp = pol.ap ? " ≈ " : " = ";
          L.push(f === "polar" ? "z" + igp + H.polar(pol.rho, pol.phi) : "z = ρ(cos φ + i sen φ)" + igp + H.trig(pol.rho, pol.phi));
        } else {
          var pp = pasosPolarC(r.re, r.im, H, r.nombre);
          L = L.concat(pp.lineas);
          var ap = !H.ex(pp.rho) || !H.angEx(pp.phi);
          pol = { rho: pp.rho, phi: pp.phi, ap: ap };
          L.push(f === "polar" ? "z " + (ap ? "≈" : "=") + " " + H.polar(pp.rho, pp.phi)
            : "z = ρ(cos φ + i sen φ) " + (ap ? "≈" : "=") + " " + H.trig(pp.rho, pp.phi));
        }
      }
      hecho[f] = true;
      bloques.push({ titulo: titulos[f], lineas: L });
    });
    return bloques;
  }

  // como se escribio el numero, en su forma
  function entradaComplejo(r, H) {
    if (r.forma === "op") return r.op.a.nombre + " " + r.op.s + " " + r.op.b.nombre;
    if (r.forma === "par") return H.par(r.re, r.im);
    if (r.forma === "polar") return H.polar(r.rho, r.phi);
    if (r.forma === "trig") return H.trig(r.rho, r.phi);
    return H.binom(r.re, r.im);
  }

  // ---------------------------------------------------- plano complejo
  // Cada numero es un vector desde el origen (en el color de su fila), con
  // su nombre y valor en la punta y el arco de su argumento φ. En sumas y
  // restas, el paralelogramo con lineas de trazos (en las restas, tambien
  // −z₂); en productos y cocientes, el arco del resultado dice φ₃ = φ₁ ± φ₂.
  // ORDEN: titulo, cuadricula, ejes y numeracion; despues cada numero
  // (paralelogramo, vector, etiqueta, arco del angulo y su valor).
  function phiDe(nombre) {
    var m = /^z([₀-₉]+)$/.exec(nombre);
    return m ? "φ" + m[1] : "φ(" + nombre + ")";
  }
  function dibujarPlanoComplejo(nums, H, op, x0, y0, tam, fuente, agregar) {
    if (!nums.length) return;
    var tamN = Math.max(12, Math.round(tam * 0.7)), lhN = tamN * fuente.lh;
    var restas = op.paralelogramo ? nums.filter(function (r) { return r.forma === "op" && r.op.s === "−"; }) : [];
    var pts = [[0, 0]].concat(nums.map(function (r) { return [r.re, r.im]; }),
      restas.map(function (r) { return [-r.op.b.re, -r.op.b.im]; }));
    var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
    var span = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys), 1);
    var paso = pasoLindo(span * 1.6, span >= 4);
    var xmin = (Math.floor(Math.min.apply(null, xs) / paso + 1e-9) - 1) * paso, xmax = (Math.ceil(Math.max.apply(null, xs) / paso - 1e-9) + 1) * paso;
    var ymin = (Math.floor(Math.min.apply(null, ys) / paso + 1e-9) - 1) * paso, ymax = (Math.ceil(Math.max.apply(null, ys) / paso - 1e-9) + 1) * paso;
    var lado = { chico: 300, medio: 420, grande: 560 }[op.tamGrafico] || 420;
    var s = lado / Math.max(xmax - xmin, ymax - ymin), W = (xmax - xmin) * s, Ht = (ymax - ymin) * s;
    var top = y0;
    if (op.titulos) {
      var ts = tamTitulo(tam);
      agregar(texto(x0, y0, "Plano complejo", ts, fuente, TINTA, "left"));
      top += ts * fuente.lh + 12;
    }
    var X = function (v) { return x0 + (v - xmin) * s; }, Y = function (v) { return top + (ymax - v) * s; };
    var X0 = X(0), Y0 = Y(0), v, n;
    // cuadricula
    if (op.cuadriculaC) {
      for (n = Math.round(xmin / paso); n <= Math.round(xmax / paso); n++) {
        if (n) agregar(trazo([[X(n * paso), top], [X(n * paso), top + Ht]], { strokeColor: GRIS, strokeWidth: 1 }));
      }
      for (n = Math.round(ymin / paso); n <= Math.round(ymax / paso); n++) {
        if (n) agregar(trazo([[x0, Y(n * paso)], [x0 + W, Y(n * paso)]], { strokeColor: GRIS, strokeWidth: 1 }));
      }
    }
    // ejes: real (Re) e imaginario (Im)
    agregar(linea(x0, Y0, [[0, 0], [W + 16, 0]], { type: "arrow", endArrowhead: "arrow", strokeWidth: 2 }));
    agregar(linea(X0, top + Ht, [[0, 0], [0, -(Ht + 16)]], { type: "arrow", endArrowhead: "arrow", strokeWidth: 2 }));
    agregar(texto(x0 + W + 20, Y0 - lhN / 2, "Re", tamN, fuente, TINTA, "left"));
    agregar(texto(X0 + 6, top - 16 - lhN, "Im", tamN, fuente, TINTA, "left"));
    // numeracion (salteando si no entra)
    var cada = paso * s < tamN * 2.4 ? 2 : 1;
    for (n = Math.round(xmin / paso); n <= Math.round(xmax / paso); n++) {
      if (!n || n % cada) continue;
      v = n * paso;
      agregar(trazo([[X(v), Y0 - 4], [X(v), Y0 + 4]], { strokeWidth: 1 }));
      agregar(texto(X(v), Y0 + 6, H.n(v), tamN, fuente, TINTA, "center"));
    }
    for (n = Math.round(ymin / paso); n <= Math.round(ymax / paso); n++) {
      if (!n || n % cada) continue;
      v = n * paso;
      agregar(trazo([[X0 - 4, Y(v)], [X0 + 4, Y(v)]], { strokeWidth: 1 }));
      agregar(texto(X0 - 8, Y(v) - lhN / 2, H.imag(v), tamN, fuente, TINTA, "right"));
    }
    agregar(texto(X0 - 6, Y0 + 4, "0", tamN, fuente, TINTA, "right"));

    // etiqueta junto a la punta de un vector, hacia afuera
    function etiqueta(re, im, txt, color) {
      var a = Math.atan2(im, re), px = X(re) + Math.cos(a) * 8, py = Y(im) - Math.sin(a) * 8;
      agregar(texto(px, Math.sin(a) >= 0 ? py - lhN : py, txt, tamN, fuente, color, Math.cos(a) >= -0.2 ? "left" : "right"));
    }
    function vector(re, im, color, dashed) {
      agregar(linea(X0, Y0, [[0, 0], [X(re) - X0, Y(im) - Y0]],
        { type: "arrow", endArrowhead: "arrow", strokeColor: color, strokeWidth: 2, strokeStyle: dashed ? "dashed" : "solid" }));
    }
    var k = 0, leyenda = [];
    nums.forEach(function (r) {
      var color = r.color;
      if (r.forma === "op" && op.paralelogramo && (r.op.s === "+" || r.op.s === "−")) {
        var A = r.op.a, B = r.op.b, bre = r.op.s === "+" ? B.re : -B.re, bim = r.op.s === "+" ? B.im : -B.im;
        if (r.op.s === "−") { vector(bre, bim, B.color, true); etiqueta(bre, bim, "−" + B.nombre, B.color); }
        agregar(trazo([[X(A.re), Y(A.im)], [X(r.re), Y(r.im)]], { strokeColor: GUIA, strokeWidth: 1, strokeStyle: "dashed" }));
        agregar(trazo([[X(bre), Y(bim)], [X(r.re), Y(r.im)]], { strokeColor: GUIA, strokeWidth: 1, strokeStyle: "dashed" }));
      }
      if (Math.hypot(r.re, r.im) < EPS_C) { agregar(texto(X0 + 6, Y0 + 6, r.nombre + " = 0", tamN, fuente, color, "left")); return; }
      vector(r.re, r.im, color);
      etiqueta(r.re, r.im, r.nombre + " = " + H.binom(r.re, r.im), color);
      if (!op.angulosC) return;
      var phi = H.normal(Math.atan2(r.im, r.re));
      if (Math.abs(phi) < EPS_C) return;
      // arco desde el semieje real positivo hasta el vector
      var rad = Math.min(lado * (0.08 + 0.05 * k++), lado * 0.42), N = Math.max(8, Math.ceil(Math.abs(phi) / (Math.PI / 24))), arco = [];
      for (var i = 0; i <= N; i++) {
        var t = phi * i / N;
        arco.push([rad * Math.cos(t) - rad, -rad * Math.sin(t)]);
      }
      agregar(linea(X0 + rad, Y0, arco, { type: "arrow", endArrowhead: "arrow", strokeColor: color, strokeWidth: 1 }));
      var rel = "";
      if (r.forma === "op" && (r.op.s === "·" || r.op.s === "/")) {
        rel = " = " + phiDe(r.op.a.nombre) + (r.op.s === "·" ? " + " : " − ") + phiDe(r.op.b.nombre);
      }
      // sobre el arco solo el nombre del angulo; el valor va en la lista de abajo
      var m = phi / 2, rl = rad + 4;
      agregar(texto(X0 + rl * Math.cos(m), Y0 - rl * Math.sin(m) - (Math.sin(m) >= 0 ? lhN : 0),
        phiDe(r.nombre), tamN, fuente, color, Math.cos(m) >= 0 ? "left" : "right"));
      leyenda.push({ t: phiDe(r.nombre) + rel + (H.angEx(phi) ? " = " : " ≈ ") + H.ang(phi), color: color });
    });
    // lista de los angulos, debajo del grafico
    var yl = top + Ht + lhN + 10;
    leyenda.forEach(function (l) {
      agregar(texto(x0, yl, l.t, tamN, fuente, l.color, "left"));
      yl += lhN + 2;
    });
  }

  function generarComplejos(op, ox, oy, agregarFinal) {
    // se guardan los elementos del texto para ubicar el grafico al lado o abajo
    var hechos = [], agregar = function (e) { hechos.push(e); return agregarFinal(e); };
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var lh = tam * fuente.lh, y = oy, H = herramientasC(op), sangria = Math.round(tam * 1.5);
    var tamTit = Math.round(tam * 0.8), lhTit = tamTit * fuente.lh;
    var NOMBRES_FORMA = { binomica: "forma binómica", par: "par ordenado", polar: "forma polar", trig: "forma trigonométrica" };
    // una cadena de igualdades; en varios renglones, un paso en cada uno
    function escribirCadena(c, x, varias, color) {
      var sep = function (p) { return p.ap ? " ≈ " : " = "; };
      if (!varias) {
        var t = c.izq + c.partes.map(function (p) { return sep(p) + p.t; }).join("");
        agregar(texto(x, y, t, tam, fuente, color || TINTA, "left"));
        y += lh + 4;
        return;
      }
      // en varios renglones, con los "=" alineados
      var xIg = x + medir(c.izq, tam, fuente);
      agregar(texto(x, y, c.izq, tam, fuente, TINTA, "left"));
      c.partes.forEach(function (p, k) {
        var ultimo = k === c.partes.length - 1;
        agregar(texto(xIg, y, sep(p) + p.t, tam, fuente, ultimo && color ? color : TINTA, "left"));
        y += lh + 4;
      });
    }
    var filas = analizarComplejos(op);
    filas.forEach(function (r) {
      if (r.errores.length || op.grafico && op.soloGrafico) return;
      var color = op.colorResultado ? r.color : null;
      agregar(texto(ox, y, r.nombre + " = " + entradaComplejo(r, H) +
        (r.forma !== "op" && op.titulos ? "   (" + NOMBRES_FORMA[r.forma] + ")" : ""), tam, fuente, r.color, "left"));
      y += lh + 8;
      var x = ox + sangria;
      desarrollarComplejo(r, H, op).forEach(function (b) {
        if (op.titulos) { agregar(texto(x, y, b.titulo, tamTit, fuente, GUIA, "left")); y += lhTit + 4; }
        b.lineas.forEach(function (l, k) {
          var ultima = k === b.lineas.length - 1;
          if (typeof l === "string") { agregar(texto(x, y, l, tam, fuente, ultima ? color || TINTA : TINTA, "left")); y += lh + 4; }
          else escribirCadena(l, x, true, ultima ? color : null); // un paso por renglon
        });
        y += lh * 0.4;
      });
      y += lh * 0.8;
    });
    if (op.grafico) {
      var b = hechos.length ? cajaDe(hechos) : { x1: ox - tam * 3, y1: oy };
      var abajo = op.posGrafico === "abajo" && hechos.length;
      dibujarPlanoComplejo(filas.filter(function (r) { return !r.errores.length; }), H, op,
        abajo ? ox : b.x1 + tam * 3, abajo ? b.y1 + tam * 2 : oy, tam, fuente, agregarFinal);
    }
  }

  // ======================================== SIMPLIFICACION PASO A PASO
  // Un mismo motor para logica proposicional, algebra de Boole y teoria de
  // conjuntos (las tres son algebras de Boole; cambia la notacion y el
  // nombre de algunas leyes). En cada paso se aplica una ley, con este orden
  // de preferencia:
  //   1. definiciones: condicional, bicondicional, ⊕, diferencia, Δ
  //   2. negaciones: doble negacion, De Morgan, negacion de constantes
  //   3. simplificaciones: dominacion, identidad, idempotencia, complemento,
  //      absorcion
  //   4. factor comun (distributiva al reves), si lo de adentro se simplifica
  //   5. distributiva, si deja un complemento (p ∨ (¬p ∧ q))
  // Cada paso se verifica con la tabla de verdad (tiene que ser equivalente a
  // la expresion original). Las leyes conmutativa y asociativa se usan sin
  // escribirlas. Es UN camino posible: puede haber simplificaciones mas cortas.
  //
  // Arboles: { k: "v", n } variable · { k: "c", v } constante · { k: "not", a }
  // { k: "and" | "or", xs: [...] } · { k: "imp" | "iff" | "xor" | "dif" | "sdif", a, b }
  var NOTACION_SIMP = {
    logica: { y: " ∧ ", o: " ∨ ", V: "V", F: "F", eq: "≡", imp: " → ", iff: " ↔ ", xor: " ⊻ " },
    boole: { y: "", o: " + ", V: "1", F: "0", eq: "=", xor: " ⊕ " },
    conj: { y: " ∩ ", o: " ∪ ", V: "U", F: "∅", eq: "=", dif: " − ", sdif: " Δ " },
  };
  var AVISO_SIMP = "Es solo un ejemplo de cómo simplificar: puede haber simplificaciones más cortas o con otros pasos.";
  var MAX_VARS_SIMP = 8;

  function leerSimp(txt, N) {
    var s = String(txt || "").trim();
    if (!s) return { error: "Escribí una expresión" };
    var OPS = {
      logica: [["<->", "iff"], ["↔", "iff"], ["⇔", "iff"], ["->", "imp"], ["→", "imp"], ["⇒", "imp"], ["¬", "not"],
        ["~", "not"], ["!", "not"], ["∧", "and"], ["&", "and"], ["^", "and"], ["∨", "or"], ["|", "or"], ["⊻", "xor"], ["⊕", "xor"]],
      boole: [["+", "or"], ["·", "and"], ["⋅", "and"], ["*", "and"], [".", "and"], ["∧", "and"], ["∨", "or"], ["¬", "not"],
        ["~", "not"], ["!", "not"], ["'", "post"], ["’", "post"], ["′", "post"], ["⊕", "xor"]],
      conj: [["∪", "or"], ["∩", "and"], ["−", "dif"], ["-", "dif"], ["\\", "dif"], ["Δ", "sdif"], ["△", "sdif"],
        ["'", "post"], ["’", "post"], ["′", "post"], ["ᶜ", "post"], ["¬", "not"]],
    }[N];
    var toks = [], i = 0;
    while (i < s.length) {
      var c = s[i], op = null;
      if (/\s/.test(c)) { i++; continue; }
      if ("([{".indexOf(c) >= 0) { toks.push({ t: "(" }); i++; continue; }
      if (")]}".indexOf(c) >= 0) { toks.push({ t: ")" }); i++; continue; }
      for (var j = 0; j < OPS.length; j++) if (s.substr(i, OPS[j][0].length) === OPS[j][0]) { op = OPS[j]; break; }
      if (op) { toks.push({ t: "op", o: op[1] }); i += op[0].length; continue; }
      if (N === "logica" && /[VT⊤1]/.test(c)) { toks.push({ t: "c", v: true }); i++; continue; }
      if (N === "logica" && /[F⊥0]/.test(c)) { toks.push({ t: "c", v: false }); i++; continue; }
      if (N === "boole" && /[01]/.test(c)) { toks.push({ t: "c", v: c === "1" }); i++; continue; }
      if (N === "conj" && c === "U") { toks.push({ t: "c", v: true }); i++; continue; }
      if (N === "conj" && /[∅Ø]/.test(c)) { toks.push({ t: "c", v: false }); i++; continue; }
      var re = N === "logica" ? /[a-z]/ : /[A-Za-z]/;
      if (re.test(c)) {
        var nom = c; i++;
        while (i < s.length && /[₀-₉]/.test(s[i])) nom += s[i++];
        toks.push({ t: "v", n: nom }); continue;
      }
      return { error: "No entiendo «" + c + "»" };
    }
    var pos = 0, BP = { iff: 1, imp: 2, or: 3, xor: 3, dif: 3, sdif: 3, and: 4 };
    function inicio(t) { return t && (t.t === "v" || t.t === "c" || t.t === "(" || (t.t === "op" && t.o === "not")); }
    function sufijos(n) {
      while (toks[pos] && toks[pos].t === "op" && toks[pos].o === "post") { pos++; n = { k: "not", a: n }; }
      return n;
    }
    function primario() {
      var t = toks[pos++];
      if (!t) throw "Falta un operando al final";
      if (t.t === "op" && t.o === "not") return { k: "not", a: sufijos(primario()) };
      if (t.t === "(") {
        var e = expr(0);
        if (!toks[pos] || toks[pos].t !== ")") throw "Falta cerrar un paréntesis";
        pos++;
        return e;
      }
      if (t.t === "v") return { k: "v", n: t.n };
      if (t.t === "c") return { k: "c", v: t.v };
      throw "Falta un operando antes de un operador";
    }
    function expr(min) {
      var izq = sufijos(primario());
      for (;;) {
        var t = toks[pos], o, bp;
        if (t && t.t === "op" && BP[t.o]) { o = t.o; bp = BP[o]; pos++; }
        else if (N === "boole" && inicio(t)) { o = "and"; bp = 4; } // AB es A·B
        else break;
        if (bp < min) { if (t.t === "op") pos--; break; }
        var der = expr(o === "imp" ? bp : bp + 1);
        izq = o === "and" || o === "or" ? { k: o, xs: [izq, der] } : { k: o, a: izq, b: der };
      }
      return izq;
    }
    try {
      var arbol = expr(0);
      if (pos < toks.length) return { error: toks[pos].t === ")" ? "Sobra un paréntesis de cierre" : "No entiendo lo que sigue después de la expresión" };
      var vars = varsSimp(arbol);
      if (vars.length > MAX_VARS_SIMP) return { error: "Hasta " + MAX_VARS_SIMP + " variables" };
      return { arbol: planchar(arbol), vars: vars };
    } catch (e) { return { error: String(e) }; }
  }

  function varsSimp(n, acc) {
    acc = acc || [];
    if (n.k === "v") { if (acc.indexOf(n.n) < 0) acc.push(n.n); }
    else if (n.xs) n.xs.forEach(function (x) { varsSimp(x, acc); });
    else if (n.k === "not") varsSimp(n.a, acc);
    else if (n.a) { varsSimp(n.a, acc); varsSimp(n.b, acc); }
    return acc;
  }
  function evalSimp(n, env) {
    switch (n.k) {
      case "v": return env[n.n];
      case "c": return n.v;
      case "not": return !evalSimp(n.a, env);
      case "and": return n.xs.every(function (x) { return evalSimp(x, env); });
      case "or": return n.xs.some(function (x) { return evalSimp(x, env); });
    }
    var a = evalSimp(n.a, env), b = evalSimp(n.b, env);
    return n.k === "imp" ? !a || b : n.k === "iff" ? a === b : n.k === "dif" ? a && !b : a !== b; // xor, sdif
  }
  function equivalentesSimp(x, y, vars) {
    for (var m = 0; m < 1 << vars.length; m++) {
      var env = {};
      vars.forEach(function (v, i) { env[v] = !!(m >> i & 1); });
      if (evalSimp(x, env) !== evalSimp(y, env)) return false;
    }
    return true;
  }
  // clave canonica (sin orden en ∧ y ∨): para comparar subexpresiones
  function claveSimp(n) {
    switch (n.k) {
      case "v": return n.n;
      case "c": return n.v ? "1" : "0";
      case "not": return "¬" + claveSimp(n.a);
      case "and": case "or": return n.k + "(" + n.xs.map(claveSimp).sort().join(",") + ")";
    }
    return n.k + "(" + claveSimp(n.a) + "," + claveSimp(n.b) + ")";
  }
  // asociativa: ∧ dentro de ∧ (y ∨ dentro de ∨) se juntan; con un solo elemento,
  // se saca. Conserva las marcas (marca: la parte que cambio en el ultimo paso).
  function planchar(n) {
    var r;
    if (n.k === "and" || n.k === "or") {
      var xs = [];
      n.xs.forEach(function (x) {
        x = planchar(x);
        if (x.k === n.k) x.xs.forEach(function (y) { xs.push(x.marca ? conMarca(y) : y); });
        else xs.push(x);
      });
      r = xs.length === 1 ? xs[0] : { k: n.k, xs: xs };
    } else if (n.k === "not") r = { k: "not", a: planchar(n.a) };
    else if (n.a) r = { k: n.k, a: planchar(n.a), b: planchar(n.b) };
    else r = n;
    return n.marca && !r.marca ? conMarca(r) : r;
  }
  function conMarca(x) { var c = {}; for (var k in x) c[k] = x[k]; c.marca = true; return c; }
  function quitarMarcas(n) {
    var c = { k: n.k };
    if (n.xs) c.xs = n.xs.map(quitarMarcas);
    if (n.a) c.a = quitarMarcas(n.a);
    if (n.b) c.b = quitarMarcas(n.b);
    if (n.n !== undefined) c.n = n.n;
    if (n.v !== undefined) c.v = n.v;
    return c;
  }
  // marca lo que cambio la ley aplicada en o: en un ∧/∨ que conserva hijos, solo
  // los hijos nuevos (si solo se quitaron hijos, no hay nada nuevo que marcar);
  // si no, todo el resultado
  function marcarCambio(o, r) {
    if ((r.k === "and" || r.k === "or") && r.k === o.k) {
      var nuevo = function (x) { return o.xs.indexOf(x) < 0; };
      return { k: r.k, xs: r.xs.map(function (x) { return nuevo(x) ? conMarca(x) : x; }) };
    }
    return conMarca(r);
  }
  function juntar(k, xs) { return xs.length === 1 ? xs[0] : { k: k, xs: xs }; }
  function complementoSimp(x) { return x.k === "not" ? x.a : { k: "not", a: x }; }
  function dualSimp(k) { return k === "and" ? "or" : "and"; }

  // ---- leyes: cada una recibe un nodo y devuelve { n, ley, op } o null
  function leyDefinicion(n) {
    var a = n.a, b = n.b;
    if (n.k === "imp") return { n: { k: "or", xs: [{ k: "not", a: a }, b] }, ley: "cond" };
    if (n.k === "iff") return { n: { k: "and", xs: [{ k: "imp", a: a, b: b }, { k: "imp", a: b, b: a }] }, ley: "bicond" };
    if (n.k === "xor") return { n: { k: "or", xs: [{ k: "and", xs: [a, { k: "not", a: b }] }, { k: "and", xs: [{ k: "not", a: a }, b] }] }, ley: "xor" };
    if (n.k === "dif") return { n: { k: "and", xs: [a, { k: "not", a: b }] }, ley: "dif" };
    if (n.k === "sdif") return { n: { k: "or", xs: [{ k: "dif", a: a, b: b }, { k: "dif", a: b, b: a }] }, ley: "sdif" };
    return null;
  }
  function leyNegacion(n) {
    if (n.k !== "not") return null;
    var a = n.a;
    if (a.k === "not") return { n: a.a, ley: "dobleneg" };
    if (a.k === "and" || a.k === "or") {
      return { n: { k: dualSimp(a.k), xs: a.xs.map(function (x) { return { k: "not", a: x }; }) }, ley: "morgan" };
    }
    if (a.k === "c") return { n: { k: "c", v: !a.v }, ley: "negconst" };
    return null;
  }
  // terminos de un hijo para la absorcion: los del ∧ (en un ∨) o el mismo
  function terminosSimp(x, dual) { return x.k === dual ? x.xs.map(claveSimp) : [claveSimp(x)]; }
  function leySimplificacion(n) {
    if (n.k !== "and" && n.k !== "or") return null;
    var neutro = n.k === "and", xs = n.xs, i, j;
    for (i = 0; i < xs.length; i++) if (xs[i].k === "c" && xs[i].v !== neutro) return { n: { k: "c", v: !neutro }, ley: "dominacion", op: n.k };
    for (i = 0; i < xs.length; i++) {
      if (xs[i].k === "c") {
        var resto = xs.filter(function (x) { return x.k !== "c"; });
        return { n: resto.length ? juntar(n.k, resto) : { k: "c", v: neutro }, ley: "identidad", op: n.k };
      }
    }
    var claves = xs.map(claveSimp);
    for (i = 0; i < xs.length; i++) for (j = i + 1; j < xs.length; j++) {
      if (claves[i] === claves[j]) return { n: juntar(n.k, xs.filter(function (x, k) { return k !== j; })), ley: "idempotencia", op: n.k };
    }
    for (i = 0; i < xs.length; i++) {
      var comp = claveSimp(complementoSimp(xs[i]));
      for (j = 0; j < xs.length; j++) if (j !== i && claves[j] === comp) return { n: { k: "c", v: !neutro }, ley: "complemento", op: n.k };
    }
    var dual = dualSimp(n.k), ts = xs.map(function (x) { return terminosSimp(x, dual); });
    for (i = 0; i < xs.length; i++) for (j = 0; j < xs.length; j++) {
      if (i === j || ts[i].length >= ts[j].length) continue;
      if (ts[i].every(function (t) { return ts[j].indexOf(t) >= 0; })) {
        return { n: juntar(n.k, xs.filter(function (x, k) { return k !== j; })), ley: "absorcion", op: n.k };
      }
    }
    return null;
  }
  // factor comun: (x ∧ y) ∨ (x ∧ z) = x ∧ (y ∨ z), si (y ∨ z) se puede simplificar
  function leyFactorComun(n) {
    if (n.k !== "and" && n.k !== "or") return null;
    var dual = dualSimp(n.k), xs = n.xs;
    for (var i = 0; i < xs.length; i++) for (var j = i + 1; j < xs.length; j++) {
      if (xs[i].k !== dual || xs[j].k !== dual) continue;
      var ki = xs[i].xs.map(claveSimp), kj = xs[j].xs.map(claveSimp);
      var comunes = xs[i].xs.filter(function (x, k) { return kj.indexOf(ki[k]) >= 0; });
      if (!comunes.length) continue;
      var kc = comunes.map(claveSimp);
      var r1 = xs[i].xs.filter(function (x, k) { return kc.indexOf(ki[k]) < 0; });
      var r2 = xs[j].xs.filter(function (x, k) { return kc.indexOf(kj[k]) < 0; });
      if (!r1.length || !r2.length) continue; // eso es absorcion
      var adentro = planchar({ k: n.k, xs: [juntar(dual, r1), juntar(dual, r2)] });
      if (!leySimplificacion(adentro)) continue;
      var nuevo = { k: dual, xs: comunes.concat([adentro]) };
      var otros = xs.slice();
      otros.splice(j, 1);
      otros[i] = nuevo;
      return { n: juntar(n.k, otros), ley: "factor", op: n.k };
    }
    return null;
  }
  // distributiva cuando deja un complemento: p ∨ (¬p ∧ q) = (p ∨ ¬p) ∧ (p ∨ q)
  function leyDistributiva(n) {
    if (n.k !== "and" && n.k !== "or") return null;
    var dual = dualSimp(n.k), xs = n.xs;
    for (var i = 0; i < xs.length; i++) {
      var comp = claveSimp(complementoSimp(xs[i]));
      for (var j = 0; j < xs.length; j++) {
        if (j === i || xs[j].k !== dual) continue;
        var kj = xs[j].xs.map(claveSimp), pos = kj.indexOf(comp);
        if (pos < 0) continue;
        var resto = xs[j].xs.filter(function (x, k) { return k !== pos; });
        var nuevo = { k: dual, xs: [{ k: n.k, xs: [xs[i], xs[j].xs[pos]] }, { k: n.k, xs: [xs[i], juntar(dual, resto)] }] };
        var otros = xs.filter(function (x, k) { return k !== i && k !== j; });
        otros.splice(Math.min(i, j), 0, nuevo);
        return { n: juntar(n.k, otros), ley: "distributiva", op: n.k };
      }
    }
    return null;
  }
  // Consenso: xy ∨ ¬xz ∨ yz = xy ∨ ¬xz (y su dual). Dos terminos con un solo
  // literal en conflicto (x en uno, ¬x en el otro) generan el termino de
  // consenso C (el resto de los literales de los dos). Se usa solo si acorta:
  //  1) un tercer termino que contiene a C sobra (se quita);
  //  2) si el segundo termino es C con ¬x, se agrega C y lo absorbe.
  // desarrollado: en vez de un paso "Consenso", los pasos con leyes basicas
  // (identidad, complemento, distributiva, absorcion, factor comun).
  function ordenarLits(lista) {
    var base = function (x) { return claveSimp(x).replace(/^¬/, ""); };
    return lista.slice().sort(function (a, b) {
      var ka = base(a), kb = base(b);
      return ka < kb ? -1 : ka > kb ? 1 : claveSimp(a).length - claveSimp(b).length;
    });
  }
  function leyConsenso(desarrollado) {
    return function (n) {
      if (n.k !== "and" && n.k !== "or") return null;
      var K = n.k, D = dualSimp(K), xs = n.xs;
      var T = xs.map(function (x) { return x.k === D ? x.xs : [x]; });
      var Kt = T.map(function (t) { return t.map(claveSimp); });
      var contiene = function (a, b) { return b.every(function (k) { return a.indexOf(k) >= 0; }); }; // a ⊇ b
      for (var i = 0; i < xs.length; i++) for (var j = 0; j < xs.length; j++) {
        if (i === j) continue;
        var choques = [];
        T[i].forEach(function (x, a) { if (Kt[j].indexOf(claveSimp(complementoSimp(x))) >= 0) choques.push(a); });
        if (choques.length !== 1) continue;
        var a = choques[0], l = T[i][a], kc = claveSimp(complementoSimp(l));
        var ri = T[i].filter(function (x, q) { return q !== a; });
        var rj = T[j].filter(function (x, q) { return Kt[j][q] !== kc; });
        if (!ri.length || !rj.length) continue; // x + x'y lo resuelve la distributiva
        var C = [], kC = [];
        ri.concat(rj).forEach(function (x) { var k = claveSimp(x); if (kC.indexOf(k) < 0) { kC.push(k); C.push(x); } });
        C = ordenarLits(C);
        // 1) un tercer termino que contiene al consenso sobra
        for (var k = 0; k < xs.length; k++) {
          if (k === i || k === j || !contiene(Kt[k], kC)) continue;
          if (desarrollado) return consensoQuitar(n, k, l);
          return { n: juntar(K, xs.filter(function (x, q) { return q !== k; })), ley: "consenso", op: K };
        }
        // 2) se agrega el consenso cuando absorbe al segundo termino
        if (Kt[j].length === kC.length + 1 && contiene(Kt[j], kC) &&
          !Kt.some(function (t) { return contiene(kC, t); })) {
          if (desarrollado) return consensoAgregar(n, j, l, C);
          return { n: { k: K, xs: xs.concat([juntar(D, C)]) }, ley: "consenso", op: K };
        }
      }
      return null;
    };
  }
  // yz = yz·1 = yz(x + x') = xyz + x'yz (despues la absorcion quita los dos)
  function consensoQuitar(n, k, l) {
    var K = n.k, D = dualSimp(K), Tk = n.xs[k], tk = Tk.k === D ? Tk.xs : [Tk];
    var con = function (m) { var xs = n.xs.slice(); xs[k] = m; return { k: K, xs: xs }; };
    var p1 = con({ k: D, xs: tk.concat([conMarca({ k: "c", v: D === "and" })]) });
    var p2 = con({ k: D, xs: tk.concat([conMarca({ k: K, xs: [l, complementoSimp(l)] })]) });
    var xs3 = n.xs.slice();
    xs3.splice(k, 1, conMarca({ k: D, xs: ordenarLits([l].concat(tk)) }), conMarca({ k: D, xs: ordenarLits([complementoSimp(l)].concat(tk)) }));
    return { pasos: [{ n: p1, ley: "identidad" }, { n: p2, ley: "complemento", op: K }, { n: { k: K, xs: xs3 }, ley: "distributiva" }] };
  }
  // x'z + xy'z = x'z + x'y'z + xy'z = x'z + y'z(x' + x) (despues complemento e identidad)
  function consensoAgregar(n, j, l, C) {
    var K = n.k, D = dualSimp(K);
    var xs1 = n.xs.concat([conMarca({ k: D, xs: ordenarLits([l].concat(C)) })]);
    var xs2 = n.xs.slice();
    xs2[j] = conMarca({ k: D, xs: C.concat([{ k: K, xs: [l, complementoSimp(l)] }]) });
    return { pasos: [{ n: { k: K, xs: xs1 }, ley: "absorcion" }, { n: { k: K, xs: xs2 }, ley: "factor" }] };
  }

  // aplica la ley en el primer lugar donde se pueda (de afuera hacia adentro).
  // Devuelve { pasos: [{ n, ley, op }] }: una ley puede dar varios pasos seguidos
  // (el consenso desarrollado), que se escriben sin que otra ley se meta en el medio.
  // (las leyes de varios pasos marcan ellas mismas lo que cambia)
  function comoPasos(r, o) { return r && (r.pasos ? r : { pasos: [{ n: marcarCambio(o, r.n), ley: r.ley, op: r.op }] }); }
  function envolverPasos(r, f) {
    return { pasos: r.pasos.map(function (p) { return { n: f(p.n), ley: p.ley, op: p.op }; }) };
  }
  function aplicarLeySimp(n, ley) {
    var r = comoPasos(ley(n), n), h;
    if (r) return r;
    if (n.k === "and" || n.k === "or") {
      for (var i = 0; i < n.xs.length; i++) {
        if ((h = aplicarLeySimp(n.xs[i], ley))) {
          return envolverPasos(h, function (m) { var xs = n.xs.slice(); xs[i] = m; return { k: n.k, xs: xs }; });
        }
      }
      return null;
    }
    if (n.k === "not") return (h = aplicarLeySimp(n.a, ley)) && envolverPasos(h, function (m) { return { k: "not", a: m }; });
    if (n.a) {
      if ((h = aplicarLeySimp(n.a, ley))) return envolverPasos(h, function (m) { return { k: n.k, a: m, b: n.b }; });
      if ((h = aplicarLeySimp(n.b, ley))) return envolverPasos(h, function (m) { return { k: n.k, a: n.a, b: m }; });
    }
    return null;
  }

  // pasos: [{ n, ley, op }] (el primero es la expresion original)
  // consenso: "paso" (en un paso), "desarrollado" o "no" (no se usa)
  function simplificarPasos(arbol, vars, N, consenso) {
    var fases = [leyDefinicion, leyNegacion, leySimplificacion, leyFactorComun];
    if (consenso !== "no") fases.push(leyConsenso(consenso === "desarrollado"));
    fases.push(leyDistributiva);
    var pasos = [{ n: arbol }], actual = arbol;
    for (var k = 0; k < 80 && !pasos.error; k++) {
      var r = null;
      var limpio = quitarMarcas(actual);
      for (var f = 0; f < fases.length && !r; f++) r = aplicarLeySimp(limpio, fases[f]);
      if (!r) break;
      r.pasos.forEach(function (p) {
        if (pasos.error) return;
        var nuevo = planchar(p.n);
        if (!equivalentesSimp(arbol, nuevo, vars)) { pasos.error = true; return; }
        if (imprimirSimp(nuevo, N) !== imprimirSimp(actual, N)) pasos.push({ n: nuevo, ley: p.ley, op: p.op });
        actual = nuevo;
      });
    }
    return pasos;
  }

  function nombreLeySimp(ley, op, N) {
    var L = N === "logica", B = N === "boole";
    return {
      cond: "Definición del condicional",
      bicond: "Definición del bicondicional",
      xor: L ? "Definición de la disyunción excluyente" : "Definición de ⊕",
      dif: "Definición de diferencia",
      sdif: "Definición de diferencia simétrica",
      dobleneg: "Ley de involución",
      morgan: "Ley de De Morgan",
      negconst: L ? "Negación de V y F" : B ? "Complemento de 0 y 1" : "Complemento de U y ∅",
      dominacion: B ? "Ley de acotación" : "Ley de dominación",
      identidad: "Ley de identidad",
      idempotencia: "Ley de idempotencia",
      complemento: "Ley de complemento",
      absorcion: "Ley de absorción",
      factor: "Inversa distributiva (factor común)",
      distributiva: "Ley distributiva",
      consenso: "Ley de consenso",
    }[ley] || ley;
  }

  // escritura con los parentesis justos
  function precSimp(n) { return { iff: 0, imp: 1, or: 2, xor: 2, dif: 2, sdif: 2, and: 3, not: 4 }[n.k] === undefined ? 5 : { iff: 0, imp: 1, or: 2, xor: 2, dif: 2, sdif: 2, and: 3, not: 4 }[n.k]; }
  // pedazos de texto { t, m } (m: es parte de lo que cambio en el ultimo paso)
  function pedazosSimp(n, N, enMarca) {
    var S = NOTACION_SIMP[N], m = !!(enMarca || n.marca);
    // en logica y conjuntos, entre operadores distintos siempre van parentesis
    // ((p ∧ q) ∨ r); en Boole alcanza con la precedencia (AB + C)
    var f = N === "boole" ? 0 : 4;
    var T = function (t) { return { t: t, m: m }; };
    function p(x, min) {
      var q = pedazosSimp(x, N, m);
      if (precSimp(x) >= Math.max(min, f)) return q;
      var mx = m || !!x.marca;
      return [{ t: "(", m: mx }].concat(q, [{ t: ")", m: mx }]);
    }
    function unir(listas, sep) {
      var out = [];
      listas.forEach(function (l, i) { if (i && sep) out.push(T(sep)); out.push.apply(out, l); });
      return out;
    }
    switch (n.k) {
      case "v": return [T(n.n)];
      case "c": return [T(n.v ? S.V : S.F)];
      case "not": return N === "logica" ? [T("¬")].concat(p(n.a, 4)) : p(n.a, 5).concat([T("'")]);
      case "and":
        var partes = n.xs.map(function (x) { return p(x, 4); });
        if (N !== "boole") return unir(partes, S.y);
        // en Boole el producto va sin punto, salvo junto a constantes o nombres largos (BC·1)
        var largo = function (x) { return x.k === "c" || x.k === "v" && x.n.length > 1; }, out = [];
        partes.forEach(function (l, i) {
          if (i && (largo(n.xs[i - 1]) || largo(n.xs[i]))) out.push(T("·"));
          out.push.apply(out, l);
        });
        return out;
      case "or": return unir(n.xs.map(function (x) { return p(x, 3); }), S.o);
      case "imp": return unir([p(n.a, 2), p(n.b, 2)], S.imp);
      case "iff": return unir([p(n.a, 1), p(n.b, 1)], S.iff);
    }
    return unir([p(n.a, 3), p(n.b, 3)], S[n.k]); // xor, dif, sdif
  }
  function imprimirSimp(n, N) { return pedazosSimp(n, N).map(function (q) { return q.t; }).join(""); }

  // Colores de las leyes (se repiten si hay mas pasos)
  var PALETA_SIMP = ["#2f9e44", "#e8590c", "#c2255c", "#0c8599", "#e03131", "#7048e8", "#1971c2", "#f08c00"];

  // generador: cada renglon es la expresion actual y, a la derecha, la ley que se
  // le aplica; en el renglon siguiente, lo que cambio va en el color de esa ley
  function generarSimp(N) {
    return function (op, ox, oy, agregar) {
      var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
      var lh = tam * fuente.lh, y = oy, S = NOTACION_SIMP[N];
      var tamL = Math.round(tam * 0.85), lhL = tamL * fuente.lh;
      var colores = op.colores !== false;
      var colorLey = function (i) { return colores ? PALETA_SIMP[i % PALETA_SIMP.length] : GUIA; };
      if (op.titulos) {
        var ts = tamTitulo(tam);
        agregar(texto(ox, y, "Simplificación paso a paso", ts, fuente, TINTA, "left"));
        y += ts * fuente.lh + 14;
      }
      op.filas.forEach(function (f) {
        var l = leerSimp(f.texto, N);
        if (l.error) return;
        var pasos = simplificarPasos(l.arbol, l.vars, N, op.consenso || "paso");
        // con nombre (F = ...), los "=" de los pasos quedan debajo del de "F ="
        var nom = N === "boole" && f.nombre ? f.nombre + " " : "";
        var wEq = medir(S.eq + " ", tam, fuente), x = ox + medir(nom, tam, fuente), xe = x + wEq;
        var wMax = Math.max.apply(null, pasos.map(function (p) { return medir(imprimirSimp(p.n, N), tam, fuente); }));
        var xLey = xe + wMax + tam * 1.5;
        pasos.forEach(function (p, i) {
          if (i === 0) { if (nom) agregar(texto(ox, y, nom + S.eq, tam, fuente, f.color, "left")); }
          else agregar(texto(x, y, S.eq, tam, fuente, TINTA, "left"));
          // la expresion, en tramos: lo que cambio en el color de la ley anterior
          var tramos = [];
          pedazosSimp(p.n, N).forEach(function (q) {
            var ult = tramos[tramos.length - 1];
            if (ult && ult.m === q.m) ult.t += q.t; else tramos.push({ t: q.t, m: q.m });
          });
          var hecho = "";
          tramos.forEach(function (t) {
            var c = t.m && i > 0 && colores ? colorLey(i - 1) : TINTA;
            agregar(texto(xe + medir(hecho, tam, fuente), y, t.t, tam, fuente, c, "left"));
            hecho += t.t;
          });
          // la ley que lleva al renglon siguiente
          if (op.leyes && i < pasos.length - 1) {
            var sig = pasos[i + 1];
            agregar(texto(xLey, y + (lh - lhL) / 2, nombreLeySimp(sig.ley, sig.op, N), tamL, fuente, colorLey(i), "left"));
          }
          y += lh + 8;
        });
        var tamA = Math.round(tam * 0.8), lhA = tamA * fuente.lh;
        if (pasos.length === 1) {
          agregar(texto(xe, y, "No se encontró una ley para simplificarla más (puede que ya esté simplificada).", tamA, fuente, GUIA, "left"));
          y += lhA + 6;
        }
        if (pasos.error) {
          agregar(texto(xe, y, "(Se detuvo: un paso no resultó equivalente.)", tamA, fuente, COLORES[1], "left"));
          y += lhA + 6;
        }
        if (op.aclaracion) {
          agregar(texto(xe, y + 4, AVISO_SIMP, tamA, fuente, GUIA, "left"));
          y += lhA + 4;
        }
        y += lh * 1.2;
      });
    };
  }
  function erroresSimp(N) {
    return function (t) { var l = leerSimp(t, N); return l.error ? [l.error] : []; };
  }

  function genSimp(N, cfg) {
    return {
      titulo: "Simplificación", dibujo: "desarrollo", femenino: false, clave: cfg.clave,
      defecto: { filas: cfg.filas, tamTexto: "M", fuente: "normal", titulos: true, leyes: true, colores: true, aclaracion: true,
        consenso: "paso" },
      contenido: ["filas"],
      ejemplo: { filas: cfg.ejemplo },
      textoEjemplo: "Inserta un desarrollo nuevo de ejemplo con tres expresiones",
      agregarFila: "+ Expresión",
      placeholder: cfg.placeholder,
      nombreFila: cfg.nombreFila,
      simbolos: cfg.simbolos,
      ayuda: cfg.ayuda + AVISO_SIMP + " Las leyes conmutativa y asociativa se usan sin escribirlas. " +
        "Seleccioná un desarrollo ya insertado para editarlo.",
      erroresFila: erroresSimp(N),
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 150 }; },
      generar: generarSimp(N),
      opciones: function (ui) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Título («Simplificación paso a paso»)", "titulos");
        ui.chk("Escribir la ley de cada paso (a la derecha de la expresión a la que se aplica)", "leyes");
        ui.chk("Colores: cada ley en un color, y lo que cambia en el renglón siguiente en ese color", "colores");
        ui.chk("Aclaración (es solo un ejemplo; puede haber simplificaciones más cortas)", "aclaracion");
        ui.avanzado(function () {
          ui.seg("Ley de consenso", "consenso", [["paso", "En un paso"], ["desarrollado", "Desarrollada"], ["no", "No usar"]]);
          ui.nota("Consenso: " + cfg.consenso + ". «En un paso» la escribe como una sola ley; «Desarrollada» la " +
            "demuestra con identidad, complemento, distributiva y absorción (por si la cátedra no la acepta como ley).");
        });
      },
    };
  }

  // ====================================================== GENERADORES
  // Cada generador define su contenido (filas), opciones, panel y como dibujar.
  // contenido: claves que "Restablecer" no toca (lo que se grafica, no el aspecto).
  var GEN = {
    recta: {
      titulo: "Recta real",
      dibujo: "recta", femenino: true,
      clave: "pizarra-generador-recta",
      defecto: {
        filas: [{ texto: "(-2, 1/2]", color: COLORES[0] }, { texto: "[1, ∞)", color: COLORES[1] }],
        operacion: "union", estilo: "rayado", referencia: false, margenIzq: 10, margenDer: 10,
        largo: "media", tamGrilla: "S", tamExtremos: "L", tamSignos: "M", fuente: "normal", rayado: "normal",
        soloEnteros: false, ocultarNumeros: false, mostrarUnion: true, mostrarResultado: true,
        titulos: true,
      },
      contenido: ["filas", "operacion"],
      ejemplo: { filas: [{ texto: "[-3, 2)", color: COLORES[0] }, { texto: "(0, 5]", color: COLORES[1] }] },
      textoEjemplo: "Inserta una recta nueva de ejemplo con dos intervalos",
      agregarFila: "+ Intervalo",
      placeholder: "Ej: (1/2, 3]",
      simbolos: [["∞", "∞", "Escribe ∞ donde está el cursor"], ["∪", " ∪ ", "Escribe ∪ donde está el cursor"]],
      ayuda: "Ejemplos: (1/2, 3], [−2, ∞), (π/2, √2+1). " +
        "Para decimales con coma separá con punto y coma: [0,5; 2). " +
        "Varios intervalos en una fila: (1,2) ∪ [3,4]. " +
        "Seleccioná una recta ya insertada para editarla.",
      erroresFila: function (t) {
        return leerIntervalos(t).filter(function (r) { return r.error; })
          .map(function (r) { return r.original + ": " + r.error; });
      },
      posicion: function (op, cx, cy) { return { x: cx - (LARGOS[op.largo] || 800) / 2, y: cy - 40 }; },
      generar: function (op, ox, oy, agregar) {
        conTitulo(op.titulos && "Recta real", TAMANOS[op.tamGrilla] || 16, FUENTES[op.fuente] || FUENTES.normal,
          agregar, function (ag) { generarRecta(op, ox, oy, ag); });
      },
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        var lineas = op.estilo === "lineas";
        ui.arriba(function () {
          ui.seg("Operación", "operacion", [["union", "Unión ∪"], ["interseccion", "Intersección ∩"]]);
          // forma de mostrar los intervalos (cambia que otras opciones se ven)
          ui.seg("Estilo", "estilo", [["rayado", "Rayado [ ]"], ["lineas", "Líneas ●—○"]], true);
        });
        ui.seg("Largo", "largo", [["corta", "Corta"], ["media", "Media"], ["larga", "Larga"]]);
        ui.campos("Márgenes", [
          { clave: "margenIzq", prefijo: "Izq.", sufijo: "%", numero: [0, 40],
            titulo: "Espacio antes del primer extremo (0 a 40% del largo)" },
          { clave: "margenDer", prefijo: "Der.", sufijo: "%", numero: [0, 40],
            titulo: "Espacio después del último extremo (0 a 40% del largo)" },
        ]);
        ui.seg("Números grilla", "tamGrilla", tam);
        ui.seg("Números extremos", "tamExtremos", tam);
        ui.seg(lineas ? "Puntos y líneas" : "( ) y [ ]", "tamSignos", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        if (!lineas) ui.seg("Rayado", "rayado", [["poco", "Ralo"], ["normal", "Normal"], ["denso", "Denso"]]);
        ui.chk("Grilla solo en enteros", "soloEnteros");
        ui.chk("Ocultar numeración (mantener el 0)", "ocultarNumeros");
        ui.chk("Escribir la operación debajo", "mostrarUnion");
        ui.chk("Escribir el resultado", "mostrarResultado");
        ui.chk("Incluir referencia", "referencia");
        ui.chk("Título («Recta real»)", "titulos");
      },
    },

    funcion: {
      titulo: "Funciones",
      clave: "pizarra-generador-funcion",
      defecto: {
        filas: [{ nombre: "f", texto: "x => x**2 / 2 - 2", color: COLORES[0] },
          { nombre: "g", texto: "x => 2 * sin(x)", color: COLORES[1] }],
        xMin: "-5", xMax: "5", yAuto: true, yMin: "-5", yMax: "5",
        tamano: "medio", escalaIgual: false, tamNumeros: "S", fuente: "normal", grosor: "normal",
        cuadricula: true, cuadrada: true, soloEnteros: false, ocultarNumeros: false,
        referencia: true, posReferencia: "derecha", marcarExtremos: true, titulos: true,
      },
      contenido: ["filas", "xMin", "xMax", "yAuto", "yMin", "yMax"],
      ejemplo: {
        filas: [{ nombre: "f", texto: "x => x**2 - 4", color: COLORES[0], puntos: "-3, -2, -1, 0, 1, 2, 3" },
          { nombre: "g", texto: "x => 2*x + 1", color: COLORES[1], dominio: "x >= -2", puntos: "-2, 0, 2" }],
        xMin: "-4", xMax: "4", yAuto: true,
      },
      textoEjemplo: "Inserta un gráfico nuevo de ejemplo con dos funciones",
      agregarFila: "+ Función",
      placeholder: "Ej: x => x**2 - 3",
      // cada funcion tiene un nombre editable (f, g, h... o f(x), P(t))
      nombreFila: { porDefecto: nombrePorDefecto, titulo: "Nombre de la función: f, g, h... o f(x), P(t)" },
      // campos extra debajo de cada funcion
      extrasFila: [
        // dominio propio: la funcion se grafica solo ahi
        { clave: "dominio", etiqueta: "Dominio",
          placeholder: "Ej: x > 1  o  (1, ∞)   (vacío = todo)",
          titulo: "Parte de x donde se grafica esta función: intervalo como (1, ∞) o [-2, 3), " +
            "o desigualdad como x > 1, x ≤ 3, -2 < x <= 3",
          errores: erroresRestriccion },
        // valores de x donde se marca el punto de la funcion (trazos + cruz)
        { clave: "puntos", etiqueta: "Puntos x",
          placeholder: "Ej: -2, -1, 0, 1, 2   (vacío = ninguno)",
          titulo: "Valores de x a marcar, separados por coma (con decimales con coma, por punto y coma)",
          errores: erroresPuntos },
      ],
      simbolos: [["x =>", "x => ", "Escribe x => donde está el cursor"], ["**", "**", "Potencia: x**2"],
        ["π", "PI", "Escribe PI (π) donde está el cursor"]],
      ayuda: "Cada fila es una función anónima de JavaScript: x => x**2 - 3, " +
        "x => sqrt(x), x => 1/x, x => x < 0 ? -x : x**2. Se puede usar Math sin escribir " +
        "«Math.»: sin, cos, tan, sqrt, abs, log, exp, PI, E. La potencia es ** (no ^). " +
        "Los ejes admiten π y fracciones: −2π, 1/2. " +
        "En «Dominio» de cada función se puede limitar dónde se grafica: x > 1, (1, ∞), " +
        "-2 < x <= 3. En «Puntos x» se escriben valores de x para marcar sus puntos " +
        "con líneas de trazos y una cruz (como al graficar con una tabla de valores). " +
        "Seleccioná un gráfico ya insertado para editarlo.",
      erroresFila: function (t) {
        var c = compilar(t);
        return c.error ? [c.error] : [];
      },
      posicion: function (op, cx, cy) {
        var W = ANCHOS[op.tamano] || 800;
        return { x: cx - W / 2, y: cy - W * 0.31 };
      },
      generar: function (op, ox, oy, agregar) {
        conTitulo(op.titulos && "Gráfico de funciones", TAMANOS[op.tamNumeros] || 16, FUENTES[op.fuente] || FUENTES.normal,
          agregar, function (ag) { generarFunciones(op, ox, oy, ag); });
      },
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.campos("Eje x", [
            { clave: "xMin", prefijo: "de", texto: true, titulo: "Admite π y fracciones: -2π, 1/2" },
            { clave: "xMax", prefijo: "a", texto: true, titulo: "Admite π y fracciones: 2π, 7/2" },
          ], function () { var d = leerDominio(op); return d.error || ""; });
          ui.seg("Eje y", "yAuto", [[true, "Automático"], [false, "Manual"]], true);
          if (!op.yAuto) {
            ui.campos("", [
              { clave: "yMin", prefijo: "de", texto: true },
              { clave: "yMax", prefijo: "a", texto: true },
            ], function () { var r = leerRango(op); return r.error || ""; });
          }
        });
        ui.seg("Tamaño", "tamano", [["chico", "Chico"], ["medio", "Medio"], ["grande", "Grande"]]);
        ui.seg("Números", "tamNumeros", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.seg("Curvas", "grosor", [["fino", "Finas"], ["normal", "Normales"], ["grueso", "Gruesas"]]);
        ui.chk("Misma escala en x y en y", "escalaIgual");
        ui.seg("Referencia", "posReferencia", [["derecha", "A la derecha"], ["arriba", "Arriba"]]);
        ui.chk("Cuadrícula", "cuadricula");
        ui.chk("Cuadrícula cuadrada", "cuadrada");
        ui.chk("Graduación solo en enteros", "soloEnteros");
        ui.chk("Ocultar numeración", "ocultarNumeros");
        ui.chk("Incluir referencia", "referencia");
        ui.chk("Marcar extremos del dominio (● incluido, ○ excluido)", "marcarExtremos");
        ui.chk("Título («Gráfico de funciones»)", "titulos");
      },
    },

    tabla: {
      titulo: "Lógica proposicional",
      dibujo: "tabla", femenino: true,
      clave: "pizarra-generador-tabla",
      defecto: {
        filas: [{ texto: "(p ∨ q) ∧ ¬p", color: COLORES[0] }],
        nVars: 2, nombres: "p, q, r, s, t", valores: "VF", primero: "V",
        tamTexto: "M", fuente: "normal", intermedias: true, lineasFilas: true,
        colorResultado: true, clasificar: false, ocultar: false,
        mostrarTabla: true, simplificar: false, forma: "fnd",
        interruptores: false, diseno: "abierto", circuitoDe: "original", titulos: true,
      },
      contenido: ["filas", "nVars", "nombres"],
      ejemplo: { filas: [{ texto: "[(p → q) ∧ p] → q", color: COLORES[0] }], nVars: 2 },
      textoEjemplo: "Inserta una tabla nueva de ejemplo (modus ponens)",
      agregarFila: "+ Expresión",
      placeholder: "Ej: (p → q) ∧ ¬r",
      simbolos: [["¬", "¬", "Negación"], ["∧", " ∧ ", "Conjunción (y)"], ["∨", " ∨ ", "Disyunción (o)"],
        ["⊻", " ⊻ ", "Disyunción excluyente"], ["→", " → ", "Condicional"], ["↔", " ↔ ", "Bicondicional"]],
      ayuda: "Cada fila es una expresión; todas comparten las variables de arriba. " +
        "Conectivos: ¬ (~ !), ∧ (& ^ y), ∨ (| o v), ⊻ (xor), → (->), ↔ (<->). " +
        "Sin paréntesis, ¬ se resuelve primero, después ∧, ∨, → y por último ↔. " +
        "Se pueden usar ( ) y [ ]. Seleccioná una tabla ya insertada para editarla.",
      erroresFila: erroresLogica,
      posicion: function (op, cx, cy) {
        var t = armarTabla(op);
        return { x: cx - t.W / 2, y: cy - t.Htotal / 2 };
      },
      generar: generarTabla,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          var n = [];
          for (var i = 1; i <= MAX_VARIABLES; i++) n.push([i, String(i)]);
          ui.seg("Variables", "nVars", n);
          ui.campos("Nombres", [{ clave: "nombres", prefijo: "", texto: true, ancho: 150,
            titulo: "Nombres de las variables, en orden, separados por coma" }],
          function () { return leerVariables(op).error; });
        });
        ui.seg("Valores", "valores", [["VF", "V / F"], ["10", "1 / 0"]]);
        ui.seg("Primera fila", "primero", [["V", "Todo verdadero"], ["F", "Todo falso"]]);
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Columnas intermedias (paso a paso)", "intermedias");
        ui.chk("Líneas entre filas", "lineasFilas");
        ui.chk("Resultado en el color de la expresión", "colorResultado");
        ui.chk("Escribir si es tautología, contradicción o contingencia", "clasificar");
        ui.chk("Dejar vacías las columnas a calcular (para completar)", "ocultar");
        ui.chk("Dibujar la tabla", "mostrarTabla");
        ui.chk("Títulos («Tabla de verdad», «Circuito de interruptores»)", "titulos");
        ui.chk("Escribir la expresión simplificada", "simplificar", true);
        ui.chk("Circuito de interruptores", "interruptores", true);
        if (op.interruptores) {
          ui.seg("Diseño", "diseno", [["abierto", "Abierto / cerrado"], ["casilla", "Espacios"]]);
          ui.seg("Circuito de", "circuitoDe", [["original", "La escrita"], ["simple", "La simplificada"], ["ambas", "Ambas"]], true);
        }
        if (op.simplificar || (op.interruptores && op.circuitoDe !== "original")) {
          ui.seg("Simplificar como", "forma", [["fnd", "∨ de ∧ (FND)"], ["fnc", "∧ de ∨ (FNC)"]]);
        }
      },
    },

    boole: {
      titulo: "Álgebra de Boole",
      dibujo: "dibujo", femenino: false,
      clave: "pizarra-generador-boole",
      defecto: {
        filas: [{ nombre: "F", texto: "AB + A'C + BC", color: COLORES[0] }],
        nVars: 3, nombres: "A, B, C, D, E",
        tabla: true, minterminos: true, maxiterminos: false, karnaugh: true, agrupar: "min",
        simplificar: true, indices: true, circuito: true, circuitoDe: "ambas",
        negacion: "prima", producto: "junto", tamTexto: "M", fuente: "normal", titulos: true,
      },
      contenido: ["filas", "nVars", "nombres"],
      ejemplo: {
        nVars: 4,
        filas: [
          { nombre: "F", texto: "m(0, 2, 5, 7, 8, 10, 13, 15)", color: COLORES[0] },
          { nombre: "G", texto: "(A + B)(A + C' + D)", color: COLORES[1] },
        ],
      },
      textoEjemplo: "Inserta un dibujo nuevo de ejemplo con 4 variables",
      agregarFila: "+ Función",
      placeholder: "AB + A'C  o  m(1, 3, 5)  o  M(0, 2)",
      nombreFila: { porDefecto: nombreBoole, titulo: "Nombre de la función: F, G, H..." },
      simbolos: [["'", "'", "Negación: A' o (A + B)'"], ["+", " + ", "O (suma)"],
        ["·", "·", "Y (producto); con variables de una letra también vale AB"],
        ["⊕", " ⊕ ", "O exclusivo (XOR)"], ["⊙", " ⊙ ", "Equivalencia (XNOR)"],
        ["Σm( )", "m(", "Por minitérminos: m(1, 3, 5)"], ["ΠM( )", "M(", "Por maxitérminos: M(0, 2)"]],
      ayuda: "Cada fila es una función de las variables de arriba: una expresión (AB + A'C, (A + B)C', " +
        "A ⊕ B; con variables de una letra AB es A·B) o sus índices: m(1, 3, 5) son los minitérminos " +
        "(filas donde vale 1) y M(0, 2) los maxitérminos (filas donde vale 0). El índice de una fila es " +
        "su número en binario, con la primera variable como bit más significativo. " +
        "Seleccioná un dibujo ya insertado para editarlo.",
      erroresFila: erroresBoole,
      posicion: function (op, cx, cy) { return { x: cx - 400, y: cy - 250 }; },
      generar: generarBoole,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          var n = [];
          for (var i = 1; i <= MAX_VARIABLES; i++) n.push([i, String(i)]);
          ui.seg("Variables", "nVars", n);
          ui.campos("Nombres", [{ clave: "nombres", prefijo: "", texto: true, ancho: 150,
            titulo: "Nombres de las variables, en orden, separados por coma" }],
          function () { return leerVariables(op).error; });
          ui.seg("Simplificar con", "agrupar", [["min", "Unos (Σm)"], ["max", "Ceros (ΠM)"]]);
        });
        ui.chk("Tabla de verdad", "tabla");
        ui.chk("Forma canónica con minitérminos (Σm)", "minterminos");
        ui.chk("Forma canónica con maxitérminos (ΠM)", "maxiterminos");
        ui.chk("Mapa de Karnaugh (hasta 4 variables)", "karnaugh", true);
        if (op.karnaugh) ui.chk("Número de cada celda en el mapa", "indices");
        ui.chk("Escribir la simplificada", "simplificar");
        ui.chk("Títulos («Tabla de verdad», «Mapa de Karnaugh», «Circuito lógico»)", "titulos");
        ui.chk("Circuito lógico", "circuito", true);
        if (op.circuito) {
          ui.seg("Circuito de", "circuitoDe", [["escrita", "La escrita"], ["simple", "La simplificada"], ["ambas", "Ambas"]]);
        }
        ui.seg("Negación", "negacion", [["prima", "A'"], ["barra", "¬A"]]);
        ui.seg("Producto", "producto", [["junto", "AB"], ["punto", "A·B"]]);
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
      },
    },

    conjuntos: {
      titulo: "Conjuntos",
      dibujo: "cálculo", femenino: false,
      clave: "pizarra-generador-conjuntos",
      defecto: {
        universo: "finito", universoTexto: "1, 2, ..., 10", conCero: false,
        filas: [
          { nombre: "A", texto: "x => x % 2 == 0", color: COLORES[0] },
          { nombre: "B", texto: "{1, 2, 3, 4, 5}", color: COLORES[1] },
          { nombre: "C", texto: "A ∪ B", color: COLORES[2] },
          { nombre: "D", texto: "A ∩ B", color: COLORES[3] },
          { nombre: "E", texto: "(A ∪ B)'", color: COLORES[4] },
          // por comprension usando otros conjuntos (equivale a B − A)
          { nombre: "F", texto: "x => B(x) && !A(x)", color: COLORES[5] },
        ],
        mostrar: "todos", limite: 10, tamTexto: "M", fuente: "normal", ancho: "medio",
        escribirU: true, mostrarDef: true, cardinal: false,
      },
      contenido: ["filas", "universo", "universoTexto", "conCero"],
      ejemplo: {
        universo: "N", conCero: false,
        filas: [
          { nombre: "A", texto: "x => x % 3 == 0", color: COLORES[0] },
          { nombre: "B", texto: "{1, 2, 3, 4, 5, 6}", color: COLORES[1] },
          { nombre: "C", texto: "A ∩ B", color: COLORES[2] },
          { nombre: "D", texto: "B − A", color: COLORES[3] },
          { nombre: "E", texto: "A Δ B", color: COLORES[4] },
          { nombre: "F", texto: "B'", color: COLORES[5] },
          // por comprension usando otros conjuntos: x ∈ B ∨ (x ∈ A ∧ x < 20)
          { nombre: "G", texto: "x => B(x) || A(x) && x < 20", color: "#e8590c" },
        ],
      },
      textoEjemplo: "Inserta un cálculo nuevo de ejemplo en ℕ",
      agregarFila: "+ Conjunto",
      placeholder: "{1, 2, 3}  o  x => x > 2  o  A ∪ B",
      nombreFila: { porDefecto: nombreConj, titulo: "Nombre del conjunto: A, B, C..." },
      simbolos: [["∪", " ∪ ", "Unión"], ["∩", " ∩ ", "Intersección"], ["−", " − ", "Diferencia"],
        ["Δ", " Δ ", "Diferencia simétrica"], ["A'", "'", "Complemento respecto de U (se escribe después: A')"],
        ["×", " × ", "Producto cartesiano"], ["P( )", "P(", "Conjunto de partes"], ["∅", "∅", "Conjunto vacío"],
        ["x =>", "x => ", "Por comprensión: x => condición"]],
      ayuda: "Cada fila es un conjunto: por extensión {1, 2, 3} (también {1, 2, ..., 10} o {a, e, i}), " +
        "por comprensión con una función que recibe cada elemento de U y dice si está: " +
        "x => x % 2 == 0, x => x > 3 && x < 8 (Math sin prefijo); los conjuntos de las filas de arriba " +
        "se usan como funciones: x => A(x) && !B(x) (x ∈ A y x ∉ B), " +
        "o una operación con los de las filas de arriba: A ∪ B, A ∩ B, A − B, A Δ B, A' (complemento), " +
        "A × B, P(A), (A ∪ B)'. ∩ y × se resuelven antes que ∪, − y Δ; ante la duda, paréntesis. " +
        "En ℝ los conjuntos infinitos se escriben por comprensión. Seleccioná un cálculo ya insertado para editarlo.",
      erroresFila: erroresConjunto,
      posicion: function (op, cx, cy) { return { x: cx - (ANCHOS_CONJ[op.ancho] || 900) / 2, y: cy - 100 }; },
      generar: generarConjuntos,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        var finito = !UNIVERSOS[op.universo];
        ui.arriba(function () {
          ui.seg("Universo", "universo", [["finito", "Finito"], ["N", "ℕ"], ["Z", "ℤ"], ["Q", "ℚ"], ["R", "ℝ"]], true);
          if (finito) {
            ui.campos("U =", [{ clave: "universoTexto", prefijo: "", texto: true, ancho: 220,
              titulo: "Elementos de U separados por coma: 1, 2, ..., 10 o a, b, c, d" }],
            function () { return leerUniverso(op).error; });
          }
          if (op.universo === "N") ui.chk("ℕ incluye el 0", "conCero");
          if (finito) ui.seg("Elementos", "mostrar", [["todos", "Todos"], ["limite", "Hasta un límite"]], true);
          if (!finito || op.mostrar === "limite") {
            ui.campos("Mostrar", [{ clave: "limite", prefijo: "hasta", sufijo: "elementos", numero: [1, 500],
              titulo: "Cantidad de elementos a escribir; si hay más, se ponen puntos suspensivos" }]);
          }
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.seg("Ancho", "ancho", [["angosto", "Angosto"], ["medio", "Medio"], ["ancho", "Ancho"]]);
        ui.chk("Escribir el universo", "escribirU");
        ui.chk("Escribir la definición (A ∪ B = ..., {x ∈ U / ...} = ...)", "mostrarDef");
        ui.chk("Escribir el cardinal |A| (si se conocen todos los elementos)", "cardinal");
      },
    },

    relaciones: {
      titulo: "Relaciones",
      dibujo: "dibujo", femenino: false,
      clave: "pizarra-generador-relaciones",
      defecto: {
        filas: [
          { nombre: "A", texto: "{1, 2, 3, 4}", color: COLORES[0] },
          { nombre: "R", texto: "(x, y) => y % x == 0", base: "A × A", color: COLORES[1] },
        ],
        tamTexto: "M", fuente: "normal", ancho: "medio",
        escribir: true, mostrarDef: true, dominio: false, propiedades: true,
        cartesiano: true, sagital: true, grafo: true, titulos: true,
      },
      contenido: ["filas"],
      ejemplo: {
        filas: [
          { nombre: "A", texto: "{1, 2, 3}", color: COLORES[0] },
          { nombre: "B", texto: "{a, b}", color: COLORES[2] },
          { nombre: "S", texto: "{(1, a), (2, a), (3, b)}", base: "A × B", color: COLORES[1] },
          { nombre: "T", texto: "(x, y) => (x + y) % 2 == 0", base: "A × A", color: COLORES[3] },
          // la inversa de S, usando S dentro de la funcion
          { nombre: "Q", texto: "(x, y) => S(y, x)", base: "B × A", color: COLORES[4] },
        ],
      },
      textoEjemplo: "Inserta un dibujo nuevo de ejemplo con tres relaciones",
      agregarFila: "+ Conjunto o relación",
      placeholder: "{1, 2, 3}  o  (x, y) => x < y  o  {(1, 2)}",
      nombreFila: { porDefecto: nombreConj, titulo: "Nombre del conjunto o relación: A, B, R, S..." },
      extrasFila: [
        { clave: "base", etiqueta: "⊆",
          placeholder: "A × B (relación) · A (comprensión) · vacío",
          titulo: "De dónde se toman los elementos: el producto cartesiano de una relación (A × B, A × A) " +
            "o el conjunto de un conjunto por comprensión (A)",
          errores: function () { return []; } },
      ],
      simbolos: [["(x, y) =>", "(x, y) => ", "Relación por comprensión"], ["x =>", "x => ", "Conjunto por comprensión"],
        ["×", " × ", "Producto cartesiano"], ["∪", " ∪ ", "Unión"], ["∩", " ∩ ", "Intersección"], ["−", " − ", "Diferencia"]],
      ayuda: "Cada fila es un conjunto finito o una relación. Conjuntos: {1, 2, 3}, {a, b}, A ∪ B, " +
        "o por comprensión x => x % 2 == 0 con «⊆ A». Relaciones (con «⊆ A × B»): por extensión " +
        "{(1, a), (2, b)} o por comprensión (x, y) => x < y. Las funciones pueden usar los conjuntos " +
        "(A(x)) y relaciones (R(x, y)) de las filas de arriba, por ejemplo la inversa: (x, y) => R(y, x) " +
        "con «⊆ B × A». Seleccioná un dibujo ya insertado para editarlo.",
      erroresFila: erroresRelacion,
      posicion: function (op, cx, cy) { return { x: cx - 450, y: cy - 250 }; },
      generar: generarRelaciones,
      opciones: function (ui) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.chk("Gráfico cartesiano", "cartesiano");
          ui.chk("Diagrama sagital", "sagital");
          ui.chk("Grafo dirigido", "grafo");
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.seg("Ancho", "ancho", [["angosto", "Angosto"], ["medio", "Medio"], ["ancho", "Ancho"]]);
        ui.chk("Escribir conjuntos y relaciones por extensión", "escribir");
        ui.chk("Escribir la definición por comprensión", "mostrarDef");
        ui.chk("Escribir dominio e imagen", "dominio");
        ui.chk("Propiedades (relaciones en A × A)", "propiedades");
        ui.chk("Títulos de los diagramas («Diagrama sagital»...)", "titulos");
      },
    },

    estructuras: {
      titulo: "Estructuras",
      dibujo: "desarrollo", femenino: false,
      clave: "pizarra-generador-estructuras",
      defecto: {
        filas: [{ texto: "x * y = x + y - 3", conjunto: "ℤ", color: COLORES[0] }],
        lci: true, asociativa: true, conmutativa: false, neutro: true, inverso: true, distributiva: true,
        tamTexto: "M", fuente: "normal", titulos: true, general: true, escribirOperacion: true,
      },
      contenido: ["filas"],
      ejemplo: {
        filas: [
          { texto: "x * y = 2xy", conjunto: "ℝ", color: COLORES[0] },
          { texto: "x ∘ y = x + y", conjunto: "ℝ", color: COLORES[1] },
        ],
      },
      textoEjemplo: "Inserta un desarrollo de ejemplo con dos operaciones (incluye la distributiva)",
      agregarFila: "+ Operación",
      placeholder: "Ej: x * y = x + y - 3",
      extrasFila: [
        { clave: "conjunto", etiqueta: "en", placeholder: "ℤ, ℝ, A... (vacío = A)",
          titulo: "Conjunto donde está definida la operación",
          errores: function () { return []; } },
      ],
      simbolos: [["∘", " ∘ ", "Escribe ∘"], ["△", " △ ", "Escribe △"], ["⊕", " ⊕ ", "Escribe ⊕"],
        ["·", "·", "Producto"], ["ℕ", "ℕ", "Naturales"], ["ℤ", "ℤ", "Enteros"], ["ℚ", "ℚ", "Racionales"], ["ℝ", "ℝ", "Reales"]],
      ayuda: "Cada fila es una operación: x * y = x + y - 3, x ∘ y = 2xy, a △ b = (a + b)/2. " +
        "El símbolo es lo que está entre las dos variables. Para cada propiedad se escribe su definición " +
        "y los reemplazos con la definición de la operación, paso a paso, sin resolver. " +
        "La distributiva es de la primera operación sobre la segunda. Seleccioná un desarrollo ya insertado para editarlo.",
      erroresFila: function (t) { var d = leerOperacion(t); return d.error ? [d.error] : []; },
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 200 }; },
      generar: generarEstructuras,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.chk("Ley de composición interna", "lci");
          ui.chk("Asociatividad", "asociativa");
          ui.chk("Conmutatividad", "conmutativa");
          ui.chk("Existencia de elemento neutro", "neutro");
          ui.chk("Existencia de elemento inverso", "inverso");
          ui.chk("Distributividad de la 1.ª operación sobre la 2.ª (con dos filas)", "distributiva");
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Escribir la operación", "escribirOperacion");
        ui.chk("Títulos de las propiedades", "titulos");
        ui.chk("Escribir la definición general", "general");
      },
    },

    combinatoria: {
      titulo: "Combinatoria",
      dibujo: "cálculo", femenino: false,
      clave: "pizarra-generador-combinatoria",
      defecto: {
        filas: [{ texto: "6 V 2", color: COLORES[0] }],
        desarrollo: "simplificar", fracciones: "barra", disposicion: "abajo", notacion: "sub", repeticion: "R",
        tamTexto: "M", fuente: "normal", titulos: true, formula: true, tachar: true,
        colorResultado: true, recuadro: false,
      },
      contenido: ["filas"],
      ejemplo: {
        filas: [
          { texto: "P 4", color: COLORES[0] },
          { texto: "6 V 2", color: COLORES[1] },
          { texto: "6 C 2", color: COLORES[2] },
          { texto: "3 VR 2", color: COLORES[3] },
          { texto: "4 CR 2", color: COLORES[4] },
          { texto: "PR 6; 3, 2", color: COLORES[5] },
        ],
      },
      textoEjemplo: "Inserta un cálculo nuevo de ejemplo con los seis tipos",
      agregarFila: "+ Cálculo",
      placeholder: "Ej: 6 V 2  ·  5 C 3  ·  P 4",
      simbolos: [["P", "P ", "Permutaciones: P 5"], ["V", " V ", "Variaciones: 6 V 2"], ["C", " C ", "Combinaciones: 6 C 2"],
        ["VR", " VR ", "Variaciones con repetición: 3 VR 2"], ["CR", " CR ", "Combinaciones con repetición: 4 CR 2"],
        ["PR", "PR ", "Permutaciones con repetición: PR 6; 3, 2"], ["!", "!", "Factorial: 5!"]],
      ayuda: "Cada fila es un cálculo: 6 V 2 (variaciones), 6 C 2 (combinaciones), P 5 o 5! (permutaciones), " +
        "3 VR 2 y 4 CR 2 (con repetición, también V' y C'), PR 6; 3, 2 (permutaciones con repetición: " +
        "n y cuántas veces se repite cada elemento). También V(6, 2), C6,2 o 6 P 2 (nPr de la calculadora). " +
        "Se escribe la fórmula, el reemplazo con factoriales y la resolución paso a paso. " +
        "Seleccioná un cálculo ya insertado para editarlo.",
      erroresFila: function (t) { var c = leerCombinatoria(t); return c.error ? [c.error] : []; },
      posicion: function (op, cx, cy) { return { x: cx - 200, y: cy - 150 }; },
      generar: generarCombinatoria,
      opciones: function (ui) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.seg("Desarrollo", "desarrollo", [["simplificar", "Simplificando"], ["completo", "Factoriales completos"]]);
          ui.seg("Fracciones", "fracciones", [["barra", "Con barra"], ["linea", "En una línea"]]);
          ui.seg("Pasos", "disposicion", [["abajo", "Uno debajo de otro"], ["derecha", "En un renglón"]]);
        });
        ui.seg("Notación", "notacion", [["sub", "V₆,₂"], ["paren", "V(6, 2)"]]);
        ui.seg("Con repetición", "repeticion", [["R", "VR, CR, PR"], ["prima", "V', C', P'"]]);
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Nombre («Variaciones simples»...)", "titulos");
        ui.chk("Escribir la fórmula general", "formula");
        ui.chk("Tachar lo que se simplifica", "tachar");
        ui.chk("Resultado en el color de la fila", "colorResultado");
        ui.chk("Recuadrar el resultado", "recuadro");
      },
    },

    mcm: {
      titulo: "MCM y MCD",
      dibujo: "cálculo", femenino: false,
      clave: "pizarra-generador-mcm",
      defecto: {
        filas: [{ texto: "12, 18, 30", color: COLORES[0] }],
        mcm: true, mcd: true, tablas: true, regla: true, notacion: "mayus", producto: "punto",
        tamTexto: "M", fuente: "normal", titulos: true, colorResultado: true, recuadro: false,
      },
      contenido: ["filas"],
      ejemplo: {
        filas: [
          { texto: "24, 36", color: COLORES[0] },
          { texto: "15, 28", color: COLORES[1] },
          { texto: "60, 90, 150", color: COLORES[2] },
        ],
      },
      textoEjemplo: "Inserta un cálculo nuevo de ejemplo con tres listas de números",
      agregarFila: "+ Números",
      placeholder: "Ej: 12, 18, 30",
      simbolos: [],
      ayuda: "Cada fila es una lista de 2 a 6 números naturales separados por coma: 12, 18, 30. " +
        "Se descompone cada número en factores primos (tabla de divisiones sucesivas), se escribe su " +
        "factorización y se calcula el MCD (factores comunes con el menor exponente) y el MCM " +
        "(factores comunes y no comunes con el mayor exponente). Seleccioná un cálculo ya insertado para editarlo.",
      erroresFila: function (t) { var l = leerNumerosMcm(t); return l.error ? [l.error] : []; },
      posicion: function (op, cx, cy) { return { x: cx - 200, y: cy - 150 }; },
      generar: generarMcm,
      opciones: function (ui) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.chk("Calcular el MCM", "mcm");
          ui.chk("Calcular el MCD", "mcd");
          ui.chk("Tablas de divisiones sucesivas", "tablas");
        });
        ui.seg("Notación", "notacion", [["mayus", "MCM / MCD"], ["puntos", "m.c.m. / m.c.d."]]);
        ui.seg("Producto", "producto", [["punto", "2 · 3"], ["x", "2 × 3"]]);
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Título («MCM y MCD de 12, 18 y 30»)", "titulos");
        ui.chk("Escribir la regla (comunes con el menor exponente...)", "regla");
        ui.chk("Resultado en el color de la fila", "colorResultado");
        ui.chk("Recuadrar el resultado", "recuadro");
      },
    },

    valorAbsoluto: {
      titulo: "Ecuaciones con valor absoluto",
      dibujo: "plantilla", femenino: true,
      clave: "pizarra-generador-valor-absoluto",
      defecto: {
        filas: [{ texto: "|x + 7/4| = 9/4", color: "#e64980" }],
        casos: "noEstricto", renglones: 4, tamTexto: "L", fuente: "codigo", colorLineas: true,
      },
      contenido: ["filas"],
      ejemplo: {
        filas: [
          { texto: "|2x − 1| = 5", color: "#e64980" },
          { texto: "3 + |x − 4| = 2x", color: COLORES[0] },
        ],
      },
      textoEjemplo: "Inserta dos plantillas de ejemplo: |2x − 1| = 5 y 3 + |x − 4| = 2x",
      agregarFila: "+ Ecuación",
      placeholder: "Ej: |x + 7/4| = 9/4",
      simbolos: [["|", "|", "Barra del valor absoluto: |x + 1|"], ["−", " − ", "Resta"], ["·", "·", "Producto"],
        ["≤", " ≤ ", "Menor o igual"], ["≥", " ≥ ", "Mayor o igual"]],
      ayuda: "Cada fila es una ecuación (o inecuación) con valor absoluto: |x + 7/4| = 9/4. No se resuelve: " +
        "se arma la plantilla con los dos casos del valor absoluto de más a la izquierda (E ≥ 0 → |E| = E y " +
        "E < 0 → |E| = −(E)), dejando espacio debajo de cada caso para resolverlo paso a paso. " +
        "Seleccioná una plantilla ya insertada para editarla.",
      erroresFila: function (t) { var a = leerEcuacionAbs(t); return a.error ? [a.error] : []; },
      posicion: function (op, cx, cy) { return { x: cx - 250, y: cy - 200 }; },
      generar: generarAbs,
      opciones: function (ui) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.seg("Casos", "casos", [["noEstricto", "E ≥ 0 y E < 0"], ["estricto", "E > 0 y E ≤ 0"]]);
          ui.campos("Espacio para resolver", [
            { clave: "renglones", prefijo: "", sufijo: "renglones por caso", numero: [0, 20], ancho: 52,
              titulo: "Renglones en blanco debajo de cada caso" },
          ]);
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Llave y flechas en el color de la fila", "colorLineas");
      },
    },

    complejos: {
      titulo: "Números complejos",
      dibujo: "cálculo", femenino: false,
      clave: "pizarra-generador-complejos",
      defecto: {
        filas: [
          { nombre: "z₁", texto: "3 + 4i", color: COLORES[0] },
          { nombre: "z₂", texto: "[2; 30°]", color: COLORES[1] },
          { nombre: "z₃", texto: "z₁ · z₂", color: COLORES[2] },
        ],
        fBinomica: true, fPar: false, fPolar: true, fTrig: true, operarEn: "ambas", convertirResultado: true,
        grafico: true, soloGrafico: false, angulosC: true, paralelogramo: true, cuadriculaC: true,
        tamGrafico: "medio", posGrafico: "derecha",
        unidad: "grados", rango: "360", decimales: 2, notacionPolar: "corchetes",
        tamTexto: "M", fuente: "normal", titulos: true, colorResultado: true,
      },
      contenido: ["filas"],
      ejemplo: {
        filas: [
          { nombre: "z₁", texto: "-3 + 4i", color: COLORES[0] },
          { nombre: "z₂", texto: "(1, -1)", color: COLORES[1] },
          { nombre: "z₃", texto: "2(cos 60° + i sen 60°)", color: COLORES[2] },
          { nombre: "z₄", texto: "z₁ + z₂", color: COLORES[3] },
          { nombre: "z₅", texto: "z₁ / z₂", color: COLORES[4] },
        ],
      },
      textoEjemplo: "Inserta un cálculo nuevo de ejemplo con tres números en distintas formas, una suma y un cociente",
      agregarFila: "+ Número u operación",
      placeholder: "3 + 4i  ·  (3, 4)  ·  [5; 53°]  ·  z₁ · z₂",
      nombreFila: { porDefecto: nombreComplejo, titulo: "Nombre del número: z₁, z₂, w..." },
      simbolos: [["i", "i", "Unidad imaginaria"], ["°", "°", "Grados (sin ° el ángulo va en radianes)"],
        ["π", "π", "Pi, para ángulos en radianes: π/4"], ["∠", "∠", "Forma polar: 5∠30°"],
        ["cos + i sen", "(cos  + i sen )", "Forma trigonométrica: 5(cos 30° + i sen 30°)"],
        ["√", "√", "Raíz: √3/2"], ["·", " · ", "Producto"], ["/", " / ", "Cociente"]],
      ayuda: "Cada fila es un número complejo en cualquier forma: binómica 3 + 4i, par ordenado (3, 4) " +
        "(con decimales con coma: (0,5; 2)), polar [5; 53,13°] o 5∠53,13°, trigonométrica 5(cos 30° + i sen 30°). " +
        "Los ángulos con ° van en grados; sin °, en radianes (π/4). O una operación entre filas de arriba: " +
        "z₁ + z₂, z₁ − z₂, z₁ · z₂, z₁ / z₂ (se puede escribir z1 en vez de z₁). Se escribe el pasaje a las " +
        "formas elegidas paso a paso, con el módulo y el argumento (arctg(b/a) según el cuadrante). " +
        "Seleccioná un cálculo ya insertado para editarlo.",
      erroresFila: erroresComplejo,
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 250 }; },
      generar: generarComplejos,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.grupo("Escribir en forma", ["fBinomica", "fPar", "fPolar", "fTrig"]);
          ui.chk("Binómica (a + bi)", "fBinomica");
          ui.chk("Par ordenado (a, b)", "fPar");
          ui.chk("Polar [ρ; φ]", "fPolar");
          ui.chk("Trigonométrica ρ(cos φ + i sen φ)", "fTrig");
          ui.seg("Producto y cociente", "operarEn", [["binomica", "Binómica"], ["polar", "Polar"], ["ambas", "Ambas"]]);
          ui.chk("Pasar el resultado de las operaciones a las otras formas", "convertirResultado");
          ui.chk("Graficar en el plano complejo", "grafico", true);
          if (op.grafico) {
            ui.chk("Ángulos (arco del argumento φ)", "angulosC");
            ui.chk("Paralelogramo en sumas y restas", "paralelogramo");
            ui.chk("Cuadrícula", "cuadriculaC");
            ui.chk("Solo el gráfico (sin los pasos)", "soloGrafico");
            ui.seg("Gráfico", "tamGrafico", [["chico", "Chico"], ["medio", "Medio"], ["grande", "Grande"]]);
            ui.seg("Ubicación", "posGrafico", [["derecha", "A la derecha"], ["abajo", "Abajo"]]);
          }
        });
        ui.seg("Ángulos", "unidad", [["grados", "Grados"], ["rad", "Radianes"]]);
        ui.seg("Argumento", "rango", [["360", "0 a 360°"], ["180", "−180° a 180°"]]);
        ui.seg("Decimales", "decimales", [[2, "2"], [3, "3"], [4, "4"]]);
        ui.seg("Forma polar", "notacionPolar", [["corchetes", "[ρ; φ]"], ["angulo", "ρ∠φ"]]);
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Títulos de los pasos («Forma polar»...)", "titulos");
        ui.chk("Resultado en el color de la fila", "colorResultado");
      },
    },

    // simplificacion paso a paso: el mismo motor con la notacion de cada seccion
    simpLogica: genSimp("logica", {
      clave: "pizarra-generador-simp-logica",
      filas: [{ texto: "¬(p → q) ∨ (p ∧ q)", color: COLORES[0] }],
      ejemplo: [{ texto: "(p → q) ∧ p", color: COLORES[0] }, { texto: "¬(p ∨ ¬q) ∨ (¬p ∧ q)", color: COLORES[1] },
        { texto: "[(p → q) ∧ p] → q", color: COLORES[2] }],
      placeholder: "Ej: ¬(p → q) ∨ (p ∧ q)",
      consenso: "(p ∧ q) ∨ (¬p ∧ r) ∨ (q ∧ r) ≡ (p ∧ q) ∨ (¬p ∧ r)",
      simbolos: [["¬", "¬", "Negación"], ["∧", " ∧ ", "Conjunción"], ["∨", " ∨ ", "Disyunción"],
        ["→", " → ", "Condicional"], ["↔", " ↔ ", "Bicondicional"], ["⊻", " ⊻ ", "Disyunción excluyente"],
        ["V", "V", "Verdadero"], ["F", "F", "Falso"]],
      ayuda: "Cada fila es una proposición con variables p, q, r... y los conectivos ¬ (~ !), ∧ (&), ∨ (|), " +
        "→ (->), ↔ (<->), ⊻; constantes V y F. Se simplifica paso a paso, con la ley usada en cada paso. ",
    }),
    simpBoole: genSimp("boole", {
      clave: "pizarra-generador-simp-boole",
      filas: [{ nombre: "F", texto: "AB + AB' + A'B", color: COLORES[0] }],
      ejemplo: [{ nombre: "F", texto: "A + A'B", color: COLORES[0] }, { nombre: "G", texto: "(A + B)(A + B')", color: COLORES[1] },
        { nombre: "H", texto: "(AB)' + A", color: COLORES[2] }],
      placeholder: "Ej: AB + AB' + A'B",
      consenso: "AB + A'C + BC = AB + A'C",
      nombreFila: { porDefecto: nombreBoole, titulo: "Nombre de la función: F, G, H..." },
      simbolos: [["'", "'", "Complemento: A' o (A + B)'"], ["+", " + ", "Suma (O)"], ["·", "·", "Producto (Y); AB también vale"],
        ["⊕", " ⊕ ", "O exclusivo"], ["0", "0", "Cero"], ["1", "1", "Uno"]],
      ayuda: "Cada fila es una expresión booleana con variables A, B, C...: suma +, producto AB o A·B, " +
        "complemento A' o (A + B)', ⊕, constantes 0 y 1. Se simplifica paso a paso, con la ley usada en cada paso. ",
    }),
    simpConjuntos: genSimp("conj", {
      clave: "pizarra-generador-simp-conjuntos",
      filas: [{ texto: "(A − B) ∪ (A ∩ B)", color: COLORES[0] }],
      ejemplo: [{ texto: "(A ∪ B) ∩ (A ∪ B')", color: COLORES[0] }, { texto: "(A ∪ B)' ∪ A", color: COLORES[1] },
        { texto: "A − (A − B)", color: COLORES[2] }],
      placeholder: "Ej: (A − B) ∪ (A ∩ B)",
      consenso: "(A ∩ B) ∪ (A' ∩ C) ∪ (B ∩ C) = (A ∩ B) ∪ (A' ∩ C)",
      simbolos: [["∪", " ∪ ", "Unión"], ["∩", " ∩ ", "Intersección"], ["−", " − ", "Diferencia"],
        ["Δ", " Δ ", "Diferencia simétrica"], ["A'", "'", "Complemento (se escribe después: A')"],
        ["U", "U", "Conjunto universal"], ["∅", "∅", "Conjunto vacío"]],
      ayuda: "Cada fila es una expresión con conjuntos A, B, C... (U es el universal y ∅ el vacío): ∪, ∩, − " +
        "(diferencia), Δ (diferencia simétrica) y complemento A'. ∩ se resuelve antes que ∪, − y Δ. " +
        "Se simplifica paso a paso, con la ley usada en cada paso. ",
    }),

    // sin filas: se marcan las definiciones a insertar
    plantillas: {
      titulo: "Plantillas",
      dibujo: "plantillas", femenino: true, plural: true, sinFilas: true,
      clave: "pizarra-generador-plantillas",
      defecto: Object.assign({
        filas: [], tamTexto: "M", fuente: "normal", nombres: true, colorNombre: true,
        notacion: "par", espaciado: false, op1: "*", op2: "+", repeticion: "R",
      }, marcarPlantillas(["pl_reflexiva", "pl_simetrica", "pl_transitiva"])),
      contenido: CLAVES_PLANTILLAS.concat(["filas", "op1", "op2"]),
      ejemplo: marcarPlantillas(["pl_lci", "pl_asociativa", "pl_neutro", "pl_inverso", "pl_conmutativa"]),
      textoEjemplo: "Inserta las definiciones de grupo abeliano (L.C.I., asociativa, neutro, inverso, conmutativa)",
      agregarFila: "", placeholder: "", simbolos: [],
      ayuda: "Marcá las definiciones y tocá «Insertar en el centro»: se escriben una debajo de otra, " +
        "como texto editable. Seleccioná unas plantillas ya insertadas para cambiarlas.",
      erroresFila: function () { return []; },
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 100 }; },
      generar: generarPlantillas,
      opciones: function (ui) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          PLANTILLAS.forEach(function (g) {
            ui.grupo(g.grupo, g.items.map(function (it) { return it.clave; }));
            g.items.forEach(function (it) {
              ui.chk(typeof it.nombre === "function" ? it.nombre({}) : it.nombre, it.clave);
            });
          });
        });
        ui.campos("Operadores", [
          { clave: "op1", prefijo: "1.º", ancho: 44, titulo: "Primer operador de las estructuras algebraicas (por defecto *)" },
          { clave: "op2", prefijo: "2.º", ancho: 44, titulo: "Segundo operador, el de la distributiva (por defecto +)" },
        ]);
        ui.seg("Notación de R", "notacion", [["par", "(x, y) ∈ R"], ["infija", "x R y"]]);
        ui.seg("Con repetición", "repeticion", [["R", "VR, CR, PR"], ["prima", "V', C', P'"]]);
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Escribir el nombre de cada propiedad", "nombres");
        ui.chk("Nombres en color", "colorNombre");
        ui.chk("Más espacio entre renglones", "espaciado");
      },
    },
  };

  // orden de las pestanas del panel (la primera es la que se abre por defecto)
  var ORDEN = ["tabla", "boole", "conjuntos", "relaciones", "recta", "funcion", "estructuras", "combinatoria", "mcm", "valorAbsoluto", "complejos", "simpLogica", "simpBoole", "simpConjuntos", "plantillas"];
  // nombre e icono (un simbolo) de cada generador en el menu desplegable
  // panel: titulo del panel cuando no es el nombre del item (los items solos
  // en su seccion no repiten el nombre de la seccion)
  var MENU_GEN = {
    tabla: { nombre: "Tablas de verdad", panel: "Lógica proposicional", icono: "⊨" },
    boole: { nombre: "Funciones booleanas", panel: "Álgebra de Boole", icono: "∧" },
    conjuntos: { nombre: "Conjuntos", icono: "∪" },
    relaciones: { nombre: "Relaciones binarias", icono: "R" },
    recta: { nombre: "Recta real", icono: "ℝ" },
    funcion: { nombre: "Gráfico de funciones", icono: "ƒ" },
    estructuras: { nombre: "Estructuras algebraicas", icono: "∘" },
    combinatoria: { nombre: "Combinatoria", icono: "n!" },
    mcm: { nombre: "MCM y MCD", icono: "÷" },
    valorAbsoluto: { nombre: "Ecuaciones con valor absoluto", icono: "|x|" },
    complejos: { nombre: "Formas y operaciones", panel: "Números complejos", icono: "ℂ" },
    simpLogica: { nombre: "Simplificación paso a paso", panel: "Simplificación: lógica proposicional", icono: "≡" },
    simpBoole: { nombre: "Simplificación paso a paso", panel: "Simplificación: álgebra de Boole", icono: "=" },
    simpConjuntos: { nombre: "Simplificación paso a paso", panel: "Simplificación: teoría de conjuntos", icono: "=" },
    plantillas: { nombre: "Plantillas", icono: "≡" },
  };
  // como se ordenan en el menu: los sueltos arriba y despues las secciones,
  // con la unidad del programa de la materia a la que pertenecen
  var MENU_ORDEN = [
    "plantillas",
    { grupo: "Lógica proposicional", unidad: 1, items: ["tabla", "simpLogica"] },
    { grupo: "Teoría de conjuntos", unidad: 2, items: ["conjuntos", "relaciones", "estructuras", "simpConjuntos"] },
    { grupo: "Álgebra de Boole", unidad: 3, items: ["boole", "simpBoole"] },
    { grupo: "Sistemas numéricos", unidad: 5, items: ["recta", "combinatoria", "mcm", "valorAbsoluto"] },
    { grupo: "Funciones", unidad: 6, items: ["funcion"] },
    { grupo: "Números complejos", unidad: 7, items: ["complejos"] },
  ];

  // ------------------------------------------------- insertar / reemplazar
  var vinculo = null;     // gid del dibujo que se esta editando
  var seleccionado = null; // ultimo dibujo generado visto en la seleccion
  var turno = 0;

  function datosDe(e) { return e && e.customData && e.customData.pizarra; }

  function elementosDe(gid, todos) {
    return todos.filter(function (e) { return !e.isDeleted && datosDe(e) && datosDe(e).gid === gid; });
  }

  // rectangulo que ocupa un elemento (las lineas pueden tener puntos negativos)
  function caja(e) {
    var x0 = e.x, y0 = e.y, x1 = e.x + e.width, y1 = e.y + e.height;
    if (e.points && e.points.length) {
      var xs = e.points.map(function (p) { return e.x + p[0]; }), ys = e.points.map(function (p) { return e.y + p[1]; });
      x0 = Math.min.apply(null, xs); x1 = Math.max.apply(null, xs);
      y0 = Math.min.apply(null, ys); y1 = Math.max.apply(null, ys);
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function cajaDe(lista) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    lista.forEach(function (e) {
      var c = caja(e);
      b.x0 = Math.min(b.x0, c.x0); b.y0 = Math.min(b.y0, c.y0);
      b.x1 = Math.max(b.x1, c.x1); b.y1 = Math.max(b.y1, c.y1);
    });
    return b;
  }

  // Dibuja con el generador `tipo`. Si hay un dibujo vinculado (y no es `nueva`)
  // lo reemplaza en su lugar; si no, inserta uno nuevo en el centro de la vista.
  // El primer elemento del dibujo ("ancla") guarda las opciones y su distancia
  // al origen del dibujo, para poder regenerarlo en el mismo lugar.
  function aplicar(tipo, op, nueva) {
    var A = api(), gen = GEN[tipo];
    if (!A || !gen) return;
    var mio = ++turno;
    var fuente = FUENTES[op.fuente] || FUENTES.normal;
    // medir con la fuente ya cargada
    document.fonts.load("16px " + fuente.css).catch(function () {}).then(function () {
      if (mio !== turno) return;
      var todos = A.getSceneElementsIncludingDeleted();
      var gid = nueva ? null : vinculo, ox, oy, viejos = [];
      var st = A.getAppState(), z = st.zoom.value;
      var recien = false, vista = {};
      if (gid) {
        viejos = elementosDe(gid, todos);
        var ancla = viejos.filter(function (e) { return datosDe(e).eje; })[0];
        if (ancla && datosDe(ancla).tipo === tipo) {
          var o = datosDe(ancla).origen || [0, 0]; // las rectas viejas no lo guardaban
          ox = ancla.x - o[0]; oy = ancla.y - o[1];
        } else gid = null, viejos = [];
      }
      if (!gid) {
        var pos = gen.posicion(op, -st.scrollX + st.width / z / 2, -st.scrollY + st.height / z / 2);
        gid = nuevoId(); ox = pos.x; oy = pos.y;
        recien = true;
      }
      var borrar = {};
      viejos.forEach(function (e) { borrar[e.id] = true; });
      var ahora = Date.now();
      var resto = todos.map(function (e) {
        if (!borrar[e.id]) return e;
        var d = {};
        for (var k in e) d[k] = e[k];
        d.isDeleted = true; d.version = e.version + 1; d.versionNonce = rnd(); d.updated = ahora;
        return d;
      });

      var nuevos = [];
      gen.generar(op, ox, oy, function (e) {
        e.groupIds = [gid];
        e.customData = { pizarra: { tipo: tipo, gid: gid } };
        nuevos.push(e);
        return e;
      });
      if (!nuevos.length) return;
      var datos = nuevos[0].customData.pizarra;
      datos.eje = true;
      datos.opciones = copiar(op);
      datos.origen = [nuevos[0].x - ox, nuevos[0].y - oy];

      // un dibujo nuevo no se encima a lo que ya hay: baja hasta un lugar libre
      if (recien) {
        var ocupados = resto.filter(function (e) { return !e.isDeleted; }).map(caja);
        for (var vuelta = 0; vuelta < 50; vuelta++) {
          var b = cajaDe(nuevos), choque = null;
          ocupados.forEach(function (o) {
            if (o.x1 > b.x0 && o.x0 < b.x1 && o.y1 > b.y0 && o.y0 < b.y1) choque = Math.max(choque || -Infinity, o.y1);
          });
          if (choque === null) break;
          var bajar = choque - b.y0 + 40;
          nuevos.forEach(function (e) { e.y += bajar; });
        }
        // si quedo fuera de la vista, la vista baja hasta el
        b = cajaDe(nuevos);
        var arriba = -st.scrollY, abajo = arriba + st.height / z;
        if (b.y0 < arriba || b.y1 > abajo) vista.scrollY = -((b.y0 + b.y1) / 2 - st.height / z / 2);
      }
      var sel = {};
      nuevos.forEach(function (e) { sel[e.id] = true; });
      var grupos = {};
      grupos[gid] = true;
      vinculo = seleccionado = gid;
      A.updateScene({
        elements: resto.concat(nuevos),
        appState: Object.assign({ selectedElementIds: sel, selectedGroupIds: grupos, editingGroupId: null }, vista),
        captureUpdate: "IMMEDIATELY",
      });
      panel.modo();
    });
  }

  // ------------------------------------------------------------------ panel
  var ICONO =
    '<svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M2 14h20M4 12l-2 2 2 2M20 12l2 2-2 2"/>' +
    '<path d="M8 9.5h-1.5v9H8M16 9.5c1.2 1.2 1.2 7.8 0 9"/>' +
    '<path d="M9.5 13l2-3M12 13l2-3" stroke-width="1"/></svg>';

  var ESTILO = [
    ".pz-gen{position:fixed;top:64px;right:16px;width:350px;max-height:calc(100vh - 96px);overflow:auto;",
    "z-index:20;background:#fff;color:#1b1b1f;border:1px solid #e0dfe6;border-radius:10px;",
    "box-shadow:0 4px 18px rgba(0,0,0,.12);padding:12px 14px;font:13px/1.4 Assistant,system-ui,sans-serif}",
    ".pz-gen.oscuro{background:#232329;color:#e3e3e8;border-color:#3a3a43}",
    ".pz-gen .cab{display:flex;align-items:center;gap:6px 8px;margin-bottom:6px;flex-wrap:wrap}",
    ".pz-gen .cab .tipos{flex:1}",
    ".pz-gen .cab .titulo-gen{font-size:15px;font-weight:600}",
    // menu desplegable del boton (usa las clases del menu «Más herramientas»)
    // mas especifico que «.excalidraw .dropdown-menu» (z-index 1), que lo
    // dejaria debajo del lienzo y los clics no le llegarian
    ".excalidraw .dropdown-menu.pz-menu-gen{position:fixed;z-index:30;width:240px;max-width:none}",
    ".pz-menu-gen .dropdown-menu-item__icon{font:600 13px/1 Assistant,system-ui,sans-serif;" +
      "display:flex;align-items:center;justify-content:center}",
    ".pz-menu-gen .pz-menu-separador{height:1px;margin:6px 0;background:rgba(127,127,127,.25)}",
    ".excalidraw .pz-menu-gen .dropdown-menu-group-title{margin:4px 0 4px 8px;font-size:12px;opacity:.7}",
    ".pz-menu-gen .dropdown-menu-item.activo{background:var(--color-surface-primary-container,#e0dfff)}",
    ".pz-gen .cab .cerrar{order:1}.pz-gen .cab .modo{order:2}",
    ".pz-gen .modo{font-size:11px;padding:1px 7px;border-radius:9px;background:#e7f5ff;color:#1864ab;white-space:nowrap}",
    ".pz-gen.oscuro .modo{background:#1c3a57;color:#a5d8ff}",
    ".pz-gen .cerrar,.pz-gen .quitar{border:0;background:none;color:inherit;cursor:pointer;font-size:15px;opacity:.6;padding:2px 4px}",
    ".pz-gen .cerrar:hover,.pz-gen .quitar:hover{opacity:1}",
    ".pz-gen .fila{display:flex;gap:6px;align-items:center;margin-top:6px}",
    ".pz-gen input[type=text]{flex:1;min-width:0;padding:5px 7px;border:1px solid #c9c8d1;border-radius:6px;",
    "font:14px Cascadia,Consolas,monospace;background:transparent;color:inherit}",
    ".pz-gen input.nombre{flex:none;width:52px;text-align:center}",
    ".pz-gen .subfila{display:flex;gap:6px;align-items:center;margin:4px 34px 0 0}",
    ".pz-gen .subfila span{flex:none;width:52px;font-size:11px;opacity:.75;text-align:right;line-height:1.1}",
    ".pz-gen input.extra{font-size:13px;padding:3px 7px}",
    ".pz-gen .invalida input.codigo,.pz-gen input.invalido{border-color:#e03131;background:rgba(224,49,49,.07)}",
    ".pz-gen input[type=color]{width:28px;height:28px;padding:0;border:1px solid #c9c8d1;border-radius:6px;background:none;cursor:pointer}",
    ".pz-gen .error{color:#e03131;font-size:12px;margin:2px 0 0 2px}",
    ".pz-gen .opc .error{grid-column:1/3;margin:0}",
    ".pz-gen .botones{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}",
    ".pz-gen button.b{border:1px solid #c9c8d1;background:transparent;color:inherit;border-radius:6px;padding:5px 10px;cursor:pointer;font:inherit}",
    ".pz-gen button.b:hover{background:rgba(127,127,127,.12)}",
    ".pz-gen button.principal{background:#6965db;border-color:#6965db;color:#fff}",
    ".pz-gen button.principal:hover{background:#5753d0}",
    ".pz-gen .opc{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;margin-top:12px}",
    ".pz-gen .seg{display:inline-flex;border:1px solid #c9c8d1;border-radius:6px;overflow:hidden;justify-self:start}",
    ".pz-gen .seg button{border:0;background:transparent;color:inherit;padding:3px 9px;cursor:pointer;font:inherit}",
    ".pz-gen .seg button+button{border-left:1px solid #c9c8d1}",
    ".pz-gen .seg button.activo{background:#6965db;color:#fff}",
    ".pz-gen .opc-op{margin:4px 0 6px}",
    ".pz-gen .campos{display:flex;gap:10px;align-items:center}",
    ".pz-gen .campos input{width:56px;padding:3px 5px;border:1px solid #c9c8d1;border-radius:6px;",
    "background:transparent;color:inherit;font:inherit;flex:none}",
    ".pz-gen label.chk{display:flex;gap:6px;align-items:center;grid-column:1/3;cursor:pointer}",
    ".pz-gen .grupo{grid-column:1/3;display:flex;gap:8px;align-items:baseline;margin-top:6px}",
    ".pz-gen .grupo:first-child{margin-top:0}",
    ".pz-gen .grupo .enlace{border:0;background:none;color:#6965db;cursor:pointer;padding:0;font:inherit;font-size:12px}",
    ".pz-gen .grupo .enlace:hover{text-decoration:underline}",
    ".pz-gen .ayuda{font-size:12px;opacity:.7;margin-top:10px}",
    ".pz-gen details.avanzado{grid-column:1/3;margin-top:6px;border-top:1px solid #e0dfe6;padding-top:8px}",
    ".pz-gen.oscuro details.avanzado{border-color:#3a3a43}",
    ".pz-gen details.avanzado summary{cursor:pointer;font-weight:600}",
    ".pz-gen details.avanzado>.opc{margin-top:8px}",
    ".pz-gen .nota{grid-column:1/3;font-size:12px;opacity:.7;line-height:1.35}",
  ].join("");

  var panel = {
    el: null, abierto: false, tipo: "recta", ops: {}, temporizador: null,

    get op() { return this.ops[this.tipo]; },
    set op(v) { this.ops[this.tipo] = v; },
    gen: function () { return GEN[this.tipo]; },

    construir: function () {
      var st = document.createElement("style");
      st.textContent = ESTILO;
      document.head.appendChild(st);
      var el = document.createElement("div");
      el.className = "pz-gen";
      el.style.display = "none";
      el.innerHTML =
        '<div class="cab"><div class="tipos"><span class="titulo-gen"></span></div><span class="modo"></span>' +
        '<button class="cerrar" title="Cerrar">✕</button></div>' +
        '<div class="opc opc-op"></div>' +
        '<div class="filas"></div>' +
        '<div class="botones simbolos"></div>' +
        '<div class="opc opc-main"></div>' +
        '<div class="botones"><button class="b principal insertar">Insertar en el centro</button>' +
        '<button class="b copia">Insertar copia</button>' +
        '<button class="b restablecer">Restablecer</button>' +
        '<button class="b ejemplo">Ejemplo</button></div>' +
        '<div class="ayuda"></div>';
      document.body.appendChild(el);
      this.el = el;
      var self = this;

      // el generador se elige en el menu desplegable del boton de la barra
      el.querySelector(".cerrar").onclick = function () { self.alternar(false); };
      el.querySelector(".insertar").onclick = function () { aplicar(self.tipo, self.op, !vinculo); };
      el.querySelector(".copia").onclick = function () { aplicar(self.tipo, self.op, true); };
      // dibujo nuevo de ejemplo: carga su contenido y lo inserta en el centro.
      // No toca el dibujo que este seleccionado; el aspecto elegido se mantiene.
      el.querySelector(".ejemplo").onclick = function () {
        clearTimeout(self.temporizador);
        var ej = copiar(self.gen().ejemplo);
        for (var k in ej) self.op[k] = ej[k];
        self.pintarTodo();
        self.guardar();
        aplicar(self.tipo, self.op, true);
      };
      // opciones a los valores predeterminados; el contenido (lo que se grafica)
      // se mantiene
      el.querySelector(".restablecer").onclick = function () {
        var d = copiar(self.gen().defecto);
        self.gen().contenido.forEach(function (k) { d[k] = self.op[k]; });
        self.op = d;
        self.pintarOpciones();
        self.cambio();
      };
      // que Excalidraw no reciba las teclas ni la rueda del panel
      ["keydown", "keyup", "wheel", "paste", "copy", "cut"].forEach(function (ev) {
        el.addEventListener(ev, function (e) { e.stopPropagation(); });
      });
    },

    // muestra el generador `tipo` con sus opciones actuales
    mostrar: function (tipo) {
      this.tipo = tipo;
      try { localStorage.setItem("pizarra-generador-tipo", tipo); } catch (e) {}
      this.pintarTodo();
    },

    // carga opciones (de un dibujo seleccionado o guardadas) para el generador `tipo`
    cargar: function (tipo, op) {
      var d = copiar(GEN[tipo].defecto);
      for (var k in op) d[k] = op[k];
      this.ops[tipo] = d;
      if (this.el && tipo === this.tipo) this.pintarTodo();
    },

    pintarTodo: function () {
      var self = this, gen = this.gen();
      this.el.querySelector(".titulo-gen").textContent = MENU_GEN[this.tipo].panel || MENU_GEN[this.tipo].nombre;
      var sim = this.el.querySelector(".simbolos");
      sim.innerHTML = "";
      var agregar = document.createElement("button");
      agregar.className = "b";
      agregar.textContent = gen.agregarFila;
      agregar.onclick = function () {
        var nueva = { texto: "", color: colorFila(self.op.filas.length) };
        if (gen.nombreFila) nueva.nombre = gen.nombreFila.porDefecto(self.op.filas.length);
        self.op.filas.push(nueva);
        self.pintarFilas(true);
        self.cambio();
      };
      sim.appendChild(agregar);
      // los botones de simbolos no roban el foco del campo de texto
      gen.simbolos.forEach(function (s) {
        var b = document.createElement("button");
        b.className = "b";
        b.textContent = s[0];
        b.title = s[2] || "";
        b.onmousedown = function (e) { e.preventDefault(); };
        b.onclick = function () { self.escribir(s[1]); };
        sim.appendChild(b);
      });
      this.el.querySelector(".ejemplo").title = gen.textoEjemplo;
      this.el.querySelector(".restablecer").title =
        "Vuelve el aspecto a los valores predeterminados (lo que se grafica se mantiene)";
      this.el.querySelector(".ayuda").textContent = gen.ayuda;
      this.el.querySelector(".filas").style.display = gen.sinFilas ? "none" : "";
      sim.style.display = gen.sinFilas ? "none" : "";
      this.pintarFilas();
      this.pintarOpciones();
      this.modo();
    },

    escribir: function (s) {
      var c = document.activeElement;
      // los simbolos van al campo de la funcion/intervalo con el foco (o al primero)
      // (si el foco esta en el nombre, va a la funcion de esa misma fila)
      if (c && c.classList.contains("nombre") && this.el.querySelector(".filas").contains(c)) {
        c = c.parentNode.querySelector("input.codigo");
        c.focus();
        c.selectionStart = c.selectionEnd = c.value.length;
      }
      if (!c || !this.el.querySelector(".filas").contains(c) ||
          !(c.classList.contains("codigo") || c.classList.contains("extra"))) {
        c = this.el.querySelector(".filas input.codigo");
        if (!c) return;
        c.focus();
        c.selectionStart = c.selectionEnd = c.value.length;
      }
      var a = c.selectionStart, b = c.selectionEnd;
      c.value = c.value.slice(0, a) + s + c.value.slice(b);
      c.selectionStart = c.selectionEnd = a + s.length;
      c.dispatchEvent(new Event("input"));
    },

    pintarFilas: function (enfocarUltima) {
      var self = this, gen = this.gen(), cont = this.el.querySelector(".filas");
      cont.innerHTML = "";
      this.validadores = [];
      this.op.filas.forEach(function (f, i) {
        var caja = document.createElement("div");
        caja.innerHTML = '<div class="fila">' +
          (gen.nombreFila ? '<input type="text" class="nombre" spellcheck="false" autocomplete="off">' : "") +
          '<input type="text" class="codigo" spellcheck="false" autocomplete="off">' +
          '<input type="color"><button class="quitar" title="Quitar">✕</button></div>' +
          '<div class="extras"></div><div class="error"></div>';
        var t = caja.querySelector("input.codigo"), c = caja.querySelector("input[type=color]");
        t.placeholder = gen.placeholder;
        t.value = f.texto; c.value = f.color;
        var nom = caja.querySelector("input.nombre");
        if (nom) {
          // vacio = nombre por defecto segun la posicion (f, g, h...)
          nom.placeholder = gen.nombreFila.porDefecto(i);
          nom.title = gen.nombreFila.titulo;
          nom.value = f.nombre || "";
          nom.oninput = function () { f.nombre = nom.value; self.cambio(); };
        }
        // campos extra debajo de la fila (dominio propio, puntos a marcar...)
        var extras = (gen.extrasFila || []).map(function (def) {
          var sub = document.createElement("div");
          sub.className = "subfila";
          sub.innerHTML = '<span></span><input type="text" class="extra" spellcheck="false" autocomplete="off">';
          sub.querySelector("span").textContent = def.etiqueta;
          var inp = sub.querySelector("input");
          inp.classList.add(def.clave);
          inp.placeholder = def.placeholder;
          inp.title = def.titulo;
          inp.value = f[def.clave] || "";
          inp.oninput = function () { f[def.clave] = inp.value; self.cambio(); };
          caja.querySelector(".extras").appendChild(sub);
          return { def: def, inp: inp };
        });
        // los avisos de los extras dependen de la funcion y de los ejes, asi que
        // se revisan en cada cambio (ver cambio())
        function validar() {
          var errores = gen.erroresFila(t.value, self.op, i);
          caja.classList.toggle("invalida", errores.length > 0);
          extras.forEach(function (x) {
            var e = x.def.errores(f, self.op, i);
            x.inp.classList.toggle("invalido", e.length > 0);
            errores = errores.concat(e);
          });
          caja.querySelector(".error").textContent = errores.join(" · ");
        }
        validar();
        self.validadores.push(validar);
        t.oninput = function () { f.texto = t.value; self.cambio(); };
        c.oninput = function () { f.color = c.value; self.cambio(); };
        caja.querySelector(".quitar").onclick = function () {
          self.op.filas.splice(i, 1);
          self.pintarFilas();
          self.cambio();
        };
        cont.appendChild(caja);
        if (enfocarUltima && i === self.op.filas.length - 1) setTimeout(function () { t.focus(); }, 0);
      });
    },

    pintarOpciones: function () {
      var self = this, op = this.op;
      var principal = this.el.querySelector(".opc-main"), arriba = this.el.querySelector(".opc-op");
      principal.innerHTML = "";
      arriba.innerHTML = "";
      var destino = principal;
      function etiqueta(txt) {
        var l = document.createElement("span");
        l.textContent = txt;
        destino.appendChild(l);
      }
      var ui = {
        // las opciones definidas dentro de fn van arriba de las filas
        arriba: function (fn) { destino = arriba; fn(); destino = principal; },
        // seccion plegable "Configuracion avanzada" (recuerda si estaba abierta)
        avanzado: function (fn) {
          var d = document.createElement("details");
          d.className = "avanzado";
          self.avanzadoAbierto = self.avanzadoAbierto || {};
          d.open = !!self.avanzadoAbierto[self.tipo];
          var t = document.createElement("summary");
          t.textContent = "Configuración avanzada";
          d.appendChild(t);
          var dentro = document.createElement("div");
          dentro.className = "opc";
          d.appendChild(dentro);
          d.addEventListener("toggle", function () { self.avanzadoAbierto[self.tipo] = d.open; });
          destino.appendChild(d);
          var antes = destino;
          destino = dentro;
          fn();
          destino = antes;
        },
        // texto de ayuda chico, a todo el ancho
        nota: function (txt) {
          var n = document.createElement("div");
          n.className = "nota";
          n.textContent = txt;
          destino.appendChild(n);
        },
        // botones excluyentes; repintar: vuelve a armar las opciones al cambiar
        seg: function (txt, clave, opciones, repintar) {
          etiqueta(txt);
          var s = document.createElement("div");
          s.className = "seg";
          opciones.forEach(function (o) {
            var b = document.createElement("button");
            b.textContent = o[1];
            b.className = op[clave] === o[0] ? "activo" : "";
            b.onclick = function () {
              op[clave] = o[0];
              [].forEach.call(s.children, function (x) { x.className = ""; });
              b.className = "activo";
              self.cambio();
              if (repintar) self.pintarOpciones();
            };
            s.appendChild(b);
          });
          destino.appendChild(s);
        },
        // encabezado de un grupo de casillas, con "todas" y "ninguna"
        grupo: function (txt, claves) {
          var d = document.createElement("div");
          d.className = "grupo";
          var t = document.createElement("strong");
          t.textContent = txt;
          d.appendChild(t);
          [["todas", true], ["ninguna", false]].forEach(function (q) {
            var b = document.createElement("button");
            b.className = "enlace";
            b.textContent = q[0];
            b.onclick = function () {
              claves.forEach(function (k) { op[k] = q[1]; });
              self.cambio();
              self.pintarOpciones();
            };
            d.appendChild(b);
          });
          destino.appendChild(d);
        },
        chk: function (txt, clave, repintar) {
          var l = document.createElement("label");
          l.className = "chk";
          l.innerHTML = '<input type="checkbox"> ';
          l.appendChild(document.createTextNode(txt));
          var c = l.querySelector("input");
          c.checked = !!op[clave];
          c.onchange = function () { op[clave] = c.checked; self.cambio(); if (repintar) self.pintarOpciones(); };
          destino.appendChild(l);
        },
        // campos cortos en una fila. numero: [min, max] (se limita); texto: libre.
        // error(): mensaje a mostrar debajo si los valores no sirven
        campos: function (txt, defs, error) {
          etiqueta(txt);
          var d = document.createElement("div");
          d.className = "campos";
          var aviso = document.createElement("div");
          aviso.className = "error";
          var inputs = [];
          function revisar() {
            var msj = error ? error() : "";
            aviso.textContent = msj;
            aviso.style.display = msj ? "" : "none";
            inputs.forEach(function (i) { i.classList.toggle("invalido", !!msj); });
          }
          defs.forEach(function (def) {
            var lab = document.createElement("label");
            lab.appendChild(document.createTextNode(def.prefijo + " "));
            var inp = document.createElement("input");
            inp.type = def.numero ? "number" : "text";
            if (def.numero) { inp.min = def.numero[0]; inp.max = def.numero[1]; inp.step = 1; }
            inp.spellcheck = false;
            inp.value = op[def.clave];
            if (def.titulo) inp.title = def.titulo;
            if (def.ancho) inp.style.width = def.ancho + "px";
            inp.oninput = function () {
              if (def.numero) {
                if (inp.value === "" || !isFinite(Number(inp.value))) return;
                op[def.clave] = Math.max(def.numero[0], Math.min(def.numero[1], Number(inp.value)));
              } else op[def.clave] = inp.value;
              revisar();
              self.cambio();
            };
            if (def.numero) inp.onchange = function () { inp.value = op[def.clave]; };
            lab.appendChild(inp);
            if (def.sufijo) lab.appendChild(document.createTextNode(" " + def.sufijo));
            inputs.push(inp);
            d.appendChild(lab);
          });
          destino.appendChild(d);
          destino.appendChild(aviso);
          revisar();
        },
      };
      this.gen().opciones(ui, op);
    },

    guardar: function () {
      try { localStorage.setItem(this.gen().clave, JSON.stringify(this.op)); } catch (e) {}
    },

    // cada cambio: se guarda y, si hay un dibujo vinculado, se redibuja en vivo
    cambio: function () {
      (this.validadores || []).forEach(function (v) { v(); });
      this.guardar();
      var self = this, tipo = this.tipo;
      clearTimeout(this.temporizador);
      if (vinculo) this.temporizador = setTimeout(function () { aplicar(tipo, self.op, false); }, 250);
    },

    modo: function () {
      if (!this.el) return;
      var gen = this.gen(), fem = !!gen.femenino, dibujo = gen.dibujo || "gráfico", pl = gen.plural ? "s" : "";
      this.el.querySelector(".modo").textContent = vinculo ? "editando " + (fem ? "la" : "el") + pl +
        " seleccionad" + (fem ? "a" : "o") + pl : "nuevo";
      this.el.querySelector(".insertar").textContent = vinculo ? "Redibujar" : "Insertar en el centro";
      this.el.querySelector(".copia").style.display = vinculo ? "" : "none";
      this.el.querySelector(".copia").title = gen.plural ? "Inserta una copia" :
        "Inserta otr" + (fem ? "a " : "o ") + dibujo + " igual";
    },

    alternar: function (abrir) {
      this.abierto = abrir === undefined ? !this.abierto : abrir;
      this.el.style.display = this.abierto ? "" : "none";
      boton.actualizar();
      if (this.abierto) seleccionado = undefined, seleccionCambio();
    },
  };

  // Al seleccionar un dibujo generado, el panel cambia a su generador y lo carga
  function seleccionCambio() {
    var A = api();
    if (!A || !panel.abierto) return;
    var st = A.getAppState();
    panel.el.classList.toggle("oscuro", st.theme === "dark");
    var ids = Object.keys(st.selectedElementIds || {});
    var gid = null, tipo = null;
    if (ids.length) {
      var porId = {};
      A.getSceneElements().forEach(function (e) { porId[e.id] = e; });
      for (var i = 0; i < ids.length && !gid; i++) {
        var d = datosDe(porId[ids[i]]);
        if (d && GEN[d.tipo]) gid = d.gid, tipo = d.tipo;
      }
    }
    if (gid === seleccionado) return; // solo se reacciona cuando cambia la seleccion
    seleccionado = gid;
    vinculo = gid;
    if (gid) {
      clearTimeout(panel.temporizador);
      var ancla = elementosDe(gid, A.getSceneElements()).filter(function (e) { return datosDe(e).eje; })[0];
      if (ancla && datosDe(ancla).opciones) panel.cargar(tipo, datosDe(ancla).opciones);
      if (tipo !== panel.tipo) panel.mostrar(tipo);
    }
    panel.modo();
  }

  // ------------------------------------------------- menu desplegable
  // El boton de la barra abre un menu (como «Más herramientas», con sus mismas
  // clases) con un item por generador; al elegir uno se abre el panel con el.
  var menu = {
    el: null, abierto: false,
    construir: function () {
      var self = this, el = document.createElement("div");
      el.className = "dropdown-menu pz-menu-gen";
      el.setAttribute("role", "menu");
      el.style.display = "none";
      var isla = document.createElement("div");
      isla.className = "Island dropdown-menu-container";
      isla.style.setProperty("--padding", "2");
      function item(t, destino) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "radix-menu-item dropdown-menu-item dropdown-menu-item-base";
        b.setAttribute("role", "menuitem");
        b.setAttribute("data-tipo", t);
        b.innerHTML = '<div class="dropdown-menu-item__icon"></div><div class="dropdown-menu-item__text"><span></span></div>';
        // los iconos de varios caracteres (n!, |x|) en un solo renglon y centrados
        var ic = b.querySelector(".dropdown-menu-item__icon");
        ic.textContent = MENU_GEN[t].icono;
        ic.style.whiteSpace = "nowrap";
        ic.style.justifyContent = "center";
        b.querySelector("span").textContent = MENU_GEN[t].nombre;
        b.onclick = function () { self.elegir(t); };
        destino.appendChild(b);
      }
      MENU_ORDEN.forEach(function (x) {
        if (typeof x === "string") { item(x, isla); return; }
        // apartado: linea separadora, titulo y sus items
        var sep = document.createElement("div");
        sep.className = "pz-menu-separador";
        isla.appendChild(sep);
        var g = document.createElement("div");
        g.className = "dropdown-menu-group";
        g.setAttribute("role", "group");
        g.setAttribute("aria-label", x.grupo);
        var tit = document.createElement("p");
        tit.className = "dropdown-menu-group-title";
        tit.textContent = x.grupo + (x.unidad ? " (Unidad " + x.unidad + ")" : "");
        g.appendChild(tit);
        x.items.forEach(function (t) { item(t, g); });
        isla.appendChild(g);
      });
      el.appendChild(isla);
      this.el = el;
      // flechas para moverse entre los items; Excalidraw no recibe las teclas
      el.addEventListener("keydown", function (e) {
        var items = [].slice.call(el.querySelectorAll("[data-tipo]")), i = items.indexOf(document.activeElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          var n = items.length, j = i < 0 ? 0 : (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
          items[j].focus();
        }
        if (e.key !== "Escape") e.stopPropagation();
      });
      // se cierra al tocar afuera o con Escape
      document.addEventListener("pointerdown", function (e) {
        if (self.abierto && !el.contains(e.target) && !boton.el.contains(e.target)) self.alternar(false);
      }, true);
      document.addEventListener("keydown", function (e) {
        if (self.abierto && e.key === "Escape") { e.stopPropagation(); self.alternar(false); }
      }, true);
      window.addEventListener("resize", function () { if (self.abierto) self.ubicar(); });
    },
    // debajo del boton, alineado a su borde derecho (sin salirse de la pantalla)
    ubicar: function () {
      var r = boton.el.getBoundingClientRect(), w = this.el.offsetWidth || 240;
      this.el.style.top = Math.round(r.bottom + 8) + "px";
      // (la altura maxima y el desplazamiento los pone el CSS de Excalidraw)
      this.el.style.left = Math.round(Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))) + "px";
    },
    alternar: function (abrir) {
      this.abierto = abrir === undefined ? !this.abierto : abrir;
      if (this.abierto) {
        // dentro de .excalidraw para heredar los estilos y el tema (claro/oscuro)
        var raiz = document.querySelector(".excalidraw") || document.body;
        if (this.el.parentNode !== raiz) raiz.appendChild(this.el);
        var self = this;
        [].forEach.call(this.el.querySelectorAll("[data-tipo]"), function (b) {
          b.classList.toggle("activo", panel.abierto && b.getAttribute("data-tipo") === panel.tipo);
        });
        this.el.style.display = "";
        this.ubicar();
        var activo = this.el.querySelector(".activo") || this.el.querySelector("[data-tipo]");
        if (activo) activo.focus();
      } else {
        this.el.style.display = "none";
      }
      boton.actualizar();
    },
    elegir: function (t) {
      this.alternar(false);
      if (t !== panel.tipo) {
        clearTimeout(panel.temporizador);
        vinculo = null; // el dibujo seleccionado es de otro tipo
        panel.mostrar(t);
        panel.modo();
      }
      if (!panel.abierto) panel.alternar(true);
    },
  };

  // ------------------------------------------------- boton en la barra superior
  var boton = {
    el: null,
    crear: function () {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ToolIcon ToolIcon_type_toggle ToolIcon_size_medium pz-boton-generadores";
      b.setAttribute("data-testid", "toolbar-generadores");
      b.title = "Generadores: lógica proposicional, álgebra de Boole, conjuntos, relaciones, recta real, gráficos de funciones, estructuras algebraicas, combinatoria, MCM y MCD, ecuaciones con valor absoluto, números complejos, simplificación paso a paso y plantillas";
      b.setAttribute("aria-label", b.title);
      b.innerHTML = '<div class="ToolIcon__icon">' + ICONO + "</div>";
      b.setAttribute("aria-haspopup", "menu");
      b.addEventListener("click", function () { menu.alternar(); });
      this.el = b;
    },
    actualizar: function () {
      this.el.classList.toggle("ToolIcon--checked", panel.abierto || menu.abierto);
      this.el.setAttribute("aria-pressed", panel.abierto ? "true" : "false");
      this.el.setAttribute("aria-expanded", menu.abierto ? "true" : "false");
    },
    // la barra se vuelve a montar (modo zen, modo vista...), asi que se reinserta
    vigilar: function () {
      var self = this;
      setInterval(function () {
        var stack = document.querySelector(".App-toolbar .Stack");
        if (!stack) return;
        var cam = stack.querySelector(".pz-boton-proyeccion");
        var propio = stack.querySelector(".pz-divisor-gen");
        if (cam) {
          if (propio) propio.remove();
          if (cam.nextSibling !== self.el) cam.after(self.el);
        } else if (!stack.contains(self.el)) {
          var div = document.createElement("div");
          div.className = "App-toolbar__divider pz-divisor-gen";
          stack.appendChild(div);
          stack.appendChild(self.el);
        }
      }, 300);
    },
  };

  // ----------------------------------------------------------------- inicio
  function iniciar() {
    Object.keys(GEN).forEach(function (t) {
      var guardado = null;
      try { guardado = JSON.parse(localStorage.getItem(GEN[t].clave) || "null"); } catch (e) {}
      panel.cargar(t, guardado || {});
    });
    var tipo = ORDEN[0];
    try { tipo = localStorage.getItem("pizarra-generador-tipo") || ORDEN[0]; } catch (e) {}
    panel.construir();
    panel.mostrar(GEN[tipo] ? tipo : ORDEN[0]);
    menu.construir();
    boton.crear();
    boton.actualizar();
    boton.vigilar();
    var espera = setInterval(function () {
      var A = api();
      if (!A || !A.onChange) return;
      clearInterval(espera);
      A.onChange(function () { seleccionCambio(); });
    }, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
