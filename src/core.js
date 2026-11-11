import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
export const countries = {
  UY: "UYU",
  AR: "ARS",
  BR: "BRL",
  CL: "CLP",
  PY: "PYG",
  CO: "COP",
  MX: "MXN",
  PE: "PEN",
  BO: "BOB",
  EC: "USD",
  US: "USD",
  CA: "CAD",
  ES: "EUR",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  PT: "EUR",
  GB: "GBP",
  AU: "AUD",
  CR: "CRC",
  DO: "DOP",
  PA: "USD",
  GT: "GTQ",
  HN: "HNL",
  NI: "NIO",
  SV: "USD",
  VE: "VES",
};
export const defaults = {
  brand: "Kit Consultorio Lúdico",
  prices: { essential: 590, complete: 790, upgrade: 690 },
  promotions: { enabled: false, upgrade: false },
  salesEnabled: false,
  guaranteeEnabled: false,
  merchant: "",
  supportEmail: "",
  refundPolicy: "",
  terms: "",
  products: {
    essential: { active: true, ready: false },
    complete: { active: true, ready: false },
  },
  faq: [
    {
      q: "¿Cómo voy a acceder al material?",
      a: "Después de confirmar el pago en el servidor, los recursos disponibles de tu plan aparecerán en tu biblioteca privada. La venta está deshabilitada hasta completar los materiales y la configuración.",
    },
    {
      q: "¿En qué formato estarán los recursos?",
      a: "La biblioteca está preparada para documentos PDF, con vista previa y descarga para uso profesional personal. Los materiales aún no cargados están pendientes.",
    },
    {
      q: "¿Puedo imprimir los materiales?",
      a: "Los permisos de impresión dependen de la licencia de cada recurso. Antes de comprar podrás consultar las condiciones de uso vigentes.",
    },
    {
      q: "¿Necesito formación clínica para usar el kit?",
      a: "Estos recursos son complementarios. No sustituyen la formación clínica, la supervisión ni el criterio profesional para cada caso.",
    },
    {
      q: "¿Se pueden usar en sesiones en línea?",
      a: "Cada recurso indicará su modalidad de uso y las condiciones de su licencia, una vez que esté disponible.",
    },
    {
      q: "¿Cómo funciona la garantía de 15 días?",
      a: "La garantía está prevista, pero todavía no está activa. Antes de habilitar ventas se publicará la política real de reembolso y el canal de contacto.",
    },
    {
      q: "¿En qué moneda se cobra?",
      a: "Los precios base son pesos uruguayos (UYU). La conversión a otras monedas es orientativa. El checkout mostrará la moneda y el importe definitivo antes de pagar.",
    },
    {
      q: "¿Puedo comprar ahora?",
      a: "Todavía no. Estamos preparando el catálogo y las pasarelas. No se realizan cobros ni se entregan materiales pendientes.",
    },
  ],
  testimonials: [],
};
export const initialResources = [
  ["emociones", "Emociones y sentimientos", "essential"],
  ["vinculo", "Vínculo y primeras sesiones", "essential"],
  ["ansiedad", "Ansiedad y preocupaciones", "essential"],
  ["regulacion", "Regulación emocional", "essential"],
  ["atencion", "Atención y autorregulación", "essential"],
  ["familia", "Familia y cambios", "essential"],
  ["anamnesis", "Fichas de anamnesis infantil", "complete"],
  ["devolucion", "Guía de devolución para familias", "complete"],
  ["planificacion", "Lista de planificación de sesiones", "complete"],
  ["padres", "Guía de comunicación con padres", "complete"],
  ["psicoeducacion", "Material visual de psicoeducación", "complete"],
].map(([id, title, plan], i) => ({
  id,
  title,
  plan,
  category: i < 6 ? "Recursos terapéuticos" : "Bonos",
  status: "pending",
  description: "Pendiente de creación o licencia. Sin archivo disponible.",
  file: null,
  license: "",
}));
export const uid = () => randomBytes(24).toString("hex");
export const hashToken = (v) => createHash("sha256").update(v).digest("hex");
export function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function passwordMatches(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    const expected = Buffer.from(hash, "hex");
    const actual = scryptSync(password, salt, 64);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
export function canAccess(user, resource, entitlement) {
  return (
    !!user &&
    resource.status === "available" &&
    !!resource.file &&
    (user.role === "admin" ||
      entitlement === "complete" ||
      (entitlement === "essential" && resource.plan === "essential"))
  );
}
export function validateConfig(c) {
  if (!c || typeof c !== "object") throw Error("Configuración inválida.");
  for (const key of ["essential", "complete", "upgrade"])
    if (
      !Number.isSafeInteger(c.prices?.[key]) ||
      c.prices[key] < 1 ||
      c.prices[key] > 1000000
    )
      throw Error("Los precios deben ser enteros positivos en UYU.");
  if (
    c.prices.upgrade > c.prices.complete ||
    c.prices.upgrade < c.prices.essential
  )
    throw Error("La oferta debe estar entre el precio Esencial y el Completo.");
  if (
    !Array.isArray(c.faq) ||
    c.faq.length > 40 ||
    c.faq.some(
      (f) =>
        typeof f.q !== "string" ||
        typeof f.a !== "string" ||
        f.q.length > 300 ||
        f.a.length > 3000,
    )
  )
    throw Error("Preguntas frecuentes inválidas.");
  if (
    !Array.isArray(c.testimonials) ||
    c.testimonials.length > 30 ||
    c.testimonials.some(
      (t) =>
        typeof t.name !== "string" ||
        typeof t.text !== "string" ||
        t.authorized !== true,
    )
  )
    throw Error("Solo se admiten testimonios con autorización confirmada.");
  for (const k of ["essential", "complete"])
    if (
      typeof c.products?.[k]?.active !== "boolean" ||
      typeof c.products?.[k]?.ready !== "boolean"
    )
      throw Error("Productos inválidos.");
  for (const k of ["salesEnabled", "guaranteeEnabled"])
    if (typeof c[k] !== "boolean") throw Error("Opciones inválidas.");
  if (
    typeof c.promotions?.enabled !== "boolean" ||
    typeof c.promotions?.upgrade !== "boolean"
  )
    throw Error("Promociones inválidas.");
  for (const k of [
    "brand",
    "merchant",
    "supportEmail",
    "refundPolicy",
    "terms",
  ])
    if (typeof c[k] !== "string" || c[k].length > 20000)
      throw Error("Datos legales inválidos.");
  if (
    c.salesEnabled &&
    (!c.merchant ||
      !/^\S+@\S+\.\S+$/.test(c.supportEmail) ||
      !c.refundPolicy ||
      !c.terms)
  )
    throw Error(
      "Completá vendedor, contacto, términos y política de reembolso antes de vender.",
    );
  if (c.guaranteeEnabled && !c.refundPolicy)
    throw Error("Publicá la política real antes de activar la garantía.");
  return c;
}
export function checkoutPrice(config, plan, offer) {
  if (!["essential", "complete"].includes(plan)) throw Error("Plan inválido.");
  if (offer && plan !== "complete") throw Error("Oferta inválida.");
  if (offer && !(config.promotions.enabled && config.promotions.upgrade))
    throw Error("Oferta no vigente.");
  return offer ? config.prices.upgrade : config.prices[plan];
}
export function verifyMpSignature(headers, dataId, secret, now = Date.now()) {
  if (!secret || !dataId || !headers["x-request-id"]) return false;
  const parts = Object.fromEntries(
    String(headers["x-signature"] || "")
      .split(",")
      .map((s) => s.trim().split("=")),
  );
  if (!/^\d+$/.test(parts.ts || "") || !/^[a-f0-9]{64}$/i.test(parts.v1 || ""))
    return false;
  const timestamp = Number(parts.ts) * (parts.ts.length <= 10 ? 1000 : 1);
  if (Math.abs(now - timestamp) > 300000) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${headers["x-request-id"]};ts:${parts.ts};`;
  const actual = createHmac("sha256", secret).update(manifest).digest();
  return timingSafeEqual(actual, Buffer.from(parts.v1, "hex"));
}
export function validPayment(payment, order, collector) {
  return (
    payment.external_reference === order.id &&
    payment.currency_id === "UYU" &&
    Number(payment.transaction_amount) === order.amount &&
    (!collector || String(payment.collector_id) === String(collector))
  );
}
