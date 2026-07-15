export function isAdminEmail(email?: string | null) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;

  const hardcoded = ["rubenfiverr612@gmail.com", "rubenvidal612@gmail.com"];
  const raw =
    (typeof process !== "undefined" && process?.env && (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL)) || "";
  const list = String(raw)
    .split(/[,\s]+/g)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  const allowed = new Set([...hardcoded, ...list]);
  return allowed.has(e);
}
