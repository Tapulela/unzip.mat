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
    if (x.raiz !== undefined) return { raiz: items(x.raiz, ruta + ".raiz", errores), color: color(x.color, undefined) };
    if (x.marca === "ok" || x.marca === "mal") return { marca: x.marca };
    if (Array.isArray(x.sistema)) {
      return { sistema: x.sistema.map(function (f, i) { return items(f, ruta + ".sistema[" + i + "]", errores); }), color: color(x.color, undefined) };
    }
    if (Array.isArray(x.tabla)) {
      return { tabla: x.tabla.map(function (f, i) {
        return (Array.isArray(f) ? f : [f]).map(function (c, j) { return items(c, ruta + ".tabla[" + i + "][" + j + "]", errores); });
      }) };
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
  function escribirParrafo(str, x, y, maxW, tam, fuente, col, agregar) {
    var g = G(), lh = tam * fuente.lh;
    String(str).split("\n").forEach(function (par) {
      var palabras = par.split(/ +/), linea = "";
      palabras.forEach(function (p) {
        var prueba = linea ? linea + " " + p : p;
        if (linea && g.medir(prueba, tam, fuente) > maxW) {
          agregar(g.texto(x, y, linea, tam, fuente, col, "left")); y += lh; linea = p;
        } else linea = prueba;
      });
      if (linea) agregar(g.texto(x, y, linea, tam, fuente, col, "left"));
      y += lh;
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

    function bloques(lista, x, ruta) {
      (lista || []).forEach(function (b, i) {
        var rb = ruta + ".bloques[" + i + "]", p;
        if (typeof b === "string") b = { texto: b };
        if (b.salto) { piezas.push({ salto: true }); return; }
        if (b.espacio) { piezas.push({ hueco: (+b.espacio || 1) * lh }); return; }
        if (b.texto !== undefined) {
          p = nuevaPieza();
          escribirParrafo(b.texto, x, 0, maxW - x, b.tam && g.TAMANOS[b.tam] || tam, fuente, color(b.color, g.TINTA), p.agregar);
          piezas.push(p);
        } else if (Array.isArray(b.pasos)) {
          var L = b.pasos.map(function (r, j) { return renglon(r, rb + ".pasos[" + j + "]", errores); });
          if (!L.length) return;
          p = nuevaPieza();
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
          if (!p.els.length) { avisos.push(rb + ": el generador «" + b.generador + "» no dibujó nada (¿datos con errores?)"); return; }
          // vinculado al generador, como si se hubiera insertado desde el panel
          p.els.forEach(function (e) { e.customData = { pizarra: { tipo: b.generador, gid: gid } }; });
          var d = p.els[0].customData.pizarra;
          d.eje = true; d.opciones = g.copiar(op); d.origen = [p.els[0].x - x, p.els[0].y];
          p.gid = gid;
          piezas.push(p);
        } else {
          errores.push(rb + ": bloque sin «texto», «pasos», «generador», «salto» ni «espacio»");
        }
      });
    }

    function enunciado(numero, texto, x, tamN, colN) {
      var p = nuevaPieza(true), etiqueta = numero !== undefined && numero !== "" ? String(numero) + ") " : "";
      var wE = etiqueta ? g.medir(etiqueta, tamN, fuente) : 0;
      if (etiqueta) p.agregar(g.texto(x, 0, etiqueta.trim(), tamN, fuente, colN, "left"));
      if (texto) escribirParrafo(texto, x + wE, 0, maxW - x - wE, tamN, fuente, COLOR_ENUNCIADO, p.agregar);
      p.espacio = lh * 0.4;
      if (p.els.length) piezas.push(p);
    }

    (sol.ejercicios || []).forEach(function (ej, i) {
      var r = "ejercicios[" + i + "]";
      if (i) piezas.push({ hueco: lh * 1.2 });
      enunciado(ej.numero !== undefined ? ej.numero : i + 1, ej.enunciado, 0, g.tamTitulo(tam), COLOR_EJERCICIO);
      bloques(ej.bloques, sangria * 0.5, r);
      (ej.items || []).forEach(function (it, j) {
        piezas.push({ hueco: lh * 0.6 });
        enunciado(it.numero !== undefined ? it.numero : String.fromCharCode(97 + j), it.enunciado, sangria * 0.5, tam, COLOR_EJERCICIO);
        bloques(it.bloques, sangria, r + ".items[" + j + "]");
      });
    });
    return { piezas: piezas, errores: errores, avisos: avisos, tam: tam, lh: lh };
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
  function importar(entrada) {
    var A = api(), g = G(), h = H();
    if (!A || !g || !h || !h.marco) return { ok: false, errores: ["La pizarra todavía no terminó de cargar"] };
    var sol = entrada;
    if (typeof entrada === "string") {
      try { sol = JSON.parse(entrada); } catch (e) { return { ok: false, errores: ["El archivo no es un JSON válido: " + e.message] }; }
    }
    if (!sol || typeof sol !== "object") return { ok: false, errores: ["El archivo está vacío"] };
    var avisosFormato = [];
    if (sol.formato && sol.formato !== FORMATO) avisosFormato.push("Formato «" + sol.formato + "»: esta pizarra lee «" + FORMATO + "»");
    if (!Array.isArray(sol.ejercicios)) return { ok: false, errores: ["Falta la lista «ejercicios»"] };

    var todos = A.getSceneElementsIncludingDeleted(), vivos = todos.filter(function (e) { return !e.isDeleted; });
    var hojas = h.hojasDe(todos), bandas = h.bandasDe(todos);
    // primera hoja nueva: a la derecha de todo lo que ya hay
    var sep = h.separacion(), x0 = 0, y0 = 0, n0 = hojas.length ? hojas[hojas.length - 1].customData.pizarraHoja.n : 0;
    if (vivos.length) {
      var bt = g.cajaDe(vivos);
      x0 = bt.x1 + sep * 2; y0 = hojas.length ? hojas[0].y : bt.y0;
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

    // reparto: renglon por renglon; una pieza «unir» (titulo, enunciado) se
    // pasa a la hoja siguiente junto con el primer renglon de lo que le sigue
    // seq: [{ q: renglon, antes: espacio que lo separa del anterior }]
    var listos = [], pendiente = null, gap = 0, vacia = true;
    function poner(seq) {
      var alto = seq.reduce(function (s, it, i) { return s + (i ? it.antes : 0) + (it.q.y1 - it.q.y0); }, 0);
      var arranque = vacia ? 0 : seq[0].antes;
      if (!vacia && hoja.y + arranque + alto > hoja.area.y1) { hoja = hojaNueva(); vacia = true; arranque = 0; }
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
      rs.forEach(function (q, i) {
        var seq = [{ q: q, antes: i ? q.y0 - rs[i - 1].y1 : gap }];
        if (pendiente) { seq = pendiente.concat(seq); pendiente = null; }
        if (p.unir && i === rs.length - 1) { pendiente = seq; return; }
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
    return { ok: true, hojas: nuevas.length, elementos: listos.length, avisos: avisos, errores: [] };
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

  function importarConFuentes(entrada) {
    var g = G();
    var cargas = Object.keys(g.FUENTES).map(function (k) { return document.fonts.load("20px " + g.FUENTES[k].css).catch(function () {}); });
    return Promise.all(cargas).then(function () { return importar(entrada); });
  }

  window.__pizarraSolucionario = { abrir: abrir, importar: importarConFuentes, FORMATO: FORMATO };
})();
