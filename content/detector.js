(function () {
  // ====== Selectores reales de Actais (verificados con HTML del 18-may-2026) ======
  const SELECTOR_BODY = '.main-page-body';
  const SELECTOR_CALENDAR_CONTAINER = '#workerCalendarTotalContainer, #MonthTable';
  const SELECTOR_CALENDAR_CELL = '.month-calendar-cell';

  // Mapeo S_X → código interno Shiftia
  const SHIFT_CODE_MAP = {
    'S_1':  { code: 'M',   label: 'Mañanas' },
    'S_10': { code: 'D',   label: 'Descanso' },
    'S_30': { code: 'T',   label: 'Tardes' },
    'S_40': { code: 'N',   label: 'Noches' },     // hipotético, ajustable
    'S_50': { code: 'VAC', label: 'Vacaciones' }, // hipotético
    'S_60': { code: 'BAJ', label: 'Baja' }        // hipotético
  };

  // Fallback por texto
  const SHIFT_TEXT_MAP = [
    { match: /mañana/i,  code: 'M' },
    { match: /tarde/i,   code: 'T' },
    { match: /noche/i,   code: 'N' },
    { match: /descans/i, code: 'D' },
    { match: /vacac/i,   code: 'VAC' },
    { match: /baja/i,    code: 'BAJ' },
    { match: /libre/i,   code: 'L' }
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
      day = parseInt(m[2], 10);
      month = parseInt(m[3], 10) - 1;
      year = parseInt(m[4], 10);
    }

    // Tipo de turno: primero por clase S_X, luego por texto .schedule
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
    // El title de la página: "ACTAIS - Mi calendario" no trae nombre.
    // Buscar header del modal de empleado u otros sitios típicos.
    const header = document.querySelector('[id*="lblWorkerName"], [id*="WorkerName"], .worker-name-header, .employee-name');
    if (header) return header.textContent.trim();
    // Fallback: si el title tiene patrón "APELLIDOS, NOMBRE"
    const tm = document.title.match(/([A-ZÁÉÍÓÚÑ ]+),\s*([A-ZÁÉÍÓÚÑ ]+)/);
    return tm ? `${tm[1]}, ${tm[2]}` : null;
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
  const MENU_ACTIONS = [
    { id: 'librar',           label: '🆓 Librar este día' },
    { id: 'whoCovers',        label: '👥 ¿Quién cubre?' },
    { id: 'vacaciones',       label: '🏖️ Marcar vacaciones' },
    { id: 'cambio',           label: '🔁 Proponer cambio' },
    { id: 'validateConvenio', label: '⚖️ Validar convenio' },
    { id: 'alternativas',     label: '🧠 Alternativas IA' }
  ];

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }

  function openMenu(x, y, cell) {
    closeMenu();
    menuEl = document.createElement('div');
    menuEl.className = 'shiftia-ctx-menu';
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;

    const dateStr = (cell.day && cell.month != null && cell.year)
      ? `${String(cell.day).padStart(2, '0')}/${String(cell.month + 1).padStart(2, '0')}/${cell.year}`
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

    MENU_ACTIONS.forEach((act) => {
      const btn = document.createElement('button');
      btn.className = 'shiftia-ctx-btn';
      btn.textContent = act.label;
      btn.addEventListener('click', () => runAction(act.id, cell));
      menuEl.appendChild(btn);
    });

    const close = document.createElement('button');
    close.className = 'shiftia-ctx-close';
    close.textContent = '×';
    close.addEventListener('click', closeMenu);
    menuEl.appendChild(close);

    document.body.appendChild(menuEl);

    // Reposicionar si se sale del viewport
    const rect = menuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) menuEl.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menuEl.style.top = `${window.innerHeight - rect.height - 8}px`;
  }

  async function runAction(actionId, cell) {
    let result = menuEl?.querySelector('.shiftia-ctx-result');
    if (!result) {
      result = document.createElement('div');
      result.className = 'shiftia-ctx-result';
      menuEl?.appendChild(result);
    }
    result.textContent = 'Consultando…';
    const res = await chrome.runtime.sendMessage({
      type: 'shiftia:askEngine',
      payload: { action: actionId, args: cell }
    }).catch((e) => ({ ok: false, error: e.message }));
    if (!res?.ok) {
      result.innerHTML = `<span class="shiftia-ctx-err">${escapeHtml(res?.error || 'Error inesperado')}</span>`;
      return;
    }
    result.innerHTML = formatResult(res.data);
  }

  function formatResult(data) {
    if (data == null) return '<em>Sin datos</em>';
    if (typeof data === 'string') return escapeHtml(data);
    if (data.candidates && Array.isArray(data.candidates)) {
      if (data.candidates.length === 0) return '<em>Ningún candidato</em>';
      return '<strong>Top candidatos:</strong><ul>' +
        data.candidates.map(c => `<li><b>${escapeHtml(c.name)}</b> · score ${c.score}${c.crossPlant ? ' · <span style="color:#8b5cf6">cross-plant</span>' : ''}<br><small>${escapeHtml((c.breakdown || []).join(', '))}</small></li>`).join('') +
        '</ul>';
    }
    if (data.reasons && Array.isArray(data.reasons)) {
      const status = data.legal === false ? '<span class="shiftia-ctx-err">No legal</span>' : '<span style="color:#0f7a6d">Cumple</span>';
      return `${status}<ul>${data.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
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
