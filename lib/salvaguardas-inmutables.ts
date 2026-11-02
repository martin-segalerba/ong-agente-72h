import type { Clase } from "./types";

/**
 * Salvaguardas INMUTABLES por contenido del texto.
 *
 * Son el análogo a `LIMITES_DUROS` (que es un piso por TIPO de evento), pero disparan
 * por lo que DICE el mensaje, sea cual sea su tipo: una denuncia de acoso dentro de un
 * acuse de donación tiene que elevar igual que si llegara como denuncia suelta.
 *
 * Viven en código, NO en rules.json: el loop de auto-mejora puede endurecer o agregar
 * salvaguardas en rules.json, pero NO puede quitar ni rebajar estas. El motor las aplica
 * siempre al final de `decidir`, y sólo pueden SUBIR el nivel (nunca bajarlo).
 *
 * El validador del issue #5 importa `SALVAGUARDAS_INMUTABLES` para impedir que una
 * propuesta del loop intente borrarlas o simular que ya están cubiertas.
 *
 * Criterio de nivel (por qué todas elevan a `humano` y no a `aprobar`):
 *   `aprobar` sigue preparando un borrador de respuesta automática pendiente de visto.
 *   En las cuatro señales —menores, acoso/abuso, conflicto entre personas y riesgo
 *   vital— un borrador automático es inapropiado y puede hacer daño (tono, encuadre,
 *   obligación de denuncia). Ante estas señales la ONG necesita una persona que lea y
 *   responda desde cero, así que el piso es `humano` en las cuatro.
 */
export interface SalvaguardaInmutable {
  id: string;
  /** Qué hace y por qué, para la trazabilidad de la decisión. */
  sop: string;
  /** Subcadenas disparadoras; se comparan sobre el texto normalizado (minúsculas, sin acentos). */
  palabras: string[];
  /** Si no es null, cualquier edad detectada por debajo de este valor dispara la salvaguarda. */
  edadMenorDe: number | null;
  /** Nivel mínimo al que eleva. El motor nunca baja de acá. */
  nivelMinimo: Clase;
}

export const SALVAGUARDAS_INMUTABLES: readonly SalvaguardaInmutable[] = [
  {
    id: "INM-menores",
    sop: "Toda interacción con una persona menor de 18 la revisa alguien del equipo: no se automatiza ni se responde en borrador.",
    // La edad es el disparador principal (ver `edades` en engine.ts); las frases cubren
    // los casos donde se declara la minoría sin dar un número.
    palabras: ["menor de edad", "soy menor", "es menor de", "somos menores"],
    edadMenorDe: 18,
    nivelMinimo: "humano",
  },
  {
    id: "INM-acoso",
    sop: "Una denuncia de acoso, abuso o maltrato va siempre a una persona; nunca recibe acuse automático.",
    // Palabras de 5+ caracteres para no chocar con «acostumbrar/acostar». La normalización
    // hace que «acosó», «abusó», «agredió» caigan en estas mismas raíces sin acento.
    palabras: [
      "acoso",
      "acosa",
      "abuso",
      "abusa",
      "abusar",
      "denuncia",
      "denunciar",
      "denuncio",
      "hostigamiento",
      "hostigar",
      "maltrato",
      "maltrata",
      "agresion",
      "agredio",
      "violencia",
    ],
    edadMenorDe: null,
    nivelMinimo: "humano",
  },
  {
    id: "INM-conflicto",
    sop: "Un conflicto entre personas (voluntarios, equipo, coordinación) lo media una persona, no un acuse automático.",
    palabras: [
      "conflicto entre",
      "conflicto con",
      "en conflicto",
      "pelea",
      "pelearon",
      "discusion",
      "discutieron",
      "enfrentamiento",
      "se enfrentaron",
      "malos tratos entre",
    ],
    edadMenorDe: null,
    nivelMinimo: "humano",
  },
  {
    id: "INM-urgencia",
    sop: "Autolesión, urgencia médica o riesgo vital: lo atiende una persona de inmediato.",
    palabras: [
      "autolesion",
      "suicid",
      "me quiero morir",
      "quitarme la vida",
      "lastimarme",
      "hacerme dano",
      "urgencia medica",
      "emergencia medica",
      "riesgo vital",
      "se desmayo",
      "no puede respirar",
      "no puedo respirar",
    ],
    edadMenorDe: null,
    nivelMinimo: "humano",
  },
];

/** Los ids del piso inmutable, para que el validador (#5) chequee que una propuesta no los toca. */
export const IDS_INMUTABLES: readonly string[] = SALVAGUARDAS_INMUTABLES.map((s) => s.id);
