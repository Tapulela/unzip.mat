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
      izq: r.izq ? String(r.izq) : null,
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

  // devuelve la lista de piezas de toda la solucion y los errores
  function armar(sol, maxW) {
    var g = G(), errores = [], avisos = [], piezas = [];
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
    var tamM = 10;
    function marcar(p, valor, tituloPorDefecto, nivelPorDefecto, altoRenglon) {
      if (!valor || !p) return;
      var lhR = altoRenglon || lh;
      var o = typeof valor === "object" ? valor : {};
      var titulo = String(typeof valor === "string" ? valor : o.titulo || tituloPorDefecto).replace(/\s+/g, " ").trim();
      if (!titulo) return;
      var nivel = Math.max(1, Math.min(3, (o.nivel | 0) || nivelPorDefecto || 1));
      var w = g.medir(titulo, tamM, fuente);
      var e = g.texto(-w - 6, (lhR - tamM * fuente.lh) / 2, titulo, tamM, fuente, "#6965db", "left");
      e.customData = { pizarraMarcador: { nivel: nivel, imprime: false } };
      p.els.push(e);
    }

    function bloques(lista, x, ruta, barras) {
      barras = barras || [];
      var n0 = piezas.length;
      bloquesSin(lista, x, ruta, barras);
      for (var k = n0; k < piezas.length; k++) if (piezas[k].els && !piezas[k].barras) piezas[k].barras = barras;
    }
    function bloquesSin(lista, x, ruta, barras) {
      (lista || []).forEach(function (b, i) {
        var rb = ruta + ".bloques[" + i + "]", p;
        if (typeof b === "string") b = { texto: b };
        if (b.salto) { piezas.push({ salto: true }); return; }
        if (b.espacio) { piezas.push({ hueco: (+b.espacio || 1) * lh }); return; }
        if (b.seccion !== undefined) {
          p = nuevaPieza(true);
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
          return;
        }
        if (b.texto !== undefined) {
          p = nuevaPieza(!!b.unir); // unir: no se separa de lo que le sigue
          escribirParrafo(b.texto, x, 0, maxW - x, b.tam && g.TAMANOS[b.tam] || tam, fuente, color(b.color, g.TINTA), p.agregar);
          piezas.push(p);
        } else if (Array.isArray(b.pasos)) {
          var L = b.pasos.map(function (r, j) { return renglon(r, rb + ".pasos[" + j + "]", errores); });
          if (!L.length) return;
          p = nuevaPieza();
          p.entero = !!b.entero; // entero: el desarrollo no se parte entre hojas (si entra en una)
          try { g.dibujarBloqueF(L, x, 0, opPasos, p.agregar); }
          catch (e) { errores.push(rb + ": no se pudo dibujar (" + (e && e.message || e) + ")"); return; }
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
          tmp.forEach(function (e) { g.expandirRaices(e).forEach(function (q) { p.els.push(q); }); });
          // avisos propios del generador (datos inconsistentes o que no alcanzan...)
          if (gen.avisos) gen.avisos(op).forEach(function (a) { avisos.push(rb + ": " + a); });
          if (!p.els.length) { avisos.push(rb + ": el generador «" + b.generador + "» no dibujó nada (¿datos con errores?)"); return; }
          // vinculado al generador, como si se hubiera insertado desde el panel
          p.els.forEach(function (e) { e.customData = { pizarra: { tipo: b.generador, gid: gid } }; });
          var d = p.els[0].customData.pizarra;
          d.eje = true; d.opciones = g.copiar(op); d.origen = [p.els[0].x - x, p.els[0].y];
          p.gid = gid;
          piezas.push(p);
        } else {
          errores.push(rb + ": bloque sin «texto», «pasos», «generador», «seccion», «salto» ni «espacio»");
        }
        // aviso propio si la hoja se corta justo antes de este bloque (estilo.continuacion)
        if (p && typeof b.continua === "string") p.continua = b.continua;
      });
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

    (sol.ejercicios || []).forEach(function (ej, i) {
      var r = "ejercicios[" + i + "]", nEj = ej.numero !== undefined ? ej.numero : i + 1;
      if (i) piezas.push({ hueco: lh * 1.2 });
      var rEj = nEj === "" ? "" : rotulo(plEj, nEj);
      var pEj = enunciado(rEj, ej.enunciado, 0, tamE, COLOR_EJERCICIO, true);
      marcar(pEj, ej.marcador, (rEj + " " + (ej.enunciado || "")).trim(), 1, pEj && pEj.alto1);
      bloques(ej.bloques, sangria * 0.5, r);
      (ej.items || []).forEach(function (it, j) {
        piezas.push({ hueco: lh * 0.6 });
        var nIt = it.numero !== undefined ? it.numero : String.fromCharCode(97 + j);
        var rIt = nIt === "" ? "" : rotulo(plIt, nEj, nIt);
        var pIt = enunciado(rIt, it.enunciado, sangria * 0.5, tam, COLOR_EJERCICIO);
        marcar(pIt, it.marcador, (rIt + " " + (it.enunciado || "")).trim(), 2, pIt && pIt.alto1);
        bloques(it.bloques, sangria, r + ".items[" + j + "]");
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

  // ------------------------------------------------------------- importar
  // clave de una solucion: con `reemplazar`, lo que se importo antes con la
  // misma clave se borra (sirve para corregir y volver a importar)
  function claveDe(sol) {
    var m = sol.meta || {};
    return [m.materia, m.institucion, m.anio, m.tp].filter(Boolean).join(" · ") || String(sol.titulo || "solucion");
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
    var avisosFormato = [];
    if (sol.formato && sol.formato !== FORMATO) avisosFormato.push("Formato «" + sol.formato + "»: esta pizarra lee «" + FORMATO + "»");
    if (!Array.isArray(sol.ejercicios)) return { ok: false, errores: ["Falta la lista «ejercicios»"] };

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
    // cabecera y pie («cabecera» y «pie» de la solucion): se crean los que
    // falten en la escena, arriba de la primera hoja nueva. Las bandas son de
    // toda la pizarra: si ya hay, quedan las que estan.
    var faltan = {};
    if (typeof sol.cabecera === "string" && !(bandas && bandas.cab)) faltan.cab = sol.cabecera;
    if (typeof sol.pie === "string" && !(bandas && bandas.pie)) faltan.pie = sol.pie;
    if ((faltan.cab !== undefined || faltan.pie !== undefined) && h.nuevasBandas) {
      var nb = h.nuevasBandas(faltan, x0, y0);
      nb.forEach(function (e) {
        var cd = {};
        for (var k in e.customData || {}) cd[k] = e.customData[k];
        cd.pizarraSolucion = clave;
        e.customData = cd;
      });
      todos = todos.concat(nb);
      bandas = h.bandasDe(todos);
    }
    var nuevas = [];
    function hojaNueva() {
      var u = nuevas[nuevas.length - 1];
      var f = h.marco(u ? u.x + u.width + sep : x0, y0, n0 + nuevas.length + 1);
      nuevas.push(f);
      var area = h.areaUtil(f, bandas);
      return { f: f, area: area, y: area.y0 };
    }
    var hoja = hojaNueva();
    var maxW = hoja.area.x1 - hoja.area.x0;
    var r = armar(sol, maxW);
    if (r.errores.length) return { ok: false, errores: r.errores, avisos: avisosFormato.concat(r.avisos) };
    var avisos = avisosFormato.concat(r.avisos);
    var altoUtil = hoja.area.y1 - hoja.area.y0;

    // reparto: renglon por renglon; una pieza «unir» (enunciado) pasa entera a
    // la hoja siguiente junto con el primer renglon de lo que le sigue
    // seq: [{ q: renglon, antes: espacio que lo separa del anterior }]
    var listos = [], pendiente = null, gap = 0, vacia = true;
    // estilo.continuacion: si un ejercicio sigue en la hoja siguiente, se avisa
    // en gris al pie de la hoja (y se reserva ese lugar en todas las hojas)
    var tamAviso = g.TAMANOS.S, altoAviso = r.continuacion ? Math.ceil(tamAviso * r.fuente.lh + 8) : 0;
    function textoAviso(seq) {
      var it = seq[0];
      if (it.p.inicioEj && it.i === 0) return null; // empieza un ejercicio: no hay nada que continue
      if (it.p.esEnunciado && it.i > 0) return "Continúa la consigna en la siguiente hoja";
      for (var k = 0; k < seq.length; k++) if (seq[k].p.continua) return seq[k].p.continua;
      return "Continúa en la siguiente hoja";
    }
    // líneas verticales de las secciones: un tramo por hoja y por sección, que
    // se alarga hasta el último renglón puesto (cubre también los espacios)
    var tramos = {};
    function barrasDe(p, yTop, yBot) {
      (p.barras || []).forEach(function (b) {
        var t = tramos[b.id], x = hoja.area.x0 + b.x;
        if (t && t.hoja === hoja.f.id) {
          var i = listos.indexOf(t.el);
          if (i >= 0) listos.splice(i, 1);
        } else {
          t = tramos[b.id] = { hoja: hoja.f.id, y0: yTop - r.lh * 0.15 };
        }
        t.el = g.trazo([[x, t.y0], [x, yBot]], { strokeColor: b.color, strokeWidth: 1.5 });
        t.el.frameId = hoja.f.id; t.el.groupIds = [g.nuevoId()];
        listos.push(t.el);
      });
    }
    function poner(seq) {
      var alto = seq.reduce(function (s, it, i) { return s + (i ? it.antes : 0) + (it.q.y1 - it.q.y0); }, 0);
      var arranque = vacia ? 0 : seq[0].antes;
      if (!vacia && hoja.y + arranque + alto > hoja.area.y1 - altoAviso) {
        var aviso = r.continuacion && textoAviso(seq);
        if (aviso) {
          var ea = g.texto(hoja.area.x0, hoja.y + 6, "(" + aviso + ")", tamAviso, r.fuente, color("gris"), "left");
          ea.frameId = hoja.f.id; ea.groupIds = [g.nuevoId()];
          listos.push(ea);
        }
        hoja = hojaNueva(); vacia = true; arranque = 0;
      }
      if (alto > altoUtil + 1) avisos.push("Un renglón es más alto que el área útil de la hoja " + hoja.f.customData.pizarraHoja.n + ": se sale por abajo");
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
    r.piezas.forEach(function (p) {
      if (p.salto) { if (pendiente) { poner(pendiente); pendiente = null; } if (!vacia) { hoja = hojaNueva(); vacia = true; } return; }
      if (p.hueco !== undefined) { gap = Math.max(gap, p.hueco); return; }
      if (!p.els.length) return;
      // cada pieza en su grupo (las de un generador, en el grupo de su dibujo)
      var gid = p.gid || g.nuevoId();
      p.els.forEach(function (e) { e.groupIds = [gid]; });
      var rs = renglones(p.els);
      // el dibujo de un generador no se parte si entra en una hoja: un grafico
      // partido queda con su titulo en una hoja y el dibujo en otra, y ya no se
      // puede regenerar desde su panel
      if ((p.gid || p.entero) && rs.length > 1 && rs[rs.length - 1].y1 - rs[0].y0 <= altoUtil) {
        rs = [rs.reduce(function (a, q) {
          return { els: a.els.concat(q.els), y0: Math.min(a.y0, q.y0), y1: Math.max(a.y1, q.y1), x1: Math.max(a.x1, q.x1) };
        })];
      }
      rs.forEach(function (q, i) {
        var seq = [{ q: q, antes: i ? q.y0 - rs[i - 1].y1 : gap, p: p, i: i }];
        if (pendiente) { seq = pendiente.concat(seq); pendiente = null; }
        // un enunciado no se corta entre hojas: todos sus renglones esperan al
        // primero de lo que sigue
        if (p.unir) { pendiente = seq; return; }
        poner(seq);
      });
      gap = p.espacio !== undefined ? p.espacio : r.lh * 0.6;
    });
    if (pendiente) poner(pendiente);

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
    // todo lo importado lleva la clave de la solucion (para reemplazarlo despues)
    nuevas.concat(listos).forEach(function (e) {
      var cd = {};
      for (var k in e.customData || {}) cd[k] = e.customData[k];
      cd.pizarraSolucion = clave;
      e.customData = cd;
    });
    ultimas = nuevas.map(function (f) { return f.id; });

    var st = A.getAppState(), z = st.zoom.value, f0 = nuevas[0];
    var zn = Math.min(st.width / f0.width, st.height / f0.height) * 0.9;
    A.updateScene({
      elements: todos.concat(nuevas, listos),
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
    return Promise.all(cargas).then(function () { return importar(entrada, opciones); });
  }

  window.__pizarraSolucionario = { abrir: abrir, importar: importarConFuentes, imagenes: imagenes, FORMATO: FORMATO };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", conectarPuente);
  else conectarPuente();
})();
