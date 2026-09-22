"""
event -> comprobaciones de seguridad -> clasificación -> acción -> validación

Cada paso vive en su propio módulo para poder benchmarcarlo por separado:
`extract` (qué se pudo leer del texto), `actions` (qué haría el sistema por
defecto según el tipo), `safety` (qué exige el texto por encima del tipo), y
`models` (que nada mal formado llegue a la salida).
"""
from __future__ import annotations

from . import actions, safety
from .models import Evento, Respuesta

NOMBRE_NIVEL = {0: "auto", 1: "aprobar", 2: "humano"}


def decidir(evento: Evento) -> Respuesta:
    nivel_defecto, accion_defecto = actions.decidir_por_defecto(evento.tipo, evento.texto)
    piso, motivos_piso = safety.piso_por_texto(evento.texto)

    nivel_final = max(nivel_defecto, piso)
    if nivel_final == nivel_defecto:
        accion = accion_defecto
    else:
        accion = actions.accion_escalada(nivel_final, motivos_piso)

    return Respuesta(
        id=evento.id,
        clasificacion=NOMBRE_NIVEL[nivel_final],
        accion=accion,
        motivos=motivos_piso,
    )


def procesar_evento_dict(d: dict) -> dict:
    evento = Evento.desde_dict(d)
    respuesta = decidir(evento)
    return respuesta.a_dict()
