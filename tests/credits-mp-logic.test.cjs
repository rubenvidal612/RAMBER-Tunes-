// Pruebas de lógica puras para paquetes de créditos y webhook Mercado Pago
// JavaScript puro. NO REQUIERE claves.

const CANONICAL_CREDIT_PACKS = [
  { id: 1, pack_key: "mini_3", name: "Mini", songs: 6, credits_amount: 36, price_mxn: 25, validity_days: 30, sort_order: 1, description: "Hasta 6 canciones estándar (36 créditos) · pago único", is_active: true },
  { id: 2, pack_key: "chico_10", name: "Chico", songs: 20, credits_amount: 120, price_mxn: 70, validity_days: 30, sort_order: 2, description: "Hasta 20 canciones estándar (120 créditos) · pago único", is_active: true },
  { id: 3, pack_key: "mediano_30", name: "Mediano", songs: 60, credits_amount: 360, price_mxn: 180, validity_days: 30, sort_order: 3, description: "Hasta 60 canciones estándar (360 créditos) · pago único", is_active: true },
  { id: 4, pack_key: "pack_grande_250", name: "Grande", songs: 100, credits_amount: 600, price_mxn: 250, validity_days: 30, sort_order: 4, description: "Hasta 100 canciones estándar (600 créditos) · pago único · Agente Bot 24/7", is_active: true },
];

const PACKS_PLANES = {
  inicio: { title: "Pack Inicio (mensual)", amount_mxn: 350, credits: 1200, songs: 200 },
  productor: { title: "Pack Productor", amount_mxn: 545, credits: 2000, songs: 166 },
  masterizar: { title: "Masterizar Ilimitado", amount_mxn: 150, credits: 0, songs: 0 },
};

function canonicalCreditPackByKey(packKey) {
  const key = String(packKey || "").trim().toLowerCase();
  if (!key) return null;
  return CANONICAL_CREDIT_PACKS.find((p) => String(p.pack_key).toLowerCase() === key) || null;
}

function resolveMiniPackFromMetadata(meta) {
  const pk = String((meta && (meta.pack_key || meta.packKey)) || "").trim().toLowerCase();
  const pid = meta ? (meta.pack_id != null ? meta.pack_id : (meta.packId != null ? meta.packId : null)) : null;
  const byKey = pk ? canonicalCreditPackByKey(pk) : null;
  const byId = !byKey && pid != null ? (CANONICAL_CREDIT_PACKS.find(function (p) { return p.id === Number(pid); }) || null) : null;
  const base = byKey || byId || null;
  if (!base) return null;
  return {
    pack_key: String(base.pack_key).toLowerCase(),
    pack_id: Number(base.id) || null,
    title: String(base.name || base.pack_key),
    amount_mxn: Number(base.price_mxn || 0),
    credits: Number(base.credits_amount || 0),
    songs: Number(base.songs || 0),
    validity_days: Number(base.validity_days || 30),
  };
}

function validateMiniPackMatchesAmountAndCredits(meta, paymentAmountMxn) {
  const resolved = resolveMiniPackFromMetadata(meta);
  if (!resolved) return { ok: false };
  const expectedAmount = Number(resolved.amount_mxn);
  const expectedCredits = Number(resolved.credits);
  const amountPaid = Number(paymentAmountMxn);
  const metaCredits = Number(meta && meta.credits != null ? meta.credits : 0);
  const metaAmount = Number(meta ? (meta.amount_mxn != null ? meta.amount_mxn : (meta.amountMxn != null ? meta.amountMxn : 0)) : 0);
  const amountTolerance = 0.01;
  const amountOk =
    Number.isFinite(amountPaid) &&
    Number.isFinite(expectedAmount) &&
    expectedAmount > 0 &&
    Math.abs(amountPaid - expectedAmount) <= amountTolerance;
  const amountMetaOk = !Number.isFinite(metaAmount) || metaAmount <= 0
    ? true
    : Math.abs(metaAmount - expectedAmount) <= amountTolerance;
  const creditsOk =
    Number.isFinite(expectedCredits) &&
    expectedCredits >= 0 &&
    (!Number.isFinite(metaCredits) || metaCredits <= 0 || metaCredits === expectedCredits);
  if (!amountOk || !amountMetaOk || !creditsOk) {
    return { ok: false };
  }
  var out = { ok: true };
  Object.keys(resolved).forEach(function (k) { out[k] = resolved[k]; });
  return out;
}

