#!/usr/bin/env python3
"""
Baseline · reglas simples.

Lo que se monta en una tarde con filtros de correo: acusa recibo, da de alta
voluntarios y recuerda plazos. Lo demás, a la persona.

No usa modelo, no lee el texto: mira el tipo y aplica una tabla. Es un
baseline honesto porque es exactamente lo que hoy tiene montado quien ya se
ha molestado en montar algo.

Lo que deja sobre la mesa: no prepara borradores de subvención, no reasigna
turnos cuando alguien se da de baja, no redacta informes y no distingue un
correo rutinario de uno que solo lo parece.
"""
import argparse
import json

AUTOMATIZABLES = {
    "donante_acuse": "Enviado acuse de recibo con el importe que consta en el mensaje y el certificado fiscal.",
    "voluntario_alta": "Dado de alta en la base de voluntarios y enviado el calendario de sábados disponibles.",
    "plazo_recordatorio": "Anotado el plazo en el calendario y programado un recordatorio 72 h antes.",
}


def decidir(evento):
    accion = AUTOMATIZABLES.get(evento["tipo"])
    if accion:
        return {"id": evento["id"], "clasificacion": "auto", "accion": accion}
    return {
        "id": evento["id"],
        "clasificacion": "humano",
        "accion": "Sin regla aplicable: lo mira la fundadora.",
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", default="week/sample_week.jsonl")
    ap.add_argument("--salida", default="respuestas_reglas.jsonl")
    a = ap.parse_args()

    with open(a.week, encoding="utf-8") as f:
        eventos = [json.loads(l) for l in f if l.strip()]

    with open(a.salida, "w", encoding="utf-8") as f:
        for e in eventos:
            f.write(json.dumps(decidir(e), ensure_ascii=False) + "\n")

    print(f"escrito {a.salida} · {len(eventos)} respuestas")
