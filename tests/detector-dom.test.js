// Integración: detector.js contra el DOM REAL de Actais (HTML del 12-jun-2026).
// Carga jsdom, monta 30 celdas reales (VAC como .slot.absence en .p3, código
// como clase), árbol easyui con .tree-node-selected, y ejecuta el handler de
// 'actais:scrapeMonth' tal y como lo invocaría el service worker.
const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

function cellHtml(day, opts) {
  // Modelado del markup real: clase S_X en la celda, ausencia en .p3
  const { sClass, schedule, vac, firstVac, otherMonth } = opts;
  const dd = String(day).padStart(2, '0');
  const p3 = vac
    ? `<div class="p3 has-absence"><div id="absence_${dd}-06-2026_91933" class="slot ProgInc absence abs-long absence_91933 middle-slot ${firstVac ? 'first-slot ' : ''}Inc_91933 VAC">${firstVac ? '<span class="fa fa-sun-o"></span><span style="margin-left: 3px">VAC</span>' : ''}</div></div>`
    : '<div class="p3"></div>';
  return `<div id="1122_${dd}-06-2026" class="month-calendar-cell cssClass ${otherMonth ? 'other-month ' : ''}with-contract ${sClass} Status_10" data-item="${day}" idprogrammedcalendar="43055${day}">
    <div class="p1"><div class="schedule">${schedule}</div><div class="day"><span>${day}</span></div><div class="planification" style="display:none">Cuadrante</div></div>
    <div class="p2"><div class="punches-container"></div><div class="info-complete" hidden></div></div>${p3}</div>`;
}

let cells = '';
for (let d = 1; d <= 30; d++) {
  const isVac = d >= 3 && d <= 10;
  const isRest = [1, 2, 6, 7, 13, 14, 20, 21, 27, 28].includes(d);
  cells += cellHtml(d, {
    sClass: isRest ? 'S_10' : (d === 26 ? 'S_30' : 'S_1'),
    schedule: isRest ? 'Descanso' : (d === 26 ? 'Tardes 15:00 - 22:00' : 'Mañanas 08:00 - 15:00'),
    vac: isVac, firstVac: d === 3
  });
}
// Celda de julio (other-month) que NO debe colarse
cells += cellHtml(1, { sClass: 'S_34', schedule: 'Noches 22:00 - 08:00', otherMonth: true }).replace('1122_01-06-2026', '1122_01-07-2026');

const html = `<!DOCTYPE html><html><body><div class="main-page-body">
  <div class="tree tree-lines">
    <div class="tree-node"><span class="tree-title">AVANZAS FERNANDEZ, SARA</span></div>
    <div class="tree-node tree-node-selected"><span class="tree-icon tree-file i-worker"></span><span class="tree-title">CIBORRO GONZALEZ, DIEGO</span></div>
  </div>
  <div id="workerCalendarTotalContainer"><div id="MonthTable">${cells}</div></div>
</body></html>`;

const dom = new JSDOM(html, { url: 'https://personal.hospitaldejove.com/Home.aspx' });

// Globals que detector.js espera
global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;
global.MutationObserver = dom.window.MutationObserver;
global.self = dom.window;

// ShiftiaShared en el "mundo" del content script
dom.window.ShiftiaShared = Object.assign({},
  require('../shared/month-assembler'),
  require('../shared/absence-overlay'));

// Stub de chrome
let scrapeListener = null;
global.chrome = {
  runtime: {
    sendMessage: () => Promise.resolve({}),
    getURL: (p) => 'chrome-extension://test/' + p,
    onMessage: { addListener: (fn) => { if (!scrapeListener) scrapeListener = fn; } }
  }
};

// Ejecutar detector.js
eval(fs.readFileSync(path.join(__dirname, '../content/detector.js'), 'utf8'));
assert.ok(scrapeListener, 'detector debe registrar onMessage');

// Pedir el scrape como lo haría el SW
let result = null;
scrapeListener({ type: 'actais:scrapeMonth' }, null, (res) => { result = res; });

assert.strictEqual(result.ok, true, JSON.stringify(result));
assert.strictEqual(result.workerId, '1122');
assert.strictEqual(result.year, 2026);
assert.strictEqual(result.month, 5, 'junio (0-based)');
assert.strictEqual(result.workerName, 'CIBORRO GONZALEZ, DIEGO', 'nombre del nodo seleccionado del árbol');
// VAC del 3 al 10, incluidas continuaciones SIN texto
for (let d = 3; d <= 10; d++) assert.strictEqual(result.cells[d - 1], 'VAC', `día ${d} debe ser VAC`);
assert.strictEqual(result.cells[0], 'D');
assert.strictEqual(result.cells[11], 'M', 'día 12 trabaja');
assert.strictEqual(result.cells[25], 'T', 'día 26 tarde');
assert.strictEqual(result.cells[30], '', 'día 31 no existe en junio');
assert.strictEqual(result.stats.absenceDays, 8);
assert.strictEqual(result.stats.daysSeen, 30, 'la celda de julio (other-month) no cuenta');

// ===== Bridge: el estado interno de Actais manda sobre las heurísticas =====
function sendBridge(payload) {
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    data: { source: 'shiftia-bridge', type: 'selectedWorker', payload }, source: dom.window
  }));
}

// id del bridge CASA con las celdas (1122) → nombre oficial del árbol
sendBridge({ id: 'w_1122', text: 'AZPIROZ FERNANDEZ, SOLEDAD' });
result = null;
scrapeListener({ type: 'actais:scrapeMonth' }, null, (res) => { result = res; });
assert.strictEqual(result.workerName, 'AZPIROZ FERNANDEZ, SOLEDAD', 'nombre del bridge con id coincidente');

// id del bridge NO casa (árbol apunta a otro worker) → fallback DOM (.tree-node-selected)
sendBridge({ id: 'w_9999', text: 'VALLE GARCIA, MARTA' });
result = null;
scrapeListener({ type: 'actais:scrapeMonth' }, null, (res) => { result = res; });
assert.strictEqual(result.workerName, 'CIBORRO GONZALEZ, DIEGO', 'mismatch de id cae al DOM');

// nodo de departamento seleccionado (sin coma) → bridge null → fallback DOM
sendBridge({ id: 'dep_4', text: 'HEMATOLOGIA' });
result = null;
scrapeListener({ type: 'actais:scrapeMonth' }, null, (res) => { result = res; });
assert.strictEqual(result.workerName, 'CIBORRO GONZALEZ, DIEGO');

console.log('detector-dom: OK (worker, VAC 3-10, S_X, other-month, bridge x3)');
