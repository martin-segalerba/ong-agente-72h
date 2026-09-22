"""
Capa de seguridad: reglas deterministas que solo pueden empujar la
clasificación hacia más cautela, nunca hacia menos.

La asimetría del marcador (`score.py`) es la que manda el diseño: quedarse
corto no penaliza, atreverse de más sí y cada vez más caro. Por eso estas
reglas nunca "rebajan" un tipo que por defecto ya es `humano`, y sí pueden
subir cualquier cosa a `aprobar` o `humano` cuando el texto lo pide, sea cual
sea el `tipo` declarado. Así se cubre el caso del correo que parece rutinario
y no lo es: el texto manda sobre el tipo.
"""
import re

NIVEL = {"auto": 0, "aprobar": 1, "humano": 2}
NOMBRE_NIVEL = {0: "auto", 1: "aprobar", 2: "humano"}

# Personas en situación de vulnerabilidad, seguridad de menores, violencia.
# "familia" entra aquí a propósito: en este dominio casi siempre aparece
# ligada a un caso concreto (ver `caso_familia`), y que aparezca en un tipo
# distinto —como un reparto de recursos que nombra a una familia— es la
# señal de que la decisión ya no es genérica, afecta a alguien concreto.
# Suelo: humano. No hay acción automática defendible aquí.
VULNERABILIDAD = (
    "desahucio", "riesgo de", "vulnerab", "maltrato", "abuso", "violencia",
    "amenaza", "peligro", "menor de edad", "acoso", "autolesi", "suicid",
)

# Palabras que necesitan límite de palabra exacto: son cortas y tienen
# derivados benignos habituales ("familia" es substring de "familiar", que
# aparece en frases inocuas como "un imprevisto familiar").
VULNERABILIDAD_PALABRA_EXACTA = ("familia",)

# Trabajo con menores o acceso a ellos sin supervisión: requiere verificación
# (protocolo de protección a la infancia) que un sistema no puede decidir.
SALVAGUARDA_MENORES = (
    "menores", "soy menor", "tengo 16 años", "tengo 17 años", "tengo 15 años", "tengo 14 años",
)

# Historial que exige una decisión de verificación/política de la
# organización antes de incorporar a alguien, típicamente en contacto con
# personas vulnerables.
REINSERCION = (
    "salgo de prisión", "salir de prisión", "he estado en prisión", "en la cárcel",
    "antecedentes penales",
)

# Consecuencias legales, laborales o económicas difíciles de deshacer.
LEGAL = (
    "denuncia", "demanda", "juicio", "abogado", "ilegal", "delito", "fraude",
    "policía", "inspección", "jurídic", "juridic", "contrato laboral",
    "despido", "investigad",
)

# Conflicto entre personas concretas: no lo resuelve un sistema. Incluye
# formas indirectas de decirlo ("me trató mal") además de las explícitas,
# porque un aviso de baja o una pregunta pueden ser en realidad la forma en
# que alguien cuenta un conflicto.
CONFLICTO = (
    "discutido", "discusión", "conflicto", "pelea", "enfrentamiento", "se han peleado",
    "trató mal", "me trató", "faltó al respeto", "me insultó", "me gritó",
    "mal comportamiento", "no supervisa",
)

# El dinero cambia de sentido: ya no es un acuse, es una reclamación o una
# reversión. Un acuse automático aquí sería prometer algo sin base.
REVERSION_DINERO = (
    "devolver", "devolución", "reembolso", "anular", "anulación", "cancelar",
    "no reconozco", "cobro duplicado", "error en el cobro", "me han cobrado",
    "no he recibido", "falta el dinero",
)

# La donación deja de ser un simple ingreso para acusar: trae una condición,
# una contrapartida o un acuerdo de patrocinio que alguien tiene que aceptar
# antes de comprometer a la organización.
CONDICION_DONACION = (
    "a cambio de", "solo para que", "solo si", "a condición de", "patrocinador",
    "patrocinio", "poner nuestro logo", "nuestro logo",
)

# Señales de que ni la propia persona que escribe sabe qué hace falta, o de
# urgencia fuera de lo normal: mejor que lo vea alguien.
INCERTIDUMBRE = (
    "no sé qué hacer", "no sé a quién", "no entiendo por qué", "urgentísimo",
)


def _contiene(texto: str, palabras: tuple[str, ...]) -> str | None:
    baja = texto.lower()
    for p in palabras:
        if p in baja:
            return p
    return None


def _contiene_palabra_exacta(texto: str, palabras: tuple[str, ...]) -> str | None:
    baja = texto.lower()
    for p in palabras:
        if re.search(rf"\b{re.escape(p)}\b", baja):
            return p
    return None


_RE_EDAD = re.compile(r"\b(\d{1,2})\s*años\b")


def _menor_por_edad(texto: str) -> str | None:
    """Cualquier edad explícita por debajo de 18 años, sea cual sea el contexto."""
    for m in _RE_EDAD.finditer(texto):
        if int(m.group(1)) < 18:
            return m.group(0)
    return None


def piso_por_texto(texto: str) -> tuple[int, list[str]]:
    """
    Nivel mínimo de cautela que exige el texto, con los motivos.

    Devuelve (nivel, motivos). nivel 0 significa "el texto no exige nada
    especial"; el `tipo` del evento sigue decidiendo en ese caso.
    """
    motivos = []
    nivel = 0

    hit = _contiene(texto, VULNERABILIDAD) or _contiene_palabra_exacta(texto, VULNERABILIDAD_PALABRA_EXACTA)
    if hit:
        motivos.append(f"lenguaje de vulnerabilidad/seguridad ('{hit}')")
        nivel = max(nivel, NIVEL["humano"])

    hit = _contiene(texto, SALVAGUARDA_MENORES) or _menor_por_edad(texto)
    if hit:
        motivos.append(f"implica a una persona menor de edad, o trabajo con menores ('{hit}')")
        nivel = max(nivel, NIVEL["humano"])

    hit = _contiene(texto, REINSERCION)
    if hit:
        motivos.append(f"requiere una decisión de la organización sobre verificación/incorporación ('{hit}')")
        nivel = max(nivel, NIVEL["humano"])

    hit = _contiene(texto, LEGAL)
    if hit:
        motivos.append(f"posible consecuencia legal ('{hit}')")
        nivel = max(nivel, NIVEL["humano"])

    hit = _contiene(texto, CONFLICTO)
    if hit:
        motivos.append(f"conflicto entre personas ('{hit}')")
        nivel = max(nivel, NIVEL["humano"])

    hit = _contiene(texto, REVERSION_DINERO)
    if hit:
        motivos.append(f"reversión o disputa de dinero, no un acuse simple ('{hit}')")
        nivel = max(nivel, NIVEL["aprobar"])

    hit = _contiene(texto, CONDICION_DONACION)
    if hit:
        motivos.append(f"la donación trae una condición o contrapartida que hay que aceptar antes de confirmarla ('{hit}')")
        nivel = max(nivel, NIVEL["aprobar"])

    hit = _contiene(texto, INCERTIDUMBRE)
    if hit:
        motivos.append(f"incertidumbre explícita en el mensaje ('{hit}')")
        nivel = max(nivel, NIVEL["aprobar"])

    return nivel, motivos
