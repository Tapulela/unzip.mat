// Arma dist/unzip.mat.exe: un único ejecutable de Windows que trae Node, el
// servidor (servidor.js + socket.io) y toda la carpeta app/ adentro, así se
// puede usar sin instalar nada y sin internet.
//
// Uso (en Windows, con Node 24 o más nuevo):  npm run exe
//
// Pasos (Node "Single Executable Applications", https://nodejs.org/api/single-executable-applications.html):
//  1. esbuild junta servidor.js y socket.io en un solo archivo CommonJS.
//  2. Se genera la config de SEA con cada archivo de app/ como asset ("app/<ruta>").
//  3. node --experimental-sea-config arma el blob.
//  4. Se copia el node.exe que está corriendo, se le cambia ícono y datos de versión
//     (resedit; esto quita la firma de Node, que igual dejaría de valer).
//  5. postject inyecta el blob en la copia.
//  6. Se escribe el SHA-256 al lado, para poder verificar la descarga.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as esbuild from "esbuild";
import * as ResEdit from "resedit";

const require = createRequire(import.meta.url);
const { inject } = require("postject");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(RAIZ, "app");
const TMP = path.join(RAIZ, "build", "tmp");
const DIST = path.join(RAIZ, "dist");
const EXE = path.join(DIST, "unzip.mat.exe");
const FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

if (process.platform !== "win32") {
  console.error("Este script arma un .exe de Windows: hay que correrlo en Windows.");
  process.exit(1);
}
const [mayor] = process.versions.node.split(".").map(Number);
if (mayor < 24) {
  console.error(`Hace falta Node 24 o más nuevo (está corriendo ${process.version}).`);
  process.exit(1);
}

const paso = (txt) => console.log(`\n> ${txt}`);
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });

paso("Empaquetando servidor.js con esbuild");
const main = path.join(TMP, "servidor.cjs");
await esbuild.build({
  entryPoints: [path.join(RAIZ, "servidor.js")],
  outfile: main,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  // Dependencias opcionales de ws/engine.io: si faltan, se usan alternativas en JS.
  external: ["bufferutil", "utf-8-validate", "uWebSockets.js"],
  logLevel: "warning",
  legalComments: "eof",
});

paso("Listando los archivos de app/");
const assets = {};
const recorrer = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(abs);
    else if (e.isFile()) assets["app/" + path.relative(APP, abs).split(path.sep).join("/")] = abs;
  }
};
recorrer(APP);
console.log(`  ${Object.keys(assets).length} archivos`);

paso("Generando el blob de SEA");
const blob = path.join(TMP, "sea-prep.blob");
const config = path.join(TMP, "sea-config.json");
fs.writeFileSync(
  config,
  JSON.stringify(
    { main, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, assets },
    null,
    2,
  ),
);
execFileSync(process.execPath, ["--experimental-sea-config", config], { stdio: "inherit" });

paso("Copiando node.exe e inyectando el blob con postject");
fs.rmSync(EXE, { force: true });
fs.copyFileSync(process.execPath, EXE);
await inject(EXE, "NODE_SEA_BLOB", fs.readFileSync(blob), { sentinelFuse: FUSE });

// Después de postject: resedit conserva el recurso NODE_SEA_BLOB al reescribir
// los recursos (al revés, postject no entiende el archivo que deja resedit).
paso("Poniéndole ícono y versión");
const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
const version = (paquete.version + ".0.0.0").split(".").slice(0, 4).map(Number);
const exe = ResEdit.NtExecutable.from(fs.readFileSync(EXE), { ignoreCert: true });
const recursos = ResEdit.NtExecutableResource.from(exe);
const icono = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(APP, "favicon.ico")));
const grupos = ResEdit.Resource.IconGroupEntry.fromEntries(recursos.entries);
const grupo = grupos[0] || { id: 1, lang: 1033 };
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  recursos.entries,
  grupo.id,
  grupo.lang,
  icono.icons.map((i) => i.data),
);
const [info] = ResEdit.Resource.VersionInfo.fromEntries(recursos.entries);
if (info) {
  for (const lang of info.getAllLanguagesForStringValues()) {
    info.setStringValues(lang, {
      CompanyName: "unzip.mat",
      FileDescription: "unzip.mat - pizarra para clases de matemática",
      ProductName: "unzip.mat",
      InternalName: "unzip.mat",
      OriginalFilename: "unzip.mat.exe",
      LegalCopyright: "MIT. Basado en Excalidraw (MIT) y Node.js (MIT).",
      FileVersion: version.join("."),
      ProductVersion: version.join("."),
    });
  }
  info.setFileVersion(...version);
  info.setProductVersion(...version);
  info.outputToResourceEntries(recursos.entries);
}
recursos.outputResource(exe);
fs.writeFileSync(EXE, Buffer.from(exe.generate()));

paso("Probando que el ejecutable arranque");
const salida = execFileSync(EXE, [], {
  env: { ...process.env, UNZIPMAT_PRUEBA: "1" },
  encoding: "utf8",
  timeout: 30000,
});
if (!salida.includes("unzip.mat prueba ok")) {
  console.error("El ejecutable no respondió como se esperaba:\n" + salida);
  process.exit(1);
}

paso("Calculando SHA-256");
const datos = fs.readFileSync(EXE);
const hash = createHash("sha256").update(datos).digest("hex");
fs.writeFileSync(EXE + ".sha256", `${hash}  unzip.mat.exe\n`);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\nListo: ${path.relative(RAIZ, EXE)} (${(datos.length / 1048576).toFixed(1)} MB)`);
console.log(`SHA-256: ${hash}`);
