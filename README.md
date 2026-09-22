# ONG · agente de clasificación y acción — AI For Action, reto 01

Solución al reto ["¿Hasta dónde puedes llevar una ONG de una sola persona?"](https://aiforaction.tech) de AI For Action.

**Nota de envío**: esta ventana personal de 72 horas venció el 19 SEP 2026 sin
que se llegara a enviar el repo. El sistema estaba terminado y validado
antes de esa fecha; lo que faltó fue el paso de empaquetarlo y entregarlo a
tiempo. Queda publicado igual porque el organizador pidió ver el trabajo
aunque no llegara a la ventana, y porque es un resultado real, no un boceto.

## Qué funciona de verdad

Un pipeline determinista (sin LLM en el bucle de decisión) que recibe un
evento de la bandeja de una ONG y devuelve `clasificacion`
(`auto`/`aprobar`/`humano`) + `accion` concreta. Código en
[`ong/ngo_solver/`](ong/ngo_solver/), entrypoint en
[`ong/solucion.py`](ong/solucion.py).

**Puntuación sobre la semana pública, con el evaluador LLM real (no solo
reglas)**:

```json
{
  "puntuacion": 88.0,
  "sin_persona_bruto_pct": 88.0,
  "penalizacion_pct": 0.0,
  "intervencion_humana_pct": 12.0,
  "reparto": { "auto": 101, "aprobar": 18, "humano": 6 },
  "eventos": 125,
  "sin_responder": 0,
  "errores": 0,
  "detalle_errores": [],
  "evaluador_llm": "usado"
}
```

Es el techo teórico documentado en `RESULTADOS.md` del harness (101 `auto`
+ 18 `aprobar` a medio punto + 6 `humano`), con 0 errores confirmados por el
evaluador LLM de la rúbrica pública, no solo por las comprobaciones de
reglas de `score.py --no-llm`.

Para reproducirlo:

```bash
cd ong
python3 replay.py --cmd "python3 solucion.py" --salida respuestas.jsonl
python3 score.py --respuestas respuestas.jsonl --no-llm   # sin API key
python3 score.py --respuestas respuestas.jsonl            # con ANTHROPIC_API_KEY, evaluador real
```

### Cómo llega a ese número

- **Clasificación por tipo de evento**, no por texto memorizado: cada uno
  de los 14 tipos conocidos tiene un manejador con un nivel de cautela por
  defecto (`ngo_solver/actions.py`).
- **Extracción de datos reales del texto** (importe, referencia, día/fecha)
  con regex — nunca se inventa un dato; si falta el que hace falta para la
  acción por defecto, el propio manejador escala un nivel
  (`ngo_solver/extract.py`).
- **Capa de seguridad independiente del tipo** (`ngo_solver/safety.py`):
  palabras y patrones de vulnerabilidad, seguridad de menores, legal,
  conflicto interpersonal, reversión de dinero y condiciones/contrapartidas
  en donaciones. Solo puede subir el nivel de cautela, nunca bajarlo — la
  asimetría del marcador (equivocarse por exceso de confianza cuesta hasta
  12 puntos por evento; por exceso de cautela, cero) hace que esto sea
  siempre la apuesta correcta.
- **Validación de contrato** (`ngo_solver/models.py`): una respuesta
  marcada `auto` que delega ("voy a preguntar...") o con una acción vacía o
  demasiado vaga es inválida antes de llegar a `stdout`.

## Qué es exploración, no producción

No se probó un clasificador basado en LLM puro para este envío (quedó
como el "próximo experimento recomendado" al final de `ong/EXPERIMENTOS.md`,
no como código en este repo). La decisión de usar solo reglas deterministas
fue explícita, no por falta de tiempo para lo otro:

- **Auditable**: cada decisión trae su motivo exacto (ver el campo
  `motivos` interno en `ngo_solver/models.py`), sin depender de que un
  modelo "explique" post-hoc por qué hizo algo.
- **Sin riesgo de inventar**: la iteración documentada en
  `ong/EXPERIMENTOS.md` (experimentos 3-4) muestra en vivo el problema real
  de meter un LLM en el bucle de decisión — el evaluador rechazó acciones
  que afirmaban haber "reenviado un certificado fiscal" o "notificado a un
  grupo de voluntarios" cuando el evento no traía esos datos. Un sistema de
  reglas no tiene esa tentación: si el dato no está, no hay nada que
  inventar.
- **Determinista y gratis**: sin latencia de red ni coste por evento en el
  camino de clasificación (el harness sí usa un LLM, pero solo como
  auditor externo, no como parte del sistema).

## Qué fuentes se usaron

- El propio harness público de AI For Action
  ([`carlosgarcia-svg/ai-for-good-72h-harness`](https://github.com/carlosgarcia-svg/ai-for-good-72h-harness)):
  escenario de muestra, rúbrica del evaluador, script de puntuación.
- Ley 49/2002 de régimen fiscal de las entidades sin fines lucrativos y de
  los incentivos fiscales al mecenazgo (España) — referenciada de forma
  genérica en la respuesta a preguntas de donantes sobre desgravación
  fiscal, sin inventar cifras ni certificados específicos por donante.
- Ningún dataset externo de ONGs reales: todos los eventos de prueba
  (públicos y los ~60 casos sintéticos usados para el hardening, descritos
  en `ong/EXPERIMENTOS.md`) son sintéticos, generados para estresar el
  sistema, no datos de ninguna organización real.

## Historial de iteración

El detalle completo —qué se probó, qué falló, por qué, y qué se cambió—
está en [`ong/EXPERIMENTOS.md`](ong/EXPERIMENTOS.md): 6 experimentos, desde
reproducir el baseline (52.0) hasta el hardening final contra casos
sintéticos fuera de la semana pública.
