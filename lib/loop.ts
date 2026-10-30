import { decidir, validarReglas } from "./engine";
import { auditarLote } from "./jev";
import { type Fila, calcularMetricas, esCorrectiva, precisionContra, reproduce, rompeConfirmada, senalFuerte } from "./metricas";
import { type Evidencia, proponer, revisar } from "./opus";
import { type ResultadoTransicion, validarTransicion } from "./transicion";
import type { Auditoria, Decision, Evento, EventoProcesado, Metricas, PreguntaJev, Propuesta, Reglas, Umbrales, Uso, Verdad } from "./types";

export interface EntradaLoop {
  eventos: EventoProcesado[];
  reglas: Reglas;
  version: number;
  pregunta: PreguntaJev;
  umbrales: Umbrales;
  cache: Record<string, Auditoria>;
  rechazadas: { titulo: string; motivo: string; rompe?: Propuesta["rompe"] }[];
  id: string;
  fecha: string;
  semanaDatos: string;
  /** Paráfrasis que el loop nunca ve: solo sirven para medir precisión en frases nuevas. */
  evaluacion?: { ev: Evento; verdad: Verdad }[];
  log?: (s: string) => void;
}

const base = (regla: string) => regla.split("·")[0];

function construirEvidencia(e: EntradaLoop, actuales: Decision[], auds: Auditoria[]): Evidencia {
  const stats: Evidencia["estadisticasPorRegla"] = {};
  const correcciones: unknown[] = [];
  const confirmadasPorRegla: Record<string, unknown[]> = {};
  const sinRevisarPorRegla: Record<string, unknown[]> = {};
  const debiles: unknown[] = [];

  e.eventos.forEach((ev, i) => {
    const d = actuales[i];
    const k = base(d.regla);
    stats[k] ??= { eventos: 0, corregidos: 0, confirmados: 0 };
    stats[k].eventos++;
    const r = ev.revision;
    if (r && esCorrectiva(r)) {
      stats[k].corregidos++;
      correcciones.push({
        tipo: ev.tipo,
        texto: ev.texto,
        sistema_decidio: { clasificacion: r.clsOriginal, accion: r.accionOriginal },
        persona: { revision: r.tipo, deberia_ser: r.objetivo, motivo: r.motivo },
        con_reglas_actuales: { clasificacion: d.cls, regla: d.regla, accion: d.accion, ya_resuelta: reproduce(r, d) },
      });
    } else if (r && r.por !== "implicito") {
      stats[k].confirmados++;
      (confirmadasPorRegla[k] ??= []).push({ tipo: ev.tipo, texto: ev.texto, clasificacion_confirmada: r.clsOriginal });
    } else {
      if (r) (sinRevisarPorRegla[k] ??= []).push({ tipo: ev.tipo, texto: ev.texto, clasificacion: r.clsOriginal });
      if (auds[i].v !== "correcta" && !senalFuerte(d, auds[i], e.umbrales)) {
        debiles.push({ tipo: ev.tipo, texto: ev.texto, clasificacion: d.cls, accion: d.accion, jev: auds[i] });
      }
    }
  });

  // Las correcciones aún sin resolver van todas; las ya resueltas, solo una muestra.
  const sinResolver = correcciones.filter((c) => !(c as { con_reglas_actuales: { ya_resuelta: boolean } }).con_reglas_actuales.ya_resuelta);
  const resueltas = correcciones.filter((c) => !sinResolver.includes(c)).slice(-15);

  return {
    reglasActuales: e.reglas,
    estadisticasPorRegla: stats,
    correcciones: [...sinResolver, ...resueltas],
    confirmadas: Object.values(confirmadasPorRegla).flatMap((xs) => xs.slice(-3)),
    sinRevisar: Object.values(sinRevisarPorRegla).flatMap((xs) => xs.slice(-2)),
    senalesDebiles: debiles.slice(-12),
    propuestasRechazadas: e.rechazadas,
  };
}

/** Lo que el modelo revisor ve: sin ninguna métrica calculada contra la etiqueta sintética. */
function sinVerdad(m: Metricas): Omit<Metricas, "precisionVerdad" | "precisionNueva"> {
  const { precisionVerdad: _v, precisionNueva: _n, ...resto } = m;
  return resto;
}

const sumarUso = (a: Uso, b: Uso): Uso => ({ modelo: a.modelo, via: a.via, entrada: a.entrada + b.entrada, salida: a.salida + b.salida, costoUSD: Math.round((a.costoUSD + b.costoUSD) * 10000) / 10000 });

