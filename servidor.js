// Servidor local de Excalidraw: sirve la pizarra y sincroniza las ventanas
// sin pasar por internet. Uso: node servidor.js  (puerto 3000 por defecto)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, "app");

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
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  let file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(file, (err, st) => {
    if (err && path.extname(file)) {
      // algunos recursos (fuentes) se piden desde /assets/ pero están en la raíz
      const alt = path.join(ROOT, path.basename(file));
      if (fs.existsSync(alt)) file = alt;
    } else if (err || st.isDirectory()) {
      file = path.join(ROOT, "index.html");
    }
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(404);
        return res.end("No encontrado");
      }
      res.writeHead(200, {
        "Content-Type":
          TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
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
  for (const evento of ["camara-estado", "camara-mover", "camara-pedir"]) {
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

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("  Pizarra local lista.");
  console.log(`  Abri en el navegador:  http://localhost:${PORT}`);
  console.log("");
  console.log("  No cierres esta ventana mientras grabas.");
  console.log("");
});
