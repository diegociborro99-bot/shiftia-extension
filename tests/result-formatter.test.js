// Test-first: formatAssistantResult aún no existe. Usa la respuesta REAL de /librar.
const assert = require('assert');
const { formatAssistantResult } = require('../shared/result-formatter');

const librarRes = {
  ok: true, verdict: 'ok', verdictLabel: 'Se puede librar sin problema',
  worker: 'CIBORRO GONZALEZ, DIEGO',
  summary: { action: 'librar', title: 'Librar día', who: 'CIBORRO GONZALEZ, DIEGO',
    when: '26/06/2026', what: 'Convertir turno M → descanso', where: 'HEMATOLOGIA · DUE' },
  reasoning: [
    { rule: 'Estado del día', status: 'pass', detail: 'Día asignado a turno M' },
    { rule: 'Cobertura mínima', status: 'pass', detail: '5 DUE(s) ahora → 4 tras librar · mínimo 3' }
  ],
  coverPlan: {
    primary: { label: 'Mejor opción', candidate: {
      name: 'AZPIROZ FERNANDEZ, SOLEDAD', score: 41, role: 'DUE', planta: 'HEMATOLOGIA',
      breakdown: ['Misma planta +30', 'Carga del mes (descanso) +11'],
      previousShift: 'D', nextShift: 'M', crossPlant: false
    } },
    all: [], moreCount: 0
  },
  suggestion: 'Se puede librar sin generar hueco.'
};

let html = formatAssistantResult(librarRes);
assert.ok(html.includes('sxr-verdict-ok'), 'banner de veredicto verde');
assert.ok(html.includes('Se puede librar sin problema'));
assert.ok(html.includes('26/06/2026') && html.includes('Convertir turno M → descanso'));
assert.ok(html.includes('AZPIROZ FERNANDEZ, SOLEDAD'));
assert.ok(html.includes('41'), 'score visible');
assert.ok(html.includes('Misma planta +30'));
assert.ok(html.includes('sxr-rule'), 'reglas de razonamiento renderizadas');
assert.ok(!html.includes('"ok"') && !/[{}]\s*$/.test(html), 'nada de JSON crudo');

// Veredicto bloqueado
html = formatAssistantResult({ ok: true, verdict: 'blocked', verdictLabel: 'No se puede',
  reasoning: [{ rule: 'Cobertura', status: 'fail', detail: 'Quedaría 1 DUE' }] });
assert.ok(html.includes('sxr-verdict-blocked'));
assert.ok(html.includes('sxr-rule-fail'));

// Shape legacy: candidates[] (suggestReplacement)
html = formatAssistantResult({ candidates: [{ name: 'VALLE GARCIA, MARTA', score: 33, breakdown: ['x'] }] });
assert.ok(html.includes('VALLE GARCIA, MARTA') && html.includes('33'));

// Shape legacy: reasons[] + legal
html = formatAssistantResult({ legal: false, reasons: ['Máximo de noches superado'] });
assert.ok(html.includes('Máximo de noches superado'));

// String plano y XSS
html = formatAssistantResult('hola <script>alert(1)</script>');
assert.ok(!html.includes('<script>'), 'escapa HTML');

// Desconocido → algo legible, no JSON con llaves
html = formatAssistantResult({ foo: 'bar', baz: 2 });
assert.ok(typeof html === 'string' && html.length > 0);

console.log('result-formatter: 6/6 OK');