/** Una vuelta del loop: propone, re-ejecuta todo el historial, audita lo que cambió y revisa. */
export async function ejecutarLoop(e: EntradaLoop): Promise<Propuesta | null> {
  const log = e.log ?? (() => {});
  const actuales = e.eventos.map((ev) => decidir(ev, e.reglas));
  log(`  auditando ${actuales.length} decisiones con reglas v${e.version}`);
  const audActuales = await auditarLote(e.pregunta, e.eventos.map((ev, i) => ({ ev, d: actuales[i] })), e.cache);

  const evidencia = construirEvidencia(e, actuales, audActuales);
  log(`  propuesta: ${evidencia.correcciones.length} correcciones, ${evidencia.senalesDebiles.length} señales débiles`);
  let { salida, uso: usoPropuesta } = await proponer(e.id, evidencia);
  let errores = validarReglas(salida.reglas);
  if (errores.length) {
    log(`  propuesta inválida (${errores.join("; ")}), reintento`);
    const otra = await proponer(e.id, evidencia, errores);
    salida = otra.salida;
    usoPropuesta = sumarUso(usoPropuesta, otra.uso);
    errores = validarReglas(salida.reglas);
    if (errores.length) throw new Error(`Propuesta inválida tras reintento: ${errores.join("; ")}`);
  }
  if (!salida.cambios.length) {
    log("  sin cambios propuestos");
    return null;
  }

  const nuevas = e.eventos.map((ev) => decidir(ev, salida.reglas));
  const audNuevas = await auditarLote(e.pregunta, e.eventos.map((ev, i) => ({ ev, d: nuevas[i] })), e.cache);

  const filas = (ds: Decision[], as: Auditoria[]): Fila[] =>
    e.eventos.map((ev, i) => ({ decision: ds[i], jev: as[i], revision: ev.revision, verdad: ev.verdad }));
  const antes = calcularMetricas(filas(actuales, audActuales), e.umbrales);
  const despues = calcularMetricas(filas(nuevas, audNuevas), e.umbrales);
  if (e.evaluacion?.length) {
    antes.precisionNueva = precisionContra(e.evaluacion.map((x) => ({ d: decidir(x.ev, e.reglas), v: x.verdad })));
    despues.precisionNueva = precisionContra(e.evaluacion.map((x) => ({ d: decidir(x.ev, salida.reglas), v: x.verdad })));
  }

  const rompe = e.eventos
    .map((ev, i) => ({ ev, d: nuevas[i] }))
    .filter(({ ev, d }) => ev.revision && rompeConfirmada(ev.revision, d))
    .slice(0, 10)
    .map(({ ev, d }) => ({ tipo: ev.tipo, texto: ev.texto, confirmada: ev.revision!.clsOriginal, propuesta: d.cls }));

  const cambiados = e.eventos
    .map((ev, i) => ({ ev, i }))
    .filter(({ i }) => actuales[i].cls !== nuevas[i].cls || actuales[i].accion !== nuevas[i].accion);

  const prioridad = ({ ev, i }: { ev: EventoProcesado; i: number }) =>
    (ev.revision && esCorrectiva(ev.revision) ? (reproduce(ev.revision, nuevas[i]) ? 0 : 1) : ev.revision?.por === "usuario" || ev.revision?.por === "simulado" ? 2 : 3) * 10 -
    Math.abs(audNuevas[i].conf - audActuales[i].conf);
  const ordenados = [...cambiados].sort((a, b) => prioridad(a) - prioridad(b));
  const ejemplo = ({ ev, i }: { ev: EventoProcesado; i: number }) => ({
    id: ev.id,
    tipo: ev.tipo,
    texto: ev.texto,
    antes: { ...actuales[i], ...audActuales[i] },
    despues: { ...nuevas[i], ...audNuevas[i] },
    revision: ev.revision,
  });

  log(`  revisión: ${cambiados.length} eventos cambian`);
  const { salida: rev, uso: usoRevision } = await revisar(e.id, {
    titulo: salida.titulo,
    cambios: salida.cambios,
    metricas_actual: sinVerdad(antes),
    metricas_propuesta: sinVerdad(despues),
    eventos_que_cambian: cambiados.length,
    ejemplos: ordenados.slice(0, 12).map((x) => {
      const { revision, ...resto } = ejemplo(x);
      return { ...resto, revision_humana: revision ? { tipo: revision.tipo, por: revision.por, deberia_ser: revision.objetivo, motivo: revision.motivo } : null };
    }),
  });

  return {
    id: e.id,
    fecha: e.fecha,
    semanaDatos: e.semanaDatos,
    baseVersion: e.version,
    nuevaVersion: e.version + 1,
    titulo: salida.titulo,
    razonamiento: salida.razonamiento,
    cambios: salida.cambios,
    reglas: salida.reglas,
    metricasAntes: antes,
    metricasDespues: despues,
    cambiados: cambiados.length,
    rompe,
    ejemplos: ordenados.slice(0, 3).map(ejemplo),
    revision: { modelo: usoRevision.modelo, mejora: rev.mejora, porQue: rev.por_que, riesgos: rev.riesgos },
    uso: { propuesta: usoPropuesta, revision: usoRevision, costoUSD: Math.round((usoPropuesta.costoUSD + usoRevision.costoUSD) * 10000) / 10000 },
    estado: "pendiente",
    decididaPor: null,
    motivoDecision: "",
  };
}

/**
 * Criterio con el que la persona simulada aprueba o rechaza: solo números, no la narrativa del
 * modelo. Es la MISMA barrera que aplica el botón de aprobar de la UI (`validarTransicion`): en el
 * simulador la propuesta siempre se arma sobre la versión activa, así que ese chequeo es trivial y
 * lo que decide son los cinco criterios de métricas.
 */
export function decisionSimulada(p: Propuesta): ResultadoTransicion {
  return validarTransicion(p, { versionActiva: p.baseVersion });
}
