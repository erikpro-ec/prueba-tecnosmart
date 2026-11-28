// Ejecutar: node configurador-pc/tests/compat.test.js
const assert = require('assert');
const C = require('../compat.js');
const { cpu, placa, ram, gabinete, fuente, grafica, ventilador } = C._;
let n = 0; const t = (name, fn) => { fn(); n++; };

t('CPU AMD', () => {
  let c = cpu('Procesador AMD Ryzen 5 7600 3.8GHz AM5');
  assert.deepStrictEqual([c.socket, c.igpu, c.requiereCooler], ['AM5', true, false]);
  c = cpu('Procesador AMD Ryzen 7 7800X3D');
  assert.deepStrictEqual([c.socket, c.igpu, c.requiereCooler], ['AM5', true, true]);
  c = cpu('AMD Ryzen 5 5600G con Wraith Stealth');
  assert.deepStrictEqual([c.socket, c.igpu, c.requiereCooler], ['AM4', true, false]);
  c = cpu('AMD Ryzen 5 5600X');
  assert.deepStrictEqual([c.socket, c.igpu, c.requiereCooler], ['AM4', false, false]);
  c = cpu('Ryzen 5 8400F');
  assert.deepStrictEqual([c.socket, c.igpu], ['AM5', false]);
});
t('CPU Intel', () => {
  let c = cpu('Procesador Intel Core i5-12400F 2.5GHz');
  assert.deepStrictEqual([c.socket, c.igpu, c.requiereCooler], ['LGA1700', false, false]);
  c = cpu('Intel Core i7 14700K');
  assert.deepStrictEqual([c.socket, c.igpu, c.requiereCooler], ['LGA1700', true, true]);
  c = cpu('Intel Core i3-10105');
  assert.strictEqual(c.socket, 'LGA1200');
  c = cpu('Intel Core Ultra 5 245K');
  assert.deepStrictEqual([c.socket, c.requiereCooler], ['LGA1851', true]);
  c = cpu('Procesador Intel Core i5-12400 Tray');
  assert.strictEqual(c.requiereCooler, true);
  assert.strictEqual(cpu('Procesador Intel Pentium').socket, null);
});
t('Mainboards', () => {
  let b = placa('Mainboard Asus Prime A520M-K');
  assert.deepStrictEqual([b.socket, b.ddr, b.form, b.ranuras], ['AM4', 'DDR4', 'MATX', 2]);
  b = placa('Mainboard MSI PRO B760M-A WIFI DDR4');
  assert.deepStrictEqual([b.socket, b.ddr, b.form, b.ranuras], ['LGA1700', 'DDR4', 'MATX', 4]);
  b = placa('Gigabyte H610M S2H');
  assert.deepStrictEqual([b.socket, b.ddr], ['LGA1700', null]);
  b = placa('Asus TUF Gaming X670E-Plus WiFi');
  assert.deepStrictEqual([b.socket, b.ddr, b.form], ['AM5', 'DDR5', 'ATX']);
  b = placa('Asus ROG Strix B650E-I Gaming');
  assert.deepStrictEqual([b.form, b.ranuras], ['ITX', 2]);
  b = placa('Asus Prime B760M-A D4');
  assert.strictEqual(b.ddr, 'DDR4');
});
t('RAM', () => {
  assert.deepStrictEqual(ram('Corsair Vengeance 32GB (2x16GB) DDR5 6000'), { ddr: 'DDR5', sodimm: false, modulos: 2, gb: 32 });
  assert.strictEqual(ram('Memoria SO-DIMM 8GB DDR4').sodimm, true);
  assert.strictEqual(ram('Adata XPG 16GB 3200').ddr, null);
});
t('Case / fuente / GPU / fan', () => {
  assert.strictEqual(gabinete('Case Xtech Gamer Mid Tower').formMax, 'ATX');
  assert.strictEqual(gabinete('Case Cooler Master Q300L Micro ATX').formMax, 'MATX');
  assert.strictEqual(gabinete('Case Lian Li O11 E-ATX').formMax, 'EATX');
  assert.strictEqual(gabinete('Case soporta ATX / M-ATX / ITX').formMax, 'ATX');
  assert.strictEqual(gabinete('Case Gamer Sentey').formMax, null);
  assert.strictEqual(fuente('Corsair RM750e 750W 80 Plus Gold').watts, 750);
  assert.strictEqual(fuente('Fuente 80 Plus').watts, null);
  assert.strictEqual(grafica('MSI GeForce RTX 4070 Super 12GB').key, 'RTX4070SUPER');
  assert.strictEqual(grafica('RTX4060TI 8GB').key, 'RTX4060TI');
  assert.strictEqual(grafica('Radeon RX 7900 XTX').key, 'RX7900XTX');
  assert.strictEqual(ventilador('Ventilador 120mm ARGB').mm, 120);
  assert.strictEqual(ventilador('Ventilador 14 cm').mm, 140);
  assert.strictEqual(ventilador('Lian Li SL120').mm, null);
});
t('Reglas', () => {
  const ctx = { cpu: cpu('Ryzen 5 7600'), mb: placa('Gigabyte B650M Gaming X DDR5') };
  assert.strictEqual(C.evaluar('mb', placa('MSI B550 Gaming Plus'), ctx).tipo, 'incompat');
  assert.strictEqual(C.evaluar('mb', placa('Asus X670E-Plus'), ctx), null);
  assert.strictEqual(C.evaluar('ram', ram('16GB DDR4 3200'), ctx).tipo, 'incompat');
  assert.strictEqual(C.evaluar('ram', ram('16GB DDR5 5600'), ctx), null);
  assert.strictEqual(C.evaluar('case', gabinete('Case Mini ITX'), ctx).tipo, 'incompat');
  assert.strictEqual(C.evaluar('case', gabinete('Case Micro ATX'), ctx), null);
  const g = grafica('RTX 4070 Super');
  assert.strictEqual(C.requisitoFuente(ctx.cpu, g).req, 650);
  assert.strictEqual(C.evaluar('psu', fuente('600W'), { ...ctx, gpu: g }).tipo, 'incompat');
  assert.strictEqual(C.evaluar('psu', fuente('750W'), { ...ctx, gpu: g }), null);
  assert.strictEqual(C.evaluar('air', {}, { water: true }).tipo, 'incompat');
  assert.strictEqual(C.evaluar('mb', placa('B650M DDR5'), {}).tipo, 'prereq');
});
console.log(`OK · ${n} grupos de pruebas`);
