/* TECNOSMART · Configurador PC — cliente Odoo (JSON-RPC /jsonrpc, válido en Odoo 13 a 19). */
(function () {
  'use strict';

  class OdooError extends Error {
    constructor(e) {
      const d = (e && e.data) || {};
      let msg = d.message || (e && e.message) || 'Error de Odoo';
      if (/AccessDenied/i.test(d.name || '') || /Access Denied/i.test(msg)) msg = 'Usuario o contraseña incorrectos';
      super(msg);
      this.odoo = e;
    }
  }

  class OdooClient {
    constructor(cfg) { this.cfg = cfg; this.db = cfg.db || ''; this.uid = null; this.pwd = null; this.seq = 0; }

    async _send(calls) {
      const c = this.cfg;
      if (c.modo === 'proxy') {
        if (!c.proxyUrl) throw new Error('Falta configurar la URL del proxy (config.js → proxyUrl).');
        let r;
        try {
          // text/plain evita el "preflight" CORS; Apps Script responde con CORS abierto.
          r = await fetch(c.proxyUrl, { method: 'POST', body: JSON.stringify({ calls }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        } catch (e) { throw new Error('No se pudo contactar el proxy de Google. Revisa la conexión.'); }
        const j = await r.json();
        if (j.error) throw new OdooError(j.error);
        return j.results;
      }
      return Promise.all(calls.map(async call => {
        let r;
        try {
          r = await fetch(c.odooUrl.replace(/\/$/, '') + '/jsonrpc', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: call, id: ++this.seq })
          });
        } catch (e) { throw new Error('Odoo no responde o bloquea la conexión (CORS). Ver README.'); }
        const j = await r.json();
        return j.error ? { error: j.error } : { result: j.result };
      }));
    }

    async run(calls) {
      const res = await this._send(calls);
      return res.map(r => { if (r.error) throw new OdooError(r.error); return r.result; });
    }

    async listarBases() {
      const [l] = await this.run([{ service: 'db', method: 'list', args: [] }]);
      return l || [];
    }

    async login(db, login, pwd) {
      const [uid] = await this.run([{ service: 'common', method: 'login', args: [db, login, pwd] }]);
      if (!uid) throw new Error('Usuario o contraseña incorrectos');
      Object.assign(this, { db, uid, pwd });
      return uid;
    }

    kw(model, method, args, kwargs) {
      return { service: 'object', method: 'execute_kw', args: [this.db, this.uid, this.pwd, model, method, args || [], kwargs || {}] };
    }
    async call(model, method, args, kwargs) { return (await this.run([this.kw(model, method, args, kwargs)]))[0]; }
    /** Varias llamadas en un solo viaje: [[model, method, args, kwargs], ...] */
    async many(list) { return this.run(list.map(x => this.kw(x[0], x[1], x[2], x[3]))); }
  }

  window.OdooClient = OdooClient;
  window.OdooError = OdooError;
})();
