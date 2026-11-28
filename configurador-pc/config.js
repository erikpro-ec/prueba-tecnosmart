/* TECNOSMART · Configurador PC — parámetros. Cambia aquí y publica; no hace falta tocar app.js. */
window.CONFIG_PC = {
  odooUrl: 'https://newerp.tecnosmart.com.ec',
  db: '',                 // vacío = se detecta sola; si Odoo no lista bases, escribe aquí el nombre exacto
  // 'proxy'  = a través de Google Apps Script (proxy_odoo.gs). No requiere tocar el servidor.
  // 'directo'= el navegador habla con Odoo; requiere CORS en nginx (ver README).
  // 'demo'   = catálogo de ejemplo, no toca Odoo. También se activa con ?demo=1
  modo: 'proxy',
  proxyUrl: '',           // URL /exec del Apps Script desplegado

  iva: 15,                // % IVA Ecuador
  descuentoMax: 7,        // % máximo que puede aplicar el vendedor
  mostrarCosto: true,     // false = oculta columnas Costo y % ganancia
  gananciaSobre: 'costo', // 'costo' = (precio − costo) / costo · 'precio' = (precio − costo) / precio
  campoStock: 'qty_available',
  validezDias: 3,         // validez de la cotización en el PDF
  consumidorFinalRuc: '9999999999999',
  canales: ['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'Web', 'Tienda física', 'Referido', 'Otro'],

  // Cálculo de fuente: (CPU + GPU + base) × factor, redondeado a 50 W, nunca menos que lo
  // recomendado por el fabricante de la GPU ni que fuenteMinima.
  baseW: 80, factorFuente: 1.3, fuenteMinima: 400, gpuDesconocidaW: 250,

  // Categorías de Odoo por paso: se buscan por nombre (sin tildes, mayúsculas) e incluyen subcategorías.
  // Si prefieres fijarlas, usa ids: { cpu: [12, 15] }.
  categoriasIds: {},
  categorias: {
    cpu:     { si: /PROCESADOR|\bCPU/ },
    mb:      { si: /MAINBOARD|PLACA|MOTHERBOARD|TARJETA MADRE|MOTHER/, no: /VIDEO/ },
    ram:     { si: /MEMORIA|\bRAM\b/, no: /USB|FLASH|MICRO ?SD|\bSD\b|LAPTOP|PORTATIL|SO-?DIMM|CELULAR/ },
    ssd:     { si: /\bSSD|ESTADO SOLIDO/, no: /EXTERN/ },
    hdd:     { si: /DISCO DURO|DISCOS DUROS|\bHDD/, no: /EXTERN|SSD/ },
    gpu:     { si: /TARJETAS? DE VIDEO|\bGPU|GRAFICA/ },
    case:    { si: /\bCASES?\b|GABINETE|CHASIS/, no: /LAPTOP|CELULAR|PORTATIL|MOCHILA|ESTUCHE|DISCO/ },
    psu:     { si: /FUENTE/ },
    water:   { si: /WATER|LIQUID/ },
    air:     { si: /AIR ?COOLER|DISIPADOR|COOLER DE AIRE/ },
    fan:     { si: /VENTILADOR|\bFANS?\b/, no: /LAPTOP|PORTATIL/ },
    monitor: { si: /MONITOR/ },
    teclado: { si: /TECLADO/ },
    mouse:   { si: /MOUSE|RATON/, no: /PAD/ }
  },
  // Filtros extra por nombre de producto (cuando una categoría mezcla cosas).
  productos: {
    ssd: { no: /EXTERN|PORTATIL USB/ },
    hdd: { no: /SSD|NVME|EXTERN/ },
    air: { no: /WATER|LIQUID|\bAIO\b/ }
  }
};
