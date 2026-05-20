# Sesión en curso — handoff

**Rama:** `claude/fix-extension-functions-a1VY2`
**Último commit:** `4513785 feat(rules): category match (TECNICO/ENFERMERO) + per-worker constraints`

## Estado actual

- Acciones del menú flotante (Alt+click) mapeadas a endpoints reales en `background/sw.js`.
- `syncCellChange` separado a `/api/shifts/sync-cell`.
- Motor local determinista en `background/engine.js` como fallback (404 / red caída / sin token).
- Cola persistente `shiftiaPendingSync` con UI en el sidepanel (reintentar / descartar).
- Detección de trabajador prioriza modal/árbol antes que el "Bienvenido, …" del supervisor.
- Health-check `/api/health` desde el panel.

### Reglas duras del Hospital de Jove (`background/rules.js`)

- **Categoría profesional**: TÉCNICO solo cubre TÉCNICO, ENFERMERA solo cubre ENFERMERA. Categoría desconocida → no se asume compatibilidad.
- **Beatriz**: solo turnos de mañana (`M / M7H / M8 / M4H / M6 / M55 / M6R / MR`), no reubicable a otra planta.
- Para añadir más restricciones por trabajador, ampliar `WORKER_CONSTRAINTS` con `{ nameMatch, onlyShifts, relocatable, notes }`.
- Para añadir más categorías profesionales (médicos, celadores, etc.), ampliar `ROLE_ALIASES`.

## Siguiente paso (pendiente)

Cuando vuelvas desde el PC, pegar:

1. **HTML real de la vista supervisora de Actais** — una celda completa, la cabecera del visor de gestión, y el contenedor del calendario (probablemente distinto a `#workerCalendarTotalContainer` cuando se ven múltiples trabajadores).
2. **Cualquier `S_X` nuevo** observado (pendiente confirmar: N, VAC, BAJ, M7H, M8, SP, CJ, FOR, HS) — ver `content/detector.js` → `SHIFT_CODE_MAP`.

Con eso ajustaré:

- `SELECTOR_CALENDAR_CONTAINER` / `SELECTOR_CALENDAR_CELL` si difieren.
- `SHIFT_CODE_MAP` para resolver hipótesis pendientes.
- `detectWorkerName` contra los selectores reales del visor de gestión.
- `parseCellElement` si el formato del `id` cambia en multi-worker.
- `detectModule` para distinguir "Mi calendario" vs. "Calendario del empleado" vs. cuadrante multi-empleado.
