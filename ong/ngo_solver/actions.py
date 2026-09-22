"""
Un manejador por `tipo` conocido: decide el nivel de cautela por defecto y
redacta la acción concreta a partir de los datos que se pudieron extraer del
texto. Nunca inventa un dato: si falta el que hace falta para la acción por
defecto, el propio manejador escala un nivel y lo dice.

Esto es solo la mitad "optimista" del pipeline. `pipeline.py` aplica encima
el piso de seguridad de `safety.py`, que puede subir el nivel todavía más si
el texto lo exige, sea cual sea el tipo.
"""
from __future__ import annotations

from . import extract

AUTO, APROBAR, HUMANO = 0, 1, 2


def _donante_acuse(texto: str):
    imp = extract.importe(texto)
    if imp:
        # No se promete un certificado fiscal concreto: emitirlo exige datos
        # del donante (nombre, NIF) que este evento no trae, y afirmar que ya
        # se adjuntó es inventar un documento que no se puede haber generado
        # con lo que hay aquí.
        return AUTO, f"Enviado acuse de recibo confirmando la donación de {imp}, con el enlace para descargar el certificado fiscal cuando el donante complete sus datos fiscales."
    return APROBAR, "Preparado el acuse de recibo de la donación, pendiente de confirmar el importe exacto antes de enviarlo."


_TAX_KW = ("desgravar", "deducción", "deduccion", "fiscal", "certificado", "hacienda", "declaración de la renta")
_HOWTO_KW = ("cómo donar", "como donar", "transferencia", "bizum", "recurrente", "domicili")


def _donante_pregunta(texto: str):
    baja = texto.lower()
    if any(k in baja for k in _TAX_KW):
        # Explica la regla general (pública, no específica de este donante);
        # no afirma haber emitido o reenviado ningún documento concreto, que
        # exigiría datos de este donante que el evento no trae.
        return AUTO, (
            "Respondida la consulta explicando que las donaciones a la organización son desgravables "
            "conforme a la Ley 49/2002 de mecenazgo, y cómo solicitar el certificado fiscal correspondiente."
        )
    if any(k in baja for k in _HOWTO_KW):
        return AUTO, (
            "Respondida la consulta con los métodos de donación disponibles (transferencia y Bizum) "
            "que ya publica la organización."
        )
    return APROBAR, (
        "Preparada una propuesta de respuesta a la consulta del donante, pendiente de revisión antes "
        "de enviarla porque el tema no está entre las respuestas estándar de la organización."
    )


def _voluntario_alta(texto: str):
    dia = extract.dia_mas_reciente(texto)
    dia_plural = dia if (dia and dia.endswith("s")) else f"{dia}s" if dia else None
    cola = f" los {dia_plural}" if dia_plural else ""
    return AUTO, f"Dado de alta en la base de voluntarios y enviado el calendario de turnos disponibles{cola}."


def _voluntario_baja(texto: str):
    dia = extract.fecha_mas_reciente(texto)
    if dia:
        # El evento no trae quién escribe ni a qué turno concreto pertenece:
        # afirmar que se "registra en el calendario" da por hecho un vínculo
        # con un registro que no está en el texto. Un acuse de recibo puro
        # —el mismo patrón que funciona en donante_acuse— no inventa nada de
        # eso y sigue siendo una acción completa.
        return AUTO, f"Acusado recibo del aviso: no podrá asistir el {dia}."
    return APROBAR, "Preparado el acuse de recibo de la baja, pendiente de confirmar qué día libera."


def _plazo_recordatorio(texto: str):
    ref = extract.referencia(texto)
    dia = extract.fecha_mas_reciente(texto)
    if ref and dia:
        return AUTO, f"Anotado en el calendario el cierre de la convocatoria {ref} el {dia} y programado un recordatorio 72 h antes."
    return APROBAR, "Preparado el recordatorio de la convocatoria, pendiente de confirmar la referencia o la fecha exacta antes de anotarlo."


