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

  // ------------------------------------------------------- raices dibujadas
  // REGLA GENERAL DEL SISTEMA: la raiz cuadrada nunca se escribe con el
  // caracter √. Todo texto generado que lo tenga se parte en textos y un
  // trazo: el gancho de la raiz y la linea por encima del radicando.
  // Radicando: un numero (√16), una letra (√Δ) o algo entre parentesis
  // (√(a² + b²), que se dibuja sin los parentesis).
  var RE_RAIZ = /√(?:\[([^\]]+)\])?(\((?:[^()]|\([^()]*\))*\)|[0-9]+(?:[.,][0-9]+)?|[A-Za-zΔπρ](?![A-Za-z]))/;
  function fuenteDeId(id) {
    for (var k in FUENTES) if (FUENTES[k].id === id) return FUENTES[k];
    return FUENTES.normal;
  }
  // Ademas de las raices, apila los indices: un subindice seguido de un
  // superindice (o al reves), como en V₃⁴ o x₁², se dibuja con el superindice
  // justo encima del subindice, y no uno al lado del otro.
  function expandirRaices(e) {
    var out = [];
    expandirSoloRaices(e).forEach(function (p) { expandirIndices(p).forEach(function (q) { out.push(q); }); });
    return out;
  }

  // ------------------------------------------------------ indices apilados
  var SUBS = "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼᵣᵤᵥ", SUBS_N = "0123456789+−=()aeoxhklmnpstijruv";
  var SUPS = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱᵃᵇᶜᵈᵉᶠᵍʰʲᵏˡᵐᵒᵖʳˢᵗᵘᵛʷˣʸᶻ", SUPS_N = "0123456789+−=()niabcdefghjklmoprstuvwxyz";
  var RE_INDICES = new RegExp("([" + SUBS + "]+)([" + SUPS + "]+)|([" + SUPS + "]+)([" + SUBS + "]+)");
  function normalDe(t, desde, hacia) {
    return t.split("").map(function (c) { var i = desde.indexOf(c); return i < 0 ? c : hacia.charAt(i); }).join("");
  }
  function expandirIndices(e) {
    if (e.type !== "text" || /\n/.test(e.text) || !RE_INDICES.test(e.text)) return [e];
    var fuente = fuenteDeId(e.fontFamily), tam = e.fontSize, lh = tam * fuente.lh;
    var tamI = Math.round(tam * 0.62), lhI = tamI * fuente.lh;
    var out = [], x = e.x, resto = e.text, m;
    function escribir(t) {
      if (!t) return;
      var lead = t.length - t.replace(/^\s+/, "").length, limpio = t.trim();
      if (limpio) out.push(texto(x + medir(t.slice(0, lead), tam, fuente), e.y, limpio, tam, fuente, e.strokeColor, "left"));
      x += medir(t, tam, fuente);
    }
    while ((m = RE_INDICES.exec(resto))) {
      escribir(resto.slice(0, m.index));
      var sub = normalDe(m[1] || m[4], SUBS, SUBS_N), sup = normalDe(m[2] || m[3], SUPS, SUPS_N);
      var wSub = medir(sub, tamI, fuente), wSup = medir(sup, tamI, fuente), dx = tam * 0.04;
      // el superindice arriba (a la altura de la mayuscula) y el subindice abajo,
      // un poco por debajo de la linea de base, los dos alineados a la izquierda
      out.push(texto(x + dx, e.y + lh * 0.5 - lhI * 0.92, sup, tamI, fuente, e.strokeColor, "left"));
      out.push(texto(x + dx, e.y + lh * 0.5 + tam * 0.02, sub, tamI, fuente, e.strokeColor, "left"));
      x += dx + Math.max(wSub, wSup) + tam * 0.08;
      resto = resto.slice(m.index + m[0].length);
    }
    escribir(resto);
    return out.length ? out : [e];
  }

  function expandirSoloRaices(e) {
    if (e.type !== "text" || e.text.indexOf("√") < 0 || /\n/.test(e.text)) return [e];
    var fuente = fuenteDeId(e.fontFamily), tam = e.fontSize, lh = tam * fuente.lh;
    var out = [], x = e.x, resto = e.text, mid = e.y + lh / 2, m;
    function escribir(t) {
      if (!t) return;
      var lead = t.length - t.replace(/^\s+/, "").length, limpio = t.trim();
      if (limpio) out.push(texto(x + medir(t.slice(0, lead), tam, fuente), e.y, limpio, tam, fuente, e.strokeColor, "left"));
      x += medir(t, tam, fuente);
    }
    while ((m = RE_RAIZ.exec(resto))) {
      escribir(resto.slice(0, m.index));
      var rad = m[2].replace(/^\((.*)\)$/, "$1"), w = medir(rad, tam, fuente), g = tam * 0.6;
      var top = e.y - 1, bot = e.y + lh - 3;
      if (m[1]) {
        // indice (√[3]): mas chico, arriba del gancho; si es ancho, corre la raiz
        var tamI = Math.round(tam * 0.55), wI = medir(m[1], tamI, fuente), corre = Math.max(0, wI - g * 0.45);
        x += corre;
        out.push(texto(x + g * 0.5 - wI, mid - tamI * fuente.lh - 1, m[1], tamI, fuente, e.strokeColor, "left"));
      }
      out.push(trazo([[x + tam * 0.05, mid + 2], [x + g * 0.3, mid - 2], [x + g * 0.6, bot], [x + g, top],
        [x + g + w + tam * 0.1, top]], { strokeColor: e.strokeColor, strokeWidth: Math.max(1, tam / 14) }));
      out.push(texto(x + g + tam * 0.05, e.y, rad, tam, fuente, e.strokeColor, "left"));
      x += w + tam * 0.8;
      resto = resto.slice(m.index + m[0].length);
    }
    escribir(resto);
    return out.length ? out : [e];
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
    // sin la numeracion, los extremos van en el renglon de la grilla (pegados a
    // la recta) y el 0 se escribe solo si no es un extremo (ya lo escribe su color)
    var ceroEsExtremo = ints.some(function (r) { return r.izq.valor === 0 || r.der.valor === 0; });
    for (var k = Math.ceil(vmin / paso); k * paso <= vmax + 1e-9; k++) {
      var v = k * paso, xv = X(v), cero = Math.abs(v) < 1e-9, m = cero ? 14 : 7;
      agregar(linea(xv, oy - m, [[0, 0], [0, 2 * m]], {}));
      if (!op.ocultarNumeros || (cero && !ceroEsExtremo)) agregar(texto(xv, yGrilla, formatear(v), tamG, fuente, TINTA, "center"));
    }

    var yExtremos = op.ocultarNumeros ? yGrilla - 2 : yGrilla + tamG * fuente.lh + 8;
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
  var ANCHOS = { mini: 320, chico: 500, medio: 800, grande: 1100 };
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
      // un número negativo pegado al eje x se pisaría con los números de ese eje
      var lhY = tamN * fuente.lh, pisaEjeX = y > yEje && y - lhY / 2 < yEje + 8 + lhY && marcasX.length;
      if (!op.ocultarNumeros && !pisaEjeX) agregar(texto(xEje - 8, y - lhY / 2, formatear(v), tamN, fuente, TINTA, "right"));
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

  // Circuito con un solo tipo de compuerta universal (U = "nand" o "nor").
  // Con NAND: X ∧ Y = ¬NAND(X, Y), X ∨ Y = NAND(¬X, ¬Y), ¬X = NAND(X, X)
  // (entradas unidas: una compuerta con un solo hijo). Con NOR, lo dual.
  // Cada nodo se arma en positivo (pos) o negado (neg), y las dobles negaciones
  // NAND(NAND(X, X), NAND(X, X))... se cancelan: asi una suma de productos con
  // NAND (o un producto de sumas con NOR) queda en dos niveles.
  function aUniversal(arbol, U) {
    var JUNTA = U === "nand" ? "and" : "or"; // la que es ¬U
    function inv(g) { return g.tipo === U && g.hijos.length === 1 ? g.hijos[0] : { tipo: U, hijos: [g] }; }
    function pos(n) {
      switch (n.tipo) {
        case "entrada": return n.neg ? inv({ tipo: "entrada", v: n.v, neg: false }) : n;
        case "const": return n;
        case "not": return neg(n.hijos[0]);
        case "xor": case "xnor":
          var a = n.hijos[0], b = n.hijos[1], na = { tipo: "not", hijos: [a] }, nb = { tipo: "not", hijos: [b] };
          return pos({ tipo: "or", hijos: n.tipo === "xor"
            ? [{ tipo: "and", hijos: [a, nb] }, { tipo: "and", hijos: [na, b] }]
            : [{ tipo: "and", hijos: [a, b] }, { tipo: "and", hijos: [na, nb] }] });
      }
      // and/or: la que coincide con U es ¬U(hijos); la otra, U(hijos negados)
      return n.tipo === JUNTA ? inv({ tipo: U, hijos: n.hijos.map(pos) }) : { tipo: U, hijos: n.hijos.map(neg) };
    }
    function neg(n) {
      if (n.tipo === "const") return { tipo: "const", nombre: n.nombre === "1" ? "0" : "1" };
      if (n.tipo === "not") return pos(n.hijos[0]);
      if (n.tipo === JUNTA) return { tipo: U, hijos: n.hijos.map(pos) };
      return inv(pos(n));
    }
    return pos(aCircuito(arbol));
  }
  // la expresion del circuito universal, como arbol de Boole: NAND(X, Y) = (XY)',
  // NOR(X, Y) = (X + Y)'; con las entradas unidas, (XX)' o (X + X)'
  function universalABoole(g) {
    if (g.tipo === "entrada") return { t: "var", n: g.v };
    if (g.tipo === "const") return { t: "const", v: g.nombre === "1" };
    var hs = g.hijos.map(universalABoole);
    if (hs.length === 1) hs.push(hs[0]);
    var op = g.tipo === "nand" ? "y" : "o";
    return { t: "no", a: hs.reduce(function (a, b) { return { t: "bin", op: op, a: a, b: b }; }) };
  }

  function curvaCuadratica(p0, c, p1, pasos) {
    var pts = [];
    for (var i = 0; i <= pasos; i++) {
      var t = i / pasos, u = 1 - t;
      pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
    }
    return pts;
  }

  // Dibuja una compuerta con el borde izquierdo en x, el centro vertical en yc
  // y alto h (el NOT tiene alto fijo). Devuelve { xSalida, pin(y) -> x donde
  // termina el cable de entrada }. Si es muy alta, el frente no crece con el
  // alto en la misma proporcion, para que no quede demasiado ancha.
  function compuerta(tipo, x, yc, h, agregar) {
    var y0 = yc - h / 2, trazoG = { strokeWidth: 2 }, r = 5;
    var burbuja = function (xb) {
      agregar(base("ellipse", { x: xb, y: yc - r, width: 2 * r, height: 2 * r, strokeWidth: 2 }));
      return xb + 2 * r;
    };
    if (tipo === "not") {
      var L = 32, hn = 28;
      agregar(trazo([[x, yc - hn / 2], [x + L, yc], [x, yc + hn / 2], [x, yc - hn / 2]], trazoG));
      return { xSalida: burbuja(x + L), pin: function () { return x; } };
    }
    if (tipo === "and" || tipo === "nand") {
      var w0 = 26, rx = Math.min(h / 2, 22 + h * 0.15), pts = [[x, y0], [x + w0, y0]];
      for (var i = 1; i < 16; i++) {
        var a = -Math.PI / 2 + Math.PI * i / 16;
        pts.push([x + w0 + rx * Math.cos(a), yc + h / 2 * Math.sin(a)]);
      }
      pts.push([x + w0, y0 + h], [x, y0 + h], [x, y0]);
      agregar(trazo(pts, trazoG));
      return { xSalida: tipo === "nand" ? burbuja(x + w0 + rx) : x + w0 + rx, pin: function () { return x; } };
    }
    // OR, NOR, XOR y XNOR: dorso curvo hacia adentro y frente en punta
    var ex = tipo === "or" || tipo === "nor" ? 0 : 9, bx = x + ex;
    var Lo = Math.min(34 + h * 0.4, 50 + h * 0.2), d = Math.min(h * 0.16, 4 + h * 0.06);
    var forma = curvaCuadratica([bx, y0], [bx + Lo * 0.55, y0], [bx + Lo, yc], 10)
      .concat(curvaCuadratica([bx + Lo, yc], [bx + Lo * 0.55, y0 + h], [bx, y0 + h], 10).slice(1))
      .concat(curvaCuadratica([bx, y0 + h], [bx + 2 * d, yc], [bx, y0], 10).slice(1));
    agregar(trazo(forma, trazoG));
    if (ex) agregar(trazo(curvaCuadratica([x, y0 + h], [x + 2 * d, yc], [x, y0], 10), trazoG));
    var salida = bx + Lo;
    if (tipo === "xnor" || tipo === "nor") salida = burbuja(salida);
    return {
      xSalida: salida,
      // x del dorso a la altura y (la curva es lineal en y)
      pin: function (y) { var t = (y0 + h - y) / h; return x + 4 * d * t * (1 - t); },
    };
  }

  // Circuito de una expresion, en dos partes:
  //  1. Las variables: cada una aparece una sola vez, en orden, con su nombre
  //     arriba y una linea vertical que baja hasta su ultimo uso. De ella salen
  //     todas las bifurcaciones que hagan falta (con un punto en la union).
  //  2. Despues de la ultima variable, las compuertas, por niveles (columnas).
  //     Una variable negada es una compuerta NOT en el camino del cable.
  //  - Para que no haya pliegues, cada compuerta es tan alta como haga falta
  //    para que todas sus entradas lleguen en linea recta: cada cable entra a
  //    la altura de la salida de lo que lo alimenta. Las entradas quedan
  //    equidistantes, salvo que eso agrande demasiado el circuito.
  //  - Si un cable cruza a otro sin estar unido, el horizontal hace un salto.
  // ORDEN: nombres y lineas de las variables; despues las compuertas de
  // izquierda a derecha, cada una con los cables que le llegan; la salida al final.
  // negar(v): no se usa (las negaciones se dibujan con compuertas NOT)
  // universal: "nand" o "nor" para dibujarlo solo con ese tipo de compuerta
  // altura: de 0 a 1, cuanto crecen las compuertas para que no haya pliegues
  //   (1: todas las entradas en linea recta; 0: compuertas chicas y los cables
  //   se doblan en escalera antes de entrar)
  function dibujarCircuito(arbol, vars, etiqueta, color, tam, fuente, agregar, negar, universal, altura) {
    if (altura == null) altura = 1;
    var lh = tam * fuente.lh;
    var SLOT = Math.max(26, tam * 1.3), PASO_VAR = Math.max(40, tam * 2), SEP = 40, GAP = 40;
    var PIN = 14, PASO_PLIEGUE = 9; // separacion de entradas juntas y de los dobleces
    var R_SALTO = 6, R_PUNTO = 3.5, Y0 = 24, MARGEN = 6, cable = { strokeWidth: 1.5 };

    // copia del arbol (sin nodos compartidos), con cada variable negada como
    // una compuerta NOT sobre la variable
    var raiz = (function norm(nd) {
      if (nd.tipo === "entrada") {
        var e = { tipo: "entrada", v: nd.v };
        return nd.neg ? { tipo: "not", hijos: [e] } : e;
      }
      if (nd.tipo === "const") return { tipo: "const", nombre: nd.nombre };
      return { tipo: nd.tipo, hijos: nd.hijos.map(norm) };
    })(universal ? aUniversal(arbol, universal) : aCircuito(arbol));
    function esHoja(nd) { return nd.tipo === "entrada" || nd.tipo === "const"; }
    // NAND/NOR de una sola entrada: las dos entradas unidas (hace de NOT)
    function unida(nd) { return nd.hijos.length === 1 && (nd.tipo === "nand" || nd.tipo === "nor"); }

    // medidas de cada subarbol, relativas a la altura de su salida:
    // arriba/abajo = cuanto ocupa por encima y por debajo; rel = donde van los hijos
    (function medir(nd) {
      if (esHoja(nd)) { nd.nivel = 0; nd.arriba = nd.abajo = SLOT / 2; return; }
      var hs = nd.hijos, k = hs.length;
      hs.forEach(medir);
      nd.nivel = 1 + Math.max.apply(null, hs.map(function (h) { return h.nivel; }));
      // equidistantes: la separacion es la mayor que necesita un par de vecinos
      var d = 0, junto = [0];
      for (var i = 0; i + 1 < k; i++) {
        var s = hs[i].abajo + hs[i + 1].arriba;
        d = Math.max(d, s);
        junto.push(junto[i] + s);
      }
      var largo = junto[k - 1];
      nd.rel = (k > 1 && (k - 1) * d > largo * 1.5)
        ? junto.map(function (p) { return p - largo / 2; }) // pegados, si equidistantes agranda mucho
        : hs.map(function (h, j) { return (j - (k - 1) / 2) * d; });
      // donde entra cada cable a la compuerta: con altura 1, a la altura de su
      // hijo (sin pliegues); con altura 0, entradas juntas cada PIN y el cable
      // se dobla; en el medio, interpolado
      nd.pin = nd.rel.map(function (p, j) { return altura * p + (1 - altura) * (j - (k - 1) / 2) * PIN; });
      var span = nd.pin[k - 1] - nd.pin[0];
      nd.h = nd.tipo === "not" ? 28 : k === 1 ? 36 : Math.max(36, span + 18);
      // cables que se doblan hacia abajo y hacia arriba (para el ancho del hueco)
      nd.bajan = nd.suben = 0;
      nd.pin.forEach(function (p, j) {
        if (p - nd.rel[j] > 0.5) nd.bajan++;
        else if (nd.rel[j] - p > 0.5) nd.suben++;
      });
      nd.arriba = nd.h / 2 + MARGEN;
      nd.abajo = nd.h / 2 + MARGEN;
      hs.forEach(function (h, j) {
        nd.arriba = Math.max(nd.arriba, h.arriba - nd.rel[j]);
        nd.abajo = Math.max(nd.abajo, h.abajo + nd.rel[j]);
      });
    })(raiz);

    // cada compuerta va en la columna justo antes de la que alimenta (asi las
    // de un mismo nivel quedan alineadas y los NOT, pegados a su compuerta)
    var hojas = [], porNivel = [];
    (function ubicar(nd, y, col) {
      nd.y = y;
      if (esHoja(nd)) { hojas.push(nd); return; }
      nd.hijos.forEach(function (h, j) { ubicar(h, y + nd.rel[j], col - 1); });
      (porNivel[col] = porNivel[col] || []).push(nd);
    })(raiz, Y0 + raiz.arriba, raiz.nivel);

    // 1a parte: las lineas de las variables, en el orden de la tabla
    var lineas = {}, ordenLineas = [], x = 0;
    vars.forEach(function (v) {
      if (!hojas.some(function (h) { return h.v === v; })) return;
      var l = { v: v, x: x, top: 0, taps: [] };
      lineas[v] = l;
      ordenLineas.push(l);
      x += PASO_VAR;
    });
    var hayConst = hojas.some(function (h) { return h.tipo === "const"; });
    var XB = (ordenLineas.length ? x - PASO_VAR : 0) + SEP + (hayConst ? 20 : 0); // fin de la 1a parte
    hojas.forEach(function (h) {
      if (h.tipo === "const") { h.xSalida = XB; return; }
      var l = lineas[h.v];
      l.taps.push(h.y);
      h.xSalida = l.x;
      h.linea = l;
    });

    // 2a parte: columnas de compuertas, cada una tan ancha como su compuerta mas ancha
    var nada = function () {}, colX = [];
    colX[1] = XB + (hayConst ? 20 : 0) + 14;
    for (var nv = 1; nv < porNivel.length; nv++) {
      var ancho = Math.max.apply(null, (porNivel[nv] || []).map(function (nd) {
        return compuerta(nd.tipo, 0, 0, nd.h, nada).xSalida;
      }).concat([0]));
      // el hueco antes de la columna siguiente deja lugar a los dobleces
      var pliegues = Math.max.apply(null, (porNivel[nv + 1] || []).map(function (nd) {
        return Math.max(nd.bajan, nd.suben);
      }).concat([0]));
      colX[nv + 1] = colX[nv] + ancho + Math.max(GAP, PASO_PLIEGUE * (pliegues + 1) + 14);
    }

    // segmentos de cable: { pts: [[x, y]...], color }. Se arman todos antes de
    // dibujar, para encontrar los cruces.
    var cables = [], gates = [];
    for (nv = 1; nv < porNivel.length; nv++) {
      (porNivel[nv] || []).forEach(function (nd) {
        var gx = colX[nv], forma = [], g = compuerta(nd.tipo, gx, nd.y, nd.h, function (e) { forma.push(e); });
        nd.xSalida = g.xSalida;
        if (unida(nd)) { // el cable llega al medio y se abre en dos, con un punto en la union
          var hj = nd.hijos[0], p1 = nd.y - 9, p2 = nd.y + 9, xu = gx - 12;
          var c1 = { pts: [[hj.xSalida, hj.y], [xu, hj.y], [xu, p1], [g.pin(p1), p1]], desde: hj };
          var c2 = { pts: [[xu, nd.y], [xu, p2], [g.pin(p2), p2]] };
          cables.push(c1, c2);
          gates.push({ forma: forma, cables: [c1, c2], union: [xu, nd.y] });
          return;
        }
        // dobleces en escalera, sin cruces: de los que bajan, el de mas arriba
        // se dobla mas cerca de la compuerta; de los que suben, el de mas abajo
        var kk = nd.hijos.length, iBaja = 0, iSube = 0, rango = [];
        nd.hijos.forEach(function (hj, j) { if (nd.pin[j] - nd.rel[j] > 0.5) rango[j] = iBaja++; });
        for (var j = kk - 1; j >= 0; j--) if (nd.rel[j] - nd.pin[j] > 0.5) rango[j] = iSube++;
        var propios = nd.hijos.map(function (hj, j) {
          var py = nd.y + nd.pin[j], c;
          if (rango[j] == null) c = { pts: [[hj.xSalida, hj.y], [g.pin(hj.y), hj.y]], desde: hj };
          else {
            var xd = gx - PASO_PLIEGUE * (rango[j] + 1);
            c = { pts: [[hj.xSalida, hj.y], [xd, hj.y], [xd, py], [g.pin(py), py]], desde: hj };
          }
          cables.push(c);
          return c;
        });
        gates.push({ forma: forma, cables: propios });
      });
    }
    var xs = raiz.xSalida;
    var salida = { pts: [[xs, raiz.y], [xs + 36, raiz.y]], color: color, desde: raiz };
    if (raiz.nivel === 0) salida.pts[1][0] = Math.max(xs + 36, XB + 30); // F = A: un solo cable
    cables.push(salida);

    // tramos verticales (lineas de variables y uniones), para los saltos
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

    // 1. variables: nombre y linea
    ordenLineas.forEach(function (l) {
      agregar(texto(l.x, l.top - lh - 6, l.v, tam, fuente, TINTA, "center"));
      agregar(linea(l.x, l.top, [[0, 0], [0, l.bottom - l.top]], cable));
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
        if (hj && hj.linea && hj.y < hj.linea.bottom - 0.5) punto(hj.linea.x, hj.y);
      });
      if (gt.union) punto(gt.union[0], gt.union[1]);
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
  // Un bloque que el autor escribio entre parentesis o corchetes queda como
  // bloque propio (grupo): (p ∨ q) ∨ (r ∨ s) son dos paralelos dentro de otro.
  function aSerieParalelo(n, neg) {
    var nd = nodoSP(n, neg);
    if (n.par && (nd.tipo === "serie" || nd.tipo === "paralelo")) nd.grupo = true;
    return nd;
  }
  function nodoSP(n, neg) {
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

  // junta las series dentro de series y los paralelos dentro de paralelos,
  // salvo los paralelos que el autor agrupo entre parentesis
  function aplanarSP(nd) {
    if (nd.tipo !== "serie" && nd.tipo !== "paralelo") return nd;
    var hijos = [];
    nd.hijos.map(aplanarSP).forEach(function (h) {
      if (h.tipo === nd.tipo && !(h.grupo && h.tipo === "paralelo")) hijos = hijos.concat(h.hijos); else hijos.push(h);
    });
    return { tipo: nd.tipo, hijos: hijos, grupo: nd.grupo };
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
      // tipos de circuito: el comun (AND, OR, NOT) y los de una sola compuerta universal
      var tipos = [];
      if (op.circuito) tipos.push(null);
      if (op.soloNand) tipos.push("nand");
      if (op.soloNor) tipos.push("nor");
      if (tipos.length) {
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
          tipos.forEach(function (U) {
            var expr = U ? universalABoole(aUniversal(arbol, U)) : arbol;
            var c = colocar(function (ag) {
              dibujarCircuito(arbol, vars, nombre + " = " + imprimirBoole(expr, fmt), color, tam, fuente, ag, fmt.neg, U,
                op.compuertas === "justas" ? 0 : op.compuertas === "medianas" ? 0.5 : 1);
            }, ox, y, "Circuito lógico" + (U ? " solo con " + U.toUpperCase() : "") + cual);
            y += c.h + 40;
          });
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
        if (!c.deU) throw "El complemento es respecto de U: no se aplica a pares, a conjuntos de partes ni a conjuntos con elementos fuera de U";
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
      // funcion que se aplica a cada elemento (vacio = la identidad): 2*x o x => 2*x
      // (con la opcion apagada se ignora lo que haya quedado escrito)
      var img = op.conFuncion ? String(f.imagen || "").trim() : "";
      var varImg = /^\s*\(?\s*([a-zA-Z_$][\w$]*)\s*\)?\s*=>/.exec(img);
      // sin condicion: todos los de U ({2x / x ∈ ℕ})
      if (!src && img) src = (varImg ? varImg[1] : "x") + " => true";
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
      if (img) {
        // una funcion anonima de una variable, como la condicion: x => 2*x
        if (!varImg) {
          var msj = /=>/.test(img) ? "La función de los elementos recibe una sola variable: x => 2*x"
            : "Escribí una función anónima, por ejemplo x => 2*x";
          r.erroresImagen = [msj];
          r.errores.push(msj);
          return;
        }
        // en la pizarra va con la variable de la condicion (o la propia)
        var v = r.tipo === "comprension" ? textoCondicion(src).v : varImg[1];
        if (v.charAt(0) === "(") v = varImg[1];
        r.imagen = img;
        r.varImagen = v;
        r.previos = r.previos || Object.keys(conj);
        var im = aplicarImagen(S, U, r.imagen, conj);
        if (im.error) { r.erroresImagen = [im.error]; r.errores.push(im.error); return; }
        S = im.conj;
      }
      r.conj = S;
      conj[nombre] = S;
    });
    return { U: U, filas: filas };
  }

  // { f(x) / x ∈ S }: aplica la funcion `fsrc` a cada elemento de S. Si S es
  // infinito, las imagenes se van calculando a medida que se recorre U (hasta
  // BUSQUEDA elementos), y el conjunto trae su propio enumerar para listarlas.
  // Devuelve { conj } o { error }.
  function aplicarImagen(S, U, fsrc, conj) {
    var c = compilarCondicion(fsrc, conj);
    if (c.error) return { error: c.error };
    var v = textoCondicion(fsrc).v;
    // elemento imagen de e (null si no da un numero finito); lanza si la funcion falla
    function imagen(e) {
      var y = c.f(e.v);
      if (typeof y === "number") return isFinite(y) ? elemNum(y) : null;
      if (typeof y === "string") return elemTxt(y);
      throw { tipo: "Los elementos tienen que ser números o textos (con " + v + " = " + e.t + " da " + String(y) + ")" };
    }
    function probar(base) {
      for (var j = 0; j < base.length; j++) {
        try { imagen(base[j]); } catch (e) {
          if (e && e.tipo) return e.tipo;
          var falta = e instanceof ReferenceError && /^(\S+) is not defined/.exec(e.message);
          return falta ? "«" + falta[1] + "» no es un conjunto definido en una fila anterior"
            : "Error al calcular los elementos con " + v + " = " + base[j].t + ": " + e.message;
        }
      }
      return "";
    }
    if (S.lista) {
      var err = probar(S.lista);
      if (err) return { error: err };
      var imgs = S.lista.map(imagen).filter(Boolean);
      return { conj: desdeLista(imgs, U, imgs.every(U.contiene)) };
    }
    if (!U.enumerar) return { error: "En " + U.simbolo + " no se puede aplicar una función a los elementos de un conjunto infinito (no se pueden recorrer)" };
    // primeros elementos de S, para avisar errores de escritura
    var sigU = U.enumerar(), muestra = [];
    for (var n = 0; n < 2000 && muestra.length < 30; n++) { var e0 = sigU(); if (S.tiene(e0)) muestra.push(e0); }
    var err2 = probar(muestra);
    if (err2) return { error: err2 };
    var vistos = {}, hechas = [], sig = U.enumerar(), revisados = 0;
    // siguiente imagen nueva, o null si ya se recorrio todo lo que se revisa
    function avanzar() {
      while (revisados < BUSQUEDA) {
        var e = sig(), y = null;
        revisados++;
        if (!S.tiene(e)) continue;
        try { y = imagen(e); } catch (err) { continue; }
        if (!y || vistos[y.k]) continue;
        vistos[y.k] = true;
        hechas.push(y);
        return y;
      }
      return null;
    }
    var deU = true;
    for (var j = 0; j < 30 && deU; j++) { var y = hechas[j] || avanzar(); if (!y) break; deU = U.contiene(y); }
    return {
      conj: {
        lista: null, deU: deU, imagen: true,
        tiene: function (e) {
          if (vistos[e.k]) return true;
          while (avanzar()) if (vistos[e.k]) return true;
          return false;
        },
        enumerar: function () {
          var i = 0;
          return function () { return i < hechas.length ? hechas[i++] : avanzar() && hechas[i++]; };
        },
      },
    };
  }

  // la funcion de los elementos "a mano": x => 2*x -> 2x (con la variable v)
  function textoImagen(codigo, v, nombres) {
    var t = textoCondicion(codigo, nombres);
    var s = t.cond;
    if (t.v !== v) s = s.replace(new RegExp("(^|[^\\w$])" + t.v.replace(/[$]/g, "\\$") + "(?![\\w$])", "g"), "$1" + v);
    // la division sin espacios, para no confundirla con la barra de "tal que"
    return s.replace(/(\d)·(?=[a-zA-Z_(])/g, "$1").replace(/\s*\/\s*/g, "/");
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
    // un conjunto de imagenes ({2x / x ∈ ℕ}) se recorre a si mismo; sus
    // elementos pueden crecer o decrecer, asi que se buscan en los dos sentidos
    var propio = !!S.enumerar;
    if (!propio && !U.enumerar) return { texto: comprension() };
    var sig = (propio ? S : U).enumerar(), hall = [], arriba = false, abajo = false, min = Infinity, max = -Infinity;
    for (var n = 0; n < BUSQUEDA; n++) {
      var e = sig();
      if (!e) break;
      if (!propio && !S.tiene(e)) continue;
      if (hall.length < L) { hall.push(e); min = Math.min(min, e.v); max = Math.max(max, e.v); continue; }
      if (U.tipo !== "Z" && !propio) { arriba = true; break; }
      if (typeof e.v !== "number") { arriba = true; break; }
      if (e.v > max) arriba = true; else if (e.v < min) abajo = true;
      if (arriba && abajo) break;
    }
    if (!hall.length) return { texto: "∅" };
    var numeros = hall.every(function (x) { return typeof x.v === "number"; });
    if (U.tipo !== "Q" && numeros) hall.sort(function (a, b) { return a.v - b.v; });
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
      if (f.imagen) {
        // {2x / x ∈ ℕ ∧ x < 5} o {2x / x ∈ A ∪ B}
        var ti = textoImagen(f.imagen, f.varImagen, f.previos);
        var donde;
        if (f.tipo === "comprension") {
          var tcI = textoCondicion(f.codigo, f.previos);
          donde = f.varImagen + " ∈ " + U.simbolo + (tcI.cond === "true" ? "" : " ∧ " + tcI.cond);
        } else donde = f.varImagen + " ∈ " + imprimirConjunto(f.arbol, false);
        def = "{" + ti + " / " + donde + "}";
        comp = function () { return def; };
      } else if (f.tipo === "comprension") {
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
    if (!f) return [];
    // los errores de la funcion de los elementos se muestran en su campo
    var deImagen = f.erroresImagen || [];
    return f.errores.filter(function (e) { return deImagen.indexOf(e) < 0; }).concat(f.avisos || []);
  }

  function erroresImagenConjunto(fila, op, i) {
    var f = analizarConjuntos(op).filas[i];
    return f && f.erroresImagen || [];
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
  function propiedadesRelacion(f, detalle) {
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
    // orden amplio (reflexiva, transitiva, antisimetrica) y estricto
    // (arreflexiva, asimetrica, transitiva), con la justificacion
    var noArref = A.filter(function (a) { return R.tiene(a, a); })[0];
    var noAsim = P.filter(function (p) { return R.tiene(p[1], p[0]); })[0];
    function clasificarOrden(tipo, props) {
      var faltan = props.filter(function (p) { return !p[1]; }).map(function (p) { return p[0]; });
      var todas = props.map(function (p) { return p[0]; });
      function lista(xs, conj) { return xs.length > 1 ? xs.slice(0, -1).join(", ") + " " + conj + " " + xs[xs.length - 1] : xs[0]; }
        res.push(faltan.length
          ? n + " no es de orden " + tipo + " dado que no es " + lista(faltan, "ni")
          : n + " es de orden " + tipo + " dado que es " + lista(todas, "y"));
    }
    clasificarOrden("amplio", [["reflexiva", !noRef], ["transitiva", !noTra], ["antisimétrica", !noAnti]]);
    clasificarOrden("estricto", [["arreflexiva", !noArref], ["asimétrica", !noAsim], ["transitiva", !noTra]]);
    if (detalle) return { res: res, noRef: noRef, noSim: noSim, noAnti: noAnti, noTra: noTra };
    return res;
  }

  // Estudio detallado de cada propiedad (opcion "explicación detallada"):
  //   Estudio de propiedad simétrica            (subrayado)
  //   | Definición general de simetría
  //   |     ∀x, y ∈ A: (x, y) ∈ R → (y, x) ∈ R
  //   | Definición aplicada de simetría
  //   |     ∀x, y ∈ A: (x, y) ∈ R → (y, x) ∈ R   (con los nombres del ejercicio)
  //   |     ∀x, y ∈ A: y mod x = 0 → x mod y = 0 (si es por comprension)
  //   | La propiedad simétrica se cumple.  /  NO se cumple + contraejemplo:
  //   |     Para x = 2, y = 4, se tiene:
  //   |         formula con variables / formula con los valores
  //   |         V → F   (V verde, F rojo, debajo de cada parte)
  //   |           F     (se reduce un conector por renglon: ∧ antes que →)
  // ORDEN: por propiedad, titulo, subrayado, textos de arriba abajo, cada
  // renglon de la tabla de verdad de izquierda a derecha y la barra al final.
  var VERDE_VF = COLORES[2], ROJO_VF = COLORES[1];

  // (a, b) ∈ R escrito con la condicion de la relacion si es por comprension
  // (y mod x = 0 con x -> a, y -> b); si no, "(a, b) ∈ R"
  function condicionRel(f) {
    var tc = f.tipo === "comprension" ? textoCondicion(f.codigo, f.previos) : null;
    var params = tc ? tc.v.replace(/[()\s]/g, "").split(",") : null;
    return function (a, b) {
      if (!tc || params.length !== 2) return "(" + a + ", " + b + ") ∈ " + f.nombre;
      var m = {}; m[params[0]] = a; m[params[1]] = b;
      var re = new RegExp("(^|[^\\w$])(" + params.map(function (p) { return p.replace(/\$/g, "\\$"); }).join("|") + ")(?![\\w$])", "g");
      return tc.cond.replace(re, function (t, pre, p) { return pre + m[p]; });
    };
  }

  // Clases de equivalencia y conjunto cociente (si R es de equivalencia).
  // Cada clase se nombra K con subindice: un elemento de la clase (el
  // primero, como representante); cualquier otro de la clase tambien sirve
  // de indice, y asi se escribe al final de la linea:
  //   Clases de equivalencia:
  //   K₁ = [1] = {x ∈ A / (x + 1) mod 2 = 0} = {1, 3, 5} = K₃ = K₅
  //   K₂ = [2] = {x ∈ A / (x + 2) mod 2 = 0} = {2, 4} = K₄
  //   Se puede apreciar que existen dos clases de equivalencia: K₁, K₂
  //   Por lo tanto el conjunto cociente es
  //       A
  //       ─ = {K₁, K₂} = {{1, 3, 5}, {2, 4}}
  //       R
  // Los subindices se dibujan (texto mas chico y mas abajo).
  function calcularClases(f) {
    var R = f.rel, A = R.A.lista, vistos = {}, clases = [];
    A.forEach(function (a) {
      if (vistos[a.k]) return;
      var cl = A.filter(function (x) { return R.tiene(x, a); });
      cl.forEach(function (x) { vistos[x.k] = true; });
      clases.push({ rep: a, lista: cl });
    });
    return clases;
  }
  function esEquivalencia(f) {
    var pr = propiedadesRelacion(f, true);
    return !pr.noRef && !pr.noSim && !pr.noTra;
  }

  // Escribe partes seguidas desde (x, y): { t, color, sub }. Las que tienen
  // sub van como subindice. Devuelve el borde derecho.
  function escribirPartes(x, y, partes, tam, fuente, agregar) {
    var ts = Math.round(tam * 0.65), lh = tam * fuente.lh;
    partes.forEach(function (p) {
      if (!p.t) return;
      if (p.sub) {
        agregar(texto(x + 1, y + lh * 0.42, p.t, ts, fuente, p.color, "left"));
        x += medir(p.t, ts, fuente) + 2;
      } else {
        var lead = p.t.length - p.t.replace(/^\s+/, "").length, limpio = p.t.trim();
        if (limpio) agregar(texto(x + medir(p.t.slice(0, lead), tam, fuente), y, limpio, tam, fuente, p.color, "left"));
        x += medir(p.t, tam, fuente);
      }
    });
    return x;
  }
  // K con subindice e (un elemento)
  function partesK(e, color) { return [{ t: "K", color: color }, { t: e.t, sub: true, color: color }]; }
  // partes de "K₁, K₂, K₃" (con separador sep)
  function partesListaK(reps, color, sep, colorSep) {
    var out = [];
    reps.forEach(function (e, i) {
      if (i) out.push({ t: sep, color: colorSep });
      out = out.concat(partesK(e, color));
    });
    return out;
  }
  var NUMEROS_TEXTO = ["cero", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];

  function clasesEquivalencia(f, esc, ox, tam, fuente, agregar, conGrafo) {
    var nA = f.base.split(" × ")[0], cond = condicionRel(f), col = f.color;
    var lh = tam * fuente.lh, u = Math.round(tam * 1.5);
    var nAp = /[\s∪∩−Δ]/.test(nA) ? "(" + nA + ")" : nA;
    var clases = calcularClases(f);
    function renglon(partes) { escribirPartes(ox, esc.y, partes, tam, fuente, agregar); esc.y += esc.alto; }
    renglon([{ t: "Clases de equivalencia:", color: TINTA }]);
    clases.forEach(function (c) {
      var v = /^[−-]/.test(c.rep.t) ? "(" + c.rep.t + ")" : c.rep.t;
      var partes = partesK(c.rep, col).concat([{ t: " = [" + c.rep.t + "] = {x ∈ " + nAp + " / " + cond("x", v) + "} = {" +
        c.lista.map(function (x) { return x.t; }).join(", ") + "}", color: col }]);
      c.lista.forEach(function (x) {
        if (x.k !== c.rep.k) partes = partes.concat([{ t: " = ", color: col }], partesK(x, col));
      });
      renglon(partes);
    });
    var k = clases.length, reps = clases.map(function (c) { return c.rep; });
    var cuantas = k <= 10 ? NUMEROS_TEXTO[k] : String(k);
    var frase = (conGrafo ? "Se puede apreciar que exist" : "Exist") + (k === 1 ? "e " : "en ") + cuantas +
      (k === 1 ? " clase" : " clases") + " de equivalencia: ";
    esc.y += esc.alto * 0.3;
    renglon([{ t: frase, color: TINTA }].concat(partesListaK(reps, col, ", ", TINTA)));
    esc.y += esc.alto * 0.3;
    renglon([{ t: "Por lo tanto el conjunto cociente es", color: TINTA }]);
    // fraccion A / R y a la derecha "= {K₁, K₂} = {{...}, {...}}"
    var x = ox + u, wn = medir(nA, tam, fuente), wd = medir(f.nombre, tam, fuente);
    var wf = Math.max(wn, wd) + tam * 0.5, yBarra = esc.y + lh + 3;
    agregar(texto(x + wf / 2, esc.y, nA, tam, fuente, TINTA, "center"));
    agregar(linea(x, yBarra, [[0, 0], [wf, 0]], { strokeColor: TINTA, strokeWidth: 1.5 }));
    agregar(texto(x + wf / 2, yBarra + 3, f.nombre, tam, fuente, TINTA, "center"));
    var conjs = clases.map(function (c) { return "{" + c.lista.map(function (e) { return e.t; }).join(", ") + "}"; });
    escribirPartes(x + wf + tam * 0.3, yBarra - lh / 2, [{ t: "= {", color: TINTA }]
      .concat(partesListaK(reps, col, ", ", TINTA))
      .concat([{ t: "} = {" + conjs.join(", ") + "}", color: TINTA }]), tam, fuente, agregar);
    esc.y = yBarra + 3 + lh + 10;
  }

  // Grafo de las clases de equivalencia: cada clase en un renglon, sus
  // elementos con un lazo cada uno y flechas dobles entre todos (las de
  // vecinos por arriba, las demas por abajo), encerrada en un ovalo del color
  // de la relacion con una flecha a su nombre K₁; todas dentro de un ovalo
  // grande (el conjunto). ORDEN: por clase, sus elementos (texto y lazo), las
  // flechas, su ovalo y su nombre; al final el ovalo grande y su nombre.
  function dibujarClases(f, tam, fuente, agregar) {
    var clases = calcularClases(f), lh = tam * fuente.lh, col = f.color;
    var lazoR = tam * 0.3, lazoW = 2 * lazoR + 4, alto1 = tam * 0.8, paso = tam * 0.6;
    var anchoMax = anchoMaximo(f.rel.A.lista, tam, fuente);
    var sx = Math.max(tam * 4.5, anchoMax + lazoW + tam * 2.5);
    var flecha = { type: "arrow", startArrowhead: "arrow", endArrowhead: "arrow", strokeColor: TINTA,
      strokeWidth: 1.5, roundness: { type: 2 } };
    var fondo = 0, puntosExt = [], agregarTodo = agregar;
    clases.forEach(function (c, ic) {
      // cada clase se arma en y = 0 y despues se baja hasta quedar debajo
      // del ovalo de la anterior
      var buf = [], agregar = function (e) { buf.push(e); return e; };
      var n = c.lista.length, x0 = -(n - 1) * sx / 2, pts = [], cy = 0;
      var abajo = n > 2 ? lh * 0.55 + alto1 + (n - 3) * paso : lh / 2;
      var xs = c.lista.map(function (e, i) { return x0 + i * sx; });
      c.lista.forEach(function (e, i) {
        var w = medir(e.t, tam, fuente), xc = xs[i];
        agregar(texto(xc, cy - lh / 2, e.t, tam, fuente, TINTA, "center"));
        // lazo a la derecha del elemento; la punta vuelve hacia el elemento
        var lc = [xc + w / 2 + 2 + lazoR, cy];
        agregar(trazo([-160, -90, 0, 90, 150].map(function (g) {
          var r = g * Math.PI / 180;
          return [lc[0] + lazoR * Math.cos(r), lc[1] + lazoR * Math.sin(r)];
        }), { type: "arrow", endArrowhead: "arrow", strokeColor: TINTA, strokeWidth: 1.5, roundness: { type: 2 } }));
        pts.push([xc - w / 2, cy - lh / 2], [xc - w / 2, cy + lh / 2], [lc[0] + lazoR, cy - lazoR], [lc[0] + lazoR, cy + lazoR]);
      });
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var wi = medir(c.lista[i].t, tam, fuente), wj = medir(c.lista[j].t, tam, fuente);
          var m = (xs[i] + xs[j]) / 2, arc;
          if (j === i + 1) {
            var ya = cy - lh * 0.6;
            arc = [[xs[i] + wi / 2 + lazoW, ya], [m, ya - tam * 0.45], [xs[j] - wj / 2 - 4, ya]];
          } else {
            var yb = cy + lh * 0.55;
            arc = [[xs[i] + wi / 2 + 2, yb], [m, yb + alto1 + (j - i - 2) * paso], [xs[j] - wj / 2, yb]];
          }
          agregar(trazo(arc, flecha));
          pts.push(arc[1]);
        }
      }
      // ovalo de la clase: semieje a fijo; b, el menor que contiene los puntos
      var xmin = Math.min.apply(null, pts.map(function (p) { return p[0]; }));
      var xmax = Math.max.apply(null, pts.map(function (p) { return p[0]; }));
      var ymin = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
      var ccx = (xmin + xmax) / 2, a = (xmax - xmin) / 2 + tam * 1.6;
      var ccy = (ymin + cy + abajo) / 2;
      var b = pts.reduce(function (mx, p) {
        var dx = (p[0] - ccx) / a;
        return Math.max(mx, Math.abs(p[1] - ccy) / Math.sqrt(Math.max(0.05, 1 - dx * dx)));
      }, lh * 0.8) + 6;
      agregar(base("ellipse", { x: ccx - a, y: ccy - b, width: 2 * a, height: 2 * b, strokeColor: col, strokeWidth: 2 }));
      // flecha curva desde el borde derecho del ovalo hasta K₁
      var fx = ccx + a, fy = ccy;
      agregar(trazo([[fx - 2, fy], [fx + tam * 0.6, fy + tam * 0.15], [fx + tam * 1.1, fy + tam * 0.55]],
        { type: "arrow", endArrowhead: "arrow", strokeColor: col, strokeWidth: 1.5, roundness: { type: 2 } }));
      var kx = fx + tam * 1.25, ky = fy + tam * 0.55 - lh / 2;
      var kfin = escribirPartes(kx, ky, partesK(c.rep, col), tam, fuente, agregar);
      var dy = (ic ? fondo + tam * 0.5 : 0) - (ccy - b);
      buf.forEach(function (e) { e.y += dy; agregarTodo(e); });
      for (var g = 0; g < 32; g++) {
        var t = g * Math.PI / 16;
        puntosExt.push([ccx + a * Math.cos(t), ccy + dy + b * Math.sin(t)]);
      }
      puntosExt.push([kfin, ky + dy], [kfin, ky + dy + lh * 1.3]);
      fondo = ccy + dy + b;
    });
    // ovalo grande: centrado en el medio de todo, con el mismo criterio
    var xsE = puntosExt.map(function (p) { return p[0]; }), ysE = puntosExt.map(function (p) { return p[1]; });
    var X0 = Math.min.apply(null, xsE), X1 = Math.max.apply(null, xsE);
    var Y0 = Math.min.apply(null, ysE), Y1 = Math.max.apply(null, ysE);
    var ox2 = (X0 + X1) / 2, oy2 = (Y0 + Y1) / 2, A2 = (X1 - X0) / 2 * 1.3 + tam;
    var B2 = puntosExt.reduce(function (mx, p) {
      var dx = (p[0] - ox2) / A2;
      return Math.max(mx, Math.abs(p[1] - oy2) / Math.sqrt(Math.max(0.05, 1 - dx * dx)));
    }, 0) + tam * 0.6;
    agregar(base("ellipse", { x: ox2 - A2, y: oy2 - B2, width: 2 * A2, height: 2 * B2, strokeWidth: 2 }));
    agregar(texto(ox2 - A2 * 0.72, oy2 - B2 * 0.72 - lh, f.base.split(" × ")[0], tam, fuente, TINTA, "right"));
  }

  function estudioPropiedades(f, esc, ox, tam, fuente, agregar) {
    var an = propiedadesRelacion(f, true), n = f.nombre, nA = f.base.split(" × ")[0];
    if (/[\s∪∩−Δ]/.test(nA)) nA = "(" + nA + ")";
    var lh = tam * fuente.lh, alto = esc.alto, u = Math.round(tam * 1.5);
    var cond = condicionRel(f);
    function paren(s) { return /[∧∨→↔]/.test(s) ? "(" + s + ")" : s; }
    function val(e) { return /^[−-]/.test(e.t) ? "(" + e.t + ")" : e.t; }
    // atomos: { gen: texto general (con A y R), apl: aplicado con variables,
    // con: aplicado con valores (funcion del contraejemplo), v: valor }
    function enRel(a, b) {
      return { gen: "(" + a + ", " + b + ") ∈ R", apl: "(" + a + ", " + b + ") ∈ " + n, cnd: paren(cond(a, b)),
        con: function (V) { return paren(cond(val(V[a]), val(V[b]))); } };
    }
    var props = [
      { nombre: "reflexiva", sust: "reflexividad", cuant: "∀x", vars: ["x"], ce: an.noRef && { x: an.noRef },
        partes: [{ gen: "x ∈ A", apl: "x ∈ " + nA, cnd: "x ∈ " + nA, con: function (V) { return val(V.x) + " ∈ " + nA; } },
          "→", enRel("x", "x")], valores: [true, false], dosPuntos: true },
      { nombre: "simétrica", sust: "simetría", cuant: "∀x, y ∈ ", vars: ["x", "y"],
        ce: an.noSim && { x: an.noSim[0], y: an.noSim[1] },
        partes: [enRel("x", "y"), "→", enRel("y", "x")], valores: [true, false] },
      { nombre: "antisimétrica", sust: "antisimetría", cuant: "∀x, y ∈ ", vars: ["x", "y"],
        ce: an.noAnti && { x: an.noAnti[0], y: an.noAnti[1] },
        partes: [enRel("x", "y"), "∧", enRel("y", "x"), "→",
          { gen: "x = y", apl: "x = y", cnd: "x = y", con: function (V) { return val(V.x) + " = " + val(V.y); } }],
        valores: [true, true, false] },
      { nombre: "transitiva", sust: "transitividad", cuant: "∀x, y, z ∈ ", vars: ["x", "y", "z"],
        ce: an.noTra && { x: an.noTra[0][0], y: an.noTra[0][1], z: an.noTra[1][1] },
        partes: [enRel("x", "y"), "∧", enRel("y", "z"), "→", enRel("x", "z")], valores: [true, true, false] },
    ];
    function unir(partes, campo, V) {
      return partes.map(function (p) { return typeof p === "string" ? p : campo === "con" ? p.con(V) : p[campo]; }).join(" ");
    }
    props.forEach(function (p) {
      var y0 = esc.y, x1 = ox + u, x2 = ox + 2 * u, x3 = ox + 3 * u;
      var titulo = "Estudio de propiedad " + p.nombre, wt = medir(titulo, tam, fuente);
      agregar(texto(ox, esc.y, titulo, tam, fuente, TINTA, "left"));
      agregar(linea(ox, esc.y + lh + 2, [[0, 0], [wt, 0]], { strokeColor: f.color, strokeWidth: 1.5 }));
      esc.y += alto + 4;
      var yBarra = esc.y - 2;
      function escribir(x, s, color) { agregar(texto(x, esc.y, s, tam, fuente, color || TINTA, "left")); esc.y += alto; }
      // p.cuant de reflexiva es "∀x" (la pertenencia a A va dentro de la formula)
      var cuantGen = p.dosPuntos ? p.cuant + ": " : p.cuant + "A: ";
      var cuantApl = p.dosPuntos ? p.cuant + ": " : p.cuant + nA + ": ";
      escribir(x1, "Definición general de " + p.sust);
      escribir(x2, cuantGen + unir(p.partes, "gen"));
      escribir(x1, "Definición aplicada de " + p.sust);
      var apl = unir(p.partes, "apl"), cnd = unir(p.partes, "cnd");
      escribir(x2, cuantApl + apl);
      if (cnd !== apl) escribir(x2, cuantApl + cnd);
      if (!p.ce) {
        escribir(x1, "La propiedad " + p.nombre + " se cumple.");
      } else {
        var V = p.ce;
        escribir(x1, "La propiedad " + p.nombre + " NO se cumple. Demostración por contraejemplo:");
        escribir(x2, "Para " + p.vars.map(function (v) { return v + " = " + V[v].t; }).join(", ") + ", se tiene:");
        esc.y += alto * 0.5;
        escribir(x3, cnd);
        // posiciones (centros) de cada parte en el renglon con los valores
        var piezas = p.partes.map(function (q) { return typeof q === "string" ? q : q.con(V); });
        var cx = [], xx = x3;
        piezas.forEach(function (s, i) {
          var w = medir(s, tam, fuente);
          cx.push(xx + w / 2);
          xx += w + (i < piezas.length - 1 ? medir(" ", tam, fuente) : 0);
        });
        escribir(x3, piezas.join(" "));
        esc.y += alto * 0.5;
        // tabla de verdad: el frente de valores y conectores; en cada renglon
        // se resuelve un conector (∧ antes que →)
        var k = 0;
        var frente = piezas.map(function (s, i) {
          return typeof p.partes[i] === "string" ? { op: s, x: cx[i] } : { v: p.valores[k++], x: cx[i] };
        });
        for (;;) {
          frente.forEach(function (e) {
            var s = e.op || (e.v ? "V" : "F");
            agregar(texto(e.x, esc.y, s, tam, fuente, e.op ? TINTA : e.v ? VERDE_VF : ROJO_VF, "center"));
          });
          esc.y += alto;
          if (frente.length === 1) break;
          var j = -1;
          frente.forEach(function (e, i) { if (j < 0 && e.op === "∧") j = i; });
          if (j < 0) frente.forEach(function (e, i) { if (j < 0 && e.op) j = i; });
          var a = frente[j - 1].v, b = frente[j + 1].v;
          var r = frente[j].op === "∧" ? a && b : !a || b;
          frente.splice(j - 1, 3, { v: r, x: frente[j].x });
          esc.y += alto * 0.25;
        }
      }
      agregar(linea(ox + u * 0.4, yBarra, [[0, 0], [0, esc.y - yBarra]], { strokeColor: TINTA, strokeWidth: 1 }));
      esc.y += alto * 0.75;
    });
    an.res.slice(4).forEach(function (t) { esc.linea(t, f.color); });
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
        // lazo redondo: un circulo de radio rl hacia afuera del nodo, que nace
        // y muere en el borde del nodo (cortes con su circulo); se recorre el
        // arco de afuera y la punta queda un poco antes del borde
        var t = ang[p[0].k], rl = Math.max(18, rn * 0.6), D = rn + rl * 0.55;
        var lc = [a[0] + D * Math.cos(t), a[1] + D * Math.sin(t)];
        var fi = Math.acos(Math.max(-1, Math.min(1, (D * D + rl * rl - rn * rn) / (2 * D * rl))));
        var g0 = t + Math.PI + fi, g1 = t + Math.PI + 2 * Math.PI - fi - 3 / rl, k = 8, arco = [];
        for (var q = 0; q <= k; q++) {
          var g = g0 + (g1 - g0) * q / k;
          arco.push([lc[0] + rl * Math.cos(g), lc[1] + rl * Math.sin(g)]);
        }
        agregar(trazo(arco, flecha));
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
      if (op.propiedades && f.homogenea) {
        if (op.propDetalle) {
          if (esc.y > oy) esc.y += esc.alto * 0.5;
          estudioPropiedades(f, esc, ox, tam, fuente, agregar);
        } else propiedadesRelacion(f).forEach(function (t) { esc.linea(t, f.color); });
      }
      if (op.clases && f.homogenea && f.rel.A.lista.length && esEquivalencia(f)) {
        if (esc.y > oy) esc.y += esc.alto * 0.5;
        clasesEquivalencia(f, esc, ox, tam, fuente, agregar, op.clasesGrafo);
      }
    });

    dibujarCartesiano.titulo = "Gráfico cartesiano";
    dibujarSagital.titulo = "Diagrama sagital";
    dibujarGrafo.titulo = "Grafo dirigido";
    dibujarClases.titulo = "Clases de equivalencia";
    var dibujos = [op.cartesiano && dibujarCartesiano, op.sagital && dibujarSagital, op.grafo && dibujarGrafo]
      .filter(Boolean);
    var y = esc.y + (esc.y > oy ? 30 : 0);
    an.filas.forEach(function (f) {
      if (f.errores.length || f.clase !== "relacion" || !f.rel.A.lista.length || !f.rel.B.lista.length) return;
      // el grafo de las clases va al lado de los otros diagramas de la relacion
      var dibujosF = dibujos;
      if (op.clases && op.clasesGrafo && f.homogenea && esEquivalencia(f)) dibujosF = dibujos.concat([dibujarClases]);
      if (!dibujosF.length) return;
      agregar(texto(ox, y, f.nombre + " ⊆ " + f.base, tam, fuente, f.color, "left"));
      y += tam * fuente.lh + 30;
      var x = ox, alto = 0;
      dibujosF.forEach(function (dibujar) {
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

  // ======================================= EXPRESIONES CON VALOR ABSOLUTO
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

  // ---------------------------------- resolucion paso a paso (lineales)
  // Fracciones exactas { n, d } con d > 0.
  function mcdAbs(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function fr(n, d) {
    d = d === undefined ? 1 : d;
    if (d < 0) { n = -n; d = -d; }
    var g = mcdAbs(n, d);
    return { n: n / g || 0, d: d / g };
  }
  function frNeg(a) { return { n: -a.n || 0, d: a.d }; }
  function frSuma(a, b) { return fr(a.n * b.d + b.n * a.d, a.d * b.d); }
  function frMul(a, b) { return fr(a.n * b.n, a.d * b.d); }
  function frDiv(a, b) { return fr(a.n * b.d, a.d * b.n); }
  function frCero(a) { return a.n === 0; }
  function frUno(a) { return a.n === 1 && a.d === 1; }
  function frValor(a) { return a.n / a.d; }
  function frTexto(a) { return (a.n < 0 ? "−" : "") + Math.abs(a.n) + (a.d === 1 ? "" : "/" + a.d); }
  function errAbs(m) { throw { msjAbs: m }; }

  // Expresion lineal en la variable `vari` -> lista de terminos { c, x }
  // (x: 1 si lleva la variable) en el orden en que quedan al quitar los
  // parentesis, SIN juntar los semejantes: −(1 − x) + 7 -> −1, x, 7.
  // `grado` (1 por defecto): el grado maximo admitido (2 para polinomios).
  function leerLineal(s, vari, grado) {
    grado = grado || 1;
    var t = String(s).replace(/\s+/g, ""), i = 0;
    var negar = function (L) { return L.map(function (m) { return { c: frNeg(m.c), x: m.x }; }); };
    var mult = function (A, B) {
      var r = [];
      A.forEach(function (p) {
        B.forEach(function (q) {
          if (p.x + q.x > grado) errAbs(grado > 1 ? "El grado es mayor que 2"
            : "No es lineal (aparece " + vari + "²): por ahora se resuelven solo las lineales");
          r.push({ c: frMul(p.c, q.c), x: p.x + q.x });
        });
      });
      return r;
    };
    var dividir = function (A, B) {
      var j = juntarLineal(B);
      if (j.length > 1 || j[0].x) errAbs("No se puede dividir por una expresión con " + vari);
      if (frCero(j[0].c)) errAbs("División por cero");
      return A.map(function (m) { return { c: frDiv(m.c, j[0].c), x: m.x }; });
    };
    function expr() {
      var r = termino();
      while (t[i] === "+" || t[i] === "−") { var o = t[i++], b = termino(); r = r.concat(o === "+" ? b : negar(b)); }
      return r;
    }
    function termino() {
      var r = unario();
      for (;;) {
        var c = t[i];
        if (c === "·" || c === "×") { i++; r = mult(r, unario()); }
        else if (c === "/" || c === ":") { i++; r = dividir(r, unario()); }
        else if (c && /[A-Za-z0-9(\[{]/.test(c)) r = mult(r, potencia()); // 2x, 2(x − 1)
        else return r;
      }
    }
    function unario() {
      if (t[i] === "−") { i++; return negar(unario()); }
      if (t[i] === "+") { i++; return unario(); }
      return potencia();
    }
    function potencia() {
      var b = atomo(), m = /^[⁰¹²³⁴-⁹]+/.exec(t.slice(i));
      if (!m) return b;
      i += m[0].length;
      var e = parseInt(m[0].split("").map(function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c); }).join(""), 10);
      var r = [{ c: fr(1), x: 0 }];
      for (var k = 0; k < e; k++) r = mult(r, b);
      return r;
    }
    function atomo() {
      var c = t[i];
      if (c === "(" || c === "[" || c === "{") {
        var fin = { "(": ")", "[": "]", "{": "}" }[c];
        i++;
        var r = expr();
        if (t[i] !== fin) errAbs("Falta cerrar un «" + c + "»");
        i++;
        return r;
      }
      if (c === "|") errAbs("Hay más de un valor absoluto: para resolver se admite uno solo");
      var m = /^(\d+)(?:[.,](\d+))?/.exec(t.slice(i));
      if (m) {
        i += m[0].length;
        var dec = m[2] || "";
        return [{ c: fr(parseInt(m[1] + dec, 10), Math.pow(10, dec.length)), x: 0 }];
      }
      if (c && /[A-Za-z]/.test(c)) { i++; return [{ c: fr(1), x: 1 }]; }
      errAbs(c ? "No se entiende «" + c + "»" : "Falta un término");
    }
    var r = expr();
    if (i < t.length) errAbs("No se entiende «" + t[i] + "»");
    return r;
  }

  // junta los semejantes: [a·x, b] (sin los que dan cero; [0] si no queda nada)
  // Si no hay semejantes para juntar, queda en el orden escrito (1 − x).
  function juntarLineal(L) {
    var nx = L.filter(function (m) { return m.x; }).length;
    if (L.length && nx <= 1 && L.length - nx <= 1 && L.every(function (m) { return !frCero(m.c); })) return L;
    var a = fr(0), b = fr(0);
    L.forEach(function (m) { if (m.x) a = frSuma(a, m.c); else b = frSuma(b, m.c); });
    var r = [];
    if (!frCero(a)) r.push({ c: a, x: 1 });
    if (!frCero(b) || !r.length) r.push({ c: b, x: 0 });
    return r;
  }
  function coefLineal(L) {
    var j = juntarLineal(L), a = fr(0), b = fr(0);
    j.forEach(function (m) { if (m.x) a = m.c; else b = m.c; });
    return { a: a, b: b };
  }
  // termino sin signo (c > 0): 3, 7/4, x, 2x, (3/4)x
  function textoTerminoAbs(c, x, vari) {
    var s = frTexto(c);
    if (!x) return s;
    if (frUno(c)) return vari;
    return (c.d === 1 ? s : "(" + s + ")") + vari;
  }
  function textoLineal(L, vari) {
    if (!L.length) return "0";
    return L.map(function (m, k) {
      var neg = m.c.n < 0, s = textoTerminoAbs(neg ? frNeg(m.c) : m.c, m.x, vari);
      return k ? (neg ? " − " : " + ") + s : (neg ? "−" : "") + s;
    }).join("");
  }

  var COLOR_SUMA = "#2f9e44", COLOR_PRODUCTO = "#9c36b5";
  var COLOR_CONDICION = "#f08c00", COLOR_CASO = "#1971c2";
  var INVERTIR_ABS = { "<": ">", ">": "<", "≤": "≥", "≥": "≤", "=": "=" };
  var TAM_NOTA = { S: 16, M: 16, L: 20, XL: 28 };

  function textoSegs(segs) { return segs.map(function (s) { return s.t; }).join(""); }
  function textoLineaAbs(l) { return textoSegs(l.izq) + " " + l.rel + " " + textoSegs(l.der); }

  // Resuelve «izq rel der» (lineal) escribiendo cada paso. Devuelve
  // { lineas, tramos }: cada linea es { izq, rel, der, nota } con izq y der
  // listas de { t, color } (lo que se agrega por la propiedad uniforme va en
  // color) y nota = [{ t, color }] (que se hizo, en el mismo color).
  function resolverLineal(txt, vari) {
    var rels = txt.match(/[=<>≤≥≠]/g) || [];
    if (rels.length !== 1) errAbs("Para resolver tiene que haber una sola relación (=, <, >, ≤ o ≥)");
    var rel = rels[0];
    if (rel === "≠") errAbs("Con ≠ no se resuelve: usá =, <, >, ≤ o ≥");
    var p = txt.indexOf(rel), tI = txt.slice(0, p).trim(), tD = txt.slice(p + 1).trim();
    var L = leerLineal(tI, vari), R = leerLineal(tD, vari);
    var lineas = [{ izq: [{ t: tI }], rel: rel, der: [{ t: tD }] }];
    var simple = function (T) { return [{ t: textoLineal(T, vari) }]; };
    function poner(izq, der, rel2, nota) {
      var l = { izq: izq, rel: rel2 || rel, der: der, nota: nota };
      if (textoLineaAbs(l) !== textoLineaAbs(lineas[lineas.length - 1])) lineas.push(l);
    }
    // propiedad uniforme: suma (o resta) del mismo termino en los dos miembros
    function sumar(c, x) {
      var neg = c.n < 0, txtT = textoTerminoAbs(neg ? frNeg(c) : c, x, vari);
      var seg = [{ t: (neg ? " − " : " + ") + txtT, color: COLOR_SUMA }];
      poner(simple(L).concat(seg), simple(R).concat(seg), rel,
        [{ t: (neg ? "Restar " : "Sumar ") + txtT + " en ambos miembros", color: COLOR_SUMA }]);
      L = juntarLineal(L.concat([{ c: c, x: x }]));
      R = juntarLineal(R.concat([{ c: c, x: x }]));
      poner(simple(L), simple(R));
    }
    // quitar parentesis y juntar semejantes
    poner(simple(L), simple(R));
    L = juntarLineal(L); R = juntarLineal(R);
    poner(simple(L), simple(R));
    // las x a la izquierda y los numeros a la derecha
    var cR = coefLineal(R);
    if (!frCero(cR.a)) sumar(frNeg(cR.a), 1);
    var cL = coefLineal(L);
    cR = coefLineal(R);
    if (frCero(cL.a)) {
      // no queda la variable: se cumple siempre o nunca
      var u = frValor(cL.b), v = frValor(cR.b);
      var ok = { "=": u === v, "<": u < v, ">": u > v, "≤": u <= v, "≥": u >= v }[rel];
      lineas[lineas.length - 1].nota = [{ t: ok ? "Se cumple para todo " + vari : "No se cumple para ningún " + vari, color: COLOR_SUMA }];
      lineas[lineas.length - 1].notaFinal = true;
      return { lineas: lineas, tramos: ok ? [{ a: -Infinity, b: Infinity, ca: false, cb: false, ta: "−∞", tb: "∞" }] : [] };
    }
    if (!frCero(cL.b)) sumar(frNeg(cL.b), 0);
    cL = coefLineal(L); cR = coefLineal(R);
    var a = cL.a, val = frDiv(cR.b, a), rel2 = a.n < 0 ? INVERTIR_ABS[rel] : rel;
    if (!frUno(a)) {
      // propiedad uniforme: multiplicar (o dividir) los dos miembros
      var seg, nota;
      if (a.n === -1 && a.d === 1) {
        seg = "·(−1)"; nota = "Multiplicar por −1 en ambos miembros";
      } else if (a.d === 1) {
        seg = " : " + (a.n < 0 ? "(" + frTexto(a) + ")" : frTexto(a)); nota = "Dividir por " + frTexto(a) + " en ambos miembros";
      } else {
        var inv = frDiv(fr(1), a);
        seg = "·(" + frTexto(inv) + ")"; nota = "Multiplicar por " + frTexto(inv) + " en ambos miembros";
      }
      var notas = [{ t: nota, color: COLOR_PRODUCTO }];
      if (a.n < 0 && rel !== "=") notas.push({ t: "(se invierte la desigualdad)", color: COLOR_PRODUCTO });
      var s = [{ t: seg, color: COLOR_PRODUCTO }];
      poner(simple(L).concat(s), simple(R).concat(s), rel2, notas);
      poner([{ t: vari }], [{ t: frTexto(val) }], rel2);
    }
    var x = frValor(val), tx = frTexto(val);
    var tr = {
      "=": { a: x, b: x, ca: true, cb: true, ta: tx, tb: tx },
      "<": { a: -Infinity, b: x, ca: false, cb: false, ta: "−∞", tb: tx },
      "≤": { a: -Infinity, b: x, ca: false, cb: true, ta: "−∞", tb: tx },
      ">": { a: x, b: Infinity, ca: false, cb: false, ta: tx, tb: "∞" },
      "≥": { a: x, b: Infinity, ca: true, cb: false, ta: tx, tb: "∞" },
    }[rel2];
    return { lineas: lineas, tramos: [tr] };
  }

  function textoConjuntoAbs(lista) {
    if (lista.length === 1 && lista[0].a === -Infinity && lista[0].b === Infinity) return "ℝ";
    // solo puntos sueltos: {−4, −2/3}
    if (lista.length > 1 && lista.every(function (t) { return t.a === t.b; }))
      return "{" + lista.map(function (t) { return t.ta; }).join(", ") + "}";
    return textoResultado(lista).replace(/-∞/g, "−∞");
  }
  // intervalo como lo lee la recta real ({2} -> [2, 2])
  function textoRectaAbs(t) {
    return (t.ca ? "[" : "(") + (t.a === -Infinity ? "−∞" : t.ta) + ", " + (t.b === Infinity ? "∞" : t.tb) + (t.cb ? "]" : ")");
  }

  // Resolucion recursiva: cada relacion se separa en los dos casos del valor
  // absoluto de mas a la izquierda; si la condicion o la ecuacion de un caso
  // todavia tienen valores absolutos, se vuelven a separar (y asi
  // sucesivamente). Nodo: { hoja: { lineas, tramos }, tramos } o
  // { texto, casos: [{ cond, ec, res }], tramos } (cond y ec son nodos).
  var MAX_ABS = 3;
  function contarAbs(s) { return (String(s).match(/\|/g) || []).length / 2; }
  function resolverNodoAbs(txt, vari, estricto) {
    if (String(txt).indexOf("|") < 0) {
      var h = resolverLineal(txt, vari);
      return { hoja: h, tramos: h.tramos };
    }
    var a = leerEcuacionAbs(txt);
    if (a.error) errAbs(a.error);
    var cs = casosAbs(a, estricto);
    var casos = [0, 1].map(function (k) {
      var cond = resolverNodoAbs(cs.cond[k], vari, estricto), ec = resolverNodoAbs(cs.ec[k], vari, estricto);
      return { cond: cond, ec: ec, res: intersecar(cond.tramos, ec.tramos) };
    });
    return { texto: a.s, casos: casos, tramos: unir(casos[0].res, casos[1].res) };
  }

  // { vari, nodo } o { error }
  function resolverAbs(a, estricto) {
    var letras = (a.s.match(/[A-Za-z]/g) || []).filter(function (c, i, l) { return l.indexOf(c) === i; });
    if (!letras.length) return { error: "Falta la incógnita (x)" };
    if (letras.length > 1) return { error: "Para resolver se admite una sola variable (hay " + letras.join(", ") + ")" };
    if (contarAbs(a.s) > MAX_ABS) return { error: "Para resolver se admiten hasta " + MAX_ABS + " valores absolutos" };
    try {
      return { vari: letras[0], nodo: resolverNodoAbs(a.s, letras[0], estricto) };
    } catch (e) {
      if (e && e.msjAbs) return { error: e.msjAbs };
      throw e;
    }
  }

  // escribe una linea con su relacion en xRel; devuelve su borde derecho
  function dibujarLineaAbs(l, xRel, y, tam, fuente, agregar) {
    var segs = l.izq.concat([{ t: " " + l.rel + " " }], l.der), juntos = [];
    segs.forEach(function (s) {
      var u = juntos[juntos.length - 1], c = s.color || TINTA;
      if (u && u.color === c) u.t += s.t;
      else juntos.push({ t: s.t, color: c });
    });
    var x0 = xRel - medir(textoSegs(l.izq) + " ", tam, fuente), pre = "";
    juntos.forEach(function (s) {
      var lead = s.t.length - s.t.replace(/^\s+/, "").length, limpio = s.t.trim();
      if (limpio) agregar(texto(x0 + medir(pre + s.t.slice(0, lead), tam, fuente), y, limpio, tam, fuente, s.color, "left"));
      pre += s.t;
    });
    return x0 + medir(pre, tam, fuente);
  }

  // c: { tam, fuente, lh, paso, tamN, op, color, agregar }
  // Hoja: las lineas con las relaciones alineadas; la primera empieza en x y
  // las demas no pasan de xMin. Con `notas`, lo que se hace en cada paso va a
  // la derecha, en el renglon anterior al paso. Devuelve { y, x1, finCab }.
  function dibujarHojaAbs(h, x, xMin, y, c, notas) {
    var tam = c.tam, fuente = c.fuente, lh = c.lh, L = h.lineas;
    var antes = function (l) { return medir(textoSegs(l.izq) + " ", tam, fuente); };
    var ancho = function (l) { return medir(textoLineaAbs(l), tam, fuente); };
    var xRel = x + antes(L[0]);
    L.forEach(function (l, i) { if (i) xRel = Math.max(xRel, xMin + antes(l)); });
    var der = 0;
    L.forEach(function (l) { der = Math.max(der, xRel - antes(l) + ancho(l)); });
    var xNota = der + tam * 1.5, x1 = der, hN = c.tamN * fuente.lh;
    var nota = function (m, yl) {
      if (!notas || !c.op.notas || !m || !m.nota) return;
      m.nota.forEach(function (n, j) {
        c.agregar(texto(xNota, yl + (lh - m.nota.length * hN) / 2 + j * hN, n.t, c.tamN, fuente, n.color, "left"));
        x1 = Math.max(x1, xNota + medir(n.t, c.tamN, fuente));
      });
    };
    L.forEach(function (l, i) {
      var yl = y + i * c.paso;
      dibujarLineaAbs(l, xRel, yl, tam, fuente, c.agregar);
      if (l.notaFinal) nota(l, yl);
      var sig = L[i + 1];
      if (sig && !sig.notaFinal) nota(sig, yl);
    });
    return { y: y + L.length * c.paso, x1: x1, finCab: xRel - antes(L[0]) + ancho(L[0]) };
  }
  function dibujarBloqueAbs(b, x, xMin, y, c, notas) {
    return b.hoja ? dibujarHojaAbs(b.hoja, x, xMin, y, c, notas) : dibujarNodoAbs(b, x, y, c, false);
  }

  // Nodo: la relacion con una llave debajo; de la llave baja una linea que
  // se abre en los dos casos (la condicion, una flecha y la relacion del
  // caso, cada una resuelta o separada otra vez en casos), la interseccion
  // de cada caso, su recta real y al final la union de los dos casos.
  function dibujarNodoAbs(N, x, y, c, raiz) {
    var tam = c.tam, fuente = c.fuente, lh = c.lh;
    var ln = { strokeColor: c.color, strokeWidth: 2 };
    var fl = { type: "arrow", endArrowhead: "arrow", strokeColor: c.color, strokeWidth: 2 };
    var wEc = medir(N.texto, tam, fuente), yLlave = y + lh + tam * 0.3, pata = tam * 0.4;
    var xTallo = x + tam * 1.2, xCond = xTallo + tam * 3;
    var yy = yLlave + lh * 0.7, medios = [], bloques = [], x1 = x + wEc;
    N.casos.forEach(function (cs) {
      // cada caso se arma aparte (para saber hasta donde baja el tallo)
      var els = [], cc = {};
      for (var k in c) cc[k] = c[k];
      cc.agregar = function (e) { els.push(e); return e; };
      var yk = yy, ym = yk + lh / 2;
      medios.push(ym);
      cc.agregar(trazo([[xTallo, ym], [xCond - tam * 0.5, ym]], fl));
      var rc = dibujarBloqueAbs(cs.cond, xCond, xTallo + tam * 0.8, yk, cc, false);
      var xEc = Math.max(rc.x1 + tam * 1.5, rc.finCab + Math.max(tam * 5, 80));
      cc.agregar(trazo([[rc.finCab + tam * 0.6, ym], [xEc, ym]], fl));
      var re = dibujarBloqueAbs(cs.ec, xEc + tam * 0.6, xEc + tam * 0.3, yk, cc, true);
      // interseccion de la condicion con lo que dio el caso
      var yI = Math.max(rc.y, re.y) + lh * 0.4;
      var tC = textoConjuntoAbs(cs.cond.tramos), tE = textoConjuntoAbs(cs.ec.tramos);
      var wC = medir(tC, tam, fuente), wE = medir(tE, tam, fuente);
      var xC = xCond, xE = Math.max(xC + wC + tam * 3, xEc + tam * 0.6), subr = yI + lh + 3;
      var igual = " = " + textoConjuntoAbs(cs.res);
      cc.agregar(texto(xC, yI, tC, tam, fuente, TINTA, "left"));
      cc.agregar(trazo([[xC, subr], [xC + wC, subr]], { strokeColor: COLOR_CONDICION, strokeWidth: 2.5 }));
      cc.agregar(texto((xC + wC + xE) / 2, yI, "∩", tam, fuente, TINTA, "center"));
      cc.agregar(texto(xE, yI, tE, tam, fuente, TINTA, "left"));
      cc.agregar(trazo([[xE, subr], [xE + wE, subr]], { strokeColor: COLOR_CASO, strokeWidth: 2.5 }));
      cc.agregar(texto(xE + wE, yI, igual, tam, fuente, TINTA, "left"));
      x1 = Math.max(x1, rc.x1, re.x1, xE + wE + medir(igual, tam, fuente));
      yy = yI + lh + tam * 0.6;
      // recta real con los dos conjuntos rayados
      var filasR = [];
      if (cs.cond.tramos.length) filasR.push({ texto: cs.cond.tramos.map(textoRectaAbs).join(" ∪ "), color: COLOR_CONDICION });
      if (cs.ec.tramos.length) filasR.push({ texto: cs.ec.tramos.map(textoRectaAbs).join(" ∪ "), color: COLOR_CASO });
      if (c.op.recta && filasR.length) {
        var opR = Object.assign(copiar(GEN.recta.defecto), {
          filas: filasR, operacion: "interseccion", mostrarUnion: false, mostrarResultado: false, referencia: false,
          ocultarNumeros: true, largo: x1 - xTallo > 760 ? "media" : "corta", tamExtremos: c.op.tamTexto, fuente: c.op.fuente,
          estilo: c.op.estiloRecta === "lineas" ? "lineas" : "rayado",
        });
        var tmp = [];
        generarRecta(opR, 0, 0, function (e) { tmp.push(e); return e; });
        if (tmp.length) {
          var b = cajaDe(tmp), dx = xTallo + tam * 1.5 - b.x0, dy = yy + tam * 0.4 - b.y0;
          tmp.forEach(function (e) { e.x += dx; e.y += dy; cc.agregar(e); });
          yy += tam * 0.4 + (b.y1 - b.y0);
        }
      }
      yy += lh * 1.2;
      bloques.push(els);
    });
    // en orden de dibujo: la relacion, la llave, el tallo y los dos casos
    c.agregar(texto(x, y, N.texto, tam, fuente, TINTA, "left"));
    c.agregar(trazo([[x - 4, yLlave - pata], [x - 4, yLlave], [x + wEc + 4, yLlave], [x + wEc + 4, yLlave - pata]], ln));
    c.agregar(trazo([[xTallo, yLlave], [xTallo, medios[medios.length - 1]]], ln));
    bloques.forEach(function (els) { els.forEach(c.agregar); });
    // union de los dos casos: el conjunto solucion (o el de este subcaso)
    var R1 = N.casos[0].res, R2 = N.casos[1].res, tU = textoConjuntoAbs(N.tramos);
    var union = textoConjuntoAbs(R1) + " ∪ " + textoConjuntoAbs(R2);
    var sol = (raiz ? "Conjunto solución: " : "Solución de " + N.texto + ": ") + union;
    if (!R1.length || !R2.length || tU !== union) sol += " = " + tU;
    c.agregar(texto(x + tam, yy, sol, tam, fuente, raiz ? TINTA : c.color, "left"));
    x1 = Math.max(x1, x + tam + medir(sol, tam, fuente));
    return { y: yy + lh * (raiz ? 1 : 1.4), x1: x1, finCab: x + wEc };
  }

  function generarAbsResuelta(op, a, fila, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20, lh = tam * fuente.lh;
    var r = resolverAbs(a, op.casos === "estricto");
    if (r.error) return oy;
    var c = { tam: tam, fuente: fuente, lh: lh, paso: lh * 1.15, tamN: TAM_NOTA[op.tamTexto] || 16, op: op,
      color: op.colorLineas ? fila.color : TINTA, agregar: agregar };
    return dibujarNodoAbs(r.nodo, ox, oy, c, true).y;
  }

  function generarAbs(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var lh = tam * fuente.lh, renglones = Math.max(0, Math.round(Number(op.renglones) || 0));
    var y = oy;
    op.filas.forEach(function (fila) {
      var a = leerEcuacionAbs(fila.texto);
      if (a.error) return;
      if (op.modoAbs !== "plantilla") {
        y = generarAbsResuelta(op, a, fila, ox, y, agregar) + lh * 2;
        return;
      }
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

  // ================== INECUACIONES CON LA REGLA DE LOS SIGNOS (motor comun)
  // Un producto A · B (o, mas adelante, un cociente A / B) comparado con 0 se
  // separa en dos casos segun los signos (+·+ ∨ −·− si es > 0; +·− ∨ −·+ si
  // es < 0). Cada caso son dos inecuaciones lineales (columnas) que se
  // resuelven paso a paso y se intersecan; al final se unen los dos casos.
  var REL_INV = { "<": ">", ">": "<", "≤": "≥", "≥": "≤" };
  // casos para A · B rel 0: [[relA, relB, etiqueta], ...]
  function casosSignos(rel) {
    switch (rel) {
      case ">": return [[">", ">", "+ · +"], ["<", "<", "− · −"]];
      case "≥": return [["≥", "≥", "+ · +"], ["≤", "≤", "− · −"]];
      case "<": return [[">", "<", "+ · −"], ["<", ">", "− · +"]];
      default: return [["≥", "≤", "+ · −"], ["≤", "≥", "− · +"]];
    }
  }
  // casos para A / B rel 0 (el denominador nunca es 0: siempre estricto)
  function casosCociente(rel) {
    var et = function (a, b) { return FrF(a, b); };
    switch (rel) {
      case ">": return [[">", ">", et("+", "+")], ["<", "<", et("−", "−")]];
      case "≥": return [["≥", ">", et("+", "+")], ["≤", "<", et("−", "−")]];
      case "<": return [[">", "<", et("+", "−")], ["<", ">", et("−", "+")]];
      default: return [["≥", "<", et("+", "−")], ["≤", ">", et("−", "+")]];
    }
  }
  // Factor x − r con r irracional ({ u, w, m, s }): x − r rel 0 -> se suma r
  // en ambos miembros -> x rel r. Los extremos se ordenan por su valor y se
  // escriben con la raiz.
  function hojaRaizIrracional(factor, rel, R, vari) {
    var rT = textoRaizX(R), val = frValor(R.u) + R.s * frValor(R.w) * Math.sqrt(R.m);
    // se suma r (o, si r = −√2, se resta √2)
    var resta = /^−[^ ]+$/.test(rT), rA = resta ? rT.slice(1) : rT;
    var suma = (resta ? " − " : " + ") + (/ /.test(rA) && !/^\(/.test(rA) ? "(" + rA + ")" : rA);
    var lineas = [
      { izq: [{ t: factor }], rel: rel, der: [{ t: "0" }] },
      { izq: [{ t: factor }, { t: suma, color: COLOR_SUMA }], rel: rel, der: [{ t: "0" }, { t: suma, color: COLOR_SUMA }],
        nota: [{ t: (resta ? "Restar " : "Sumar ") + rA + " en ambos miembros", color: COLOR_SUMA }] },
      { izq: [{ t: vari }], rel: rel, der: [{ t: rT }] },
    ];
    var tr = {
      "<": { a: -Infinity, b: val, ca: false, cb: false, ta: "−∞", tb: rT },
      "≤": { a: -Infinity, b: val, ca: false, cb: true, ta: "−∞", tb: rT },
      ">": { a: val, b: Infinity, ca: false, cb: false, ta: rT, tb: "∞" },
      "≥": { a: val, b: Infinity, ca: true, cb: false, ta: rT, tb: "∞" },
    }[rel];
    return { lineas: lineas, tramos: [tr] };
  }
  // S: { A, B (textos), rel, vari, cociente, raices } -> { casos: [{ etq, ha, hb, res }], tramos }
  function resolverSignos(S) {
    var rs = S.raices || [];
    var hoja = function (f, rel, R) { return R ? hojaRaizIrracional(f, rel, R, S.vari) : resolverLineal(f + " " + rel + " 0", S.vari); };
    var casos = (S.cociente ? casosCociente : casosSignos)(S.rel).map(function (q) {
      var ha = hoja(S.A, q[0], rs[0]), hb = hoja(S.B, q[1], rs[1]);
      return { etq: q[2], ha: ha, hb: hb, res: intersecar(ha.tramos, hb.tramos) };
    });
    return { casos: casos, tramos: unir(casos[0].res, casos[1].res) };
  }

  // Puntos de corte de un dibujo (para repartirlo en hojas A4, ver
  // solucionario.js): a cada elemento de la regla de los signos se le anota si
  // es de la cabecera ({ cab }) o de que caso es ({ caso }). En un WeakMap, para
  // que no quede nada guardado en los elementos.
  var CORTES = typeof WeakMap === "function" ? new WeakMap() : null;
  function anotarCorte(e, info) { if (CORTES) CORTES.set(e, info); return e; }
  function corteDe(e) { return CORTES ? CORTES.get(e) : undefined; }
  // un titulo de un calculo que se puede partir entre hojas: no se separa del
  // renglon que le sigue (ver «partir» en solucionario.js)
  var UNIDOS = typeof WeakSet === "function" ? new WeakSet() : null;
  function unirConSiguiente(e) { if (UNIDOS) UNIDOS.add(e); return e; }
  function unidoDe(e) { return !!(UNIDOS && UNIDOS.has(e)); }

  // Dibuja la cabecera (con llave y la regla: → +·+ ∨ −·−), los dos casos y
  // el conjunto solucion. c como en dibujarNodoAbs. Devuelve la y de abajo.
  // El tallo de la llave va en un tramo por caso, que llega hasta donde
  // empieza el caso siguiente: asi se puede cortar la hoja entre dos casos
  // (repitiendo la cabecera arriba de la hoja nueva).
  function dibujarSignos(cab, R, x, y, c) {
    var tam = c.tam, fuente = c.fuente, lh = c.lh;
    var ln = { strokeColor: c.color, strokeWidth: 2 };
    var fl = { type: "arrow", endArrowhead: "arrow", strokeColor: c.color, strokeWidth: 2 };
    // la cabecera y las etiquetas pueden tener fracciones (items de dibujarItsF)
    var cabI = itF(cab), mCab = medirItsF(cabI, tam, fuente), wCab = mCab.w, ym0 = y + mCab.ar;
    var yLlave = y + mCab.ar + mCab.ab + tam * 0.3, pata = tam * 0.4;
    var etqs = R.casos.map(function (cs) { return itF(cs.etq); });
    var mEtq = etqs.map(function (e) { return medirItsF(e, tam, fuente); });
    var altoEtq = Math.max.apply(null, mEtq.map(function (m) { return m.ar; })) - lh / 2;
    var xTallo = x + tam * 1.2, xEtq = xTallo + tam * 3, yy = yLlave + lh * 0.7 + altoEtq, medios = [], bloques = [], x1 = x + wCab;
    var wEtq = Math.max.apply(null, mEtq.map(function (m) { return m.w; }));
    var inicios = []; // donde empieza (arriba) cada caso
    R.casos.forEach(function (cs, ic) {
      var els = [], cc = {};
      for (var k in c) cc[k] = c[k];
      cc.agregar = function (e) { els.push(e); return e; };
      var yk = yy, ym = yk + lh / 2;
      medios.push(ym);
      inicios.push(yk - Math.max(0, altoEtq) - 2);
      // → +·+ → columna A  ∧  columna B
      cc.agregar(trazo([[xTallo, ym], [xEtq - tam * 0.5, ym]], fl));
      dibujarItsF(etqs[ic], xEtq, ym, c.color, tam, fuente, cc.agregar);
      var xA = xEtq + wEtq + tam * 3.5;
      cc.agregar(trazo([[xEtq + wEtq + tam * 0.5, ym], [xA - tam * 0.5, ym]], fl));
      var ra = dibujarHojaAbs(cs.ha, xA, xA - tam * 1.5, yk, cc, true);
      var xY = ra.x1 + tam * 1.5, xB = xY + medir("∧", tam, fuente) + tam * 1.5;
      cc.agregar(texto(xY, yk, "∧", tam, fuente, TINTA, "left"));
      var rb = dibujarHojaAbs(cs.hb, xB, xB - tam * 1.5, yk, cc, true);
      // interseccion de las dos columnas
      var yI = Math.max(ra.y, rb.y) + lh * 0.4;
      var tA = textoConjuntoAbs(cs.ha.tramos), tB = textoConjuntoAbs(cs.hb.tramos);
      var wA = medir(tA, tam, fuente), wB = medir(tB, tam, fuente), subr = yI + lh + 3;
      var xa = xA, xb = Math.max(xa + wA + tam * 3, xB), igual = " = " + textoConjuntoAbs(cs.res);
      cc.agregar(texto(xa, yI, tA, tam, fuente, TINTA, "left"));
      cc.agregar(trazo([[xa, subr], [xa + wA, subr]], { strokeColor: COLOR_CONDICION, strokeWidth: 2.5 }));
      cc.agregar(texto((xa + wA + xb) / 2, yI, "∩", tam, fuente, TINTA, "center"));
      cc.agregar(texto(xb, yI, tB, tam, fuente, TINTA, "left"));
      cc.agregar(trazo([[xb, subr], [xb + wB, subr]], { strokeColor: COLOR_CASO, strokeWidth: 2.5 }));
      cc.agregar(texto(xb + wB, yI, igual, tam, fuente, TINTA, "left"));
      x1 = Math.max(x1, ra.x1, rb.x1, xb + wB + medir(igual, tam, fuente));
      yy = yI + lh + tam * 0.6;
      // recta real con los dos conjuntos rayados
      var filasR = [];
      if (cs.ha.tramos.length) filasR.push({ texto: cs.ha.tramos.map(textoRectaAbs).join(" ∪ "), color: COLOR_CONDICION });
      if (cs.hb.tramos.length) filasR.push({ texto: cs.hb.tramos.map(textoRectaAbs).join(" ∪ "), color: COLOR_CASO });
      if (c.op.recta && filasR.length) {
        var opR = Object.assign(copiar(GEN.recta.defecto), {
          filas: filasR, operacion: "interseccion", mostrarUnion: false, mostrarResultado: false, referencia: false,
          ocultarNumeros: true, largo: x1 - xTallo > 760 ? "media" : "corta", tamExtremos: c.op.tamTexto, fuente: c.op.fuente,
          estilo: c.op.estiloRecta === "lineas" ? "lineas" : "rayado",
        });
        var tmp = [];
        generarRecta(opR, 0, 0, function (e) { tmp.push(e); return e; });
        if (tmp.length) {
          var b = cajaDe(tmp), dx = xTallo + tam * 1.5 - b.x0, dy = yy + tam * 0.4 - b.y0;
          tmp.forEach(function (e) { e.x += dx; e.y += dy; cc.agregar(e); });
          yy += tam * 0.4 + (b.y1 - b.y0);
        }
      }
      // el ultimo caso deja menos lugar: abajo sigue el conjunto solucion
      yy += ic < R.casos.length - 1 ? lh * 1.2 + altoEtq : lh * 0.5;
      bloques.push(els);
    });
    // cabecera: la inecuacion, la llave, → y la regla de los signos
    var infoCab = { cab: true, xTallo: xTallo, yLlave: yLlave, sep: inicios[0] - yLlave };
    var agCab = function (e) { return c.agregar(anotarCorte(e, infoCab)); };
    dibujarItsF(cabI, x, ym0, TINTA, tam, fuente, agCab);
    agCab(trazo([[x - 4, yLlave - pata], [x - 4, yLlave], [x + wCab + 4, yLlave], [x + wCab + 4, yLlave - pata]], ln));
    var xr = x + wCab + tam * 0.8;
    agCab(trazo([[xr, ym0], [xr + tam * 2.5, ym0]], fl));
    dibujarItsF(etqs[0].concat([TF("   ∨   ")], etqs[1]), xr + tam * 3, ym0, c.color, tam, fuente, agCab);
    // el tallo, un tramo por caso; despues, cada caso
    var nC = R.casos.length;
    bloques.forEach(function (els, ic) {
      var y0 = ic ? inicios[ic] : yLlave, y1 = ic < nC - 1 ? inicios[ic + 1] : medios[ic];
      // corto: hasta la flecha del caso (si la hoja se corta despues de este caso)
      c.agregar(anotarCorte(trazo([[xTallo, y0], [xTallo, y1]], ln), { caso: ic, tallo: true, corto: medios[ic] - y0 }));
      els.forEach(function (e) { c.agregar(anotarCorte(e, { caso: ic })); });
    });
    var R1 = R.casos[0].res, R2 = R.casos[1].res, tU = textoConjuntoAbs(R.tramos), union = textoConjuntoAbs(R1) + " ∪ " + textoConjuntoAbs(R2);
    var sol = "Conjunto solución: " + union + (!R1.length || !R2.length || tU !== union ? " = " + tU : "");
    c.agregar(anotarCorte(texto(x + tam, yy, sol, tam, fuente, TINTA, "left"), { caso: nC - 1 }));
    return yy + lh;
  }

  // ======================================== INECUACIONES DE SEGUNDO GRADO
  // Factorizada: (5x − 2)(3 − 6x) > 0, 0 < (5x − 2)(3 − 6x), 2(x − 1)(x + 3) ≤ 0.
  // Desarrollada: x² − 5x + 6 < 0 (se buscan las raices y se factoriza).
  // Devuelve { previos: [lineas para dibujarBloqueF], cab, signos: {A, B, rel,
  // vari}, fin: texto si se resuelve sin casos } o { error }.
  function leerInecuacion2(txt, color) {
    var t = normalizarPoli(txt).replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/\s+/g, " ").trim();
    if (!t) return { error: "Escribí la inecuación, por ejemplo: (5x − 2)(3 − 6x) > 0" };
    var rels = t.match(/[<>≤≥]/g) || [];
    if (rels.length !== 1 || /[=≠]/.test(t)) return { error: "Tiene que haber un solo <, >, ≤ o ≥: (5x − 2)(3 − 6x) > 0" };
    var rel = rels[0], p = t.indexOf(rel), izq = t.slice(0, p).trim(), der = t.slice(p + 1).trim();
    if (!izq || !der) return { error: "Falta un miembro de la inecuación" };
    var letras = (t.match(/[A-Za-z]/g) || []).filter(function (c, i, l) { return l.indexOf(c) === i; });
    if (letras.length !== 1) return { error: letras.length ? "Usá una sola variable" : "Falta la incógnita (x)" };
    var v = letras[0];
    try {
      // coeficientes por grado [c, b, a] (sin juntarLineal: ese mezcla x² con x)
      var coefs = function (L) {
        var co = [fr(0), fr(0), fr(0)];
        L.forEach(function (m) { co[m.x] = frSuma(co[m.x], m.c); });
        return co;
      };
      var esCero = function (s) { return coefs(leerLineal(s, v, 2)).every(frCero); };
      var lado, relP, inv = false;
      if (esCero(der)) { lado = izq; relP = rel; }
      else if (esCero(izq)) { lado = der; relP = REL_INV[rel]; inv = true; }
      else lado = null;
      // factorizada: [k](A)(B)
      var mF = lado && /^([−+]?\s*[0-9/]*)\s*\(([^()]+)\)\s*·?\s*\(([^()]+)\)$/.exec(lado);
      if (mF) {
        var fac = [mF[2], mF[3]].map(function (f) {
          var L = leerLineal(f, v);
          if (!L.some(function (m) { return m.x && !frCero(m.c); })) errAbs("Cada factor tiene que tener " + v + ": (5x − 2)(3 − 6x)");
          return textoLineal(juntarLineal(L), v);
        });
        var kTxt = mF[1].replace(/\s/g, ""), k = kTxt === "" || kTxt === "+" ? fr(1) : kTxt === "−" ? fr(-1)
          : (function () { var c = coefLineal(leerLineal(kTxt.replace(/^\+/, ""), v)); return c.b; })();
        if (frCero(k)) return { error: "El factor numérico no puede ser 0" };
        var prod = "(" + fac[0] + ")(" + fac[1] + ")";
        var previos = [];
        if (!frUno(k)) {
          // se divide por el numero de adelante (si es negativo, se invierte)
          var pre = k.n === -1 && k.d === 1 ? "−" : frTexto(k), rel2 = k.n < 0 ? REL_INV[relP] : relP;
          previos.push(LnF(null, null, inv ? "0 " + rel + " " + pre + prod : pre + prod + " " + rel + " 0"));
          previos.push(LnF(null, null, "",
            notaF(["Dividir ambos miembros por " + frTexto(k)].concat(k.n < 0 ? ["(se invierte la desigualdad)"] : []), COLOR_PRODUCTO)));
          return { previos: previos, cab: prod + " " + rel2 + " 0", signos: { A: fac[0], B: fac[1], rel: rel2, vari: v } };
        }
        return { previos: [], cab: inv ? "0 " + rel + " " + prod : prod + " " + rel + " 0", signos: { A: fac[0], B: fac[1], rel: relP, vari: v } };
      }
      // desarrollada: todo a un miembro, raices y factorizacion
      var co = coefs(leerLineal(izq, v, 2).concat(leerLineal(der, v, 2).map(function (m) { return { c: frNeg(m.c), x: m.x }; })));
      var a = co[2], b = co[1], c0 = co[0];
      if (frCero(a)) return { error: "No es de segundo grado: falta el término con " + v + "² (o escribila factorizada)" };
      var L = [], poli = poliF(a, b, c0, v);
      L.push(LnF(null, null, t));
      if (!lado) L.push(LnF(null, null, poli + " " + rel + " 0", notaF("Pasar todo al primer miembro", COLOR_SUMA)));
      else if (inv) { L.push(LnF(null, null, poli + " " + relP + " 0", notaF("Leerla al revés: 0 " + rel + " P equivale a P " + relP + " 0", TINTA))); }
      var relQ = lado ? relP : rel;
      // factorizacion con la formula cuadratica (la misma de "Factorizacion
      // de polinomios"), aclarando que hay otros metodos
      var nom = "P(" + v + ")";
      L.push(libreF(LnF(null, null, "Factorizamos " + nom + " = " + poli + " con la fórmula cuadrática")));
      L.push(libreF(LnF(null, null, "(también se puede completando el cuadrado o por descomposición):")));
      var form = metodoFormula({ a: a, b: b, c: c0, vari: v }, nom, color || TINTA);
      form[0].corte = true;
      L = L.concat(form);
      var D = frRes(frMul(b, b), frMul(fr(4), frMul(a, c0)));
      if (D.n < 0) {
        var siempre = a.n > 0 ? "positivo" : "negativo";
        var cumple = (a.n > 0) === (relQ === ">" || relQ === "≥");
        var expl = libreF(LnF(null, null, "Como no tiene raíces reales, " + poli + " es siempre " + siempre + " (el signo de a)"));
        expl.corte = true;
        L.push(expl);
        return { previos: L, fin: "Conjunto solución: " + (cumple ? "ℝ" : "∅") };
      }
      // las raices, en el mismo orden que la formula (x₁ con +, x₂ con −)
      var rz = raizRacional(D), den = frMul(fr(2), a), R1, R2;
      if (rz.m === 1) { R1 = { r: frDiv(frSuma(frNeg(b), rz.coef), den) }; R2 = { r: frDiv(frRes(frNeg(b), rz.coef), den) }; }
      else {
        var u = frDiv(frNeg(b), den), w = frDiv(rz.coef, den), sg = w.n < 0 ? -1 : 1;
        R1 = { u: u, w: frAbs(w), m: rz.m, s: sg }; R2 = { u: u, w: frAbs(w), m: rz.m, s: -sg };
      }
      var f1 = factorX(R1, v, true), f2 = factorX(R2, v, true);
      var prod2 = "(" + f1 + ")(" + f2 + ")", pre2 = prefijoF(a);
      // el ultimo paso solo se anuncia: su resultado es la cabecera de los casos
      var notaReemp = notaF("Reemplazar " + nom + " por su forma factorizada", COLOR_PRODUCTO), relF = relQ;
      if (pre2) {
        var reemp = LnF(null, null, pre2 + prod2 + " " + relQ + " 0", notaReemp);
        reemp.corte = true;
        L.push(reemp);
        relF = a.n < 0 ? REL_INV[relQ] : relQ;
        L.push(LnF(null, null, "", notaF(["Dividir ambos miembros por " + frTexto(a)].concat(a.n < 0 ? ["(se invierte la desigualdad)"] : []), COLOR_PRODUCTO)));
      } else L.push(LnF(null, null, "", notaReemp));
      return { previos: L, cab: prod2 + " " + relF + " 0",
        signos: { A: f1, B: f2, rel: relF, vari: v, raices: [R1.r ? null : R1, R2.r ? null : R2] } };
    } catch (e) {
      if (e && e.msjAbs) return { error: e.msjAbs };
      throw e;
    }
  }

  function generarInecuaciones2(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20, lh = tam * fuente.lh, y = oy;
    op.filas.forEach(function (fila) {
      var I = leerInecuacion2(fila.texto, fila.color);
      if (I.error) return;
      var c = { tam: tam, fuente: fuente, lh: lh, paso: lh * 1.15, tamN: TAM_NOTA[op.tamTexto] || 16, op: op,
        color: op.colorLineas ? fila.color : TINTA, agregar: agregar };
      if (I.previos.length) y = dibujarBloqueF(I.previos, ox, y, op, agregar) + lh * 0.8;
      if (I.fin) { agregar(texto(ox + tam, y, I.fin, tam, fuente, TINTA, "left")); y += lh * 3; return; }
      var R;
      try { R = resolverSignos(I.signos); } catch (e) { if (e && e.msjAbs) return; throw e; }
      y = dibujarSignos(I.cab, R, ox, y, c) + lh * 2;
    });
  }

  // =========================================== INECUACIONES RACIONALES
  // (2x + 1)/(3 − 4x) < −2, 0 ≤ (x − 1)/(x + 2), 3 > (x + 1)/x ...
  // Numerador y denominador lineales (el denominador con x) y del otro lado
  // un numero. Si no es 0, se pasa restando (o sumando) en ambos miembros,
  // se suman las fracciones con el denominador comun, se aplica la
  // distributiva y se juntan los semejantes. Despues, la regla de los
  // signos con A / B comparado con 0 (el denominador siempre estricto).
  // Devuelve { previos, cab (items), signos } o { error }.
  function partirFraccion(s) {
    var n = 0, p = -1;
    for (var i = 0; i < s.length; i++) {
      if (s[i] === "(" || s[i] === "[") n++;
      else if (s[i] === ")" || s[i] === "]") n--;
      else if ((s[i] === "/" || s[i] === ":") && n === 0) { if (p >= 0) return null; p = i; }
    }
    if (p < 0) return null;
    var sin = function (t) { t = t.trim(); return /^\(.*\)$/.test(t) && partirFraccionBalance(t.slice(1, -1)) ? t.slice(1, -1).trim() : t; };
    return [sin(s.slice(0, p)), sin(s.slice(p + 1))];
  }
  // ¿los parentesis de adentro estan balanceados? ((a)(b) no es (a)·(b) entre parentesis)
  function partirFraccionBalance(t) {
    var n = 0;
    for (var i = 0; i < t.length; i++) {
      if (t[i] === "(") n++;
      else if (t[i] === ")" && --n < 0) return false;
    }
    return n === 0;
  }

  function leerInecuacionRacional(txt) {
    var t = normalizarPoli(txt).replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/\s+/g, " ").trim();
    if (!t) return { error: "Escribí la inecuación, por ejemplo: (2x + 1)/(3 − 4x) < −2" };
    var rels = t.match(/[<>≤≥]/g) || [];
    if (rels.length !== 1 || /[=≠]/.test(t)) return { error: "Tiene que haber un solo <, >, ≤ o ≥: (2x + 1)/(3 − 4x) < −2" };
    var rel = rels[0], p = t.indexOf(rel), izq = t.slice(0, p).trim(), der = t.slice(p + 1).trim();
    if (!izq || !der) return { error: "Falta un miembro de la inecuación" };
    var letras = (t.match(/[A-Za-z]/g) || []).filter(function (c, i, l) { return l.indexOf(c) === i; });
    if (letras.length !== 1) return { error: letras.length ? "Usá una sola variable" : "Falta la incógnita (x)" };
    var v = letras[0];
    try {
      var tieneX = function (L) { return L.some(function (m) { return m.x && !frCero(m.c); }); };
      var fI = partirFraccion(izq), fD = partirFraccion(der), frac, otro, inv = false;
      if (fI && !tieneX(leerLineal(der, v))) { frac = fI; otro = der; }
      else if (fD && !tieneX(leerLineal(izq, v))) { frac = fD; otro = izq; inv = true; }
      else return { error: "De un lado va la fracción (2x + 1)/(3 − 4x) y del otro un número" };
      var LA = leerLineal(frac[0], v), LB = leerLineal(frac[1], v);
      if (!tieneX(LB)) return { error: "El denominador tiene que tener " + v + " (si no, es una inecuación lineal)" };
      var A = textoLineal(juntarLineal(LA), v), B = textoLineal(juntarLineal(LB), v);
      var k = coefLineal(leerLineal(otro, v)).b, relF = inv ? REL_INV[rel] : rel;
      var F = function (num) { return FrF(num, B); };
      var L = [];
      L.push(LnF(null, null, inv ? [frTexto(k) + " " + rel + " ", F(A)] : [F(A), " " + rel + " " + frTexto(k)]));
      if (inv) L.push(LnF(null, null, [F(A), " " + relF + " " + frTexto(k)],
        notaF("Leerla al revés: " + frTexto(k) + " " + rel + " A/B equivale a A/B " + relF + " " + frTexto(k), TINTA)));
      // restriccion: el denominador no puede ser 0 (va al final, antes de los casos)
      var cB = coefLineal(juntarLineal(LB)), cero = frDiv(frNeg(cB.b), cB.a);
      var restr = libreF(LnF(null, null, "Restricción: " + B + " ≠ 0" + (B === v ? "" : "  ⇒  " + v + " ≠ " + frTexto(cero))));
      var Ntxt = A;
      if (!frCero(k)) {
        // se pasa el numero al otro miembro: m = −k (se suma m en ambos miembros)
        var m = frNeg(k), mas = m.n > 0, mA = frAbs(m), mT = frTexto(mA);
        var sg = mas ? " + " : " − ";
        L.push(LnF(null, null, [F(A), TF(sg, COLOR_SUMA), { frac: [itF(TF(mT, COLOR_SUMA)), itF(TF("1", COLOR_SUMA))] },
          " " + relF + " " + frTexto(k), TF(sg + mT, COLOR_SUMA)],
          notaF((mas ? "Sumar " : "Restar ") + mT + " en ambos miembros", COLOR_SUMA)));
        // suma de fracciones con el denominador comun
        var Bp = / /.test(B) ? "(" + B + ")" : B;
        L.push(LnF(null, null, [FrF([A + sg + Bp + "·", TF(mT, COLOR_SUMA)], B), " " + relF + " 0"],
          notaF("Sumar las fracciones (denominador común " + B + ")", COLOR_PRODUCTO)));
        var prod = LB.map(function (q) { return { c: frMul(q.c, m), x: q.x }; });
        var exp = juntarLineal(LA).concat(prod);
        L.push(LnF(null, null, [F(textoLineal(exp, v)), " " + relF + " 0"], notaF("Aplicar la distributiva", COLOR_SUMA)));
        // ax + b (sin los que dan cero)
        var c2 = coefLineal(exp), junto = [];
        if (!frCero(c2.a)) junto.push({ c: c2.a, x: 1 });
        if (!frCero(c2.b) || !junto.length) junto.push({ c: c2.b, x: 0 });
        Ntxt = textoLineal(junto, v);
        // el resultado es la cabecera de los casos: aca solo se anuncia el paso
        L.push(LnF(null, null, "", notaF("Juntar términos semejantes", COLOR_SUMA)));
      } else if (!inv) L = []; // la inecuacion ya es la cabecera
      L.push(restr);
      return { previos: L, cab: [F(Ntxt), " " + relF + " 0"], signos: { A: Ntxt, B: B, rel: relF, vari: v, cociente: true } };
    } catch (e) {
      if (e && e.msjAbs) return { error: e.msjAbs };
      throw e;
    }
  }

  function generarRacionales(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20, lh = tam * fuente.lh, y = oy;
    op.filas.forEach(function (fila) {
      var I = leerInecuacionRacional(fila.texto);
      if (I.error) return;
      var c = { tam: tam, fuente: fuente, lh: lh, paso: lh * 1.15, tamN: TAM_NOTA[op.tamTexto] || 16, op: op,
        color: op.colorLineas ? fila.color : TINTA, agregar: agregar };
      y = dibujarBloqueF(I.previos, ox, y, op, agregar) + lh;
      var R;
      try { R = resolverSignos(I.signos); } catch (e) { if (e && e.msjAbs) return; throw e; }
      y = dibujarSignos(I.cab, R, ox, y, c) + lh * 2;
    });
  }

  // ============================ FACTORIZACION DE POLINOMIOS DE 2.º GRADO
  // Cada fila es un polinomio ax² + bx + c (coeficientes enteros o
  // fracciones). Se factoriza por los metodos elegidos, cada uno con sus
  // pasos y, a la derecha, que se va a hacer (en el renglon de la expresion
  // actual, en el color del paso):
  //  - formula cuadratica: formula general, reemplazo de a, b y c,
  //    operaciones y las dos raices; despues a(x − x₁)(x − x₂);
  //  - completar el cuadrado: factor comun a, sumar y restar (b/2)²,
  //    trinomio cuadrado perfecto y diferencia de cuadrados;
  //  - descomposicion (como en la filmina): discriminante, factor comun,
  //    caso 1 (b = a + c), caso 2 (a = 1: p + q = b, p · q = c) o caso 3
  //    (p + q = b, p · q = a · c), y sacar factor comun por grupos.
  var COLOR_A = "#1971c2", COLOR_B = "#e8590c", COLOR_C = "#0c8599", COLOR_MAL = "#e03131";

  function normalizarPoli(t) {
    var sup = function (d) { return d.split("").map(function (c) { return SUPER[c]; }).join(""); };
    return String(t || "").replace(/[-–]/g, "−").replace(/\*/g, "·")
      .replace(/\^(\d+)/g, function (_, d) { return sup(d); })
      .replace(/([A-Za-z])(\d+)/g, function (_, l, d) { return l + sup(d); }); // x2 -> x²
  }

  function leerPoli(txt) {
    var t = normalizarPoli(txt).trim().replace(/^[A-Za-z]\w*\(\s*[A-Za-z]\s*\)\s*=/, "").trim();
    if (!t) return { error: "Escribí el polinomio, por ejemplo: 6x² − 7x − 3" };
    if (/[=<>≤≥≠]/.test(t)) return { error: "Escribí solo el polinomio, sin «=»" };
    var letras = (t.match(/[A-Za-z]/g) || []).filter(function (c, i, l) { return l.indexOf(c) === i; });
    if (letras.length > 1) return { error: "Usá una sola variable (hay " + letras.join(", ") + ")" };
    var vari = letras[0] || "x", L;
    try { L = leerLineal(t, vari, 2); } catch (e) { if (e && e.msjAbs) return { error: e.msjAbs }; throw e; }
    var co = [fr(0), fr(0), fr(0)];
    L.forEach(function (m) { co[m.x] = frSuma(co[m.x], m.c); });
    if (frCero(co[2])) return { error: "No es de segundo grado: falta el término con " + vari + "²" };
    var grande = co.some(function (c) { return Math.abs(c.n) > 1e6 || c.d > 1e6; });
    if (grande) return { error: "Los coeficientes son demasiado grandes" };
    return { a: co[2], b: co[1], c: co[0], vari: vari };
  }

  // ------------------------------------------------------------ textos
  function px(v) { return v.n < 0 || v.d !== 1 ? "(" + frTexto(v) + ")" : frTexto(v); } // entre operaciones
  function frAbs(v) { return v.n < 0 ? frNeg(v) : v; }
  function frRes(a, b) { return frSuma(a, frNeg(b)); }
  function frIgual(a, b) { return a.n === b.n && a.d === b.d; }
  // monomio sin signo (c > 0): 3, x, 2x, (5/2)x²
  function monoF(c, g, vari) {
    var s = frTexto(c);
    if (!g) return s;
    var v = vari + (g === 2 ? "²" : "");
    return frUno(c) ? v : (c.d === 1 ? s : "(" + s + ")") + v;
  }
  function conSignoF(c, g, vari) { return (c.n < 0 ? " − " : " + ") + monoF(frAbs(c), g, vari); }
  // [[coef, grado], ...] -> "6x² − 7x − 3" (sin los ceros)
  function textoPoli(ts, vari) {
    var t = ts.filter(function (m) { return !frCero(m[0]); });
    if (!t.length) return "0";
    return t.map(function (m, k) {
      return k ? conSignoF(m[0], m[1], vari) : (m[0].n < 0 ? "−" : "") + monoF(frAbs(m[0]), m[1], vari);
    }).join("");
  }
  function poliF(a, b, c, vari) { return textoPoli([[a, 2], [b, 1], [c, 0]], vari); }
  // factor delante de un parentesis: 6(...), −(...), 1/6(...)
  function prefijoF(k) { return frUno(k) ? "" : k.n === -1 && k.d === 1 ? "−" : frTexto(k); }

  // √n con n entero >= 0 -> { k, m } con n = k²·m
  function raizEntera(n) {
    if (n === 0) return { k: 0, m: 1 };
    var k = 1, m = n;
    for (var i = Math.floor(Math.sqrt(n)); i > 1; i--) if (n % (i * i) === 0) { k = i; m = n / (i * i); break; }
    return { k: k, m: m };
  }
  // √q con q racional >= 0 -> { coef (racional), m }: √q = coef·√m
  function raizRacional(q) {
    var r = raizEntera(q.n * q.d);
    return { coef: fr(r.k, q.d), m: r.m };
  }
  function textoRaizF(r) { // coef·√m, coef > 0
    if (r.m === 1) return frTexto(r.coef);
    return (r.coef.n === 1 ? "" : r.coef.n) + "√" + r.m + (r.coef.d === 1 ? "" : "/" + r.coef.d);
  }
  function cuadradoF(t) { return /^\d+$/.test(t) ? t + "²" : "(" + t + ")²"; }

  // Raiz: { r } racional o { u, w, m, s } = u + s·w·√m (w > 0)
  function textoRaizX(R) {
    if (R.r) return frTexto(R.r);
    var Lc = R.u.d * R.w.d / mcdAbs(R.u.d, R.w.d), U = R.u.n * (Lc / R.u.d), W = R.w.n * (Lc / R.w.d);
    var raiz = (W === 1 ? "" : W) + "√" + R.m;
    var num = U === 0 ? (R.s < 0 ? "−" : "") + raiz : U + (R.s < 0 ? " − " : " + ") + raiz;
    num = num.replace(/-/g, "−");
    return Lc === 1 ? num : "(" + num + ")/" + Lc;
  }
  function factorX(R, vari, limpio) {
    if (R.r) return limpio ? textoPoli([[fr(1), 1], [frNeg(R.r), 0]], vari)
      : vari + " − " + (R.r.n < 0 ? "(" + frTexto(R.r) + ")" : frTexto(R.r));
    var t = textoRaizX(R);
    if (limpio && /^−[^ ]+$/.test(t)) return vari + " + " + t.slice(1); // x − (−√2) = x + √2
    return vari + " − " + (/^\(/.test(t) || !/[ −]/.test(t) ? t : "(" + t + ")");
  }
  // sin limpiar, el factor a se escribe siempre (tambien 1 y −1)
  function factorizadoX(a, R1, R2, vari, limpio) {
    var f1 = "(" + factorX(R1, vari, limpio) + ")", f2 = "(" + factorX(R2, vari, limpio) + ")";
    return (limpio ? prefijoF(a) : frTexto(a)) + (f1 === f2 ? f1 + "²" : f1 + f2);
  }

  // ------------------------------------------- renglones con fracciones
  // item: { t, color } | { frac: [items, items] } | { raiz: items }
  // linea: { izq, rel, der: items, nota, color }; rel null = linea suelta
  function itF(x) {
    if (typeof x === "string") return [{ t: x }];
    if (Array.isArray(x)) return [].concat.apply([], x.map(itF));
    return [x];
  }
  function TF(t, color) { return { t: t, color: color }; }
  function FrF(num, den) { return { frac: [itF(num), itF(den)] }; }
  function RzF(x) { return { raiz: itF(x) }; }
  function LnF(izq, rel, der, nota, color) { return { izq: izq, rel: rel, der: itF(der), nota: nota, color: color }; }
  function libreF(l) { l.libre = true; return l; }
  // renglon de una bifurcacion: «x₁ = ...» con una flecha desde la llave
  // del renglon anterior marcado con `llave`
  function ramaF(etiqueta, der, nota) {
    var l = LnF(null, null, [etiqueta + " = "].concat(itF(der)), nota);
    l.rama = true;
    return l;
  }
  function notaF(t, color) { return (Array.isArray(t) ? t : [t]).map(function (x) { return { t: x, color: color }; }); }
  // racional como item: 3, −4 o fraccion con barra
  function itemRac(r) {
    if (r.d === 1) return TF(frTexto(r));
    var f = FrF(String(Math.abs(r.n)), String(r.d));
    return r.n < 0 ? [TF("−"), f] : f;
  }

  // REGLA GENERAL: un paréntesis (o corchete) abarca toda la expresión que
  // encierra. Si adentro hay algo más alto que un renglón (una fracción, una
  // raíz, un sistema), el par se dibuja con trazos del alto del contenido en
  // vez de ser dos caracteres chicos. Los pares pueden estar en items
  // distintos («(», fracción, «)») y se buscan en la misma lista; abrir y
  // cerrar pueden ser distintos, como en el intervalo «(0, 1/4]».
  var cacheParenF = typeof WeakMap === "function" ? new WeakMap() : null;
  function esAltoF(its, tam, fuente) {
    var lh = tam * fuente.lh, m = medirItsF(its, tam, fuente);
    return m.ar + m.ab > lh * 1.3;
  }
  function parentesisF(its, tam, fuente) {
    if (!its.some(function (it) { return typeof it.t === "string" && /[()\[\]]/.test(it.t); })) return its;
    if (!its.some(function (it) { return typeof it.t !== "string"; })) return its;
    var clave = cacheParenF && cacheParenF.get(its);
    if (clave && clave.tam === tam && clave.fuente === fuente) return clave.its;
    // tokens: texto partido en los paréntesis, y los demás items enteros
    var tk = [];
    its.forEach(function (it) {
      if (typeof it.t !== "string" || it.tachar) { tk.push({ it: it }); return; }
      it.t.split(/([()\[\]])/).forEach(function (p) {
        if (p) tk.push({ t: p, color: it.color, abre: p === "(" || p === "[", cierra: p === ")" || p === "]" });
      });
    });
    function texto(t, color) { return color ? { t: t, color: color } : { t: t }; }
    function armar(lista) {
      var out = [];
      lista.forEach(function (x) {
        if (x.it) { out.push(x.it); return; }
        var u = out[out.length - 1];
        if (u && typeof u.t === "string" && u.color === x.color && !u.paren) u.t += x.t;
        else out.push(texto(x.t, x.color));
      });
      return out;
    }
    // pila de aperturas: al cerrar, si lo de adentro es alto, el par se
    // reemplaza por un item { paren } (de adentro hacia afuera)
    var pila = [];
    for (var i = 0; i < tk.length; i++) {
      if (tk[i].abre) pila.push(i);
      else if (tk[i].cierra && pila.length) {
        var a = pila.pop(), dentro = armar(tk.slice(a + 1, i));
        if (esAltoF(dentro, tam, fuente)) {
          var it = { paren: dentro, abre: tk[a].t, cierra: tk[i].t, colorAbre: tk[a].color, colorCierra: tk[i].color };
          tk.splice(a, i - a + 1, { it: it });
          i = a;
        }
      }
    }
    var res = armar(tk);
    // exponente pegado al cierre («(7/3)²»): va arriba, a la altura del borde
    // del paréntesis grande, y no en el medio del renglón
    for (var k = 0; k + 1 < res.length; k++) {
      var sig = res[k + 1], me = res[k].paren && typeof sig.t === "string" && /^[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/.exec(sig.t);
      if (!me) continue;
      res[k].exp = me[0];
      res[k + 1] = sig.color ? { t: sig.t.slice(me[0].length), color: sig.color } : { t: sig.t.slice(me[0].length) };
      if (!res[k + 1].t) res.splice(k + 1, 1);
    }
    if (cacheParenF) cacheParenF.set(its, { tam: tam, fuente: fuente, its: res });
    return res;
  }
  function anchoParenF(tam) { return tam * 0.4; }

  function medirItsF(its, tam, fuente) {
    var lh = tam * fuente.lh, w = 0, ar = lh / 2, ab = lh / 2;
    its = parentesisF(its, tam, fuente);
    its.forEach(function (it) {
      var m = medirItF(it, tam, fuente);
      w += m.w; ar = Math.max(ar, m.ar); ab = Math.max(ab, m.ab);
    });
    return { w: w, ar: ar, ab: ab };
  }
  // marcas dibujadas (no caracteres): ✓ verde o ✗ roja
  function MarcaF(ok) { return { marca: ok ? "ok" : "mal" }; }
  // sistema de ecuaciones con una llave dibujada a la izquierda
  function SistemaF(filas) { return { sistema: filas.map(itF) }; }
  // tabla: filas de celdas; en cada columna las celdas se alinean a la
  // derecha por lo escrito (la marca ✓/✗ queda afuera, a la derecha)
  function TablaF(filas) { return { tabla: filas.map(function (f) { return f.map(itF); }) }; }
  function medidasTablaF(it, tam, fuente) {
    var lh = tam * fuente.lh, cols = [], altoF = lh * 1.35, gap = tam * 3;
    // con «lineas» (grilla), cada celda deja a lo sumo el ancho de un carácter de
    // margen a cada lado: la tabla queda angosta
    if (it.lineas) gap = 2 * medir("0", tam, fuente);
    it.tabla.forEach(function (f) {
      f.forEach(function (celda, j) {
        var txt = medirItsF(celda.filter(function (x) { return !x.marca; }), tam, fuente).w;
        var mar = medirItsF(celda.filter(function (x) { return x.marca; }), tam, fuente);
        var c = cols[j] || (cols[j] = { txt: 0, mar: 0 });
        c.txt = Math.max(c.txt, txt);
        c.mar = Math.max(c.mar, celda.some(function (x) { return x.marca; }) ? mar.w : 0);
      });
    });
    // con «lineas» queda el mismo margen dentro del marco, a cada lado
    var pad = it.lineas ? gap / 2 : 0, x = pad;
    cols.forEach(function (c) { c.x = x; x += c.txt + c.mar + gap; });
    return { cols: cols, w: x - gap + pad, altoF: altoF, alto: it.tabla.length * altoF, pad: pad, gap: gap };
  }
  // índice de una raíz ({ raiz, indice: "n − 1" }): más chico y arriba del
  // gancho, separado del renglón para que no se lea como un producto. Si es
  // ancho, corre la raíz a la derecha. alto: cuánto sube sobre el medio del renglón
  function indiceRaizF(it, tam, fuente) {
    if (!it.indice) return { corre: 0, alto: 0 };
    var g = tam * 0.6, tamI = Math.round(tam * 0.55), wI = medir(it.indice, tamI, fuente), sube = tam * 0.35;
    return { tamI: tamI, wI: wI, sube: sube, corre: Math.max(0, wI - g * 0.45), alto: sube + tamI * fuente.lh };
  }
  // alineación de la columna j de una tabla: "izq", "centro" o "der" (por defecto)
  function alinearColF(it, j) {
    var a = Array.isArray(it.alinear) ? it.alinear[j] : it.alinear;
    return a === "izq" || a === "centro" ? a : "der";
  }
  // exponente ({ sup: items }): tamano y cuanto sube su centro sobre el del renglon
  function tamSupF(tam) { return Math.max(10, Math.round(tam * 0.62)); }
  function supSubeF(tam) { return tam * 0.42; }
  function SupF(x) { return { sup: itF(x) }; }
  function bajaSubF(tam) { return tam * 0.3; }
  function medirItF(it, tam, fuente) {
    var lh = tam * fuente.lh;
    if (it.tabla) { var mt = medidasTablaF(it, tam, fuente); return { w: mt.w, ar: mt.alto / 2, ab: mt.alto / 2 }; }
    if (it.marca) return { w: tam * 1.6, ar: lh / 2, ab: lh / 2 };
    if (it.sistema) {
      var ws = it.sistema.map(function (f) { return medirItsF(f, tam, fuente).w; });
      var h = it.sistema.length * lh;
      return { w: tam * 0.8 + Math.max.apply(null, ws), ar: h / 2 + 2, ab: h / 2 + 2 };
    }
    if (it.frac) {
      var n = medirItsF(it.frac[0], tam, fuente), d = medirItsF(it.frac[1], tam, fuente);
      return { w: Math.max(n.w, d.w) + tam * 0.5, ar: n.ar + n.ab + 4, ab: d.ar + d.ab + 4 };
    }
    if (it.raiz) {
      var r = medirItsF(it.raiz, tam, fuente), ix = indiceRaizF(it, tam, fuente);
      return { w: r.w + tam * 0.8 + ix.corre, ar: Math.max(r.ar + 4, ix.alto), ab: r.ab };
    }
    if (it.paren) {
      var mp = medirItsF(it.paren, tam, fuente);
      return { w: mp.w + 2 * anchoParenF(tam) + (it.exp ? medir(it.exp, tam, fuente) : 0), ar: mp.ar + 2, ab: mp.ab + 2 };
    }
    if (it.supsub) {
      // indices apilados a la derecha de una letra (V con n arriba y k abajo)
      var ts = tamSupF(tam), s0 = medirItsF(it.supsub[0], ts, fuente), s1 = medirItsF(it.supsub[1], ts, fuente);
      return { w: Math.max(s0.w, s1.w) + tam * 0.1, ar: Math.max(lh / 2, supSubeF(tam) + s0.ar),
        ab: Math.max(lh / 2, bajaSubF(tam) + s1.ab) };
    }
    if (it.binom) {
      // numero combinatorio: n sobre k entre parentesis
      var b0 = medirItsF(it.binom[0], tam, fuente), b1 = medirItsF(it.binom[1], tam, fuente);
      return { w: Math.max(b0.w, b1.w) + 2 * anchoParenF(tam) + tam * 0.2, ar: lh * 0.95, ab: lh * 0.95 };
    }
    if (it.sup) {
      // exponente: mas chico y subido (sirve para cualquier exponente, no solo
      // los que tienen caracter de superindice)
      var ms = medirItsF(it.sup, tamSupF(tam), fuente), sube = supSubeF(tam);
      return { w: ms.w + tam * 0.08, ar: Math.max(lh / 2, sube + ms.ar), ab: Math.max(lh / 2, ms.ab - sube) };
    }
    return { w: medir(it.t, tam, fuente), ar: lh / 2, ab: lh / 2 };
  }
  // «(», «)», «[» o «]» dibujado entre top y bot, en una franja de ancho pw
  function trazoParenF(ch, x, top, bot, pw, c, agregar) {
    var der = ch === ")" || ch === "]", h = bot - top;
    var ext = der ? x + pw * 0.25 : x + pw * 0.75, inn = der ? x + pw * 0.65 : x + pw * 0.35;
    var pts = ch === "(" || ch === ")"
      ? [[ext, top], [inn, top + h * 0.25], [inn, bot - h * 0.25], [ext, bot]]
      : [[ext, top], [inn, top], [inn, bot], [ext, bot]];
    agregar(trazo(pts, { strokeColor: c, strokeWidth: 1.5, roundness: ch === "(" || ch === ")" ? { type: 2 } : null }));
  }
  function dibujarItsF(its, x, mid, color, tam, fuente, agregar) {
    var lh = tam * fuente.lh;
    its = parentesisF(its, tam, fuente);
    its.forEach(function (it) {
      var m = medirItF(it, tam, fuente), c = it.color || color;
      if (it.tabla) {
        var mt = medidasTablaF(it, tam, fuente), y0 = mid - mt.alto / 2;
        it.tabla.forEach(function (f, i) {
          f.forEach(function (celda, j) {
            var col = mt.cols[j], txt = medirItsF(celda.filter(function (q) { return !q.marca; }), tam, fuente).w;
            var al = alinearColF(it, j), dx = al === "izq" ? 0 : al === "centro" ? (col.txt - txt) / 2 : col.txt - txt;
            dibujarItsF(celda, x + col.x + dx, y0 + mt.altoF * (i + 0.5), c, tam, fuente, agregar);
          });
        });
        // «lineas»: marco y grilla; la primera fila y la primera columna (los
        // encabezados de una tabla de doble entrada) se separan con una línea más gruesa
        // («columnasFijas»: cuántas columnas van antes de esa línea, por ejemplo
        // las de las variables en una tabla de verdad)
        if (it.lineas) {
          var y1 = y0 + mt.alto, x1 = x + mt.w;
          for (var fi = 0; fi <= it.tabla.length; fi++) {
            var yy = y0 + mt.altoF * fi;
            agregar(trazo([[x, yy], [x1, yy]], { strokeColor: c, strokeWidth: fi === 1 ? 2 : 1 }));
          }
          var xs = [x].concat(mt.cols.slice(1).map(function (col) { return x + col.x - mt.gap / 2; }), [x1]);
          xs.forEach(function (xx, k) {
            agregar(trazo([[xx, y0], [xx, y1]], { strokeColor: c, strokeWidth: k === (it.columnasFijas || 1) ? 2 : 1 }));
          });
        }
      } else if (it.marca === "ok") {
        var t = tam * 0.85, x0 = x + tam * 0.6;
        agregar(trazo([[x0, mid], [x0 + t * 0.35, mid + t * 0.35], [x0 + t, mid - t * 0.45]],
          { strokeColor: COLOR_SUMA, strokeWidth: 3 }));
      } else if (it.marca === "mal") {
        var t2 = tam * 0.55, x1 = x + tam * 0.45;
        agregar(trazo([[x1, mid - t2 / 2], [x1 + t2, mid + t2 / 2]], { strokeColor: COLOR_MAL, strokeWidth: 3 }));
        agregar(trazo([[x1 + t2, mid - t2 / 2], [x1, mid + t2 / 2]], { strokeColor: COLOR_MAL, strokeWidth: 3 }));
      } else if (it.sistema) {
        // llave «{»: dos curvas que se juntan en la punta del medio
        var hS = it.sistema.length * lh, top = mid - hS / 2, bot = mid + hS / 2, bw = tam * 0.45;
        agregar(trazo([[x + bw, top], [x + bw * 0.45, top + hS * 0.1], [x + bw * 0.45, mid - hS * 0.12], [x, mid],
          [x + bw * 0.45, mid + hS * 0.12], [x + bw * 0.45, bot - hS * 0.1], [x + bw, bot]],
          { strokeColor: c, strokeWidth: 1.5, roundness: { type: 2 } }));
        it.sistema.forEach(function (f, j) { dibujarItsF(f, x + tam * 0.7, top + lh * (j + 0.5), c, tam, fuente, agregar); });
      } else if (it.frac) {
        var n = medirItsF(it.frac[0], tam, fuente), d = medirItsF(it.frac[1], tam, fuente);
        dibujarItsF(it.frac[0], x + (m.w - n.w) / 2, mid - 4 - n.ab, c, tam, fuente, agregar);
        agregar(trazo([[x + tam * 0.1, mid], [x + m.w - tam * 0.1, mid]], { strokeColor: c, strokeWidth: 1.5 }));
        dibujarItsF(it.frac[1], x + (m.w - d.w) / 2, mid + 4 + d.ar, c, tam, fuente, agregar);
      } else if (it.raiz) {
        var r = medirItsF(it.raiz, tam, fuente), g = tam * 0.6, top = mid - r.ar - 1, bot = mid + r.ab - 3;
        var ix = indiceRaizF(it, tam, fuente), xr = x + ix.corre;
        if (it.indice) agregar(texto(xr + g * 0.5 - ix.wI, mid - ix.alto, it.indice, ix.tamI, fuente, c, "left"));
        agregar(trazo([[xr + tam * 0.05, mid + 2], [xr + g * 0.3, mid - 2], [xr + g * 0.6, bot], [xr + g, top],
          [xr + g + r.w + tam * 0.1, top]], { strokeColor: c, strokeWidth: 1.5 }));
        dibujarItsF(it.raiz, xr + g + tam * 0.05, mid, c, tam, fuente, agregar);
      } else if (it.paren) {
        var pw = anchoParenF(tam), mp = medirItsF(it.paren, tam, fuente);
        trazoParenF(it.abre, x, mid - m.ar, mid + m.ab, pw, it.colorAbre || color, agregar);
        dibujarItsF(it.paren, x + pw, mid, color, tam, fuente, agregar);
        trazoParenF(it.cierra, x + pw + mp.w, mid - m.ar, mid + m.ab, pw, it.colorCierra || color, agregar);
        if (it.exp) agregar(texto(x + 2 * pw + mp.w, mid - m.ar - lh * 0.15, it.exp, tam, fuente, it.colorCierra || color, "left"));
      } else if (it.sup) {
        dibujarItsF(it.sup, x + tam * 0.04, mid - supSubeF(tam), c, tamSupF(tam), fuente, agregar);
      } else if (it.supsub) {
        dibujarItsF(it.supsub[0], x + tam * 0.04, mid - supSubeF(tam), c, tamSupF(tam), fuente, agregar);
        dibujarItsF(it.supsub[1], x + tam * 0.04, mid + bajaSubF(tam), c, tamSupF(tam), fuente, agregar);
      } else if (it.binom) {
        var pwb = anchoParenF(tam), wb = m.w - 2 * pwb;
        trazoParenF("(", x, mid - m.ar, mid + m.ab, pwb, c, agregar);
        it.binom.forEach(function (fila, j) {
          var wf = medirItsF(fila, tam, fuente).w;
          dibujarItsF(fila, x + pwb + (wb - wf) / 2, mid + (j ? 1 : -1) * lh * 0.47, c, tam, fuente, agregar);
        });
        trazoParenF(")", x + m.w - pwb, mid - m.ar, mid + m.ab, pwb, c, agregar);
      } else {
        var lead = it.t.length - it.t.replace(/^\s+/, "").length, limpio = it.t.trim();
        if (limpio) agregar(texto(x + medir(it.t.slice(0, lead), tam, fuente), mid - lh / 2, limpio, tam, fuente, c, "left"));
        if (it.tachar && limpio) {
          // tachado: una raya en diagonal (lo que se simplifica)
          var xt0 = x + medir(it.t.slice(0, lead), tam, fuente), xt1 = xt0 + medir(limpio, tam, fuente);
          agregar(trazo([[xt0 - 2, mid + lh * 0.35], [xt1 + 2, mid - lh * 0.35]], { strokeColor: it.tachar, strokeWidth: 1.5 }));
        }
      }
      x += m.w;
    });
  }

  // Dibuja las lineas con los "=" alineados; la nota de cada paso va a la
  // derecha del renglon anterior (la expresion actual), antes del paso.
  function dibujarBloqueF(lineas, x, y, op, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var lh = tam * fuente.lh, tamN = TAM_NOTA[op.tamTexto] || 16, hN = tamN * fuente.lh;
    // cada seccion (empieza con una linea `sub`) alinea sus "=" por su cuenta
    var grupos = [], g = -1;
    lineas.forEach(function (l, i) {
      if (l.sub || l.corte || !i) grupos.push({ w: 0 });
      g = grupos.length - 1;
      l.grupo = g;
      // el miembro izquierdo puede ser texto o items (fracciones, exponentes)
      if (l.izq) grupos[g].w = Math.max(grupos[g].w, Array.isArray(l.izq)
        ? medirItsF(l.izq, tam, fuente).w + medir(" ", tam, fuente) : medir(l.izq + " ", tam, fuente));
    });
    var wIg = medir("= ", tam, fuente);
    // notasArriba: la nota de cada paso se escribe en su propio renglon, arriba
    // del renglon donde se hace (para desarrollos angostos, al lado de un grafico)
    var arriba = !!(op.notasArriba && op.notas), yNota = [];
    var filas = [], yy = y, der = 0;
    // la llave de una bifurcacion empieza donde empieza lo escrito en su
    // renglon (no en el borde del bloque) y sus ramas cuelgan desde ahi: asi
    // queda igual con el desarrollo entero que partido entre hojas
    var xLlave = x;
    lineas.forEach(function (l, i) {
      if ((l.sub || l.corte) && i) yy += lh * 0.5;
      if (arriba && l.nota) { yNota[i] = yy; yy += l.nota.length * hN + tam * 0.15; }
      // llaves por encima (`arriba`): lugar para la llave y su texto
      if (l.arriba) yy += tam * 0.55 + hN;
      var xRel = x + grupos[l.grupo].w, xDer = xRel + wIg;
      var m = medirItsF(l.der, tam, fuente), xs = l.rama ? xLlave + tam * 4 : l.rel === null ? x : xDer;
      var xIni = xs;
      if (Array.isArray(l.izq)) {
        var mi = medirItsF(l.izq, tam, fuente);
        m = { w: m.w, ar: Math.max(m.ar, mi.ar), ab: Math.max(m.ab, mi.ab) };
        xIni = xRel - mi.w - medir(" ", tam, fuente);
      } else if (l.izq) xIni = xRel - medir(l.izq + " ", tam, fuente);
      var xL = l.rama ? xLlave : xIni;
      if (l.llave) xLlave = xIni;
      else if (!l.rama) xLlave = x;
      // la nota del paso siguiente va en este renglon: si es mas alta, se
      // agranda el renglon (mitad arriba y mitad abajo)
      var sig = lineas[i + 1], hNota = !arriba && op.notas && sig && sig.nota ? sig.nota.length * hN : 0;
      if (!arriba && !i && op.notas && l.nota) hNota = Math.max(hNota, l.nota.length * hN);
      var extra = Math.max(0, hNota - (m.ar + m.ab)) + (l.caja ? tam * 0.5 : 0);
      filas.push({ mid: yy + extra / 2 + m.ar, xs: xs, xRel: xRel, m: m, fin: xs + m.w, xL: xL });
      if (!l.libre) der = Math.max(der, xs + m.w); // los textos sueltos no corren las notas
      yy += m.ar + m.ab + extra + (m.ar + m.ab > lh + 2 ? lh * 0.45 : lh * 0.2) + (l.llave ? tam * 0.6 : 0)
        + (l.marcar ? Math.max(tam * 2.8, l.marcar.texto.length * hN + tam * 1.6) : 0);
    });
    // bifurcaciones: llave debajo del renglon `llave`, tallo hasta la ultima
    // rama que le sigue y una flecha a cada rama
    lineas.forEach(function (l, i) {
      if (!l.llave) return;
      var ult = i;
      while (lineas[ult + 1] && lineas[ult + 1].rama) ult++;
      filas[i].bif = { y: filas[i].mid + filas[i].m.ab + tam * 0.35, hasta: filas[ult].mid };
    });
    var xNota = der + tam * 1.5, finNota = -Infinity;
    // centrada en el renglon; si pisa la nota anterior, un poco mas abajo
    function notas(n, mid, fin) {
      if (!op.notas || !n || arriba) return;
      var y0 = Math.max(mid - n.length * hN / 2, finNota + 2), xn = Math.max(xNota, fin + tam * 1.5);
      n.forEach(function (t, j) {
        agregar(texto(xn, y0 + j * hN, t.t, tamN, fuente, t.color, "left"));
      });
      finNota = y0 + n.length * hN;
    }
    lineas.forEach(function (l, i) {
      var f = filas[i], col = l.color || TINTA;
      if (!i) notas(l.nota, f.mid, f.fin);
      if (arriba && l.nota) {
        // arriba del renglon, desde el «=» (o desde donde empieza lo escrito)
        var xna = l.rel ? f.xRel : l.izq ? x : f.xs;
        l.nota.forEach(function (t, j) { agregar(texto(xna, yNota[i] + j * hN, t.t, tamN, fuente, t.color, "left")); });
      }
      // el miembro izquierdo, contra el «=» (alineado a la derecha de su columna)
      if (Array.isArray(l.izq)) dibujarItsF(l.izq, f.xRel - medirItsF(l.izq, tam, fuente).w - medir(" ", tam, fuente), f.mid, col, tam, fuente, agregar);
      else if (l.izq) agregar(texto(f.xRel - medir(l.izq + " ", tam, fuente), f.mid - lh / 2, l.izq, tam, fuente, col, "left"));
      if (l.rel) agregar(texto(f.xRel, f.mid - lh / 2, l.rel, tam, fuente, col, "left"));
      if (l.caja) {
        // recuadro con esquinas redondeadas alrededor de lo escrito (sin las marcas)
        var wc = medirItsF(l.der.filter(function (it) { return !it.marca; }), tam, fuente).w, pc = tam * 0.3;
        agregar(base("rectangle", { x: f.xs - pc, y: f.mid - f.m.ar - pc * 0.6, width: wc + 2 * pc,
          height: f.m.ar + f.m.ab + pc * 1.2, strokeColor: l.caja, strokeWidth: 1.5, roundness: { type: 3 } }));
      }
      if (l.rama) {
        var xt = f.xL + tam * 0.9;
        agregar(trazo([[xt, f.mid], [f.xs - tam * 0.4, f.mid]], { type: "arrow", endArrowhead: "arrow", strokeColor: TINTA, strokeWidth: 1.5 }));
      }
      dibujarItsF(l.der, f.xs, f.mid, col, tam, fuente, agregar);
      // posicion de los terminos de..a (sin los espacios de adelante ni de atras)
      function tramoX(de, a) {
        var k0 = l.der.indexOf(de), k1 = l.der.indexOf(a);
        var antes = medirItsF(l.der.slice(0, k0), tam, fuente).w, primero = l.der[k0], ultimo = l.der[k1];
        if (primero.t) antes += medir(primero.t.slice(0, primero.t.length - primero.t.replace(/^\s+/, "").length), tam, fuente);
        var hasta = medirItsF(l.der.slice(0, k1 + 1), tam, fuente).w;
        if (ultimo.t) hasta -= medir(ultimo.t.slice(ultimo.t.replace(/\s+$/, "").length), tam, fuente);
        return [f.xs + antes, f.xs + hasta];
      }
      (l.arriba || []).forEach(function (s) {
        // llave por encima de los terminos, con el texto centrado arriba
        var xx = tramoX(s.de, s.a), ya = f.mid - f.m.ar - tam * 0.12, pa = tam * 0.3;
        agregar(trazo([[xx[0], ya + pa], [xx[0], ya], [xx[1], ya], [xx[1], ya + pa]],
          { strokeColor: s.color, strokeWidth: 1.5 }));
        // el texto no se separa de su llave al repartir en hojas
        var ta = texto((xx[0] + xx[1]) / 2, ya - tam * 0.1 - hN, s.texto, tamN, fuente, s.color, "center");
        ta.customData = { pizarraUne: tam * 1.1 }; // también con el título de arriba
        agregar(ta);
      });
      if (l.marcar) {
        var xx0 = tramoX(l.marcar.de, l.marcar.a), xa = xx0[0], xb = xx0[1];
        var yl = f.mid + f.m.ab + tam * 0.15, pm = tam * 0.3, cm = l.marcar.color, xm = (xa + xb) / 2;
        var sigF = filas[i + 1], yFin = sigF ? sigF.mid - sigF.m.ar - tam * 0.2 : yl + tam * 2.5;
        agregar(trazo([[xa, yl - pm], [xa, yl], [xb, yl], [xb, yl - pm]], { strokeColor: cm, strokeWidth: 1.5 }));
        // pizarraUne: al repartir en hojas, la flecha va con el renglón al que llega
        var flm = trazo([[xm, yl], [xm, yFin]], { type: "arrow", endArrowhead: "arrow", strokeColor: cm, strokeWidth: 1.5 });
        if (sigF) flm.customData = { pizarraUne: tam * 0.6 };
        agregar(flm);
        var yt = (yl + yFin) / 2 - l.marcar.texto.length * hN / 2;
        l.marcar.texto.forEach(function (t, j) {
          agregar(texto(xm + tam * 0.6, yt + j * hN, t, tamN, fuente, cm, "left"));
        });
      }
      if (f.bif) {
        var pa = tam * 0.4, xt2 = f.xL + tam * 0.9;
        agregar(trazo([[f.xL - 4, f.bif.y - pa], [f.xL - 4, f.bif.y], [f.fin + 4, f.bif.y], [f.fin + 4, f.bif.y - pa]],
          { strokeColor: TINTA, strokeWidth: 1.5 }));
        agregar(trazo([[xt2, f.bif.y], [xt2, f.bif.hasta]], { strokeColor: TINTA, strokeWidth: 1.5 }));
      }
      if (lineas[i + 1]) notas(lineas[i + 1].nota, f.mid, f.fin);
    });
    return yy;
  }

  // ------------------------------------------------ formula cuadratica
  function metodoFormula(P, nom, color) {
    var a = P.a, b = P.b, c = P.c, v = P.vari, X = v + "₁,₂", L = [];
    var b2 = frMul(b, b), q4 = frMul(fr(4), frMul(a, c)), den = frMul(fr(2), a), mb = frNeg(b), D = frRes(b2, q4);
    L.push(LnF(nom, "=", poliF(a, b, c, v)));
    L.push(LnF(null, null, ["a = ", TF(frTexto(a), COLOR_A), "    b = ", TF(frTexto(b), COLOR_B), "    c = ", TF(frTexto(c), COLOR_C)],
      notaF("Identificar a, b y c", TINTA)));
    L.push(LnF(X, "=", FrF(["−", TF("b", COLOR_B), " ± ", RzF([TF("b", COLOR_B), "² − 4·", TF("a", COLOR_A), "·", TF("c", COLOR_C)])],
      ["2·", TF("a", COLOR_A)]), notaF("Fórmula cuadrática", TINTA)));
    L.push(LnF(X, "=", FrF(["−", TF(px(b), COLOR_B), " ± ", RzF([TF(px(b), COLOR_B), "² − 4·", TF(px(a), COLOR_A), "·",
      TF(px(c), COLOR_C)])], ["2·", TF(px(a), COLOR_A)]), notaF("Reemplazar a, b y c", COLOR_PRODUCTO)));
    L.push(LnF(X, "=", FrF([TF(frTexto(mb), COLOR_SUMA), " ± ", RzF([TF(frTexto(b2) + " − " + px(q4), COLOR_SUMA)])],
      TF(frTexto(den), COLOR_SUMA)), notaF("Resolver las operaciones", COLOR_SUMA)));
    L.push(LnF(X, "=", FrF([frTexto(mb), " ± ", RzF(TF(frTexto(D), COLOR_SUMA))], frTexto(den)),
      notaF("Resolver la resta", COLOR_SUMA)));
    var R1, R2;
    if (D.n < 0) {
      L.push(LnF(null, null, TF("La raíz de un número negativo no es real: no hay raíces reales", COLOR_MAL)));
      L.push(LnF(null, null, TF(nom + " no se puede factorizar en ℝ", color)));
      return L;
    }
    var rz = raizRacional(D), dTxt = D.d === 1 ? frTexto(D) : "(" + frTexto(D) + ")";
    if (rz.m === 1) {
      var s = rz.coef;
      L.push(LnF(X, "=", FrF([frTexto(mb), " ± ", TF(frTexto(s), COLOR_PRODUCTO)], frTexto(den)),
        notaF("√" + dTxt + " = " + frTexto(s), COLOR_PRODUCTO)));
      R1 = { r: frDiv(frSuma(mb, s), den) }; R2 = { r: frDiv(frRes(mb, s), den) };
      // num/den = resultado (sin repetir la fraccion si ya es irreducible)
      var cociente = function (num, r) {
        var mismo = num.d === 1 && den.d === 1 && den.n > 0 && r.n === num.n && r.d === den.n;
        return [FrF(frTexto(num), frTexto(den))].concat(mismo ? [] : [" = "], mismo ? [] : itF(itemRac(r)));
      };
      L[L.length - 1].llave = true;
      if (frCero(s)) {
        L.push(ramaF(v + "₁ = " + v + "₂", cociente(mb, R1.r), notaF("Una sola raíz (doble)", COLOR_SUMA)));
      } else {
        [[v + "₁", " + ", R1, frSuma(mb, s)], [v + "₂", " − ", R2, frRes(mb, s)]].forEach(function (q, k) {
          var der = [FrF(frTexto(mb) + q[1] + frTexto(s), frTexto(den)), " = "].concat(cociente(q[3], q[2].r));
          L.push(ramaF(q[0], der, k ? null : notaF("Calcular las dos raíces", COLOR_SUMA)));
        });
      }
    } else {
      var s2 = rz, simplifica = !(frUno(s2.coef) && D.d === 1);
      if (simplifica) L.push(LnF(X, "=", FrF([frTexto(mb), " ± ", TF(textoRaizF(s2), COLOR_PRODUCTO)], frTexto(den)),
        notaF(["Simplificar la raíz: √" + dTxt + " = " + textoRaizF(s2), "(no es exacta: raíces irracionales)"], COLOR_PRODUCTO)));
      var u = frDiv(mb, den), w = frDiv(s2.coef, den), sg = w.n < 0 ? -1 : 1;
      R1 = { u: u, w: frAbs(w), m: s2.m, s: sg }; R2 = { u: u, w: frAbs(w), m: s2.m, s: -sg };
      L[L.length - 1].llave = true;
      L.push(ramaF(v + "₁", textoRaizX(R1), notaF(simplifica ? "Las dos raíces"
        : ["Las dos raíces (√" + dTxt + " no es exacta:", "son irracionales)"], COLOR_SUMA)));
      L.push(ramaF(v + "₂", textoRaizX(R2)));
    }
    // la forma factorizada en general (renglon propio) y despues el reemplazo
    var forma = libreF(LnF(null, null, "Forma factorizada: a(" + v + " − " + v + "₁)(" + v + " − " + v + "₂)"));
    forma.corte = true;
    L.push(forma);
    L.push(LnF(nom, "=", "a(" + v + " − " + v + "₁)(" + v + " − " + v + "₂)"));
    var crudo = factorizadoX(a, R1, R2, v, false), limpio = factorizadoX(a, R1, R2, v, true);
    L.push(LnF(nom, "=", crudo, notaF("Reemplazar a, " + v + "₁ y " + v + "₂", COLOR_PRODUCTO)));
    if (limpio !== crudo) L.push(LnF(nom, "=", limpio, notaF(frUno(a) || (a.n === -1 && a.d === 1)
      ? ["Simplificar: " + frTexto(a) + "(...) = " + (a.n < 0 ? "−" : "") + "(...)"] : "Resolver los signos", COLOR_SUMA)));
    L[L.length - 1].color = color;
    return L;
  }

  // ---------------------------------------------- completar el cuadrado
  // `marcar`: llave debajo de los terminos de..a de la linea y una flecha
  // hacia la linea siguiente, con la explicacion al costado de la flecha
  function marcarF(l, de, a, texto, color) { l.marcar = { de: de, a: a, texto: texto, color: color }; return l; }

  function metodoCompletar(P, nom, color) {
    var a = P.a, b = P.b, c = P.c, v = P.vari, L = [];
    var B = frDiv(b, a), C = frDiv(c, a), h = frDiv(B, fr(2)), pre = prefijoF(a);
    // envuelve en a(...) o a[...] (con [ ] si adentro ya hay parentesis)
    var env = function (its, corchete) { return pre ? [pre + (corchete ? "[" : "(")].concat(itF(its), [corchete ? "]" : ")"]) : itF(its); };
    var masC = frCero(C) ? "" : conSignoF(C, 0, v);
    L.push(LnF(nom, "=", poliF(a, b, c, v)));
    if (pre) L.push(LnF(null, "=", [TF(pre, COLOR_PRODUCTO), "(" + poliF(fr(1), B, C, v) + ")"],
      notaF("Sacar factor común " + frTexto(a), COLOR_PRODUCTO)));
    var cuad, K;
    if (!frCero(B)) {
      var hs = cuadradoF(frTexto(h)), lin = textoPoli([[fr(1), 2], [B, 1]], v);
      cuad = "(" + textoPoli([[fr(1), 1], [h, 0]], v) + ")²";
      // x² + Bx + (B/2)² − (B/2)² + C, con el trinomio marcado
      var t0 = TF(lin), t1 = TF(" + " + hs, COLOR_SUMA);
      L.push(marcarF(LnF(null, "=", env([t0, t1, TF(" − " + hs, COLOR_SUMA), masC]),
        notaF(["Sumar y restar " + hs, "(el cuadrado de la mitad de " + frTexto(B) + ")"], COLOR_SUMA)),
        t0, t1, ["Aplicar trinomio cuadrado perfecto:", lin + " + " + hs + " = " + cuad], COLOR_PRODUCTO));
      L.push(LnF(null, "=", env([TF(cuad, COLOR_PRODUCTO), " − " + hs + masC], true)));
      // las cuentas de a una: primero el cuadrado, despues la suma
      var h2 = frMul(h, h);
      K = frRes(h2, C);
      if (!frCero(C)) L.push(LnF(null, "=", env([cuad, " − " + frTexto(h2) + masC], true)));
      // con distinto denominador, primero se lleva a denominador comun
      if (!frCero(C) && h2.d !== C.d && (h2.d !== 1 || C.d !== 1)) {
        var dc = h2.d * C.d / mcdAbs(h2.d, C.d);
        var conDen = function (q) { return Math.abs(q.n) * (dc / q.d) + "/" + dc; };
        L.push(LnF(null, "=", env([cuad, " − " + conDen(h2) + (C.n < 0 ? " − " : " + ") + conDen(C)], true)));
      }
      L.push(LnF(null, "=", env([cuad, frCero(K) ? "" : conSignoF(frNeg(K), 0, v)], true)));
    } else {
      cuad = v + "²"; K = frNeg(C);
    }
    var final;
    if (frCero(K)) {
      final = pre + cuad;
    } else if (K.n < 0) {
      L.push(LnF(null, null, TF("Un cuadrado más un número positivo no se puede factorizar en ℝ", COLOR_MAL)));
      L.push(LnF(null, null, TF(nom + " no se puede factorizar en ℝ", color)));
      return L;
    } else {
      var rz = raizRacional(K), vT = textoRaizF(rz), vS = cuadradoF(vT);
      var u = textoPoli([[fr(1), 1], [h, 0]], v), dif = "(" + u + " − " + vT + ")(" + u + " + " + vT + ")";
      var c0 = TF(cuad), c1 = TF(vS, COLOR_PRODUCTO);
      L.push(marcarF(LnF(null, "=", env([c0, " − ", c1], true), notaF("Escribir " + frTexto(K) + " como " + vS, COLOR_PRODUCTO)),
        c0, c1, ["Aplicar diferencia de cuadrados:", "u² − v² = (u − v)(u + v)"], COLOR_PRODUCTO));
      L.push(LnF(null, "=", [pre, TF(dif, COLOR_PRODUCTO)]));
      final = pre + dif;
      if (rz.m === 1) {
        var r1 = frRes(h, rz.coef), r2 = frSuma(h, rz.coef);
        final = pre + "(" + textoPoli([[fr(1), 1], [r1, 0]], v) + ")(" + textoPoli([[fr(1), 1], [r2, 0]], v) + ")";
        // con fracciones, primero el resultado sin simplificar (x − 18/12)
        var dd = h.d * rz.coef.d / mcdAbs(h.d, rz.coef.d);
        if (dd !== 1) {
          var sinSimp = function (r) {
            var n = r.n * (dd / r.d);
            return n === 0 ? v : v + (n < 0 ? " + " : " − ") + Math.abs(n) + "/" + dd;
          };
          var medio = pre + "(" + sinSimp(frNeg(r1)) + ")(" + sinSimp(frNeg(r2)) + ")";
          if (medio !== final && medio !== pre + dif) L.push(LnF(null, "=", medio));
        }
        if (final !== pre + dif) L.push(LnF(null, "=", TF(final)));
      }
    }
    L.push(LnF(nom, "=", final, null, color));
    return L;
  }

  // ------------------------------------------------------ descomposicion
  function metodoDescomposicion(P, nom, color, op) {
    var a = P.a, b = P.b, c = P.c, v = P.vari, L = [];
    var b2 = frMul(b, b), q4 = frMul(fr(4), frMul(a, c)), D = frRes(b2, q4), rz = D.n < 0 ? null : raizRacional(D);
    var sePuede = rz && rz.m === 1;
    L.push(LnF(nom, "=", poliF(a, b, c, v)));
    if (op.discriminante) {
      // seccion propia: valores de a, b y c, el calculo de Δ y las dos
      // condiciones, cada una escrita en general y despues con el valor
      var sub = LnF(null, null, TF("Análisis del discriminante"), null, color);
      sub.sub = true;
      L.push(sub);
      L.push(LnF(null, null, ["a = ", TF(frTexto(a), COLOR_A), "    b = ", TF(frTexto(b), COLOR_B), "    c = ", TF(frTexto(c), COLOR_C)]));
      L.push(LnF("Δ", "=", [TF("b", COLOR_B), "² − 4·", TF("a", COLOR_A), "·", TF("c", COLOR_C)]));
      L.push(LnF(null, "=", [TF(px(b), COLOR_B), "² − 4·", TF(px(a), COLOR_A), "·", TF(px(c), COLOR_C)],
        notaF("Reemplazar a, b y c", COLOR_PRODUCTO)));
      L.push(LnF(null, "=", TF(frTexto(b2) + " − " + px(q4), COLOR_SUMA), notaF("Resolver las operaciones", COLOR_SUMA)));
      L.push(LnF(null, "=", frTexto(D)));
      var dT = D.d === 1 ? frTexto(D) : "(" + frTexto(D) + ")";
      // los dos criterios, uno al lado del otro: en general y con el valor
      var crit = [["Δ ≥ 0"], [[frTexto(D) + " ≥ 0", MarcaF(D.n >= 0)]]];
      if (D.n >= 0) {
        crit[0].push([RzF("Δ"), " ∈ ℚ"]);
        crit[1].push([RzF(frTexto(D))].concat(sePuede ? [" = " + frTexto(rz.coef) + " ∈ ℚ"] : [" ∉ ℚ"], [MarcaF(sePuede)]));
      }
      L.push(LnF(null, null, TablaF(crit)));
      if (sePuede) L.push(libreF(LnF(null, null, "Se puede factorizar por descomposición")));
    }
    if (!sePuede) {
      L.push(libreF(LnF(null, null, TF(nom + " no se puede factorizar por descomposición: " +
        (D.n < 0 ? "Δ < 0, las raíces son imaginarias" : "√Δ ∉ ℚ, las raíces son irracionales"), color))));
      return L;
    }
    var inicio = L.length; // aca empieza la factorizacion (otra alineacion)
    // factor comun: k·(a'x² + b'x + c') con a', b', c' enteros y a' > 0
    var mcm = [a, b, c].reduce(function (m, q) { return m * q.d / mcdAbs(m, q.d); }, 1);
    var ent = [a, b, c].map(function (q) { return q.n * (mcm / q.d); });
    var g = ent.reduce(function (m, n) { return mcdAbs(m, n); }, 0);
    var k = fr((ent[0] < 0 ? -1 : 1) * g, mcm);
    var A = ent[0] / g * (ent[0] < 0 ? -1 : 1), Bq = ent[1] / g * (ent[0] < 0 ? -1 : 1), Cq = ent[2] / g * (ent[0] < 0 ? -1 : 1);
    var pre = prefijoF(k), Q = poliF(fr(A), fr(Bq), fr(Cq), v);
    if (pre) {
      L.push(LnF(nom, "=", [TF(frTexto(k), COLOR_PRODUCTO), "(" + Q + ")"], notaF("Sacar factor común " + frTexto(k), COLOR_PRODUCTO)));
      L.push(LnF(null, null, "Factorizamos " + Q + ":"));
    }
    var cortar = function () { if (op.discriminante && L[inicio]) L[inicio].corte = true; };
    var mono = function (n, g2) { return monoF(fr(Math.abs(n)), g2, v); };
    var sig = function (n, g2) { return (n < 0 ? " − " : " + ") + mono(n, g2); };
    var pn = function (n) { return n < 0 ? "(" + frTexto(fr(n)) + ")" : frTexto(fr(n)); };
    var bin = function (m, n) { return textoPoli([[fr(m), 1], [fr(n), 0]], v); };
    var ax2 = mono(A, 2), b1, b2t, fin;
    if (Cq === 0) {
      b1 = bin(A, Bq);
      L.push(LnF(null, "=", [TF(v, COLOR_PRODUCTO), "(" + b1 + ")"], notaF("Sacar factor común " + v, COLOR_PRODUCTO)));
      fin = pre + v + "(" + b1 + ")";
      L.push(LnF(nom, "=", fin, null, color));
      cortar();
      return L;
    }
    var p, q;
    if (Bq === A + Cq || Bq === -(A + Cq)) {
      var mas = Bq === A + Cq;
      p = mas ? A : -A; q = mas ? Cq : -Cq;
      L.push(libreF(LnF(null, null, "El término lineal se arma con a y c (b = " + (mas ? "" : "−(") + "a + c" + (mas ? "" : ")") + "):")));
      L.push(LnF(null, null, ["Caso 1: " + frTexto(fr(Bq)) + " = " + (mas ? "" : "−(") + A + " + " + pn(Cq) + (mas ? "" : ")"), MarcaF(true)]));
      L.push(LnF(null, "=", ["a" + v + "² ", TF((mas ? "+ (a + c)" : "− (a + c)") + v, COLOR_SUMA), " + c"],
        notaF("Escribir b como " + (mas ? "a + c" : "−(a + c)"), COLOR_SUMA)));
      L.push(LnF(null, "=", [ax2, TF((mas ? " + (" : " − (") + A + " + " + pn(Cq) + ")" + v, COLOR_SUMA), sig(Cq, 0)],
        notaF("Reemplazar a = " + A + " y c = " + frTexto(fr(Cq)), COLOR_SUMA)));
    } else {
      var N = A === 1 ? Cq : A * Cq, caso2 = A === 1;
      L.push(libreF(LnF(null, null, caso2 ? "a = 1: buscar p y q con p + q = b y p · q = c"
        : "a ≠ 1 y no es el caso 1: buscar p y q con p + q = b y p · q = a · c")));
      L.push(LnF(null, null, (caso2 ? "Caso 2" : "Caso 3") + ": Condiciones a cumplir"));
      L.push(LnF(null, null, ["    ", SistemaF([["p + q = " + frTexto(fr(Bq))],
        ["p · q = " + (caso2 ? frTexto(fr(Cq)) : A + "·" + pn(Cq) + " = " + frTexto(fr(N)))]])]));
      L.push(libreF(LnF(null, null, "Descomponer " + frTexto(fr(N)) + " en dos factores:")));
      // pares de factores de N, en el orden de la filmina, hasta encontrarlo
      // (si N > 0, p y q tienen el signo de b: solo se prueban esos)
      var M = Math.abs(N), sb = Bq < 0 ? -1 : 1;
      for (var d = 1; d * d <= M && p === undefined; d++) {
        if (M % d) continue;
        var pares = N > 0 ? [[sb * d, sb * N / d]] : [[-d, -N / d], [d, N / d]];
        for (var j = 0; j < pares.length; j++) {
          var x1 = pares[j][0], x2 = pares[j][1], ok = x1 + x2 === Bq;
          // los que no sirven llevan una cruz; el que sirve, recuadro y check
          var par = LnF(null, null, [frTexto(fr(N)) + " = " + pn(x1) + "·" + pn(x2) + "      " + pn(x1) + " + " + pn(x2) + " = " +
            frTexto(fr(x1 + x2)), MarcaF(ok)]);
          if (ok) par.caja = COLOR_SUMA;
          L.push(par);
          if (ok) { p = x1; q = x2; break; }
        }
      }
      if (p === undefined) { L.push(LnF(null, null, TF("No se encontraron p y q", COLOR_MAL))); return L; }
      L.push(LnF(null, null, TF("p = " + frTexto(fr(p)) + " ∧ q = " + frTexto(fr(q)), COLOR_SUMA)));
      var reemplazo = notaF("Reemplazar p = " + frTexto(fr(p)) + " y q = " + frTexto(fr(q)), COLOR_SUMA);
      if (caso2) {
        L.push(LnF(null, "=", [v + "² + ", TF("(p + q)", COLOR_SUMA), v + " + ", TF("p · q", COLOR_SUMA)],
          notaF("Escribir b = p + q y c = p · q", COLOR_SUMA)));
        L.push(LnF(null, "=", [ax2, " + ", TF("(" + pn(p) + " + " + pn(q) + ")", COLOR_SUMA), v + " + ", TF(pn(p) + "·" + pn(q), COLOR_SUMA)],
          reemplazo));
      } else {
        L.push(LnF(null, "=", ["a" + v + "² + ", TF("(p + q)", COLOR_SUMA), v + " + c"], notaF("Escribir b = p + q", COLOR_SUMA)));
        L.push(LnF(null, "=", [ax2, " + ", TF("(" + pn(p) + " + " + pn(q) + ")", COLOR_SUMA), v + sig(Cq, 0)],
          notaF(["Reemplazar a = " + A + ", c = " + frTexto(fr(Cq)) + ",", "p = " + frTexto(fr(p)) + " y q = " + frTexto(fr(q))], COLOR_SUMA)));
      }
    }
    // a'x² + px + qx + c' y factor comun por grupos
    L.push(LnF(null, "=", [ax2, TF(sig(p, 1) + sig(q, 1), COLOR_SUMA), sig(Cq, 0)],
      notaF("Aplicar la propiedad distributiva", COLOR_SUMA)));
    var g1 = mcdAbs(A, p), g2 = (q < 0 ? -1 : 1) * mcdAbs(q, Cq);
    b1 = bin(A / g1, p / g1); b2t = bin(q / g2, Cq / g2);
    var m1 = (g1 === 1 ? "" : g1) + v;
    L.push(LnF(null, "=", [TF(m1 + "(" + b1 + ")", COLOR_PRODUCTO), sig(q, 1) + sig(Cq, 0)],
      notaF("Sacar factor común " + m1, COLOR_PRODUCTO)));
    L.push(LnF(null, "=", [m1 + "(" + b1 + ") + ", TF(pn(g2) + "(" + b2t + ")", COLOR_PRODUCTO)],
      notaF("Sacar factor común " + frTexto(fr(g2)), COLOR_PRODUCTO)));
    var crudo = "(" + m1 + " + " + pn(g2) + ")", limpio = "(" + textoPoli([[fr(g1), 1], [fr(g2), 0]], v) + ")";
    L.push(LnF(null, "=", [TF("(" + b1 + ")", COLOR_PRODUCTO), crudo], notaF("Sacar factor común (" + b1 + ")", COLOR_PRODUCTO)));
    if (limpio !== crudo) L.push(LnF(null, "=", "(" + b1 + ")" + limpio, notaF("Resolver los signos", COLOR_SUMA)));
    fin = pre + ("(" + b1 + ")" === limpio ? "(" + b1 + ")²" : "(" + b1 + ")" + limpio);
    L.push(LnF(nom, "=", fin, pre ? notaF("Volver a multiplicar por " + frTexto(k), COLOR_PRODUCTO) : null, color));
    cortar();
    return L;
  }

  var METODOS_F = [
    { clave: "mFormula", titulo: "Fórmula cuadrática", hacer: metodoFormula },
    { clave: "mCompletar", titulo: "Completar el cuadrado", hacer: metodoCompletar },
    { clave: "mDescomposicion", titulo: "Factorización por descomposición", hacer: metodoDescomposicion },
  ];
  function nombrePoli(i) { return "PQRSTUVW"[i % 8]; }

  function generarFactorizacion(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20, lh = tam * fuente.lh;
    var y = oy;
    op.filas.forEach(function (fila, i) {
      var P = leerPoli(fila.texto);
      if (P.error) return;
      var n = String(fila.nombre || "").trim() || nombrePoli(i);
      var nom = /\(/.test(n) ? n : n + "(" + P.vari + ")";
      METODOS_F.forEach(function (m) {
        if (!op[m.clave]) return;
        if (op.titulos) {
          var ts = tamTitulo(tam);
          agregar(texto(ox, y, m.titulo, ts, fuente, fila.color, "left"));
          y += ts * fuente.lh + lh * 0.4;
        }
        y = dibujarBloqueF(m.hacer(P, nom, fila.color, op), ox + (op.titulos ? tam : 0), y, op, agregar) + lh * 1.3;
      });
      y += lh;
    });
  }

  // ============================================= RAZONAMIENTOS DEDUCTIVOS
  // Cada fila es un razonamiento: premisas separadas por coma y la conclusion
  // despues de ∴ (p → q, ¬q ∴ ¬p). Se muestra si es valido por tres metodos
  // (tabla de verdad, condicional asociado y metodo abreviado) y se busca una
  // demostracion con reglas de inferencia.
  var SUB_RAZ = "₀₁₂₃₄₅₆₇₈₉";
  function subRaz(n) { return String(n).split("").map(function (d) { return SUB_RAZ[d]; }).join(""); }

  function leerRazonamiento(txt) {
    var t = String(txt || "").trim();
    if (!t) return { error: "Escribí las premisas y la conclusión: p → q, ¬q ∴ ¬p" };
    var partes = t.split(/∴|⊢|\//);
    if (partes.length < 2) return { error: "Falta la conclusión: escribila después de ∴ (p → q, p ∴ q)" };
    if (partes.length > 2) return { error: "Va un solo ∴ (antes de la conclusión)" };
    var prem = partes[0].split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
    var conc = partes[1].trim();
    if (!prem.length) return { error: "Falta al menos una premisa antes de ∴" };
    if (!conc) return { error: "Falta la conclusión después de ∴" };
    // variables: los nombres que aparecen (sin las palabras de los conectivos)
    var vars = [];
    (t.match(/[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ_0-9]*/g) || []).forEach(function (w) {
      if (PALABRAS[w.toLowerCase()] || w === "V" || w === "F") return;
      if (vars.indexOf(w) < 0) vars.push(w);
    });
    vars.sort();
    if (vars.length > 6) return { error: "Hay demasiadas variables (" + vars.length + "): como máximo 6" };
    var premisas = [];
    for (var i = 0; i < prem.length; i++) {
      var r = analizarLogica(prem[i], vars);
      if (r.error) return { error: "Premisa " + (i + 1) + ": " + r.error };
      premisas.push(sinParRaz(r.arbol));
    }
    var c = analizarLogica(conc, vars);
    if (c.error) return { error: "Conclusión: " + c.error };
    return { vars: vars, premisas: premisas, conclusion: sinParRaz(c.arbol) };
  }

  // copia del arbol sin las marcas de parentesis del autor
  function sinParRaz(n) {
    if (n.t === "var") return { t: "var", n: n.n };
    if (n.t === "const") return { t: "const", v: n.v, txt: n.v ? "V" : "F" };
    if (n.t === "no") return { t: "no", a: sinParRaz(n.a) };
    return { t: "bin", op: n.op, a: sinParRaz(n.a), b: sinParRaz(n.b) };
  }
  function noRaz(a) { return { t: "no", a: a }; }
  function binRaz(op, a, b) { return { t: "bin", op: op, a: a, b: b }; }
  // la negacion "opuesta": ¬A -> A, A -> ¬A
  function oppRaz(n) { return n.t === "no" ? n.a : noRaz(n); }
  function esOpRaz(n, op) { return n.t === "bin" && n.op === op; }

  // texto con parentesis segun la precedencia (∧ y ∨ encadenados a la
  // izquierda sin parentesis: p ∧ q ∧ r)
  function txtRaz(n, env) {
    if (n.t === "var") return env && env[n.n] !== undefined ? (env[n.n] ? "V" : "F") : n.n;
    if (n.t === "const") return n.v ? "V" : "F";
    if (n.t === "no") { var s = txtRaz(n.a, env); return "¬" + (n.a.t === "bin" ? "(" + s + ")" : s); }
    var izq = txtRaz(n.a, env), der = txtRaz(n.b, env);
    if (n.a.t === "bin" && !(n.a.op === n.op && (n.op === "y" || n.op === "o"))) izq = "(" + izq + ")";
    if (n.b.t === "bin") der = "(" + der + ")";
    return izq + " " + CONECTIVOS[n.op] + " " + der;
  }

  // todas las combinaciones de valores (fila 0: todas V)
  function filasRaz(vars) {
    var envs = [];
    for (var r = 0; r < Math.pow(2, vars.length); r++) {
      var env = {};
      vars.forEach(function (v, j) { env[v] = ((r >> (vars.length - 1 - j)) & 1) === 0; });
      envs.push(env);
    }
    return envs;
  }
  function esValidoRaz(R) {
    return filasRaz(R.vars).every(function (env) {
      return !R.premisas.every(function (p) { return valorLogico(p, env); }) || valorLogico(R.conclusion, env);
    });
  }

  // ------------------------------------------------------------- dibujo
  // ✓ verde o ✗ roja dibujadas, empezando en x y centradas en mid
  function marcaRaz(ok, x, mid, tam, agregar) {
    if (ok) {
      var t = tam * 0.85;
      agregar(trazo([[x, mid], [x + t * 0.35, mid + t * 0.35], [x + t, mid - t * 0.45]], { strokeColor: COLOR_SUMA, strokeWidth: 3 }));
    } else {
      var u = tam * 0.55, y0 = mid - u / 2;
      agregar(trazo([[x, y0], [x + u, y0 + u]], { strokeColor: COLOR_MAL, strokeWidth: 3 }));
      agregar(trazo([[x + u, y0], [x, y0 + u]], { strokeColor: COLOR_MAL, strokeWidth: 3 }));
    }
  }

  // Tabla de verdad. cols: [{ titulo, valores, color, sep }] (sep: linea
  // gruesa a la izquierda); marcas: [{ fila, ok }] = recuadro de la fila y
  // ✓/✗ a la derecha. Devuelve la y de abajo.
  function tablaRaz(cols, marcas, x, y, c) {
    var tam = c.tam, fuente = c.fuente, lh = tam * fuente.lh, ag = c.agregar;
    var pad = tam * 0.7, hF = lh * 1.15, hC = lh * 1.4, xs = [], xx = x, nF = cols[0].valores.length;
    cols.forEach(function (col) {
      col.w = Math.max(medir(col.titulo, tam, fuente), medir("V", tam, fuente)) + pad * 2;
      xs.push(xx); xx += col.w;
    });
    var W = xx - x, H = hC + nF * hF;
    ag(base("rectangle", { x: x, y: y, width: W, height: H, strokeColor: TINTA, strokeWidth: 1.5 }));
    ag(trazo([[x, y + hC], [x + W, y + hC]], { strokeColor: TINTA, strokeWidth: 1.5 }));
    cols.forEach(function (col, j) {
      if (j) ag(trazo([[xs[j], y], [xs[j], y + H]], { strokeColor: TINTA, strokeWidth: col.sep ? 3 : 1 }));
    });
    cols.forEach(function (col, j) {
      var cc = col.color || TINTA;
      ag(texto(xs[j] + col.w / 2, y + (hC - lh) / 2, col.titulo, tam, fuente, cc, "center"));
      col.valores.forEach(function (v, i) {
        ag(texto(xs[j] + col.w / 2, y + hC + i * hF + (hF - lh) / 2, v ? c.V : c.F, tam, fuente, cc, "center"));
      });
    });
    marcas.forEach(function (m) {
      var yr = y + hC + m.fila * hF;
      ag(base("rectangle", { x: x + 3, y: yr + 2, width: W - 6, height: hF - 4, strokeColor: m.ok ? COLOR_SUMA : COLOR_MAL,
        strokeWidth: 2, roundness: { type: 3 } }));
      marcaRaz(m.ok, x + W + tam * 0.4, yr + hF / 2, tam, ag);
    });
    return y + H;
  }

  // renglon de texto (con marca ✓/✗ al final si `marca` no es undefined)
  function renglonRaz(t, x, y, c, color, marca) {
    var lh = c.tam * c.fuente.lh;
    c.agregar(texto(x, y, t, c.tam, c.fuente, color || TINTA, "left"));
    if (marca !== undefined) marcaRaz(marca, x + medir(t, c.tam, c.fuente) + c.tam * 0.5, y + lh / 2, c.tam, c.agregar);
    return y + lh * 1.25;
  }

  // ------------------------------------------- 1) tabla de verdad
  function metodoTablaRaz(R, x, y, c) {
    if (R.vars.length > 5) return renglonRaz("Con " + R.vars.length + " variables la tabla tiene " +
      Math.pow(2, R.vars.length) + " filas: es demasiado grande para dibujarla.", x, y, c);
    var envs = filasRaz(R.vars), marcas = [];
    var cols = R.vars.map(function (v) { return { titulo: v, valores: envs.map(function (e) { return e[v]; }) }; });
    R.premisas.forEach(function (p, i) {
      cols.push({ titulo: txtRaz(p), valores: envs.map(function (e) { return valorLogico(p, e); }), sep: !i });
    });
    cols.push({ titulo: txtRaz(R.conclusion), valores: envs.map(function (e) { return valorLogico(R.conclusion, e); }), sep: true });
    var valido = true;
    envs.forEach(function (e, i) {
      if (!R.premisas.every(function (p) { return valorLogico(p, e); })) return;
      var ok = valorLogico(R.conclusion, e);
      if (!ok) valido = false;
      marcas.push({ fila: i, ok: ok });
    });
    y = renglonRaz("Se marcan las filas en las que todas las premisas son verdaderas:", x, y, c);
    y = tablaRaz(cols, marcas, x, y + c.tam * 0.3, c) + c.tam * 0.6;
    if (!marcas.length) return renglonRaz("Las premisas nunca son verdaderas a la vez: el razonamiento es válido", x, y, c, TINTA, true);
    return renglonRaz(valido ? "En esas filas la conclusión siempre es verdadera: el razonamiento es válido"
      : "Hay una fila con las premisas verdaderas y la conclusión falsa: el razonamiento no es válido", x, y, c, TINTA, valido);
  }

  // ------------------------------------------- 2) condicional asociado
  function antecedenteRaz(R) {
    return R.premisas.reduce(function (a, p) { return a ? binRaz("y", a, p) : p; }, null);
  }
  function metodoCondicionalRaz(R, x, y, c) {
    var ant = antecedenteRaz(R), cond = binRaz("entonces", ant, R.conclusion);
    var gen = R.premisas.map(function (p, i) { return "P" + subRaz(i + 1); }).join(" ∧ ");
    var conTxt = (R.conclusion.t === "bin" ? "(" + txtRaz(R.conclusion) + ")" : txtRaz(R.conclusion));
    var antTxt = R.premisas.length > 1 || ant.t === "bin" ? "[" + txtRaz(ant) + "]" : txtRaz(ant);
    y = renglonRaz("El razonamiento es válido si (" + gen + ") → C es una tautología:", x, y, c);
    y = renglonRaz(antTxt + " → " + conTxt, x + c.tam, y, c);
    if (R.vars.length > 5) return renglonRaz("Con " + R.vars.length + " variables la tabla es demasiado grande para dibujarla.", x, y, c);
    var envs = filasRaz(R.vars);
    var cols = R.vars.map(function (v) { return { titulo: v, valores: envs.map(function (e) { return e[v]; }) }; });
    var col = function (n, titulo, sep, color) {
      cols.push({ titulo: titulo || txtRaz(n), valores: envs.map(function (e) { return valorLogico(n, e); }), sep: sep, color: color });
    };
    if (R.premisas.length > 1) R.premisas.forEach(function (p, i) { col(p, null, !i); });
    col(ant, R.premisas.length > 1 ? antTxt : null, R.premisas.length === 1);
    col(R.conclusion, null, false);
    col(cond, antTxt + " → " + conTxt, true, c.color);
    var marcas = [];
    cols[cols.length - 1].valores.forEach(function (v, i) { if (!v) marcas.push({ fila: i, ok: false }); });
    y = tablaRaz(cols, marcas, x, y + c.tam * 0.3, c) + c.tam * 0.6;
    return renglonRaz(marcas.length ? "No es una tautología (hay filas con F): el razonamiento no es válido"
      : "Es una tautología (en todas las filas da V): el razonamiento es válido", x, y, c, TINTA, !marcas.length);
  }

  // ------------------------------------------- 3) metodo abreviado
  // Se supone premisas V y conclusion F y se deducen valores hasta llegar a
  // una contradiccion (valido) o a una asignacion posible (no valido). Si
  // no se puede deducir nada mas, se prueban los dos valores de una variable.
  function parcialRaz(n, env) {
    if (n.t === "var") return env[n.n];
    if (n.t === "const") return n.v;
    if (n.t === "no") { var v = parcialRaz(n.a, env); return v === undefined ? undefined : !v; }
    var a = parcialRaz(n.a, env), b = parcialRaz(n.b, env);
    switch (n.op) {
      case "y": return a === false || b === false ? false : a && b ? true : undefined;
      case "o": return a === true || b === true ? true : a === false && b === false ? false : undefined;
      case "entonces": return a === false || b === true ? true : a === true && b === false ? false : undefined;
      default:
        if (a === undefined || b === undefined) return undefined;
        return n.op === "xo" ? a !== b : a === b;
    }
  }
  function vfRaz(v) { return v ? "V" : "F"; }

  function abreviadoRaz(R) {
    var L = [];
    var poner = function (t, nivel, marca) { L.push({ t: t, nivel: nivel, marca: marca }); };
    poner("Suponemos que no es válido: las premisas V y la conclusión F.", 0);
    var metas = R.premisas.map(function (p, i) { return { n: p, v: true, nom: "P" + subRaz(i + 1) }; })
      .concat([{ n: R.conclusion, v: false, nom: "C" }]);
    // devuelve true si se llego a una contradiccion en todos los casos
    function resolver(metas, env, nivel) {
      metas = metas.slice();
      for (;;) {
        var avance = false;
        for (var k = 0; k < metas.length; k++) {
          var g = metas[k], nom = g.nom ? g.nom + ": " : "", txt = txtRaz(g.n);
          var val = parcialRaz(g.n, env);
          if (val !== undefined) {
            metas.splice(k--, 1);
            avance = true;
            if (val !== g.v) {
              poner(nom + txt + " = " + txtRaz(g.n, env) + " = " + vfRaz(val) + ", pero debía ser " + vfRaz(g.v) +
                ": contradicción", nivel, false);
              return true;
            }
            continue;
          }
          var n = g.n, v = g.v, nuevas = null, dato = "";
          var a = n.a ? parcialRaz(n.a, env) : undefined, b = n.b ? parcialRaz(n.b, env) : undefined;
          // `dato`: el valor ya conocido que se usa para deducir
          var conA = function () { dato = " y " + txtRaz(n.a) + " = " + vfRaz(a); };
          var conB = function () { dato = " y " + txtRaz(n.b) + " = " + vfRaz(b); };
          if (n.t === "var") nuevas = [[n, v]];
          else if (n.t === "no") nuevas = [[n.a, !v]];
          else if (n.op === "y" && v) nuevas = [[n.a, true], [n.b, true]];
          else if (n.op === "o" && !v) nuevas = [[n.a, false], [n.b, false]];
          else if (n.op === "entonces" && !v) nuevas = [[n.a, true], [n.b, false]];
          else if (n.op === "y" && a === true) { conA(); nuevas = [[n.b, false]]; }
          else if (n.op === "y" && b === true) { conB(); nuevas = [[n.a, false]]; }
          else if (n.op === "o" && a === false) { conA(); nuevas = [[n.b, true]]; }
          else if (n.op === "o" && b === false) { conB(); nuevas = [[n.a, true]]; }
          else if (n.op === "entonces" && a === true) { conA(); nuevas = [[n.b, true]]; }
          else if (n.op === "entonces" && b === false) { conB(); nuevas = [[n.a, false]]; }
          else if ((n.op === "sii" || n.op === "xo") && (a !== undefined || b !== undefined)) {
            var conocido = a !== undefined ? a : b, otro = a !== undefined ? n.b : n.a;
            if (a !== undefined) conA(); else conB();
            nuevas = [[otro, n.op === "sii" ? (v ? conocido : !conocido) : (v ? !conocido : conocido)]];
          }
          if (!nuevas) continue;
          metas.splice(k--, 1);
          avance = true;
          // las variables se asignan en el mismo renglon
          var partes = [], choque = null;
          nuevas.forEach(function (q) {
            partes.push(txtRaz(q[0]) + " = " + vfRaz(q[1]));
            if (q[0].t === "var") {
              if (env[q[0].n] !== undefined && env[q[0].n] !== q[1]) choque = q[0].n;
              else env[q[0].n] = q[1];
            } else metas.push({ n: q[0], v: q[1] });
          });
          var porQue = n.t === "var" ? "" : dato + "  ⇒  " + partes.join(" y ");
          if (choque) {
            poner(nom + txt + " = " + vfRaz(v) + porQue + ", pero " + choque + " ya era " + vfRaz(env[choque]) +
              ": contradicción", nivel, false);
            return true;
          }
          poner(nom + txt + " = " + vfRaz(v) + porQue, nivel);
        }
        if (!metas.length) {
          var asig = R.vars.filter(function (x) { return env[x] !== undefined; })
            .map(function (x) { return x + " = " + vfRaz(env[x]); }).join(", ");
          poner("No hay contradicción (" + asig + "): las premisas pueden ser V con la conclusión F", nivel, false);
          return false;
        }
        if (avance) continue;
        // no se puede deducir mas: se prueban los dos valores de una variable
        var libre = null;
        metas.forEach(function (g) {
          (function buscar(n) {
            if (libre) return;
            if (n.t === "var" && env[n.n] === undefined) libre = n.n;
            if (n.a) buscar(n.a);
            if (n.b) buscar(n.b);
          })(g.n);
        });
        if (!libre) return false;
        poner("No se puede deducir más: probamos los dos valores de " + libre + ".", nivel);
        var todos = true;
        [true, false].forEach(function (val) {
          if (!todos) return;
          poner("Caso " + libre + " = " + vfRaz(val) + ":", nivel + 1);
          var e2 = {};
          for (var q in env) e2[q] = env[q];
          e2[libre] = val;
          if (!resolver(metas, e2, nivel + 2)) todos = false;
        });
        return todos;
      }
    }
    var valido = resolver(metas, {}, 0);
    poner(valido ? "Siempre se llega a una contradicción: el razonamiento es válido"
      : "Se encontró un caso con las premisas V y la conclusión F: el razonamiento no es válido", 0, valido);
    return L;
  }
  function metodoAbreviadoRaz(R, x, y, c) {
    abreviadoRaz(R).forEach(function (l) { y = renglonRaz(l.t, x + l.nivel * c.tam, y, c, TINTA, l.marca); });
    return y;
  }

  // ------------------------------------------- 4) demostracion
  var REGLAS_RAZ = {
    MP: "Modus Ponens: A → B, A ⊢ B",
    MT: "Modus Tollens (tollendo tollens): A → B, ¬B ⊢ ¬A",
    SH: "Silogismo hipotético: A → B, B → C ⊢ A → C",
    SD: "Silogismo disyuntivo (tollendo ponens): A ∨ B, ¬A ⊢ B",
    Simp: "Simplificación: A ∧ B ⊢ A",
    Conj: "Conjunción: A, B ⊢ A ∧ B",
    Adic: "Adición: A ⊢ A ∨ B",
    DC: "Dilema constructivo: A → B, C → D, A ∨ C ⊢ B ∨ D",
    TE: "Tercero excluido: ⊢ A ∨ ¬A",
    DN: "Doble negación: ¬¬A ⊢ A",
    Idem: "Idempotencia: A ∨ A ⊢ A",
    Cond: "Definición del condicional: A → B ≡ ¬A ∨ B",
    CR: "Contrarrecíproco: A → B ≡ ¬B → ¬A",
    DM: "De Morgan: ¬(A ∧ B) ≡ ¬A ∨ ¬B,  ¬(A ∨ B) ≡ ¬A ∧ ¬B",
    Conm: "Conmutativa: A ∨ B ≡ B ∨ A,  A ∧ B ≡ B ∧ A",
    Bic: "Bicondicional: A ↔ B ⊢ A → B,  A ↔ B ⊢ B → A",
  };

  // Busqueda por rondas (en cada una se aplican todas las reglas a lo que
  // ya se tiene). Para que no crezca sin fin, lo nuevo tiene que ser una
  // parte de las premisas o de la conclusion (o su negacion), salvo los
  // resultados de SH y DC. Devuelve las lineas de la deduccion o null.
  function demostrarRaz(R) {
    var K = [], porClave = {}, U = {}, objetivo = txtRaz(R.conclusion);
    function enU(n) { return !!U[txtRaz(n)]; }
    (function partes(lista) {
      lista.forEach(function sub(n) {
        U[txtRaz(n)] = true; U[txtRaz(oppRaz(n))] = true;
        if (n.a) sub(n.a);
        if (n.b) sub(n.b);
      });
    })(R.premisas.concat([R.conclusion]));
    function sumar(n, regla, deps) {
      var k = txtRaz(n);
      if (porClave[k]) return;
      var it = { n: n, k: k, regla: regla, deps: deps, orden: K.length };
      porClave[k] = it; K.push(it);
    }
    R.premisas.forEach(function (p) { sumar(p, "Premisa", []); });
    var claveDe = function (n) { return txtRaz(n); }, tiene = function (n) { return porClave[claveDe(n)]; };
    for (var ronda = 0; ronda < 10 && !porClave[objetivo] && K.length < 400; ronda++) {
      var nuevos = [], snap = K.slice();
      var prop = function (n, regla, deps) { nuevos.push([n, regla, deps]); };
      var siU = function (n, regla, deps) { if (enU(n) || txtRaz(n) === objetivo) prop(n, regla, deps); };
      snap.forEach(function (f) {
        var n = f.n;
        if (esOpRaz(n, "y")) { prop(n.a, "Simp", [f]); prop(n.b, "Simp", [f]); }
        if (n.t === "no" && n.a.t === "no") prop(n.a.a, "DN", [f]);
        if (esOpRaz(n, "o") && txtRaz(n.a) === txtRaz(n.b)) prop(n.a, "Idem", [f]);
        if (esOpRaz(n, "sii")) { prop(binRaz("entonces", n.a, n.b), "Bic", [f]); prop(binRaz("entonces", n.b, n.a), "Bic", [f]); }
        if (esOpRaz(n, "entonces")) {
          siU(binRaz("o", oppRaz(n.a), n.b), "Cond", [f]);
          siU(binRaz("entonces", oppRaz(n.b), oppRaz(n.a)), "CR", [f]);
        }
        if (esOpRaz(n, "o")) { siU(binRaz("entonces", oppRaz(n.a), n.b), "Cond", [f]); siU(binRaz("o", n.b, n.a), "Conm", [f]); }
        if (esOpRaz(n, "y")) siU(binRaz("y", n.b, n.a), "Conm", [f]);
        // De Morgan siempre (solo se aplica a negaciones que ya se tienen)
        if (n.t === "no" && esOpRaz(n.a, "y")) prop(binRaz("o", oppRaz(n.a.a), oppRaz(n.a.b)), "DM", [f]);
        if (n.t === "no" && esOpRaz(n.a, "o")) prop(binRaz("y", oppRaz(n.a.a), oppRaz(n.a.b)), "DM", [f]);
      });
      snap.forEach(function (f) {
        snap.forEach(function (g) {
          if (f === g) return;
          var a = f.n, b = g.n;
          if (esOpRaz(a, "entonces")) {
            if (txtRaz(b) === txtRaz(a.a)) prop(a.b, "MP", [f, g]);
            if (txtRaz(b) === txtRaz(oppRaz(a.b))) prop(oppRaz(a.a), "MT", [f, g]);
            if (esOpRaz(b, "entonces") && txtRaz(b.a) === txtRaz(a.b)) prop(binRaz("entonces", a.a, b.b), "SH", [f, g]);
            // tercero excluido: si se tiene A → B y ¬A → D, se agrega A ∨ ¬A
            if (esOpRaz(b, "entonces") && txtRaz(b.a) === txtRaz(oppRaz(a.a)) && a.a.t !== "no")
              prop(binRaz("o", a.a, oppRaz(a.a)), "TE", []);
            // dilema constructivo
            if (esOpRaz(b, "entonces")) {
              var d = tiene(binRaz("o", a.a, b.a));
              if (d) prop(binRaz("o", a.b, b.b), "DC", [f, g, d]);
            }
          }
          if (esOpRaz(a, "o")) {
            if (txtRaz(b) === txtRaz(oppRaz(a.a))) prop(a.b, "SD", [f, g]);
            if (txtRaz(b) === txtRaz(oppRaz(a.b))) prop(a.a, "SD", [f, g]);
          }
        });
      });
      // conjuncion y adicion: solo para armar partes que hacen falta
      var metas = [R.conclusion];
      R.premisas.forEach(function (p) { (function sub(n) { metas.push(n); if (n.a) sub(n.a); if (n.b) sub(n.b); })(p); });
      (function sub(n) { metas.push(n); if (n.a) sub(n.a); if (n.b) sub(n.b); })(R.conclusion);
      metas.forEach(function (m) {
        if (esOpRaz(m, "y") && tiene(m.a) && tiene(m.b)) prop(m, "Conj", [tiene(m.a), tiene(m.b)]);
        if (esOpRaz(m, "o") && (tiene(m.a) || tiene(m.b))) prop(m, "Adic", [tiene(m.a) || tiene(m.b)]);
      });
      nuevos.forEach(function (q) { sumar(q[0], q[1], q[2]); });
      if (K.length === snap.length) break;
    }
    var fin = porClave[objetivo];
    if (!fin) return null;
    var usados = {};
    (function marcar(it) { if (usados[it.k]) return; usados[it.k] = true; it.deps.forEach(marcar); })(fin);
    var lineas = [], num = {};
    K.forEach(function (it) {
      if (it.regla !== "Premisa" && !usados[it.k]) return;
      num[it.k] = lineas.length + 1;
      lineas.push({ n: it.n, regla: it.regla, deps: it.deps.map(function (d) { return num[d.k]; }), fin: it === fin });
    });
    return lineas;
  }

  function metodoDemostracionRaz(R, x, y, c, op) {
    if (!esValidoRaz(R)) {
      return renglonRaz("El razonamiento no es válido: no existe una demostración.", x, y, c, TINTA, false);
    }
    var lineas = demostrarRaz(R);
    if (!lineas) {
      y = renglonRaz("No se encontró una deducción con las reglas disponibles.", x, y, c, TINTA, false);
      return renglonRaz("Puede existir igual: el razonamiento es válido (lo muestran los otros métodos).", x, y, c);
    }
    var tam = c.tam, fuente = c.fuente, lh = tam * fuente.lh, hF = lh * 1.25;
    var wN = Math.max.apply(null, lineas.map(function (l, i) { return medir((i + 1) + ".", tam, fuente); }));
    var wF = Math.max.apply(null, lineas.map(function (l) { return medir(txtRaz(l.n), tam, fuente); }));
    var xF = x + wN + tam * 0.8, xJ = xF + wF + tam * 2, usadas = [];
    var nPrem = lineas.filter(function (l) { return l.regla === "Premisa"; }).length;
    lineas.forEach(function (l, i) {
      var col = l.fin ? c.color : TINTA, yy = y + i * hF;
      c.agregar(texto(x + wN, yy, (i + 1) + ".", tam, fuente, col, "right"));
      c.agregar(texto(xF, yy, txtRaz(l.n), tam, fuente, col, "left"));
      var j = l.regla === "Premisa" ? "Premisa" : l.regla + (l.deps.length ? " " + l.deps.join(", ") : "");
      c.agregar(texto(xJ, yy, j, tam, fuente, l.regla === "Premisa" ? TINTA : COLOR_PRODUCTO, "left"));
      if (l.fin) marcaRaz(true, xJ + medir(j, tam, fuente) + tam * 0.5, yy + lh / 2, tam, c.agregar);
      if (l.regla !== "Premisa" && usadas.indexOf(l.regla) < 0) usadas.push(l.regla);
      // linea que separa las premisas de lo deducido
      if (i === nPrem - 1) c.agregar(trazo([[x, yy + hF - 2], [xJ - tam, yy + hF - 2]], { strokeColor: TINTA, strokeWidth: 1 }));
    });
    y += lineas.length * hF + tam * 0.4;
    y = renglonRaz("Puede haber demostraciones más cortas que esta.", x, y, c);
    if (op.reglas && usadas.length) {
      y += tam * 0.3;
      y = renglonRaz("Reglas usadas:", x, y, c);
      usadas.forEach(function (r) { y = renglonRaz(r + " — " + REGLAS_RAZ[r], x + tam, y, c, COLOR_PRODUCTO); });
    }
    return y;
  }

  var METODOS_RAZ = [
    { clave: "mTabla", titulo: "Tabla de verdad", hacer: metodoTablaRaz },
    { clave: "mCondicional", titulo: "Condicional asociado", hacer: metodoCondicionalRaz },
    { clave: "mAbreviado", titulo: "Método abreviado", hacer: metodoAbreviadoRaz },
    { clave: "mDemostracion", titulo: "Demostración con reglas de inferencia", hacer: metodoDemostracionRaz },
  ];

  function generarRazonamientos(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20, lh = tam * fuente.lh;
    var y = oy;
    op.filas.forEach(function (fila) {
      var R = leerRazonamiento(fila.texto);
      if (R.error) return;
      var c = { tam: tam, fuente: fuente, agregar: agregar, color: fila.color,
        V: op.valores === "10" ? "1" : "V", F: op.valores === "10" ? "0" : "F" };
      // el razonamiento: premisas numeradas, una raya y la conclusion con ∴
      var wE = Math.max(medir("P" + subRaz(R.premisas.length) + ": ", tam, fuente), medir("∴ ", tam, fuente));
      var wMax = 0;
      R.premisas.forEach(function (p, i) {
        agregar(texto(ox, y, "P" + subRaz(i + 1) + ":", tam, fuente, fila.color, "left"));
        agregar(texto(ox + wE, y, txtRaz(p), tam, fuente, TINTA, "left"));
        wMax = Math.max(wMax, medir(txtRaz(p), tam, fuente));
        y += lh * 1.2;
      });
      wMax = Math.max(wMax, medir(txtRaz(R.conclusion), tam, fuente));
      agregar(trazo([[ox, y + 2], [ox + wE + wMax + tam * 0.5, y + 2]], { strokeColor: TINTA, strokeWidth: 1.5 }));
      y += tam * 0.3;
      agregar(texto(ox, y, "∴", tam, fuente, fila.color, "left"));
      agregar(texto(ox + wE, y, txtRaz(R.conclusion), tam, fuente, TINTA, "left"));
      y += lh * 2;
      METODOS_RAZ.forEach(function (m) {
        if (!op[m.clave]) return;
        if (op.titulos) {
          var ts = tamTitulo(tam);
          agregar(texto(ox, y, m.titulo, ts, fuente, fila.color, "left"));
          y += ts * fuente.lh + lh * 0.4;
        }
        y = m.hacer(R, ox + (op.titulos ? tam : 0), y, c, op) + lh * 1.3;
      });
      y += lh;
    });
  }

  // ============================================ ESTRUCTURAS ALGEBRAICAS
  // La estructura es un par ordenado (A, *) o una terna ordenada (A, *, ∘):
  // cada fila define una de sus operaciones con su formula: "x * y = x + y - 3"
  // (el simbolo de la operacion es lo que esta entre las dos variables). Para
  // cada propiedad se escribe «Estudio de ...», la definicion general (sobre A,
  // con * o +) y la aplicada (con el conjunto y el simbolo de la estructura).
  // Solo en la ley de composicion interna siguen los reemplazos con la
  // definicion, sin resolver nada: en cada paso se reemplazan todas las
  // operaciones cuyos dos operandos ya no tienen la operacion (las de mas
  // adentro), hasta que no queda ninguna. Los renglones de un desarrollo con
  // «=» se alinean en el «=». Despues de la aplicada va el desarrollo: la
  // expresion sin cuantificadores con esos mismos reemplazos.
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

  // El neutro y el inverso tienen su definicion general (de los dos lados) y
  // despues una subseccion por derecha y otra por izquierda
  var PRE_NEUTRO = function (S) { return "∃e ∈ " + S + " / ∀x ∈ " + S + ": "; };
  var PRE_INVERSO = function (S) { return "∀x ∈ " + S + ", ∃x' ∈ " + S + " / "; };
  var PROPIEDADES_EST = [
    { clave: "lci", titulo: function () { return "Estudio de la ley de composición interna"; }, reemplazar: true,
      lados: function (o) { return [o(0, "x", "y")]; },
      pre: function (S) { return "∀x, y: x ∈ " + S + " ∧ y ∈ " + S + " → "; }, suf: function (S) { return " ∈ " + S; } },
    { clave: "asociativa", titulo: function () { return "Estudio de la asociatividad"; },
      lados: function (o) { return [o(0, "x", o(0, "y", "z")), o(0, o(0, "x", "y"), "z")]; },
      pre: function (S) { return "∀x, y, z ∈ " + S + ": "; } },
    { clave: "conmutativa", titulo: function () { return "Estudio de la conmutatividad"; },
      lados: function (o) { return [o(0, "x", "y"), o(0, "y", "x")]; },
      pre: function (S) { return "∀x, y ∈ " + S + ": "; } },
    { clave: "neutro", titulo: function () { return "Estudio del elemento neutro"; },
      lados: function (o) { return [o(0, "x", "e"), o(0, "e", "x"), { v: "x" }]; }, pre: PRE_NEUTRO,
      sub: [
        { titulo: function () { return "Elemento neutro por derecha"; },
          lados: function (o) { return [o(0, "x", "e"), { v: "x" }]; }, pre: PRE_NEUTRO },
        { titulo: function () { return "Elemento neutro por izquierda"; },
          lados: function (o) { return [o(0, "e", "x"), { v: "x" }]; }, pre: PRE_NEUTRO },
      ] },
    { clave: "inverso", titulo: function () { return "Estudio del elemento inverso"; },
      lados: function (o) { return [o(0, "x", "x'"), o(0, "x'", "x"), { v: "e" }]; }, pre: PRE_INVERSO,
      sub: [
        { titulo: function () { return "Elemento inverso por derecha"; },
          lados: function (o) { return [o(0, "x", "x'"), { v: "e" }]; }, pre: PRE_INVERSO },
        { titulo: function () { return "Elemento inverso por izquierda"; },
          lados: function (o) { return [o(0, "x'", "x"), { v: "e" }]; }, pre: PRE_INVERSO },
      ] },
  ];
  var DISTRIBUTIVA = {
    clave: "distributiva",
    titulo: function (defs) { return "Estudio de la distributividad de " + defs[0].op + " respecto de " + defs[1].op; },
    lados: function (o) { return [o(0, "x", o(1, "y", "z")), o(1, o(0, "x", "y"), o(0, "x", "z"))]; },
    pre: function (S) { return "∀x, y, z ∈ " + S + ": "; },
  };
  // simbolos de la definicion general (sin contexto): * para la primera
  // operacion y + para la segunda, sobre un conjunto A
  var GENERICOS_EST = [{ op: "*" }, { op: "+" }];

  // definicion general (conjunto A y operaciones genericas), definicion
  // aplicada (conjunto y simbolos de la estructura) y, si la propiedad lo pide
  // (p.reemplazar), la aplicada con los reemplazos de la operacion por su
  // definicion. Ademas, el desarrollo algebraico de la expresion original (sin
  // cuantificadores) con los reemplazos sucesivos: con dos lados, una igualdad
  // por renglon (x * (y * z) = (x * y) * z, ...); con un solo lado (L.C.I.),
  // una cadena: x * y = x + y − 3 (= ... en los renglones siguientes).
  function desarrollarPropiedad(p, defs, S, genericos) {
    var o = function (k, a, b) {
      var h = function (x) { return typeof x === "string" ? { v: x } : x; };
      return { k: k, a: h(a), b: h(b) };
    };
    var lados = p.lados(o), suf = p.suf ? p.suf(S) : "";
    var ecuacion = function (ds) { return lados.map(function (n) { return imprimirEstructura(n, ds, true); }).join(" = "); };
    var res = {
      general: p.pre("A") + ecuacion(genericos) + (p.suf ? p.suf("A") : ""),
      aplicada: [p.pre(S) + ecuacion(defs) + suf],
      desarrollo: [ecuacion(defs)],
    };
    for (var vuelta = 0; vuelta < 20 && lados.some(esOp); vuelta++) {
      lados = lados.map(function (n) { return pasoEstructura(n, defs); });
      if (p.reemplazar) res.aplicada.push(p.pre(S) + ecuacion(defs) + suf);
      if (lados.length > 1) res.desarrollo.push(ecuacion(defs));
      else if (vuelta === 0) res.desarrollo[0] += " = " + ecuacion(defs);
      else res.desarrollo.push("= " + ecuacion(defs));
    }
    return res;
  }

  // par ordenado (A, *): una operacion; terna ordenada (A, *, ∘): dos
  function cantidadOpsEst(op) { return op.tipo === "terna" ? 2 : 1; }

  // Todo se arma en secciones anidadas: la estructura, (en la terna) cada par
  // (A, *), cada propiedad y sus subsecciones. Cada seccion tiene su titulo y
  // su contenido una sangria mas adentro, con una linea vertical que baja del
  // titulo hasta el ultimo renglon y termina con un pie hacia la derecha.
  function generarEstructuras(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var lh = tam * fuente.lh, sangria = Math.round(tam * 1.5), y = oy, finTexto = oy;
    var filas = op.filas.slice(0, cantidadOpsEst(op)).map(function (f) {
      return { f: f, d: leerOperacion(f.texto) };
    }).filter(function (x) { return !x.d.error; });
    if (!filas.length) return;
    // el conjunto es el de la estructura: se escribe en la primera fila
    var S = String(op.filas[0].conjunto || "").trim() || "A";
    var terna = op.tipo === "terna" && filas.length === 2;
    var dx = Math.round(sangria * 0.35), pie = Math.round(sangria * 0.45);
    function linea(x, s, color) {
      agregar(texto(x, y, s, tam, fuente, color, "left"));
      finTexto = y + lh;
      y += lh + 6;
    }
    function guia(puntos, color, ancho) {
      if (op.guias) agregar(trazo(puntos, { strokeColor: color, strokeWidth: ancho }));
    }
    // seccion: titulo en x y contenido en x + sangria; sin titulos, la linea es
    // un corchete (marca tambien el inicio)
    function seccion(x, titulo, color, cuerpo) {
      var conTitulo = op.titulos && titulo, y0 = y;
      if (conTitulo) { linea(x, titulo, color); y0 = finTexto + 2; }
      cuerpo(x + sangria);
      var y1 = finTexto + 2, xg = x + dx;
      guia((conTitulo ? [] : [[xg + pie, y0]]).concat([[xg, y0], [xg, y1], [xg + pie, y1]]), color, 2);
      y += lh * 0.6;
    }
    // «Definición ...:» y sus renglones una sangria mas adentro, con su linea.
    // Si los renglones (un desarrollo) tienen todos un «=», quedan alineados
    // en el primero («= ...» al principio de un renglon tambien cuenta).
    function definicion(x, etiqueta, renglones, color) {
      linea(x, etiqueta, color);
      var y0 = finTexto + 2;
      var antes = renglones.map(function (s) {
        var m = /(^|\s)=\s/.exec(s);
        return m ? medir(s.slice(0, m.index + m[1].length), tam, fuente) : -1;
      });
      var alinear = antes.every(function (w) { return w >= 0; });
      var maxAntes = Math.max.apply(null, antes);
      renglones.forEach(function (s, i) { linea(x + sangria + (alinear ? maxAntes - antes[i] : 0), s, TINTA); });
      guia([[x + dx, y0], [x + dx, finTexto + 2]], color, 1);
    }
    function definiciones(x, p, defs, genericos, color) {
      var r = desarrollarPropiedad(p, defs, S, genericos);
      if (op.general) definicion(x, "Definición general:", [r.general], color);
      definicion(x, "Definición aplicada:", r.aplicada, color);
      if (r.desarrollo.length > 1 || r.desarrollo[0].indexOf(" = ") >= 0) definicion(x, "Desarrollo:", r.desarrollo, color);
    }
    function propiedades(x, fila, i) {
      var defs = [fila.d], gen = [GENERICOS_EST[i]], color = fila.f.color;
      PROPIEDADES_EST.forEach(function (p) {
        if (!op[p.clave]) return;
        seccion(x, p.titulo(), color, function (x2) {
          if (!p.sub) return definiciones(x2, p, defs, gen, color);
          if (op.general) definicion(x2, "Definición general:", [desarrollarPropiedad(p, defs, S, gen).general], color);
          p.sub.forEach(function (s) {
            seccion(x2, s.titulo(), color, function (x3) { definiciones(x3, s, defs, gen, color); });
          });
        });
      });
    }
    // un par (A, *): la operacion escrita y todas sus propiedades
    function estudioPar(x, fila, i) {
      seccion(x, "Estudio de (" + S + ", " + fila.d.op + ")", fila.f.color, function (x2) {
        if (op.escribirOperacion) {
          linea(x2, fila.d.a + " " + fila.d.op + " " + fila.d.b + " = " + fila.d.der +
            ",  con " + fila.d.a + ", " + fila.d.b + " ∈ " + S, fila.f.color);
          y += lh * 0.6;
        }
        propiedades(x2, fila, i);
      });
    }
    if (!terna) return estudioPar(ox, filas[0], 0);
    seccion(ox, "Estudio de (" + S + ", " + filas[0].d.op + ", " + filas[1].d.op + ")", TINTA, function (x) {
      filas.forEach(function (fila, i) { estudioPar(x, fila, i); });
      if (op.distributiva) {
        var defs = [filas[0].d, filas[1].d];
        seccion(x, DISTRIBUTIVA.titulo(defs), filas[0].f.color, function (x2) {
          definiciones(x2, DISTRIBUTIVA, defs, GENERICOS_EST, filas[0].f.color);
        });
      }
    });
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
  function unirProducto(lista) { return lista.join(" · "); }
  function paren(s, muchos) { return muchos && / /.test(s) ? "(" + s + ")" : s; }

  // pasos de N! / (d1! · d2! · ...) despues del reemplazo
  function resolverFactoriales(N, ds, modo, tachar) {
    var lineas = [], valor = factorialBig(N);
    ds.forEach(function (d) { valor /= factorialBig(d); });
    var denFact = function (lst) { return unirProducto(lst.map(function (d) { return d + "!"; })); };
    if (!ds.length) {
      if (N >= 2) lineas.push(plano(producto(N, 1)));
      lineas.push(plano(miles(valor)));
      return lineas;
    }
    var expDen = function (lst) {
      return unirProducto(lst.map(function (d) { return paren(factorialDesarrollado(d), lst.length > 1); }));
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
        if (resto.length) lineas.push(fraccion(numFact.length ? unirProducto(numFact) : "1", denFact(resto)));
        else lineas.push(plano(numFact.length ? unirProducto(numFact) : "1"));
      } else {
        numFact = null; // nada para cancelar: se desarrolla N!
      }
      if (resto.length) {
        var numTxt = numFact === null ? factorialDesarrollado(N) : numFact.length ? unirProducto(numFact) : "1";
        lineas.push(fraccion(numTxt, expDen(resto)));
      }
    }
    var numVal = numFact === null ? factorialBig(N) : numFact.reduce(function (a, x) { return a * BigInt(x); }, 1n);
    if (resto.length) {
      var dv = resto.map(function (x) { return factorialBig(x); });
      if (dv.length > 1 && dv.some(function (v) { return v > 1n; })) {
        lineas.push(fraccion(miles(numVal), unirProducto(dv.map(miles))));
      }
      if (valDen(resto) !== 1n) lineas.push(fraccion(miles(numVal), miles(valDen(resto))));
    }
    lineas.push(plano(miles(valor)));
    return lineas;
  }

  // formula general, reemplazo y pasos de un calculo
  function desarrollarComb(c, op) {
    var res = { nombre: NOMBRES_COMB[c.tipo], simboloGral: simboloComb(c, op, true), simbolo: simboloComb(c, op) };
    var den = function (l) { return unirProducto(l); };
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
      if (c.k >= 2 && c.k <= 12) res.pasos.push(plano(unirProducto(Array(c.k).fill(c.n))));
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

  // ============================================ EXPRESIONES COMBINATORIAS
  // Cada fila es una expresion con numeros combinatorios, una igualdad a
  // verificar (V^4_3 + 3V^4_2 = V^5_3, C(5, 2) + C(5, 3), 8!/6!...) o una
  // ecuacion con una incognita (V^x_2 = 30, C^x_{x-2} = 10, P_{x+1} = 6P_{x-1}).
  // Se resuelve paso a paso, un renglon por paso y con lo que se hace anotado
  // en el renglon anterior: la definicion de cada numero combinatorio, las
  // cuentas dentro de los factoriales, la propiedad n! = n · (n − 1)! para
  // simplificar (tachando), 0! = 1 y 1! = 1, el desarrollo de los factoriales
  // que quedan y las cuentas de a una. En una igualdad se resuelve cada
  // miembro por separado y se comparan los resultados. En una ecuacion se
  // escribe la condicion (la incognita natural y lo que piden los numeros
  // combinatorios), se simplifican los dos miembros a la vez, se divide por
  // lo que no puede ser 0, se lleva a un polinomio y se resuelve (lineal,
  // resolvente, factor comun o probando valores); al final se descartan las
  // soluciones que no cumplen la condicion y se verifica.
  // Arbol: { k: "num", v } | { k: "rac", n, d } (fraccion irreducible) |
  // { k: "var", nom } | { k: "fact", a } | { k: "fn", tipo, n, kk, reps } |
  // { k: "neg", a } | { k: "+" | "-" | "·" | "/" | "^", a, b }. Los numeros
  // son BigInt. En un "fn", n y kk son un numero o { lin: b, nom } (x + b).
  // Cada nodo puede llevar `color` (lo que cambio en el paso) y `tachar`.
  var COLOR_FACT = "#9c36b5";
  var MAX_PASOS_CE = 150;
  var NOMBRES_CE = { P: "permutaciones", V: "variaciones", C: "combinaciones",
    VR: "variaciones con repetición", CR: "combinaciones con repetición", PR: "permutaciones con repetición" };

  function errCE(m) { throw { msjCE: m }; }
  function gcdB(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { var t = a % b; a = b; b = t; } return a || 1n; }
  function racB(n, d) {
    if (d === 0n) errCE("Hay una división por cero");
    if (d < 0n) { n = -n; d = -d; }
    var g = gcdB(n, d);
    return { n: n / g, d: d / g };
  }
  function numCE(v, color) { var n = { k: "num", v: BigInt(v) }; if (color) n.color = color; return n; }
  function opCE(k, a, b) { return { k: k, a: a, b: b }; }
  function factCE(a) { return { k: "fact", a: a }; }
  function valorNodoCE(r, color) {
    r = racB(r.n, r.d);
    var n = r.d === 1n ? { k: "num", v: r.n } : { k: "rac", n: r.n, d: r.d };
    if (color) n.color = color;
    return n;
  }
  function esValorCE(n) { return n.k === "num" || n.k === "rac"; }
  function valorDeCE(n) { return n.k === "num" ? { n: n.v, d: 1n } : { n: n.n, d: n.d }; }
  // producto de varios nodos (sin los factores 1)
  function productoCE(lista) {
    lista = lista.filter(function (x) { return !(x.k === "num" && x.v === 1n); });
    if (!lista.length) return numCE(1);
    return lista.reduce(function (a, b) { return opCE("·", a, b); });
  }
  function copiaCE(n, limpiar) {
    var c = {};
    for (var q in n) if (q !== "a" && q !== "b") c[q] = n[q];
    if (limpiar) { delete c.color; delete c.tachar; }
    if (n.a) c.a = copiaCE(n.a, limpiar);
    if (n.b) c.b = copiaCE(n.b, limpiar);
    return c;
  }
  function pintarCE(n, color) { n.color = color; if (n.a) pintarCE(n.a, color); if (n.b) pintarCE(n.b, color); return n; }
  // recorre el arbol de abajo hacia arriba: f devuelve el nodo nuevo o nada
  function mapCE(n, f) {
    var c = {};
    for (var q in n) c[q] = n[q];
    if (n.a) c.a = mapCE(n.a, f);
    if (n.b) c.b = mapCE(n.b, f);
    return f(c) || c;
  }
  function recorrerCE(n, f) { f(n); if (n.a) recorrerCE(n.a, f); if (n.b) recorrerCE(n.b, f); }
  function hayCE(n, f) { var si = false; recorrerCE(n, function (x) { if (f(x)) si = true; }); return si; }
  function esLinCE(v) { return v !== null && typeof v === "object"; }
  function tieneVarCE(n) { return hayCE(n, function (x) { return x.k === "var" || (x.k === "fn" && (esLinCE(x.n) || esLinCE(x.kk))); }); }
  // x + b como árbol
  function linArbolCE(b, nom) {
    var x = { k: "var", nom: nom };
    return b === 0 ? x : opCE(b > 0 ? "+" : "-", x, numCE(Math.abs(b)));
  }
  function argArbolCE(v) { return esLinCE(v) ? linArbolCE(v.lin, v.nom) : numCE(v); }
  function argTextoCE(v, junto) {
    if (!esLinCE(v)) return String(v);
    var e = junto ? "" : " ";
    return v.lin === 0 ? v.nom : v.nom + e + (v.lin > 0 ? "+" : "−") + e + Math.abs(v.lin);
  }
  // b si el árbol es exactamente x, x + b o x − b (si no, null)
  function linCanonCE(n) {
    if (n.k === "var") return 0;
    if ((n.k === "+" || n.k === "-") && n.a.k === "var" && n.b.k === "num" && n.b.v > 0n) return Number(n.k === "+" ? n.b.v : -n.b.v);
    return null;
  }
  // forma a·x + b de una expresión lineal ({ a, b } racionales) o null
  function linealCE(n) {
    var A, B;
    function cte(r) { return { a: { n: 0n, d: 1n }, b: r }; }
    if (!tieneVarCE(n)) return cte(evalCE(n));
    switch (n.k) {
      case "var": return { a: { n: 1n, d: 1n }, b: { n: 0n, d: 1n } };
      case "neg": A = linealCE(n.a); return A && { a: racB(-A.a.n, A.a.d), b: racB(-A.b.n, A.b.d) };
      case "+": case "-":
        A = linealCE(n.a); B = linealCE(n.b);
        if (!A || !B) return null;
        var s = n.k === "+" ? 1n : -1n;
        return { a: racB(A.a.n * B.a.d + s * B.a.n * A.a.d, A.a.d * B.a.d), b: racB(A.b.n * B.b.d + s * B.b.n * A.b.d, A.b.d * B.b.d) };
      case "·":
        A = linealCE(n.a); B = linealCE(n.b);
        if (!A || !B) return null;
        if (B.a.n !== 0n) { var t = A; A = B; B = t; }
        if (B.a.n !== 0n) return null;
        return { a: racB(A.a.n * B.b.n, A.a.d * B.b.d), b: racB(A.b.n * B.b.n, A.b.d * B.b.d) };
      case "/":
        A = linealCE(n.a); B = linealCE(n.b);
        if (!A || !B || B.a.n !== 0n || B.b.n === 0n) return null;
        return { a: racB(A.a.n * B.b.d, A.a.d * B.b.n), b: racB(A.b.n * B.b.d, A.b.d * B.b.n) };
    }
    return null;
  }

  // ---------------------------------------------------------------- valor
  function valorFnCE(f) {
    var F = factorialBig;
    if (esLinCE(f.n) || esLinCE(f.kk)) errCE("Hay una incógnita");
    if (f.tipo === "P") return F(f.n);
    if (f.tipo === "V") return F(f.n) / F(f.n - f.kk);
    if (f.tipo === "C") return F(f.n) / (F(f.kk) * F(f.n - f.kk));
    if (f.tipo === "VR") return BigInt(f.n) ** BigInt(f.kk);
    if (f.tipo === "CR") return F(f.n + f.kk - 1) / (F(f.kk) * F(f.n - 1));
    return f.reps.reduce(function (a, r) { return a / F(r); }, F(f.n));
  }
  function evalCE(n) {
    var a, b;
    switch (n.k) {
      case "num": return { n: n.v, d: 1n };
      case "rac": return { n: n.n, d: n.d };
      case "var": errCE("Hay una incógnita"); break;
      case "fn": return { n: valorFnCE(n), d: 1n };
      case "fact":
        a = evalCE(n.a);
        if (a.d !== 1n || a.n < 0n) errCE("El factorial es solo de números naturales (o del 0)");
        if (a.n > BigInt(MAX_COMB)) errCE("Hasta " + MAX_COMB + "! como máximo");
        return { n: factorialBig(Number(a.n)), d: 1n };
      case "neg": a = evalCE(n.a); return { n: -a.n, d: a.d };
      case "^":
        a = evalCE(n.a); b = evalCE(n.b);
        if (b.d !== 1n || b.n < 0n || b.n > 60n) errCE("El exponente tiene que ser un natural (hasta 60)");
        return racB(a.n ** b.n, a.d ** b.n);
    }
    a = evalCE(n.a); b = evalCE(n.b);
    if (n.k === "+") return racB(a.n * b.d + b.n * a.d, a.d * b.d);
    if (n.k === "-") return racB(a.n * b.d - b.n * a.d, a.d * b.d);
    if (n.k === "·") return racB(a.n * b.n, a.d * b.d);
    if (b.n === 0n) errCE("Hay una división por cero");
    return racB(a.n * b.d, a.d * b.n);
  }
  // reemplaza la incógnita por un número (también en los números combinatorios)
  function sustCE(t, v) {
    return mapCE(t, function (x) {
      if (x.k === "var") return numCE(v);
      if (x.k === "fn") {
        var f = copiaCE(x);
        if (esLinCE(f.n)) f.n = f.n.lin + v;
        if (esLinCE(f.kk)) f.kk = f.kk.lin + v;
        return f;
      }
      return null;
    });
  }

  // ---------------------------------------------------------------- lectura
  // V^4_3 (n = 4 arriba, k = 3 abajo), V_3^4, V⁴₃, V(4, 3), V4,3; C igual y
  // también (5 2) (número combinatorio); P_5, P5, P(5); VR, CR (o V', C');
  // PR(6; 3, 2), PR^3,2_6 o PR(3, 2) (n = la suma). Factorial con !,
  // producto con · o * (o pegado: 3V^4_2), fracción con /, potencia con ^.
  // Una letra minúscula es la incógnita: V^x_2, V^{x+1}_3, C(x, x − 2), x!.
  function leerCE(txt) {
    var SUP_D = "⁰¹²³⁴⁵⁶⁷⁸⁹", s = String(txt || "")
      .replace(/[’´`′]/g, "'").replace(/[−–—]/g, "-").replace(/[×*∙•]/g, "·").replace(/÷/g, "/")
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+(?:,[⁰¹²³⁴⁵⁶⁷⁸⁹]+)*/g, function (m) {
        return "^{" + m.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, function (c) { return SUP_D.indexOf(c); }) + "}";
      })
      .replace(/[₀-₉]+(?:,[₀-₉]+)*/g, function (m) {
        return "_{" + m.replace(/[₀-₉]/g, function (c) { return c.charCodeAt(0) - 0x2080; }) + "}";
      });
    if (!s.trim()) return { error: "Escribí una expresión, por ejemplo: V^4_3 + 3V^4_2 = V^5_3" };
    var partes = s.split("=");
    if (partes.length > 2) return { error: "Escribí una sola igualdad (un solo «=»)" };
    var ctx = { nom: null };
    try {
      var miembros = partes.map(function (p, j) {
        if (!p.trim()) errCE(j ? "Falta el segundo miembro de la igualdad" : "Falta el primer miembro de la igualdad");
        return leerMiembroCE(p, ctx);
      });
      if (!ctx.nom) {
        miembros.forEach(evalCE); // valida factoriales, divisiones por cero y exponentes
        return { miembros: miembros };
      }
      if (miembros.length < 2) errCE("Con una incógnita escribí una ecuación (con «=»), por ejemplo: V^" + ctx.nom + "_2 = 30");
      var dom = dominioCE(miembros, ctx.nom);
      if (dom.vacio) errCE("Ningún natural cumple las condiciones de los números combinatorios");
      return { miembros: miembros, incognita: ctx.nom, dominio: dom };
    } catch (e) {
      if (e && e.msjCE) return { error: e.msjCE };
      throw e;
    }
  }
  function leerMiembroCE(p, ctx) {
    var i = 0;
    function sp() { while (i < p.length && /\s/.test(p[i])) i++; }
    function ve(c) { sp(); return p[i] === c; }
    function come(c) { if (ve(c)) { i++; return true; } return false; }
    function resto() { sp(); return p.slice(i); }
    function entero() { var m = /^\d+/.exec(resto()); if (!m) return null; i += m[0].length; return parseInt(m[0], 10); }
    function cerca() { var r = resto(); return r ? "«" + r.slice(0, 8) + "»" : "el final"; }
    function incognita() {
      var m = /^[a-z](?![a-z])/.exec(resto());
      if (!m) return null;
      i += 1;
      if (ctx.nom && ctx.nom !== m[0]) errCE("Una sola incógnita: hay " + ctx.nom + " y " + m[0]);
      ctx.nom = m[0];
      return { k: "var", nom: m[0] };
    }
    function expr() {
      var a = term();
      for (;;) {
        if (come("+")) a = opCE("+", a, term());
        else if (come("-")) a = opCE("-", a, term());
        else return a;
      }
    }
    function empiezaFactor() { sp(); return /^[VCP(\[]|^[a-z](?![a-z])/.test(p.slice(i)); }
    function term() {
      var a = unario();
      for (;;) {
        if (come("·")) a = opCE("·", a, unario());
        else if (come("/")) a = opCE("/", a, unario());
        else if (empiezaFactor()) { a = opCE("·", a, unario()); a.impl = true; }
        else if (/^\d/.test(resto())) errCE("Falta una operación antes de " + cerca());
        else return a;
      }
    }
    function unario() { return come("-") ? { k: "neg", a: unario() } : potencia(); }
    function potencia() {
      var a = postfijo();
      if (come("^")) {
        var e;
        if (come("{")) { e = expr(); if (!come("}")) errCE("Falta cerrar la llave del exponente"); }
        else e = postfijo();
        a = opCE("^", a, e);
      }
      return a;
    }
    function postfijo() {
      var a = primario();
      while (come("!")) {
        if (tieneVarCE(a)) {
          var L = linealCE(a);
          if (!L || L.a.n !== 1n || L.a.d !== 1n || L.b.d !== 1n) errCE("En un factorial la incógnita va sola o con un número sumado: x!, (x + 1)!");
        }
        a = factCE(a);
      }
      return a;
    }
    function primario() {
      sp();
      var m = /^[(\[]\s*(\d+)\s+(\d+)\s*[)\]]/.exec(p.slice(i));
      if (m) { // número combinatorio (5 2)
        i += m[0].length;
        var b = { k: "fn", tipo: "C", n: +m[1], kk: +m[2], binom: true };
        validarFnCE(b);
        return b;
      }
      if (come("(") || come("[")) {
        var cierra = p[i - 1] === "(" ? ")" : "]", a = expr();
        if (!come(cierra)) errCE("Falta cerrar un paréntesis");
        return a;
      }
      var n = entero();
      if (n !== null) return numCE(n);
      if (/^[VCP]/.test(resto())) return funcion();
      var x = incognita();
      if (x) return x;
      errCE(resto() ? "No entiendo " + cerca() : "Falta un término al final");
    }
    // un argumento de un número combinatorio: un natural o x + b
    function argumento(t) {
      if (!tieneVarCE(t)) {
        var v = evalCE(t);
        if (v.d !== 1n || v.n < 0n) errCE("Los números de un número combinatorio son naturales");
        return Number(v.n);
      }
      var L = linealCE(t);
      if (!L || L.a.n !== 1n || L.a.d !== 1n || L.b.d !== 1n) {
        errCE("En un número combinatorio la incógnita va sola o con un número sumado: " + ctx.nom + ", " + ctx.nom + " + 1, " + ctx.nom + " − 2");
      }
      return { lin: Number(L.b.n), nom: ctx.nom };
    }
    // lista separada por coma (o «;» despues del primero)
    function lista(hasta) {
      var l = [], pc = false;
      for (;;) {
        sp();
        if (!resto() || /^[,;)}]/.test(resto())) errCE("Faltan números en " + cerca());
        l.push(argumento(expr()));
        if (come(";")) { pc = true; continue; }
        if (come(",")) continue;
        if (hasta && !come(hasta)) errCE("Falta cerrar " + (hasta === ")" ? "el paréntesis" : "la llave"));
        return { l: l, pc: pc };
      }
    }
    function grupo() {
      if (come("{")) return lista("}").l;
      if (come("(")) return lista(")").l;
      var x = entero();
      if (x !== null) return [x];
      var v = incognita();
      if (v) return [{ lin: 0, nom: v.nom }];
      errCE("Falta el número después de ^ o _");
    }
    function funcion() {
      var m = /^(VR|CR|PR|V'|C'|P'|V|C|P)/.exec(resto());
      i += m[0].length;
      var t = m[1];
      if (t.length === 2 && t[1] === "'") t = t[0] + "R";
      var f = { k: "fn", tipo: t }, sup = null, sub = null, args = null;
      if (come("(")) args = lista(")");
      else {
        for (var j = 0; j < 2; j++) {
          if (!sup && come("^")) sup = grupo();
          else if (!sub && come("_")) sub = grupo();
        }
        if (!sup && !sub) {
          var mm = /^(\d+)(?:\s*,\s*(\d+))?/.exec(resto());
          if (!mm) errCE("Faltan los números de " + t + ": " + ejemploFnCE(t));
          i += mm[0].length;
          args = { l: [+mm[1]].concat(mm[2] ? [+mm[2]] : []), pc: false };
        }
      }
      if (args) {
        var l = args.l;
        if (t === "P") { if (l.length !== 1) errCE("P lleva un solo número: P(5)"); f.n = l[0]; }
        else if (t === "PR") {
          if (args.pc) { f.n = l[0]; f.reps = l.slice(1); }
          else { f.reps = l; f.n = l.reduce(function (a, b) { return a + b; }, 0); }
          if (!f.reps.length) errCE("Faltan las repeticiones: PR(6; 3, 2)");
        } else {
          if (l.length !== 2) errCE(t + " lleva dos números: " + ejemploFnCE(t));
          f.n = l[0]; f.kk = l[1];
        }
      } else if (t === "P") {
        var u = sub || sup;
        if (u.length !== 1) errCE("P lleva un solo número: P_5");
        f.n = u[0];
      } else if (t === "PR") {
        if (!sup || !sub) errCE("En PR van las repeticiones arriba y n abajo: PR^3,2_6 o PR(6; 3, 2)");
        f.n = sub[0]; f.reps = sup;
      } else {
        if (!sup || !sub) errCE("Falta " + (sup ? "k abajo (_)" : "n arriba (^)") + ": " + ejemploFnCE(t));
        f.n = sup[0]; f.kk = sub[0];
      }
      if (f.reps && f.reps.some(esLinCE)) errCE("Las repeticiones de PR son números (sin incógnita)");
      validarFnCE(f);
      return f;
    }
    sp();
    var r = expr();
    if (resto()) errCE("No entiendo " + cerca());
    return r;
  }
  function ejemploFnCE(t) {
    return { V: "V^4_3 o V(4, 3)", C: "C^5_2 o C(5, 2)", VR: "VR^3_2 o VR(3, 2)", CR: "CR^4_2 o CR(4, 2)",
      P: "P_5 o P(5)", PR: "PR(6; 3, 2)" }[t];
  }
  function validarFnCE(f) {
    if (esLinCE(f.n) || esLinCE(f.kk)) return; // con incógnita: van a la condición
    var nom = f.tipo;
    if ((nom === "V" || nom === "C") && f.kk > f.n) errCE("En " + nom + ", k no puede ser mayor que n (" + f.kk + " > " + f.n + ")");
    if (nom === "CR" && f.n < 1) errCE("En CR, n tiene que ser al menos 1");
    if (nom === "VR" && f.kk > 60) errCE("El exponente de VR es demasiado grande");
    var tope = nom === "CR" ? f.n + f.kk - 1 : nom === "VR" ? 0 : f.n;
    if (tope > MAX_COMB) errCE("Hasta " + MAX_COMB + "! como máximo");
    if (nom === "PR") {
      var suma = f.reps.reduce(function (a, b) { return a + b; }, 0);
      if (suma > f.n) errCE("Las repeticiones suman " + suma + ", más que n = " + f.n);
    }
  }
  // Condición de la incógnita: natural y lo que piden los números
  // combinatorios y los factoriales (k ≤ n, n ≥ 1 en CR...). Todas son de la
  // forma x ≥ c o x ≤ c. `tope`: hasta dónde se puede calcular (30!).
  function dominioCE(miembros, nom) {
    var D = { lo: 0, hi: Infinity, tope: Infinity, vacio: false, nom: nom };
    function lin(v) { return esLinCE(v) ? { a: 1, b: v.lin } : { a: 0, b: v }; }
    function dif(p, q) { return { a: p.a - q.a, b: p.b - q.b }; }
    function cond(c) { // a·x + b ≥ 0
      if (c.a > 0) D.lo = Math.max(D.lo, -c.b);
      else if (c.a < 0) D.hi = Math.min(D.hi, c.b);
      else if (c.b < 0) D.vacio = true;
    }
    function cabe(c) { if (c.a > 0) D.tope = Math.min(D.tope, MAX_COMB - c.b); } // c ≤ 30
    miembros.forEach(function (t) {
      recorrerCE(t, function (x) {
        if (x.k === "fn") {
          var n = lin(x.n), k = x.kk === undefined ? null : lin(x.kk);
          if (x.tipo === "P") { cond(n); cabe(n); }
          else if (x.tipo === "V" || x.tipo === "C") { cond(k); cond(dif(n, k)); cabe(n); }
          else if (x.tipo === "VR") { cond(n); cond(k); }
          else if (x.tipo === "CR") { cond(dif(n, { a: 0, b: 1 })); cond(k); cabe({ a: n.a + k.a, b: n.b + k.b - 1 }); }
          else { var s = x.reps.reduce(function (a, b) { return a + b; }, 0); cond(dif(n, { a: 0, b: s })); cabe(n); }
        } else if (x.k === "fact" && tieneVarCE(x.a)) {
          var L = linealCE(x.a), c = { a: 1, b: Number(L.b.n) };
          cond(c); cabe(c);
        }
      });
    });
    if (D.lo > D.hi) D.vacio = true;
    D.texto = nom + " natural" + (D.hi < Infinity ? ", " + (D.lo > 0 ? D.lo + " ≤ " : "") + nom + " ≤ " + D.hi
      : D.lo > 0 ? ", " + nom + " ≥ " + D.lo : "");
    D.corto = D.hi < Infinity ? (D.lo > 0 ? D.lo + " ≤ " : "") + nom + " ≤ " + D.hi : D.lo > 0 ? nom + " ≥ " + D.lo : nom + " natural";
    return D;
  }

  // ---------------------------------------------------------------- pasos
  // fórmula de cada uno, con los números reemplazados
  function definicionCE(f) { return copiaCE(definicionCompartidaCE(f)); }
  function definicionCompartidaCE(f) {
    var A = argArbolCE, F = function (x) { return factCE(x); };
    if (f.tipo === "P") return F(A(f.n));
    if (f.tipo === "V") return opCE("/", F(A(f.n)), F(opCE("-", A(f.n), A(f.kk))));
    if (f.tipo === "C") return opCE("/", F(A(f.n)), opCE("·", F(A(f.kk)), F(opCE("-", A(f.n), A(f.kk)))));
    if (f.tipo === "VR") return opCE("^", A(f.n), A(f.kk));
    if (f.tipo === "CR") {
      return opCE("/", F(opCE("-", opCE("+", A(f.n), A(f.kk)), numCE(1))), opCE("·", F(A(f.kk)), F(opCE("-", A(f.n), numCE(1)))));
    }
    return opCE("/", F(A(f.n)), f.reps.map(function (r) { return F(numCE(r)); }).reduce(function (a, b) { return opCE("·", a, b); }));
  }
  // la fórmula general como texto, para la nota
  function formulaCE(tipo, op) {
    var R = op.repeticion === "prima" ? "'" : "R", nom = tipo[0] + (tipo.length > 1 ? R : "");
    var sim;
    if (tipo === "C" && op.binomial) sim = "(n sobre k)";
    else if (op.notacion === "sub" || op.notacion === "paren") sim = simboloComb({ tipo: tipo }, op, true);
    else sim = tipo === "P" ? "Pₙ" : tipo === "PR" ? nom + "ₙ(a, b, …)" : nom + "ⁿₖ";
    return sim + " = " + { P: "n!", V: "n! / (n − k)!", C: "n! / (k! · (n − k)!)", VR: "nᵏ",
      CR: "(n + k − 1)! / (k! · (n − 1)!)", PR: "n! / (a! · b! · …)" }[tipo];
  }

  // Una cuenta (de las de más adentro) en cada parte independiente de la
  // expresión. K junta qué se hizo. Devuelve el nodo nuevo o null.
  var NOTAS_CE = {
    "+": ["Sumar", COLOR_SUMA], "-": ["Restar", COLOR_SUMA], neg: ["Cambiar el signo", COLOR_SUMA],
    "·": ["Multiplicar", COLOR_PRODUCTO], "÷": ["Dividir", COLOR_PRODUCTO], "^": ["Calcular la potencia", COLOR_PRODUCTO],
    simp: ["Simplificar la fracción", COLOR_PRODUCTO], igualDen: ["Sumar las fracciones (igual denominador)", COLOR_SUMA],
    comun: ["Denominador común", COLOR_SUMA], fmul: ["Multiplicar las fracciones", COLOR_PRODUCTO],
    fdiv: ["Dividir las fracciones", COLOR_PRODUCTO], lin: ["Resolver las cuentas", COLOR_SUMA],
  };
  function reducirCE(n, K) {
    var a, b, va, vb;
    function hecho(tipo, nodo) { K[tipo] = true; return pintarCE(nodo, NOTAS_CE[tipo][1]); }
    switch (n.k) {
      case "num": case "rac": case "fact": case "fn": case "var": return null;
      case "neg":
        a = reducirCE(n.a, K);
        if (a) return { k: "neg", a: a };
        if (!esValorCE(n.a)) return null;
        va = valorDeCE(n.a);
        return hecho("neg", valorNodoCE({ n: -va.n, d: va.d }));
    }
    a = reducirCE(n.a, K); b = reducirCE(n.b, K);
    if (a || b) { var c = opCE(n.k, a || n.a, b || n.b); if (n.impl) c.impl = true; return c; }
    if (!esValorCE(n.a) || !esValorCE(n.b)) return null;
    va = valorDeCE(n.a); vb = valorDeCE(n.b);
    if (n.k === "^") return hecho("^", valorNodoCE(racB(va.n ** vb.n, va.d ** vb.n)));
    var enteros = va.d === 1n && vb.d === 1n;
    if (n.k === "+" || n.k === "-") {
      var s = n.k === "+" ? 1n : -1n;
      if (enteros) return hecho(n.k, numCE(va.n + s * vb.n));
      if (va.d === vb.d) return hecho("igualDen", opCE("/", opCE(n.k, numCE(va.n), numCE(vb.n)), numCE(va.d)));
      var L = va.d / gcdB(va.d, vb.d) * vb.d;
      var parte = function (v) { return L === v.d ? numCE(v.n) : opCE("·", numCE(v.n), numCE(L / v.d)); };
      return hecho("comun", opCE("/", opCE(n.k, parte(va), parte(vb)), numCE(L)));
    }
    if (n.k === "·") {
      if (enteros) return hecho("·", numCE(va.n * vb.n));
      return hecho("fmul", opCE("/", productoCE([numCE(va.n), numCE(vb.n)]), productoCE([numCE(va.d), numCE(vb.d)])));
    }
    // división
    if (!enteros) {
      return hecho("fdiv", opCE("/", productoCE([numCE(va.n), numCE(vb.d)]), productoCE([numCE(va.d), numCE(vb.n)])));
    }
    if (va.n % vb.n === 0n) return hecho("÷", numCE(va.n / vb.n));
    var g = gcdB(va.n, vb.n);
    if (g > 1n) return hecho("simp", valorNodoCE(racB(va.n, vb.n)));
    K.callado = true; // ya es una fracción irreducible: no cambia lo escrito
    return valorNodoCE(racB(va.n, vb.n));
  }

  // factores de un producto (los nodos, por referencia)
  function factoresCE(n) { return n.k === "·" ? factoresCE(n.a).concat(factoresCE(n.b)) : [n]; }
  // de un factorial: { tipo: "n", v } (de un número) o { tipo: "x", v } (de x + v)
  function claveFactCE(x) {
    if (x.k !== "fact" || x.tachar) return null;
    if (x.a.k === "num") return { tipo: "n", v: x.a.v };
    var b = linCanonCE(x.a);
    return b === null ? null : { tipo: "x", v: BigInt(b), nom: x.a.k === "var" ? x.a.nom : x.a.a.nom };
  }
  function mayorFactCE(lista, tipo) {
    var m = null;
    lista.forEach(function (x) {
      var c = claveFactCE(x);
      if (c && c.tipo === tipo && (!m || c.v > m.c.v)) m = { n: x, c: c };
    });
    return m;
  }
  // A y B (de lados distintos, del mismo tipo): el más grande se escribe hasta
  // el más chico y los dos factoriales iguales se tachan. Devuelve si escribió algo.
  function cancelarParCE(A, B) {
    var N = A.c.v, D = B.c.v;
    if (N === D) { A.n.tachar = B.n.tachar = true; return false; }
    var G = N > D ? A : B, m = N > D ? D : N, chico = N > D ? B : A, M = G.c.v, nom = G.c.nom;
    var hecho = function (v) { return G.c.tipo === "n" ? numCE(v, COLOR_FACT) : pintarCE(linArbolCE(Number(v), nom), COLOR_FACT); };
    var lista = [];
    for (var x = M; x > m; x--) lista.push(hecho(x));
    var resto = factCE(G.c.tipo === "n" ? numCE(m) : linArbolCE(Number(m), nom));
    pintarCE(resto, COLOR_FACT); resto.tachar = true;
    lista.push(resto);
    var prod = lista.reduce(function (a, b) { return opCE("·", a, b); });
    var nodo = G.n;
    delete nodo.a; delete nodo.tachar;
    for (var q in prod) nodo[q] = prod[q];
    chico.n.tachar = true;
    return true;
  }
  // Propiedad del factorial en cada fracción: el factorial más grande de un
  // lado se escribe hasta el más grande del otro (n! = n · (n − 1) · ... · m!)
  // y los dos m! se tachan. Si son iguales, solo se tachan. Marca el árbol en
  // su lugar; devuelve { hubo, desarrollo }.
  function cancelarCE(t) {
    var r = { hubo: false, desarrollo: false };
    recorrerCE(t, function (n) {
      if (n.k !== "/") return;
      var fa = factoresCE(n.a), fb = factoresCE(n.b);
      ["x", "n"].some(function (tipo) {
        var A = mayorFactCE(fa, tipo), B = mayorFactCE(fb, tipo);
        if (!A || !B) return false;
        if (tipo === "n" && A.c.v !== B.c.v && (A.c.v < 1n || B.c.v < 1n)) return false; // con 0! va primero 0! = 1
        r.hubo = true;
        if (cancelarParCE(A, B)) r.desarrollo = true;
        return true;
      });
    });
    return r;
  }
  // saca lo tachado (los productos y las fracciones se acomodan)
  function quitarTachadosCE(n) {
    if (n.tachar) return null;
    if (n.k === "·") {
      var a = quitarTachadosCE(n.a), b = quitarTachadosCE(n.b);
      if (!a) return b;
      if (!b) return a;
      var c = opCE("·", a, b); if (n.impl) c.impl = true; return c;
    }
    if (n.k === "/") {
      var nu = quitarTachadosCE(n.a) || numCE(1), de = quitarTachadosCE(n.b);
      return de ? opCE("/", nu, de) : nu;
    }
    var c2 = copiaCE(n);
    if (n.a) c2.a = quitarTachadosCE(n.a) || numCE(1);
    if (n.b) c2.b = quitarTachadosCE(n.b) || numCE(1);
    return c2;
  }
  function numeradorCE(t) { return t.k === "/" ? t.a : t; }
  // texto simple (para las notas): x, (x − 1), (x − 2)!
  function textoPlanoCE(n) {
    switch (n.k) {
      case "num": return fmtCE(n.v);
      case "var": return n.nom;
      case "fact": return (n.a.k === "num" || n.a.k === "var" ? textoPlanoCE(n.a) : "(" + textoPlanoCE(n.a) + ")") + "!";
      case "+": return textoPlanoCE(n.a) + " + " + textoPlanoCE(n.b);
      case "-": return textoPlanoCE(n.a) + " − " + textoPlanoCE(n.b);
      case "·": return [n.a, n.b].map(function (q) { return q.k === "+" || q.k === "-" ? "(" + textoPlanoCE(q) + ")" : textoPlanoCE(q); }).join(" · ");
    }
    return "…";
  }
  function factorTextoCE(n) { return n.k === "+" || n.k === "-" ? "(" + textoPlanoCE(n) + ")" : textoPlanoCE(n); }

  // Pasos de uno o varios árboles a la vez (los miembros de una ecuación):
  // [{ ts: [árboles], nota: [{ t, color }] }]. Con `eq` (la condición de la
  // ecuación) también divide los dos miembros por lo que no puede ser 0 y
  // resuelve x! = número; si no hay solución deja eq.sinSolucion.
  function pasosVariosCE(arboles, eq) {
    var pasos = [], cur = arboles;
    function nota(lista) { return lista.map(function (x) { return { t: x[0], color: x[1] }; }); }
    function paso(ts, n) { pasos.push({ ts: ts, nota: nota(n) }); cur = ts; }
    function alguno(ts, f) { return ts.some(function (t) { return hayCE(t, f); }); }
    function todos(ts, f) { return ts.map(function (t) { return mapCE(t, f); }); }
    function simplificar(n) { paso(cur.map(function (c) { return copiaCE(quitarTachadosCE(copiaCE(c)) || numCE(1), true); }), n); }
    var PROP = [["Propiedad del factorial:", COLOR_FACT], ["n! = n · (n − 1)!", COLOR_FACT]];
    for (var vuelta = 0; vuelta < MAX_PASOS_CE && !cur.every(esValorCE); vuelta++) {
      var ts = cur.map(function (c) { return copiaCE(c, true); });
      // 1) definición de cada número combinatorio
      var tipos = [];
      if (alguno(ts, function (x) { return x.k === "fn"; })) {
        ts = todos(ts, function (x) {
          if (x.k !== "fn") return null;
          if (tipos.indexOf(x.tipo) < 0) tipos.push(x.tipo);
          return pintarCE(definicionCE(x), COLOR_REEMPLAZO);
        });
        paso(ts, [["Definición de " + tipos.map(function (q) { return NOMBRES_CE[q]; }).join(", ").replace(/, ([^,]*)$/, " y $1"), COLOR_REEMPLAZO]]
          .concat(tipos.map(function (q) { return ["formula:" + q, COLOR_REEMPLAZO]; })));
        continue;
      }
      // (x + a)! = n!: las bases son iguales (antes de desarrollar n!)
      if (eq) {
        var cI0 = claveFactCE(ts[0]), cD0 = claveFactCE(ts[1]);
        if (cI0 && cD0 && cI0.tipo !== cD0.tipo && (cI0.tipo === "n" ? cI0.v : cD0.v) >= 2n) {
          paso(ts.map(function (t) { return pintarCE(copiaCE(t.a), COLOR_SUMA); }),
            [["Factoriales iguales (de números ≥ 2):", COLOR_SUMA], ["las bases son iguales", COLOR_SUMA]]);
          continue;
        }
      }
      // 2) las cuentas dentro de los factoriales
      var K = {};
      var pendiente = function (x) {
        if (x.k !== "fact" || esValorCE(x.a) || linCanonCE(x.a) !== null) return false;
        if (!tieneVarCE(x.a)) return true;
        var L = linealCE(x.a); // solo x + b (o un número): (5 − x)! queda como está
        return !!L && L.a.d === 1n && (L.a.n === 1n || L.a.n === 0n);
      };
      if (alguno(ts, pendiente)) {
        ts = todos(ts, function (x) {
          if (!pendiente(x)) return null;
          if (tieneVarCE(x.a)) {
            var L = linealCE(x.a), b = Number(L.b.n), nom = null;
            recorrerCE(x.a, function (q) { if (q.k === "var") nom = q.nom; });
            K.lin = true;
            return factCE(pintarCE(L.a.n === 0n ? numCE(b) : linArbolCE(b, nom), COLOR_SUMA));
          }
          var r = reducirCE(x.a, K);
          return r ? factCE(r) : null;
        });
        paso(ts, notasDeK(K, "dentro de los factoriales"));
        continue;
      }
      // 3) propiedad del factorial para simplificar las fracciones
      var rs = ts.map(cancelarCE);
      if (rs.some(function (r) { return r.hubo; })) {
        if (rs.some(function (r) { return r.desarrollo; })) paso(ts, PROP);
        else cur.forEach(cancelarCE); // solo se tacha, en el renglón que ya está
        simplificar([["Simplificar", COLOR_MAL]]);
        continue;
      }
      // 4) 0! = 1 y 1! = 1
      var cu = {};
      if (alguno(ts, function (x) { return x.k === "fact" && x.a.k === "num" && x.a.v <= 1n; })) {
        ts = todos(ts, function (x) {
          if (x.k !== "fact" || x.a.k !== "num" || x.a.v > 1n) return null;
          cu[x.a.v] = true;
          return numCE(1, COLOR_FACT);
        });
        paso(ts, [[Object.keys(cu).sort().map(function (v) { return v + "! = 1"; }).join(" y "), COLOR_FACT]]);
        continue;
      }
      // 5) desarrollar los factoriales de números que quedan
      if (alguno(ts, function (x) { return x.k === "fact" && x.a.k === "num"; })) {
        ts = todos(ts, function (x) {
          if (x.k !== "fact" || x.a.k !== "num") return null;
          var v = Number(x.a.v);
          if (v > 10) return numCE(factorialBig(v), COLOR_FACT);
          var l = [];
          for (var y = v; y >= 1; y--) l.push(numCE(y, COLOR_FACT));
          return l.reduce(function (a, b) { return opCE("·", a, b); });
        });
        paso(ts, [["Desarrollar el factorial:", COLOR_FACT], ["n! = n · (n − 1) · … · 2 · 1", COLOR_FACT]]);
        continue;
      }
      // 6) las cuentas, de a una
      var hubo6 = false, r6 = ts.map(function (t) { var r = reducirCE(t, K); if (r) hubo6 = true; return r || t; });
      if (hubo6) {
        if (Object.keys(K).some(function (q) { return q !== "callado"; })) paso(r6, notasDeK(K));
        else cur = r6;
        continue;
      }
      if (!eq) break;
      // ----- solo en una ecuación (dos miembros)
      var I = ts[0], D = ts[1];
      // 7) (x + a)! = número: el número como factorial y después las bases
      var fx = function (t) { var c = claveFactCE(t); return c && c.tipo === "x" ? c : null; };
      var ladoF = fx(I) ? 0 : fx(D) ? 1 : -1;
      if (ladoF >= 0 && esValorCE(ts[1 - ladoF])) {
        var val = valorDeCE(ts[1 - ladoF]);
        if (val.d !== 1n || val.n < 2n) break; // 0! = 1! = 1: se prueba con valores
        var nf = 1, f = 1n;
        while (f < val.n) { nf++; f *= BigInt(nf); }
        if (f !== val.n) { eq.sinSolucion = fmtCE(val.n) + " no es el factorial de ningún natural"; break; }
        var nuevo = ts.slice();
        nuevo[1 - ladoF] = pintarCE(factCE(numCE(nf)), COLOR_FACT);
        paso(nuevo, [[fmtCE(val.n) + " = " + nf + "!", COLOR_FACT]]);
        continue;
      }
      // 8) un factorial de x en los dos miembros: se divide por el más chico
      var A8 = mayorFactCE(factoresCE(numeradorCE(I)), "x"), B8 = mayorFactCE(factoresCE(numeradorCE(D)), "x");
      if (A8 && B8) {
        var chico = A8.c.v <= B8.c.v ? A8.n : B8.n, txtChico = textoPlanoCE(chico);
        if (cancelarParCE(A8, B8)) paso(ts, PROP);
        else { cancelarParCE(mayorFactCE(factoresCE(numeradorCE(cur[0])), "x"), mayorFactCE(factoresCE(numeradorCE(cur[1])), "x")); }
        simplificar([["Dividir ambos miembros por " + txtChico, COLOR_MAL], ["(un factorial nunca es 0)", COLOR_MAL]]);
        continue;
      }
      // 9) factores x + b en los dos miembros que no pueden ser 0
      var fI = factoresCE(numeradorCE(cur[0])), fD = factoresCE(numeradorCE(cur[1])), usados = [], txts = [];
      fI.forEach(function (p) {
        var b = linCanonCE(p);
        if (b === null || eq.lo + b < 1) return;
        var q = fD.filter(function (r) { return usados.indexOf(r) < 0 && linCanonCE(r) === b; })[0];
        if (!q) return;
        usados.push(q);
        p.tachar = q.tachar = true;
        txts.push(factorTextoCE(p));
      });
      if (txts.length) {
        simplificar([["Dividir ambos miembros por " + txts.join(" · "), COLOR_MAL],
          ["(no es 0 porque " + eq.corto + ")", COLOR_MAL]]);
        continue;
      }
      // 10) un miembro es una fracción con denominador numérico: se multiplica
      // ambos miembros por el denominador
      var lf = ts[0].k === "/" && esValorCE(ts[0].b) ? 0 : ts[1].k === "/" && esValorCE(ts[1].b) ? 1 : -1;
      if (lf >= 0) {
        var den = ts[lf].b, nuevo10 = [];
        nuevo10[lf] = ts[lf].a;
        var otro = ts[1 - lf];
        nuevo10[1 - lf] = otro.k === "/" && otro.b.k === den.k && textoItemsCE(itemsCE(otro.b, {})) === textoItemsCE(itemsCE(den, {}))
          ? otro.a : opCE("·", pintarCE(copiaCE(den), COLOR_PRODUCTO), otro);
        paso(nuevo10, [["Multiplicar ambos miembros por " + textoItemsCE(itemsCE(den, {})), COLOR_PRODUCTO]]);
        continue;
      }
      break;
    }
    return pasos;
  }
  function pasosCE(arbol) {
    return pasosVariosCE([arbol]).map(function (p) { return { t: p.ts[0], nota: p.nota }; });
  }
  function notasDeK(K, donde) {
    var l = Object.keys(K).filter(function (q) { return q !== "callado"; })
      .map(function (q) { return [NOTAS_CE[q][0], NOTAS_CE[q][1]]; });
    if (donde && (l.length > 1 || K.lin)) l = [["Resolver las cuentas " + donde, COLOR_SUMA]];
    else if (donde && l.length) l[0] = [l[0][0] + " " + donde, l[0][1]];
    return l;
  }

  // ---------------------------------------------------------- polinomios
  // coeficientes racionales { n, d }, del grado 0 para arriba
  var R0 = { n: 0n, d: 1n };
  function rSuma(a, b) { return racB(a.n * b.d + b.n * a.d, a.d * b.d); }
  function rMul(a, b) { return racB(a.n * b.n, a.d * b.d); }
  function pLimpio(p) { while (p.length && p[p.length - 1].n === 0n) p.pop(); return p; }
  function pSuma(p, q, s) {
    var r = [];
    for (var i = 0; i < Math.max(p.length, q.length); i++) {
      var b = q[i] || R0;
      r.push(rSuma(p[i] || R0, s < 0 ? { n: -b.n, d: b.d } : b));
    }
    return pLimpio(r);
  }
  function pMul(p, q) {
    var r = [];
    p.forEach(function (a, i) { q.forEach(function (b, j) { r[i + j] = rSuma(r[i + j] || R0, rMul(a, b)); }); });
    return pLimpio(r);
  }
  function polyCE(n) {
    var a, b;
    switch (n.k) {
      case "num": return pLimpio([{ n: n.v, d: 1n }]);
      case "rac": return [{ n: n.n, d: n.d }];
      case "var": return [R0, { n: 1n, d: 1n }];
      case "neg": a = polyCE(n.a); return a && pSuma([], a, -1);
      case "fact": case "fn": return tieneVarCE(n) ? null : pLimpio([evalCE(n)]);
      case "+": case "-": a = polyCE(n.a); b = polyCE(n.b); return a && b && pSuma(a, b, n.k === "+" ? 1 : -1);
      case "·": a = polyCE(n.a); b = polyCE(n.b); return a && b && pMul(a, b);
      case "/":
        a = polyCE(n.a); b = polyCE(n.b);
        if (!a || !b || b.length !== 1) return null;
        return pMul(a, [racB(b[0].d, b[0].n)]);
      case "^":
        a = polyCE(n.a); b = polyCE(n.b);
        if (!a || !b || b.length > 1) return null;
        var e = b.length ? b[0] : R0;
        if (e.d !== 1n || e.n < 0n || e.n > 12n) return null;
        var r = [{ n: 1n, d: 1n }];
        for (var i = 0n; i < e.n; i++) r = pMul(r, a);
        return r;
    }
    return null;
  }
  function pValor(p, x) { return p.reduceRight(function (acc, c) { return rSuma(rMul(acc, x), c); }, R0); }
  function itemsPolyCE(p, nom, color) {
    if (!p.length) return [TF("0", color)];
    var its = [], primero = true;
    for (var g = p.length - 1; g >= 0; g--) {
      var c = p[g];
      if (c.n === 0n) continue;
      var neg = c.n < 0n, ab = { n: neg ? -c.n : c.n, d: c.d };
      its.push(TF(primero ? (neg ? "−" : "") : (neg ? " − " : " + "), color));
      if (ab.d !== 1n) { var fr = FrF(miles(ab.n), miles(ab.d)); if (color) fr.color = color; its.push(fr); }
      else if (!(g > 0 && ab.n === 1n)) its.push(TF(miles(ab.n), color));
      if (g > 0) its.push(TF(nom + (g > 1 ? superindice(g) : ""), color));
      primero = false;
    }
    return its;
  }
  function textoItemsCE(its) {
    return its.map(function (it) {
      return it.frac ? "(" + textoItemsCE(it.frac[0]) + ")/(" + textoItemsCE(it.frac[1]) + ")"
        : it.sup ? "^" + textoItemsCE(it.sup) : it.supsub ? "^" + textoItemsCE(it.supsub[0]) + "_" + textoItemsCE(it.supsub[1]) : it.t || "";
    }).join("").replace(/\s+/g, "");
  }
  function pxB(v) { return v < 0n ? "(" + fmtCE(v) + ")" : fmtCE(v); }
  function raizEnteraB(v) {
    if (v < 0n) return null;
    var r = BigInt(Math.round(Math.sqrt(Number(v))));
    for (var d = -2n; d <= 2n; d++) if (r + d >= 0n && (r + d) * (r + d) === v) return r + d;
    return null;
  }
  function itemsRacCE(r, color) { return itemsCE(valorNodoCE(r), {}, color); }

  // Resuelve P = Q (polinomios): renglones y raíces candidatas.
  // R: { L: renglones, cand: [racionales], identidad, absurdo, tanteo }
  function resolverPolyCE(P, Q, nom, eq, color) {
    var L = [], R = { L: L, cand: [] }, X = nom;
    function ln(izq, der, n, c) { var l = LnF(izq, "=", der, n ? notaF(n[0], n[1]) : null); if (c) l.color = c; L.push(l); return l; }
    // fracciones: se multiplica por el denominador común
    var dens = P.concat(Q).map(function (c) { return c.d; }), M = dens.reduce(function (a, d) { return a / gcdB(a, d) * d; }, 1n);
    if (M > 1n) {
      P = pMul(P, [{ n: M, d: 1n }]); Q = pMul(Q, [{ n: M, d: 1n }]);
      ln(itemsPolyCE(P, X), itemsPolyCE(Q, X), [["Multiplicar ambos miembros por " + miles(M)], COLOR_PRODUCTO]);
    }
    var D = pSuma(P, Q, -1);
    if (D.length === 2) {
      // lineal: las x en el primer miembro y los números en el segundo
      var a1 = D[1], c1 = { n: -D[0].n, d: D[0].d };
      var yaEsta = P.length === 2 && P[0].n === 0n && Q.length <= 1;
      if (!yaEsta) ln(itemsPolyCE([R0, a1], X), [TF(fmtCE(c1.n), COLOR_SUMA)], [["Agrupar: las " + X + " en el primer miembro", "y los números en el segundo"], COLOR_SUMA]);
      var r1 = racB(c1.n * a1.d, a1.n * c1.d);
      if (!(a1.n === 1n && a1.d === 1n)) ln([TF(X)], itemsRacCE(r1, COLOR_PRODUCTO), [["Dividir ambos miembros por " + fmtCE(a1.n)], COLOR_PRODUCTO]);
      R.cand.push(r1);
      return R;
    }
    if (Q.length) ln(itemsPolyCE(D, X), [TF("0")], [["Pasar todo al primer miembro"], COLOR_SUMA]);
    if (D.length > 1) {
      var g = D.reduce(function (a, c) { return gcdB(a, c.n); }, 0n), s = D[D.length - 1].n < 0n ? -1n : 1n;
      if (g * s !== 1n) {
        D = pMul(D, [racB(1n, g * s)]);
        ln(itemsPolyCE(D, X), [TF("0")], [["Dividir ambos miembros por " + fmtCE(g * s)], COLOR_PRODUCTO]);
      }
    }
    resolverGradoCE(D, X, eq, R);
    return R;
  }
  function resolverGradoCE(D, X, eq, R) {
    var L = R.L, grado = D.length - 1;
    function ln(izq, rel, der, n) { var l = LnF(izq, rel, der, n ? notaF(n[0], n[1]) : null); L.push(l); return l; }
    if (grado < 0) { R.identidad = true; ln([TF("0")], "=", [TF("0"), MarcaF(true)], [["Queda una identidad:", "vale para todo " + X + " de la condición"], COLOR_SUMA]); return; }
    if (grado === 0) { R.absurdo = true; ln(itemsPolyCE(D, X), "=", [TF("0"), MarcaF(false)], [["Absurdo: no tiene solución"], COLOR_MAL]); return; }
    if (D[0].n === 0n) {
      // factor común xᵐ: un producto es 0 si alguno de sus factores es 0
      var m = 0;
      while (D[m].n === 0n) m++;
      var resto = D.slice(m), xm = X + (m > 1 ? superindice(m) : "");
      var fc = [TF(xm + " · (")].concat(itemsPolyCE(resto, X), [TF(")")]);
      var lf = ln(fc, "=", [TF("0")], [["Sacar factor común " + xm], COLOR_PRODUCTO]);
      lf.llave = true;
      L.push(ramaF(X, [TF("0")], notaF("Un producto es 0 si algún factor es 0", COLOR_PRODUCTO)));
      R.cand.push(R0);
      var r2 = { L: [], cand: [] };
      if (resto.length > 1) {
        var lr = LnF(itemsPolyCE(resto, X), "=", [TF("0")]);
        lr.sub = true;
        r2.L.push(lr);
        resolverGradoCE(resto, X, eq, r2);
      }
      r2.L.forEach(function (l) { L.push(l); });
      R.cand = R.cand.concat(r2.cand);
      if (r2.tanteo) R.tanteo = true;
      return;
    }
    var en = D.every(function (c) { return c.d === 1n; });
    if (grado === 1 && en) {
      var a = D[1].n, b = D[0].n;
      if (b !== 0n) ln(itemsPolyCE([R0, D[1]], X), "=", [TF(fmtCE(-b), COLOR_SUMA)], [[(b > 0n ? "Restar " : "Sumar ") + fmtCE(b < 0n ? -b : b) + " en ambos miembros"], COLOR_SUMA]);
      var r = racB(-b, a);
      if (a !== 1n) ln([TF(X)], "=", itemsRacCE(r, COLOR_PRODUCTO), [["Dividir ambos miembros por " + fmtCE(a)], COLOR_PRODUCTO]);
      R.cand.push(r);
      return;
    }
    if (grado === 2 && en) {
      var A = D[2].n, B = D[1].n, C = D[0].n, Xs = X + "₁,₂";
      ln(null, null, [TF("a = "), TF(fmtCE(A), COLOR_A), TF("    b = "), TF(fmtCE(B), COLOR_B), TF("    c = "), TF(fmtCE(C), COLOR_C)],
        [["Identificar a, b y c"], TINTA]);
      ln([TF(Xs)], "=", FrF(["−", TF("b", COLOR_B), " ± ", RzF([TF("b", COLOR_B), "² − 4·", TF("a", COLOR_A), "·", TF("c", COLOR_C)])],
        ["2·", TF("a", COLOR_A)]), [["Fórmula resolvente"], TINTA]);
      ln([TF(Xs)], "=", FrF(["−", TF(pxB(B), COLOR_B), " ± ", RzF([TF(pxB(B), COLOR_B), "² − 4·", TF(pxB(A), COLOR_A), "·",
        TF(pxB(C), COLOR_C)])], ["2·", TF(pxB(A), COLOR_A)]), [["Reemplazar a, b y c"], COLOR_PRODUCTO]);
      var Dl = B * B - 4n * A * C, den = 2n * A;
      ln([TF(Xs)], "=", FrF([TF(fmtCE(-B), COLOR_SUMA), " ± ", RzF(TF(fmtCE(Dl), COLOR_SUMA))], TF(fmtCE(den), COLOR_SUMA)),
        [["Resolver las operaciones"], COLOR_SUMA]);
      if (Dl < 0n) { ln(null, null, [TF("La raíz de un número negativo no es real: no hay soluciones", COLOR_MAL)]); return; }
      var s = raizEnteraB(Dl);
      if (s === null) {
        R.irracional = true;
        ln(null, null, [TF("√" + fmtCE(Dl) + " no es exacta: las raíces son irracionales (no naturales)", COLOR_MAL)]);
        return;
      }
      var lr2 = ln([TF(Xs)], "=", FrF([fmtCE(-B), " ± ", TF(fmtCE(s), COLOR_PRODUCTO)], fmtCE(den)), [["√" + fmtCE(Dl) + " = " + fmtCE(s)], COLOR_PRODUCTO]);
      lr2.llave = true;
      var raices = s === 0n ? [[X + "₁ = " + X + "₂", " + "]] : [[X + "₁", " + "], [X + "₂", " − "]];
      raices.forEach(function (q, k) {
        var num = q[1] === " + " ? -B + s : -B - s, r = racB(num, den);
        var der = [FrF(fmtCE(-B) + q[1] + fmtCE(s), fmtCE(den)), " = "].concat(itemsRacCE(r));
        L.push(ramaF(q[0], der, k ? null : notaF(s === 0n ? "Una sola raíz (doble)" : "Calcular las dos raíces", COLOR_SUMA)));
        R.cand.push(r);
      });
      return;
    }
    // grado 3 o más (o coeficientes raros): probar los naturales de la condición
    R.tanteo = true;
    var hasta = Math.min(eq.hi, eq.tope, eq.lo + 60), hallados = [];
    for (var v = eq.lo; v <= hasta; v++) if (pValor(D, { n: BigInt(v), d: 1n }).n === 0n) hallados.push(v);
    ln(null, null, [TF(hallados.length ? "Se anula en " + hallados.map(function (h) { return X + " = " + h; }).join(", ")
      : "No se anula para ningún natural de la condición")], [["Probar los valores naturales", "de la condición (" + eq.corto + ")"], COLOR_PRODUCTO]);
    hallados.forEach(function (h) { R.cand.push({ n: BigInt(h), d: 1n }); });
  }

  // ---------------------------------------------------------------- dibujo
  function fmtCE(v) { return (v < 0n ? "−" : "") + miles(v < 0n ? -v : v); }
  function negativoCE(n) { return (n.k === "num" && n.v < 0n) || (n.k === "rac" && n.n < 0n); }
  function itemsFnCE(f, op, col) {
    var R = op.repeticion === "prima" ? "'" : "R", nom = f.tipo[0] + (f.tipo.length > 1 ? R : "");
    var n = argTextoCE(f.n, true), k = f.kk === undefined ? "" : argTextoCE(f.kk, true);
    if (f.tipo === "C" && (op.binomial || f.binom)) {
      var bi = { binom: [itF(argTextoCE(f.n)), itF(argTextoCE(f.kk))] };
      if (col) bi.color = col;
      return [bi];
    }
    if (op.notacion === "sub" || op.notacion === "paren") {
      var c = { tipo: f.tipo, n: op.notacion === "sub" ? n : argTextoCE(f.n), k: op.notacion === "sub" ? k : argTextoCE(f.kk), reps: f.reps };
      return [TF(simboloComb(c, op), col)];
    }
    var sup = f.tipo === "P" ? [] : f.tipo === "PR" ? itF(f.reps.join(",")) : itF(n);
    var sub = f.tipo === "P" || f.tipo === "PR" ? itF(n) : itF(k);
    var ss = { supsub: [sup, sub] };
    if (col) ss.color = col;
    return [TF(nom, col), ss];
  }
  function itemsCE(n, op, heredado) {
    var out = [];
    function T(t, c) { out.push(c ? { t: t, color: c } : { t: t }); }
    function suma(x) { return x.k === "+" || x.k === "-"; }
    function poner(x, c, paren) {
      if (x.tachar && op.tachar && x.k !== "fact") {
        // lo que se divide en los dos miembros: tachado entero
        var it = { t: (paren ? "(" : "") + textoPlanoCE(x) + (paren ? ")" : ""), tachar: COLOR_MAL };
        if (x.color || c) it.color = x.color || c;
        out.push(it);
        return;
      }
      if (paren) T("(", c);
      emitir(x, c);
      if (paren) T(")", c);
    }
    function emitir(x, c) {
      var col = x.color || c, it;
      switch (x.k) {
        case "num": T(fmtCE(x.v), col); return;
        case "var": T(x.nom, col); return;
        case "rac":
          if (x.n < 0n) T("−", col);
          it = FrF(miles(x.n < 0n ? -x.n : x.n), miles(x.d));
          if (col) it.color = col;
          out.push(it);
          return;
        case "fact":
          if (x.a.k === "num" || x.a.k === "var" || (x.tachar && op.tachar)) {
            it = { t: textoPlanoCE(x) };
            col = x.color || x.a.color || c;
            if (col) it.color = col;
            if (x.tachar && op.tachar) it.tachar = COLOR_MAL;
            out.push(it);
          } else { T("(", col); emitir(x.a, col); T(")!", col); }
          return;
        case "fn": itemsFnCE(x, op, col).forEach(function (q) { out.push(q); }); return;
        case "neg": T("−", col); poner(x.a, col, suma(x.a) || x.a.k === "neg" || negativoCE(x.a)); return;
        case "+": case "-":
          poner(x.a, col, false);
          T(x.k === "+" ? " + " : " − ", col);
          poner(x.b, col, x.b.k === "neg" || negativoCE(x.b) || (x.k === "-" && suma(x.b)));
          return;
        case "·":
          poner(x.a, col, suma(x.a));
          var pb = suma(x.b) || x.b.k === "neg" || negativoCE(x.b);
          var pegado = x.impl && (x.b.k === "fn" || x.b.k === "var" || pb) || (x.a.k === "num" && x.b.k === "var" && !x.b.tachar);
          if (!pegado) T(" · ", col);
          poner(x.b, col, pb);
          return;
        case "/":
          it = { frac: [itemsCE(x.a, op, col), itemsCE(x.b, op, col)] };
          if (col) it.color = col;
          out.push(it);
          return;
        case "^":
          poner(x.a, col, !((x.a.k === "num" && x.a.v >= 0n) || x.a.k === "fn" || x.a.k === "fact" || x.a.k === "var"));
          it = { sup: itemsCE(x.b, op, col) };
          if (col) it.color = col;
          out.push(it);
          return;
      }
    }
    poner(n, heredado, false);
    return out;
  }
  function notaCE(nota, op) {
    return (nota || []).map(function (x) {
      return /^formula:/.test(x.t) ? { t: formulaCE(x.t.slice(8), op), color: x.color } : x;
    });
  }
  // renglones de un miembro: «expresión = paso 1», «= paso 2»...
  function lineasCE(arbol, op, color) {
    var pasos = pasosCE(arbol), izq = itemsCE(arbol, op);
    if (!pasos.length) return [LnF(null, null, izq, null, color)];
    return pasos.map(function (p, i) {
      return LnF(i ? null : izq, "=", itemsCE(p.t, op), notaCE(p.nota, op), i === pasos.length - 1 ? color : null);
    });
  }

  // ---------------------------------------------------------- ecuaciones
  // Todo el desarrollo de una ecuación: renglones «I = D» (alineados en el
  // «=»), la resolución, qué raíces cumplen la condición y el conjunto
  // solución. Devuelve { L, sol: [naturales] | null (identidad) }.
  function resolverEcuacionCE(E, op, color) {
    var dom = E.dominio, X = E.incognita, L = [];
    var eq = { lo: dom.lo, hi: dom.hi, tope: dom.tope, corto: dom.corto };
    var pasos = pasosVariosCE(E.miembros, eq);
    L.push(LnF(itemsCE(E.miembros[0], op), "=", itemsCE(E.miembros[1], op)));
    pasos.forEach(function (p) { L.push(LnF(itemsCE(p.ts[0], op), "=", itemsCE(p.ts[1], op), notaCE(p.nota, op))); });
    var fin = pasos.length ? pasos[pasos.length - 1].ts : E.miembros, R, sol = [];
    if (eq.sinSolucion) {
      L.push(libreF(LnF(null, null, [TF(eq.sinSolucion, COLOR_MAL), MarcaF(false)])));
      R = { cand: [] };
    } else {
      var P = polyCE(fin[0]), Q = polyCE(fin[1]);
      if (P && Q) {
        var mismo = textoItemsCE(itemsPolyCE(P, X)) === textoItemsCE(itemsCE(fin[0], op)) &&
          textoItemsCE(itemsPolyCE(Q, X)) === textoItemsCE(itemsCE(fin[1], op));
        if (!mismo) L.push(LnF(itemsPolyCE(P, X), "=", itemsPolyCE(Q, X), notaF(["Aplicar la distributiva", "y agrupar los términos"], COLOR_PRODUCTO)));
        R = resolverPolyCE(P, Q, X, eq, color);
        R.L.forEach(function (l, i) { if (!i) l.sub = true; L.push(l); });
      } else {
        // no se puede llevar a un polinomio: probar los naturales de la condición
        R = { cand: [], tanteo: true };
        var hasta = Math.min(dom.hi, dom.tope, dom.lo + 60);
        for (var v = dom.lo; v <= hasta; v++) {
          try {
            var a = evalCE(sustCE(E.miembros[0], v)), b = evalCE(sustCE(E.miembros[1], v));
            if (a.n === b.n && a.d === b.d) R.cand.push({ n: BigInt(v), d: 1n });
          } catch (e) { if (!(e && e.msjCE)) throw e; }
        }
        var lt = libreF(LnF(null, null, [TF(R.cand.length ? "Verifican la ecuación: " + R.cand.map(function (c) { return X + " = " + c.n; }).join(", ")
          : "Ningún natural de la condición verifica la ecuación")], notaF(["No queda un polinomio: probar los", "valores naturales de la condición"], COLOR_PRODUCTO)));
        lt.sub = true;
        L.push(lt);
      }
    }
    if (R.identidad) {
      var li = libreF(LnF(null, null, [TF("S = {" + X + " ∈ ℕ / " + dom.corto + "}")]));
      li.caja = color; li.color = color; li.sub = true;
      L.push(li);
      return { L: L, sol: null };
    }
    // cada raíz: ¿cumple la condición?
    var vistos = {};
    R.cand.forEach(function (r, i) {
      var clave = r.n + "/" + r.d;
      if (vistos[clave]) return;
      vistos[clave] = true;
      var nat = r.d === 1n && r.n >= 0n, v = Number(r.n), ok = nat && v >= dom.lo && v <= dom.hi;
      var motivo = !nat ? "No es natural" : !ok ? "No cumple la condición (" + dom.corto + ")" : "Cumple la condición (" + dom.corto + ")";
      var l = libreF(LnF(null, null, [TF(X + " = ")].concat(itemsRacCE(r), [MarcaF(ok), TF("  " + motivo, ok ? COLOR_SUMA : COLOR_MAL)])));
      if (!i) l.sub = true;
      L.push(l);
      if (ok) sol.push(v);
    });
    var ls = libreF(LnF(null, null, [TF("S = " + (sol.length ? "{" + sol.join(", ") + "}" : "∅"))]));
    ls.caja = color; ls.color = color; ls.sub = true;
    L.push(ls);
    return { L: L, sol: sol };
  }

  function generarCombExpr(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20, lh = tam * fuente.lh;
    var y = oy;
    op.filas.forEach(function (fila) {
      var E = leerCE(fila.texto);
      if (E.error) return;
      if (E.incognita) {
        if (op.titulos) {
          var enun = [TF("Resolver ")].concat(itemsCE(E.miembros[0], op), [TF(" = ")], itemsCE(E.miembros[1], op));
          y = dibujarBloqueF([LnF(null, null, enun, null, fila.color)], ox, y, op, agregar) + lh * 0.3;
        }
        agregar(texto(ox, y, "Condición: " + E.dominio.texto, TAM_NOTA[op.tamTexto] || 16, fuente, COLOR_CONDICION, "left"));
        y += lh * 1.3;
        var Rq = resolverEcuacionCE(E, op, fila.color);
        y = dibujarBloqueF(Rq.L, ox, y, op, agregar) + lh * 1.2;
        if (op.verificar && Rq.sol && Rq.sol.length) {
          agregar(texto(ox, y, "Verificación", tam, fuente, fila.color, "left"));
          y += lh * 1.2;
          var LV = [];
          Rq.sol.forEach(function (s) {
            var vs = E.miembros.map(function (m) { return sustCE(m, s); }), vals = vs.map(evalCE);
            vs.forEach(function (m, j) {
              if (j && esValorCE(m)) return; // un número solo: no hace falta calcularlo
              var l = LnF(itemsCE(m, op), "=", itemsRacCE(vals[j]), j ? null : notaF("Con " + E.incognita + " = " + s, fila.color));
              if (!j && LV.length) l.sub = true;
              LV.push(l);
            });
            var ok = vals[0].n === vals[1].n && vals[0].d === vals[1].d;
            LV.push(libreF(LnF(null, null, itemsRacCE(vals[0]).concat([TF(ok ? " = " : " ≠ ")], itemsRacCE(vals[1]), [MarcaF(ok)]))));
          });
          y = dibujarBloqueF(LV, ox + tam, y, op, agregar) + lh * 1.2;
        }
        y += lh * 0.3;
        return;
      }
      if (E.miembros.length === 1) {
        y = dibujarBloqueF(lineasCE(E.miembros[0], op, fila.color), ox, y, op, agregar) + lh * 1.5;
        return;
      }
      var sangria = op.titulos ? tam : 0;
      if (op.titulos) {
        var enun2 = [TF("Demostrar que ")].concat(itemsCE(E.miembros[0], op), [TF(" = ")], itemsCE(E.miembros[1], op));
        y = dibujarBloqueF([LnF(null, null, enun2, null, fila.color)], ox, y, op, agregar) + lh * 0.6;
      }
      var vals = [];
      ["Primer miembro", "Segundo miembro"].forEach(function (tit, j) {
        if (op.titulos) { agregar(texto(ox, y, tit, tam, fuente, fila.color, "left")); y += lh * 1.2; }
        y = dibujarBloqueF(lineasCE(E.miembros[j], op, fila.color), ox + sangria, y, op, agregar) + lh * 0.8;
        vals.push(evalCE(E.miembros[j]));
      });
      var ok = vals[0].n === vals[1].n && vals[0].d === vals[1].d;
      var conc = itemsCE(valorNodoCE(vals[0]), op).concat([TF(ok ? " = " : " ≠ ")], itemsCE(valorNodoCE(vals[1]), op), [MarcaF(ok)]);
      var nota = notaF(ok ? "Se verifica la igualdad" : "No se verifica la igualdad", ok ? COLOR_SUMA : COLOR_MAL);
      y = dibujarBloqueF([LnF(null, null, conc, nota, fila.color)], ox, y, op, agregar) + lh * 1.5;
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

  // ================================================ IDENTIDAD DE BEZOUT
  // Cada fila son dos numeros naturales: "252, 198". Con el algoritmo de
  // Euclides se calcula el mcd y se lo escribe como combinacion lineal
  //   mcd(a, b) = a · s + b · t
  // por dos metodos: despejando los restos y sustituyendo hacia atras (un
  // paso por renglon: reemplazar, distributiva, agrupar) y/o con la tabla del
  // algoritmo de Euclides extendido (columnas q, r, s, t).
  var MAX_BEZOUT = 1e6;
  var COLOR_REEMPLAZO = "#1971c2";

  function leerBezout(txt) {
    var t = String(txt || "").trim();
    if (!t) return { error: "Escribí dos números separados por coma, por ejemplo: 252, 198" };
    var partes = t.split(/[,;\s]+/).filter(function (x) { return x; }), nums = [];
    for (var i = 0; i < partes.length; i++) {
      var p = partes[i].replace(/\./g, "");
      if (!/^\d+$/.test(p)) return { error: "«" + partes[i] + "» no es un número natural" };
      var n = parseInt(p, 10);
      if (n < 1) return { error: "Los números tienen que ser mayores que 0" };
      if (n > MAX_BEZOUT) return { error: "Hasta " + miles(MAX_BEZOUT) + " como máximo" };
      nums.push(n);
    }
    if (nums.length !== 2) return { error: "Hacen falta exactamente dos números" };
    return { a: nums[0], b: nums[1] };
  }

  function fmtB(n) { return (n < 0 ? "−" : "") + miles(Math.abs(n)); }
  function parB(n) { return n < 0 ? "(" + fmtB(n) + ")" : fmtB(n); }

  // divisiones sucesivas: [{ D, d, q, r }] (D = d · q + r), con A >= B
  function euclidesB(A, B) {
    var divs = [];
    while (B) { var q = Math.floor(A / B), r = A - q * B; divs.push({ D: A, d: B, q: q, r: r }); A = B; B = r; }
    return divs;
  }

  // datos comunes de los dos metodos
  function prepararBezout(a, b) {
    var A = Math.max(a, b), B = Math.min(a, b), divs = euclidesB(A, B);
    return { a: a, b: b, A: A, B: B, divs: divs, d: divs[divs.length - 1].d, nom: "mcd(" + miles(a) + ", " + miles(b) + ")" };
  }

  // renglones de las divisiones y el mcd
  function euclidesLineasB(E, color, L) {
    E.divs.forEach(function (v, i) {
      // una sola nota (la del primer renglon): con una por division se amontonan
      var nota = i ? null : E.divs.length > 1 ? ["Dividir el mayor por el menor y después", "cada divisor por su resto, hasta resto 0"]
        : "Dividir el mayor por el menor";
      L.push(LnF(miles(v.D), "=", miles(v.d) + " · " + miles(v.q) + " + " + miles(v.r), nota && notaF(nota, TINTA)));
    });
    var lm = LnF(E.nom, "=", TF(miles(E.d), color), notaF(E.divs.length > 1
      ? ["El resto dio 0: el mcd es", "el último resto distinto de 0"] : ["El resto dio 0: el mcd es", "el divisor, " + miles(E.d)], TINTA));
    lm.corte = true;
    lm.caja = color;
    L.push(lm);
  }

  // mcd = a · s + b · t (recuadrado) y la verificacion
  function finalB(E, s, t, color, op, L, nota) {
    var l = LnF(E.nom, "=", [miles(E.a) + " · ", TF(parB(s), color), " + " + miles(E.b) + " · ", TF(parB(t), color)],
      notaF(nota, TINTA));
    l.corte = true;
    l.caja = color;
    L.push(l);
    L.push(libreF(LnF(null, null, [TF("s = " + fmtB(s) + "     t = " + fmtB(t), color)])));
    if (op.verificar) {
      var ps = E.a * s, pt = E.b * t;
      var v = LnF(miles(E.a) + " · " + parB(s) + " + " + miles(E.b) + " · " + parB(t), "=",
        fmtB(ps) + (pt < 0 ? " − " : " + ") + miles(Math.abs(pt)), notaF("Verificar", TINTA));
      v.corte = true;
      L.push(v);
      L.push(LnF(null, "=", [fmtB(ps + pt), MarcaF(ps + pt === E.d)]));
    }
  }

  // ts: [{ n, c, col, par: { D, d, q } }] -> items «54 · 1 − (198 − 54 · 3) · 1»
  function terminosB(ts) {
    var its = [];
    ts.forEach(function (tm, k) {
      var signo = tm.c < 0 ? (k ? " − " : "−") : k ? " + " : "";
      if (tm.par) {
        if (signo) its.push(TF(signo));
        its.push(TF("(" + miles(tm.par.D) + " − " + miles(tm.par.d) + " · " + miles(tm.par.q) + ")", COLOR_REEMPLAZO));
        its.push(TF(" · " + miles(Math.abs(tm.c))));
      } else {
        its.push(TF(signo + miles(tm.n) + " · " + miles(Math.abs(tm.c)), tm.col));
      }
    });
    return its;
  }
  // «1 + 3 = 4», «−4 − 1 = −5»
  function sumaCoefB(cs) {
    return cs.map(function (c, k) { return k ? (c < 0 ? " − " : " + ") + miles(Math.abs(c)) : fmtB(c); }).join("")
      + " = " + fmtB(cs.reduce(function (x, y) { return x + y; }, 0));
  }

  function sustitucionB(E, color, op) {
    var L = [], divs = E.divs, n = divs.length, d = E.d;
    euclidesLineasB(E, color, L);
    if (n === 1) {
      // el menor divide al mayor: mcd = menor = mayor · 0 + menor · 1
      var aMenor = E.a === E.B;
      finalB(E, aMenor ? 1 : 0, aMenor ? 0 : 1, color, op, L, ["El mcd es uno de los dos números:", "coeficientes 1 y 0"]);
      return L;
    }
    // despejes de los restos distintos de 0
    if (op.despejes) {
      divs.slice(0, n - 1).forEach(function (v, i) {
        var l = LnF(miles(v.r), "=", miles(v.D) + " − " + miles(v.d) + " · " + miles(v.q),
          i ? null : notaF("Despejar los restos distintos de 0", TINTA));
        if (!i) l.corte = true;
        L.push(l);
      });
    }
    // el ultimo despeje, con todos los coeficientes
    var u = divs[n - 2], ts = [{ n: u.D, c: 1 }, { n: u.d, c: -u.q }];
    var l0 = LnF(miles(d), "=", terminosB(ts), notaF(op.despejes ? ["Partir del último despeje", "(con todos los coeficientes)"]
      : ["Despejar el último resto distinto de 0", "(con todos los coeficientes)"], TINTA));
    l0.corte = true;
    L.push(l0);
    var previa = l0, previaTs = ts;
    for (var k = n - 3; k >= 0; k--) {
      var v = divs[k], j = -1;
      ts.forEach(function (tm, i) { if (tm.n === v.r) j = i; });
      // el termino que se reemplaza va en el color del reemplazo en el renglon anterior
      previa.der = terminosB(previaTs.map(function (tm, i) { return { n: tm.n, c: tm.c, col: i === j ? COLOR_REEMPLAZO : tm.col }; }));
      var c = ts[j].c;
      // 1) reemplazar
      var rem = ts.map(function (tm, i) { return i === j ? { n: tm.n, c: c, par: v } : { n: tm.n, c: tm.c }; });
      L.push(LnF(miles(d), "=", terminosB(rem),
        notaF("Reemplazar " + miles(v.r) + " = " + miles(v.D) + " − " + miles(v.d) + " · " + miles(v.q), COLOR_REEMPLAZO)));
      // 2) distributiva
      var dist = [];
      ts.forEach(function (tm, i) {
        if (i === j) { dist.push({ n: v.D, c: c, col: COLOR_PRODUCTO }); dist.push({ n: v.d, c: -c * v.q, col: COLOR_PRODUCTO }); }
        else dist.push({ n: tm.n, c: tm.c });
      });
      L.push(LnF(miles(d), "=", terminosB(dist), notaF("Aplicar la distributiva", COLOR_PRODUCTO)));
      // 3) agrupar los terminos del mismo numero (queda donde aparece primero)
      var agr = [], cs = [];
      dist.forEach(function (tm) {
        if (tm.n === v.d) cs.push(tm.c);
        var ya = agr.filter(function (x) { return x.n === tm.n; })[0];
        if (ya) ya.c += tm.c; else agr.push({ n: tm.n, c: tm.c, col: tm.n === v.d ? COLOR_SUMA : null });
      });
      ts = agr.map(function (tm) { return { n: tm.n, c: tm.c }; });
      previaTs = agr;
      previa =LnF(miles(d), "=", terminosB(agr), notaF("Agrupar los " + miles(v.d) + ": " + sumaCoefB(cs), COLOR_SUMA));
      L.push(previa);
    }
    var coef = function (num) { return ts.filter(function (tm) { return tm.n === num; })[0].c; };
    var aMayor = E.a === E.A;
    finalB(E, coef(E.a), coef(E.b), color, op, L, aMayor ? "Escribir como a · s + b · t"
      : ["Ordenar como a · s + b · t", "(a = " + miles(E.a) + ", b = " + miles(E.b) + ")"]);
    return L;
  }

  function tablaB(E, color, op) {
    var L = [], aPrimero = E.a === E.A;
    var filas = [[TF("q"), TF("r"), TF("s"), TF("t")]];
    // primeras dos filas: el mayor y el menor, con s y t de a y de b
    var r0 = { r: E.A, s: aPrimero ? 1 : 0, t: aPrimero ? 0 : 1 }, r1 = { r: E.B, s: aPrimero ? 0 : 1, t: aPrimero ? 1 : 0 };
    var unaDiv = E.divs.length === 1, col1 = unaDiv ? color : null;
    filas.push([TF(""), TF(miles(r0.r)), TF(fmtB(r0.s)), TF(fmtB(r0.t))]);
    filas.push([TF(""), TF(miles(r1.r), col1), TF(fmtB(r1.s), col1), TF(fmtB(r1.t), col1)]);
    var sF = r1.s, tF = r1.t;
    E.divs.forEach(function (v) {
      var r2 = { r: r0.r - v.q * r1.r, s: r0.s - v.q * r1.s, t: r0.t - v.q * r1.t };
      var col = r2.r === E.d ? color : null;
      if (col) { sF = r2.s; tF = r2.t; }
      filas.push([TF(miles(v.q)), TF(miles(r2.r), col), TF(fmtB(r2.s), col), TF(fmtB(r2.t), col)]);
      r0 = r1; r1 = r2;
    });
    var tb = TablaF(filas);
    tb.lineas = true;
    tb.columnasFijas = 2;
    L.push(LnF(null, null, [tb], notaF(["Primeras filas: " + miles(E.A) + " y " + miles(E.B) + " con 1 y 0",
      "Cada fila nueva: la de dos más arriba", "menos q por la de arriba", "(q: cociente entre los dos r de arriba)",
      "Se termina cuando r da 0"], TINTA)));
    var lm = LnF(E.nom, "=", TF(miles(E.d), color), notaF(["El último r distinto de 0", "es el mcd"], TINTA));
    lm.corte = true;
    lm.caja = color;
    L.push(lm);
    finalB(E, sF, tF, color, op, L, ["En su fila están s y t:", "s acompaña a " + miles(E.a) + " y t a " + miles(E.b)]);
    return L;
  }

  var METODOS_B = [
    { clave: "mSustitucion", titulo: "Euclides y sustitución hacia atrás", hacer: sustitucionB },
    { clave: "mTabla", titulo: "Algoritmo de Euclides extendido", hacer: tablaB },
  ];

  function generarBezout(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20, lh = tam * fuente.lh;
    var y = oy;
    op.filas.forEach(function (fila) {
      var l = leerBezout(fila.texto);
      if (l.error) return;
      var E = prepararBezout(l.a, l.b);
      METODOS_B.forEach(function (m) {
        if (!op[m.clave]) return;
        if (op.titulos) {
          var ts = tamTitulo(tam);
          agregar(texto(ox, y, m.titulo + ": " + miles(l.a) + " y " + miles(l.b), ts, fuente, fila.color, "left"));
          y += ts * fuente.lh + lh * 0.4;
        }
        y = dibujarBloqueF(m.hacer(E, fila.color, op), ox + (op.titulos ? tam : 0), y, op, agregar) + lh * 1.3;
      });
      y += lh;
    });
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

  // Expresion con numeros de filas anteriores y reales: 2 · z₁ / z₂,
  // (z₁ + z₂) · z₃, 3z₁ − z₂... (· y / antes que + y −; 2z₁ es 2 · z₁).
  // Devuelve null si no nombra ninguna fila (es un numero escrito), { error }
  // o { pasos: [operaciones en el orden en que se hacen], texto }.
  var SIMBOLOS_OP_C = { "+": "+", "-": "−", "−": "−", "·": "·", "*": "·", "×": "·", "/": "/", "÷": "/", ":": "/" };
  function leerExpresionC(t, defs) {
    if (/\b(cos|sen|sin)\b/i.test(t)) return null; // forma trigonometrica
    var toks = [], i = 0, hayNombre = false, m;
    var reNum = /^\d+(?:[.,]\d+)?/, reNom = new RegExp("^" + NOMBRE_C);
    while (i < t.length) {
      var c = t[i], resto = t.slice(i);
      if (/\s/.test(c)) { i++; continue; }
      if ((m = reNum.exec(resto))) { toks.push({ k: "num", v: parseFloat(m[0].replace(",", ".")), txt: m[0] }); i += m[0].length; continue; }
      if ((m = reNom.exec(resto))) {
        if (m[0] === "i") return null; // numero en forma binomica
        hayNombre = true; toks.push({ k: "nom", txt: m[0] }); i += m[0].length; continue;
      }
      if (SIMBOLOS_OP_C[c]) { toks.push({ k: "op", s: SIMBOLOS_OP_C[c] }); i++; continue; }
      if (c === "(" || c === ")" || c === "|") { toks.push({ k: c }); i++; continue; }
      return hayNombre ? { error: "No entiendo «" + c + "» en la operación" } : null;
    }
    if (!hayNombre) return null;
    var pos = 0, pasos = [], enBarra = false;
    function err(e) { throw { msjC: e }; }
    function hoja(tk) {
      if (tk.k === "num") return { hoja: { nombre: tk.txt.replace(".", ","), re: tk.v, im: 0, forma: "binomica" } };
      var d = defs[normNombreC(tk.txt)];
      if (!d) err("No hay un número llamado " + tk.txt + " en las filas de arriba");
      return { hoja: d };
    }
    function expr() {
      var a = term();
      while (toks[pos] && toks[pos].k === "op" && (toks[pos].s === "+" || toks[pos].s === "−")) {
        var s2 = toks[pos++].s; a = { s: s2, a: a, b: term() };
      }
      return a;
    }
    function term() {
      var a = factor();
      for (;;) {
        var tk = toks[pos];
        if (tk && tk.k === "op" && (tk.s === "·" || tk.s === "/")) { pos++; a = { s: tk.s, a: a, b: factor() }; }
        else if (tk && (tk.k === "nom" || tk.k === "num" || tk.k === "(" || tk.k === "|" && !enBarra)) a = { s: "·", a: a, b: factor() }; // 2z₁
        else return a;
      }
    }
    function factor() {
      var tk = toks[pos];
      if (tk && tk.k === "op" && tk.s === "−") { pos++; return { s: "·", a: { hoja: { nombre: "−1", re: -1, im: 0, forma: "binomica" } }, b: factor() }; }
      if (!tk) err("Falta un número al final");
      pos++;
      if (tk.k === "num" || tk.k === "nom") return hoja(tk);
      if (tk.k === "(") {
        var e = expr();
        if (!toks[pos] || toks[pos].k !== ")") err("Falta cerrar un paréntesis");
        pos++;
        return e;
      }
      if (tk.k === "|") {
        // modulo: |z₁|, |z₁ + z₂| (adentro no se toma | como multiplicacion implicita)
        var antes = enBarra;
        enBarra = true;
        var dentro = expr();
        enBarra = antes;
        if (!toks[pos] || toks[pos].k !== "|") err("Falta cerrar el módulo con |");
        pos++;
        return { mod: dentro };
      }
      err(tk.k === ")" ? "Sobra un paréntesis de cierre" : "Falta un número antes de «" + tk.s + "»");
    }
    // texto de un nodo (con parentesis donde hacen falta)
    function texto(n, padre, der) {
      if (n.hoja) return n.hoja.nombre;
      if (n.mod) return "|" + texto(n.mod) + "|";
      var t2 = texto(n.a, n.s, false) + " " + n.s + " " + texto(n.b, n.s, true);
      var bajo = n.s === "+" || n.s === "−", padreAlto = padre === "·" || padre === "/";
      return padre && (bajo && padreAlto || der && padre === "−" && bajo || der && padre === "/") ? "(" + t2 + ")" : t2;
    }
    // cada operacion es una "fila" auxiliar con su resultado
    function calcular(n) {
      if (n.hoja) return n.hoja;
      if (n.mod) {
        // el modulo es un numero real: ρ = √(a² + b²)
        var z = calcular(n.mod), m = { forma: "mod", arg: z, re: Math.hypot(z.re, z.im), im: 0, nombre: texto(n) };
        pasos.push(m);
        return m;
      }
      var A = calcular(n.a), B = calcular(n.b), r = { forma: "op", op: { a: A, b: B, s: n.s } };
      var ar = A.re, ai = A.im, br = B.re, bi = B.im;
      if (n.s === "+") { r.re = ar + br; r.im = ai + bi; }
      else if (n.s === "−") { r.re = ar - br; r.im = ai - bi; }
      else if (n.s === "·") { r.re = ar * br - ai * bi; r.im = ar * bi + ai * br; }
      else {
        var d = br * br + bi * bi;
        if (d < EPS_C) err("No se puede dividir por 0 (" + B.nombre + " = 0)");
        r.re = (ar * br + ai * bi) / d; r.im = (ai * br - ar * bi) / d;
      }
      r.nombre = "(" + texto(n) + ")"; // como operando de la operacion siguiente
      pasos.push(r);
      return r;
    }
    try {
      var arbol = expr();
      if (pos < toks.length) err(toks[pos].k === ")" ? "Sobra un paréntesis de cierre" : "Falta un operador entre dos números");
      if (arbol.hoja) err("Escribí una operación (z₁ · z₂, 2 · z₁ / z₂, |z₁| / |z₂|...) o un número (3 + 4i)");
      calcular(arbol);
      return { pasos: pasos, texto: texto(arbol) };
    } catch (e) {
      if (e && e.msjC) return { error: e.msjC };
      throw e;
    }
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
        // expresion con varias operaciones o con numeros reales
        var ex = leerExpresionC(t, defs);
        if (ex && ex.error) r.errores.push(ex.error);
        else if (ex) {
          var ult = ex.pasos[ex.pasos.length - 1];
          r.forma = "op"; r.op = ult.op || null; r.re = ult.re; r.im = ult.im;
          if (ult.forma === "mod") r.modulo = ult;
          r.pasosPrevios = ex.pasos.slice(0, -1); r.textoExpr = ex.texto;
        } else {
          var c = leerComplejo(t);
          if (c.error) r.errores.push(c.error);
          else for (var k in c) r[k] = c[k];
        }
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

  // modulo de un complejo como paso: |z₁| = √(a² + b²) = ... = 5
  function pasosModuloC(m, H) {
    var re = m.arg.re, im = m.arg.im, a2 = re * re, b2 = im * im, s = a2 + b2, rho = Math.sqrt(s);
    return [{ titulo: "Módulo de " + m.arg.nombre.replace(/^\((.*)\)$/, "$1"), cadena: cadenaC(m.nombre, [{ t: "√(a² + b²)" },
      { t: "√(" + H.sq(re) + " + " + H.sq(im) + ")", ap: !H.ex(re) || !H.ex(im) },
      { t: "√(" + H.n(a2) + " + " + H.n(b2) + ")", ap: !H.ex(a2) || !H.ex(b2) },
      { t: "√" + (/[ ,]/.test(H.n(s)) ? "(" + H.n(s) + ")" : H.n(s)), ap: !H.ex(s) },
      { t: H.n(rho), ap: !H.ex(rho) }]) }];
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
    // dos numeros reales (por ejemplo dos modulos): la cuenta directa
    if (Math.abs(A.im) < EPS_C && Math.abs(B.im) < EPS_C) {
      return [{ titulo: nombres[s] + " de números reales", cadena: cadenaC(izq, [{ t: H.n(A.re) + " " + s + " " + H.p(B.re),
        ap: !H.ex(A.re) || !H.ex(B.re) }, fin]) }];
    }
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
      (r.pasosPrevios || []).forEach(function (q, k) {
        (q.forma === "mod" ? pasosModuloC(q, H) : pasosOperacionC(q, H, op)).forEach(function (b) {
          bloques.push({ titulo: "Paso " + (k + 1) + ": " + b.titulo.charAt(0).toLowerCase() + b.titulo.slice(1),
            lineas: [b.cadena], varias: true });
        });
      });
      var nPrev = (r.pasosPrevios || []).length;
      (r.modulo ? pasosModuloC(r.modulo, H) : pasosOperacionC(r, H, op)).forEach(function (b) {
        if (nPrev) b.titulo = "Paso " + (nPrev + 1) + ": " + b.titulo.charAt(0).toLowerCase() + b.titulo.slice(1);
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
    if (r.forma === "op") return r.textoExpr || r.op.a.nombre + " " + r.op.s + " " + r.op.b.nombre;
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
  // extra (opcional): { pts: puntos que tienen que entrar, dibujar(X, Y, s) }
  function dibujarPlanoComplejo(nums, H, op, x0, y0, tam, fuente, agregar, extra) {
    if (!nums.length) return;
    var tamN = Math.max(12, Math.round(tam * 0.7)), lhN = tamN * fuente.lh;
    var restas = op.paralelogramo ? nums.filter(function (r) { return r.forma === "op" && r.op && !(r.pasosPrevios || []).length && r.op.s === "−"; }) : [];
    var pts = [[0, 0]].concat(nums.map(function (r) { return [r.re, r.im]; }),
      restas.map(function (r) { return [-r.op.b.re, -r.op.b.im]; }), extra && extra.pts || []);
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
    if (extra && extra.dibujar) extra.dibujar(X, Y, s);

    // etiqueta junto a la punta de un vector, hacia afuera; si otro vector ya
    // termina en el mismo punto (w = z₁), su etiqueta va un renglón más afuera
    var puntas = {};
    function etiqueta(re, im, txt, color) {
      var a = Math.atan2(im, re), px = X(re) + Math.cos(a) * 8, py = Y(im) - Math.sin(a) * 8;
      var clave = Math.round(re * 1000) + "," + Math.round(im * 1000), n = puntas[clave] || 0;
      puntas[clave] = n + 1;
      var arriba = Math.sin(a) >= 0;
      agregar(texto(px, (arriba ? py - lhN : py) + (arriba ? -1 : 1) * n * lhN, txt, tamN, fuente, color, Math.cos(a) >= -0.2 ? "left" : "right"));
    }
    function vector(re, im, color, dashed) {
      agregar(linea(X0, Y0, [[0, 0], [X(re) - X0, Y(im) - Y0]],
        { type: "arrow", endArrowhead: "arrow", strokeColor: color, strokeWidth: 2, strokeStyle: dashed ? "dashed" : "solid" }));
    }
    var k = 0, leyenda = [];
    nums.forEach(function (r) {
      var color = r.color;
      if (r.forma === "op" && r.op && !(r.pasosPrevios || []).length && op.paralelogramo && (r.op.s === "+" || r.op.s === "−")) {
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
      if (r.forma === "op" && r.op && !(r.pasosPrevios || []).length && (r.op.s === "·" || r.op.s === "/")) {
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

  // ================================== RAICES N-ESIMAS DE UN COMPLEJO
  // Cada fila es un numero complejo (en cualquier forma) y el indice n. Se
  // pasa a forma polar y se aplica la formula de De Moivre:
  //   wₖ = ⁿ√ρ · [cos((φ + k · 360°)/n) + i sen((φ + k · 360°)/n)], k = 0..n−1
  // con el modulo de las raices, el argumento de cada una y cada raiz en las
  // formas elegidas. El grafico muestra las n raices sobre la circunferencia
  // de radio ⁿ√ρ, formando un poligono regular.
  var NOMBRES_RAIZ = { 2: "cuadradas", 3: "cúbicas", 4: "cuartas", 5: "quintas", 6: "sextas", 7: "séptimas",
    8: "octavas", 9: "novenas", 10: "décimas" };
  function leerIndiceRaiz(t) {
    var s = String(t === undefined ? "" : t).trim();
    if (!s) return { error: "Falta el índice n (2, 3, 4...)" };
    var n = Number(s);
    if (!Number.isInteger(n) || n < 2) return { error: "El índice n tiene que ser un número natural mayor o igual que 2" };
    if (n > 12) return { error: "El índice n puede ser como máximo 12" };
    return { n: n };
  }
  function nombreRaizC(i) { return "z" + subindice(i + 1); }

  function generarRaicesC(op, ox, oy, agregarFinal) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20;
    var lh = tam * fuente.lh, y = oy, H = herramientasC(op), sangria = Math.round(tam * 1.5);
    var tamTit = Math.round(tam * 0.8), lhTit = tamTit * fuente.lh;
    op.filas.forEach(function (f, i) {
      var z = leerComplejo(f.texto), ni = leerIndiceRaiz(f.n);
      if (z.error || ni.error) return;
      var n = ni.n, nom = String(f.nombre || "").trim() || nombreRaizC(i), color = f.color;
      var hechos = [], agregar = function (e) { hechos.push(e); return agregarFinal(e); };
      var y0 = y, x = ox + sangria;
      var linea = function (t, col, xx) { agregar(texto(xx === undefined ? x : xx, y, t, tam, fuente, col || TINTA, "left")); y += lh + 4; };
      var titulo = function (t) { if (op.titulos) { agregar(unirConSiguiente(texto(x, y, t, tamTit, fuente, GUIA, "left"))); y += lhTit + 4; } };
      // una cadena de igualdades en un renglon (≈ si el valor es aproximado)
      var cadena = function (c, col) {
        linea(c.izq + c.partes.map(function (p) { return (p.ap ? " ≈ " : " = ") + p.t; }).join(""), col);
      };
      linea("Raíces " + (NOMBRES_RAIZ[n] || "de índice " + n) + " de " + nom + " = " + entradaComplejo(z, H), color, ox);
      unirConSiguiente(hechos[hechos.length - 1]);
      y += 4;
      // 1) forma polar
      var rho, phi;
      if (z.forma === "polar" || z.forma === "trig") { rho = z.rho; phi = z.phi; }
      else {
        titulo("Forma polar de " + nom);
        var pp = pasosPolarC(z.re, z.im, H, nom);
        pp.lineas.forEach(function (l) { if (typeof l === "string") linea(l); else cadena(l); });
        rho = pp.rho; phi = pp.phi;
        linea(nom + (H.ex(rho) && H.angEx(phi) ? " = " : " ≈ ") + H.polar(rho, phi));
        y += lh * 0.4;
      }
      if (rho < EPS_C) { linea("Si " + nom + " = 0, su única raíz es 0", color); y += lh; return; }
      // 2) formula de De Moivre
      var vuelta = H.vuelta, giro = function (k) { return k + " · " + vuelta; };
      titulo("Fórmula de De Moivre");
      linea("wₖ = √[n](ρ) · [cos((φ + k · " + vuelta + ") / n) + i sen((φ + k · " + vuelta + ") / n)]");
      linea("con k = 0, 1" + (n > 2 ? ", …, " + (n - 1) : "") + "   (n = " + n + ": hay " + n + " raíces)");
      y += lh * 0.4;
      // 3) modulo de las raices
      var r = Math.pow(rho, 1 / n);
      titulo("Módulo de las raíces");
      cadena({ izq: "|wₖ|", partes: [{ t: "√[n](ρ)" }, { t: "√[" + n + "](" + H.n(rho) + ")", ap: !H.ex(rho) }, { t: H.n(r), ap: !H.ex(r) }] });
      y += lh * 0.4;
      // 4) argumentos
      titulo("Argumentos de las raíces");
      var raices = [];
      for (var k = 0; k < n; k++) {
        var suma = phi + 2 * Math.PI * k, ang = suma / n;
        var partes = [{ t: "(" + H.ang(phi) + " + " + giro(k) + ") / " + n, ap: !H.angEx(phi) }];
        if (k) partes.push({ t: H.ang(suma) + " / " + n, ap: !H.angEx(suma) });
        partes.push({ t: H.ang(ang), ap: !H.angEx(ang) });
        cadena({ izq: "φ" + subindice(k), partes: partes });
        raices.push({ nombre: "w" + subindice(k), re: r * Math.cos(ang), im: r * Math.sin(ang), rho: r, phi: ang, color: color });
      }
      linea("(las raíces quedan separadas por " + vuelta + " / " + n + " = " + H.ang(2 * Math.PI / n) + ")", GUIA);
      y += lh * 0.4;
      // 5) cada raiz en las formas elegidas
      titulo("Raíces");
      var textosR = raices.map(function (w) {
        var t = w.nombre + ((H.ex(r) && H.angEx(w.phi)) ? " = " : " ≈ ") + H.polar(r, w.phi);
        if (op.fTrig) t += " = " + H.trig(r, w.phi);
        if (op.fBinomica) t += ((H.ex(w.re) && H.ex(w.im)) ? " = " : " ≈ ") + H.binom(w.re, w.im);
        return t;
      });
      if (+op.columnas === 2 && n > 1) {
        // en dos columnas: la primera mitad a la izquierda y el resto a la derecha
        var mitad = Math.ceil(n / 2), wCol = 0;
        textosR.slice(0, mitad).forEach(function (t) { wCol = Math.max(wCol, medir(t, tam, fuente)); });
        var x2 = x + wCol + tam * 2;
        for (var kc = 0; kc < mitad; kc++) {
          agregar(texto(x, y, textosR[kc], tam, fuente, color || TINTA, "left"));
          if (textosR[kc + mitad]) agregar(texto(x2, y, textosR[kc + mitad], tam, fuente, color || TINTA, "left"));
          y += lh + 4;
        }
      } else textosR.forEach(function (t) { linea(t, color); });
      // grafico a la derecha de esta fila (o abajo)
      if (op.grafico) {
        var b = cajaDe(hechos), abajo = op.posGrafico === "abajo";
        var antes = y;
        var dib = [];
        dibujarPlanoComplejo(raices, H, op, abajo ? ox : b.x1 + tam * 3, abajo ? y + tam : y0, tam, fuente,
          function (e) { dib.push(e); return agregarFinal(e); }, {
            pts: [[r, 0], [-r, 0], [0, r], [0, -r]],
            dibujar: function (X, Y, s) {
              // circunferencia de radio ⁿ√ρ y poligono regular de las raices
              agregarFinal(base("ellipse", { x: X(-r), y: Y(r), width: 2 * r * s, height: 2 * r * s,
                strokeColor: GUIA, strokeWidth: 1, strokeStyle: "dashed" }));
              if (n >= 3) {
                agregarFinal(trazo(raices.concat([raices[0]]).map(function (w) { return [X(w.re), Y(w.im)]; }),
                  { strokeColor: color, strokeWidth: 1, strokeStyle: "dashed" }));
              }
            },
          });
        if (dib.length) y = Math.max(antes, cajaDe(dib).y1 + tam);
      }
      y += lh * 1.5;
    });
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
      // solo el par x, ¬x pasa a ser la constante (p ∧ q ∧ ¬q = p ∧ F); lo
      // demas lo hace la dominacion en el paso siguiente
      for (j = 0; j < xs.length; j++) if (j !== i && claves[j] === comp) {
        var cte = { k: "c", v: !neutro }, par = i;
        return { n: juntar(n.k, xs.map(function (x, k) { return k === par ? cte : x; }).filter(function (x, k) { return k !== j; })), ley: "complemento", op: n.k };
      }
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
  // distributiva general: x ∧ (y ∨ z) = (x ∧ y) ∨ (x ∧ z) (y su dual), solo si
  // despues de repartir, las leyes basicas dejan una expresion mas corta:
  // (p ∧ q ∨ ¬p ∧ ¬q) ∧ ¬q = (p ∧ q ∧ ¬q) ∨ (¬p ∧ ¬q ∧ ¬q) = ¬p ∧ ¬q
  function tamSimp(n) {
    if (n.k === "v" || n.k === "c") return 1;
    if (n.xs) return n.xs.reduce(function (s, x) { return s + tamSimp(x); }, 0);
    if (n.k === "not") return tamSimp(n.a);
    return tamSimp(n.a) + tamSimp(n.b);
  }
  function reducirSimp(n) {
    var fases = [leyNegacion, leySimplificacion, leyFactorComun, leyDistributiva];
    for (var k = 0; k < 40; k++) {
      var r = null;
      for (var f = 0; f < fases.length && !r; f++) r = aplicarLeySimp(n, fases[f]);
      if (!r) break;
      n = quitarMarcas(planchar(r.pasos[r.pasos.length - 1].n));
    }
    return n;
  }
  function leyRepartir(n) {
    if (n.k !== "and" && n.k !== "or") return null;
    var K = n.k, D = dualSimp(K), xs = n.xs, tam = tamSimp(n);
    for (var j = 0; j < xs.length; j++) {
      if (xs[j].k !== D) continue;
      for (var i = 0; i < xs.length; i++) {
        if (i === j) continue;
        var repartido = { k: D, xs: xs[j].xs.map(function (y) { return planchar({ k: K, xs: [y, xs[i]] }); }) };
        var otros = xs.filter(function (x, q) { return q !== i && q !== j; });
        otros.splice(Math.min(i, j), 0, repartido);
        var r = juntar(K, otros);
        if (tamSimp(reducirSimp(planchar(r))) < tam) return { n: r, ley: "distributiva", op: K };
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
    fases.push(leyDistributiva, leyRepartir);
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

  // ====================================================== GENERADOR: DIAGRAMA DE VENN
  // 2, 3 o 4 conjuntos dentro del universo (un rectangulo). Cada fila es un dato:
  // el cardinal de una zona o de una expresion con los conjuntos (|A| = 23,
  // |A ∩ B| = 11, solo A = 8, ninguno = 0, U = 38) o el nombre de la variable de
  // una zona (solo A = x). Cada zona es una incognita y cada dato una ecuacion
  // lineal (la suma de las zonas que forman la expresion); se resuelve primero
  // por sustitucion (ecuaciones con una sola incognita, que son los pasos que se
  // escriben) y lo que queda, por eliminacion. Zona = mascara de bits: el bit i
  // esta prendido si la zona esta dentro del conjunto i (0 = fuera de todos).
  var MAX_VENN = 4;
  var PALABRAS_VENN = {
    solo: "solo", "sólo": "solo", solamente: "solo", "únicamente": "solo", unicamente: "solo",
    ninguno: "ninguno", ninguna: "ninguno", "ningún": "ninguno", ningun: "ninguno", nada: "ninguno",
    todos: "todos", todas: "todos", los: "los", las: "los", dos: "num", tres: "num", cuatro: "num",
    y: "y", e: "y", pero: "y", o: "o", u: "o", sin: "sin", no: "no", total: "U",
  };
  var TRAZOS_VENN = [
    { estilo: "solid", grosor: 2 }, { estilo: "dashed", grosor: 2 },
    { estilo: "dotted", grosor: 2.5 }, { estilo: "dashed", grosor: 4 },
  ];
  var RADIOS_VENN = { chico: 90, medio: 115, grande: 145 };

  function filasVenn(op) {
    return (op.filas || []).map(function (f) { return typeof f === "string" ? { texto: f } : f; });
  }

  function leerNombresVenn(op) {
    var t = Array.isArray(op.nombres) ? op.nombres.join(",") : String(op.nombres || "");
    var l = t.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (l.length < 2) return { error: "Escribí 2, 3 o 4 nombres de conjuntos separados por coma" };
    if (l.length > MAX_VENN) return { error: "Como mucho " + MAX_VENN + " conjuntos" };
    for (var i = 0; i < l.length; i++) {
      if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9₀-₉]*$/.test(l[i]))
        return { error: "«" + l[i] + "» no sirve como nombre (letras y números, empezando con letra)" };
      if (l[i] === "U") return { error: "U es el universo: elegí otro nombre" };
      if (PALABRAS_VENN[l[i].toLowerCase()] && l[i] === l[i].toLowerCase())
        return { error: "«" + l[i] + "» es una palabra de los datos: elegí otro nombre" };
      if (l.indexOf(l[i]) !== i) return { error: "«" + l[i] + "» está repetido" };
    }
    return { nombres: l };
  }

  function contarBits(m) { var c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

  // Lee la expresion de la izquierda de un dato. Devuelve { zonas } (bitset de
  // zonas: el bit z esta prendido si la zona z es parte de la expresion) o { error }.
  function leerExprVenn(s, nombres) {
    var n = nombres.length, Z = 1 << n, TODAS = (1 << Z) - 1;
    s = s.replace(/[−–-]/g, "−").replace(/\\|∖/g, "−").replace(/[\^&]/g, "∩").replace(/\+/g, "∪")
      .replace(/[ᶜ’´`]/g, "'").replace(/Ø/g, "∅");
    var toks = [], i = 0, m;
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if ("()∩∪−Δ'∅,".indexOf(c) >= 0) { toks.push({ s: c }); i++; continue; }
      m = /^[A-Za-zÁÉÍÓÚÑáéíóúñ0-9₀-₉]+/.exec(s.slice(i));
      if (!m) throw "No se entiende «" + c + "»";
      var w = m[0], k = nombres.indexOf(w), lw = w.toLowerCase();
      if (k < 0 && !PALABRAS_VENN[lw]) {
        // nombres sin distinguir mayusculas (si no hay ambiguedad)
        var cand = nombres.filter(function (x) { return x.toLowerCase() === lw; });
        if (cand.length === 1) k = nombres.indexOf(cand[0]);
      }
      if (k >= 0) toks.push({ conj: k, s: w });
      else if (w === "U") toks.push({ s: "U" });
      else if (PALABRAS_VENN[lw]) toks.push({ s: PALABRAS_VENN[lw], w: w });
      else throw "«" + w + "» no es uno de los conjuntos (" + nombres.join(", ") + ")";
      i += w.length;
    }
    var p = 0;
    function ver() { return toks[p] && toks[p].s; }
    function deConj(k) { var r = 0; for (var z = 0; z < Z; z++) if (z & (1 << k)) r |= 1 << z; return r; }
    function exprU() {
      var v = inter();
      for (;;) {
        var t = ver();
        if (t === "∪" || t === "o") { p++; v |= inter(); }
        else if (t === "−" || t === "sin") { p++; v &= ~inter() & TODAS; }
        else if (t === "Δ") { p++; v ^= inter(); }
        else return v;
      }
    }
    function inter() {
      var v = post();
      while (ver() === "∩" || ver() === "y") { p++; v &= post(); }
      return v;
    }
    function post() {
      var v = atomo();
      while (ver() === "'") { p++; v = ~v & TODAS; }
      return v;
    }
    function atomo() {
      var t = toks[p];
      if (!t) throw "Falta un conjunto al final";
      p++;
      if (t.conj !== undefined) return deConj(t.conj);
      if (t.s === "(") { var v = exprU(); if (ver() !== ")") throw "Falta cerrar un paréntesis"; p++; return v; }
      if (t.s === "U") return TODAS;
      if (t.s === "∅") return 0;
      if (t.s === "no") return ~post() & TODAS;
      if (t.s === "ninguno") return 1; // la zona 0
      if (t.s === "todos") return 1 << (Z - 1);
      if (t.s === "los") {
        // los tres / los cuatro / los dos / todos: estan en todos los conjuntos
        if (ver() === "num" || ver() === "todos") p++;
        return 1 << (Z - 1);
      }
      if (t.s === "solo") {
        // solo A, solo A y B, solo A ∩ B: exactamente esos conjuntos
        var bits = 0;
        for (;;) {
          var q = toks[p];
          if (!q || q.conj === undefined) throw "Después de «solo» van uno o más conjuntos: solo A, solo A y B";
          bits |= 1 << q.conj; p++;
          var sig = ver();
          if ((sig === "y" || sig === "∩" || sig === ",") && toks[p + 1] && toks[p + 1].conj !== undefined) p++;
          else break;
        }
        return 1 << bits;
      }
      throw "No se entiende «" + (t.w || t.s) + "»";
    }
    var r = exprU();
    if (p < toks.length) throw "Sobra «" + (toks[p].w || toks[p].s) + "»";
    return r;
  }

  // Lee un dato: «izquierda = número» o «izquierda = variable».
  function leerDatoVenn(texto, nombres) {
    var t = String(texto || "").trim();
    if (!t) return { vacio: true };
    var partes = t.split("=");
    if (partes.length !== 2) return { error: partes.length < 2 ? "Falta «= número» (por ejemplo |A| = 23 o solo A = x)" : "Hay más de un «=»" };
    var izq = partes[0].trim(), der = partes[1].trim();
    var mm = /^\|(.*)\|$/.exec(izq) || /^(?:n|#|card)\s*\((.*)\)$/i.exec(izq);
    if (mm) izq = mm[1].trim();
    if (!izq) return { error: "Falta la zona o el conjunto antes del =" };
    var zonas;
    try { zonas = leerExprVenn(izq, nombres); } catch (e) { return { error: String(e) }; }
    var r = { zonas: zonas, texto: t };
    if (der === "?" || der === "") { r.pregunta = true; return r; }
    var v = evaluar(der);
    if (isFinite(v)) {
      if (v < 0) return { error: "Un cardinal no puede ser negativo" };
      r.valor = v;
      return r;
    }
    if (/^[A-Za-zñ][A-Za-zñ0-9₀-₉']*$/.test(der) && nombres.indexOf(der) < 0 && der !== "U") {
      if (contarBits(zonas) !== 1) return { error: "Una variable nombra una sola zona (por ejemplo solo A = x o A ∩ B − C = y)" };
      r.variable = der;
      return r;
    }
    return { error: "Después del = va un número o el nombre de una variable (x, y...)" };
  }

  // describe una zona con palabras: «solo A», «A y B, pero no C», «ninguno»
  function describirZonaVenn(z, nombres) {
    var n = nombres.length, den = [], fue = [];
    nombres.forEach(function (nm, i) { (z & (1 << i) ? den : fue).push(nm); });
    function lista(l, y) { return l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " " + y + " " + l[l.length - 1]; }
    if (!den.length) return "ninguno";
    if (den.length === 1) return "solo " + den[0];
    if (!fue.length) return n === 2 ? "los dos" : n === 3 ? "los tres" : "los cuatro";
    return lista(den, "y") + ", pero no " + lista(fue, "ni");
  }

  // Resuelve los datos. Devuelve { n, nombres, valor[z], variable[z], blanco[z],
  // pasos, ecuaciones, avisosFila[i], avisos, error }
  function resolverVenn(op) {
    var N = leerNombresVenn(op);
    if (N.error) return { error: N.error, avisosFila: {}, avisos: [N.error] };
    var nombres = N.nombres, n = nombres.length, Z = 1 << n;
    var filas = filasVenn(op), datos = [], avisosFila = {}, avisos = [];
    function avisar(i, msj) { (avisosFila[i] = avisosFila[i] || []).push(msj); }
    var valor = [], variable = [], usada = {}, fuente = [];
    filas.forEach(function (f, i) {
      var d = leerDatoVenn(f.texto, nombres);
      if (d.vacio) return;
      if (d.error) { avisar(i, d.error); return; }
      d.fila = i;
      d.lista = [];
      for (var z = 0; z < Z; z++) if (d.zonas & (1 << z)) d.lista.push(z);
      if (d.variable !== undefined) {
        var z1 = d.lista[0];
        if (usada[d.variable] !== undefined && usada[d.variable] !== z1) { avisar(i, "La variable " + d.variable + " ya nombra otra zona"); return; }
        if (variable[z1] !== undefined && variable[z1] !== d.variable) { avisar(i, "Esa zona ya se llama " + variable[z1]); return; }
        variable[z1] = d.variable; usada[d.variable] = z1;
        return;
      }
      if (d.valor !== undefined) {
        if (!d.lista.length) { if (d.valor !== 0) avisar(i, "Esa expresión es vacía: su cardinal es 0"); return; }
        datos.push(d);
      }
    });
    // datos de una sola zona: se conocen directamente
    datos.forEach(function (d) {
      if (d.lista.length === 1 && valor[d.lista[0]] === undefined) { valor[d.lista[0]] = d.valor; fuente[d.lista[0]] = "dato"; d.usado = true; }
    });
    var enEcuacion = [];
    datos.forEach(function (d) { d.lista.forEach(function (z) { enEcuacion[z] = true; }); });
    // incognitas: las zonas sin dato directo. La zona de afuera (ninguno) solo si aparece en algun dato
    var incognitas = [];
    var orden = [];
    for (var z = 1; z < Z; z++) orden.push(z);
    orden.sort(function (a, b) { return contarBits(a) - contarBits(b) || a - b; });
    orden.push(0);
    var blanco = [];
    orden.forEach(function (z) {
      if (valor[z] !== undefined) return;
      if (z === 0 && !enEcuacion[0] && variable[0] === undefined) { blanco[0] = true; return; }
      incognitas.push(z);
    });
    // nombres automaticos para las incognitas sin nombre
    var libres = String(op.variables || "x, y, z, w, v, t").split(/[,;\s]+/).filter(function (v) {
      return v && usada[v] === undefined && nombres.indexOf(v) < 0;
    });
    var extra = 1;
    incognitas.forEach(function (z) {
      if (variable[z] !== undefined) return;
      var v = libres.shift();
      while (!v || usada[v] !== undefined) { v = "x" + String(extra++).replace(/\d/g, function (d) { return "₀₁₂₃₄₅₆₇₈₉"[d]; }); if (usada[v] === undefined) break; }
      variable[z] = v; usada[v] = z;
    });
    // ecuaciones del planteo (las que tienen mas de una zona)
    var ecuaciones = datos.filter(function (d) { return d.lista.length > 1; });
    // sustitucion: ecuaciones con una sola incognita, en el orden de las filas
    var pasos = [];
    function sustituir() {
      var hubo = true;
      while (hubo) {
        hubo = false;
        for (var k = 0; k < datos.length; k++) {
          var d = datos[k];
          var faltan = d.lista.filter(function (z) { return valor[z] === undefined; });
          if (faltan.length !== 1) continue;
          var otros = d.lista.filter(function (z) { return z !== faltan[0]; });
          var res = d.valor - otros.reduce(function (s, z) { return s + valor[z]; }, 0);
          valor[faltan[0]] = res; fuente[faltan[0]] = "paso";
          pasos.push({ zona: faltan[0], dato: d, otros: otros.map(function (z) { return valor[z]; }), valor: res });
          d.usado = true;
          hubo = true;
        }
      }
    }
    // eliminacion de Gauss con lo que queda: incognitas que quedan determinadas
    function eliminar() {
      var pend = datos.filter(function (d) { return d.lista.some(function (z) { return valor[z] === undefined; }); });
      if (!pend.length) return false;
      var cols = [];
      pend.forEach(function (d) { d.lista.forEach(function (z) { if (valor[z] === undefined && cols.indexOf(z) < 0) cols.push(z); }); });
      var M = pend.map(function (d) {
        var fila = cols.map(function (z) { return d.lista.indexOf(z) >= 0 ? 1 : 0; });
        fila.push(d.valor - d.lista.reduce(function (s, z) { return s + (valor[z] === undefined ? 0 : valor[z]); }, 0));
        return fila;
      });
      var r = 0, piv = [];
      for (var c = 0; c < cols.length && r < M.length; c++) {
        var best = r;
        for (var i = r; i < M.length; i++) if (Math.abs(M[i][c]) > Math.abs(M[best][c])) best = i;
        if (Math.abs(M[best][c]) < 1e-9) continue;
        var tmp = M[r]; M[r] = M[best]; M[best] = tmp;
        var pv = M[r][c];
        M[r] = M[r].map(function (x) { return x / pv; });
        for (i = 0; i < M.length; i++) {
          if (i === r || Math.abs(M[i][c]) < 1e-12) continue;
          var f = M[i][c];
          M[i] = M[i].map(function (x, j) { return x - f * M[r][j]; });
        }
        piv.push(c); r++;
      }
      // fila 0 = c (c ≠ 0): el sistema no tiene solucion
      for (i = r; i < M.length; i++) {
        if (Math.abs(M[i][cols.length]) > 1e-9 && !incompatible) {
          incompatible = true;
          avisos.push("Los datos no son consistentes entre sí (el sistema de ecuaciones no tiene solución)");
        }
      }
      var nuevo = false;
      for (i = 0; i < r; i++) {
        var c0 = piv[i];
        var sola = M[i].slice(0, cols.length).every(function (x, j) { return j === c0 || Math.abs(x) < 1e-9; });
        if (sola) {
          var v = Math.round(M[i][cols.length] * 1e9) / 1e9;
          valor[cols[c0]] = v; fuente[cols[c0]] = "paso";
          pasos.push({ zona: cols[c0], sistema: true, valor: v });
          nuevo = true;
        }
      }
      return nuevo;
    }
    var incompatible = false;
    sustituir();
    while (eliminar()) sustituir();
    // verificacion: los datos que no se usaron tienen que cerrar
    var inconsistente = false;
    datos.forEach(function (d) {
      var s = d.lista.reduce(function (a, z) { return a + (valor[z] === undefined ? 0 : valor[z]); }, 0);
      if (d.lista.some(function (z) { return valor[z] === undefined; })) {
        // las zonas que faltan tendrian que sumar un numero negativo
        if (s - d.valor > 1e-9) {
          inconsistente = true;
          avisar(d.fila, "No cierra: las zonas que ya se conocen suman " + formatear(s) + ", más que " + formatear(d.valor));
        }
        return;
      }
      if (Math.abs(s - d.valor) > 1e-9) {
        inconsistente = true;
        avisar(d.fila, "No cierra con los otros datos: sus zonas suman " + formatear(s) + ", no " + formatear(d.valor));
      }
    });
    pasos.forEach(function (p) {
      if (p.valor < -1e-9) avisar(p.dato ? p.dato.fila : filas.length - 1, "La zona «" + describirZonaVenn(p.zona, nombres) + "» da " + formatear(p.valor) + " (negativo): los datos no son consistentes");
      else if (Math.abs(p.valor - Math.round(p.valor)) > 1e-9) avisar(p.dato ? p.dato.fila : filas.length - 1, "La zona «" + describirZonaVenn(p.zona, nombres) + "» da " + formatear(p.valor) + " (no es entero)");
    });
    var faltan = incognitas.filter(function (z) { return valor[z] === undefined; });
    if (faltan.length) {
      avisos.push("Faltan datos: no se pueden calcular " + faltan.map(function (z) { return variable[z]; }).join(", ") +
        " (" + faltan.map(function (z) { return describirZonaVenn(z, nombres); }).join("; ") + "); quedan como incógnitas");
    }
    // cardinales de cada conjunto y del universo (si se conocen todas sus zonas)
    function suma(test) {
      var s = 0;
      for (var z = 0; z < Z; z++) if (test(z)) { if (valor[z] === undefined) return undefined; s += valor[z]; }
      return s;
    }
    var totales = nombres.map(function (nm, i) { return suma(function (z) { return z & (1 << i); }); });
    var totalU = suma(function () { return true; });
    // cardinales dados como dato (para escribirlos en el planteo)
    var dadosConj = [], dadoU;
    datos.forEach(function (d) {
      nombres.forEach(function (nm, i) {
        var bits = 0;
        for (var z = 0; z < Z; z++) if (z & (1 << i)) bits |= 1 << z;
        if (d.zonas === bits) dadosConj[i] = d.valor;
      });
      if (d.zonas === (1 << Z) - 1) dadoU = d.valor;
    });
    return {
      n: n, Z: Z, nombres: nombres, valor: valor, fuente: fuente, variable: variable, blanco: blanco,
      incognitas: incognitas, pasos: pasos, ecuaciones: ecuaciones, datos: datos, orden: orden,
      avisosFila: avisosFila, avisos: avisos, inconsistente: inconsistente, faltan: faltan,
      totales: totales, totalU: totalU, dadosConj: dadosConj, dadoU: dadoU, filas: filas,
    };
  }

  function erroresVenn(t, op, i) {
    var R = resolverVenn(op), l = filasVenn(op);
    if (R.error) return [];
    var e = (R.avisosFila[i] || []).slice();
    // los avisos generales van en la ultima fila con texto
    var ultima = -1;
    l.forEach(function (f, k) { if (String(f.texto || "").trim()) ultima = k; });
    if (i === ultima) e = e.concat(R.avisos);
    return e;
  }

  // ---- geometria: elipses en coordenadas locales (centro del diagrama en 0, 0)
  function elipsesVenn(n, R) {
    var g = Math.PI / 180;
    if (n === 2) return [{ cx: -0.55 * R, cy: 0, a: R, b: R, ang: 0 }, { cx: 0.55 * R, cy: 0, a: R, b: R, ang: 0 }];
    if (n === 3) {
      var rho = 0.62 * R;
      return [210, 330, 90].map(function (t) { return { cx: rho * Math.cos(t * g), cy: rho * Math.sin(t * g), a: R, b: R, ang: 0 }; });
    }
    // 4 conjuntos: cuatro elipses giradas (todas las zonas existen)
    var k = 3.3 * R;
    return [[-0.147, 0.1, 40], [-0.047, 0, 40], [0.047, 0, 140], [0.147, 0.1, 140]].map(function (q) {
      return { cx: q[0] * k, cy: q[1] * k, a: 0.36 * k, b: 0.225 * k, ang: q[2] * g };
    });
  }
  // F < 0 adentro; distancia aproximada al borde |F| / |∇F|
  function evalElipse(e, x, y) {
    var dx = x - e.cx, dy = y - e.cy, c = Math.cos(e.ang), s = Math.sin(e.ang);
    var u = dx * c + dy * s, v = -dx * s + dy * c;
    var F = (u * u) / (e.a * e.a) + (v * v) / (e.b * e.b) - 1;
    var gu = 2 * u / (e.a * e.a), gv = 2 * v / (e.b * e.b);
    var gn = Math.sqrt(gu * gu + gv * gv) || 1e-9;
    return { F: F, d: Math.abs(F) / gn };
  }

  function generarVenn(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal;
    var tam = TAMANOS[op.tamTexto] || 20, tamN = tamTitulo(tam), lh = tam * fuente.lh;
    var R0 = resolverVenn(op);
    if (R0.error) return;
    var nombres = R0.nombres, n = R0.n, Z = R0.Z;
    var R = RADIOS_VENN[op.tamano] || 115;
    if (n === 4) R *= 1.1;
    var els = elipsesVenn(n, R);
    var resuelto = op.mostrar !== "planteo";
    var colorDe = function (i) { return op.colores ? COLORES[i % COLORES.length] : TINTA; };
    var tmp = [];
    function ag(e) { tmp.push(e); return e; }

    // textos de las zonas
    function textoZona(z) {
      if (R0.blanco[z]) return "";
      var v = R0.valor[z], nom = R0.variable[z];
      if (R0.fuente[z] === "dato" || nom === undefined) return v === undefined ? "" : formatear(v);
      if (!resuelto || v === undefined) return nom;
      return op.variableYValor ? nom + " = " + formatear(v) : formatear(v);
    }
    // cardinal de cada conjunto junto a su nombre
    function cardConj(i) {
      if (op.cardinales === "datos") return R0.dadosConj[i];
      if (op.cardinales === "todos") return R0.dadosConj[i] !== undefined ? R0.dadosConj[i] : resuelto ? R0.totales[i] : undefined;
      return undefined;
    }
    var etiquetas = nombres.map(function (nm, i) {
      var c = cardConj(i);
      return c === undefined ? nm : "|" + nm + "| = " + formatear(c);
    });

    // posicion del nombre de cada conjunto: el punto del borde que no esta dentro
    // de los otros y queda mas lejos del centro del diagrama
    var cajasNombres = [];
    els.forEach(function (e, i) {
      var w = medir(etiquetas[i], tamN, fuente), h = tamN * fuente.lh;
      var mejor = null;
      for (var t = 0; t < 360; t += 2) {
        var th = t * Math.PI / 180, c = Math.cos(e.ang), s = Math.sin(e.ang);
        var u = e.a * Math.cos(th), v = e.b * Math.sin(th);
        var x = e.cx + u * c - v * s, y = e.cy + u * s + v * c;
        var afuera = els.every(function (o, j) { return j === i || evalElipse(o, x, y).F > 0.25; });
        if (!afuera) continue;
        // normal hacia afuera
        var nu = Math.cos(th) / e.a, nv = Math.sin(th) / e.b;
        var nx = nu * c - nv * s, ny = nu * s + nv * c, nn = Math.sqrt(nx * nx + ny * ny);
        nx /= nn; ny /= nn;
        var dist = Math.sqrt(x * x + y * y) + (n === 2 ? -Math.abs(y) * 0.5 : 0);
        if (!mejor || dist > mejor.dist) mejor = { x: x, y: y, nx: nx, ny: ny, dist: dist };
      }
      var sep = 8 + 0.5 * Math.abs(w * mejor.nx) + 0.5 * Math.abs(h * mejor.ny);
      var cx = mejor.x + mejor.nx * sep, cy = mejor.y + mejor.ny * sep;
      cajasNombres.push({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, w: w, h: h, cx: cx, cy: cy });
    });

    // universo: caja de las elipses y los nombres, con margen
    var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    els.forEach(function (e) {
      var c = Math.cos(e.ang), s = Math.sin(e.ang);
      var hx = Math.sqrt(e.a * e.a * c * c + e.b * e.b * s * s), hy = Math.sqrt(e.a * e.a * s * s + e.b * e.b * c * c);
      bx0 = Math.min(bx0, e.cx - hx); bx1 = Math.max(bx1, e.cx + hx);
      by0 = Math.min(by0, e.cy - hy); by1 = Math.max(by1, e.cy + hy);
    });
    cajasNombres.forEach(function (b) {
      bx0 = Math.min(bx0, b.x0); bx1 = Math.max(bx1, b.x1); by0 = Math.min(by0, b.y0); by1 = Math.max(by1, b.y1);
    });
    var margen = Math.max(0.3 * R, tamN * 1.6);
    var U = { x0: bx0 - margen, y0: by0 - margen, x1: bx1 + margen, y1: by1 + margen };
    var etiquetaU = "U";
    var cardU = op.cardinales === "no" ? undefined : R0.dadoU !== undefined ? R0.dadoU :
      op.cardinales === "todos" && resuelto ? R0.totalU : undefined;
    if (cardU !== undefined) etiquetaU = "U    |U| = " + formatear(cardU);
    var wU = medir(etiquetaU, tamN, fuente);
    var cajaU = { x0: U.x0 + 10, y0: U.y0 + 6, x1: U.x0 + 10 + wU, y1: U.y0 + 6 + tamN * fuente.lh };

    // 1. universo y su nombre
    ag(base("rectangle", { x: U.x0, y: U.y0, width: U.x1 - U.x0, height: U.y1 - U.y0, strokeWidth: 2 }));
    ag(texto(cajaU.x0, cajaU.y0, etiquetaU, tamN, fuente, TINTA, "left"));
    // 2. conjuntos (contornos distintos para imprimir en blanco y negro) y sus nombres
    els.forEach(function (e, i) {
      var tr = op.trazos === "iguales" ? TRAZOS_VENN[0] : TRAZOS_VENN[i];
      ag(base("ellipse", {
        x: e.cx - e.a, y: e.cy - e.b, width: 2 * e.a, height: 2 * e.b, angle: e.ang,
        strokeColor: colorDe(i), strokeStyle: tr.estilo, strokeWidth: tr.grosor,
      }));
      var b = cajasNombres[i];
      ag(texto(b.cx, b.y0, etiquetas[i], tamN, fuente, colorDe(i), "center"));
    });
    // 3. zonas: el punto mas alejado de los bordes (muestreo en una grilla)
    var paso = Math.max(3, R / 30), mejor = [];
    var obst = cajasNombres.concat([cajaU]);
    for (var y = U.y0 + paso / 2; y < U.y1; y += paso) {
      for (var x = U.x0 + paso / 2; x < U.x1; x += paso) {
        var z = 0, d = Infinity;
        els.forEach(function (e, i) {
          var r = evalElipse(e, x, y);
          if (r.F < 0) z |= 1 << i;
          d = Math.min(d, r.d);
        });
        if (z === 0) {
          d = Math.min(d, x - U.x0, U.x1 - x, y - U.y0, U.y1 - y);
          obst.forEach(function (b) {
            var ddx = Math.max(b.x0 - x, 0, x - b.x1), ddy = Math.max(b.y0 - y, 0, y - b.y1);
            d = Math.min(d, Math.sqrt(ddx * ddx + ddy * ddy));
          });
        }
        if (!mejor[z] || d > mejor[z].d) mejor[z] = { x: x, y: y, d: d };
      }
    }
    for (var zz = 0; zz < Z; zz++) {
      var s = textoZona(zz);
      if (!s || !mejor[zz]) continue;
      ag(texto(mejor[zz].x, mejor[zz].y - lh / 2, s, tam, fuente, TINTA, "center"));
    }

    // 4. textos: datos, que es cada variable, ecuaciones y pasos
    var lineas = [];
    function titulo(t) { lineas.push({ t: t, titulo: true }); }
    function zonasEn(d, conVal) {
      return d.lista.map(function (z) {
        var v = R0.valor[z], nom = R0.variable[z];
        if (R0.fuente[z] === "dato" || (conVal && v !== undefined) || nom === undefined) return v === undefined ? "?" : formatear(v);
        return nom;
      });
    }
    if (op.datos) {
      var conTexto = R0.filas.filter(function (f, i) {
        return String(f.texto || "").trim() && !(R0.avisosFila[i] && R0.avisosFila[i].length && !leerDatoVenn(f.texto, nombres).zonas);
      });
      if (conTexto.length) {
        titulo("Datos:");
        conTexto.forEach(function (f) { lineas.push({ t: String(f.texto).trim().replace(/\s*=\s*/, " = ") }); });
      }
    }
    var conNombre = R0.incognitas.filter(function (z) { return R0.variable[z] !== undefined; });
    if (op.referencias && conNombre.length) {
      titulo("Incógnitas:");
      conNombre.forEach(function (z) { lineas.push({ t: R0.variable[z] + ": " + describirZonaVenn(z, nombres) }); });
    }
    if (op.ecuaciones && R0.ecuaciones.length) {
      titulo("Ecuaciones:");
      R0.ecuaciones.forEach(function (d) {
        // en el planteo, solo con los datos directos (sin lo calculado)
        lineas.push({ t: zonasEn(d, false).join(" + ") + " = " + formatear(d.valor) });
      });
    }
    // la resolucion va siempre debajo del diagrama (sus renglones son largos)
    var costado = lineas;
    lineas = [];
    if (resuelto && op.pasos && R0.pasos.length) {
      titulo("Resolución:");
      R0.pasos.forEach(function (p) {
        var nom = R0.variable[p.zona] || describirZonaVenn(p.zona, nombres);
        if (p.sistema) { lineas.push({ t: nom + " = " + formatear(p.valor) + "   (resolviendo el sistema)" }); return; }
        var cuenta = formatear(p.dato.valor);
        p.otros.forEach(function (v) { cuenta += v < 0 ? " + " + formatear(-v) : " − " + formatear(v); });
        var ref = p.dato.texto.replace(/\s*=\s*/, " = ");
        lineas.push({ t: ref + "   ⇒   " + nom + " = " + (p.otros.length ? cuenta + " = " : "") + formatear(p.valor) });
      });
    }
    function escribir(lista, tx, ty) {
      lista.forEach(function (l, k) {
        if (l.titulo && k > 0) ty += lh * 0.4;
        ag(texto(tx, ty, l.t, tam, fuente, l.titulo ? GUIA : TINTA, "left"));
        ty += lh + 4;
      });
      return ty;
    }
    var abajo = U.y1 + 20;
    if (op.textos === "debajo") lineas = costado.concat(lineas);
    else if (costado.length) abajo = Math.max(abajo, escribir(costado, U.x1 + 32, U.y0) + 16);
    escribir(lineas, U.x0, abajo);
    var b0 = cajaDe(tmp);
    tmp.forEach(function (e) { e.x += ox - b0.x0; e.y += oy - b0.y0; agregar(e); });
  }

  function avisosVenn(op) {
    var R = resolverVenn(op);
    if (R.error) return [R.error];
    var l = [];
    R.filas.forEach(function (f, i) {
      (R.avisosFila[i] || []).forEach(function (a) { l.push("dato «" + String(f.texto).trim() + "»: " + a); });
    });
    return l.concat(R.avisos);
  }

  // ============================================= INDUCCION MATEMATICA
  // Cada fila es una sucesion: su termino general a(n) y, en «Suma», la formula
  // S(n) de la suma de los n primeros terminos. Se escribe:
  //  - la igualdad a demostrar: a(1) + a(2) + a(3) + … + a(n) = S(n);
  //  - paso 1: n = 1 (se reemplaza y se hacen las cuentas de a una, con la marca);
  //  - paso 2: la hipotesis de induccion (n = k), en un recuadro;
  //  - paso 3: n = k + 1, con llaves sobre los k primeros terminos y el termino
  //    k + 1, y la flecha «Aplicar hipótesis de inducción» al renglon donde los k
  //    primeros terminos se reemplazan por S(k). (No termina la demostracion.)
  // Las expresiones se leen como arboles: num (racional), var (n, k), + − · / ^,
  // neg y ! (factorial). Las potencias se dibujan con el exponente chico y subido.
  var COLOR_HI = "#e8590c";
  var SUP_IND = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "ⁿ": "n", "⁺": "+", "⁻": "-", "⁽": "(", "⁾": ")", "ᵏ": "k" };
  function errInd(m) { throw { msjInd: m }; }
  function numInd(v, color) { return { k: "num", v: v, color: color }; }
  function varInd(nom, color) { return { k: "var", nom: nom, color: color }; }
  function opInd(k, a, b) { return { k: k, a: a, b: b }; }
  function tieneVarInd(n) { return n.k === "var" || (!!n.a && tieneVarInd(n.a)) || (!!n.b && tieneVarInd(n.b)); }

  function leerInd(txt, quien) {
    var t = String(txt || "").trim();
    // «a(n) =», «an =», «S(n) =», «Sn =» adelante
    t = t.replace(/^[A-Za-z]+\s*(?:_?\s*n|\(\s*n\s*\))?\s*=/, "").trim();
    if (!t) return { error: "Escribí " + quien };
    if (/[=<>≤≥≠]/.test(t)) return { error: "Escribí solo " + quien + ", sin «=»" };
    t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻⁽⁾ᵏ]+/g, function (s) {
      return "^(" + s.split("").map(function (c) { return SUP_IND[c]; }).join("") + ")";
    });
    t = t.replace(/[−–—]/g, "-").replace(/[·×∙⋅]/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^")
      .replace(/[\[{]/g, "(").replace(/[\]}]/g, ")");
    var toks = [], m, re = /\s*(?:(\d+[.,]\d+)|(\d+)|([A-Za-zα-ωΑ-Ω]+)|([-+*/^()!]))/y, pos = 0;
    t = t.trim();
    while (pos < t.length) {
      re.lastIndex = pos;
      m = re.exec(t);
      if (!m) return { error: "No entiendo «" + t.slice(pos).trim().charAt(0) + "»" };
      pos = re.lastIndex;
      if (m[1]) return { error: "Usá fracciones en vez de decimales (por ejemplo 1/2)" };
      if (m[2]) toks.push({ k: "num", v: +m[2] });
      else if (m[3]) {
        if (m[3] !== "n") return { error: "La variable tiene que ser n (hay «" + m[3] + "»)" };
        toks.push({ k: "var" });
      } else toks.push({ k: m[4] });
      while (pos < t.length && /\s/.test(t[pos])) pos++;
    }
    var i = 0;
    function ver() { return toks[i]; }
    function es(k) { return toks[i] && toks[i].k === k; }
    function expr() {
      var a = termino();
      while (es("+") || es("-")) { var o = toks[i++].k; a = opInd(o, a, termino()); }
      return a;
    }
    // la division y el producto implicito van a la par, de izquierda a derecha:
    // 1/4(5^n − 1) = (1/4)·(5^n − 1) y n(n + 1)/2 = (n(n + 1))/2
    function termino() {
      var a = unario();
      for (;;) {
        if (es("*") || es("/")) { var o = toks[i++].k; a = opInd(o, a, unario()); }
        else if (es("num") || es("var") || es("(")) a = opInd("*", a, unario());
        else return a;
      }
    }
    function unario() {
      if (es("-")) {
        i++;
        var a = unario();
        return a.k === "num" ? numInd(frNeg(a.v)) : { k: "neg", a: a };
      }
      if (es("+")) { i++; return unario(); }
      return potencia();
    }
    function potencia() {
      var a = atomo();
      while (es("!")) { i++; a = { k: "!", a: a }; }
      if (es("^")) { i++; a = opInd("^", a, unario()); }
      return a;
    }
    function atomo() {
      var x = ver();
      if (!x) errInd("Falta algo al final");
      i++;
      if (x.k === "num") return numInd(fr(x.v));
      if (x.k === "var") return varInd("n");
      if (x.k === "(") {
        var a = expr();
        if (!es(")")) errInd("Falta cerrar un paréntesis");
        i++;
        return a;
      }
      errInd(x.k === ")" ? "Sobra un paréntesis «)»" : "Falta algo antes de «" + x.k + "»");
    }
    try {
      var arbol = expr();
      if (i < toks.length) errInd(es(")") ? "Sobra un paréntesis «)»" : "No entiendo «" + toks[i].k + "»");
      return { arbol: arbol };
    } catch (e) {
      if (e && e.msjInd) return { error: e.msjInd };
      throw e;
    }
  }

  // reemplaza la variable por `por` (un arbol); marca las potencias cuyo
  // exponente tenia la variable (en los primeros terminos quedan sin calcular)
  function sustInd(n, por) {
    if (n.k === "var") { var c = copiar(por); c.sust = true; return c; }
    var r = {};
    for (var q in n) r[q] = n[q];
    if (n.k === "^" && tieneVarInd(n.b)) r.expVar = true;
    if (n.a) r.a = sustInd(n.a, por);
    if (n.b) r.b = sustInd(n.b, por);
    return r;
  }

  function chkInd(f) {
    if (!isFinite(f.n) || !isFinite(f.d) || Math.abs(f.n) > 9e15 || f.d > 9e15) errInd("Los números son demasiado grandes");
    return f;
  }
  // valor de un arbol sin variables (o con la variable valiendo x)
  function valInd(n, x) {
    switch (n.k) {
      case "num": return n.v;
      case "var": return x;
      case "neg": return frNeg(valInd(n.a, x));
      case "+": return chkInd(frSuma(valInd(n.a, x), valInd(n.b, x)));
      case "-": return chkInd(frRes(valInd(n.a, x), valInd(n.b, x)));
      case "*": return chkInd(frMul(valInd(n.a, x), valInd(n.b, x)));
      case "/":
        var d = valInd(n.b, x);
        if (frCero(d)) errInd("Hay una división por cero");
        return chkInd(frDiv(valInd(n.a, x), d));
      case "^":
        var b = valInd(n.a, x), e = valInd(n.b, x), r = fr(1);
        if (e.d !== 1) errInd("Los exponentes tienen que ser enteros");
        if (Math.abs(e.n) > 400) errInd("Los números son demasiado grandes");
        for (var j = 0; j < Math.abs(e.n); j++) r = chkInd(frMul(r, b));
        if (e.n < 0) { if (frCero(r)) errInd("Hay una división por cero"); r = frDiv(fr(1), r); }
        return r;
      case "!":
        var f = valInd(n.a, x), p = fr(1);
        if (f.d !== 1 || f.n < 0) errInd("El factorial es solo de naturales");
        if (f.n > 20) errInd("Los números son demasiado grandes");
        for (var q = 2; q <= f.n; q++) p = frMul(p, fr(q));
        return p;
    }
  }

  // ------------------------------------------------ escribir (como items)
  function precInd(n) {
    if (n.k === "num") return n.v.n < 0 ? 1.5 : n.v.d !== 1 ? 3 : 9;
    return { "var": 9, "+": 1, "-": 1, neg: 1.5, "*": 2, "/": 3, "^": 4, "!": 5 }[n.k];
  }
  function primerTexto(its) {
    var x = its[0];
    return !x ? "" : x.frac ? "1" : x.t !== undefined ? x.t.replace(/^\s+/, "") : "";
  }
  function ultimoTexto(its) {
    var x = its[its.length - 1];
    return !x ? "" : x.t !== undefined ? x.t.replace(/\s+$/, "") : "";
  }
  // libre: el lugar no necesita parentesis (exponente, numerador, denominador)
  function escribirInd(n, libre) {
    var its = escribirNodoInd(n);
    // lo que se reemplazo (k + 1) va entre parentesis dentro de una operacion
    if (n.sust && !libre && precInd(n) < 9) its = [TF("(")].concat(its, [TF(")")]);
    if (n.color) its.forEach(function (it) { if (!it.color) it.color = n.color; });
    return its;
  }
  function entreParInd(n, poner) {
    var its = escribirInd(n);
    return poner && !(n.sust && precInd(n) < 9) ? [TF("(")].concat(its, [TF(")")]) : its;
  }
  // en los exponentes, sin espacios alrededor de + y − (5ⁿ⁻¹, no 5ⁿ ⁻ ¹)
  function apretarInd(its) {
    return its.map(function (it) {
      if (it.t !== undefined) return TF(it.t.replace(/ ([+−]) /g, "$1"), it.color);
      if (it.frac) return { frac: [apretarInd(it.frac[0]), apretarInd(it.frac[1])], color: it.color };
      if (it.sup) return { sup: apretarInd(it.sup), color: it.color };
      return it;
    });
  }
  function escribirNodoInd(n) {
    switch (n.k) {
      case "num":
        var a = Math.abs(n.v.n);
        if (n.v.d === 1) return [TF((n.v.n < 0 ? "−" : "") + a)];
        return (n.v.n < 0 ? [TF("−")] : []).concat([FrF(String(a), String(n.v.d))]);
      case "var": return [TF(n.nom)];
      case "+":
        var der = escribirInd(n.b), negB = precInd(n.b) === 1.5;
        return escribirInd(n.a).concat([TF(" + ")], negB ? [TF("(")].concat(der, [TF(")")]) : der);
      case "-":
        return escribirInd(n.a).concat([TF(" − ")], entreParInd(n.b, precInd(n.b) <= 1.5));
      case "neg": return [TF("−")].concat(entreParInd(n.a, precInd(n.a) < 2));
      case "*":
        var I = entreParInd(n.a, precInd(n.a) < 1.5), D = entreParInd(n.b, precInd(n.b) < 2);
        var pD = primerTexto(D), uI = ultimoTexto(I);
        var punto = /^[0-9−]/.test(pD) || (/[A-Za-z]$/.test(uI) && /^[A-Za-z]/.test(pD));
        return I.concat(punto ? [TF("·")] : [], D);
      case "/": return [FrF(escribirInd(n.a, true), escribirInd(n.b, true))];
      case "^": return entreParInd(n.a, precInd(n.a) < 9).concat([SupF(apretarInd(escribirInd(n.b, true)))]);
      case "!": return entreParInd(n.a, precInd(n.a) < 9).concat([TF("!")]);
    }
  }

  // primeros terminos: los numeros se calculan; las potencias cuyo exponente
  // dependia de n quedan como potencia (1 + 5 + 5² + …) si `potencias`
  function terminoInd(n, potencias) {
    if (n.k === "num") return n;
    var r = {};
    for (var q in n) r[q] = n[q];
    if (n.a) r.a = terminoInd(n.a, potencias);
    if (n.b) r.b = terminoInd(n.b, potencias);
    delete r.color;
    var hijosNum = (!r.a || r.a.k === "num") && (!r.b || r.b.k === "num");
    if (potencias && r.k === "^" && r.expVar && hijosNum && r.a.v.d === 1 && Math.abs(r.a.v.n) >= 2 &&
        r.b.v.d === 1 && r.b.v.n >= 2) {
      r.a = numInd(r.a.v); r.b = numInd(r.b.v);
      return r;
    }
    return hijosNum ? numInd(valInd(r)) : r;
  }

  // ------------------------------------------- cuentas de a una (paso 1)
  // un valor es un numero o una fraccion de enteros ya irreducible
  function esValorInd(n) {
    if (n.k === "num") return true;
    if (n.k !== "/" || n.a.k !== "num" || n.b.k !== "num") return false;
    var a = n.a.v, b = n.b.v;
    return a.d === 1 && b.d === 1 && b.n > 1 && mcdAbs(a.n, b.n) === 1;
  }
  var PRIO_IND = { "^": 3, "!": 3, neg: 2, "*": 2, "/": 2, "+": 1, "-": 1 };
  // prioridad mas alta entre las operaciones listas (sus operandos son valores)
  function prioListaInd(n) {
    if (esValorInd(n)) return 0;
    var p = Math.max(n.a ? prioListaInd(n.a) : 0, n.b ? prioListaInd(n.b) : 0);
    if ((!n.a || esValorInd(n.a)) && (!n.b || esValorInd(n.b))) p = Math.max(p, PRIO_IND[n.k]);
    return p;
  }
  // resuelve las operaciones listas de prioridad p (el resultado, en color)
  function reducirInd(n, p, hechas) {
    if (esValorInd(n)) { var c = copiar(n); delete c.color; return c; }
    if ((!n.a || esValorInd(n.a)) && (!n.b || esValorInd(n.b)) && PRIO_IND[n.k] === p) {
      hechas.push(n.k);
      return numInd(valInd(n), p === 1 ? COLOR_SUMA : COLOR_PRODUCTO);
    }
    var r = { k: n.k };
    if (n.a) r.a = reducirInd(n.a, p, hechas);
    if (n.b) r.b = reducirInd(n.b, p, hechas);
    return r;
  }
  var NOMBRE_OP_IND = { "^": ["la potencia", "las potencias"], "!": ["el factorial", "los factoriales"],
    "*": ["la multiplicación", "las multiplicaciones"], "/": ["la división", "las divisiones"],
    "+": ["la suma", "las sumas"], "-": ["la resta", "las restas"], neg: ["el signo", "los signos"] };
  function notaCuentaInd(hechas) {
    var tipos = hechas.filter(function (k, j) { return hechas.indexOf(k) === j; });
    if (tipos.length > 1) {
      var suma = tipos.every(function (k) { return k === "+" || k === "-"; });
      return suma ? "Resolver las sumas y restas" : "Resolver las operaciones";
    }
    return "Resolver " + NOMBRE_OP_IND[tipos[0]][hechas.length > 1 ? 1 : 0];
  }

  // ------------------------------------ simplificar lo lineal en k (paso 3)
  // polinomio en k (coeficientes por grado) o null si no lo es
  function poliInd(n) {
    var mul = function (p, q) {
      if (p.length + q.length > 8) return null;
      var r = [];
      for (var x = 0; x < p.length + q.length - 1; x++) r.push(fr(0));
      p.forEach(function (a, i) { q.forEach(function (b, j) { r[i + j] = frSuma(r[i + j], frMul(a, b)); }); });
      return r;
    };
    var suma = function (p, q, s) {
      var r = [];
      for (var x = 0; x < Math.max(p.length, q.length); x++) {
        r.push(frSuma(p[x] || fr(0), s < 0 ? frNeg(q[x] || fr(0)) : q[x] || fr(0)));
      }
      return r;
    };
    var a = n.a ? poliInd(n.a) : null, b = n.b ? poliInd(n.b) : null;
    switch (n.k) {
      case "num": return [n.v];
      case "var": return [fr(0), fr(1)];
      case "neg": return a && a.map(frNeg);
      case "+": return a && b && suma(a, b, 1);
      case "-": return a && b && suma(a, b, -1);
      case "*": return a && b && mul(a, b);
      case "/":
        if (!a || !b || b.slice(1).some(function (c) { return !frCero(c); }) || frCero(b[0])) return null;
        return a.map(function (c) { return frDiv(c, b[0]); });
      case "^":
        if (!a || !b || b.length !== 1 || b[0].d !== 1 || b[0].n < 0 || b[0].n > 6) return null;
        var r = [fr(1)];
        for (var j = 0; j < b[0].n && r; j++) r = mul(r, a);
        return r;
    }
    return null;
  }
  function gradoInd(p) { for (var g = p.length - 1; g > 0; g--) if (!frCero(p[g])) return g; return 0; }
  function linealInd(p, nom) {
    var a = p[1] || fr(0), b = p[0];
    if (frCero(a)) return numInd(b);
    var t = frUno(a) ? varInd(nom) : a.n === -1 && a.d === 1 ? { k: "neg", a: varInd(nom) } : opInd("*", numInd(a), varInd(nom));
    return frCero(b) ? t : b.n > 0 ? opInd("+", t, numInd(b)) : opInd("-", t, numInd(frNeg(b)));
  }
  function textoPlanoInd(n) { return planoItsInd(escribirInd(n)); }
  // cada parte lineal en k se escribe simplificada: (k + 1) − 1 = k, 2(k + 1) − 1 = 2k + 1
  function simplificarInd(n, nom) {
    if (n.k === "num" || n.k === "var") { var c = copiar(n); delete c.color; delete c.sust; return c; }
    // solo sumas y restas (2(k + 1) − 1 = 2k + 1); 1/2(k + 1) queda asi
    var p = n.k === "+" || n.k === "-" || n.sust ? poliInd(n) : null;
    if (p && gradoInd(p) <= 1) {
      var l = linealInd(p, nom);
      if (textoPlanoInd(l) !== textoPlanoInd(n) || n.sust) { l.reemplazo = true; return l; }
    }
    var r = { k: n.k };
    if (n.a) r.a = simplificarInd(n.a, nom);
    if (n.b) r.b = simplificarInd(n.b, nom);
    return r;
  }

  // a(1) + a(2) + … como items; devuelve tambien donde empieza y termina cada termino
  function sumaInd(terminos) {
    var its = [], marcas = [];
    terminos.forEach(function (t, j) {
      if (t === "…") { its.push(TF(" + … ")); marcas.push(null); return; }
      var x = escribirInd(t);
      // un termino que es una suma o resta va entre parentesis: … + (2k − 1)
      if (j && precInd(t) === 1 && !(t.sust && t.k !== "num")) x = [TF("(")].concat(x, [TF(")")]);
      // un termino negativo se escribe restando: 1 − 2 en vez de 1 + −2
      var neg = /^−/.test(primerTexto(x)) && x[0].t !== undefined;
      if (neg) {
        x[0] = TF(x[0].t.replace(/^(\s*)−/, "$1"), x[0].color);
        if (!x[0].t) x.shift();
      }
      var trasPuntos = terminos[j - 1] === "…";
      if (j) its.push(TF(neg ? (trasPuntos ? "− " : " − ") : trasPuntos ? "+ " : " + "));
      else if (neg) its.push(TF("−"));
      marcas.push({ de: x[0], a: x[x.length - 1] });
      its = its.concat(x);
    });
    return { its: its, marcas: marcas };
  }

  // --------------------------------------------- resolver el paso 3
  // Se trabaja el miembro izquierdo S(k) + a(k + 1) hasta llegar a S(k + 1),
  // con estrategias de pizarron (no un algebra general):
  //  - factor constante c·(…) o denominador numerico (…)/d en S: se reescribe
  //    a(k + 1) para sacar factor comun c o para sumar las fracciones;
  //  - potencias de igual base (b^(k+m)): se llevan a la misma potencia, se saca
  //    factor comun, se suma y se aplica el producto de potencias de igual base;
  //  - polinomios: factor comun (y factorizar lo que queda segun S(k + 1)) o
  //    desarrollar y sumar los terminos semejantes;
  //  - fracciones con k en el denominador: comun denominador, sumar, factorizar
  //    el numerador y simplificar.
  // Cada renglon se controla con numeros (k = 1…9, fracciones exactas): si uno no
  // da lo mismo que el anterior, se deja de escribir (nunca se escribe algo falso).
  var SUP_LIN = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹",
    "+": "⁺", "−": "⁻", "(": "⁽", ")": "⁾", k: "ᵏ", n: "ⁿ" };
  // texto en un renglon (para las notas): 5ᵏ, 1/4·4·5ᵏ, (k + 1)²
  function linInd(n) {
    // lo reemplazado (k + 1) va entre parentesis dentro de una operacion
    var par = function (x, poner) { var s = linInd(x); return poner || (x.sust && precInd(x) < 9) ? "(" + s + ")" : s; };
    switch (n.k) {
      case "num": return frTexto(n.v);
      case "var": return n.nom;
      case "+": return par(n.a, false) + " + " + par(n.b, precInd(n.b) === 1.5);
      case "-": return par(n.a, false) + " − " + par(n.b, precInd(n.b) <= 1.5);
      case "neg": return "−" + par(n.a, precInd(n.a) < 2);
      case "*":
        var I = par(n.a, precInd(n.a) < 1.5), D = par(n.b, precInd(n.b) < 2);
        var punto = /^[0-9−]/.test(D) || /\//.test(I) || (/[A-Za-z]$/.test(I) && /^[A-Za-z]/.test(D));
        return I + (punto ? "·" : "") + D;
      case "/": return par(n.a, precInd(n.a) < 2) + "/" + par(n.b, precInd(n.b) < 4);
      case "^":
        var e = linInd(n.b).replace(/ /g, "");
        var sup = e.split("").every(function (c) { return SUP_LIN[c]; })
          ? e.split("").map(function (c) { return SUP_LIN[c]; }).join("") : "^(" + e + ")";
        return par(n.a, precInd(n.a) < 9) + sup;
      case "!": return par(n.a, precInd(n.a) < 9) + "!";
    }
  }
  function planoItsInd(its) {
    return its.map(function (it) {
      return it.frac ? "[" + planoItsInd(it.frac[0]) + "/" + planoItsInd(it.frac[1]) + "]"
        : it.sup ? "^[" + planoItsInd(it.sup) + "]" : it.t !== undefined ? it.t : "";
    }).join("");
  }
  // mismos valores para k = 1…9 (se saltean los k donde no esta definido)
  function igualesInd(a, b) {
    var ok = 0;
    for (var x = 1; x <= 9; x++) {
      var va, vb;
      try { va = valInd(a, fr(x)); vb = valInd(b, fr(x)); } catch (e) { if (e && e.msjInd) continue; throw e; }
      if (!frIgual(va, vb)) return false;
      ok++;
    }
    return ok >= 4;
  }
  function pintInd(n, color) { var c = {}; for (var q in n) c[q] = n[q]; c.color = color; return c; }
  function limpioInd(n) {
    var c = copiar(n);
    (function f(x) { delete x.color; delete x.sust; if (x.a) f(x.a); if (x.b) f(x.b); })(c);
    return c;
  }
  function esNegInd(t) {
    return (t.k === "num" && t.v.n < 0) || t.k === "neg" || (t.k === "*" && t.a.k === "num" && t.a.v.n < 0);
  }
  function negarInd(n) {
    var r;
    if (n.k === "num") r = numInd(frNeg(n.v));
    else if (n.k === "neg") r = n.a;
    else if (n.k === "*" && n.a.k === "num") r = opInd("*", numInd(frNeg(n.a.v)), n.b);
    else r = { k: "neg", a: n };
    return n.color ? pintInd(r, n.color) : r;
  }
  // terminos de una suma, con su signo
  function terminosSumaInd(n) {
    if (n.k === "+") return terminosSumaInd(n.a).concat(terminosSumaInd(n.b));
    if (n.k === "-") return terminosSumaInd(n.a).concat(terminosSumaInd(n.b).map(negarInd));
    if (n.k === "neg" && (n.a.k === "+" || n.a.k === "-")) return terminosSumaInd(n.a).map(negarInd);
    return [n];
  }
  function sumaNodosInd(ts) {
    var r = null;
    ts.forEach(function (t) {
      if (!r) { r = t; return; }
      r = esNegInd(t) ? opInd("-", r, negarInd(t)) : opInd("+", r, t);
    });
    return r || numInd(fr(0));
  }
  // terminos (monomios) de un polinomio, del grado mayor al menor
  function monomiosInd(p, nom) {
    var ts = [];
    for (var g = p.length - 1; g >= 0; g--) {
      var c = p[g];
      if (frCero(c)) continue;
      if (!g) { ts.push(numInd(c)); continue; }
      var x = g === 1 ? varInd(nom) : opInd("^", varInd(nom), numInd(fr(g)));
      ts.push(frUno(c) ? x : c.n === -1 && c.d === 1 ? { k: "neg", a: x } : opInd("*", numInd(c), x));
    }
    return ts;
  }
  function polyNodoInd(p, nom) { return sumaNodosInd(monomiosInd(p, nom)); }
  function escalarInd(q, n) {
    if (frUno(q)) return n;
    if (n.k === "num") return numInd(frMul(q, n.v));
    if (n.k === "/" && n.a.k === "num") return opInd("/", numInd(frMul(q, n.a.v)), n.b);
    if (n.k === "*" && n.a.k === "num") {
      var c = frMul(q, n.a.v);
      return frUno(c) ? n.b : c.n === -1 && c.d === 1 ? { k: "neg", a: n.b } : opInd("*", numInd(c), n.b);
    }
    // por −1: se cambia el signo (−(k + 1)², no −1(k + 1)²)
    if (q.n === -1 && q.d === 1) return negarInd(n);
    return opInd("*", numInd(q), n);
  }

  // factores de un producto: constante y factores con exponente (clave: como se escribe)
  function claveInd(n) { var p = poliInd(n); return textoPlanoInd(p ? polyNodoInd(p, "k") : n); }
  function juntarFsInd(a, b, s) {
    var r = a.map(function (f) { return { n: f.n, e: f.e, key: f.key }; });
    b.forEach(function (f) {
      var g = r.filter(function (x) { return x.key === f.key; })[0];
      if (g) g.e += s * f.e; else r.push({ n: f.n, e: s * f.e, key: f.key });
    });
    return r.filter(function (f) { return f.e !== 0; });
  }
  function factoresInd(n) {
    switch (n.k) {
      case "num": return { c: n.v, fs: [] };
      case "neg": var f = factoresInd(n.a); return { c: frNeg(f.c), fs: f.fs };
      case "*":
        var a = factoresInd(n.a), b = factoresInd(n.b);
        return { c: frMul(a.c, b.c), fs: juntarFsInd(a.fs, b.fs, 1) };
      case "/":
        if (!tieneVarInd(n.b)) { var d = factoresInd(n.a); return { c: frDiv(d.c, valInd(n.b)), fs: d.fs }; }
        break;
      case "^":
        if (n.b.k === "num" && n.b.v.d === 1 && n.b.v.n > 0 && n.b.v.n < 10) {
          var e = n.b.v.n, x = factoresInd(n.a), c = fr(1);
          for (var j = 0; j < e; j++) c = frMul(c, x.c);
          return { c: c, fs: x.fs.map(function (f) { return { n: f.n, e: f.e * e, key: f.key }; }) };
        }
        break;
    }
    return { c: fr(1), fs: [{ n: n, e: 1, key: claveInd(n) }] };
  }
  function productoInd(c, fs) {
    var r = null;
    fs.forEach(function (f) {
      var x = f.e === 1 ? f.n : opInd("^", f.n, numInd(fr(f.e)));
      r = r ? opInd("*", r, x) : x;
    });
    if (!r) return numInd(c);
    if (frUno(c)) return r;
    if (c.n === -1 && c.d === 1) return { k: "neg", a: r };
    return opInd("*", numInd(c), r);
  }
  function esPoliFactor(f) { var p = poliInd(f.n); return p && gradoInd(p) >= 1; }

  // S = c·(…), (…)/d, P/Q (Q con k) o nada de eso
  function descomponerInd(n) {
    if (n.k === "/" && n.b.k === "num" && n.b.v.d === 1 && n.b.v.n > 1) return { tipo: "div", d: n.b.v, cuerpo: n.a };
    if (n.k === "/" && tieneVarInd(n.b)) return { tipo: "frac", num: n.a, den: n.b };
    if (n.k === "*") {
      var fs = [], c = fr(1);
      (function plano(x) {
        if (x.k === "*") { plano(x.a); plano(x.b); } else if (!tieneVarInd(x)) c = frMul(c, valInd(x)); else fs.push(x);
      })(n);
      if (!frUno(c) && fs.length) {
        return { tipo: "prod", c: c, cuerpo: fs.reduce(function (r, x) { return r ? opInd("*", r, x) : x; }, null) };
      }
    }
    return { tipo: "nada", cuerpo: n };
  }

  // desarrolla una suma de polinomios: distributiva (o cuadrado) y terminos semejantes
  function expandirInd(X) {
    var ts = terminosSumaInd(X), mons = [], prod = false, cuad = false, parens = false;
    for (var i = 0; i < ts.length; i++) {
      var p = poliInd(ts[i]);
      if (!p) return [];
      var m = monomiosInd(p, "k");
      if (planoItsInd(escribirInd(sumaNodosInd(m))) !== textoPlanoInd(ts[i])) {
        if (ts[i].k === "^") cuad = true; else prod = true;
      }
      mons = mons.concat(m);
    }
    // sumas entre parentesis: k² + (2k + 1) o (k + 2) + k
    if ((X.k === "+" && (X.b.k === "+" || X.b.k === "-")) || /\(/.test(textoPlanoInd(X))) parens = true;
    var pasos = [{ n: sumaNodosInd(mons), color: COLOR_PRODUCTO,
      nota: [prod ? "Aplicar la distributiva" : cuad ? "Desarrollar el cuadrado" : parens ? "Quitar los paréntesis" : "Ordenar"] }];
    pasos.push({ n: polyNodoInd(poliInd(X), "k"), nota: ["Sumar los términos semejantes"], color: COLOR_SUMA });
    return pasos;
  }

  // p(k)·b^(k+m) (s = 1) o p(k)/b^(k+m) (s = −1), con b natural o b = −1 (solo
  // arriba) y p un polinomio en k: cp son sus coeficientes y cn como esta escrito
  // (k(k + 1)/2 queda asi, no se desarrolla); null si el termino no tiene esa forma
  function esPotVarInd(n) { return n.k === "^" && tieneVarInd(n.b); }
  function terminoExpInd(t) {
    var c = fr(1), x = t, s = 1, cn = null;
    for (var g = 0; g < 10; g++) {
      if (x.k === "neg") { c = frNeg(c); x = x.a; }
      else if (x.k === "/" && !tieneVarInd(x.b)) { c = frDiv(c, valInd(x.b)); x = x.a; }
      else if (x.k === "/" && s > 0 && !cn && esPotVarInd(x.b) && (!tieneVarInd(x.a) || poliInd(x.a))) {
        if (tieneVarInd(x.a)) cn = x.a; else c = frMul(c, valInd(x.a));
        s = -1; x = x.b;
      }
      else if (x.k === "*" && !tieneVarInd(x.a)) { c = frMul(c, valInd(x.a)); x = x.b; }
      else if (x.k === "*" && !tieneVarInd(x.b)) { c = frMul(c, valInd(x.b)); x = x.a; }
      else if (x.k === "*" && !cn) {
        // producto: una sola potencia con k en el exponente; lo demas, polinomio
        var fs = [];
        (function plano(y) { if (y.k === "*") { plano(y.a); plano(y.b); } else fs.push(y); })(x);
        var pots = fs.filter(esPotVarInd);
        if (pots.length !== 1) return null;
        var rn = fs.filter(function (f) { return f !== pots[0]; }).reduce(function (r, f) { return r ? opInd("*", r, f) : f; }, null);
        if (tieneVarInd(rn)) { if (!poliInd(rn)) return null; cn = rn; } else c = frMul(c, valInd(rn));
        x = pots[0];
      }
      else break;
    }
    if (x.k !== "^" || x.a.k !== "num" || x.a.v.d !== 1) return null;
    var b = x.a.v.n;
    if (!(b >= 2 || (b === -1 && s > 0))) return null;
    var p = poliInd(x.b);
    if (!p || gradoInd(p) !== 1 || !frUno(p[1]) || p[0].d !== 1) return null;
    return { cp: (cn ? poliInd(cn) : [fr(1)]).map(function (q) { return frMul(q, c); }),
      cn: cn ? escalarInd(c, cn) : numInd(c), b: b, m: p[0].n, s: s };
  }
  function tieneExpInd(n) {
    return (n.k === "^" && tieneVarInd(n.b)) || (!!n.a && tieneExpInd(n.a)) || (!!n.b && tieneExpInd(n.b));
  }
  // ayudas para coeficientes polinomicos
  function cteP(cp) { return gradoInd(cp) === 0; }
  function negP(cp) { var c = cp[gradoInd(cp)]; return !!c && c.n < 0; }
  function sumaP(p, q) {
    var r = [];
    for (var i = 0; i < Math.max(p.length, q.length); i++) r.push(frSuma(p[i] || fr(0), q[i] || fr(0)));
    return r;
  }
  function porP(p, q) { return p.map(function (c) { return frMul(c, q); }); }
  // cuantas veces divide b a todos los coeficientes (enteros)
  function bEnP(cp, b) {
    if (b < 2 || cp.some(function (c) { return c.d !== 1; })) return 0;
    var nz = cp.filter(function (c) { return c.n; });
    if (!nz.length) return 0;
    var g = nz.reduce(function (m, c) { return m ? mcdAbs(m, c.n) : Math.abs(c.n); }, 0), j = 0;
    while (g && g % b === 0) { g /= b; j++; }
    return j;
  }
  // el polinomio como nodo, con el signo afuera si empieza negativo: −(k + 3)
  function cnDePInd(cp) { return negP(cp) ? negarInd(polyNodoInd(cp.map(frNeg), "k")) : polyNodoInd(cp, "k"); }
  function potEnteraInd(b, j) { var r = fr(1); for (var i = 0; i < j; i++) r = frMul(r, fr(b)); return r; }
  // una suma va entre parentesis dentro de otra suma: 2ᵏ((k − 1) + (k + 1))
  function entreParSumaInd(n) {
    if (n.k !== "+" && n.k !== "-") return n;
    var c = {};
    for (var q in n) c[q] = n[q];
    c.sust = true;
    return c;
  }
  // el termino de S(k + 1) con la misma base (para saber a que potencia ir)
  function objetivoExpInd(F, b, s) {
    var r = null;
    terminosSumaInd(F).forEach(function (t) {
      var e = tieneVarInd(t) ? terminoExpInd(t) : null;
      if (!r && e && e.b === b && e.s === s) r = e;
    });
    return r;
  }

  function exponencialInd(I, F) {
    var ts = terminosSumaInd(I).map(function (t) {
      if (!tieneVarInd(t)) return { cte: t };
      return terminoExpInd(t) || { malo: true };
    });
    if (ts.some(function (t) { return t.malo; })) return null;
    var pasos = [];
    var potN = function (b, m) { return opInd("^", numInd(fr(b)), linealInd([fr(m), fr(1)], "k")); };
    // coeficiente·potencia (con (−1)ᵏ, la potencia primero) o coeficiente/potencia;
    // el signo afuera, asi se escribe restando
    var conCoef = function (cn, x, s, b) {
      var neg = esNegInd(cn), c = neg ? negarInd(cn) : cn, r;
      if (s < 0) r = opInd("/", c, x);
      else if (c.k === "num" && frUno(c.v)) r = x;
      else r = b === -1 ? opInd("*", x, c) : opInd("*", c, x);
      return neg ? { k: "neg", a: r } : r;
    };
    var expNodo = function (t) { return conCoef(t.cn, potN(t.b, t.m), t.s, t.b); };
    var push = function (nota, color) {
      pasos.push({ n: sumaNodosInd(ts.map(function (t) { return t.nodo || t.cte || expNodo(t); })), nota: nota, color: color });
    };
    var grupos = [];
    ts.forEach(function (t) {
      if (t.b && !grupos.some(function (G) { return G.b === t.b && G.s === t.s; })) grupos.push({ b: t.b, s: t.s });
    });
    grupos.forEach(function (G) {
      var b = G.b, gr = ts.filter(function (t) { return t.b === b && t.s === G.s; });
      if (gr.length < 2) return;
      var resta = gr.slice(1).some(function (t) { return negP(t.cp); }), C, j;
      if (G.s < 0) {
        // fracciones: todas con el denominador mas grande, b^(k+M)
        var M = Math.max.apply(null, gr.map(function (t) { return t.m; }));
        var cambian = gr.filter(function (t) { return t.m !== M; });
        if (cambian.length) {
          var notas = cambian.map(function (t) {
            var f = potEnteraInd(b, M - t.m), abs = esNegInd(t.cn) ? negarInd(t.cn) : t.cn;
            var antes = conCoef(abs, potN(b, t.m), -1, b);
            t.cp = porP(t.cp, f); t.cn = escalarInd(f, t.cn); t.m = M;
            t.nodo = pintInd(expNodo(t), COLOR_PRODUCTO);
            return "Escribir " + linInd(antes) + " = " + linInd(conCoef(escalarInd(f, abs), potN(b, M), -1, b));
          });
          push(notas.concat(["(para tener igual denominador)"]), COLOR_PRODUCTO);
          cambian.forEach(function (t) { t.nodo = null; });
        }
        C = gr.reduce(function (s, t) { return sumaP(s, t.cp); }, [fr(0)]);
        gr.slice(1).forEach(function (t) { t.fuera = true; });
        ts = ts.filter(function (t) { return !t.fuera; });
        gr[0].cp = C; gr[0].cn = cnDePInd(C); gr[0].m = M;
        gr[0].nodo = pintInd(expNodo(gr[0]), COLOR_SUMA);
        push([resta ? "Restar las fracciones" : "Sumar las fracciones", "(igual denominador)"], COLOR_SUMA);
        // simplificar las b del numerador con el denominador
        j = bEnP(C, b);
        if (j > 0) {
          var bj = potEnteraInd(b, j);
          gr[0].cp = C.map(function (c) { return frDiv(c, bj); }); gr[0].cn = cnDePInd(gr[0].cp); gr[0].m = M - j;
          gr[0].nodo = pintInd(expNodo(gr[0]), COLOR_PRODUCTO);
          push(["Simplificar " + frTexto(bj)], COLOR_PRODUCTO);
        }
        gr[0].nodo = null;
        return;
      }
      // la potencia a la que se lleva todo: la menor (b ≥ 2) o, con (−1)ᵏ, la de S(k + 1)
      var obj = objetivoExpInd(F, b, 1), ms = gr.map(function (t) { return t.m; });
      var m0 = b === -1 ? (obj ? obj.m : Math.max.apply(null, ms)) : Math.min.apply(null, ms);
      // 1) todas como b^(k+m0)
      var cambianP = gr.filter(function (t) { return t.m !== m0; });
      if (cambianP.length) {
        var notasP = cambianP.map(function (t) {
          var d = t.m - m0;
          if (b === -1) {
            // (−1)ᵏ⁺¹ = −(−1)ᵏ⁺²: con una diferencia impar cambia el signo
            var impar = Math.abs(d) % 2 === 1;
            t.nodo = pintInd(conCoef(impar ? escalarInd(fr(-1), t.cn) : t.cn, potN(b, m0), 1, b), COLOR_PRODUCTO);
            return "Escribir " + linInd(potN(b, t.m)) + " = " + (impar ? "−" : "") + linInd(potN(b, m0));
          }
          var bd = d === 1 ? numInd(fr(b)) : opInd("^", numInd(fr(b)), numInd(fr(d)));
          var x = opInd("*", bd, potN(b, m0));
          t.nodo = pintInd(conCoef(t.cn, x, 1, b), COLOR_PRODUCTO);
          return "Escribir " + linInd(potN(b, t.m)) + " = " + linInd(x);
        });
        push(notasP.concat([b === -1 ? "(potencias de −1)" : "(producto de potencias de igual base)"]), COLOR_PRODUCTO);
        cambianP.forEach(function (t) {
          var d = t.m - m0, f = b === -1 ? fr(Math.abs(d) % 2 ? -1 : 1) : potEnteraInd(b, d);
          t.cp = porP(t.cp, f); t.cn = escalarInd(f, t.cn); t.m = m0; t.nodo = null;
        });
        push(["Resolver la multiplicación"], COLOR_PRODUCTO);
      }
      // 2) factor comun b^(k+m0)
      var P = potN(b, m0), dentro = sumaNodosInd(gr.map(function (t) { return entreParSumaInd(t.cn); }));
      gr[0].nodo = opInd("*", pintInd(P, COLOR_PRODUCTO), dentro);
      gr.slice(1).forEach(function (t) { t.fuera = true; });
      ts = ts.filter(function (t) { return !t.fuera; });
      push(["Sacar factor común " + linInd(P)], COLOR_PRODUCTO);
      // 3) lo de adentro: numeros (se suman) o polinomios (factor comun, distributiva...)
      C = gr.reduce(function (s, t) { return sumaP(s, t.cp); }, [fr(0)]);
      if (gr.every(function (t) { return cteP(t.cp); })) {
        gr[0].nodo = opInd("*", P, pintInd(numInd(C[0]), COLOR_SUMA));
        push([resta ? "Resolver la resta" : "Resolver la suma"], COLOR_SUMA);
        gr[0].cn = numInd(C[0]);
      } else {
        var sub = polinomioInd(dentro, obj ? obj.cn : dentro) || expandirInd(dentro);
        sub.forEach(function (q) { gr[0].nodo = opInd("*", P, q.n); push(q.nota, q.color); });
        gr[0].cn = sub.length ? limpioInd(sub[sub.length - 1].n) : dentro;
      }
      gr[0].cp = C; gr[0].m = m0;
      // 4) las b del coeficiente pasan a la potencia (producto de potencias de igual base)
      j = bEnP(C, b);
      if (j > 0) {
        var bj2 = potEnteraInd(b, j), nc = C.map(function (c) { return frDiv(c, bj2); });
        var e = escalarInd(frDiv(fr(1), bj2), gr[0].cn);
        if (e.k === "*" && e.a.k === "num" && e.a.v.d !== 1) e = polyNodoInd(nc, "k");
        gr[0].cp = nc; gr[0].cn = e; gr[0].m = m0 + j;
        gr[0].nodo = pintInd(expNodo(gr[0]), COLOR_PRODUCTO);
        push(["Aplicar producto de potencias", "de igual base: " + linInd(opInd("*", numInd(bj2), P)) + " = " + linInd(potN(b, m0 + j))],
          COLOR_PRODUCTO);
      } else {
        gr[0].nodo = null;
        push([cteP(C) && frUno(C[0]) ? "Resolver la multiplicación" : "Ordenar"], TINTA);
      }
      gr[0].nodo = null;
    });
    return pasos;
  }

  // potencias por una fraccion con k en el denominador (sumas telescopicas como
  // Σ k·2ᵏ/((k + 1)(k + 2)) = 2ⁿ⁺¹/(n + 2) − 1): comun denominador, sumar las
  // fracciones, resolver el numerador con las potencias y simplificar
  function tieneDenVarInd(n) {
    return (n.k === "/" && tieneVarInd(n.b) && !esPotVarInd(n.b)) || (!!n.a && tieneDenVarInd(n.a)) || (!!n.b && tieneDenVarInd(n.b));
  }
  function fraccionPotenciaInd(I) {
    var base = null;
    var items = terminosSumaInd(I).map(function (t) {
      if (!tieneVarInd(t)) return { cte: t };
      var c = fr(1), x = t;
      while (x.k === "neg" || (x.k === "*" && !tieneVarInd(x.a))) {
        if (x.k === "neg") { c = frNeg(c); x = x.a; } else { c = frMul(c, valInd(x.a)); x = x.b; }
      }
      if (x.k !== "/" || !tieneVarInd(x.b) || esPotVarInd(x.b) || !poliInd(x.b)) return { malo: true };
      var e = terminoExpInd(x.a);
      if (!e || e.s !== 1 || (base !== null && base !== e.b)) return { malo: true };
      base = e.b;
      return { cn: escalarInd(c, e.cn), b: e.b, m: e.m, den: factoresInd(x.b) };
    });
    var fs = items.filter(function (it) { return it.den; });
    if (items.some(function (it) { return it.malo; }) || fs.length < 2) return null;
    if (fs.some(function (it) { return it.den.c.d !== 1 || !it.den.c.n; })) return null;
    // comun denominador: el mcm de las constantes y cada factor con su mayor exponente
    var Dc = fr(fs.reduce(function (m, it) { var a = Math.abs(it.den.c.n); return m * a / mcdAbs(m, a); }, 1));
    var Dfs = [];
    fs.forEach(function (it) {
      it.den.fs.forEach(function (f) {
        var g = Dfs.filter(function (x) { return x.key === f.key; })[0];
        if (g) g.e = Math.max(g.e, f.e); else Dfs.push({ n: f.n, e: f.e, key: f.key });
      });
    });
    var Dn = productoInd(Dc, Dfs);
    var potN = function (b, m) { return opInd("^", numInd(fr(b)), linealInd([fr(m), fr(1)], "k")); };
    // numerador sobre el comun denominador: coeficiente·potencia·(lo que falta)
    var numer = function (it) {
      var mult = juntarFsInd(Dfs, it.den.fs, -1), cn = escalarInd(frDiv(Dc, it.den.c), it.cn);
      var neg = esNegInd(cn);
      if (neg) cn = negarInd(cn);
      var x = potN(it.b, it.m), r = cn.k === "num" && frUno(cn.v) ? x : opInd("*", cn, x);
      if (mult.length) r = opInd("*", r, productoInd(fr(1), mult));
      return neg ? { k: "neg", a: r } : r;
    };
    var primera = items.indexOf(fs[0]);
    // la suma con la fraccion (numerador N sobre D) en el lugar de la primera
    var armar = function (N) {
      var r = [];
      items.forEach(function (it, i) {
        if (it.cte) r.push(it.cte);
        else if (i === primera) r.push(esNegInd(N) ? { k: "neg", a: opInd("/", negarInd(N), Dn) } : opInd("/", N, Dn));
      });
      return sumaNodosInd(r);
    };
    var pasos = [];
    pasos.push({ n: sumaNodosInd(items.map(function (it) {
      if (it.cte) return it.cte;
      var q = numer(it), neg = q.k === "neg";
      var d = pintInd(opInd("/", neg ? q.a : q, Dn), COLOR_PRODUCTO);
      return neg ? { k: "neg", a: d } : d;
    })), nota: ["Llevar a común denominador", linInd(Dn)], color: COLOR_PRODUCTO });
    var N = sumaNodosInd(fs.map(numer));
    pasos.push({ n: armar(N), nota: ["Sumar las fracciones", "(igual denominador)"], color: COLOR_SUMA });
    // el numerador: misma potencia, factor comun, lo de adentro y producto de potencias
    var sub = exponencialInd(N, N);
    if (!sub) return null;
    sub.forEach(function (p) { pasos.push({ n: armar(p.n), nota: p.nota, color: p.color }); });
    var Nf = limpioInd(sub.length ? sub[sub.length - 1].n : N);
    // simplificar lo que se repite arriba y abajo
    var fN = factoresInd(Nf);
    var G = fN.fs.filter(function (f) {
      return esPoliFactor(f) && Dfs.some(function (g) { return g.key === f.key; });
    }).map(function (f) {
      var g = Dfs.filter(function (h) { return h.key === f.key; })[0];
      return { n: f.n, e: Math.min(f.e, g.e), key: f.key };
    });
    if (G.length) {
      var arriba = productoInd(fN.c, juntarFsInd(fN.fs, G, -1)), abajo = productoInd(Dc, juntarFsInd(Dfs, G, -1));
      var q = abajo.k === "num" && frUno(abajo.v) ? arriba : opInd("/", arriba, abajo);
      var r = [];
      items.forEach(function (it, i) { if (it.cte) r.push(it.cte); else if (i === primera) r.push(pintInd(q, COLOR_PRODUCTO)); });
      pasos.push({ n: sumaNodosInd(r), nota: ["Simplificar " + linInd(productoInd(fr(1), G))], color: COLOR_PRODUCTO });
    }
    return pasos;
  }

  function tieneFactInd(n) { return n.k === "!" || (!!n.a && tieneFactInd(n.a)) || (!!n.b && tieneFactInd(n.b)); }
  // factoriales: factor comun (k + 1)!, sumar lo de adentro y (k + 2)·(k + 1)! = (k + 2)!
  function factorialInd(I) {
    var ts = terminosSumaInd(I), fsT = ts.map(factoresInd), clave = null, Fn = null;
    fsT.forEach(function (x) {
      x.fs.forEach(function (f) { if (!clave && f.n.k === "!" && f.e === 1) { clave = f.key; Fn = f.n; } });
    });
    if (!clave) return null;
    var gr = [], pos = -1;
    fsT.forEach(function (x, i) {
      if (x.fs.some(function (f) { return f.key === clave; })) { gr.push(productoInd(x.c, juntarFsInd(x.fs, [{ n: Fn, e: 1, key: clave }], -1))); if (pos < 0) pos = i; }
    });
    if (gr.length < 2) return null;
    var dentro = sumaNodosInd(gr), pD = poliInd(dentro);
    if (!pD) return null;
    var armar = function (nodo) {
      var r = [];
      ts.forEach(function (t, i) {
        if (i === pos) r.push(nodo);
        else if (!fsT[i].fs.some(function (f) { return f.key === clave; })) r.push(t);
      });
      return sumaNodosInd(r);
    };
    var pasos = [{ n: armar(opInd("*", pintInd(Fn, COLOR_PRODUCTO), dentro)), nota: ["Sacar factor común " + linInd(Fn)], color: COLOR_PRODUCTO }];
    var suma = polyNodoInd(pD, "k");
    pasos.push({ n: armar(opInd("*", Fn, pintInd(suma, COLOR_SUMA))), nota: ["Sumar los términos semejantes"], color: COLOR_SUMA });
    // m·(m − 1)! = m!
    var pA = poliInd(Fn.a);
    if (pA && textoPlanoInd(polyNodoInd(pD, "k")) === textoPlanoInd(polyNodoInd(poliInd(opInd("+", Fn.a, numInd(fr(1)))), "k"))) {
      var nuevo = { k: "!", a: suma };
      pasos.push({ n: armar(pintInd(nuevo, COLOR_PRODUCTO)), color: COLOR_PRODUCTO,
        nota: ["Definición de factorial:", linInd(opInd("*", suma, Fn)) + " = " + linInd(nuevo)] });
    }
    return pasos;
  }

  // polinomios: factor comun (si hay) o desarrollar todo
  function polinomioInd(I, F) {
    if (!poliInd(I) || !poliInd(F)) return null;
    var ts = terminosSumaInd(I), pasos = [];
    if (ts.length >= 2) {
      var fsT = ts.map(factoresInd), G = fsT[0].fs.filter(esPoliFactor);
      fsT.slice(1).forEach(function (x) {
        G = G.filter(function (g) { return x.fs.some(function (f) { return f.key === g.key; }); }).map(function (g) {
          var f = x.fs.filter(function (h) { return h.key === g.key; })[0];
          return { n: g.n, e: Math.min(g.e, f.e), key: g.key };
        });
      });
      if (G.length) {
        var Gn = productoInd(fr(1), G);
        var dentro = sumaNodosInd(fsT.map(function (x) { return productoInd(x.c, juntarFsInd(x.fs, G, -1)); }));
        pasos.push({ n: opInd("*", pintInd(Gn, COLOR_PRODUCTO), dentro), nota: ["Sacar factor común " + linInd(Gn)], color: COLOR_PRODUCTO });
        var ex = expandirInd(dentro);
        ex.forEach(function (p) { pasos.push({ n: opInd("*", Gn, p.n), nota: p.nota, color: p.color }); });
        var ultimo = ex.length ? ex[ex.length - 1].n : dentro;
        // lo que queda de S(k + 1) sin el factor comun: si es lo mismo, se factoriza asi
        var fF = factoresInd(F), restoF = juntarFsInd(fF.fs, G, -1);
        if (restoF.every(function (f) { return f.e > 0; })) {
          var R = productoInd(fF.c, restoF), pR = poliInd(R), pU = poliInd(ultimo);
          if (pR && pU && textoPlanoInd(polyNodoInd(pR, "k")) === textoPlanoInd(polyNodoInd(pU, "k")) &&
              textoPlanoInd(R) !== textoPlanoInd(ultimo)) {
            pasos.push({ n: opInd("*", Gn, pintInd(R, COLOR_PRODUCTO)), color: COLOR_PRODUCTO,
              nota: ["Factorizar " + linInd(ultimo), "= " + linInd(R)] });
          }
        }
        return pasos;
      }
    }
    return expandirInd(I);
  }

  // fracciones con k en el denominador: comun denominador, sumar, factorizar y simplificar
  function fraccionesInd(A, ak1, B, paso) {
    var Q = factoresInd(A.den), num2 = ak1.k === "/" ? ak1.a : ak1;
    var Q2 = ak1.k === "/" ? factoresInd(ak1.b) : { c: fr(1), fs: [] };
    if (Q.c.d !== 1 || Q2.c.d !== 1 || !Q.c.n || !Q2.c.n) return false;
    var a = Math.abs(Q.c.n), b = Math.abs(Q2.c.n), Dc = fr(a * b / mcdAbs(a, b));
    var Dfs = Q.fs.map(function (f) { return { n: f.n, e: f.e, key: f.key }; });
    Q2.fs.forEach(function (f) {
      var g = Dfs.filter(function (x) { return x.key === f.key; })[0];
      if (g) g.e = Math.max(g.e, f.e); else Dfs.push({ n: f.n, e: f.e, key: f.key });
    });
    var Dn = productoInd(Dc, Dfs);
    var por = function (x, Fq) {
      var fs = juntarFsInd(Dfs, Fq.fs, -1), c = frDiv(Dc, Fq.c);
      return fs.length ? opInd("*", escalarInd(c, x), productoInd(fr(1), fs)) : escalarInd(c, x);
    };
    var n1 = por(A.num, Q), n2 = por(num2, Q2);
    paso(opInd("+", opInd("/", pintInd(n1, COLOR_PRODUCTO), Dn), opInd("/", pintInd(n2, COLOR_PRODUCTO), Dn)),
      ["Llevar a común denominador", linInd(Dn)], COLOR_PRODUCTO);
    var N = opInd("+", n1, n2);
    paso(opInd("/", N, Dn), ["Sumar las fracciones", "(igual denominador)"], COLOR_SUMA);
    var ex = poliInd(N) ? expandirInd(N) : [];
    ex.forEach(function (p) { paso(opInd("/", p.n, Dn), p.nota, p.color); });
    // D = (denominador de S(k + 1))·G: el numerador se factoriza como (numerador de S(k + 1))·G
    var QT = factoresInd(B.den), G = juntarFsInd(Dfs, QT.fs, -1), cG = frDiv(Dc, QT.c);
    if (G.some(function (f) { return f.e < 0; })) return true;
    if (G.length || !frUno(cG)) {
      var PT = factoresInd(B.num), numF = productoInd(frMul(PT.c, cG), juntarFsInd(PT.fs, G, 1));
      paso(opInd("/", pintInd(numF, COLOR_PRODUCTO), Dn), ["Factorizar el numerador"], COLOR_PRODUCTO);
      paso(opInd("/", B.num, B.den), ["Simplificar " + linInd(productoInd(cG, G))], COLOR_PRODUCTO);
    }
    return true;
  }

  // pasos desde S(k) + a(k + 1) hasta S(k + 1): [{ n, nota, color }] y si se llego
  // S(k + 1) tal como quedo al reemplazar (Traw) frente a su version simplificada
  // (T, de simplificarInd): devuelve Traw con lo que cambia en color y anota los pares
  function diferenciasInd(raw, simp, pares) {
    // (k + 1) y k + 1 son lo mismo: solo cambian los parentesis
    if (textoPlanoInd(raw) === textoPlanoInd(simp) || linInd(raw) === linInd(simp)) return raw;
    if (simp.reemplazo || raw.k !== simp.k) { pares.push([simp, raw]); return pintInd(raw, COLOR_PRODUCTO); }
    var r = {};
    for (var q in raw) r[q] = raw[q];
    if (raw.a) r.a = diferenciasInd(raw.a, simp.a, pares);
    if (raw.b) r.b = diferenciasInd(raw.b, simp.b, pares);
    return r;
  }
  function sinColorInd(n) {
    var c = copiar(n);
    (function f(x) { delete x.color; if (x.a) f(x.a); if (x.b) f(x.b); })(c);
    return c;
  }
  // Traw: el miembro derecho sin tocar; el izquierdo tiene que terminar escrito igual
  function resolverInd(Sk, ak1, T, textoInicial, Traw) {
    var L0 = opInd("+", Sk, ak1), pasos = [], fallo = false, ult = textoInicial;
    function paso(n, nota, color) {
      if (fallo) return;
      if (!igualesInd(n, L0)) { fallo = true; return; }
      var t = textoPlanoInd(n);
      if (t === ult) return;
      ult = t;
      pasos.push({ n: n, nota: nota, color: color });
    }
    try {
      var A = descomponerInd(Sk), B = descomponerInd(T), envolver = function (x) { return x; }, I = L0, F = T, hecho = null;
      if (A.tipo === "prod" && B.tipo === "prod" && frIgual(A.c, B.c)) {
        var t = escalarInd(frDiv(fr(1), A.c), ak1), ct = opInd("*", numInd(A.c), t);
        paso(opInd("+", Sk, pintInd(ct, COLOR_PRODUCTO)), ["Reescribimos " + linInd(ak1) + " = " + linInd(ct)], COLOR_PRODUCTO);
        paso(opInd("*", pintInd(numInd(A.c), COLOR_PRODUCTO), opInd("+", A.cuerpo, t)),
          ["Sacar factor común " + frTexto(A.c)], COLOR_PRODUCTO);
        envolver = function (x) { return opInd("*", numInd(A.c), x); };
        I = opInd("+", A.cuerpo, t); F = B.cuerpo;
      } else if (A.tipo === "div" && B.tipo === "div" && frIgual(A.d, B.d)) {
        var d = A.d, t2 = escalarInd(d, ak1);
        paso(opInd("+", Sk, pintInd(opInd("/", t2, numInd(d)), COLOR_PRODUCTO)),
          ["Multiplicar y dividir " + linInd(ak1) + " por " + frTexto(d)], COLOR_PRODUCTO);
        paso(opInd("/", opInd("+", A.cuerpo, t2), numInd(d)), ["Sumar las fracciones", "(igual denominador)"], COLOR_SUMA);
        envolver = function (x) { return opInd("/", x, numInd(d)); };
        I = opInd("+", A.cuerpo, t2); F = B.cuerpo;
      } else if (A.tipo === "frac" && B.tipo === "frac") {
        hecho = fraccionesInd(A, ak1, B, paso);
      }
      if (hecho === null) {
        var dentro = tieneExpInd(I) ? (tieneDenVarInd(I) ? fraccionPotenciaInd(I) : exponencialInd(I, F))
          : tieneFactInd(I) ? factorialInd(I) : polinomioInd(I, F);
        if (dentro) dentro.forEach(function (p) { paso(envolver(p.n), p.nota, p.color); });
        hecho = !!dentro;
      }
      // si quedo escrito distinto (orden, factores), el ultimo renglon es S(k + 1)
      if (hecho && !fallo && ult !== textoPlanoInd(T)) {
        var fT = T.k === "*" || T.k === "^" || T.k === "/";
        var cuad = T.k === "^" && T.b.k === "num" && T.b.v.n === 2 && (T.a.k === "+" || T.a.k === "-");
        paso(T, [cuad ? "Trinomio cuadrado perfecto" : T.k === "^" ? "Escribir como potencia" : fT ? "Factorizar" : "Reordenar"], COLOR_PRODUCTO);
      }
    } catch (e) {
      if (!(e && e.msjInd)) throw e;
      fallo = true;
    }
    // del S(k + 1) simplificado al escrito en el miembro derecho: k + 2 = (k + 1) + 1
    var meta = Traw ? textoPlanoInd(Traw) : textoPlanoInd(T);
    if (Traw && !fallo && ult === textoPlanoInd(T) && ult !== meta) {
      var pares = [], final = diferenciasInd(Traw, T, pares);
      var notasF = pares.map(function (q) { return "Escribir " + linInd(q[0]) + " = " + linInd(q[1]); });
      paso(final, notasF.filter(function (t, i) { return notasF.indexOf(t) === i; }), COLOR_PRODUCTO);
    }
    return { pasos: pasos, ok: !fallo && ult === meta };
  }

  function analizarInd(fila) {
    var A = leerInd(fila.texto, "el término general a(n)");
    if (A.error) return { error: A.error };
    var S = leerInd(fila.suma, "la fórmula de la suma S(n)");
    if (S.error) return { error: S.error, enSuma: true };
    // se revisa que valga para los primeros n
    try {
      var acum = fr(0);
      for (var x = 1; x <= 8; x++) {
        acum = chkInd(frSuma(acum, valInd(A.arbol, fr(x))));
        var s = valInd(S.arbol, fr(x));
        if (!frIgual(acum, s)) {
          return { a: A.arbol, s: S.arbol, aviso: "La fórmula no vale para n = " + x + ": la suma da " + frTexto(acum) +
            " y S(" + x + ") = " + frTexto(s) };
        }
      }
    } catch (e) {
      if (e && e.msjInd) return { a: A.arbol, s: S.arbol, aviso: e.msjInd };
      throw e;
    }
    return { a: A.arbol, s: S.arbol };
  }

  function pasosInd(R, op, color) {
    var L = [], T = Math.max(2, Math.min(5, +op.terminos || 3)), pot = op.potencias !== false;
    var primeros = [];
    for (var j = 1; j <= T; j++) primeros.push(terminoInd(sustInd(R.a, numInd(fr(j))), pot));
    var conVar = function (nom) { return sustInd(R.a, varInd(nom)); };
    // cada paso es un bloque aparte (con sus notas cerca); empieza con su titulo
    var bloques = [];
    var sec = function (t) { L = []; bloques.push(L); var l = LnF(null, null, TF(t, color)); l.sub = true; L.push(l); };
    bloques.push(L);

    // igualdad a demostrar
    var en = sumaInd(primeros.concat(["…", conVar("n")]));
    L.push(LnF(null, null, en.its.concat([TF(" = ")], escribirInd(R.s)), notaF("Para todo n ∈ ℕ", TINTA)));

    // paso 1: n = 1
    sec("Paso 1: Probar para n = 1");
    var izq = primeros[0], der = sustInd(R.s, numInd(fr(1), COLOR_PRODUCTO));
    L.push(LnF(escribirInd(izq), "=", escribirInd(der), notaF("Reemplazar n = 1", COLOR_PRODUCTO)));
    try {
      for (var vuelta = 0; vuelta < 40; vuelta++) {
        var p = Math.max(prioListaInd(izq), prioListaInd(der));
        if (!p) break;
        var hechas = [];
        izq = reducirInd(izq, p, hechas);
        der = reducirInd(der, p, hechas);
        L.push(LnF(escribirInd(izq), "=", escribirInd(der), notaF(notaCuentaInd(hechas), p === 1 ? COLOR_SUMA : COLOR_PRODUCTO)));
      }
      var ok = frIgual(valInd(izq), valInd(der));
      L[L.length - 1].der.push(MarcaF(ok));
      if (!ok) L.push(libreF(LnF(null, null, TF("No se cumple para n = 1", COLOR_MAL))));
    } catch (e) {
      if (!(e && e.msjInd)) throw e;
      L.push(libreF(LnF(null, null, TF(e.msjInd, COLOR_MAL))));
    }

    // paso 2: hipotesis de induccion
    sec("Paso 2: Plantear para n = k (hipótesis de inducción)");
    var Sk = sustInd(R.s, varInd("k"));
    var hi = sumaInd(primeros.concat(["…", conVar("k")]));
    var lHi = LnF(null, null, hi.its.concat([TF(" = ")], escribirInd(Sk)));
    lHi.caja = COLOR_HI;
    L.push(lHi);

    // paso 3: n = k + 1
    sec("Paso 3: Probar para n = k + 1");
    var k1 = function () { var s = opInd("+", varInd("k"), numInd(fr(1))); s.color = COLOR_PRODUCTO; return s; };
    var ak1 = sustInd(R.a, k1()), Sk1 = sustInd(R.s, k1());
    var te = sumaInd(primeros.concat(["…", conVar("k"), ak1]));
    var mk = te.marcas[te.marcas.length - 2], mUlt = te.marcas[te.marcas.length - 1], m0 = te.marcas[0];
    var lTe = LnF(null, null, te.its.concat([TF(" = ")], escribirInd(Sk1)), notaF("Reemplazar n = k + 1", COLOR_PRODUCTO));
    lTe.arriba = [{ de: m0.de, a: mk.a, texto: "k términos", color: COLOR_SUMA },
      { de: mUlt.de, a: mUlt.a, texto: "término k + 1", color: COLOR_SUMA }];
    marcarF(lTe, m0.de, mk.a, ["Aplicar hipótesis de inducción"], COLOR_HI);
    L.push(lTe);
    // los k primeros terminos pasan a ser S(k); lo lineal en k, simplificado
    var SkHi = copiar(Sk);
    SkHi.color = COLOR_HI;
    // el miembro derecho queda como se escribio al reemplazar n = k + 1 (no se toca);
    // la version simplificada solo guia los pasos del izquierdo
    var ak1s = simplificarInd(ak1, "k"), Tk1 = simplificarInd(Sk1, "k");
    var suma = sumaInd([SkHi, ak1s]);
    var lHiAp = LnF(suma.its, "=", escribirInd(Sk1));
    L.push(lHiAp);
    // se trabaja el miembro izquierdo hasta llegar a S(k + 1)
    if (op.resolver) {
      var res = resolverInd(limpioInd(Sk), limpioInd(ak1s), limpioInd(Tk1), planoItsInd(suma.its), sinColorInd(Sk1));
      res.pasos.forEach(function (p) {
        L.push(LnF(escribirInd(p.n), "=", escribirInd(Sk1), notaF(p.nota, p.color)));
      });
      if (res.ok) {
        L[L.length - 1].der.push(MarcaF(true));
        L.push(libreF(LnF(null, null, TF("Vale para n = k + 1: por inducción, vale para todo n ∈ ℕ", color))));
      } else {
        L.push(libreF(LnF(null, null, TF("(El resto queda para completar a mano)", GUIA))));
      }
    }
    return bloques;
  }

  function generarInduccion(op, ox, oy, agregar) {
    var fuente = FUENTES[op.fuente] || FUENTES.normal, tam = TAMANOS[op.tamTexto] || 20, lh = tam * fuente.lh;
    var y = oy;
    op.filas.forEach(function (fila) {
      var R = analizarInd(fila);
      if (R.error) return;
      if (op.titulos) {
        var ts = tamTitulo(tam);
        agregar(texto(ox, y, "Demostración por inducción", ts, fuente, fila.color, "left"));
        y += ts * fuente.lh + lh * 0.4;
      }
      pasosInd(R, op, fila.color).forEach(function (b) {
        y = dibujarBloqueF(b, ox + (op.titulos ? tam : 0), y, op, agregar) + lh * 0.8;
      });
      y += lh * 1.2;
    });
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
        ui.seg("Tamaño", "tamano", [["mini", "Mini"], ["chico", "Chico"], ["medio", "Medio"], ["grande", "Grande"]]);
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
          ui.seg("Simplificar como", "forma", [
            ["fnd", "∨ de ∧ (FND)", "FND: forma normal disyuntiva. Una disyunción (∨) de conjunciones (∧) " +
              "de variables o sus negaciones. Ej: (p ∧ q) ∨ (¬p ∧ r)"],
            ["fnc", "∧ de ∨ (FNC)", "FNC: forma normal conjuntiva. Una conjunción (∧) de disyunciones (∨) " +
              "de variables o sus negaciones. Ej: (p ∨ q) ∧ (¬p ∨ r)"]]);
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
        simplificar: true, indices: true, circuito: true, soloNand: false, soloNor: false, circuitoDe: "ambas",
        compuertas: "altas", negacion: "prima", producto: "junto", tamTexto: "M", fuente: "normal", titulos: true,
      },
      contenido: ["filas", "nVars", "nombres"],
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
        ui.chk("Circuito solo con compuertas NAND", "soloNand", true);
        ui.chk("Circuito solo con compuertas NOR", "soloNor", true);
        if (op.circuito || op.soloNand || op.soloNor) {
          ui.seg("Circuito de", "circuitoDe", [["escrita", "La escrita"], ["simple", "La simplificada"], ["ambas", "Ambas"]]);
          ui.seg("Compuertas", "compuertas", [["altas", "Altas (sin pliegues)"], ["medianas", "Medianas"],
            ["justas", "Justas (con pliegues)"]]);
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
        universo: "finito", universoTexto: "1, 2, ..., 10", conCero: false, conFuncion: false,
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
      contenido: ["filas", "universo", "universoTexto", "conCero", "conFuncion"],
      agregarFila: "+ Conjunto",
      placeholder: "{1, 2, 3}  o  x => x > 2  o  A ∪ B",
      nombreFila: { porDefecto: nombreConj, titulo: "Nombre del conjunto: A, B, C..." },
      extrasFila: [
        // funcion que se aplica a cada elemento: {2x / x ∈ ℕ}
        { clave: "imagen", etiqueta: "Elementos",
          placeholder: "Ej: x => 2*x   (vacío = x)",
          titulo: "Función anónima que se aplica a cada elemento: con x => 2*x la fila da {2x / x ∈ U ∧ condición}. " +
            "Vacío = los elementos tal cual. Si la fila también está vacía, se toma todo U",
          // solo con «Aplicar una función a los elementos»
          visible: function (op) { return !!op.conFuncion; },
          errores: erroresImagenConjunto },
      ],
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
        "Con «Aplicar una función a los elementos», en «Elementos» va una función anónima que se aplica a cada uno (vacío = el mismo elemento): con x => 2*x y la fila " +
        "vacía queda {2x / x ∈ U}; con x => 2*x y x => x < 5, {2x / x ∈ U ∧ x < 5}. " +
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
          ui.chk("Aplicar una función a los elementos ({2x / x ∈ U})", "conFuncion", "filas");
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

    venn: {
      titulo: "Diagrama de Venn",
      dibujo: "diagrama", femenino: false,
      clave: "pizarra-generador-venn",
      defecto: {
        nombres: "A, B, C",
        filas: [
          { texto: "U = 60", color: COLORES[0] },
          { texto: "solo A = 15", color: COLORES[1] },
          { texto: "|A ∩ B| = 11", color: COLORES[2] },
          { texto: "solo C = 12", color: COLORES[3] },
          { texto: "|A ∩ C| = 8", color: COLORES[4] },
          { texto: "solo B = 10", color: COLORES[5] },
          { texto: "|B ∩ C| = 5", color: COLORES[0] },
          { texto: "los tres = 3", color: COLORES[1] },
        ],
        variables: "x, y, z, w, v, t", mostrar: "resuelto",
        tamano: "medio", tamTexto: "M", fuente: "normal", cardinales: "datos", trazos: "distintos",
        colores: false, datos: true, referencias: true, ecuaciones: false, pasos: true,
        variableYValor: false, textos: "derecha", titulos: true,
      },
      contenido: ["filas", "nombres", "variables"],
      agregarFila: "+ Dato",
      placeholder: "Ej: |A| = 23  ·  solo A = 8  ·  A ∩ B − C = x",
      simbolos: [["| |", "|", "Barras del cardinal: |A ∩ B| = 11"], ["∩", " ∩ ", "Intersección"], ["∪", " ∪ ", "Unión"],
        ["−", " − ", "Diferencia"], ["A'", "'", "Complemento respecto de U (se escribe después: A')"],
        ["solo", "solo ", "Zona de un solo conjunto (solo A) o de varios y ninguno más (solo A y B)"],
        ["ninguno", "ninguno = ", "Zona fuera de todos los conjuntos"], ["todos", "los tres = ", "Zona común a todos"],
        ["U", "U = ", "Total del universo"]],
      ayuda: "Arriba van los nombres de los conjuntos (2, 3 o 4). Cada fila es un dato: el cardinal de " +
        "un conjunto o de una expresión (|A| = 23, |A ∩ B| = 11, que incluye la zona común a todos, " +
        "|A ∪ B| = 30, A − B = 4, (A ∪ B)' = 2), de una zona (solo A = 8, solo A y B = 6, " +
        "A y B pero no C = 6, los tres = 5, ninguno = 0) o del universo (U = 38). También se puede " +
        "nombrar la variable de una zona: solo A = x. Las zonas sin dato se llaman con las variables de " +
        "arriba y se calculan resolviendo las ecuaciones que dan los datos; si no alcanzan o no cierran, " +
        "la última fila lo avisa. «Planteo» dibuja los datos y las variables; «Resuelto», el resultado. " +
        "Seleccioná un diagrama ya insertado para editarlo.",
      erroresFila: erroresVenn,
      avisos: avisosVenn,
      posicion: function (op, cx, cy) { return { x: cx - 380, y: cy - 220 }; },
      generar: function (op, ox, oy, agregar) {
        conTitulo(op.titulos && "Diagrama de Venn", TAMANOS[op.tamTexto] || 20, FUENTES[op.fuente] || FUENTES.normal,
          agregar, function (ag) { generarVenn(op, ox, oy, ag); });
      },
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.campos("Conjuntos", [{ clave: "nombres", prefijo: "", texto: true, ancho: 150,
            titulo: "Nombres de los conjuntos (2, 3 o 4), separados por coma: A, B, C" }],
          function () { return leerNombresVenn(op).error || ""; });
          ui.campos("Variables", [{ clave: "variables", prefijo: "", texto: true, ancho: 150,
            titulo: "Nombres para las zonas sin dato, en orden: primero las de un solo conjunto, " +
              "después las de dos, tres..., y al final la de afuera (ninguno)" }]);
          ui.seg("Mostrar", "mostrar", [["planteo", "Planteo (datos y variables)"], ["resuelto", "Resuelto"]], true);
        });
        ui.seg("Tamaño", "tamano", [["chico", "Chico"], ["medio", "Medio"], ["grande", "Grande"]]);
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.seg("Cardinales", "cardinales", [["no", "No"], ["datos", "Los datos", "Junto al nombre, |A| = 23 si es un dato"],
          ["todos", "Todos", "También los calculados (en el resuelto)"]]);
        ui.seg("Contornos", "trazos", [["distintos", "Distintos ─ ╌ ┈", "Cada conjunto con un trazo distinto (para imprimir en blanco y negro)"],
          ["iguales", "Iguales"]]);
        ui.seg("Textos", "textos", [["derecha", "A la derecha"], ["debajo", "Debajo"]]);
        ui.chk("Escribir los datos", "datos");
        ui.chk("Escribir qué zona es cada variable", "referencias");
        ui.chk("Escribir las ecuaciones del planteo", "ecuaciones");
        if (op.mostrar !== "planteo") {
          ui.chk("Escribir la resolución (cómo se calcula cada variable)", "pasos");
          ui.chk("En cada zona, la variable y su valor (x = 6)", "variableYValor");
        }
        ui.chk("Conjuntos en colores", "colores");
        ui.chk("Título («Diagrama de Venn»)", "titulos");
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
        escribir: true, mostrarDef: true, dominio: false, propiedades: true, propDetalle: false, clases: false, clasesGrafo: true,
        cartesiano: true, sagital: true, grafo: true, titulos: true,
      },
      contenido: ["filas"],
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
      opciones: function (ui, op) {
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
        ui.chk("Propiedades (relaciones en A × A)", "propiedades", true);
        if (op.propiedades) {
          ui.chk("Explicación detallada de cada propiedad (definiciones y contraejemplo con tabla de verdad)", "propDetalle");
        }
        ui.chk("Clases de equivalencia y conjunto cociente (si es de equivalencia)", "clases", true);
        if (op.clases) ui.chk("Dibujar las clases en un grafo dirigido", "clasesGrafo");
        ui.chk("Títulos de los diagramas («Diagrama sagital»...)", "titulos");
      },
    },

    estructuras: {
      titulo: "Estructuras",
      dibujo: "desarrollo", femenino: false,
      clave: "pizarra-generador-estructuras",
      defecto: {
        tipo: "par",
        filas: [{ texto: "x * y = x + y - 3", conjunto: "ℤ", color: COLORES[0] }],
        lci: true, asociativa: true, conmutativa: false, neutro: true, inverso: true, distributiva: true,
        tamTexto: "M", fuente: "normal", titulos: true, general: true, escribirOperacion: true, guias: true,
      },
      contenido: ["filas", "tipo"],
      agregarFila: "+ Operación",
      maxFilas: cantidadOpsEst,
      minFilas: cantidadOpsEst,
      placeholder: "Ej: x * y = x + y - 3",
      extrasFila: [
        { clave: "conjunto", etiqueta: "en", placeholder: "ℤ, ℝ, A... (vacío = A)",
          titulo: "Conjunto de la estructura algebraica",
          visible: function (op, i) { return i === 0; },
          errores: function () { return []; } },
      ],
      simbolos: [["∘", " ∘ ", "Escribe ∘"], ["△", " △ ", "Escribe △"], ["⊕", " ⊕ ", "Escribe ⊕"],
        ["·", "·", "Producto"], ["ℕ", "ℕ", "Naturales"], ["ℤ", "ℤ", "Enteros"], ["ℚ", "ℚ", "Racionales"], ["ℝ", "ℝ", "Reales"]],
      ayuda: "Elegí par ordenado (A, *) con una operación o terna ordenada (A, *, ∘) con dos. " +
        "Cada fila es una operación: x * y = x + y - 3, x ∘ y = 2xy, a △ b = (a + b)/2; " +
        "el símbolo es lo que está entre las dos variables y el conjunto va en la primera fila. " +
        "Para cada propiedad se escribe «Estudio de ...», la definición general (sobre A, con * para la 1.ª " +
        "operación y + para la 2.ª) y la aplicada a la estructura; en la ley de composición interna sigue " +
        "la aplicada con la operación reemplazada por su definición. Después, el desarrollo de la expresión " +
        "reemplazando la operación por su definición paso a paso, sin resolver, alineado en el «=». El neutro y el inverso tienen su definición general y " +
        "una subsección por derecha y otra por izquierda. Cada par (A, *) es su propia sección. " +
        "La distributiva (solo en la terna) es de la primera operación respecto de la segunda. " +
        "Seleccioná un desarrollo ya insertado para editarlo.",
      erroresFila: function (t) { var d = leerOperacion(t); return d.error ? [d.error] : []; },
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 200 }; },
      generar: generarEstructuras,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.seg("Estructura", "tipo", [["par", "Par ordenado (A, *)", "Una operación"],
            ["terna", "Terna ordenada (A, *, ∘)", "Dos operaciones"]], "filas");
          ui.chk("Ley de composición interna", "lci");
          ui.chk("Asociatividad", "asociativa");
          ui.chk("Conmutatividad", "conmutativa");
          ui.chk("Elemento neutro (por derecha y por izquierda)", "neutro");
          ui.chk("Elemento inverso (por derecha y por izquierda)", "inverso");
          if (op.tipo === "terna") ui.chk("Distributividad de la 1.ª operación respecto de la 2.ª", "distributiva");
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Escribir la operación", "escribirOperacion");
        ui.chk("Títulos de las propiedades", "titulos");
        ui.chk("Escribir la definición general", "general");
        ui.chk("Líneas de tabulación (inicio y fin de cada sección)", "guias");
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

    combExpr: {
      titulo: "Expresiones combinatorias",
      dibujo: "desarrollo", femenino: false,
      clave: "pizarra-generador-comb-expresiones",
      defecto: {
        filas: [{ texto: "V^4_3 + 3V^4_2 = V^5_3", color: COLORES[0] }],
        notacion: "apilada", repeticion: "R", binomial: false,
        notas: true, tachar: true, titulos: true, verificar: true, tamTexto: "L", fuente: "codigo",
      },
      contenido: ["filas"],
      agregarFila: "+ Expresión",
      placeholder: "Ej: V^4_3 + 3V^4_2 = V^5_3  ·  V^x_2 = 30",
      simbolos: [["V", "V^", "Variaciones: V^4_3 (n = 4 arriba, k = 3 abajo) o V(4, 3)"],
        ["C", "C^", "Combinaciones: C^5_2 o C(5, 2); también (5 2), el número combinatorio"],
        ["P", "P_", "Permutaciones: P_5 o P(5)"], ["VR", "VR^", "Variaciones con repetición: VR^3_2 o VR(3, 2)"],
        ["CR", "CR^", "Combinaciones con repetición: CR^4_2 o CR(4, 2)"],
        ["PR", "PR(", "Permutaciones con repetición: PR(6; 3, 2)"],
        ["^", "^", "Arriba: n (o el exponente de una potencia)"], ["_", "_", "Abajo: k"],
        ["!", "!", "Factorial: 5!"], ["·", " · ", "Producto (también * o pegado: 3V^4_2)"], ["/", "/", "Fracción o división"],
        ["=", " = ", "Igualdad a verificar o ecuación"], ["x", "x", "Incógnita (una letra minúscula): V^x_2 = 30, V^{x+1}_3"]],
      ayuda: "Cada fila es una expresión con números combinatorios, o una igualdad a verificar: V^4_3 + 3V^4_2 = V^5_3. " +
        "Se escriben V^4_3 o V(4, 3) (n = 4 arriba, k = 3 abajo), C^5_2, C(5, 2) o (5 2), P_5, VR^3_2, CR^4_2 y PR(6; 3, 2) " +
        "(también V' y C'); factorial con !, producto con · o * (o pegado: 3V^4_2), fracción con / y paréntesis. " +
        "Se resuelve paso a paso: definición de cada uno, cuentas dentro de los factoriales, propiedad n! = n · (n − 1)! " +
        "para simplificar (tachando), 0! = 1, desarrollo de los factoriales y las cuentas de a una. En una igualdad se " +
        "resuelve cada miembro y se comparan los resultados. Con una incógnita (una letra minúscula: V^x_2 = 30, C^x_{x-2} = 10, " +
        "P_{x+1} = 6P_{x-1}) se resuelve la ecuación: condición, simplificación, dividir por lo que no es 0, polinomio, " +
        "resolvente o factor común, descarte de lo que no cumple la condición, conjunto solución y verificación. " +
        "Seleccioná un desarrollo ya insertado para editarlo.",
      erroresFila: function (t) { var r = leerCE(t); return r.error ? [r.error] : []; },
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 250 }; },
      generar: generarCombExpr,
      opciones: function (ui) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.seg("Notación", "notacion", [["apilada", "V⁴₃ (n arriba)"], ["sub", "V₄,₃"], ["paren", "V(4, 3)"]]);
          ui.chk("Combinaciones como número combinatorio (n sobre k)", "binomial");
          ui.chk("Escribir qué se hace en cada paso", "notas");
          ui.chk("Tachar lo que se simplifica", "tachar");
          ui.chk("Enunciado («Demostrar que…», «Resolver…») y miembros", "titulos");
          ui.chk("En una ecuación: verificar las soluciones", "verificar");
        });
        ui.seg("Con repetición", "repeticion", [["R", "VR, CR, PR"], ["prima", "V', C', P'"]]);
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
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

    bezout: {
      titulo: "Identidad de Bézout",
      dibujo: "desarrollo", femenino: false,
      clave: "pizarra-generador-bezout",
      defecto: {
        filas: [{ texto: "252, 198", color: COLORES[0] }],
        mSustitucion: true, mTabla: false, despejes: true, verificar: true, notas: true, titulos: true,
        tamTexto: "L", fuente: "codigo",
      },
      contenido: ["filas"],
      agregarFila: "+ Números",
      placeholder: "Ej: 252, 198",
      simbolos: [],
      ayuda: "Cada fila son dos números naturales separados por coma: 252, 198. Con el algoritmo de Euclides " +
        "se calcula el mcd y se lo escribe como mcd(a, b) = a · s + b · t. Por sustitución: se despejan los restos " +
        "y se reemplazan de abajo hacia arriba, un paso por renglón (reemplazar, distributiva, agrupar), con lo que " +
        "se hace anotado en el renglón anterior. Con la tabla: el algoritmo de Euclides extendido (columnas q, r, s, t). " +
        "Seleccioná un desarrollo ya insertado para editarlo.",
      erroresFila: function (t, op) {
        var l = leerBezout(t);
        if (l.error) return [l.error];
        return op && !op.mSustitucion && !op.mTabla ? ["Marcá al menos un método"] : [];
      },
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 250 }; },
      generar: generarBezout,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.grupo("Métodos", ["mSustitucion", "mTabla"]);
          ui.chk("Euclides y sustitución hacia atrás", "mSustitucion");
          ui.chk("Tabla de Euclides extendido", "mTabla", true);
          if (op.mSustitucion) ui.chk("Despejar todos los restos antes de sustituir", "despejes");
          ui.chk("Verificar el resultado", "verificar");
          ui.chk("Escribir qué se hace en cada paso", "notas");
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Nombre de cada método", "titulos");
      },
    },

    valorAbsoluto: {
      titulo: "Expresiones con valor absoluto",
      dibujo: "plantilla", femenino: true,
      clave: "pizarra-generador-valor-absoluto",
      defecto: {
        filas: [{ texto: "|x + 7/4| = 9/4", color: "#e64980" }],
        modoAbs: "resolver", casos: "noEstricto", renglones: 4, notas: true, recta: true,
        tamTexto: "L", fuente: "codigo", colorLineas: true, estiloRecta: "rayado",
      },
      contenido: ["filas"],
      agregarFila: "+ Ecuación",
      placeholder: "Ej: |x + 7/4| = 9/4",
      simbolos: [["|", "|", "Barra del valor absoluto: |x + 1|"], ["−", " − ", "Resta"], ["·", "·", "Producto"],
        ["≤", " ≤ ", "Menor o igual"], ["≥", " ≥ ", "Mayor o igual"]],
      ayuda: "Cada fila es una ecuación (o inecuación) con valor absoluto: |x + 7/4| = 9/4. Se separa en los " +
        "dos casos del valor absoluto de más a la izquierda (E ≥ 0 → |E| = E y E < 0 → |E| = −(E)). " +
        "«Plantilla» deja espacio debajo de cada caso para resolverlo en clase; «Resolver paso a paso» resuelve " +
        "la condición y el caso (lineales, hasta 3 valores absolutos: si queda otro, se vuelve a separar en casos) escribiendo cada paso de la propiedad " +
        "uniforme en color, interseca y da el conjunto solución. Seleccioná una ya insertada para editarla.",
      erroresFila: function (t, op) {
        var a = leerEcuacionAbs(t);
        if (a.error) return [a.error];
        if (op && op.modoAbs !== "plantilla") {
          var r = resolverAbs(a, op.casos === "estricto");
          if (r.error) return [r.error];
        }
        return [];
      },
      posicion: function (op, cx, cy) { return { x: cx - 250, y: cy - 200 }; },
      generar: generarAbs,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          // «modoAbs» (y no «modo»): las opciones guardadas antes, con la plantilla
          // por defecto, no cuentan como elegidas; resolver es lo de fabrica
          ui.seg("Modo", "modoAbs", [["resolver", "Resolver paso a paso"], ["plantilla", "Plantilla"]], true);
          ui.seg("Casos", "casos", [["noEstricto", "E ≥ 0 y E < 0"], ["estricto", "E > 0 y E ≤ 0"]]);
          if (op.modoAbs !== "plantilla") {
            ui.chk("Escribir qué se hizo en cada paso", "notas");
            ui.chk("Recta real en cada caso", "recta");
            ui.seg("Estilo de la recta", "estiloRecta", [["rayado", "Rayado [ ]"], ["lineas", "Líneas ●—○"]]);
          } else {
            ui.campos("Espacio para resolver", [
              { clave: "renglones", prefijo: "", sufijo: "renglones por caso", numero: [0, 20], ancho: 52,
                titulo: "Renglones en blanco debajo de cada caso" },
            ]);
          }
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Llave y flechas en el color de la fila", "colorLineas");
      },
    },

    inecuaciones2: {
      titulo: "Inecuaciones de segundo grado",
      dibujo: "resolución", femenino: true,
      clave: "pizarra-generador-inecuaciones2",
      defecto: {
        filas: [{ texto: "0 < (5x − 2)(3 − 6x)", color: "#e64980" }],
        notas: true, recta: true, colorLineas: true, tamTexto: "L", fuente: "codigo", estiloRecta: "rayado",
      },
      contenido: ["filas"],
      agregarFila: "+ Inecuación",
      placeholder: "Ej: (5x − 2)(3 − 6x) > 0  ·  x² − 5x + 6 ≤ 0",
      simbolos: [["x²", "x²", "x al cuadrado (también x^2)"], ["−", " − ", "Resta"], ["<", " < ", "Menor"], [">", " > ", "Mayor"],
        ["≤", " ≤ ", "Menor o igual"], ["≥", " ≥ ", "Mayor o igual"]],
      ayuda: "Cada fila es una inecuación de segundo grado: factorizada, (5x − 2)(3 − 6x) > 0 o 0 < (5x − 2)(3 − 6x) " +
        "(puede tener un número adelante: 2(x − 1)(x + 3) ≤ 0), o desarrollada, x² − 5x + 6 ≤ 0 (se factoriza con la fórmula " +
        "cuadrática; también con raíces irracionales). Con la regla de los signos se separa en dos casos (+·+ ∨ −·− o +·− ∨ −·+); en cada uno se " +
        "resuelven las dos inecuaciones lineales paso a paso, se intersecan y al final se unen. " +
        "Seleccioná una ya insertada para editarla.",
      erroresFila: function (t) { var I = leerInecuacion2(t); return I.error ? [I.error] : []; },
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 250 }; },
      generar: generarInecuaciones2,
      opciones: function (ui) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.chk("Escribir qué se hizo en cada paso", "notas");
          ui.chk("Recta real en cada caso", "recta");
          ui.seg("Estilo de la recta", "estiloRecta", [["rayado", "Rayado [ ]"], ["lineas", "Líneas ●—○"]]);
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Llave y flechas en el color de la fila", "colorLineas");
      },
    },

    racionales: {
      titulo: "Inecuaciones racionales",
      dibujo: "resolución", femenino: true,
      clave: "pizarra-generador-racionales",
      defecto: {
        filas: [{ texto: "(2x + 1)/(3 − 4x) < −2", color: "#e64980" }],
        notas: true, recta: true, colorLineas: true, tamTexto: "L", fuente: "codigo", estiloRecta: "rayado",
      },
      contenido: ["filas"],
      agregarFila: "+ Inecuación",
      placeholder: "Ej: (2x + 1)/(3 − 4x) < −2",
      simbolos: [["/", "/", "Fracción: (2x + 1)/(3 − 4x)"], ["−", " − ", "Resta"], ["<", " < ", "Menor"], [">", " > ", "Mayor"],
        ["≤", " ≤ ", "Menor o igual"], ["≥", " ≥ ", "Mayor o igual"]],
      ayuda: "Cada fila es una inecuación racional: una fracción con numerador y denominador lineales y del otro lado " +
        "un número, (2x + 1)/(3 − 4x) < −2 (la fracción puede ir a cualquier lado). Si el número no es 0 se pasa al " +
        "otro miembro, se suman las fracciones con el denominador común y se simplifica el numerador; después, con la " +
        "regla de los signos (+/+ ∨ −/− o +/− ∨ −/+, el denominador nunca 0) se resuelven los dos casos paso a paso, " +
        "se intersecan y se unen. Seleccioná una ya insertada para editarla.",
      erroresFila: function (t) { var I = leerInecuacionRacional(t); return I.error ? [I.error] : []; },
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 250 }; },
      generar: generarRacionales,
      opciones: function (ui) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.chk("Escribir qué se hizo en cada paso", "notas");
          ui.chk("Recta real en cada caso", "recta");
          ui.seg("Estilo de la recta", "estiloRecta", [["rayado", "Rayado [ ]"], ["lineas", "Líneas ●—○"]]);
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Llave y flechas en el color de la fila", "colorLineas");
      },
    },

    factorizacion: {
      titulo: "Factorización de polinomios de 2.º grado",
      dibujo: "factorización", femenino: true,
      clave: "pizarra-generador-factorizacion",
      defecto: {
        filas: [{ nombre: "", texto: "6x² − 7x − 3", color: COLORES[0] }],
        mFormula: true, mCompletar: true, mDescomposicion: true, discriminante: true, notas: true, titulos: true,
        tamTexto: "L", fuente: "codigo",
      },
      contenido: ["filas"],
      agregarFila: "+ Polinomio",
      placeholder: "Ej: 6x² − 7x − 3",
      nombreFila: { porDefecto: nombrePoli, titulo: "Nombre del polinomio: P, Q, R... o P(x)" },
      simbolos: [["x²", "x²", "x al cuadrado (también x^2 o x2)"], ["−", " − ", "Resta"], ["/", "/", "Fracción: 5/2x²"]],
      ayuda: "Cada fila es un polinomio de segundo grado: 6x² − 7x − 3 (también 6x^2 - 7x - 3 o 6x2 - 7x - 3; " +
        "con fracciones: 5/2x² + 14/3x + 2). Se factoriza por los métodos marcados, con cada paso y lo que se " +
        "hace en el renglón anterior, en el color del paso: fórmula cuadrática, completar el cuadrado y " +
        "descomposición (caso 1: b = a + c; caso 2: a = 1; caso 3: p + q = b y p · q = a · c, previo factor común " +
        "y análisis del discriminante). Al final de cada método se escribe el polinomio factorizado. " +
        "Seleccioná una factorización ya insertada para editarla.",
      erroresFila: function (t, op) {
        var P = leerPoli(t);
        if (P.error) return [P.error];
        return op && !op.mFormula && !op.mCompletar && !op.mDescomposicion ? ["Marcá al menos un método"] : [];
      },
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 250 }; },
      generar: generarFactorizacion,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.grupo("Métodos", ["mFormula", "mCompletar", "mDescomposicion"]);
          ui.chk("Fórmula cuadrática", "mFormula");
          ui.chk("Completar el cuadrado", "mCompletar");
          ui.chk("Descomposición", "mDescomposicion", true);
          if (op.mDescomposicion) ui.chk("Analizar el discriminante (descomposición)", "discriminante");
          ui.chk("Escribir qué se hace en cada paso", "notas");
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Nombre de cada método", "titulos");
      },
    },

    induccion: {
      titulo: "Inducción matemática",
      dibujo: "demostración", femenino: true,
      clave: "pizarra-generador-induccion",
      defecto: {
        filas: [{ texto: "5^(n − 1)", suma: "1/4(5^n − 1)", color: COLORES[4] }],
        terminos: 3, potencias: true, resolver: true, notas: true, titulos: true, tamTexto: "L", fuente: "codigo",
      },
      contenido: ["filas"],
      agregarFila: "+ Sucesión",
      placeholder: "Término general a(n). Ej: 5^(n − 1)",
      extrasFila: [
        { clave: "suma", etiqueta: "Suma",
          placeholder: "Suma de los n primeros. Ej: 1/4(5^n − 1)",
          titulo: "Fórmula de la suma de los n primeros términos, S(n): 1/4(5^n − 1), (5^n − 1)/4, n(n + 1)/2...",
          errores: function (f) {
            var R = analizarInd(f);
            return R.error ? (R.enSuma ? [R.error] : []) : R.aviso ? [R.aviso] : [];
          } },
      ],
      simbolos: [["n", "n", "La variable"], ["^", "^", "Potencia: 5^(n − 1)"], ["²", "^2", "Al cuadrado"],
        ["−", " − ", "Resta"], ["/", "/", "Fracción o división: 1/4(5^n − 1) o n(n + 1)/2"], ["!", "!", "Factorial"]],
      ayuda: "Cada fila es una sucesión: su término general a(n) (5^(n − 1), 2n − 1, n^2, 1/(n(n + 1))...) y, en " +
        "«Suma», la fórmula de la suma de los n primeros términos (1/4(5^n − 1), n^2, n/(n + 1)...). Potencia con ^ " +
        "(o ², ⁿ), fracciones con / y factorial con !. 1/4(5^n − 1) se lee (1/4)·(5^n − 1). Se escribe la igualdad a " +
        "demostrar con los primeros términos, el paso 1 (n = 1, con las cuentas de a una), la hipótesis de inducción " +
        "(n = k) y el paso 3 (n = k + 1), donde los k primeros términos se reemplazan por la hipótesis. " +
        "Con «Resolver el paso 3» se sigue hasta llegar a S(k + 1): factor común, potencias de igual base, " +
        "denominador común, factoriales; si no sabe seguir, lo deja indicado (cada renglón se controla con números). " +
        "Si la fórmula no vale para algún n, se avisa debajo de la fila. " +
        "Seleccioná una demostración ya insertada para editarla.",
      erroresFila: function (t, op, i) {
        var R = analizarInd({ texto: t, suma: op && op.filas[i] ? op.filas[i].suma : "" });
        return R.error && !R.enSuma ? [R.error] : [];
      },
      posicion: function (op, cx, cy) { return { x: cx - 350, y: cy - 280 }; },
      generar: generarInduccion,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.campos("Primeros términos", [{ clave: "terminos", prefijo: "Escribir", sufijo: "términos antes de «…»",
            numero: [2, 5], ancho: 50 }]);
          ui.chk("Dejar las potencias sin calcular (1 + 5 + 5² + …)", "potencias");
          ui.chk("Resolver el paso 3 (hasta llegar a S(k + 1))", "resolver");
          ui.chk("Escribir qué se hace en cada paso", "notas");
        });
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Título", "titulos");
      },
    },

    raicesC: {
      titulo: "Raíces n-ésimas",
      dibujo: "cálculo", femenino: false,
      clave: "pizarra-generador-raices-complejas",
      defecto: {
        filas: [{ nombre: "z", texto: "8i", n: "3", color: COLORES[0] }],
        fBinomica: true, fTrig: false, grafico: true, angulosC: false, cuadriculaC: true, paralelogramo: false,
        columnas: 1,
        tamGrafico: "medio", posGrafico: "derecha", unidad: "grados", rango: "360", decimales: 2,
        notacionPolar: "corchetes", tamTexto: "M", fuente: "normal", titulos: true,
      },
      contenido: ["filas"],
      agregarFila: "+ Raíz",
      placeholder: "Número: 8i  ·  1 + i  ·  [16; 60°]",
      nombreFila: { porDefecto: nombreRaizC, titulo: "Nombre del número: z, w, z₁..." },
      extrasFila: [
        { clave: "n", etiqueta: "Índice n", placeholder: "Ej: 3 (raíces cúbicas)",
          titulo: "Cuántas raíces: 2 = cuadradas, 3 = cúbicas, 4 = cuartas... (de 2 a 12)",
          errores: function (f) { var r = leerIndiceRaiz(f.n); return r.error ? [r.error] : []; } },
      ],
      simbolos: [["i", "i", "Unidad imaginaria"], ["°", "°", "Grados"], ["π", "π", "Pi, para ángulos en radianes"],
        ["∠", "∠", "Forma polar: 8∠90°"], ["√", "√", "Raíz: √3"]],
      ayuda: "Cada fila es un número complejo en cualquier forma (8i, 1 + i, (3, 4), [16; 60°], " +
        "2(cos 30° + i sen 30°)) y debajo el índice n. Se pasa a forma polar y con la fórmula de De Moivre se " +
        "calculan las n raíces: el módulo √[n](ρ), el argumento de cada una ((φ + k · 360°) / n, k = 0, …, n − 1) " +
        "y cada raíz en forma polar (y binómica o trigonométrica). El gráfico las muestra sobre la circunferencia " +
        "de radio √[n](ρ). Seleccioná un cálculo ya insertado para editarlo.",
      erroresFila: function (t) { var c = leerComplejo(t); return c.error ? [c.error] : []; },
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 250 }; },
      generar: generarRaicesC,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.chk("Escribir las raíces en forma binómica", "fBinomica");
          ui.chk("Escribir las raíces en forma trigonométrica", "fTrig");
          ui.seg("Raíces en", "columnas", [[1, "1 columna"], [2, "2 columnas"]]);
          ui.chk("Graficar en el plano complejo", "grafico", true);
          if (op.grafico) {
            ui.chk("Ángulos (arco del argumento)", "angulosC");
            ui.chk("Cuadrícula", "cuadriculaC");
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
        ui.chk("Títulos de los pasos", "titulos");
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
        "z₁ + z₂, z₁ − z₂, z₁ · z₂, z₁ / z₂ (se puede escribir z1 en vez de z₁), o con varias operaciones y " +
        "números reales: 2 · z₁ / z₂, (z₁ + z₂) · z₃, |z₁| / |z₂| (cada operación y cada módulo se resuelven en un paso aparte). Se escribe el pasaje a las " +
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
    razonamientos: {
      titulo: "Razonamiento deductivo",
      dibujo: "razonamiento", femenino: false,
      clave: "pizarra-generador-razonamientos",
      defecto: {
        filas: [{ texto: "p → q, ¬q ∴ ¬p", color: COLORES[0] }],
        mTabla: true, mCondicional: true, mAbreviado: true, mDemostracion: true, reglas: true, titulos: true,
        valores: "VF", tamTexto: "M", fuente: "codigo",
      },
      contenido: ["filas"],
      agregarFila: "+ Razonamiento",
      placeholder: "Ej: p → q, ¬q ∴ ¬p",
      simbolos: [["¬", "¬", "Negación"], ["∧", " ∧ ", "Conjunción"], ["∨", " ∨ ", "Disyunción"],
        ["→", " → ", "Condicional"], ["↔", " ↔ ", "Bicondicional"], [",", ", ", "Separa las premisas"],
        ["∴", " ∴ ", "Antes de la conclusión (también ⊢ o /)"]],
      ayuda: "Cada fila es un razonamiento: las premisas separadas por coma y la conclusión después de ∴ " +
        "(p → q, ¬q ∴ ¬p). Las variables son las letras que aparecen; los conectivos como en las tablas de " +
        "verdad (¬ ~, ∧ &, ∨ |, → ->, ↔ <->). Se muestra si es válido con la tabla de verdad, el condicional " +
        "asociado y el método abreviado, y se busca una demostración con reglas de inferencia (MP, MT, SH, SD...). " +
        "Seleccioná uno ya insertado para editarlo.",
      erroresFila: function (t) { var R = leerRazonamiento(t); return R.error ? [R.error] : []; },
      posicion: function (op, cx, cy) { return { x: cx - 300, y: cy - 250 }; },
      generar: generarRazonamientos,
      opciones: function (ui, op) {
        var tam = Object.keys(TAMANOS).map(function (k) { return [k, k]; });
        ui.arriba(function () {
          ui.grupo("Validez", ["mTabla", "mCondicional", "mAbreviado"]);
          ui.chk("Tabla de verdad", "mTabla");
          ui.chk("Condicional asociado", "mCondicional");
          ui.chk("Método abreviado", "mAbreviado");
          ui.chk("Demostración con reglas de inferencia", "mDemostracion", true);
          if (op.mDemostracion) ui.chk("Escribir las reglas usadas", "reglas");
        });
        ui.seg("Valores", "valores", [["VF", "V / F"], ["10", "1 / 0"]]);
        ui.seg("Texto", "tamTexto", tam);
        ui.seg("Fuente", "fuente", Object.keys(FUENTES).map(function (k) { return [k, FUENTES[k].nombre]; }));
        ui.chk("Nombre de cada método", "titulos");
      },
    },

    simpLogica: genSimp("logica", {
      clave: "pizarra-generador-simp-logica",
      filas: [{ texto: "¬(p → q) ∨ (p ∧ q)", color: COLORES[0] }],
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

  // ------------------------------------------------------------ ejemplos
  // Lo que ofrece el boton «Ejemplos ▾» de cada generador: { nombre, descripcion, op }.
  // `op` tiene solo el contenido (filas y lo que se grafica); al elegirlo, las claves
  // de `contenido` vuelven a su valor predeterminado y despues se aplica `op`, asi no
  // quedan restos del ejemplo anterior. El aspecto elegido se mantiene.
  // Las filas pueden ser textos o objetos; el color se pone en orden si falta.
  function filasEj(lista, primero) {
    return lista.map(function (f, i) {
      var r = typeof f === "string" ? { texto: f } : copiar(f);
      if (!r.color) r.color = i === 0 && primero ? primero : COLORES[i % COLORES.length];
      return r;
    });
  }
  function ej(nombre, descripcion, op) { return { nombre: nombre, descripcion: descripcion, op: op }; }
  var ROSA = "#e64980";

  var EJEMPLOS = {
    recta: [
      ej("Unión de dos intervalos", "[−3, 2) ∪ (0, 5]", { filas: filasEj(["[-3, 2)", "(0, 5]"]), operacion: "union" }),
      ej("Intersección", "[−4, 3] ∩ (1, ∞)", { filas: filasEj(["[-4, 3]", "(1, ∞)"]), operacion: "interseccion" }),
      ej("Intervalos con infinito", "(−∞, −1] ∪ [2, ∞): sin elementos en común", { filas: filasEj(["(-∞, -1]", "[2, ∞)"]), operacion: "union" }),
      ej("Fracciones, π y raíces", "(−π/2, √2] ∪ [1/2, 3)", { filas: filasEj(["(-π/2, √2]", "[1/2, 3)"]), operacion: "union" }),
      ej("Varios intervalos en una fila", "((−5, −2) ∪ [0, 1]) ∩ [−3, 4)", {
        filas: filasEj(["(-5, -2) ∪ [0, 1]", "[-3, 4)"]), operacion: "interseccion" }),
    ],
    funcion: [
      ej("Parábola y recta", "x² − 4 y 2x + 1 (desde x = −2), con puntos marcados", {
        filas: [{ nombre: "f", texto: "x => x**2 - 4", color: COLORES[0], puntos: "-3, -2, -1, 0, 1, 2, 3" },
          { nombre: "g", texto: "x => 2*x + 1", color: COLORES[1], dominio: "x >= -2", puntos: "-2, 0, 2" }],
        xMin: "-4", xMax: "4", yAuto: true }),
      ej("Trigonométricas", "sen x y cos x entre −2π y 2π", {
        filas: [{ nombre: "f", texto: "x => sin(x)", color: COLORES[0] }, { nombre: "g", texto: "x => cos(x)", color: COLORES[1] }],
        xMin: "-2π", xMax: "2π", yAuto: false, yMin: "-2", yMax: "2" }),
      ej("Exponencial y logarítmica", "eˣ y ln x (solo para x > 0)", {
        filas: [{ nombre: "f", texto: "x => exp(x)", color: COLORES[0] },
          { nombre: "g", texto: "x => log(x)", color: COLORES[1], dominio: "x > 0" }],
        xMin: "-3", xMax: "5", yAuto: false, yMin: "-3", yMax: "5" }),
      ej("Valor absoluto y raíz", "|x − 1| y √x", {
        filas: [{ nombre: "f", texto: "x => abs(x - 1)", color: COLORES[0] },
          { nombre: "g", texto: "x => sqrt(x)", color: COLORES[1], dominio: "x >= 0" }],
        xMin: "-3", xMax: "5", yAuto: true }),
      ej("Función definida por partes", "x + 1 si x < 1; 3 − x si x ≥ 1", {
        filas: [{ nombre: "f", texto: "x => x + 1", color: COLORES[0], dominio: "x < 1" },
          { nombre: "f", texto: "x => 3 - x", color: COLORES[0], dominio: "x >= 1" }],
        xMin: "-3", xMax: "5", yAuto: true }),
      ej("Hipérbola", "1/x, con el eje y manual", {
        filas: [{ nombre: "f", texto: "x => 1/x", color: COLORES[0] }],
        xMin: "-4", xMax: "4", yAuto: false, yMin: "-4", yMax: "4" }),
    ],
    tabla: [
      ej("Modus ponens (tautología)", "[(p → q) ∧ p] → q", { filas: filasEj(["[(p → q) ∧ p] → q"]), nVars: 2 }),
      ej("Contradicción", "p ∧ ¬p", { filas: filasEj(["p ∧ ¬p"]), nVars: 1 }),
      ej("Contingencia con tres variables", "(p ∨ q) → ¬r", { filas: filasEj(["(p ∨ q) → ¬r"]), nVars: 3 }),
      ej("Equivalencia del condicional", "p → q y ¬p ∨ q dan la misma columna", { filas: filasEj(["p → q", "¬p ∨ q"]), nVars: 2 }),
      ej("Leyes de De Morgan", "¬(p ∧ q) y ¬p ∨ ¬q", { filas: filasEj(["¬(p ∧ q)", "¬p ∨ ¬q"]), nVars: 2 }),
      ej("Bicondicional y disyunción excluyente", "p ↔ q y p ⊻ q (una es la negación de la otra)", {
        filas: filasEj(["p ↔ q", "p ⊻ q"]), nVars: 2 }),
    ],
    boole: [
      ej("Cuatro variables", "F por minitérminos y G como producto de sumas", { nVars: 4, filas: [
        { nombre: "F", texto: "m(0, 2, 5, 7, 8, 10, 13, 15)", color: COLORES[0] },
        { nombre: "G", texto: "(A + B)(A + C' + D)", color: COLORES[1] }] }),
      ej("Tres variables (consenso)", "AB + A'C + BC: el término BC sobra", { nVars: 3, filas: [
        { nombre: "F", texto: "AB + A'C + BC", color: COLORES[0] }] }),
      ej("Por maxitérminos", "F = ΠM(0, 2, 5) con tres variables", { nVars: 3, filas: [
        { nombre: "F", texto: "M(0, 2, 5)", color: COLORES[0] }] }),
      ej("Función mayoría", "Vale 1 si al menos dos de A, B, C valen 1", { nVars: 3, filas: [
        { nombre: "F", texto: "AB + AC + BC", color: COLORES[0] }] }),
      ej("O exclusivo y equivalencia", "A ⊕ B y A ⊙ B", { nVars: 2, filas: [
        { nombre: "F", texto: "A ⊕ B", color: COLORES[0] }, { nombre: "G", texto: "A ⊙ B", color: COLORES[1] }] }),
    ],
    conjuntos: [
      ej("Operaciones en un universo finito", "U = {1, …, 10}: unión, intersección, complemento", {
        universo: "finito", universoTexto: "1, 2, ..., 10", conCero: false, filas: [
          { nombre: "A", texto: "x => x % 2 == 0", color: COLORES[0] },
          { nombre: "B", texto: "{1, 2, 3, 4, 5}", color: COLORES[1] },
          { nombre: "C", texto: "A ∪ B", color: COLORES[2] },
          { nombre: "D", texto: "A ∩ B", color: COLORES[3] },
          { nombre: "E", texto: "(A ∪ B)'", color: COLORES[4] },
          { nombre: "F", texto: "x => B(x) && !A(x)", color: COLORES[5] }] }),
      ej("En ℕ, por comprensión", "Múltiplos de 3, diferencia, diferencia simétrica", {
        universo: "N", conCero: false, filas: [
          { nombre: "A", texto: "x => x % 3 == 0", color: COLORES[0] },
          { nombre: "B", texto: "{1, 2, 3, 4, 5, 6}", color: COLORES[1] },
          { nombre: "C", texto: "A ∩ B", color: COLORES[2] },
          { nombre: "D", texto: "B − A", color: COLORES[3] },
          { nombre: "E", texto: "A Δ B", color: COLORES[4] },
          { nombre: "F", texto: "B'", color: COLORES[5] },
          { nombre: "G", texto: "x => B(x) || A(x) && x < 20", color: "#e8590c" }] }),
      ej("Aplicando una función a los elementos", "Pares, cuadrados e imágenes: {2x / x ∈ ℕ}", {
        universo: "N", conCero: false, conFuncion: true, filas: [
          { nombre: "A", texto: "", imagen: "x => 2*x", color: COLORES[0] },
          { nombre: "B", texto: "x => x <= 6", imagen: "x => x**2", color: COLORES[1] },
          { nombre: "C", texto: "{1, 2, 3}", imagen: "x => 10 * x + 1", color: COLORES[2] },
          { nombre: "D", texto: "A ∩ B", color: COLORES[3] },
          { nombre: "E", texto: "x => x % 2 == 1", imagen: "x => (x + 1) / 2", color: COLORES[4] }] }),
      ej("Leyes de De Morgan", "(A ∪ B)' = A' ∩ B' en U = {1, …, 8}", {
        universo: "finito", universoTexto: "1, 2, ..., 8", conCero: false, filas: [
          { nombre: "A", texto: "{1, 2, 3, 4}", color: COLORES[0] },
          { nombre: "B", texto: "{3, 4, 5, 6}", color: COLORES[1] },
          { nombre: "C", texto: "(A ∪ B)'", color: COLORES[2] },
          { nombre: "D", texto: "A' ∩ B'", color: COLORES[3] }] }),
      ej("Producto cartesiano y partes", "A × B y P(A)", {
        universo: "finito", universoTexto: "1, 2, 3", conCero: false, filas: [
          { nombre: "A", texto: "{1, 2}", color: COLORES[0] },
          { nombre: "B", texto: "{2, 3}", color: COLORES[1] },
          { nombre: "C", texto: "A × B", color: COLORES[2] },
          { nombre: "D", texto: "P(A)", color: COLORES[3] }] }),
    ],
    venn: [
      ej("Fichas de colores", "38 fichas: verdes, rojas y azules (con cardinales de conjuntos)", {
        nombres: "V, R, A", filas: filasEj(["U = 38", "|V| = 18", "|R| = 23", "|A| = 29", "solo R = 3", "solo A = 8",
          "R ∩ A − V = 9", "los tres = 5"]) }),
      ej("Tres conjuntos por zonas", "U = 60, con los datos de cada zona", {
        nombres: "A, B, C", filas: filasEj(["U = 60", "solo A = 15", "|A ∩ B| = 11", "solo C = 12", "|A ∩ C| = 8",
          "solo B = 10", "|B ∩ C| = 5", "los tres = 3"]) }),
      ej("Dos conjuntos", "U = 50, |A| = 30, |B| = 25, |A ∩ B| = 10", {
        nombres: "A, B", filas: filasEj(["U = 50", "|A| = 30", "|B| = 25", "|A ∩ B| = 10"]) }),
      ej("Con la unión", "|A ∪ B| = 40 y los que no están en ninguno", {
        nombres: "A, B", filas: filasEj(["U = 45", "|A ∪ B| = 40", "|A| = 28", "|B| = 20"]) }),
    ],
    relaciones: [
      ej("Divisibilidad (orden parcial)", "y es múltiplo de x en {1, 2, 3, 4}", { filas: [
        { nombre: "A", texto: "{1, 2, 3, 4}", color: COLORES[0] },
        { nombre: "R", texto: "(x, y) => y % x == 0", base: "A × A", color: COLORES[1] }] }),
      ej("Relación de equivalencia", "Congruencia módulo 3 en {1, …, 6}, con sus clases", { clases: true, filas: [
        { nombre: "A", texto: "{1, 2, 3, 4, 5, 6}", color: COLORES[0] },
        { nombre: "R", texto: "(x, y) => (x - y) % 3 == 0", base: "A × A", color: COLORES[1] }] }),
      ej("Por extensión", "R = {(1, 1), (1, 2), (2, 1), (2, 2), (3, 3)}", { filas: [
        { nombre: "A", texto: "{1, 2, 3}", color: COLORES[0] },
        { nombre: "R", texto: "{(1, 1), (1, 2), (2, 1), (2, 2), (3, 3)}", base: "A × A", color: COLORES[1] }] }),
      ej("Entre dos conjuntos e inversa", "S ⊆ A × B, T ⊆ A × A y la inversa de S", { filas: [
        { nombre: "A", texto: "{1, 2, 3}", color: COLORES[0] },
        { nombre: "B", texto: "{a, b}", color: COLORES[2] },
        { nombre: "S", texto: "{(1, a), (2, a), (3, b)}", base: "A × B", color: COLORES[1] },
        { nombre: "T", texto: "(x, y) => (x + y) % 2 == 0", base: "A × A", color: COLORES[3] },
        { nombre: "Q", texto: "(x, y) => S(y, x)", base: "B × A", color: COLORES[4] }] }),
    ],
    estructuras: [
      ej("Grupo en ℤ", "x * y = x + y − 3", { tipo: "par", filas: [{ texto: "x * y = x + y - 3", conjunto: "ℤ", color: COLORES[0] }] }),
      ej("Terna (distributiva)", "(ℝ, *, ∘) con x * y = 2xy y x ∘ y = x + y", { tipo: "terna", filas: [
        { texto: "x * y = 2xy", conjunto: "ℝ", color: COLORES[0] }, { texto: "x ∘ y = x + y", conjunto: "ℝ", color: COLORES[1] }] }),
      ej("Promedio", "a △ b = (a + b)/2 en ℝ (no es asociativa)", { tipo: "par", filas: [
        { texto: "a △ b = (a + b)/2", conjunto: "ℝ", color: COLORES[0] }] }),
      ej("x ∘ y = x + y + xy", "En ℝ: neutro 0; el −1 no tiene inverso", { tipo: "par", filas: [
        { texto: "x ∘ y = x + y + xy", conjunto: "ℝ", color: COLORES[0] }] }),
    ],
    combinatoria: [
      ej("Los seis tipos", "P, V, C, VR, CR y PR", { filas: filasEj(["P 4", "6 V 2", "6 C 2", "3 VR 2", "4 CR 2", "PR 6; 3, 2"]) }),
      ej("Permutaciones", "P 5, 7! y P 3", { filas: filasEj(["P 5", "7!", "P 3"]) }),
      ej("Variaciones y combinaciones", "10 V 3, 10 C 3 y 8 C 5", { filas: filasEj(["10 V 3", "10 C 3", "8 C 5"]) }),
      ej("Con repetición", "2 VR 5, 5 CR 3 y PR 7; 2, 2, 3", { filas: filasEj(["2 VR 5", "5 CR 3", "PR 7; 2, 2, 3"]) }),
    ],
    combExpr: [
      ej("Variaciones (del ejercicio)", "V⁴₃ + 3V⁴₂ = V⁵₃", { filas: filasEj(["V^4_3 + 3V^4_2 = V^5_3"]) }),
      ej("Fórmula de Pascal", "C⁵₂ + C⁵₃ = C⁶₃", { filas: filasEj(["C^5_2 + C^5_3 = C^6_3"]) }),
      ej("Permutaciones y combinaciones", "P₅ / (P₂ · P₃) = C⁵₂", { filas: filasEj(["P_5/(P_2 · P_3) = C^5_2"]) }),
      ej("Factoriales", "8!/6! y 10!/(8! · 2!)", { filas: filasEj(["8!/6!", "10!/(8! · 2!)"]) }),
      ej("Con repetición", "VR³₂ + CR⁴₂ − PR(4; 2, 2)", { filas: filasEj(["VR^3_2 + CR^4_2 - PR(4; 2, 2)"]) }),
      ej("Resultado fraccionario", "C⁴₂ / C⁶₃", { filas: filasEj(["C^4_2 / C^6_3"]) }),
      ej("Igualdad falsa", "V⁵₂ = 2C⁵₂ + 1", { filas: filasEj(["V^5_2 = 2C^5_2 + 1"]) }),
      ej("Ecuación: variaciones", "Vˣ₂ = 30 (resolvente)", { filas: filasEj(["V^x_2 = 30"]) }),
      ej("Ecuación: combinaciones", "Cˣ₂ = 15 y Cˣₓ₋₂ = 10", { filas: filasEj(["C^x_2 = 15", "C^x_{x-2} = 10"]) }),
      ej("Ecuación: dividir por x", "Vˣ₃ = 20x", { filas: filasEj(["V^x_3 = 20x"]) }),
      ej("Ecuación: permutaciones", "Pₓ = 120 y Pₓ₊₁ = 6Pₓ₋₁", { filas: filasEj(["P_x = 120", "P_{x+1} = 6P_{x-1}"]) }),
      ej("Generalización (identidad)", "Vᵏ₃ + 3Vᵏ₂ = Vᵏ⁺¹₃", { filas: filasEj(["V^k_3 + 3V^k_2 = V^{k+1}_3"]) }),
    ],
    mcm: [
      ej("Tres listas", "24, 36 · 15, 28 · 60, 90, 150", { filas: filasEj(["24, 36", "15, 28", "60, 90, 150"]) }),
      ej("Dos números", "12 y 18", { filas: filasEj(["12, 18"]) }),
      ej("Coprimos", "8, 15 y 14, 25: el MCD es 1", { filas: filasEj(["8, 15", "14, 25"]) }),
      ej("Muchos números", "12, 18, 24, 36, 48", { filas: filasEj(["12, 18, 24, 36, 48"]) }),
    ],
    bezout: [
      ej("Clásico", "252 y 198: mcd 18", { filas: filasEj(["252, 198"]) }),
      ej("Coprimos", "35 y 12: mcd 1", { filas: filasEj(["35, 12"]) }),
      ej("Más pasos", "1001 y 777", { filas: filasEj(["1001, 777"]) }),
      ej("Los dos métodos", "240 y 46, por sustitución y con la tabla", { filas: filasEj(["240, 46"]), mTabla: true }),
    ],
    valorAbsoluto: [
      ej("Ecuación", "|x + 7/4| = 9/4", { filas: filasEj(["|x + 7/4| = 9/4"], ROSA) }),
      ej("Inecuaciones", "|1 − x| + 7 ≥ 2 y |2x − 3| < 5", { filas: filasEj(["|1 − x| + 7 ≥ 2", "|2x − 3| < 5"], ROSA) }),
      ej("Con x fuera del valor absoluto", "3 + |x − 4| = 2x", { filas: filasEj(["3 + |x − 4| = 2x"], ROSA) }),
      ej("Dos valores absolutos", "|x − 1| + |x + 2| = 5", { filas: filasEj(["|x − 1| + |x + 2| = 5"], ROSA) }),
    ],
    inecuaciones2: [
      ej("Factorizada", "0 < (5x − 2)(3 − 6x)", { filas: filasEj(["0 < (5x − 2)(3 − 6x)"], ROSA) }),
      ej("Desarrollada", "x² − 5x + 6 ≤ 0", { filas: filasEj(["x² − 5x + 6 ≤ 0"], ROSA) }),
      ej("Con un número adelante", "2(x − 1)(x + 3) ≤ 0", { filas: filasEj(["2(x − 1)(x + 3) ≤ 0"], ROSA) }),
      ej("Raíces irracionales", "x² + 2x − 1 > 0", { filas: filasEj(["x² + 2x − 1 > 0"], ROSA) }),
    ],
    racionales: [
      ej("Con un número del otro lado", "(2x + 1)/(3 − 4x) < −2", { filas: filasEj(["(2x + 1)/(3 − 4x) < −2"], ROSA) }),
      ej("Comparada con 0", "(x − 1)/(x + 2) ≥ 0", { filas: filasEj(["(x − 1)/(x + 2) ≥ 0"], ROSA) }),
      ej("Comparada con 1", "(3x − 1)/(x + 4) > 1", { filas: filasEj(["(3x − 1)/(x + 4) > 1"], ROSA) }),
      ej("Menor o igual que 0", "(x + 3)/(2 − x) ≤ 0", { filas: filasEj(["(x + 3)/(2 − x) ≤ 0"], ROSA) }),
    ],
    factorizacion: [
      ej("Raíces enteras", "x² − 8x + 12", { filas: filasEj([{ nombre: "", texto: "x² − 8x + 12" }]) }),
      ej("Raíces racionales", "6x² − 7x − 3", { filas: filasEj([{ nombre: "", texto: "6x² − 7x − 3" }]) }),
      ej("Raíces irracionales", "x² + 3x + 1", { filas: filasEj([{ nombre: "", texto: "x² + 3x + 1" }]) }),
      ej("Trinomio cuadrado perfecto", "x² − 6x + 9: una raíz doble", { filas: filasEj([{ nombre: "", texto: "x² − 6x + 9" }]) }),
      ej("Sin raíces reales", "x² + 2x + 5: no se factoriza en ℝ", { filas: filasEj([{ nombre: "", texto: "x² + 2x + 5" }]) }),
      ej("Con fracciones", "5/2x² + 14/3x + 2", { filas: filasEj([{ nombre: "", texto: "5/2x² + 14/3x + 2" }]) }),
    ],
    raicesC: [
      ej("Raíces cúbicas de 8i", "z = 8i, n = 3", { filas: [{ nombre: "z", texto: "8i", n: "3", color: COLORES[0] }] }),
      ej("Raíces cuartas de −16", "w = −16, n = 4", { filas: [{ nombre: "w", texto: "-16", n: "4", color: COLORES[0] }] }),
      ej("Raíces cuadradas de 1 + i", "u = 1 + i, n = 2", { filas: [{ nombre: "u", texto: "1 + i", n: "2", color: COLORES[0] }] }),
      ej("Raíces sextas de la unidad", "z = 1, n = 6: un hexágono", { filas: [{ nombre: "z", texto: "1", n: "6", color: COLORES[0] }] }),
      ej("Las tres primeras juntas", "8i (n = 3), −16 (n = 4) y 1 + i (n = 2)", { filas: [
        { nombre: "z", texto: "8i", n: "3", color: COLORES[0] }, { nombre: "w", texto: "-16", n: "4", color: COLORES[1] },
        { nombre: "u", texto: "1 + i", n: "2", color: COLORES[2] }] }),
    ],
    complejos: [
      ej("Pasaje entre formas", "Binómica, polar y trigonométrica", { filas: [
        { nombre: "z₁", texto: "3 + 4i", color: COLORES[0] }, { nombre: "z₂", texto: "[2; 30°]", color: COLORES[1] },
        { nombre: "z₃", texto: "2(cos 45° + i sen 45°)", color: COLORES[2] }] }),
      ej("Suma y resta", "z₁ + z₂ y z₁ − z₂ (con el paralelogramo)", { filas: [
        { nombre: "z₁", texto: "2 + 3i", color: COLORES[0] }, { nombre: "z₂", texto: "-1 + i", color: COLORES[1] },
        { nombre: "z₃", texto: "z₁ + z₂", color: COLORES[2] }, { nombre: "z₄", texto: "z₁ − z₂", color: COLORES[3] }] }),
      ej("Producto y cociente", "z₁ · z₂ y z₁ / z₂", { filas: [
        { nombre: "z₁", texto: "1 + i", color: COLORES[0] }, { nombre: "z₂", texto: "[2; 60°]", color: COLORES[1] },
        { nombre: "z₃", texto: "z₁ · z₂", color: COLORES[2] }, { nombre: "z₄", texto: "z₁ / z₂", color: COLORES[3] }] }),
      ej("Distintas formas y operaciones", "Tres números, una suma y un cociente", { filas: [
        { nombre: "z₁", texto: "-3 + 4i", color: COLORES[0] }, { nombre: "z₂", texto: "(1, -1)", color: COLORES[1] },
        { nombre: "z₃", texto: "2(cos 60° + i sen 60°)", color: COLORES[2] },
        { nombre: "z₄", texto: "z₁ + z₂", color: COLORES[3] }, { nombre: "z₅", texto: "z₁ / z₂", color: COLORES[4] }] }),
      ej("Operaciones combinadas", "(z₁ + z₂) · z₃ y |z₁| / |z₂|", { filas: [
        { nombre: "z₁", texto: "3 + 4i", color: COLORES[0] }, { nombre: "z₂", texto: "1 − i", color: COLORES[1] },
        { nombre: "z₃", texto: "2i", color: COLORES[2] },
        { nombre: "z₄", texto: "(z₁ + z₂) · z₃", color: COLORES[3] }, { nombre: "z₅", texto: "|z₁| / |z₂|", color: COLORES[4] }] }),
    ],
    razonamientos: [
      ej("Modus tollens", "p → q, ¬q ∴ ¬p", { filas: filasEj(["p → q, ¬q ∴ ¬p"]) }),
      ej("Silogismo hipotético", "p → q, q → r ∴ p → r", { filas: filasEj(["p → q, q → r ∴ p → r"]) }),
      ej("Silogismo disyuntivo", "p ∨ q, ¬p ∴ q", { filas: filasEj(["p ∨ q, ¬p ∴ q"]) }),
      ej("Dilema constructivo", "p → q, r → s, p ∨ r ∴ q ∨ s", { filas: filasEj(["p → q, r → s, p ∨ r ∴ q ∨ s"]) }),
      ej("Falacia: afirmación del consecuente", "p → q, q ∴ p (no es válido)", { filas: filasEj(["p → q, q ∴ p"]) }),
      ej("Dos válidos y uno que no", "Encadenado, disyuntivo y afirmación del consecuente", {
        filas: [{ texto: "p → q, q → r, p ∴ r", color: COLORES[0] }, { texto: "p ∨ q, ¬p ∴ q", color: COLORES[2] },
          { texto: "p → q, q ∴ p", color: COLORES[1] }] }),
    ],
    simpLogica: [
      ej("Absorción", "p ∨ (p ∧ q)", { filas: filasEj(["p ∨ (p ∧ q)"]) }),
      ej("Con condicional", "(p → q) ∧ p", { filas: filasEj(["(p → q) ∧ p"]) }),
      ej("De Morgan y distributiva", "¬(p ∨ ¬q) ∨ (¬p ∧ q)", { filas: filasEj(["¬(p ∨ ¬q) ∨ (¬p ∧ q)"]) }),
      ej("Tautología", "[(p → q) ∧ p] → q (se simplifica a V)", { filas: filasEj(["[(p → q) ∧ p] → q"]) }),
      ej("Consenso", "(p ∧ q) ∨ (¬p ∧ r) ∨ (q ∧ r)", { filas: filasEj(["(p ∧ q) ∨ (¬p ∧ r) ∨ (q ∧ r)"]) }),
    ],
    simpBoole: [
      ej("Absorción del complemento", "A + A'B", { filas: [{ nombre: "F", texto: "A + A'B", color: COLORES[0] }] }),
      ej("Producto de sumas", "(A + B)(A + B')", { filas: [{ nombre: "F", texto: "(A + B)(A + B')", color: COLORES[0] }] }),
      ej("Con De Morgan", "(AB)' + A (da 1)", { filas: [{ nombre: "F", texto: "(AB)' + A", color: COLORES[0] }] }),
      ej("Tres términos", "AB + AB' + A'B", { filas: [{ nombre: "F", texto: "AB + AB' + A'B", color: COLORES[0] }] }),
      ej("Consenso", "AB + A'C + BC", { filas: [{ nombre: "F", texto: "AB + A'C + BC", color: COLORES[0] }] }),
    ],
    simpConjuntos: [
      ej("Distributiva y complemento", "(A ∪ B) ∩ (A ∪ B')", { filas: filasEj(["(A ∪ B) ∩ (A ∪ B')"]) }),
      ej("Con De Morgan", "(A ∪ B)' ∪ A", { filas: filasEj(["(A ∪ B)' ∪ A"]) }),
      ej("Diferencias", "A − (A − B)", { filas: filasEj(["A − (A − B)"]) }),
      ej("Diferencia e intersección", "(A − B) ∪ (A ∩ B)", { filas: filasEj(["(A − B) ∪ (A ∩ B)"]) }),
      ej("Consenso", "(A ∩ B) ∪ (A' ∩ C) ∪ (B ∩ C)", { filas: filasEj(["(A ∩ B) ∪ (A' ∩ C) ∪ (B ∩ C)"]) }),
    ],
    induccion: [
      ej("Polinomio: impares", "1 + 3 + … + (2n − 1) = n² (trinomio cuadrado perfecto)", { filas: filasEj([{ texto: "2n − 1", suma: "n^2" }]) }),
      ej("Polinomio: naturales", "1 + 2 + … + n = n(n + 1)/2 (denominador y factor común)", {
        filas: filasEj([{ texto: "n", suma: "n(n + 1)/2" }]) }),
      ej("Polinomio: cuadrados", "Σ k² = n(n + 1)(2n + 1)/6 (factor común y factorizar)", {
        filas: filasEj([{ texto: "n^2", suma: "n(n + 1)(2n + 1)/6" }]) }),
      ej("Potencias (geométrica)", "1 + 5 + 5² + … + 5ⁿ⁻¹ = 1/4(5ⁿ − 1)", { filas: filasEj([{ texto: "5^(n − 1)", suma: "1/4(5^n − 1)" }]) }),
      ej("Potencia con coeficiente", "Σ k·2ᵏ = (n − 1)·2ⁿ⁺¹ + 2", { filas: filasEj([{ texto: "n·2^n", suma: "(n − 1)·2^(n + 1) + 2" }]) }),
      ej("Potencias en el denominador", "Σ 1/2ᵏ = 1 − 1/2ⁿ (igual denominador)", { filas: filasEj([{ texto: "1/2^n", suma: "1 − 1/2^n" }]) }),
      ej("Potencias de −1", "Σ (−1)ᵏ⁺¹k² = (−1)ⁿ⁺¹·n(n + 1)/2", {
        filas: filasEj([{ texto: "(−1)^(n + 1)·n^2", suma: "(−1)^(n + 1)·n(n + 1)/2" }]) }),
      ej("Fracciones (telescópica)", "Σ 1/(k(k + 1)) = n/(n + 1) (común denominador)", {
        filas: filasEj([{ texto: "1/(n(n + 1))", suma: "n/(n + 1)" }]) }),
      ej("Potencia por fracción (telescópica)", "Σ k·2ᵏ/((k + 1)(k + 2)) = 2ⁿ⁺¹/(n + 2) − 1", {
        filas: filasEj([{ texto: "n·2^n/((n + 1)(n + 2))", suma: "2^(n + 1)/(n + 2) − 1" }]) }),
      ej("Factoriales", "Σ k·k! = (n + 1)! − 1 (definición de factorial)", { filas: filasEj([{ texto: "n·n!", suma: "(n + 1)! − 1" }]) }),
    ],
    plantillas: [
      ej("Grupo abeliano", "L.C.I., asociativa, neutro, inverso y conmutativa",
        marcarPlantillas(["pl_lci", "pl_asociativa", "pl_neutro", "pl_inverso", "pl_conmutativa"])),
      ej("Relación de equivalencia", "Reflexiva, simétrica y transitiva",
        marcarPlantillas(["pl_reflexiva", "pl_simetrica", "pl_transitiva"])),
      ej("Relación de orden", "Reflexiva, antisimétrica y transitiva",
        marcarPlantillas(["pl_reflexiva", "pl_antisimetrica", "pl_transitiva"])),
      ej("Funciones", "Inyectiva, sobreyectiva y biyectiva",
        marcarPlantillas(["pl_inyectiva", "pl_sobreyectiva", "pl_biyectiva"])),
      ej("Sucesión aritmética", "Definición, término general, suma y distancia",
        marcarPlantillas(["pl_ar_definicion", "pl_ar_general", "pl_ar_desdek", "pl_ar_suma", "pl_ar_d1", "pl_ar_dk"])),
      ej("Sucesión geométrica", "Definición, término general, suma y razón",
        marcarPlantillas(["pl_ge_definicion", "pl_ge_general", "pl_ge_desdek", "pl_ge_suma", "pl_ge_r1", "pl_ge_rm"])),
      ej("Combinatoria", "Las fórmulas de los seis tipos",
        marcarPlantillas(["pl_permutaciones", "pl_variaciones", "pl_combinaciones", "pl_variacionesR", "pl_combinacionesR",
          "pl_permutacionesR"])),
    ],
  };
  // inducción: tambien todos los casos juntos
  EJEMPLOS.induccion.push(ej("Todos los casos", "Los diez de arriba, uno debajo del otro", {
    filas: filasEj(EJEMPLOS.induccion.map(function (e) { return { texto: e.op.filas[0].texto, suma: e.op.filas[0].suma }; })) }));
  Object.keys(EJEMPLOS).forEach(function (k) { GEN[k].ejemplos = EJEMPLOS[k]; });

  // orden de las pestanas del panel (la primera es la que se abre por defecto)
  var ORDEN = ["tabla", "razonamientos", "boole", "conjuntos", "venn", "relaciones", "recta", "funcion", "estructuras", "combinatoria", "combExpr", "mcm", "bezout", "valorAbsoluto", "factorizacion", "inecuaciones2", "racionales", "induccion", "complejos", "raicesC", "simpLogica", "simpBoole", "simpConjuntos", "plantillas"];
  // nombre e icono (un simbolo) de cada generador en el menu desplegable
  // panel: titulo del panel cuando no es el nombre del item (los items solos
  // en su seccion no repiten el nombre de la seccion)
  var MENU_GEN = {
    tabla: { nombre: "Tablas de verdad", panel: "Lógica proposicional", icono: "⊨" },
    boole: { nombre: "Funciones booleanas", panel: "Álgebra de Boole", icono: "∧" },
    conjuntos: { nombre: "Conjuntos", icono: "∪" },
    venn: { nombre: "Diagramas de Venn", icono: "◎" },
    relaciones: { nombre: "Relaciones binarias", icono: "R" },
    recta: { nombre: "Recta real", icono: "ℝ" },
    funcion: { nombre: "Gráfico de funciones", icono: "ƒ" },
    estructuras: { nombre: "Estructuras algebraicas", icono: "∘" },
    combinatoria: { nombre: "Combinatoria", icono: "n!" },
    combExpr: { nombre: "Expresiones combinatorias", panel: "Combinatoria: expresiones e igualdades", icono: "Cⁿₖ" },
    mcm: { nombre: "MCM y MCD", icono: "÷" },
    bezout: { nombre: "Identidad de Bézout", icono: "as+bt" },
    valorAbsoluto: { nombre: "Expresiones con valor absoluto", icono: "|x|" },
    factorizacion: { nombre: "Factorización de polinomios", icono: "x²" },
    inecuaciones2: { nombre: "Inecuaciones de segundo grado", icono: "+·−" },
    racionales: { nombre: "Inecuaciones racionales", icono: "+/−" },
    induccion: { nombre: "Inducción matemática", icono: "∑" },
    complejos: { nombre: "Formas y operaciones", panel: "Números complejos", icono: "ℂ" },
    raicesC: { nombre: "Raíces n-ésimas", panel: "Números complejos: raíces n-ésimas", icono: "ⁿ√" },
    simpLogica: { nombre: "Simplificación paso a paso", panel: "Simplificación: lógica proposicional", icono: "≡" },
    simpBoole: { nombre: "Simplificación paso a paso", panel: "Simplificación: álgebra de Boole", icono: "=" },
    simpConjuntos: { nombre: "Simplificación paso a paso", panel: "Simplificación: teoría de conjuntos", icono: "=" },
    plantillas: { nombre: "Plantillas", icono: "≡" },
    razonamientos: { nombre: "Razonamiento deductivo", icono: "∴" },
    // no es un generador: abre el panel de hojas.js
    hojas: { nombre: "Hojas A4", icono: "A4", externo: true },
    // no es un generador: abre un archivo .json de solucion (solucionario.js)
    solucion: { nombre: "Importar solución (.json)", icono: "{ }", externo: "solucionario" },
  };
  // como se ordenan en el menu: los sueltos arriba (si hay) y despues las secciones,
  // con la unidad del programa de la materia a la que pertenecen
  var MENU_ORDEN = [
    { grupo: "Lógica proposicional", unidad: 1, items: ["tabla", "simpLogica", "razonamientos"] },
    { grupo: "Teoría de conjuntos", unidad: 2, items: ["conjuntos", "venn", "relaciones", "estructuras", "simpConjuntos"] },
    { grupo: "Álgebra de Boole", unidad: 3, items: ["boole", "simpBoole"] },
    { grupo: "Sistemas numéricos", unidad: 5, items: ["recta", "combinatoria", "combExpr", "mcm", "bezout", "valorAbsoluto", "factorizacion", "inecuaciones2", "racionales", "induccion"] },
    { grupo: "Funciones", unidad: 6, items: ["funcion"] },
    { grupo: "Números complejos", unidad: 7, items: ["complejos", "raicesC"] },
    { grupo: "Otros", icono: "⋯", items: ["plantillas", "hojas", "solucion"] },
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
      var recien = false, vista = {}, marcoAncla = null;
      if (gid) {
        viejos = elementosDe(gid, todos);
        var ancla = viejos.filter(function (e) { return datosDe(e).eje; })[0];
        if (ancla && datosDe(ancla).tipo === tipo) {
          // al redibujar sigue enganchado al mismo marco (hoja A4), si existe
          if (ancla.frameId && todos.some(function (e) { return e.id === ancla.frameId && !e.isDeleted; })) {
            marcoAncla = ancla.frameId;
          }
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
        // regla general: las raices cuadradas se dibujan (ver expandirRaices)
        expandirRaices(e).forEach(function (p) {
          p.groupIds = [gid];
          p.customData = { pizarra: { tipo: tipo, gid: gid } };
          nuevos.push(p);
        });
        return e;
      });
      if (!nuevos.length) return;
      var datos = nuevos[0].customData.pizarra;
      datos.eje = true;
      datos.opciones = copiar(op);
      datos.origen = [nuevos[0].x - ox, nuevos[0].y - oy];

      if (marcoAncla) nuevos.forEach(function (e) { e.frameId = marcoAncla; });
      // si se esta mirando una hoja A4 (hojas.js), el dibujo nuevo va dentro de
      // ella, debajo de lo que ya tiene, y enganchado a su marco
      var enHoja = recien && window.__pizarraHojas && window.__pizarraHojas.lugarPara
        ? window.__pizarraHojas.lugarPara(cajaDe(nuevos), resto.filter(function (e) { return !e.isDeleted; }), st)
        : null;
      if (enHoja) {
        nuevos.forEach(function (e) { e.x += enHoja.dx; e.y += enHoja.dy; e.frameId = enHoja.frameId; });
      }
      // un dibujo nuevo no se encima a lo que ya hay: baja hasta un lugar libre
      if (recien) {
        var ocupados = enHoja ? [] : resto.filter(function (e) { return !e.isDeleted; }).map(caja);
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
    // filas de unidad (abren su submenu al costado) y el submenu
    ".pz-menu-gen .pz-menu-unidad .dropdown-menu-item__text{flex-direction:column;align-items:flex-start;gap:0;line-height:1.15}",
    ".pz-menu-gen .pz-menu-unidad small{font-size:11px;opacity:.6}",
    ".pz-menu-gen .pz-menu-flecha{margin-left:auto;opacity:.5;font-size:16px;line-height:1}",
    ".excalidraw .pz-menu-gen .pz-menu-unidad.abierta{background-color:var(--button-hover-bg)}",
    ".excalidraw .dropdown-menu.pz-menu-gen.pz-submenu-gen{width:260px}",
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
    ".pz-gen button.color{flex:none;width:28px;height:28px;padding:0;border:1px solid #c9c8d1;border-radius:6px;cursor:pointer;",
    "box-shadow:inset 0 0 0 2px #fff}",
    ".pz-gen.oscuro button.color{box-shadow:inset 0 0 0 2px #232329;border-color:#5c5c66}",
    // selector de color con la paleta de Excalidraw (en vez del nativo del sistema)
    ".pz-color{position:fixed;z-index:30;width:196px;background:#fff;color:#1b1b1f;border:1px solid #e0dfe6;border-radius:10px;",
    "box-shadow:0 4px 18px rgba(0,0,0,.18);padding:10px 12px;font:12px/1.4 Assistant,system-ui,sans-serif}",
    ".pz-color.oscuro{background:#232329;color:#e3e3e8;border-color:#3a3a43}",
    ".pz-color .tit{opacity:.7;margin:2px 0 6px}",
    ".pz-color .grilla{display:grid;grid-template-columns:repeat(5,28px);gap:8px}",
    ".pz-color .grilla+.tit{margin-top:10px}",
    ".pz-color button{width:28px;height:28px;padding:0;border:1px solid rgba(0,0,0,.12);border-radius:6px;cursor:pointer;",
    "position:relative;font:10px/1 Assistant,system-ui,sans-serif}",
    ".pz-color.oscuro button{border-color:rgba(255,255,255,.15)}",
    ".pz-color button:hover{transform:scale(1.08)}",
    ".pz-color button.activo{outline:2px solid #6965db;outline-offset:1px}",
    ".pz-color button span{position:absolute;right:2px;bottom:2px;opacity:.6}",
    ".pz-color .hex{display:flex;align-items:center;margin-top:10px;border:1px solid #c9c8d1;border-radius:6px;overflow:hidden}",
    ".pz-color.oscuro .hex{border-color:#3a3a43}",
    ".pz-color .hex b{padding:4px 7px;opacity:.6;font-weight:400;border-right:1px solid #c9c8d1}",
    ".pz-color.oscuro .hex b{border-color:#3a3a43}",
    ".pz-color .hex input{flex:1;min-width:0;border:0;background:transparent;color:inherit;padding:4px 7px;font:inherit;outline:0}",
    ".pz-color .hex.mal{border-color:#e03131}",
    // menu del boton «Ejemplos ▾»: cada opcion con su nombre y lo que inserta
    ".pz-ejemplos{position:fixed;z-index:30;width:310px;overflow:auto;background:#fff;color:#1b1b1f;border:1px solid #e0dfe6;",
    "border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.18);padding:6px;font:13px/1.35 Assistant,system-ui,sans-serif}",
    ".pz-ejemplos.oscuro{background:#232329;color:#e3e3e8;border-color:#3a3a43}",
    ".pz-ejemplos .tit{font-size:12px;opacity:.7;padding:2px 8px 4px}",
    ".pz-ejemplos button{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;text-align:left;border:0;",
    "background:transparent;color:inherit;padding:6px 8px;border-radius:6px;cursor:pointer;font:inherit}",
    ".pz-ejemplos button:hover,.pz-ejemplos button:focus-visible{background:rgba(127,127,127,.14);outline:0}",
    ".pz-ejemplos b{font-weight:600}",
    ".pz-ejemplos small{font-size:12px;opacity:.7}",
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

  // Selector de color con la misma paleta que la herramienta (Excalidraw):
  // colores base, tonos del color elegido y codigo hexadecimal
  var PALETA_EXC = [
    ["#1e1e1e"], ["#ffffff"],
    ["#f8f9fa", "#e9ecef", "#ced4da", "#868e96", "#343a40"],
    ["#f8f1ee", "#eaddd7", "#d2bab0", "#a18072", "#846358"],
    ["#fff5f5", "#ffc9c9", "#ff8787", "#fa5252", "#e03131"],
    ["#fff0f6", "#fcc2d7", "#f783ac", "#e64980", "#c2255c"],
    ["#f8f0fc", "#eebefa", "#da77f2", "#be4bdb", "#9c36b5"],
    ["#f3f0ff", "#d0bfff", "#9775fa", "#7950f2", "#6741d9"],
    ["#e7f5ff", "#a5d8ff", "#4dabf7", "#228be6", "#1971c2"],
    ["#e3fafc", "#99e9f2", "#3bc9db", "#15aabf", "#0c8599"],
    ["#e6fcf5", "#96f2d7", "#38d9a9", "#12b886", "#099268"],
    ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"],
    ["#fff9db", "#ffec99", "#ffd43b", "#fab005", "#f08c00"],
    ["#fff4e6", "#ffd8a8", "#ffa94d", "#fd7e14", "#e8590c"],
    // familias agregadas (tambien en el bundle): indigo y lima de Open Color
    // (indices 0, 2, 4, 6, 8, como las demas), azul marino, marron y bordo
    ["#edf2ff", "#bac8ff", "#748ffc", "#4c6ef5", "#3b5bdb"],
    ["#e7ecf6", "#b6c3df", "#6b80b0", "#304a85", "#1c2d55"],
    ["#f4fce3", "#d8f5a2", "#a9e34b", "#82c91e", "#66a80f"],
    ["#f5ede6", "#dfc5ae", "#b88660", "#8b5a2b", "#5e3b1c"],
    ["#fbe9ec", "#ecb4be", "#c95b72", "#9c2a43", "#6b1a2c"]
  ];
  var selectorColor = {
    el: null, boton: null, alElegir: null, valor: "",
    abrir: function (boton, valor, oscuro, alElegir) {
      if (this.el && this.boton === boton) { this.cerrar(); return; }
      this.cerrar();
      var self = this;
      this.boton = boton; this.alElegir = alElegir; this.valor = (valor || "").toLowerCase();
      var el = this.el = document.createElement("div");
      el.className = "pz-color" + (oscuro ? " oscuro" : "");
      document.body.appendChild(el);
      this.pintar();
      var r = boton.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      var x = Math.max(8, Math.min(r.right - w, innerWidth - w - 8));
      var y = r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - 6 - h) : r.bottom + 6;
      el.style.left = x + "px"; el.style.top = y + "px";
      // se cierra al tocar fuera (salvo el mismo boton, que lo alterna) o con Escape
      this.fuera = function (e) { if (!el.contains(e.target) && e.target !== boton) self.cerrar(); };
      this.tecla = function (e) { if (e.key === "Escape") { e.stopPropagation(); self.cerrar(); boton.focus(); } };
      document.addEventListener("pointerdown", self.fuera, true);
      document.addEventListener("keydown", self.tecla, true);
    },
    cerrar: function () {
      if (!this.el) return;
      this.el.remove();
      this.el = this.boton = null;
      document.removeEventListener("pointerdown", this.fuera, true);
      document.removeEventListener("keydown", this.tecla, true);
    },
    elegir: function (v) {
      this.valor = v.toLowerCase();
      this.alElegir(this.valor);
      this.pintar();
    },
    pintar: function () {
      var self = this, el = this.el, v = this.valor;
      var fam = null;
      PALETA_EXC.forEach(function (f) { if (f.indexOf(v) >= 0) fam = f; });
      el.innerHTML = '<div class="tit">Colores</div><div class="grilla base"></div>' +
        (fam && fam.length > 1 ? '<div class="tit">Tonos</div><div class="grilla tonos"></div>' : "") +
        '<div class="hex"><b>#</b><input type="text" spellcheck="false" autocomplete="off" maxlength="7"></div>';
      function muestra(cont, color, activo, etiqueta) {
        var b = document.createElement("button");
        b.style.background = color;
        b.title = color;
        if (activo) b.className = "activo";
        if (etiqueta) {
          var s = document.createElement("span");
          s.textContent = etiqueta;
          s.style.color = /^#[d-f]/.test(color) ? "#000" : "#fff";
          b.appendChild(s);
        }
        b.onclick = function () { self.elegir(color); };
        cont.appendChild(b);
      }
      var base = el.querySelector(".base");
      PALETA_EXC.forEach(function (f) { muestra(base, f[f.length - 1], f === fam); });
      var tonos = el.querySelector(".tonos");
      if (tonos) fam.forEach(function (c, i) { muestra(tonos, c, c === v, String(i + 1)); });
      var hex = el.querySelector(".hex"), inp = hex.querySelector("input");
      inp.value = v.replace(/^#/, "");
      inp.oninput = function () {
        var t = inp.value.trim().replace(/^#/, "").toLowerCase();
        if (/^[0-9a-f]{3}$/.test(t)) t = t.replace(/./g, "$&$&");
        var ok = /^[0-9a-f]{6}$/.test(t);
        hex.classList.toggle("mal", !ok && t !== "");
        if (ok) { self.valor = "#" + t; self.alElegir(self.valor); }
      };
      inp.onkeydown = function (e) { if (e.key === "Enter") self.pintar(); };
    }
  };

  // Menu del boton «Ejemplos ▾»: una opcion por conjunto de ejemplos (nombre y lo
  // que inserta). Se elige con el mouse o con las flechas y Enter; se cierra con
  // Escape, al tocar fuera o al volver a tocar el boton.
  var menuEjemplos = {
    el: null, boton: null,
    abrir: function (boton, lista, oscuro, alElegir, conTeclado) {
      if (this.el && this.boton === boton) { this.cerrar(); return; }
      this.cerrar();
      var self = this, el = this.el = document.createElement("div");
      this.boton = boton;
      el.className = "pz-ejemplos" + (oscuro ? " oscuro" : "");
      el.setAttribute("role", "menu");
      var tit = document.createElement("div");
      tit.className = "tit";
      tit.textContent = "Insertar un ejemplo nuevo";
      el.appendChild(tit);
      lista.forEach(function (x) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        var n = document.createElement("b"), d = document.createElement("small");
        n.textContent = x.nombre;
        d.textContent = x.descripcion;
        b.appendChild(n);
        b.appendChild(d);
        b.onclick = function () { self.cerrar(); alElegir(x); };
        el.appendChild(b);
      });
      // que Excalidraw no reciba las teclas ni la rueda del menu
      ["keydown", "keyup", "wheel"].forEach(function (ev) { el.addEventListener(ev, function (e) { e.stopPropagation(); }); });
      document.body.appendChild(el);
      boton.setAttribute("aria-expanded", "true");
      // abajo del boton si entra; si no, donde haya mas lugar (con scroll)
      var r = boton.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      var abajo = innerHeight - r.bottom - 14, arriba = r.top - 14, y;
      if (h <= abajo || abajo >= arriba) { el.style.maxHeight = abajo + "px"; y = r.bottom + 6; }
      else { el.style.maxHeight = arriba + "px"; y = Math.max(8, r.top - 6 - Math.min(h, arriba)); }
      el.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
      el.style.top = y + "px";
      if (conTeclado) el.querySelector("button").focus();
      this.fuera = function (e) { if (!el.contains(e.target) && e.target !== boton) self.cerrar(); };
      this.tecla = function (e) {
        var bs = [].slice.call(el.querySelectorAll("button")), i = bs.indexOf(document.activeElement);
        if (e.key === "Escape") {
          e.preventDefault(); e.stopPropagation();
          self.cerrar();
          boton.focus();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault(); e.stopPropagation();
          var abajoK = e.key === "ArrowDown";
          bs[i < 0 ? (abajoK ? 0 : bs.length - 1) : (i + (abajoK ? 1 : bs.length - 1)) % bs.length].focus();
        }
      };
      document.addEventListener("pointerdown", self.fuera, true);
      document.addEventListener("keydown", self.tecla, true);
    },
    cerrar: function () {
      if (!this.el) return;
      this.el.remove();
      if (this.boton) this.boton.setAttribute("aria-expanded", "false");
      this.el = this.boton = null;
      document.removeEventListener("pointerdown", this.fuera, true);
      document.removeEventListener("keydown", this.tecla, true);
    },
  };

  // true si Escape le toca a Excalidraw y no al panel `el`: hay un dialogo suyo
  // abierto, se esta escribiendo un texto o en un campo de fuera del panel, o se
  // esta dibujando (una linea de varios puntos, un trazo)
  function escapeEsDeExcalidraw(el) {
    if (document.querySelector(".excalidraw .Modal, .excalidraw .Dialog")) return true;
    var f = document.activeElement;
    if (f && !el.contains(f) && (f.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName))) return true;
    var A = api(), st = A && A.getAppState();
    return !!(st && (st.editingTextElement || st.multiElement || st.newElement || st.editingLinearElement));
  }
  window.__pizarraEscapeEsDeExcalidraw = escapeEsDeExcalidraw;

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
        '<button class="b ejemplo" aria-haspopup="menu" aria-expanded="false">Ejemplos ▾</button></div>' +
        '<div class="ayuda"></div>';
      document.body.appendChild(el);
      this.el = el;
      var self = this;

      // el generador se elige en el menu desplegable del boton de la barra
      el.querySelector(".cerrar").onclick = function () { self.alternar(false); };
      el.querySelector(".insertar").onclick = function () { aplicar(self.tipo, self.op, !vinculo); };
      el.querySelector(".copia").onclick = function () { aplicar(self.tipo, self.op, true); };
      // dibujo nuevo de ejemplo: el menu ofrece varios conjuntos; el elegido carga su
      // contenido (lo demas del contenido vuelve a lo predeterminado) y se inserta en
      // el centro. No toca el dibujo que este seleccionado; el aspecto se mantiene.
      el.querySelector(".ejemplo").onclick = function (e) {
        var gen = self.gen();
        menuEjemplos.abrir(this, gen.ejemplos || [], el.classList.contains("oscuro"), function (x) {
          clearTimeout(self.temporizador);
          var d = copiar(gen.defecto);
          gen.contenido.forEach(function (k) { if (k in d) self.op[k] = d[k]; });
          var ej = copiar(x.op);
          for (var k in ej) self.op[k] = ej[k];
          self.pintarTodo();
          self.guardar();
          aplicar(self.tipo, self.op, true);
        }, e.detail === 0);
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
      // Escape cierra el panel, este donde este el foco. Antes se cierra lo que
      // este encima: el selector de color, el menu de generadores, un dialogo de
      // Excalidraw, o lo que se este dibujando o escribiendo en la pizarra.
      window.addEventListener("keydown", function (e) {
        if (!self.abierto || e.key !== "Escape" || e.isComposing) return;
        if (selectorColor.el || menuEjemplos.el || menu.abierto || escapeEsDeExcalidraw(el)) return;
        e.preventDefault();
        e.stopPropagation();
        if (el.contains(document.activeElement)) document.activeElement.blur();
        self.alternar(false);
      }, true);
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
      this.botonAgregar = agregar;
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
      menuEjemplos.cerrar();
      var bEj = this.el.querySelector(".ejemplo");
      bEj.title = "Elegí un ejemplo para insertarlo como dibujo nuevo";
      bEj.style.display = gen.ejemplos && gen.ejemplos.length ? "" : "none";
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
      selectorColor.cerrar();
      var self = this, gen = this.gen(), cont = this.el.querySelector(".filas");
      cont.innerHTML = "";
      this.validadores = [];
      // cantidad de filas segun las opciones (p. ej. par o terna ordenada): se
      // agregan vacias hasta el minimo y las que pasan del maximo no se muestran
      // (se conservan por si se vuelve a ampliar)
      var max = gen.maxFilas ? gen.maxFilas(this.op) : Infinity;
      var min = gen.minFilas ? gen.minFilas(this.op) : 0;
      while (this.op.filas.length < min) {
        var nueva = { texto: "", color: colorFila(this.op.filas.length) };
        if (gen.nombreFila) nueva.nombre = gen.nombreFila.porDefecto(this.op.filas.length);
        this.op.filas.push(nueva);
      }
      if (this.botonAgregar) this.botonAgregar.style.display = this.op.filas.length >= max ? "none" : "";
      this.op.filas.forEach(function (f, i) {
        if (i >= max) return;
        var caja = document.createElement("div");
        caja.innerHTML = '<div class="fila">' +
          (gen.nombreFila ? '<input type="text" class="nombre" spellcheck="false" autocomplete="off">' : "") +
          '<input type="text" class="codigo" spellcheck="false" autocomplete="off">' +
          '<button class="color" title="Color"></button><button class="quitar" title="Quitar">✕</button></div>' +
          '<div class="extras"></div><div class="error"></div>';
        var t = caja.querySelector("input.codigo"), c = caja.querySelector("button.color");
        t.placeholder = gen.placeholder;
        t.value = f.texto; c.style.background = f.color;
        var nom = caja.querySelector("input.nombre");
        if (nom) {
          // vacio = nombre por defecto segun la posicion (f, g, h...)
          nom.placeholder = gen.nombreFila.porDefecto(i);
          nom.title = gen.nombreFila.titulo;
          nom.value = f.nombre || "";
          nom.oninput = function () { f.nombre = nom.value; self.cambio(); };
        }
        // campos extra debajo de la fila (dominio propio, puntos a marcar...)
        var extras = (gen.extrasFila || []).filter(function (def) {
          return !def.visible || def.visible(self.op, i);
        }).map(function (def) {
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
        c.onclick = function () {
          selectorColor.abrir(c, f.color, self.el.classList.contains("oscuro"), function (v) {
            f.color = v; c.style.background = v; self.cambio();
          });
        };
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
            if (o[2]) b.title = o[2]; // tercer elemento opcional: tooltip
            b.className = op[clave] === o[0] ? "activo" : "";
            b.onclick = function () {
              op[clave] = o[0];
              [].forEach.call(s.children, function (x) { x.className = ""; });
              b.className = "activo";
              if (repintar === "filas") self.pintarFilas();
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
          // repintar "filas": tambien cambian los campos de las filas
          c.onchange = function () {
            op[clave] = c.checked;
            if (repintar === "filas") self.pintarFilas();
            self.cambio();
            if (repintar) self.pintarOpciones();
          };
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
      if (!this.abierto) selectorColor.cerrar(), menuEjemplos.cerrar();
      else if (window.__pizarraHojas) window.__pizarraHojas.cerrar();
      boton.actualizar();
      if (this.abierto) seleccionado = undefined, seleccionCambio();
    },
  };

  // Al seleccionar un dibujo generado, el panel cambia a su generador y lo carga
  // dibujo generado (gid y tipo) que esta en la seleccion, o gid null
  function generadoSeleccionado(A, st) {
    var ids = Object.keys(st.selectedElementIds || {});
    var r = { gid: null, tipo: null };
    if (ids.length) {
      var porId = {};
      A.getSceneElements().forEach(function (e) { porId[e.id] = e; });
      for (var i = 0; i < ids.length && !r.gid; i++) {
        var d = datosDe(porId[ids[i]]);
        if (d && GEN[d.tipo]) r.gid = d.gid, r.tipo = d.tipo;
      }
    }
    return r;
  }

  // Con el panel cerrado, al seleccionar un dibujo generado se abre su panel
  // (Preferencias -> «Abrir la herramienta al seleccionar un dibujo»). Solo
  // cuando la seleccion pasa a otro dibujo: si se cierra el panel con el dibujo
  // todavia seleccionado, no se vuelve a abrir.
  var visto = null;
  function abrirAlSeleccionar(A, st) {
    var gid = generadoSeleccionado(A, st).gid;
    if (gid === visto) return;
    visto = gid;
    if (gid && window.__abrirHerramientaAlSeleccionar !== false && !st.viewModeEnabled) {
      if (menu.abierto) menu.alternar(false);
      panel.alternar(true);
    }
  }

  function seleccionCambio() {
    var A = api();
    if (!A) return;
    var st = A.getAppState();
    if (!panel.abierto) { abrirAlSeleccionar(A, st); return; }
    panel.el.classList.toggle("oscuro", st.theme === "dark");
    var sel = generadoSeleccionado(A, st), gid = sel.gid, tipo = sel.tipo;
    visto = gid;
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
      this.item = item;
      // submenu de las unidades: un solo elemento aparte (el menu principal
      // tiene overflow y lo recortaria), que se llena con la unidad elegida
      var sub = document.createElement("div");
      sub.className = "dropdown-menu pz-menu-gen pz-submenu-gen";
      sub.setAttribute("role", "menu");
      sub.style.display = "none";
      var subIsla = document.createElement("div");
      subIsla.className = "Island dropdown-menu-container";
      subIsla.style.setProperty("--padding", "2");
      sub.appendChild(subIsla);
      this.sub = sub;
      this.subIsla = subIsla;
      // cada seccion es una fila que despliega sus items al costado; una linea
      // separa los sueltos, las unidades y las secciones sin unidad (Otros)
      var clasePrevia = null;
      MENU_ORDEN.forEach(function (x) {
        var clase = typeof x === "string" ? "suelto" : x.unidad ? "unidad" : "otro";
        if (clasePrevia && clase !== clasePrevia) {
          var s0 = document.createElement("div");
          s0.className = "pz-menu-separador";
          isla.appendChild(s0);
        }
        clasePrevia = clase;
        if (typeof x === "string") { item(x, isla); return; }
        var u = document.createElement("button");
        u.type = "button";
        u.className = "radix-menu-item dropdown-menu-item dropdown-menu-item-base pz-menu-unidad";
        u.setAttribute("role", "menuitem");
        u.setAttribute("aria-haspopup", "menu");
        u.setAttribute("aria-expanded", "false");
        u.setAttribute("data-seccion", x.grupo);
        u.innerHTML = '<div class="dropdown-menu-item__icon"></div><div class="dropdown-menu-item__text"><span></span></div><span class="pz-menu-flecha">›</span>';
        var icU = u.querySelector(".dropdown-menu-item__icon");
        icU.textContent = x.icono || MENU_GEN[x.items[0]].icono;
        icU.style.whiteSpace = "nowrap";
        u.querySelector(".dropdown-menu-item__text span").textContent = x.grupo;
        if (x.unidad) {
          var sm = document.createElement("small");
          sm.textContent = "Unidad " + x.unidad;
          u.querySelector(".dropdown-menu-item__text").appendChild(sm);
        }
        u._unidad = x;
        // con el mouse se abre al pasar por encima (con una pausa corta si ya
        // habia otro abierto, para poder ir en diagonal hasta el submenu)
        u.addEventListener("pointerenter", function (e) {
          if (e.pointerType === "touch") return;
          clearTimeout(self.tSub);
          if (!self.filaSub) self.abrirSub(u, false);
          else if (self.filaSub !== u) self.tSub = setTimeout(function () { self.abrirSub(u, false); }, 150);
        });
        // al tocar (o con clic / Enter) se abre y se entra al submenu
        u.onclick = function () { self.abrirSub(u, true); };
        isla.appendChild(u);
      });
      el.appendChild(isla);
      this.el = el;
      // al pasar por un item suelto del menu principal se cierra el submenu
      isla.addEventListener("pointerover", function (e) {
        if (e.pointerType === "touch" || !self.filaSub) return;
        if (e.target.closest && e.target.closest("[data-tipo]")) {
          clearTimeout(self.tSub);
          self.tSub = setTimeout(function () { self.cerrarSub(false); }, 150);
        }
      });
      // al entrar al submenu queda abierto el que esta
      sub.addEventListener("pointerenter", function () { clearTimeout(self.tSub); });
      // flechas para moverse entre los items; Excalidraw no recibe las teclas
      function flechas(cont, e) {
        var items = [].slice.call(cont.querySelectorAll("[data-tipo],[data-seccion]")), i = items.indexOf(document.activeElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          var n = items.length, j = i < 0 ? 0 : (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
          items[j].focus();
        }
      }
      el.addEventListener("keydown", function (e) {
        flechas(el, e);
        var fila = document.activeElement;
        if (e.key === "ArrowRight" && fila && fila._unidad) { e.preventDefault(); self.abrirSub(fila, true); }
        if (e.key !== "Escape") e.stopPropagation();
      });
      sub.addEventListener("keydown", function (e) {
        flechas(sub, e);
        if (e.key === "ArrowLeft") { e.preventDefault(); self.cerrarSub(true); }
        if (e.key !== "Escape") e.stopPropagation();
      });
      // se cierra al tocar afuera o con Escape (dentro del submenu, Escape
      // solo cierra el submenu)
      document.addEventListener("pointerdown", function (e) {
        if (self.abierto && !el.contains(e.target) && !sub.contains(e.target) && !boton.el.contains(e.target)) self.alternar(false);
      }, true);
      document.addEventListener("keydown", function (e) {
        if (!self.abierto || e.key !== "Escape") return;
        e.stopPropagation();
        if (self.filaSub && sub.contains(document.activeElement)) self.cerrarSub(true);
        else self.alternar(false);
      }, true);
      window.addEventListener("resize", function () { if (self.abierto) { self.ubicar(); self.ubicarSub(); } });
    },
    // abre al costado el submenu con los items de la unidad de la fila
    abrirSub: function (fila, enfocar) {
      clearTimeout(this.tSub);
      if (this.filaSub !== fila) {
        this.cerrarSub(false);
        var self = this, x = fila._unidad;
        this.subIsla.innerHTML = "";
        var tit = document.createElement("p");
        tit.className = "dropdown-menu-group-title";
        tit.textContent = x.grupo + (x.unidad ? " (Unidad " + x.unidad + ")" : "");
        this.subIsla.appendChild(tit);
        x.items.forEach(function (t) { self.item(t, self.subIsla); });
        this.sub.setAttribute("aria-label", x.grupo);
        this.filaSub = fila;
        fila.classList.add("abierta");
        fila.setAttribute("aria-expanded", "true");
        if (this.sub.parentNode !== this.el.parentNode) this.el.parentNode.appendChild(this.sub);
        this.marcarActivos();
        this.sub.style.display = "";
        this.ubicarSub();
      }
      if (enfocar) {
        var b = this.sub.querySelector(".activo") || this.sub.querySelector("[data-tipo]");
        if (b) b.focus();
      }
    },
    cerrarSub: function (volver) {
      clearTimeout(this.tSub);
      var fila = this.filaSub;
      if (!fila) return;
      this.filaSub = null;
      fila.classList.remove("abierta");
      fila.setAttribute("aria-expanded", "false");
      this.sub.style.display = "none";
      if (volver) fila.focus();
    },
    // a la derecha del menu, a la altura de la fila (o a la izquierda si no entra)
    ubicarSub: function () {
      if (!this.filaSub) return;
      var m = this.el.getBoundingClientRect(), f = this.filaSub.getBoundingClientRect();
      var w = this.sub.offsetWidth || 260, h = this.sub.offsetHeight;
      var izq = m.right + 4;
      if (izq + w > window.innerWidth - 8) izq = Math.max(8, m.left - w - 4);
      this.sub.style.left = Math.round(izq) + "px";
      this.sub.style.top = Math.round(Math.max(8, Math.min(f.top - 6, window.innerHeight - h - 8))) + "px";
    },
    // resalta el generador abierto y la unidad que lo contiene
    marcarActivos: function () {
      var t = panel.abierto ? panel.tipo : null;
      [].forEach.call(this.el.querySelectorAll("[data-tipo]"), function (b) {
        b.classList.toggle("activo", b.getAttribute("data-tipo") === t);
      });
      [].forEach.call(this.sub.querySelectorAll("[data-tipo]"), function (b) {
        b.classList.toggle("activo", b.getAttribute("data-tipo") === t);
      });
      [].forEach.call(this.el.querySelectorAll("[data-seccion]"), function (b) {
        b.classList.toggle("activo", !!t && b._unidad.items.indexOf(t) >= 0);
      });
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
        this.marcarActivos();
        this.el.style.display = "";
        this.ubicar();
        var activo = this.el.querySelector(".activo") || this.el.querySelector("[data-tipo],[data-seccion]");
        if (activo) activo.focus();
      } else {
        this.cerrarSub(false);
        this.el.style.display = "none";
      }
      boton.actualizar();
    },
    elegir: function (t) {
      this.alternar(false);
      if (MENU_GEN[t].externo) {
        // panel o accion de otro archivo (hojas.js, solucionario.js)
        if (panel.abierto) panel.alternar(false);
        var ext = MENU_GEN[t].externo === "solucionario" ? window.__pizarraSolucionario : window.__pizarraHojas;
        if (ext) ext.abrir();
        return;
      }
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
      b.title = "Generadores: lógica proposicional (tablas de verdad, razonamientos deductivos), álgebra de Boole, conjuntos, diagramas de Venn, relaciones, recta real, gráficos de funciones, estructuras algebraicas, combinatoria (cálculos y expresiones), MCM y MCD, identidad de Bézout, expresiones con valor absoluto, factorización de polinomios, números complejos, simplificación paso a paso y plantillas";
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

  // ------------------------------------------- piezas para otros modulos
  // solucionario.js arma las resoluciones con los mismos renglones (notas,
  // fracciones, raices dibujadas, marcas, llaves) y con los generadores.
  window.__pizarraGeneradores = {
    FUENTES: FUENTES, TAMANOS: TAMANOS, TAM_NOTA: TAM_NOTA, COLORES: COLORES, TINTA: TINTA,
    COLOR: {
      suma: COLOR_SUMA, producto: COLOR_PRODUCTO, condicion: COLOR_CONDICION, caso: COLOR_CASO,
      a: COLOR_A, b: COLOR_B, c: COLOR_C, mal: COLOR_MAL, tinta: TINTA,
    },
    GEN: GEN, tamTitulo: tamTitulo,
    medir: medir, base: base, texto: texto, trazo: trazo, expandirRaices: expandirRaices,
    dibujarBloqueF: dibujarBloqueF, medirItsF: medirItsF, dibujarItsF: dibujarItsF, caja: caja, cajaDe: cajaDe,
    nuevoId: nuevoId, copiar: copiar, corteDe: corteDe, unidoDe: unidoDe,
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
