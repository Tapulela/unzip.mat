// Entorno de unzip.mat. Este archivo se usa tal cual en un hosting estático
// (por ejemplo GitHub Pages), donde no hay servidor de colaboración.
// servidor.js responde esta misma ruta con PIZARRA_SIN_SERVIDOR = false.
window.PIZARRA_SIN_SERVIDOR = true;

(function () {
  var css =
    // Publicidad de Excalidraw+ en la barra lateral: no corresponde a este proyecto.
    ".app-sidebar-promo-container{display:none!important}" +
    // Enlaces a Excalidraw+ (Upgrade, Sign up) y a las redes del proyecto original.
    "a[href*='excalidraw.com']," +
    "a[href='https://github.com/excalidraw/excalidraw']," +
    "a[href='https://x.com/excalidraw']," +
    "a[href='https://discord.gg/UexuTaE']{display:none!important}" +
    // Pantalla de bienvenida: logo y nombre propios en lugar de los de Excalidraw.
    ".welcome-screen-center__logo .ExcalidrawLogo{display:none!important}" +
    ".welcome-screen-center__logo{display:flex;align-items:center;justify-content:center;gap:.6rem}" +
    ".welcome-screen-center__logo::before{content:'';width:3.4rem;height:3.4rem;" +
    "background:url(logo.svg) center/contain no-repeat}" +
    ".welcome-screen-center__logo::after{content:'unzip.mat';font-size:2.6rem;" +
    "color:var(--color-primary, #6965db)}" +
    // Texto de bienvenida propio (el original habla del almacenamiento del navegador).
    ".welcome-screen-center__heading{font-size:0!important;line-height:0!important}" +
    ".welcome-screen-center__heading::after{display:block;max-width:32rem;margin:0 auto;" +
    "font-size:1.125rem;line-height:1.35rem;content:'Esta es una herramienta de pizarra " +
    "digital con herramientas pedagógicas para apoyar en matemática discreta'}" +
    // Ayuda de la barra (ver ajustarAyuda): etiqueta más ancha, en tres renglones.
    ".welcome-screen-decor-hint--toolbar .welcome-screen-decor-hint__label{" +
    "width:13rem!important;max-width:none!important}" +
    // Sin transición, para que la posición medida sea la final.
    ".welcome-screen-decor-hint--toolbar{transition:none!important}";

  if (window.PIZARRA_SIN_SERVIDOR) {
    // Sin servidor no hay colaboración: se ocultan los botones que la inician.
    css +=
      ".excalidraw .collab-button," +
      ".excalidraw [data-testid=collab-button]{display:none!important}";
    // Un enlace con #room=... intentaría conectarse a un servidor que no existe.
    if (/(^#|,)room=/.test(location.hash)) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
    // El ítem de la pantalla de bienvenida no tiene clase propia: se reconoce por el texto.
    new MutationObserver(function () {
      var items = document.querySelectorAll(".welcome-screen-menu-item");
      for (var i = 0; i < items.length; i++) {
        if (/colaboraci|collaborat/i.test(items[i].textContent)) items[i].style.display = "none";
      }
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Menú principal: ítem para descargar la versión de Windows (unzip.mat.exe,
    // armado por .github/workflows/exe.yml). Solo en la versión online: con
    // servidor local (o dentro del .exe) PIZARRA_SIN_SERVIDOR es false.
    var URL_EXE = "https://github.com/Tapulela/unzip.mat/releases/latest/download/unzip.mat.exe";
    var ICONO_DESCARGA =
      '<svg aria-hidden="true" focusable="false" role="img" viewBox="0 0 20 20" fill="none" ' +
      'stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M10 3.333v9.167M6.25 8.75 10 12.5l3.75-3.75M3.333 14.167v1.666c0 .46.373.834.834.834h11.666c.46 0 .834-.373.834-.834v-1.666"/></svg>';
    new MutationObserver(function () {
      var menu = document.querySelector(".main-menu");
      if (!menu || menu.querySelector("[data-pizarra-descarga]")) return;
      var a = document.createElement("a");
      a.className = "dropdown-menu-item dropdown-menu-item-base";
      a.setAttribute("data-pizarra-descarga", "");
      a.setAttribute("role", "menuitem");
      a.href = URL_EXE;
      a.target = "_blank";
      a.rel = "noopener";
      a.title = "Un solo archivo para Windows: doble clic y listo, sin instalar nada y sin internet. Incluye la colaboración entre ventanas.";
      a.innerHTML =
        '<div class="dropdown-menu-item__icon">' + ICONO_DESCARGA + "</div>" +
        '<div class="dropdown-menu-item__text"><span>Descargar para Windows (sin internet)</span></div>';
      var antes =
        menu.querySelector("a[href='https://github.com/excalidraw/excalidraw']") ||
        menu.querySelector(".dropdown-menu__submenu-trigger");
      var contenedor = antes ? antes.parentNode : menu.querySelector(".dropdown-menu-container") || menu;
      contenedor.insertBefore(a, antes || null);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Ayuda visual de la barra (pantalla vacía): en lugar de "Elige una herramienta y
  // empieza a dibujar", señala el botón de generadores (generadores.js).
  var TEXTO_AYUDA = "Puedes acceder a las herramientas de matemática aquí";
  function ajustarAyuda() {
    var ayuda = document.querySelector(".welcome-screen-decor-hint--toolbar");
    var boton = document.querySelector("[data-testid=toolbar-generadores]");
    if (!ayuda || !boton) return;
    var etiqueta = ayuda.querySelector(".welcome-screen-decor-hint__label");
    var flecha = ayuda.querySelector("svg");
    if (!etiqueta || !flecha) return;
    if (etiqueta.textContent !== TEXTO_AYUDA) etiqueta.textContent = TEXTO_AYUDA;
    // La punta de la flecha está a 24/38 del ancho del svg (viewBox 0 0 38 78).
    ayuda.style.transform = "";
    var f = flecha.getBoundingClientRect(), b = boton.getBoundingClientRect();
    var dx = b.left + b.width / 2 - (f.left + (f.width * 24) / 38);
    // Se suma al centrado original del CSS (translate(-50%)).
    ayuda.style.transform =
      Math.abs(dx) < 0.5 ? "" : "translate(-50%) translateX(" + Math.round(dx) + "px)";
  }
  var pendiente = false, observada = null;
  // Cuando carga la fuente la etiqueta cambia de ancho y la flecha se corre:
  // se vuelve a ajustar con cada cambio de tamaño de la ayuda o de la barra.
  var tamanios = window.ResizeObserver ? new ResizeObserver(programarAyuda) : null;
  function programarAyuda() {
    if (pendiente) return;
    pendiente = true;
    setTimeout(function () {
      pendiente = false;
      var ayuda = document.querySelector(".welcome-screen-decor-hint--toolbar");
      if (tamanios && ayuda && ayuda !== observada) {
        tamanios.disconnect();
        tamanios.observe(ayuda);
        var barra = document.querySelector(".App-toolbar");
        if (barra) tamanios.observe(barra);
        observada = ayuda;
      }
      ajustarAyuda();
    }, 0);
  }
  new MutationObserver(programarAyuda)
    .observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", programarAyuda);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(programarAyuda);

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);
})();
