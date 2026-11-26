"use strict";
/* Portal de compras Cartimex · Tecnosmart */

const $ = (s) => document.querySelector(s);
const money = (n) => "$" + (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CART_KEY = "ts_cartimex_cart_v1";
const NOTA_MAX = 200;

const state = { q: "", page: 1, pages: 0, cart: [], direcciones: [], sending: false };

/* ---------- utilidades ---------- */
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: opts.body ? { "Content-Type": "application/json" } : {},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  if (res.status === 401 && path !== "/api/login") { showLogin(); throw new Error("Sesión vencida"); }
  if (!res.ok) {
    const err = new Error(detailText(data?.detail) || `Error ${res.status}`);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

function detailText(d) {
  if (!d) return "";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join("; ");
  if (typeof d === "object") return d.mensaje || d.message || JSON.stringify(d);
  return String(d);
}

function setMsg(node, text, kind = "") { node.textContent = text || ""; node.className = "msg" + (kind ? " " + kind : ""); }

/* ---------- sesión ---------- */
function showLogin() { $("#app").hidden = true; $("#login").hidden = false; $("#password").value = ""; $("#password").focus(); }
function showApp() { $("#login").hidden = true; $("#app").hidden = false; boot(); }

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg($("#loginMsg"), "", "error");
  try {
    await api("/api/login", { method: "POST", body: { password: $("#password").value } });
    showApp();
  } catch (err) { setMsg($("#loginMsg"), err.message, "error"); }
});

$("#logout").addEventListener("click", async () => { await api("/api/logout", { method: "POST" }).catch(() => {}); showLogin(); });

let booted = false;
async function boot() {
  if (booted) return; booted = true;
  loadCart(); renderCart(); newReference();
  api("/api/cuenta").then((c) => {
    $("#cuenta").textContent = `${c.cliente} · nivel ${c.nivel_precio} · clave vence ${c.vence}`;
    if (!c.puede_crear_ordenes) setMsg($("#orderMsg"), "Su clave de Cartimex no tiene permiso para crear órdenes.", "error");
  }).catch(() => {});
  api("/api/direcciones").then((d) => {
    state.direcciones = d.direcciones || [];
    for (const dir of state.direcciones) {
      $("#entrega").append(el("option", { value: "envio:" + dir.id }, `Envío a ${dir.nombre} – ${dir.ciudad} (${dir.transporte || ""})`));
    }
  }).catch(() => {});
  loadOrders();
}

