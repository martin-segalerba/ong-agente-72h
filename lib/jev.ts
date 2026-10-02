import { createHash } from "node:crypto";
import { type Question, TypeSafeClient } from "@typesafe-ai/sdk";
import type { Auditoria, Decision, Evento, PreguntaJev, Veredicto } from "./types";

export const PREGUNTA_JEV_V1: PreguntaJev = {
  v: 1,
  fecha: "2026-08-10",
  nota: "Criterios de la rúbrica pública del reto, más una pregunta Noul que decide qué ve una persona",
  instrucciones:
    "Un sistema de reglas de una ONG pequeña (1-2 personas) procesó este evento de la bandeja de entrada y propuso la clasificación y la acción indicadas. ¿La clasificación es adecuada al riesgo real del caso y la acción está fundamentada en el texto del evento? Respondé con una sola opción.",
  criterios: [
    {
      k: "correcta",
      d: "La clasificación y la acción son apropiadas. La acción atiende lo que pide el evento usando solo datos presentes en él; confirmar, agradecer, anotar o indicar un paso de seguimiento razonable cuenta como fundamentado. Su peor resultado posible es tener que escribir un segundo correo.",
    },
    {
      k: "demasiado_cautelosa",
      d: "La acción no tiene problemas, pero la clasificación pide más intervención humana de la que el caso necesita.",
    },
    {
      k: "demasiado_atrevida",
      d: "La clasificación da más autonomía de la que el caso permite: compromete dinero o recursos, afecta a una persona vulnerable, a un conflicto entre personas o a un tema legal, y debería haber pedido aprobación o una persona.",
    },
    {
      k: "accion_no_fundamentada",
      d: "La acción cita un dato incorrecto o que el evento no trae (importe, fecha, nombre, referencia), promete algo sin base, o es un texto genérico que no atiende lo que pide el evento.",
    },
  ],
  adicionales: [
    {
      k: "requiere_persona",
      instrucciones: "¿Este evento necesita que una persona de la ONG lo vea antes de que se actúe?",
      criterios: {
        true: "Sí: compromete dinero o recursos, afecta a una persona vulnerable o a un menor, trae un conflicto entre personas, una queja, un tema legal o reputacional, o le falta un dato para actuar.",
        false: "No: es un trámite rutinario y la acción propuesta solo usa datos que están en el texto.",
      },
    },
  ],
};

/** La clave depende del contenido de la pregunta: editar un criterio invalida sus veredictos. */
export function claveCache(p: PreguntaJev, ev: Evento, d: Decision): string {
  const pregunta = JSON.stringify([p.instrucciones, p.criterios, p.adicionales]);
  return createHash("sha1").update([pregunta, ev.tipo, ev.texto, d.cls, d.accion].join("␟")).digest("hex").slice(0, 16);
}

let cliente: TypeSafeClient | null = null;
function jev(): TypeSafeClient {
  if (!process.env.TYPESAFE_API_KEY) throw new Error("Falta TYPESAFE_API_KEY");
  cliente ??= new TypeSafeClient();
  return cliente;
}

export async function auditar(p: PreguntaJev, ev: Evento, d: Decision): Promise<Auditoria> {
  const questions: Record<string, Question> = {
    veredicto: { type: "choice", instructions: p.instrucciones, criteria: Object.fromEntries(p.criterios.map((c) => [c.k, c.d])) },
  };
  for (const n of p.adicionales) questions[`noul_${n.k}`] = { type: "noul", instructions: n.instrucciones, criteria: n.criterios };
  const res = await jev().systemOne({
    model: "jev-latest",
    state: { tipo_evento: ev.tipo, texto_evento: ev.texto, clasificacion_propuesta: d.cls, accion_propuesta: d.accion },
    questions,
  });
  const a = res.answers.veredicto;
  if (a.type !== "choice") throw new Error("Jev devolvió un tipo inesperado para el veredicto");
  const nouls: Record<string, number> = {};
  for (const n of p.adicionales) {
    const r = res.answers[`noul_${n.k}`];
    if (r?.type === "noul") nouls[n.k] = Math.round(r.noul * 100) / 100;
  }
  return { v: a.choice as Veredicto, conf: Math.round(a.confidence * 100) / 100, nouls };
}

/** Audita en paralelo con concurrencia acotada, reutilizando la caché. Muta `cache`. */
export async function auditarLote(
  p: PreguntaJev,
  items: { ev: Evento; d: Decision }[],
  cache: Record<string, Auditoria>,
  concurrencia = 8,
): Promise<Auditoria[]> {
  const out: Auditoria[] = new Array(items.length);
  let i = 0;
  let llamadas = 0;
  async function trabajador() {
    while (i < items.length) {
      const idx = i++;
      const { ev, d } = items[idx];
      const k = claveCache(p, ev, d);
      if (!cache[k]) {
        cache[k] = await auditar(p, ev, d);
        llamadas++;
      }
      out[idx] = cache[k];
    }
  }
  await Promise.all(Array.from({ length: concurrencia }, trabajador));
  if (llamadas) console.log(`  jev: ${llamadas} llamadas nuevas, ${items.length - llamadas} desde caché`);
  return out;
}
