// Opciones de la imagen seleccionada: al seleccionar una imagen (o varias copias de
// la misma imagen) aparece una barra debajo de la seleccion con:
//  - «Ver copias»: une con lineas todas las copias de esa imagen (los elementos que
//    usan el mismo archivo). Las lineas NO son elementos: se dibujan en una capa
//    encima del lienzo (como las guias de hojas.js), asi que no se guardan, no se
//    sincronizan y no se exportan.
//  - «Información»: peso del archivo de la imagen, cuanto ocupa en el archivo
//    guardado, tamaño original, cantidad de copias, etc.
//  - «Comprimir»: comprime el archivo de la imagen y pasa TODAS sus copias al
//    archivo comprimido (window.__pizarraComprimirArchivo, de compresion.js).
//  - «Calcar»: convierte la imagen en trazos de la pizarra, sin internet
//    (window.__pizarraCalcado, de calcado.js), con vista previa y ajustes.
// La barra se esconde mientras se arrastra, se cambia el tamaño, se recorta, etc.
// Usa window.__pizarraAPI (expuesta por el bundle).
(function () {
  "use strict";

  function api() { return window.__pizarraAPI; }

  var ESTILO =
    "#pz-imagen{position:fixed;z-index:15;display:none;flex-direction:column;gap:6px;align-items:center;" +
    "font:13px/1.4 Assistant,system-ui,sans-serif;pointer-events:none}" +
    "#pz-imagen .barra,#pz-imagen .info{pointer-events:auto;background:#fff;color:#1b1b1f;" +
    "border:1px solid #e0dfe6;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.12)}" +
    "#pz-imagen .barra{display:flex;gap:2px;padding:3px}" +
    "#pz-imagen button{font:inherit;color:inherit;background:none;border:0;border-radius:6px;" +
    "padding:4px 9px;cursor:pointer;white-space:nowrap}" +
    "#pz-imagen button:hover{background:#f1f0ff}" +
    "#pz-imagen button.activo{background:#e0dfff;color:#3f3ca8}" +
    "#pz-imagen button:disabled{opacity:.5;cursor:default;background:none}" +
    "#pz-imagen .info{display:none;padding:8px 12px;min-width:240px}" +
    "#pz-imagen .info table{border-collapse:collapse}" +
    "#pz-imagen .info td{padding:1px 0;vertical-align:top}" +
    "#pz-imagen .info td:first-child{opacity:.7;padding-right:12px;white-space:nowrap}" +
    "#pz-imagen .info .nota{font-size:12px;opacity:.7;margin-top:4px;max-width:300px}" +
    "#pz-imagen .calco{display:none;pointer-events:auto;background:#fff;color:#1b1b1f;border:1px solid #e0dfe6;" +
    "border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.12);padding:8px 10px;width:300px;box-sizing:border-box}" +
    "#pz-imagen .calco canvas{display:block;width:100%;border:1px solid #e0dfe6;border-radius:6px;box-sizing:border-box}" +
    "#pz-imagen .calco .estado{font-size:12px;opacity:.75;margin:4px 0 6px;min-height:17px}" +
    "#pz-imagen .calco .estado.mal{opacity:1;color:#c92a2a}" +
    "#pz-imagen .calco label{display:flex;align-items:center;gap:8px;margin:3px 0}" +
    "#pz-imagen .calco label span{width:82px;flex:none}" +
    "#pz-imagen .calco input[type=range]{flex:1;min-width:0;accent-color:#6965db}" +
    "#pz-imagen .calco input[type=checkbox]{margin:0 2px;accent-color:#6965db}" +
    "#pz-imagen .calco .hacer{display:block;width:100%;margin-top:6px;background:#6965db;color:#fff;padding:6px}" +
    "#pz-imagen .calco .hacer:hover{background:#5b57d1}" +
    "#pz-imagen .calco .hacer:disabled{background:#6965db}" +
    "#pz-imagen.oscuro .calco canvas{filter:invert(93%) hue-rotate(180deg);border-color:#3a3a43}" +
    "#pz-imagen.oscuro .barra,#pz-imagen.oscuro .info,#pz-imagen.oscuro .calco{background:#232329;color:#e3e3e8;border-color:#3a3a43}" +
    "#pz-imagen.oscuro button:hover{background:#31303b}" +
    "#pz-imagen.oscuro button.activo{background:#403e6a;color:#d0ceff}";

  // ---------------------------------------------------------------- utilidades
  function bytesDeDataURL(dataURL) {
    var i = dataURL.indexOf(",");
    var datos = dataURL.slice(i + 1);
    if (!/;base64/.test(dataURL.slice(0, i))) return decodeURIComponent(datos).length;
    return Math.floor((datos.length * 3) / 4) - (/==$/.test(datos) ? 2 : /=$/.test(datos) ? 1 : 0);
  }

  function peso(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
    return (n / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
  }

  var NOMBRES = {
    "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP", "image/gif": "GIF",
    "image/svg+xml": "SVG", "image/bmp": "BMP", "image/avif": "AVIF", "image/x-icon": "ICO",
  };

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // esquinas de un elemento en coordenadas de la pizarra (con su rotacion)
  function esquinas(e) {
    var cx = e.x + e.width / 2, cy = e.y + e.height / 2;
    var c = Math.cos(e.angle || 0), s = Math.sin(e.angle || 0);
    return [[e.x, e.y], [e.x + e.width, e.y], [e.x + e.width, e.y + e.height], [e.x, e.y + e.height]]
      .map(function (p) {
        var dx = p[0] - cx, dy = p[1] - cy;
        return [cx + dx * c - dy * s, cy + dx * s + dy * c];
      });
  }

  // La seleccion sirve si son solo imagenes y todas usan el mismo archivo.
  function seleccionDeImagen(A) {
    var sel = A.getAppState().selectedElementIds || {};
    var elegidas = A.getSceneElements().filter(function (e) { return sel[e.id]; });
    if (!elegidas.length) return null;
    var fileId = elegidas[0].fileId;
    for (var i = 0; i < elegidas.length; i++) {
      if (elegidas[i].type !== "image" || !elegidas[i].fileId || elegidas[i].fileId !== fileId) return null;
    }
    return { fileId: fileId, elementos: elegidas };
  }

  function copiasDe(A, fileId) {
    return A.getSceneElements().filter(function (e) { return e.type === "image" && e.fileId === fileId; });
  }

  // Mientras se arrastra, se cambia el tamaño, se recorta, etc., la barra molesta.
  function ocupado(st) {
    return st.cursorButton === "down" || st.isResizing || st.isRotating || st.isCropping ||
      st.selectedElementsAreBeingDragged || st.editingTextElement || st.newElement ||
      st.contextMenu || st.openDialog || st.openMenu || st.openPopup ||
      (st.activeTool && st.activeTool.type !== "selection" && st.activeTool.type !== "lasso");
  }

  // tamaño en pixeles de cada archivo (se calcula una vez)
  var dimensiones = {};
  function medir(fileId, dataURL, listo) {
    if (dimensiones[fileId]) return dimensiones[fileId];
    dimensiones[fileId] = { cargando: true };
    var img = new Image();
    img.onload = function () { dimensiones[fileId] = { w: img.naturalWidth, h: img.naturalHeight }; listo(); };
    img.onerror = function () { dimensiones[fileId] = { error: true }; listo(); };
    img.src = dataURL;
    return dimensiones[fileId];
  }

  // ---------------------------------------------------------------- estado
  var estado = {
    fileId: null, claveSel: "", verCopias: false, info: false, calcar: false, comprimiendo: false,
    sel: null,          // { fileId, elementos } o null
    copias: [],         // elementos que usan el mismo archivo que la seleccion
    version: 0,         // cambia con cada escena nueva (para redibujar)
  };

  // ---------------------------------------------------------------- barra
  var barra = {
    el: null, bVer: null, bInfo: null, bComp: null, bCalc: null, elInfo: null, firmaInfo: "", firma: "",
    crear: function () {
      var css = document.createElement("style");
      css.textContent = ESTILO;
      document.head.appendChild(css);
      var el = document.createElement("div");
      el.id = "pz-imagen";
      el.innerHTML =
        '<div class="barra">' +
        '<button class="ver" title="Une con líneas todas las copias de esta imagen (las líneas no se guardan)">Ver copias</button>' +
        '<button class="inf" title="Peso y datos de la imagen">Información</button>' +
        '<button class="comp" title="Comprime el archivo de la imagen; cambian todas sus copias. Ctrl+Z lo deshace">Comprimir</button>' +
        '<button class="calc" title="Convierte la imagen en trazos de la pizarra (sin internet)">Calcar</button>' +
        "</div>" +
        '<div class="info"></div>' +
        '<div class="calco">' +
        "<canvas></canvas>" +
        '<div class="estado"></div>' +
        '<label title="Más sensibilidad: toma como tinta también los trazos claros"><span>Sensibilidad</span>' +
        '<input type="range" class="sens" min="-50" max="50" step="5"></label>' +
        '<label title="Más detalle: se analiza la imagen a mayor resolución (más trazos, más lento)"><span>Detalle</span>' +
        '<input type="range" class="det" min="1" max="5" step="1"></label>' +
        '<label title="Más suavizado: menos puntos por trazo, curvas más limpias"><span>Suavizado</span>' +
        '<input type="range" class="suav" min="0" max="4" step="1"></label>' +
        '<label><input type="checkbox" class="col"> Mantener los colores</label>' +
        '<label title="El calco va en el lugar de la imagen y la imagen se borra (Ctrl+Z lo deshace)">' +
        '<input type="checkbox" class="reemp"> Reemplazar la imagen</label>' +
        '<button class="hacer">Calcar</button>' +
        "</div>";
      document.body.appendChild(el);
      this.el = el;
      this.bVer = el.querySelector(".ver");
      this.bInfo = el.querySelector(".inf");
      this.bComp = el.querySelector(".comp");
      this.elInfo = el.querySelector(".info");
      this.bCalc = el.querySelector(".calc");
      calco.crear(el.querySelector(".calco"));
      var self = this;
      // que los clics en la barra no lleguen al lienzo (y no deseleccionen), y que
      // las teclas en los controles (flechas, etc.) no muevan la imagen
      el.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
      el.addEventListener("keydown", function (ev) { if (ev.key !== "Escape") ev.stopPropagation(); });
      this.bCalc.onclick = function () { estado.calcar = !estado.calcar; if (estado.calcar) estado.info = false; self.refrescar(); };
      this.bVer.onclick = function () { estado.verCopias = !estado.verCopias; capa.firma = ""; self.pintar(); };
      this.bInfo.onclick = function () { estado.info = !estado.info; if (estado.info) estado.calcar = false; self.refrescar(); };
      this.bComp.onclick = async function () {
        if (!estado.sel || estado.comprimiendo || !window.__pizarraComprimirArchivo) return;
        estado.comprimiendo = true;
        self.pintar();
        try {
          await window.__pizarraComprimirArchivo(estado.sel.fileId);
        } finally {
          estado.comprimiendo = false;
          self.refrescar();
        }
      };
    },

    // vuelve a armar la barra y la informacion aunque no haya cambiado nada visible
    refrescar: function () { this.firma = ""; this.firmaInfo = ""; this.pintar(); },

    pintar: function () {
      var A = api();
      if (!A || !this.el) return;
      var st = A.getAppState(), s = estado.sel;
      var visible = s && !ocupado(st);
      var firma = visible ? [st.scrollX, st.scrollY, st.zoom.value, st.offsetLeft, st.offsetTop, st.theme,
        st.viewModeEnabled, window.innerWidth, window.innerHeight, estado.version, estado.claveSel,
        estado.verCopias, estado.info, estado.calcar, estado.comprimiendo, this.firmaInfo].join("|") : "oculta";
      if (firma === this.firma) return;
      this.firma = firma;
      if (!visible) { this.el.style.display = "none"; return; }
      var n = estado.copias.length;
      this.el.classList.toggle("oscuro", st.theme === "dark");
      this.bVer.textContent = n > 1 ? "Ver copias (" + n + ")" : "Ver copias";
      this.bVer.disabled = n < 2;
      this.bVer.title = n < 2 ? "Esta imagen no tiene copias en la pizarra"
        : "Une con líneas las " + n + " copias de esta imagen (las líneas no se guardan)";
      this.bVer.classList.toggle("activo", estado.verCopias && n > 1);
      this.bInfo.classList.toggle("activo", estado.info);
      this.bComp.style.display = st.viewModeEnabled || !window.__pizarraComprimirArchivo ? "none" : "";
      this.bComp.disabled = estado.comprimiendo;
      this.bComp.textContent = estado.comprimiendo ? "Comprimiendo…" : "Comprimir";
      var calcar = !st.viewModeEnabled && !!window.__pizarraCalcado;
      this.bCalc.style.display = calcar ? "" : "none";
      this.bCalc.classList.toggle("activo", estado.calcar && calcar);
      this.elInfo.style.display = estado.info ? "block" : "none";
      if (estado.info) this.pintarInfo(A, s, n);
      calco.el.style.display = estado.calcar && calcar ? "block" : "none";
      if (estado.calcar && calcar) calco.revisar(A, s);
      this.el.style.display = "flex";
      this.ubicar(A, st, s);
    },

    pintarInfo: function (A, s, n) {
      var f = A.getFiles()[s.fileId];
      var e = s.elementos[0];
      var dim = f ? medir(s.fileId, f.dataURL, function () { barra.refrescar(); }) : null;
      var firma = [s.fileId, n, s.elementos.length, Math.round(e.width), Math.round(e.height), !!e.crop,
        f ? f.dataURL.length : 0, dim && dim.w].join("|");
      if (firma === this.firmaInfo) return;
      this.firmaInfo = firma;
      if (!f || !f.dataURL) {
        this.elInfo.innerHTML = "La imagen todavía no se cargó.";
        return;
      }
      var bytes = bytesDeDataURL(f.dataURL);
      var filas = [
        ["Peso de la imagen", "<b>" + peso(bytes) + "</b> (" + esc(NOMBRES[f.mimeType] || f.mimeType || "?") + ")"],
        ["En el archivo guardado", "≈ " + peso(f.dataURL.length) + " (como texto base64)"],
        ["Tamaño original", dim && dim.w ? dim.w + " × " + dim.h + " px" : dim && dim.error ? "no se pudo leer" : "…"],
        ["Se muestra a", Math.round(Math.abs(e.width)) + " × " + Math.round(Math.abs(e.height)) +
          (e.crop ? " (recortada)" : "") + (s.elementos.length > 1 ? " (la primera seleccionada)" : "")],
        ["Copias en la pizarra", n + (s.elementos.length > 1 ? " (" + s.elementos.length + " seleccionadas)" : "")],
      ];
      if (f.created) filas.push(["Agregada", esc(new Date(f.created).toLocaleString())]);
      this.elInfo.innerHTML = "<table>" + filas.map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      }).join("") + "</table>" +
        (n > 1 ? '<div class="nota">El archivo de la imagen se guarda una sola vez, aunque tenga varias copias.</div>' : "");
    },

    // debajo de la seleccion, centrada; si no entra, arriba
    ubicar: function (A, st, s) {
      var z = st.zoom.value;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      s.elementos.forEach(function (e) {
        esquinas(e).forEach(function (p) {
          x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
        });
      });
      function X(x) { return (x + st.scrollX) * z + st.offsetLeft; }
      function Y(y) { return (y + st.scrollY) * z + st.offsetTop; }
      var w = this.el.offsetWidth, h = this.el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      var izq = (X(x0) + X(x1)) / 2 - w / 2;
      var arr = Y(y1) + 18;
      if (arr + h > vh - 8) {
        var arriba = Y(y0) - 40 - h; // por encima del controlador de rotacion
        arr = arriba >= 8 ? arriba : vh - 8 - h;
      }
      izq = Math.max(8, Math.min(vw - 8 - w, izq));
      arr = Math.max(8, arr);
      // sin tapar el panel de propiedades ni sus ventanitas: se corre a la derecha
      [].forEach.call(document.querySelectorAll(".App-menu_top__left,[data-radix-popper-content-wrapper]"), function (o) {
        if (o.contains(barra.el)) return;
        var r = o.getBoundingClientRect();
        if (!r.width || r.left > vw / 2) return;
        if (izq < r.right + 8 && izq + w > r.left && arr < r.bottom && arr + h > r.top && r.right + 8 + w <= vw - 8) {
          izq = r.right + 8;
        }
      });
      this.el.style.left = Math.round(izq) + "px";
      this.el.style.top = Math.round(arr) + "px";
    },
  };

  // ---------------------------------------------------------------- calcado
  // ajustes del calco (se recuerdan mientras la pizarra esta abierta)
  var opCalco = { sensibilidad: 0, detalle: 3, suavizado: 2, colores: true, reemplazar: false };

  var calco = {
    el: null, lienzo: null, elEstado: null, bHacer: null,
    clave: "", turno: 0, res: null, elementoId: null, temporizador: null,
    crear: function (el) {
      this.el = el;
      this.lienzo = el.querySelector("canvas");
      this.elEstado = el.querySelector(".estado");
      this.bHacer = el.querySelector(".hacer");
      var self = this;
      [["sens", "sensibilidad"], ["det", "detalle"], ["suav", "suavizado"]].forEach(function (par) {
        var input = el.querySelector("." + par[0]);
        input.value = opCalco[par[1]];
        input.oninput = function () { opCalco[par[1]] = Number(input.value); barra.refrescar(); };
      });
      [["col", "colores"], ["reemp", "reemplazar"]].forEach(function (par) {
        var input = el.querySelector("." + par[0]);
        input.checked = opCalco[par[1]];
        input.onchange = function () { opCalco[par[1]] = input.checked; barra.refrescar(); };
      });
      this.bHacer.onclick = function () { self.hacer(); };
    },

    aviso: function (texto, mal) {
      this.elEstado.textContent = texto;
      this.elEstado.classList.toggle("mal", !!mal);
    },

    // vuelve a analizar la imagen si cambio algo (la imagen, su recorte o los ajustes)
    revisar: function (A, s) {
      var e = s.elementos[0], f = A.getFiles()[s.fileId];
      if (!f || !f.dataURL) {
        this.clave = ""; this.res = null;
        this.aviso("La imagen todavía no se cargó.");
        this.boton();
        return;
      }
      var cr = e.crop;
      var clave = [e.id, s.fileId, f.dataURL.length, Math.round(e.width), Math.round(e.height),
        cr ? [cr.x, cr.y, cr.width, cr.height].join(",") : "", opCalco.sensibilidad, opCalco.detalle,
        opCalco.suavizado, opCalco.colores].join("|");
      if (clave === this.clave) { this.boton(); return; }
      this.clave = clave;
      this.res = null;
      this.boton();
      var turno = ++this.turno, self = this;
      // el lienzo de la vista previa toma la forma de la imagen
      var dpr = window.devicePixelRatio || 1, W = 278;
      var H = Math.max(60, Math.min(220, Math.round((W * Math.abs(e.height)) / Math.max(1, Math.abs(e.width)))));
      if (this.lienzo.width !== Math.round(W * dpr) || this.lienzo.height !== Math.round(H * dpr)) {
        this.lienzo.width = Math.round(W * dpr);
        this.lienzo.height = Math.round(H * dpr);
        this.lienzo.style.height = H + "px";
      }
      this.aviso("Calculando…");
      clearTimeout(this.temporizador);
      this.temporizador = setTimeout(function () {
        window.__pizarraCalcado.analizar(e, f, opCalco).then(function (res) {
          if (turno !== self.turno) return;
          self.res = res;
          self.elementoId = e.id;
          window.__pizarraCalcado.dibujarVista(self.lienzo, res);
          var n = res.trazos.length;
          if (!n) self.aviso("No se encontraron trazos. Probá con más sensibilidad.", true);
          else if (res.demasiados) self.aviso(n + " trazos: son demasiados. Bajá el detalle o la sensibilidad.", true);
          else self.aviso(n === 1 ? "1 trazo" : n + " trazos");
          self.boton();
          barra.refrescar();
        }).catch(function (err) {
          if (turno !== self.turno) return;
          self.aviso(err && err.message ? err.message : "No se pudo calcar la imagen.", true);
        });
      }, 150);
    },

    boton: function () {
      this.bHacer.disabled = !this.res || !this.res.trazos.length || this.res.demasiados;
      this.bHacer.textContent = opCalco.reemplazar ? "Calcar y reemplazar la imagen" : "Calcar al lado de la imagen";
    },

    hacer: function () {
      var A = api(), res = this.res, id = this.elementoId;
      if (!A || !res || res.demasiados) return;
      var el = A.getSceneElements().filter(function (e) { return e.id === id; })[0];
      if (!el) return;
      window.__pizarraCalcado.insertar(A, el, res, opCalco);
      estado.calcar = false;
      this.clave = "";
    },
  };

  // ---------------------------------------------------------------- lineas
  var capa = {
    lienzo: null, ctx: null, firma: "",
    crear: function () {
      var c = document.createElement("canvas");
      c.id = "pz-copias";
      c.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:3";
      document.body.appendChild(c);
      this.lienzo = c;
      this.ctx = c.getContext("2d");
    },
    dibujar: function () {
      var A = api();
      if (!A) return;
      var st = A.getAppState(), z = st.zoom.value, dpr = window.devicePixelRatio || 1;
      var w = window.innerWidth, h = window.innerHeight;
      var s = estado.verCopias ? estado.sel : null;
      var firma = s ? [st.scrollX, st.scrollY, z, st.offsetLeft, st.offsetTop, w, h, dpr, st.theme,
        estado.version, s.fileId].join("|") : "nada";
      if (firma === this.firma) return;
      this.firma = firma;
      var c = this.lienzo, ctx = this.ctx;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        c.style.width = w + "px"; c.style.height = h + "px";
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      if (!s) return;
      var copias = estado.copias;
      if (copias.length < 2) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      function X(x) { return (x + st.scrollX) * z + st.offsetLeft; }
      function Y(y) { return (y + st.scrollY) * z + st.offsetTop; }
      function centro(e) { return [X(e.x + e.width / 2), Y(e.y + e.height / 2)]; }
      var oscuro = st.theme === "dark";
      var color = oscuro ? "#a8a5ff" : "#6965db";
      var origen = s.elementos[0], o = centro(origen);

      // lineas desde la copia seleccionada hasta cada una de las otras
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      copias.forEach(function (e) {
        if (e.id === origen.id) return;
        var p = centro(e);
        ctx.moveTo(o[0], o[1]);
        ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();

      // contorno de cada copia
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      copias.forEach(function (e) {
        var q = esquinas(e);
        ctx.beginPath();
        q.forEach(function (p, i) { (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(p[0]), Y(p[1])); });
        ctx.closePath();
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // puntos en los centros
      ctx.fillStyle = color;
      copias.forEach(function (e) {
        var p = centro(e);
        ctx.beginPath();
        ctx.arc(p[0], p[1], e.id === origen.id ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    },
  };

  // ---------------------------------------------------------------- inicio
  function actualizarSeleccion(A) {
    var s = seleccionDeImagen(A);
    var clave = s ? s.elementos.map(function (e) { return e.id; }).sort().join(",") : "";
    // se mantienen las opciones abiertas mientras sea la misma imagen (o la misma
    // seleccion, por ejemplo despues de comprimir, que cambia el archivo)
    if (!s || (s.fileId !== estado.fileId && clave !== estado.claveSel)) {
      estado.verCopias = false;
      estado.info = false;
      estado.calcar = false;
    }
    estado.sel = s;
    estado.copias = s ? copiasDe(A, s.fileId) : [];
    estado.fileId = s ? s.fileId : null;
    estado.claveSel = clave;
  }

  function iniciar() {
    barra.crear();
    capa.crear();
    var espera = setInterval(function () {
      var A = api();
      if (!A || !A.onChange) return;
      clearInterval(espera);
      var ultimos = null, ultimaSel = null, pendiente = false;
      function pintarTodo() { pendiente = false; barra.pintar(); capa.dibujar(); }
      A.onChange(function () {
        // con un temporizador ademas de requestAnimationFrame: asi tambien se
        // actualiza en una ventana que no esta a la vista (ahi se frena rAF)
        if (!pendiente) { pendiente = true; setTimeout(pintarTodo, 16); }
        var todos = A.getSceneElementsIncludingDeleted(), sel = A.getAppState().selectedElementIds;
        if (todos === ultimos && sel === ultimaSel) return;
        if (todos !== ultimos) estado.version++;
        ultimos = todos;
        ultimaSel = sel;
        actualizarSeleccion(A);
      });
      actualizarSeleccion(A);
      (function bucle() { barra.pintar(); capa.dibujar(); requestAnimationFrame(bucle); })();
    }, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