/* ---------- búsqueda ---------- */
$("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); search(1); });
$("#more").addEventListener("click", () => search(state.page + 1, true));

async function search(page, append = false) {
  const q = $("#q").value.trim();
  if (q.length < 2) return;
  state.q = q; state.page = page;
  setMsg($("#searchMsg"), "Buscando en Cartimex…");
  $("#more").hidden = true;
  try {
    const d = await api(`/api/buscar?q=${encodeURIComponent(q)}&solo_disponibles=${$("#soloDisp").checked}&page=${page}`);
    state.pages = d.pages || 0;
    renderResults(d.productos, append);
    const shown = $("#results tbody").children.length;
    setMsg($("#searchMsg"), d.total ? `${d.total} producto(s) encontrados · mostrando ${shown}` : "Sin resultados. Pruebe con el part number o menos palabras.");
    $("#more").hidden = !(d.has_next || page < state.pages);
  } catch (err) { setMsg($("#searchMsg"), err.message, "error"); }
}

function stockCell(main, other) {
  const total = main + other;
  return el("td", { class: "num" + (total ? "" : " stock-0"), title: `Mostrador: ${main} · Otras bodegas: ${other}` },
    String(total), other ? el("span", { class: "sub" }, `${main} mostr. + ${other}`) : null);
}

function priceCells(p) {
  const lista = p.promocion && p.precio_lista && p.precio_lista > p.precio
    ? el("span", { class: "strike" }, money(p.precio_lista)) : null;
  return [
    el("td", { class: "num" }, lista, money(p.precio)),
    el("td", { class: "num" }, money(p.precio_iva), el("span", { class: "sub" }, `IVA ${p.iva_pct}%`)),
  ];
}

function productCell(p) {
  const promo = p.promocion ? el("span", { class: "tag promo", title: `Precio promocional mientras queden ${p.promocion.unidades} u.` }, "PROMO") : null;
  return el("td", { class: "pname" }, p.nombre || "", promo,
    el("small", {}, [p.marca, p.categoria, p.peso_kg ? `${p.peso_kg} kg` : null].filter(Boolean).join(" · ")));
}

function renderResults(list, append) {
  const tb = $("#results tbody");
  if (!append) tb.replaceChildren();
  for (const p of list) {
    const qty = el("input", { type: "number", class: "qty", min: "1", max: "9999", value: "1", "aria-label": "Cantidad" });
    const btn = el("button", { class: "btn primary sm", type: "button" }, "Agregar");
    btn.addEventListener("click", () => {
      addToCart(p, Math.max(1, parseInt(qty.value, 10) || 1));
      btn.textContent = "✓ Agregado"; btn.classList.add("added");
      setTimeout(() => { btn.textContent = "Agregar"; btn.classList.remove("added"); }, 1400);
    });
    tb.append(el("tr", {},
      el("td", { class: "code" }, p.url ? el("a", { href: p.url, target: "_blank", rel: "noopener noreferrer" }, p.codigo) : p.codigo),
      productCell(p),
      stockCell(p.gye_mostrador, p.gye_otras),
      stockCell(p.uio_mostrador, p.uio_otras),
      ...priceCells(p),
      el("td", { class: "num" }, qty),
      el("td", {}, btn),
    ));
  }
  $("#results").hidden = tb.children.length === 0;
}

/* ---------- carrito ---------- */
function loadCart() {
  try { state.cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { state.cart = []; }
  if (!Array.isArray(state.cart)) state.cart = [];
}
function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch { /* sin almacenamiento */ } }

function addToCart(p, qty) {
  const line = state.cart.find((x) => x.codigo === p.codigo);
  if (line) { line.cantidad += qty; Object.assign(line, pick(p)); }
  else state.cart.push({ ...pick(p), cantidad: qty, comentario: "" });
  saveCart(); renderCart();
}
function pick(p) {
  const { codigo, nombre, marca, precio, precio_iva, iva_pct, gye_mostrador, gye_otras, uio_mostrador, uio_otras, peso_kg, url, promocion, precio_lista } = p;
  return { codigo, nombre, marca, precio, precio_iva, iva_pct, gye_mostrador, gye_otras, uio_mostrador, uio_otras, peso_kg, url, promocion, precio_lista };
}

function entregaTipo() { return $("#entrega").value.split(":")[0]; }

function lineWarning(l) {
  const tipo = entregaTipo();
  if (l.encontrado === false) return "Ya no está en el catálogo de Cartimex";
  if (tipo === "retiro_gye" && l.cantidad > l.gye_mostrador) return `Mostrador GYE solo tiene ${l.gye_mostrador}`;
  if (tipo === "retiro_uio" && l.cantidad > l.uio_mostrador) return `Mostrador UIO solo tiene ${l.uio_mostrador}`;
  const total = l.gye_mostrador + l.gye_otras + l.uio_mostrador + l.uio_otras;
  if (l.cantidad > total) return `Cartimex solo tiene ${total} disponibles`;
  return "";
}

function renderCart() {
  const tb = $("#cart tbody");
  tb.replaceChildren();
  let sub = 0, tot = 0, peso = 0, pesoIncompleto = false;
  state.cart.forEach((l, idx) => {
    const lineSub = l.precio * l.cantidad, lineTot = l.precio_iva * l.cantidad;
    sub += lineSub; tot += lineTot;
    if (l.peso_kg) peso += l.peso_kg * l.cantidad; else pesoIncompleto = true;
    const warn = lineWarning(l);

    const qty = el("input", { type: "number", class: "qty", min: "1", max: "9999", value: String(l.cantidad), "aria-label": "Cantidad" });
    qty.addEventListener("change", () => { l.cantidad = Math.max(1, Math.min(9999, parseInt(qty.value, 10) || 1)); saveCart(); renderCart(); });
    const com = el("input", { class: "comment", maxlength: "100", placeholder: "Comentario…", value: l.comentario || "" });
    com.addEventListener("input", () => { l.comentario = com.value; saveCart(); updateNota(); });
    const del = el("button", { class: "btn ghost danger sm", type: "button", title: "Quitar" }, "✕");
    del.addEventListener("click", () => { state.cart.splice(idx, 1); saveCart(); renderCart(); });

    const name = el("td", { class: "pname" }, l.nombre || "", l.promocion ? el("span", { class: "tag promo" }, "PROMO") : null,
      warn ? el("span", { class: "warn-txt" }, "⚠ " + warn) : el("small", {}, l.marca || ""));
    tb.append(el("tr", { class: warn ? "warn" : "" },
      el("td", { class: "code" }, l.url ? el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, l.codigo) : l.codigo),
      name,
      stockCell(l.gye_mostrador, l.gye_otras),
      stockCell(l.uio_mostrador, l.uio_otras),
      el("td", { class: "num" }, qty),
      el("td", { class: "num" }, money(l.precio)),
      el("td", { class: "num" }, money(l.precio_iva)),
      el("td", { class: "num" }, money(lineSub)),
      el("td", { class: "num" }, money(lineTot)),
      el("td", {}, com),
      el("td", {}, del),
    ));
  });
  const has = state.cart.length > 0;
  $("#cart").hidden = !has; $("#orderForm").hidden = !has; $("#cartEmpty").hidden = has;
  $("#cartCount").textContent = String(state.cart.reduce((a, l) => a + l.cantidad, 0));
  $("#tSub").replaceChildren(money(sub), el("span", { class: "sub" }, `IVA ${money(tot - sub)}`));
  $("#tTot").replaceChildren(el("b", {}, money(tot)));
  $("#tExtra").textContent = `${state.cart.length} línea(s) · peso aprox. ${peso.toFixed(2)} kg${pesoIncompleto ? " (incompleto)" : ""}`;
  updateNota();
}

