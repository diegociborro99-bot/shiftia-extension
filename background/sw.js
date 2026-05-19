const SHIFTIA_API_BASE = 'https://shiftia-production.up.railway.app';

// Mapeo de acciones del menú flotante a los endpoints reales del backend
// shiftia/server.js. Las claves son los `id` de MENU_ACTIONS en content/detector.js,
// los valores son el path tras `/api/assistant/`.
const ACTION_ENDPOINT = {
  librar:           'canChange',
  whoCovers:        'suggestReplacement',
  vacaciones:       'markVacation',
  cambio:           'proposeChange',
  validateConvenio: 'validateConvenio',
  alternativas:     'aiAlternatives'
};

let lastContext = null;
let cachedData = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function workerCount(d) {
  return (d?.workerMeta?.length) || (d?.workers?.length) || 0;
}

// Normaliza la celda que viene del content script para enviar al backend con
// fechas tanto 0-indexed (storage SARA) como 1-indexed (humano) e ISO.
function normalizeCellPayload(cell) {
  if (!cell || typeof cell !== 'object') return {};
  const out = { ...cell };
  if (cell.day != null && cell.month != null && cell.year) {
    const d1 = cell.day + 1;
    const m1 = cell.month + 1;
    out.day1Based = d1;
    out.month1Based = m1;
    out.dateISO = `${cell.year}-${String(m1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
    out.dateHuman = `${String(d1).padStart(2, '0')}/${String(m1).padStart(2, '0')}/${cell.year}`;
  }
  return out;
}

function describeHttpError(res, body) {
  if (res.status === 404) return 'Función pendiente de desplegar en el backend (404).';
  if (res.status === 403) return 'Sin permiso para esta acción (403).';
  if (res.status === 500) return 'Error interno del backend (500). Revisa logs de Shiftia.';
  if (body && body.error) return body.error;
  return `Error ${res.status}`;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg?.type) {
    case 'actais:context':
      lastContext = { ...msg.payload, tabId: sender.tab?.id, ts: Date.now() };
      chrome.runtime.sendMessage({ type: 'panel:context', payload: lastContext }).catch(() => {});
      sendResponse({ ok: true });
      return true;

    case 'panel:requestContext':
      sendResponse({ ok: true, payload: lastContext });
      return true;

    case 'shiftia:askEngine':
      askEngine(msg.payload).then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case 'shiftia:syncNow':
      syncShiftiaData(true).then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case 'shiftia:setToken':
      chrome.storage.local.set({ shiftiaToken: msg.payload.token }).then(() => sendResponse({ ok: true }));
      return true;

    case 'shiftia:uploadPdfs':
      uploadPdfs(msg.payload).then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case 'shiftia:syncCell':
      syncCell(msg.payload).then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case 'shiftia:health':
      backendHealth().then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    default:
      return false;
  }
});

async function getToken() {
  return (await chrome.storage.local.get('shiftiaToken')).shiftiaToken;
}

async function syncShiftiaData(force = false) {
  const token = await getToken();
  if (!token) return { ok: false, error: 'Sin sesión Shiftia' };
  const now = Date.now();
  if (!force && cachedData && now - cachedAt < CACHE_TTL_MS) {
    return { ok: true, data: { workers: workerCount(cachedData), fromCache: true } };
  }
  const res = await fetch(`${SHIFTIA_API_BASE}/api/data`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  cachedData = await res.json();
  cachedAt = now;
  await chrome.storage.local.set({ shiftiaData: cachedData, shiftiaDataAt: cachedAt });
  return { ok: true, data: { workers: workerCount(cachedData), fromCache: false } };
}

async function askEngine({ action, args }) {
  // Si la acción es "syncCellChange", desviar al endpoint dedicado de sync
  // (no es una acción de asistente IA, es una escritura directa).
  if (action === 'syncCellChange') {
    return syncCell(args);
  }

  // Lazy sync para que la primera consulta cargue los datos si no están
  if (!cachedData) {
    const restored = await chrome.storage.local.get(['shiftiaData', 'shiftiaDataAt']);
    if (restored.shiftiaData) {
      cachedData = restored.shiftiaData;
      cachedAt = restored.shiftiaDataAt;
    }
  }
  const token = await getToken();
  if (!token) return { ok: false, error: 'Inicia sesión desde el panel lateral' };

  const endpoint = ACTION_ENDPOINT[action] || action;
  const url = `${SHIFTIA_API_BASE}/api/assistant/${endpoint}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action,
        cell: normalizeCellPayload(args),
        context: lastContext,
        dataSnapshot: cachedData ? { at: cachedAt, hasData: true } : null
      })
    });
  } catch (e) {
    return { ok: false, error: `Red caída o backend inaccesible: ${e.message}` };
  }
  if (res.status === 401) {
    await chrome.storage.local.remove(['shiftiaToken', 'shiftiaData', 'shiftiaDataAt']);
    cachedData = null; cachedAt = 0;
    chrome.runtime.sendMessage({ type: 'panel:sessionExpired' }).catch(() => {});
    return { ok: false, error: 'Sesión caducada. Vuelve a iniciar sesión en el panel lateral.' };
  }
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch (_) {}
    return { ok: false, error: describeHttpError(res, body), status: res.status };
  }
  return { ok: true, data: await res.json() };
}

// Volcado directo de un cambio de celda en Shiftia (sin pasar por IA).
// Envía la celda parseada (con shift, workerId, fecha) al endpoint de sync.
async function syncCell(cell) {
  const token = await getToken();
  if (!token) return { ok: false, error: 'Inicia sesión antes de volcar cambios' };
  const payload = normalizeCellPayload(cell);
  let res;
  try {
    res = await fetch(`${SHIFTIA_API_BASE}/api/shifts/sync-cell`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ cell: payload, context: lastContext })
    });
  } catch (e) {
    return { ok: false, error: `Red caída o backend inaccesible: ${e.message}` };
  }
  if (res.status === 401) {
    chrome.runtime.sendMessage({ type: 'panel:sessionExpired' }).catch(() => {});
    return { ok: false, error: 'Sesión caducada' };
  }
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch (_) {}
    return { ok: false, error: describeHttpError(res, body), status: res.status };
  }
  // Invalidar cache porque cambió el estado de la planilla
  cachedData = null; cachedAt = 0;
  return { ok: true, data: await res.json() };
}

// Health-check ligero: comprueba que el backend responde sin auth.
async function backendHealth() {
  try {
    const res = await fetch(`${SHIFTIA_API_BASE}/api/health`, { method: 'GET' });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Sube una lista de PDFs serializados (Uint8Array transferidos) al backend
// como multipart/form-data. El backend hace el parsing y merge.
async function uploadPdfs({ files }) {
  const token = await getToken();
  if (!token) return { ok: false, error: 'Inicia sesión antes de importar' };
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: 'Sin archivos' };

  const form = new FormData();
  for (const f of files) {
    const blob = new Blob([new Uint8Array(f.data)], { type: 'application/pdf' });
    form.append('files', blob, f.name);
  }
  const res = await fetch(`${SHIFTIA_API_BASE}/api/import/pdf-upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });
  if (res.status === 401) {
    chrome.runtime.sendMessage({ type: 'panel:sessionExpired' }).catch(() => {});
    return { ok: false, error: 'Sesión caducada' };
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const body = await res.json(); if (body.error) msg = body.error; } catch (_) {}
    return { ok: false, error: msg };
  }
  const body = await res.json();
  // Invalidar cache para que la próxima consulta refresque
  cachedData = null; cachedAt = 0;
  return { ok: true, data: body };
}
