#!/usr/bin/env python3
"""
Genera la semana sintética del reto de la ONG.

Es un log de eventos con marca de tiempo, tipo y contenido. Compuesto a
partir de las cifras del Barómetro del Tercer Sector —una o dos personas, 212
correos, 14 bajas, 3 convocatorias— y no calcado de ninguna organización
real: no hay datos de nadie aquí dentro.

Cada evento lleva su clasificación correcta en `esperado`, que es lo que
`score.py` usa para corregir. En los escenarios ocultos ese campo no viaja
con el log.
"""
import argparse
import json
import random

# La verdad de referencia: dónde debería caer cada tipo de evento.
#   auto     · el agente lo hace y lo registra
#   aprobar  · el agente lo prepara, una persona dice sí
#   humano   · tiene que entrar una persona de verdad
TIPOS = [
    ("donante_acuse",        "auto",    38, "Gracias por tu donación de {n} €."),
    ("donante_pregunta",     "auto",    22, "¿Puedo desgravar la donación del año pasado?"),
    ("voluntario_alta",      "auto",    19, "Quiero apuntarme como voluntario los sábados."),
    ("voluntario_baja",      "auto",    14, "No puedo ir el {dia}, me ha surgido algo."),
    ("proveedor_factura",    "aprobar",  9, "Factura {ref} por {n} € del servicio de {mes}."),
    ("plazo_recordatorio",   "auto",     8, "La convocatoria {ref} cierra el {dia}."),
    ("subvencion_borrador",  "aprobar",  3, "Convocatoria {ref}: memoria técnica y presupuesto."),
    ("informe_impacto",      "aprobar",  2, "El ayuntamiento pide el informe del trimestre."),
    ("prensa",               "aprobar",  2, "Un medio local quiere una declaración sobre {mes}."),
    ("reparto_recursos",     "aprobar",  2, "Hay que decidir cómo repartir {n} € entre programas."),
    # Las que no se mueven. Sin ellas el reto premiaría automatizarlo todo,
    # que es justo lo contrario de lo que se pide.
    ("conflicto_voluntarios","humano",   2, "Dos voluntarios han discutido en el reparto."),
    ("caso_familia",         "humano",   2, "Una familia del programa está en riesgo de desahucio."),
    ("denuncia_interna",     "humano",   1, "Quiero contarte algo que ha pasado y no sé a quién decírselo."),
    ("consulta_juridica",    "humano",   1, "¿Podemos aceptar esta donación sin problemas legales?"),
]

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes"]
MESES = ["enero", "febrero", "marzo"]


def generar(semilla):
    rng = random.Random(semilla)
    eventos = []
    n = 0

    for tipo, esperado, cuantos, plantilla in TIPOS:
        for _ in range(cuantos):
            # De lunes a viernes, en horario de oficina más la cola de la noche.
            dia = rng.randint(0, 4)
            hora = rng.choices(range(7, 23), weights=[1,3,5,6,6,5,3,4,6,6,5,4,3,2,2,1])[0]
            texto = plantilla.format(
                n=rng.choice([25, 50, 120, 300, 480, 1200, 3400]),
                dia=rng.choice(DIAS),
                mes=rng.choice(MESES),
                ref=f"CV-{rng.randint(100, 999)}",
            )
            eventos.append({
                "id": f"e{n:03d}",
                "t": f"2026-03-{2 + dia:02d}T{hora:02d}:{rng.randint(0,59):02d}:00+01:00",
                "tipo": tipo,
                "texto": texto,
                "esperado": esperado,
            })
            n += 1

    eventos.sort(key=lambda e: e["t"])
    return eventos


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--semilla", type=int, default=1)
    ap.add_argument("--salida", default="week/sample_week.jsonl")
    a = ap.parse_args()

    eventos = generar(a.semilla)
    with open(a.salida, "w", encoding="utf-8") as f:
        for e in eventos:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    reparto = {}
    for e in eventos:
        reparto[e["esperado"]] = reparto.get(e["esperado"], 0) + 1
    print(f"{len(eventos)} eventos · {reparto}")
