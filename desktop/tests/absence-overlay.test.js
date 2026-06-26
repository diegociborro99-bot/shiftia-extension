// Tests de shared/absence-overlay.js contra el HTML REAL de Actais (12-jun-2026).
const assert = require('assert');
const { absenceCodeFromCell, pickWorkerName } = require('../shared/absence-overlay');

// ===== absenceCodeFromCell: el código viene como CLASE del .slot.absence =====
// Caso real día 3 (primer día, con texto):
let code = absenceCodeFromCell({
  classes: ['slot','ProgInc','absence','abs-long','absence_91933','middle-slot','first-slot','Inc_91933','VAC'],
  text: 'VAC'
});
assert.strictEqual(code, 'VAC');

// Caso real día 4-10 (continuación, SIN texto — solo la clase):
code = absenceCodeFromCell({
  classes: ['slot','ProgInc','absence','abs-long','absence_91933','middle-slot','Inc_91933','VAC'],
  text: ''
});
assert.strictEqual(code, 'VAC');

// Sin clase de código pero con texto (fallback)
assert.strictEqual(absenceCodeFromCell({ classes: ['slot','absence'], text: ' BAJ ' }), 'BAJ');

// No confundir clases que CONTIENEN un código como subcadena
assert.strictEqual(absenceCodeFromCell({ classes: ['VACATION-banner','slot'], text: '' }), null);
assert.strictEqual(absenceCodeFromCell({ classes: ['Status_10','S_10'], text: '' }), null);

// Vacío / nulo
assert.strictEqual(absenceCodeFromCell({ classes: [], text: '' }), null);
assert.strictEqual(absenceCodeFromCell(null), null);

// ===== pickWorkerName (sin cambios de contrato) =====
assert.strictEqual(pickWorkerName(['SANITARIO', 'CIBORRO GONZALEZ, DIEGO']), 'CIBORRO GONZALEZ, DIEGO');
assert.strictEqual(pickWorkerName([null, '', 'Calendario del empleado', 'CALVO FERNANDEZ, LAURA']), 'CALVO FERNANDEZ, LAURA');
assert.strictEqual(pickWorkerName(['DUE']), null);
assert.strictEqual(pickWorkerName(['  CIBORRO GONZALEZ, DIEGO (2) ']), 'CIBORRO GONZALEZ, DIEGO');
// Nombre real con Mª del árbol
assert.strictEqual(pickWorkerName(['CERRADA MENENDEZ, Mª CARMEN']), 'CERRADA MENENDEZ, Mª CARMEN');

console.log('absence-overlay: 11/11 OK');

// ===== normalizeBridgeWorker: nodo del árbol easyui → {id, name} =====
const { normalizeBridgeWorker } = require('../shared/absence-overlay');
let w = normalizeBridgeWorker({ id: 'w_46', text: ' AZPIROZ FERNANDEZ, SOLEDAD ' });
assert.deepStrictEqual(w, { id: '46', name: 'AZPIROZ FERNANDEZ, SOLEDAD' });
w = normalizeBridgeWorker({ id: 1122, text: 'CIBORRO GONZALEZ, DIEGO' });
assert.deepStrictEqual(w, { id: '1122', name: 'CIBORRO GONZALEZ, DIEGO' });
w = normalizeBridgeWorker({ id: 'dep_5', text: 'HEMATOLOGIA' });
assert.strictEqual(w, null, 'departamentos (sin coma de apellidos) se descartan');
assert.strictEqual(normalizeBridgeWorker({ id: 'w_9', text: '' }), null);
assert.strictEqual(normalizeBridgeWorker(null), null);
w = normalizeBridgeWorker({ text: 'VALLE GARCIA, MARTA' }); // sin id
assert.deepStrictEqual(w, { id: null, name: 'VALLE GARCIA, MARTA' });
console.log('normalizeBridgeWorker: 6/6 OK');
