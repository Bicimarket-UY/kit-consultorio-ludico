import { db } from "../src/db.js";
const email = String(process.argv[2] || "")
  .trim()
  .toLowerCase();
if (!email) {
  console.error(
    "Uso: npm run admin -- correo@ejemplo.com (primero registrá la cuenta en la web).",
  );
  process.exit(1);
}
const result = db
  .prepare("UPDATE users SET role='admin' WHERE email=?")
  .run(email);
if (!result.changes) {
  console.error("La cuenta no existe. Registrala antes de otorgar el rol.");
  process.exitCode = 1;
} else console.log("Rol administrador otorgado. Volvé a ingresar a la web.");
db.close();
