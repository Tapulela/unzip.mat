// Generadores de dibujos matematicos (prototipo): recta real con intervalos.
//  - Boton "Generadores" en la barra de herramientas: abre un panel a la derecha.
//  - Se escriben intervalos como (-2, 1/2] o [1, ∞) y se insertan en el centro de
//    la vista como elementos nativos de Excalidraw (agrupados, editables, se
//    sincronizan con las otras ventanas de la sala como cualquier dibujo).
//  - Si se selecciona una recta generada, el panel la carga y los cambios se
//    aplican en vivo sobre ella (manteniendo su posicion). Ctrl+Z deshace.
//  - Los tamanos de texto usan las unidades de Excalidraw: S, M, L, XL.
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
  var LARGOS = { corta: 500, media: 800, larga: 1100 };
  var RAYADOS = { poco: 26, normal: 18, denso: 11 };
  // parentesis y corchetes: media altura, ancho y grosor del trazo
  var SIGNOS = {
    S: { h: 13, w: 7, trazo: 2 },
    M: { h: 18, w: 9, trazo: 2.5 },
    L: { h: 26, w: 12, trazo: 3 },
    XL: { h: 36, w: 16, trazo: 3.5 },
  };
  var COLORES = ["#1971c2", "#e03131", "#2f9e44", "#f08c00", "#9c36b5", "#0c8599"];
  var TINTA = "#1e1e1e";
  var CLAVE_OPCIONES = "pizarra-generador-recta";

  var DEFECTO = {
    filas: [{ texto: "(-2, 1/2]", color: COLORES[0] }, { texto: "[1, ∞)", color: COLORES[1] }],
    operacion: "union", referencia: false, margenIzq: 10, margenDer: 10,
    largo: "media", tamGrilla: "S", tamExtremos: "L", tamSignos: "M", fuente: "normal", rayado: "normal",
    soloEnteros: false, ocultarNumeros: false, mostrarUnion: true, mostrarResultado: true,
  };

  var EJEMPLO = [{ texto: "[-3, 2)", color: COLORES[0] }, { texto: "(0, 5]", color: COLORES[1] }];

  function rnd() { return Math.floor(Math.random() * 2147483647); }
  function nuevoId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function copiar(o) { return JSON.parse(JSON.stringify(o)); }

  // -------------------------------------------------------------- parsing
  // Evalua un extremo: enteros, decimales, fracciones, π, √, potencias.
  // Ej: "1/2", "-3/2", "2π/3", "√2", "1+√2", "0,5" (con ; como separador).
  function evaluar(s) {
    s = s.replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/pi/gi, "π")
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

  function texto(x, y, str, tam, fuente, color, alineacion) {
    var w = medir(str, tam, fuente);
    return base("text", {
      x: alineacion === "center" ? x - w / 2 : x, y: y, width: w, height: tam * fuente.lh,
      strokeColor: color, text: str, originalText: str, fontSize: tam, fontFamily: fuente.id,
      textAlign: alineacion || "left", verticalAlign: "top", containerId: null,
      autoResize: true, lineHeight: fuente.lh,
    });
  }

  function pasoLindo(rango, soloEnteros) {
    var crudo = rango / 10, p = Math.pow(10, Math.floor(Math.log10(crudo))), f = crudo / p;
    var paso = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
    return soloEnteros ? Math.max(1, Math.round(paso)) : paso;
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

  function formatear(v) {
    if (Math.abs(v) < 1e-9) return "0";
    return String(Number(v.toFixed(6))).replace(".", ",").replace("-", "−");
  }

  // Arma todos los elementos de la recta. (ox, oy) = extremo izquierdo de la recta.
  function generarRecta(op, ox, oy, gid) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal;
    var tamG = TAMANOS[op.tamGrilla] || 16, tamE = TAMANOS[op.tamExtremos] || 28;
    var L = LARGOS[op.largo] || 800, sep = RAYADOS[op.rayado] || 18;
    var marca = { pizarra: { tipo: "recta", gid: gid } };
    var els = [];
    function agregar(e) { e.groupIds = [gid]; e.customData = copiar(marca); els.push(e); return e; }

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
    var finitos = [], negInf = false, posInf = false;
    ints.forEach(function (r) {
      if (isFinite(r.izq.valor)) finitos.push(r.izq.valor); else negInf = true;
      if (isFinite(r.der.valor)) finitos.push(r.der.valor); else posInf = true;
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

    // recta con flechas (guarda las opciones para poder editarla despues)
    var eje = agregar(linea(ox, oy, [[0, 0], [L, 0]], {
      type: "arrow", startArrowhead: "arrow", endArrowhead: "arrow",
    }));
    eje.customData.pizarra.eje = true;
    eje.customData.pizarra.opciones = copiar(op);

    // marcas y numeracion de la grilla (la del 0, el doble de larga).
    // La numeracion empieza debajo de los parentesis/corchetes para no taparse.
    var sg = SIGNOS[op.tamSignos] || SIGNOS.M;
    var yGrilla = oy + Math.max(22, sg.h + 6);
    var paso = pasoLindo(vmax - vmin, op.soloEnteros);
    // si los numeros no entran entre marca y marca, se agranda el paso (1, 2, 5, 10...)
    if (!op.ocultarNumeros) {
      for (var intento = 0; intento < 12; intento++) {
        var ancho = 0;
        for (var j = Math.ceil(vmin / paso); j * paso <= vmax + 1e-9; j++)
          ancho = Math.max(ancho, medir(formatear(j * paso), tamG, fuente));
        if (X(paso) - X(0) >= ancho + 12) break;
        var p10 = Math.pow(10, Math.floor(Math.log10(paso) + 1e-9)), man = Math.round(paso / p10);
        paso = (man < 2 ? 2 : man < 5 ? 5 : 10) * p10;
      }
    }
    for (var k = Math.ceil(vmin / paso); k * paso <= vmax + 1e-9; k++) {
      var v = k * paso, xv = X(v), cero = Math.abs(v) < 1e-9, m = cero ? 14 : 7;
      agregar(linea(xv, oy - m, [[0, 0], [0, 2 * m]], {}));
      if (!op.ocultarNumeros || cero) agregar(texto(xv, yGrilla, formatear(v), tamG, fuente, TINTA, "center"));
    }

    // ORDEN DE LOS ELEMENTOS: se crean en el orden en que conviene verlos
    // aparecer (por ejemplo al animar la escena con excalidraw-animate):
    //  1. recta con graduacion (arriba) y el marco vacio de la referencia
    //  2. por cada conjunto (fila): su linea en la referencia; y por cada
    //     intervalo del conjunto: sus extremos escritos debajo de la recta y
    //     luego el intervalo (signo izquierdo, rayado de izquierda a derecha,
    //     signo derecho; o el punto si es [a, a])
    //  3. la operacion y su resultado, de izquierda a derecha

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
      ref.x = ox + L - ref.ancho;
      ref.y = oy - h - 16 - ref.alto;
      agregar(base("rectangle", {
        x: ref.x, y: ref.y, width: ref.ancho, height: ref.alto, strokeWidth: 1, roundness: { type: 3 },
      }));
    }

    // 2.1 linea del conjunto en la referencia: muestra rayada + texto en su color
    function filaReferencia(c, i) {
      var fy = ref.y + ref.relleno + i * ref.altoFila, alto = ref.altoFila - 6;
      agregar(base("rectangle", {
        x: ref.x + ref.relleno, y: fy + alto / 2 - 7, width: ref.muestra, height: 14,
        strokeColor: c.color, backgroundColor: c.color, fillStyle: "hachure", strokeWidth: 1,
      }));
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
      c.ints.forEach(function (r) { extremos(r); intervalo(r); });
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
      function poner(t, color) {
        var u = tramos[tramos.length - 1];
        if (u && u.color === color) u.t += t; // se juntan los seguidos del mismo color
        else tramos.push({ t: t, color: color });
      }
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
    return els;
  }

  // ------------------------------------------------- insertar / reemplazar
  var vinculo = null; // gid de la recta que se esta editando
  var turno = 0;

  function elementosDe(gid, todos) {
    return todos.filter(function (e) {
      return !e.isDeleted && e.customData && e.customData.pizarra && e.customData.pizarra.gid === gid;
    });
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

  function aplicar(op, nueva) {
    var A = api();
    if (!A) return;
    var mio = ++turno;
    var fuente = FUENTES[op.fuente] || FUENTES.normal;
    var tams = [TAMANOS[op.tamGrilla], TAMANOS[op.tamExtremos]];
    // medir con la fuente ya cargada
    Promise.all(tams.map(function (t) {
      return document.fonts.load(t + "px " + fuente.css).catch(function () {});
    })).then(function () {
      if (mio !== turno) return;
      var todos = A.getSceneElementsIncludingDeleted();
      var gid = nueva ? null : vinculo, ox, oy, viejos = [];
      var st = A.getAppState(), z = st.zoom.value;
      var recien = false, vista = {}; // recta nueva / cambios de vista
      if (gid) {
        viejos = elementosDe(gid, todos);
        var eje = viejos.filter(function (e) { return e.customData.pizarra.eje; })[0];
        if (eje) ox = eje.x, oy = eje.y; else gid = null, viejos = [];
      }
      if (!gid) {
        var L = LARGOS[op.largo] || 800;
        gid = nuevoId();
        ox = -st.scrollX + st.width / z / 2 - L / 2;
        oy = -st.scrollY + st.height / z / 2 - 40;
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
      var nuevos = generarRecta(op, ox, oy, gid);
      // una recta nueva no se encima a lo que ya hay: baja hasta un lugar libre
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
        // si quedo fuera de la vista, la vista baja hasta ella
        b = cajaDe(nuevos);
        var arriba = -st.scrollY, abajo = arriba + st.height / z;
        if (b.y0 < arriba || b.y1 > abajo) vista.scrollY = -((b.y0 + b.y1) / 2 - st.height / z / 2);
      }
      var sel = {};
      nuevos.forEach(function (e) { sel[e.id] = true; });
      var grupos = {};
      grupos[gid] = true;
      vinculo = gid;
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
    ".pz-gen{position:fixed;top:64px;right:16px;width:340px;max-height:calc(100vh - 96px);overflow:auto;",
    "z-index:20;background:#fff;color:#1b1b1f;border:1px solid #e0dfe6;border-radius:10px;",
    "box-shadow:0 4px 18px rgba(0,0,0,.12);padding:12px 14px;font:13px/1.4 Assistant,system-ui,sans-serif}",
    ".pz-gen.oscuro{background:#232329;color:#e3e3e8;border-color:#3a3a43}",
    ".pz-gen h3{margin:0;font-size:15px;flex:1}",
    ".pz-gen .cab{display:flex;align-items:center;gap:8px;margin-bottom:4px}",
    ".pz-gen .modo{font-size:11px;padding:1px 7px;border-radius:9px;background:#e7f5ff;color:#1864ab}",
    ".pz-gen.oscuro .modo{background:#1c3a57;color:#a5d8ff}",
    ".pz-gen .cerrar,.pz-gen .quitar{border:0;background:none;color:inherit;cursor:pointer;font-size:15px;opacity:.6;padding:2px 4px}",
    ".pz-gen .cerrar:hover,.pz-gen .quitar:hover{opacity:1}",
    ".pz-gen .fila{display:flex;gap:6px;align-items:center;margin-top:6px}",
    ".pz-gen input[type=text]{flex:1;min-width:0;padding:5px 7px;border:1px solid #c9c8d1;border-radius:6px;",
    "font:14px Cascadia,Consolas,monospace;background:transparent;color:inherit}",
    ".pz-gen .invalida input[type=text]{border-color:#e03131;background:rgba(224,49,49,.07)}",
    ".pz-gen input[type=color]{width:28px;height:28px;padding:0;border:1px solid #c9c8d1;border-radius:6px;background:none;cursor:pointer}",
    ".pz-gen .error{color:#e03131;font-size:12px;margin:2px 0 0 2px}",
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
    ".pz-gen .margenes{display:flex;gap:12px}",
    ".pz-gen .margenes input{width:48px;padding:3px 5px;border:1px solid #c9c8d1;border-radius:6px;",
    "background:transparent;color:inherit;font:inherit}",
    ".pz-gen label.chk{display:flex;gap:6px;align-items:center;grid-column:1/3;cursor:pointer}",
    ".pz-gen .ayuda{font-size:12px;opacity:.7;margin-top:10px}",
  ].join("");

  var panel = {
    el: null, abierto: false, op: null, temporizador: null,

    construir: function () {
      var st = document.createElement("style");
      st.textContent = ESTILO;
      document.head.appendChild(st);
      var el = document.createElement("div");
      el.className = "pz-gen";
      el.style.display = "none";
      el.innerHTML =
        '<div class="cab"><h3>Recta real</h3><span class="modo"></span>' +
        '<button class="cerrar" title="Cerrar">✕</button></div>' +
        '<div class="opc opc-op"></div>' +
        '<div class="filas"></div>' +
        '<div class="botones"><button class="b agregar">+ Intervalo</button>' +
        '<button class="b infinito" title="Escribe ∞ donde está el cursor">∞</button>' +
        '<button class="b union" title="Escribe ∪ donde está el cursor">∪</button></div>' +
        '<div class="opc"></div>' +
        '<div class="botones"><button class="b principal insertar">Insertar en el centro</button>' +
        '<button class="b copia">Insertar copia</button>' +
        '<button class="b restablecer" title="Vuelve las opciones a los valores ' +
        'predeterminados (los intervalos escritos se mantienen)">Restablecer</button>' +
        '<button class="b ejemplo" title="Inserta una recta nueva de ejemplo con dos intervalos">' +
        'Ejemplo</button></div>' +
        '<div class="ayuda">Ejemplos: (1/2, 3], [−2, ∞), (π/2, √2+1). ' +
        'Para decimales con coma separá con punto y coma: [0,5; 2). ' +
        'Varios intervalos en una fila: (1,2) ∪ [3,4]. ' +
        'Seleccioná una recta ya insertada para editarla.</div>';
      document.body.appendChild(el);
      this.el = el;
      var self = this;
      el.querySelector(".cerrar").onclick = function () { self.alternar(false); };
      el.querySelector(".agregar").onclick = function () {
        self.op.filas.push({ texto: "", color: COLORES[self.op.filas.length % COLORES.length] });
        self.pintarFilas(true);
        self.cambio();
      };
      // los botones de simbolos no roban el foco del campo de texto
      [[".infinito", "∞"], [".union", " ∪ "]].forEach(function (b) {
        var boton = el.querySelector(b[0]);
        boton.onmousedown = function (e) { e.preventDefault(); };
        boton.onclick = function () { self.escribir(b[1]); };
      });
      el.querySelector(".insertar").onclick = function () { aplicar(self.op, !vinculo); };
      el.querySelector(".copia").onclick = function () { aplicar(self.op, true); };
      // recta nueva de ejemplo: carga dos intervalos que se superponen (para
      // que se vea el rayado cruzado) y la inserta en el centro. No toca la
      // recta que este seleccionada; el aspecto elegido se mantiene.
      el.querySelector(".ejemplo").onclick = function () {
        clearTimeout(self.temporizador);
        self.op.filas = copiar(EJEMPLO);
        self.pintarFilas();
        try { localStorage.setItem(CLAVE_OPCIONES, JSON.stringify(self.op)); } catch (e) {}
        aplicar(self.op, true);
      };
      // opciones a los valores predeterminados; los intervalos escritos y la
      // operacion entre ellos se mantienen (son el contenido, no el aspecto)
      el.querySelector(".restablecer").onclick = function () {
        var d = copiar(DEFECTO);
        d.filas = self.op.filas;
        d.operacion = self.op.operacion;
        self.op = d;
        self.pintarOpciones();
        self.cambio();
      };
      // que Excalidraw no reciba las teclas ni la rueda del panel
      ["keydown", "keyup", "wheel", "paste", "copy", "cut"].forEach(function (ev) {
        el.addEventListener(ev, function (e) { e.stopPropagation(); });
      });
    },

    cargar: function (op) {
      var d = copiar(DEFECTO);
      for (var k in op) d[k] = op[k];
      this.op = d;
      this.pintarFilas();
      this.pintarOpciones();
      this.modo();
    },

    escribir: function (s) {
      var c = document.activeElement;
      if (!c || !this.el.contains(c) || c.type !== "text") {
        c = this.el.querySelector(".filas input[type=text]");
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
      var self = this, cont = this.el.querySelector(".filas");
      cont.innerHTML = "";
      this.op.filas.forEach(function (f, i) {
        var caja = document.createElement("div");
        caja.innerHTML = '<div class="fila"><input type="text" spellcheck="false" ' +
          'placeholder="Ej: (1/2, 3]"><input type="color"><button class="quitar" title="Quitar">✕</button></div>' +
          '<div class="error"></div>';
        var t = caja.querySelector("input[type=text]"), c = caja.querySelector("input[type=color]");
        t.value = f.texto; c.value = f.color;
        function validar() {
          var errores = leerIntervalos(t.value).filter(function (r) { return r.error; });
          caja.classList.toggle("invalida", errores.length > 0);
          caja.querySelector(".error").textContent = errores.length
            ? errores.map(function (r) { return r.original + ": " + r.error; }).join(" · ") : "";
        }
        validar();
        t.oninput = function () { f.texto = t.value; validar(); self.cambio(); };
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
      var self = this, op = this.op, cont = this.el.querySelector(".opc:not(.opc-op)");
      var arriba = this.el.querySelector(".opc-op");
      cont.innerHTML = "";
      arriba.innerHTML = "";
      function segmentado(etiqueta, clave, opciones, destino) {
        var l = document.createElement("span");
        l.textContent = etiqueta;
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
          };
          s.appendChild(b);
        });
        (destino || cont).appendChild(l);
        (destino || cont).appendChild(s);
      }
      function casilla(etiqueta, clave) {
        var l = document.createElement("label");
        l.className = "chk";
        l.innerHTML = '<input type="checkbox"> ';
        l.appendChild(document.createTextNode(etiqueta));
        var c = l.querySelector("input");
        c.checked = !!op[clave];
        c.onchange = function () { op[clave] = c.checked; self.cambio(); };
        cont.appendChild(l);
      }
      var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
      // margenes izquierdo y derecho, en % del largo de la recta
      function margenes() {
        var l = document.createElement("span");
        l.textContent = "Márgenes";
        var d = document.createElement("div");
        d.className = "margenes";
        [["margenIzq", "Izq."], ["margenDer", "Der."]].forEach(function (m) {
          var lab = document.createElement("label");
          lab.innerHTML = m[1] + ' <input type="number" min="0" max="40" step="1"> %';
          var inp = lab.querySelector("input");
          inp.value = op[m[0]];
          inp.title = "Espacio antes del primer extremo / después del último (0 a 40%)";
          inp.oninput = function () {
            if (inp.value === "" || !isFinite(Number(inp.value))) return;
            op[m[0]] = Math.max(0, Math.min(40, Number(inp.value)));
            self.cambio();
          };
          inp.onchange = function () { inp.value = op[m[0]]; };
          d.appendChild(lab);
        });
        cont.appendChild(l);
        cont.appendChild(d);
      }
      // operacion entre los conjuntos (cada fila es un conjunto), al inicio del panel
      segmentado("Operación", "operacion", [["union", "Unión ∪"], ["interseccion", "Intersección ∩"]], arriba);
      segmentado("Largo", "largo", [["corta", "Corta"], ["media", "Media"], ["larga", "Larga"]]);
      margenes();
      segmentado("Números grilla", "tamGrilla", tam);
      segmentado("Números extremos", "tamExtremos", tam);
      segmentado("( ) y [ ]", "tamSignos", tam);
      segmentado("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
      segmentado("Rayado", "rayado", [["poco", "Ralo"], ["normal", "Normal"], ["denso", "Denso"]]);
      casilla("Grilla solo en enteros", "soloEnteros");
      casilla("Ocultar numeración (mantener el 0)", "ocultarNumeros");
      casilla("Escribir la operación debajo", "mostrarUnion");
      casilla("Escribir el resultado", "mostrarResultado");
      casilla("Incluir referencia", "referencia");
    },

    // cada cambio: se guarda y, si hay una recta vinculada, se redibuja en vivo
    cambio: function () {
      try { localStorage.setItem(CLAVE_OPCIONES, JSON.stringify(this.op)); } catch (e) {}
      var self = this;
      clearTimeout(this.temporizador);
      if (vinculo) this.temporizador = setTimeout(function () { aplicar(self.op, false); }, 250);
    },

    modo: function () {
      if (!this.el) return;
      this.el.querySelector(".modo").textContent = vinculo ? "editando la seleccionada" : "nueva";
      this.el.querySelector(".insertar").textContent = vinculo ? "Redibujar" : "Insertar en el centro";
      this.el.querySelector(".copia").style.display = vinculo ? "" : "none";
    },

    alternar: function (abrir) {
      this.abierto = abrir === undefined ? !this.abierto : abrir;
      this.el.style.display = this.abierto ? "" : "none";
      boton.actualizar();
      if (this.abierto) seleccionCambio();
    },
  };

  // Al seleccionar una recta generada, el panel la carga para editarla
  function seleccionCambio() {
    var A = api();
    if (!A || !panel.abierto) return;
    var st = A.getAppState();
    panel.el.classList.toggle("oscuro", st.theme === "dark");
    var ids = Object.keys(st.selectedElementIds || {});
    var gid = null;
    if (ids.length) {
      var porId = {};
      A.getSceneElements().forEach(function (e) { porId[e.id] = e; });
      for (var i = 0; i < ids.length && !gid; i++) {
        var e = porId[ids[i]];
        if (e && e.customData && e.customData.pizarra && e.customData.pizarra.tipo === "recta") gid = e.customData.pizarra.gid;
      }
    }
    if (gid === vinculo) return;
    vinculo = gid;
    if (gid) {
      var eje = elementosDe(gid, A.getSceneElements()).filter(function (e) { return e.customData.pizarra.eje; })[0];
      if (eje && eje.customData.pizarra.opciones) panel.cargar(eje.customData.pizarra.opciones);
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
      b.title = "Generadores: recta real con intervalos";
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
    panel.construir();
    var guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(CLAVE_OPCIONES) || "null"); } catch (e) {}
    panel.cargar(guardado || {});
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
