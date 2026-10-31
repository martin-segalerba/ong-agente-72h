/**
 * Fixtures de regresión: los eventos problemáticos de la revisión de hardening.
 *
 * La idea es que cada issue de fix (#2, #3, #4, …) reutilice estos mismos eventos
 * para su test de regresión. Los casos que HOY fallan están marcados con `activa`
 * apuntando al issue que los arregla; los tests que los ejercen quedan en `.skip`
 * con un comentario `// activa #N` hasta que ese fix aterrice y los prenda.
 *
 * Nada de esto toca la API ni la red: son solo textos y objetos planos.
 */
import type { Auditoria, Clase, Evento, Reglas } from "../lib/types";
import { REGLAS_V1 } from "../lib/reglas-v1";

/** Un evento de la bandeja con la conducta que esperamos y el issue que lo arregla. */
export interface CasoRegresion {
  /** Qué ejercita este fixture, en una línea. */
  descripcion: string;
  /** Issue de hardening que lo arregla (y que lo "prende" en la suite). null = ya anda. */
  activa: number | null;
  /** El evento tal como entra a la bandeja. */
  evento: Evento;
  /** Clase mínima que debería salir una vez arreglado. */
  esperado: { clasificacion: Clase; porque: string };
}

/** Timestamp fijo: los tests tienen que ser deterministas, nada de `new Date()`. */
const T = "2026-10-01T10:00:00Z";
const ev = (id: string, tipo: string, texto: string): Evento => ({ id, t: T, tipo, texto });

