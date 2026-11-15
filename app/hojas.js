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

  // area util de una hoja, en coordenadas de la pizarra
  function areaUtil(f) {
    var d = datosHoja(f), m = d.margenes || DEFECTO.margenes, u = porMm(f);
    var lomoDerecha = d.dobleFaz && d.n % 2 === 0;
    var izq = lomoDerecha ? m.ext : m.lomo, der = lomoDerecha ? m.lomo : m.ext;
    return {
      x0: f.x + izq * u, y0: f.y + m.sup * u,
      x1: f.x + f.width - der * u, y1: f.y + f.height - m.inf * u,
      lomoDerecha: lomoDerecha,
    };
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

  // Para cada hoja: los elementos que la tocan (o que estan en su marco) y se
  // salen del area util. Un elemento metido en el marco de otra hoja no cuenta.
  function revisar(todos) {
    var hojas = hojasDe(todos), ids = {};
    hojas.forEach(function (f) { ids[f.id] = true; });
    var vivos = todos.filter(function (e) {
      return !e.isDeleted && e.type !== "frame" && e.type !== "magicframe";
    });
    return hojas.map(function (f) {
      var borde = { x0: f.x, y0: f.y, x1: f.x + f.width, y1: f.y + f.height };
      var util = areaUtil(f), eps = 0.5, fuera = [];
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
  function marco(x, y, n) {
    var ahora = Date.now(), u = PX_MM / op.impresion;
    return {
      id: nuevoId(), type: "frame", name: "Hoja " + n,
      x: x, y: y, width: A4.w * u, height: A4.h * u, angle: 0,
      strokeColor: "#bbb", backgroundColor: "transparent", fillStyle: "solid",
      strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100,
      groupIds: [], frameId: null, index: null, roundness: null,
      seed: rnd(), version: 1, versionNonce: rnd(), isDeleted: false,
      boundElements: null, updated: ahora, created: ahora, link: null, locked: false,
      customData: { pizarraHoja: { n: n, margenes: copiar(op.margenes), dobleFaz: op.dobleFaz } },
    };
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
    if (hojas.length) {
      var ult = hojas[hojas.length - 1];
      n = datosHoja(ult).n + 1;
      x = ult.x + ult.width + 15 * u; y = ult.y;
    } else {
      x = -st.scrollX + st.width / z / 2 - A4.w * u / 2;
      y = -st.scrollY + st.height / z / 2 - A4.h * u / 2;
      // la primera hoja no se encima a lo que ya hay: se corre a la derecha
      var ocupados = todos.filter(function (e) { return !e.isDeleted; }).map(caja);
      for (var vuelta = 0; vuelta < 50; vuelta++) {
        var b = { x0: x, y0: y, x1: x + A4.w * u, y1: y + A4.h * u }, choque = null;
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

  // pasa los margenes, el doble faz y la escala del panel a todas las hojas
  function aplicarATodas() {
    var A = api();
    if (!A) return;
    var u = PX_MM / op.impresion;
    var todos = A.getSceneElementsIncludingDeleted().map(function (e) {
      if (!esHoja(e)) return e;
      var d = copiar(datosHoja(e));
      d.margenes = copiar(op.margenes); d.dobleFaz = op.dobleFaz;
      var cd = {};
      for (var k in e.customData) cd[k] = e.customData[k];
      cd.pizarraHoja = d;
      return modificado(e, { customData: cd, width: A4.w * u, height: A4.h * u });
    });
    A.updateScene({ elements: todos, captureUpdate: "IMMEDIATELY" });
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
        svg.setAttribute("width", "210mm");
        svg.setAttribute("height", "297mm");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        var m = datosHoja(f).margenes || DEFECTO.margenes;
        paginas.push({ svg: svg.outerHTML, n: i + 1, inf: m.inf });
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
        ".num{position:absolute;left:0;right:0;text-align:center;font:10pt Assistant,Nunito,system-ui,sans-serif;color:#555}" +
        "</style></head><body>" +
        paginas.map(function (p) {
          var num = op.numerar
            ? "<div class='num' style='bottom:" + Math.max(4, p.inf / 2 - 2) + "mm'>" + p.n + "</div>" : "";
          return "<div class='hoja'>" + p.svg + num + "</div>";
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
      var rojo = "#e03131";
      this.revision.forEach(function (r) {
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
        ctx.strokeStyle = azul;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(ux0, uy0, ux1 - ux0, uy1 - uy0);
        ctx.setLineDash([]);
        // el lado del lomo: una linea mas marcada en el borde de la hoja
        var lx = u.lomoDerecha ? fx1 - 2 : fx0 + 2;
        ctx.strokeStyle = azul;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(lx, fy0); ctx.lineTo(lx, fy1); ctx.stroke();
        if (fy1 - fy0 > 160) {
          ctx.save();
          ctx.fillStyle = azul;
          ctx.font = "11px Assistant, system-ui, sans-serif";
          ctx.translate(u.lomoDerecha ? fx1 - 8 : fx0 + 8, (fy0 + fy1) / 2);
          ctx.rotate(u.lomoDerecha ? Math.PI / 2 : -Math.PI / 2);
          ctx.textAlign = "center";
          ctx.textBaseline = u.lomoDerecha ? "bottom" : "top";
          ctx.fillText("lomo", 0, u.lomoDerecha ? 0 : 0);
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
    },
  };

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
        '<button class="b todas" title="Pasa la escala, los márgenes y el doble faz a las hojas que ya están en la pizarra">Aplicar a todas</button>' +
        '<button class="b renumerar" title="Numera las hojas según su lugar: por filas, de arriba abajo y de izquierda a derecha">Renumerar</button></div>' +
        '<div class="lista"></div>' +
        '<div class="imprimir-sec"><div class="opc">' +
        '<span>Título</span><input type="text" class="titulo" placeholder="Nombre del PDF" spellcheck="false">' +
        '<label class="chk"><input type="checkbox" class="numerar"> Numerar las páginas</label>' +
        "</div>" +
        '<div class="botones"><button class="b principal imprimir" title="Abre el diálogo de impresión: ahí se imprime o se elige «Guardar como PDF»">Imprimir / PDF</button></div>' +
        '<div class="estado"></div></div>' +
        '<div class="ayuda">Cada hoja es un marco: lo que sueltes adentro se mueve con ella. ' +
        "La línea punteada marca el área útil; las guías no se imprimen. " +
        "Las hojas nuevas usan la escala y los márgenes de este panel. " +
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
      el.querySelector(".titulo").oninput = function () { op.titulo = this.value; guardar(); };
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
      el.querySelector(".doble").checked = op.dobleFaz;
      el.querySelector(".guias").checked = op.guias;
      el.querySelector(".numerar").checked = op.numerar;
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

  // ----------------------------------------------------------------- inicio
  function iniciar() {
    panel.construir();
    capa.crear();
    window.__pizarraHojas = {
      abrir: function () { panel.alternar(true); },
      cerrar: function () { if (panel.abierto) panel.alternar(false); },
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
        capa.actualizar(todos);
        panel.lista();
      }
      A.onChange(function () {
        if (panel.abierto) panel.el.classList.toggle("oscuro", A.getAppState().theme === "dark");
        if (!pendiente) { pendiente = true; requestAnimationFrame(revisarSiCambio); }
      });
      revisarSiCambio();
      (function bucle() { capa.dibujar(); requestAnimationFrame(bucle); })();
    }, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
