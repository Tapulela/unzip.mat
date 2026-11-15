// Reconocimiento de texto liviano, por plantillas, para el calcado (calcado.js).
// No es un OCR con modelos entrenados: compara cada letra de la imagen con letras
// dibujadas en el momento en unas cuantas fuentes (no se descarga nada). Conoce
// letras de imprenta (con tildes, ñ y ü), digitos y signos comunes (ALFABETO), y
// por su forma y su lugar en el renglon el punto, la coma, el apostrofo y el menos.
// Anda bien con texto impreso o de captura de pantalla; con letra manuscrita casi
// no reconoce nada, y lo que no reconoce queda calcado como trazos.
//
// Pasos:
//  1. Las manchas de tinta (zonas conectadas) son candidatas a letra. Las rayas
//     horizontales se tratan aparte: dos rayas parejas, una sobre otra, son un
//     "="; una raya con algo arriba y algo abajo es una raya de fraccion (no es
//     texto); una raya corta suelta puede ser un "-".
//  2. Las piezas chicas se pegan a la mancha que tienen justo arriba o abajo: el
//     punto de la i, las tildes, el punto de ? y !, los dos puntos.
//  3. Las letras se agrupan en renglones; de cada renglon se mide la linea de base
//     y la altura de las mayusculas.
//  4. Cada letra se lleva a una grilla de 20x20 (sin deformar), se desenfoca y se
//     compara (coseno) con las plantillas; se penaliza la diferencia de proporcion
//     y de lugar en el renglon (donde empieza y termina respecto de la linea de
//     base: asi se distinguen o/O, c/C o la p de la P). Si no alcanza, no se
//     reconoce.
//  5. Las letras reconocidas seguidas forman un texto, con espacios donde el
//     hueco es mayor que el aire propio de las letras. Las chicas y altas pasan a
//     superindice (x²). Por el contexto de la palabra se corrigen l/I/1 y o/O/0.
// Expone window.__pizarraGlifos = { reconocer }.
(function () {
  "use strict";

  var ALFABETO = "0123456789" +
    "abcdefghijklmnopqrstuvwxyzáéíóúüñ" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑ" +
    "+=()[]<>/∪∩¿?¡!;:";
  var MOLDES_FUENTES = [
    ["Nunito", ""], ["Excalifont", ""], ["Virgil", ""], ["Assistant", ""], ["Cascadia", ""],
    ["Arial", ""], ["Arial", "bold "], ["Verdana", ""], ["Calibri", ""], ["Segoe UI", ""],
    ["Times New Roman", ""], ["Times New Roman", "bold "], ["Georgia", ""], ["Georgia", "bold "],
    ["Cambria", ""], ["Cambria Math", ""], ["Courier New", ""], ["Comic Sans MS", ""],
    ["Liberation Sans", ""], ["Liberation Sans", "bold "], ["Microsoft Sans Serif", ""], ["Tahoma", ""],
    ["Noto Sans", ""],
  ];
  var N = 20;
  var UMBRAL = 0.72;        // parecido minimo para aceptar una letra
  var UMBRAL_SOLA = 0.84;   // para una letra suelta (sin vecinas reconocidas)
  var SUPER = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
    "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ", "x": "ˣ", "y": "ʸ", "a": "ᵃ",
    "b": "ᵇ", "m": "ᵐ", "z": "ᶻ",
  };
  var LETRA = /[a-zA-ZáéíóúüñÁÉÍÓÚÑ]/, DIGITO = /[0-9]/;

  // ------------------------------------------------------------ rasgos
  // grilla NxN de la mancha (centrada, sin deformar), desenfocada y normalizada
  function rasgos(tinta, x0, y0, w, h) {
    var lado = Math.max(w, h), s = lado / N, ox = (lado - w) / 2, oy = (lado - h) / 2, SUB = 3;
    var v = new Float32Array(N * N), i, j;
    for (j = 0; j < N; j++) {
      for (i = 0; i < N; i++) {
        var c = 0;
        for (var b = 0; b < SUB; b++) {
          for (var a = 0; a < SUB; a++) {
            var x = Math.floor((i + (a + 0.5) / SUB) * s - ox), y = Math.floor((j + (b + 0.5) / SUB) * s - oy);
            if (x >= 0 && y >= 0 && x < w && y < h && tinta(x0 + x, y0 + y)) c++;
          }
        }
        v[j * N + i] = c / (SUB * SUB);
      }
    }
    for (var pasada = 0; pasada < 2; pasada++) {
      var o = new Float32Array(N * N);
      for (j = 0; j < N; j++) {
        for (i = 0; i < N; i++) {
          var suma = 0, n = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              var X = i + dx, Y = j + dy;
              if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
              suma += v[Y * N + X]; n++;
            }
          }
          o[j * N + i] = suma / n;
        }
      }
      v = o;
    }
    var media = 0;
    for (i = 0; i < v.length; i++) media += v[i];
    media /= v.length;
    var norma = 0;
    for (i = 0; i < v.length; i++) { v[i] -= media; norma += v[i] * v[i]; }
    norma = Math.sqrt(norma) || 1;
    for (i = 0; i < v.length; i++) v[i] /= norma;
    return v;
  }

  function coseno(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  // ------------------------------------------------------------ plantillas
  var moldes = null;
  function existe(lienzo, familia) {
    var prueba = "0123456789xyzABCD()";
    return ["monospace", "serif"].some(function (resp) {
      lienzo.font = "48px " + resp;
      var a = lienzo.measureText(prueba).width;
      lienzo.font = '48px "' + familia + '", ' + resp;
      return Math.abs(lienzo.measureText(prueba).width - a) > 0.5;
    });
  }

  async function cargarMoldes() {
    if (moldes) return moldes;
    await Promise.all(MOLDES_FUENTES.map(function (f) {
      return document.fonts.load(f[1] + '48px "' + f[0] + '"', ALFABETO).catch(function () {});
    }));
    var T = 120, BASE = 85, X = 30, c = document.createElement("canvas");
    c.width = c.height = T;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    var lista = [];
    function dibujar(ch, fuente) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, T, T);
      ctx.fillStyle = "#000";
      ctx.font = fuente;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(ch, X, BASE);
      var d = ctx.getImageData(0, 0, T, T).data, x0 = T, y0 = T, x1 = -1, y1 = -1;
      var m = new Uint8Array(T * T);
      for (var y = 0; y < T; y++) {
        for (var x = 0; x < T; x++) {
          if (d[(y * T + x) * 4] < 128) {
            m[y * T + x] = 1;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return null;
      var avance = ctx.measureText(ch).width, tinta = 0;
      for (var k = 0; k < m.length; k++) tinta += m[k];
      return { m: m, x0: x0, y0: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, arriba: BASE - y0, abajo: y1 + 1 - BASE,
        izq: x0 - X, der: X + avance - (x1 + 1), llenado: tinta / ((x1 - x0 + 1) * (y1 - y0 + 1)), partes: etiquetar(m, T, T).comps.filter(function (q) { return q.area >= 3; }).length };
    }
    MOLDES_FUENTES.forEach(function (f, nf) {
      if (!existe(ctx, f[0])) return;
      var fuente = f[1] + '48px "' + f[0] + '"';
      var hache = dibujar("H", fuente);
      if (!hache) return;
      var alto = hache.h; // altura de las mayusculas en esta fuente
      ALFABETO.split("").forEach(function (ch) {
        var g = dibujar(ch, fuente);
        if (!g) return;
        lista.push({
          ch: ch, f: nf,
          v: rasgos(function (x, y) { return g.m[y * T + x]; }, g.x0, g.y0, g.w, g.h),
          asp: g.w / g.h,
          rel: g.h / alto,          // altura respecto de una mayuscula
          arriba: g.arriba / alto,  // donde empieza, desde la linea de base
          bajo: g.abajo / alto,     // cuanto baja de la linea de base
          izq: g.izq / alto,        // aire a cada lado (para saber si hay espacio)
          der: g.der / alto,
          partes: g.partes,         // piezas separadas (la i tiene 2, la l una)
          llenado: g.llenado,       // cuanto de su caja es tinta
        });
      });
    });
    moldes = lista;
    return lista;
  }

  // ------------------------------------------------------------ manchas
  function etiquetar(m, w, h) {
    var n = w * h, lab = new Int32Array(n), pila = new Int32Array(n), comps = [];
    var VEC = [-w, 1, w, -1, -w + 1, w + 1, w - 1, -w - 1];
    for (var s = 0; s < n; s++) {
      if (!m[s] || lab[s]) continue;
      var id = comps.length + 1, tope = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
      pila[tope++] = s; lab[s] = id;
      while (tope) {
        var i = pila[--tope], x = i % w, y = (i - x) / w;
        area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
        for (var k = 0; k < 8; k++) {
          var j = i + VEC[k];
          if (m[j] && !lab[j]) { lab[j] = id; pila[tope++] = j; }
        }
      }
      comps.push({ ids: [id], x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1, w: x1 - x0 + 1, h: y1 - y0 + 1, area: area });
    }
    return { lab: lab, comps: comps };
  }

  function mediana(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (p, q) { return p - q; });
    return s[s.length >> 1];
  }
  function solapeX(a, b) { return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0); }
  function unir(a, b) {
    var x0 = Math.min(a.x0, b.x0), y0 = Math.min(a.y0, b.y0), x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
    return { ids: a.ids.concat(b.ids), x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, area: a.area + b.area };
  }

  // corrige las letras que se confunden (l/I/1, o/O/0, S/5, U/∪, n/∩) segun el resto
  // de la palabra
  // mate: el texto tiene numeros y signos (+ - = < >): ahi una S sola es un 5
  function corregirPalabra(p, inicioDeFrase, mate) {
    var AMB = { l: 1, I: 1, "1": 1, O: 1, o: 1, "0": 1, S: 1, "5": 1 };
    var letras = 0, digitos = 0, algunDigito = p.some(function (x) { return DIGITO.test(x.ch); });
    p.forEach(function (x) {
      if (AMB[x.ch]) return;
      if (DIGITO.test(x.ch)) digitos++;
      else if (LETRA.test(x.ch)) letras++;
    });
    // una U sola no es una palabra: es la union (A ∪ B)
    if (p.length === 1 && p[0].ch === "U") { p[0].ch = "∪"; return; }
    p.forEach(function (x, i) {
      var sig0 = p[i + 1] && p[i + 1].ch;
      // ¡ solo abre una palabra (y casi siempre antes de una mayuscula)
      if (x.ch === "¡" && (i > 0 || (sig0 && sig0 === sig0.toLowerCase() && LETRA.test(sig0)))) x.ch = "i";
      else if (x.ch === "i" && i === 0 && sig0 && LETRA.test(sig0) && sig0 !== sig0.toLowerCase()) x.ch = "¡";
      // la interseccion va sola; pegada a letras o con exponente es una n
      if (x.ch === "∩" && p.length > 1) x.ch = "n";
      // un ¹ pegado a una letra es un apostrofo (D')
      if (x.ch === "¹" && i > 0 && LETRA.test(p[i - 1].ch)) x.ch = "'";
      if (!AMB[x.ch]) return;
      if ((digitos || mate) && !letras) {
        if (x.ch === "l" || x.ch === "I") x.ch = "1";
        // (la o sola es la conjuncion: solo pasa a 0 pegada a otros numeros)
        else if (x.ch === "O" || (x.ch === "o" && algunDigito)) x.ch = "0";
        else if (x.ch === "S") x.ch = "5";
      } else if (letras && !digitos) {
        if (x.ch === "1") x.ch = "l";
        else if (x.ch === "0") x.ch = x.arriba > 0.85 ? "O" : "o";
        else if (x.ch === "5") x.ch = "S";
        if (x.ch === "I" || x.ch === "l") {
          // la I mayuscula va al empezar una frase o en una palabra en mayusculas
          // (mirando la siguiente letra que no sea dudosa)
          var sig = null;
          for (var k = i + 1; k < p.length && !sig; k++) if (!AMB[p[k].ch] && LETRA.test(p[k].ch)) sig = p[k].ch;
          var sigMayus = sig && sig !== sig.toLowerCase();
          x.ch = (i === 0 && inicioDeFrase) || sigMayus ? "I" : "l";
        }
      }
    });
  }

  // ------------------------------------------------------------ reconocimiento
  // m: mascara de tinta (se le borra lo reconocido); d: pixeles RGBA originales.
  // Devuelve [{ texto, x0, base, alto, rgb }] en pixeles de trabajo; "alto" es la
  // altura de una mayuscula en ese texto.
  async function reconocer(m, w, h, d) {
    var M = await cargarMoldes();
    if (!M.length) return [];
    var et = etiquetar(m, w, h), lab = et.lab;
    var comps = et.comps.filter(function (c) { return c.area >= 2; });
    var altos = comps.filter(function (c) { return c.h >= 4 && c.w < c.h * 2.2; }).map(function (c) { return c.h; });
    if (!altos.length) return [];
    var medH = mediana(altos);

    // rayas horizontales
    var rayas = [], resto = [];
    comps.forEach(function (c) {
      if (c.w >= 2.2 * c.h && c.h <= Math.max(3, 0.45 * medH)) rayas.push(c);
      else if (c.h <= 3 * medH && c.w <= 3 * medH) resto.push(c);
    });
    rayas = rayas.filter(function (r) {
      var tilde = resto.some(function (c) {
        var hueco = c.y0 - r.y1;
        return hueco >= -1 && hueco <= 0.35 * medH && solapeX(r, c) >= 0.5 * r.w && r.w <= 1.2 * c.w;
      });
      if (tilde) resto.push(r);
      return !tilde;
    });
    var glifos = [], usadas = {};
    rayas.sort(function (a, b) { return a.y0 - b.y0; });
    rayas.forEach(function (a, i) {
      if (usadas[i]) return;
      for (var j = i + 1; j < rayas.length; j++) {
        var b = rayas[j];
        if (usadas[j]) continue;
        var r = a.w / b.w, hueco = b.y0 - a.y1;
        if (r > 0.7 && r < 1.4 && solapeX(a, b) > 0.7 * Math.min(a.w, b.w) && hueco >= 0 && hueco < 0.8 * a.w) {
          usadas[i] = usadas[j] = true;
          glifos.push({ c: unir(a, b), igual: true });
          return;
        }
      }
    });
    rayas.forEach(function (r, i) {
      if (usadas[i]) return;
      var cerca = function (c, arriba) {
        var dist = arriba ? r.y0 - c.y1 : c.y0 - r.y1;
        return solapeX(r, c) > 0 && dist >= -1 && dist <= 1.5 * medH;
      };
      var fraccion = resto.some(function (c) { return cerca(c, true); }) && resto.some(function (c) { return cerca(c, false); });
      if (!fraccion && r.w <= 2 * medH) glifos.push({ c: r, raya: true });
    });

    // primera y ultima fila con tinta de la mancha q entre las columnas x0 y x1
    function bordeEn(q, x0, x1) {
      var arriba = Infinity, abajo = -Infinity;
      if (x1 <= x0) { x0 = q.x0; x1 = q.x1; }
      for (var x = x0; x < x1; x++) {
        for (var y = q.y0; y < q.y1; y++) {
          var l = lab[y * w + x];
          if (l && q.ids.indexOf(l) >= 0) { if (y < arriba) arriba = y; if (y + 1 > abajo) abajo = y + 1; }
        }
      }
      return arriba === Infinity ? null : { arriba: arriba, abajo: abajo };
    }

    // piezas chicas (punto de la i, tildes, punto de ? y !, dos puntos): se pegan a
    // la mancha que tienen justo arriba o abajo
    var piezas = resto.map(function (c) { return { c: c, unida: false }; });
    piezas.sort(function (a, b) { return a.c.area - b.c.area; });
    piezas.forEach(function (s) {
      var c = s.c;
      if (s.unida || c.h >= 0.6 * medH || c.w >= 0.9 * medH) return;
      var mejor = null, mg = Infinity, cx = (c.x0 + c.x1) / 2;
      piezas.forEach(function (p) {
        if (p === s || p.unida) return;
        var q = p.c;
        if (solapeX(c, q) < 0.25 * Math.min(c.w, q.w) && !(cx >= q.x0 && cx <= q.x1)) return;
        var hueco = c.y1 <= q.y0 + 1 ? q.y0 - c.y1 : c.y0 >= q.y1 - 1 ? c.y0 - q.y1 : null;
        // si la mancha es mas alta al costado (la t pegada al palito de la i), el
        // hueco se mide con la tinta que esta justo debajo (o arriba) de la pieza
        if (hueco === null) {
          var cerca = bordeEn(q, Math.max(c.x0, q.x0), Math.min(c.x1, q.x1));
          if (cerca) hueco = c.y1 <= cerca.arriba + 1 ? cerca.arriba - c.y1 : c.y0 >= cerca.abajo - 1 ? c.y0 - cerca.abajo : null;
        }
        // dos piezas chicas (los dos puntos) pueden estar mas separadas que el punto
        // de la i de su palito; asi no se pegan piezas del renglon de al lado
        var chicas = q.h < 0.6 * medH && q.w < 0.9 * medH;
        if (hueco === null || hueco > (chicas ? 0.75 : 0.4) * medH) return;
        if (Math.max(c.y1, q.y1) - Math.min(c.y0, q.y0) > 2.3 * medH) return;
        // costo: el hueco y cuanto se corre del centro (el punto de una i que esta al
        // lado de una f va con la i, no con la f)
        var costo = hueco + 0.6 * Math.abs(cx - (q.x0 + q.x1) / 2);
        if (costo < mg) { mg = costo; mejor = p; }
      });
      if (mejor) { mejor.c = unir(mejor.c, c); s.unida = true; }
    });
    piezas.forEach(function (p) { if (!p.unida) glifos.push({ c: p.c }); });

    // renglones: primero con las letras de buen tamaño
    glifos.forEach(function (g) { g.cy = (g.c.y0 + g.c.y1) / 2; });
    var grandes = glifos.filter(function (g) { return !g.raya && !g.igual && g.c.h >= 0.5 * medH; });
    // de la mas alta a la mas baja: las grandes arman el renglon y las chicas se suman
    grandes.sort(function (a, b) { return b.c.h - a.c.h || a.cy - b.cy; });
    var renglones = [];
    grandes.forEach(function (g) {
      var mejor = null;
      renglones.forEach(function (r) {
        if (mejor) return;
        var sol = Math.min(g.c.y1, r.y1) - Math.max(g.c.y0, r.y0);
        if (sol >= 0.5 * Math.min(g.c.h, r.hm) && g.c.h < 2.5 * r.hm && r.hm < 2.5 * g.c.h) mejor = r;
      });
      // superindice que casi no se superpone con su renglon: chico, con el pie
      // por encima del renglon y pegado a la derecha de una letra
      if (!mejor) {
        renglones.forEach(function (r) {
          var hm = r.hmax;
          if (mejor || g.c.h >= 0.8 * hm || g.c.y1 > r.y1 - 0.3 * hm || g.c.y1 < r.y0) return;
          if (r.g.some(function (q) { var dx = g.c.x0 - q.c.x1; return dx >= -0.1 * hm && dx <= 0.6 * hm; })) mejor = r;
        });
      }
      if (mejor) {
        mejor.g.push(g);
        mejor.y0 = Math.min(mejor.y0, g.c.y0); mejor.y1 = Math.max(mejor.y1, g.c.y1);
        mejor.hmax = Math.max(mejor.hmax, g.c.h);
        mejor.alturas.push(g.c.h);
        if (mejor.alturas.length < 12 || mejor.alturas.length % 8 === 0) mejor.hm = mediana(mejor.alturas);
      } else renglones.push({ g: [g], y0: g.c.y0, y1: g.c.y1, hm: g.c.h, hmax: g.c.h, alturas: [g.c.h] });
    });
    // linea de base y altura de las mayusculas de cada renglon
    // un renglon de una o dos manchas metido en otro mas grande (una coma alta, un
    // signo) se deshace: sus manchas se suman despues como las chicas
    renglones = renglones.filter(function (r) {
      if (r.g.length > 2) return true;
      var dentro = renglones.some(function (o) { return o !== r && o.g.length > 2 && r.y0 < o.y1 && r.y1 > o.y0; });
      if (dentro) r.g.forEach(function (g) { g.suelta = true; });
      return !dentro;
    });
    // Las alturas (desde la linea de base) se parten en dos grupos por el salto mas
    // grande: minusculas (x) y altas (mayusculas, digitos, b, d, l...). Un renglon
    // sin letras altas usa la proporcion del resto de la imagen.
    var proporciones = [], minusculas = [], mayusculas = [];
    renglones.forEach(function (r) {
      var cuerpo = r.g.filter(function (q) { return q.c.h >= 0.5 * medH; });
      r.base = mediana(cuerpo.map(function (q) { return q.c.y1; }));
      r.firme = cuerpo.length >= 3;
      r.x0 = Math.min.apply(null, r.g.map(function (q) { return q.c.x0; }));
      r.x1 = Math.max.apply(null, r.g.map(function (q) { return q.c.x1; }));
      var tops = cuerpo.map(function (q) { return r.base - q.c.y0; }).filter(function (t) { return t > 0; });
      // sin las muy bajas (una coma, un guion), que armarian un grupo propio
      var medTop = mediana(tops);
      tops = tops.filter(function (t) { return t >= 0.45 * medTop; });
      tops.sort(function (a, b) { return a - b; });
      var salto = 0, corte = -1, minimo = Math.max(1, Math.floor(0.15 * tops.length));
      for (var i = minimo - 1; i + 1 < tops.length; i++) {
        var raz = tops[i + 1] / Math.max(1, tops[i]);
        if (raz > salto) { salto = raz; corte = i; }
      }
      if (salto >= 1.18) {
        r.xh = mediana(tops.slice(0, corte + 1));
        r.H = mediana(tops.slice(corte + 1));
        proporciones.push(r.H / r.xh); minusculas.push(r.xh); mayusculas.push(r.H);
      } else {
        r.H = mediana(tops.length ? tops : [medH]);
        r.solo = true;
      }
      r.H = Math.max(2, r.H);
    });
    if (proporciones.length) {
      var prop = mediana(proporciones), xh = mediana(minusculas), mh = mediana(mayusculas);
      renglones.forEach(function (r) {
        // un renglon de una sola altura: si se parece mas a las minusculas, lo es
        if (r.solo && Math.abs(Math.log(r.H / xh)) < Math.abs(Math.log(r.H / mh))) { r.xh = r.H; r.H = r.H * prop; }
      });
    }
    // las chicas (puntos, comas, rayitas, "=") van al renglon mas cercano
    glifos.forEach(function (g) {
      if (grandes.indexOf(g) >= 0 && !g.suelta) return;
      var mejor = null, md = Infinity;
      renglones.forEach(function (r) {
        var arriba = r.base - r.H, dist = g.cy < arriba ? arriba - g.cy : g.cy > r.base + 0.4 * r.H ? g.cy - r.base : 0;
        if (dist <= 0.6 * r.H && g.c.x1 >= r.x0 - 2 * r.H && g.c.x0 <= r.x1 + 2 * r.H && dist < md) { md = dist; mejor = r; }
      });
      if (mejor) mejor.g.push(g);
    });

    // compara una mancha con las plantillas; devuelve { t, p } (la mejor y su puntaje)
    // (solo: compara solo con las plantillas de esa letra)
    function igualar(c, r, sup, ventaja, solo) {
      var H = r.H, base = r.base, ids = c.ids, x0 = c.x0, x1 = c.x1;
      var v = rasgos(function (x, y) { var l = lab[y * w + x]; return l && x >= x0 && x < x1 && ids.indexOf(l) >= 0; },
        c.x0, c.y0, c.w, c.h);
      var aspC = c.w / c.h, arribaC = (base - c.y0) / H, bajoC = (c.y1 - base) / H;
      var lugar = r.firme && !sup, mejor = null, puntaje = -Infinity, partes = c.ids.length;
      for (var k = 0; k < M.length; k++) {
        var t = M[k];
        if (sup && !SUPER[t.ch]) continue;
        if (solo && t.ch !== solo) continue;
        var da = Math.abs(Math.log(aspC / t.asp));
        if (da > 0.8) continue;
        var dl = lugar ? Math.abs(arribaC - t.arriba) + Math.abs(bajoC - t.bajo) : 0;
        if (dl > 0.7) continue;
        // una mancha de varias piezas no es una letra de una pieza (i contra l);
        // al reves puede pasar si las piezas se tocan, pero cuesta
        if (partes > 1 && t.partes === 1) continue;
        var p = coseno(v, t.v) - 0.35 * da - 0.6 * dl - (partes === 1 && t.partes > 1 ? 0.08 : 0);
        if (sup && t.ch >= "0" && t.ch <= "9") p += 0.05;
        if (ventaja && ventaja[t.f]) p += ventaja[t.f];
        if (p > puntaje) { puntaje = p; mejor = t; }
      }
      return { t: mejor, p: puntaje };
    }

    // una parte de la mancha c, entre las columnas x0 y x1 (con su alto real)
    function parte(c, x0, x1) {
      var y0 = Infinity, y1 = -Infinity, ids = [];
      for (var y = c.y0; y < c.y1; y++) {
        for (var x = x0; x < x1; x++) {
          var l = lab[y * w + x];
          if (l && c.ids.indexOf(l) >= 0) {
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            if (ids.indexOf(l) < 0) ids.push(l);
          }
        }
      }
      if (y1 < y0) return null;
      return { ids: ids, x0: x0, y0: y0, x1: x1, y1: y1 + 1, w: x1 - x0, h: y1 + 1 - y0, area: 0 };
    }

    // la pieza de arriba de una letra es un punto (mancha llena y redonda), no una
    // tilde (trazo inclinado): para no confundir la i con la í
    function conPunto(c) {
      var arriba = null;
      c.ids.forEach(function (id) {
        var q = et.comps[id - 1];
        if (!arriba || q.y0 < arriba.y0) arriba = q;
      });
      if (!arriba || c.ids.length < 2) return false;
      var asp = arriba.w / arriba.h;
      return arriba.area / (arriba.w * arriba.h) >= 0.62 && asp > 0.6 && asp < 1.6;
    }

    // letras pegadas (rt, rr): se prueba cortar la mancha por las columnas con menos
    // tinta, en dos o en tres; vale si todas las partes se reconocen
    function cortar(c, r, nivel, ventaja) {
      var H = r.H, cols = [], x, y;
      for (x = c.x0; x < c.x1; x++) {
        var n = 0;
        for (y = c.y0; y < c.y1; y++) { var l = lab[y * w + x]; if (l && c.ids.indexOf(l) >= 0) n++; }
        cols.push(n);
      }
      var margen = Math.max(2, Math.round(0.15 * H)), cand = [];
      for (x = margen; x < cols.length - margen; x++) {
        if (cols[x] <= cols[x - 1] && cols[x] <= cols[x + 1]) cand.push(x);
      }
      cand.sort(function (a, b) { return cols[a] - cols[b]; });
      var mejor = null;
      cand.slice(0, 5).forEach(function (k) {
        var izq = parte(c, c.x0, c.x0 + k), der = parte(c, c.x0 + k, c.x1);
        if (!izq || !der || izq.w < 0.06 * H || der.w < 0.06 * H) return;
        var a = igualar(izq, r, false, ventaja), b = igualar(der, r, false, ventaja);
        var partesA = [{ c: izq, t: a.t, p: a.p }], partesB = [{ c: der, t: b.t, p: b.p }];
        if (a.p < UMBRAL && nivel < 1) { var ca = cortar(izq, r, nivel + 1, ventaja); if (ca) partesA = ca; }
        if (b.p < UMBRAL && nivel < 1) { var cb = cortar(der, r, nivel + 1, ventaja); if (cb) partesB = cb; }
        var todas = partesA.concat(partesB);
        if (todas.some(function (q) { return !q.t || q.p < UMBRAL; })) return;
        var prom = todas.reduce(function (s, q) { return s + q.p; }, 0) / todas.length;
        if (!mejor || prom > mejor.prom) mejor = { prom: prom, partes: todas };
      });
      return mejor && mejor.partes;
    }

    // clasificar (en dos pasadas: una imagen suele tener una o dos fuentes, asi que
    // en la segunda las plantillas de las fuentes que mas ganaron tienen ventaja)
    renglones.forEach(function (r) {
      // de izquierda a derecha, para que cada una conozca a la anterior
      r.g0 = r.g.slice().sort(function (a, b) { return a.c.x0 - b.c.x0; });
    });
    function clasificar(ventaja) {
    renglones.forEach(function (r) {
      var lista = [];
      r.g0.forEach(function (g) {
        var c = g.c, H = r.H, base = r.base;
        g.ch = g.molde = g.puntaje = g.sup = g.regla = null;
        g.prev = lista[lista.length - 1] || null;
        lista.push(g);
        g.arriba = (base - c.y0) / H;
        if (g.raya) {
          if (c.h <= 0.3 * H && c.w <= 1.2 * H && c.y1 <= base - 0.1 * H && c.y0 >= base - 0.85 * H) { g.ch = "-"; g.regla = true; }
          return;
        }
        if (g.igual) {
          if (c.h <= 0.8 * H && c.w <= 1.5 * H) { g.ch = "="; g.regla = true; }
          return;
        }
        // signos chicos, por su forma y su lugar en el renglon
        if (c.h < 0.6 * H && c.w < 0.5 * H && c.ids.length === 1) {
          var asp = c.w / c.h;
          if (c.h < 0.3 * H && asp > 0.5 && asp < 2 && Math.abs(c.y1 - base) <= 0.12 * H) g.ch = ".";
          else if (c.y1 > base + 0.08 * H && c.y0 > base - 0.4 * H && c.h >= 0.9 * c.w) g.ch = ",";
          else if (c.h < 0.45 * H && c.w < 0.25 * H && c.y0 <= base - 0.7 * H && c.y1 < base - 0.3 * H &&
            c.h >= 1.2 * c.w) g.ch = "'";
          else if (asp >= 1.4 && c.h < 0.25 * H && c.y1 <= base - 0.1 * H && c.y0 >= base - 0.85 * H) g.ch = "-";
          if (g.ch) { g.regla = true; return; }
        }
        // superindice: termina bien por encima de la linea de base, o de la letra
        // de su izquierda (si esa letra no baja de la linea, como la y)
        var ant = g.prev, sup = c.y1 < base - 0.3 * H ||
          (ant && ant.molde && !ant.sup && ant.molde.bajo < 0.1 && c.x0 - ant.c.x1 < 0.2 * H &&
            c.y1 < ant.c.y1 - 0.3 * ant.c.h && c.y0 < ant.c.y0);
        var res = igualar(c, r, sup, ventaja), mejor = res.t, puntaje = res.p;
        // un apostrofo grueso se parece a un ¹, pero es mas corto
        if (sup && mejor && mejor.ch === "1" && c.h < 0.5 * H && c.w < 0.3 * H) { g.ch = "'"; g.regla = true; return; }
        // parecido flojo en una mancha ancha: quizas son dos letras pegadas que juntas
        // se parecen a otra (es -> m); gana el corte si se parece claramente mas
        if (mejor && puntaje >= UMBRAL && puntaje < 0.86 && !sup && c.w > 0.9 * H) {
          var corte = cortar(c, r, 0, ventaja);
          if (corte && corte.reduce(function (s, q) { return s + q.p; }, 0) / corte.length > puntaje + 0.03) {
            lista.pop();
            corte.forEach(function (q) {
              lista.push({ c: q.c, ch: q.t.ch, molde: q.t, puntaje: q.p, arriba: (base - q.c.y0) / H, prev: lista[lista.length - 1] });
            });
            return;
          }
        }
        if (mejor && puntaje >= UMBRAL) {
          g.puntaje = puntaje; g.molde = mejor;
          if (sup) { g.sup = true; g.ch = SUPER[mejor.ch]; } else g.ch = mejor.ch;
          if (g.ch === "í" && conPunto(c) && igualar(c, r, false, ventaja, "i").p >= puntaje - 0.04) g.ch = "i";
          return;
        }
        // no se parece a nada: quizas son letras pegadas
        if (!sup && c.w > 0.6 * H) {
          var partes = cortar(c, r, 0, ventaja);
          if (partes) {
            lista.pop();
            partes.forEach(function (q) {
              lista.push({ c: q.c, ch: q.t.ch, molde: q.t, puntaje: q.p, arriba: (base - q.c.y0) / H, prev: lista[lista.length - 1] });
            });
          }
        }
      });
      r.g = lista;
    });
    }
    clasificar(null);
    var votos = {}, total = 0, ventaja = {}, hay = false;
    renglones.forEach(function (r) {
      r.g.forEach(function (g) {
        if (g.molde && g.puntaje >= 0.85) { votos[g.molde.f] = (votos[g.molde.f] || 0) + 1; total++; }
      });
    });
    Object.keys(votos).forEach(function (f) { if (votos[f] >= 0.15 * total) { ventaja[f] = 0.04; hay = true; } });
    if (total >= 8 && hay) clasificar(ventaja);

    // tramos de letras reconocidas seguidas
    var textos = [];
    renglones.forEach(function (r) {
      var tramo = [];
      function cerrar() {
        if (!tramo.length) return;
        var t = tramo;
        tramo = [];
        var normales = t.filter(function (g) { return !g.regla && !g.sup; });
        if (!normales.length) return;
        if (t.length === 1 && !(t[0].puntaje >= UMBRAL_SOLA)) return;
        // una letra suelta tiene que tener el grosor de una letra: una circunferencia
        // dibujada se parece a una O, pero con mucha menos tinta para su tamaño
        var sola = t[0].c;
        if (t.length === 1 && sola.area && t[0].molde &&
          Math.abs(Math.log(sola.area / (sola.w * sola.h) / t[0].molde.llenado)) > 0.45) return;
        // altura de una mayuscula y linea de base, segun lo que se reconocio
        var alto = mediana(normales.map(function (g) { return g.c.h / g.molde.rel; }));
        var base = mediana(normales.map(function (g) { return g.c.y1 - g.molde.bajo * alto; }));
        // espacio: al hueco entre dos letras se le resta el aire que esas letras
        // dejan a sus costados en su fuente (el 1 de Arial deja mucho a la derecha)
        function aire(g, lado) { return g.molde && !g.sup ? g.molde[lado] : 0.06; }
        var palabras = [[]];
        t.forEach(function (g, i) {
          var hueco = i ? g.c.x0 - t[i - 1].c.x1 - alto * (aire(t[i - 1], "der") + aire(g, "izq")) : 0;
          if (i && hueco > 0.15 * alto && !g.sup) palabras.push([]);
          palabras[palabras.length - 1].push(g);
        });
        var texto = "";
        var crudo = t.map(function (g) { return g.ch; }).join("");
        var mate = /[0-9]/.test(crudo) && /[+\-=<>]/.test(crudo);
        palabras.forEach(function (p, i) {
          var previo = texto.replace(/\s+$/, "");
          corregirPalabra(p, i === 0 || /[.¿¡?!:]$/.test(previo) || /^\d+\.$/.test(previo), mate);
          texto += (i ? " " : "") + p.map(function (g) { return g.ch; }).join("");
        });
        var rr = 0, gg = 0, bb = 0, n = 0;
        t.forEach(function (g) {
          g.c.ids.forEach(function (id) {
            for (var y = g.c.y0; y < g.c.y1; y++) {
              for (var x = g.c.x0; x < g.c.x1; x++) {
                var q = y * w + x;
                if (lab[q] !== id) continue;
                // con mas peso los pixeles mas oscuros: los bordes suavizados aclaran el color
                var pr = d[q * 4], pg = d[q * 4 + 1], pb = d[q * 4 + 2];
                var peso = Math.pow(255 - (0.299 * pr + 0.587 * pg + 0.114 * pb), 2) + 1;
                rr += pr * peso; gg += pg * peso; bb += pb * peso; n += peso;
                m[q] = 0;
              }
            }
          });
        });
        textos.push({ texto: texto, x0: t[0].c.x0, base: base, alto: alto, rgb: [rr / n, gg / n, bb / n] });
      }
      r.g.forEach(function (g) {
        var prev = tramo[tramo.length - 1];
        if (!g.ch) { cerrar(); return; }
        if (prev && g.c.x0 - prev.c.x1 > 1.2 * r.H) cerrar();
        tramo.push(g);
      });
      cerrar();
    });
    return textos;
  }

  window.__pizarraGlifos = { reconocer: reconocer };
})();