function buildNota() {
  const parts = [];
  const g = $("#comentario").value.trim();
  if (g) parts.push(g);
  for (const l of state.cart) if ((l.comentario || "").trim()) parts.push(`${l.codigo}: ${l.comentario.trim()}`);
  return parts.join(" | ");
}
function updateNota() {
  const n = buildNota().length;
  $("#notaCount").textContent = String(n);
  $("#notaCount").style.color = n > NOTA_MAX ? "var(--danger)" : "";
}
$("#comentario").addEventListener("input", updateNota);
$("#entrega").addEventListener("change", renderCart);

$("#clear").addEventListener("click", () => {
  if (!state.cart.length || !confirm("¿Vaciar la orden?")) return;
  state.cart = []; saveCart(); renderCart();
});

$("#refresh").addEventListener("click", () => refreshCart(true));

async function refreshCart(verbose) {
  if (!state.cart.length) return { changed: [] };
  if (verbose) setMsg($("#orderMsg"), "Consultando precios y stock actuales…");
  const d = await api("/api/stock", { method: "POST", body: { codigos: state.cart.map((l) => l.codigo) } });
  const byCode = Object.fromEntries(d.resultados.map((r) => [r.codigo, r]));
  const changed = [];
  for (const l of state.cart) {
    const r = byCode[l.codigo];
    if (!r) continue;
    if (r.encontrado === false) { l.encontrado = false; l.gye_mostrador = l.gye_otras = l.uio_mostrador = l.uio_otras = 0; changed.push(`${l.codigo} sin stock`); continue; }
    if (Math.abs(r.precio - l.precio) > 0.004) changed.push(`${l.codigo}: ${money(l.precio)} → ${money(r.precio)}`);
    Object.assign(l, pick(r), { encontrado: true });
  }
  saveCart(); renderCart();
  if (verbose) setMsg($("#orderMsg"), changed.length ? "Cambios: " + changed.join(" · ") : "Precios y stock al día.", changed.length ? "error" : "ok");
  return { changed };
}

