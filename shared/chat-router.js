// ============================================================================
// chat-router.js — clasificador determinista de preguntas del chat.
//
// Las preguntas CRÍTICAS (sustitutos, librar, legalidad) no se dejan en manos
// de Gemini Nano (modelo pequeño → inventa): se enrutan al motor determinista
// del backend, cuya respuesta es verificada. Nano queda para lo conversacional.
//
// routeQuestion(texto) → { action, day (0-based) } | null
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ShiftiaShared = Object.assign(root.ShiftiaShared || {}, factory());
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const INTENTS = [
    { action: 'whoCovers',        re: /qui[eé]n\s+(me\s+)?(puede\s+)?(cubr|sustitu)/i },
    { action: 'librar',           re: /(puedo|puede|podr[ií]a|se\s+puede)[^.?!]*librar|librar[^.?!]*(d[ií]a|el\s+\d)/i },
    { action: 'validateConvenio', re: /es\s+legal|cumple[^.?!]*convenio|convenio[^.?!]*cumple|valida[^.?!]*convenio/i }
  ];

  function extractDay(text) {
    const m = text.match(/(?:d[ií]a|el)\s+(\d{1,2})\b/i);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    if (day < 1 || day > 31) return null;
    return day - 1; // 0-based, como el resto del sistema
  }

  function routeQuestion(text) {
    if (!text || typeof text !== 'string') return null;
    for (const intent of INTENTS) {
      if (intent.re.test(text)) {
        const day = extractDay(text);
        if (day == null) return null; // sin día concreto: Nano pedirá precisión
        return { action: intent.action, day };
      }
    }
    return null;
  }

  return { routeQuestion };
});
