// Test-first: buildSystemPrompt aún no existe.
const assert = require('assert');
const { buildSystemPrompt, buildScheduleSummary } = require('../shared/prompt-builder');

// 1. Prompt completo con contexto + mes escaneado
const ctx = { worker: 'AVANZAS FERNANDEZ, SARA', module: 'Mi calendario' };
const snap = { workerId: '1122', year: 2026, month: 4,
  cells: ['M','M','T','','D','N','','M','T','D','','','','','','','','','','','','','','','','','','','','',''] };
let p = buildSystemPrompt(ctx, snap);
assert.ok(p.includes('AVANZAS FERNANDEZ, SARA'), 'incluye trabajador');
assert.ok(/mayo de 2026/i.test(p), 'mes legible en español');
assert.ok(p.includes('M = Mañana'), 'leyenda de códigos');
assert.ok(/noches/i.test(p), 'reglas de convenio presentes');
assert.ok(p.includes('1:M'), 'planilla compacta día:turno');
assert.ok(/no inventes|no lo sabes|reconoce/i.test(p), 'instrucción anti-alucinación');

// 2. Sin snapshot → prompt válido que avisa de que no hay planilla cargada
p = buildSystemPrompt(ctx, null);
assert.ok(p.includes('AVANZAS FERNANDEZ, SARA'));
assert.ok(/no hay planilla|sin planilla/i.test(p));

// 3. Sin contexto en absoluto → no peta
p = buildSystemPrompt(null, null);
assert.ok(typeof p === 'string' && p.length > 100);

// 4. Resumen de planilla: días vacíos omitidos, formato compacto
const s = buildScheduleSummary(snap.cells);
assert.strictEqual(s.split(' ')[0], '1:M');
assert.ok(!s.includes('4:'), 'día sin turno (índice 3) se omite');
assert.ok(s.includes('5:D'));

// 5. Tamaño acotado (Nano tiene contexto pequeño)
p = buildSystemPrompt(ctx, snap);
assert.ok(p.length < 4000, `prompt demasiado largo: ${p.length}`);

console.log('prompt-builder: 5/5 OK');
