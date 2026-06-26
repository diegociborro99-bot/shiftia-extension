// ============================================================================
// buildSystemPrompt — construye el system prompt para Gemini Nano (Prompt API)
// con el contexto detectado en Actais + la planilla del mes escaneado +
// reglas de convenio. Función pura, UMD (navegador + Node para tests).
//
// Nano tiene ventana de contexto pequeña: el prompt se mantiene compacto
// (< 4000 chars) y la planilla se serializa como "día:turno" omitiendo vacíos.
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ShiftiaShared = Object.assign(root.ShiftiaShared || {}, factory());
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const SHIFT_LEGEND =
    'M = Mañana (variantes M7H/M8/M4H/M6/M55/M6R/MR son mañanas reducidas), ' +
    'T = Tarde 15-22, N = Noche 22-08, D = Descanso, L = Libre, LD = Libre Disposición, ' +
    'SP = Sin Planificar, VAC = Vacaciones, BAJ = Baja, LAC = Lactancia, ' +
    'AE = Asuntos propios, PM = Permiso, CJ = Cómputo de Jornada, FOR = Formación, ' +
    'HS = Horas Sindicales, G17/G24 = Guardias.';

  const CONVENIO_RULES =
    'Reglas de convenio: máximo 2 noches por mes, máximo 6 días consecutivos trabajados, ' +
    'mínimo 1 día de descanso semanal, tras una noche no se puede trabajar mañana al día siguiente.';

  // Serializa cells[31] como "1:M 2:M 3:T 5:D …" (día humano 1-based, vacíos omitidos)
  function buildScheduleSummary(cells) {
    if (!Array.isArray(cells)) return '';
    const parts = [];
    for (let i = 0; i < Math.min(cells.length, 31); i++) {
      const v = (cells[i] || '').toString().trim();
      if (v) parts.push(`${i + 1}:${v}`);
    }
    return parts.join(' ');
  }

  function buildSystemPrompt(ctx, monthSnapshot, longAbsences) {
    const lines = [];
    lines.push(
      'Eres Shiftia, asistente de planificación de turnos de enfermería del Hospital de Jove. ' +
      'Ayudas a la supervisora a razonar sobre la planilla que está viendo en Actais. ' +
      'Responde en español, breve y concreto.'
    );
    lines.push('Leyenda de turnos: ' + SHIFT_LEGEND);
    lines.push(CONVENIO_RULES);

    const worker = ctx?.worker || null;
    if (worker) lines.push(`Trabajador en pantalla: ${worker}.`);
    if (ctx?.module) lines.push(`Módulo de Actais abierto: ${ctx.module}.`);

    if (monthSnapshot && Array.isArray(monthSnapshot.cells)) {
      const monthName = MONTHS_ES[monthSnapshot.month] || `mes ${monthSnapshot.month}`;
      lines.push(
        `Planilla escaneada de ${monthName} de ${monthSnapshot.year}` +
        (worker ? ` para ${worker}` : '') +
        ' (formato día:turno, los días sin valor no tienen turno asignado): ' +
        buildScheduleSummary(monthSnapshot.cells)
      );
    } else {
      lines.push(
        'Ahora mismo no hay planilla escaneada cargada. Si la pregunta requiere datos de la planilla, ' +
        'pide a la usuaria que pulse "Escanear mes visible" en el panel.'
      );
    }

    if (Array.isArray(longAbsences) && longAbsences.length > 0) {
      lines.push(
        'Ausencias indefinidas vigentes (estos trabajadores NO están disponibles — no los propongas ' +
        'como sustitutos ni cuentes con ellos): ' +
        longAbsences.map(a =>
          `${a.name} — ${a.label || a.code || 'ausencia'}` +
          (a.until ? ` (hasta ${a.until})` : ' (hasta nuevo aviso)')
        ).join('; ') + '.'
      );
    }

    lines.push(
      'REGLAS ESTRICTAS: (1) Responde SOLO con datos presentes en este contexto; si no tienes el ' +
      'dato, di "no tengo ese dato" — no inventes turnos, nombres ni fechas. (2) NUNCA propongas ' +
      'cambios de turno, sustituciones ni candidatos por tu cuenta: tú no ves las planillas del ' +
      'resto de la plantilla. Para eso indica que pregunte "¿quién puede cubrir el día X?" (lo ' +
      'responde el motor verificado) o use Alt+click sobre el día en Actais. (3) Si afirmas algo ' +
      'sobre la planilla, cita el día concreto del contexto que lo respalda.'
    );

    return lines.join('\n\n');
  }

  return { buildSystemPrompt, buildScheduleSummary };
});
