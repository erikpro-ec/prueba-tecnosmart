"use strict";
/* Compras Cartimex · Tecnosmart — versión estática (GitHub Pages).
 * La API key NO está en este archivo: el usuario la pega una vez y queda solo en su navegador.
 * Cartimex permite llamadas desde el navegador (CORS) con el encabezado X-API-Key. */

const CX = "https://www.cartimex.com/api/v1";
const PASS_SHA256 = "5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5"; // clave de acceso
const K_KEY = "ts_cx_key", K_CART = "ts_cx_cart_v1", K_UNLOCK = "ts_cx_unlocked", K_LOG = "ts_cx_log_v1";
const NOTA_MAX = 200;

const $ = (s) => document.querySelector(s);
const money = (n) => "$" + (Number(n) || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const state = { q: "", page: 1, cart: [], key: "", sending: false };

/* ---------- almacenamiento seguro ante bloqueos ---------- */
const store = {
  get(k, s = localStorage) { try { return s.getItem(k); } catch { return null; } },
  set(k, v, s = localStorage) { try { s.setItem(k, v); return true; } catch { return false; } },
  del(k, s = localStorage) { try { s.removeItem(k); } catch { /* nada */ } },
};

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
function setMsg(node, text, kind = "") { node.textContent = text || ""; node.className = "msg" + (kind ? " " + kind : ""); }
function detailText(d) {
  if (!d) return "";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join("; ");
  if (typeof d === "object") return d.mensaje || d.message || JSON.stringify(d);
  return String(d);
}

/* ---------- llamadas a Cartimex ---------- */
async function cx(method, path, { params, body, key } = {}) {
  const url = new URL(CX + path);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  let res;
  try {
    res = await fetch(url, {
      method, mode: "cors", cache: "no-store", referrerPolicy: "no-referrer",
      headers: { "X-API-Key": key || state.key, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error("No se pudo conectar con Cartimex. Revise su internet."), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    if (res.status === 401 && !key) { forgetKey(); throw Object.assign(new Error("La API key fue rechazada o venció: " + detailText(data.detail)), { status: 401 }); }
    if (res.status === 429) throw Object.assign(new Error("Demasiadas consultas en un minuto. Espere un momento."), { status: 429 });
    throw Object.assign(new Error(detailText(data.detail) || `Error ${res.status} de Cartimex`), { status: res.status, data });
  }
  return data;
}

function disp(stock, b) { return Number((stock && stock[b] && stock[b].disponible) || 0); }
function simplificar(p) {
  const stock = p.stock || {};
  const precio = Number(p.precio_final ?? p.precio ?? 0);
  const iva = Number(p.iva_pct ?? 15);
  return {
    codigo: p.codigo, nombre: p.nombre, marca: p.marca, categoria: p.categoria,
    encontrado: p.encontrado !== false, precio_lista: p.precio, promocion: p.promocion,
    precio: Math.round(precio * 100) / 100, iva_pct: iva, precio_iva: Math.round(precio * (1 + iva / 100) * 100) / 100,
    peso_kg: p.peso_kg, imagen: p.imagen, url: p.url,
    gye_mostrador: disp(stock, "mostrador_guayaquil"), gye_otras: disp(stock, "otras_guayaquil"),
    uio_mostrador: disp(stock, "mostrador_quito"), uio_otras: disp(stock, "otras_quito"),
  };
}

/* ---------- acceso ---------- */
async function sha256(t) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function show(id) { for (const s of ["#login", "#keySetup", "#app"]) $(s).hidden = s !== id; }

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if ((await sha256($("#password").value)) !== PASS_SHA256) return setMsg($("#loginMsg"), "Clave incorrecta", "error");
  store.set(K_UNLOCK, "1", sessionStorage);
  next();
});

$("#keyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = $("#apikey").value.trim();
  setMsg($("#keyMsg"), "Verificando con Cartimex…");
  try {
    await cx("GET", "/cuenta", { key });
    state.key = key;
    if ($("#remember").checked) store.set(K_KEY, key); else store.set(K_KEY, key, sessionStorage);
    $("#apikey").value = "";
    next();
  } catch (err) { setMsg($("#keyMsg"), err.message, "error"); }
});

function forgetKey() { state.key = ""; store.del(K_KEY); store.del(K_KEY, sessionStorage); }
$("#forgetKey").addEventListener("click", () => {
  if (!confirm("¿Borrar la API key de Cartimex de este navegador? Tendrá que pegarla de nuevo.")) return;
  forgetKey(); show("#keySetup");
});
$("#logout").addEventListener("click", () => { store.del(K_UNLOCK, sessionStorage); $("#password").value = ""; show("#login"); });

function next() {
  if (store.get(K_UNLOCK, sessionStorage) !== "1") return show("#login");
  state.key = state.key || store.get(K_KEY) || store.get(K_KEY, sessionStorage) || "";
  if (!state.key) return show("#keySetup");
  show("#app"); boot();
}

let booted = false;
function boot() {
  if (booted) return; booted = true;
  loadCart(); renderCart(); newReference();
  cx("GET", "/cuenta").then((c) => {
    $("#cuenta").textContent = `${c.cliente} · nivel ${c.nivel_precio} · clave vence ${c.vence}`;
    if (!c.puede_crear_ordenes) setMsg($("#orderMsg"), "Su clave de Cartimex no tiene permiso para crear órdenes.", "error");
  }).catch((err) => setMsg($("#searchMsg"), err.message, "error"));
  cx("GET", "/direcciones").then((d) => {
    for (const dir of d.direcciones || []) {
      $("#entrega").append(el("option", { value: "envio:" + dir.id }, `Envío a ${dir.nombre} – ${dir.ciudad} (${dir.transporte || ""})`));
    }
  }).catch(() => {});
  loadOrders();
  $("#q").focus();
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
  const params = { q, page, limit: 50 };
  if ($("#soloDisp").checked) params.solo_disponibles = "true";
  try {
    let d;
    try { d = await cx("GET", "/productos", { params }); }
    catch (err) { if (err.status === 404) d = { productos: [], total: 0 }; else throw err; }
    renderResults((d.productos || []).map(simplificar), append);
    const shown = $("#results tbody").children.length;
    setMsg($("#searchMsg"), d.total ? `${d.total} producto(s) encontrados · mostrando ${shown}` : "Sin resultados. Pruebe con el part number o menos palabras.");
    $("#more").hidden = !(d.has_next || (d.pages && page < d.pages));
  } catch (err) { setMsg($("#searchMsg"), err.message, "error"); }
}

function stockCell(main, other) {
  const total = main + other;
  return el("td", { class: "num" + (total ? "" : " stock-0"), title: `Mostrador: ${main} · Otras bodegas: ${other}` },
    String(total), other ? el("span", { class: "sub" }, `${main} mostr. + ${other}`) : null);
}
function priceCells(p) {
  const lista = p.promocion && p.precio_lista > p.precio ? el("span", { class: "strike" }, money(p.precio_lista)) : null;
  return [
    el("td", { class: "num" }, lista, money(p.precio)),
    el("td", { class: "num" }, money(p.precio_iva), el("span", { class: "sub" }, `IVA ${p.iva_pct}%`)),
  ];
}
function codeCell(p) {
  return el("td", { class: "code" }, p.url ? el("a", { href: p.url, target: "_blank", rel: "noopener noreferrer" }, p.codigo) : p.codigo);
}

function renderResults(list, append) {
  const tb = $("#results tbody");
  if (!append) tb.replaceChildren();
  for (const p of list) {
    const qty = el("input", { type: "number", class: "qty", min: "1", max: "9999", value: "1", "aria-label": "Cantidad" });
    const btn = el("button", { class: "btn primary", type: "button" }, "Agregar");
    btn.addEventListener("click", () => {
      addToCart(p, Math.max(1, parseInt(qty.value, 10) || 1));
      btn.textContent = "✓ Agregado"; btn.classList.add("added");
      setTimeout(() => { btn.textContent = "Agregar"; btn.classList.remove("added"); }, 1400);
    });
    const img = p.imagen ? el("img", { src: p.imagen, alt: "", class: "thumb", loading: "lazy", referrerpolicy: "no-referrer" }) : null;
    if (img) img.addEventListener("error", () => { img.style.visibility = "hidden"; });
    const promo = p.promocion ? el("span", { class: "tag promo", title: `Precio promocional mientras queden ${p.promocion.unidades} u.` }, "PROMO") : null;
    tb.append(el("tr", {},
      el("td", {}, img),
      codeCell(p),
      el("td", { class: "pname" }, p.nombre || "", promo,
        el("small", {}, [p.marca, p.categoria, p.peso_kg ? `${p.peso_kg} kg` : null].filter(Boolean).join(" · "))),
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
  try { state.cart = JSON.parse(store.get(K_CART) || "[]"); } catch { state.cart = []; }
  if (!Array.isArray(state.cart)) state.cart = [];
}
function saveCart() { store.set(K_CART, JSON.stringify(state.cart)); }
function pick(p) {
  const { codigo, nombre, marca, precio, precio_iva, iva_pct, gye_mostrador, gye_otras, uio_mostrador, uio_otras, peso_kg, url, promocion, precio_lista, encontrado } = p;
  return { codigo, nombre, marca, precio, precio_iva, iva_pct, gye_mostrador, gye_otras, uio_mostrador, uio_otras, peso_kg, url, promocion, precio_lista, encontrado };
}
function addToCart(p, qty) {
  const line = state.cart.find((x) => x.codigo === p.codigo);
  if (line) { line.cantidad += qty; Object.assign(line, pick(p)); }
  else state.cart.push({ ...pick(p), cantidad: qty, comentario: "" });
  saveCart(); renderCart();
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
  let sub = 0, tot = 0, peso = 0, pesoInc = false;
  state.cart.forEach((l, idx) => {
    const ls = l.precio * l.cantidad, lt = l.precio_iva * l.cantidad;
    sub += ls; tot += lt;
    if (l.peso_kg) peso += l.peso_kg * l.cantidad; else pesoInc = true;
    const warn = lineWarning(l);
    const qty = el("input", { type: "number", class: "qty", min: "1", max: "9999", value: String(l.cantidad), "aria-label": "Cantidad" });
    qty.addEventListener("change", () => { l.cantidad = Math.max(1, Math.min(9999, parseInt(qty.value, 10) || 1)); saveCart(); renderCart(); });
    const com = el("input", { class: "comment", maxlength: "100", placeholder: "Comentario…", value: l.comentario || "" });
    com.addEventListener("input", () => { l.comentario = com.value; saveCart(); updateNota(); });
    const del = el("button", { class: "btn ghost danger sm", type: "button", title: "Quitar" }, "✕");
    del.addEventListener("click", () => { state.cart.splice(idx, 1); saveCart(); renderCart(); });
    tb.append(el("tr", { class: warn ? "warn" : "" },
      codeCell(l),
      el("td", { class: "pname" }, l.nombre || "", l.promocion ? el("span", { class: "tag promo" }, "PROMO") : null,
        warn ? el("span", { class: "warn-txt" }, "⚠ " + warn) : el("small", {}, l.marca || "")),
      stockCell(l.gye_mostrador, l.gye_otras),
      stockCell(l.uio_mostrador, l.uio_otras),
      el("td", { class: "num" }, qty),
      el("td", { class: "num" }, money(l.precio)),
      el("td", { class: "num" }, money(l.precio_iva)),
      el("td", { class: "num" }, money(ls)),
      el("td", { class: "num" }, money(lt)),
      el("td", {}, com),
      el("td", {}, del),
    ));
  });
  const has = state.cart.length > 0;
  $("#cart").hidden = !has; $("#orderForm").hidden = !has; $("#cartEmpty").hidden = has;
  $("#cartCount").textContent = String(state.cart.reduce((a, l) => a + l.cantidad, 0));
  $("#tSub").replaceChildren(money(sub), el("span", { class: "sub" }, `IVA ${money(tot - sub)}`));
  $("#tTot").replaceChildren(el("b", {}, money(tot)));
  $("#tExtra").textContent = `${state.cart.length} línea(s) · peso aprox. ${peso.toFixed(2)} kg${pesoInc ? " (incompleto)" : ""}`;
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
$("#refresh").addEventListener("click", () => refreshCart(true).catch((err) => setMsg($("#orderMsg"), err.message, "error")));

async function refreshCart(verbose) {
  if (!state.cart.length) return { changed: [] };
  if (verbose) setMsg($("#orderMsg"), "Consultando precios y stock actuales…");
  const d = await cx("POST", "/stock/bulk", { body: { codigos: state.cart.map((l) => l.codigo) } });
  const byCode = Object.fromEntries((d.resultados || []).map((r) => [r.codigo, simplificar(r)]));
  const changed = [];
  for (const l of state.cart) {
    const r = byCode[l.codigo];
    if (!r) continue;
    if (!r.encontrado) { Object.assign(l, { encontrado: false, gye_mostrador: 0, gye_otras: 0, uio_mostrador: 0, uio_otras: 0 }); changed.push(`${l.codigo} sin stock`); continue; }
    if (Math.abs(r.precio - l.precio) > 0.004) changed.push(`${l.codigo}: ${money(l.precio)} → ${money(r.precio)}`);
    Object.assign(l, pick(r));
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
  const codes = state.cart.map((l) => l.codigo);
  if (new Set(codes).size !== codes.length) return setMsg(msg, "Hay productos repetidos en la orden.", "error");
  try {
    const { changed } = await refreshCart(false);
    if (changed.length) return setMsg(msg, "Precios o stock cambiaron, revise antes de subir: " + changed.join(" · "), "error");
  } catch (err) { return setMsg(msg, "No se pudo verificar el stock: " + err.message, "error"); }
  const warns = state.cart.map((l) => [l.codigo, lineWarning(l)]).filter(([, w]) => w);
  if (warns.length) return setMsg(msg, "Corrija antes de subir: " + warns.map(([c, w]) => `${c} (${w})`).join(" · "), "error");

  const [tipo, dirId] = $("#entrega").value.split(":");
  const sub = state.cart.reduce((a, l) => a + l.precio * l.cantidad, 0);
  const tot = state.cart.reduce((a, l) => a + l.precio_iva * l.cantidad, 0);
  $("#confirmBody").replaceChildren(el("dl", {},
    el("dt", {}, "Referencia"), el("dd", {}, $("#ref").value),
    el("dt", {}, "Entrega"), el("dd", {}, $("#entrega").selectedOptions[0].textContent),
    el("dt", {}, "Productos"), el("dd", {}, state.cart.map((l) => `${l.cantidad} × ${l.codigo}`).join(", ")),
    el("dt", {}, "Subtotal"), el("dd", {}, money(sub)),
    el("dt", {}, "Total con IVA"), el("dd", {}, el("b", {}, money(tot))),
    el("dt", {}, "Nota"), el("dd", {}, nota || "—"),
  ));
  const dlg = $("#confirm");
  dlg.returnValue = "";
  dlg.addEventListener("close", function onClose() {
    dlg.removeEventListener("close", onClose);
    if (dlg.returnValue === "ok") sendOrder(tipo, dirId, nota);
  });
  dlg.showModal();
});

async function sendOrder(tipo, dirId, nota) {
  const msg = $("#orderMsg"), btn = $("#submitOrder");
  const referencia = $("#ref").value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9\-_/]{2,39}$/.test(referencia)) return setMsg(msg, "Referencia no válida.", "error");
  state.sending = true; btn.disabled = true; btn.textContent = "Subiendo…";
  setMsg(msg, "Enviando la orden a Cartimex…");
  const body = {
    referencia,
    items: state.cart.map((l) => ({ codigo: l.codigo, cantidad: l.cantidad, precio_esperado: l.precio })),
    entrega: tipo === "envio" ? { tipo, direccion_id: dirId } : { tipo },
    ...(nota ? { nota } : {}),
  };
  const log = { fecha: new Date().toISOString(), enviado: body };
  try {
    const r = await cx("POST", "/ordenes", { body });
    log.respuesta = r;
    msg.replaceChildren(el("div", { class: "result" },
      el("b", {}, r.repetida ? "Esta referencia ya existía en Cartimex (no se duplicó). " : "✓ Orden creada en Cartimex. "),
      `Orden ${r.orden || "—"} · estado ${r.estado || "—"} · total estimado ${money(r.total_estimado)}`));
    msg.className = "msg";
    state.cart = []; saveCart(); renderCart(); $("#comentario").value = ""; newReference(); loadOrders();
  } catch (err) {
    log.error = { status: err.status, detalle: err.message };
    msg.replaceChildren(el("div", { class: "result bad" }, el("b", {}, `No se creó la orden (${err.status || "error"}). `), err.message));
    msg.className = "msg";
    if (err.status === 409) refreshCart(false).catch(() => {});
  } finally {
    try { const arr = JSON.parse(store.get(K_LOG) || "[]"); arr.unshift(log); store.set(K_LOG, JSON.stringify(arr.slice(0, 50))); } catch { /* nada */ }
    state.sending = false; btn.disabled = false; btn.textContent = "Subir orden a Cartimex";
  }
}

/* ---------- órdenes recientes ---------- */
$("#loadOrders").addEventListener("click", loadOrders);
async function loadOrders() {
  const tb = $("#orders tbody");
  try {
    const d = await cx("GET", "/ordenes", { params: { dias: 60 } });
    const list = d.ordenes || [];
    tb.replaceChildren(...list.map((o) => el("tr", {},
      el("td", { class: "code" }, o.referencia || ""),
      el("td", { class: "code" }, o.orden || ""),
      el("td", {}, o.estado || ""),
      el("td", {}, o.estado_detalle || ""),
      el("td", { class: "num" }, o.total_estimado != null ? money(o.total_estimado) : ""),
      el("td", {}, String(o.creada || "").replace("T", " ").slice(0, 16)),
    )));
    $("#orders").hidden = !list.length;
    $("#ordersMsg").textContent = list.length ? "" : "No hay órdenes en los últimos 60 días.";
  } catch (err) { $("#ordersMsg").textContent = "No se pudieron cargar las órdenes: " + err.message; }
}

next();
