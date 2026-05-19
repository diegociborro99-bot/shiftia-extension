// Motor local determinista para Shiftia. Actúa cuando el backend de
// /api/assistant/* no responde (404, red caída, etc.) o como sandbox de
// pruebas sin sesión. Opera sobre el snapshot ya cacheado de /api/data.
//
// Forma esperada del snapshot (best-effort, defensivo):
//   workerMeta?: [{ id, name, plant?, category?, contract?, antiquity? }]
//   workers?:    forma legacy alternativa
//   scheduleData?: { [YYYY-MM]: { [workerId]: [shiftCodes 0-indexed por día] } }

const REST_SHIFTS = new Set(['D', 'L', 'LD', 'FN']);
const ABSENCE_SHIFTS = new Set(['VAC', 'VAN', 'VAA', 'BAJ', 'LAC', 'AE', 'EX', 'PM', 'MTC']);
const NIGHT_SHIFTS = new Set(['N']);
const MORNING_SHIFTS = new Set(['M', 'M7H', 'M8', 'M4H', 'M6', 'M55', 'M6R', 'MR']);

function getWorkers(snapshot) {
  return snapshot?.workerMeta || snapshot?.workers || [];
}

function getWorkerById(snapshot, workerId) {
  const id = String(workerId);
  return getWorkers(snapshot).find(w => String(w.id) === id) || null;
}

function getMonthSchedule(snapshot, year, month1Based) {
  const key = `${year}-${String(month1Based).padStart(2, '0')}`;
  return snapshot?.scheduleData?.[key] || null;
}

function getDayShift(snapshot, workerId, year, month1Based, day1Based) {
  const month = getMonthSchedule(snapshot, year, month1Based);
  if (!month) return null;
  const arr = month[workerId] ?? month[String(workerId)];
  if (!Array.isArray(arr)) return null;
  return arr[day1Based - 1] || null;
}

// Devuelve el turno del día anterior y posterior (cruzando frontera de mes).
function getAdjacentShifts(snapshot, workerId, year, month1Based, day1Based) {
  const prev = day1Based > 1
    ? getDayShift(snapshot, workerId, year, month1Based, day1Based - 1)
    : getDayShift(snapshot, workerId,
        month1Based === 1 ? year - 1 : year,
        month1Based === 1 ? 12 : month1Based - 1,
        31); // tolerante: si no hay 31 devuelve null
  const next = getDayShift(snapshot, workerId, year, month1Based, day1Based + 1)
    || getDayShift(snapshot, workerId,
        month1Based === 12 ? year + 1 : year,
        month1Based === 12 ? 1 : month1Based + 1,
        1);
  return { prev, next };
}

function requireCellFields(cell) {
  const workerId = cell?.workerId;
  const year = cell?.year;
  const month1 = cell?.month1Based || (cell?.month != null ? cell.month + 1 : null);
  const day1 = cell?.day1Based || (cell?.day != null ? cell.day + 1 : null);
  if (!workerId || !year || !month1 || !day1) {
    return { error: 'Celda incompleta (falta workerId o fecha).' };
  }
  return { workerId, year, month1, day1 };
}

