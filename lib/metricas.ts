import {
  type Auditoria,
  type Clase,
  CLASES,
  type Decision,
  type Metricas,
  NIVEL,
  type Revision,
  type Umbrales,
  type Verdad,
  VEREDICTOS,
} from "./types";

export interface Fila {
  decision: Decision;
  jev: Auditoria;
  revision: Revision | null;
  verdad?: Verdad;
}

export const UMBRALES_INICIALES: Umbrales = { auto: 0.8, aprobar: 0.7, humano: 0.6 };

export function senalFuerte(d: Decision, a: Auditoria, u: Umbrales): boolean {
  return a.v !== "correcta" && a.conf >= u[d.cls];
}

export function esCorrectiva(r: Revision | null): boolean {
  return !!r && (r.tipo === "revertido" || r.tipo === "rechazado");
}

/** ¿La decisión `d` hace lo que pidió la persona que revisó el evento? */
export function reproduce(r: Revision, d: Decision): boolean {
  if (r.tipo === "revertido") return d.cls === r.objetivo;
  if (r.tipo === "rechazado") {
    if (d.cls !== r.clsOriginal) return NIVEL[d.cls] > NIVEL[r.clsOriginal];
    return d.accion !== r.accionOriginal;
  }
  return false;
}

/** Una decisión que una persona confirmó como buena y que la regla nueva cambia. */
export function rompeConfirmada(r: Revision, d: Decision): boolean {
  return !esCorrectiva(r) && d.cls !== r.clsOriginal;
}

export function aciertaVerdad(d: Decision, v: Verdad): boolean {
  if (d.cls !== v.cls) return false;
  return !v.clave || d.cls === "humano" || d.accion.includes(v.clave);
}

export function calcularMetricas(filas: Fila[], u: Umbrales): Metricas {
  const veredictos = Object.fromEntries(VEREDICTOS.map((v) => [v, 0])) as Metricas["veredictos"];
  const clases = Object.fromEntries(CLASES.map((c) => [c, 0])) as Metricas["clases"];
  let sobreUmbral = 0;
  let reproducidas = 0;
  let totales = 0;
  let rotas = 0;
  let conVerdad = 0;
  let aciertos = 0;
  for (const f of filas) {
    veredictos[f.jev.v]++;
    clases[f.decision.cls]++;
    if (senalFuerte(f.decision, f.jev, u)) sobreUmbral++;
    if (f.revision) {
      if (esCorrectiva(f.revision)) {
        totales++;
        if (reproduce(f.revision, f.decision)) reproducidas++;
      } else if (rompeConfirmada(f.revision, f.decision)) rotas++;
    }
    if (f.verdad) {
      conVerdad++;
      if (aciertaVerdad(f.decision, f.verdad)) aciertos++;
    }
  }
  const n = filas.length || 1;
  return {
    eventos: filas.length,
    veredictos,
    sobreUmbral,
    clases,
    sinPersona: Math.round(((clases.auto + 0.5 * clases.aprobar) / n) * 1000) / 10,
    reversionesReproducidas: reproducidas,
    reversionesTotales: totales,
    confirmadasRotas: rotas,
    precisionVerdad: conVerdad ? Math.round((aciertos / conVerdad) * 1000) / 10 : undefined,
  };
}

/**
 * Umbral que mejor separa, en los eventos revisados de una clase, los errores reales
 * (revertidos o rechazados) de los aciertos, usando el veredicto de Jev. Devuelve null
 * si la semana no trae errores ni falsas alarmas con los que calibrar.
 */
export function calibrarUmbral(filas: Fila[], cls: Clase): number | null {
  const revisadas = filas.filter((f) => f.revision && f.decision.cls === cls);
  const errores = revisadas.filter((f) => esCorrectiva(f.revision)).length;
  const alarmas = revisadas.filter((f) => f.jev.v !== "correcta").length;
  if (!errores || !alarmas) return null;
  let mejor = { t: 0.5, f1: -1 };
  // Por debajo de ~0,45 la confianza de Jev en una pregunta de cuatro opciones está cerca del azar.
  for (let t = 0.45; t <= 0.951; t += 0.05) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const f of revisadas) {
      const marca = f.jev.v !== "correcta" && f.jev.conf >= t;
      const err = esCorrectiva(f.revision);
      if (marca && err) tp++;
      else if (marca) fp++;
      else if (err) fn++;
    }
    const f1 = tp ? (2 * tp) / (2 * tp + fp + fn) : 0;
    // En empate gana el umbral más alto: separa igual de bien e interrumpe menos a la persona.
    if (f1 >= mejor.f1 - 1e-9) mejor = { t: Math.round(t * 100) / 100, f1 };
  }
  return mejor.t;
}

export function mediaMovil(valores: number[], n = 4): number {
  const ult = valores.slice(-n);
  return Math.round((ult.reduce((a, b) => a + b, 0) / ult.length) * 100) / 100;
}