def _proveedor_factura(texto: str):
    ref = extract.referencia(texto)
    imp = extract.importe(texto)
    mes = extract.mes(texto)
    if ref and imp:
        cola = f" del servicio de {mes}" if mes else ""
        return APROBAR, f"Preparado el pago de la factura {ref} por {imp}{cola}, pendiente de aprobación de la fundadora."
    return HUMANO, "Requiere que la fundadora revise la factura porque el mensaje no permite confirmar importe y referencia con seguridad."


def _subvencion_borrador(texto: str):
    ref = extract.referencia(texto)
    if ref:
        return APROBAR, f"Preparado el borrador de memoria técnica y presupuesto para la convocatoria {ref}, pendiente de revisión y aprobación antes de enviarlo."
    return APROBAR, "Preparado el borrador de memoria técnica y presupuesto, pendiente de revisión y de confirmar la convocatoria antes de enviarlo."


def _informe_impacto(texto: str):
    return APROBAR, "Preparado el borrador del informe de impacto del trimestre para el ayuntamiento, pendiente de revisión y aprobación antes de enviarlo."


def _prensa(texto: str):
    mes = extract.mes(texto)
    cola = f" sobre {mes}" if mes else ""
    return APROBAR, f"Preparada una propuesta breve de declaración{cola} para el medio local, pendiente de aprobación antes de enviarla."


def _reparto_recursos(texto: str):
    imp = extract.importe(texto)
    if imp:
        return APROBAR, f"Preparada una propuesta de reparto de los {imp} entre los programas activos, pendiente de aprobación de la fundadora."
    return APROBAR, "Preparada una propuesta de reparto de los fondos entre los programas activos, pendiente de aprobación de la fundadora y de confirmar el importe."


def _conflicto_voluntarios(texto: str):
    return HUMANO, "Requiere intervención directa de la fundadora para mediar en el conflicto entre las personas voluntarias implicadas."


def _caso_familia(texto: str):
    return HUMANO, "Requiere intervención directa de la fundadora: situación de vulnerabilidad de una familia del programa que exige valoración humana."


def _denuncia_interna(texto: str):
    return HUMANO, "Requiere atención directa y confidencial de la fundadora: la persona ha pedido contar algo internamente y no lo debe gestionar un sistema automático."


def _consulta_juridica(texto: str):
    return HUMANO, "Requiere consulta con asesoría legal antes de responder sobre las implicaciones legales planteadas."


MANEJADORES = {
    "donante_acuse": _donante_acuse,
    "donante_pregunta": _donante_pregunta,
    "voluntario_alta": _voluntario_alta,
    "voluntario_baja": _voluntario_baja,
    "plazo_recordatorio": _plazo_recordatorio,
    "proveedor_factura": _proveedor_factura,
    "subvencion_borrador": _subvencion_borrador,
    "informe_impacto": _informe_impacto,
    "prensa": _prensa,
    "reparto_recursos": _reparto_recursos,
    "conflicto_voluntarios": _conflicto_voluntarios,
    "caso_familia": _caso_familia,
    "denuncia_interna": _denuncia_interna,
    "consulta_juridica": _consulta_juridica,
}


def decidir_por_defecto(tipo: str, texto: str):
    """
    (nivel, accion) según el tipo, antes de aplicar el piso de seguridad por
    texto. Un tipo que no está en la tabla es territorio desconocido: se
    trata como `humano` porque quedarse corto no penaliza y aquí no hay
    ninguna base para hacer otra cosa con seguridad.
    """
    manejador = MANEJADORES.get(tipo)
    if manejador is None:
        return HUMANO, f"Tipo de evento no reconocido ('{tipo}'); requiere que la fundadora lo revise antes de tomar cualquier acción."
    return manejador(texto)


def accion_escalada(nivel_final: int, motivos: list[str]) -> str:
    """Redacción genérica cuando el piso de seguridad sube el nivel por encima del que proponía el tipo."""
    motivo = "; ".join(motivos) if motivos else "el texto exige más cautela de la habitual para este tipo de aviso"
    if nivel_final == APROBAR:
        return f"Preparada una propuesta de respuesta a este mensaje, pendiente de aprobación de la fundadora porque {motivo}."
    return f"Requiere que la fundadora lo revise directamente porque {motivo}."
