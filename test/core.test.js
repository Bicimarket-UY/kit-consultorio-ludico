import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  defaults,
  initialResources,
  passwordHash,
  passwordMatches,
  canAccess,
  checkoutPrice,
  validateConfig,
  verifyMpSignature,
  validPayment,
} from "../src/core.js";
test("contraseñas con sal aleatoria; rechazo de contraseñas incorrectas", () => {
  const a = passwordHash("una contraseña segura");
  assert.notEqual(a, passwordHash("una contraseña segura"));
  assert.ok(passwordMatches("una contraseña segura", a));
  assert.equal(passwordMatches("incorrecta", a), false);
});
test("acceso por plan, archivo, estado y autenticación", () => {
  const r = { plan: "complete", status: "available", file: "private.pdf" };
  assert.equal(canAccess(null, r, "complete"), false);
  assert.equal(canAccess({ role: "buyer" }, r, "essential"), false);
  assert.equal(canAccess({ role: "buyer" }, r, "complete"), true);
  assert.equal(
    canAccess({ role: "admin" }, { ...r, status: "pending" }, "complete"),
    false,
  );
  assert.equal(
    canAccess({ role: "buyer" }, { ...r, plan: "essential" }, "essential"),
    true,
  );
  assert.equal(
    canAccess({ role: "buyer" }, { ...r, file: null }, "complete"),
    false,
  );
});
test("precios centrales y oferta total opcional, sin adición al Esencial", () => {
  assert.equal(checkoutPrice(defaults, "essential", false), 590);
  assert.equal(checkoutPrice(defaults, "complete", false), 790);
  assert.throws(() => checkoutPrice(defaults, "complete", true));
  const c = structuredClone(defaults);
  c.promotions = { enabled: true, upgrade: true };
  assert.equal(checkoutPrice(c, "complete", true), 690);
  assert.throws(() => checkoutPrice(c, "essential", true));
  assert.throws(() => checkoutPrice(c, "free", false));
});
test("no habilitar ventas ni garantías sin datos reales", () => {
  assert.doesNotThrow(() => validateConfig(defaults));
  assert.throws(() => validateConfig({ ...defaults, salesEnabled: true }));
  assert.throws(() => validateConfig({ ...defaults, guaranteeEnabled: true }));
  assert.throws(() =>
    validateConfig({
      ...defaults,
      prices: { ...defaults.prices, essential: -10 },
    }),
  );
  assert.throws(() =>
    validateConfig({
      ...defaults,
      testimonials: [{ name: "Inventado", text: "Hola", authorized: false }],
    }),
  );
  assert.ok(initialResources.every((r) => r.status === "pending" && !r.file));
});
test("webhooks: firma correcta, vencimiento, manipulación y secreto faltante", () => {
  const ts = String(Date.now()),
    secret = "test-secret",
    id = "12345",
    request = "test-request";
  const signature = createHmac("sha256", secret)
    .update(`id:${id};request-id:${request};ts:${ts};`)
    .digest("hex");
  const headers = {
    "x-request-id": request,
    "x-signature": `ts=${ts},v1=${signature}`,
  };
  assert.ok(verifyMpSignature(headers, id, secret));
  assert.equal(verifyMpSignature(headers, "12346", secret), false);
  assert.equal(verifyMpSignature(headers, id, "wrong"), false);
  assert.equal(verifyMpSignature(headers, id, ""), false);
  assert.equal(
    verifyMpSignature(headers, id, secret, Date.now() + 600000),
    false,
  );
  assert.equal(verifyMpSignature({}, id, secret), false);
});
test("la confirmación debe coincidir en pedido, importe, moneda y vendedor", () => {
  const order = { id: "order1", amount: 790 },
    p = {
      external_reference: "order1",
      transaction_amount: 790,
      currency_id: "UYU",
      collector_id: 12,
    };
  assert.ok(validPayment(p, order, "12"));
  for (const patch of [
    { currency_id: "USD" },
    { transaction_amount: 1 },
    { external_reference: "other" },
    { collector_id: 13 },
  ])
    assert.equal(validPayment({ ...p, ...patch }, order, "12"), false);
});
