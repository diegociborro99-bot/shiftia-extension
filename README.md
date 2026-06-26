# Shiftia Extension

Extensión de Chrome (Manifest V3) que convierte Shiftia en un asistente dentro de **Actais** (`personal.hospitaldejove.com`). Tres caras: **Consejero**, **Secretario**, **Sabio**. Sin coste por consulta — toda la lógica corre en el backend de Shiftia.

## Instalar en modo desarrollador

1. Abre `chrome://extensions`.
2. Activa **Modo desarrollador** arriba a la derecha.
3. **Cargar descomprimida** → selecciona esta carpeta.
4. La extensión queda fijada. Para usarla, abre Actais y haz clic en el icono o pulsa el atajo del panel lateral.

## Estructura

```
manifest.json              ← Manifest V3
background/sw.js           ← Service worker: orquesta y llama al backend
content/detector.js        ← Lee el DOM de Actais (MutationObserver)
content/page-bridge.js     ← Inyectado en page-world para acceder a window.actaisApp y dxDataGrid
content/overlay.css        ← Estilos de badges encima de Actais
shared/month-assembler.js  ← (puro) celdas parseadas → planilla mensual; testeado en Node
shared/prompt-builder.js   ← (puro) system prompt para la IA local; testeado en Node
sidepanel/index.html       ← UI del panel lateral (Asistente · Chat · Importar)
sidepanel/index.js         ← Lógica del panel
sidepanel/nano.js          ← Chat con IA local (Gemini Nano, Chrome Prompt API)
sidepanel/styles.css       ← Estilo del panel
tests/                     ← Asserts de las funciones puras (node tests/*.test.js)
icons/                     ← Placeholders (16/48/128 px)
```

## Backend esperado

La extensión llama a `https://shiftia-production.up.railway.app/api/assistant/<action>`. Acciones previstas en MVP:

| Acción | Cara | Qué hace |
|---|---|---|
| `canChange` | Consejero | ¿El día seleccionado se puede cambiar sin romper convenio? |
| `suggestReplacement` | Consejero | Devuelve top-3 sustitutos con `whyChosen` |
| `validateConvenio` | Consejero | Pasa los validadores existentes contra el turno actual |
| `fragilePlantas` | Consejero | Llama a `detectFragilePlantas(7)` y devuelve ranking |
| `draftWhatsApp` | Secretario | Plantilla rellena con datos del worker y día |
| `draftReplacementRequest` | Secretario | Texto listo para pegar en formulario Actais |
| `weeklySummary` | Secretario | Resumen del estado de la planta para RR.HH. |
| `conv_*` | Sabio | Consultas deterministas al JSON estructurado del convenio |
| `historyOnCase` | Sabio | Busca casos similares resueltos antes |

Estos endpoints **se montarán a continuación en `shiftia/server.js`**. Mientras tanto, los botones del panel responden con `HTTP 404` (esperado en esta fase).

## IA local (chat)

La pestaña **Chat** usa Gemini Nano vía la Prompt API de Chrome (138+): el modelo corre **en el equipo**, sin red y sin coste. El system prompt incluye el contexto detectado, el último mes escaneado y las reglas de convenio. Primera vez: Chrome descarga el modelo (~2 GB) una sola vez. Si el equipo no lo soporta, la pestaña lo indica y el resto de la extensión funciona igual.

## Importar desde la web

En **Importar → Importar desde la web**: con la planilla del trabajador abierta en Actais, pulsa *Escanear mes visible*. La extensión lee el DOM, lo compara con Shiftia (`syncWorkerMonth` con `dryRun`) y muestra el diff celda a celda. Solo se vuelca al confirmar; los volcados que vacían >3 celdas siguen bloqueados salvo que marques *Permitir vaciar*.

## Sin coste por consulta

Toda la lógica usa el motor IA determinista de Shiftia (`scoreCandidate`, `isLegalAssignment`, `detectFragilePlantas`, `validateAssignment`, etc.). No hay llamadas a Claude/OpenAI/etc. en el flujo principal. El chat libre corre 100% on-device con Gemini Nano: tampoco genera coste por consulta.

## RGPD / privacidad

- Solo se activa en `*.hospitaldejove.com`. Nunca lee otras pestañas.
- No envía screenshots ni texto literal a terceros.
- El backend usa HTTPS con auth Bearer.
- Datos de pacientes no se procesan: la extensión solo trabaja con planificación de turnos.

## Próximos pasos

- [ ] Iconos definitivos (16/48/128).
- [ ] Endpoints `/api/assistant/*` en backend Shiftia.
- [ ] Detector de contexto: sample HTML de calendario de trabajador.
- [ ] Distribución privada para el hospital (CRX firmado + auto-update).
