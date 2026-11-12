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
      dibujarCuerpoTabla(t, op, ox, oy, agregar);
      y = oy + t.H + 14;
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
          var tmp = [];
          dibujarInterruptores(arbol, imprimirLogica(arbol, false), e.color, op.diseno, tam, fuente, function (el) { tmp.push(el); });
          var b = cajaDe(tmp);
          tmp.forEach(function (el) { el.x += ox - b.x0; el.y += y - b.y0; agregar(el); });
          y += b.y1 - b.y0 + 36;
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
        // un casillero en blanco con la variable (y ¬ si esta negada)
        var bx = x + 16, bw = nd.w - 32;
        agregar(linea(x, cy, [[0, 0], [bx - x, 0]], cable));
        agregar(base("rectangle", { x: bx, y: cy - d.caja / 2, width: bw, height: d.caja, strokeWidth: 2 }));
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
  // abierto = variable negada; solo se escribe la letra) o "casilla" (casilleros
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
    var colocar = function (dibujar, x, yTop) {
      var tmp = [];
      dibujar(function (e) { tmp.push(e); });
      var b = cajaDe(tmp);
      tmp.forEach(function (e) { e.x += x - b.x0; e.y += yTop - b.y0; agregar(e); });
      return { w: b.x1 - b.x0, h: b.y1 - b.y0 };
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
        var tb = colocar(function (ag) { dibujarTablaBoole(vars, valores, nombre, color, tam, fuente, ag); }, x, y);
        x += tb.w + 60;
        alto = Math.max(alto, tb.h);
      }
      if (conMapa) {
        var km = colocar(function (ag) { dibujarKarnaugh(vars, valores, cob, fnc, fmt, op.indices, tam, fuente, ag); }, x, y);
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
        cuales.forEach(function (arbol) {
          var c = colocar(function (ag) {
            dibujarCircuito(arbol, vars, nombre + " = " + imprimirBoole(arbol, fmt), color, tam, fuente, ag, fmt.neg);
          }, ox, y);
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
        var tmp = [];
        dibujar(f, tam, fuente, function (e) { tmp.push(e); });
        var b = cajaDe(tmp);
        tmp.forEach(function (e) { e.x += x - b.x0; e.y += y - b.y0; agregar(e); });
        x += b.x1 - b.x0 + 90;
        alto = Math.max(alto, b.y1 - b.y0);
      });
      y += alto + 60;
    });
  }

  function erroresRelacion(t, op, i) {
    var f = analizarRelaciones(op).filas[i];
    return f ? f.errores.concat(f.avisos || []) : [];
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

    tabla: {
      titulo: "Tabla de verdad",
      dibujo: "tabla", femenino: true,
      clave: "pizarra-generador-tabla",
      defecto: {
        filas: [{ texto: "(p ∨ q) ∧ ¬p", color: COLORES[0] }],
        nVars: 2, nombres: "p, q, r, s, t", valores: "VF", primero: "V",
        tamTexto: "M", fuente: "normal", intermedias: true, lineasFilas: true,
        colorResultado: true, clasificar: false, ocultar: false,
        mostrarTabla: true, simplificar: false, forma: "fnd",
        interruptores: false, diseno: "abierto", circuitoDe: "original",
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
        ui.chk("Escribir la expresión simplificada", "simplificar", true);
        ui.chk("Circuito de interruptores", "interruptores", true);
        if (op.interruptores) {
          ui.seg("Diseño", "diseno", [["abierto", "Abierto / cerrado"], ["casilla", "Casilleros"]]);
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
        negacion: "prima", producto: "junto", tamTexto: "M", fuente: "normal",
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
        cartesiano: true, sagital: true, grafo: true,
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
      },
    },
  };

  // orden de las pestanas del panel (la primera es la que se abre por defecto)
  var ORDEN = ["tabla", "boole", "conjuntos", "relaciones", "recta", "funcion"];

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
    // pestanas: botones sueltos que pasan a otra linea si no entran
    ".pz-gen .cab .tipos .seg{border:0;display:flex;flex-wrap:wrap;gap:4px;overflow:visible}",
    ".pz-gen .cab .tipos .seg button{white-space:nowrap;padding:3px 8px;font-size:12px;" +
      "border:1px solid #c9c8d1;border-radius:6px}",
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
      ORDEN.forEach(function (t) {
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
      var gen = this.gen(), fem = !!gen.femenino, dibujo = gen.dibujo || "gráfico";
      this.el.querySelector(".modo").textContent = vinculo ? "editando " + (fem ? "la" : "el") +
        " seleccionad" + (fem ? "a" : "o") : "nuevo";
      this.el.querySelector(".insertar").textContent = vinculo ? "Redibujar" : "Insertar en el centro";
      this.el.querySelector(".copia").style.display = vinculo ? "" : "none";
      this.el.querySelector(".copia").title = "Inserta otr" + (fem ? "a " : "o ") + dibujo + " igual";
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
      b.title = "Generadores: tablas de verdad, álgebra de Boole, conjuntos, relaciones, recta real y gráficos de funciones";
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
    var tipo = ORDEN[0];
    try { tipo = localStorage.getItem("pizarra-generador-tipo") || ORDEN[0]; } catch (e) {}
    panel.construir();
    panel.mostrar(GEN[tipo] ? tipo : ORDEN[0]);
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
