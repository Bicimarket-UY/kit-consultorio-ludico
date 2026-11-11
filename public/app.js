const $ = (s, r = document) => r.querySelector(s);
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const nation = {
  UY: ["Uruguay", "UYU"],
  AR: ["Argentina", "ARS"],
  BR: ["Brasil", "BRL"],
  CL: ["Chile", "CLP"],
  PY: ["Paraguay", "PYG"],
  CO: ["Colombia", "COP"],
  MX: ["México", "MXN"],
  PE: ["Perú", "PEN"],
  BO: ["Bolivia", "BOB"],
  EC: ["Ecuador", "USD"],
  US: ["Estados Unidos", "USD"],
  CA: ["Canadá", "CAD"],
  ES: ["España", "EUR"],
  DE: ["Alemania", "EUR"],
  FR: ["Francia", "EUR"],
  IT: ["Italia", "EUR"],
  PT: ["Portugal", "EUR"],
  GB: ["Reino Unido", "GBP"],
  AU: ["Australia", "AUD"],
  CR: ["Costa Rica", "CRC"],
  DO: ["República Dominicana", "DOP"],
  PA: ["Panamá", "USD"],
  GT: ["Guatemala", "GTQ"],
  HN: ["Honduras", "HNL"],
  NI: ["Nicaragua", "NIO"],
  SV: ["El Salvador", "USD"],
  VE: ["Venezuela", "VES"],
};
const storage = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
let region = "UY";
try {
  region = new Intl.Locale(navigator.language).region || "UY";
} catch {}
const saved = storage.get("kit-country");
const state = {
  country: nation[saved] ? saved : nation[region] ? region : "UY",
  rates: { UYU: 1 },
  rateInfo: {},
  config: null,
  me: { user: null, csrf: null, plan: null },
  admin: null,
};
const icons = {
  heart: "♡",
  search: "⌕",
  print: "▤",
  folder: "▱",
  stack: "▱",
  shield: "◇",
  lock: "♙",
  download: "↓",
  spark: "✧",
  check: "✓",
  play: "▶",
};
const icon = (n) =>
  `<span class="icon" aria-hidden="true">${icons[n] || n}</span>`;
const amount = (n) => `<span data-uyu="${Number(n)}"></span>`;
const cta = (text = "Conocer los planes", cls = "") =>
  `<a href="#planes" class="btn ${cls}">${text}</a>`;
const trust = () =>
  `<div class="trust"><span>${icon("shield")}Condiciones transparentes</span><span>${icon("lock")}Sin cobros de prueba</span><span>${icon("download")}Entrega tras pago confirmado</span></div>`;
