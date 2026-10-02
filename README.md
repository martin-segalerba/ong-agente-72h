# Auditor

La bandeja de entrada de una ONG de una o dos personas, clasificada en tres niveles —**auto** (lo resuelve el sistema), **aprobar** (lo prepara y una persona dice sí), **humano** (tiene que entrar una persona)— con un sistema que se corrige solo cada semana sin dejar de pedir permiso.

```
evento ─▶ reglas deciden ─▶ Jev audita ─▶ persona ve solo la señal fuerte
   ▲                                              │
   │     cada lunes: Opus propone cambios ◀───────┘ correcciones y confirmaciones
   │     se re-ejecuta todo el historial
   │     Jev audita lo que cambió, Sonnet revisa
   └──── una persona aprueba viendo diff + métricas crudas (con rollback)
```

## Cómo funciona

1. **Las reglas deciden.** Un motor determinista ([`lib/engine.ts`](lib/engine.ts)) evalúa reglas declarativas en orden. Las acciones solo pueden citar datos que extraen funciones fijas (importe, último importe, referencia, fecha, día, mes): una regla no puede inventar un dato. Las salvaguardas suben el nivel cuando el texto trae señales de riesgo. Hay **límites duros en código** que el loop no puede tocar: casos de familias, denuncias, consultas legales y conflictos siempre van a una persona; facturas, repartos de dinero, subvenciones, informes y prensa nunca se resuelven en automático.
2. **Jev audita** ([`lib/jev.ts`](lib/jev.ts)). Cada decisión recibe, en una sola llamada, un veredicto de opción única (`correcta` / `demasiado_cautelosa` / `demasiado_atrevida` / `accion_no_fundamentada`) y una pregunta Noul: «¿este evento necesita que una persona lo vea antes de actuar?».
3. **Una persona ve lo que importa.** Todo lo `humano` y lo de `aprobar`, lo `auto` donde la Noul supera el umbral (0,6) y una auditoría al azar del 20 % de lo `auto`. Lo que queda sin tocar al cerrar una semana con revisiones se asume correcto, pero solo como dato informativo: no bloquea propuestas ni calibra umbrales.
4. **Opus propone cada lunes** ([`lib/loop.ts`](lib/loop.ts)) con todo el historial: correcciones, decisiones confirmadas, señales débiles y propuestas rechazadas antes, **con las decisiones confirmadas que cada una rompía**. La propuesta se valida contra el motor, se re-ejecutan **todos** los casos con la versión actual y la propuesta, y Jev audita solo lo que cambia.
5. **Otro modelo revisa.** Sonnet 5.5 compara las métricas de las dos versiones: Opus no se juzga a sí mismo.
6. **Una persona decide con números.** La pestaña Mejoras muestra el diff de las reglas (SOP y JSON), las métricas crudas de ambas versiones y ejemplos de eventos que cambian. Bloquean dos cosas: cambiar una decisión que una persona confirmó, o subir los veredictos `demasiado_atrevida` sumados por confianza. Toda versión se puede revertir, y una propuesta armada sobre otra versión no se puede aprobar.
7. **Los umbrales se recalibran** con los eventos revisados de cada semana, y Setup muestra con cuántas revisiones y errores sale cada recomendado.

## Qué es real y qué es simulado

| | |
| --- | --- |
| **Real** | Cada veredicto del historial es una llamada real a `jev-latest`. Las propuestas y revisiones las escribieron Opus y Sonnet como **subagentes de una sesión de Claude Code**, a ciegas: cada uno leyó solo el pedido exacto que mandaría la API (sin el repositorio, sin las etiquetas del generador, sin el banco de evaluación) y devolvió el JSON pedido. Las respuestas quedaron grabadas en [`data/respuestas/`](data/respuestas/) y la simulación es reproducible con ellas, sin costo de API. |
| **Simulado** | Los eventos (generador con semilla en [`scripts/semanas.ts`](scripts/semanas.ts), con trampas: donaciones con condiciones, quejas con forma de pregunta, menores, un importe viejo y uno nuevo en el mismo texto, un plazo que cambia a mitad de semana). La persona que revisa entre S33 y S39 también es simulada: corrige según la etiqueta del generador y aprueba propuestas solo con las métricas. |
| **Para vos** | La semana S40 está en curso: sus acciones a aprobar, las reversiones y la propuesta `P-007` esperan a una persona de verdad. |

## Resultados

Dos precisiones, ambas contra la etiqueta del generador, que no ve ningún componente del loop:
- **frases vistas:** los mismos textos de los que aprende el loop;
- **frases nuevas:** 30 paráfrasis por semana que el loop nunca lee. La distancia entre las dos es cuánto memoriza en vez de generalizar.

