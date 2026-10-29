/**
 * Pega tus claves de R2 en el .env sin editarlo a mano.
 *
 * Uso (en PowerShell normal, NO dentro del agente):
 *   node tools/pegar-claves.cjs
 *
 * Te va a pedir 3 valores, uno por uno. Solo pega y dale Enter.
 */

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const ENV_PATH = path.join(process.cwd(), ".env");

const CAMPOS = [
  { key: "R2_ACCOUNT_ID", pista: "Vercel → R2_ACCOUNT_ID → ⋯ → Copy value" },
  { key: "R2_ACCESS_KEY_ID", pista: "Vercel → R2_ACCESS_KEY_ID → ⋯ → Copy value" },
  { key: "R2_SECRET_ACCESS_KEY", pista: "Vercel → R2_SECRET_ACCESS_KEY → ⋯ → Copy value" },
];

function preguntar(rl, texto) {
  return new Promise((resolve) => rl.question(texto, (v) => resolve(String(v || "").trim())));
}

(async () => {
  console.log("");
  console.log("==========================================================");
  console.log("  CONFIGURAR LAS CLAVES DE R2");
  console.log("==========================================================");
  console.log("");
  console.log("  Vas a pegar 3 valores que estan en Vercel.");
  console.log("  Para copiar cada uno: pasa el mouse sobre la fila,");
  console.log("  clic en los 3 puntos (...) y elige 'Copy value'.");
  console.log("");
  console.log("  Despues de copiar, aqui solo pega (clic derecho) y Enter.");
  console.log("");
  console.log("----------------------------------------------------------");

  if (!fs.existsSync(ENV_PATH)) {
    console.error("\n  ERROR: no encontre el archivo .env en esta carpeta.");
    console.error("  Asegurate de estar en: ...\\RAMBER-Tunes-real\n");
    process.exit(1);
  }

  let original = fs.readFileSync(ENV_PATH, "utf8");
  const respaldo = ENV_PATH + ".antes-de-claves";
  fs.writeFileSync(respaldo, original, "utf8");
  console.log(`  (respaldo guardado en: ${path.basename(respaldo)})`);
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const nuevos = {};

  for (const campo of CAMPOS) {
    console.log("");
    console.log(`  ${campo.key}`);
    console.log(`     ${campo.pista}`);
    let valor = "";
    while (!valor) {
      valor = await preguntar(rl, "     Pega aqui y Enter: ");
      if (!valor) console.log("     (vacio, intenta otra vez)");
    }
    nuevos[campo.key] = valor;
    console.log("     guardado ✓");
  }

  rl.close();

  console.log("");
  console.log("----------------------------------------------------------");

  // reescribir cada clave en el .env (o agregarla si no existe)
  let lineas = original.split(/\r?\n/);
  for (const campo of CAMPOS) {
    const valor = nuevos[campo.key];
    const idx = lineas.findIndex((l) => new RegExp(`^\\s*${campo.key}\\s*=`).test(l));
    const nueva = `${campo.key}="${valor}"`;
    if (idx >= 0) lineas[idx] = nueva;
    else lineas.push(nueva);
  }

  // si R2_ENDPOINT tiene la plantilla sin expandir, la reescribimos
  const acct = nuevos.R2_ACCOUNT_ID;
  const idxEnd = lineas.findIndex((l) => /^\s*R2_ENDPOINT\s*=/.test(l));
  const endpoint = `https://${acct}.r2.cloudflarestorage.com`;
  if (idxEnd >= 0) lineas[idxEnd] = `R2_ENDPOINT="${endpoint}"`;
  else lineas.push(`R2_ENDPOINT="${endpoint}"`);

  fs.writeFileSync(ENV_PATH, lineas.join("\n"), "utf8");

  console.log("");
  console.log("  LISTO. Tus claves quedaron guardadas en el .env");
  console.log("");
  console.log("  Ahora corre esto para probar con UNA cancion:");
  console.log("");
  console.log("     node tools/watermark-local.cjs --limit=1");
  console.log("");
  console.log("==========================================================");
  console.log("");
})();