const bonusNames = [
  "Fichas de anamnesis infantil",
  "Guía de devolución para familias",
  "Lista de planificación de sesiones",
  "Guía de comunicación con padres",
  "Material visual de psicoeducación",
];
const bonusCopy = [
  "Una primera entrevista organizada para conocer la historia y el contexto de cada niño.",
  "Una estructura para comunicar observaciones y próximos pasos con claridad.",
  "Una ayuda para definir objetivos, elegir recursos y registrar el encuentro.",
  "Orientaciones para acompañar el vínculo y conversar sobre el proceso terapéutico.",
  "Apoyos visuales para explicar conceptos y sumar a las familias al acompañamiento.",
];
const baseFeatures = [
  "Recursos lúdicos organizados por necesidades clínicas",
  "Biblioteca digital con búsqueda y filtros",
  "PDF disponibles según catálogo y licencia",
  "Acceso permanente según las condiciones de venta",
];
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(state.me.csrf ? { "X-CSRF-Token": state.me.csrf } : {}),
      ...(options.headers || {}),
    },
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("El servidor no respondió. Intentá nuevamente.");
  }
  if (!response.ok)
    throw Error(result.error || "No pudimos completar la solicitud.");
  return result;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  setTimeout(() => $("#toast").classList.remove("visible"), 5000);
}
function currency() {
  const wanted = nation[state.country][1];
  return Number.isFinite(state.rates[wanted]) && state.rates[wanted] > 0
    ? wanted
    : "UYU";
}
function money(value) {
  const code = currency();
  return `${code} ${new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 }).format(Math.round(value * (state.rates[code] || 1)))}`;
}
function updateMoney() {
  document.querySelectorAll("[data-uyu]").forEach((el) => {
    el.textContent = money(Number(el.dataset.uyu));
  });
  const code = currency();
  let note =
    code === "UYU"
      ? "Importes base en pesos uruguayos (UYU)."
      : `Importes aproximados en ${code}, convertidos directamente desde UYU. `;
  if (state.country !== "UY" && code === "UYU")
    note +=
      " No hay una tasa disponible para tu moneda; mostramos el precio base UYU.";
  if (state.rateInfo.updated && code !== "UYU")
    note += ` Tasas del ${new Date(state.rateInfo.updated).toLocaleDateString("es-UY")}${state.rateInfo.stale ? " (caché desactualizada)" : ""}.`;
  note += " La moneda y el importe definitivo se verifican antes del pago.";
  document.querySelectorAll("[data-currency-note]").forEach((el) => {
    el.textContent = note;
  });
}
function setupCountry() {
  const select = $("#country");
  select.innerHTML = Object.entries(nation)
    .map(
      ([id, [name, code]]) =>
        `<option value="${id}">${name} · ${code}</option>`,
    )
    .join("");
  select.value = state.country;
  select.onchange = () => {
    state.country = select.value;
    storage.set("kit-country", state.country);
    updateMoney();
  };
}
function footer() {
  const c = state.config;
  $(".offer-bar").textContent = c.salesEnabled
    ? "KIT DIGITAL · VERSIÓN URUGUAY · CONSULTÁ EL CATÁLOGO DISPONIBLE"
    : "KIT DIGITAL · VERSIÓN URUGUAY · PROPUESTA EN PREPARACIÓN";
  $("#footer").innerHTML =
    `<nav aria-label="Información legal"><a href="/terminos">Condiciones de venta</a><a href="/reembolsos">Reembolsos</a><a href="/privacidad">Privacidad</a><a href="/biblioteca">Mi biblioteca</a><a href="/admin">Administración</a></nav><p><a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">Tipos de cambio por ExchangeRate-API</a></p><p>© ${new Date().getFullYear()} ${escape(c.brand)} · Uruguay</p><p>Los materiales son un complemento para profesionales. No sustituyen formación clínica, supervisión ni criterio profesional. No se garantizan resultados clínicos.</p><p>${c.merchant ? escape(c.merchant) : "Identificación del vendedor pendiente de configuración."} ${c.supportEmail ? `· <a href="mailto:${escape(c.supportEmail)}">${escape(c.supportEmail)}</a>` : ""}</p>`;
}
function landing() {
  const c = state.config;
  const allPending = c.resources.every((r) => r.status !== "available");
  $("#main").innerHTML = `
<section class="hero center"><div class="container"><span class="eyebrow">PARA PROFESIONALES QUE ATIENDEN A NIÑOS</span><h1>Acompañá cada <u>sesión infantil</u><br>con más recursos para conectar</h1><p class="deck"><span class="teal">UNA PROPUESTA DE +160 RECURSOS TERAPÉUTICOS</span> PARA SUMAR <span class="teal">CLARIDAD, REPERTORIO Y PRACTICIDAD</span> A TU CONSULTORIO</p><img class="kit-art" src="/kit.svg" width="850" height="510" alt="Ilustración original de cuadernos y tarjetas de la propuesta del kit"><p class="art-note">Ilustración de la propuesta · Los materiales se incorporarán cuando estén creados o licenciados.</p><div class="hero-benefits"><span>${icon("heart")}El juego como puente</span><span>${icon("print")}Pensado para imprimir</span><span>${icon("folder")}Por necesidades clínicas</span><span>${icon("search")}Una biblioteca para encontrar</span></div><a class="btn" href="#como-funciona">Ver el kit por dentro</a>${trust()}<p class="preparation">${allPending ? "Estamos preparando el catálogo. Todavía no se realizan ventas ni se entregan materiales." : "Consultá los materiales disponibles y las condiciones de cada plan antes de comprar."}</p></div></section>
<section id="como-funciona" class="cream center"><div class="container"><h2>Mirá cómo <span class="teal">funcionará por dentro</span></h2><p class="subtitle">Una biblioteca para buscar por necesidad, encontrar un recurso disponible<br>y elegir cómo incorporarlo a tu sesión.</p><div class="phone" aria-label="Demostración ilustrativa de la biblioteca"><h3>Kit Consultorio Lúdico</h3><p class="tiny">BIBLIOTECA DE RECURSOS</p><div class="phone-search">⌕ Buscar por tema o necesidad…</div><div class="chips"><span class="chip">Emociones</span><span class="chip">Vínculo</span><span class="chip">Familia</span></div><div class="phone-grid"><div class="demo-card"><b>☀</b>Mi mundo emocional</div><div class="demo-card"><b>♡</b>Construimos un vínculo</div><div class="demo-card"><b>≋</b>Respirar y volver</div><div class="demo-card"><b>✧</b>Mi caja de fortalezas</div></div><button class="play" data-demo aria-label="Abrir demostración de la biblioteca">▶</button><div class="phone-label">CONOCÉ LA EXPERIENCIA<br><small>Demostración ilustrativa · sin descargas</small></div></div><div class="steps"><div class="step"><span class="number">1</span>Elegí la necesidad</div><div class="step"><span class="number">2</span>Explorá los recursos disponibles</div><div class="step"><span class="number">3</span>Adaptalos a tu sesión</div></div><button class="btn" data-demo>Explorar la demostración</button></div></section>
<section class="center"><div class="container"><h2>Hay encuentros en los que <span class="teal">hace falta otro punto de partida</span></h2><p class="subtitle">Situaciones cotidianas del consultorio infantil que invitan a buscar nuevas maneras de acompañar.</p><div class="situations">${[
    ["♡", "Cuando al niño le cuesta empezar a hablar"],
    ["ϟ", "Cuando sostener la atención es un desafío"],
    ["⌂", "Cuando separarse de su familia cuesta"],
    ["☂", "Cuando una pérdida trae emociones difíciles"],
    ["♧", "Cuando los cambios familiares generan preguntas"],
    ["≋", "Cuando las emociones se sienten muy intensas"],
  ]
    .map(([i, t]) => `<div class="situation">${icon(i)}${t}</div>`)
    .join("")}</div><div class="down" aria-hidden="true">↓</div></div></section>
<section class="band"><div class="container"><h2>Más opciones para tu sesión.<br><span>Más espacio para el encuentro.</span></h2><p>Un recurso no reemplaza tu escucha ni tu criterio. Puede abrir una conversación, facilitar la expresión o ayudarte a organizar una propuesta a la medida de cada niño.</p>${cta("Quiero conocer la propuesta", "white")}${trust()}</div></section>
<section id="experiencias" class="center"><div class="container"><span class="eyebrow">EXPERIENCIAS REALES, CUANDO ESTÉN AUTORIZADAS</span><h2 class="section-title">Un espacio para compartir experiencias</h2>${c.testimonials.length ? `<div class="testimonials">${c.testimonials.map((t) => `<blockquote class="quote">“${escape(t.text)}”<cite>${escape(t.name)}</cite></blockquote>`).join("")}</div>` : '<div class="testimonial-empty">Todavía no publicamos testimonios. Este espacio incluirá únicamente experiencias reales con autorización de sus autores.</div>'}<p class="subtitle">Ahora conocé cómo se organiza el contenido previsto para el kit.</p></div></section>
<section id="recursos" class="center"><div class="container"><h2>Una biblioteca para <span class="teal">acompañar tu práctica</span></h2><div class="product-intro"><img src="/kit.svg" width="850" height="510" loading="lazy" alt="Ilustración de la propuesta de materiales"><div><h3>Kit Consultorio Lúdico<br><span class="teal">Más de 160 recursos previstos</span></h3><ul class="checklist">${["Juegos de emociones y tarjetas de sentimientos", "Actividades organizadas por necesidades clínicas", "Dinámicas para el vínculo y las primeras sesiones", "Fichas para acompañar la regulación emocional", "Materiales de psicoeducación para familias", "Incorporaciones futuras según la oferta vigente"].map((t) => `<li>${t}</li>`).join("")}</ul><span class="pending">Catálogo en preparación · sin entrega prometida</span></div></div><p class="bonus-intro">La propuesta del Kit Completo suma cinco complementos para organizar distintos momentos del trabajo clínico.</p><span class="bonus-badge">5 BONOS COMPLEMENTARIOS</span><div class="bonuses">${bonusNames.map((n, i) => `<article class="bonus"><div class="mini-book" aria-hidden="true"></div><div><h3>${n}</h3><p>${bonusCopy[i]}</p><span class="pending">${escape(c.resources.find((r) => r.title === n)?.status === "available" ? "Consultar disponibilidad en biblioteca" : "Pendiente de creación o licencia")}</span></div></article>`).join("")}</div><p class="subtitle">Los archivos habilitados y sus licencias se detallarán en el catálogo.</p><div class="down" aria-hidden="true">↓</div></div></section>
<section class="cream center"><div class="container"><h2>Dos propuestas.<br><span class="teal">Toda la información antes de elegir.</span></h2><p class="subtitle">Compará lo que contempla cada plan. No asignamos valores ficticios a los bonos ni mostramos descuentos sin respaldo.</p><table class="comparison"><thead><tr><th scope="col">Contenido previsto</th><th scope="col">Plan</th></tr></thead><tbody><tr><td>Biblioteca de recursos terapéuticos</td><td>Esencial y Completo</td></tr>${bonusNames.map((n) => `<tr><td>${n}</td><td>Completo</td></tr>`).join("")}</tbody></table><div class="price-summary"><p>Diferencia entre los planes</p><strong>${amount(c.prices.complete - c.prices.essential)}</strong><p>Los cinco complementos están contemplados en el plan Completo, sujetos a disponibilidad.</p></div></div></section>
<section id="planes" class="plans cream center"><div class="container"><h2>Elegí el kit <span class="teal">para tu consultorio</span></h2><p class="subtitle">Precios base en UYU · Venta ${c.salesEnabled ? "sujeta a disponibilidad" : "todavía no habilitada"}</p><div class="price-grid"><article class="plan"><h3>KIT ESENCIAL</h3><p class="plan-desc">Una base de recursos para tu práctica</p><div class="price teal">${amount(c.prices.essential)}</div><p class="price-meta">Pago único · según condiciones de venta</p><button class="btn" data-checkout="essential" ${c.products.essential.active ? "" : "disabled"}>Elegir Kit Esencial</button><ul class="checklist">${baseFeatures.map((t) => `<li>${t}</li>`).join("")}</ul><p class="preparation">Recursos pendientes de creación o licencia. Sin cobro hasta habilitar la venta.</p></article><article class="plan complete"><h3>KIT CONSULTORIO LÚDICO COMPLETO</h3><img class="kit-art" src="/kit.svg" width="850" height="510" loading="lazy" alt="Ilustración de los materiales previstos del Completo"><p class="plan-desc">La propuesta integral, con cinco complementos</p><div class="price">${amount(c.prices.complete)}</div><p class="price-meta">Pago único · según condiciones de venta</p><button class="btn yellow" data-checkout="complete" ${c.products.complete.active ? "" : "disabled"}>Elegir Kit Completo</button><ul class="checklist">${baseFeatures.map((t) => `<li>${t}</li>`).join("")}<li>Actualizaciones futuras según oferta vigente</li></ul><ul class="checklist bonus-list">${bonusNames.map((t) => `<li>${t}</li>`).join("")}</ul></article></div><p class="currency-note" data-currency-note></p><p class="currency-note">Mercado Pago Uruguay: cobro en UYU, cuando esté configurado. Tarjetas internacionales: proveedor pendiente de validación.</p>${trust()}</div></section>
<section><div class="guarantee"><div class="seal"><strong>15</strong><span>DÍAS DE GARANTÍA<br>${c.guaranteeEnabled ? "SEGÚN POLÍTICA" : "PREVISTA"}</span></div><div><h2>${c.guaranteeEnabled ? "Una decisión con condiciones claras" : "Una garantía con respaldo real"}</h2><p>${c.guaranteeEnabled ? escape(c.refundPolicy) : "La propuesta contempla una garantía de satisfacción de 15 días. Aún no está activa: antes de abrir ventas se publicará una política real con plazos, procedimiento y contacto."}</p><p><a href="/reembolsos">Consultar política de reembolso →</a></p></div></div></section>
<section class="cream center"><div class="narrow"><h2>¿Te quedó alguna pregunta?</h2><p class="subtitle">Lo que conviene saber antes de elegir.</p><div class="faq-list">${c.faq.map((f) => `<details><summary>${escape(f.q)}</summary><p>${escape(f.a)}</p></details>`).join("")}</div>${cta("Volver a los planes")}</div></section>
<section class="band"><div class="container"><h2>El juego abre caminos.<br><span>Tu mirada los acompaña.</span></h2><p>Conocé la propuesta y elegí con toda la información.</p>${cta("Conocer los planes", "white")}</div></section>`;
  document.querySelectorAll("[data-demo]").forEach((b) => (b.onclick = demo));
  document
    .querySelectorAll("[data-checkout]")
    .forEach((b) => (b.onclick = () => choosePlan(b.dataset.checkout)));
  updateMoney();
}
function openModal(html) {
  $("#modal-body").innerHTML = html;
  if (!$("#modal").open) $("#modal").showModal();
  updateMoney();
}
function closeModal() {
  $("#modal").close();
}
$("[data-close]").onclick = closeModal;
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
function demo() {
  openModal(
    `<span class="eyebrow">RECORRIDO ILUSTRATIVO</span><h2 id="modal-title">Encontrá un punto de partida</h2><p>Así se podrá explorar la biblioteca. Estas categorías son una demostración; no incluyen materiales descargables.</p><div class="demo-modal-grid">${["Emociones", "Vínculo", "Ansiedad", "Familia"].map((c) => `<button data-demo-category="${c}">${icon("heart")}<br>${c}</button>`).join("")}</div><div id="demo-result" class="notice">Elegí una categoría para conocer su propósito.</div><a href="/biblioteca" class="btn small">Ir a mi biblioteca</a>`,
  );
  document.querySelectorAll("[data-demo-category]").forEach(
    (b) =>
      (b.onclick = () => {
        $("#demo-result").textContent =
          `${b.dataset.demoCategory}: aquí aparecerán los recursos disponibles y autorizados de tu plan. El catálogo está en preparación.`;
      }),
  );
}
function auth(register = false, onSuccess) {
  openModal(
    `<h2 id="modal-title">${register ? "Creá tu cuenta" : "Ingresá a tu biblioteca"}</h2><p>${register ? "Una cuenta no habilita descargas. El acceso depende de un pago confirmado y del plan comprado." : "Usá el correo con el que creaste tu cuenta."}</p><form id="auth-form" class="form"><label>Correo electrónico<input type="email" name="email" required autocomplete="email" maxlength="254"></label><label>Contraseña<input type="password" name="password" required minlength="12" maxlength="128" autocomplete="${register ? "new-password" : "current-password"}"></label><small class="muted">Entre 12 y 128 caracteres.</small><div class="error" role="alert"></div><button class="btn">${register ? "Crear cuenta" : "Ingresar"}</button></form><button class="auth-switch">${register ? "Ya tengo cuenta" : "Quiero crear una cuenta"}</button><p>No hay recuperación automática de contraseña por correo todavía. Guardá tu contraseña de forma segura.</p>`,
  );
  $(".auth-switch").onclick = () => auth(!register, onSuccess);
  $("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target,
      button = $("button", form);
    button.disabled = true;
    try {
      const fields = Object.fromEntries(new FormData(form));
      await api(register ? "/api/register" : "/api/login", {
        method: "POST",
        body: JSON.stringify(fields),
      });
      state.me = await api("/api/me");
      closeModal();
      if (onSuccess) onSuccess();
      else route();
    } catch (err) {
      $(".error", form).textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
}
function choosePlan(plan, offer = false) {
  const c = state.config;
  if (
    plan === "essential" &&
    c.promotions.enabled &&
    c.promotions.upgrade &&
    !offer
  ) {
    openModal(
      `<span class="eyebrow">COMPLEMENTO OPCIONAL</span><h2 id="modal-title">¿Preferís el Kit Completo?</h2><p>Podés elegir la propuesta con los cinco complementos por un precio total de <strong>${amount(c.prices.upgrade)}</strong>. No se suma al precio del Esencial.</p><p>Sin selección automática. Los materiales y la venta siguen sujetos a disponibilidad.</p><div class="form"><button id="upgrade-yes" class="btn">Elegir Completo por ${amount(c.prices.upgrade)}</button><button id="upgrade-no" class="btn outline">Seguir con Esencial por ${amount(c.prices.essential)}</button></div>`,
    );
    $("#upgrade-yes").onclick = () => choosePlan("complete", true);
    $("#upgrade-no").onclick = () => checkoutModal("essential", false);
    return;
  }
  checkoutModal(plan, offer);
}
function checkoutModal(plan, offer) {
  const c = state.config,
    price = offer ? c.prices.upgrade : c.prices[plan];
  openModal(
    `<h2 id="modal-title">Kit ${plan === "essential" ? "Esencial" : "Completo"}</h2><p>Precio ${offer ? "total de la oferta" : "base"}: <strong>UYU ${price}</strong> · Referencia local: <strong>${amount(price)}</strong></p><p data-currency-note></p><div class="notice ${c.salesEnabled ? "" : "warning"}">${c.salesEnabled ? "El servidor verificará el catálogo y la disponibilidad de pago antes de continuar." : "La venta todavía no está habilitada. Faltan materiales autorizados y/o configuración comercial. No vamos a cobrarte."}</div><p>Mercado Pago se ofrece solo para Uruguay y en UYU. La pasarela internacional todavía no está configurada.</p><p><a href="/terminos">Condiciones de venta</a> · <a href="/reembolsos">Reembolsos</a></p><div id="checkout-error" class="error" role="alert"></div><button class="btn" id="checkout-button" ${c.salesEnabled ? "" : "disabled"}>${state.me.user ? "Continuar al pago seguro" : "Ingresar para continuar"}</button>`,
  );
  $("#checkout-button").onclick = async () => {
    if (!state.me.user) return auth(false, () => checkoutModal(plan, offer));
    const b = $("#checkout-button");
    b.disabled = true;
    try {
      const data = await api("/api/checkout", {
        method: "POST",
        body: JSON.stringify({
          plan,
          offer,
          country: state.country,
          currency: currency(),
        }),
      });
      location.assign(data.url);
    } catch (e) {
      $("#checkout-error").textContent = e.message;
      b.disabled = false;
    }
  };
}
async function signOut() {
  await api("/api/logout", { method: "POST", body: "{}" });
  state.me = await api("/api/me");
  route();
}
function accountHead(title) {
  return `<div class="page-head"><div><span class="eyebrow">TU ESPACIO PRIVADO</span><h1>${title}</h1><p class="muted">${escape(state.me.user?.email || "")}</p></div><div class="page-actions">${state.me.user?.role === "admin" ? '<a class="btn small outline" href="/admin">Administración</a>' : ""}<button class="btn small outline" data-logout>Cerrar sesión</button></div></div>`;
}
async function library() {
  if (!state.me.user) {
    $("#main").innerHTML =
      `<div class="page center"><span class="eyebrow">BIBLIOTECA PRIVADA</span><h1>Un lugar para tus recursos</h1><p class="subtitle">Ingresá para consultar los materiales disponibles del plan que compraste.</p><div class="empty">El acceso se habilita únicamente después de confirmar el pago en el servidor. Crear una cuenta no concede acceso a los materiales.</div><button class="btn" id="open-auth">Ingresar o crear cuenta</button></div>`;
    $("#open-auth").onclick = () => auth();
    return;
  }
  const [data, orders] = await Promise.all([
    api("/api/library"),
    api("/api/orders"),
  ]);
  $("#main").innerHTML =
    `<div class="page">${accountHead("Mi biblioteca")}<div class="notice">${data.plan ? `Tu plan: <strong>${data.plan === "complete" ? "Completo" : "Esencial"}</strong>. Solo se muestran archivos disponibles y autorizados.` : "Todavía no hay una compra confirmada en tu cuenta. No se habilitan recursos mediante enlaces de retorno del checkout."}</div><div class="filters"><input id="resource-search" class="search-input" type="search" placeholder="Buscar recursos por nombre o tema" aria-label="Buscar recursos"><select id="resource-category" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>${[...new Set(data.resources.map((r) => r.category))].map((c) => `<option>${escape(c)}</option>`).join("")}</select></div><div id="library-results"></div><h2>Mis pedidos</h2><div class="table-wrap"><table class="admin-table"><thead><tr><th>Fecha</th><th>Plan</th><th>Importe cobrado</th><th>Estado</th></tr></thead><tbody>${orders.length ? orders.map((o) => `<tr><td>${new Date(o.created).toLocaleDateString("es-UY")}</td><td>${o.plan === "complete" ? "Completo" : "Esencial"}</td><td>UYU ${o.amount}</td><td>${escape(statusName(o.status))}</td></tr>`).join("") : '<tr><td colspan="4">Todavía no tenés pedidos.</td></tr>'}</tbody></table></div><p class="preparation">Si acabás de volver de la pasarela, esperá la confirmación y recargá esta página. Un retorno exitoso no acredita por sí solo el pago.</p></div>`;
  const filter = () => {
    const term = $("#resource-search").value.toLocaleLowerCase("es"),
      category = $("#resource-category").value;
    const found = data.resources.filter(
      (r) =>
        (!category || r.category === category) &&
        `${r.title} ${r.description}`.toLocaleLowerCase("es").includes(term),
    );
    $("#library-results").innerHTML = found.length
      ? `<div class="resource-grid">${found.map((r) => `<article class="resource"><span class="eyebrow">${escape(r.category)}</span><h3>${escape(r.title)}</h3><p>${escape(r.description)}</p><p>Licencia: ${escape(r.license)}</p><div class="page-actions"><a class="btn small" target="_blank" rel="noopener" href="/api/files/${r.id}">Ver PDF</a><a class="btn small outline" href="/api/files/${r.id}?download=1">Descargar</a></div></article>`).join("")}</div>`
      : '<div class="empty">No hay materiales disponibles para esta búsqueda y tu plan. Los recursos pendientes no se muestran ni se descargan.</div>';
  };
  $("#resource-search").oninput = filter;
  $("#resource-category").onchange = filter;
  filter();
  $("[data-logout]").onclick = signOut;
}
const statusName = (s) =>
  ({
    pending: "Pendiente",
    approved: "Confirmado",
    rejected: "Rechazado",
    refunded: "Reembolsado",
    charged_back: "Contracargo",
    cancelled: "Cancelado",
    in_process: "En proceso",
    checkout_failed: "Checkout no completado",
  })[s] || s;
const field = (label, name, value, type = "text") =>
  `<label>${label}<input type="${type}" name="${name}" value="${escape(value)}" ${type === "number" ? 'min="1" max="1000000" step="1"' : ""}></label>`;
const check = (label, name, value) =>
  `<label class="checkbox"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${label}</label>`;
async function admin() {
  if (!state.me.user) {
    $("#main").innerHTML =
      '<div class="page center"><h1>Administración</h1><p class="subtitle">Acceso exclusivo para cuentas autorizadas en el servidor.</p><div class="empty">Los roles no se asignan desde el navegador.</div><button class="btn" id="admin-auth">Ingresar</button></div>';
    $("#admin-auth").onclick = () => auth();
    return;
  }
  if (state.me.user.role !== "admin") {
    $("#main").innerHTML =
      '<div class="page"><h1>Acceso restringido</h1><p>Esta cuenta no tiene permisos de administración.</p><p><a href="/biblioteca">Volver a mi biblioteca</a></p></div>';
    return;
  }
  state.admin = await api("/api/admin");
  $("#main").innerHTML =
    `<div class="page">${accountHead("Administración")}<nav class="admin-tabs" aria-label="Secciones de administración">${[
      ["general", "Precios y productos"],
      ["resources", "Materiales y bonos"],
      ["orders", "Pedidos"],
      ["content", "Preguntas y testimonios"],
      ["legal", "Legales y pasarelas"],
    ]
      .map(([id, name]) => `<button data-admin-tab="${id}">${name}</button>`)
      .join("")}</nav><div id="admin-content"></div></div>`;
  $("[data-logout]").onclick = signOut;
  document
    .querySelectorAll("[data-admin-tab]")
    .forEach((b) => (b.onclick = () => adminTab(b.dataset.adminTab)));
  adminTab("general");
}
function adminTab(tab) {
  document
    .querySelectorAll("[data-admin-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.adminTab === tab));
  const c = state.admin.config,
    el = $("#admin-content");
  if (tab === "general") {
    el.innerHTML = `<div class="panel"><h2>Precios base y disponibilidad</h2><p class="notice warning">Todos los importes se guardan en UYU. Activar la venta requiere condiciones legales completas, archivos autorizados y una pasarela configurada.</p><form id="config-form" class="form"><div class="form-grid">${field("Kit Esencial · UYU", "essential", c.prices.essential, "number")}${field("Kit Completo · UYU", "complete", c.prices.complete, "number")}${field("Oferta opcional Completo · precio total UYU", "upgrade", c.prices.upgrade, "number")}</div>${check("Activar promociones", "promotions", c.promotions.enabled)}${check("Ofrecer Completo al elegir Esencial", "upgradeEnabled", c.promotions.upgrade)}<h3>Productos</h3>${check("Esencial visible y activo", "essentialActive", c.products.essential.active)}${check("Esencial: contenido completo y autorizado", "essentialReady", c.products.essential.ready)}${check("Completo visible y activo", "completeActive", c.products.complete.active)}${check("Completo: contenido completo y autorizado", "completeReady", c.products.complete.ready)}${check("Habilitar ventas", "salesEnabled", c.salesEnabled)}<div class="error" role="alert"></div><button class="btn">Guardar configuración</button></form></div>`;
    bindConfig((form) => {
      c.prices = {
        essential: Number(form.get("essential")),
        complete: Number(form.get("complete")),
        upgrade: Number(form.get("upgrade")),
      };
      c.promotions = {
        enabled: form.has("promotions"),
        upgrade: form.has("upgradeEnabled"),
      };
      c.products = {
        essential: {
          active: form.has("essentialActive"),
          ready: form.has("essentialReady"),
        },
        complete: {
          active: form.has("completeActive"),
          ready: form.has("completeReady"),
        },
      };
      c.salesEnabled = form.has("salesEnabled");
    });
  }
  if (tab === "resources") {
    el.innerHTML = `<div class="panel"><div class="page-head"><div><h2>Materiales y bonos</h2><p class="muted">PDF de hasta 10 MB. Se almacenan fuera de la carpeta pública.</p></div><button class="btn small" id="add-resource">Agregar recurso</button></div>${state.admin.resources.map((r) => `<div class="admin-resource"><div><h3>${escape(r.title)}</h3><p>${r.plan === "complete" ? "Completo" : "Esencial"} · ${escape(r.category)} · ${r.hasFile ? "PDF cargado" : "Sin PDF"} · ${escape(r.status)}</p></div><button class="btn small outline" data-edit-resource="${r.id}">Editar</button></div>`).join("")}</div>`;
    $("#add-resource").onclick = () => resourceForm();
    document
      .querySelectorAll("[data-edit-resource]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            resourceForm(
              state.admin.resources.find(
                (r) => r.id === b.dataset.editResource,
              ),
            )),
      );
  }
  if (tab === "orders") {
    el.innerHTML = `<div class="panel"><h2>Pedidos y estados de pago</h2><p class="notice">Los estados se actualizan con webhooks verificados. No se pueden marcar pagos como aprobados manualmente desde esta interfaz.</p><div class="table-wrap"><table class="admin-table"><thead><tr><th>Fecha</th><th>Correo</th><th>Plan</th><th>UYU</th><th>Estado</th></tr></thead><tbody>${state.admin.orders.length ? state.admin.orders.map((o) => `<tr><td>${new Date(o.created).toLocaleDateString("es-UY")}</td><td>${escape(o.email)}</td><td>${o.plan}</td><td>${o.amount}</td><td>${escape(statusName(o.status))}</td></tr>`).join("") : '<tr><td colspan="5">Todavía no hay pedidos.</td></tr>'}</tbody></table></div></div>`;
  }
  if (tab === "content") {
    el.innerHTML = `<div class="panel"><h2>Preguntas y testimonios</h2><p class="notice">Editá las listas JSON. En testimonios usá {"name":"Nombre autorizado", "text":"Texto real", "authorized":true}. Solo publicá contenido con autorización documentada.</p><form id="config-form" class="form"><label>Preguntas frecuentes · q / a<textarea name="faq" rows="12">${escape(JSON.stringify(c.faq, null, 2))}</textarea></label><label>Testimonios autorizados<textarea name="testimonials" rows="6">${escape(JSON.stringify(c.testimonials, null, 2))}</textarea></label><div class="error" role="alert"></div><button class="btn">Guardar contenido</button></form></div>`;
    bindConfig((form) => {
      try {
        c.faq = JSON.parse(form.get("faq"));
        c.testimonials = JSON.parse(form.get("testimonials"));
      } catch {
        throw Error("Revisá el formato JSON de las listas.");
      }
    });
  }
  if (tab === "legal") {
    el.innerHTML = `<div class="panel"><h2>Datos comerciales y políticas</h2><form id="config-form" class="form">${field("Nombre de la propuesta", "brand", c.brand)}${field("Identificación del vendedor · razón social y RUT", "merchant", c.merchant)}${field("Correo de soporte", "supportEmail", c.supportEmail, "email")}<label>Condiciones de venta y licencia de uso<textarea name="terms" rows="8">${escape(c.terms)}</textarea></label><label>Política real de reembolso · canal y procedimiento<textarea name="refundPolicy" rows="8">${escape(c.refundPolicy)}</textarea></label>${check("Activar garantía de 15 días conforme a esta política", "guaranteeEnabled", c.guaranteeEnabled)}<div class="error" role="alert"></div><button class="btn">Guardar políticas</button></form></div><div class="panel"><h2>Pasarelas de pago</h2><p>Mercado Pago Uruguay: <strong>${state.admin.gateways.mercadopago ? "credenciales presentes; falta validar en sandbox" : "sin configurar"}</strong>.</p><p>Pasarela internacional: <strong>pendiente de seleccionar un proveedor compatible con vendedor en Uruguay</strong>.</p><p class="notice">Las claves se configuran como variables privadas del servidor: MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET. No se guardan en esta interfaz ni en el repositorio. Registrá la URL /api/webhooks/mercadopago en Mercado Pago y validá cobros, reembolsos y firma antes de habilitar ventas.</p></div>`;
    bindConfig((form) => {
      for (const k of [
        "brand",
        "merchant",
        "supportEmail",
        "terms",
        "refundPolicy",
      ])
        c[k] = String(form.get(k) || "");
      c.guaranteeEnabled = form.has("guaranteeEnabled");
    });
  }
}
function bindConfig(apply) {
  $("#config-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target,
      b = $("button", form);
    b.disabled = true;
    try {
      apply(new FormData(form));
      await api("/api/admin/config", {
        method: "PUT",
        body: JSON.stringify(state.admin.config),
      });
      state.config = await api("/api/config");
      footer();
      toast("Cambios guardados.");
    } catch (err) {
      $(".error", form).textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
}
function resourceForm(
  r = {
    title: "",
    category: "Recursos terapéuticos",
    plan: "essential",
    status: "pending",
    description: "",
    license: "",
  },
) {
  openModal(
    `<h2 id="modal-title">${r.id ? "Editar" : "Agregar"} recurso</h2><form id="resource-form" class="form">${field("Título", "title", r.title)}${field("Categoría", "category", r.category)}<label>Plan<select name="plan"><option value="essential" ${r.plan === "essential" ? "selected" : ""}>Esencial y Completo</option><option value="complete" ${r.plan === "complete" ? "selected" : ""}>Solo Completo</option></select></label><label>Estado<select name="status"><option value="pending" ${r.status === "pending" ? "selected" : ""}>Pendiente</option><option value="available" ${r.status === "available" ? "selected" : ""}>Disponible</option><option value="archived" ${r.status === "archived" ? "selected" : ""}>Archivado</option></select></label><label>Descripción<textarea name="description">${escape(r.description)}</textarea></label><label>Licencia / autorización documentada<textarea name="license">${escape(r.license)}</textarea></label><label>${r.hasFile ? "Reemplazar PDF (opcional)" : "Archivo PDF"}<input type="file" name="pdf" accept="application/pdf,.pdf"></label><p>Para publicar un recurso se exige un PDF y la constancia de derechos de uso. No cargues historias clínicas ni datos de pacientes.</p><div class="error" role="alert"></div><button class="btn">Guardar recurso</button></form>`,
  );
  $("#resource-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target,
      b = $("button", form);
    b.disabled = true;
    try {
      const f = new FormData(form),
        input = {
          id: r.id,
          title: f.get("title"),
          category: f.get("category"),
          plan: f.get("plan"),
          status: f.get("status"),
          description: f.get("description"),
          license: f.get("license"),
        },
        file = f.get("pdf");
      if (file.size) {
        if (file.size > 10000000)
          throw Error("El PDF debe pesar como máximo 10 MB.");
        input.pdf = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      await api("/api/admin/resources", {
        method: "POST",
        body: JSON.stringify(input),
      });
      state.admin = await api("/api/admin");
      closeModal();
      adminTab("resources");
      toast("Recurso guardado.");
    } catch (err) {
      $(".error", form).textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
}
function legal(path) {
  const c = state.config;
  let title, text;
  if (path === "/terminos") {
    title = "Condiciones de venta";
    text =
      c.terms ||
      "Las condiciones comerciales todavía están en preparación. La venta permanece deshabilitada. Antes de habilitarla se definirán el vendedor, el catálogo disponible, las licencias, la duración del acceso, los medios de pago y el procedimiento de reclamo. No se garantiza la entrega de archivos pendientes.";
  } else if (path === "/reembolsos") {
    title = "Política de reembolso";
    text =
      c.refundPolicy ||
      "La garantía prevista de 15 días todavía no está activa. La política real de reembolso, su canal de solicitud y el responsable se publicarán antes de habilitar ventas. No se están procesando cobros.";
  } else {
    title = "Privacidad";
    text = `Esta aplicación guarda el correo, una contraseña protegida mediante scrypt, sesiones y el historial de pedidos para administrar la cuenta y el acceso a materiales. La cookie de sesión es necesaria, HttpOnly y SameSite. En producción requiere HTTPS. El país seleccionado se recuerda en el almacenamiento local del navegador. No se incluyen herramientas de publicidad ni analítica.\n\nLos tipos de cambio se consultan desde el servidor a ExchangeRate-API; no se envían los datos de tu cuenta a ese proveedor. Las fuentes se cargan desde Google Fonts, que recibe los datos habituales de conexión.\n\nLa ubicación por IP solo se consulta si el operador la habilitó y vos la aceptás. En ese caso se comunica tu IP a ipapi.co para obtener un país aproximado; no se usa GPS. Podés elegir el país manualmente sin aceptar esta consulta.\n\nLos pagos, cuando estén habilitados, se completarán en la pasarela. Esta aplicación no guarda números de tarjeta. No cargues información de pacientes ni documentos clínicos identificables.\n\nResponsable: ${c.merchant || "pendiente de identificación antes de abrir ventas"}. Contacto para consultas, acceso, corrección o eliminación de datos: ${c.supportEmail || "pendiente de configuración"}. La retención de datos, la política de eliminación, las transferencias internacionales y los requisitos aplicables en Uruguay deben ser revisados por el responsable antes del lanzamiento comercial.`;
  }
  $("#main").innerHTML =
    `<article class="page narrow"><h1>${title}</h1><p class="legal">${escape(text)}</p><div class="notice">Los recursos no sustituyen formación clínica, supervisión ni criterio profesional.</div><a href="/" class="btn small">Volver al inicio</a></article>`;
}
async function route() {
  try {
    const path = location.pathname;
    if (path === "/") landing();
    else if (path === "/biblioteca") await library();
    else if (path === "/admin") await admin();
    else legal(path);
    footer();
    updateMoney();
  } catch (e) {
    $("#main").innerHTML =
      `<div class="page"><h1>No pudimos cargar esta sección</h1><p class="error">${escape(e.message)}</p><a href="/">Volver al inicio</a></div>`;
  }
}
async function maybeGeo() {
  if (
    !state.config.geoEnabled ||
    storage.get("kit-country") ||
    storage.get("kit-geo-decision") === "declined"
  )
    return;
  if (storage.get("kit-geo-decision") === "accepted") {
    try {
      const result = await api("/api/country", { method: "POST", body: "{}" });
      if (nation[result.country]) {
        state.country = result.country;
        $("#country").value = state.country;
        updateMoney();
      }
    } catch {}
    return;
  }
  openModal(
    '<h2 id="modal-title">¿Querés ver tu moneda local?</h2><p>Podemos consultar tu país aproximado mediante tu IP con ipapi.co. Es opcional: también podés elegirlo en el selector superior.</p><div class="form"><button class="btn" id="geo-yes">Usar mi país aproximado</button><button class="btn outline" id="geo-no">Elegir manualmente</button></div>',
  );
  $("#geo-no").onclick = () => {
    storage.set("kit-geo-decision", "declined");
    closeModal();
  };
  $("#geo-yes").onclick = async () => {
    storage.set("kit-geo-decision", "accepted");
    try {
      const result = await api("/api/country", { method: "POST", body: "{}" });
      if (nation[result.country]) {
        state.country = result.country;
        $("#country").value = state.country;
        updateMoney();
      } else toast("No pudimos detectar tu país. Podés elegirlo manualmente.");
    } catch {
      toast("La detección no está disponible. Elegí tu país manualmente.");
    }
    closeModal();
  };
}
async function init() {
  setupCountry();
  try {
    [state.config, state.me] = await Promise.all([
      api("/api/config"),
      api("/api/me"),
    ]);
    await route();
    api("/api/rates")
      .then((result) => {
        state.rates = result.rates;
        state.rateInfo = result;
        updateMoney();
      })
      .catch(() => {});
    if (location.pathname === "/") maybeGeo();
  } catch (e) {
    $("#main").innerHTML =
      `<div class="page"><h1>No pudimos conectar con el servidor</h1><p>${escape(e.message)}</p><p>Esta aplicación requiere Node.js; no funciona como sitio estático de GitHub Pages.</p></div>`;
  }
}
init();
