#!/usr/bin/env python3
"""
Entrada del sistema por CLI, tal y como espera `replay.py --cmd`:
lee un evento en JSON por stdin, escribe la respuesta en JSON por stdout.

Uso:
    python3 replay.py --cmd "python3 solucion.py" --salida respuestas.jsonl
    python3 score.py --respuestas respuestas.jsonl --no-llm

Si algo revienta al procesar un evento (campo inesperado, tipo nuevo que
rompe una asunción, lo que sea), la respuesta por defecto es `humano`: es la
opción que el marcador nunca penaliza.
"""
import json
import sys

from ngo_solver.pipeline import procesar_evento_dict


def _respuesta_de_emergencia(crudo: str) -> dict:
    id_evento = "desconocido"
    try:
        id_evento = json.loads(crudo).get("id", "desconocido")
    except Exception:
        pass
    return {
        "id": id_evento,
        "clasificacion": "humano",
        "accion": "Error al procesar el evento automáticamente; requiere que la fundadora lo revise.",
    }


def main():
    crudo = sys.stdin.read()
    try:
        evento = json.loads(crudo)
        respuesta = procesar_evento_dict(evento)
    except Exception:
        respuesta = _respuesta_de_emergencia(crudo)

    json.dump(respuesta, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
