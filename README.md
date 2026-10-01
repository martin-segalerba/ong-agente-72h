# Auditor

La bandeja de entrada de una ONG de una o dos personas, clasificada en tres niveles —**auto** (lo resuelve el sistema), **aprobar** (lo prepara y una persona dice sí), **humano** (tiene que entrar una persona)— con un sistema que se corrige solo cada semana sin dejar de pedir permiso.

```
evento ─▶ reglas deciden ─▶ Jev audita ─▶ persona ve solo la señal fuerte
   ▲                                              │
   │     cada lunes: Opus propone cambios ◀───────┘ correcciones y confirmaciones
   │     se re-ejecuta todo el historial
   │     Jev audita lo que cambió, Opus revisa
   └──── una persona aprueba viendo diff + métricas crudas (con rollback)
```

## Cómo funciona

1. **Las reglas deciden.** Un motor determinista ([`lib/engine.ts`](lib/engine.ts)) evalúa reglas declarativas en orden. Las acciones solo pueden citar datos que extraen funciones fijas (importe, último importe, referencia, fecha, día, mes): una regla no puede inventar un dato. Las salvaguardas suben el nivel cuando el texto trae señales de riesgo (menores, conflictos, condiciones en una donación). Hay **límites duros en código** que el loop no puede tocar: casos de familias, denuncias, consultas legales y conflictos siempre van a una persona; facturas, repartos de dinero, subvenciones, informes y prensa nunca se resuelven en automático.
2. **Jev audita.** Cada decisión pasa por [Jev](https://docs.typesafe.ai) como una pregunta de opción única (`correcta` / `demasiado_cautelosa` / `demasiado_atrevida` / `accion_no_fundamentada`), con criterios calibrados contra la rúbrica pública del reto. El veredicto solo cuenta si su confianza supera el umbral de esa clase: por debajo es ruido.
3. **Una persona ve lo que importa.** Todo lo que es `humano` y `aprobar`, lo `auto` que Jev marca con señal fuerte y una auditoría aleatoria del 20 % de lo `auto`, para que la muestra de correcciones no dependa solo de lo que el sistema ya sospecha.
4. **Opus propone cada lunes** ([`lib/loop.ts`](lib/loop.ts)) con todo el historial: correcciones, decisiones confirmadas, señales débiles y propuestas rechazadas antes. La propuesta se valida contra el motor, se re-ejecutan **todos** los casos con la versión actual y la propuesta, Jev audita solo lo que cambia (los veredictos se cachean por decisión) y Opus revisa la comparación.
5. **Una persona decide con números.** La pestaña Mejoras muestra el diff de las reglas (SOP y JSON), las métricas crudas de ambas versiones y ejemplos de eventos que cambian. Dos condiciones bloquean: romper una decisión que una persona confirmó o aumentar los veredictos `demasiado_atrevida`. Toda versión se puede revertir.
6. **Los umbrales se recalibran.** Cada semana se busca el umbral que mejor separa errores reales de falsas alarmas entre los eventos revisados de cada clase (en empate gana el más alto, que interrumpe menos). Setup recomienda la media móvil de las últimas cuatro semanas.

## Qué es real y qué es simulado

| | |
| --- | --- |
| **Real** | Cada propuesta, revisión y veredicto del historial salió de llamadas reales a `claude-opus-5-5` y `jev-latest`. Los rechazos (`P-004`, `P-005`) los dispararon las métricas: ambas propuestas cambiaban decisiones ya confirmadas sobre repartos de dinero a una familia sin ingresos. |
| **Simulado** | Los eventos (generador con semilla en [`scripts/semanas.ts`](scripts/semanas.ts), con trampas: donaciones con condiciones, quejas con forma de pregunta, menores, un importe viejo y uno nuevo en el mismo texto, un plazo que cambia a mitad de semana). La persona que revisa entre S33 y S39 también es simulada: corrige según la etiqueta del generador y aprueba propuestas solo con las métricas. |
| **Para vos** | La semana S40 está en curso: sus acciones a aprobar, las reversiones y la propuesta `P-007` esperan a una persona de verdad. |

La **precisión real** se mide contra la etiqueta del generador, que ni las reglas, ni Jev, ni Opus ven. En producción no existiría; ahí el sistema se guía solo por las correcciones humanas y Jev.

## Resultados

| semana | reglas | eventos | precisión real | resuelto sin persona | correcciones |
| --- | --- | --- | --- | --- | --- |
| S33 | v1 | 36 | 63,9 % | 43,1 % | 11 |
| S34 | v2 | 36 | 72,2 % | 62,5 % | 7 |
| S35 | v3 | 36 | 97,2 % | 75,0 % | 0 |
| S36 | v4 | 36 | 88,9 % | 75,0 % | 2 |
| S37 | v4 | 38 | 92,1 % | 57,9 % | 2 |
| S38 | v4 | 36 | 88,9 % | 77,8 % | 2 |
| S39 | v5 | 36 | 97,2 % | 68,1 % | 1 |
| S40 (en curso) | v5 | 21 | 95,2 % | 73,8 % | — |

Las caídas de S36 y S38 coinciden con cambios en la mezcla de eventos (cierre de mes con muchas facturas, rotación de voluntariado): la distribución no es estacionaria a propósito.

| propuesta | cambio | estado |
| --- | --- | --- |
| P-001 | `voluntario_baja`: acusar recibo en auto de ausencias con día | aprobada |
| P-002 | salvaguarda: menores de edad y maltrato entre personas siempre a humano | aprobada |
| P-003 | `donante_acuse`: acuse sobrio en auto cuando el texto no trae importe | aprobada |
| P-004 | donaciones con condiciones o reembolsos fuera de auto | rechazada · rompía 2 decisiones confirmadas |
| P-005 | devoluciones y donaciones condicionadas a aprobar | rechazada · rompía 3 confirmadas y subía `demasiado_atrevida` |
| P-006 | devoluciones, cobros duplicados y condiciones a aprobar, citando el último importe | aprobada |
| P-007 | prensa en aprobar; bajas con supresión de datos en aprobar | pendiente |

## Ejecutarlo

```bash
npm install
npm run dev
```

La app funciona sin claves: el historial está en [`data/historial.json`](data/historial.json) y lo que hagas (aprobar, rechazar, revertir, cambiar umbrales o la pregunta de Jev) se guarda en tu navegador. "restablecer" lo borra.

Para regenerar las ocho semanas con el loop real (unos 20 minutos, centavos de Jev y algo menos de un dólar de Opus):

```bash
ANTHROPIC_API_KEY=... TYPESAFE_API_KEY=... npm run simulate
```

### Vercel

El despliegue funciona tal cual. El botón **Ejecutar el loop ahora** llama a `/api/loop`, que gasta créditos de Opus y Jev, así que viene desactivado. Para activarlo, en las variables de entorno del proyecto:

| variable | |
| --- | --- |
| `ANTHROPIC_API_KEY` | clave de Anthropic |
| `TYPESAFE_API_KEY` | clave de TypeSafe |
| `LOOP_EN_VIVO` | `1` para habilitar el endpoint |
| `LOOP_CLAVE` | opcional y recomendable: si está, el navegador la pide antes de ejecutar |

## Estructura

```
app/                 interfaz (Home, Setup, Logs, Mejoras) y /api/loop
components/          pestañas y tarjetas
lib/engine.ts        motor de reglas, extractores y límites duros
lib/jev.ts           auditoría con Jev y caché de veredictos
lib/opus.ts          propuesta y revisión con Opus, salida validada con zod
lib/loop.ts          una vuelta del loop
lib/metricas.ts      métricas, calibración de umbrales
scripts/             generador de semanas y simulación
data/                historial generado
ong/                 solución original al reto de AI For Action (Python, harness público)
```

La carpeta [`ong/`](ong/) contiene la primera versión: un pipeline de reglas en Python contra el harness público del reto ONG de AI For Action (88,0 en la semana pública, validado con el evaluador LLM). El historial de esa iteración está en [`ong/EXPERIMENTOS.md`](ong/EXPERIMENTOS.md); Auditor es lo que vino después.