export async function runLocalAction(action, cell, snapshot) {
  if (!snapshot) {
    return { ok: false, error: 'Motor local: sin datos cacheados. Sincroniza desde el panel.', local: true };
  }
  const f = requireCellFields(cell);
  if (f.error) return { ok: false, error: f.error, local: true };
  const { workerId, year, month1, day1 } = f;

  const current = getDayShift(snapshot, workerId, year, month1, day1) || cell.shift || null;
  const { prev, next } = getAdjacentShifts(snapshot, workerId, year, month1, day1);

  switch (action) {
    case 'librar':
    case 'canChange': {
      if (current && ABSENCE_SHIFTS.has(current)) {
        return {
          ok: true,
          local: true,
          data: {
            legal: false,
            reasons: [`Turno actual: ${current}. Es una ausencia — retira primero la incidencia.`]
          }
        };
      }
      const reasons = [`Turno actual: ${current || '?'}.`];
      if (prev && REST_SHIFTS.has(prev)) reasons.push(`Cuidado: el día anterior ya es libre (${prev}).`);
      if (next && REST_SHIFTS.has(next)) reasons.push(`Cuidado: el día siguiente ya es libre (${next}).`);
      return {
        ok: true,
        local: true,
        data: { legal: true, reasons }
      };
    }

    case 'whoCovers':
    case 'suggestReplacement':
    case 'alternativas':
    case 'aiAlternatives': {
      const baseWorker = getWorkerById(snapshot, workerId);
      const basePlant = baseWorker?.plant;
      const baseCategory = baseWorker?.category;
      const candidates = [];
      for (const w of getWorkers(snapshot)) {
        if (String(w.id) === String(workerId)) continue;
        const shift = getDayShift(snapshot, w.id, year, month1, day1);
        if (!REST_SHIFTS.has(shift)) continue;

        const adj = getAdjacentShifts(snapshot, w.id, year, month1, day1);
        let score = 50;
        const breakdown = [`Descansa (${shift})`];

        if (basePlant && w.plant === basePlant) {
          score += 30;
          breakdown.push('misma planta');
        } else if (basePlant && w.plant && w.plant !== basePlant) {
          breakdown.push('otra planta');
        }
        if (baseCategory && w.category === baseCategory) {
          score += 15;
          breakdown.push('misma categoría');
        }
        // Penaliza si el día anterior trabajó noche (no debería encadenar).
        if (NIGHT_SHIFTS.has(adj.prev)) {
          score -= 25;
          breakdown.push('víspera fue noche');
        }
        // Bonifica si está descansando antes y después (mejor disponibilidad).
        if (REST_SHIFTS.has(adj.prev) && REST_SHIFTS.has(adj.next)) {
          score += 10;
          breakdown.push('libre 3 días seguidos');
        }

        candidates.push({
          name: w.name || `Trabajador ${w.id}`,
          score,
          crossPlant: basePlant && w.plant && w.plant !== basePlant,
          breakdown
        });
      }
      candidates.sort((a, b) => b.score - a.score);
      return { ok: true, local: true, data: { candidates: candidates.slice(0, 5) } };
    }

    case 'vacaciones':
    case 'markVacation': {
      if (current && ABSENCE_SHIFTS.has(current)) {
        return {
          ok: true,
          local: true,
          data: {
            legal: false,
            reasons: [`Ya hay una ausencia (${current}) en ese día.`]
          }
        };
      }
      return {
        ok: true,
        local: true,
        data: {
          legal: true,
          reasons: [
            `Cambio propuesto: ${current || '?'} → VAC.`,
            'Validación de saldo anual de vacaciones requiere backend.'
          ]
        }
      };
    }

    case 'cambio':
    case 'proposeChange': {
      const target = cell.targetShift;
      if (!target) return { ok: false, error: 'Falta turno destino.', local: true };
      const reasons = [`${current || '?'} → ${target}`];
      // Validaciones determinísticas mínimas:
      if (NIGHT_SHIFTS.has(prev) && MORNING_SHIFTS.has(target)) {
        return {
          ok: true,
          local: true,
          data: {
            legal: false,
            reasons: [...reasons, 'Víspera fue noche — no encadenar con mañana sin descanso de 12h.']
          }
        };
      }
      if (target === current) {
        return {
          ok: true,
          local: true,
          data: { legal: false, reasons: [...reasons, 'El turno destino coincide con el actual.'] }
        };
      }
      reasons.push('Validación convenio completa requiere backend.');
      return { ok: true, local: true, data: { legal: true, reasons } };
    }

    case 'validateConvenio': {
      const reasons = [`Turno: ${current || '?'}`];
      if (NIGHT_SHIFTS.has(prev) && MORNING_SHIFTS.has(current)) {
        return {
          ok: true,
          local: true,
          data: { legal: false, reasons: [...reasons, 'Encadena mañana tras noche sin descanso de 12h.'] }
        };
      }
      reasons.push('Verificación local básica — convenio completo requiere backend.');
      return { ok: true, local: true, data: { legal: true, reasons } };
    }

    default:
      return { ok: false, error: `Acción no soportada localmente: ${action}`, local: true };
  }
}
