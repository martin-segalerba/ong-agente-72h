# ONG · cuánto puede funcionar sin que nadie lo toque

## En un comando

```bash
python3 baseline_reglas.py
python3 score.py --respuestas respuestas_reglas.jsonl --no-llm
```

## Qué hay aquí

| fichero | qué es |
| --- | --- |
| `week/sample_week.jsonl` | La semana pública. Un evento por línea, con su clasificación correcta en `esperado`. |
| `replay.py` | Reproduce la semana contra tu sistema y escribe tus respuestas. |
| `score.py` | La puntuación. Reglas primero, evaluador LLM después. |
| `rubric.md` | El prompt literal del evaluador. Público a propósito. |
| `baseline_todo_humano.py` | El suelo: 100 % de intervención humana. |
| `baseline_reglas.py` | Lo que se monta en una tarde con filtros de correo. |
| `generar_semana.py` | Cómo se generó la semana. Determinista. |

## El contrato

Tu sistema recibe un evento y devuelve dos cosas:

```json
{"id": "e042", "clasificacion": "auto", "accion": "Enviado acuse con el importe y el certificado fiscal."}
```

`clasificacion` es `auto`, `aprobar` o `humano`. `accion` es lo que has hecho
o propuesto, en una frase que otra persona pueda revisar.

`replay.py` habla con tu sistema por CLI o por HTTP; está documentado con
`--help`.

## Cómo se puntúa

```
puntuacion = % resuelto sin persona − penalización por errores
```

Resuelto sin persona pondera `auto` a 1 y `aprobar` a 0,5: preparar algo para
que alguien diga sí también ahorra tiempo, pero no todo.

Quedarse corto **no penaliza**. Pedir ayuda de más cuesta tiempo, no
confianza. Atreverse de más sí: 4 puntos por bajar un escalón y 12 por
saltarse dos. Y toda acción marcada `auto` que no pase la revisión cuenta
como error grave y además deja de contar como resuelta.

Por qué así: la métrica «% de intervención humana» sola se optimiza marcando
todo como autónomo. Con esto, esa estrategia saca **0,0**. Ver
[RESULTADOS.md](RESULTADOS.md).

## El evaluador

Necesita `ANTHROPIC_API_KEY`. Sin ella, `score.py` avisa y corre solo con
reglas; para desarrollar, usa `--no-llm` y ahórrate las llamadas.

El prompt está entero en `rubric.md` y se manda tal cual. Si el evaluador es
público, tiene que ser auditable entero.

## La semana oculta

La puntuación final se calcula sobre otra semana, con otra distribución y dos
trampas: un correo que parece rutinario y no lo es, y un plazo que cambia a
mitad de semana. Mismo `score.py`, misma rúbrica.
