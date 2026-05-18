(function () {
  const SELECTOR_BODY = '.main-page-body';
  // Selectores AJUSTABLES cuando Diego nos pase el HTML real del calendario:
  const SELECTOR_CALENDAR_CELL = [
    '.dx-datagrid .dx-data-row td',     // DevExtreme grid (probable)
    'table.calendar td',                 // tabla genérica
    '.fc-daygrid-day',                   // FullCalendar fallback
    '[data-shiftia-cell]'                // hook manual de pruebas
  ].join(', ');

  const SELECTOR_WORKER_HEADER = '[id*="lblWorkerName"], [id*="WorkerName"], .worker-name-header';

  let lastContextSig = null;
  let menuEl = null;

  // ====== Context detection ======
  function detectModule() {
    const menu = document.querySelector('#cssmenu .selected, #cssmenu .active');
    return menu?.textContent?.trim() || null;
  }

  function detectWorker() {
    const header = document.querySelector(SELECTOR_WORKER_HEADER);
    if (header) return header.textContent.trim();
    const m = document.title.match(/([A-ZÁÉÍÓÚÑ ]+),\s*([A-ZÁÉÍÓÚÑ ]+)/);
    return m ? `${m[1]}, ${m[2]}` : null;
  }

  function readContext() {
    return { url: location.href, module: detectModule(), worker: detectWorker() };
  }

  function broadcastContext() {
    const ctx = readContext();
    const sig = JSON.stringify(ctx);
    if (sig === lastContextSig) return;
    lastContextSig = sig;
    chrome.runtime.sendMessage({ type: 'actais:context', payload: ctx }).catch(() => {});
  }

  // ====== Day cell parser (placeholder, ajustable con HTML real) ======
  function parseCellFromEvent(target) {
    // Sube por el árbol buscando atributos pista (fecha, worker, turno)
    let el = target;
    let date = null, shift = null, workerHint = null;
    for (let i = 0; i < 8 && el && el !== document; i++) {
      date = date || el.getAttribute?.('data-date') || el.getAttribute?.('data-day');
      shift = shift || el.getAttribute?.('data-shift') || el.getAttribute?.('data-turno');
      workerHint = workerHint || el.getAttribute?.('data-worker') || el.getAttribute?.('data-empleado');
      if (date && shift) break;
      el = el.parentElement;
    }
    // Fallback: deducir del título del PDF + texto de la celda
    if (!date) {
      const txt = target.textContent?.trim() || '';
      const dayMatch = txt.match(/\b([0-3]?\d)\b/);
      if (dayMatch) date = `day-${dayMatch[1]}`;
    }
    if (!shift) {
      const txt = target.textContent?.toLowerCase() || '';
      if (txt.includes('mañana')) shift = 'M';
      else if (txt.includes('tarde')) shift = 'T';
      else if (txt.includes('noche')) shift = 'N';
      else if (txt.includes('descans')) shift = 'D';
    }
    return { date, shift, workerHint, worker: detectWorker() };
  }

  // ====== Floating contextual menu ======
  const MENU_ACTIONS = [
    { id: 'librar',           label: '🆓 Librar este día' },
    { id: 'whoCovers',        label: '👥 ¿Quién cubre?' },
    { id: 'vacaciones',       label: '🏖️ Marcar vacaciones' },
    { id: 'cambio',           label: '🔁 Proponer cambio' },
    { id: 'validateConvenio', label: '⚖️ Validar convenio' },
    { id: 'alternativas',     label: '🧠 Alternativas IA' }
  ];

  function closeMenu() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
  }

  function openMenu(x, y, cell) {
    closeMenu();
    menuEl = document.createElement('div');
    menuEl.className = 'shiftia-ctx-menu';
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;

    const header = document.createElement('div');
    header.className = 'shiftia-ctx-header';
    header.textContent = `${cell.worker || 'Trabajador ?'} · ${cell.date || 'día ?'} · ${cell.shift || '—'}`;
    menuEl.appendChild(header);

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

    // Posicionamiento defensivo si se sale del viewport
    const rect = menuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) menuEl.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menuEl.style.top = `${window.innerHeight - rect.height - 8}px`;
  }

  async function runAction(actionId, cell) {
    const body = menuEl?.querySelector('.shiftia-ctx-result') || (() => {
      const d = document.createElement('div');
      d.className = 'shiftia-ctx-result';
      menuEl?.appendChild(d);
      return d;
    })();
    body.textContent = 'Consultando…';
    const res = await chrome.runtime.sendMessage({
      type: 'shiftia:askEngine',
      payload: { action: actionId, args: cell }
    }).catch((e) => ({ ok: false, error: e.message }));
    if (!res?.ok) {
      body.innerHTML = `<span class="shiftia-ctx-err">${res?.error || 'Error'}</span>`;
      return;
    }
    body.innerHTML = formatResult(res.data);
  }

  function formatResult(data) {
    if (data == null) return '<em>Sin datos</em>';
    if (typeof data === 'string') return escapeHtml(data);
    if (Array.isArray(data)) {
      return '<ul>' + data.map((d) => `<li>${escapeHtml(typeof d === 'string' ? d : JSON.stringify(d))}</li>`).join('') + '</ul>';
    }
    return '<pre>' + escapeHtml(JSON.stringify(data, null, 2)) + '</pre>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ====== Wiring ======
  function init() {
    const body = document.querySelector(SELECTOR_BODY);
    if (!body) {
      setTimeout(init, 500);
      return;
    }

    const observer = new MutationObserver(() => {
      clearTimeout(window.__shiftiaDebounce);
      window.__shiftiaDebounce = setTimeout(broadcastContext, 250);
    });
    observer.observe(body, { childList: true, subtree: true, characterData: true });

    // Delegated click sobre celdas del calendario
    body.addEventListener('click', (ev) => {
      const cellTarget = ev.target.closest(SELECTOR_CALENDAR_CELL);
      if (!cellTarget) return;
      // Atajo: solo abrir si el usuario hace Alt+click (evita interferir con el flujo normal de Actais)
      if (!ev.altKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      const cell = parseCellFromEvent(cellTarget);
      openMenu(ev.pageX, ev.pageY, cell);
    }, true);

    // Cerrar menú al hacer click fuera o pulsar Esc
    document.addEventListener('click', (ev) => {
      if (menuEl && !menuEl.contains(ev.target)) closeMenu();
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
