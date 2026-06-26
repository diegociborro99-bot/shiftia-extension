// Test-first: shiftFromColor aún no existe. Colores verificados con el HTML
// real de Actais (12-jun-2026) y los PDFs anuales.
const assert = require('assert');
const { shiftFromColor } = require('../shared/shift-colors');

assert.strictEqual(shiftFromColor('rgb(32, 121, 121)'), 'M', 'verde = mañana');
assert.strictEqual(shiftFromColor('rgb(166, 32, 32)'), 'D', 'rojo = descanso');
assert.strictEqual(shiftFromColor('rgb(204, 217, 242)'), 'T', 'azul claro = tarde');
assert.strictEqual(shiftFromColor('rgb(255, 217, 64)'), 'N', 'amarillo = noche');
// Tolerancia: el mismo color con ±10 de ruido (render/antialias) sigue casando
assert.strictEqual(shiftFromColor('rgb(30, 118, 124)'), 'M');
// Sin espacios
assert.strictEqual(shiftFromColor('rgb(166,32,32)'), 'D');
// Color desconocido o vacío → null (no inventar)
assert.strictEqual(shiftFromColor('rgb(1, 2, 3)'), null);
assert.strictEqual(shiftFromColor(''), null);
assert.strictEqual(shiftFromColor(null), null);

console.log('shift-colors: 9/9 OK');
