# Catálogo de turnos de Actais (Hospital de Jove)

Confirmados con PDFs de planificación anual (AVANZAS FERNANDEZ, SARA y CALVO FERNANDEZ, LAURA — año 2026).

## Turnos productivos

| Código | Nombre completo en Actais | Horas | Categoría | Visual esperado |
|---|---|---|---|---|
| M    | Mañana (genérica)      | variable | trabajo | verde |
| M7H  | Mañanas 07:00–14:00    | 7h | trabajo (reducida) | verde claro |
| M8   | Mañanas 07:00–15:00    | 8h | trabajo | verde oscuro |
| M4H  | Mañanas 08:00–12:00    | 4h | trabajo (reducida) | verde claro |
| M6   | Mañanas 08:00–14:00    | 6h | trabajo (reducida) | verde claro |
| M55  | Mañana 5,5h            | 5.5h | trabajo (reducida) | verde claro |
| M6R  | Mañana 6h reducida     | 6h | trabajo (reducida) | verde claro |
| MR   | Mañana reducida        | — | trabajo (reducida) | verde claro |
| T    | Tardes 15:00–22:00     | 7h | trabajo | azul claro |
| N    | Noches 22:00–08:00     | 10h | trabajo | azul oscuro / morado |

## Descansos y sin asignación

| Código | Nombre | Visual |
|---|---|---|
| D    | Descanso              | rojo |
| SP   | Sin Planificar        | **gris** |
| L    | Libre                 | (a confirmar) |
| LD   | Libre Disposición     | (a confirmar) |
| FN   | Festivo Nacional      | (a confirmar) |

## Ausencias y permisos

| Código | Nombre |
|---|---|
| VAC | Vacaciones |
| VAN | Vacaciones arrastradas año nuevo |
| VAA | Vacaciones año anterior |
| BAJ | Baja |
| LAC | Lactancia |
| AE  | Asuntos externos / propios |
| EX  | Excedencia |
| PM  | Permiso |
| MTC | Motivo familiar |

## Cómputo de jornada

| Código | Nombre | Notas |
|---|---|---|
| CJ  | Cómputo de Jornada del año en curso | descanso compensatorio |
| CAA | Cómputo Año Anterior | horas heredadas |
| DLA | Días Libre Disposición Año Anterior | |

## Otros

| Código | Nombre |
|---|---|
| FOR | Formación |
| HS  | Horas Sindicales |
| HF  | Horas Festivas (a confirmar) |
| INT | Intervención (probable quirófano) |
| IQF | (sin confirmar) |

## Guardias (sufijo, se combinan con turno principal)

Aparecen DEBAJO del turno principal en formato `{turno}/G17` o `{turno}/G24`:

| Código | Nombre |
|---|---|
| G17 | Guardia 17h |
| G24 | Guardia 24h |

## Variables anuales de convenio (no son turnos sino contadores)

Aparecen en la página 2 del PDF de planificación anual:

- Días de Vacaciones (X / 30)
- Días de Libre Disposición (X / 6)
- Días de Formación (X / 7)
- Vacaciones del año anterior (X / 0)
- Días Libre Disposición Año Anterior (X / 0)
- Días Adicionales de Vacaciones (X / 2 o 3 según antigüedad)
- Días Adicionales de Libre Disposición (X / 2 o 3 según antigüedad)
- Motivos familiares de fuerza mayor (X / 28)
- Permiso de acompañamiento (X / 10)

## Cómputo final del año

- Jornada anual efectiva s/convenio [A]: 1519h
- Reducción de jornada por noches realizadas [B]: nº noches × horas/noche × coef. convenio
- Reducción de jornada por antigüedad [C]: (días adicionales vacaciones + libre disp.) × 7h
- Jornada anual efectiva a realizar [D] = (A − B − C) × coef. jornada
- Jornada anual teórica realizada [E]: suma de la cartelera
- Cómputo anual de jornada [J] = E + F + G − D + H − I
  - Si J > 0: saldo favorable al trabajador.
  - Si J < 0: el trabajador adeuda horas.
