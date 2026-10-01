import { decidir, validarReglas } from "./engine";
import { auditarLote } from "./jev";
import { type Fila, calcularMetricas, esCorrectiva, reproduce, senalFuerte } from "./metricas";
import { proponer, revisar, type Evidencia } from "./opus";
import type { Auditoria, Decision, EventoProcesado, Metricas, PreguntaJev, Propuesta, Reglas, Umbrales } from "./types";

export interface EntradaLoop {
  eventos: EventoProcesado[];
  reglas: Reglas;
  version: number;
  pregunta: PreguntaJev;
  umbrales: Umbrales;
  cache: Record<string, Auditoria>;
  rechazadas: { titulo: string; motivo: string }[];
  id: string;
  fecha: string;
  semanaDatos: string;
  log?: (s: string) => void;
}

const base = (regla: string) => regla.split("·")[0];

function construirEvidencia(e: EntradaLoop, actuales: Decision[], auds: Auditoria[]): Evidencia {
  const stats: Evidencia["estadisticasPorRegla"] = {};
  const correcciones: unknown[] = [];
  const confirmadasPorRegla: Record<string, unknown[]> = {};
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
    } else if (r) {
      stats[k].confirmados++;
      (confirmadasPorRegla[k] ??= []).push({ tipo: ev.tipo, texto: ev.texto, clasificacion_confirmada: r.clsOriginal });
    } else if (auds[i].v !== "correcta" && !senalFuerte(d, auds[i], e.umbrales)) {
      debiles.push({ tipo: ev.tipo, texto: ev.texto, clasificacion: d.cls, accion: d.accion, jev: auds[i] });
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
    senalesDebiles: debiles.slice(-12),
    propuestasRechazadas: e.rechazadas,
  };
}

function sinVerdad(m: Metricas): Omit<Metricas, "precisionVerdad"> {
  const { precisionVerdad: _, ...resto } = m;
  return resto;
}

/** Una vuelta del loop: propone, re-ejecuta todo el historial, audita lo que cambió y revisa. */
export async function ejecutarLoop(e: EntradaLoop): Promise<Propuesta | null> {
  const log = e.log ?? (() => {});
  const actuales = e.eventos.map((ev) => decidir(ev, e.reglas));
  log(`  auditando ${actuales.length} decisiones con reglas v${e.version}`);
  const audActuales = await auditarLote(e.pregunta, e.eventos.map((ev, i) => ({ ev, d: actuales[i] })), e.cache);

  const evidencia = construirEvidencia(e, actuales, audActuales);
  log(`  opus: proponiendo (${evidencia.correcciones.length} correcciones, ${evidencia.senalesDebiles.length} señales débiles)`);
  let salida = await proponer(evidencia);
  let errores = validarReglas(salida.reglas);
  if (errores.length) {
    log(`  opus: propuesta inválida (${errores.join("; ")}), reintento`);
    salida = await proponer(evidencia, errores);
    errores = validarReglas(salida.reglas);
    if (errores.length) throw new Error(`Propuesta inválida tras reintento: ${errores.join("; ")}`);
  }
  if (!salida.cambios.length) {
    log("  opus: sin cambios propuestos");
    return null;
  }

  const nuevas = e.eventos.map((ev) => decidir(ev, salida.reglas));
  const audNuevas = await auditarLote(e.pregunta, e.eventos.map((ev, i) => ({ ev, d: nuevas[i] })), e.cache);

  const filas = (ds: Decision[], as: Auditoria[]): Fila[] =>
    e.eventos.map((ev, i) => ({ decision: ds[i], jev: as[i], revision: ev.revision, verdad: ev.verdad }));
  const antes = calcularMetricas(filas(actuales, audActuales), e.umbrales);
  const despues = calcularMetricas(filas(nuevas, audNuevas), e.umbrales);

  const cambiados = e.eventos
    .map((ev, i) => ({ ev, i }))
    .filter(({ i }) => actuales[i].cls !== nuevas[i].cls || actuales[i].accion !== nuevas[i].accion);

  const prioridad = ({ ev, i }: { ev: EventoProcesado; i: number }) =>
    (ev.revision && esCorrectiva(ev.revision) ? (reproduce(ev.revision, nuevas[i]) ? 0 : 1) : ev.revision ? 2 : 3) * 10 -
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

  log(`  opus: revisando (${cambiados.length} eventos cambian)`);
  const rev = await revisar({
    titulo: salida.titulo,
    cambios: salida.cambios,
    metricas_actual: sinVerdad(antes),
    metricas_propuesta: sinVerdad(despues),
    eventos_que_cambian: cambiados.length,
    ejemplos: ordenados.slice(0, 12).map((x) => {
      const { revision, ...resto } = ejemplo(x);
      return { ...resto, revision_humana: revision ? { tipo: revision.tipo, deberia_ser: revision.objetivo, motivo: revision.motivo } : null };
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
    ejemplos: ordenados.slice(0, 3).map(ejemplo),
    revisionOpus: { mejora: rev.mejora, porQue: rev.por_que, riesgos: rev.riesgos },
    estado: "pendiente",
    decididaPor: null,
    motivoDecision: "",
  };
}

/** Criterio con el que la persona simulada aprueba o rechaza: solo números, no la narrativa de Opus. */
export function decisionSimulada(p: Propuesta): { aprobar: boolean; motivo: string } {
  const a = p.metricasAntes;
  const d = p.metricasDespues;
  const fallos: string[] = [];
  if (!p.revisionOpus.mejora) fallos.push("la revisión de Opus no encuentra mejora");
  if (d.veredictos.demasiado_atrevida > a.veredictos.demasiado_atrevida)
    fallos.push(`sube «demasiado_atrevida» (${a.veredictos.demasiado_atrevida} → ${d.veredictos.demasiado_atrevida})`);
  if (d.confirmadasRotas > a.confirmadasRotas) fallos.push(`rompe ${d.confirmadasRotas - a.confirmadasRotas} decisiones ya confirmadas`);
  if (d.reversionesReproducidas < a.reversionesReproducidas) fallos.push("reproduce menos correcciones humanas");
  if (d.veredictos.correcta < a.veredictos.correcta) fallos.push(`baja «correcta» (${a.veredictos.correcta} → ${d.veredictos.correcta})`);
  return fallos.length
    ? { aprobar: false, motivo: `Rechazada: ${fallos.join("; ")}.` }
    : {
        aprobar: true,
        motivo: `Aprobada: reproduce ${d.reversionesReproducidas}/${d.reversionesTotales} correcciones (antes ${a.reversionesReproducidas}), «correcta» ${a.veredictos.correcta} → ${d.veredictos.correcta}, sin romper confirmadas.`,
      };
}