/* ---------- orden ---------- */
function newReference() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  $("#ref").value = `TS-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

$("#orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (state.sending || !state.cart.length) return;
  const msg = $("#orderMsg");
  const nota = buildNota();
  if (nota.length > NOTA_MAX) return setMsg(msg, `Los comentarios suman ${nota.length} caracteres; Cartimex acepta ${NOTA_MAX}. Acórtelos.`, "error");

  try {
    const { changed } = await refreshCart(false);
    if (changed.length) return setMsg(msg, "Precios o stock cambiaron, revise antes de subir: " + changed.join(" · "), "error");
  } catch (err) { return setMsg(msg, "No se pudo verificar el stock: " + err.message, "error"); }

  const warns = state.cart.map((l) => [l.codigo, lineWarning(l)]).filter(([, w]) => w);
  if (warns.length) return setMsg(msg, "Corrija antes de subir: " + warns.map(([c, w]) => `${c} (${w})`).join(" · "), "error");

  const [tipo, dirId] = $("#entrega").value.split(":");
  const sub = state.cart.reduce((a, l) => a + l.precio * l.cantidad, 0);
  const tot = state.cart.reduce((a, l) => a + l.precio_iva * l.cantidad, 0);
  const body = $("#confirmBody");
  body.replaceChildren(el("dl", {},
    el("dt", {}, "Referencia"), el("dd", {}, $("#ref").value),
    el("dt", {}, "Entrega"), el("dd", {}, $("#entrega").selectedOptions[0].textContent),
    el("dt", {}, "Productos"), el("dd", {}, `${state.cart.length} línea(s), ${state.cart.reduce((a, l) => a + l.cantidad, 0)} unidad(es)`),
    el("dt", {}, "Subtotal"), el("dd", {}, money(sub)),
    el("dt", {}, "Total con IVA"), el("dd", {}, el("b", {}, money(tot))),
    el("dt", {}, "Nota"), el("dd", {}, nota || "—"),
  ));
  const dlg = $("#confirm");
  dlg.returnValue = "";
  dlg.showModal();
  dlg.addEventListener("close", async function onClose() {
    dlg.removeEventListener("close", onClose);
    if (dlg.returnValue === "ok") await sendOrder(tipo, dirId);
  });
});

async function sendOrder(tipo, dirId) {
  const msg = $("#orderMsg"), btn = $("#submitOrder");
  state.sending = true; btn.disabled = true; btn.textContent = "Subiendo…";
  setMsg(msg, "Enviando la orden a Cartimex…");
  const payload = {
    referencia: $("#ref").value.trim(),
    entrega: tipo === "envio" ? { tipo, direccion_id: dirId } : { tipo },
    comentario: $("#comentario").value.trim(),
    items: state.cart.map((l) => ({ codigo: l.codigo, cantidad: l.cantidad, precio_esperado: l.precio, comentario: (l.comentario || "").trim() })),
  };
  try {
    const d = await api("/api/ordenes", { method: "POST", body: payload });
    const r = d.respuesta || {};
    msg.replaceChildren(el("div", { class: "result" },
      el("b", {}, r.repetida ? "Esta referencia ya existía en Cartimex (no se duplicó). " : "✓ Orden creada en Cartimex. "),
      `Orden ${r.orden || "—"} · estado ${r.estado || "—"} · total estimado ${money(r.total_estimado)}`));
    msg.className = "msg";
    state.cart = []; saveCart(); renderCart(); $("#comentario").value = ""; newReference(); loadOrders();
  } catch (err) {
    msg.replaceChildren(el("div", { class: "result bad" }, el("b", {}, `No se creó la orden (${err.status || "error"}). `), err.message));
    msg.className = "msg";
    if (err.status === 409) refreshCart(false).catch(() => {});
  } finally {
    state.sending = false; btn.disabled = false; btn.textContent = "Subir orden a Cartimex";
  }
}

/* ---------- órdenes recientes ---------- */
$("#loadOrders").addEventListener("click", loadOrders);
async function loadOrders() {
  const tb = $("#orders tbody");
  try {
    const d = await api("/api/ordenes?dias=60");
    const list = d.ordenes || [];
    tb.replaceChildren(...list.map((o) => el("tr", {},
      el("td", { class: "code" }, o.referencia || ""),
      el("td", { class: "code" }, o.orden || ""),
      el("td", {}, o.estado || ""),
      el("td", {}, o.estado_detalle || ""),
      el("td", { class: "num" }, o.total_estimado != null ? money(o.total_estimado) : ""),
      el("td", {}, (o.creada || "").replace("T", " ").slice(0, 16)),
    )));
    $("#orders").hidden = !list.length;
    $("#ordersMsg").textContent = list.length ? "" : "No hay órdenes en los últimos 60 días.";
  } catch (err) { $("#ordersMsg").textContent = "No se pudieron cargar las órdenes: " + err.message; }
}

/* ---------- inicio ---------- */
api("/api/sesion").then((s) => (s.activa ? showApp() : showLogin())).catch(showLogin);
