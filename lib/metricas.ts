import {
  type Auditoria,
  type Calibracion,
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

/** La pregunta Noul que decide qué `auto` ve una persona. */
export const NOUL_SENAL = "requiere_persona";

/**
 * Las Noul que un `auto` necesita sí o sí para poder darse por seguro. Se declara acá, en código, y
 * NO se deriva de lo que vino en la respuesta del auditor: si la pregunta se borra o se renombra, el
 * evento tiene que elevarse a revisión en vez de colarse como "sin riesgo".
 */
export const NOULS_OBLIGATORIOS: readonly string[] = [NOUL_SENAL];

/** ¿Al evento `auto` le falta alguna señal que el código exige para considerarlo seguro? */
function faltaSenalObligatoria(a: Auditoria): boolean {
  return NOULS_OBLIGATORIOS.some((k) => a.nouls?.[k] == null);
}

/**
 * En `auto` el umbral se aplica a la probabilidad de `requiere_persona`; en `aprobar` y `humano`,
 * que una persona ya ve enteros, a la confianza del veredicto de Jev.
 */
export const UMBRALES_INICIALES: Umbrales = { auto: 0.6, aprobar: 0.7, humano: 0.6 };

export function senalFuerte(d: Decision, a: Auditoria, u: Umbrales): boolean {
  if (d.cls === "auto") {
    // La ausencia de una señal obligatoria no es "sin riesgo": es "no se puede afirmar que sea
    // seguro". Se eleva a revisión por código, sin depender de que el auditor haya respondido.
    if (faltaSenalObligatoria(a)) return true;
    return (a.nouls?.[NOUL_SENAL] ?? 0) >= u.auto;
  }
  return a.v !== "correcta" && a.conf >= u[d.cls];
}

/**
 * El número contra el que se compara el umbral de esa clase. `null` = no se midió (señal ausente o
 * veredicto correcto); nunca un `0` que se confunda con un puntaje bajo real.
 */
export function puntajeSenal(d: Decision, a: Auditoria): number | null {
  if (d.cls === "auto") return faltaSenalObligatoria(a) ? null : a.nouls[NOUL_SENAL];
  return a.v !== "correcta" ? a.conf : null;
}

export function esCorrectiva(r: Revision | null): boolean {
  return !!r && (r.tipo === "revertido" || r.tipo === "rechazado");
}

export function esExplicita(r: Revision | null): r is Revision {
  return !!r && r.por !== "implicito";
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

/** Una decisión que una persona confirmó de verdad y que la regla nueva cambia. Las implícitas no cuentan. */
export function rompeConfirmada(r: Revision, d: Decision): boolean {
  return esExplicita(r) && !esCorrectiva(r) && d.cls !== r.clsOriginal;
}

export function aciertaVerdad(d: Decision, v: Verdad): boolean {
  if (d.cls !== v.cls) return false;
  return !v.clave || d.cls === "humano" || d.accion.includes(v.clave);
}

export function precisionContra(pares: { d: Decision; v: Verdad }[]): number | undefined {
  if (!pares.length) return undefined;
  return Math.round((pares.filter((p) => aciertaVerdad(p.d, p.v)).length / pares.length) * 1000) / 10;
}

export function calcularMetricas(filas: Fila[], u: Umbrales): Metricas {
  const veredictos = Object.fromEntries(VEREDICTOS.map((v) => [v, 0])) as Metricas["veredictos"];
  const veredictosConteo = Object.fromEntries(VEREDICTOS.map((v) => [v, 0])) as Metricas["veredictosConteo"];
  const clases = Object.fromEntries(CLASES.map((c) => [c, 0])) as Metricas["clases"];
  let sobreUmbral = 0;
  let reproducidas = 0;
  let totales = 0;
  let rotas = 0;
  let implicitas = 0;
  for (const f of filas) {
    veredictos[f.jev.v] += f.jev.conf;
    veredictosConteo[f.jev.v]++;
    clases[f.decision.cls]++;
    if (senalFuerte(f.decision, f.jev, u)) sobreUmbral++;
    const r = f.revision;
    if (!r) continue;
    if (esCorrectiva(r)) {
      totales++;
      if (reproduce(r, f.decision)) reproducidas++;
    } else if (rompeConfirmada(r, f.decision)) rotas++;
    else if (r.por === "implicito" && f.decision.cls !== r.clsOriginal) implicitas++;
  }
  for (const v of VEREDICTOS) veredictos[v] = Math.round(veredictos[v] * 10) / 10;
  const n = filas.length || 1;
  const conVerdad = filas.filter((f) => f.verdad).map((f) => ({ d: f.decision, v: f.verdad! }));
  return {
    eventos: filas.length,
    veredictos,
    veredictosConteo,
    sobreUmbral,
    clases,
    sinPersona: Math.round(((clases.auto + 0.5 * clases.aprobar) / n) * 1000) / 10,
    reversionesReproducidas: reproducidas,
    reversionesTotales: totales,
    confirmadasRotas: rotas,
    implicitasQueCambian: implicitas,
    precisionVerdad: precisionContra(conVerdad),
  };
}

/**
 * Umbral que mejor separa, entre los eventos de una clase que una persona revisó de verdad,
 * los errores (revertidos o rechazados) de los aciertos. Devuelve también con cuántos casos
 * se calculó; null si no hay errores ni marcas con los que calibrar.
 */
export function calibrarUmbral(filas: Fila[], cls: Clase): Calibracion | null {
  const revisadas = filas.filter((f) => esExplicita(f.revision) && f.decision.cls === cls);
  const errores = revisadas.filter((f) => esCorrectiva(f.revision)).length;
  const puntajes = revisadas.map((f) => puntajeSenal(f.decision, f.jev));
  if (!errores || puntajes.every((p) => p === null)) return null;
  let mejor = { t: 0.5, f1: -1 };
  // Por debajo de ~0,45 la confianza de Jev está cerca del azar.
  for (let t = 0.45; t <= 0.951; t += 0.05) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    revisadas.forEach((f, i) => {
      const marca = (puntajes[i] ?? 0) >= t;
      const err = esCorrectiva(f.revision);
      if (marca && err) tp++;
      else if (marca) fp++;
      else if (err) fn++;
    });
    const f1 = tp ? (2 * tp) / (2 * tp + fp + fn) : 0;
    // En empate gana el umbral más alto: separa igual de bien e interrumpe menos a la persona.
    if (f1 >= mejor.f1 - 1e-9) mejor = { t: Math.round(t * 100) / 100, f1 };
  }
  return { t: mejor.t, revisados: revisadas.length, errores };
}

export function mediaMovil(valores: number[], n = 4): number {
  const ult = valores.slice(-n);
  return Math.round((ult.reduce((a, b) => a + b, 0) / ult.length) * 100) / 100;
}
