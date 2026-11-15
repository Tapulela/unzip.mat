// Compresion de los PNG que exporta la pizarra (archivo y portapapeles).
//
// El navegador guarda el canvas como PNG de color completo (RGBA, 32 bits por pixel).
// Una pizarra tiene pocos colores (fondo, trazos y sus bordes suavizados), asi que
// se puede guardar como PNG con paleta (hasta 256 colores, 1 byte o menos por pixel).
// Igual que iLoveIMG (pngquant), se busca la paleta MAS CHICA cuyo error medio no pase
// RMSE_OBJETIVO (con 16 colores o menos, cada pixel ocupa medio byte). La paleta se arma
// dividiendo cajas de colores en el corte que mas baja el error (con los colores poco
// usados pesando de mas, para que un texto rojo no se vuelva gris) y se ajusta con
// k-means. Si ni con 256 colores el error queda bajo (por ejemplo, una foto pegada en la
// pizarra), no se comprime y se usa el PNG original del navegador.
//
// El bundle llama a window.__pizarraPng(canvas, original) en "Exportar imagen > PNG" y
// en "Copiar como PNG" (dos llamadas editadas en assets/index-*.js). La bandera
// window.__comprimirPng la define opciones.js (menu principal -> Preferencias).
(function () {
  "use strict";

  var MAX_COLORES = 256;
  // Error cuadratico medio maximo (por canal, escala 0-255, colores premultiplicados)
  // para aceptar una paleta reducida. Por encima se deja el PNG original.
  var RMSE_MAXIMO = 3;
  // Error medio buscado al achicar la paleta (iLoveIMG queda cerca de 1).
  var RMSE_OBJETIVO = 1;
  // Tamaños de paleta que se prueban (busqueda binaria).
  // Ningun color con PX_IMPORTANTE pixeles o mas puede cambiar mas que ERROR_COLOR_MAX
  // (distancia RGBA): evita que un color poco usado (texto rojo) se vuelva gris.
  var PX_IMPORTANTE = 30, ERROR_COLOR_MAX = 70;
  var EXPONENTE_CORTE = 0.5;
  var TAMANIOS = [4, 8, 12, 16, 20, 24, 32, 48, 64, 96, 128, 192];

  // ---------- PNG ----------
  var TABLA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes, inicio, fin) {
    var c = 0xffffffff;
    for (var i = inicio; i < fin; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(tipo, datos) {
    var b = new Uint8Array(12 + datos.length);
    var v = new DataView(b.buffer);
    v.setUint32(0, datos.length);
    for (var i = 0; i < 4; i++) b[4 + i] = tipo.charCodeAt(i);
    b.set(datos, 8);
    v.setUint32(8 + datos.length, crc32(b, 4, 8 + datos.length));
    return b;
  }

  async function deflate(bytes) {
    var flujo = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  // indices: Uint8Array w*h; paleta: [[r,g,b,a], ...] (sin premultiplicar)
  async function armarPng(indices, w, h, paleta) {
    var n = paleta.length;
    var bits = n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8;
    var bytesFila = Math.ceil((w * bits) / 8);
    var crudo = new Uint8Array((bytesFila + 1) * h); // filtro 0 (ninguno) en cada fila
    var porByte = 8 / bits;
    for (var y = 0; y < h; y++) {
      var o = y * (bytesFila + 1) + 1, p = y * w;
      if (bits === 8) {
        crudo.set(indices.subarray(p, p + w), o);
      } else {
        for (var x = 0; x < w; x++) {
          crudo[o + ((x / porByte) | 0)] |= indices[p + x] << (8 - bits * (1 + (x % porByte)));
        }
      }
    }

    var ihdr = new Uint8Array(13);
    var v = new DataView(ihdr.buffer);
    v.setUint32(0, w);
    v.setUint32(4, h);
    ihdr[8] = bits;
    ihdr[9] = 3; // color indexado

    var plte = new Uint8Array(n * 3);
    var ultimoTransparente = -1;
    for (var i = 0; i < n; i++) {
      plte[i * 3] = paleta[i][0];
      plte[i * 3 + 1] = paleta[i][1];
      plte[i * 3 + 2] = paleta[i][2];
      if (paleta[i][3] < 255) ultimoTransparente = i;
    }
    var partes = [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("PLTE", plte),
    ];
    if (ultimoTransparente >= 0) {
      var trns = new Uint8Array(ultimoTransparente + 1);
      for (var j = 0; j <= ultimoTransparente; j++) trns[j] = paleta[j][3];
      partes.push(chunk("tRNS", trns));
    }
    partes.push(chunk("IDAT", await deflate(crudo)));
    partes.push(chunk("IEND", new Uint8Array(0)));
    return new Blob(partes, { type: "image/png" });
  }

  // ---------- Paleta ----------
  // Colores unicos en Uint32 (orden de memoria RGBA en little endian: 0xAABBGGRR).
  function canales(k) {
    return [k & 255, (k >>> 8) & 255, (k >>> 16) & 255, k >>> 24];
  }

  // Reduce la lista de colores unicos a "cuantos" colores. Trabaja con colores
  // premultiplicados (asi los casi transparentes no pesan como si fueran opacos).
  // Devuelve { paleta: [[r,g,b,a] premult float], asignacion: Int32Array por color unico }.
  function cuantizar(claves, pesos, cuantos) {
    var n = claves.length;
    var C = [new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    for (var i = 0; i < n; i++) {
      var c = canales(claves[i]), f = c[3] / 255;
      C[0][i] = c[0] * f; C[1][i] = c[1] * f; C[2][i] = c[2] * f; C[3][i] = c[3];
    }

    // --- division en cajas (se divide la caja cuyo corte baja mas el error) ---
    // Cada caja se corta en el punto que minimiza el error de las dos mitades (no en la
    // mediana): asi un color distinto con pocos pixeles (una F roja) queda aislado en
    // vez de mezclarse con los grises de los bordes suavizados.
    var orden = new Int32Array(n);
    for (i = 0; i < n; i++) orden[i] = i;
    var pocosEjes = n > 50000; // muchos colores (fotos): un solo eje, por tiempo
    // Para elegir los cortes, cada color pesa menos que su cantidad de pixeles
    // (raiz): asi un color poco usado pero distinto gana su propio lugar en la paleta.
    var pc = new Float64Array(n);
    for (i = 0; i < n; i++) pc[i] = Math.pow(pesos[i], EXPONENTE_CORTE);

    function preparar(ini, fin) {
      var s = [0, 0, 0, 0], q = [0, 0, 0, 0], W = 0, t, ch, id;
      for (t = ini; t < fin; t++) {
        id = orden[t]; var wt = pc[id];
        W += wt;
        for (ch = 0; ch < 4; ch++) { var x = C[ch][id]; s[ch] += wt * x; q[ch] += wt * x * x; }
      }
      var varz = [0, 0, 0, 0], sse = 0;
      for (ch = 0; ch < 4; ch++) { varz[ch] = q[ch] - (s[ch] * s[ch]) / W; sse += varz[ch]; }
      var caja = { ini: ini, fin: fin, ganancia: -1 };
      if (fin - ini < 2 || sse <= 0) return caja;
      var ejes = [0, 1, 2, 3];
      if (pocosEjes) {
        var e = 0;
        for (ch = 1; ch < 4; ch++) if (varz[ch] > varz[e]) e = ch;
        ejes = [e];
      }
      var mejorTotal = Infinity;
      ejes.forEach(function (eje) {
        if (varz[eje] <= 0) return;
        var col = C[eje];
        var tramo = Array.prototype.slice.call(orden.subarray(ini, fin));
        tramo.sort(function (a, b) { return col[a] - col[b]; });
        var Wl = 0, sl = [0, 0, 0, 0], ql = [0, 0, 0, 0], mejorAca = Infinity, corteAca = -1;
        for (var u = 0; u < tramo.length - 1; u++) {
          var id2 = tramo[u], w2 = pc[id2];
          Wl += w2;
          for (var c2 = 0; c2 < 4; c2++) { var y = C[c2][id2]; sl[c2] += w2 * y; ql[c2] += w2 * y * y; }
          if (col[tramo[u + 1]] === col[id2]) continue;
          var Wr = W - Wl, tot = 0;
          for (c2 = 0; c2 < 4; c2++) {
            var sr = s[c2] - sl[c2];
            tot += ql[c2] - (sl[c2] * sl[c2]) / Wl + (q[c2] - ql[c2]) - (sr * sr) / Wr;
          }
          if (tot < mejorAca) { mejorAca = tot; corteAca = u + 1; }
        }
        if (corteAca > 0 && mejorAca < mejorTotal) {
          mejorTotal = mejorAca;
          caja.tramo = tramo;
          caja.corte = ini + corteAca;
        }
      });
      if (caja.tramo) caja.ganancia = sse - mejorTotal;
      return caja;
    }

    var cajas = [preparar(0, n)];
    while (cajas.length < cuantos) {
      var mejor = -1;
      for (i = 0; i < cajas.length; i++) if (cajas[i].ganancia > 0 && (mejor < 0 || cajas[i].ganancia > cajas[mejor].ganancia)) mejor = i;
      if (mejor < 0) break;
      var b = cajas[mejor];
      orden.set(b.tramo, b.ini);
      cajas.splice(mejor, 1, preparar(b.ini, b.corte), preparar(b.corte, b.fin));
    }
    var ch, t;
    cajas.forEach(function (cj) { cj.W = 0; for (var t2 = cj.ini; t2 < cj.fin; t2++) cj.W += pesos[orden[t2]]; });

    var K = cajas.length;
    var P = [new Float64Array(K), new Float64Array(K), new Float64Array(K), new Float64Array(K)];
    var asig = new Int32Array(n);
    for (var k = 0; k < K; k++) {
      var s = [0, 0, 0, 0];
      for (t = cajas[k].ini; t < cajas[k].fin; t++) {
        var id = orden[t];
        asig[id] = k;
        for (ch = 0; ch < 4; ch++) s[ch] += pesos[id] * C[ch][id];
      }
      for (ch = 0; ch < 4; ch++) P[ch][k] = s[ch] / cajas[k].W;
    }

    // --- ajuste k-means (lo que permita el tiempo) ---
    function masCercano(id) {
      var r = C[0][id], g = C[1][id], bb = C[2][id], a = C[3][id], mejorD = Infinity, m = 0;
      for (var k2 = 0; k2 < K; k2++) {
        var d0 = r - P[0][k2]; var d = d0 * d0; if (d >= mejorD) continue;
        var d1 = g - P[1][k2]; d += d1 * d1; if (d >= mejorD) continue;
        var d2 = bb - P[2][k2]; d += d2 * d2; if (d >= mejorD) continue;
        var d3 = a - P[3][k2]; d += d3 * d3;
        if (d < mejorD) { mejorD = d; m = k2; }
      }
      return m;
    }
    var vueltas = n * K < 2e7 ? 4 : n * K < 6e7 ? 1 : 0;
    for (var it = 0; it < vueltas; it++) {
      for (i = 0; i < n; i++) asig[i] = masCercano(i);
      var S = [new Float64Array(K), new Float64Array(K), new Float64Array(K), new Float64Array(K)];
      var WK = new Float64Array(K);
      for (i = 0; i < n; i++) {
        k = asig[i]; WK[k] += pesos[i];
        for (ch = 0; ch < 4; ch++) S[ch][k] += pesos[i] * C[ch][i];
      }
      for (k = 0; k < K; k++) if (WK[k] > 0) for (ch = 0; ch < 4; ch++) P[ch][k] = S[ch][k] / WK[k];
    }
    for (i = 0; i < n; i++) asig[i] = masCercano(i);

    // error cuadratico medio por pixel y canal
    // y el peor error de un color que se ve (con PX_IMPORTANTE pixeles o mas)
    var err = 0, total = 0, peor = 0;
    for (i = 0; i < n; i++) {
      k = asig[i];
      var e = 0;
      for (ch = 0; ch < 4; ch++) { var dd = C[ch][i] - P[ch][k]; e += dd * dd; }
      err += pesos[i] * e; total += pesos[i];
      if (pesos[i] >= PX_IMPORTANTE && e > peor) peor = e;
    }

    var paleta = [];
    for (k = 0; k < K; k++) {
      var A = Math.round(P[3][k]);
      if (A <= 0) { paleta.push([0, 0, 0, 0]); continue; }
      var inv = 255 / P[3][k];
      paleta.push([
        Math.min(255, Math.round(P[0][k] * inv)),
        Math.min(255, Math.round(P[1][k] * inv)),
        Math.min(255, Math.round(P[2][k] * inv)),
        Math.min(255, A),
      ]);
    }
    return { paleta: paleta, asignacion: asig, rmse: Math.sqrt(err / total / 4), peor: Math.sqrt(peor) };
  }

  // ---------- Codificacion ----------
  async function codificar(rgba, w, h) {
    var px = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h);
    var hist = new Map();
    var ultimo = -1, racha = 0, idx;
    for (var i = 0; i < px.length; i++) {
      var k = px[i];
      if (k >>> 24 === 0) k = px[i] = 0; // todo lo transparente es el mismo color
      if (k === ultimo) { racha++; continue; }
      if (racha) hist.set(ultimo, (hist.get(ultimo) || 0) + racha);
      ultimo = k;
      racha = 1;
    }
    if (racha) hist.set(ultimo, (hist.get(ultimo) || 0) + racha);
    var claves = new Uint32Array(hist.keys());
    var pesos = new Float64Array(hist.values());

    // Se busca la paleta mas chica cuyo error medio no pase RMSE_OBJETIVO (como
    // pngquant --quality, que es lo que hace iLoveIMG). Menos colores = archivo mas
    // chico, y con 16 o menos cada pixel ocupa medio byte.
    var paleta, indiceDe = new Map(), rmse = 0, q = null;
    var cache = {};
    function probar(K) {
      if (!cache[K]) cache[K] = cuantizar(claves, pesos, K);
      return cache[K];
    }
    function alcanza(K) {
      var r = probar(K);
      return r.rmse <= RMSE_OBJETIVO && r.peor <= ERROR_COLOR_MAX;
    }
    var tope = Math.min(MAX_COLORES, claves.length);
    var lista = TAMANIOS.filter(function (K) { return K < tope; }).concat([tope]);
    var lo = 0, hi = lista.length - 1;
    if (alcanza(lista[hi])) {
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (alcanza(lista[mid])) hi = mid; else lo = mid + 1;
      }
      q = probar(lista[hi]);
    } else if (claves.length > MAX_COLORES) {
      q = probar(tope);
      if (q.rmse > RMSE_MAXIMO) return { blob: null, colores: claves.length, rmse: q.rmse };
    }
    if (q && (q.paleta.length < claves.length || claves.length > MAX_COLORES)) {
      rmse = q.rmse;
      paleta = q.paleta;
      for (i = 0; i < claves.length; i++) indiceDe.set(claves[i], q.asignacion[i]);
    } else {
      paleta = [];
      for (i = 0; i < claves.length; i++) paleta.push(canales(claves[i]));
      for (i = 0; i < claves.length; i++) indiceDe.set(claves[i], i);
    }

    // Los colores con transparencia van primero (asi el bloque tRNS es corto).
    var n = paleta.length, orden = [];
    for (i = 0; i < n; i++) orden.push(i);
    orden.sort(function (a, b) { return (paleta[a][3] === 255) - (paleta[b][3] === 255) || a - b; });
    var nuevo = new Uint8Array(n), paletaOrd = [];
    orden.forEach(function (viejo, j) { nuevo[viejo] = j; paletaOrd.push(paleta[viejo]); });

    var indices = new Uint8Array(px.length);
    ultimo = -1;
    for (i = 0; i < px.length; i++) {
      k = px[i];
      if (k !== ultimo) { ultimo = k; idx = nuevo[indiceDe.get(k)]; }
      indices[i] = idx;
    }
    return { blob: await armarPng(indices, w, h, paletaOrd), colores: claves.length, rmse: rmse };
  }

  window.__pizarraCodificarPng = codificar;

  // canvas: HTMLCanvasElement (o promesa de uno); original: la funcion del bundle que
  // hace canvas.toBlob. Ante cualquier problema se usa el PNG original.
  window.__pizarraPng = async function (canvas, original) {
    if (!window.__comprimirPng || typeof CompressionStream === "undefined") return original(canvas);
    try {
      canvas = await canvas;
      var t0 = performance.now();
      var w = canvas.width, h = canvas.height;
      var datos = canvas.getContext("2d").getImageData(0, 0, w, h).data;
      var r = await codificar(datos, w, h);
      var ms = Math.round(performance.now() - t0);
      if (r.blob) {
        console.info("compresion.js: PNG " + w + "x" + h + ", " + r.colores + " colores" +
          (r.rmse ? " (error medio " + r.rmse.toFixed(2) + ")" : " (paleta exacta)") +
          ", " + Math.round(r.blob.size / 1024) + " KB en " + ms + " ms");
        return r.blob;
      }
      console.info("compresion.js: sin comprimir (error medio " + r.rmse.toFixed(2) + " con " +
        r.colores + " colores; probablemente hay fotos)");
    } catch (e) {
      console.warn("compresion.js: no se pudo comprimir, se usa el PNG original", e);
    }
    return original(canvas);
  };

  // ---------- Imagenes que ya estan en el archivo ----------
  // Menu principal -> "Comprimir imágenes" (item editado en assets/index-*.js) llama a
  // window.__pizarraComprimirImagenes(). Recorre las imagenes de la escena (o solo las
  // seleccionadas, si hay alguna) y para cada una:
  //  - si se muestra a menos de la mitad de su tamaño real, la achica al doble de lo
  //    que se ve (sigue nitida con zoom), salvo que este recortada;
  //  - prueba el PNG con paleta (dibujos, capturas) y, si no sirve (fotos), JPEG
  //    (o WebP si tiene transparencia) con calidad CALIDAD_FOTO;
  //  - solo la reemplaza si el archivo queda al menos un AHORRO_MINIMO mas chico.
  // La imagen nueva entra como archivo nuevo (id = SHA-1, como hace Excalidraw) y los
  // elementos pasan a usarlo: se sincroniza con la sala y Ctrl+Z la deshace.
  var CALIDAD_FOTO = 0.85, AHORRO_MINIMO = 0.1, ESCALA_MAXIMA = 2;
  var TIPOS = { "image/png": 1, "image/jpeg": 1, "image/webp": 1, "image/gif": 1, "image/bmp": 1 };

  function cargarImagen(dataURL) {
    return new Promise(function (ok, mal) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = mal;
      img.src = dataURL;
    });
  }

  function bytesDeDataURL(dataURL) {
    var i = dataURL.indexOf(",");
    var b64 = dataURL.slice(i + 1);
    return Math.floor((b64.length * 3) / 4) - (/==$/.test(b64) ? 2 : /=$/.test(b64) ? 1 : 0);
  }

  function aDataURL(blob) {
    return new Promise(function (ok, mal) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = mal;
      r.readAsDataURL(blob);
    });
  }

  async function idDeArchivo(blob) {
    try {
      var h = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
      return Array.prototype.map.call(new Uint8Array(h), function (b) {
        return (b < 16 ? "0" : "") + b.toString(16);
      }).join("");
    } catch (e) {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  function aBlob(canvas, tipo, calidad) {
    return new Promise(function (ok) { canvas.toBlob(ok, tipo, calidad); });
  }

  // Devuelve { blob, tipo, detalle } o null si no conviene cambiarla.
  // src: dataURL o URL de la imagen; antes: bytes del archivo original;
  // anchoVisible: ancho mas grande con que se muestra (0 = no achicar por eso);
  // ladoMax: lado mas largo permitido (0 = sin limite).
  async function comprimirArchivo(src, antes, anchoVisible, ladoMax) {
    var img = await cargarImagen(src);
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    var escala = 1;
    if (anchoVisible && w > anchoVisible * ESCALA_MAXIMA) escala = (anchoVisible * ESCALA_MAXIMA) / w;
    if (ladoMax && Math.max(w, h) * escala > ladoMax) escala = ladoMax / Math.max(w, h);
    var cw = Math.max(1, Math.round(w * escala)), chh = Math.max(1, Math.round(h * escala));
    var canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = chh;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cw, chh);
    var datos = ctx.getImageData(0, 0, cw, chh).data;
    var opaca = true;
    for (var i = 3; i < datos.length; i += 4) if (datos[i] !== 255) { opaca = false; break; }

    var mejor = null;
    function candidato(blob, detalle) {
      if (blob && (!mejor || blob.size < mejor.blob.size)) mejor = { blob: blob, tipo: blob.type, detalle: detalle };
    }
    var r = await codificar(new Uint8ClampedArray(datos), cw, chh);
    if (r.blob) candidato(r.blob, "paleta");
    else {
      var tipo = opaca ? "image/jpeg" : "image/webp";
      var foto = await aBlob(canvas, tipo, CALIDAD_FOTO);
      if (foto && foto.type === tipo) candidato(foto, tipo === "image/jpeg" ? "JPEG" : "WebP");
      // con transparencia y sin WebP, queda el PNG del navegador
      candidato(await aBlob(canvas, "image/png"), "PNG");
    }
    if (escala < 1) {
      if (mejor) mejor.detalle += ", " + w + "x" + h + " → " + cw + "x" + chh;
    }
    if (!mejor || mejor.blob.size > antes * (1 - AHORRO_MINIMO)) return null;
    mejor.antes = antes;
    return mejor;
  }

  function kb(n) {
    return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace(".", ",") + " MB" : Math.round(n / 1024) + " KB";
  }

  var comprimiendo = false;
  window.__pizarraComprimirImagenes = async function () {
    var A = window.__pizarraAPI;
    if (!A || comprimiendo) return;
    function aviso(texto, ms) { try { A.setToast({ message: texto, duration: ms || 5000, closable: true }); } catch (e) {} }
    if (typeof CompressionStream === "undefined") return aviso("Este navegador no permite comprimir imágenes.");

    var elementos = A.getSceneElements();
    var sel = A.getAppState().selectedElementIds || {};
    var imagenes = elementos.filter(function (e) { return e.type === "image" && e.fileId; });
    var elegidas = imagenes.filter(function (e) { return sel[e.id]; });
    if (elegidas.length) imagenes = elegidas;
    var archivos = A.getFiles();
    var porArchivo = {};
    imagenes.forEach(function (e) {
      var f = archivos[e.fileId];
      if (!f || !TIPOS[f.mimeType]) return;
      var p = porArchivo[e.fileId] || (porArchivo[e.fileId] = { archivo: f, ancho: 0, recortada: false });
      if (e.crop) p.recortada = true;
      p.ancho = Math.max(p.ancho, Math.abs(e.width));
    });
    var ids = Object.keys(porArchivo);
    if (!ids.length) return aviso(elegidas.length ? "Las imágenes seleccionadas no se pueden comprimir." : "No hay imágenes para comprimir.");

    comprimiendo = true;
    aviso("Comprimiendo " + ids.length + (ids.length === 1 ? " imagen…" : " imágenes…"), 60000);
    var reemplazo = {}, nuevos = [], antes = 0, despues = 0;
    try {
      for (var i = 0; i < ids.length; i++) {
        var p = porArchivo[ids[i]];
        try {
          var r = await comprimirArchivo(p.archivo.dataURL, bytesDeDataURL(p.archivo.dataURL), p.recortada ? 0 : p.ancho, 0);
          if (!r) continue;
          var id = await idDeArchivo(r.blob);
          if (id === ids[i]) continue;
          nuevos.push({ id: id, mimeType: r.tipo, dataURL: await aDataURL(r.blob), created: Date.now() });
          reemplazo[ids[i]] = id;
          antes += r.antes;
          despues += r.blob.size;
          console.info("compresion.js: imagen " + ids[i].slice(0, 8) + " " + kb(r.antes) + " → " + kb(r.blob.size) + " (" + r.detalle + ")");
        } catch (e) {
          console.warn("compresion.js: no se pudo comprimir la imagen " + ids[i], e);
        }
      }
      if (!nuevos.length) return aviso("Las imágenes ya están comprimidas.");

      A.addFiles(nuevos);
      var ahora = Date.now();
      var cambiados = A.getSceneElementsIncludingDeleted().map(function (e) {
        if (e.type !== "image" || !reemplazo[e.fileId] || (elegidas.length && !sel[e.id])) return e;
        var d = {};
        for (var k in e) d[k] = e[k];
        d.fileId = reemplazo[e.fileId];
        d.status = "pending"; // el administrador de archivos lo sube y lo marca "saved"
        d.version = e.version + 1;
        d.versionNonce = Math.floor(Math.random() * 2147483647);
        d.updated = ahora;
        return d;
      });
      A.updateScene({ elements: cambiados, captureUpdate: "IMMEDIATELY" });
      aviso(nuevos.length + (nuevos.length === 1 ? " imagen comprimida" : " imágenes comprimidas") +
        ": " + kb(antes) + " → " + kb(despues) + " (" + Math.round((1 - despues / antes) * 100) + "% menos). Ctrl+Z la deshace.");
    } finally {
      comprimiendo = false;
    }
  };

  // ---------- Imagenes pegadas o insertadas ----------
  // El bundle llama a window.__pizarraComprimirAlPegar(file) al empezar initializeImage
  // (pegar, arrastrar o la herramienta de imagen), antes de calcular el id del archivo.
  // Se achica al mismo lado maximo que usa Excalidraw (LADO_MAX_PEGAR) y se comprime
  // como arriba; si no queda al menos un AHORRO_MINIMO mas chica, se deja la original.
  // La bandera window.__comprimirAlPegar la define opciones.js (Preferencias).
  var LADO_MAX_PEGAR = 1440;
  var TIPOS_PEGAR = { "image/png": 1, "image/jpeg": 1, "image/webp": 1, "image/bmp": 1 };
  window.__pizarraComprimirAlPegar = async function (file) {
    if (!window.__comprimirAlPegar || !file || !TIPOS_PEGAR[file.type] ||
        typeof CompressionStream === "undefined") return file;
    var url = null;
    try {
      var t0 = performance.now();
      url = URL.createObjectURL(file);
      var r = await comprimirArchivo(url, file.size, 0, LADO_MAX_PEGAR);
      if (!r) return file;
      var ext = r.tipo === "image/jpeg" ? ".jpg" : r.tipo === "image/webp" ? ".webp" : ".png";
      var nombre = (file.name || "imagen").replace(/\.[^.]*$/, "") + ext;
      console.info("compresion.js: imagen pegada " + kb(file.size) + " → " + kb(r.blob.size) +
        " (" + r.detalle + ") en " + Math.round(performance.now() - t0) + " ms");
      return new File([r.blob], nombre, { type: r.tipo });
    } catch (e) {
      console.warn("compresion.js: no se pudo comprimir la imagen pegada", e);
      return file;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  };

  // "Copiar como PNG": el navegador vuelve a codificar las imagenes que pone en el
  // portapapeles (y se pierde la compresion). Con el servidor local (no en la version
  // online) se le manda el PNG comprimido a servidor.js, que lo pone en el portapapeles
  // de Windows como archivo y como imagen. Devuelve true si lo hizo; si no, el bundle
  // copia como siempre.
  window.__pizarraCopiarPng = async function (canvas, original) {
    if (!window.__comprimirPng || window.PIZARRA_SIN_SERVIDOR !== false) return false;
    if (!/Windows/i.test(navigator.userAgent)) return false;
    try {
      var blob = await window.__pizarraPng(canvas, original);
      var corte = new AbortController();
      var reloj = setTimeout(function () { corte.abort(); }, 15000);
      var res = await fetch("/portapapeles", {
        method: "POST",
        headers: { "Content-Type": "image/png", "X-Unzipmat": "1" },
        body: blob,
        signal: corte.signal,
      });
      clearTimeout(reloj);
      if (res.ok) return true;
      console.warn("compresion.js: el servidor no pudo copiar (" + res.status + ")", await res.text());
    } catch (e) {
      console.warn("compresion.js: no se pudo copiar por el servidor local", e);
    }
    return false;
  };
})();
