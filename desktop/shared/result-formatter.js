// ============================================================================
// result-formatter.js — convierte las respuestas de /api/assistant/* en HTML
// visual para el menú flotante (veredicto, razonamiento, plan de cobertura).
// Función pura (string → string seguro); los estilos viven en overlay.css
// bajo el prefijo .sxr-*. UMD: navegador (window.ShiftiaShared) + Node (tests).
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ShiftiaShared = Object.assign(root.ShiftiaShared || {}, factory());
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const RULE_ICON = { pass: '✓', fail: '✕', warning: '⚠' };
  const VERDICT_ICON = { ok: '✓', warning: '⚠', blocked: '✕' };

  function verdictBanner(verdict, label) {
    const v = ['ok', 'warning', 'blocked'].includes(verdict) ? verdict : 'warning';
    return `<div class="sxr-verdict sxr-verdict-${v}"><span class="sxr-verdict-icon">${VERDICT_ICON[v]}</span>${esc(label || v)}</div>`;
  }

  function summaryBlock(s) {
    if (!s) return '';
    const rows = [];
    if (s.what) rows.push(esc(s.what));
    const meta = [s.when, s.where].filter(Boolean).map(esc).join(' · ');
    if (meta) rows.push(`<span class="sxr-muted">${meta}</span>`);
    return rows.length ? `<div class="sxr-summary">${rows.join('<br>')}</div>` : '';
  }

  function reasoningList(reasoning) {
    if (!Array.isArray(reasoning) || reasoning.length === 0) return '';
    return '<div class="sxr-rules">' + reasoning.map(r => {
      const st = ['pass', 'fail', 'warning'].includes(r.status) ? r.status : 'warning';
      return `<div class="sxr-rule sxr-rule-${st}"><span class="sxr-rule-icon">${RULE_ICON[st]}</span>` +
        `<span><strong>${esc(r.rule || '')}</strong>` +
        (r.detail ? `<br><span class="sxr-muted">${esc(r.detail)}</span>` : '') + '</span></div>';
    }).join('') + '</div>';
  }

  function candidateCard(c, label) {
    if (!c) return '';
    const chips = (c.breakdown || []).map(b => `<span class="sxr-chip">${esc(b)}</span>`).join('');
    const shifts = (c.previousShift || c.nextShift)
      ? `<span class="sxr-muted">víspera ${esc(c.previousShift || '—')} · después ${esc(c.nextShift || '—')}</span>` : '';
    return `<div class="sxr-candidate">` +
      (label ? `<div class="sxr-candidate-label">${esc(label)}</div>` : '') +
      `<div class="sxr-candidate-row"><strong>${esc(c.name || '?')}</strong>` +
      (c.score != null ? `<span class="sxr-score">${esc(c.score)}</span>` : '') + '</div>' +
      [c.role, c.planta].filter(Boolean).map(esc).join(' · ') +
      (c.crossPlant ? ' · <span class="sxr-cross">cross-planta</span>' : '') +
      (shifts ? `<div>${shifts}</div>` : '') +
      (chips ? `<div class="sxr-chips">${chips}</div>` : '') +
      '</div>';
  }

  function coverPlanBlock(plan) {
    if (!plan) return '';
    let html = '';
    if (plan.primary?.candidate) html += candidateCard(plan.primary.candidate, plan.primary.label || 'Mejor opción');
    if (plan.alternative?.candidate) html += candidateCard(plan.alternative.candidate, plan.alternative.label || 'Alternativa');
    if (plan.moreCount > 0) html += `<div class="sxr-muted">… y ${plan.moreCount} candidato(s) más</div>`;
    return html;
  }

  function formatAssistantResult(data) {
    if (data == null) return '<em>Sin datos</em>';
    if (typeof data === 'string') return esc(data);

    let html = '';

    // Shape moderno: verdict + reasoning + coverPlan
    if (data.verdict || data.verdictLabel) {
      html += verdictBanner(data.verdict, data.verdictLabel || data.suggestion);
      html += summaryBlock(data.summary);
      html += reasoningList(data.reasoning);
      html += coverPlanBlock(data.coverPlan);
      if (data.suggestion && data.suggestion !== data.verdictLabel) {
        html += `<div class="sxr-suggestion">${esc(data.suggestion)}</div>`;
      }
      return html;
    }

    // Shape legacy: lista de candidatos (suggestReplacement)
    if (Array.isArray(data.candidates)) {
      if (data.candidates.length === 0) return '<em>Ningún candidato</em>';
      return data.candidates.map(c => candidateCard(c)).join('');
    }

    // Shape legacy: legal + reasons (validateConvenio)
    if (Array.isArray(data.reasons)) {
      html += verdictBanner(data.legal === false ? 'blocked' : 'ok',
        data.legal === false ? 'No cumple convenio' : 'Cumple convenio');
      html += reasoningList(data.reasons.map(r => ({
        rule: r, status: data.legal === false ? 'fail' : 'pass'
      })));
      return html;
    }

    // Texto redactado (drafts)
    if (typeof data.text === 'string') return `<div class="sxr-draft">${esc(data.text)}</div>`;
    if (typeof data.message === 'string') return esc(data.message);

    // Desconocido: pares clave-valor legibles, nunca JSON crudo
    return '<div class="sxr-rules">' + Object.entries(data)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .slice(0, 10)
      .map(([k, v]) => `<div class="sxr-rule"><strong>${esc(k)}</strong>: ${esc(v)}</div>`)
      .join('') + '</div>';
  }

  return { formatAssistantResult };
});
