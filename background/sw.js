const SHIFTIA_API_BASE = 'https://shiftia-director-production.up.railway.app';

let lastContext = null;
let cachedData = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

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
    return { ok: true, data: { workers: cachedData.workers?.length || 0, fromCache: true } };
  }
  const res = await fetch(`${SHIFTIA_API_BASE}/api/data`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  cachedData = await res.json();
  cachedAt = now;
  await chrome.storage.local.set({ shiftiaData: cachedData, shiftiaDataAt: cachedAt });
  return { ok: true, data: { workers: cachedData.workers?.length || 0, fromCache: false } };
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
  if (!res.ok) return { ok: false, error: `HTTP ${res.status} en /api/assistant/${action}` };
  return { ok: true, data: await res.json() };
}
