/* TECNOSMART · Configurador PC — modo demo: simula Odoo con un catálogo de ejemplo. No toca datos reales. */
(function () {
  'use strict';
  const CATS = ['Procesadores', 'Mainboard', 'Memoria RAM', 'SSD internos', 'Discos duros', 'Tarjetas de video', 'Cases',
    'Fuentes de poder', 'Water cooler', 'Air cooler', 'Ventiladores', 'Monitores', 'Teclados', 'Mouse', 'Memorias USB'];
  const P = {
    1: [['Procesador AMD Ryzen 5 5600G 3.9GHz AM4 con Wraith Stealth', 129, 8], ['Procesador AMD Ryzen 5 7600 3.8GHz AM5', 209, 5],
      ['Procesador AMD Ryzen 7 7800X3D 4.2GHz AM5', 429, 3], ['Procesador Intel Core i5-12400F 2.5GHz LGA1700', 139, 10],
      ['Procesador Intel Core i7-14700K 3.4GHz LGA1700', 419, 2], ['Procesador Intel Core Ultra 5 245K', 335, 2],
      ['Procesador AMD Ryzen 3 3200G', 89, 4], ['Procesador Intel Pentium', 59, 3]],
    2: [['Mainboard Asus Prime A520M-K DDR4 AM4', 79, 6], ['Mainboard MSI B550 Gaming Plus', 139, 3],
      ['Mainboard Gigabyte B650M Gaming X AX DDR5', 189, 4], ['Mainboard Asus TUF Gaming X670E-Plus WiFi', 299, 2],
      ['Mainboard MSI PRO B760M-A WIFI DDR4', 159, 5], ['Mainboard Asus ROG Strix Z790-E Gaming WiFi DDR5', 449, 1],
      ['Mainboard Gigabyte H610M S2H', 89, 7], ['Mainboard ASRock B860M Pro RS', 169, 3], ['Mainboard Asus ROG Strix B650E-I Gaming WiFi', 329, 1]],
    3: [['Memoria RAM Kingston Fury Beast 8GB DDR4 3200MHz', 25, 20], ['Memoria RAM Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz', 49, 9],
      ['Memoria RAM Kingston Fury Beast 16GB DDR5 5600MHz', 59, 12], ['Memoria RAM Corsair Vengeance RGB 32GB (2x16GB) DDR5 6000MHz', 129, 4],
      ['Memoria SO-DIMM 8GB DDR4 Laptop', 22, 10], ['Memoria Adata XPG 16GB 3200', 39, 3]],
    4: [['SSD Kingston NV3 500GB M.2 NVMe', 42, 15], ['SSD Samsung 990 Pro 1TB M.2 NVMe', 119, 6], ['SSD Adata SU650 480GB SATA', 32, 11],
      ['SSD WD Black SN850X 2TB M.2 NVMe', 179, 2]],
    5: [['Disco Duro Seagate Barracuda 1TB 7200RPM', 49, 6], ['Disco Duro WD Blue 2TB 5400RPM', 69, 4]],
    6: [['Tarjeta de Video Asus Dual GeForce RTX 4060 8GB', 329, 4], ['Tarjeta de Video MSI GeForce RTX 4070 Super Ventus 12GB', 659, 2],
      ['Tarjeta de Video Gigabyte Radeon RX 7600 Gaming OC 8GB', 299, 3], ['Tarjeta de Video Zotac RTX 5070 Ti 16GB', 899, 1],
      ['Tarjeta de Video GT 730 2GB', 69, 5]],
    7: [['Case Xtech Gamer Mid Tower RGB', 49, 10], ['Case Cooler Master Q300L Micro ATX', 59, 4], ['Case Lian Li O11 Dynamic EVO E-ATX', 189, 2],
      ['Case Thermaltake The Tower 100 Mini ITX', 119, 1], ['Case Gamer Sentey', 45, 6]],
    8: [['Fuente de Poder Xtech 500W', 35, 9], ['Fuente de Poder EVGA 600 W1 600W 80 Plus', 59, 6], ['Fuente de Poder Corsair RM750e 750W 80 Plus Gold', 119, 4],
      ['Fuente de Poder Corsair RM850x 850W 80 Plus Gold', 159, 3], ['Fuente de Poder Thermaltake Toughpower GF3 1000W', 219, 1], ['Fuente de Poder Generica', 19, 8]],
    9: [['Water Cooler Cooler Master MasterLiquid 240L Core ARGB', 89, 4], ['Water Cooler NZXT Kraken 360 RGB', 229, 2]],
    10: [['Air Cooler Deepcool AK400', 39, 7], ['Air Cooler Cooler Master Hyper 212 Black', 45, 5]],
    11: [['Ventilador Cooler Master SickleFlow 120mm ARGB', 12, 30], ['Ventilador Corsair AF140 Elite 140mm', 25, 8], ['Ventilador Lian Li UNI FAN SL120 V2', 29, 6]],
    12: [['Monitor Samsung 24" Odyssey G3 165Hz', 189, 5], ['Monitor LG 27" UltraGear 180Hz', 259, 3]],
    13: [['Teclado Redragon Kumara K552 RGB', 35, 12], ['Teclado Logitech K120', 12, 20]],
    14: [['Mouse Logitech G203 Lightsync', 25, 15], ['Mouse Redragon Cobra M711', 19, 9]],
    15: [['Memoria USB Kingston 64GB', 8, 40]]
  };
  const COLORS = ['#0f766e', '#1d4ed8', '#7c3aed', '#b45309', '#be123c', '#047857', '#334155', '#a16207', '#0369a1', '#4d7c0f', '#9333ea', '#0e7490', '#c2410c', '#475569', '#6b7280'];
  const products = [];
  let pid = 1;
  Object.keys(P).forEach(c => P[c].forEach(([name, price, qty]) => {
    products.push({ id: pid, name, display_name: name, default_code: 'TS-' + String(pid).padStart(4, '0'), lst_price: price,
      standard_price: Math.round(price / (1.22 + (pid % 5) * 0.03) * 100) / 100, qty_available: qty, uom_id: [1, 'Unidades'],
      taxes_id: [1], categ_id: [+c, CATS[c - 1]], sale_ok: true });
    pid++;
  }));
  function img(p, size) {
    const col = COLORS[(p.categ_id[0] - 1) % COLORS.length];
    const label = p.categ_id[1].split(' ')[0].toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120"><rect width="120" height="120" rx="14" fill="${col}"/><rect x="22" y="22" width="76" height="52" rx="6" fill="#fff" opacity=".18"/><text x="60" y="96" font-family="Arial" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${label}</text><text x="60" y="55" font-family="Arial" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">TS</text></svg>`;
    return btoa(unescape(encodeURIComponent(svg)));
  }
  const partners = [
    { id: 1, name: 'Consumidor Final', vat: '9999999999999', phone: '', mobile: '', email: '', city: 'Guayaquil' },
    { id: 2, name: 'Juan Pérez', vat: '0912345678', phone: '0991234567', mobile: '', email: 'juan@example.com', city: 'Guayaquil' },
    { id: 3, name: 'María Torres', vat: '0923456789', phone: '0987654321', mobile: '', email: 'maria@example.com', city: 'Daule' }
  ];
  let soSeq = 100;
  const orders = {};

  function exec(model, method, args, kw) {
    kw = kw || {};
    const pick = (o, f) => f ? Object.fromEntries(f.filter(k => k in o || /^image/.test(k)).map(k => [k, o[k]])) : o;
    if (method === 'check_access_rights') return true;
    if (model === 'res.users' && method === 'read') return [{ id: 2, name: 'Vendedor Demo', company_id: [1, 'TECNOSMART'] }];
    if (model === 'sale.order.line' && method === 'fields_get') return { product_uom: {}, tax_id: {}, discount: {} };
    if (model === 'product.category' && method === 'search_read') return CATS.map((n, i) => ({ id: i + 1, name: n, complete_name: 'Todos / ' + n }));
    if (model === 'product.product' && method === 'search_read') {
      const dom = args[0];
      const ch = dom.find(d => d[0] === 'categ_id');
      const ids = ch ? [].concat(ch[2]) : [];
      return products.filter(p => ids.includes(p.categ_id[0]) && p.qty_available > 0).map(p => pick(p, kw.fields));
    }
    if (model === 'product.product' && method === 'read') {
      return args[0].map(id => {
        const p = products.find(x => x.id === id), o = { id };
        (args[1] || []).forEach(f => { if (/^image_(\d+)/.test(f)) o[f] = img(p, +f.split('_')[1]); });
        return o;
      });
    }
    if (model === 'res.partner' && method === 'search_read') {
      const s = JSON.stringify(args[0]).toLowerCase();
      if (s.includes('9999999999999')) return partners.slice(0, 1);
      const q = ((args[0].find(d => Array.isArray(d) && d[1] === 'ilike') || [])[2] || '').toLowerCase();
      return partners.filter(p => (p.name + p.vat + p.phone).toLowerCase().includes(q)).slice(0, kw.limit || 8);
    }
    if (model === 'res.partner' && method === 'create') { const id = partners.length + 1; partners.push(Object.assign({ id }, args[0])); return id; }
    if (model === 'utm.source' && method === 'search_read') return [];
    if (model === 'sale.order' && method === 'create') {
      const v = args[0], id = ++soSeq;
      let untaxed = 0;
      v.order_line.forEach(([, , l]) => { untaxed += Math.round(l.price_unit * l.product_uom_qty * (1 - (l.discount || 0) / 100) * 100) / 100; });
      untaxed = Math.round(untaxed * 100) / 100;
      const tax = Math.round(untaxed * 0.15 * 100) / 100;
      orders[id] = { id, name: 'S00' + id, state: 'draft', amount_untaxed: untaxed, amount_tax: tax, amount_total: Math.round((untaxed + tax) * 100) / 100 };
      return id;
    }
    if (model === 'sale.order' && method === 'read') return args[0].map(id => orders[id]);
    throw new Error(`Demo: ${model}.${method} no simulado`);
  }

  class DemoOdoo extends window.OdooClient {
    async _send(calls) {
      await new Promise(r => setTimeout(r, 180));
      return calls.map(c => {
        try {
          if (c.service === 'db') return { result: ['tecnosmart_demo'] };
          if (c.service === 'common') return { result: c.args[2] ? 2 : false };
          const a = c.args;
          return { result: exec(a[3], a[4], a[5], a[6]) };
        } catch (e) { return { error: { message: e.message } }; }
      });
    }
  }
  window.DemoOdoo = DemoOdoo;
})();
