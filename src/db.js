import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defaults, initialResources } from "./core.js";
export const dataDir = resolve(process.env.DATA_DIR || "data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
mkdirSync(resolve(dataDir, "files"), { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(resolve(dataDir, "app.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'buyer', created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), plan TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'UYU', status TEXT NOT NULL, provider TEXT NOT NULL, payment_id TEXT UNIQUE, preference_id TEXT, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, value TEXT NOT NULL, created TEXT NOT NULL);
`);
db.prepare("INSERT OR IGNORE INTO settings VALUES (?,?)").run(
  "config",
  JSON.stringify(defaults),
);
for (const r of initialResources)
  db.prepare("INSERT OR IGNORE INTO resources VALUES (?,?)").run(
    r.id,
    JSON.stringify(r),
  );
export const config = () =>
  JSON.parse(
    db.prepare("SELECT value FROM settings WHERE id=?").get("config").value,
  );
export const resources = () =>
  db
    .prepare("SELECT value FROM resources")
    .all()
    .map((r) => JSON.parse(r.value));
export function entitlement(userId) {
  const rows = db
    .prepare("SELECT plan FROM orders WHERE user_id=? AND status='approved'")
    .all(userId);
  return rows.some((r) => r.plan === "complete")
    ? "complete"
    : rows.length
      ? "essential"
      : null;
}
