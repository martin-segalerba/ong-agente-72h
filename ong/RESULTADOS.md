# Baselines · ONG · semana pública `sample_week`

```
python3 baseline_todo_humano.py && python3 score.py --respuestas respuestas_todo_humano.jsonl --no-llm
python3 baseline_reglas.py      && python3 score.py --respuestas respuestas_reglas.jsonl --no-llm
```

| | todo a la persona | reglas simples |
| --- | --- | --- |
| **Intervención humana** | **100 %** | **48 %** |
| Puntuación | 0,0 | 52,0 |
| Penalización | 0 | 0 |
| Errores | 0 | 0 |

125 eventos: 101 automatizables, 18 que necesitan un «ok» y 6 que exigen que
entre una persona. El techo teórico es 88 % resuelto sin persona (los `auto`
enteros más medio punto por cada `aprobar`), así que entre las reglas simples
y el techo hay 36 puntos.

Lo que las reglas no cogen y es donde está el reto: recolocar turnos cuando
alguien se da de baja, contestar preguntas de donantes que hay que leer,
preparar borradores de subvención y distinguir un correo rutinario de uno que
solo lo parece.

## La comprobación que importa

Un sistema que marca **los 125 eventos como autónomos** —la forma obvia de
sacar un 100 %— saca **0,0**:

| | tramposo |
| --- | --- |
| Sin persona, en bruto | 92,8 % |
| Penalización | −252,0 |
| **Puntuación** | **0,0** |
| Errores detectados | 33 |

Y eso solo con las reglas, sin evaluador LLM. Mentir sale más caro que pedir
ayuda: ese es todo el diseño de la métrica.
