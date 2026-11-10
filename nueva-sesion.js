// Genera el link de una sesion compartida nueva, con el mismo formato que usa
// Excalidraw al tocar "Start session": #room=<id de sala>,<clave de cifrado>.
// Uso: node nueva-sesion.js   (lo llama "Iniciar pizarra.bat")
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const sala = crypto.randomBytes(10).toString("hex"); // 20 caracteres, como Excalidraw
const clave = crypto.randomBytes(16).toString("base64url"); // clave AES-128 (22 caracteres)

process.stdout.write(`http://localhost:${PORT}/#room=${sala},${clave}\n`);
