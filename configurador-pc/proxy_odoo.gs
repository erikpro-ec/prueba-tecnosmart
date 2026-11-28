/**
 * TECNOSMART · Configurador PC — proxy hacia Odoo (Google Apps Script).
 * Reenvía llamadas JSON-RPC del configurador a Odoo. Así el navegador no choca con CORS
 * y no hay que tocar nginx. No guarda contraseñas ni registra datos: solo reenvía.
 *
 * Solo permite lo que la app necesita (lista blanca de servicios, modelos y métodos).
 * Cada llamada usa el usuario y la contraseña de Odoo de quien está conectado,
 * así que los permisos de Odoo siguen mandando.
 */
const ODOO_URL = 'https://newerp.tecnosmart.com.ec';

const PERMITIDO = {
  'product.product': ['search_read', 'read'],
  'product.category': ['search_read'],
  'res.partner': ['search_read', 'create'],
  'res.users': ['read'],
  'sale.order': ['create', 'read', 'check_access_rights', 'has_access'],
  'sale.order.line': ['fields_get'],
  'utm.source': ['search_read']
};

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function valida_(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.args)) return 'Llamada inválida';
  if (c.service === 'db') return c.method === 'list' ? null : 'Método no permitido';
  if (c.service === 'common') return ['login', 'version'].indexOf(c.method) >= 0 ? null : 'Método no permitido';
  if (c.service === 'object' && c.method === 'execute_kw') {
    const model = c.args[3], method = c.args[4];
    return PERMITIDO[model] && PERMITIDO[model].indexOf(method) >= 0 ? null : 'No permitido: ' + model + '.' + method;
  }
  return 'Servicio no permitido';
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const calls = (body.calls || []).slice(0, 30);
    const errores = calls.map(valida_);
    const reqs = [], idx = [];
    calls.forEach(function (c, i) {
      if (errores[i]) return;
      idx.push(i);
      reqs.push({
        url: ODOO_URL + '/jsonrpc', method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: c.service, method: c.method, args: c.args }, id: i })
      });
    });
    const resp = reqs.length ? UrlFetchApp.fetchAll(reqs) : [];
    const results = calls.map(function (c, i) { return errores[i] ? { error: { message: errores[i] } } : null; });
    resp.forEach(function (r, j) {
      const i = idx[j];
      try {
        const j2 = JSON.parse(r.getContentText());
        results[i] = j2.error ? { error: j2.error } : { result: j2.result };
      } catch (err) {
        results[i] = { error: { message: 'Odoo respondió HTTP ' + r.getResponseCode() } };
      }
    });
    return out_({ results: results });
  } catch (err) {
    return out_({ error: { message: String(err && err.message || err) } });
  }
}

function doGet() { return out_({ ok: true, servicio: 'Proxy Odoo · Configurador PC TECNOSMART', odoo: ODOO_URL }); }

/** Ejecuta en el editor para comprobar que Google llega a Odoo. */
function probar() {
  const r = UrlFetchApp.fetch(ODOO_URL + '/jsonrpc', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service: 'common', method: 'version', args: [] }, id: 1 })
  });
  Logger.log(r.getResponseCode() + ' ' + r.getContentText());
}