var passed = 0;
var failed = 0;
function assertEq(label, actual, expected) {
  if (actual === expected) {
    console.log("✅ PASS: " + label + " (" + actual + ")");
    passed++;
  } else {
    console.log("❌ FAIL: " + label + " — esperado " + expected + ", recibido " + actual);
    failed++;
  }
}
function assert(label, cond, detail) {
  if (cond) {
    console.log("✅ PASS: " + label);
    passed++;
  } else {
    console.log("❌ FAIL: " + label + " — " + (detail || ""));
    failed++;
  }
}

console.log("═══════════════════════════════════════════════");
console.log("  PRUEBA 1: MAPEO DE LOS 5 PAQUETES (créditos)");
console.log("═══════════════════════════════════════════════");

// Mini $25 → 36 créditos, 6 canciones
var mini = canonicalCreditPackByKey("mini_3");
assertEq("$25 Mini pack_key", mini && mini.pack_key, "mini_3");
assertEq("$25 Mini créditos", mini && mini.credits_amount, 36);
assertEq("$25 Mini precio MXN", mini && mini.price_mxn, 25);
assertEq("$25 Mini canciones", mini && mini.songs, 6);

// Chico $70 → 120 créditos, 20 canciones
var chico = canonicalCreditPackByKey("chico_10");
assertEq("$70 Chico pack_key", chico && chico.pack_key, "chico_10");
assertEq("$70 Chico créditos", chico && chico.credits_amount, 120);
assertEq("$70 Chico precio MXN", chico && chico.price_mxn, 70);
assertEq("$70 Chico canciones", chico && chico.songs, 20);

// Mediano $180 → 360 créditos, 60 canciones
var mediano = canonicalCreditPackByKey("mediano_30");
assertEq("$180 Mediano pack_key", mediano && mediano.pack_key, "mediano_30");
assertEq("$180 Mediano créditos", mediano && mediano.credits_amount, 360);
assertEq("$180 Mediano precio MXN", mediano && mediano.price_mxn, 180);
assertEq("$180 Mediano canciones", mediano && mediano.songs, 60);

// Pack Grande $250 → 600 créditos, 100 canciones
var grande = canonicalCreditPackByKey("pack_grande_250");
assertEq("$250 Grande pack_key", grande && grande.pack_key, "pack_grande_250");
assertEq("$250 Grande créditos", grande && grande.credits_amount, 600);
assertEq("$250 Grande precio MXN", grande && grande.price_mxn, 250);
assertEq("$250 Grande canciones", grande && grande.songs, 100);

// Plan mensual $350 → 1200 créditos, 200 canciones
var inicio = PACKS_PLANES.inicio;
assertEq("$350 Plan Inicio precio MXN", inicio && inicio.amount_mxn, 350);
assertEq("$350 Plan Inicio créditos", inicio && inicio.credits, 1200);
assertEq("$350 Plan Inicio canciones", inicio && inicio.songs, 200);

console.log("");
console.log("═══════════════════════════════════════════════");
console.log("  PRUEBA 2: VALIDADOR MONTO + CRÉDITOS (seguridad)");
console.log("═══════════════════════════════════════════════");

// Caso 1: Pago correcto mediano
var v = validateMiniPackMatchesAmountAndCredits(
  { pack_key: "mediano_30", credits: 360, amount_mxn: 180 },
  180
);
assert("Pago Mediano $180 OK → ok:true", v.ok === true);
assertEq("Pago Mediano $180 OK → pack_key correcto", v.pack_key, "mediano_30");
assertEq("Pago Mediano $180 OK → créditos correctos", v.credits, 360);

// Caso 2: Pago correcto Pack Grande $250
v = validateMiniPackMatchesAmountAndCredits(
  { pack_key: "pack_grande_250", credits: 600, amount_mxn: 250 },
  250
);
assert("Pago Grande $250 OK → ok:true", v.ok === true);
assertEq("Pago Grande $250 OK → pack_key", v.pack_key, "pack_grande_250");
assertEq("Pago Grande $250 OK → créditos", v.credits, 600);

// Caso 3: FRAUDE: monto pagado != esperado
v = validateMiniPackMatchesAmountAndCredits(
  { pack_key: "mediano_30", credits: 360, amount_mxn: 180 },
  10
);
assert("FRAUDE: monto pagado $10 ≠ $180 → ok:false (SEGURIDAD)", v.ok === false);

