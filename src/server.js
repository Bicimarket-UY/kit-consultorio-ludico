import http from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { isIP } from "node:net";
import { db, dataDir, config, resources, entitlement } from "./db.js";
import {
  uid,
  hashToken,
  passwordHash,
  passwordMatches,
  canAccess,
  checkoutPrice,
  verifyMpSignature,
  validPayment,
  validateConfig,
  countries,
} from "./core.js";
const port = Number(process.env.PORT || 3000),
  origin = new URL(process.env.APP_ORIGIN || `http://localhost:${port}`).origin;
const production = process.env.NODE_ENV === "production";
if (production && !origin.startsWith("https://"))
  throw Error("APP_ORIGIN debe usar HTTPS en producción.");
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const fail = (message, status = 400) =>
  Object.assign(Error(message), { status });
const limits = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of limits) if (value.until < now) limits.delete(key);
  db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
}, 60000).unref();
function limit(key, max = 20) {
  const now = Date.now();
  let x = limits.get(key);
  if (!x || x.until < now) {
    if (limits.size > 20000)
      throw fail("Servicio ocupado. Probá de nuevo en unos minutos.", 429);
    x = { n: 0, until: now + 900000 };
    limits.set(key, x);
  }
  if (++x.n > max) throw fail("Demasiados intentos. Probá en 15 minutos.", 429);
}
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
async function body(req, max = 20000) {
  if (!String(req.headers["content-type"]).startsWith("application/json"))
    throw fail("Se requiere JSON.", 415);
  let n = 0,
    parts = [];
  for await (const chunk of req) {
    n += chunk.length;
    if (n > max) throw fail("Archivo o solicitud demasiado grande.", 413);
    parts.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString());
  } catch {
    throw fail("JSON inválido.");
  }
}
function session(req) {
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("session="));
  if (!cookie) return null;
  const token = cookie.slice(8);
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return (
    db
      .prepare(
        "SELECT users.id,users.email,users.role,sessions.csrf,sessions.id AS session_id FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id=? AND sessions.expires>?",
      )
      .get(hashToken(token), Date.now()) || null
  );
}
function requireUser(user) {
  if (!user) throw fail("Ingresá a tu cuenta para continuar.", 401);
}
function requireAdmin(user) {
  requireUser(user);
  if (user.role !== "admin")
    throw fail("Acceso reservado a administración.", 403);
}
function login(res, userId) {
  const token = uid(),
    csrf = uid();
  db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(
    hashToken(token),
    userId,
    csrf,
    Date.now() + 7 * 86400000,
  );
  res.setHeader(
    "Set-Cookie",
    `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${production ? "; Secure" : ""}`,
  );
  return csrf;
}
function clientIp(req) {
  return process.env.TRUST_PROXY === "true"
    ? String(req.headers["x-forwarded-for"] || req.socket.remoteAddress)
        .split(",")[0]
        .trim()
    : req.socket.remoteAddress;
}
const dummyPassword = passwordHash(uid());
let rateRequest;
async function fetchRates() {
  const row = db.prepare("SELECT value FROM settings WHERE id=?").get("rates");
  let cache;
  try {
    cache = JSON.parse(row?.value || "null");
  } catch {}
  const age = cache ? Date.now() - cache.fetched : Infinity;
  if (age < 6 * 3600000) return { ...cache, stale: false };
  if (rateRequest) return rateRequest;
  rateRequest = (async () => {
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/UYU", {
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw Error("rates");
      const data = await response.json();
      if (
        data.result !== "success" ||
        data.base_code !== "UYU" ||
        data.rates?.UYU !== 1
      )
        throw Error("rates");
      const updated = Number(data.time_last_update_unix) * 1000;
      if (
        !Number.isFinite(updated) ||
        updated > Date.now() + 3600000 ||
        Date.now() - updated > 3 * 86400000
      )
        throw Error("rates");
      const result = {
        rates: data.rates,
        updated,
        fetched: Date.now(),
        provider: "ExchangeRate-API · open.er-api.com",
      };
      db.prepare("INSERT OR REPLACE INTO settings VALUES (?,?)").run(
        "rates",
        JSON.stringify(result),
      );
      return { ...result, stale: false };
    } catch {
      if (cache && age < 7 * 86400000) return { ...cache, stale: true };
      return {
        rates: { UYU: 1 },
        updated: null,
        provider: null,
        unavailable: true,
      };
    } finally {
      rateRequest = null;
    }
  })();
  return rateRequest;
}
async function mpFetch(path, options = {}) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw fail(
      "La pasarela no está disponible. No se confirmó ningún pago.",
      502,
    );
  return response.json();
}
function paymentReady(c, plan) {
  const relevant = resources().filter(
    (r) => r.plan === "essential" || plan === "complete",
  );
  return (
    c.salesEnabled &&
    c.products[plan].active &&
    c.products[plan].ready &&
    relevant.length > 0 &&
    relevant.every((r) => r.status === "available" && r.file && r.license)
  );
}
export async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  );
  if (production)
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  try {
    const url = new URL(req.url, origin),
      path = url.pathname,
      method = req.method,
      user = session(req);
    if (
      method !== "GET" &&
      method !== "HEAD" &&
      path !== "/api/webhooks/mercadopago"
    ) {
      if (req.headers.origin !== origin)
        throw fail("Origen de la solicitud no autorizado.", 403);
      if (user && req.headers["x-csrf-token"] !== user.csrf)
        throw fail("La sesión cambió. Recargá la página.", 403);
    }
    if (path === "/robots.txt" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end(
        `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /biblioteca\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,
      );
    }
    if (path === "/sitemap.xml" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      return res.end(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/terminos", "/privacidad", "/reembolsos"].map((p) => `<url><loc>${origin}${p}</loc></url>`).join("")}</urlset>`,
      );
    }
    if (path === "/api/health") return json(res, 200, { ok: true });
    if (path === "/api/config" && method === "GET") {
      const c = config();
      return json(res, 200, {
        ...c,
        resources: resources().map(({ file, ...r }) => r),
        payments: {
          mercadopago: !!(
            process.env.MP_ACCESS_TOKEN && process.env.MP_WEBHOOK_SECRET
          ),
          international: false,
        },
        geoEnabled: process.env.ENABLE_IP_GEO === "true",
      });
    }
    if (path === "/api/rates" && method === "GET")
      return json(res, 200, await fetchRates());
    if (path === "/api/country" && method === "POST") {
      await body(req);
      limit("geo:" + clientIp(req), 30);
      if (process.env.ENABLE_IP_GEO !== "true")
        return json(res, 200, { country: null });
      // Solo se usa tras aceptación explícita en la interfaz. Nunca se acepta IP del cuerpo.
      let country =
        process.env.TRUST_PROXY === "true"
          ? String(req.headers["x-country-code"] || "").toUpperCase()
          : null;
      if (!countries[country]) {
        const ip = clientIp(req)?.replace(/^::ffff:/, "");
        if (
          !isIP(ip) ||
          /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd]|fe80)/i.test(
            ip,
          )
        )
          return json(res, 200, { country: null });
        try {
          const response = await fetch(
            `https://ipapi.co/${encodeURIComponent(ip)}/country/`,
            { signal: AbortSignal.timeout(3500) },
          );
          country = response.ok ? (await response.text()).trim() : null;
        } catch {
          country = null;
        }
      }
      return json(res, 200, { country: countries[country] ? country : null });
    }
    if (path === "/api/me" && method === "GET")
      return json(res, 200, {
        user: user ? { id: user.id, email: user.email, role: user.role } : null,
        csrf: user?.csrf || null,
        plan: user ? entitlement(user.id) : null,
      });
    if (
      (path === "/api/register" || path === "/api/login") &&
      method === "POST"
    ) {
      limit("auth:" + clientIp(req));
      const input = await body(req);
      const email = String(input.email || "")
          .trim()
          .toLowerCase(),
        password = String(input.password || "");
      if (
        !/^\S+@\S+\.\S+$/.test(email) ||
        email.length > 254 ||
        password.length < 12 ||
        password.length > 128
      )
        throw fail(
          "Ingresá un correo válido y una contraseña de 12 a 128 caracteres.",
        );
      let account = db.prepare("SELECT * FROM users WHERE email=?").get(email);
      if (path === "/api/register") {
        if (account)
          throw fail(
            "No se pudo crear la cuenta. Probá ingresar o contactá al responsable.",
            409,
          );
        const id = uid();
        db.prepare("INSERT INTO users VALUES (?,?,?,?,?)").run(
          id,
          email,
          passwordHash(password),
          "buyer",
          new Date().toISOString(),
        );
        account = { id };
      } else if (
        !passwordMatches(password, account?.password || dummyPassword) ||
        !account
      )
        throw fail("Correo o contraseña incorrectos.", 401);
      return json(res, 200, { ok: true, csrf: login(res, account.id) });
    }
    if (path === "/api/logout" && method === "POST") {
      requireUser(user);
      db.prepare("DELETE FROM sessions WHERE id=?").run(user.session_id);
      res.setHeader(
        "Set-Cookie",
        `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${production ? "; Secure" : ""}`,
      );
      return json(res, 200, { ok: true });
    }
    if (path === "/api/library" && method === "GET") {
      requireUser(user);
      const plan = entitlement(user.id);
      return json(res, 200, {
        plan,
        resources: resources()
          .filter((r) => canAccess(user, r, plan))
          .map(({ file, ...r }) => r),
      });
    }
    if (path.startsWith("/api/files/") && method === "GET") {
      requireUser(user);
      const id = path.split("/")[3],
        r = resources().find((r) => r.id === id);
      if (!r || !canAccess(user, r, entitlement(user.id)))
        throw fail(
          "El recurso no está autorizado o todavía no está disponible.",
          403,
        );
      const file = resolve(dataDir, "files", r.file);
      if (!file.startsWith(resolve(dataDir, "files") + "/"))
        throw fail("Archivo inválido.", 403);
      const info = await stat(file);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": info.size,
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="recurso-${r.id}.pdf"`,
      });
      createReadStream(file).pipe(res);
      return;
    }
    if (path === "/api/orders" && method === "GET") {
      requireUser(user);
      return json(
        res,
        200,
        db
          .prepare(
            "SELECT id,plan,amount,currency,status,created FROM orders WHERE user_id=? ORDER BY created DESC LIMIT 100",
          )
          .all(user.id),
      );
    }
    if (path === "/api/checkout" && method === "POST") {
      requireUser(user);
      limit("checkout:" + user.id, 15);
      const input = await body(req),
        c = config();
      let amount;
      try {
        amount = checkoutPrice(c, input.plan, input.offer === true);
      } catch (e) {
        throw fail(e.message);
      }
      if (!paymentReady(c, input.plan))
        throw fail(
          "Venta aún no habilitada: faltan materiales autorizados o condiciones comerciales.",
          503,
        );
      if (input.country !== "UY" || input.currency !== "UYU")
        throw fail(
          "La pasarela internacional está pendiente de configuración. Mercado Pago Uruguay solo está habilitado para cobros UYU en Uruguay.",
          503,
        );
      if (!process.env.MP_ACCESS_TOKEN || !process.env.MP_WEBHOOK_SECRET)
        throw fail(
          "Mercado Pago aún no está configurado. No se realizará ningún cobro.",
          503,
        );
      const id = uid();
      db.prepare(
        "INSERT INTO orders (id,user_id,plan,amount,status,provider,created) VALUES (?,?,?,?,?,?,?)",
      ).run(
        id,
        user.id,
        input.plan,
        amount,
        "pending",
        "mercadopago",
        new Date().toISOString(),
      );
      let preference;
      try {
        preference = await mpFetch("/checkout/preferences", {
          method: "POST",
          headers: { "X-Idempotency-Key": id },
          body: JSON.stringify({
            items: [
              {
                id: input.plan,
                title: `${c.brand} · ${input.plan === "essential" ? "Esencial" : "Completo"}`,
                quantity: 1,
                currency_id: "UYU",
                unit_price: amount,
              },
            ],
            payer: { email: user.email },
            external_reference: id,
            notification_url: `${origin}/api/webhooks/mercadopago`,
            back_urls: {
              success: `${origin}/biblioteca`,
              pending: `${origin}/biblioteca`,
              failure: `${origin}/biblioteca`,
            },
            auto_return: "approved",
          }),
        });
      } catch (e) {
        db.prepare("UPDATE orders SET status='checkout_failed' WHERE id=?").run(
          id,
        );
        throw e;
      }
      const redirect = new URL(preference.init_point);
      if (
        redirect.protocol !== "https:" ||
        !/(^|\.)mercadopago\.(com|com\.uy)$/.test(redirect.hostname)
      )
        throw fail("La pasarela devolvió una dirección inválida.", 502);
      db.prepare("UPDATE orders SET preference_id=? WHERE id=?").run(
        preference.id,
        id,
      );
      return json(res, 200, { url: redirect.href, amount, currency: "UYU" });
    }
    if (path === "/api/webhooks/mercadopago" && method === "POST") {
      if (!process.env.MP_WEBHOOK_SECRET || !process.env.MP_ACCESS_TOKEN)
        throw fail("Pasarela no configurada.", 503);
      const input = await body(req, 100000),
        dataId = url.searchParams.get("data.id");
      if (
        !/^\d+$/.test(dataId || "") ||
        !verifyMpSignature(req.headers, dataId, process.env.MP_WEBHOOK_SECRET)
      )
        throw fail("Firma inválida o vencida.", 401);
      if (input.type !== "payment")
        return json(res, 200, { received: true, ignored: true });
      const payment = await mpFetch(
        `/v1/payments/${encodeURIComponent(dataId)}`,
      );
      if (String(payment.id) !== dataId)
        throw fail("Notificación no válida.", 400);
      const order = db
        .prepare("SELECT * FROM orders WHERE id=?")
        .get(String(payment.external_reference || ""));
      if (!order || !validPayment(payment, order, process.env.MP_COLLECTOR_ID))
        throw fail("El pago no coincide con el pedido.", 400);
      if (order.payment_id && order.payment_id !== dataId)
        throw fail("Pedido asociado a otro pago.", 409);
      const status =
        Number(payment.transaction_amount_refunded) > 0
          ? "refunded"
          : [
                "approved",
                "refunded",
                "charged_back",
                "rejected",
                "cancelled",
                "pending",
                "in_process",
              ].includes(payment.status)
            ? payment.status
            : "pending";
      const eventId = `mp:${payment.id}:${payment.status}:${payment.date_last_updated || ""}`;
      db.exec("BEGIN IMMEDIATE");
      try {
        if (!db.prepare("SELECT id FROM events WHERE id=?").get(eventId)) {
          // Nunca reactivar automáticamente un pedido que ya fue reembolsado o contracargado.
          if (
            !["refunded", "charged_back"].includes(order.status) ||
            ["refunded", "charged_back"].includes(status)
          )
            db.prepare(
              "UPDATE orders SET status=?,payment_id=? WHERE id=?",
            ).run(status, dataId, order.id);
          db.prepare("INSERT INTO events VALUES (?,?,?)").run(
            eventId,
            JSON.stringify({ paymentId: dataId, status }),
            new Date().toISOString(),
          );
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return json(res, 200, { received: true });
    }
    if (path === "/api/admin" && method === "GET") {
      requireAdmin(user);
      return json(res, 200, {
        config: config(),
        resources: resources().map(({ file, ...r }) => ({
          ...r,
          hasFile: !!file,
        })),
        orders: db
          .prepare(
            "SELECT orders.*,users.email FROM orders JOIN users ON users.id=orders.user_id ORDER BY orders.created DESC LIMIT 200",
          )
          .all(),
        gateways: {
          mercadopago: !!(
            process.env.MP_ACCESS_TOKEN && process.env.MP_WEBHOOK_SECRET
          ),
          international: false,
        },
      });
    }
    if (path === "/api/admin/config" && method === "PUT") {
      requireAdmin(user);
      let c = await body(req, 150000);
      try {
        c = validateConfig(c);
      } catch (e) {
        throw fail(e.message);
      }
      db.prepare("UPDATE settings SET value=? WHERE id=?").run(
        JSON.stringify(c),
        "config",
      );
      return json(res, 200, { ok: true });
    }
    if (path === "/api/admin/resources" && method === "POST") {
      requireAdmin(user);
      const input = await body(req, 15000000);
      const existing = resources().find((r) => r.id === input.id);
      const id = existing?.id || uid();
      const title = String(input.title || "").trim(),
        category = String(input.category || "").trim(),
        description = String(input.description || ""),
        license = String(input.license || "").trim();
      if (
        !title ||
        title.length > 200 ||
        !category ||
        category.length > 100 ||
        description.length > 3000 ||
        license.length > 3000 ||
        !["essential", "complete"].includes(input.plan) ||
        !["pending", "available", "archived"].includes(input.status)
      )
        throw fail("Datos del recurso inválidos.");
      let file = existing?.file || null;
      if (input.pdf) {
        if (
          typeof input.pdf !== "string" ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(input.pdf)
        )
          throw fail("PDF inválido.");
        const bytes = Buffer.from(input.pdf, "base64");
        if (
          bytes.length > 10000000 ||
          bytes.subarray(0, 5).toString() !== "%PDF-"
        )
          throw fail("Subí un archivo PDF de hasta 10 MB.");
        file = `${uid()}.pdf`;
        await writeFile(resolve(dataDir, "files", file), bytes, {
          mode: 0o600,
        });
      }
      if (input.status === "available" && (!file || !license))
        throw fail(
          "Un recurso disponible requiere PDF y licencia documentada.",
        );
      db.prepare("INSERT OR REPLACE INTO resources VALUES (?,?)").run(
        id,
        JSON.stringify({
          id,
          title,
          category,
          description,
          license,
          plan: input.plan,
          status: input.status,
          file,
        }),
      );
      return json(res, 200, { ok: true, id });
    }
    if (path.startsWith("/api/"))
      throw fail("Ruta o método no disponible.", 404);
    if (!["GET", "HEAD"].includes(method))
      throw fail("Método no permitido.", 405);
    const pages = [
      "/",
      "/biblioteca",
      "/admin",
      "/privacidad",
      "/terminos",
      "/reembolsos",
    ];
    const relative = pages.includes(path) ? "index.html" : path.slice(1);
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(relative) ||
      relative.includes("..") ||
      relative.startsWith(".")
    )
      throw fail("No encontrado.", 404);
    const file = resolve(publicDir, relative);
    if (!file.startsWith(publicDir)) throw fail("No encontrado.", 404);
    let content;
    try {
      content = await readFile(file);
    } catch {
      throw fail("No encontrado.", 404);
    }
    const mime =
      {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".svg": "image/svg+xml",
        ".txt": "text/plain; charset=utf-8",
        ".xml": "application/xml",
      }[extname(file)] || "application/octet-stream";
    if (extname(file) === ".html") {
      const tag = `<link rel="canonical" href="${origin}${path}"><meta property="og:url" content="${origin}${path}">`;
      content = Buffer.from(
        content
          .toString()
          .replace("</head>", tag + "</head>")
          .replace('content="/kit.svg"', `content="${origin}/kit.svg"`),
      );
      if (["/admin", "/biblioteca"].includes(path))
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
    res.end(method === "HEAD" ? undefined : content);
  } catch (error) {
    if (!res.headersSent)
      json(res, error.status || 500, {
        error: error.status
          ? error.message
          : "Ocurrió un error. Intentá nuevamente.",
      });
    else res.end();
    if (!error.status)
      console.error("Error interno:", error.code || error.name);
  }
}
const server = http.createServer(handler);
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(port, "0.0.0.0", () =>
  console.log(`Kit Consultorio Lúdico disponible en ${origin}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
