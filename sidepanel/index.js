const SHIFTIA_API_BASE = 'https://shiftia-production.up.railway.app';

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
  syncBtn: document.getElementById('sx-sync-btn'),
  healthBtn: document.getElementById('sx-health-btn'),
  healthOut: document.getElementById('sx-health-out'),
  drop: document.getElementById('sx-drop'),
  filesInput: document.getElementById('sx-files'),
  fileList: document.getElementById('sx-file-list'),
  uploadBtn: document.getElementById('sx-upload-btn'),
  importSummary: document.getElementById('sx-import-summary')
};

let selectedFiles = [];

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

els.healthBtn.addEventListener('click', async () => {
  els.healthOut.hidden = false;
  els.healthOut.className = 'sx-health-out';
  els.healthOut.textContent = 'comprobando…';
  const res = await chrome.runtime.sendMessage({ type: 'shiftia:health' });
  if (res?.ok) {
    els.healthOut.classList.add('ok');
    els.healthOut.textContent = `Backend OK (HTTP ${res.status})`;
  } else {
    els.healthOut.classList.add('err');
    els.healthOut.textContent = `Backend KO: ${res?.error || `HTTP ${res?.status || '?'}`}`;
  }
});

async function triggerSync() {
  els.sync.textContent = 'sincronizando…';
  const res = await chrome.runtime.sendMessage({ type: 'shiftia:syncNow' });
  if (!res?.ok) {
    els.sync.textContent = 'error: ' + (res?.error || '?');
    return;
  }
  els.sync.textContent = `${new Date().toLocaleTimeString()} · ${res.data?.workers ?? 0} trabajadores`;
}

// ============ Tabs ============
document.querySelectorAll('.sx-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sx-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.sx-pane').forEach(p => {
      p.classList.toggle('active', p.dataset.pane === tab.dataset.tab);
    });
  });
});

// ============ Import ============
function refreshFileList() {
  els.fileList.innerHTML = '';
  selectedFiles.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'sx-file-item ' + (f.status || 'pending');
    li.innerHTML = `
      <span class="sx-file-name">${escapeHtml(f.name)}</span>
      <span class="sx-file-meta">${(f.size / 1024).toFixed(0)} KB</span>
      <span class="sx-file-status">${f.statusLabel || ''}</span>
    `;
    if (!f.status) {
      const rm = document.createElement('button');
      rm.className = 'sx-file-remove';
      rm.textContent = '×';
      rm.title = 'Quitar';
      rm.addEventListener('click', () => { selectedFiles.splice(i, 1); refreshFileList(); });
      li.appendChild(rm);
    }
    els.fileList.appendChild(li);
  });
  els.uploadBtn.disabled = selectedFiles.length === 0 || selectedFiles.some(f => f.status === 'uploading');
  els.uploadBtn.textContent = `Subir ${selectedFiles.length} PDF${selectedFiles.length === 1 ? '' : 's'}`;
}

function addFiles(fileList) {
  for (const f of Array.from(fileList)) {
    if (!/\.pdf$/i.test(f.name)) continue;
    if (selectedFiles.some(x => x.name === f.name && x.size === f.size)) continue;
    selectedFiles.push({ name: f.name, size: f.size, file: f, status: null });
  }
  refreshFileList();
}

els.filesInput.addEventListener('change', e => addFiles(e.target.files));

['dragover', 'dragenter'].forEach(ev =>
  els.drop.addEventListener(ev, e => { e.preventDefault(); els.drop.classList.add('hover'); })
);
['dragleave', 'drop'].forEach(ev =>
  els.drop.addEventListener(ev, e => { e.preventDefault(); els.drop.classList.remove('hover'); })
);
els.drop.addEventListener('drop', e => {
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
});

els.uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;
  els.uploadBtn.disabled = true;
  els.importSummary.hidden = true;

  selectedFiles.forEach(f => { f.status = 'uploading'; f.statusLabel = 'subiendo…'; });
  refreshFileList();

  try {
    // Leer los archivos como ArrayBuffer y mandarlos al SW (que hace FormData)
    const payload = await Promise.all(selectedFiles.map(async (f) => ({
      name: f.name,
      data: Array.from(new Uint8Array(await f.file.arrayBuffer()))
    })));
    const res = await chrome.runtime.sendMessage({ type: 'shiftia:uploadPdfs', payload: { files: payload } });
    if (!res?.ok) throw new Error(res?.error || 'Error al subir');

    const itemsByName = {};
    (res.data.items || []).forEach(it => { itemsByName[it.filename] = it; });
    selectedFiles.forEach(f => {
      const it = itemsByName[f.name];
      if (!it) { f.status = 'failed'; f.statusLabel = 'sin respuesta'; return; }
      f.status = it.status;
      const tag = {
        created: 'creado',
        updated: 'actualizado',
        pending: `pendiente (${it.confidence}%)`,
        failed: 'fallo: ' + (it.reason || '?')
      }[it.status] || it.status;
      f.statusLabel = tag;
    });
    refreshFileList();

    const s = res.data.summary || {};
    els.importSummary.hidden = false;
    els.importSummary.innerHTML = `
      <strong>Resumen</strong>
      <div>Procesados: ${s.processed}</div>
      <div>Actualizados: ${s.updated}</div>
      <div>Creados: ${s.created}</div>
      <div>Pendientes: ${s.pending}</div>
      <div>Fallidos: ${s.failed}</div>
    `;
    // Forzar resync para que el sidepanel actualice el contador de trabajadores
    triggerSync();
  } catch (e) {
    selectedFiles.forEach(f => { if (f.status === 'uploading') { f.status = 'failed'; f.statusLabel = e.message; } });
    refreshFileList();
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'panel:context') renderContext(msg.payload);
  if (msg?.type === 'panel:sessionExpired') {
    els.authBox.hidden = false;
    els.status.textContent = 'Sesión caducada';
    els.status.classList.remove('connected');
    els.status.classList.add('disconnected');
    els.loginErr.textContent = 'La sesión expiró. Vuelve a entrar.';
  }
});

chrome.runtime.sendMessage({ type: 'panel:requestContext' }, (res) => {
  if (res?.payload) renderContext(res.payload);
});

checkAuth();
