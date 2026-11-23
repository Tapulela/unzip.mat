// Solucionario: importa una resolucion escrita en JSON (formato
// «unzip.mat/solucion@1», documentado en el repositorio de solucionarios) y la
// dibuja en hojas A4 nuevas, lista para corregir a mano e imprimir.
//  - Los pasos usan los mismos renglones que los generadores (generadores.js):
//    notas antes de cada paso, fracciones, raices dibujadas, marcas ✓/✗
//    dibujadas, llaves, bifurcaciones, recuadros y sistemas.
//  - Los graficos (recta real, funciones, tablas de verdad...) se arman con el
//    generador correspondiente y quedan vinculados a el: al seleccionarlos se
//    editan desde su panel.
//  - Cada pieza (titulo, enunciado, bloque de pasos, grafico) se corta en
//    renglones (lo que se superpone en vertical va junto) y los renglones se
//    reparten en hojas A4 creadas con los margenes del panel de hojas.js.
//    Un titulo nunca queda solo al pie de una hoja.
//  - Menu de Generadores → «Impresión» → «Importar solución (.json)», o desde
//    codigo: window.__pizarraSolucionario.importar(objetoOTexto).
// Usa window.__pizarraAPI, window.__pizarraGeneradores y window.__pizarraHojas.
(function () {
  function api() { return window.__pizarraAPI; }
  function G() { return window.__pizarraGeneradores; }
  function H() { return window.__pizarraHojas; }

  var FORMATO = "unzip.mat/solucion@1";
  var COLOR_ENUNCIADO = "#495057";
  var COLOR_EJERCICIO = "#1971c2";

  // --------------------------------------------------------------- colores
  // nombres del formato: suma (verde), producto (violeta), mal (rojo),
  // condicion, caso, a, b, c, tinta, azul, rojo, verde, naranja, violeta,
  // celeste, gris; o un color #rrggbb
  function color(c, defecto) {
    if (!c) return defecto;
    if (/^#[0-9a-f]{3,8}$/i.test(c)) return c;
    var g = G(), k = String(c).toLowerCase();
    var nombres = {
      azul: g.COLORES[0], rojo: g.COLORES[1], verde: g.COLORES[2], naranja: g.COLORES[3],
      violeta: g.COLORES[4], celeste: g.COLORES[5], gris: "#868e96",
    };
    return g.COLOR[k] || nombres[k] || defecto;
  }

  // ---------------------------------------------------- items y renglones
  // item: "texto" | { t, color } | { frac: [num, den] } | { raiz: x } |
  //       { marca: "ok" | "mal" } | { sistema: [filas] } | { tabla: [[celdas]] }
  // donde num, den, x, cada fila y cada celda son un item o una lista de items.
  function items(x, ruta, errores) {
    if (x === null || x === undefined) return [];
    if (Array.isArray(x)) return x.map(function (y, i) { return item(y, ruta + "[" + i + "]", errores); });
    return [item(x, ruta, errores)];
  }
  function item(x, ruta, errores) {
    if (typeof x === "string" || typeof x === "number") return { t: String(x) };
    if (!x || typeof x !== "object") { errores.push(ruta + ": item inválido"); return { t: "" }; }
    if (typeof x.t === "string") return { t: x.t, color: color(x.color, undefined) };
    if (Array.isArray(x.frac) && x.frac.length === 2) {
      return { frac: [items(x.frac[0], ruta + ".frac[0]", errores), items(x.frac[1], ruta + ".frac[1]", errores)], color: color(x.color, undefined) };
    }
    if (x.raiz !== undefined) {
      return { raiz: items(x.raiz, ruta + ".raiz", errores), indice: x.indice !== undefined ? String(x.indice) : undefined,
        color: color(x.color, undefined) };
    }
    if (x.marca === "ok" || x.marca === "mal") return { marca: x.marca };
    if (Array.isArray(x.sistema)) {
      return { sistema: x.sistema.map(function (f, i) { return items(f, ruta + ".sistema[" + i + "]", errores); }), color: color(x.color, undefined) };
    }
    if (Array.isArray(x.tabla)) {
      return { tabla: x.tabla.map(function (f, i) {
        return (Array.isArray(f) ? f : [f]).map(function (c, j) { return items(c, ruta + ".tabla[" + i + "][" + j + "]", errores); });
      }), lineas: x.lineas === true, alinear: x.alinear };
    }
    errores.push(ruta + ": no se reconoce el item " + JSON.stringify(x).slice(0, 60));
    return { t: "" };
  }

  function notas(n, c) {
    if (!n) return null;
    return (Array.isArray(n) ? n : [n]).map(function (t) { return { t: String(t), color: c }; });
  }

  // renglon: { izq, rel, der, nota, notaColor, color, caja, llave, rama,
  //            marcar: { de, a, texto, color }, seccion }
  function renglon(r, ruta, errores) {
    var g = G();
    if (typeof r === "string" || Array.isArray(r)) r = { der: r };
    var der = items(r.der, ruta + ".der", errores);
    var l = {
      // el miembro izquierdo: un texto o, como der, una lista de items (fracciones, colores)
      izq: r.izq ? (Array.isArray(r.izq) || typeof r.izq === "object" ? items(r.izq, ruta + ".izq", errores) : String(r.izq)) : null,
      rel: r.rel !== undefined ? r.rel : (r.izq ? "=" : null),
      der: der,
      nota: notas(r.nota, color(r.notaColor, g.TINTA)),
      color: color(r.color, undefined),
    };
    if (r.rama) {
      // renglon de una bifurcacion: «x₁ = ...» con flecha desde la llave anterior
      l.der = [{ t: String(r.rama) + " = " }].concat(der);
      l.rel = null; l.izq = null; l.rama = true;
    }
    if (r.caja) l.caja = r.caja === true ? (l.color || g.TINTA) : color(r.caja, g.TINTA);
    if (r.llave) l.llave = true;
    if (r.seccion) l.corte = true;
    if (l.rel === null && !l.rama) l.libre = !!r.libre;
    if (r.marcar) {
      var m = r.marcar, de = l.der[(r.rama ? 1 : 0) + (m.de | 0)], a = l.der[(r.rama ? 1 : 0) + (m.a === undefined ? m.de | 0 : m.a | 0)];
      if (!de || !a || !de.t || !a.t) errores.push(ruta + ".marcar: «de» y «a» tienen que ser índices de textos de «der»");
      else l.marcar = { de: de, a: a, texto: (Array.isArray(m.texto) ? m.texto : [m.texto || ""]).map(String), color: color(m.color, g.COLOR.producto) };
    }
    return l;
  }

  // --------------------------------------------------------- piezas
  // Cada pieza se dibuja con su esquina en (0, 0) y despues se ubica.
  // { els, unir (no separar del siguiente), gid (dibujo de un generador) }
  // xResto (opcional): donde empiezan los renglones despues del primero, para
  // una sangria francesa mas chica que el rotulo de la consigna
  function escribirParrafo(str, x, y, maxW, tam, fuente, col, agregar, xResto) {
    var g = G(), lh = tam * fuente.lh, primero = true;
    var finW = x + maxW; // borde derecho
    if (xResto === undefined) xResto = x;
    function xa() { return primero ? x : xResto; }
    function poner(t) { agregar(g.texto(xa(), y, t, tam, fuente, col, "left")); y += lh; primero = false; }
    String(str).split("\n").forEach(function (par) {
      var palabras = par.split(/ +/), linea = "";
      palabras.forEach(function (p) {
        var prueba = linea ? linea + " " + p : p;
        if (linea && g.medir(prueba, tam, fuente) > finW - xa()) { poner(linea); linea = p; }
        else linea = prueba;
      });
      if (linea) poner(linea);
      else { y += lh; primero = false; }
    });
    return y;
  }

  function nuevaPieza(unir) {
    var els = [];
    return { els: els, unir: !!unir, agregar: function (e) { G().expandirRaices(e).forEach(function (p) { els.push(p); }); return e; } };
  }

  // texto violeta que no se imprime: un marcador del PDF (ver hojas.js), en el
  // margen izquierdo, centrado en un renglon de alto `altoRenglon` que empieza en y0
  var NIVELES_MARCADOR = 4;
  // alto máximo de dos secciones lado a lado (alLado): una parte del alto útil,
  // para que el par, que no se parte entre hojas, entre en una con cabecera y pie
  var altoPar = Infinity;
  function textoMarcador(titulo, nivel, y0, altoRenglon, fuente) {
    var g = G(), tamM = 10, w = g.medir(titulo, tamM, fuente);
    var e = g.texto(-w - 6, y0 + (altoRenglon - tamM * fuente.lh) / 2, titulo, tamM, fuente, "#6965db", "left");
    e.customData = { pizarraMarcador: { nivel: Math.max(1, Math.min(NIVELES_MARCADOR, nivel)), imprime: false } };
    return e;
  }

  // titulo de un marcador con una plantilla: {rotulo} es el rotulo sin los dos
  // puntos o el parentesis del final («Ejercicio 4», «4.a») y {enunciado}, el
  // primer renglon del enunciado
  function conPlantilla(pl, rotulo, enunciado) {
    var r = String(rotulo || "").trim().replace(/[:)\].-]+$/, "").trim();
    var en = String(enunciado || "").split("\n")[0].trim();
    return pl.replace(/\{rotulo\}/g, r).replace(/\{enunciado\}/g, en).replace(/\s+/g, " ").replace(/^[\s:]+|[\s:]+$/g, "");
  }

  // devuelve la lista de piezas de toda la solucion y los errores
  // opc (para un cuadernillo, todo opcional):
  //   nivelBase: se suma al nivel de los marcadores (los de un TP quedan adentro del TP)
  //   marcadorTitulo: { titulo, nivel } marcador en el titulo de la solucion
  //   marcadores: { ejercicio, item } plantillas (ver conPlantilla) para los
  //     marcadores de los ejercicios y de los items: se ponen aunque la solucion
  //     no los tenga y reemplazan a los que son `true`
  function armar(sol, maxW, opc) {
    opc = opc || {};
    var g = G(), errores = [], avisos = [], piezas = [];
    var base = opc.nivelBase | 0, plantillas = opc.marcadores || {};
    var est = sol.estilo || {};
    var fuente = g.FUENTES[est.fuente] || g.FUENTES.normal, fKey = g.FUENTES[est.fuente] ? est.fuente : "normal";
    var tamK = g.TAMANOS[est.tam] ? est.tam : "M", tam = g.TAMANOS[tamK], lh = tam * fuente.lh;
    var opPasos = { fuente: fKey, tamTexto: tamK, notas: est.notas !== false };
    var sangria = tam * 1.6;

    if (sol.titulo) {
      var p = nuevaPieza(true), tT = g.tamTitulo(g.tamTitulo(tam));
      var y = escribirParrafo(sol.titulo, 0, 0, maxW, tT, fuente, g.TINTA, p.agregar);
      if (sol.subtitulo) y = escribirParrafo(sol.subtitulo, 0, y + 4, maxW, tam, fuente, COLOR_ENUNCIADO, p.agregar);
      p.agregar(g.trazo([[0, y + tam * 0.4], [maxW, y + tam * 0.4]], { strokeColor: g.TINTA, strokeWidth: 1.5 }));
      p.unir = false;
      p.espacio = lh;
      if (opc.marcadorTitulo && opc.marcadorTitulo.titulo) {
        p.els.push(textoMarcador(opc.marcadorTitulo.titulo, opc.marcadorTitulo.nivel || 1, 0, tT * fuente.lh, fuente));
      }
      piezas.push(p);
    }

    // seccion: { seccion: "Título", bloques: [...] }. El título va subrayado (del
    // tamaño del texto) y el contenido, con sangría y una línea vertical a la
    // izquierda que acompaña cada renglón, también si la sección sigue en otra hoja.
    // barras: las líneas de las secciones que encierran a un bloque [{ x, id }]
    var sangSec = tam * 1.4, nSec = 0;

    // marcador del PDF (Hojas A4 → «Agregar marcadores a un PDF»): en un
    // ejercicio, un ítem o una sección, «marcador» es true (el título es el
    // rótulo y el enunciado, o el título de la sección), un texto (el título) o
    // { titulo, nivel } (nivel 1 a 3). Se agrega a la pieza del título un texto
    // violeta que no se imprime, en el margen izquierdo, a la altura del primer
    // renglón: el lector de PDF lo muestra en su panel y lleva a ese lugar.
    function marcar(p, valor, tituloPorDefecto, nivelPorDefecto, altoRenglon) {
      if (!valor || !p) return;
      var lhR = altoRenglon || lh;
      var o = typeof valor === "object" ? valor : {};
      var titulo = String(typeof valor === "string" ? valor : o.titulo || tituloPorDefecto).replace(/\s+/g, " ").trim();
      if (!titulo) return;
      var nivel = Math.max(1, Math.min(3, (o.nivel | 0) || nivelPorDefecto || 1)) + base;
      p.els.push(textoMarcador(titulo, nivel, 0, lhR, fuente));
    }
    // marcador de un ejercicio o un item con la plantilla del cuadernillo
    function conPlantillaDe(valor, pl, rot, enun) {
      if (typeof pl !== "string" || (valor !== undefined && valor !== true)) return valor;
      return conPlantilla(pl, rot, enun) || valor;
    }

    // una sección: el título subrayado y sus bloques; devuelve su barra
    var aMedia = false; // armando una sección a media hoja (alLado)
    function seccion(b, x, rb, barras) {
      var p = nuevaPieza(true);
      var colS = color(b.color, COLOR_EJERCICIO);
      var yS = escribirParrafo(String(b.seccion), x, 0, maxW - x, tam, fuente, colS, p.agregar);
      var wS = Math.min(maxW - x, g.medir(String(b.seccion), tam, fuente));
      p.agregar(g.trazo([[x, yS + 1], [x + wS, yS + 1]], { strokeColor: colS, strokeWidth: 1.5 }));
      p.barras = barras;
      p.espacio = lh * 0.3;
      marcar(p, b.marcador, String(b.seccion), barras.length + 1);
      piezas.push(p);
      var hijas = barras.concat([{ x: x + sangSec * 0.35, id: ++nSec, color: colS }]);
      bloques(b.bloques, x + sangSec, rb, hijas);
      return hijas[hijas.length - 1];
    }
    function anchoDe(p) {
      var x1 = -Infinity;
      p.els.forEach(function (e) { if (!(e.customData && e.customData.pizarraMarcador)) x1 = Math.max(x1, g.caja(e).x1); });
      return x1;
    }
    function bloques(lista, x, ruta, barras) {
      barras = barras || [];
      var n0 = piezas.length;
      bloquesSin(lista, x, ruta, barras);
      for (var k = n0; k < piezas.length; k++) if (piezas[k].els && !piezas[k].barras) piezas[k].barras = barras;
    }
    function bloquesSin(lista, x, ruta, barras) {
      var secAnt = null; // la sección anterior de esta lista (para alLado)
      (lista || []).forEach(function (b, i) {
        var rb = ruta + ".bloques[" + i + "]", p;
        if (typeof b === "string") b = { texto: b };
        var antes = secAnt; secAnt = null;
        if (b.salto) { piezas.push({ salto: true }); return; }
        if (b.espacio) { piezas.push({ hueco: (+b.espacio || 1) * lh }); return; }
        if (b.seccion !== undefined) {
          var desdeS = piezas.length;
          var propia = seccion(b, x, rb, barras);
          // alLado: esta sección va a la derecha de la sección anterior; si no
          // entran tal cual, se rearman las dos a media hoja (los textos se cortan
          // al ancho de la columna y los pasos llevan las notas arriba)
          if (b.alLado) {
            if (!antes) avisos.push(rb + ".alLado: no hay una sección anterior al que ponerse al lado; va debajo");
            else {
              var r1 = seccionAlLado(antes, desdeS, propia, barras, rb, true);
              if (r1 === true) desdeS = antes.desde;
              else if (r1 === "ancho") {
                var nAv = avisos.length, nErr = errores.length, maxW0 = maxW;
                piezas.splice(antes.desde);
                maxW = x + (maxW0 - x - tam * 2) / 2; aMedia = true;
                var dA = piezas.length, barA = seccion(antes.b, x, antes.rb, barras);
                var dB = piezas.length, barB = seccion(b, x, rb, barras);
                maxW = maxW0; aMedia = false;
                avisos.length = nAv; errores.length = nErr; // ya salieron al armarlas la primera vez
                if (seccionAlLado({ desde: dA, barra: barA }, dB, barB, barras, rb, true) === true) desdeS = dA;
                else {
                  // tampoco a media hoja: una debajo de la otra, como estaban
                  piezas.splice(dA);
                  seccion(antes.b, x, antes.rb, barras);
                  desdeS = piezas.length; propia = seccion(b, x, rb, barras);
                  avisos.length = nAv; errores.length = nErr;
                  avisos.push(rb + ".alLado: no entra al lado de la sección anterior (ni a media hoja); va debajo");
                }
              } else if (r1 === "alto") avisos.push(rb + ".alLado: las dos secciones juntas son muy altas para una hoja; va debajo");
              else avisos.push(rb + ".alLado: solo se aplica a secciones sin secciones, gráficos que se parten ni saltos adentro; va debajo");
            }
          }
          secAnt = { desde: desdeS, barra: propia, b: b, rb: rb };
          return;
        }
        if (b.texto !== undefined) {
          p = nuevaPieza(!!b.unir); // unir: no se separa de lo que le sigue
          escribirParrafo(b.texto, x, 0, maxW - x, b.tam && g.TAMANOS[b.tam] || tam, fuente, color(b.color, g.TINTA), p.agregar);
          piezas.push(p);
        } else if (Array.isArray(b.pasos)) {
          var L = b.pasos.map(function (r, j) { return renglon(r, rb + ".pasos[" + j + "]", errores); });
          if (!L.length) return;
          // notas: "arriba" escribe la nota de cada paso arriba de su renglon;
          // si no, van a la derecha y, si el bloque va al lado de otro (alLado) y
          // no entra, se rehace con las notas arriba (rehacer)
          // tam: tamaño del texto de este bloque (S, M, L, XL), por ejemplo un
          // renglón largo en S para que entre a lo ancho de la hoja
          var opB = {}; for (var kb in opPasos) opB[kb] = opPasos[kb];
          if (b.tam && g.TAMANOS[b.tam]) opB.tamTexto = b.tam;
          var opArriba = {}; for (var kk in opB) opArriba[kk] = opB[kk];
          opArriba.notasArriba = true;
          p = nuevaPieza(!!b.unir); // unir: no se separa de lo que le sigue
          p.entero = !!b.entero; // entero: el desarrollo no se parte entre hojas (si entra en una)
          try { g.dibujarBloqueF(L, x, 0, b.notas === "arriba" ? opArriba : opB, p.agregar); }
          catch (e) { errores.push(rb + ": no se pudo dibujar (" + (e && e.message || e) + ")"); return; }
          if (b.notas !== "arriba") p.rehacer = (function (L, x, entero, unir) {
            return function () {
              var q = nuevaPieza(unir); q.entero = entero;
              g.dibujarBloqueF(L, x, 0, opArriba, q.agregar);
              return q;
            };
          })(L, x, p.entero, p.unir);
          // a media hoja (dos secciones lado a lado): si con las notas a la
          // derecha no entra en la columna, van arriba de cada renglón
          if (aMedia && p.rehacer && anchoDe(p) > maxW + 1) p = p.rehacer();
          piezas.push(p);
        } else if (b.generador) {
          var gen = g.GEN[b.generador];
          if (!gen) { errores.push(rb + ": no existe el generador «" + b.generador + "» (hay: " + Object.keys(g.GEN).join(", ") + ")"); return; }
          var op = g.copiar(gen.defecto);
          for (var k in b.op || {}) op[k] = b.op[k];
          p = nuevaPieza();
          var gid = g.nuevoId(), tmp = [];
          try { gen.generar(op, x, 0, function (e) { tmp.push(e); return e; }); }
          catch (e) { errores.push(rb + ": el generador «" + b.generador + "» falló (" + (e && e.message || e) + ")"); return; }
          // columnas: 2 (raíces n-ésimas) solo si entra a lo ancho; si no, en una columna
          if (+op.columnas === 2 && tmp.length) {
            var x1t = -Infinity;
            tmp.forEach(function (e) { x1t = Math.max(x1t, g.caja(e).x1); });
            if (x1t > maxW + 1) {
              op.columnas = 1; tmp = [];
              gen.generar(op, x, 0, function (e) { tmp.push(e); return e; });
            }
          }
          // un dibujo que se extiende a la izquierda de su origen (un plano con la
          // parte negativa del eje real) no se sale del area util: si se sale, se
          // corre a la derecha hasta alinearse con el rotulo de su item
          var x0g = Infinity, minX = Math.max(0, x - sangria * 0.5);
          tmp.forEach(function (e) { x0g = Math.min(x0g, g.caja(e).x0); });
          if (x0g < 0) tmp.forEach(function (e) { e.x += minX - x0g; });
          // cortes: donde se puede partir el dibujo entre hojas (regla de los signos)
          var cortes = g.corteDe ? [] : null, unidos = [];
          tmp.forEach(function (e) {
            var ct = cortes && g.corteDe(e), un = g.unidoDe && g.unidoDe(e);
            g.expandirRaices(e).forEach(function (q) { p.els.push(q); if (cortes) cortes.push(ct); if (un) unidos.push(q); });
          });
          if (unidos.length) p.unidos = unidos;
          if (cortes && cortes.some(Boolean)) p.cortes = cortes;
          // avisos propios del generador (datos inconsistentes o que no alcanzan...)
          if (gen.avisos) gen.avisos(op).forEach(function (a) { avisos.push(rb + ": " + a); });
          if (!p.els.length) { avisos.push(rb + ": el generador «" + b.generador + "» no dibujó nada (¿datos con errores?)"); return; }
          // vinculado al generador, como si se hubiera insertado desde el panel
          p.els.forEach(function (e) { e.customData = { pizarra: { tipo: b.generador, gid: gid } }; });
          var d = p.els[0].customData.pizarra;
          d.eje = true; d.opciones = g.copiar(op); d.origen = [p.els[0].x - x, p.els[0].y];
          p.gid = gid;
          // partir: el dibujo se puede repartir entre hojas renglon por renglon
          // (un calculo largo, como las raices n-esimas, en vez de pasar entero
          // a la hoja siguiente). La parte de cada hoja ya no se regenera desde el panel
          if (b.partir) p.partir = true;
          piezas.push(p);
        } else if (b.qr !== undefined) {
          p = bloqueQr(b, x, rb);
          if (!p) return;
          piezas.push(p);
        } else if (Array.isArray(b.triangulos)) {
          p = bloqueTriangulos(b, x, rb);
          if (!p) return;
          piezas.push(p);
        } else {
          errores.push(rb + ": bloque sin «texto», «pasos», «generador», «seccion», «qr», «triangulos», «salto» ni «espacio»");
        }
        // aviso propio si la hoja se corta justo antes de este bloque (estilo.continuacion)
        if (p && typeof b.continua === "string") p.continua = b.continua;
        // alLado: este bloque va a la derecha del bloque anterior
        if (p && b.alLado) bloqueAlLado(b.alLado, rb);
      });
    }

    // triangulos: { triangulos: [ { nombre: "T₁", angulos: [90, 30, 60] }, "R", ... ],
    // alto, color }. Una fila de triangulos dibujados a partir de sus angulos
    // (en grados, suman 180): el primero abajo a la izquierda, el segundo abajo a
    // la derecha y el tercero arriba. Cada angulo lleva su arco y su medida
    // (el recto, el cuadradito); el nombre va arriba. Un texto suelto de la
    // lista ("R", "∧", "=") se escribe entre los triangulos, a media altura.
    // Todos quedan apoyados en la misma linea; `alto` es la altura maxima.
    function bloqueTriangulos(b, x, rb) {
      var alto = typeof b.alto === "number" && b.alto > 0 ? b.alto : 80;
      var anchoMax = alto * 2.2, gap = tam * 0.9, tamA = g.TAMANOS.S;
      var col = color(b.color, g.TINTA), colA = color(b.colorAngulos, g.TINTA);
      var rad = Math.PI / 180, figs = [], malo = false;
      b.triangulos.forEach(function (it, j) {
        if (typeof it === "string") { figs.push({ texto: it, w: g.medir(it, tam, fuente) }); return; }
        var a = it && it.angulos;
        if (!Array.isArray(a) || a.length !== 3 || a.some(function (v) { return !(typeof v === "number" && v > 0); }) ||
            Math.abs(a[0] + a[1] + a[2] - 180) > 0.01) {
          errores.push(rb + ".triangulos[" + j + "].angulos: tienen que ser tres números positivos que sumen 180");
          malo = true; return;
        }
        // A = (0, 0), B = (1, 0), C arriba (y hacia arriba); despues se escala
        var ac = Math.sin(a[1] * rad) / Math.sin(a[2] * rad);
        var P = [[0, 0], [1, 0], [ac * Math.cos(a[0] * rad), ac * Math.sin(a[0] * rad)]];
        var x0 = Math.min(0, P[2][0]), x1 = Math.max(1, P[2][0]), h = P[2][1];
        var s = Math.min(alto / h, anchoMax / (x1 - x0));
        figs.push({ P: P.map(function (q) { return [(q[0] - x0) * s, q[1] * s]; }), w: (x1 - x0) * s, h: h * s,
          angulos: a, nombre: it.nombre ? String(it.nombre) : "" });
      });
      if (malo || !figs.length) return null;
      var conNombre = figs.some(function (f) { return f.nombre; });
      var base = (conNombre ? tam * fuente.lh + 6 : 0) + alto;
      var p = nuevaPieza(), cx = x;
      // cada figura se arma desde x = 0 y despues se corre: asi las medidas que
      // quedan afuera del triangulo tambien entran en la separacion
      figs.forEach(function (f) {
        var els = [], agregar = function (e) { els.push(e); };
        if (f.texto !== undefined) agregar(g.texto(f.w / 2, base - alto / 2 - tam * fuente.lh / 2, f.texto, tam, fuente, g.TINTA, "center"));
        else dibujarTriangulo(f, agregar);
        var x0 = Infinity, x1 = -Infinity;
        els.forEach(function (e) { var c = g.caja(e); x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); });
        els.forEach(function (e) { e.x += cx - x0; p.agregar(e); });
        cx += x1 - x0 + gap;
      });
      if (cx - gap > maxW + 1) avisos.push(rb + ": los triángulos no entran a lo ancho de la hoja; conviene bajar «alto» o partirlos en dos bloques");
      p.entero = true;
      return p;

      function dibujarTriangulo(f, agregar) {
        var p = { agregar: agregar }, cx = 0;
        var V = f.P.map(function (q) { return [q[0], base - q[1]]; });
        p.agregar(g.trazo([V[0], V[1], V[2], V[0]], { strokeColor: col, strokeWidth: 1.5 }));
        if (f.nombre) p.agregar(g.texto(cx + f.w / 2, base - f.h - tam * fuente.lh - 6, f.nombre, tam, fuente, col, "center"));
        [0, 1, 2].forEach(function (k) {
          var v = V[k], q1 = V[(k + 1) % 3], q2 = V[(k + 2) % 3], th = f.angulos[k];
          var u1 = [q1[0] - v[0], q1[1] - v[1]], u2 = [q2[0] - v[0], q2[1] - v[1]];
          var n1 = Math.hypot(u1[0], u1[1]), n2 = Math.hypot(u2[0], u2[1]);
          u1 = [u1[0] / n1, u1[1] / n1]; u2 = [u2[0] / n2, u2[1] / n2];
          var bi = [u1[0] + u2[0], u1[1] + u2[1]], nb = Math.hypot(bi[0], bi[1]);
          bi = [bi[0] / nb, bi[1] / nb];
          var r = Math.min(13, Math.min(n1, n2) * 0.3);
          if (Math.abs(th - 90) < 0.5) {
            var m = r * 0.8;
            p.agregar(g.trazo([[v[0] + u1[0] * m, v[1] + u1[1] * m],
              [v[0] + (u1[0] + u2[0]) * m, v[1] + (u1[1] + u2[1]) * m],
              [v[0] + u2[0] * m, v[1] + u2[1] * m]], { strokeColor: colA, strokeWidth: 1 }));
            return;
          }
          // arco de u1 a u2 por el lado del angulo interior
          var a1 = Math.atan2(u1[1], u1[0]), a2 = Math.atan2(u2[1], u2[0]), da = a2 - a1;
          while (da > Math.PI) da -= 2 * Math.PI;
          while (da < -Math.PI) da += 2 * Math.PI;
          var arco = [];
          for (var i = 0; i <= 12; i++) { var t = a1 + da * i / 12; arco.push([v[0] + r * Math.cos(t), v[1] + r * Math.sin(t)]); }
          p.agregar(g.trazo(arco, { strokeColor: colA, strokeWidth: 1 }));
          // la medida va adentro, sobre la bisectriz; si el angulo es muy
          // cerrado no entra y va afuera, del otro lado del vertice
          var txt = String(Math.round(th * 100) / 100).replace(".", ",") + "°";
          var wt = g.medir(txt, tamA, fuente), ht = tamA * fuente.lh;
          var d = (wt / 2 + 3) / Math.tan(th * rad / 2) + ht / 2;
          var dentro = th >= 35 && d < Math.min(n1, n2) * 0.5;
          var dist = dentro ? Math.max(r + ht / 2 + 2, d) : r * 0.4 + wt / 2 + 4;
          var sg = dentro ? 1 : -1;
          var cxT = v[0] + sg * bi[0] * dist, cyT = v[1] + sg * bi[1] * dist;
          p.agregar(g.texto(cxT, cyT - ht / 2, txt, tamA, fuente, colA, "center"));
        });
      }
    }

    // qr: { qr: "https://…", titulo, lado, ancho }. Un codigo QR dibujado con
    // rectangulos negros (uno por tramo de modulos oscuros de cada fila), con el
    // titulo arriba y la direccion escrita abajo, centrados en una columna de
    // `ancho` (por defecto, media area util: dos QR entran lado a lado con
    // alLado). En el PDF, la columna entera es un enlace a la direccion.
    function bloqueQr(b, x, rb) {
      var url = String(b.qr || "").trim();
      if (!url) { errores.push(rb + ".qr: falta la dirección"); return null; }
      var Q = window.qrcode;
      if (!Q) { errores.push(rb + ".qr: no se pudo cargar el generador de códigos QR"); return null; }
      var anchoC = typeof b.ancho === "number" && b.ancho > 0 ? b.ancho : (maxW - x - tam * 2) / 2;
      var lado = Math.min(typeof b.lado === "number" && b.lado > 0 ? b.lado : 200, anchoC);
      var p = nuevaPieza(), fila = g.nuevoId(), cx = x + anchoC / 2, y = 0;
      function enlace(e) { e.customData = { pizarraEnlace: { url: url, fila: fila } }; return e; }
      // renglones centrados; `cortar` parte en cualquier lugar despues de / . - ? = & (una direccion)
      function centrado(str, tamT, col, cortar) {
        var partes = cortar ? str.split(/(?<=[\/.\-?=&_])/) : str.split(/(?<= )/), linea = "";
        function poner(l) { if (!l.trim()) return; p.els.push(enlace(g.texto(cx, y, l.trim(), tamT, fuente, col, "center"))); y += tamT * fuente.lh; }
        partes.forEach(function (pt) {
          if (linea && g.medir((linea + pt).trim(), tamT, fuente) > anchoC) { poner(linea); linea = pt; }
          else linea += pt;
        });
        poner(linea);
      }
      if (b.titulo) { centrado(String(b.titulo), tam, g.TINTA, false); y += tam * 0.4; }
      var q;
      try {
        if (Q.stringToBytesFuncs && Q.stringToBytesFuncs["UTF-8"]) Q.stringToBytes = Q.stringToBytesFuncs["UTF-8"];
        q = Q(0, "M"); q.addData(url, "Byte"); q.make();
      } catch (e) { errores.push(rb + ".qr: no se pudo armar el código (" + (e && e.message || e) + ")"); return null; }
      var n = q.getModuleCount(), m = lado / n, x0 = cx - lado / 2;
      y += m * 2; // zona libre arriba (el resto del margen lo da el papel blanco)
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          if (!q.isDark(r, c)) continue;
          var c1 = c;
          while (c1 + 1 < n && q.isDark(r, c1 + 1)) c1++;
          // un poco de trazo del mismo color tapa las juntas entre filas
          p.els.push(enlace(g.base("rectangle", {
            x: x0 + c * m, y: y + r * m, width: (c1 - c + 1) * m, height: m,
            strokeColor: "#000000", backgroundColor: "#000000", fillStyle: "solid", strokeWidth: 0.5, roughness: 0,
          })));
          c = c1;
        }
      }
      y += lado + m * 2;
      centrado(url.replace(/^https?:\/\//, ""), g.TAMANOS.S, color("gris"), true);
      p.entero = true;
      p.columna = { x0: x, x1: x + anchoC }; // con alLado, las columnas quedan parejas
      return p;
    }

    // alLado (en un bloque): la ultima pieza se pone a la derecha de la anterior,
    // alineada arriba (true) o centrada en vertical ("centro"), y las dos quedan
    // como una sola pieza entera (no se parten entre hojas). Sirve para un
    // recuadro al lado de otro, o los resultados al lado de un grafico.
    function bloqueAlLado(modo, r) {
      var B = piezas[piezas.length - 1], A = piezas[piezas.length - 2];
      if (!A || !A.els || !A.els.length || A.esEnunciado) {
        avisos.push(r + ".alLado: no hay un bloque anterior al que ponerse al lado; va debajo");
        return;
      }
      function limites(p) {
        var c = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
        p.els.forEach(function (e) {
          if (esMarcador(e)) return;
          var k = g.caja(e);
          c.x0 = Math.min(c.x0, k.x0); c.x1 = Math.max(c.x1, k.x1);
          c.y0 = Math.min(c.y0, k.y0); c.y1 = Math.max(c.y1, k.y1);
        });
        return c;
      }
      var ca = limites(A), cb = limites(B);
      // un QR ocupa su columna entera, aunque su direccion sea mas angosta o mas ancha
      if (A.columna) { ca.x0 = A.columna.x0; ca.x1 = A.columna.x1; }
      if (B.columna) { cb.x0 = B.columna.x0; cb.x1 = B.columna.x1; }
      // separacion entre los dos: la de siempre (dos letras) y, si no entra, la mitad
      function corrimientoQueEntra(c, angosta) {
        var d = ca.x1 + tam * (angosta ? 1 : 2) - c.x0;
        return c.x1 + d <= maxW + 1 ? d : null;
      }
      var dx = corrimientoQueEntra(cb);
      // un desarrollo que no entra con las notas a la derecha se prueba con las
      // notas arriba de cada renglon (mas angosto)
      if (dx === null && B.rehacer) {
        var B2 = B.rehacer(), cb2 = limites(B2), dx2 = corrimientoQueEntra(cb2);
        // con la separacion de siempre; si no, la mitad (primero el original)
        if (dx2 === null && (dx = corrimientoQueEntra(cb, true)) === null) dx2 = corrimientoQueEntra(cb2, true);
        if (dx === null && dx2 !== null) {
          ["unir", "continua", "espacio"].forEach(function (k) { if (B[k] !== undefined) B2[k] = B[k]; });
          piezas[piezas.length - 1] = B2; B = B2; cb = cb2; dx = dx2;
        }
      }
      if (dx === null && !B.rehacer) dx = corrimientoQueEntra(cb, true);
      if (dx === null) { avisos.push(r + ".alLado: no entra al lado del bloque anterior; va debajo"); return; }
      var dy = modo === "centro" ? (ca.y0 + ca.y1) / 2 - (cb.y0 + cb.y1) / 2 : ca.y0 - cb.y0;
      // cada parte conserva su grupo (el de un grafico, el de su dibujo)
      [A, B].forEach(function (p) {
        if (p.gruposListos) return;
        var gid = p.gid || g.nuevoId();
        p.els.forEach(function (e) { e.groupIds = [gid]; });
      });
      B.els.forEach(function (e) { e.x += dx; e.y += dy; });
      // el par sigue unido a lo de abajo si lo estaba B (el «unir» de A era con B)
      var junta = { els: A.els.concat(B.els), entero: true, gruposListos: true, unir: B.unir, barras: A.barras };
      ["inicioEj", "inicioIt", "continua"].forEach(function (k) { if (A[k] !== undefined) junta[k] = A[k]; });
      if (B.espacio !== undefined) junta.espacio = B.espacio;
      piezas.splice(piezas.length - 2, 2, junta);
    }

    // Consigna (enunciados y su numeracion). Opcional, en `estilo`:
    //   fuenteEnunciado: "normal" | "mano" | "codigo" (por defecto, la del texto)
    //   tamEnunciado: "S" | "M" | "L" | "XL" o un numero (por defecto, un tamaño de titulo)
    //   numeracion: { ejercicio: "{n})", item: "{i})" }: {n} es el numero del
    //     ejercicio e {i} el del item (por ejemplo "Ejercicio {n}:" y "{n}.{i}")
    var fuenteE = g.FUENTES[est.fuenteEnunciado] || fuente;
    var tamE = typeof est.tamEnunciado === "number" && est.tamEnunciado > 0 ? est.tamEnunciado
      : g.TAMANOS[est.tamEnunciado] || g.tamTitulo(tam);
    var num = est.numeracion || {};
    var plEj = typeof num.ejercicio === "string" ? num.ejercicio : "{n})";
    var plIt = typeof num.item === "string" ? num.item : "{i})";
    function rotulo(pl, n, i) {
      return pl.replace(/\{n\}/g, String(n)).replace(/\{i\}/g, i === undefined ? "" : String(i));
    }

    // sangriaEnunciado: "rotulo" (los renglones siguientes de la consigna
    // empiezan donde termina «Ejercicio 1:», lo de siempre) o un numero: la
    // sangria de esos renglones, medida desde donde empieza el rotulo
    var sangE = typeof est.sangriaEnunciado === "number" && est.sangriaEnunciado >= 0 ? est.sangriaEnunciado : null;
    function enunciado(etiqueta, texto, x, tamN, colN, inicioEj) {
      var p = nuevaPieza(true);
      p.esEnunciado = true; p.inicioEj = !!inicioEj;
      etiqueta = etiqueta ? etiqueta.trim() + " " : "";
      var wE = etiqueta ? g.medir(etiqueta, tamN, fuenteE) : 0;
      if (etiqueta) p.agregar(g.texto(x, 0, etiqueta.trim(), tamN, fuenteE, colN, "left"));
      var xResto = sangE === null ? x + wE : x + Math.min(sangE, wE);
      if (texto) escribirParrafo(texto, x + wE, 0, maxW - x - wE, tamN, fuenteE, COLOR_ENUNCIADO, p.agregar, xResto);
      p.espacio = lh * 0.4;
      if (!p.els.length) return null;
      piezas.push(p);
      p.alto1 = tamN * fuenteE.lh; // alto del primer renglón (para el marcador)
      return p;
    }

    // marca la primera pieza con renglones desde «desde» (empieza un ejercicio
    // o un ítem: si la hoja se corta justo antes, no hay nada que continúe)
    function marcarInicio(desde, campo) {
      for (var k = desde; k < piezas.length; k++) {
        if (piezas[k].els && piezas[k].els.length) { piezas[k][campo] = true; return; }
      }
    }
    // alLado: las piezas de un ítem se ponen a la derecha de las del ítem anterior,
    // alineadas arriba, como una sola pieza entera (si entran a lo ancho)
    function esMarcador(e) { return !!(e.customData && e.customData.pizarraMarcador); }
    // sec (una sección con alLado): { barra, fuera } — las piezas pueden estar
    // dentro de las secciones de afuera (fuera) y de la propia (barra), cuya
    // línea vertical se dibuja acá, porque la pieza junta ya no la lleva
    function apilar(grupo, sec) {
      var els = [], y = 0, gap = null, x0 = Infinity, x1 = -Infinity, ok = true, ultimo = null;
      var bY0 = Infinity, bY1 = -Infinity;
      function barrasPermitidas(p) {
        if (!p.barras || !p.barras.length) return true;
        if (!sec) return false;
        return p.barras.every(function (b) {
          return b === sec.barra || sec.fuera.indexOf(b) >= 0;
        });
      }
      grupo.forEach(function (p) {
        // un grafico entero (una tabla, un circuito) puede ir al lado; uno que se
        // parte entre hojas (partir, cortes de la regla de los signos), no
        if (p.salto || p.partir || p.cortes || !barrasPermitidas(p)) { ok = false; return; }
        if (p.hueco !== undefined) { gap = Math.max(gap || 0, p.hueco); return; }
        if (!p.els || !p.els.length) return;
        var cs = p.els.map(function (e) { return g.caja(e); });
        var y0 = Math.min.apply(null, cs.map(function (c) { return c.y0; }));
        var y1 = Math.max.apply(null, cs.map(function (c) { return c.y1; }));
        // cada parte en su grupo (la de un grafico, en el de su dibujo)
        var dy = (els.length ? y + (gap || 0) : 0) - y0, gid = p.gruposListos ? null : p.gid || g.nuevoId();
        p.els.forEach(function (e, k) {
          e.y += dy; els.push(e);
          if (gid) e.groupIds = [gid];
          if (!esMarcador(e)) { x0 = Math.min(x0, cs[k].x0); x1 = Math.max(x1, cs[k].x1); }
        });
        if (sec && p.barras && p.barras.indexOf(sec.barra) >= 0) { bY0 = Math.min(bY0, y0 + dy); bY1 = Math.max(bY1, y1 + dy); }
        y = y1 + dy; ultimo = p;
        gap = p.espacio !== undefined ? p.espacio : lh * 0.6;
      });
      if (ok && sec && bY1 > bY0) {
        // la línea de la sección, como la dibuja la maqueta (un poco arriba del primer renglón)
        var lb = g.trazo([[sec.barra.x, bY0 - lh * 0.15], [sec.barra.x, bY1]], { strokeColor: sec.barra.color, strokeWidth: 1.5 });
        lb.groupIds = [g.nuevoId()];
        els.push(lb);
        x0 = Math.min(x0, sec.barra.x);
      }
      return ok && els.length ? { els: els, x0: x0, x1: x1, alto: y, ultimo: ultimo } : null;
    }
    // alLado en una sección: la sección (título y contenido) va a la derecha de
    // la sección anterior de la misma lista, alineada arriba, y las dos quedan
    // como una sola pieza entera. Solo secciones sin otras secciones adentro.
    // silencioso: no avisa; devuelve true, "tipo" (no se aplica) o "ancho" (no entra)
    function seccionAlLado(ant, desdeB, barraB, fuera, r, silencioso) {
      var A = apilar(piezas.slice(ant.desde, desdeB), { barra: ant.barra, fuera: fuera });
      var B = apilar(piezas.slice(desdeB), { barra: barraB, fuera: fuera });
      if (!A || !B) {
        if (!silencioso) avisos.push(r + ".alLado: solo se aplica a secciones sin secciones, gráficos que se parten ni saltos adentro; va debajo");
        return "tipo";
      }
      if (Math.max(A.alto, B.alto) > altoPar) {
        if (!silencioso) avisos.push(r + ".alLado: las dos secciones juntas son muy altas para una hoja; va debajo");
        return "alto";
      }
      var dx = A.x1 + tam * 2 - B.x0;
      if (B.x1 + dx > maxW + 1) {
        if (!silencioso) avisos.push(r + ".alLado: no entra al lado de la sección anterior; va debajo");
        return "ancho";
      }
      B.els.forEach(function (e) { if (!esMarcador(e)) e.x += dx; });
      var junta = { els: A.els.concat(B.els), entero: true, gruposListos: true, barras: fuera, unir: B.ultimo && B.ultimo.unir };
      if (B.ultimo && B.ultimo.espacio !== undefined) junta.espacio = B.ultimo.espacio;
      ["inicioEj", "inicioIt", "continua"].forEach(function (k) { if (piezas[ant.desde][k] !== undefined) junta[k] = piezas[ant.desde][k]; });
      piezas.splice(ant.desde, piezas.length - ant.desde, junta);
      return true;
    }
    function ponerAlLado(desdeA, hasta, desdeB, r) {
      var A = apilar(piezas.slice(desdeA, hasta)), B = apilar(piezas.slice(desdeB));
      if (!A || !B) { avisos.push(r + ": «alLado» no se aplica a ítems con secciones, gráficos o saltos"); return false; }
      var dx = A.x1 + tam * 2 - B.x0;
      if (B.x1 + dx > maxW + 1) { avisos.push(r + ": no entra al lado del ítem anterior; va debajo"); return false; }
      B.els.forEach(function (e) { if (!esMarcador(e)) e.x += dx; });
      var primera = piezas.slice(desdeA, hasta).filter(function (p) { return p.els && p.els.length; })[0];
      var junta = { els: A.els.concat(B.els), entero: true, gruposListos: true, inicioIt: true, inicioEj: !!primera.inicioEj };
      if (B.ultimo && B.ultimo.espacio !== undefined) junta.espacio = B.ultimo.espacio;
      piezas.splice(desdeA, piezas.length - desdeA, junta);
      return true;
    }
    // bloques sueltos antes de los ejercicios (el texto de una parte de un cuadernillo)
    if (Array.isArray(sol.bloques)) bloques(sol.bloques, 0, "bloques");
    (sol.ejercicios || []).forEach(function (ej, i) {
      var r = "ejercicios[" + i + "]", nEj = ej.numero !== undefined ? ej.numero : i + 1;
      if (i || sol.bloques) piezas.push({ hueco: lh * 1.2 });
      var rEj = nEj === "" ? "" : rotulo(plEj, nEj), desdeEj = piezas.length;
      var pEj = enunciado(rEj, ej.enunciado, 0, tamE, COLOR_EJERCICIO, true);
      marcar(pEj, conPlantillaDe(ej.marcador, plantillas.ejercicio, rEj, ej.enunciado),
        (rEj + " " + (ej.enunciado || "")).trim(), 1, pEj && pEj.alto1);
      bloques(ej.bloques, sangria * 0.5, r);
      marcarInicio(desdeEj, "inicioEj");
      var desdeAnt = -1;
      (ej.items || []).forEach(function (it, j) {
        var antesHueco = piezas.length;
        piezas.push({ hueco: lh * 0.6 });
        var nIt = it.numero !== undefined ? it.numero : String.fromCharCode(97 + j);
        var rIt = nIt === "" ? "" : rotulo(plIt, nEj, nIt), desdeIt = piezas.length;
        var pIt = enunciado(rIt, it.enunciado, sangria * 0.5, tam, COLOR_EJERCICIO);
        marcar(pIt, conPlantillaDe(it.marcador, plantillas.item, rIt, it.enunciado),
          (rIt + " " + (it.enunciado || "")).trim(), 2, pIt && pIt.alto1);
        bloques(it.bloques, sangria, r + ".items[" + j + "]");
        marcarInicio(desdeIt, "inicioIt");
        if (it.alLado && desdeAnt >= 0 && ponerAlLado(desdeAnt, antesHueco, desdeIt, r + ".items[" + j + "]")) desdeIt = desdeAnt;
        desdeAnt = desdeIt;
      });
    });
    return { piezas: piezas, errores: errores, avisos: avisos, tam: tam, lh: lh, fuente: fuente,
      continuacion: est.continuacion === true };
  }

  // ----------------------------------------------- renglones de una pieza
  // corta en grupos lo que se superpone en vertical (un renglon con su nota,
  // una fraccion, una llave con sus ramas...)
  function renglones(els) {
    var g = G();
    var cs = els.map(function (e) { return { e: e, c: g.caja(e) }; }).sort(function (a, b) { return a.c.y0 - b.c.y0; });
    var out = [], act = null;
    cs.forEach(function (q) {
      if (act && q.c.y0 < act.y1 - 0.5) { act.els.push(q.e); act.y1 = Math.max(act.y1, q.c.y1); act.x1 = Math.max(act.x1, q.c.x1); }
      else { act = { els: [q.e], y0: q.c.y0, y1: q.c.y1, x1: q.c.x1 }; out.push(act); }
    });
    return out;
  }

  // Renglones de un dibujo con cortes (la regla de los signos): lo que no tiene
  // corte (los pasos previos) se parte en renglones como siempre; la cabecera
  // con el primer caso es un solo bloque, y cada caso que sigue, otro, que
  // lleva lo necesario para repetir la cabecera si empieza una hoja.
  function renglonesConCortes(p) {
    var g = G(), libres = [], cab = [], casos = {}, tallos = {}, info = null;
    p.els.forEach(function (e, i) {
      var ct = p.cortes[i];
      if (!ct) libres.push(e);
      else if (ct.cab) { cab.push(e); info = ct; }
      else {
        (casos[ct.caso] = casos[ct.caso] || []).push(e);
        if (ct.tallo) tallos[ct.caso] = { el: e, corto: ct.corto };
      }
    });
    var out = renglones(libres);
    function bloque(els) {
      var b = { els: els, y0: Infinity, y1: -Infinity, x1: -Infinity };
      els.forEach(function (e) { var c = g.caja(e); b.y0 = Math.min(b.y0, c.y0); b.y1 = Math.max(b.y1, c.y1); b.x1 = Math.max(b.x1, c.x1); });
      return b;
    }
    var ks = Object.keys(casos).map(Number).sort(function (a, b) { return a - b; });
    var y0cab = cab.length ? bloque(cab).y0 : 0;
    ks.forEach(function (k, j) {
      if (j === 0) { out.push(bloque(cab.concat(casos[k]))); return; }
      var b = bloque(casos[k]);
      if (info && cab.length) {
        // el tramo del tallo de este caso marca el estilo de la linea
        var t = casos[k].filter(function (e) { return e.type === "line" || e.type === "arrow"; })[0];
        // copia de la cabecera tal como sale del generador: los originales se
        // corren despues a su hoja y no sirven para ubicar la repeticion
        b.repetir = { els: cab.map(function (e) { return g.copiar(e); }), y0: y0cab, yLlave: info.yLlave, sep: info.sep, xTallo: info.xTallo,
          estilo: { strokeColor: t ? t.strokeColor : g.TINTA, strokeWidth: t ? t.strokeWidth : 2 },
          // el tramo del caso anterior, que se acorta hasta su flecha si la hoja se corta aca
          recortar: tallos[ks[j - 1]] };
      }
      out.push(b);
    });
    return out.sort(function (a, b) { return a.y0 - b.y0; });
  }

  // ------------------------------------------------------------- importar
  // clave de una solucion: con `reemplazar`, lo que se importo antes con la
  // misma clave se borra (sirve para corregir y volver a importar)
  function claveDe(sol) {
    var m = sol.meta || {};
    return [m.materia, m.institucion, m.anio, m.tp].filter(Boolean).join(" · ") || String(sol.titulo || "solucion");
  }

  // Cuadernillo («unzip.mat/cuadernillo@1»): varias partes en un solo juego de
  // hojas, cada una empezando en una hoja nueva. Tipos de parte:
  //   caratula  { titulo, subtitulo, lineas: [...], pie }: centrada, sin cabecera ni pie
  //   texto     { titulo, subtitulo, bloques }: los bloques de siempre
  //   indice    { titulo, niveles, compacto }: los marcadores de las partes que siguen,
  //             con su numero de pagina; en el PDF, cada renglon es un enlace.
  //             compacto: true junta mas los renglones (para ahorrar una hoja)
  //   solucion  { solucion: {...solucion@1}, marcadores: { ejercicio, item } }
  // Toda parte puede traer `cabecera` (si no, la del cuadernillo; una solucion
  // usa la suya): vale desde la primera hoja de la parte (hojas.js, «desde»).
  // `marcador`: el titulo del marcador de la parte (true: su titulo; false: sin
  // marcador). `enIndice: false` la saca del indice. `sinCabecera: true`: sus
  // hojas sin cabecera ni pie. `impar: false`: no salta a una hoja impar.
  var FORMATO_CUADERNILLO = "unzip.mat/cuadernillo@1";
  var TIPOS_PARTE = { caratula: 1, texto: 1, indice: 1, solucion: 1 };

  function tipoDeParte(p) {
    if (p.tipo) return p.tipo;
    return p.solucion ? "solucion" : "texto";
  }

  // los marcadores de una lista de piezas, en orden
  function marcadoresDePiezas(piezas) {
    var out = [];
    piezas.forEach(function (p) {
      (p.els || []).forEach(function (e) {
        var d = e.customData && e.customData.pizarraMarcador;
        if (d) out.push({ id: e.id, titulo: e.text, nivel: d.nivel });
      });
    });
    return out;
  }

  // Piezas del indice: un renglon por entrada (titulo, linea de puntos y numero
  // de pagina). Los tres elementos son enlaces a su marcador (hojas.js); el
  // numero se completa despues de repartir las hojas.
  function armarIndice(entradas, maxW, est, r, compacto) {
    var g = G(), fuente = r.fuente, tam = r.tam, lh = r.lh, tamS = g.TAMANOS.S;
    entradas.forEach(function (en, i) {
      var n1 = en.nivel <= 1, tamR = n1 ? tam : tamS, colR = n1 ? COLOR_EJERCICIO : g.TINTA;
      if (n1 && i) r.piezas.push({ hueco: lh * (compacto ? 0.2 : 0.5) });
      var p = nuevaPieza(n1); // un titulo de parte no queda solo al pie
      var fila = g.nuevoId(), xR = Math.max(0, en.nivel - 1) * tam * 1.5;
      var wNum = g.medir("000", tamR, fuente), hueco = tam * 0.6;
      var maxTit = maxW - xR - wNum - hueco * 2;
      var tit = en.titulo;
      if (g.medir(tit, tamR, fuente) > maxTit) {
        while (tit.length > 1 && g.medir(tit + "…", tamR, fuente) > maxTit) tit = tit.slice(0, -1);
        tit = tit.trim() + "…";
      }
      var t = g.texto(xR, 0, tit, tamR, fuente, colR, "left");
      t.customData = { pizarraEnlace: { a: en.id, fila: fila } };
      p.els.push(t);
      var xa = xR + t.width + hueco, xb = maxW - wNum - hueco, yb = tamR * fuente.lh * 0.78;
      if (xb > xa + tam) {
        var l = g.trazo([[xa, yb], [xb, yb]], { strokeColor: "#adb5bd", strokeWidth: 1.5, strokeStyle: "dotted" });
        l.customData = { pizarraEnlace: { a: en.id, fila: fila } };
        p.els.push(l);
      }
      var num = g.texto(maxW, 0, "0", tamR, fuente, colR, "right");
      num.customData = { pizarraEnlace: { a: en.id, fila: fila, pagina: true } };
      p.els.push(num);
      p.espacio = n1 ? lh * (compacto ? 0.05 : 0.25) : compacto ? 0 : lh * 0.1;
      r.piezas.push(p);
    });
  }

  // parte de texto o indice → una solucion sin ejercicios (para armar)
  function solucionDeParte(parte, est) {
    return { titulo: parte.titulo, subtitulo: parte.subtitulo, estilo: est, bloques: parte.bloques || [], ejercicios: [] };
  }

  // estilo de una parte: el del cuadernillo con el de la solucion encima
  function mezclarEstilo(a, b) {
    var r = {};
    for (var k in a || {}) r[k] = a[k];
    for (k in b || {}) r[k] = b[k];
    return r;
  }

  function importar(entrada, opciones) {
    var A = api(), g = G(), h = H();
    opciones = opciones || {};
    if (!A || !g || !h || !h.marco) return { ok: false, errores: ["La pizarra todavía no terminó de cargar"] };
    var sol = entrada;
    if (typeof entrada === "string") {
      try { sol = JSON.parse(entrada); } catch (e) { return { ok: false, errores: ["El archivo no es un JSON válido: " + e.message] }; }
    }
    if (!sol || typeof sol !== "object") return { ok: false, errores: ["El archivo está vacío"] };
    var avisosFormato = [], esCuad = Array.isArray(sol.partes);
    if (sol.formato && sol.formato !== FORMATO && sol.formato !== FORMATO_CUADERNILLO) {
      avisosFormato.push("Formato «" + sol.formato + "»: esta pizarra lee «" + FORMATO + "» y «" + FORMATO_CUADERNILLO + "»");
    }
    if (!esCuad && !Array.isArray(sol.ejercicios)) return { ok: false, errores: ["Falta la lista «ejercicios» (o «partes», en un cuadernillo)"] };
    // una solucion sola es un cuadernillo de una parte, sin marcadores agregados
    var partes = esCuad ? sol.partes : [{ tipo: "solucion", solucion: sol, sola: true }];
    var erroresPartes = [];
    partes.forEach(function (p, i) {
      var rp = "partes[" + i + "]";
      if (!p || typeof p !== "object") { erroresPartes.push(rp + ": parte inválida"); return; }
      var t = tipoDeParte(p);
      if (!TIPOS_PARTE[t]) erroresPartes.push(rp + ": tipo «" + t + "» desconocido (caratula, texto, indice o solucion)");
      if (t === "solucion" && (!p.solucion || typeof p.solucion !== "object")) {
        erroresPartes.push(rp + ": falta «solucion»" + (p.ruta ? " (la ruta «" + p.ruta + "» se completa con herramientas/armar-cuadernillo.mjs del repositorio de solucionarios)" : ""));
      } else if (t === "solucion" && !Array.isArray(p.solucion.ejercicios)) erroresPartes.push(rp + ".solucion: falta la lista «ejercicios»");
    });
    if (erroresPartes.length) return { ok: false, errores: erroresPartes, avisos: avisosFormato };

    var clave = claveDe(sol), reemplazados = 0;
    var todos = A.getSceneElementsIncludingDeleted();
    if (opciones.reemplazar) {
      var ahora = Date.now();
      todos = todos.map(function (e) {
        if (e.isDeleted || !e.customData || e.customData.pizarraSolucion !== clave) return e;
        reemplazados++;
        var d = {};
        for (var k in e) d[k] = e[k];
        d.isDeleted = true; d.version = e.version + 1; d.versionNonce = Math.floor(Math.random() * 2147483647); d.updated = ahora;
        return d;
      });
    }
    var vivos = todos.filter(function (e) { return !e.isDeleted; });
    // estilo.margenes (mm: sup, inf, ext, lomo) y estilo.dobleFaz: pasan al panel
    // de Hojas A4 antes de crear las hojas (y valen para las que se creen despues)
    var estH = sol.estilo || {};
    if (h.configurar && (estH.margenes || typeof estH.dobleFaz === "boolean")) {
      h.configurar({ margenes: estH.margenes, dobleFaz: estH.dobleFaz });
    }
    var hojas = h.hojasDe(todos), bandas = h.bandasDe(todos);
    // primera hoja nueva: a la derecha de todo lo que ya hay
    var sep = h.separacion(), x0 = 0, y0 = 0, n0 = hojas.length ? hojas[hojas.length - 1].customData.pizarraHoja.n : 0;
    if (vivos.length) {
      var bt = g.cajaDe(vivos);
      x0 = bt.x1 + sep * 2; y0 = hojas.length ? hojas[0].y : bt.y0;
    }
    // cabecera y pie («cabecera» y «pie» de la solucion o del cuadernillo): se
    // crean los que falten en la escena, arriba de la primera hoja nueva. Las
    // bandas generales son de toda la pizarra: si ya hay, quedan las que estan.
    // En un cuadernillo van un renglon mas arriba: abajo van las de cada parte.
    var faltan = {};
    if (typeof sol.cabecera === "string" && !(bandas && bandas.cab)) faltan.cab = sol.cabecera;
    if (typeof sol.pie === "string" && !(bandas && bandas.pie)) faltan.pie = sol.pie;
    if ((faltan.cab !== undefined || faltan.pie !== undefined) && h.nuevasBandas) {
      var nb = h.nuevasBandas(faltan, x0, esCuad ? y0 - sep * 4 : y0);
      nb.forEach(function (e) {
        var cd = {};
        for (var k in e.customData || {}) cd[k] = e.customData[k];
        cd.pizarraSolucion = clave;
        e.customData = cd;
      });
      todos = todos.concat(nb);
      bandas = h.bandasDe(todos);
    }
    // el texto de la cabecera general (para saber si una parte necesita la suya)
    var cabGeneral = typeof sol.cabecera === "string" ? sol.cabecera : null;

    var nuevas = [], bandasNuevas = [];
    var parteSinBandas = false; // la parte que se esta repartiendo no lleva cabecera ni pie
    function hojaNueva(opc) {
      opc = opc || {};
      var u = nuevas[nuevas.length - 1];
      var f = h.marco(u ? u.x + u.width + sep : x0, y0, n0 + nuevas.length + 1);
      if (opc.sinBandas || parteSinBandas) f.customData.pizarraHoja.sinBandas = true;
      nuevas.push(f);
      if (opc.alEmpezar) opc.alEmpezar(f);
      var area = h.areaUtil(f, bandas);
      return { f: f, area: area, y: area.y0 };
    }
    // ancho util: no depende de la cabecera ni del lado del lomo
    var prueba = h.areaUtil(h.marco(0, 0, n0 + 1), null);
    var maxW = prueba.x1 - prueba.x0;
    altoPar = (prueba.y1 - prueba.y0) * 0.85;

    var hoja = null, vacia = true;
    var listos = [], pendiente = null, gap = 0, avisos = avisosFormato.slice(), r = null, tramos = {};
    function altoUtil() { return hoja.area.y1 - hoja.area.y0; }
    // estilo.continuacion: si un ejercicio o un ítem sigue en la hoja siguiente, se avisa
    // en gris al pie de la hoja (y se reserva ese lugar en todas las hojas)
    var tamAviso = g.TAMANOS.S;
    function altoAviso() { return r.continuacion ? Math.ceil(tamAviso * r.fuente.lh + 8) : 0; }
    function textoAviso(seq) {
      var it = seq[0];
      // empieza un ejercicio o un ítem: no hay nada que continúe
      if ((it.p.inicioEj || it.p.inicioIt) && it.i === 0) return null;
      if (it.p.esEnunciado && it.i > 0) return "Continúa la consigna en la siguiente hoja";
      // «continua»: el aviso propio del bloque; "" si no hace falta (por ejemplo,
      // si el bloque anterior ya avisa «(La tabla continúa)»)
      for (var k = 0; k < seq.length; k++) if (typeof seq[k].p.continua === "string") return seq[k].p.continua || null;
      return "Continúa en la siguiente hoja";
    }
    // líneas verticales de las secciones: un tramo por hoja y por sección, que
    // se alarga hasta el último renglón puesto (cubre también los espacios)
    function barrasDe(p, yTop, yBot) {
      (p.barras || []).forEach(function (b) {
        var t = tramos[b.id], x = hoja.area.x0 + b.x;
        if (t && t.hoja === hoja.f.id) {
          var i = listos.indexOf(t.el);
          if (i >= 0) listos.splice(i, 1);
        } else {
          // un poco arriba del primer renglon, pero nunca fuera del area util
          t = tramos[b.id] = { hoja: hoja.f.id, y0: Math.max(hoja.area.y0, yTop - r.lh * 0.15) };
        }
        t.el = g.trazo([[x, t.y0], [x, Math.min(hoja.area.y1, yBot)]], { strokeColor: b.color, strokeWidth: 1.5 });
        t.el.frameId = hoja.f.id; t.el.groupIds = [g.nuevoId()];
        listos.push(t.el);
      });
    }
    function poner(seq) {
      var alto = seq.reduce(function (s, it, i) { return s + (i ? it.antes : 0) + (it.q.y1 - it.q.y0); }, 0);
      var arranque = vacia ? 0 : seq[0].antes;
      if (!vacia && hoja.y + arranque + alto > hoja.area.y1 - altoAviso()) {
        var aviso = r.continuacion && textoAviso(seq);
        if (aviso) {
          var ea = g.texto(hoja.area.x0, hoja.y + 6, "(" + aviso + ")", tamAviso, r.fuente, color("gris"), "left");
          ea.frameId = hoja.f.id; ea.groupIds = [g.nuevoId()];
          listos.push(ea);
        }
        hoja = hojaNueva(); vacia = true; arranque = 0;
        // un caso de la regla de los signos que empieza la hoja: arriba se repite
        // la cabecera (la inecuacion con su llave y la regla) y el tallo baja hasta el caso
        var rep = seq[0].repetir;
        if (rep && rep.recortar) {
          var tr = rep.recortar.el, largo = rep.recortar.corto;
          tr.points = [[0, 0], [0, largo]]; tr.height = largo;
        }
        if (rep) {
          var dyc = hoja.y - rep.y0, gidc = seq[0].q.els[0].groupIds[0];
          rep.els.forEach(function (e0) {
            var e = g.copiar(e0);
            e.id = g.nuevoId(); e.seed = Math.floor(Math.random() * 2e9); e.versionNonce = Math.floor(Math.random() * 2e9);
            e.x += hoja.area.x0; e.y += dyc; e.frameId = hoja.f.id; e.groupIds = [gidc];
            if (e.customData) delete e.customData.pizarra;
            listos.push(e);
          });
          var yLl = rep.yLlave + dyc, yCaso = yLl + rep.sep;
          var tallo = g.trazo([[hoja.area.x0 + rep.xTallo, yLl], [hoja.area.x0 + rep.xTallo, yCaso]], rep.estilo);
          tallo.frameId = hoja.f.id; tallo.groupIds = [gidc];
          listos.push(tallo);
          hoja.y = yCaso;
        }
      }
      if (alto > altoUtil() + 1) avisos.push("Un renglón es más alto que el área útil de la hoja " + hoja.f.customData.pizarraHoja.n + ": se sale por abajo");
      var y = hoja.y + arranque;
      seq.forEach(function (it, i) {
        var q = it.q;
        if (i) y += it.antes;
        if (q.x1 > maxW + 1) {
          avisos.push("Un renglón de la hoja " + hoja.f.customData.pizarraHoja.n + " es más ancho que el área útil (" +
            Math.round(q.x1) + " > " + Math.round(maxW) + "): achicá el texto o partilo");
        }
        var dy = y - q.y0;
        q.els.forEach(function (e) { e.x += hoja.area.x0; e.y += dy; e.frameId = hoja.f.id; listos.push(e); });
        barrasDe(it.p, q.y0 + dy, q.y1 + dy);
        y = q.y1 + dy;
      });
      hoja.y = y;
      vacia = false;
    }

    // reparte en hojas las piezas de una parte (la salida de armar).
    // Renglon por renglon; una pieza «unir» (enunciado) pasa entera a la hoja
    // siguiente junto con el primer renglon de lo que le sigue.
    // seq: [{ q: renglon, antes: espacio que lo separa del anterior }]
    function maquetar(rr) {
      r = rr; tramos = {}; gap = 0; pendiente = null;
      r.piezas.forEach(function (p) {
        if (p.salto) { if (pendiente) { poner(pendiente); pendiente = null; } if (!vacia) { hoja = hojaNueva(); vacia = true; } return; }
        if (p.hueco !== undefined) { gap = Math.max(gap, p.hueco); return; }
        if (!p.els.length) return;
        // cada pieza en su grupo (las de un generador, en el grupo de su dibujo)
        var gid = p.gid || g.nuevoId();
        if (!p.gruposListos) p.els.forEach(function (e) { e.groupIds = [gid]; });
        var rs = p.cortes ? renglonesConCortes(p) : renglones(p.els);
        // en un dibujo que se parte, un titulo no queda solo al pie: va con el renglon siguiente
        if (p.partir && p.unidos) {
          var juntos = [];
          rs.forEach(function (q) {
            var ant = juntos[juntos.length - 1];
            if (ant && ant.unir) {
              juntos[juntos.length - 1] = { els: ant.els.concat(q.els), y0: Math.min(ant.y0, q.y0), y1: Math.max(ant.y1, q.y1),
                x1: Math.max(ant.x1, q.x1), unir: false };
              ant = juntos[juntos.length - 1];
            } else { juntos.push({ els: q.els, y0: q.y0, y1: q.y1, x1: q.x1 }); ant = juntos[juntos.length - 1]; }
            if (q.els.some(function (e) { return p.unidos.indexOf(e) >= 0; })) ant.unir = true;
          });
          rs = juntos;
        }
        // el dibujo de un generador no se parte si entra en una hoja: un grafico
        // partido queda con su titulo en una hoja y el dibujo en otra, y ya no se
        // puede regenerar desde su panel. La regla de los signos si se parte,
        // entre caso y caso (con la cabecera repetida en la hoja nueva)
        if (!p.cortes && !p.partir && (p.gid || p.entero) && rs.length > 1 && rs[rs.length - 1].y1 - rs[0].y0 <= altoUtil()) {
          rs = [rs.reduce(function (a, q) {
            return { els: a.els.concat(q.els), y0: Math.min(a.y0, q.y0), y1: Math.max(a.y1, q.y1), x1: Math.max(a.x1, q.x1) };
          })];
        }
        rs.forEach(function (q, i) {
          var seq = [{ q: q, antes: i ? q.y0 - rs[i - 1].y1 : gap, p: p, i: i, repetir: q.repetir }];
          if (pendiente) { seq = pendiente.concat(seq); pendiente = null; }
          // un enunciado no se corta entre hojas: todos sus renglones esperan al
          // primero de lo que sigue
          if (p.unir) { pendiente = seq; return; }
          poner(seq);
        });
        gap = p.espacio !== undefined ? p.espacio : r.lh * 0.6;
      });
      if (pendiente) { poner(pendiente); pendiente = null; }
    }

    // Cada parte empieza en una hoja nueva. Con doble faz y
    // estilo.partesEnImpar, en una hoja impar (si hace falta, deja una en
    // blanco, sin cabecera ni pie). `cab`: el texto de la cabecera de la parte;
    // si no es el que esta vigente, se crea una cabecera desde esta hoja.
    // (si la pizarra ya tenia una cabecera general, cada parte lleva la suya)
    var cabVigente = faltan.cab !== undefined || !(bandas && bandas.cab) ? cabGeneral : null, enImpar = esCuad && estH.partesEnImpar === true && estH.dobleFaz === true;
    function empezarParte(opc, nombre) {
      parteSinBandas = false;
      // impar: false (por ejemplo, el reverso de la caratula) sigue en la hoja que toque
      if (enImpar && opc.impar !== false && hoja && (n0 + nuevas.length + 1) % 2 === 0) hojaNueva({ sinBandas: true });
      var cab = opc.cab;
      hoja = hojaNueva({
        sinBandas: opc.sinBandas,
        alEmpezar: function (f) {
          if (opc.sinBandas || typeof cab !== "string" || cab === cabVigente || !h.nuevasBandas) return;
          var nbp = h.nuevasBandas({ cab: cab }, f.x, f.y, { desde: f.id, nombre: nombre });
          bandasNuevas = bandasNuevas.concat(nbp);
          bandas = h.bandasDe(todos.concat(nuevas, bandasNuevas));
          cabVigente = cab;
        },
      });
      parteSinBandas = !!opc.sinBandas;
      vacia = true;
    }

    // la caratula: centrada en la hoja, sin cabecera ni pie
    function maquetarCaratula(parte, est) {
      empezarParte({ sinBandas: true });
      var fuente = g.FUENTES[est.fuente] || g.FUENTES.normal, area = hoja.area;
      var w = area.x1 - area.x0, cx = area.x0 + w / 2, els = [], y = 0, gid = g.nuevoId();
      function centrado(str, tam, col) {
        String(str).split("\n").forEach(function (par) {
          var linea = "";
          par.split(/ +/).forEach(function (pal) {
            var prueba = linea ? linea + " " + pal : pal;
            if (linea && g.medir(prueba, tam, fuente) > w) { els.push(g.texto(cx, y, linea, tam, fuente, col, "center")); y += tam * fuente.lh; linea = pal; }
            else linea = prueba;
          });
          if (linea) els.push(g.texto(cx, y, linea, tam, fuente, col, "center"));
          y += tam * fuente.lh;
        });
      }
      var tamT = typeof parte.tamTitulo === "number" ? parte.tamTitulo : 48;
      if (parte.antetitulo) { centrado(parte.antetitulo, g.TAMANOS.L, COLOR_ENUNCIADO); y += 24; }
      var yT = y;
      if (parte.titulo) centrado(parte.titulo, tamT, g.TINTA);
      y += 18;
      els.push(g.trazo([[cx - w * 0.2, y], [cx + w * 0.2, y]], { strokeColor: COLOR_EJERCICIO, strokeWidth: 3 }));
      y += 30;
      if (parte.subtitulo) { centrado(parte.subtitulo, g.TAMANOS.XL, COLOR_EJERCICIO); y += 20; }
      (parte.lineas || []).forEach(function (l) { centrado(l, g.TAMANOS.L, COLOR_ENUNCIADO); y += 6; });
      // un poco arriba del centro de la hoja
      var dy = area.y0 + Math.max(0, (area.y1 - area.y0 - y) * 0.38);
      if (parte.marcador !== false) {
        var tm = typeof parte.marcador === "string" ? parte.marcador : "Carátula";
        var mk = textoMarcador(String(tm).replace(/\s+/g, " ").trim(), 1, yT, tamT * fuente.lh, fuente);
        mk.x += area.x0; // va en el margen de la hoja
        els.push(mk);
      }
      els.forEach(function (e) {
        G().expandirRaices(e).forEach(function (q) {
          q.y += dy; q.frameId = hoja.f.id; q.groupIds = [gid];
          listos.push(q);
        });
      });
      // abajo de todo, el pie de la caratula (por ejemplo, la institucion)
      if (parte.pie) {
        var tamP = g.TAMANOS.M, renglonesPie = String(parte.pie).split("\n");
        var yP = area.y1 - renglonesPie.length * tamP * fuente.lh;
        renglonesPie.forEach(function (l, i) {
          var t = g.texto(cx, yP + i * tamP * fuente.lh, l, tamP, fuente, COLOR_ENUNCIADO, "center");
          t.frameId = hoja.f.id; t.groupIds = [gid];
          listos.push(t);
        });
      }
      vacia = false;
    }

    // ---- armar todas las partes (las piezas), despues el indice, y repartir
    var armadas = [], erroresArmar = [];
    partes.forEach(function (parte, i) {
      var t = tipoDeParte(parte), rp = esCuad ? "partes[" + i + "]" : "";
      var marcadorParte = parte.marcador === false ? null : typeof parte.marcador === "string" ? parte.marcador
        : typeof parte.marcador === "object" && parte.marcador ? parte.marcador.titulo : null;
      if (t === "caratula") { armadas.push({ parte: parte, tipo: t }); return; }
      if (t === "solucion") {
        var s = parte.solucion, est = parte.sola ? s.estilo : mezclarEstilo(sol.estilo, s.estilo);
        var s2 = {};
        for (var k in s) s2[k] = s[k];
        s2.estilo = est;
        if (parte.titulo !== undefined) s2.titulo = parte.titulo;
        var opc = parte.sola ? {} : {
          nivelBase: 1,
          marcadorTitulo: parte.marcador === false ? null : { titulo: marcadorParte || String(s2.titulo || "").replace(/\s+/g, " ").trim(), nivel: 1 },
          marcadores: parte.marcadores || { ejercicio: "{rotulo}" },
        };
        var ra = armar(s2, maxW, opc);
        ra.errores.forEach(function (e) { erroresArmar.push((rp ? rp + ".solucion." : "") + e); });
        ra.avisos = ra.avisos.map(function (a) { return (rp ? rp + ".solucion." : "") + a; });
        var cabS = parte.cabecera !== undefined ? parte.cabecera : typeof s.cabecera === "string" ? s.cabecera : cabGeneral;
        armadas.push({ parte: parte, tipo: t, r: ra, cab: parte.sola ? undefined : cabS, nombre: marcadorParte || s.meta && s.meta.tp });
        return;
      }
      // texto o indice
      var estT = sol.estilo || {};
      var rt = armar(solucionDeParte(parte, estT), maxW, {
        marcadorTitulo: parte.marcador === false || !parte.titulo ? null : { titulo: marcadorParte || parte.titulo, nivel: 1 },
      });
      rt.errores.forEach(function (e) { erroresArmar.push(rp + "." + e); });
      rt.avisos = rt.avisos.map(function (a) { return rp + "." + a; });
      armadas.push({ parte: parte, tipo: t, r: rt, cab: parte.cabecera !== undefined ? parte.cabecera : cabGeneral, nombre: marcadorParte || parte.titulo });
    });
    if (erroresArmar.length) return { ok: false, errores: erroresArmar, avisos: avisos };

    // el indice: los marcadores de las partes que van en el (no la caratula ni el
    // indice mismo), hasta el nivel pedido (por defecto 2: partes y ejercicios)
    armadas.forEach(function (a, i) {
      if (a.tipo !== "indice") return;
      var niveles = a.parte.niveles | 0 || 2, entradas = [];
      armadas.forEach(function (b, j) {
        if (j === i || !b.r || b.tipo === "indice" || b.parte.enIndice === false) return;
        marcadoresDePiezas(b.r.piezas).forEach(function (m) { if (m.nivel <= niveles) entradas.push(m); });
      });
      armarIndice(entradas, maxW, sol.estilo || {}, a.r, a.parte.compacto === true);
      if (!entradas.length) avisos.push("partes[" + i + "]: el índice no tiene entradas (las partes no tienen marcadores)");
    });

    armadas.forEach(function (a) {
      if (a.tipo === "caratula") { maquetarCaratula(a.parte, sol.estilo || {}); return; }
      avisos = avisos.concat(a.r.avisos);
      if (a.parte.sola) { if (!hoja) hoja = hojaNueva(); }
      else empezarParte({ cab: a.cab, sinBandas: a.parte.sinCabecera === true, impar: a.parte.impar }, a.nombre);
      maquetar(a.r);
    });
    if (!hoja) hoja = hojaNueva();

    // el grupo de una pieza que quedo repartida en varias hojas se separa por hoja
    var porGrupo = {};
    listos.forEach(function (e) {
      (porGrupo[e.groupIds[0]] = porGrupo[e.groupIds[0]] || {})[e.frameId] = true;
    });
    var renombre = {};
    listos.forEach(function (e) {
      var gid = e.groupIds[0];
      if (Object.keys(porGrupo[gid]).length < 2) return;
      var k = gid + "|" + e.frameId;
      renombre[k] = renombre[k] || g.nuevoId();
      e.groupIds = [renombre[k]];
      if (e.customData && e.customData.pizarra) delete e.customData; // un grafico partido ya no se regenera
    });
    // numeros de pagina del indice (hojas.js los vuelve a calcular al imprimir)
    if (h.numerosDelIndice) {
      var conNumero = {};
      h.numerosDelIndice(todos.filter(function (e) { return !e.isDeleted; }).concat(nuevas, listos)).forEach(function (e) { conNumero[e.id] = e; });
      listos = listos.map(function (e) { return conNumero[e.id] || e; });
    }
    // todo lo importado lleva la clave de la solucion (para reemplazarlo despues)
    nuevas.concat(bandasNuevas, listos).forEach(function (e) {
      var cd = {};
      for (var k in e.customData || {}) cd[k] = e.customData[k];
      cd.pizarraSolucion = clave;
      e.customData = cd;
    });
    ultimas = nuevas.map(function (f) { return f.id; });

    var st = A.getAppState(), f0 = nuevas[0];
    var zn = Math.min(st.width / f0.width, st.height / f0.height) * 0.9;
    A.updateScene({
      elements: todos.concat(nuevas, bandasNuevas, listos),
      appState: {
        selectedElementIds: {}, selectedGroupIds: {}, editingGroupId: null,
        zoom: { value: zn }, scrollX: st.width / zn / 2 - (f0.x + f0.width / 2), scrollY: st.height / zn / 2 - (f0.y + f0.height / 2),
      },
      captureUpdate: "IMMEDIATELY",
    });
    if (sol.titulo && !st.name) try { A.updateScene({ appState: { name: String(sol.titulo) } }); } catch (e) {}
    return {
      ok: true, hojas: nuevas.length, elementos: listos.length, reemplazados: reemplazados, clave: clave,
      numeros: nuevas.map(function (f) { return f.customData.pizarraHoja.n; }), avisos: avisos, errores: [],
    };
  }
  var ultimas = []; // ids de las hojas de la ultima importacion

  // ------------------------------------------------- imagenes de las hojas
  // Cada hoja como PNG (ancho `ancho` px), con la misma exportacion que
  // «Imprimir / PDF»: recortada al marco, en tema claro y con las fuentes.
  async function imagenes(cuales, ancho) {
    var A = api(), h = H(), exportar = window.__pizarraSvg;
    if (!exportar) throw new Error("Esta versión de la pizarra no puede exportar las hojas");
    var elementos = A.getSceneElements(), hojas = h.hojasDe(elementos), archivos = A.getFiles();
    var elegidas = hojas.filter(function (f) {
      if (Array.isArray(cuales) && cuales.length) return cuales.indexOf(f.customData.pizarraHoja.n) >= 0;
      return ultimas.length ? ultimas.indexOf(f.id) >= 0 : true;
    });
    var out = [];
    for (var i = 0; i < elegidas.length; i++) {
      var f = elegidas[i];
      var svg = await exportar(elementos, {
        exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false,
        exportScale: 1, exportPadding: 0, exportEmbedScene: false,
        frameRendering: { enabled: true, name: false, outline: false, clip: true },
      }, archivos, { exportingFrame: f });
      if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", "0 0 " + f.width + " " + f.height);
      var W = ancho || 800, Hh = Math.round(W * f.height / f.width);
      svg.setAttribute("width", W); svg.setAttribute("height", Hh);
      var url = URL.createObjectURL(new Blob([svg.outerHTML], { type: "image/svg+xml" }));
      try {
        var img = await new Promise(function (ok, mal) {
          var im = new Image();
          im.onload = function () { ok(im); };
          im.onerror = function () { mal(new Error("No se pudo dibujar la hoja " + f.customData.pizarraHoja.n)); };
          im.src = url;
        });
        var c = document.createElement("canvas");
        c.width = W; c.height = Hh;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, Hh);
        ctx.drawImage(img, 0, 0, W, Hh);
        out.push({ n: f.customData.pizarraHoja.n, png: c.toDataURL("image/png").split(",")[1] });
      } finally { URL.revokeObjectURL(url); }
    }
    return out;
  }

  // --------------------------------------------- puente (servidor.js)
  // Con el servidor local, la pagina escucha pedidos de programas de esta PC
  // (el servidor MCP de los solucionarios). Los atiende la ventana que se uso
  // por ultima vez. Acciones:
  //   importar { solucion, reemplazar, ver, ancho } → resultado (+ imagenes)
  //   ver { hojas: [n...], ancho }                  → imagenes
  //   estado                                        → hojas y titulo
  async function atender(accion, datos) {
    datos = datos || {};
    if (accion === "importar") {
      var r = await importarConFuentes(datos.solucion, { reemplazar: datos.reemplazar });
      mostrarResultado(r);
      if (r.ok && datos.ver) {
        // esperar a que la escena nueva este en el estado de la pizarra
        await new Promise(function (ok) { setTimeout(ok, 50); });
        r.imagenes = await imagenes(null, datos.ancho);
      }
      return r;
    }
    if (accion === "ver") return { ok: true, imagenes: await imagenes(datos.hojas, datos.ancho) };
    if (accion === "estado") {
      var A = api(), hs = H().hojasDe(A.getSceneElements());
      return { ok: true, titulo: A.getAppState().name || "", hojas: hs.map(function (f) {
        return { n: f.customData.pizarraHoja.n, solucion: (f.customData && f.customData.pizarraSolucion) || null };
      }) };
    }
    return { ok: false, errores: ["Acción desconocida: " + accion] };
  }

  function conectarPuente() {
    if (window.PIZARRA_SIN_SERVIDOR !== false || !window.EventSource || !window.fetch) return;
    var id = Math.random().toString(36).slice(2) + Date.now().toString(36), ultimoFoco = 0;
    var es = new EventSource("./puente/eventos?id=" + id);
    function foco() {
      var t = Date.now();
      if (t - ultimoFoco < 2000) return;
      ultimoFoco = t;
      fetch("./puente/foco?id=" + id, { method: "POST" }).catch(function () {});
    }
    window.addEventListener("focus", foco);
    document.addEventListener("pointerdown", foco, true);
    document.addEventListener("keydown", foco, true);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) foco(); });
    es.onmessage = function (ev) {
      var p;
      try { p = JSON.parse(ev.data); } catch (e) { return; }
      Promise.resolve().then(function () { return atender(p.accion, p.datos); })
        .catch(function (e) { return { ok: false, errores: [String(e && e.message || e)] }; })
        .then(function (r) { return fetch("./puente/respuesta?p=" + p.n, { method: "POST", body: JSON.stringify(r) }); })
        .catch(function () {});
    };
  }

  // -------------------------------------------------------- aviso en pantalla
  function aviso(txt, error) {
    var d = document.createElement("div");
    d.textContent = txt;
    d.style.cssText = "position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:9999;max-width:min(640px,90vw);" +
      "padding:10px 14px;border-radius:8px;font:14px/1.4 Assistant,sans-serif;white-space:pre-wrap;box-shadow:0 2px 10px rgba(0,0,0,.25);" +
      (error ? "background:#ffe3e3;color:#c92a2a" : "background:#ebfbee;color:#2b8a3e");
    document.body.appendChild(d);
    d.onclick = function () { d.remove(); };
    setTimeout(function () { d.remove(); }, error ? 15000 : 6000);
  }

  function mostrarResultado(res) {
    if (!res.ok) { aviso("No se pudo importar:\n• " + res.errores.slice(0, 8).join("\n• "), true); return; }
    var t = "Solución importada: " + res.hojas + (res.hojas === 1 ? " hoja" : " hojas") + ".";
    if (res.avisos.length) t += "\nRevisá:\n• " + res.avisos.slice(0, 6).join("\n• ");
    aviso(t, false);
  }

  // abre el selector de archivos; la fuente se carga antes de medir
  function abrir() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      f.text().then(function (txt) { return importarConFuentes(txt); }).then(mostrarResultado)
        .catch(function (e) { aviso("No se pudo leer el archivo: " + (e && e.message || e), true); });
    };
    inp.click();
  }

  function importarConFuentes(entrada, opciones) {
    var g = G();
    if (!g) return Promise.resolve({ ok: false, errores: ["La pizarra todavía no terminó de cargar"] });
    var cargas = Object.keys(g.FUENTES).map(function (k) { return document.fonts.load("20px " + g.FUENTES[k].css).catch(function () {}); });
    // el generador de QR (app/vendor/qrcode.js) se carga solo si la solucion tiene alguno
    var texto = typeof entrada === "string" ? entrada : JSON.stringify(entrada || {});
    if (/"qr"\s*:/.test(texto)) cargas.push(cargarQr().catch(function () {}));
    return Promise.all(cargas).then(function () { return importar(entrada, opciones); });
  }
  var cargaQr = null;
  function cargarQr() {
    if (window.qrcode) return Promise.resolve();
    if (!cargaQr) {
      cargaQr = new Promise(function (listo, fallo) {
        var s = document.createElement("script");
        s.src = "./vendor/qrcode.js";
        s.onload = function () { window.qrcode ? listo() : fallo(new Error("qrcode no cargó")); };
        s.onerror = function () { cargaQr = null; fallo(new Error("no se pudo cargar qrcode.js")); };
        document.head.appendChild(s);
      });
    }
    return cargaQr;
  }

  window.__pizarraSolucionario = { abrir: abrir, importar: importarConFuentes, imagenes: imagenes, FORMATO: FORMATO };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", conectarPuente);
  else conectarPuente();
})();
