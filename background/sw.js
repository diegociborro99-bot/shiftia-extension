const SHIFTIA_API_BASE = 'https://shiftia-production.up.railway.app';

let lastContext = null;
let cachedData = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function workerCount(d) {
  return (d?.workerMeta?.length) || (d?.workers?.length) || 0;
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

    case 'panel:getLongAbsences':
      getLongAbsences().then(sendResponse).catch(() => sendResponse({ ok: true, absences: [] }));
      return true;

    case 'panel:scrapeMonth':
      scrapeActaisTab().then(sendResponse).catch((err) => sendResponse({ ok: false, error: err.message }));
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

    default:
      return false;
  }
});

// Pide a la pestaña de Actais el scrape del mes visible (content/detector.js).
async function scrapeActaisTab() {
  // 1º la pestaña del último contexto; si está cerrada/navegada, fallback a
  // cualquier pestaña de Actais abierta.
  const candidates = [];
  if (lastContext?.tabId) candidates.push(lastContext.tabId);
  const tabs = await chrome.tabs.query({ url: '*://personal.hospitaldejove.com/*' });
  for (const t of tabs) if (t.id && !candidates.includes(t.id)) candidates.push(t.id);
  if (candidates.length === 0) return { ok: false, error: 'No hay ninguna pestaña de Actais abierta' };

  let lastErr = null;
  for (const tabId of candidates) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'actais:scrapeMonth' });
      if (res) return res;
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, error: 'No se pudo leer Actais: ' + (lastErr?.message || 'sin respuesta (recarga la página)') };
}

// Ausencias indefinidas vigentes (para el contexto del chat y el panel).
// Lee de la cache de /api/data; si no hay, intenta refrescarla.
async function getLongAbsences() {
  if (!cachedData) {
    const restored = await chrome.storage.local.get(['shiftiaData', 'shiftiaDataAt']);
    if (restored.shiftiaData) { cachedData = restored.shiftiaData; cachedAt = restored.shiftiaDataAt; }
    else await syncShiftiaData(false).catch(() => {});
  }
  const today = new Date().toISOString().slice(0, 10);
  const absences = (cachedData?.workerMeta || [])
    .filter(w => w.longAbsence?.code)
    .filter(w => !w.longAbsence.until || w.longAbsence.until >= today)
    .map(w => ({
      name: w.name,
      code: w.longAbsence.code,
      label: w.longAbsence.label || w.longAbsence.code,
      since: w.longAbsence.since || null,
      until: w.longAbsence.until || null
    }));
  return { ok: true, absences };
}

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

  const url = `${SHIFTIA_API_BASE}/api/assistant/${action}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      cell: args || {},
      context: lastContext,
      dataSnapshot: cachedData ? { at: cachedAt, hasData: true } : null
    })
  });
  if (res.status === 401) {
    await chrome.storage.local.remove(['shiftiaToken', 'shiftiaData', 'shiftiaDataAt']);
    cachedData = null; cachedAt = 0;
    chrome.runtime.sendMessage({ type: 'panel:sessionExpired' }).catch(() => {});
    return { ok: false, error: 'Sesión caducada. Vuelve a iniciar sesión en el panel lateral.' };
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const body = await res.json(); if (body.error) msg = body.error; } catch (_) {}
    return { ok: false, error: msg };
  }
  return { ok: true, data: await res.json() };
}

// Sube una lista de PDFs serializados (Uint8Array transferidos) al backend
// como multipart/form-data. El backend hace el parsing y merge.
async function uploadPdfs({ files, confirmations }) {
  const token = await getToken();
  if (!token) return { ok: false, error: 'Inicia sesión antes de importar' };
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: 'Sin archivos' };

  const form = new FormData();
  for (const f of files) {
    const blob = new Blob([new Uint8Array(f.data)], { type: 'application/pdf' });
    form.append('files', blob, f.name);
  }
  // Confirmaciones de items 'pending': { filename: workerId | '__new__' }
  if (confirmations && Object.keys(confirmations).length > 0) {
    form.append('confirmations', JSON.stringify(confirmations));
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
