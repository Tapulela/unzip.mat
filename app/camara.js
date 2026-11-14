// Camara remota: desde la ventana de edicion se ve y se mueve la vista de la
// ventana que se proyecta a los estudiantes.
//  - Ventana proyectada: boton "Proyección" de la barra de herramientas (o
//    ?proyeccion en la URL). Informa su vista y obedece. Se recuerda en esa
//    pestaña al recargar. Solo una ventana por sala: activarla en otra la apaga aca.
//  - Ventana de edicion (cualquier otra): muestra un marco con lo que ve la
//    proyeccion. Arrastrar el borde o la etiqueta lo mueve; las esquinas cambian
//    el zoom. Doble clic en la etiqueta lleva tu vista hasta la camara. El boton
//    de arriba a la izquierda muestra el zoom de la camara y lo vuelve al 100%.
//  - ?sincamara en la URL desactiva todo en esa ventana.
// Usa window.__pizarraAPI (expuesta por el bundle) y el servidor local (Socket.IO).
(function () {
  var params = new URLSearchParams(location.search);
  if (params.has("sincamara")) return;
  // Sin servidor (hosting estático, ver entorno.js) no hay con quién sincronizar.
  if (window.PIZARRA_SIN_SERVIDOR) return;
  var CLAVE_ROL = "pizarra-proyeccion";
  var esProyeccion = params.has("proyeccion");
  try { if (sessionStorage.getItem(CLAVE_ROL) === "1") esProyeccion = true; } catch (e) {}
  var ZOOM_MIN = 0.1, ZOOM_MAX = 30;

  function api() { return window.__pizarraAPI; }
  function salaActual() {
    var m = location.hash.match(/room=([^,&]+)/);
    return m ? m[1] : null;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var socket = null, sala = null;

  function emitir(evento, datos) {
    if (socket && socket.connected && sala) socket.emit(evento, sala, datos);
  }

  function unirse() {
    var s = salaActual();
    if (!socket || !socket.connected || !s) return;
    if (s !== sala) {
      sala = s;
      socket.emit("camara-unirse", sala);
      if (esProyeccion) emitir("camara-rol", { proyeccion: true }), proyeccion.informar(true);
      else emitir("camara-pedir", {});
    }
  }

  // Cambia el rol de esta ventana (boton de la barra o aviso de otra ventana)
  function ponerProyeccion(activo, avisar) {
    esProyeccion = activo;
    try {
      if (activo) sessionStorage.setItem(CLAVE_ROL, "1");
      else sessionStorage.removeItem(CLAVE_ROL);
    } catch (e) {}
    edicion.rect = null;
    edicion.vistoEn = 0;
    if (avisar) emitir("camara-rol", { proyeccion: activo });
    if (activo) proyeccion.informar(true);
    else emitir("camara-pedir", {});
    boton.actualizar();
  }

  // ------------------------------------------------- boton en la barra superior
  var ICONO =
    '<svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>' +
    '<path d="M10 8.5v3l3-1.5z" fill="currentColor"/></svg>';
  var boton = {
    el: null,
    crear: function () {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ToolIcon ToolIcon_type_toggle ToolIcon_size_medium pz-boton-proyeccion";
      b.setAttribute("data-testid", "toolbar-proyeccion");
      b.innerHTML = '<div class="ToolIcon__icon">' + ICONO + "</div>";
      b.addEventListener("click", function () { ponerProyeccion(!esProyeccion, true); });
      this.el = b;
      this.actualizar();
    },
    actualizar: function () {
      if (!this.el) return;
      this.el.classList.toggle("ToolIcon--checked", esProyeccion);
      this.el.setAttribute("aria-pressed", esProyeccion ? "true" : "false");
      var t = esProyeccion
        ? "Proyección activa: esta ventana es la que ven los estudiantes (clic para desactivar)"
        : "Proyección: usar esta ventana como la que ven los estudiantes";
      this.el.title = t;
      this.el.setAttribute("aria-label", t);
    },
    // la barra se vuelve a montar (modo zen, modo vista...), asi que se reinserta
    vigilar: function () {
      var self = this;
      this.crear();
      setInterval(function () {
        var stack = document.querySelector(".App-toolbar .Stack");
        if (!stack || stack.contains(self.el)) return;
        var div = document.createElement("div");
        div.className = "App-toolbar__divider pz-divisor";
        var viejo = stack.querySelector(".pz-divisor");
        if (viejo) viejo.remove();
        stack.appendChild(div);
        stack.appendChild(self.el);
      }, 300);
    },
  };

  // ---------------------------------------------------------------- proyeccion
  var proyeccion = {
    ultima: null, ultimoEnvio: 0, seq: 0, anim: null,

    vista: function () {
      var st = api().getAppState(), z = st.zoom.value;
      return { x: -st.scrollX, y: -st.scrollY, w: st.width / z, h: st.height / z, pw: st.width };
    },

    informar: function (forzar) {
      if (!api()) return;
      var v = this.vista(), u = this.ultima, ahora = performance.now();
      var cambio = !u || Math.abs(u.x - v.x) > 1e-6 || Math.abs(u.y - v.y) > 1e-6 ||
        Math.abs(u.w - v.w) > 1e-6 || Math.abs(u.h - v.h) > 1e-6;
      // latido cada 2 s para que la ventana de edicion sepa que seguimos aca
      if (!forzar && !(cambio && ahora - this.ultimoEnvio > 30) && ahora - this.ultimoEnvio < 2000) return;
      this.ultima = v;
      this.ultimoEnvio = ahora;
      v.seq = this.seq;
      emitir("camara-estado", v);
    },

    aplicar: function (x, y, w) {
      var st = api().getAppState();
      var z = clamp(st.width / w, ZOOM_MIN, ZOOM_MAX);
      api().updateScene({ appState: { scrollX: -x, scrollY: -y, zoom: { value: z } } });
    },

    mover: function (d) {
      var self = this;
      if (typeof d.seq === "number") this.seq = d.seq;
      if (this.anim) clearTimeout(this.anim), (this.anim = null);
      if (!d.animar || document.hidden) return this.aplicar(d.x, d.y, d.w);
      // setTimeout y no requestAnimationFrame: la ventana proyectada suele estar
      // tapada por la de edicion y ahi el navegador frena requestAnimationFrame
      var ini = this.vista(), t0 = performance.now(), DUR = 350;
      (function paso() {
        var t = Math.min(1, (performance.now() - t0) / DUR);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        self.aplicar(ini.x + (d.x - ini.x) * e, ini.y + (d.y - ini.y) * e, ini.w + (d.w - ini.w) * e);
        self.anim = t < 1 ? setTimeout(paso, 16) : null;
      })();
    },

    iniciar: function () {
      var self = this;
      socket.on("camara-mover", function (d) { if (esProyeccion && api()) self.mover(d); });
      socket.on("camara-pedir", function () { if (esProyeccion) self.informar(true); });
      // setInterval (y no requestAnimationFrame) para seguir funcionando aunque
      // la ventana proyectada quede tapada por otra
      setInterval(function () { if (esProyeccion) self.informar(false); }, 30);
    },
  };

  // ------------------------------------------------------------------- edicion
  var edicion = {
    rect: null,        // vista de la proyeccion en coordenadas de la escena
    vistoEn: 0,        // ultima vez que supimos de la proyeccion
    seq: 0,            // numero del ultimo movimiento enviado
    arrastre: null,
    pendiente: false,
    el: null,

    crearDOM: function () {
      var css = document.createElement("style");
      css.textContent =
        "#pz-camara{position:fixed;left:0;top:0;pointer-events:none;z-index:2;" +
        "border:2px dashed #e03131;box-sizing:border-box;display:none}" +
        "#pz-camara .pz-borde{position:absolute;pointer-events:auto;cursor:move}" +
        "#pz-camara .pz-n{left:0;right:0;top:-6px;height:10px}" +
        "#pz-camara .pz-s{left:0;right:0;bottom:-6px;height:10px}" +
        "#pz-camara .pz-o{top:0;bottom:0;left:-6px;width:10px}" +
        "#pz-camara .pz-e{top:0;bottom:0;right:-6px;width:10px}" +
        "#pz-camara .pz-esq{position:absolute;width:12px;height:12px;background:#fff;" +
        "border:2px solid #e03131;border-radius:2px;pointer-events:auto;box-sizing:border-box}" +
        "#pz-camara .pz-no{left:-7px;top:-7px;cursor:nwse-resize}" +
        "#pz-camara .pz-ne{right:-7px;top:-7px;cursor:nesw-resize}" +
        "#pz-camara .pz-so{left:-7px;bottom:-7px;cursor:nesw-resize}" +
        "#pz-camara .pz-se{right:-7px;bottom:-7px;cursor:nwse-resize}" +
        // la etiqueta va por dentro del marco para que siga visible aunque el
        // borde superior quede fuera de la pantalla
        "#pz-camara .pz-etiqueta{position:absolute;left:12px;top:0;pointer-events:auto;" +
        "cursor:move;background:#e03131;color:#fff;font:12px/20px Assistant,sans-serif;" +
        "padding:0 8px;border-radius:0 0 4px 4px;user-select:none;white-space:nowrap}" +
        // zoom de la camara: arriba a la izquierda, por fuera del marco; si no
        // entra en la pantalla pasa adentro, al lado de la etiqueta
        "#pz-camara .pz-zoom{position:absolute;left:-2px;bottom:calc(100% + 6px);pointer-events:auto;" +
        "cursor:pointer;background:var(--island-bg-color,#fff);color:var(--text-primary-color,#1b1b1f);" +
        "border:1px solid #e03131;font:12px/22px Assistant,sans-serif;padding:0 8px;border-radius:6px;" +
        "user-select:none;white-space:nowrap;min-width:44px;text-align:center;box-sizing:border-box}" +
        "#pz-camara .pz-zoom:hover{background:#e03131;color:#fff}" +
        "#pz-camara.pz-adentro .pz-zoom{bottom:auto;top:0;border-radius:0 0 6px 6px}";
      document.head.appendChild(css);

      var el = document.createElement("div");
      el.id = "pz-camara";
      el.innerHTML =
        '<div class="pz-borde pz-n" data-m="mover"></div>' +
        '<div class="pz-borde pz-s" data-m="mover"></div>' +
        '<div class="pz-borde pz-o" data-m="mover"></div>' +
        '<div class="pz-borde pz-e" data-m="mover"></div>' +
        '<div class="pz-esq pz-no" data-m="esq" data-ax="1" data-ay="1"></div>' +
        '<div class="pz-esq pz-ne" data-m="esq" data-ax="0" data-ay="1"></div>' +
        '<div class="pz-esq pz-so" data-m="esq" data-ax="1" data-ay="0"></div>' +
        '<div class="pz-esq pz-se" data-m="esq" data-ax="0" data-ay="0"></div>' +
        '<div class="pz-etiqueta" data-m="mover" title="Arrastrá para mover la cámara. ' +
        'Doble clic: ir a la cámara.">Cámara</div>' +
        '<div class="pz-zoom" role="button" title="Zoom de la cámara. Clic: volver al 100%">100%</div>';
      document.body.appendChild(el);
      this.el = el;
      this.elZoom = el.querySelector(".pz-zoom");
      this.elEtiqueta = el.querySelector(".pz-etiqueta");

      var self = this;
      el.addEventListener("pointerdown", function (e) { self.empezar(e); });
      el.addEventListener("pointermove", function (e) { self.seguir(e); });
      el.addEventListener("pointerup", function (e) { self.terminar(e); });
      el.addEventListener("pointercancel", function (e) { self.terminar(e); });
      el.querySelector(".pz-etiqueta").addEventListener("dblclick", function () { self.irACamara(); });
      this.elZoom.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      this.elZoom.addEventListener("click", function () { self.zoomCien(); });
    },

    // zoom de la camara al 100%, manteniendo el centro
    zoomCien: function () {
      var r = this.rect, pw = this.anchoProyeccion;
      if (!r || !pw) return;
      var w = pw, h = pw * r.h / r.w, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      this.rect = { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
      this.enviar(true);
    },

    aEscena: function (cx, cy) {
      var st = api().getAppState(), z = st.zoom.value;
      return { x: (cx - st.offsetLeft) / z - st.scrollX, y: (cy - st.offsetTop) / z - st.scrollY };
    },

    empezar: function (e) {
      var m = e.target.getAttribute("data-m");
      if (!m || !this.rect || !api()) return;
      e.preventDefault();
      e.stopPropagation();
      try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
      var r = this.rect, p = this.aEscena(e.clientX, e.clientY);
      this.arrastre = { modo: m, p0: p, r0: { x: r.x, y: r.y, w: r.w, h: r.h } };
      if (m === "esq") {
        // la esquina opuesta queda fija
        var ax = e.target.getAttribute("data-ax") === "1", ay = e.target.getAttribute("data-ay") === "1";
        this.arrastre.ancla = { x: ax ? r.x + r.w : r.x, y: ay ? r.y + r.h : r.y, ax: ax, ay: ay };
      }
    },

    seguir: function (e) {
      var a = this.arrastre;
      if (!a) return;
      var p = this.aEscena(e.clientX, e.clientY), r0 = a.r0, aspecto = r0.w / r0.h;
      if (a.modo === "mover") {
        this.rect = { x: r0.x + p.x - a.p0.x, y: r0.y + p.y - a.p0.y, w: r0.w, h: r0.h };
      } else {
        // el ancho en pixeles de la proyeccion limita el zoom posible
        var pw = this.anchoProyeccion || r0.w;
        var w = Math.max(Math.abs(p.x - a.ancla.x), Math.abs(p.y - a.ancla.y) * aspecto);
        w = clamp(w, pw / ZOOM_MAX, pw / ZOOM_MIN);
        var h = w / aspecto;
        this.rect = { x: a.ancla.ax ? a.ancla.x - w : a.ancla.x, y: a.ancla.ay ? a.ancla.y - h : a.ancla.y, w: w, h: h };
      }
      this.programarEnvio(false);
    },

    terminar: function () {
      if (!this.arrastre) return;
      this.arrastre = null;
      this.programarEnvio(false, true);
    },

    programarEnvio: function (animar, yaMismo) {
      var self = this;
      if (yaMismo) return this.enviar(animar);
      if (this.pendiente) return;
      this.pendiente = true;
      requestAnimationFrame(function () { self.pendiente = false; self.enviar(animar); });
    },

    enviar: function (animar) {
      var r = this.rect;
      if (!r) return;
      this.seq++;
      emitir("camara-mover", { x: r.x, y: r.y, w: r.w, animar: !!animar, seq: this.seq });
    },

    // mueve la vista de esta ventana para centrar la camara
    irACamara: function () {
      var r = this.rect, st = api().getAppState();
      if (!r) return;
      var z = clamp(Math.min(st.width / r.w, st.height / r.h) * 0.85, ZOOM_MIN, ZOOM_MAX);
      api().updateScene({ appState: {
        zoom: { value: z },
        scrollX: st.width / z / 2 - (r.x + r.w / 2),
        scrollY: st.height / z / 2 - (r.y + r.h / 2),
      } });
    },

    dibujar: function () {
      var el = this.el, r = this.rect, a = api();
      var visible = !esProyeccion && a && r && performance.now() - this.vistoEn < 5000 && !!salaActual();
      if (!visible) { if (el.style.display !== "none") el.style.display = "none"; return; }
      var st = a.getAppState(), z = st.zoom.value;
      var izq = (r.x + st.scrollX) * z + st.offsetLeft, arr = (r.y + st.scrollY) * z + st.offsetTop;
      el.style.display = "block";
      el.style.transform = "translate(" + izq + "px," + arr + "px)";
      el.style.width = r.w * z + "px";
      el.style.height = r.h * z + "px";
      var adentro = arr < 40;
      if (el.classList.contains("pz-adentro") !== adentro) el.classList.toggle("pz-adentro", adentro);
      if (adentro) this.elZoom.style.left = 12 + this.elEtiqueta.offsetWidth + 6 + "px";
      else this.elZoom.style.left = "";
      var texto = this.anchoProyeccion ? Math.round((this.anchoProyeccion / r.w) * 100) + "%" : "100%";
      if (this.elZoom.textContent !== texto) this.elZoom.textContent = texto;
    },

    iniciar: function () {
      var self = this;
      this.crearDOM();
      socket.on("camara-rol", function (d) {
        if (d && d.proyeccion && esProyeccion) ponerProyeccion(false, false); // otra ventana tomo el rol
        else if (d && !d.proyeccion) self.vistoEn = 0;                        // ya no hay proyeccion
      });
      socket.on("camara-estado", function (d) {
        if (esProyeccion) return;
        self.vistoEn = performance.now();
        // ignorar estados viejos mientras arrastramos o antes de que llegue nuestro ultimo movimiento
        if (self.arrastre || (typeof d.seq === "number" && d.seq < self.seq)) return;
        self.rect = { x: d.x, y: d.y, w: d.w, h: d.h };
        if (d.pw) self.anchoProyeccion = d.pw;
        if (typeof d.seq === "number" && d.seq > self.seq) self.seq = d.seq;
      });
      (function bucle() { self.dibujar(); requestAnimationFrame(bucle); })();
    },
  };

  // ------------------------------------------------------------------- arranque
  function conectar() {
    socket = window.io(location.origin, { transports: ["websocket", "polling"] });
    socket.on("connect", function () { sala = null; unirse(); });
    window.addEventListener("hashchange", unirse);
    setInterval(unirse, 1000);
    proyeccion.iniciar();
    edicion.iniciar();
    boton.vigilar();
  }

  function esperarAPI() {
    if (api()) return conectar();
    setTimeout(esperarAPI, 200);
  }

  var s = document.createElement("script");
  s.src = "/socket.io/socket.io.min.js";
  s.onload = esperarAPI;
  s.onerror = function () { console.warn("camara.js: no se pudo cargar socket.io"); };
  document.head.appendChild(s);
})();
