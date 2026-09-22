#!/usr/bin/env python3
"""
Reproduce la semana contra tu sistema.

Dos formas de conectarlo, las dos con el mismo contrato:

    python3 replay.py --cmd "python3 mi_sistema.py"
    python3 replay.py --http http://localhost:8000/evento

Por CLI: tu programa recibe un evento en JSON por stdin y escribe la
respuesta en JSON por stdout, una llamada por evento.

Por HTTP: un POST con el evento en el cuerpo y la respuesta en JSON.

Los eventos llegan en orden cronológico. El campo `esperado` se retira antes
de enviártelos: en la semana pública está en el fichero para que puedas
depurar, pero tu sistema no lo ve —y en la oculta no existe.
"""
import argparse
import json
import subprocess
import sys
import urllib.request


def por_cli(comando, evento):
    salida = subprocess.run(
        comando, shell=True, input=json.dumps(evento, ensure_ascii=False),
        capture_output=True, text=True, timeout=120,
    )
    if salida.returncode != 0:
        print(f"[aviso] {evento['id']}: tu sistema ha fallado: {salida.stderr[:200]}", file=sys.stderr)
        return None
    return json.loads(salida.stdout)


def por_http(url, evento):
    peticion = urllib.request.Request(
        url,
        data=json.dumps(evento, ensure_ascii=False).encode(),
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(peticion, timeout=120) as r:
        return json.loads(r.read())


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--week", default="week/sample_week.jsonl")
    ap.add_argument("--cmd")
    ap.add_argument("--http")
    ap.add_argument("--salida", default="respuestas.jsonl")
    a = ap.parse_args()

    if not a.cmd and not a.http:
        ap.error("hace falta --cmd o --http")

    with open(a.week, encoding="utf-8") as f:
        eventos = [json.loads(l) for l in f if l.strip()]

    fallos = 0
    with open(a.salida, "w", encoding="utf-8") as f:
        for evento in eventos:
            # Tu sistema nunca ve la respuesta correcta.
            visible = {k: v for k, v in evento.items() if k != "esperado"}
            try:
                respuesta = por_cli(a.cmd, visible) if a.cmd else por_http(a.http, visible)
            except Exception as e:
                print(f"[aviso] {evento['id']}: {e}", file=sys.stderr)
                respuesta = None

            if not respuesta:
                fallos += 1
                continue

            respuesta["id"] = evento["id"]
            f.write(json.dumps(respuesta, ensure_ascii=False) + "\n")

    print(f"escrito {a.salida} · {len(eventos) - fallos}/{len(eventos)} respondidos")
