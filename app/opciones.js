// Opciones propias de la pizarra local (el bundle consulta estas banderas):
//  - window.__ocultarSeleccionRemota: no resalta lo que seleccionan otros colaboradores.
//  (Los interruptores estan en el menu principal -> Preferencias, dentro del bundle.)
//  - window.__ocultarPunteros: no dibuja los cursores de otros colaboradores.
//  - window.__comprimirPng: comprime los PNG al exportar o copiar (compresion.js).
//  - window.__comprimirAlPegar: comprime las imagenes al pegarlas (compresion.js).
(function () {
  var OPCIONES = [
    { clave: "pizarra-ocultar-seleccion-remota", bandera: "__ocultarSeleccionRemota",
      texto: "Ocultar selección de colaboradores", defecto: true },
    { clave: "pizarra-ocultar-punteros", bandera: "__ocultarPunteros",
      texto: "Ocultar cursores de colaboradores", defecto: true },
    // Ver compresion.js: guarda los PNG exportados/copiados con paleta de colores.
    { clave: "pizarra-comprimir-png", bandera: "__comprimirPng",
      texto: "Comprimir imágenes PNG", defecto: true },
    // Ver compresion.js: comprime las imagenes al pegarlas o insertarlas.
    { clave: "pizarra-comprimir-al-pegar", bandera: "__comprimirAlPegar",
      texto: "Comprimir imágenes al pegar", defecto: true },
  ];

  OPCIONES.forEach(function (o) {
    var v = null;
    try { v = localStorage.getItem(o.clave); } catch (e) {}
    window[o.bandera] = v === null ? o.defecto : v === "1";
  });

  // En modo zen / modo vista se ocultan el zoom (abajo a la izquierda) y el boton
  // "Salir del modo zen" (abajo a la derecha). Reaparecen si el cursor permanece
  // en la parte inferior de la pantalla 5 segundos o mas.
  var ESPERA_MS = 5000, ZONA_PX = 80, REVELADO = "pizarra-revelar-controles";
  var st = document.createElement("style");
  st.textContent =
    "html:not(." + REVELADO + ") .excalidraw--zen-mode .zoom-actions," +
    "html:not(." + REVELADO + ") .excalidraw--view-mode .zoom-actions," +
    "html:not(." + REVELADO + ") .excalidraw--zen-mode .disable-zen-mode," +
    "html:not(." + REVELADO + ") .excalidraw--view-mode .disable-zen-mode" +
    "{display:none!important}" +
    "html." + REVELADO + " .excalidraw--zen-mode .disable-zen-mode{opacity:1!important}";
  document.head.appendChild(st);

  var timer = null;
  function enZona(e) { return e.clientY >= window.innerHeight - ZONA_PX; }
  window.addEventListener("pointermove", function (e) {
    var root = document.documentElement;
    if (enZona(e)) {
      if (!timer && !root.classList.contains(REVELADO)) {
        timer = setTimeout(function () {
          timer = null;
          root.classList.add(REVELADO);
        }, ESPERA_MS);
      }
    } else {
      if (timer) { clearTimeout(timer); timer = null; }
      root.classList.remove(REVELADO);
    }
  }, true);
  document.addEventListener("mouseleave", function () {
    if (timer) { clearTimeout(timer); timer = null; }
    document.documentElement.classList.remove(REVELADO);
  });
})();
