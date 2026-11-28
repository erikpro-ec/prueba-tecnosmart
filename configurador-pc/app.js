/* TECNOSMART · Configurador PC — aplicación. */
(() => {
  'use strict';
  const CFG = Object.assign({}, window.CONFIG_PC);
  const qp = new URLSearchParams(location.search);
  if (qp.get('demo') === '1') CFG.modo = 'demo';
  const U = Compat.U;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NF = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
  const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const money = v => NF.format(r2(v || 0));
  const pct = v => (isFinite(v) ? v : 0).toFixed(1).replace('.', ',') + ' %';
  const IVA = CFG.iva / 100;
  const store = {
    get(k, ses) { try { return JSON.parse((ses ? sessionStorage : localStorage).getItem(k)); } catch (e) { return null; } },
    set(k, v, ses) { try { (ses ? sessionStorage : localStorage).setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
    del(k, ses) { try { (ses ? sessionStorage : localStorage).removeItem(k); } catch (e) { /* nada */ } }
  };

  const STEPS = [
    { k: 'cpu', t: 'Procesador', max: 1 }, { k: 'mb', t: 'Mainboard', max: 1 }, { k: 'ram', t: 'Memoria RAM', max: 4 },
    { k: 'ssd', t: 'SSD interno', max: 4 }, { k: 'hdd', t: 'Disco duro', max: 2 }, { k: 'gpu', t: 'Tarjeta de video', max: 1 },
    { k: 'case', t: 'Case', max: 1 }, { k: 'psu', t: 'Fuente de poder', max: 1 }, { k: 'water', t: 'Water cooler', max: 1 },
    { k: 'air', t: 'Air cooler', max: 1 }, { k: 'fan', t: 'Ventiladores', max: 2 }, { k: 'monitor', t: 'Monitor', max: 1 },
    { k: 'teclado', t: 'Teclado', max: 1 }, { k: 'mouse', t: 'Mouse', max: 1 }
  ];
  const S = Object.fromEntries(STEPS.map(s => [s.k, s]));

  const st = { odoo: null, user: null, catalog: {}, cats: [], stepCats: {}, imgs: {}, sel: {}, step: 'cpu', q: '', sort: 'precio',
    desc: 0, cli: { modo: 'final', partner: null }, lf: null, pedido: null, busy: false };

  // ---------- utilidades ----------
  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), err ? 6500 : 3800);
  }
  function loading(on, txt) { $('#loading').hidden = !on; if (txt) $('#loading-txt').textContent = txt; }
  const mime = b => b.startsWith('/9j/') ? 'image/jpeg' : b.startsWith('iVBOR') ? 'image/png' : b.startsWith('PHN2') || b.startsWith('PD94') ? 'image/svg+xml' : b.startsWith('R0lG') ? 'image/gif' : b.startsWith('UklG') ? 'image/webp' : 'image/png';
  const imgUrl = b => `data:${mime(b)};base64,${b}`;
  const mk = () => CFG.modo === 'demo' ? new window.DemoOdoo(CFG) : new window.OdooClient(CFG);

  const prod = (k, id) => st.catalog[k] && st.catalog[k].byId[id];
  const lines = k => st.sel[k] || (st.sel[k] = []);
  const units = k => lines(k).reduce((a, l) => a + l.qty * (k === 'ram' ? ((prod(k, l.id) || {})._i || {}).modulos || 1 : 1), 0);
  function ctxSel() {
    const first = k => { const l = lines(k)[0]; const p = l && prod(k, l.id); return p ? p._i : null; };
    return { cpu: first('cpu'), mb: first('mb'), gpu: first('gpu'), case: first('case'), psu: first('psu'), water: lines('water').length > 0, air: lines('air').length > 0 };
  }
  const maxUnits = (k, ctx) => k === 'ram' ? Math.min(4, (ctx || ctxSel()).mb ? (ctx || ctxSel()).mb.ranuras : 4) : S[k].max;
  function allLines() {
    const out = [];
    STEPS.forEach(s => lines(s.k).forEach(l => { const p = prod(s.k, l.id); if (p) out.push({ k: s.k, p, qty: l.qty }); }));
    return out;
  }
  function gan(v, c) { return CFG.gananciaSobre === 'precio' ? (v ? (v - c) / v * 100 : 0) : (c ? (v - c) / c * 100 : 0); }
  function calc(p, qty) {
    const d = st.desc / 100, costo = r2(p.standard_price * qty), bruto = r2(p.lst_price * qty), sin = r2(p.lst_price * qty * (1 - d));
    return { costo, bruto, sin, con: r2(sin * (1 + IVA)), gan: gan(sin, costo) };
  }
  function totales() {
    const t = { costo: 0, bruto: 0, sin: 0, n: 0 };
    allLines().forEach(l => { const c = calc(l.p, l.qty); t.costo += c.costo; t.bruto += c.bruto; t.sin += c.sin; t.n += l.qty; });
    t.costo = r2(t.costo); t.bruto = r2(t.bruto); t.sin = r2(t.sin);
    t.desc = r2(t.bruto - t.sin); t.iva = r2(t.sin * IVA); t.total = r2(t.sin + t.iva); t.ganV = r2(t.sin - t.costo); t.ganP = gan(t.sin, t.costo);
    return t;
  }
  function requisitos() {
    const ctx = ctxSel(), n = k => lines(k).length;
    const r = [
      { k: 'cpu', ok: n('cpu') > 0, t: 'Procesador' }, { k: 'mb', ok: n('mb') > 0, t: 'Mainboard' }, { k: 'ram', ok: n('ram') > 0, t: 'Memoria RAM' },
      { k: 'ssd', ok: n('ssd') + n('hdd') > 0, t: 'Almacenamiento (SSD o disco duro)' }, { k: 'case', ok: n('case') > 0, t: 'Case' },
      { k: 'psu', ok: n('psu') > 0, t: 'Fuente de poder' }
    ];
    if (ctx.cpu && ctx.cpu.igpu !== true) r.push({ k: 'gpu', ok: n('gpu') > 0, t: 'Tarjeta de video (el procesador no tiene gráficos integrados)' });
    if (ctx.cpu && ctx.cpu.requiereCooler) r.push({ k: 'air', ok: n('water') + n('air') > 0, t: 'Enfriamiento (el procesador no trae cooler)' });
    return r;
  }
  function prereq(k, ctx) {
    if ((k === 'mb' || k === 'psu') && !ctx.cpu) return 'Primero elige el procesador';
    if ((k === 'ram' || k === 'case') && !ctx.mb) return 'Primero elige la mainboard';
    return null;
  }

  // ---------- selección ----------
  function cambio() {
    if (st.pedido) { toast(`El pedido ${st.pedido.name} ya se creó. Los cambios nuevos no se envían a Odoo.`); st.pedido = null; $('#order-ok').innerHTML = ''; }
    cascada(); guardar(); render();
  }
  function cascada() {
    const quitados = [];
    for (let guard = 0; guard < 20; guard++) {
      const ctx = ctxSel();
      let hit = null;
      STEPS.some(s => lines(s.k).some((l, i) => {
        const p = prod(s.k, l.id);
        const r = p ? Compat.evaluar(s.k, p._i, ctx, CFG) : { tipo: 'incompat' };
        if (r && r.tipo !== 'prereq') { hit = { k: s.k, i, n: p ? p.name : 'producto sin stock', msg: r.msg }; return true; }
        return false;
      }));
      if (!hit) break;
      lines(hit.k).splice(hit.i, 1);
      quitados.push(hit);
    }
    const max = maxUnits('ram');
    while (units('ram') > max) {
      const l = lines('ram')[lines('ram').length - 1];
      if (l.qty > 1) l.qty--; else lines('ram').pop();
      quitados.push({ n: 'Memoria RAM', msg: `la mainboard tiene ${max} ranuras` });
    }
    if (quitados.length) toast('Se quitó por incompatibilidad: ' + quitados.map(q => `${q.n}${q.msg ? ' (' + q.msg + ')' : ''}`).join('; '));
  }
  function agregar(k, id) {
    const p = prod(k, id); if (!p) return;
    const s = S[k], L = lines(k);
    if (s.max === 1) { st.sel[k] = [{ id, qty: 1 }]; cambio(); if (k === 'cpu' || k === 'mb') autoSiguiente(k); return; }
    const per = k === 'ram' ? p._i.modulos || 1 : 1;
    if (units(k) + per > maxUnits(k)) { toast(`Máximo ${maxUnits(k)} ${k === 'ram' ? 'módulos de RAM' : 'unidades'} en ${s.t}`); return; }
    const l = L.find(x => x.id === id);
    if (l) { if (l.qty + 1 > p[CFG.campoStock]) { toast(`Solo hay ${p[CFG.campoStock]} en stock`); return; } l.qty++; } else L.push({ id, qty: 1 });
    cambio();
  }
  function restar(k, id) {
    const L = lines(k), i = L.findIndex(x => x.id === id); if (i < 0) return;
    if (L[i].qty > 1) L[i].qty--; else L.splice(i, 1);
    cambio();
  }
  function quitar(k, id) { st.sel[k] = lines(k).filter(x => x.id !== id); cambio(); }
  function autoSiguiente(k) { const i = STEPS.findIndex(s => s.k === k); irPaso(STEPS[i + 1].k); }
  function irPaso(k) { st.step = k; st.q = ''; renderHead(); render(); if (window.innerWidth < 760) $('.catalog').scrollIntoView({ block: 'start' }); }

  // ---------- render ----------
  function render() { renderSteps(); renderList(); renderCart(); }

  function renderSteps() {
    const ctx = ctxSel(), req = new Set(requisitos().filter(r => !r.ok).map(r => r.k));
    $('#steps').innerHTML = STEPS.map(s => {
      const n = units(s.k), lock = prereq(s.k, ctx);
      const tag = n ? `<span class="st ok">✓ ${n}</span>` : req.has(s.k) ? '<span class="st req">Requerido</span>' : '<span class="st">Opcional</span>';
      return `<button type="button" class="step${s.k === st.step ? ' on' : ''}${lock ? ' lock' : ''}" data-step="${s.k}"><span>${esc(s.t)}</span>${tag}</button>`;
    }).join('');
  }

  function renderHead() {
    const s = S[st.step];
    $('#cat-head').innerHTML = `<h2>${esc(s.t)}</h2>
      <div class="cat-tools"><input id="q" type="search" placeholder="Buscar en ${esc(s.t.toLowerCase())}" value="${esc(st.q)}" autocomplete="off">
      <select id="sort" aria-label="Ordenar"><option value="precio">Precio ↑</option><option value="precio-d">Precio ↓</option><option value="nombre">Nombre</option><option value="stock">Stock</option></select></div>
      <div class="rule" id="rule"></div>`;
    $('#sort').value = st.sort;
  }

  function reglaTexto(k, ctx) {
    const sel = n => `hasta ${n} ${n === 1 ? 'unidad' : 'unidades'}`;
    if (k === 'mb' && ctx.cpu) return `Solo compatibles con socket ${ctx.cpu.socket} (${ctx.cpu.modelo || 'procesador elegido'}).`;
    if (k === 'ram' && ctx.mb) return `Solo ${ctx.mb.ddr} de escritorio · ${units('ram')} de ${maxUnits('ram', ctx)} ranuras usadas (los kits cuentan por módulo).`;
    if (k === 'case' && ctx.mb) return `Solo cases que admiten ${Compat.FORM_TXT[ctx.mb.form]}.`;
    if (k === 'psu' && ctx.cpu) { const r = Compat.requisitoFuente(ctx.cpu, ctx.gpu, CFG); return `Mínimo ${r.req} W para esta configuración (consumo estimado ~${r.est} W${ctx.gpu ? '' : ', sin tarjeta de video'}).`; }
    if (k === 'water' || k === 'air') return 'Water cooler y air cooler son excluyentes · opcional salvo que el procesador no traiga cooler.';
    if (k === 'fan') return 'Ventiladores de case de 120 o 140 mm · ' + sel(2) + '.';
    if (k === 'gpu') return ctx.cpu && ctx.cpu.igpu !== true ? 'Requerida: el procesador no tiene gráficos integrados.' : 'Opcional: el procesador tiene gráficos integrados.';
    return S[k].max > 1 ? sel(S[k].max) + '.' : '';
  }

  function priceCells(p, qty) {
    const c = calc(p, qty);
    return `${CFG.mostrarCosto ? `<span class="cost"><small>Costo</small>${money(c.costo)}</span>` : ''}
      <span><small>Sin IVA</small>${money(c.sin)}</span><span><small>Con IVA</small><b>${money(c.con)}</b></span>
      ${CFG.mostrarCosto ? `<span><small>% Gan.</small>${pct(c.gan)}</span>` : ''}`;
  }
  function thumb(p) {
    const b = st.imgs[p.id];
    if (b === undefined) pedirImg(p.id);
    return `<button type="button" class="thumb" data-zoom="${st.step}|${p.id}" data-img="${p.id}" aria-label="Ampliar imagen">${b ? `<img src="${imgUrl(b)}" alt="">` : b === false ? 'Sin foto' : ''}</button>`;
  }

  function renderList() {
    const k = st.step, ctx = ctxSel(), cat = st.catalog[k];
    $('#rule') && ($('#rule').textContent = reglaTexto(k, ctx));
    const box = $('#cat-list');
    const pre = prereq(k, ctx);
    if (pre) { box.innerHTML = `<div class="notice">${esc(pre)}.</div>`; return; }
    if (!cat || !cat.list.length) {
      box.innerHTML = `<div class="empty">No hay productos con stock en ${esc(S[k].t)}.${st.stepCats[k] && !st.stepCats[k].length ? '<br>No se encontró la categoría en Odoo: revisa Diagnóstico.' : ''}</div>`;
      return;
    }
    const q = U(st.q).split(/\s+/).filter(Boolean);
    const rows = cat.list.filter(p => !q.length || q.every(w => p._u.includes(w))).map(p => ({ p, r: Compat.evaluar(k, p._i, ctx, CFG) }));
    const ok = rows.filter(x => !x.r).map(x => x.p);
    const sorters = { precio: (a, b) => a.lst_price - b.lst_price, 'precio-d': (a, b) => b.lst_price - a.lst_price, nombre: (a, b) => a.name.localeCompare(b.name), stock: (a, b) => b[CFG.campoStock] - a[CFG.campoStock] };
    ok.sort(sorters[st.sort]);
    const hid = rows.filter(x => x.r);
    const L = lines(k), maxU = maxUnits(k, ctx), used = units(k);
    const excl = (k === 'water' && ctx.air) || (k === 'air' && ctx.water);
    let html = excl ? `<div class="notice">Ya elegiste un ${k === 'water' ? 'air' : 'water'} cooler. Son excluyentes: quítalo del carrito para elegir ${k === 'water' ? 'water' : 'air'} cooler.</div>` : '';
    html += ok.map(p => {
      const l = L.find(x => x.id === p.id), stock = p[CFG.campoStock];
      const chips = Compat.etiquetas(k, p._i).map(t => `<span class="chip${/^Sin /.test(t) ? ' warn' : ''}">${esc(t)}</span>`).join('');
      let act;
      if (S[k].max === 1) act = l ? `<button type="button" class="btn sm" data-rm="${k}|${p.id}">Quitar</button>` : `<button type="button" class="btn primary sm" data-add="${k}|${p.id}">${L.length ? 'Cambiar' : 'Elegir'}</button>`;
      else if (l) act = `<span class="qty"><button type="button" data-dec="${k}|${p.id}" aria-label="Menos">−</button><span>${l.qty}</span><button type="button" data-add="${k}|${p.id}" aria-label="Más">+</button></span>`;
      else { const full = used + (k === 'ram' ? p._i.modulos || 1 : 1) > maxU; act = `<button type="button" class="btn primary sm" data-add="${k}|${p.id}" ${full ? 'disabled title="Ya alcanzaste el máximo"' : ''}>Agregar</button>`; }
      return `<div class="item${l ? ' sel' : ''}">${thumb(p)}
        <div class="info"><div class="nm">${esc(p.name)}</div><div class="meta">${p.default_code ? `<span>${esc(p.default_code)}</span>` : ''}<span>Stock ${stock}</span>${chips}</div></div>
        <div class="prices">${priceCells(p, 1)}</div><div class="act">${act}</div></div>`;
    }).join('') || `<div class="empty">Ningún producto compatible${q.length ? ' con esa búsqueda' : ''}.</div>`;
    if (hid.length && !excl) {
      html += `<details class="hid"><summary>${hid.length} ocultos por incompatibilidad o datos faltantes en el título</summary>${hid.map(x => `<div class="item off"><div class="info"><div class="nm">${esc(x.p.name)}</div><div class="why">${esc(x.r.msg)}</div></div><div class="prices"><span><small>Con IVA</small>${money(x.p.lst_price * (1 + IVA))}</span></div></div>`).join('')}</details>`;
    }
    const i = STEPS.findIndex(s => s.k === k);
    if (STEPS[i + 1]) html += `<div style="text-align:right;margin-top:12px"><button type="button" class="btn" data-step="${STEPS[i + 1].k}">Siguiente: ${esc(STEPS[i + 1].t)} →</button></div>`;
    box.innerHTML = html;
  }

  function renderCart() {
    const L = allLines();
    $('#cart-lines').innerHTML = L.length ? L.map(({ k, p, qty }) => {
      const multi = S[k].max > 1;
      return `<div class="cl"><div><div class="k">${esc(S[k].t)}</div><div class="n">${esc(p.name)}</div></div>
        <div class="r">${multi ? `<span class="qty"><button type="button" data-dec="${k}|${p.id}" aria-label="Menos">−</button><span>${qty}</span><button type="button" data-add="${k}|${p.id}" aria-label="Más">+</button></span>` : ''}
        <button type="button" class="rm" data-rm="${k}|${p.id}" aria-label="Quitar ${esc(p.name)}">×</button></div>
        <div class="p">${priceCells(p, qty)}</div></div>`;
    }).join('') : '<p class="muted">Empieza eligiendo el procesador.</p>';
    const t = totales();
    $('#totals').innerHTML = `<table class="tot">
      ${CFG.mostrarCosto ? `<tr><td>Costo total</td><td>${money(t.costo)}</td></tr>` : ''}
      ${t.desc ? `<tr><td>Precio de lista</td><td>${money(t.bruto)}</td></tr><tr><td>Descuento ${pct(st.desc)}</td><td>− ${money(t.desc)}</td></tr>` : ''}
      <tr><td>Subtotal sin IVA</td><td>${money(t.sin)}</td></tr><tr><td>IVA ${CFG.iva}%</td><td>${money(t.iva)}</td></tr>
      <tr class="big"><td>Total con IVA</td><td>${money(t.total)}</td></tr>
      ${CFG.mostrarCosto ? `<tr class="${t.ganV < 0 ? 'neg' : 'gan'}"><td>Ganancia (${CFG.gananciaSobre === 'precio' ? 'sobre precio' : 'sobre costo'})</td><td>${money(t.ganV)} · ${pct(t.ganP)}</td></tr>` : ''}
    </table>`;
    $('#checklist').innerHTML = requisitos().map(r => `<li class="${r.ok ? 'ok' : ''}">${esc(r.t)}</li>`).join('');
    $('#mbar-txt').textContent = `${t.n} pieza${t.n === 1 ? '' : 's'} · ${money(t.total)}`;
    renderRef();
  }

  // ---------- imágenes ----------
  const imgQ = new Set(); let imgT = null;
  function pedirImg(id) { st.imgs[id] = 0; imgQ.add(id); clearTimeout(imgT); imgT = setTimeout(cargarImgs, 40); }
  async function cargarImgs() {
    const ids = Array.from(imgQ); imgQ.clear();
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      try {
        const rows = await st.odoo.call('product.product', 'read', [chunk, ['image_128']]);
        rows.forEach(r => { st.imgs[r.id] = r.image_128 || false; });
      } catch (e) { chunk.forEach(id => { st.imgs[id] = false; }); }
      chunk.forEach(id => $$(`[data-img="${id}"]`).forEach(el => { const b = st.imgs[id]; el.innerHTML = b ? `<img src="${imgUrl(b)}" alt="">` : 'Sin foto'; }));
    }
  }
  async function ampliar(k, id) {
    const p = prod(k, id); if (!p) return;
    const d = $('#dlg-zoom'), im = $('#zoom-img');
    $('#zoom-cap').textContent = p.name;
    im.src = st.imgs[id] ? imgUrl(st.imgs[id]) : '';
    d.showModal();
    try {
      const [r] = await st.odoo.call('product.product', 'read', [[id], ['image_1024']]);
      if (r && r.image_1024) im.src = imgUrl(r.image_1024); else if (!st.imgs[id]) $('#zoom-cap').textContent = p.name + ' · sin imagen en Odoo';
    } catch (e) { /* se queda la miniatura */ }
  }

  // ---------- cliente ----------
  const F = { nombre: '#c-nombre', apellido: '#c-apellido', tel: '#c-tel', email: '#c-email', ciudad: '#c-ciudad', canal: '#c-canal', pc: '#c-pc' };
  const form = () => Object.fromEntries(Object.keys(F).map(k => [k, $(F[k]).value.trim()]));
  function ref() { const f = form(); return [f.pc, [f.nombre, f.apellido].filter(Boolean).join(' ')].filter(Boolean).join(' - '); }
  function renderRef() { $('#c-ref').textContent = ref() || '—'; }
  function setModo(m) {
    st.cli.modo = m;
    $$('[data-cmode]').forEach(b => b.classList.toggle('on', b.dataset.cmode === m));
    $('#c-search-wrap').hidden = m !== 'existente';
    if (m !== 'existente') { st.cli.partner = null; $('#c-picked').textContent = ''; }
    guardar();
  }
  let qT = null;
  function buscarCliente() {
    clearTimeout(qT);
    const q = $('#c-search').value.trim();
    if (q.length < 2) { $('#c-results').innerHTML = ''; return; }
    qT = setTimeout(async () => {
      try {
        const rows = await st.odoo.call('res.partner', 'search_read', [['|', '|', '|', ['name', 'ilike', q], ['vat', 'ilike', q], ['phone', 'ilike', q], ['mobile', 'ilike', q]]],
          { fields: ['id', 'name', 'vat', 'phone', 'mobile', 'email', 'city'], limit: 8 });
        st._res = rows;
        $('#c-results').innerHTML = rows.length ? rows.map((r, i) => `<button type="button" data-pick="${i}"><b>${esc(r.name)}</b> <span class="muted">${esc([r.vat, r.phone || r.mobile, r.city].filter(Boolean).join(' · '))}</span></button>`).join('') : '<p class="small muted">Sin resultados. Usa «Nuevo cliente».</p>';
      } catch (e) { toast('No se pudo buscar: ' + e.message, true); }
    }, 300);
  }
  function elegirCliente(i) {
    const r = st._res[i]; if (!r) return;
    st.cli.partner = { id: r.id, name: r.name };
    const parts = r.name.trim().split(/\s+/);
    $('#c-nombre').value = parts.length > 1 ? parts.slice(0, Math.ceil(parts.length / 2)).join(' ') : r.name;
    $('#c-apellido').value = parts.length > 1 ? parts.slice(Math.ceil(parts.length / 2)).join(' ') : '';
    $('#c-tel').value = r.phone || r.mobile || '';
    $('#c-email').value = r.email || '';
    if (r.city) $('#c-ciudad').value = r.city;
    $('#c-results').innerHTML = '';
    $('#c-picked').innerHTML = `Cliente de Odoo: <b>${esc(r.name)}</b>. Si editas los datos, solo cambian en la nota del pedido.`;
    renderRef(); guardar();
  }

  function validar() {
    const e = [], f = form();
    requisitos().filter(r => !r.ok).forEach(r => e.push('Falta: ' + r.t));
    if (!f.nombre || !f.apellido) e.push('Escribe nombre y apellido del cliente final');
    if (!/^[+\d][\d\s-]{6,16}$/.test(f.tel)) e.push('Escribe un teléfono válido');
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.push('El email no es válido');
    if (!f.ciudad) e.push('Escribe la ciudad');
    if (!f.canal) e.push('Elige el canal de venta');
    if (!f.pc) e.push('Ponle un nombre al computador');
    if (st.cli.modo === 'existente' && !st.cli.partner) e.push('Elige un cliente de la búsqueda');
    return e;
  }

  // ---------- pedido ----------
  async function partnerId() {
    const f = form(), o = st.odoo;
    if (st.cli.modo === 'existente') return st.cli.partner.id;
    if (st.cli.modo === 'nuevo') return o.call('res.partner', 'create', [{ name: `${f.nombre} ${f.apellido}`, phone: f.tel, email: f.email || false, city: f.ciudad }]);
    let r = await o.call('res.partner', 'search_read', [[['vat', '=', CFG.consumidorFinalRuc]]], { fields: ['id'], limit: 1 });
    if (!r.length) r = await o.call('res.partner', 'search_read', [[['name', 'ilike', 'consumidor final']]], { fields: ['id'], limit: 1 });
    if (!r.length) throw new Error('No existe el contacto «Consumidor final» en Odoo');
    return r[0].id;
  }
  async function crearPedido() {
    if (st.busy) return;
    const e = validar();
    if (e.length) { toast(e[0], true); return; }
    const t = totales(), f = form(), R = ref();
    if (!confirm(`¿Crear pedido en borrador?\n\n${R}\nTotal con IVA: ${money(t.total)}`)) return;
    st.busy = true; const b = $('#b-order'); b.disabled = true; b.textContent = 'Creando pedido…';
    try {
      const pid = await partnerId();
      let source = false;
      try { const s = await st.odoo.call('utm.source', 'search_read', [[['name', 'ilike', f.canal]]], { fields: ['id'], limit: 1 }); source = s.length ? s[0].id : false; } catch (x) { /* opcional */ }
      const order_line = allLines().map(({ p, qty }) => {
        const v = { product_id: p.id, name: p.display_name || p.name, product_uom_qty: qty, price_unit: p.lst_price, discount: st.desc };
        if (st.lf.uom && p.uom_id) v[st.lf.uom] = p.uom_id[0];
        if (st.lf.tax) v[st.lf.tax] = [[6, 0, p.taxes_id || []]];
        return [0, 0, v];
      });
      const note = [`Configurador PC · ${f.pc}`, `Cliente final: ${f.nombre} ${f.apellido}`, `Teléfono: ${f.tel}${f.email ? ' · Email: ' + f.email : ''}`,
        `Ciudad: ${f.ciudad} · Canal: ${f.canal}`, `Asesor: ${st.user.name}${st.desc ? ` · Descuento: ${st.desc}%` : ''}`].join('\n');
      const vals = { partner_id: pid, client_order_ref: R, note, order_line };
      if (source) vals.source_id = source;
      const id = await st.odoo.call('sale.order', 'create', [vals]);
      const [so] = await st.odoo.call('sale.order', 'read', [[id], ['name', 'amount_untaxed', 'amount_tax', 'amount_total', 'state']]);
      st.pedido = so;
      const url = `${CFG.odooUrl}/web#id=${id}&model=sale.order&view_type=form`;
      $('#order-ok').innerHTML = `<div class="ok-box"><b>Pedido ${esc(so.name)} creado</b> (borrador)<br>
        Subtotal ${money(so.amount_untaxed)} · IVA ${money(so.amount_tax)} · <b>Total ${money(so.amount_total)}</b><br>
        ${CFG.modo === 'demo' ? '<span class="small muted">Modo demo: no se creó nada en Odoo.</span>' : `<a href="${esc(url)}" target="_blank" rel="noopener">Abrir en Odoo</a>`}
        <div class="actions"><button type="button" class="btn sm" data-pdf="0">PDF cliente</button><button type="button" class="btn sm" data-reset>Nuevo pedido</button></div></div>`;
      if (Math.abs(so.amount_total - t.total) > 0.05) toast(`Ojo: Odoo calculó ${money(so.amount_total)} (la app mostraba ${money(t.total)}). Revisa los impuestos del producto.`, true);
      else toast(`Pedido ${so.name} creado en Odoo`);
    } catch (x) { toast('No se pudo crear el pedido: ' + x.message, true); }
    finally { st.busy = false; b.disabled = false; b.textContent = 'Crear pedido en Odoo'; }
  }

  // ---------- PDF ----------
  function aPng(b) {
    return new Promise(res => {
      if (!b) return res(null);
      const im = new Image();
      const to = setTimeout(() => res(null), 3000);
      im.onload = () => {
        clearTimeout(to);
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
        const s = Math.min(128 / im.width, 128 / im.height) || 1, w = im.width * s, h = im.height * s;
        g.drawImage(im, (128 - w) / 2, (128 - h) / 2, w, h);
        try { res(c.toDataURL('image/png')); } catch (e) { res(null); }
      };
      im.onerror = () => { clearTimeout(to); res(null); };
      im.src = imgUrl(b);
    });
  }
  async function pdf(interno) {
    const e = validar();
    if (e.length) { toast(e[0], true); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) { toast('No cargó la librería de PDF. Revisa la conexión a internet.', true); return; }
    const L = allLines(), f = form(), t = totales(), so = st.pedido;
    const falt = L.filter(l => st.imgs[l.p.id] === undefined || st.imgs[l.p.id] === 0).map(l => l.p.id);
    if (falt.length) { falt.forEach(id => { st.imgs[id] = 0; imgQ.add(id); }); await cargarImgs(); }
    const pngs = await Promise.all(L.map(l => aPng(st.imgs[l.p.id])));
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14, hoy = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setFillColor(15, 118, 110); doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.text('TECNOSMART', M, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Guayaquil · www.tecnosmart.com.ec · @tecnosmartec', M, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(so ? `Pedido ${so.name}` : 'Cotización', W - M, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(hoy, W - M, 18, { align: 'right' });
    if (interno) { doc.setFont('helvetica', 'bold'); doc.text('USO INTERNO · CONTIENE COSTOS', W - M, 23, { align: 'right' }); }
    doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(f.pc, M, 38);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
    const izq = [['Cliente', `${f.nombre} ${f.apellido}`], ['Teléfono', f.tel], ['Email', f.email || '—']];
    const der = [['Ciudad', f.ciudad], ['Canal', f.canal], ['Asesor', st.user.name]];
    izq.forEach((r, i) => { doc.setFont('helvetica', 'bold'); doc.text(r[0] + ':', M, 46 + i * 5.5); doc.setFont('helvetica', 'normal'); doc.text(String(r[1]), M + 20, 46 + i * 5.5); });
    der.forEach((r, i) => { doc.setFont('helvetica', 'bold'); doc.text(r[0] + ':', 112, 46 + i * 5.5); doc.setFont('helvetica', 'normal'); doc.text(String(r[1]), 130, 46 + i * 5.5); });
    const head = ['', 'Componente', 'Producto', 'Cant.', 'P. unit. sin IVA', 'Subtotal'];
    if (interno) head.push('Costo', '% Gan.');
    const body = L.map(l => {
      const c = calc(l.p, l.qty), row = ['', S[l.k].t, l.p.name, String(l.qty), money(l.p.lst_price), money(c.bruto)];
      if (interno) row.push(money(c.costo), pct(c.gan));
      return row;
    });
    doc.autoTable({
      startY: 64, head: [head], body, margin: { left: M, right: M }, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.8, valign: 'middle', lineColor: [226, 232, 240] },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 14, minCellHeight: 14 }, 1: { cellWidth: 26 }, 3: { halign: 'center', cellWidth: 12 }, 4: { halign: 'right', cellWidth: 25 }, 5: { halign: 'right', cellWidth: 24 }, 6: { halign: 'right', cellWidth: 20 }, 7: { halign: 'right', cellWidth: 16 } },
      didDrawCell: d => { if (d.section === 'body' && d.column.index === 0 && pngs[d.row.index]) doc.addImage(pngs[d.row.index], 'PNG', d.cell.x + 1.5, d.cell.y + 1.5, 11, 11); }
    });
    let y = doc.lastAutoTable.finalY + 7;
    const tot = [];
    if (t.desc) tot.push(['Precio de lista', money(t.bruto)], [`Descuento ${pct(st.desc)}`, '- ' + money(t.desc)]);
    tot.push(['Subtotal sin IVA', money(so ? so.amount_untaxed : t.sin)], [`IVA ${CFG.iva}%`, money(so ? so.amount_tax : t.iva)], ['TOTAL', money(so ? so.amount_total : t.total)]);
    if (interno) tot.push(['Costo total', money(t.costo)], [`Ganancia (${CFG.gananciaSobre === 'precio' ? 'sobre precio' : 'sobre costo'})`, `${money(t.ganV)} · ${pct(t.ganP)}`]);
    if (y > 250) { doc.addPage(); y = 20; }
    tot.forEach(([a, b]) => {
      const big = a === 'TOTAL';
      doc.setFont('helvetica', big ? 'bold' : 'normal'); doc.setFontSize(big ? 12 : 9.5);
      doc.text(a, 140, y, { align: 'right' }); doc.text(b, W - M, y, { align: 'right' }); y += big ? 7 : 5.5;
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Precios en dólares. Válido por ${CFG.validezDias} días o hasta agotar stock. Incluye ensamblaje según políticas de TECNOSMART.`, M, 287);
    doc.save(`${(so ? so.name + ' ' : '')}${ref()}`.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) + (interno ? ' (interno)' : '') + '.pdf');
  }

  // ---------- persistencia ----------
  function guardar() { store.set('tspc-draft', { sel: st.sel, desc: st.desc, cli: st.cli, form: form(), step: st.step }); }
  function restaurar() {
    const d = store.get('tspc-draft'); if (!d) return;
    let perdidos = 0;
    STEPS.forEach(s => {
      st.sel[s.k] = ((d.sel || {})[s.k] || []).filter(l => { const p = prod(s.k, l.id); if (!p) { perdidos++; return false; } l.qty = Math.min(l.qty, p[CFG.campoStock]); return l.qty > 0; });
    });
    st.desc = Math.min(+d.desc || 0, CFG.descuentoMax); $('#i-desc').value = st.desc;
    Object.keys(F).forEach(k => { if (d.form && d.form[k] != null && d.form[k] !== '') $(F[k]).value = d.form[k]; });
    if (d.cli) { setModo(d.cli.modo || 'final'); st.cli.partner = d.cli.partner || null; if (st.cli.partner) $('#c-picked').innerHTML = `Cliente de Odoo: <b>${esc(st.cli.partner.name)}</b>`; }
    if (d.step && S[d.step]) st.step = d.step;
    cascada();
    if (perdidos) toast(`${perdidos} producto(s) del borrador ya no tienen stock y se quitaron.`);
  }
  function nuevo() {
    st.sel = {}; st.desc = 0; st.pedido = null; $('#i-desc').value = 0; $('#order-ok').innerHTML = '';
    ['nombre', 'apellido', 'tel', 'email', 'pc'].forEach(k => { $(F[k]).value = ''; });
    $('#c-ciudad').value = 'Guayaquil'; $('#c-canal').value = ''; $('#c-search').value = ''; $('#c-results').innerHTML = '';
    setModo('final'); st.step = 'cpu'; renderHead(); guardar(); render();
  }

  // ---------- catálogo ----------
  async function cargarCatalogo() {
    loading(true, 'Cargando catálogo desde Odoo…');
    const o = st.odoo;
    const [cats, lf] = await o.many([
      ['product.category', 'search_read', [[]], { fields: ['id', 'name', 'complete_name'] }],
      ['sale.order.line', 'fields_get', [], { attributes: ['type'] }]
    ]);
    st.cats = cats;
    st.lf = { uom: 'product_uom' in lf ? 'product_uom' : 'product_uom_id' in lf ? 'product_uom_id' : null, tax: 'tax_id' in lf ? 'tax_id' : 'tax_ids' in lf ? 'tax_ids' : null };
    const fields = ['id', 'display_name', 'name', 'default_code', 'lst_price', 'standard_price', 'uom_id', 'taxes_id', 'categ_id', CFG.campoStock];
    const calls = [], keys = [];
    STEPS.forEach(s => {
      const c = CFG.categorias[s.k] || {};
      const ids = CFG.categoriasIds[s.k] || cats.filter(x => c.si && c.si.test(U(x.name)) && !(c.no && c.no.test(U(x.name)))).map(x => x.id);
      const excl = c.no ? cats.filter(x => c.no.test(U(x.name))).map(x => x.id) : [];
      st.stepCats[s.k] = ids;
      if (!ids.length) return;
      const dom = [['categ_id', 'child_of', ids], ['sale_ok', '=', true], [CFG.campoStock, '>', 0]];
      if (excl.length && !CFG.categoriasIds[s.k]) dom.push('!', ['categ_id', 'child_of', excl]);
      calls.push(['product.product', 'search_read', [dom], { fields, limit: 3000 }]);
      keys.push(s.k);
    });
    const res = await o.many(calls);
    STEPS.forEach(s => { st.catalog[s.k] = { list: [], byId: {} }; });
    res.forEach((list, i) => {
      const k = keys[i], pf = (CFG.productos || {})[k] || {};
      const L = list.filter(p => !(pf.no && pf.no.test(U(p.display_name || p.name))));
      L.forEach(p => { p._u = U(`${p.display_name} ${p.default_code || ''}`); p._i = Compat.analizar(k, `${p.display_name} ${p.name}`); });
      st.catalog[k] = { list: L, byId: Object.fromEntries(L.map(p => [p.id, p])) };
    });
    loading(false);
  }

  function diagnostico() {
    const rows = STEPS.map(s => {
      const cat = st.catalog[s.k] || { list: [] };
      const cn = (st.stepCats[s.k] || []).map(id => (st.cats.find(c => c.id === id) || {}).complete_name).filter(Boolean);
      const bad = cat.list.map(p => ({ p, r: Compat.evaluar(s.k, p._i, {}, CFG) })).filter(x => x.r && x.r.tipo === 'datos');
      return { s, cn, n: cat.list.length, bad };
    });
    st._diag = rows.flatMap(r => r.bad.map(b => `${r.s.t}\t${b.p.default_code || ''}\t${b.p.name}\t${b.r.msg}`)).join('\n');
    $('#diag-body').innerHTML = `<div class="diag"><h2>Diagnóstico del catálogo</h2>
      <p class="small muted">Productos con stock que no se ofrecen porque el título no trae el dato técnico. Corrigiendo el nombre en Odoo aparecen solos.</p>
      <table><tr><th>Paso</th><th>Categorías de Odoo</th><th>Con stock</th><th>Ocultos por título</th></tr>
      ${rows.map(r => `<tr><td><b>${esc(r.s.t)}</b></td><td>${r.cn.length ? esc(r.cn.join(', ')) : '<span class="why">No encontrada</span>'}</td><td>${r.n}</td>
        <td>${r.bad.length ? r.bad.map(b => `<div>${esc(b.p.name)} <span class="why">· ${esc(b.r.msg)}</span></div>`).join('') : '—'}</td></tr>`).join('')}</table>
      <div class="actions"><button type="button" class="btn sm" id="b-diag-copy">Copiar lista para Compras</button></div>
      <p class="small muted">Conexión: ${esc(CFG.modo)} · Base: ${esc(st.odoo.db)} · Campos de línea: ${esc(JSON.stringify(st.lf))}</p></div>`;
    $('#dlg-diag').showModal();
  }

  // ---------- login / sesión ----------
  async function entrar() {
    $('#v-login').hidden = true; $('#v-app').hidden = false;
    $('#u-name').textContent = st.user.name + (CFG.modo === 'demo' ? ' · DEMO' : '');
    $('#desc-hint').textContent = `máx. ${CFG.descuentoMax}%`;
    $('#i-desc').max = CFG.descuentoMax;
    $('#c-canal').innerHTML = '<option value="">Elegir…</option>' + CFG.canales.map(c => `<option>${esc(c)}</option>`).join('');
    try { await cargarCatalogo(); }
    catch (e) {
      loading(false);
      if (/contraseña|Access|session/i.test(e.message)) { salir(); return; }
      toast('No se pudo cargar el catálogo: ' + e.message, true);
      return;
    }
    restaurar(); renderHead(); render();
  }
  function salir() { store.del('tspc-sess', true); location.reload(); }

  async function initLogin() {
    $('#v-login').hidden = false;
    const tmp = mk();
    const rem = store.get('tspc-user');
    if (rem) { $('#l-user').value = rem; $('#l-rem').checked = true; }
    $('#l-mode').textContent = CFG.modo === 'demo' ? 'Modo demo: escribe cualquier usuario y contraseña.' : `Servidor: ${CFG.odooUrl.replace(/^https?:\/\//, '')} · conexión ${CFG.modo}`;
    if (CFG.modo === 'proxy' && !CFG.proxyUrl) {
      $('#l-msg').innerHTML = 'Falta configurar el proxy de Odoo (ver README). Mientras tanto puedes <a href="?demo=1">probar el modo demo</a>.';
      return;
    }
    if (!CFG.db) st.dbP = detectarBase(tmp);
  }
  async function detectarBase(tmp) {
    {
      try {
        const dbs = await tmp.listarBases();
        if (dbs.length === 1) CFG.db = dbs[0];
        else if (dbs.length > 1) { $('#l-db-wrap').hidden = false; $('#l-db').innerHTML = dbs.map(d => `<option>${esc(d)}</option>`).join(''); }
        else throw new Error('sin bases');
      } catch (e) { $('#l-db-wrap').hidden = false; $('#l-db').hidden = true; $('#l-db-txt').hidden = false; }
    }
  }
  async function login(ev) {
    ev.preventDefault();
    if (st.dbP) await st.dbP;
    const user = $('#l-user').value.trim(), pwd = $('#l-pwd').value;
    const db = CFG.db || (!$('#l-db').hidden ? $('#l-db').value : $('#l-db-txt').value.trim());
    if (!db) { $('#l-msg').textContent = 'Indica la base de datos.'; return; }
    const b = $('#l-btn'); b.disabled = true; b.textContent = 'Ingresando…'; $('#l-msg').textContent = '';
    try {
      const o = mk();
      const uid = await o.login(db, user, pwd);
      const [u] = await o.call('res.users', 'read', [[uid], ['name']]);
      let puede;
      try { puede = await o.call('sale.order', 'check_access_rights', ['create'], { raise_exception: false }); }
      catch (e) { puede = await o.call('sale.order', 'has_access', ['create']); }
      if (!puede) throw new Error('Tu usuario no tiene permisos de Ventas para crear pedidos.');
      st.odoo = o; st.user = { uid, name: u.name, login: user };
      store.set('tspc-sess', { db, uid, pwd, name: u.name, login: user }, true);
      if ($('#l-rem').checked) store.set('tspc-user', user); else store.del('tspc-user');
      await entrar();
    } catch (e) { $('#l-msg').textContent = e.message; }
    finally { b.disabled = false; b.textContent = 'Ingresar'; }
  }

  // ---------- eventos ----------
  document.addEventListener('click', ev => {
    const t = ev.target.closest('button, a'); if (!t) return;
    const d = t.dataset, kv = v => { const [k, id] = v.split('|'); return [k, +id]; };
    if (d.step) irPaso(d.step);
    else if (d.add) agregar(...kv(d.add));
    else if (d.dec) restar(...kv(d.dec));
    else if (d.rm) quitar(...kv(d.rm));
    else if (d.zoom) ampliar(...kv(d.zoom));
    else if (d.cmode) setModo(d.cmode);
    else if (d.pick) elegirCliente(+d.pick);
    else if (d.pdf) pdf(d.pdf === '1');
    else if ('reset' in d) nuevo();
    else if ('close' in d) t.closest('dialog').close();
    else if (t.id === 'b-diag-copy') { navigator.clipboard.writeText(st._diag || '').then(() => toast('Lista copiada'), () => toast('No se pudo copiar', true)); }
  });
  document.addEventListener('input', ev => {
    const id = ev.target.id;
    if (id === 'q') { st.q = ev.target.value; renderList(); }
    else if (id === 'c-search') buscarCliente();
    else if (Object.values(F).includes('#' + id)) { renderRef(); guardar(); }
  });
  document.addEventListener('change', ev => {
    const id = ev.target.id;
    if (id === 'sort') { st.sort = ev.target.value; renderList(); }
    else if (id === 'i-desc') {
      let v = parseFloat(String(ev.target.value).replace(',', '.')) || 0;
      if (v > CFG.descuentoMax) { toast(`El descuento máximo es ${CFG.descuentoMax}%`); v = CFG.descuentoMax; }
      if (v < 0) v = 0;
      st.desc = v; ev.target.value = v; cambio();
    } else if (id === 'c-canal') { guardar(); }
  });
  $$('dialog').forEach(dl => dl.addEventListener('click', e => { if (e.target === dl) dl.close(); }));
  $('#f-login').addEventListener('submit', login);
  $('#b-out').addEventListener('click', salir);
  $('#b-new').addEventListener('click', () => { if (confirm('¿Empezar un PC nuevo? Se borra el carrito actual.')) nuevo(); });
  $('#b-diag').addEventListener('click', diagnostico);
  $('#b-order').addEventListener('click', crearPedido);
  $('#b-pdf').addEventListener('click', () => pdf(false));
  $('#b-pdf-int').addEventListener('click', () => pdf(true));
  if (!CFG.mostrarCosto) $('#b-pdf-int').hidden = true;

  // ---------- arranque ----------
  const ses = store.get('tspc-sess', true);
  if (ses && ses.uid) {
    const o = mk(); Object.assign(o, { db: ses.db, uid: ses.uid, pwd: ses.pwd });
    st.odoo = o; st.user = { uid: ses.uid, name: ses.name, login: ses.login };
    entrar();
  } else initLogin();
})();
