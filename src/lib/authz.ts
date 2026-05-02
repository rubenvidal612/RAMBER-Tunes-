export function isAdminEmail(email?: string | null) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;

  const raw =
    (typeof process !== "undefined" && process?.env && (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL)) || "";
  const list = String(raw)
    .split(/[,\s]+/g)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  if (list.length === 0) return false;
  return list.includes(e);
}
