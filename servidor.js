// Servidor local de Excalidraw: sirve la pizarra y sincroniza las ventanas
// sin pasar por internet. Uso: node servidor.js  (puerto 3000 por defecto)
//   node servidor.js --abrir   además crea una sesión compartida nueva, copia el
//                              link y lo abre en el navegador.
// Dentro de unzip.mat.exe (Node SEA, ver build/armar-exe.js) los archivos de app/
// van embebidos en el ejecutable y siempre se abre una sesión nueva.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, "app");

let sea = null;
try {
  sea = require("node:sea");
  if (!sea.isSea()) sea = null;
} catch (e) {
  sea = null;
}
// UNZIPMAT_NO_ABRIR=1 evita abrir el navegador (para probar el .exe).
const ABRIR =
  (!!sea || process.argv.includes("--abrir")) && !process.env.UNZIPMAT_NO_ABRIR;

// Lee un archivo de app/ por su ruta relativa ("assets/x.js"). Devuelve un
// Buffer o null si no existe (o es una carpeta).
const ASSETS = sea ? new Set(sea.getAssetKeys()) : null;
const leer = (rel, cb) => {
  if (ASSETS) {
    const clave = "app/" + rel;
    return cb(ASSETS.has(clave) ? Buffer.from(sea.getRawAsset(clave)) : null);
  }
  const file = path.join(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return cb(null);
  fs.readFile(file, (err, data) => cb(err ? null : data));
};

// Prueba rápida que usa build/armar-exe.mjs después de armar el .exe.
if (sea && process.env.UNZIPMAT_PRUEBA) {
  leer("index.html", (data) => {
    if (data && data.includes("unzip.mat")) {
      console.log(`unzip.mat prueba ok (${ASSETS.size} archivos)`);
      process.exit(0);
    }
    console.log("unzip.mat prueba fallida: falta index.html");
    process.exit(1);
  });
  return;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

// Imagenes pegadas en la pizarra (llegan cifradas). Se guardan en memoria
// mientras el servidor esta abierto.
const archivos = new Map();
const MAX_ARCHIVO = 25 * 1024 * 1024;

const manejarArchivo = (req, res, clave) => {
  if (req.method === "PUT") {
    const partes = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > MAX_ARCHIVO) {
        res.writeHead(413);
        res.end();
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      archivos.set(clave, Buffer.concat(partes));
      res.writeHead(200);
      res.end();
    });
    return;
  }
  const datos = archivos.get(clave);
  if (!datos) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "Content-Type": "application/octet-stream" });
  res.end(datos);
};

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/archivos/")) {
    return manejarArchivo(req, res, req.url.split("?")[0]);
  }
  // app/entorno.js dice "sin servidor" (para hosting estático como GitHub
  // Pages); este servidor cambia esa bandera para habilitar colaboración y cámara.
  // Permite reconocer si el puerto ya lo usa otra instancia de unzip.mat.
  if (req.url === "/__unzipmat") {
    res.writeHead(200, { "Content-Type": TYPES[".txt"] });
    return res.end("unzip.mat");
  }
  if (req.url.split("?")[0] === "/entorno.js") {
    return leer("entorno.js", (data) => {
      if (!data) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, {
        "Content-Type": TYPES[".js"],
        "Cache-Control": "no-cache",
      });
      res.end(
        data
          .toString("utf8")
          .replace(
            "window.PIZARRA_SIN_SERVIDOR = true;",
            "window.PIZARRA_SIN_SERVIDOR = false;",
          ),
      );
    });
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]).replace(/\\/g, "/");
  } catch (e) {
    res.writeHead(400);
    return res.end();
  }
  const rel = path.posix.normalize("/" + urlPath).slice(1);
  if (rel.startsWith("..")) {
    res.writeHead(403);
    return res.end();
  }
  const responder = (archivo, data) => {
    res.writeHead(200, {
      "Content-Type":
        TYPES[path.extname(archivo).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  };
  const indice = () =>
    leer("index.html", (data) => {
      if (!data) {
        res.writeHead(404);
        return res.end("No encontrado");
      }
      responder("index.html", data);
    });
  if (!rel || rel.endsWith("/")) return indice();
  leer(rel, (data) => {
    if (data) return responder(rel, data);
    if (!path.extname(rel)) return indice();
    // algunos recursos (fuentes) se piden desde /assets/ pero están en la raíz
    const alt = path.posix.basename(rel);
    leer(alt, (data2) => {
      if (data2) return responder(alt, data2);
      res.writeHead(404);
      res.end("No encontrado");
    });
  });
});

// Lógica del servidor de colaboración (igual a excalidraw-room)
const io = new Server(server, {
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 20e6,
});

io.on("connection", (socket) => {
  io.to(socket.id).emit("init-room");

  socket.on("join-room", async (roomID) => {
    await socket.join(roomID);
    const sockets = await io.in(roomID).fetchSockets();
    if (sockets.length <= 1) {
      io.to(socket.id).emit("first-in-room");
    } else {
      socket.broadcast.to(roomID).emit("new-user", socket.id);
    }
    io.in(roomID).emit("room-user-change", sockets.map((s) => s.id));
  });

  socket.on("server-broadcast", (roomID, data, iv) => {
    socket.broadcast.to(roomID).emit("client-broadcast", data, iv);
  });

  socket.on("server-volatile-broadcast", (roomID, data, iv) => {
    socket.volatile.broadcast.to(roomID).emit("client-broadcast", data, iv);
  });

  // Camara remota (app/camara.js): la ventana proyectada informa su vista y la
  // ventana de edicion la mueve. Canal propio por sala, sin cifrar (todo local).
  socket.on("camara-unirse", (roomID) => {
    if (typeof roomID === "string") socket.join(`camara@${roomID}`);
  });
  for (const evento of ["camara-estado", "camara-mover", "camara-pedir", "camara-rol"]) {
    socket.on(evento, (roomID, datos) => {
      if (typeof roomID !== "string") return;
      socket.broadcast.to(`camara@${roomID}`).emit(evento, datos);
    });
  }

  socket.on("user-follow", async (payload) => {
    const roomID = `follow@${payload.userToFollow.socketId}`;
    if (payload.action === "FOLLOW") await socket.join(roomID);
    else await socket.leave(roomID);
    const sockets = await io.in(roomID).fetchSockets();
    io.to(payload.userToFollow.socketId).emit(
      "user-follow-room-change",
      sockets.map((s) => s.id),
    );
  });

  socket.on("disconnecting", async () => {
    for (const roomID of Array.from(socket.rooms)) {
      const others = (await io.in(roomID).fetchSockets()).filter(
        (s) => s.id !== socket.id,
      );
      const isFollowRoom = roomID.startsWith("follow@");
      if (!isFollowRoom && others.length > 0) {
        socket.broadcast
          .to(roomID)
          .emit("room-user-change", others.map((s) => s.id));
      }
      if (isFollowRoom && others.length === 0) {
        io.to(roomID.replace("follow@", "")).emit("broadcast-unfollow");
      }
    }
  });
});

// Link de una sesión compartida nueva, con el formato de Excalidraw al tocar
// "Start session": #room=<id de sala>,<clave de cifrado> (igual que nueva-sesion.js).
const nuevaSesion = (puerto) => {
  const sala = crypto.randomBytes(10).toString("hex");
  const clave = crypto.randomBytes(16).toString("base64url");
  return `http://localhost:${puerto}/#room=${sala},${clave}`;
};

const abrirSesion = (puerto) => {
  const link = nuevaSesion(puerto);
  console.log("  Sesion compartida nueva:");
  console.log(`  ${link}`);
  if (process.platform === "win32") {
    try {
      const clip = spawn("clip", [], { stdio: ["pipe", "ignore", "ignore"] });
      clip.on("error", () => {});
      clip.stdin.end(link);
      console.log("  El link ya esta copiado: pegalo en la otra ventana.");
    } catch (e) {}
    try {
      spawn("cmd", ["/c", "start", '""', link], {
        stdio: "ignore",
        detached: true,
        windowsVerbatimArguments: true,
      })
        .on("error", () => {})
        .unref();
    } catch (e) {}
  }
  console.log("");
};

// ¿El puerto lo está usando otra instancia de unzip.mat?
const esUnzipMat = (puerto) =>
  new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: puerto, path: "/__unzipmat", timeout: 1500 },
      (res) => {
        let txt = "";
        res.on("data", (c) => (txt += c));
        res.on("end", () => resolve(txt === "unzip.mat"));
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
  });

