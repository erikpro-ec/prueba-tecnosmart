/**
 * Tecnosmart · Competencia Mejor Técnico — receptor de resultados
 * Guarda cada test en la hoja «Resultados» y envía un correo al terminar.
 *
 * Configuración (una sola vez): Configuración del proyecto ▸ Propiedades del script
 *   ADMIN_KEY = clave del panel «Resultados 🔒» (mínimo 6 caracteres)
 *   MAIL_TO   = correo que recibe los resultados
 */
const HOJA = "Resultados";
const COLS = ["id","Fecha","Estado","Nombre","Correo","Filtro","Aciertos","Respondidas","Total","Puntaje %","Tiempo (s)","Estrellas","Comentario","Expectativa","Para repasar","Marcadas","Refutaciones","Sugerencias","Guardado","Correo enviado","JSON"];

function props_(){ return PropertiesService.getScriptProperties(); }
function mailTo_(){ return props_().getProperty("MAIL_TO") || Session.getEffectiveUser().getEmail(); }
function hoja_(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(HOJA);
  if (!sh) { sh = ss.insertSheet(HOJA); sh.appendRow(COLS); sh.setFrozenRows(1); sh.getRange(1,1,1,COLS.length).setFontWeight("bold"); }
  return sh;
}
function out_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function esAdmin_(k){ const a = props_().getProperty("ADMIN_KEY") || ""; return a.length >= 6 && String(k || "") === a; }
const s_ = (v, m) => typeof v === "string" ? v.slice(0, m) : "";
const n_ = v => isFinite(+v) ? +v : 0;

function limpiar_(r){
  if (!r || typeof r !== "object" || !/^r[a-z0-9]{4,20}$/.test(r.id || "")) return null;
  const arr = (v, m) => Array.isArray(v) ? v.slice(0, m) : [];
  return { id:r.id, d:s_(r.d,40), st:r.st === "en curso" ? "en curso" : "completo", n:s_(r.n,80), e:s_(r.e,120), f:s_(r.f,160),
    p:n_(r.p), c:n_(r.c), t:n_(r.t), tq:n_(r.tq), dur:n_(r.dur), rating:Math.min(5,n_(r.rating)), comment:s_(r.comment,2000), exp:s_(r.exp,1000),
    by:(r.by && typeof r.by === "object") ? JSON.parse(JSON.stringify(r.by)) : {},
    miss:arr(r.miss,400).map(m => typeof m === "object" ? {n:n_(m.n), q:s_(m.q,300)} : {n:n_(m), q:""}),
    flags:arr(r.flags,400).map(f => ({n:n_(f.n), q:s_(f.q,300), auto:!!f.auto, sec:n_(f.sec), ok:!!f.ok})),
    refs:arr(r.refs,200).map(f => ({n:n_(f.n), q:s_(f.q,300), c:s_(f.c,2000), a:s_(f.a,500), ok:!!f.ok})),
    sug:arr(r.sug,3).map(x => s_(x,500)) };
}
function fila_(r, mailed){
  return [r.id, r.d, r.st, r.n, r.e, r.f, r.c, r.t, r.tq || r.t, r.p, r.dur, r.rating, r.comment, r.exp,
    r.miss.map(m => "P" + m.n).join(" "), r.flags.map(f => "P" + f.n).join(" "),
    r.refs.map(f => "P" + f.n + ": " + f.c).join(" | "), r.sug.join(" | "), new Date(), mailed ? "sí" : "", JSON.stringify(r)];
}
function correo_(r){
  const to = mailTo_();
  const N = {B:"Básico", M:"Medio", A:"Avanzado"}, fmt = s => Math.floor(s/60) + " min " + (s%60) + " s";
  const L = [
    "Participante: " + r.n + " <" + r.e + ">",
    "Fecha: " + Utilities.formatDate(new Date(r.d), "America/Guayaquil", "dd/MM/yyyy HH:mm"),
    "Filtro: " + r.f,
    "Puntaje: " + r.p + "% (" + r.c + "/" + r.t + ")",
    "Tiempo: " + fmt(r.dur),
    "Por nivel: " + Object.keys(r.by).map(k => (N[k] || k) + ": " + r.by[k].o + "/" + r.by[k].t).join(" · "),
    "Valoración: " + "★".repeat(r.rating) + (r.comment ? " · " + r.comment : ""),
    "Expectativa: " + (r.exp || "-"), "",
    "PARA REPASAR (" + r.miss.length + "):"].concat(r.miss.map(m => "P" + m.n + " · " + m.q),
    ["", "MARCADAS COMO DUDOSAS (" + r.flags.length + "):"], r.flags.map(f => "P" + f.n + " · " + (f.auto ? "auto" : "manual") + " · " + (f.ok ? "acertó" : "falló") + " · " + f.q),
    ["", "REFUTACIONES (" + r.refs.length + "):"], r.refs.map(f => "P" + f.n + " · " + f.c + (f.a ? " (" + f.a + ")" : "")),
    r.sug.length ? ["", "SUGERENCIAS DE PREGUNTAS:"].concat(r.sug.map(x => "- " + x)) : []);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  MailApp.sendEmail({ to: to, replyTo: r.e, name: "Cuestionario Tecnosmart",
    subject: "Test completado: " + r.n + " · " + r.p + "%", body: L.join("\n") + "\n\nHoja de resultados: " + ss.getUrl() });
  return true;
}

function doPost(e){
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const j = JSON.parse(e.postData.contents); const r = limpiar_(j && j.rec);
    if (!r) return out_({ok:false});
    const sh = hoja_(), last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2,1,last-1,1).getValues().map(x => x[0]) : [];
    const i = ids.indexOf(r.id), row = i >= 0 ? i + 2 : 0;
    let mailed = false, oldSt = "";
    if (row) { oldSt = sh.getRange(row,3).getValue(); mailed = sh.getRange(row,20).getValue() === "sí"; }
    if (oldSt === "completo" && r.st === "en curso") return out_({ok:true});
    if (j.final && !mailed) { try { mailed = correo_(r); } catch (err) { console.error(err); } }
    const vals = [fila_(r, mailed)];
    if (row) sh.getRange(row,1,1,COLS.length).setValues(vals); else sh.getRange(last+1,1,1,COLS.length).setValues(vals);
    return out_({ok:true});
  } catch (err) { return out_({ok:false}); }
  finally { lock.releaseLock(); }
}

function doGet(e){
  const a = (e.parameter.a || "ping");
  if (a === "ping") return out_({ok:true});
  if (!esAdmin_(e.parameter.key)) return out_({ok:false, auth:false});
  if (a === "auth") return out_({ok:true});
  if (a === "list") {
    const sh = hoja_(), last = sh.getLastRow();
    const rows = last > 1 ? sh.getRange(2,1,last-1,COLS.length).getValues() : [];
    return out_({ok:true, results: rows.map(x => { try { return JSON.parse(x[COLS.length-1]); } catch (err) { return null; } }).filter(Boolean)});
  }
  return out_({ok:false});
}

/** Ejecútala una vez desde el editor para autorizar los permisos de hoja y correo. */
function probar(){ hoja_(); MailApp.sendEmail(mailTo_(), "Cuestionario Tecnosmart: prueba", "La conexión funciona."); }