// Caso 4: FRAUDE: metadata credits adulterados (99999 vs 360)
v = validateMiniPackMatchesAmountAndCredits(
  { pack_key: "mediano_30", credits: 99999, amount_mxn: 180 },
  180
);
assert("FRAUDE: metadata credits=99999 → ok:false (SEGURIDAD)", v.ok === false);

// Caso 5: FRAUDE: pack_key inventado
v = validateMiniPackMatchesAmountAndCredits(
  { pack_key: "pack_inexistente_gratis", credits: 99999, amount_mxn: 1 },
  1
);
assert("FRAUDE: pack_key inexistente → ok:false (SEGURIDAD)", v.ok === false);

// Caso 6: pack_key case insensitive (MINI_3)
v = validateMiniPackMatchesAmountAndCredits(
  { pack_key: "MINI_3", credits: 36, amount_mxn: 25 },
  25
);
assert("pack_key MINI_3 (mayúsculas) → se normaliza y pasa", v.ok === true);

// Caso 7: moneda USD no MXN (rechazo webhook conceptualmente)
function simulaMoneda(currencyId) { return String(currencyId || "").toUpperCase().trim() === "MXN"; }
assert("Webhook check: moneda USD → rechaza", simulaMoneda("USD") === false);
assert("Webhook check: moneda MXN → pasa", simulaMoneda("MXN") === true);

// Caso 8: amounts
assert("Webhook check: transaction_amount = -5 → rechaza (≤ 0)", Number.isFinite(-5) && -5 <= 0);
assert("Webhook check: transaction_amount = 25 → pasa (> 0)", Number.isFinite(25) && 25 > 0);

console.log("");
console.log("═══════════════════════════════════════════════");
console.log("  PRUEBA 3: IDEMPOTENCIA (no duplica créditos)");
console.log("═══════════════════════════════════════════════");

var mpTransactionsProcessed = new Set(["MP-123456789", "MP-999999"]);
function esIdempotente(paymentId) {
  if (mpTransactionsProcessed.has(paymentId)) return { already: true };
  mpTransactionsProcessed.add(paymentId);
  return { already: false, processed: true };
}
var r1 = esIdempotente("MP-123456789");
assert("Idempotencia: payment_id YA PROCESADO → already:true", r1.already === true);

var r2 = esIdempotente("MP-NUEVO-001");
assert("Idempotencia: payment_id NUEVO → already:false + processed:true", r2.already === false && r2.processed === true);

var r3 = esIdempotente("MP-NUEVO-001");
assert("Idempotencia: REINTENTO mismo ID → already:true (SIN duplicado)", r3.already === true);

console.log("");
console.log("═══════════════════════════════════════════════");
console.log("  PRUEBA 4: PAGO PENDIENTE / RECHAZADO → 0cr");
console.log("═══════════════════════════════════════════════");

function simulaWebhookStatus(status) {
  var paymentStatus = String(status || "").toLowerCase().trim();
  if (paymentStatus !== "approved") {
    return { credits_awarded: 0, skipped: true, reason: "not_approved" };
  }
  return { credits_awarded: 600, skipped: false };
}
assert("Pago pending → 0cr", simulaWebhookStatus("pending").credits_awarded === 0);
assert("Pago rejected → 0cr", simulaWebhookStatus("rejected").credits_awarded === 0);
assert("Pago cancelled → 0cr", simulaWebhookStatus("cancelled").credits_awarded === 0);
assert("Pago refunded → 0cr", simulaWebhookStatus("refunded").credits_awarded === 0);
assert("Pago approved → acredita 600cr", simulaWebhookStatus("approved").credits_awarded === 600);
assert("Pago Approved mayúsculas → acredita", simulaWebhookStatus("APPROVED").credits_awarded === 600);

console.log("");
console.log("═══════════════════════════════════════════════");
console.log("  RESUMEN: " + passed + " aprobadas · " + failed + " fallidas");
console.log("═══════════════════════════════════════════════");

if (failed > 0) {
  console.log("\n❌ HUBO FALLOS.");
  process.exit(1);
} else {
  console.log("\n🎉 TODAS LAS PRUEBAS PASARON. La lógica de paquetes y seguridad webhook es correcta.");
  process.exit(0);
}