| semana | reglas | eventos | precisión en frases vistas | en frases nuevas | resuelto sin persona |
| --- | --- | --- | --- | --- | --- |
| S33 | v1 | 36 | 63,9 % | 56,7 % | 43,1 % |
| S34 | v2 | 36 | 69,4 % | 70,0 % | 56,9 % |
| S35 | v2 | 36 | 75,0 % | 60,0 % | 63,9 % |
| S36 | v3 | 36 | 69,4 % | 76,7 % | 52,8 % |
| S37 | v4 | 38 | 89,5 % | 83,3 % | 48,7 % |
| S38 | v5 | 36 | 94,4 % | 90,0 % | 75,0 % |
| S39 | v6 | 36 | 100 % | 86,7 % | 69,4 % |
| S40 (en curso) | v6 | 21 | 95,2 % | 83,3 % | 73,8 % |

**La red de seguridad.** Entre S33 y S39 hubo 10 decisiones `auto` incorrectas; **8 llegaron a una persona** (7 por la señal de Jev, 1 por la auditoría al azar), con 2 falsas alarmas sobre 115 `auto` correctos. La pregunta Noul se eligió midiendo: sobre el historial anterior detectaba 12 de 13 errores sin falsas alarmas, contra 2 de 13 del veredicto de opción única con confianza alta. Una pregunta sobre «daño si falla» no separaba errores de aciertos y se descartó.

| propuesta | cambio | estado |
| --- | --- | --- |
| P-001 | salvaguarda de menores; donaciones con condición a aprobar; ausencias de voluntarios en auto | aprobada |
| P-002 | conflictos en bajas de voluntarios; citar el último importe; consultas de donantes a aprobar | rechazada · cambiaba 2 quejas confirmadas como `humano` |
| P-003 | lo mismo, sin tocar las quejas que señaló el rechazo | aprobada |
| P-004 | consultas fiscales en auto (sin quejas); cifras propias y devoluciones a aprobar | aprobada |
| P-005 | acuse sobrio sin importe; plazos relativos o cambiados a aprobar | aprobada |
| P-006 | reparto entre programas, prensa y borrado de datos a aprobar | aprobada |
| P-007 | quejas dentro de un acuse y altas con colectivos vulnerables a una persona | pendiente · Sonnet no ve mejora |

## Costo

La regeneración no usó saldo de la API de Anthropic: las respuestas de los modelos vinieron de subagentes en una sesión de Claude Code. Jev cobra $0,042 por millón de tokens de entrada, así que ocho semanas cuestan centavos. Por la API, cada propuesta registra sus tokens y su costo (Opus 5.5 a $4/$20 por millón para proponer, Sonnet 5.5 a $2/$10 para revisar) y Mejoras lo muestra.

## Ejecutarlo

```bash
npm install
npm run dev
```

La app funciona sin claves: el historial está en [`data/historial.json`](data/historial.json) y lo que hagas (aprobar, rechazar, revertir, marcar como correcto, cambiar umbrales o las preguntas de Jev) se guarda en tu navegador. «restablecer» lo borra.

Para reproducir el historial con las respuestas grabadas (solo llama a Jev; la caché lo hace casi instantáneo):

```bash
RESPUESTAS_DIR=data/respuestas TYPESAFE_API_KEY=... npm run simulate
```

Sin `RESPUESTAS_DIR`, la simulación llama a la API de Anthropic (`ANTHROPIC_API_KEY`). Los modelos se cambian con `MODELO_PROPUESTA` y `MODELO_REVISION`.

### Vercel

El despliegue funciona tal cual. El botón **Ejecutar el loop ahora** llama a `/api/loop`, que gasta créditos de Anthropic y Jev, así que viene desactivado. Para activarlo, en las variables de entorno del proyecto:

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
lib/jev.ts           auditoría con Jev (opción única + Noul) y caché de veredictos
lib/opus.ts          propuesta (Opus) y revisión (Sonnet), salida validada con zod; modo de respuestas grabadas
lib/loop.ts          una vuelta del loop
lib/metricas.ts      métricas, señal fuerte y calibración de umbrales
scripts/             generador de semanas, banco de evaluación y simulación
data/                historial generado y respuestas grabadas
ong/                 solución original al reto de AI For Action (Python, harness público)
```

La carpeta [`ong/`](ong/) contiene la primera versión: un pipeline de reglas en Python contra el harness público del reto ONG de AI For Action (88,0 en la semana pública, validado con el evaluador LLM). El historial de esa iteración está en [`ong/EXPERIMENTOS.md`](ong/EXPERIMENTOS.md); Auditor es lo que vino después.
