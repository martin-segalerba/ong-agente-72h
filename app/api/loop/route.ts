import { z } from "zod";
import historialJson from "@/data/historial.json";
import { validarReglas } from "@/lib/engine";
import { ejecutarLoop } from "@/lib/loop";
import { ReglasSchema } from "@/lib/opus";
import type { Auditoria, Historial } from "@/lib/types";

export const maxDuration = 300;

const historial = historialJson as unknown as Historial;
const clase = z.enum(["auto", "aprobar", "humano"]);

const Entrada = z.object({
  reglas: ReglasSchema,
  version: z.number().int().positive(),
  umbrales: z.object({ auto: z.number().min(0).max(1), aprobar: z.number().min(0).max(1), humano: z.number().min(0).max(1) }),
  pregunta: z.object({
    v: z.number().int(),
    fecha: z.string().max(40),
    nota: z.string().max(500),
    instrucciones: z.string().min(10).max(4000),
    criterios: z.array(z.object({ k: z.string().min(1).max(60), d: z.string().max(1500) })).min(2).max(8),
  }),
  revisiones: z
    .record(
      z.string().max(10),
      z.object({
        tipo: z.enum(["aprobado", "rechazado", "revertido", "confirmado", "gestionado"]),
        objetivo: clase.nullable(),
        motivo: z.string().max(1000),
        por: z.literal("usuario"),
        clsOriginal: clase,
        accionOriginal: z.string().max(1000),
      }),
    )
    .refine((r) => Object.keys(r).length <= 200),
  rechazadas: z.array(z.object({ titulo: z.string().max(300), motivo: z.string().max(1000) })).max(50),
  propuestasPrevias: z.number().int().min(0).max(500),
});

function estado() {
  const habilitado = process.env.LOOP_EN_VIVO === "1" && !!process.env.ANTHROPIC_API_KEY && !!process.env.TYPESAFE_API_KEY;
  return { habilitado, requiereClave: !!process.env.LOOP_CLAVE };
}

export function GET() {
  return Response.json(estado());
}

export async function POST(req: Request) {
  const { habilitado, requiereClave } = estado();
  if (!habilitado) return Response.json({ error: "El loop en vivo está desactivado en este despliegue." }, { status: 503 });
  if (requiereClave && req.headers.get("x-loop-clave") !== process.env.LOOP_CLAVE) {
    return Response.json({ error: "Clave incorrecta." }, { status: 401 });
  }

  const parsed = Entrada.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  const e = parsed.data;
  const errores = validarReglas(e.reglas);
  if (errores.length) return Response.json({ error: `Reglas inválidas: ${errores.join("; ")}` }, { status: 400 });

  // Las revisiones del navegador solo valen para la semana en curso; el resto del historial es fijo.
  const enCurso = new Set(historial.semanas.filter((s) => s.enCurso).map((s) => s.id));
  const eventos = historial.eventos.map((ev) => {
    const r = e.revisiones[ev.id];
    return r && enCurso.has(ev.semana) ? { ...ev, revision: r } : ev;
  });
  const n = historial.propuestas.length + e.propuestasPrevias + 1;
  const ahora = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 16);

  try {
    const propuesta = await ejecutarLoop({
      eventos,
      reglas: e.reglas,
      version: e.version,
      pregunta: e.pregunta,
      umbrales: e.umbrales,
      cache: { ...(historial.jevCache as Record<string, Auditoria>) },
      rechazadas: e.rechazadas,
      id: `P-${String(n).padStart(3, "0")}`,
      fecha: ahora,
      semanaDatos: historial.semanas.at(-1)?.id ?? "",
    });
    if (!propuesta) return Response.json({ sinCambios: true });
    return Response.json({ propuesta });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err instanceof Error ? err.message : "El loop falló." }, { status: 502 });
  }
}
