// Motor local determinista para Shiftia. Actúa cuando el backend de
// /api/assistant/* no responde (404, red caída, etc.) o como sandbox de
// pruebas sin sesión. Opera sobre el snapshot ya cacheado de /api/data.
//
// Forma esperada del snapshot (best-effort, defensivo):
//   workerMeta?: [{ id, name, plant?, category?, contract?, antiquity? }]
//   workers?:    forma legacy alternativa
//   scheduleData?: { [YYYY-MM]: { [workerId]: [shiftCodes 0-indexed por día] } }

import { rolesAreCompatible, getRole, canCoverShift, isRelocatable, workerNotes } from './rules.js';

const REST_SHIFTS = new Set(['D', 'L', 'LD', 'FN']);
const ABSENCE_SHIFTS = new Set(['VAC', 'VAN', 'VAA', 'BAJ', 'LAC', 'AE', 'EX', 'PM', 'MTC']);
const NIGHT_SHIFTS = new Set(['N']);
// Turnos productivos completos (los que cuentan como "trabajar").
const WORK_SHIFTS = new Set([
  'M', 'M7H', 'M8', 'M4H', 'M6', 'M55', 'M6R', 'MR',
  'T', 'N', 'INT', 'IQF', 'CJ', 'FOR', 'HS', 'HF', 'G17', 'G24'
]);

// REGLAS CONFIRMADAS CON LA SUPERVISORA:
//   1) Tras una noche, sólo se puede trabajar noche o descansar/ausencia.
//      Nada de mañana ni de tarde tras N.
//   2) Máximo 3 noches consecutivas (algunos convenios marcan 2; ajustable
//      desde MAX_CONSECUTIVE_NIGHTS).
const MAX_CONSECUTIVE_NIGHTS = 3;

function isNonNightWork(shift) {
  return WORK_SHIFTS.has(shift) && !NIGHT_SHIFTS.has(shift);
}

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

