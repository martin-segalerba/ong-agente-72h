#!/usr/bin/env python3
"""
Puntuación del reto de la ONG.

    puntuacion = % de eventos resueltos sin persona − penalización por errores

La métrica es «cuánta intervención humana hace falta», y baja es mejor. Pero
el número solo, sin más, se optimiza trivialmente: marca todo como autónomo y
saca un 100 %. Por eso la clasificación se corrige.

Cómo se corrige cada evento
---------------------------
Tu sistema declara, para cada evento, `clasificacion` (auto / aprobar /
humano) y `accion` (lo que hiciste o propusiste). El harness compara contra
la clasificación correcta:

  · acertada          → cuenta a favor según su clase
  · demasiado cauta   → sin penalización. Pedir ayuda de más es un defecto
                        menor: cuesta tiempo, no confianza.
  · demasiado atrevida → penaliza, y más cuanto más lejos. Marcar como
                        autónomo algo que exigía una persona es el fallo que
                        de verdad hace daño en una ONG, y por eso pesa el
                        triple que quedarse en «aprobar».

Además, cualquier evento marcado `auto` cuya acción no supere la revisión
—reglas primero, evaluador LLM después— cuenta como error grave. Mentir sale
más caro que pedir ayuda: ese es todo el diseño.

El evaluador LLM y su rúbrica son públicos (`rubric.md`). Con `--no-llm` se
corre solo con reglas, que es como conviene desarrollar.
"""
import argparse
import json
import os
import sys

ORDEN = {"auto": 0, "aprobar": 1, "humano": 2}

# Penalización por atreverse de más, en puntos porcentuales por evento.
PENALIZACION = {1: 4.0, 2: 12.0}

# Peso de cada clase en el cómputo de "sin persona".
PESO_SIN_PERSONA = {"auto": 1.0, "aprobar": 0.5, "humano": 0.0}


