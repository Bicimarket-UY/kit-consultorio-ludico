import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { once } from "node:events";
import { createServer } from "node:net";
let child, dir, base, database;
let buyer, admin, csrfBuyer, csrfAdmin;
async function request(
  path,
  { cookie, csrf, method = "GET", data, origin = base } = {},
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...(data ? { "Content-Type": "application/json", Origin: origin } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  let body;
  try {
    body = await r.json();
  } catch {}
  return { r, body, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "kit-test-"));
  const socket = createServer();
  socket.listen(0);
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  base = `http://localhost:${port}`;
  child = spawn(process.execPath, ["src/server.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      APP_ORIGIN: base,
      DATA_DIR: dir,
      MP_ACCESS_TOKEN: "",
      MP_WEBHOOK_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  child.stderr.on("data", (d) => (errors += d));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error(errors || "Server did not start")),
      10000,
    );
    child.stdout.on("data", () => {
      clearTimeout(timer);
      resolve();
    });
    child.on("error", reject);
  });
  database = new DatabaseSync(join(dir, "app.sqlite"));
});
after(async () => {
  database?.close();
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  await rm(dir, { recursive: true, force: true });
});
test("rutas privadas, flujo de cuenta, CSRF y entrega protegida", async () => {
  for (const p of [
    "/api/library",
    "/api/admin",
    "/api/files/anamnesis",
    "/api/orders",
  ])
    assert.equal((await request(p)).r.status, 401);
  let result = await request("/api/register", {
    method: "POST",
    data: {
      email: "buyer@example.com",
      password: "contraseña segura 123",
      role: "admin",
    },
  });
  assert.equal(result.r.status, 200);
  buyer = result.cookie;
  csrfBuyer = result.body.csrf;
  result = await request("/api/me", { cookie: buyer });
  assert.equal(result.body.user.role, "buyer");
  assert.equal(result.body.plan, null);
  assert.equal((await request("/api/admin", { cookie: buyer })).r.status, 403);
  assert.equal(
    (await request("/api/logout", { cookie: buyer, method: "POST", data: {} }))
      .r.status,
    403,
  );
  assert.equal(
    (
      await request("/api/logout", {
        cookie: buyer,
        csrf: csrfBuyer,
        method: "POST",
        data: {},
        origin: "https://evil.example",
      })
    ).r.status,
    403,
  );
  result = await request("/api/library", { cookie: buyer });
  assert.deepEqual(result.body.resources, []);
  assert.equal(
    (await request("/api/files/emociones", { cookie: buyer })).r.status,
    403,
  );
  assert.equal(
    (
      await request("/api/checkout", {
        cookie: buyer,
        csrf: csrfBuyer,
        method: "POST",
        data: { plan: "essential", country: "UY", currency: "UYU", amount: 1 },
      })
    ).r.status,
    503,
  );
  assert.equal(database.prepare("SELECT count(*) AS n FROM orders").get().n, 0);
  assert.equal(
    (await request("/api/me?status=approved&plan=complete", { cookie: buyer }))
      .body.plan,
    null,
  );
  result = await request("/api/register", {
    method: "POST",
    data: { email: "admin@example.com", password: "otra contraseña 123" },
  });
  admin = result.cookie;
  csrfAdmin = result.body.csrf;
  database
    .prepare("UPDATE users SET role='admin' WHERE email='admin@example.com'")
    .run();
  assert.equal((await request("/api/admin", { cookie: admin })).r.status, 200);
  const payload = {
    id: "emociones",
    title: "Recurso de prueba",
    category: "Pruebas",
    description: "Solo test",
    plan: "essential",
    status: "available",
    license: "Original de prueba",
  };
  assert.equal(
    (
      await request("/api/admin/resources", {
        cookie: admin,
        csrf: csrfAdmin,
        method: "POST",
        data: payload,
      })
    ).r.status,
    400,
  );
  result = await request("/api/admin/resources", {
    cookie: admin,
    csrf: csrfAdmin,
    method: "POST",
    data: {
      ...payload,
      pdf: Buffer.from("%PDF-1.4\n%test\n%%EOF").toString("base64"),
    },
  });
  assert.equal(result.r.status, 200);
  assert.equal(
    (await request("/api/files/emociones", { cookie: buyer })).r.status,
    403,
  );
  const buyerId = database
    .prepare("SELECT id FROM users WHERE email='buyer@example.com'")
    .get().id;
  database
    .prepare(
      "INSERT INTO orders (id,user_id,plan,amount,status,provider,created) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      "test-order",
      buyerId,
      "essential",
      590,
      "approved",
      "test",
      new Date().toISOString(),
    );
  result = await request("/api/library", { cookie: buyer });
  assert.equal(result.body.resources.length, 1);
  assert.equal(result.body.plan, "essential");
  const file = await fetch(base + "/api/files/emociones", {
    headers: { Cookie: buyer },
  });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "application/pdf");
  assert.ok((await file.text()).startsWith("%PDF-"));
  assert.equal(
    (await request("/api/files/anamnesis", { cookie: buyer })).r.status,
    403,
  );
  database
    .prepare("UPDATE orders SET status='refunded' WHERE id='test-order'")
    .run();
  assert.equal(
    (await request("/api/files/emociones", { cookie: buyer })).r.status,
    403,
  );
  const c = (await request("/api/admin", { cookie: admin })).body.config;
  assert.equal(
    (
      await request("/api/admin/config", {
        cookie: admin,
        csrf: csrfAdmin,
        method: "PUT",
        data: { ...c, salesEnabled: true },
      })
    ).r.status,
    400,
  );
  c.prices.essential = 610;
  assert.equal(
    (
      await request("/api/admin/config", {
        cookie: admin,
        csrf: csrfAdmin,
        method: "PUT",
        data: c,
      })
    ).r.status,
    200,
  );
  assert.equal((await request("/api/config")).body.prices.essential, 610);
  assert.equal(
    (
      await request("/api/webhooks/mercadopago", {
        method: "POST",
        data: { type: "payment", data: { id: "1" } },
      })
    ).r.status,
    503,
  );
  assert.equal(
    (
      await request("/api/login", {
        method: "POST",
        data: { email: "buyer@example.com", password: "contraseña incorrecta" },
      })
    ).r.status,
    401,
  );
  assert.equal(
    (
      await request("/api/logout", {
        cookie: buyer,
        csrf: csrfBuyer,
        method: "POST",
        data: {},
      })
    ).r.status,
    200,
  );
  assert.equal((await request("/api/me", { cookie: buyer })).body.user, null);
});
test("cabeceras, SEO y recursos estáticos", async () => {
  const r = await fetch(base);
  assert.equal(r.status, 200);
  assert.ok(
    r.headers.get("content-security-policy").includes("script-src 'self'"),
  );
  assert.ok((await r.text()).includes(`content="${base}/kit.svg"`));
  assert.equal(
    (await fetch(base + "/admin")).headers.get("x-robots-tag"),
    "noindex, nofollow",
  );
  assert.ok(
    (await (await fetch(base + "/robots.txt")).text()).includes(
      "Disallow: /api/",
    ),
  );
  assert.equal((await fetch(base + "/src/server.js")).status, 404);
  assert.equal((await fetch(base + "/.env")).status, 404);
});
