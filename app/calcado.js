// Calcado de imagenes, sin internet: convierte una imagen pegada en trazos de la
// pizarra (lineas y puntos), como si se hubiera calcado con lapiz.
// Pensado para dibujos, esquemas y textos escritos sobre un fondo liso (una hoja,
// una captura, un pizarron). Con fotos de mucho detalle el resultado es pobre.
//
// Pasos:
//  1. Se lee la imagen (con su recorte) a una resolucion de trabajo ("detalle").
//  2. El color del fondo es la mediana del borde; "tinta" es todo lo que se aleja
//     de ese color mas que un umbral (Otsu, corrido por la "sensibilidad"). Asi
//     sirve para tinta oscura sobre blanco, tiza sobre pizarron o tinta de color.
//  3. Se borran las manchitas sueltas y se rellenan los agujeritos.
//  4. Transformada de distancia (para saber el grosor de cada trazo) y
//     adelgazamiento de Zhang-Suen (deja el esqueleto: la linea central).
//  5. El esqueleto se recorre y se parte en caminos; se descartan las
//     "espinas" que deja el adelgazamiento, se suaviza y se simplifica
//     (Ramer-Douglas-Peucker, segun el "suavizado").
//  6. Cada camino es una linea de Excalidraw con el grosor y el color medidos;
//     los puntos sueltos (el punto de la i, una coma) son circulos rellenos.
// Expone window.__pizarraCalcado = { analizar, insertar, dibujarVista, MAX_TRAZOS }.
(function () {
  "use strict";

  var TINTA = "#1e1e1e";
  var LADOS = [300, 450, 650, 900, 1200];   // resolucion de trabajo segun el detalle (1..5)
  var EPS = [0.35, 0.6, 0.9, 1.4, 2.1];     // tolerancia de simplificacion segun el suavizado (0..4)
  var MAX_TRAZOS = 4000;

  function rnd() { return Math.floor(Math.random() * 2147483647); }
  var LETRAS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";
  function nuevoId() {
    var s = "";
    for (var i = 0; i < 21; i++) s += LETRAS[Math.floor(Math.random() * 64)];
    return s;
  }

  // ------------------------------------------------------------ lectura
  var imagenes = {};
  function cargar(fileId, dataURL) {
    var c = imagenes[fileId];
    if (c && c.dataURL === dataURL) return c.promesa;
    var promesa = new Promise(function (ok, mal) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { mal(new Error("No se pudo leer la imagen.")); };
      img.src = dataURL;
    });
    imagenes[fileId] = { dataURL: dataURL, promesa: promesa };
    return promesa;
  }

  function leerPixeles(img, el, lado) {
    var nw = img.naturalWidth, nh = img.naturalHeight;
    var sx = 0, sy = 0, sw = nw, sh = nh, cr = el.crop;
    if (cr && cr.naturalWidth) {
      // el recorte esta en pixeles de la imagen original (que pudo comprimirse)
      var fx = nw / cr.naturalWidth, fy = nh / cr.naturalHeight;
      sx = cr.x * fx; sy = cr.y * fy; sw = cr.width * fx; sh = cr.height * fy;
    }
    var k = Math.min(2, lado / Math.max(sw, sh));
    var w = Math.max(8, Math.round(sw * k)), h = Math.max(8, Math.round(sh * k));
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return { w: w, h: h, datos: ctx.getImageData(0, 0, w, h).data };
  }

  // ------------------------------------------------------------ tinta / fondo
  function colorDeFondo(d, w, h) {
    var rs = [], gs = [], bs = [];
    function sumar(i) { rs.push(d[i * 4]); gs.push(d[i * 4 + 1]); bs.push(d[i * 4 + 2]); }
    for (var x = 0; x < w; x++) { sumar(x); sumar((h - 1) * w + x); }
    for (var y = 1; y < h - 1; y++) { sumar(y * w); sumar(y * w + w - 1); }
    function mediana(a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
    return [mediana(rs), mediana(gs), mediana(bs)];
  }

  function desenfocar(v, w, h) {
    var t = new Float32Array(v.length), o = new Float32Array(v.length), x, y, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        t[i] = (v[x > 0 ? i - 1 : i] + v[i] + v[x < w - 1 ? i + 1 : i]) / 3;
      }
    }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        o[i] = (t[y > 0 ? i - w : i] + t[i] + t[y < h - 1 ? i + w : i]) / 3;
      }
    }
    return o;
  }

  function otsu(v) {
    var hist = new Float64Array(256), n = v.length, i;
    for (i = 0; i < n; i++) hist[Math.min(255, Math.round(v[i]))]++;
    var total = 0;
    for (i = 0; i < 256; i++) total += i * hist[i];
    var sumaB = 0, pesoB = 0, mejor = 0, umbral = 0;
    for (i = 0; i < 256; i++) {
      pesoB += hist[i];
      if (!pesoB) continue;
      var pesoF = n - pesoB;
      if (!pesoF) break;
      sumaB += i * hist[i];
      var mB = sumaB / pesoB, mF = (total - sumaB) / pesoF;
      var entre = pesoB * pesoF * (mB - mF) * (mB - mF);
      if (entre > mejor) { mejor = entre; umbral = i; }
    }
    return umbral;
  }

  // recorre las zonas conectadas de pixeles con m[i] === valor
  function zonas(m, w, h, valor, ocho, visita) {
    var n = w * h, marca = new Uint8Array(n), pila = new Int32Array(n);
    var VEC = ocho ? [-w, 1, w, -1, -w + 1, w + 1, w - 1, -w - 1] : [-w, 1, w, -1];
    for (var s = 0; s < n; s++) {
      if (marca[s] || m[s] !== valor) continue;
      var tope = 0, px = [], borde = false;
      pila[tope++] = s; marca[s] = 1;
      while (tope) {
        var i = pila[--tope], x = i % w, y = (i - x) / w;
        px.push(i);
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { borde = true; continue; }
        for (var k = 0; k < VEC.length; k++) {
          var j = i + VEC[k];
          if (!marca[j] && m[j] === valor) { marca[j] = 1; pila[tope++] = j; }
        }
      }
      visita(px, borde);
    }
  }

  // ------------------------------------------------------------ distancia y esqueleto
  function distancias(m, w, h) {
    var n = w * h, dt = new Uint16Array(n), x, y, i;
    for (i = 0; i < n; i++) dt[i] = m[i] ? 60000 : 0;
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        i = y * w + x;
        if (!dt[i]) continue;
        dt[i] = Math.min(dt[i], dt[i - 1] + 3, dt[i - w] + 3, dt[i - w - 1] + 4, dt[i - w + 1] + 4);
      }
    }
    for (y = h - 2; y > 0; y--) {
      for (x = w - 2; x > 0; x--) {
        i = y * w + x;
        if (!dt[i]) continue;
        dt[i] = Math.min(dt[i], dt[i + 1] + 3, dt[i + w] + 3, dt[i + w + 1] + 4, dt[i + w - 1] + 4);
      }
    }
    return dt;
  }

  var DX = [0, 1, 1, 1, 0, -1, -1, -1], DY = [-1, -1, 0, 1, 1, 1, 0, -1]; // N NE E SE S SO O NO

  function adelgazar(m, w, h) {
    var sk = new Uint8Array(m), lista = [], i;
    for (i = 0; i < sk.length; i++) if (sk[i]) lista.push(i);
    var borrar = [], cambio = true;
    while (cambio) {
      cambio = false;
      for (var paso = 0; paso < 2; paso++) {
        borrar.length = 0;
        for (var k = 0; k < lista.length; k++) {
          i = lista[k];
          if (!sk[i]) continue;
          var p2 = sk[i - w], p3 = sk[i - w + 1], p4 = sk[i + 1], p5 = sk[i + w + 1];
          var p6 = sk[i + w], p7 = sk[i + w - 1], p8 = sk[i - 1], p9 = sk[i - w - 1];
          var b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          var a = (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
            (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
          if (a !== 1) continue;
          if (paso === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
          borrar.push(i);
        }
        for (k = 0; k < borrar.length; k++) sk[borrar[k]] = 0;
        if (borrar.length) cambio = true;
      }
      lista = lista.filter(function (j) { return sk[j]; });
    }
    // escalones: un pixel en una esquina que sobra (sus vecinos siguen unidos sin el)
    var v = [0, 0, 0, 0, 0, 0, 0, 0];
    for (var q = 0; q < lista.length; q++) {
      i = lista[q];
      var cuenta = 0;
      for (var d = 0; d < 8; d++) { v[d] = sk[i + DY[d] * w + DX[d]]; cuenta += v[d]; }
      if (cuenta < 2) continue;
      if (!((v[0] && v[2]) || (v[2] && v[4]) || (v[4] && v[6]) || (v[6] && v[0]))) continue;
      if (grupos(v) === 1) sk[i] = 0;
    }
    return sk;
  }

  // cuantos grupos (8-conectados) forman los vecinos marcados de un pixel
  function grupos(v) {
    var visto = [0, 0, 0, 0, 0, 0, 0, 0], g = 0;
    for (var s = 0; s < 8; s++) {
      if (!v[s] || visto[s]) continue;
      g++;
      var pila = [s];
      visto[s] = 1;
      while (pila.length) {
        var a = pila.pop();
        for (var b = 0; b < 8; b++) {
          if (v[b] && !visto[b] && Math.abs(DX[a] - DX[b]) <= 1 && Math.abs(DY[a] - DY[b]) <= 1) {
            visto[b] = 1; pila.push(b);
          }
        }
      }
    }
    return g;
  }

  // ------------------------------------------------------------ caminos
  function recorrer(sk, w, h) {
    var n = w * h, vis = new Uint8Array(n), caminos = [], i;
    var VEC = [-w, 1, w, -1, -w + 1, w + 1, w - 1, -w - 1]; // primero los 4 de lado
    var lista = [];
    for (i = 0; i < n; i++) if (sk[i]) lista.push(i);
    function vecinos(i) {
      var c = 0;
      for (var k = 0; k < 8; k++) c += sk[i + VEC[k]];
      return c;
    }
    // estira el camino c desde su ultimo pixel; true si termina pegado a otro trazo
    function seguir(c, evitar) {
      for (;;) {
        var cur = c[c.length - 1], sig = -1, k, j;
        for (k = 0; k < 8; k++) {
          j = cur + VEC[k];
          if (sk[j] && !vis[j]) { sig = j; break; }
        }
        if (sig >= 0) { vis[sig] = 1; c.push(sig); continue; }
        var L = c.length;
        for (k = 0; k < 8; k++) {
          j = cur + VEC[k];
          if (!sk[j] || !vis[j]) continue;
          if ((L >= 2 && j === c[L - 2]) || (L >= 3 && j === c[L - 3])) continue;
          if (evitar && evitar.indexOf(j) >= 0) continue;
          c.push(j);
          return true;
        }
        return false;
      }
    }
    // primero desde las puntas
    lista.forEach(function (i) {
      if (vis[i] || vecinos(i) !== 1) return;
      vis[i] = 1;
      var c = [i], unido = seguir(c);
      caminos.push({ px: c, libre0: true, libre1: !unido });
    });
    // despues lo que quedo: tramos entre cruces, lazos cerrados y puntos sueltos
    lista.forEach(function (i) {
      if (vis[i]) return;
      vis[i] = 1;
      if (!vecinos(i)) { caminos.push({ px: [i], libre0: true, libre1: true }); return; }
      var ida = [i], u1 = seguir(ida);
      if (ida.length > 3 && ida[ida.length - 1] === i) { caminos.push({ px: ida, cerrado: true }); return; }
      var vuelta = [i], u0 = seguir(vuelta, ida.slice(0, 3));
      caminos.push({ px: vuelta.reverse().concat(ida.slice(1)), libre0: !u0, libre1: !u1 });
    });
    return caminos;
  }

  function suavizar(p, cerrado) {
    var n = p.length;
    if (n < 5) return p;
    var R = 2, o = [];
    for (var i = 0; i < n; i++) {
      if (!cerrado && (i === 0 || i === n - 1)) { o.push(p[i]); continue; }
      var sx = 0, sy = 0, c = 0;
      for (var k = -R; k <= R; k++) {
        var j = i + k;
        if (cerrado) j = ((j % (n - 1)) + (n - 1)) % (n - 1); // el ultimo repite al primero
        else if (j < 0 || j >= n) continue;
        sx += p[j][0]; sy += p[j][1]; c++;
      }
      o.push([sx / c, sy / c]);
    }
    if (cerrado) o[n - 1] = o[0];
    return o;
  }

  function simplificar(p, eps) {
    if (p.length < 3) return p;
    var guardar = new Uint8Array(p.length);
    guardar[0] = guardar[p.length - 1] = 1;
    var pila = [[0, p.length - 1]];
    while (pila.length) {
      var t = pila.pop(), a = t[0], b = t[1];
      if (b - a < 2) continue;
      var ax = p[a][0], ay = p[a][1], bx = p[b][0], by = p[b][1];
      var dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), mx = -1, mi = -1;
      for (var i = a + 1; i < b; i++) {
        var d = L ? Math.abs(dy * (p[i][0] - ax) - dx * (p[i][1] - ay)) / L : Math.hypot(p[i][0] - ax, p[i][1] - ay);
        if (d > mx) { mx = d; mi = i; }
      }
      if (mx > eps) { guardar[mi] = 1; pila.push([a, mi], [mi, b]); }
    }
    return p.filter(function (_, i) { return guardar[i]; });
  }

  function mediana(a) {
    var s = a.slice().sort(function (p, q) { return p - q; });
    return s[s.length >> 1];
  }

  function hex(c) {
    return "#" + c.map(function (v) { return ("0" + Math.round(v).toString(16)).slice(-2); }).join("");
  }

  // ------------------------------------------------------------ analisis
  // op: { sensibilidad: -50..50, detalle: 1..5, suavizado: 0..4, colores: bool }
  async function analizar(el, archivo, op) {
    var img = await cargar(el.fileId, archivo.dataURL);
    var lado = LADOS[Math.max(0, Math.min(4, (op.detalle || 3) - 1))];
    var lec = leerPixeles(img, el, lado), w = lec.w, h = lec.h, d = lec.datos, n = w * h, i;

    var f = colorDeFondo(d, w, h);
    var lumFondo = 0.299 * f[0] + 0.587 * f[1] + 0.114 * f[2];
    var dist = new Float32Array(n);
    for (i = 0; i < n; i++) {
      var dr = d[i * 4] - f[0], dg = d[i * 4 + 1] - f[1], db = d[i * 4 + 2] - f[2];
      dist[i] = Math.min(255, Math.sqrt(dr * dr + dg * dg + db * db));
    }
    dist = desenfocar(dist, w, h);
    var umbral = Math.max(20, otsu(dist)) * (1 - (op.sensibilidad || 0) / 100);
    umbral = Math.max(6, Math.min(250, umbral));
    var m = new Uint8Array(n), x, y;
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x; m[i] = dist[i] > umbral ? 1 : 0; }

    // limpieza: agujeritos dentro de la tinta y manchitas sueltas
    var area = lado * lado;
    var maxAgujero = Math.max(3, Math.round(area * 0.000015));
    var minMancha = Math.max(3, Math.round(area * 0.00001));
    zonas(m, w, h, 0, false, function (px, borde) {
      if (!borde && px.length <= maxAgujero) px.forEach(function (j) { m[j] = 1; });
    });
    zonas(m, w, h, 1, true, function (px) {
      if (px.length < minMancha) px.forEach(function (j) { m[j] = 0; });
    });

    var dt = distancias(m, w, h);
    var sk = adelgazar(m, w, h);
    // el adelgazamiento borra del todo las manchas chicas y compactas (un punto):
    // a esas se les deja un pixel en el centro (el mas alejado del borde)
    zonas(m, w, h, 1, true, function (px) {
      var centro = px[0];
      for (var k = 0; k < px.length; k++) {
        if (sk[px[k]]) return;
        if (dt[px[k]] > dt[centro]) centro = px[k];
      }
      sk[centro] = 1;
    });
    var caminos = recorrer(sk, w, h);

    function radio(j) { return dt[j] / 3; }
    caminos = caminos.filter(function (c) {
      var L = c.px.length;
      if (c.cerrado) return L >= 4;
      var unidos = (c.libre0 ? 0 : 1) + (c.libre1 ? 0 : 1);
      if (unidos === 1) {
        // espina que deja el adelgazamiento: corta y pegada a un trazo grueso
        var pegado = c.libre0 ? c.px[L - 1] : c.px[0];
        return L > Math.max(3, 1.5 * radio(pegado) + 1);
      }
      if (unidos === 2) return L >= 2;
      return true;
    });

    var eps = EPS[Math.max(0, Math.min(4, op.suavizado == null ? 2 : op.suavizado))];
    var paleta = [];
    function colorDe(rgb) {
      if (!op.colores) return TINTA;
      var mx = Math.max(rgb[0], rgb[1], rgb[2]), mn = Math.min(rgb[0], rgb[1], rgb[2]);
      if (mx < 90 && mx - mn < 40) return TINTA;
      // tiza clara sobre pizarron oscuro: en la pizarra va con la tinta comun
      if (lumFondo < 110 && mn > 150 && mx - mn < 50) return TINTA;
      for (var k = 0; k < paleta.length; k++) {
        var p = paleta[k].rgb;
        if (Math.hypot(p[0] - rgb[0], p[1] - rgb[1], p[2] - rgb[2]) < 48) return paleta[k].hex;
      }
      var hx = hex(rgb);
      paleta.push({ rgb: rgb, hex: hx });
      return hx;
    }

    var trazos = caminos.map(function (c) {
      var anchos = [], r = 0, g = 0, b = 0;
      c.px.forEach(function (j) {
        anchos.push(Math.max(1, 2 * radio(j) - 1));
        r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2];
      });
      var k = c.px.length;
      var color = colorDe([r / k, g / k, b / k]);
      var ancho = mediana(anchos);
      var pts = c.px.map(function (j) { var px = j % w; return [px + 0.5, (j - px) / w + 0.5]; });
      pts = simplificar(suavizar(pts, c.cerrado), eps);
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach(function (p) {
        x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
      });
      var ext = Math.max(x1 - x0, y1 - y0);
      if (pts.length < 2 || ext < ancho * 0.8) {
        return { punto: true, centro: [(x0 + x1) / 2, (y0 + y1) / 2], ancho: Math.max(ancho, ext + 1), color: color };
      }
      return { pts: pts, ancho: ancho, color: color };
    });
    return { w: w, h: h, trazos: trazos, demasiados: trazos.length > MAX_TRAZOS };
  }

  // ------------------------------------------------------------ vista previa
  function dibujarVista(lienzo, res) {
    var ctx = lienzo.getContext("2d"), dpr = window.devicePixelRatio || 1;
    var W = lienzo.width / dpr, H = lienzo.height / dpr, k = Math.min(W / res.w, H / res.h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.translate((W - res.w * k) / 2, (H - res.h * k) / 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    res.trazos.forEach(function (t) {
      ctx.strokeStyle = ctx.fillStyle = t.color;
      if (t.punto) {
        ctx.beginPath();
        ctx.arc(t.centro[0] * k, t.centro[1] * k, Math.max(0.6, (t.ancho * k) / 2), 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.lineWidth = Math.max(0.6, t.ancho * k);
      ctx.beginPath();
      t.pts.forEach(function (p, i) { (i ? ctx.lineTo : ctx.moveTo).call(ctx, p[0] * k, p[1] * k); });
      ctx.stroke();
    });
  }

  // ------------------------------------------------------------ elementos
  function base(tipo, p) {
    var ahora = Date.now();
    var e = {
      id: nuevoId(), type: tipo, x: 0, y: 0, width: 0, height: 0, angle: 0,
      strokeColor: TINTA, backgroundColor: "transparent", fillStyle: "solid",
      strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100,
      groupIds: [], frameId: null, index: null, roundness: null,
      seed: rnd(), version: 1, versionNonce: rnd(), isDeleted: false,
      boundElements: null, updated: ahora, created: ahora, link: null, locked: false,
    };
    for (var k in p) e[k] = p[k];
    return e;
  }

  // op.reemplazar: el calco va en el lugar de la imagen (y la imagen se borra);
  // si no, va a la derecha de la imagen.
  function insertar(A, el, res, op) {
    var gid = nuevoId(), ahora = Date.now();
    var sx = Math.abs(el.width) / res.w, sy = Math.abs(el.height) / res.h, esc = (sx + sy) / 2;
    var vx = el.scale && el.scale[0] < 0, vy = el.scale && el.scale[1] < 0;
    var cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    var co = Math.cos(el.angle || 0), si = Math.sin(el.angle || 0);
    var dx = 0;
    if (!op.reemplazar) {
      var ex = Math.abs(el.width) * Math.abs(co) + Math.abs(el.height) * Math.abs(si);
      dx = ex + 40;
    }
    function P(u, v) {
      var lx = (vx ? res.w - u : u) * sx - el.width / 2, ly = (vy ? res.h - v : v) * sy - el.height / 2;
      return [cx + lx * co - ly * si + dx, cy + lx * si + ly * co];
    }
    var marco = op.reemplazar ? el.frameId || null : null;
    var nuevos = res.trazos.map(function (t) {
      var ancho = Math.max(0.5, Math.round(t.ancho * esc * 2) / 2);
      var comun = { strokeColor: t.color, groupIds: [gid], frameId: marco, customData: { pizarra: { tipo: "calcado" } } };
      if (t.punto) {
        var c = P(t.centro[0], t.centro[1]), r = Math.max(0.5, (t.ancho * esc) / 2);
        return base("ellipse", Object.assign(comun, {
          x: c[0] - r, y: c[1] - r, width: 2 * r, height: 2 * r,
          backgroundColor: t.color, strokeWidth: Math.min(1, ancho),
        }));
      }
      var abs = t.pts.map(function (p) { return P(p[0], p[1]); });
      var x0 = abs[0][0], y0 = abs[0][1];
      var pts = abs.map(function (p) { return [p[0] - x0, p[1] - y0]; });
      var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
      return base("line", Object.assign(comun, {
        x: x0, y: y0, points: pts, polygon: false,
        width: Math.max.apply(null, xs) - Math.min.apply(null, xs),
        height: Math.max.apply(null, ys) - Math.min.apply(null, ys),
        strokeWidth: ancho, roundness: pts.length > 2 ? { type: 2 } : null,
        startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null,
      }));
    });
    if (!nuevos.length) return 0;
    var todos = A.getSceneElementsIncludingDeleted();
    if (op.reemplazar) {
      todos = todos.map(function (e) {
        if (e.id !== el.id) return e;
        var b = {};
        for (var k in e) b[k] = e[k];
        b.isDeleted = true; b.version = e.version + 1; b.versionNonce = rnd(); b.updated = ahora;
        return b;
      });
    }
    var sel = {}, grupos = {};
    nuevos.forEach(function (e) { sel[e.id] = true; });
    grupos[gid] = true;
    A.updateScene({
      elements: todos.concat(nuevos),
      appState: { selectedElementIds: sel, selectedGroupIds: grupos, editingGroupId: null },
      captureUpdate: "IMMEDIATELY",
    });
    // si el calco quedo fuera de la vista, se lleva la vista hasta el
    var st = A.getAppState(), z = st.zoom.value;
    var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    nuevos.forEach(function (e) {
      bx0 = Math.min(bx0, e.x - e.width); by0 = Math.min(by0, e.y - e.height);
      bx1 = Math.max(bx1, e.x + e.width); by1 = Math.max(by1, e.y + e.height);
    });
    var vx0 = -st.scrollX, vy0 = -st.scrollY, vx1 = vx0 + st.width / z, vy1 = vy0 + st.height / z;
    if ((bx0 < vx0 || by0 < vy0 || bx1 > vx1 || by1 > vy1) && A.scrollToContent) {
      A.scrollToContent(nuevos, { animate: true });
    }
    return nuevos.length;
  }

  window.__pizarraCalcado = {
    analizar: analizar, insertar: insertar, dibujarVista: dibujarVista, MAX_TRAZOS: MAX_TRAZOS,
  };
})();