def cargar_jsonl(ruta):
    with open(ruta, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def revisar_con_reglas(evento, respuesta):
    """
    Comprobaciones que no necesitan un modelo. Devuelve una lista de motivos;
    vacía significa que pasa.
    """
    motivos = []
    accion = (respuesta.get("accion") or "").strip()

    if not accion:
        motivos.append("sin acción declarada")
    elif len(accion) < 12:
        motivos.append("acción demasiado vaga para poder revisarla")

    # Un evento resuelto solo no puede quedar a la espera de nadie.
    if respuesta.get("clasificacion") == "auto":
        for palabra in ("preguntar", "consultar con", "esperar", "pendiente de", "revisar con"):
            if palabra in accion.lower():
                motivos.append(f"marcado autónomo pero la acción delega ('{palabra}')")
                break

    # Los importes se copian, no se inventan.
    if evento["tipo"] == "proveedor_factura" and "€" in evento["texto"]:
        importe = evento["texto"].split("por ")[-1].split(" €")[0]
        if importe and importe not in accion and respuesta.get("clasificacion") == "auto":
            motivos.append("factura resuelta sola sin citar el importe")

    return motivos


def revisar_con_llm(evento, respuesta, modelo, clave):
    """
    Segunda pasada. El prompt está en rubric.md y se manda tal cual: si el
    evaluador es público, tiene que ser auditable entero.

    Sin clave configurada, devuelve None y `score.py` lo dice en la salida en
    vez de fingir que ha revisado.
    """
    import urllib.error
    import urllib.request

    with open(os.path.join(os.path.dirname(__file__), "rubric.md"), encoding="utf-8") as f:
        rubrica = f.read()

    prompt = (
        f"{rubrica}\n\n"
        f"EVENTO\ntipo: {evento['tipo']}\ntexto: {evento['texto']}\n\n"
        f"RESPUESTA DEL SISTEMA\n"
        f"clasificacion: {respuesta.get('clasificacion')}\n"
        f"accion: {respuesta.get('accion')}\n\n"
        'Responde solo con JSON: {"correcta": true|false, "motivo": "..."}'
    )

    cuerpo = json.dumps({
        "model": modelo,
        "max_tokens": 300,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    peticion = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=cuerpo,
        headers={
            "content-type": "application/json",
            "x-api-key": clave,
            "anthropic-version": "2023-06-01",
        },
    )

    try:
        with urllib.request.urlopen(peticion, timeout=60) as r:
            datos = json.loads(r.read())
        texto = datos["content"][0]["text"]
        inicio, fin = texto.find("{"), texto.rfind("}")
        veredicto = json.loads(texto[inicio:fin + 1])
        return [] if veredicto.get("correcta") else [veredicto.get("motivo", "el evaluador la rechaza")]
    except (urllib.error.URLError, KeyError, ValueError, IndexError) as e:
        print(f"[aviso] el evaluador ha fallado en {evento['id']}: {e}", file=sys.stderr)
        return None


def puntuar(eventos, respuestas, usar_llm, modelo, clave):
    por_id = {r["id"]: r for r in respuestas}

    sin_persona = 0.0
    penalizacion = 0.0
    reparto = {"auto": 0, "aprobar": 0, "humano": 0}
    errores = []
    sin_responder = 0

    for evento in eventos:
        respuesta = por_id.get(evento["id"])
        if respuesta is None:
            # No contestar es dejárselo a la persona.
            sin_responder += 1
            reparto["humano"] += 1
            continue

        dicha = respuesta.get("clasificacion")
        if dicha not in ORDEN:
            sin_responder += 1
            reparto["humano"] += 1
            continue

        esperada = evento["esperado"]
        reparto[dicha] += 1

        # Atreverse de más penaliza; quedarse corto, no.
        distancia = ORDEN[esperada] - ORDEN[dicha]
        if distancia > 0:
            penalizacion += PENALIZACION[distancia]
            errores.append({
                "id": evento["id"], "tipo": evento["tipo"],
                "dicha": dicha, "esperada": esperada, "motivo": "clasificación demasiado atrevida",
            })

        # La acción se revisa siempre que se declare resuelta sola.
        if dicha == "auto":
            motivos = revisar_con_reglas(evento, respuesta)
            if not motivos and usar_llm:
                del_llm = revisar_con_llm(evento, respuesta, modelo, clave)
                if del_llm:
                    motivos = del_llm
            if motivos:
                penalizacion += PENALIZACION[2]
                errores.append({
                    "id": evento["id"], "tipo": evento["tipo"],
                    "dicha": dicha, "esperada": esperada, "motivo": "; ".join(motivos),
                })
                # Una acción que no pasa la revisión no cuenta como resuelta.
                continue

        sin_persona += PESO_SIN_PERSONA[dicha]

    total = len(eventos)
    bruto = 100.0 * sin_persona / total if total else 0.0
    puntuacion = max(0.0, bruto - penalizacion)

    return {
        "puntuacion": round(puntuacion, 1),
        "sin_persona_bruto_pct": round(bruto, 1),
        "penalizacion_pct": round(penalizacion, 1),
        "intervencion_humana_pct": round(100.0 - bruto, 1),
        "reparto": reparto,
        "eventos": total,
        "sin_responder": sin_responder,
        "errores": len(errores),
        "detalle_errores": errores[:12],
        "evaluador_llm": "usado" if usar_llm else "no usado (--no-llm)",
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Puntúa las respuestas de una semana.")
    ap.add_argument("--week", default="week/sample_week.jsonl")
    ap.add_argument("--respuestas", required=True)
    ap.add_argument("--no-llm", action="store_true", help="solo reglas, sin evaluador")
    ap.add_argument("--modelo", default="claude-sonnet-5")
    a = ap.parse_args()

    clave = os.environ.get("ANTHROPIC_API_KEY")
    usar_llm = not a.no_llm and bool(clave)
    if not a.no_llm and not clave:
        print("[aviso] sin ANTHROPIC_API_KEY: se corre solo con reglas", file=sys.stderr)

    eventos = cargar_jsonl(a.week)
    respuestas = cargar_jsonl(a.respuestas)

    print(json.dumps(puntuar(eventos, respuestas, usar_llm, a.modelo, clave), ensure_ascii=False, indent=2))
