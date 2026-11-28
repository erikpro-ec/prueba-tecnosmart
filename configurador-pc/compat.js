/**
 * TECNOSMART · Configurador PC — motor de compatibilidad.
 * Lee los datos técnicos desde el TÍTULO del producto en Odoo (socket, chipset, DDR,
 * formato, vatios, tamaño de ventilador) y decide qué se puede combinar.
 * Regla de negocio: estricto. Si no es compatible, o si el título no trae el dato
 * necesario para comprobarlo, el producto no se ofrece.
 */
(function (root, factory) {
  const C = factory();
  if (typeof module === 'object' && module.exports) module.exports = C; else root.Compat = C;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const U = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Chipset → socket. Mantener al día cuando lleguen plataformas nuevas.
  const CHIPSETS = {
    AM5: ['A620', 'B650', 'X670', 'B840', 'B850', 'X870'],
    AM4: ['A320', 'A520', 'B350', 'B450', 'B550', 'X370', 'X470', 'X570'],
    LGA1851: ['H810', 'B860', 'Z890'],
    LGA1700: ['H610', 'B660', 'H670', 'Z690', 'B760', 'H770', 'Z790'],
    LGA1200: ['H410', 'B460', 'H470', 'Z490', 'H510', 'B560', 'H570', 'Z590'],
    LGA1151: ['H310', 'B360', 'B365', 'H370', 'Z370', 'Z390']
  };
  const CHIP2SOCK = {};
  Object.keys(CHIPSETS).forEach(s => CHIPSETS[s].forEach(c => { CHIP2SOCK[c] = s; }));
  // Chipsets de entrada cuyas placas Micro-ATX suelen traer solo 2 ranuras de RAM (criterio conservador).
  const DOS_RANURAS = ['A320', 'A520', 'A620', 'H310', 'H410', 'H510', 'H610', 'H810'];
  // Plataformas donde el tipo de memoria es único y se puede deducir.
  const DDR_SOCKET = { AM5: 'DDR5', LGA1851: 'DDR5', AM4: 'DDR4', LGA1200: 'DDR4', LGA1151: 'DDR4' };
  const FORM_RANK = { ITX: 1, MATX: 2, ATX: 3, EATX: 4 };
  const FORM_TXT = { ITX: 'Mini-ITX', MATX: 'Micro-ATX', ATX: 'ATX', EATX: 'E-ATX' };

  // [consumo aprox. W, fuente recomendada por el fabricante W]
  const GPU = {
    RTX2060: [160, 500], RTX2070: [175, 550], RTX2080: [215, 650],
    RTX3050: [130, 550], RTX3060: [170, 550], RTX3060TI: [200, 600], RTX3070: [220, 650], RTX3070TI: [290, 750],
    RTX3080: [320, 750], RTX3090: [350, 750],
    RTX4060: [115, 550], RTX4060TI: [165, 550], RTX4070: [200, 650], RTX4070SUPER: [220, 650], RTX4070TI: [285, 700],
    RTX4070TISUPER: [285, 700], RTX4080: [320, 750], RTX4080SUPER: [320, 750], RTX4090: [450, 850],
    RTX5050: [130, 550], RTX5060: [145, 550], RTX5060TI: [180, 600], RTX5070: [250, 650], RTX5070TI: [300, 750],
    RTX5080: [360, 850], RTX5090: [575, 1000],
    GTX1050TI: [75, 300], GTX1630: [75, 300], GTX1650: [75, 300], GTX1660: [120, 450], GTX1660SUPER: [125, 450], GTX1660TI: [120, 450],
    GT710: [20, 300], GT730: [40, 300], GT1030: [30, 300],
    RX550: [50, 400], RX580: [185, 500], RX6500XT: [107, 400], RX6600: [132, 500], RX6600XT: [160, 500], RX6650XT: [180, 500],
    RX6700XT: [230, 650], RX6750XT: [250, 650], RX6800: [250, 650], RX6800XT: [300, 750],
    RX7600: [165, 550], RX7600XT: [190, 600], RX7700XT: [245, 700], RX7800XT: [263, 700], RX7900GRE: [260, 700],
    RX7900XT: [315, 750], RX7900XTX: [355, 800], RX9060XT: [160, 500], RX9070: [220, 650], RX9070XT: [304, 750],
    ARCA380: [75, 300], ARCA580: [185, 550], ARCA750: [225, 550], ARCA770: [225, 650], ARCB570: [150, 500], ARCB580: [190, 550]
  };

  function socketDe(s) {
    if (/\bAM5\b/.test(s)) return 'AM5';
    if (/\bAM4\b/.test(s)) return 'AM4';
    const m = s.match(/(?:FCLGA|LGA|SOCKET)\s*-?\s*(1851|1700|1200|1151)\b/);
    return m ? 'LGA' + m[1] : null;
  }
  function ddrDe(s) {
    const d5 = /DDR5|\bD5\b/.test(s), d4 = /DDR4|\bD4\b/.test(s), d3 = /DDR3\b/.test(s);
    if (d5 && !d4) return 'DDR5';
    if (d4 && !d5) return 'DDR4';
    if (d3 && !d4 && !d5) return 'DDR3';
    return null;
  }
  function normForm(s) {
    return s.replace(/\bE[\s-]?ATX\b|EXTENDED[\s-]*ATX/g, ' EATX ')
      .replace(/MICRO[\s-]*ATX|\bM[\s-]?ATX\b|\bU[\s-]?ATX\b/g, ' MATX ')
      .replace(/MINI[\s-]*ITX/g, ' ITX ');
  }
  function formsDe(n) {
    const f = [];
    if (/\bEATX\b|FULL[\s-]*TOWER/.test(n)) f.push('EATX');
    if (/\bATX\b|MID[\s-]*TOWER|MIDTOWER|MEDIA[\s-]*TORRE/.test(n)) f.push('ATX');
    if (/\bMATX\b|MINI[\s-]*TOWER|MICRO[\s-]*TOWER/.test(n)) f.push('MATX');
    if (/\bITX\b/.test(n)) f.push('ITX');
    return f;
  }

  function cpu(nombre) {
    const s = U(nombre);
    const r = { socket: socketDe(s), igpu: null, watts: 95, requiereCooler: false, marca: null, gama: null, modelo: null };
    let m;
    if ((m = s.match(/RYZEN\s*(?:AI\s*)?([3579])\s*(?:PRO\s*)?(\d{4})\s?(X3D|XT|X|GT|GE|G|F)?\b/))) {
      const gama = +m[1], num = +m[2], suf = m[3] || '', serie = Math.floor(num / 1000);
      Object.assign(r, { marca: 'AMD', gama, modelo: `Ryzen ${gama} ${num}${suf}` });
      if (!r.socket) r.socket = serie >= 7 ? 'AM5' : 'AM4';
      r.igpu = r.socket === 'AM5' ? !/F/.test(suf) : /G/.test(suf);
      r.watts = { 3: 65, 5: 90, 7: 120, 9: 170 }[gama];
      r.requiereCooler = /X3D/.test(suf) || (/X/.test(suf) && (r.socket === 'AM5' || gama >= 7));
    } else if ((m = s.match(/ULTRA\s*([3579])\s*-?\s*(\d{3})([A-Z]{0,2})\b/))) {
      const gama = +m[1], suf = m[3] || '';
      Object.assign(r, { marca: 'INTEL', gama, modelo: `Core Ultra ${gama} ${m[2]}${suf}` });
      if (!r.socket) r.socket = 'LGA1851';
      r.igpu = !/F/.test(suf);
      r.watts = (/K/.test(suf) ? { 3: 90, 5: 160, 7: 250, 9: 250 } : { 3: 65, 5: 120, 7: 150, 9: 180 })[gama];
      r.requiereCooler = /K/.test(suf);
    } else if ((m = s.match(/\bI([3579])\s*-?\s*(\d{4,5})([A-Z]{0,3})\b/))) {
      const gama = +m[1], num = +m[2], suf = m[3] || '', gen = Math.floor(num / 1000);
      Object.assign(r, { marca: 'INTEL', gama, modelo: `Core i${gama}-${num}${suf}` });
      if (!r.socket) r.socket = gen >= 12 && gen <= 14 ? 'LGA1700' : gen >= 10 && gen <= 11 ? 'LGA1200' : gen >= 8 && gen <= 9 ? 'LGA1151' : null;
      r.igpu = !/F/.test(suf);
      r.watts = (/K/.test(suf) ? { 3: 90, 5: 180, 7: 250, 9: 253 } : { 3: 65, 5: 117, 7: 150, 9: 180 })[gama];
      r.requiereCooler = /K/.test(suf);
    } else if ((m = s.match(/\b(?:PENTIUM|CELERON)\b.*?\bG(\d{4})\b/))) {
      const num = +m[1];
      Object.assign(r, { marca: 'INTEL', gama: 1, modelo: 'G' + num, igpu: true, watts: 58 });
      if (!r.socket) r.socket = num >= 7000 ? 'LGA1700' : num >= 6000 ? 'LGA1200' : null;
    } else if (/\bATHLON\b/.test(s)) {
      Object.assign(r, { marca: 'AMD', gama: 1, modelo: 'Athlon', igpu: true, watts: 35 });
      if (!r.socket) r.socket = 'AM4';
    }
    if (/\bTRAY\b|\bOEM\b|\bWOF\b|SIN\s*(?:COOLER|DISIPADOR|VENTILADOR)/.test(s)) r.requiereCooler = true;
    if (/CON\s*(?:COOLER|DISIPADOR)|WRAITH|LAMINAR/.test(s)) r.requiereCooler = false;
    return r;
  }

  function placa(nombre) {
    const s = U(nombre), n = normForm(s);
    const m = n.match(/(?:^|[^A-Z0-9])([ABHXZ]\d{3})(E)?(?:-?([MI]))?(?![A-Z0-9])/);
    const chipset = m && CHIP2SOCK[m[1]] ? m[1] : null;
    const socket = socketDe(s) || (chipset ? CHIP2SOCK[chipset] : null);
    const ddr = ddrDe(s) || (socket ? DDR_SOCKET[socket] || null : null);
    const f = formsDe(n);
    let form = f.length === 1 ? f[0] : null;
    if (!form && chipset) form = m[3] === 'M' ? 'MATX' : m[3] === 'I' ? 'ITX' : 'ATX';
    const rm = s.match(/\b([24])\s*(?:X\s*)?(?:DIMM|SLOTS?|RANURAS|BANCOS)\b/);
    let ranuras = rm ? +rm[1] : form === 'ITX' ? 2 : form === 'MATX' && DOS_RANURAS.includes(chipset) ? 2 : 4;
    return { socket, chipset, ddr, form, ranuras };
  }

  function ram(nombre) {
    const s = U(nombre);
    const k = s.match(/\b([2468])\s*X\s*(\d{1,3})\s*GB?\b/);
    const g = s.match(/\b(\d{1,3})\s*GB\b/);
    return {
      ddr: ddrDe(s),
      sodimm: /SO-?DIMM|LAPTOP|PORTATIL|NOTEBOOK/.test(s),
      modulos: k ? +k[1] : 1,
      gb: k ? +k[1] * +k[2] : g ? +g[1] : null
    };
  }

  function gabinete(nombre) {
    const f = formsDe(normForm(U(nombre)));
    let formMax = null;
    f.forEach(x => { if (!formMax || FORM_RANK[x] > FORM_RANK[formMax]) formMax = x; });
    return { formMax };
  }

  function fuente(nombre) {
    const s = U(nombre), re = /(\d{3,4})\s*(?:W|WATTS?|VATIOS)\b/g;
    let m, watts = null;
    while ((m = re.exec(s))) { const w = +m[1]; if (w >= 200 && w <= 2500 && (!watts || w > watts)) watts = w; }
    return { watts };
  }

  function grafica(nombre) {
    const s = U(nombre).replace(/\s+/g, ' ');
    let m, key = null;
    if ((m = s.match(/\bRTX\s*-?\s*(\d{4})\s*(TI\s*SUPER|TI|SUPER)?\b/))) key = 'RTX' + m[1] + (m[2] || '').replace(/\s/g, '');
    else if ((m = s.match(/\bGTX\s*-?\s*(\d{3,4})\s*(TI|SUPER)?\b/))) key = 'GTX' + m[1] + (m[2] || '');
    else if ((m = s.match(/\bGT\s*-?\s*(\d{3,4})\b/))) key = 'GT' + m[1];
    else if ((m = s.match(/\bRX\s*-?\s*(\d{3,4})\s*(XTX|XT|GRE)?\b/))) key = 'RX' + m[1] + (m[2] || '');
    else if ((m = s.match(/\bARC\s*([AB]\d{3})\b/))) key = 'ARC' + m[1];
    const t = GPU[key];
    return { key, tdp: t ? t[0] : null, psuRec: t ? t[1] : null };
  }

  function ventilador(nombre) {
    const s = U(nombre);
    const m = s.match(/\b(120|140)\s*MM\b/) || s.match(/\b(12|14)\s*CM\b/);
    return { mm: m ? (+m[1] < 100 ? +m[1] * 10 : +m[1]) : null };
  }

  const PARSERS = { cpu, mb: placa, ram, case: gabinete, psu: fuente, gpu: grafica, fan: ventilador };
  function analizar(step, nombre) { return PARSERS[step] ? PARSERS[step](nombre) : {}; }

  function requisitoFuente(c, g, cfg) {
    cfg = cfg || {};
    const base = cfg.baseW != null ? cfg.baseW : 80;
    const factor = cfg.factorFuente || 1.3;
    const minimo = cfg.fuenteMinima || 400;
    const gW = g ? (g.tdp != null ? g.tdp : (cfg.gpuDesconocidaW || 250)) : 0;
    const est = ((c && c.watts) || 95) + gW + base;
    const req = Math.max(Math.ceil(est * factor / 50) * 50, g ? (g.psuRec || 650) : 0, minimo);
    return { est, req };
  }

  const D = msg => ({ tipo: 'datos', msg });      // falta el dato en el título
  const P = msg => ({ tipo: 'prereq', msg });     // falta elegir algo antes
  const X = msg => ({ tipo: 'incompat', msg });   // incompatible

  /** null = se puede ofrecer. ctx = info de lo ya elegido {cpu, mb, gpu, case, psu, water, air}. */
  function evaluar(step, i, ctx, cfg) {
    ctx = ctx || {};
    switch (step) {
      case 'cpu':
        return i.socket ? null : D('No se detecta el socket ni el modelo en el título');
      case 'mb':
        if (!i.socket) return D('No se detecta el socket ni el chipset en el título');
        if (!i.ddr) return D('Falta DDR4 o DDR5 en el título');
        if (!ctx.cpu) return P('Primero elige el procesador');
        if (i.socket !== ctx.cpu.socket) return X(`Socket ${i.socket}; el procesador es ${ctx.cpu.socket}`);
        return null;
      case 'ram':
        if (i.sodimm) return X('Memoria de laptop (SO-DIMM)');
        if (!i.ddr) return D('Falta DDR4 o DDR5 en el título');
        if (!ctx.mb) return P('Primero elige la mainboard');
        if (i.ddr !== ctx.mb.ddr) return X(`${i.ddr}; la mainboard usa ${ctx.mb.ddr}`);
        if (i.modulos > ctx.mb.ranuras) return X(`Kit de ${i.modulos} módulos; la mainboard tiene ${ctx.mb.ranuras} ranuras`);
        return null;
      case 'case':
        if (!i.formMax) return D('Falta el formato (ATX, Micro-ATX, ITX o Mid Tower) en el título');
        if (!ctx.mb) return P('Primero elige la mainboard');
        if (FORM_RANK[i.formMax] < FORM_RANK[ctx.mb.form]) return X(`Admite hasta ${FORM_TXT[i.formMax]}; la mainboard es ${FORM_TXT[ctx.mb.form]}`);
        return null;
      case 'psu': {
        if (!i.watts) return D('Falta la potencia en W en el título');
        if (!ctx.cpu) return P('Primero elige el procesador');
        const req = requisitoFuente(ctx.cpu, ctx.gpu, cfg).req;
        if (i.watts < req) return X(`${i.watts} W; este equipo necesita mínimo ${req} W`);
        return null;
      }
      case 'water':
        return ctx.air ? X('Ya elegiste un air cooler: son excluyentes') : null;
      case 'air':
        return ctx.water ? X('Ya elegiste un water cooler: son excluyentes') : null;
      case 'fan':
        return i.mm ? null : D('Falta el tamaño 120 mm o 140 mm en el título');
      default:
        return null;
    }
  }

  function etiquetas(step, i) {
    const t = [];
    if (step === 'cpu') {
      if (i.socket) t.push(i.socket);
      if (i.igpu === true) t.push('Gráficos integrados'); else if (i.igpu === false) t.push('Sin gráficos integrados');
      if (i.requiereCooler) t.push('Sin cooler incluido');
    } else if (step === 'mb') {
      [i.socket, i.chipset, i.ddr, FORM_TXT[i.form], i.ranuras && `${i.ranuras} ranuras RAM`].forEach(x => x && t.push(x));
    } else if (step === 'ram') {
      if (i.ddr) t.push(i.ddr);
      if (i.modulos > 1) t.push(`Kit ${i.modulos} módulos`);
    } else if (step === 'case' && i.formMax) t.push('Hasta ' + FORM_TXT[i.formMax]);
    else if (step === 'psu' && i.watts) t.push(i.watts + ' W');
    else if (step === 'gpu' && i.tdp) t.push(`~${i.tdp} W`);
    else if (step === 'fan' && i.mm) t.push(i.mm + ' mm');
    return t;
  }

  return { analizar, evaluar, etiquetas, requisitoFuente, FORM_TXT, FORM_RANK, U, _: { cpu, placa, ram, gabinete, fuente, grafica, ventilador } };
});