// Si la ventana se abrió con doble clic, se cierra al terminar: se espera un
// rato para que se pueda leer el mensaje.
const salir = (codigo, ms) => setTimeout(() => process.exit(codigo), ms);

const escuchar = (puerto, intentos) => {
  const alFallar = async (err) => {
    server.off("listening", alEscuchar);
    if (err.code !== "EADDRINUSE") {
      console.error(`  No se pudo iniciar el servidor: ${err.message}`);
      return salir(1, sea ? 15000 : 0);
    }
    if (await esUnzipMat(puerto)) {
      console.log("");
      console.log(`  unzip.mat ya esta abierto (puerto ${puerto}).`);
      if (ABRIR) abrirSesion(puerto);
      console.log("  Esta ventana se cierra sola.");
      return salir(0, sea ? 8000 : 0);
    }
    if (intentos <= 1) {
      console.error(`  El puerto ${puerto} esta ocupado por otro programa.`);
      return salir(1, sea ? 15000 : 0);
    }
    console.log(`  El puerto ${puerto} esta ocupado; probando ${puerto + 1}...`);
    escuchar(puerto + 1, intentos - 1);
  };
  const alEscuchar = () => {
    server.off("error", alFallar);
    console.log("");
    console.log("  unzip.mat listo.");
    console.log(`  Abri en el navegador:  http://localhost:${puerto}`);
    console.log("");
    if (ABRIR) abrirSesion(puerto);
    console.log("  No cierres esta ventana mientras uses la pizarra.");
    console.log("");
  };
  server.once("error", alFallar);
  server.once("listening", alEscuchar);
  server.listen(puerto, "127.0.0.1");
};

escuchar(PORT, 10);
