#!/usr/bin/env python3
"""
Baseline · todo a la persona.

El suelo. Es lo que pasa hoy en la mayoría de esas 28.000 organizaciones: la
misma persona lo mira todo. Cero automatización, cero errores, cero tiempo
libre.

Sirve para fijar el 0 y para que el número de arriba signifique algo.
"""
import argparse
import json

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", default="week/sample_week.jsonl")
    ap.add_argument("--salida", default="respuestas_todo_humano.jsonl")
    a = ap.parse_args()

    with open(a.week, encoding="utf-8") as f:
        eventos = [json.loads(l) for l in f if l.strip()]

    with open(a.salida, "w", encoding="utf-8") as f:
        for e in eventos:
            f.write(json.dumps({
                "id": e["id"],
                "clasificacion": "humano",
                "accion": "Lo mira la fundadora.",
            }, ensure_ascii=False) + "\n")

    print(f"escrito {a.salida} · {len(eventos)} respuestas")
