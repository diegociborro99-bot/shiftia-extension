# Muestras reales del calendario de Actais (18-may-2026)

## Estructura de una celda de día

ID format: `{workerId}_{DD-MM-YYYY}` ej: `1122_27-04-2026`

Clases observadas:
- `month-calendar-cell` (base)
- `cssClass` (estilo común)
- `with-contract` / `other-month` / `last-column-cell` / `last-row-cell` / `ui-selected`
- `S_1` (Mañanas), `S_10` (Descanso), `S_30` (Tardes) — pendiente confirmar `S_X` para noches/vacaciones
- `Status_10` (estado de la entrada)

Atributos:
- `id="WORKERID_DD-MM-YYYY"`
- `data-item="N"` (índice ordinal en el mes)
- `idprogrammedcalendar="NNNNNNN"` (PK interna de Actais)
- `style="background-color: rgb(R,G,B)"` (color del turno)

Estructura interna:
```html
<div class="p1">
  <div class="schedule">Mañanas 08:00 - 15:00</div>
  <div class="day"><span>27</span></div>  <!-- .today si es hoy -->
  <div class="planification">Asignado manualmente | Cuadrante Múltiples Empleados - Ciclo 1 - ...</div>
</div>
<div class="p2">
  <div class="punches-container">
    <div class="move">[E] 07:39 - [S] 15:03</div>
  </div>
  <div class="info-container" hidden>
    <div class="other-department"/>
    <div class="other-center"/>
    <div class="shift-change"/>
    <div class="guard"/>
    <div class="tasks"/>
    <div class="punch_history"/>
    <div class="daily-locations"/>
  </div>
</div>
<div class="p3"></div>
```

## Mapeo confirmado

| Clase | Código Shiftia | Texto | Color RGB |
|-------|---------------|-------|-----------|
| S_1   | M             | Mañanas 08:00 - 15:00 | rgb(32, 121, 121) verde |
| S_10  | D             | Descanso              | rgb(166, 32, 32) rojo |
| S_30  | T             | Tardes 15:00 - 22:00  | rgb(204, 217, 242) azul claro |
| S_?   | N             | Noches (pendiente confirmar) | ? |
| S_?   | VAC           | Vacaciones (pendiente) | ? |

## Contenedores

- `#workerCalendarTotalContainer` — modal completo
- `#MonthTable` — vista mensual
- `#AnnualContent` — vista anual (oculta por defecto)
- `.month-calendar-header` — fila Lun-Dom
- `.month-calendar-cell` — cada día del mes
