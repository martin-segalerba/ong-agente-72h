"""
Contrato de datos del sistema, validado sin dependencias externas.

Un dataclass con __post_init__ es "equivalente a Pydantic" para lo que hace
falta aquí: un evento de entrada de forma fija y una respuesta de salida con
invariantes que no pueden violarse en silencio. Se evita añadir pydantic como
dependencia porque el harness que lo rodea (`score.py`, `replay.py`) es
deliberadamente stdlib-only y no sabemos qué entorno correrá la semana
oculta.
"""
from __future__ import annotations

from dataclasses import dataclass, field

CLASIFICACIONES = ("auto", "aprobar", "humano")

# Palabras que delatan que la acción en realidad delega en otra persona.
# Mismo criterio que usa score.py para no autoengañarnos con algo que de
# todas formas cuenta como error grave si se marca "auto".
PALABRAS_DELEGACION = (
    "preguntar", "consultar con", "esperar", "pendiente de", "revisar con",
)


class ContratoInvalido(ValueError):
    """La entrada o la salida no respeta el contrato del reto."""


@dataclass(frozen=True)
class Evento:
    id: str
    t: str
    tipo: str
    texto: str

    @staticmethod
    def desde_dict(d: dict) -> "Evento":
        faltan = [k for k in ("id", "t", "tipo", "texto") if k not in d]
        if faltan:
            raise ContratoInvalido(f"evento incompleto, faltan campos: {faltan}")
        return Evento(id=str(d["id"]), t=str(d["t"]), tipo=str(d["tipo"]), texto=str(d["texto"]))


@dataclass
class Respuesta:
    id: str
    clasificacion: str
    accion: str
    # Motivos internos de por qué se decidió así; no viaja al harness, solo
    # sirve para depuración y para el log de experimentos.
    motivos: list = field(default_factory=list)

    def __post_init__(self):
        if self.clasificacion not in CLASIFICACIONES:
            raise ContratoInvalido(f"clasificación inválida: {self.clasificacion!r}")
        accion = (self.accion or "").strip()
        if len(accion) < 12:
            raise ContratoInvalido("acción demasiado vaga o vacía")
        self.accion = accion

        if self.clasificacion == "auto":
            baja = accion.lower()
            for palabra in PALABRAS_DELEGACION:
                if palabra in baja:
                    raise ContratoInvalido(
                        f"acción marcada auto pero delega ('{palabra}'): {accion!r}"
                    )

    def a_dict(self) -> dict:
        return {"id": self.id, "clasificacion": self.clasificacion, "accion": self.accion}
