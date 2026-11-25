// Escena guardada en IndexedDB en vez de localStorage.
// Excalidraw guarda los elementos del tablero en localStorage («excalidraw»),
// que admite ~5 millones de caracteres por sitio: un cuadernillo entero (cientos
// de hojas, decenas de miles de elementos) ocupa mucho más y aparece «Browser
// storage quota exceeded. Changes will not be saved». IndexedDB no tiene ese
// límite.
// Este archivo reemplaza en index.html al <script type="module"> del build: lee la
// escena de IndexedDB, intercepta localStorage.getItem/setItem/removeItem de la
// clave «excalidraw» (Excalidraw las sigue usando igual, sin cambios en el bundle)
// y recién entonces carga la app (data-app). Mientras la escena entre, también se
// deja una copia en localStorage (es sincrónica: si el navegador se cierra antes
// de que IndexedDB termine de escribir, queda esa). Las otras pestañas abiertas
// reciben cada versión por BroadcastChannel, para que la sincronización entre
// pestañas de Excalidraw lea la escena actual.
(function () {
  var CLAVE = "excalidraw";
  var MARCA = "pizarra-escena-t"; // cuándo se guardó la copia de localStorage
  var BASE = "unzip-escena", TABLA = "escena";
  var MAX_LOCAL = 4500000; // caracteres; por arriba de esto solo IndexedDB

  var app = document.currentScript && document.currentScript.getAttribute("data-app");
  var proto = Storage.prototype;
  var get = proto.getItem, set = proto.setItem, quitar = proto.removeItem;
  var memoria = null; // { valor, t } o null si no hay escena
  var canal = typeof BroadcastChannel === "function" ? new BroadcastChannel("unzip-escena") : null;

  function abrir() {
    return new Promise(function (ok, mal) {
      var r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(TABLA); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { mal(r.error); };
    });
  }
  var db = null;
  function base() { return db || (db = abrir()); }

  function leerIdb() {
    return base().then(function (d) {
      return new Promise(function (ok, mal) {
        var r = d.transaction(TABLA, "readonly").objectStore(TABLA).get(CLAVE);
        r.onsuccess = function () { ok(r.result || null); };
        r.onerror = function () { mal(r.error); };
      });
    });
  }

  // una escritura por vez; si llegan varias mientras tanto, solo la última.
  // registro null = borrar la escena; undefined en pendiente = nada pendiente
  var pendiente, escribiendo = false;
  function escribirIdb(registro) {
    pendiente = registro;
    if (escribiendo) return;
    escribiendo = true;
    (function siguiente() {
      var r = pendiente; pendiente = undefined;
      base().then(function (d) {
        return new Promise(function (ok, mal) {
          var tx = d.transaction(TABLA, "readwrite"), t = tx.objectStore(TABLA);
          if (r) t.put(r, CLAVE); else t.delete(CLAVE);
          tx.oncomplete = ok;
          tx.onerror = tx.onabort = function () { mal(tx.error); };
          if (tx.commit) tx.commit();
        });
      }).catch(function (e) {
        console.error("unzip.mat: no se pudo guardar la escena en IndexedDB", e);
      }).then(function () {
        if (pendiente !== undefined) siguiente(); else escribiendo = false;
      });
    })();
  }

  function copiaLocal(valor, t) {
    try {
      if (valor.length <= MAX_LOCAL) {
        set.call(localStorage, CLAVE, valor);
        set.call(localStorage, MARCA, String(t));
        return;
      }
    } catch (e) { /* no entra: queda solo en IndexedDB */ }
    try { quitar.call(localStorage, CLAVE); quitar.call(localStorage, MARCA); } catch (e) {}
  }

  function esEscena(almacen, clave) { return almacen === window.localStorage && clave === CLAVE; }

  proto.getItem = function (clave) {
    if (esEscena(this, clave)) return memoria ? memoria.valor : null;
    return get.apply(this, arguments);
  };
  proto.setItem = function (clave, valor) {
    if (!esEscena(this, clave)) return set.apply(this, arguments);
    valor = String(valor);
    var t = Date.now();
    memoria = { valor: valor, t: t };
    copiaLocal(valor, t);
    escribirIdb(memoria);
    if (canal) try { canal.postMessage(memoria); } catch (e) {}
  };
  proto.removeItem = function (clave) {
    if (!esEscena(this, clave)) return quitar.apply(this, arguments);
    memoria = null;
    try { quitar.call(localStorage, CLAVE); quitar.call(localStorage, MARCA); } catch (e) {}
    escribirIdb(null);
    if (canal) try { canal.postMessage(null); } catch (e) {}
  };
  if (canal) canal.onmessage = function (ev) { memoria = ev.data; };

  function arrancar() {
    if (!app) return;
    var s = document.createElement("script");
    s.type = "module";
    s.crossOrigin = "";
    s.src = app;
    document.head.appendChild(s);
  }

  // la escena más nueva entre IndexedDB y la copia de localStorage
  var local = null;
  try {
    var v = get.call(localStorage, CLAVE);
    if (v !== null) local = { valor: v, t: Number(get.call(localStorage, MARCA)) || 0 };
  } catch (e) {}
  leerIdb().then(function (idb) {
    memoria = idb && (!local || idb.t >= local.t) ? idb : local;
    // la escena de antes de este cambio (o la de una escritura que no terminó) pasa a IndexedDB
    if (memoria && memoria !== idb) escribirIdb(memoria);
  }).catch(function (e) {
    console.error("unzip.mat: no se pudo leer la escena de IndexedDB", e);
    memoria = local;
  }).then(arrancar);
})();
