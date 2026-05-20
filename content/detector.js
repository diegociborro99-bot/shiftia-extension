(function () {
  // ====== Selectores reales de Actais (verificados con HTML del 18-may-2026) ======
  const SELECTOR_BODY = '.main-page-body';
  const SELECTOR_CALENDAR_CONTAINER = '#workerCalendarTotalContainer, #MonthTable';
  const SELECTOR_CALENDAR_CELL = '.month-calendar-cell';

  // Mapeo S_X → código interno Shiftia. S_X confirmados con HTML real del
  // calendario de Actais (Hospital de Jove). El resto son hipótesis basadas
  // en el PDF de planificación anual; ajustables conforme aparezcan.
  const SHIFT_CODE_MAP = {
    'S_1':  { code: 'M',   label: 'Mañana', reduced: false },
    'S_10': { code: 'D',   label: 'Descanso' },
    'S_30': { code: 'T',   label: 'Tarde' }
    // Hipótesis pendientes de confirmar con HTML real:
    // 'S_X': { code: 'N',   label: 'Noche' },
    // 'S_X': { code: 'M7H', label: 'Mañana 7H', reduced: true },
    // 'S_X': { code: 'M8',  label: 'Mañana 8H' },
    // 'S_X': { code: 'VAC', label: 'Vacaciones' },
    // 'S_X': { code: 'BAJ', label: 'Baja' },
    // 'S_X': { code: 'SP',  label: 'Sin Planificar' },
    // 'S_X': { code: 'CJ',  label: 'Cómputo Jornada' },
    // 'S_X': { code: 'FOR', label: 'Formación' },
    // 'S_X': { code: 'HS',  label: 'Horas Sindicales' }
  };

  // Catálogo completo de códigos válidos (espejado de shiftia-director).
  // Sirve como referencia para validación + UI.
  const VALID_SHIFTS = {
    M:    { label: 'Mañana', category: 'work', hours: null },
    M7H:  { label: 'Mañana 07:00–14:00', category: 'work', hours: 7, reduced: true },
    M8:   { label: 'Mañana 07:00–15:00', category: 'work', hours: 8 },
    M4H:  { label: 'Mañana 08:00–12:00', category: 'work', hours: 4, reduced: true },
    M6:   { label: 'Mañana 08:00–14:00', category: 'work', hours: 6, reduced: true },
    M55:  { label: 'Mañana 5,5h', category: 'work', hours: 5.5, reduced: true },
    M6R:  { label: 'Mañana 6h reducida', category: 'work', hours: 6, reduced: true },
    MR:   { label: 'Mañana reducida', category: 'work', reduced: true },
    T:    { label: 'Tarde 15:00–22:00', category: 'work', hours: 7 },
    N:    { label: 'Noche 22:00–08:00', category: 'work', hours: 10 },
    D:    { label: 'Descanso', category: 'rest' },
    L:    { label: 'Libre', category: 'rest' },
    LD:   { label: 'Libre Disposición', category: 'rest' },
    FN:   { label: 'Festivo Nacional', category: 'rest' },
    SP:   { label: 'Sin Planificar', category: 'unplanned', color: 'gray' },
    VAC:  { label: 'Vacaciones', category: 'absence' },
    VAN:  { label: 'Vacaciones arrastradas', category: 'absence' },
    VAA:  { label: 'Vacaciones Año Anterior', category: 'absence' },
    BAJ:  { label: 'Baja', category: 'absence' },
    LAC:  { label: 'Lactancia', category: 'absence' },
    AE:   { label: 'Asuntos propios', category: 'absence' },
    EX:   { label: 'Excedencia', category: 'absence' },
    PM:   { label: 'Permiso', category: 'absence' },
    MTC:  { label: 'Motivo familiar', category: 'absence' },
    CJ:   { label: 'Cómputo de Jornada', category: 'compensatory', hours: 7 },
    CAA:  { label: 'Cómputo Año Anterior', category: 'compensatory' },
    DLA:  { label: 'Días Libre Disp. Año Anterior', category: 'compensatory' },
    FOR:  { label: 'Formación', category: 'training', hours: 7 },
    HS:   { label: 'Horas Sindicales', category: 'union' },
    HF:   { label: 'Horas Festivas', category: 'work' },
    INT:  { label: 'Intervención', category: 'work' },
    IQF:  { label: 'IQF', category: 'work' },
    G17:  { label: 'Guardia 17h', category: 'guard', suffix: true },
    G24:  { label: 'Guardia 24h', category: 'guard', suffix: true }
  };

  // Fallback por texto en .schedule (cuando no hay clase S_X conocida)
  const SHIFT_TEXT_MAP = [
    { match: /noche/i,          code: 'N' },
    { match: /tarde/i,          code: 'T' },
    { match: /mañana.*07:00.*14:00/i, code: 'M7H' },
    { match: /mañana.*07:00.*15:00/i, code: 'M8' },
    { match: /mañana.*08:00.*12:00/i, code: 'M4H' },
    { match: /mañana.*08:00.*14:00/i, code: 'M6' },
    { match: /mañana.*08:00.*15:00/i, code: 'M8' },
    { match: /mañana/i,         code: 'M' },
    { match: /descans/i,        code: 'D' },
    { match: /vacac/i,          code: 'VAC' },
    { match: /libre.*dispos/i,  code: 'LD' },
    { match: /libre/i,          code: 'L' },
    { match: /baja/i,           code: 'BAJ' },
    { match: /lactanc/i,        code: 'LAC' },
    { match: /formaci/i,        code: 'FOR' },
    { match: /sindical/i,       code: 'HS' },
    { match: /computo|cómputo/i, code: 'CJ' },
    { match: /sin planif/i,     code: 'SP' }
  ];

  let lastContextSig = null;
  let menuEl = null;

  // ====== Parser de celda ======
  function parseCellElement(cellEl) {
    const idAttr = cellEl.id || '';
    // Formato esperado: "1122_27-04-2026"
    const m = idAttr.match(/^(\d+)_(\d{2})-(\d{2})-(\d{4})$/);
    let workerId = null, day = null, month = null, year = null;
    if (m) {
      workerId = m[1];
      // SARA almacena scheduleData[year-month][wId] como array 0-indexed (día 1 -> [0]).
      // Actais codifica el día como 1-31. Convertimos a 0-based aquí.
      day = parseInt(m[2], 10) - 1;
      month = parseInt(m[3], 10) - 1;
      year = parseInt(m[4], 10);
    }

    // Tipo de turno: primero por clase S_X, luego por texto .schedule.
    let shift = null, shiftLabel = null;
    const sClass = Array.from(cellEl.classList).find(c => /^S_\d+$/.test(c));
    if (sClass && SHIFT_CODE_MAP[sClass]) {
      shift = SHIFT_CODE_MAP[sClass].code;
      shiftLabel = SHIFT_CODE_MAP[sClass].label;
    } else {
      const scheduleText = cellEl.querySelector('.schedule')?.textContent?.trim() || '';
      shiftLabel = scheduleText;
      for (const m of SHIFT_TEXT_MAP) {
        if (m.match.test(scheduleText)) { shift = m.code; break; }
      }
    }

    // OVERLAY DE INCIDENCIA: Actais pinta una barra azul ARRIBA del turno
    // cuando hay VAC, BAJ, LAC, FOR, etc. La barra normalmente es un span/div
    // con el código. Si encontramos algo así, lo prioriza sobre el turno base.
    const overlayText = (
      cellEl.querySelector('.info-complete')?.textContent ||
      cellEl.querySelector('[class*="incidencia"]')?.textContent ||
      cellEl.querySelector('[class*="absence"]')?.textContent ||
      ''
    ).trim().toUpperCase();
    const upperCellText = (cellEl.textContent || '').toUpperCase();
    const OVERLAY_CODES = ['VAC', 'VAN', 'VAA', 'BAJ', 'LAC', 'FOR', 'CJ', 'CAA', 'DLA', 'HS', 'AE', 'EX', 'PM', 'MTC', 'IT'];
    for (const code of OVERLAY_CODES) {
      const re = new RegExp('\\b' + code + '\\b');
      if (re.test(overlayText) || re.test(upperCellText)) {
        shift = code;
        shiftLabel = (VALID_SHIFTS[code]?.label || code) + ' (overlay sobre ' + (shiftLabel || '?') + ')';
        break;
      }
    }

    const scheduleFull = cellEl.querySelector('.schedule')?.textContent?.trim() || '';
    const planification = cellEl.querySelector('.planification')?.textContent?.trim() || '';
    const punchText = cellEl.querySelector('.p2 .move')?.textContent?.trim() || '';
    const idProgrammed = cellEl.getAttribute('idprogrammedcalendar') || null;

    return {
      workerId, day, month, year,
      shift, shiftLabel, scheduleFull, planification, punchText,
      idProgrammedCalendar: idProgrammed,
      cellId: idAttr
    };
  }

  function detectWorkerName() {
    // ORDEN: primero el calendario del trabajador visualizado (modal/árbol),
    // y solo como último recurso la cabecera "Bienvenido, …" del shell de
    // Actais — ésta es el supervisor logueado, no el trabajador examinado.

    // 1. Cabecera del modal "Calendario del empleado" (visor de gestión).
    const calendarHeader = document.querySelector(
      '#workerCalendarTotalContainer .modal-title, ' +
      '#workerCalendarTotalContainer h3, ' +
      '#workerCalendarTotalContainer h4, ' +
      '#workerCalendarTotalContainer [class*="header"], ' +
      '.modal-header .modal-title'
    );
    if (calendarHeader) {
      const text = calendarHeader.textContent.trim();
      if (text && !/calendario|empleado|trabajador/i.test(text) && text.length < 80) return text;
    }

    // 2. Item seleccionado en el árbol/lista de empleados.
    const selectedEmployee = document.querySelector(
      '.dx-treeview-node.dx-state-selected .dx-treeview-item, ' +
      '.tree-employee.selected, ' +
      '[class*="employee"][class*="selected"], ' +
      'li.selected[id*="emp"], ' +
      'li.ui-state-active'
    );
    if (selectedEmployee) {
      const t = selectedEmployee.textContent.trim();
      if (t && t.length < 80) return t;
    }

    // 3. Selectores genéricos legacy (rótulo dentro del propio calendario).
    const header = document.querySelector(
      '[id*="lblWorkerName"], [id*="WorkerName"], .worker-name-header, .employee-name'
    );
    if (header) {
      const t = header.textContent.trim();
      if (t && t.length < 80) return t;
    }

    // 4. Title.
    const tm = document.title.match(/([A-ZÁÉÍÓÚÑ]+,\s*[A-ZÁÉÍÓÚÑ ]+)/);
    if (tm) return tm[1].trim();

    // 5. Cabecera "Bienvenido, …" del shell — sólo cuando el propio
    //    trabajador mira su calendario. Cae aquí porque normalmente es el
    //    supervisor el que está usando la extensión.
    const shellHeader = document.querySelector('#welcome-msg, #lblWelcome, .welcome-message');
    if (shellHeader) {
      const m = shellHeader.textContent.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]+,\s*[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]+)/);
      if (m) return m[1].trim();
    }

    // 6. Último recurso: regex sobre el body.
    const bodyText = (document.body?.innerText || '').slice(0, 4000);
    const welcomeMatch = bodyText.match(/Bienvenido,\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+,\s*[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+?)(?=\s*\(|\s*\n)/);
    if (welcomeMatch) return welcomeMatch[1].trim();
    const generalMatch = bodyText.match(/\b([A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,4},\s*[A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,})?)\b/);
    if (generalMatch) return generalMatch[1].trim();

    return null;
  }

  function detectModule() {
    const menu = document.querySelector('#cssmenu .selected, #cssmenu .active');
    return menu?.textContent?.trim() || document.title || null;
  }

  function readContext() {
    return {
      url: location.href,
      module: detectModule(),
      worker: detectWorkerName(),
      hasCalendar: !!document.querySelector(SELECTOR_CALENDAR_CONTAINER),
      cellsCount: document.querySelectorAll(SELECTOR_CALENDAR_CELL).length
    };
  }

  function broadcastContext() {
    const ctx = readContext();
    const sig = JSON.stringify(ctx);
    if (sig === lastContextSig) return;
    lastContextSig = sig;
    chrome.runtime.sendMessage({ type: 'actais:context', payload: ctx }).catch(() => {});
  }

  // ====== Menú contextual flotante ======
  // `targetShift` se inyecta en el payload cuando la acción lo implica
  // (vacaciones → VAC, librar → L). El backend lo usa para saber el destino.
  const MENU_ACTIONS = [
    { id: 'librar',           label: '🆓 Librar este día',       group: 'ai',   targetShift: 'L' },
    { id: 'whoCovers',        label: '👥 ¿Quién cubre?',          group: 'ai' },
    { id: 'vacaciones',       label: '🏖️ Marcar vacaciones',     group: 'ai',   targetShift: 'VAC' },
    { id: 'cambio',           label: '🔁 Proponer cambio',        group: 'ai',   promptTarget: true },
    { id: 'validateConvenio', label: '⚖️ Validar convenio',       group: 'ai' },
    { id: 'alternativas',     label: '🧠 Alternativas IA',         group: 'ai' },
    { id: 'syncCellChange',   label: '📥 Volcar cambio sin IA a Shiftia', group: 'sync' }
  ];

  // Códigos sugeridos para el prompt rápido de "proponer cambio".
  const QUICK_TARGETS = ['M', 'T', 'N', 'D', 'L', 'LD', 'VAC', 'BAJ', 'CJ', 'FOR'];

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }

  function openMenu(x, y, cell) {
    closeMenu();
    menuEl = document.createElement('div');
    menuEl.className = 'shiftia-ctx-menu';
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;

    const dateStr = (cell.day != null && cell.month != null && cell.year)
      ? `${String(cell.day + 1).padStart(2, '0')}/${String(cell.month + 1).padStart(2, '0')}/${cell.year}`
      : 'fecha ?';

    const header = document.createElement('div');
    header.className = 'shiftia-ctx-header';
    header.textContent = `Worker ${cell.workerId || '?'} · ${dateStr} · ${cell.shift || cell.shiftLabel || '—'}`;
    menuEl.appendChild(header);

    if (cell.planification) {
      const sub = document.createElement('div');
      sub.className = 'shiftia-ctx-sub';
      sub.textContent = cell.planification;
      menuEl.appendChild(sub);
    }

    // Acciones IA (deterministas, sobre la planilla interna)
    MENU_ACTIONS.filter(a => a.group === 'ai').forEach((act) => {
      const btn = document.createElement('button');
      btn.className = 'shiftia-ctx-btn';
      btn.textContent = act.label;
      btn.addEventListener('click', () => handleActionClick(act, cell));
      menuEl.appendChild(btn);
    });

    // Separador visual + acción de sincronización sin IA
    const sep = document.createElement('div');
    sep.className = 'shiftia-ctx-sep';
    sep.textContent = 'Sincronización';
    menuEl.appendChild(sep);

    MENU_ACTIONS.filter(a => a.group === 'sync').forEach((act) => {
      const btn = document.createElement('button');
      btn.className = 'shiftia-ctx-btn shiftia-ctx-btn-sync';
      btn.textContent = act.label;
      btn.addEventListener('click', () => handleActionClick(act, cell));
      menuEl.appendChild(btn);
    });

    const close = document.createElement('button');
    close.className = 'shiftia-ctx-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Cerrar menú');
    close.addEventListener('click', closeMenu);
    menuEl.appendChild(close);

    const footer = document.createElement('div');
    footer.className = 'shiftia-ctx-footer';
    footer.innerHTML = 'vibecoded by <a href="https://highkeylabs.es" target="_blank" rel="noopener">Highkey Labs</a>';
    menuEl.appendChild(footer);

    document.body.appendChild(menuEl);

    // Reposicionar si se sale del viewport
    const rect = menuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) menuEl.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menuEl.style.top = `${window.innerHeight - rect.height - 8}px`;
  }

  function ensureResultEl() {
    let result = menuEl?.querySelector('.shiftia-ctx-result');
    if (!result) {
      result = document.createElement('div');
      result.className = 'shiftia-ctx-result';
      menuEl?.appendChild(result);
    }
    return result;
  }

  async function handleActionClick(act, baseCell) {
    const result = ensureResultEl();
    let cell = { ...baseCell };

    // Si la acción requiere un destino (cambio), abrir mini-prompt inline.
    if (act.promptTarget) {
      result.innerHTML = '<strong>¿A qué turno?</strong><div class="shiftia-ctx-targets"></div>';
      const targets = result.querySelector('.shiftia-ctx-targets');
      QUICK_TARGETS.forEach((code) => {
        const t = document.createElement('button');
        t.className = 'shiftia-ctx-target';
        t.textContent = code;
        t.addEventListener('click', () => {
          cell.targetShift = code;
          runAction(act.id, cell);
        });
        targets.appendChild(t);
      });
      return;
    }

    if (act.targetShift) cell.targetShift = act.targetShift;
    runAction(act.id, cell);
  }

  async function runAction(actionId, cell) {
    const result = ensureResultEl();
    result.textContent = actionId === 'syncCellChange' ? 'Volcando…' : 'Consultando…';
    const res = await chrome.runtime.sendMessage({
      type: 'shiftia:askEngine',
      payload: { action: actionId, args: cell }
    }).catch((e) => ({ ok: false, error: e.message }));
    if (!res?.ok) {
      const hint = res?.status === 404
        ? '<br><small>El endpoint todavía no está activo en el backend.</small>'
        : '';
      result.innerHTML = `<span class="shiftia-ctx-err">${escapeHtml(res?.error || 'Error inesperado')}</span>${hint}`;
      return;
    }
    const banner = res.local
      ? '<div class="shiftia-ctx-local">⚙️ motor local — backend offline o sin endpoint</div>'
      : '';
    result.innerHTML = banner + formatResult(res.data, actionId);
  }

  function formatResult(data, actionId) {
    if (data == null) return '<em>Sin datos</em>';
    if (typeof data === 'string') return escapeHtml(data);
    if (actionId === 'syncCellChange' || data.synced) {
      const before = data.before ? `<div><small>antes:</small> <b>${escapeHtml(data.before)}</b></div>` : '';
      const after = data.after ? `<div><small>después:</small> <b>${escapeHtml(data.after)}</b></div>` : '';
      return `<strong style="color:#0f7a6d">✓ Cambio volcado en Shiftia</strong>${before}${after}`;
    }
    if (data.candidates && Array.isArray(data.candidates)) {
      const filteredNote = data.filteredOut
        ? `<div class="shiftia-ctx-filtered">filtros duros: ${escapeHtml(data.filteredOut)}</div>`
        : '';
      if (data.candidates.length === 0) return `<em>Ningún candidato compatible</em>${filteredNote}`;
      return '<strong>Top candidatos:</strong><ul>' +
        data.candidates.map(c => `<li><b>${escapeHtml(c.name)}</b> · score ${c.score}${c.crossPlant ? ' · <span style="color:#8b5cf6">cross-plant</span>' : ''}<br><small>${escapeHtml((c.breakdown || []).join(', '))}</small></li>`).join('') +
        '</ul>' + filteredNote;
    }
    if (data.reasons && Array.isArray(data.reasons)) {
      const status = data.legal === false ? '<span class="shiftia-ctx-err">No legal</span>' : '<span style="color:#0f7a6d">Cumple</span>';
      return `${status}<ul>${data.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
    }
    if (data.message || data.text) {
      return `<div>${escapeHtml(data.message || data.text)}</div>`;
    }
    return '<pre>' + escapeHtml(JSON.stringify(data, null, 2)) + '</pre>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ====== Wiring ======
  function init() {
    const body = document.querySelector(SELECTOR_BODY) || document.body;
    if (!body) { setTimeout(init, 500); return; }

    const observer = new MutationObserver(() => {
      clearTimeout(window.__shiftiaDebounce);
      window.__shiftiaDebounce = setTimeout(broadcastContext, 250);
    });
    observer.observe(body, { childList: true, subtree: true, characterData: true });

    // Delegated click sobre celdas reales del calendario de Actais.
    // Alt+click para no interferir con la selección/edición nativa.
    document.addEventListener('click', (ev) => {
      const cellEl = ev.target.closest(SELECTOR_CALENDAR_CELL);
      if (!cellEl) return;
      if (!ev.altKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      const cell = parseCellElement(cellEl);
      cell.worker = detectWorkerName();
      openMenu(ev.pageX, ev.pageY, cell);
    }, true);

    document.addEventListener('click', (ev) => {
      if (menuEl && !menuEl.contains(ev.target) && !ev.target.closest(SELECTOR_CALENDAR_CELL)) {
        closeMenu();
      }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closeMenu();
    });

    broadcastContext();
    injectPageBridge();
  }

  function injectPageBridge() {
    const url = chrome.runtime.getURL('content/page-bridge.js');
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
