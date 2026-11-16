// Hojas A4: para armar en la pizarra material que se va a imprimir.
//  - Cada hoja es un marco (frame) nativo de Excalidraw con la proporcion de una
//    A4 vertical (210 x 297 mm), llamado «Hoja N». Se sincroniza con la sala, se
//    mueve con su contenido y recorta lo que se sale del borde.
//  - Los margenes NO son elementos: se dibujan en una capa encima del lienzo
//    (como el marco de camara.js), asi que no se pueden mover ni se imprimen.
//    Se guardan en customData.pizarraHoja de cada marco (asi los ve toda la sala).
//  - Con «Doble faz», el margen del lomo va a la izquierda en las hojas impares
//    y a la derecha en las pares.
//  - Los elementos que tocan una hoja y se salen del area util se marcan en rojo,
//    y el panel los lista.
//  - «Imprimir / PDF» exporta cada hoja como SVG y abre el dialogo de impresion
//    con una pagina A4 por hoja (de ahi se imprime o se guarda como PDF).
//  - Hojas apaisadas: se imprimen giradas 90° a la izquierda en una pagina
//    vertical (su borde de arriba va al lomo en las hojas impares), asi se
//    encuadernan con las demas.
//  - Los generadores insertan dentro de la hoja que se esta mirando, debajo de
//    lo que ya tiene (lugarPara). «Repartir en hojas» corta la seleccion por
//    renglones y pasa lo que no entra a las hojas siguientes.
// El panel se abre desde el menu de Generadores (seccion «Impresión»).
// Usa window.__pizarraAPI (expuesta por el bundle). Expone window.__pizarraHojas.
(function () {
  function api() { return window.__pizarraAPI; }

  var A4 = { w: 210, h: 297 };            // mm
  var PX_MM = 96 / 25.4;                  // unidades de la pizarra por mm al 100 %
  var CLAVE = "pizarra-hojas";
  var DEFECTO = {
    impresion: 0.8,                        // la hoja mide 1/0,8 = 1,25 veces una A4 a 96 ppp
    margenes: { sup: 20, inf: 20, ext: 15, lomo: 25 },
    dobleFaz: true,
    guias: true,
    numerar: true,                         // numero de pagina abajo, al imprimir
    titulo: "",                            // titulo del documento (nombre del PDF)
    apaisada: false,                       // orientacion de las hojas nuevas
    alto: { cab: 15, pie: 12 },            // mm de la cabecera y del pie nuevos
    sinPortada: true,                      // la primera hoja sin cabecera ni pie
  };
  var ESCALAS = [
    { v: 1, texto: "100 %", nota: "el texto M (20) sale de unos 15 pt" },
    { v: 0.8, texto: "80 %", nota: "el texto M (20) sale de unos 12 pt" },
  ];

  function copiar(o) { return JSON.parse(JSON.stringify(o)); }
  function rnd() { return Math.floor(Math.random() * 2147483647); }
  function nuevoId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  var op = copiar(DEFECTO);
  try {
    var g = JSON.parse(localStorage.getItem(CLAVE) || "null");
    if (g) {
      if (ESCALAS.some(function (e) { return e.v === g.impresion; })) op.impresion = g.impresion;
      if (g.margenes) for (var k in op.margenes) if (isFinite(g.margenes[k])) op.margenes[k] = +g.margenes[k];
      if (typeof g.dobleFaz === "boolean") op.dobleFaz = g.dobleFaz;
      if (typeof g.guias === "boolean") op.guias = g.guias;
      if (typeof g.numerar === "boolean") op.numerar = g.numerar;
      if (typeof g.titulo === "string") op.titulo = g.titulo;
      if (typeof g.apaisada === "boolean") op.apaisada = g.apaisada;
      if (g.alto) for (var k2 in op.alto) if (isFinite(g.alto[k2])) op.alto[k2] = +g.alto[k2];
      if (typeof g.sinPortada === "boolean") op.sinPortada = g.sinPortada;
    }
  } catch (e) {}
  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(op)); } catch (e) {} }

  // ------------------------------------------------------------- geometria
  function datosHoja(e) { return e && e.customData && e.customData.pizarraHoja; }
  function esHoja(e) { return e && !e.isDeleted && e.type === "frame" && !!datosHoja(e); }
  function hojasDe(todos) {
    return todos.filter(esHoja).sort(function (a, b) { return datosHoja(a).n - datosHoja(b).n; });
  }

  // unidades de la pizarra por mm de esta hoja (sale de su tamano)
  function porMm(f) { return Math.min(f.width, f.height) / A4.w; }

  function esApaisada(f) { return f.width > f.height; }

  // Un punto del papel (en mm, el papel siempre vertical) en coordenadas de
  // la pizarra. Una hoja apaisada se imprime girada 90° a la izquierda: su
  // borde de arriba queda a la izquierda del papel y su derecha, arriba.
  function papelAHoja(f, px, py) {
    var u = porMm(f);
    return esApaisada(f) ? [f.x + (A4.h - py) * u, f.y + px * u] : [f.x + px * u, f.y + py * u];
  }
  function rectPapel(f, x0, y0, x1, y1) {
    var a = papelAHoja(f, x0, y0), b = papelAHoja(f, x1, y1);
    return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
  }

  // cabecera y pie de pagina: marcos especiales que se repiten en todas las
  // hojas (salvo la primera, si es portada)
  var SEP = 4; // mm entre la cabecera (o el pie) y el contenido
  function datosBanda(e) { return e && e.customData && e.customData.pizarraBanda; }
  function esBanda(e) { return e && !e.isDeleted && e.type === "frame" && !!datosBanda(e); }
  function bandasDe(todos) {
    var r = { cab: null, pie: null, sinPortada: false };
    todos.forEach(function (e) {
      if (!esBanda(e)) return;
      var d = datosBanda(e);
      if (d.tipo === "cabecera" && !r.cab) r.cab = e;
      if (d.tipo === "pie" && !r.pie) r.pie = e;
      if (d.sinPortada) r.sinPortada = true;
    });
    return r.cab || r.pie ? r : null;
  }
  function bandasDeHoja(f, bandas) {
    return bandas && !(bandas.sinPortada && datosHoja(f).n === 1) ? bandas : null;
  }

  // area util de una hoja, en coordenadas de la pizarra (sin margenes, ni
  // cabecera, ni pie). `lomo` dice de que lado esta: "izq", "der", "arr" o
  // "aba"; `bandas`, donde van la cabecera y el pie (en el papel y en la hoja).
  function areaUtil(f, bandas) {
    var d = datosHoja(f), m = d.margenes || DEFECTO.margenes, u = porMm(f);
    var verso = d.dobleFaz && d.n % 2 === 0;
    // el lomo a la izquierda del papel en las impares y a la derecha en las pares
    var izq = verso ? m.ext : m.lomo, der = verso ? m.lomo : m.ext;
    var bs = bandasDeHoja(f, bandas);
    var cabH = bs && bs.cab ? bs.cab.height / u : 0, pieH = bs && bs.pie ? bs.pie.height / u : 0;
    var arr = m.sup + (cabH ? cabH + SEP : 0), aba = m.inf + (pieH ? pieH + SEP : 0);
    var r = rectPapel(f, izq, arr, A4.w - der, A4.h - aba);
    r.lomo = esApaisada(f) ? (verso ? "aba" : "arr") : (verso ? "der" : "izq");
    r.bandas = [];
    function banda(b, y, h) {
      var p = { x: izq, y: y, w: b.width / u, h: h };
      r.bandas.push({ banda: b, papel: p, rect: rectPapel(f, p.x, p.y, p.x + p.w, p.y + p.h) });
    }
    if (cabH) banda(bs.cab, m.sup, cabH);
    if (pieH) banda(bs.pie, A4.h - m.inf - pieH, pieH);
    return r;
  }

  // cuanto hay que correr el contenido de una hoja que pasa de `antes` a
  // `despues` (otro lugar u otro numero): lo que se mueve el area util, asi
  // que con doble faz, al cambiar de par a impar, sigue al lomo
  function corrimiento(antes, despues, bandas) {
    var a = areaUtil(antes, bandas), b = areaUtil(despues, bandas);
    return { dx: b.x0 - a.x0, dy: b.y0 - a.y0 };
  }

  // rectangulo que ocupa un elemento (con su rotacion)
  function caja(e) {
    var x0 = e.x, y0 = e.y, x1 = e.x + e.width, y1 = e.y + e.height;
    if (e.points && e.points.length) {
      x0 = y0 = Infinity; x1 = y1 = -Infinity;
      e.points.forEach(function (p) {
        x0 = Math.min(x0, e.x + p[0]); x1 = Math.max(x1, e.x + p[0]);
        y0 = Math.min(y0, e.y + p[1]); y1 = Math.max(y1, e.y + p[1]);
      });
    }
    if (e.angle) {
      // Excalidraw rota alrededor del centro del elemento (x, y, width, height)
      var cx = e.x + e.width / 2, cy = e.y + e.height / 2, c = Math.cos(e.angle), s = Math.sin(e.angle);
      var esq = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
      x0 = y0 = Infinity; x1 = y1 = -Infinity;
      esq.forEach(function (p) {
        var dx = p[0] - cx, dy = p[1] - cy, X = cx + dx * c - dy * s, Y = cy + dx * s + dy * c;
        x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
      });
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function seTocan(a, b) { return a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1; }
  function cajaDeLista(lista) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    lista.forEach(function (e) {
      var c = caja(e);
      b.x0 = Math.min(b.x0, c.x0); b.y0 = Math.min(b.y0, c.y0);
      b.x1 = Math.max(b.x1, c.x1); b.y1 = Math.max(b.y1, c.y1);
    });
    return b;
  }
  function adentro(f, x, y) { return x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height; }

  // lo que pertenece a una hoja: lo enganchado a su marco y lo suelto (sin
  // marco) cuyo centro cae en ella
  function contenidoDe(f, todos) {
    return todos.filter(function (e) {
      if (e.isDeleted || e.type === "frame" || e.type === "magicframe") return false;
      if (e.frameId) return e.frameId === f.id;
      var c = caja(e);
      return adentro(f, (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2);
    });
  }

  // Para cada hoja: los elementos que la tocan (o que estan en su marco) y se
  // salen del area util. Un elemento metido en el marco de otra hoja no cuenta.
  function revisar(todos) {
    var hojas = hojasDe(todos), ids = {}, bandas = bandasDe(todos);
    todos.forEach(function (e) { if (esBanda(e)) ids[e.id] = true; });
    hojas.forEach(function (f) { ids[f.id] = true; });
    var vivos = todos.filter(function (e) {
      return !e.isDeleted && e.type !== "frame" && e.type !== "magicframe";
    });
    return hojas.map(function (f) {
      var borde = { x0: f.x, y0: f.y, x1: f.x + f.width, y1: f.y + f.height };
      var util = areaUtil(f, bandas), eps = 0.5, fuera = [];
      vivos.forEach(function (e) {
        if (e.frameId && e.frameId !== f.id && ids[e.frameId]) return;
        var c = caja(e);
        if (e.frameId !== f.id && !seTocan(c, borde)) return;
        var sale = c.x0 < util.x0 - eps || c.y0 < util.y0 - eps || c.x1 > util.x1 + eps || c.y1 > util.y1 + eps;
        if (sale) fuera.push({ el: e, caja: c });
      });
      return { hoja: f, util: util, fuera: fuera };
    });
  }

  // ------------------------------------------------------------ elementos
  // marco de una hoja nueva; `o` (opcional) es otra hoja de la que copia el
  // tamano y los margenes en vez de usar los del panel
  function marco(x, y, n, o) {
    var ahora = Date.now(), u = PX_MM / op.impresion;
    var w = o ? o.width : (op.apaisada ? A4.h : A4.w) * u, h = o ? o.height : (op.apaisada ? A4.w : A4.h) * u;
    var d = o ? datosHoja(o) : op;
    return {
      id: nuevoId(), type: "frame", name: "Hoja " + n,
      x: x, y: y, width: w, height: h, angle: 0,
      strokeColor: "#bbb", backgroundColor: "transparent", fillStyle: "solid",
      strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100,
      groupIds: [], frameId: null, index: null, roundness: null,
      seed: rnd(), version: 1, versionNonce: rnd(), isDeleted: false,
      boundElements: null, updated: ahora, created: ahora, link: null, locked: false,
      customData: { pizarraHoja: { n: n, margenes: copiar(d.margenes || DEFECTO.margenes), dobleFaz: !!d.dobleFaz } },
    };
  }

  // copia de una hoja con cambios en sus datos (customData.pizarraHoja) y en
  // sus propiedades
  function conDatos(e, cambiosDatos, cambios) {
    var cd = {};
    for (var k in e.customData) cd[k] = e.customData[k];
    cd.pizarraHoja = copiar(datosHoja(e));
    for (k in cambiosDatos) cd.pizarraHoja[k] = cambiosDatos[k];
    var c = { customData: cd };
    for (k in cambios) c[k] = cambios[k];
    return modificado(e, c);
  }

  function modificado(e, cambios) {
    var d = {};
    for (var k in e) d[k] = e[k];
    for (k in cambios) d[k] = cambios[k];
    d.version = e.version + 1; d.versionNonce = rnd(); d.updated = Date.now();
    return d;
  }

  // lleva la vista hasta el rectangulo si no se ve entero
  function mostrarRect(r, st, forzarZoom) {
    var z = st.zoom.value, vx0 = -st.scrollX, vy0 = -st.scrollY;
    var visible = r.x0 >= vx0 && r.y0 >= vy0 && r.x1 <= vx0 + st.width / z && r.y1 <= vy0 + st.height / z;
    if (visible && !forzarZoom) return null;
    var zn = Math.min(st.width / (r.x1 - r.x0), st.height / (r.y1 - r.y0)) * 0.9;
    zn = Math.max(0.1, Math.min(forzarZoom ? zn : z, zn, 30));
    return {
      zoom: { value: zn },
      scrollX: st.width / zn / 2 - (r.x0 + r.x1) / 2,
      scrollY: st.height / zn / 2 - (r.y0 + r.y1) / 2,
    };
  }

  function agregarHoja() {
    var A = api();
    if (!A) return;
    var todos = A.getSceneElementsIncludingDeleted(), st = A.getAppState(), z = st.zoom.value;
    var hojas = hojasDe(todos), n = 1, x, y, u = PX_MM / op.impresion;
    var W = (op.apaisada ? A4.h : A4.w) * u, H = (op.apaisada ? A4.w : A4.h) * u;
    if (hojas.length) {
      var ult = hojas[hojas.length - 1];
      n = datosHoja(ult).n + 1;
      x = ult.x + ult.width + 15 * u; y = ult.y;
    } else {
      x = -st.scrollX + st.width / z / 2 - W / 2;
      y = -st.scrollY + st.height / z / 2 - H / 2;
      // la primera hoja no se encima a lo que ya hay: se corre a la derecha
      var ocupados = todos.filter(function (e) { return !e.isDeleted; }).map(caja);
      for (var vuelta = 0; vuelta < 50; vuelta++) {
        var b = { x0: x, y0: y, x1: x + W, y1: y + H }, choque = null;
        ocupados.forEach(function (o) { if (seTocan(o, b)) choque = Math.max(choque === null ? -Infinity : choque, o.x1); });
        if (choque === null) break;
        x = choque + 15 * u;
      }
    }
    var f = marco(x, y, n), sel = {};
    sel[f.id] = true;
    var vista = mostrarRect({ x0: f.x, y0: f.y, x1: f.x + f.width, y1: f.y + f.height }, st, false) || {};
    A.updateScene({
      elements: todos.concat([f]),
      appState: Object.assign({ selectedElementIds: sel, selectedGroupIds: {}, editingGroupId: null }, vista),
      captureUpdate: "IMMEDIATELY",
    });
  }

  // «Insertar hoja después»: agrega una hoja vacia inmediatamente despues de
  // la seleccionada (o de la hoja de lo seleccionado), con su tamano y sus
  // margenes. La nueva ocupa el lugar de la siguiente, cada una de las que
  // siguen pasa al lugar de la que le sigue (con su contenido) y la ultima se
  // corre un lugar a la derecha; todas suben un numero. Asi se respeta el
  // acomodo en filas.
  function insertarDespues(avisar) {
    var A = api();
    if (!A) return;
    var st = A.getAppState(), todos = A.getSceneElements(), hojas = hojasDe(todos);
    var sel = st.selectedElementIds || {};
    var elegidas = hojas.filter(function (f) { return sel[f.id]; });
    if (!elegidas.length) {
      // lo seleccionado adentro de una sola hoja
      var marcos = {};
      todos.forEach(function (e) { if (sel[e.id] && e.frameId) marcos[e.frameId] = true; });
      elegidas = hojas.filter(function (f) { return marcos[f.id]; });
    }
    if (elegidas.length !== 1) {
      avisar(elegidas.length ? "Seleccioná una sola hoja." :
        "Seleccioná la hoja después de la cual va la nueva (clic en su nombre o en su borde).", true);
      return;
    }
    var f0 = elegidas[0], n0 = datosHoja(f0).n, u = porMm(f0), gap = 15 * u;
    var siguientes = hojas.filter(function (f) { return datosHoja(f).n > n0; });
    // lugar de cada una: el de la que le sigue; la ultima, a la derecha de si misma
    function lugarDe(i) {
      var g = i < siguientes.length ? siguientes[i] : null;
      if (g) return { x: g.x, y: g.y };
      var ult = siguientes.length ? siguientes[siguientes.length - 1] : f0;
      return { x: ult.x + ult.width + gap, y: ult.y };
    }
    var nueva = marco(lugarDe(0).x, lugarDe(0).y, n0 + 1, f0), cambios = {}, bandas = bandasDe(todos);
    siguientes.forEach(function (f, i) {
      var l = lugarDe(i + 1), nn = datosHoja(f).n + 1;
      cambios[f.id] = conDatos(f, { n: nn }, { name: "Hoja " + nn, x: l.x, y: l.y });
      var c = corrimiento(f, cambios[f.id], bandas);
      contenidoDe(f, todos).forEach(function (e) {
        if (!cambios[e.id] && !esHoja(e)) cambios[e.id] = modificado(e, { x: e.x + c.dx, y: e.y + c.dy });
      });
    });
    var marcados = {};
    marcados[nueva.id] = true;
    var vista = mostrarRect({ x0: nueva.x, y0: nueva.y, x1: nueva.x + nueva.width, y1: nueva.y + nueva.height }, st, false) || {};
    A.updateScene({
      elements: A.getSceneElementsIncludingDeleted().map(function (e) { return cambios[e.id] || e; }).concat([nueva]),
      appState: Object.assign({ selectedElementIds: marcados, selectedGroupIds: {}, editingGroupId: null }, vista),
      captureUpdate: "IMMEDIATELY",
    });
    avisar("Hoja " + (n0 + 1) + " insertada después de la " + n0 +
      (siguientes.length ? "; las siguientes se corrieron un lugar." : "."));
  }

  // pasa los margenes, el doble faz y la escala del panel a todas las hojas, y
  // el alto y la portada a la cabecera y al pie (con el ancho del area util)
  function aplicarATodas() {
    var A = api();
    if (!A) return;
    var u = PX_MM / op.impresion;
    var todos = A.getSceneElementsIncludingDeleted().map(function (e) {
      if (esBanda(e)) {
        var cdb = {};
        for (var kb in e.customData) cdb[kb] = e.customData[kb];
        cdb.pizarraBanda = copiar(datosBanda(e));
        cdb.pizarraBanda.sinPortada = op.sinPortada;
        return modificado(e, { customData: cdb, width: anchoBanda() * u, height: op.alto[datosBanda(e).tipo === "pie" ? "pie" : "cab"] * u });
      }
      if (!esHoja(e)) return e;
      var d = copiar(datosHoja(e));
      d.margenes = copiar(op.margenes); d.dobleFaz = op.dobleFaz;
      var cd = {};
      for (var k in e.customData) cd[k] = e.customData[k];
      cd.pizarraHoja = d;
      var ap = esApaisada(e);
      return modificado(e, { customData: cd, width: (ap ? A4.h : A4.w) * u, height: (ap ? A4.w : A4.h) * u });
    });
    A.updateScene({ elements: todos, captureUpdate: "IMMEDIATELY" });
  }

  // ------------------------------------------------------- cabecera y pie
  // ancho (mm) de la cabecera y del pie: el del area util del papel
  function anchoBanda() { return A4.w - op.margenes.lomo - op.margenes.ext; }

  var medidor = document.createElement("canvas").getContext("2d");
  function elemento(tipo, p) {
    var ahora = Date.now(), e = {
      id: nuevoId(), type: tipo, x: 0, y: 0, width: 0, height: 0, angle: 0,
      strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid",
      strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100,
      groupIds: [], frameId: null, index: null, roundness: null,
      seed: rnd(), version: 1, versionNonce: rnd(), isDeleted: false,
      boundElements: null, updated: ahora, created: ahora, link: null, locked: false,
    };
    for (var k in p) e[k] = p[k];
    return e;
  }
  // texto en la fuente Normal (Nunito), tamano M; alineado a la izquierda o centrado en `cx`
  function textoBanda(str, x, cy, centrado, marcoId) {
    var tam = 20, h = tam * 1.25;
    medidor.font = tam + "px Nunito, sans-serif";
    var w = Math.ceil(medidor.measureText(str).width);
    return elemento("text", {
      x: centrado ? x - w / 2 : x, y: cy - h / 2, width: w, height: h, frameId: marcoId,
      text: str, originalText: str, fontSize: tam, fontFamily: 6,
      textAlign: centrado ? "center" : "left", verticalAlign: "top", containerId: null,
      autoResize: true, lineHeight: 1.25, strokeColor: "#495057",
    });
  }
  function lineaBanda(x, y, w, marcoId) {
    return elemento("line", {
      x: x, y: y, width: w, height: 0, points: [[0, 0], [w, 0]], frameId: marcoId,
      strokeColor: "#adb5bd", polygon: false,
      startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null,
    });
  }
  function marcoBanda(tipo, x, y, w, h) {
    var ahora = Date.now();
    return {
      id: nuevoId(), type: "frame", name: tipo === "pie" ? "Pie de página" : "Cabecera",
      x: x, y: y, width: w, height: h, angle: 0,
      strokeColor: "#bbb", backgroundColor: "transparent", fillStyle: "solid",
      strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100,
      groupIds: [], frameId: null, index: null, roundness: null,
      seed: rnd(), version: 1, versionNonce: rnd(), isDeleted: false,
      boundElements: null, updated: ahora, created: ahora, link: null, locked: false,
      customData: { pizarraBanda: { tipo: tipo, sinPortada: op.sinPortada } },
    };
  }

  // Crea la cabecera y el pie que falten, arriba de la Hoja 1. Se arman con
  // un contenido inicial: la cabecera con el titulo y una linea abajo; el pie
  // con una linea arriba y «Hoja {n} de {total}» centrado.
  function crearBandas(avisar) {
    var A = api();
    if (!A) return;
    var todos = A.getSceneElementsIncludingDeleted(), vivos = todos.filter(function (e) { return !e.isDeleted; });
    var hojas = hojasDe(vivos), ya = bandasDe(vivos) || {}, st = A.getAppState();
    if (ya.cab && ya.pie) { verBandas(avisar); return; }
    var u = hojas.length ? porMm(hojas[0]) : PX_MM / op.impresion;
    var w = anchoBanda() * u, hc = op.alto.cab * u, hp = op.alto.pie * u, gap = 25 * u;
    var x0, y0;
    if (hojas.length) { x0 = hojas[0].x; y0 = hojas[0].y - gap - Math.max(hc, hp); }
    else {
      var z = st.zoom.value;
      x0 = -st.scrollX + st.width / z / 2 - w - gap / 2; y0 = -st.scrollY + st.height / z / 2 - hc / 2;
    }
    var nuevos = [];
    if (!ya.cab) {
      var c = marcoBanda("cabecera", x0, y0, w, hc);
      nuevos.push(c,
        textoBanda("{titulo}", c.x, c.y + hc / 2 - 1.5 * u, false, c.id),
        lineaBanda(c.x, c.y + hc - 2 * u, w, c.id));
    }
    if (!ya.pie) {
      var p = marcoBanda("pie", x0 + w + gap, y0, w, hp);
      nuevos.push(p,
        lineaBanda(p.x, p.y + 2 * u, w, p.id),
        textoBanda("Hoja {n} de {total}", p.x + w / 2, p.y + hp / 2 + 1.5 * u, true, p.id));
    }
    var b = cajaDeLista(nuevos);
    A.updateScene({
      elements: todos.concat(nuevos),
      appState: Object.assign({ selectedElementIds: {}, selectedGroupIds: {} }, mostrarRect(b, st, false) || {}),
      captureUpdate: "IMMEDIATELY",
    });
    avisar("Listo: dibujá adentro de «Cabecera» y «Pie de página». {n} es el número de hoja, " +
      "{total} la cantidad de hojas y {titulo} el título del panel.");
  }

  // lleva la vista a la cabecera y al pie
  // Para solucionario.js: cabecera y pie nuevos, sin agregarlos a la escena,
  // arriba de (x0, y0). textos: { cab, pie }; una banda se crea si su texto es
  // un string (vacio: solo la linea). Puede tener varios renglones (\n).
  function nuevasBandas(textos, x0, y0) {
    var u = PX_MM / op.impresion;
    var w = anchoBanda() * u, hc = op.alto.cab * u, hp = op.alto.pie * u, gap = 25 * u;
    var hayCab = typeof textos.cab === "string", hayPie = typeof textos.pie === "string";
    var y = y0 - gap - Math.max(hayCab ? hc : 0, hayPie ? hp : 0), nuevos = [];
    function textoVarios(str, x, cy, centrado, marcoId) {
      var lineas = str.split("\n"), tam = lineas.length > 1 ? 16 : 20, lh = tam * 1.25;
      medidor.font = tam + "px Nunito, sans-serif";
      var wt = Math.ceil(Math.max.apply(null, lineas.map(function (l) { return medidor.measureText(l).width; })));
      return elemento("text", {
        x: centrado ? x - wt / 2 : x, y: cy - lh * lineas.length / 2, width: wt, height: lh * lineas.length, frameId: marcoId,
        text: str, originalText: str, fontSize: tam, fontFamily: 6,
        textAlign: centrado ? "center" : "left", verticalAlign: "top", containerId: null,
        autoResize: true, lineHeight: 1.25, strokeColor: "#495057",
      });
    }
    if (hayCab) {
      var c = marcoBanda("cabecera", x0, y, w, hc);
      nuevos.push(c, lineaBanda(c.x, c.y + hc - 2 * u, w, c.id));
      if (textos.cab) nuevos.push(textoVarios(textos.cab, c.x, c.y + (hc - 2 * u) / 2, false, c.id));
    }
    if (hayPie) {
      var p = marcoBanda("pie", x0 + (hayCab ? w + gap : 0), y, w, hp);
      nuevos.push(p, lineaBanda(p.x, p.y + 2 * u, w, p.id));
      if (textos.pie) nuevos.push(textoVarios(textos.pie, p.x + w / 2, p.y + (hp + 2 * u) / 2, true, p.id));
    }
    return nuevos;
  }

  // lleva la vista a la cabecera y al pie
  function verBandas(avisar) {
    var A = api();
    if (!A) return;
    var b = bandasDe(A.getSceneElements());
    if (!b) { avisar("Todavía no hay cabecera ni pie.", true); return; }
    var r = cajaDeLista([b.cab, b.pie].filter(Boolean));
    A.updateScene({ appState: mostrarRect({ x0: r.x0 - 40, y0: r.y0 - 60, x1: r.x1 + 40, y1: r.y1 + 40 }, A.getAppState(), true) });
  }

  // marca «sin portada» en la cabecera y el pie que ya estan en la pizarra
  function ponerPortada() {
    var A = api();
    if (!A) return;
    var cambio = false;
    var todos = A.getSceneElementsIncludingDeleted().map(function (e) {
      if (!esBanda(e) || !!datosBanda(e).sinPortada === op.sinPortada) return e;
      cambio = true;
      var cd = {};
      for (var k in e.customData) cd[k] = e.customData[k];
      cd.pizarraBanda = copiar(datosBanda(e));
      cd.pizarraBanda.sinPortada = op.sinPortada;
      return modificado(e, { customData: cd });
    });
    if (cambio) A.updateScene({ elements: todos, captureUpdate: "IMMEDIATELY" });
  }

  // Elementos de la escena con {n}, {total} y {titulo} reemplazados en los
  // textos de una banda. Excalidraw ancla el texto segun su alineacion
  // (izquierda, centro, derecha), asi que no hace falta recalcular el ancho.
  var VARIABLES = /\{(n|total|titulo)\}/g;
  function conVariables(todos, banda, n, total) {
    var ids = {};
    contenidoDe(banda, todos).forEach(function (e) { ids[e.id] = true; });
    var valores = { n: String(n), total: String(total), titulo: (op.titulo || "").trim() };
    function poner(s) { return String(s).replace(VARIABLES, function (t, k) { return valores[k]; }); }
    return todos.map(function (e) {
      if (!ids[e.id] || e.type !== "text" || !VARIABLES.test(e.text)) { VARIABLES.lastIndex = 0; return e; }
      VARIABLES.lastIndex = 0;
      var d = {};
      for (var k in e) d[k] = e[k];
      d.text = poner(e.text);
      d.originalText = poner(e.originalText || e.text);
      return d;
    });
  }
  // que variables usa una banda (para no generar una imagen por hoja si no hace falta)
  function variablesDe(banda, todos) {
    var usa = {};
    contenidoDe(banda, todos).forEach(function (e) {
      if (e.type === "text") String(e.text).replace(VARIABLES, function (t, k) { usa[k] = true; return t; });
    });
    return usa;
  }

  // SVG de una banda para la hoja n (con las variables reemplazadas)
  async function svgBanda(banda, todos, n, total, prefijo, oscuro) {
    var svg = await window.__pizarraSvg(conVariables(todos, banda, n, total), {
      exportBackground: false, viewBackgroundColor: "#ffffff", exportWithDarkMode: !!oscuro,
      exportScale: 1, exportPadding: 0, exportEmbedScene: false,
      frameRendering: { enabled: true, name: false, outline: false, clip: true },
    }, api().getFiles(), { exportingFrame: banda });
    idsPropios(svg, prefijo);
    if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", "0 0 " + banda.width + " " + banda.height);
    return svg;
  }

  // gira las hojas seleccionadas (vertical <-> apaisada), sin mover su contenido
  function girar(avisar) {
    var A = api();
    if (!A) return;
    var sel = A.getAppState().selectedElementIds || {}, n = 0;
    var todos = A.getSceneElementsIncludingDeleted().map(function (e) {
      if (!esHoja(e) || !sel[e.id]) return e;
      n++;
      return modificado(e, { width: e.height, height: e.width });
    });
    if (!n) { avisar("Seleccioná la hoja que querés girar (clic en su nombre o en su borde).", true); return; }
    A.updateScene({ elements: todos, captureUpdate: "IMMEDIATELY" });
    avisar(n === 1 ? "Hoja girada." : n + " hojas giradas.");
  }

  // Lugar para un dibujo nuevo de los generadores: si el centro de la vista
  // cae en una hoja, va al comienzo de su area util, debajo de lo que ya tiene
  // la hoja. Devuelve el corrimiento y el marco al que se engancha, o null.
  function lugarPara(b, todos, st) {
    var z = st.zoom.value, cx = -st.scrollX + st.width / z / 2, cy = -st.scrollY + st.height / z / 2;
    var f = hojasDe(todos).filter(function (h) { return adentro(h, cx, cy); })[0];
    if (!f) return null;
    var util = areaUtil(f, bandasDe(todos)), y = util.y0, ya = contenidoDe(f, todos);
    if (ya.length) y = Math.max(util.y0, cajaDeLista(ya).y1 + 8 * porMm(f));
    return { dx: util.x0 - b.x0, dy: y - b.y0, frameId: f.id };
  }

  // «Repartir en hojas»: corta la seleccion en renglones (bloques cuya franja
  // vertical no se superpone con otra) y pasa a las hojas siguientes lo que no
  // entra en el area util. Lo que esta agrupado aparte (y los textos de sus
  // contenedores) no se separa; el grupo comun a toda la seleccion (un dibujo
  // de los generadores) se parte en un grupo por hoja y deja de estar vinculado
  // a su generador. Usa las hojas siguientes si estan vacias; si no, inserta
  // hojas nuevas despues y corre a la derecha (con su contenido) las que siguen.
  function repartir(avisar) {
    var A = api();
    if (!A) return;
    var st = A.getAppState(), todos = A.getSceneElements(), hojas = hojasDe(todos);
    var selIds = st.selectedElementIds || {}, enSel = {}, porId = {};
    todos.forEach(function (e) { porId[e.id] = e; });
    var sel = todos.filter(function (e) { return selIds[e.id] && e.type !== "frame" && e.type !== "magicframe"; });
    sel.forEach(function (e) { enSel[e.id] = true; });
    todos.forEach(function (e) {
      if (e.containerId && enSel[e.containerId] && !enSel[e.id]) { sel.push(e); enSel[e.id] = true; }
    });
    if (!sel.length) { avisar("Seleccioná lo que querés repartir (por ejemplo, un paso a paso).", true); return; }

    // unidades que no se separan: grupos propios (no comunes a toda la
    // seleccion) o elementos sueltos, con el texto de su contenedor
    var comunes = sel[0].groupIds.filter(function (g) {
      return sel.every(function (e) { return e.groupIds.indexOf(g) >= 0; });
    });
    var unidades = {};
    sel.forEach(function (e) {
      var r = e.containerId && enSel[e.containerId] ? porId[e.containerId] : e;
      var propios = r.groupIds.filter(function (g) { return comunes.indexOf(g) < 0; });
      var k = propios.length ? "g" + propios[propios.length - 1] : "e" + r.id;
      (unidades[k] = unidades[k] || []).push(e);
    });
    var lista = Object.keys(unidades).map(function (k) {
      var b = cajaDeLista(unidades[k]);
      return { els: unidades[k], y0: b.y0, y1: b.y1 };
    }).sort(function (a, b) { return a.y0 - b.y0; });
    // renglones: unidades cuya franja vertical se superpone van juntas
    var bloques = [];
    lista.forEach(function (un) {
      var ult = bloques[bloques.length - 1];
      if (ult && un.y0 < ult.y1 - 0.5) { ult.els = ult.els.concat(un.els); ult.y1 = Math.max(ult.y1, un.y1); }
      else bloques.push({ els: un.els.slice(), y0: un.y0, y1: un.y1 });
    });

    var total = cajaDeLista(sel);
    var inicio = hojas.filter(function (f) {
      return adentro(f, (total.x0 + total.x1) / 2, (bloques[0].y0 + bloques[0].y1) / 2);
    })[0];
    if (!inicio) { avisar("Lo seleccionado tiene que empezar dentro de una hoja.", true); return; }
    var bandas = bandasDe(todos), util0 = areaUtil(inicio, bandas);

    // paginas: la primera queda donde esta; en las siguientes, el primer
    // renglon va al comienzo del area util y los demas mantienen su distancia
    var pags = [[]], desp = [0], tope = util0.y1;
    bloques.forEach(function (bl) {
      var p = pags.length - 1;
      var vaciaNueva = p > 0 && !pags[p].length;
      if (bl.y1 + desp[p] > tope + 0.5 && !vaciaNueva) {
        pags.push([]); desp.push(util0.y0 - bl.y0); p++;
      }
      pags[p].push(bl);
    });
    if (pags.length === 1) { avisar("Ya entra en " + inicio.name + "."); return; }

    // hojas de destino: las siguientes que esten vacias y, si faltan, nuevas
    var K = pags.length - 1, destinos = [], ref = inicio;
    var siguientes = hojas.filter(function (f) { return datosHoja(f).n > datosHoja(inicio).n; });
    for (var i = 0; i < siguientes.length && destinos.length < K; i++) {
      var ocupada = contenidoDe(siguientes[i], todos).some(function (e) { return !enSel[e.id]; });
      if (ocupada) break;
      destinos.push(siguientes[i]); ref = siguientes[i];
    }
    var faltan = K - destinos.length, cambios = {}, nuevas = [];
    if (faltan) {
      var gap = 15 * porMm(inicio), paso = inicio.width + gap, nRef = datosHoja(ref).n, dx = faltan * paso;
      // las hojas que siguen (y su contenido) se corren a la derecha y se renumeran
      hojas.filter(function (f) { return datosHoja(f).n > nRef; }).forEach(function (f) {
        var nn = datosHoja(f).n + faltan;
        cambios[f.id] = conDatos(f, { n: nn }, { name: "Hoja " + nn, x: f.x + dx });
        var c = corrimiento(f, cambios[f.id], bandas);
        contenidoDe(f, todos).forEach(function (e) {
          if (!enSel[e.id] && !cambios[e.id]) cambios[e.id] = modificado(e, { x: e.x + c.dx, y: e.y + c.dy });
        });
      });
      for (var j = 0; j < faltan; j++) {
        var h = marco(ref.x + ref.width + gap + j * paso, ref.y, nRef + 1 + j, inicio);
        nuevas.push(h); destinos.push(h);
      }
    }

    // cada pagina a su hoja, enganchada al marco; un grupo nuevo por pagina en
    // lugar de los comunes, y sin el vinculo al generador
    pags.forEach(function (pag, k) {
      var dest = k ? destinos[k - 1] : inicio, ud = areaUtil(dest, bandas);
      var mx = k ? ud.x0 - util0.x0 : 0, my = k ? desp[k] + ud.y0 - util0.y0 : 0;
      var grupos = {};
      comunes.forEach(function (g) { grupos[g] = k ? nuevoId() : g; });
      pag.forEach(function (bl) {
        bl.els.forEach(function (e) {
          var cd = null;
          if (e.customData) {
            cd = {};
            for (var c in e.customData) if (c !== "pizarra") cd[c] = e.customData[c];
          }
          cambios[e.id] = modificado(e, {
            x: e.x + mx, y: e.y + my, frameId: dest.id, customData: cd,
            groupIds: e.groupIds.map(function (g) { return grupos[g] || g; }),
          });
        });
      });
    });

    var elementos = A.getSceneElementsIncludingDeleted().map(function (e) { return cambios[e.id] || e; }).concat(nuevas);
    A.updateScene({
      elements: elementos,
      appState: { selectedElementIds: {}, selectedGroupIds: {}, editingGroupId: null },
      captureUpdate: "IMMEDIATELY",
    });
    var nombres = [];
    pags.forEach(function (p, k) {
      if (p.length) nombres.push("Hoja " + datosHoja(k ? destinos[k - 1] : inicio).n);
    });
    var cuales = nombres.length === 1 ? nombres[0] : nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
    avisar((nombres.length === 1 ? "Pasó a la " : "Quedó repartido en ") + cuales +
      (nuevas.length ? " (" + (nuevas.length === 1 ? "1 hoja nueva" : nuevas.length + " hojas nuevas") + ")" : "") + ".");
  }

  // numera las hojas por su lugar: de arriba abajo por filas, y en cada fila
  // de izquierda a derecha
  function renumerar() {
    var A = api();
    if (!A) return;
    var todos = A.getSceneElementsIncludingDeleted(), hojas = hojasDe(todos);
    hojas.sort(function (a, b) {
      var fila = Math.min(a.height, b.height) / 2;
      if (Math.abs(a.y - b.y) > fila) return a.y - b.y;
      return a.x - b.x;
    });
    var nuevoN = {};
    hojas.forEach(function (f, i) { nuevoN[f.id] = i + 1; });
    todos = todos.map(function (e) {
      if (!nuevoN[e.id] || datosHoja(e).n === nuevoN[e.id] && e.name === "Hoja " + nuevoN[e.id]) return e;
      var cd = {};
      for (var k in e.customData) cd[k] = e.customData[k];
      cd.pizarraHoja = copiar(datosHoja(e));
      cd.pizarraHoja.n = nuevoN[e.id];
      return modificado(e, { customData: cd, name: "Hoja " + nuevoN[e.id] });
    });
    A.updateScene({ elements: todos, captureUpdate: "IMMEDIATELY" });
  }

  // ------------------------------------------------------------- impresion
  // Cada hoja se exporta como SVG con la exportacion de Excalidraw
  // (window.__pizarraSvg, ver README): recortada al marco, en tema claro, con
  // las fuentes y las imagenes incrustadas. Entran los elementos que tocan la
  // hoja y no estan en otro marco. Las paginas se arman en un iframe con
  // @page A4 sin margenes y se abre el dialogo de impresion del navegador
  // (de ahi se imprime o se guarda como PDF).
  var imprimiendo = false;
  async function imprimir(avisar) {
    var A = api(), exportar = window.__pizarraSvg;
    if (!A || imprimiendo) return;
    if (!exportar) { avisar("Esta versión de la pizarra no puede exportar las hojas.", true); return; }
    var elementos = A.getSceneElements(), hojas = hojasDe(elementos), archivos = A.getFiles();
    var bandas = bandasDe(elementos);
    if (!hojas.length) { avisar("No hay hojas para imprimir.", true); return; }
    imprimiendo = true;
    try {
      var paginas = [];
      for (var i = 0; i < hojas.length; i++) {
        avisar("Preparando " + (hojas.length === 1 ? "la hoja" : "la hoja " + (i + 1) + " de " + hojas.length) + "…");
        var f = hojas[i];
        var svg = await exportar(elementos, {
          exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false,
          exportScale: 1, exportPadding: 0, exportEmbedScene: false,
          frameRendering: { enabled: true, name: false, outline: false, clip: true },
        }, archivos, { exportingFrame: f });
        idsPropios(svg, "h" + (i + 1) + "-");
        if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", "0 0 " + f.width + " " + f.height);
        var ap = esApaisada(f);
        svg.setAttribute("width", ap ? "297mm" : "210mm");
        svg.setAttribute("height", ap ? "210mm" : "297mm");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.setAttribute("class", "contenido");
        // cabecera y pie: en coordenadas del papel (no se giran con la hoja)
        var html = svg.outerHTML;
        var util = areaUtil(f, bandas);
        for (var j = 0; j < util.bandas.length; j++) {
          var b = util.bandas[j], p = b.papel;
          var sb = await svgBanda(b.banda, elementos, i + 1, hojas.length, "h" + (i + 1) + "b" + j + "-");
          sb.setAttribute("width", p.w + "mm");
          sb.setAttribute("height", p.h + "mm");
          sb.setAttribute("class", "banda");
          sb.setAttribute("style", "left:" + p.x + "mm;top:" + p.y + "mm");
          html += sb.outerHTML;
        }
        var m = datosHoja(f).margenes || DEFECTO.margenes;
        // sin pie de pagina, el numero (si se pidio) va centrado abajo
        paginas.push({ svg: html, n: i + 1, inf: m.inf, apaisada: ap, numerar: op.numerar && !(bandas && bandas.pie) });
      }
      await imprimirPaginas(paginas);
      avisar(hojas.length === 1 ? "Se mandó 1 hoja a imprimir." : "Se mandaron " + hojas.length + " hojas a imprimir.");
    } catch (e) {
      console.warn("hojas.js: no se pudo imprimir", e);
      avisar("No se pudieron preparar las hojas: " + (e && e.message || e), true);
    } finally {
      imprimiendo = false;
    }
  }

  // Cada SVG define un clipPath por marco con el id del marco, en las
  // coordenadas de esa hoja. Con todas las paginas en un mismo documento los
  // ids se repetirian y url(#id) tomaria la definicion de la primera hoja (con
  // otro corrimiento): lo enganchado a las demas hojas quedaba recortado afuera.
  // Se les pone un prefijo por pagina a los ids y a sus referencias.
  function idsPropios(svg, prefijo) {
    var ids = {};
    [].forEach.call(svg.querySelectorAll("[id]"), function (n) {
      ids[n.id] = true;
      n.id = prefijo + n.id;
    });
    function cambiar(v) {
      return v.replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, function (t, q, id) {
        return ids[id] ? "url(" + q + "#" + prefijo + id + q + ")" : t;
      });
    }
    [].forEach.call(svg.querySelectorAll("*"), function (n) {
      [].slice.call(n.attributes).forEach(function (a) {
        if (a.value.indexOf("url(") >= 0) n.setAttribute(a.name, cambiar(a.value));
        else if ((a.name === "href" || a.name === "xlink:href") && a.value[0] === "#" && ids[a.value.slice(1)]) {
          n.setAttribute(a.name, "#" + prefijo + a.value.slice(1));
        }
      });
      if (n.tagName.toLowerCase() === "style") n.textContent = cambiar(n.textContent);
    });
  }

  function imprimirPaginas(paginas) {
    return new Promise(function (listo, fallo) {
      var marcoImp = document.createElement("iframe");
      marcoImp.setAttribute("aria-hidden", "true");
      marcoImp.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      document.body.appendChild(marcoImp);
      var titulo = (op.titulo || "").trim() || "Hojas";
      var html = "<!doctype html><html><head><meta charset='utf-8'><title></title><style>" +
        "@page{size:A4 portrait;margin:0}" +
        "html,body{margin:0;padding:0;background:#fff}" +
        ".hoja{position:relative;width:210mm;height:297mm;overflow:hidden;break-after:page;page-break-after:always}" +
        ".hoja:last-child{break-after:auto;page-break-after:auto}" +
        ".hoja svg{display:block}" +
        // apaisada: girada 90° a la izquierda dentro de la pagina vertical
        ".hoja.apaisada svg.contenido{position:absolute;left:0;top:0;transform-origin:0 0;transform:translateY(297mm) rotate(-90deg)}" +
        ".hoja svg.banda{position:absolute}" +
        ".num{position:absolute;left:0;right:0;text-align:center;font:10pt Assistant,Nunito,system-ui,sans-serif;color:#555}" +
        "</style></head><body>" +
        paginas.map(function (p) {
          var num = p.numerar
            ?"<div class='num' style='bottom:" + Math.max(4, p.inf / 2 - 2) + "mm'>" + p.n + "</div>" : "";
          return "<div class='hoja" + (p.apaisada ? " apaisada" : "") + "'>" + p.svg + num + "</div>";
        }).join("") + "</body></html>";
      var doc = marcoImp.contentDocument;
      doc.open(); doc.write(html); doc.close();
      doc.title = titulo;
      var win = marcoImp.contentWindow;
      var imagenes = [].slice.call(doc.querySelectorAll("image")).map(function (im) {
        var src = im.getAttribute("href") || im.getAttribute("xlink:href");
        if (!src) return Promise.resolve();
        return new Promise(function (r) { var img = new Image(); img.onload = img.onerror = r; img.src = src; });
      });
      Promise.all(imagenes.concat([doc.fonts ? doc.fonts.ready : Promise.resolve()])).then(function () {
        // el nombre del PDF sale del titulo de la pagina
        var tituloViejo = document.title;
        document.title = titulo;
        var limpiar = function () {
          document.title = tituloViejo;
          setTimeout(function () { marcoImp.remove(); }, 1000);
        };
        try {
          win.focus();
          win.print(); // bloquea hasta que se cierra el dialogo
          limpiar();
          listo();
        } catch (e) { limpiar(); fallo(e); }
      }, function (e) { marcoImp.remove(); fallo(e); });
    });
  }

  // selecciona los elementos de una hoja que se salen del area util y la muestra
  function verProblemas(r) {
    var A = api();
    if (!A) return;
    var st = A.getAppState(), sel = {}, f = r.hoja;
    r.fuera.forEach(function (p) { sel[p.el.id] = true; });
    var b = { x0: f.x, y0: f.y, x1: f.x + f.width, y1: f.y + f.height };
    r.fuera.forEach(function (p) {
      b.x0 = Math.min(b.x0, p.caja.x0); b.y0 = Math.min(b.y0, p.caja.y0);
      b.x1 = Math.max(b.x1, p.caja.x1); b.y1 = Math.max(b.y1, p.caja.y1);
    });
    A.updateScene({
      appState: Object.assign({ selectedElementIds: sel, selectedGroupIds: {}, editingGroupId: null },
        mostrarRect(b, st, true)),
    });
  }

  // --------------------------------------------- capa de guias (no se imprime)
  var capa = {
    lienzo: null, ctx: null, revision: [], firma: "",
    crear: function () {
      var c = document.createElement("canvas");
      c.id = "pz-hojas";
      c.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:2";
      document.body.appendChild(c);
      this.lienzo = c;
      this.ctx = c.getContext("2d");
    },
    dibujar: function () {
      var A = api();
      if (!A) return;
      var st = A.getAppState(), z = st.zoom.value, dpr = window.devicePixelRatio || 1;
      var w = window.innerWidth, h = window.innerHeight;
      var firma = [st.scrollX, st.scrollY, z, st.offsetLeft, st.offsetTop, w, h, dpr, st.theme,
        op.guias, this.version].join("|");
      if (firma === this.firma) return;
      this.firma = firma;
      var c = this.lienzo, ctx = this.ctx;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        c.style.width = w + "px"; c.style.height = h + "px";
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      if (!op.guias || !this.revision.length) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      function X(x) { return (x + st.scrollX) * z + st.offsetLeft; }
      function Y(y) { return (y + st.scrollY) * z + st.offsetTop; }
      var oscuro = st.theme === "dark";
      var azul = oscuro ? "rgba(116,192,252,.85)" : "rgba(28,126,214,.8)";
      var banda = oscuro ? "rgba(116,192,252,.07)" : "rgba(28,126,214,.06)";
      var rojo = "#e03131", total = this.revision.length;
      this.revision.forEach(function (r, i) {
        var f = r.hoja, u = r.util;
        var fx0 = X(f.x), fy0 = Y(f.y), fx1 = X(f.x + f.width), fy1 = Y(f.y + f.height);
        if (fx1 < 0 || fy1 < 0 || fx0 > w || fy0 > h) return;
        var ux0 = X(u.x0), uy0 = Y(u.y0), ux1 = X(u.x1), uy1 = Y(u.y1);
        // margenes sombreados (la hoja menos el area util)
        ctx.fillStyle = banda;
        ctx.beginPath();
        ctx.rect(fx0, fy0, fx1 - fx0, fy1 - fy0);
        ctx.rect(ux1, uy0, ux0 - ux1, uy1 - uy0); // sentido contrario: agujero
        ctx.fill();
        // cabecera y pie: su lugar y una imagen tenue de su contenido
        u.bandas.forEach(function (b) {
          var R = b.rect;
          ctx.strokeStyle = oscuro ? "rgba(255,255,255,.25)" : "rgba(0,0,0,.2)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.strokeRect(X(R.x0), Y(R.y0), (R.x1 - R.x0) * z, (R.y1 - R.y0) * z);
          ctx.setLineDash([]);
          var img = fantasmas.imgs[fantasmas.clave(b.banda, i + 1, total, oscuro)];
          if (!img) return;
          ctx.save();
          ctx.globalAlpha = 0.55;
          if (esApaisada(f)) {
            // el papel esta girado: la banda va a lo largo del borde derecho
            ctx.translate(X(R.x1), Y(R.y0));
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(img, 0, 0, (R.y1 - R.y0) * z, (R.x1 - R.x0) * z);
          } else {
            ctx.drawImage(img, X(R.x0), Y(R.y0), (R.x1 - R.x0) * z, (R.y1 - R.y0) * z);
          }
          ctx.restore();
        });
        ctx.strokeStyle = azul;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(ux0, uy0, ux1 - ux0, uy1 - uy0);
        ctx.setLineDash([]);
        // el lado del lomo: una linea mas marcada en el borde de la hoja
        // [linea x0, y0, x1, y1, etiqueta x, y, giro]
        var L = {
          izq: [fx0 + 2, fy0, fx0 + 2, fy1, fx0 + 8, (fy0 + fy1) / 2, -Math.PI / 2],
          der: [fx1 - 2, fy0, fx1 - 2, fy1, fx1 - 8, (fy0 + fy1) / 2, Math.PI / 2],
          arr: [fx0, fy0 + 2, fx1, fy0 + 2, (fx0 + fx1) / 2, fy0 + 8, 0],
          aba: [fx0, fy1 - 2, fx1, fy1 - 2, (fx0 + fx1) / 2, fy1 - 8, 0, "bottom"],
        }[u.lomo];
        ctx.strokeStyle = azul;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(L[2], L[3]); ctx.stroke();
        if (Math.min(fx1 - fx0, fy1 - fy0) > 120) {
          ctx.save();
          ctx.fillStyle = azul;
          ctx.font = "11px Assistant, system-ui, sans-serif";
          ctx.translate(L[4], L[5]);
          ctx.rotate(L[6]);
          ctx.textAlign = "center";
          ctx.textBaseline = L[7] || "top";
          ctx.fillText("lomo", 0, 0);
          ctx.restore();
        }
        // lo que se sale del area util
        if (r.fuera.length) {
          ctx.strokeStyle = rojo;
          ctx.lineWidth = 1.5;
          r.fuera.forEach(function (p) {
            ctx.strokeRect(X(p.caja.x0) - 3, Y(p.caja.y0) - 3, (p.caja.x1 - p.caja.x0) * z + 6, (p.caja.y1 - p.caja.y0) * z + 6);
          });
          var txt = r.fuera.length === 1 ? "1 elemento fuera del área útil" : r.fuera.length + " elementos fuera del área útil";
          ctx.font = "12px Assistant, system-ui, sans-serif";
          var tw = ctx.measureText(txt).width;
          ctx.fillStyle = rojo;
          ctx.fillRect(fx1 - tw - 14, fy1 + 4, tw + 12, 18);
          ctx.fillStyle = "#fff";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(txt, fx1 - tw - 8, fy1 + 13);
        }
      });
    },
    version: 0,
    actualizar: function (todos) {
      this.revision = revisar(todos);
      this.version++;
      fantasmas.programar(todos);
    },
  };

  // Imagenes tenues de la cabecera y del pie para cada hoja (en la capa de
  // guias). Se generan con la exportacion a SVG, de a una y en segundo plano;
  // si la banda usa {n} o {total} hay una por hoja, si no, una sola.
  var fantasmas = {
    imgs: {}, firmas: {}, vars: {}, vivos: [], temporizador: null, corriendo: false, otraVez: false,
    clave: function (b, n, total, oscuro) {
      var v = this.vars[b.id] || {};
      return [b.id, this.firmas[b.id], v.n ? n : "", v.total ? total : "", v.titulo ? op.titulo : "", oscuro ? 1 : 0].join("|");
    },
    programar: function (todos) {
      var self = this;
      this.vivos = todos.filter(function (e) { return !e.isDeleted; });
      this.vivos.forEach(function (e) {
        if (!esBanda(e)) return;
        var dentro = contenidoDe(e, self.vivos);
        self.firmas[e.id] = [e.version, e.width, e.height].concat(dentro.map(function (x) { return x.id + ":" + x.version; })).join(",");
        self.vars[e.id] = variablesDe(e, self.vivos);
      });
      clearTimeout(this.temporizador);
      this.temporizador = setTimeout(function () { self.correr(); }, 250);
    },
    correr: async function () {
      if (!window.__pizarraSvg || !api()) return;
      if (this.corriendo) { this.otraVez = true; return; }
      this.corriendo = true;
      try {
        var rev = capa.revision, total = rev.length, usadas = {}, vivos = this.vivos;
        var oscuro = api().getAppState().theme === "dark";
        for (var i = 0; i < rev.length; i++) {
          for (var j = 0; j < rev[i].util.bandas.length; j++) {
            var b = rev[i].util.bandas[j].banda, k = this.clave(b, i + 1, total, oscuro);
            usadas[k] = true;
            if (this.imgs[k]) continue;
            var svg = await svgBanda(b, vivos, i + 1, total, "f-", oscuro);
            this.imgs[k] = await imagenDe(svg);
            capa.version++;
          }
        }
        for (var k2 in this.imgs) if (!usadas[k2]) delete this.imgs[k2];
      } catch (e) {
        console.warn("hojas.js: no se pudo dibujar la cabecera o el pie", e);
      } finally {
        this.corriendo = false;
        if (this.otraVez) { this.otraVez = false; this.correr(); }
      }
    },
  };
  function imagenDe(svg) {
    return new Promise(function (listo, fallo) {
      var url = URL.createObjectURL(new Blob([svg.outerHTML], { type: "image/svg+xml" }));
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); listo(img); };
      img.onerror = function (e) { URL.revokeObjectURL(url); fallo(e); };
      img.src = url;
    });
  }

  // ------------------------------------------------------------------ panel
  var ESTILO =
    ".pz-hojas .opc .campos input{width:48px}" +
    ".pz-hojas .lista{margin-top:10px;font-size:12px;line-height:1.5}" +
    ".pz-hojas .lista .mal{color:#e03131}" +
    ".pz-hojas .lista button.enlace{border:0;background:none;color:#6965db;cursor:pointer;padding:0 0 0 4px;font:inherit}" +
    ".pz-hojas .lista button.enlace:hover{text-decoration:underline}" +
    ".pz-hojas .opc input.titulo{font:13px Assistant,system-ui,sans-serif}" +
    ".pz-hojas .estado{font-size:12px;margin-top:6px;opacity:.8}" +
    ".pz-hojas .estado.mal{color:#e03131;opacity:1}" +
    ".pz-hojas .imprimir-sec{margin-top:12px;border-top:1px solid #e0dfe6;padding-top:4px}" +
    ".pz-gen.oscuro.pz-hojas .imprimir-sec{border-color:#3a3a43}";

  var panel = {
    el: null, abierto: false,
    construir: function () {
      var css = document.createElement("style");
      css.textContent = ESTILO;
      document.head.appendChild(css);
      var el = document.createElement("div");
      el.className = "pz-gen pz-hojas";
      el.style.display = "none";
      el.innerHTML =
        '<div class="cab"><div class="tipos"><span class="titulo-gen">Hojas A4</span></div>' +
        '<button class="cerrar" title="Cerrar">✕</button></div>' +
        '<div class="opc">' +
        '<span>Orientación</span><div class="seg orientacion"><button data-o="v">Vertical</button><button data-o="h">Apaisada</button></div>' +
        '<span>Escala</span><div class="seg escala"></div>' +
        '<div class="nota nota-escala"></div>' +
        '<div class="grupo"><b>Márgenes (mm)</b></div>' +
        '<span>Arriba / abajo</span><div class="campos"><input data-m="sup" type="number" min="0" max="80">' +
        '<input data-m="inf" type="number" min="0" max="80"></div>' +
        '<span>Lomo / afuera</span><div class="campos"><input data-m="lomo" type="number" min="0" max="80">' +
        '<input data-m="ext" type="number" min="0" max="80"></div>' +
        '<label class="chk"><input type="checkbox" class="doble"> Doble faz (el lomo cambia de lado en las hojas pares)</label>' +
        '<label class="chk"><input type="checkbox" class="guias"> Mostrar márgenes</label>' +
        "</div>" +
        '<div class="botones"><button class="b principal agregar">Agregar hoja</button>' +
        '<button class="b insertar-hoja" title="Agrega una hoja vacía justo después de la seleccionada; las que siguen se corren un lugar">Insertar hoja después</button>' +
        '<button class="b todas" title="Pasa la escala, los márgenes y el doble faz a las hojas que ya están en la pizarra">Aplicar a todas</button>' +
        '<button class="b renumerar" title="Numera las hojas según su lugar: por filas, de arriba abajo y de izquierda a derecha">Renumerar</button>' +
        '<button class="b girar" title="Pasa las hojas seleccionadas de vertical a apaisada o al revés">Girar hoja</button>' +
        '<button class="b repartir" title="Corta lo seleccionado por renglones y pasa a las hojas siguientes lo que no entra">Repartir en hojas</button></div>' +
        '<div class="estado estado-hojas"></div>' +
        '<div class="lista"></div>' +
        '<div class="imprimir-sec"><div class="opc">' +
        '<div class="grupo"><b>Cabecera y pie de página</b></div>' +
        '<span>Alto (mm)</span><div class="campos"><input data-alto="cab" type="number" min="5" max="60" title="Cabecera">' +
        '<input data-alto="pie" type="number" min="5" max="60" title="Pie de página"></div>' +
        '<label class="chk"><input type="checkbox" class="portada"> Sin cabecera ni pie en la primera hoja (portada)</label>' +
        "</div>" +
        '<div class="botones"><button class="b bandas">Crear cabecera y pie</button>' +
        '<button class="b ver-bandas">Ir a cabecera y pie</button></div>' +
        '<div class="nota-bandas ayuda">Se dibujan con las herramientas de la pizarra y se repiten en todas las hojas. ' +
        "En sus textos, {n} es el número de hoja, {total} la cantidad de hojas y {titulo} el título de abajo. " +
        "El alto se cambia con «Aplicar a todas».</div>" +
        '<div class="estado estado-bandas"></div></div>' +
        '<div class="imprimir-sec"><div class="opc">' +
        '<span>Título</span><input type="text" class="titulo" placeholder="Nombre del PDF" spellcheck="false">' +
        '<label class="chk"><input type="checkbox" class="numerar"> Numerar las páginas (si no hay pie de página)</label>' +
        "</div>" +
        '<div class="botones"><button class="b principal imprimir" title="Abre el diálogo de impresión: ahí se imprime o se elige «Guardar como PDF»">Imprimir / PDF</button></div>' +
        '<div class="estado"></div></div>' +
        '<div class="ayuda">Cada hoja es un marco: lo que sueltes adentro se mueve con ella. ' +
        "La línea punteada marca el área útil; las guías no se imprimen. " +
        "Las hojas nuevas usan la orientación, la escala y los márgenes de este panel. " +
        "Si estás mirando una hoja, los generadores insertan en ella, debajo de lo que ya tiene. " +
        "Las hojas apaisadas se imprimen giradas, con su borde de arriba hacia el lomo. " +
        "Al imprimir, elegí papel A4, márgenes «Ninguno» y escala 100 %.</div>";
      document.body.appendChild(el);
      this.el = el;
      var self = this;

      var seg = el.querySelector(".escala");
      ESCALAS.forEach(function (e) {
        var b = document.createElement("button");
        b.textContent = e.texto;
        b.onclick = function () { op.impresion = e.v; guardar(); self.pintar(); };
        b.setAttribute("data-v", e.v);
        seg.appendChild(b);
      });
      [].forEach.call(el.querySelectorAll("[data-m]"), function (inp) {
        inp.oninput = function () {
          var v = parseFloat(inp.value.replace(",", "."));
          var ok = isFinite(v) && v >= 0 && v <= 80;
          inp.classList.toggle("invalido", !ok);
          if (ok) { op.margenes[inp.getAttribute("data-m")] = v; guardar(); }
        };
      });
      el.querySelector(".doble").onchange = function () { op.dobleFaz = this.checked; guardar(); };
      el.querySelector(".guias").onchange = function () { op.guias = this.checked; guardar(); };
      el.querySelector(".cerrar").onclick = function () { self.alternar(false); };
      el.querySelector(".agregar").onclick = agregarHoja;
      el.querySelector(".todas").onclick = aplicarATodas;
      el.querySelector(".renumerar").onclick = renumerar;
      var estadoHojas = el.querySelector(".estado-hojas");
      function avisarHojas(texto, mal) {
        estadoHojas.textContent = texto;
        estadoHojas.classList.toggle("mal", !!mal);
      }
      el.querySelector(".girar").onclick = function () { girar(avisarHojas); };
      el.querySelector(".repartir").onclick = function () { repartir(avisarHojas); };
      el.querySelector(".insertar-hoja").onclick = function () { insertarDespues(avisarHojas); };
      [].forEach.call(el.querySelectorAll(".orientacion button"), function (b) {
        b.onclick = function () { op.apaisada = b.getAttribute("data-o") === "h"; guardar(); self.pintar(); };
      });
      el.querySelector(".titulo").oninput = function () {
        op.titulo = this.value; guardar();
        var A = api();
        if (A) fantasmas.programar(A.getSceneElementsIncludingDeleted()); // {titulo} en la cabecera
      };
      var estadoBandas = el.querySelector(".estado-bandas");
      function avisarBandas(texto, mal) {
        estadoBandas.textContent = texto;
        estadoBandas.classList.toggle("mal", !!mal);
      }
      el.querySelector(".bandas").onclick = function () { crearBandas(avisarBandas); };
      el.querySelector(".ver-bandas").onclick = function () { verBandas(avisarBandas); };
      el.querySelector(".portada").onchange = function () { op.sinPortada = this.checked; guardar(); ponerPortada(); };
      [].forEach.call(el.querySelectorAll("[data-alto]"), function (inp) {
        inp.oninput = function () {
          var v = parseFloat(inp.value.replace(",", "."));
          var ok = isFinite(v) && v >= 5 && v <= 60;
          inp.classList.toggle("invalido", !ok);
          if (ok) { op.alto[inp.getAttribute("data-alto")] = v; guardar(); }
        };
      });
      el.querySelector(".numerar").onchange = function () { op.numerar = this.checked; guardar(); };
      var estado = el.querySelector(".estado");
      el.querySelector(".imprimir").onclick = function () {
        imprimir(function (texto, mal) {
          estado.textContent = texto;
          estado.classList.toggle("mal", !!mal);
        });
      };
      ["keydown", "keyup", "wheel", "paste", "copy", "cut"].forEach(function (ev) {
        el.addEventListener(ev, function (e) { e.stopPropagation(); });
      });
      this.pintar();
    },
    pintar: function () {
      var el = this.el;
      [].forEach.call(el.querySelectorAll(".escala button"), function (b) {
        b.classList.toggle("activo", +b.getAttribute("data-v") === op.impresion);
      });
      var e = ESCALAS.filter(function (x) { return x.v === op.impresion; })[0];
      el.querySelector(".nota-escala").textContent = "Al imprimir, " + e.nota + ".";
      [].forEach.call(el.querySelectorAll("[data-m]"), function (inp) {
        inp.value = op.margenes[inp.getAttribute("data-m")];
        inp.classList.remove("invalido");
      });
      [].forEach.call(el.querySelectorAll(".orientacion button"), function (b) {
        b.classList.toggle("activo", (b.getAttribute("data-o") === "h") === op.apaisada);
      });
      el.querySelector(".doble").checked = op.dobleFaz;
      el.querySelector(".guias").checked = op.guias;
      el.querySelector(".numerar").checked = op.numerar;
      el.querySelector(".portada").checked = op.sinPortada;
      [].forEach.call(el.querySelectorAll("[data-alto]"), function (inp) {
        inp.value = op.alto[inp.getAttribute("data-alto")];
        inp.classList.remove("invalido");
      });
      el.querySelector(".titulo").value = op.titulo;
    },
    // resumen de las hojas y de lo que se sale de cada una
    lista: function () {
      if (!this.abierto) return;
      var cont = this.el.querySelector(".lista"), rev = capa.revision;
      cont.innerHTML = "";
      if (!rev.length) { cont.textContent = "Todavía no hay hojas en la pizarra."; return; }
      var malas = rev.filter(function (r) { return r.fuera.length; });
      var tit = document.createElement("div");
      tit.textContent = (rev.length === 1 ? "1 hoja" : rev.length + " hojas") +
        (malas.length ? "." : ": todo dentro del área útil.");
      cont.appendChild(tit);
      malas.forEach(function (r) {
        var d = document.createElement("div");
        d.className = "mal";
        d.textContent = r.hoja.name + ": " + (r.fuera.length === 1 ? "1 elemento" : r.fuera.length + " elementos") +
          " fuera del área útil.";
        var b = document.createElement("button");
        b.className = "enlace";
        b.textContent = "Ver";
        b.onclick = function () { verProblemas(r); };
        d.appendChild(b);
        cont.appendChild(d);
      });
    },
    alternar: function (abrir) {
      this.abierto = abrir === undefined ? !this.abierto : abrir;
      this.el.style.display = this.abierto ? "" : "none";
      if (this.abierto) {
        var A = api();
        if (A) this.el.classList.toggle("oscuro", A.getAppState().theme === "dark");
        this.pintar();
        this.lista();
      }
    },
  };

  // ------------------------------------------- el contenido sigue a su hoja
  // Al arrastrar un marco, Excalidraw mueve su contenido; pero otras acciones
  // (alinear y distribuir con Ctrl+Shift+flechas, por ejemplo) mueven solo los
  // elementos seleccionados y el contenido quedaba en su lugar. Se recuerda
  // donde estaba cada elemento: si una hoja (o la cabecera o el pie) se movio
  // sin cambiar de tamano y lo suyo se quedo quieto, se mueve lo mismo. Lo
  // suyo es lo enganchado a su marco y lo suelto cuyo centro estaba en ella.
  // No queda como un paso aparte del historial: al deshacer, la hoja vuelve y
  // su contenido la sigue de nuevo.
  var seguidor = {
    pos: null,
    foto: function (todos) {
      var p = {};
      todos.forEach(function (e) {
        if (!e.isDeleted) p[e.id] = { x: e.x, y: e.y, w: e.width, h: e.height, frameId: e.frameId };
      });
      this.pos = p;
    },
    revisar: function (A, todos) {
      var prev = this.pos;
      if (!prev) { this.foto(todos); return false; }
      var mover = {}, hay = false;
      todos.forEach(function (f) {
        if (!esHoja(f) && !esBanda(f)) return;
        var p = prev[f.id];
        if (!p || p.w !== f.width || p.h !== f.height) return;
        var dx = f.x - p.x, dy = f.y - p.y;
        if (!dx && !dy) return;
        var antes = { x: p.x, y: p.y, width: p.w, height: p.h };
        todos.forEach(function (e) {
          if (e.isDeleted || e.type === "frame" || e.type === "magicframe" || mover[e.id]) return;
          var q = prev[e.id];
          if (!q || q.x !== e.x || q.y !== e.y) return; // nuevo, o ya se movio
          var suyo;
          if (e.frameId) suyo = e.frameId === f.id;
          else {
            var c = caja(e);
            suyo = !q.frameId && adentro(antes, (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2);
          }
          if (suyo) { mover[e.id] = [dx, dy]; hay = true; }
        });
      });
      if (!hay) { this.foto(todos); return false; }
      var nuevos = A.getSceneElementsIncludingDeleted().map(function (e) {
        var d = mover[e.id];
        return d ? modificado(e, { x: e.x + d[0], y: e.y + d[1] }) : e;
      });
      A.updateScene({ elements: nuevos, captureUpdate: "NEVER" });
      this.foto(nuevos);
      return true;
    },
  };

  // ----------------------------------------------------------------- inicio
  function iniciar() {
    panel.construir();
    capa.crear();
    window.__pizarraHojas = {
      abrir: function () { panel.alternar(true); },
      cerrar: function () { if (panel.abierto) panel.alternar(false); },
      lugarPara: lugarPara,
      // para solucionario.js: crear hojas con los margenes del panel y saber su area util
      marco: marco, areaUtil: areaUtil, hojasDe: hojasDe, bandasDe: bandasDe, nuevasBandas: nuevasBandas,
      separacion: function () { return 15 * PX_MM / op.impresion; },
    };
    var espera = setInterval(function () {
      var A = api();
      if (!A || !A.onChange) return;
      clearInterval(espera);
      var ultimos = null, pendiente = false;
      function revisarSiCambio() {
        pendiente = false;
        var todos = A.getSceneElementsIncludingDeleted();
        if (todos === ultimos) return;
        ultimos = todos;
        if (seguidor.revisar(A, todos)) return; // movio contenido: vuelve a entrar con la escena nueva
        capa.actualizar(todos);
        panel.lista();
      }
      var tema = A.getAppState().theme;
      A.onChange(function () {
        var t = A.getAppState().theme;
        if (panel.abierto) panel.el.classList.toggle("oscuro", t === "dark");
        // la cabecera y el pie tenues se dibujan con los colores del tema
        if (t !== tema) { tema = t; fantasmas.programar(A.getSceneElementsIncludingDeleted()); }
        // con un temporizador y no requestAnimationFrame: asi tambien sigue el
        // contenido en una ventana que no esta a la vista
        if (!pendiente) { pendiente = true; setTimeout(revisarSiCambio, 16); }
      });
      revisarSiCambio();
      (function bucle() { capa.dibujar(); requestAnimationFrame(bucle); })();
    }, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