// Cuenta noches consecutivas terminando en (year, month1, day1) inclusive.
// Si ese día NO es noche, devuelve 0. Tolerante a faltas de datos al cruzar
// frontera de mes/año (cuenta hasta lo que haya).
function countConsecutiveNightsEndingAt(snapshot, workerId, year, month1, day1) {
  let count = 0;
  let y = year, m = month1, d = day1;
  // Normaliza punto de inicio si viene < 1 (p.ej. día 0 = último día del mes anterior).
  while (d < 1) {
    m--;
    if (m < 1) { m = 12; y--; }
    d += 31; // getDayShift devuelve null si el índice no existe → cortará el bucle
  }
  for (let i = 0; i < 12; i++) {
    const s = getDayShift(snapshot, workerId, y, m, d);
    if (!NIGHT_SHIFTS.has(s)) break;
    count++;
    d--;
    if (d < 1) {
      m--;
      if (m < 1) { m = 12; y--; }
      d = 31;
    }
  }
  return count;
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
      const baseRole = getRole(baseWorker);
      const shiftToCover = current; // el sustituto cubre el turno original
      const candidates = [];
      const filteredOut = { role: 0, constraint: 0, crossPlant: 0, afterNight: 0, tooManyNights: 0 };

      for (const w of getWorkers(snapshot)) {
        if (String(w.id) === String(workerId)) continue;
        const shift = getDayShift(snapshot, w.id, year, month1, day1);
        if (!REST_SHIFTS.has(shift)) continue;

        // FILTRO DURO 1: categoría profesional. Un TÉCNICO solo cubre TÉCNICO,
        // una ENFERMERA solo cubre ENFERMERA. Sin esto se mezclarían roles
        // — error clínico y legal.
        if (!rolesAreCompatible(baseWorker, w)) { filteredOut.role++; continue; }

        // FILTRO DURO 2: constraint específico (Beatriz solo mañanas, etc.).
        const cover = canCoverShift(w, shiftToCover);
        if (!cover.ok) { filteredOut.constraint++; continue; }

        // FILTRO DURO 3: si la cobertura sería cross-plant pero el trabajador
        // no es reubicable, descartar.
        const isCross = basePlant && w.plant && w.plant !== basePlant;
        if (isCross && !isRelocatable(w)) { filteredOut.crossPlant++; continue; }

        const adj = getAdjacentShifts(snapshot, w.id, year, month1, day1);

        // FILTRO DURO 4: tras una noche, sólo noche o descanso. Si la víspera
        // fue N y se le pide cubrir algo que no es noche, descartar.
        if (NIGHT_SHIFTS.has(adj.prev) && isNonNightWork(shiftToCover)) {
          filteredOut.afterNight++; continue;
        }

        // FILTRO DURO 5: si la cobertura es nocturna y este trabajador ya
        // acumula MAX_CONSECUTIVE_NIGHTS noches seguidas hasta el día anterior,
        // se descarta (cubrir hoy haría la N+1).
        if (NIGHT_SHIFTS.has(shiftToCover)) {
          const prevNights = NIGHT_SHIFTS.has(adj.prev)
            ? countConsecutiveNightsEndingAt(snapshot, w.id, year, month1, day1 - 1)
            : 0;
          if (prevNights >= MAX_CONSECUTIVE_NIGHTS) {
            filteredOut.tooManyNights++; continue;
          }
        }

        let score = 50;
        const breakdown = [`Descansa (${shift})`, `rol ${getRole(w) || '?'}`];

        if (basePlant && w.plant === basePlant) {
          score += 30;
          breakdown.push('misma planta');
        } else if (isCross) {
          breakdown.push('otra planta (reubicable)');
        }
        if (REST_SHIFTS.has(adj.prev) && REST_SHIFTS.has(adj.next)) {
          score += 10;
          breakdown.push('libre 3 días seguidos');
        }
        const notes = workerNotes(w);
        if (notes) breakdown.push(notes);

        candidates.push({
          name: w.name || `Trabajador ${w.id}`,
          score,
          crossPlant: isCross,
          breakdown
        });
      }
      candidates.sort((a, b) => b.score - a.score);
      const filteredNote = [];
      if (filteredOut.role) filteredNote.push(`${filteredOut.role} fuera por rol distinto a ${baseRole || '?'}`);
      if (filteredOut.constraint) filteredNote.push(`${filteredOut.constraint} fuera por constraint personal`);
      if (filteredOut.crossPlant) filteredNote.push(`${filteredOut.crossPlant} fuera por no reubicable`);
      if (filteredOut.afterNight) filteredNote.push(`${filteredOut.afterNight} fuera por venir de noche`);
      if (filteredOut.tooManyNights) filteredNote.push(`${filteredOut.tooManyNights} fuera por superar ${MAX_CONSECUTIVE_NIGHTS} noches seguidas`);
      return {
        ok: true,
        local: true,
        data: {
          candidates: candidates.slice(0, 5),
          filteredOut: filteredNote.length ? filteredNote.join(' · ') : null
        }
      };
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
      const baseWorker = getWorkerById(snapshot, workerId);
      const reasons = [`${current || '?'} → ${target}`];

      // FILTRO DURO: constraint personal del trabajador (Beatriz solo mañanas).
      const cover = canCoverShift(baseWorker, target);
      if (!cover.ok) {
        return { ok: true, local: true, data: { legal: false, reasons: [...reasons, cover.reason] } };
      }

      // REGLA: tras noche, sólo noche o descanso/ausencia.
      if (NIGHT_SHIFTS.has(prev) && isNonNightWork(target)) {
        return {
          ok: true,
          local: true,
          data: { legal: false, reasons: [...reasons, 'Tras una noche solo se puede trabajar otra noche o descansar.'] }
        };
      }

      // REGLA: máx MAX_CONSECUTIVE_NIGHTS noches seguidas.
      if (NIGHT_SHIFTS.has(target)) {
        const prevNights = NIGHT_SHIFTS.has(prev)
          ? countConsecutiveNightsEndingAt(snapshot, workerId, year, month1, day1 - 1)
          : 0;
        if (prevNights >= MAX_CONSECUTIVE_NIGHTS) {
          return {
            ok: true,
            local: true,
            data: {
              legal: false,
              reasons: [...reasons, `Se superarían ${MAX_CONSECUTIVE_NIGHTS} noches consecutivas (lleva ${prevNights}).`]
            }
          };
        }
      }

      if (target === current) {
        return { ok: true, local: true, data: { legal: false, reasons: [...reasons, 'El turno destino coincide con el actual.'] } };
      }
      reasons.push('Validación convenio completa requiere backend.');
      return { ok: true, local: true, data: { legal: true, reasons } };
    }

    case 'validateConvenio': {
      const baseWorker = getWorkerById(snapshot, workerId);
      const reasons = [`Turno: ${current || '?'}`];
      const notes = workerNotes(baseWorker);
      if (notes) reasons.push(`Constraint personal: ${notes}`);

      // Constraint personal del propio trabajador.
      const cover = canCoverShift(baseWorker, current);
      if (!cover.ok) {
        return { ok: true, local: true, data: { legal: false, reasons: [...reasons, cover.reason] } };
      }

      // REGLA: tras noche, sólo noche o descanso/ausencia.
      if (NIGHT_SHIFTS.has(prev) && isNonNightWork(current)) {
        return {
          ok: true,
          local: true,
          data: { legal: false, reasons: [...reasons, 'Tras una noche solo se puede trabajar otra noche o descansar.'] }
        };
      }

      // REGLA: máx MAX_CONSECUTIVE_NIGHTS noches seguidas (contando el día actual).
      if (NIGHT_SHIFTS.has(current)) {
        const consec = countConsecutiveNightsEndingAt(snapshot, workerId, year, month1, day1);
        if (consec > MAX_CONSECUTIVE_NIGHTS) {
          return {
            ok: true,
            local: true,
            data: {
              legal: false,
              reasons: [...reasons, `Cadena de ${consec} noches consecutivas — máximo permitido ${MAX_CONSECUTIVE_NIGHTS}.`]
            }
          };
        }
      }

      reasons.push('Verificación local básica — convenio completo requiere backend.');
      return { ok: true, local: true, data: { legal: true, reasons } };
    }

    default:
      return { ok: false, error: `Acción no soportada localmente: ${action}`, local: true };
  }
}
