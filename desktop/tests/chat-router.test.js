// Test-first: routeQuestion no existe. Enruta preguntas críticas al motor
// determinista en vez de dejar que Gemini Nano se las invente.
const assert = require('assert');
const { routeQuestion } = require('../shared/chat-router');

// ¿Quién cubre? → whoCovers
let r = routeQuestion('¿quién puede cubrir el día 26?');
assert.deepStrictEqual(r, { action: 'whoCovers', day: 25 }, JSON.stringify(r)); // 0-based
r = routeQuestion('quien me sustituye el 14');
assert.deepStrictEqual(r, { action: 'whoCovers', day: 13 });

// Librar
r = routeQuestion('¿puede librar el día 26?');
assert.deepStrictEqual(r, { action: 'librar', day: 25 });
r = routeQuestion('se puede librar el 3?');
assert.deepStrictEqual(r, { action: 'librar', day: 2 });

// Validar convenio
r = routeQuestion('¿es legal ponerle noche el día 8?');
assert.deepStrictEqual(r, { action: 'validateConvenio', day: 7 });
r = routeQuestion('cumple convenio el 12?');
assert.deepStrictEqual(r, { action: 'validateConvenio', day: 11 });

// Pregunta crítica SIN día concreto → al motor no (Nano avisará)
r = routeQuestion('¿quién puede cubrir?');
assert.strictEqual(r, null);

// Conversacional → Nano
assert.strictEqual(routeQuestion('¿cuántas noches tiene este mes?'), null);
assert.strictEqual(routeQuestion('resume la planilla'), null);
assert.strictEqual(routeQuestion(''), null);

// Día imposible → null
assert.strictEqual(routeQuestion('quién cubre el día 45'), null);

console.log('chat-router: 11/11 OK');