// ─────────────────────────────────────────────────────────────────────────────
// CASO 1 · Edad de voluntariado — robustez a formato (mayúsculas, palabras).
//   La MISMA frase en minúsculas se detecta; en MAYÚSCULAS o escrita en palabras
//   el motor no ve al menor y lo manda a `auto`. Lo arregla #3.
// ─────────────────────────────────────────────────────────────────────────────
export const EDAD: CasoRegresion[] = [
  {
    descripcion: "edad en minúsculas con dígitos (hoy ya se detecta)",
    activa: null,
    evento: ev("edad-min", "voluntario_alta", "Tengo 16 años y quiero ayudar los jueves"),
    esperado: { clasificacion: "humano", porque: "es menor de edad: lo ve una persona" },
  },
  {
    descripcion: "la MISMA frase en MAYÚSCULAS",
    activa: 3,
    evento: ev("edad-may", "voluntario_alta", "TENGO 16 AÑOS Y QUIERO AYUDAR LOS JUEVES"),
    esperado: { clasificacion: "humano", porque: "«AÑOS» no debería escaparse por el formato" },
  },
  {
    descripcion: "edad escrita en palabras («dieciséis»)",
    activa: 3,
    evento: ev("edad-palabras", "voluntario_alta", "Tengo dieciséis años y quiero ayudar los jueves"),
    esperado: { clasificacion: "humano", porque: "el número en palabras también es un menor" },
  },
  // Variantes (no están en el PDF): mezclan formatos y fuentes de la edad.
  {
    descripcion: "pregunta en minúsculas, menor",
    activa: 3,
    evento: ev("edad-pregunta", "voluntario_alta", "tengo 16 años, ¿puedo sumarme los jueves?"),
    esperado: { clasificacion: "humano", porque: "menor, aunque venga como pregunta" },
  },
  {
    descripcion: "edad en palabras y en mayúsculas a la vez",
    activa: 3,
    evento: ev("edad-palabras-may", "voluntario_alta", "DISPONIBLE LOS JUEVES, TENGO DIECISIETE AÑOS"),
    esperado: { clasificacion: "humano", porque: "diecisiete en mayúsculas sigue siendo menor" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CASO 2 · Donación + denuncia en el mismo mensaje — multi-intención.
//   Con REGLAS_V1 (sin salvaguardas) el acuse se resuelve en `auto` y la denuncia
//   de acoso pasa desapercibida. Tiene que elevar a una persona. Lo arregla #3.
// ─────────────────────────────────────────────────────────────────────────────
export const DONACION_CON_DENUNCIA: CasoRegresion[] = [
  {
    descripcion: "acuse de donación que esconde una denuncia de acoso",
    activa: 3,
    evento: ev(
      "don-denuncia",
      "donante_acuse",
      "He donado 50 € este mes. Además quiero denunciar que un coordinador me acosó en el último evento.",
    ),
    esperado: { clasificacion: "humano", porque: "una denuncia de acoso nunca se resuelve en automático" },
  },
  {
    descripcion: "donación con reporte de acoso de un voluntario",
    activa: 3,
    evento: ev(
      "don-denuncia-2",
      "donante_acuse",
      "Adjunto mi donación de 100 €. Aprovecho para reportar una situación de acoso por parte de un voluntario.",
    ),
    esperado: { clasificacion: "humano", porque: "el reporte de acoso manda sobre el acuse" },
  },
  {
    descripcion: "donación y aviso de un caso de acoso presenciado",
    activa: 3,
    evento: ev(
      "don-denuncia-3",
      "donante_acuse",
      "Doné 200 €. También necesito avisar de un caso de acoso que presencié.",
    ),
    esperado: { clasificacion: "humano", porque: "hay dos intenciones y una exige persona" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CASO 3 · Múltiples importes — vincular el dato a su hecho.
//   El extractor toma el importe por posición (primero / último), no por su rol.
//   Cuando la donación de HOY no es la primera del texto, el acuse cita la plata
//   equivocada. Lo arregla #4.
// ─────────────────────────────────────────────────────────────────────────────
export const MULTIPLES_IMPORTES: CasoRegresion[] = [
  {
    descripcion: "importe de hoy primero (hoy coincide con la primera coincidencia)",
    activa: null,
    evento: ev("imp-orden-natural", "donante_acuse", "Hoy he donado 300 €, el mes pasado doné 50 €."),
    esperado: { clasificacion: "auto", porque: "el acuse debe citar 300 €, la donación de hoy" },
  },
  {
    descripcion: "importe de hoy al final: la primera coincidencia es la vieja",
    activa: 4,
    evento: ev("imp-orden-invertido", "donante_acuse", "El mes pasado doné 50 €, hoy he donado 300 €."),
    esperado: { clasificacion: "auto", porque: "sigue siendo 300 € aunque no sea el primer número" },
  },
  {
    descripcion: "aporte del mes vs. del anterior",
    activa: 4,
    evento: ev("imp-mes", "donante_acuse", "Mi aporte del mes anterior fue de 50 €, el de este mes es de 300 €."),
    esperado: { clasificacion: "auto", porque: "el acuse corresponde a los 300 € de este mes" },
  },
  // Variante: otros marcadores (voseo), para no sobreajustar a "hoy / el mes pasado".
  {
    descripcion: "«recién» (ahora) vs «el año pasado» (viejo)",
    activa: 4,
    evento: ev("imp-recien", "donante_acuse", "Recién transferí 300 €; el año pasado había aportado 50 €."),
    esperado: { clasificacion: "auto", porque: "el acuse cita los 300 € de ahora, no el aporte viejo" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CASO 4 · Dos fechas — cierre de convocatoria vs. reunión.
//   El extractor de fecha devuelve la ÚLTIMA que aparece, así que anota el día de
//   la reunión (lunes) como si fuera el cierre (viernes). Lo arregla #4.
// ─────────────────────────────────────────────────────────────────────────────
export const DOS_FECHAS: CasoRegresion[] = [
  {
    descripcion: "convocatoria con una sola fecha (hoy ya anda)",
    activa: null,
    evento: ev("fecha-unica", "plazo_recordatorio", "La convocatoria BECA-2026 cierra el viernes."),
    esperado: { clasificacion: "auto", porque: "anota el cierre: viernes" },
  },
  {
    descripcion: "cierre el viernes, reunión el lunes",
    activa: 4,
    evento: ev(
      "fecha-cierre-reunion",
      "plazo_recordatorio",
      "La convocatoria BECA-2026 cierra el viernes; además tenemos una reunión el lunes.",
    ),
    esperado: { clasificacion: "auto", porque: "el cierre es el viernes, no el lunes de la reunión" },
  },
  {
    descripcion: "orden invertido: reunión antes del cierre en el texto",
    activa: 4,
    evento: ev(
      "fecha-reunion-cierre",
      "plazo_recordatorio",
      "El lunes hay reunión de equipo. Recordá que la convocatoria REF-123 cierra el viernes.",
    ),
    esperado: { clasificacion: "auto", porque: "el cierre sigue siendo el viernes" },
  },
  {
    descripcion: "dos fechas con día del mes",
    activa: 4,
    evento: ev(
      "fecha-dia-mes",
      "plazo_recordatorio",
      "La convocatoria BECA-2026 cierra el 14 de marzo; la reunión es el 10 de marzo.",
    ),
    esperado: { clasificacion: "auto", porque: "el cierre es el 14 de marzo, no el 10 de la reunión" },
  },
  // Variante: otros verbos de cierre («vence») y de evento («encuentro»), sin sobreajustar.
  {
    descripcion: "«vence» el jueves vs «encuentro» el martes",
    activa: 4,
    evento: ev(
      "fecha-vence-encuentro",
      "plazo_recordatorio",
      "El plazo de la beca REF-77 vence el jueves; el encuentro del equipo es el martes.",
    ),
    esperado: { clasificacion: "auto", porque: "vence = cierre (jueves), no el martes del encuentro" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CASO 5 · Ambigüedad real — ante la duda, se ELEVA (no se adivina).
//   Cuando hay más de un hecho candidato y los marcadores no alcanzan a decidir a
//   cuál pertenece el dato, el motor NO elige uno al azar: lo manda a una persona por
//   el camino de `si_falta_dato`. Lo arregla #4 (filosofía: ante duda, persona).
// ─────────────────────────────────────────────────────────────────────────────
export const DATO_AMBIGUO: CasoRegresion[] = [
  {
    descripcion: "dos donaciones sin marcador que las distinga → elevar",
    activa: 4,
    evento: ev("imp-ambiguo", "donante_acuse", "Doné 300 € y también doné 500 €."),
    esperado: { clasificacion: "humano", porque: "no se puede saber cuál acusar: lo mira una persona" },
  },
  {
    descripcion: "dos cierres distintos → elevar en vez de adivinar",
    activa: 4,
    evento: ev(
      "fecha-ambigua",
      "plazo_recordatorio",
      "La convocatoria BECA-2026 vence el viernes y el plazo también vence el lunes.",
    ),
    esperado: { clasificacion: "humano", porque: "hay dos cierres y no se puede decidir cuál es" },
  },
];

/** Todos los casos juntos, por si un issue quiere recorrerlos en bloque. */
export const CASOS = {
  edad: EDAD,
  donacionConDenuncia: DONACION_CON_DENUNCIA,
  multiplesImportes: MULTIPLES_IMPORTES,
  dosFechas: DOS_FECHAS,
  datoAmbiguo: DATO_AMBIGUO,
};

/**
 * Reglas base del repo, sin salvaguardas: el punto de partida documentado.
 * Útil para los casos cuyo problema es, justamente, que no hay nada que los atrape.
 */
export const REGLAS_BASE: Reglas = REGLAS_V1;

/**
 * Las mismas reglas base más una salvaguarda de menores (edad < 18 → humano).
 * Sirve para demostrar que la detección de edad FUNCIONA en minúsculas y se cae
 * solo por el formato del texto.
 */
export const REGLAS_CON_MENORES: Reglas = {
  ...REGLAS_V1,
  salvaguardas: [
    {
      id: "S-menores",
      sop: "Si el texto trae una edad menor de 18, lo revisa una persona.",
      palabras: [],
      palabras_exactas: [],
      edad_menor_de: 18,
      nivel_minimo: "humano",
    },
  ],
};

/** Constructor de objetos Auditoria sintéticos (sin llamar a Jev). */
export function auditoria(v: Auditoria["v"], conf: number, nouls: Record<string, number> = {}): Auditoria {
  return { v, conf, nouls };
}
