const SHIFTIA_API_BASE = 'https://shiftia-director-production.up.railway.app';

const els = {
  status: document.getElementById('sx-status'),
  module: document.getElementById('sx-module'),
  worker: document.getElementById('sx-worker'),
  sync: document.getElementById('sx-sync'),
  authBox: document.getElementById('sx-auth'),
  email: document.getElementById('sx-email'),
  pass: document.getElementById('sx-pass'),
  loginBtn: document.getElementById('sx-login-btn'),
  loginErr: document.getElementById('sx-login-err'),
  syncBtn: document.getElementById('sx-sync-btn')
};

function renderContext(ctx) {
  if (!ctx) {
    els.status.textContent = 'Sin contexto';
    els.status.classList.remove('connected');
    els.status.classList.add('disconnected');
    return;
  }
  els.status.textContent = ctx.hasCalendar ? 'Calendario detectado' : 'En Actais';
  els.status.classList.add('connected');
  els.status.classList.remove('disconnected');
  els.module.textContent = ctx.module || '—';
  els.worker.textContent = ctx.worker || '—';
}

async function checkAuth() {
  const { shiftiaToken, shiftiaDataAt } = await chrome.storage.local.get(['shiftiaToken', 'shiftiaDataAt']);
  if (!shiftiaToken) {
    els.authBox.hidden = false;
    els.status.textContent = 'Sin sesión';
    return false;
  }
  els.authBox.hidden = true;
  els.sync.textContent = shiftiaDataAt
    ? new Date(shiftiaDataAt).toLocaleTimeString()
    : 'pendiente';
  return true;
}

els.loginBtn.addEventListener('click', async () => {
  els.loginErr.textContent = '';
  const email = els.email.value.trim();
  const password = els.pass.value;
  if (!email || !password) { els.loginErr.textContent = 'Rellena email y contraseña'; return; }
  try {
    const res = await fetch(`${SHIFTIA_API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || !data.token) {
      els.loginErr.textContent = data.error || 'Credenciales no válidas';
      return;
    }
    await chrome.runtime.sendMessage({ type: 'shiftia:setToken', payload: { token: data.token } });
    await checkAuth();
    triggerSync();
  } catch (e) {
    els.loginErr.textContent = 'Error de red: ' + e.message;
  }
});

els.syncBtn.addEventListener('click', triggerSync);

async function triggerSync() {
  els.sync.textContent = 'sincronizando…';
  const res = await chrome.runtime.sendMessage({ type: 'shiftia:syncNow' });
  if (!res?.ok) {
    els.sync.textContent = 'error: ' + (res?.error || '?');
    return;
  }
  els.sync.textContent = `${new Date().toLocaleTimeString()} · ${res.data?.workers ?? 0} trabajadores`;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'panel:context') renderContext(msg.payload);
});

chrome.runtime.sendMessage({ type: 'panel:requestContext' }, (res) => {
  if (res?.payload) renderContext(res.payload);
});

checkAuth();
