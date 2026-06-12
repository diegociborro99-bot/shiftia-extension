// ============================================================================
// nano.js — chat local con Gemini Nano (Chrome Prompt API, `LanguageModel`).
// 100% on-device: ningún dato de la planilla sale del equipo.
//
// Estados: unsupported → unavailable → downloadable → downloading → ready.
// La sesión se crea perezosamente con el system prompt construido por
// shared/prompt-builder.js (window.ShiftiaShared.buildSystemPrompt) a partir
// del contexto detectado + el último mes escaneado.
// ============================================================================

let session = null;
let sessionSig = null;     // firma del contexto con el que se creó la sesión
let els = null;
let getChatContext = null; // () => ({ ctx, snapshot })
let refreshSnapshot = null; // () => Promise — escanea Actais bajo demanda
let busy = false;

function contextSig() {
  const { ctx, snapshot } = getChatContext();
  return JSON.stringify([ctx?.worker || null, snapshot?.workerId || null,
    snapshot?.year ?? null, snapshot?.month ?? null, snapshot?.cells || null]);
}

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

function setInputEnabled(on) {
  els.input.disabled = !on;
  els.send.disabled = !on;
}

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `sx-msg sx-msg-${role}`;
  div.textContent = text;
  els.messages.appendChild(div);
  els.messages.scrollTop = els.messages.scrollHeight;
  return div;
}

function systemPromptNow() {
  const { ctx, snapshot } = getChatContext();
  const shared = window.ShiftiaShared;
  if (!shared?.buildSystemPrompt) throw new Error('prompt-builder no cargado');
  return shared.buildSystemPrompt(ctx, snapshot);
}

async function createSession(onProgress) {
  return LanguageModel.create({
    initialPrompts: [{ role: 'system', content: systemPromptNow() }],
    monitor(m) {
      if (onProgress) {
        m.addEventListener('downloadprogress', (e) => onProgress(e.loaded));
      }
    }
  });
}

async function ensureSession() {
  // Si la planilla/trabajador en pantalla cambió desde que se creó la sesión,
  // se recrea para que el modelo vea el contexto fresco.
  const sig = contextSig();
  if (session && sig !== sessionSig) {
    try { session.destroy(); } catch (_) {}
    session = null;
  }
  if (!session) {
    session = await createSession();
    sessionSig = sig;
  }
  return session;
}

export function resetSession() {
  if (session) { try { session.destroy(); } catch (_) {} session = null; }
  els.messages.innerHTML = '';
  updateContextHint();
  appendMessage('info', 'Conversación reiniciada con el contexto actual.');
}

export function updateContextHint() {
  if (!els || !getChatContext) return; // aún no inicializado
  const { ctx, snapshot } = getChatContext();
  const parts = [];
  if (ctx?.worker) parts.push(ctx.worker);
  if (snapshot) {
    const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    parts.push(`mes escaneado: ${MONTHS[snapshot.month]} ${snapshot.year} (${snapshot.stats?.filled ?? '?'} turnos)`);
  }
  els.ctxHint.textContent = 'Contexto: ' + (parts.length ? parts.join(' · ') : 'sin planilla escaneada');
}

async function handleSend(ev) {
  ev.preventDefault();
  const text = els.input.value.trim();
  if (!text || busy) return;
  els.input.value = '';
  appendMessage('user', text);
  const bubble = appendMessage('ai', '…');
  busy = true;
  setInputEnabled(false);
  try {
    // Escanear la planilla visible en Actais ANTES de preguntar, para que el
    // modelo siempre responda sobre lo que hay en pantalla.
    if (refreshSnapshot) { try { await refreshSnapshot(); } catch (_) {} }
    const s = await ensureSession();
    const stream = s.promptStreaming(text);
    bubble.textContent = '';
    for await (const chunk of stream) {
      bubble.textContent += chunk;
      els.messages.scrollTop = els.messages.scrollHeight;
    }
    if (!bubble.textContent.trim()) bubble.textContent = '(sin respuesta)';
  } catch (e) {
    bubble.textContent = 'Error del modelo local: ' + (e?.message || e);
    bubble.classList.add('sx-msg-err');
    // Sesión posiblemente corrupta (p. ej. contexto desbordado): forzar recreación
    if (session) { try { session.destroy(); } catch (_) {} session = null; }
  } finally {
    busy = false;
    setInputEnabled(true);
    els.input.focus();
  }
}

async function startDownload() {
  els.dlBtn.disabled = true;
  els.dlProgress.hidden = false;
  setStatus('Descargando Gemini Nano…', 'busy');
  try {
    session = await createSession((loaded) => {
      els.dlBar.style.width = Math.round(loaded * 100) + '%';
    });
    els.download.hidden = true;
    setStatus('IA local lista (Gemini Nano, on-device)', 'ok');
    setInputEnabled(true);
  } catch (e) {
    setStatus('No se pudo descargar el modelo: ' + (e?.message || e), 'err');
    els.dlBtn.disabled = false;
  }
}

export async function initChat(deps) {
  getChatContext = deps.getChatContext;
  refreshSnapshot = deps.refreshSnapshot || null;
  els = {
    status: document.getElementById('sx-chat-status'),
    download: document.getElementById('sx-chat-download'),
    dlBtn: document.getElementById('sx-chat-dl-btn'),
    dlProgress: document.getElementById('sx-chat-dl-progress'),
    dlBar: document.getElementById('sx-chat-dl-bar'),
    messages: document.getElementById('sx-chat-messages'),
    form: document.getElementById('sx-chat-form'),
    input: document.getElementById('sx-chat-input'),
    send: document.getElementById('sx-chat-send'),
    reset: document.getElementById('sx-chat-reset'),
    ctxHint: document.getElementById('sx-chat-ctx')
  };
  els.form.addEventListener('submit', handleSend);
  els.reset.addEventListener('click', resetSession);
  els.dlBtn.addEventListener('click', startDownload);
  updateContextHint();

  if (typeof LanguageModel === 'undefined') {
    setStatus('Tu Chrome no soporta IA local (necesitas Chrome 138 o superior).', 'err');
    return;
  }
  let availability;
  try {
    availability = await LanguageModel.availability();
  } catch (e) {
    setStatus('No se pudo comprobar la IA local: ' + (e?.message || e), 'err');
    return;
  }
  switch (availability) {
    case 'available':
      setStatus('IA local lista (Gemini Nano, on-device)', 'ok');
      setInputEnabled(true);
      break;
    case 'downloadable':
    case 'downloading':
      setStatus('Modelo local disponible para descargar', 'busy');
      els.download.hidden = false;
      break;
    default:
      setStatus('Este equipo no cumple los requisitos de la IA local (macOS 13+/Win 10+, ~22 GB libres, GPU 4 GB).', 'err');
  }
}
