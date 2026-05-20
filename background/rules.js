// Reglas duras del Hospital de Jove. Estas restricciones NO son bonificaciones
// de puntuación — son filtros que excluyen completamente al candidato.
// Se centralizan aquí para que cuando el backend tenga su propio motor
// determinista las migremos en bloque a `shiftia/rules.js`.

// Categorías profesionales. Una TÉCNICO solo cubre TÉCNICO, una ENFERMERA solo
// cubre ENFERMERA. Sin esta regla un día sin enfermeras se "cubriría" con
// técnicos, lo cual es ilegal y peligroso clínicamente.
const ROLE_ALIASES = {
  TECNICO: ['TECNICO', 'TÉCNICO', 'TECNICA', 'TÉCNICA', 'TCAE', 'TCE', 'AUXILIAR DE ENFERMERIA', 'AUX ENFERMERIA'],
  ENFERMERO: ['ENFERMERO', 'ENFERMERA', 'ENFERMERO/A', 'ENFERMERA/O', 'DUE', 'GRADUADO EN ENFERMERIA', 'GRADO ENFERMERIA', 'ENFERMERÍA']
};

function normalizeRole(category) {
  if (!category) return null;
  const upper = String(category).toUpperCase();
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.some(a => upper.includes(a))) return role;
  }
  return null; // si no reconocemos la categoría, no asumimos compatibilidad
}

// Compatibilidad de roles: solo true cuando ambos tienen rol conocido y coinciden.
// Si alguno es desconocido devolvemos false para no mezclar categorías por error.
export function rolesAreCompatible(workerA, workerB) {
  const ra = normalizeRole(workerA?.category || workerA?.role || workerA?.puesto || workerA?.categoria);
  const rb = normalizeRole(workerB?.category || workerB?.role || workerB?.puesto || workerB?.categoria);
  if (!ra || !rb) return false;
  return ra === rb;
}

export function getRole(worker) {
  return normalizeRole(worker?.category || worker?.role || worker?.puesto || worker?.categoria);
}

// Constraints específicos por trabajador. Coincidencia por nombre (case-insensitive,
// fragmento). Idealmente esto se persistiría en el backend; por ahora hardcoded.
//
// - onlyShifts:   conjunto cerrado de turnos que puede cubrir. Vacío = sin
//                 restricción.
// - relocatable:  false = no se le puede asignar como cobertura cross-plant.
const WORKER_CONSTRAINTS = [
  {
    nameMatch: /\bBEATRIZ\b/i,
    onlyShifts: new Set(['M', 'M7H', 'M8', 'M4H', 'M6', 'M55', 'M6R', 'MR']),
    relocatable: false,
    notes: 'Solo mañanas, no reubicable a otra planta.'
  }
];

function findConstraint(worker) {
  if (!worker?.name) return null;
  return WORKER_CONSTRAINTS.find(c => c.nameMatch.test(worker.name)) || null;
}

// ¿Este trabajador puede cubrir un turno dado?
// Devuelve { ok: boolean, reason?: string }.
export function canCoverShift(worker, targetShift) {
  const c = findConstraint(worker);
  if (!c) return { ok: true };
  if (c.onlyShifts && targetShift && !c.onlyShifts.has(targetShift)) {
    return { ok: false, reason: `${worker.name}: ${c.notes || 'restringido a otros turnos'} (turno ${targetShift} no permitido)` };
  }
  return { ok: true };
}

// ¿Este trabajador es reubicable a una planta distinta de la suya?
export function isRelocatable(worker) {
  const c = findConstraint(worker);
  return c ? c.relocatable !== false : true;
}

export function workerNotes(worker) {
  const c = findConstraint(worker);
  return c?.notes || null;
}
