// Generadores de dibujos matematicos (prototipo):
//  - Recta real con intervalos.
//  - Graficos de funciones de variable real, definidas como funciones anonimas
//    de JavaScript (x => x**2 - 3).
// Boton "Generadores" en la barra de herramientas: abre un panel a la derecha,
// con un selector arriba para elegir el generador.
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

  // ====================================================== GENERADORES
  // Cada generador define su contenido (filas), opciones, panel y como dibujar.
  // contenido: claves que "Restablecer" no toca (lo que se grafica, no el aspecto).
  var GEN = {
    recta: {
      titulo: "Recta real",
      clave: "pizarra-generador-recta",
      defecto: {
        filas: [{ texto: "(-2, 1/2]", color: COLORES[0] }, { texto: "[1, ∞)", color: COLORES[1] }],
        operacion: "union", estilo: "rayado", referencia: false, margenIzq: 10, margenDer: 10,
        largo: "media", tamGrilla: "S", tamExtremos: "L", tamSignos: "M", fuente: "normal", rayado: "normal",
        soloEnteros: false, ocultarNumeros: false, mostrarUnion: true, mostrarResultado: true,
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
      generar: generarRecta,
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
        referencia: true, posReferencia: "derecha", marcarExtremos: true,
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
      generar: generarFunciones,
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
      },
    },
  };

  // ------------------------------------------------- insertar / reemplazar
  var vinculo = null;      // gid del dibujo que se esta editando
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
    ".pz-gen .cab{display:flex;align-items:center;gap:8px;margin-bottom:6px}",
    ".pz-gen .cab .tipos{flex:1}",
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
    ".pz-gen .ayuda{font-size:12px;opacity:.7;margin-top:10px}",
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
        '<div class="cab"><div class="tipos"></div><span class="modo"></span>' +
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

      // selector de generador
      var tipos = el.querySelector(".tipos"), s = document.createElement("div");
      s.className = "seg";
      Object.keys(GEN).forEach(function (t) {
        var b = document.createElement("button");
        b.textContent = GEN[t].titulo;
        b.setAttribute("data-tipo", t);
        b.onclick = function () {
          if (t === self.tipo) return;
          clearTimeout(self.temporizador);
          vinculo = null; // el dibujo seleccionado es de otro tipo
          self.mostrar(t);
        };
        s.appendChild(b);
      });
      tipos.appendChild(s);

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
      [].forEach.call(this.el.querySelectorAll(".tipos button"), function (b) {
        b.className = b.getAttribute("data-tipo") === self.tipo ? "activo" : "";
      });
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
          var errores = gen.erroresFila(t.value);
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
        chk: function (txt, clave) {
          var l = document.createElement("label");
          l.className = "chk";
          l.innerHTML = '<input type="checkbox"> ';
          l.appendChild(document.createTextNode(txt));
          var c = l.querySelector("input");
          c.checked = !!op[clave];
          c.onchange = function () { op[clave] = c.checked; self.cambio(); };
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
      var dibujo = this.tipo === "recta" ? "recta" : "gráfico";
      this.el.querySelector(".modo").textContent = vinculo ? "editando " + (this.tipo === "recta" ? "la" : "el") +
        " seleccionad" + (this.tipo === "recta" ? "a" : "o") : "nuevo";
      this.el.querySelector(".insertar").textContent = vinculo ? "Redibujar" : "Insertar en el centro";
      this.el.querySelector(".copia").style.display = vinculo ? "" : "none";
      this.el.querySelector(".copia").title = "Inserta otr" + (dibujo === "recta" ? "a recta" : "o gráfico") + " igual";
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

  // ------------------------------------------------- boton en la barra superior
  var boton = {
    el: null,
    crear: function () {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ToolIcon ToolIcon_type_toggle ToolIcon_size_medium pz-boton-generadores";
      b.setAttribute("data-testid", "toolbar-generadores");
      b.title = "Generadores: recta real con intervalos y gráficos de funciones";
      b.setAttribute("aria-label", b.title);
      b.innerHTML = '<div class="ToolIcon__icon">' + ICONO + "</div>";
      b.addEventListener("click", function () { panel.alternar(); });
      this.el = b;
    },
    actualizar: function () {
      this.el.classList.toggle("ToolIcon--checked", panel.abierto);
      this.el.setAttribute("aria-pressed", panel.abierto ? "true" : "false");
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
    var tipo = "recta";
    try { tipo = localStorage.getItem("pizarra-generador-tipo") || "recta"; } catch (e) {}
    panel.construir();
    panel.mostrar(GEN[tipo] ? tipo : "recta");
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
