"""
Extracción de datos concretos del texto del evento.

Todo lo que aparece en una `accion` tiene que venir de aquí, nunca de
inventiva del sistema. Si un dato no se puede extraer con confianza, la
función devuelve None y quien llama decide escalar en vez de rellenar el
hueco con una suposición.
"""
from __future__ import annotations

import re

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

_RE_IMPORTE_SIMBOLO = re.compile(r"(\d[\d.,]*)\s*€")
_RE_IMPORTE_PALABRA = re.compile(r"(\d[\d.,]*)\s*(?:euros?)\b", re.IGNORECASE)
_RE_REF = re.compile(r"\b[A-ZÑ]{2,4}-\d{2,5}\b")
_RE_DIA = re.compile("|".join(DIAS), re.IGNORECASE)
_RE_MES = re.compile("|".join(MESES), re.IGNORECASE)
_RE_FECHA_EXPLICITA = re.compile(
    r"\b(\d{1,2})\s+de\s+(" + "|".join(MESES) + r")\b", re.IGNORECASE
)


def importe(texto: str) -> str | None:
    """
    Primer importe tal y como aparece en el texto, sin recalcular. Acepta
    tanto el símbolo € como "euros" escrito, porque el dato es el mismo y
    negarlo por el formato solo obliga a escalar sin necesidad.
    """
    m = _RE_IMPORTE_SIMBOLO.search(texto)
    if m:
        return f"{m.group(1)} €"
    m = _RE_IMPORTE_PALABRA.search(texto)
    return f"{m.group(1)} €" if m else None


def referencia(texto: str) -> str | None:
    """Código de convocatoria/factura tipo CV-123."""
    m = _RE_REF.search(texto)
    return m.group(0) if m else None


def dia_mas_reciente(texto: str) -> str | None:
    """
    Último día de la semana mencionado en el texto.

    Cuando un mensaje corrige una fecha ("ya no el viernes, sino el lunes")
    el día que manda es el que se menciona al final. Tomar el último en vez
    del primero es lo que hace que un aviso de cambio de plazo a mitad de
    semana no se quede con la fecha vieja.
    """
    coincidencias = _RE_DIA.findall(texto)
    return coincidencias[-1].lower() if coincidencias else None


def mes(texto: str) -> str | None:
    m = _RE_MES.search(texto)
    return m.group(0).lower() if m else None


def fecha_mas_reciente(texto: str) -> str | None:
    """
    Última referencia a una fecha concreta, sea un día de la semana
    ("lunes") o una fecha de calendario ("15 de marzo"). Mismo criterio que
    `dia_mas_reciente`: la última mención es la que manda si el mensaje
    corrige un plazo, y funciona igual si la corrección cambia de formato
    (de día de la semana a fecha exacta o al revés).
    """
    candidatos = []
    for m in _RE_DIA.finditer(texto):
        candidatos.append((m.start(), m.group(0).lower()))
    for m in _RE_FECHA_EXPLICITA.finditer(texto):
        candidatos.append((m.start(), f"{m.group(1)} de {m.group(2).lower()}"))
    if not candidatos:
        return None
    candidatos.sort(key=lambda c: c[0])
    return candidatos[-1][1]
