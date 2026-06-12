// Test-first: assembleMonth aún no existe.
const assert = require('assert');
const { assembleMonth } = require('../shared/month-assembler');

const cell = (day, shift, over = {}) =>
  ({ workerId: '1122', day, month: 4, year: 2026, shift, ...over });

// 1. Mes normal de 31 días
let cells = [];
for (let d = 0; d < 31; d++) cells.push(cell(d, d % 3 === 0 ? 'M' : d % 3 === 1 ? 'T' : 'D'));
let r = assembleMonth(cells);
assert.strictEqual(r.ok, true);
assert.strictEqual(r.workerId, '1122');
assert.strictEqual(r.year, 2026);
assert.strictEqual(r.month, 4);
assert.strictEqual(r.cells.length, 31);
assert.strictEqual(r.cells[0], 'M');
assert.strictEqual(r.cells[2], 'D');
assert.strictEqual(r.stats.daysSeen, 31);

// 2. Celdas de otro mes/worker mezcladas → se queda con el grupo dominante
cells = [];
for (let d = 0; d < 30; d++) cells.push(cell(d, 'M'));
cells.push({ workerId: '1122', day: 0, month: 5, year: 2026, shift: 'T' }); // mes siguiente
cells.push({ workerId: '9999', day: 1, month: 4, year: 2026, shift: 'N' }); // otro worker
r = assembleMonth(cells);
assert.strictEqual(r.ok, true);
assert.strictEqual(r.month, 4);
assert.strictEqual(r.stats.daysSeen, 30);
assert.strictEqual(r.cells[0], 'M', 'la celda del mes 5 no debe pisar el día 0');
assert.strictEqual(r.cells[1], 'M', 'la celda del worker 9999 no debe pisar el día 1');

// 3. Sin turno detectado → ''
cells = [];
for (let d = 0; d < 30; d++) cells.push(cell(d, d === 5 ? null : 'M'));
r = assembleMonth(cells);
assert.strictEqual(r.cells[5], '');

// 4. Render parcial (< 20 celdas) → ok:false
r = assembleMonth([cell(0, 'M'), cell(1, 'T')]);
assert.strictEqual(r.ok, false);
assert.ok(/parcial/i.test(r.error));

// 5. Entrada vacía / sin ids parseables
r = assembleMonth([]);
assert.strictEqual(r.ok, false);
r = assembleMonth([{ workerId: null, day: null, month: null, year: null, shift: 'M' }]);
assert.strictEqual(r.ok, false);

// 6. Día duplicado: gana el que tiene turno no vacío
cells = [];
for (let d = 0; d < 28; d++) cells.push(cell(d, 'M'));
cells.push(cell(3, null));
r = assembleMonth(cells);
assert.strictEqual(r.cells[3], 'M');

console.log('month-assembler: 6/6 OK');
