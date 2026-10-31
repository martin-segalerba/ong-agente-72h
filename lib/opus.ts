import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CAMPOS, LIMITES_SOP } from "./engine";
import type { Reglas, Uso } from "./types";

/** Proponer reglas es la tarea difícil del loop; revisar la comparación es acotado y lo hace otro modelo. */
export const MODELO_PROPUESTA = process.env.MODELO_PROPUESTA ?? "claude-opus-5-5";
export const MODELO_REVISION = process.env.MODELO_REVISION ?? "claude-sonnet-5-5";

/** USD por millón de tokens (entrada, salida). Las lecturas de caché cuestan menos; acá se cobran como entrada normal. */
const PRECIOS: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [2, 10],
};

const clase = z.enum(["auto", "aprobar", "humano"]);

export const ReglasSchema = z.object({
  salvaguardas: z.array(
    z.object({
      id: z.string(),
      sop: z.string(),
      palabras: z.array(z.string()),
      palabras_exactas: z.array(z.string()),
      edad_menor_de: z.number().nullable(),
      nivel_minimo: clase,
    }),
  ),
  reglas: z.array(
    z.object({
      id: z.string(),
      sop: z.string(),
      cuando: z.object({
        tipos: z.array(z.string()),
        contiene_alguno: z.array(z.string()),
        no_contiene: z.array(z.string()),
        importe_min: z.number().nullable(),
        importe_max: z.number().nullable(),
      }),
      entonces: z.object({ clasificacion: clase, accion: z.string() }),
      requiere: z.array(z.string()),
      si_falta_dato: clase,
    }),
  ),
  por_defecto: z.object({ clasificacion: clase, accion: z.string() }),
});

const PropuestaSchema = z.object({
  titulo: z.string(),
  razonamiento: z.string(),
  cambios: z.array(z.object({ regla: z.string(), tipo: z.enum(["añadir", "modificar", "eliminar"]), descripcion: z.string() })),
  reglas: ReglasSchema,
});
export type SalidaPropuesta = z.infer<typeof PropuestaSchema>;

const RevisionSchema = z.object({ mejora: z.boolean(), por_que: z.string(), riesgos: z.string() });
export type SalidaRevision = z.infer<typeof RevisionSchema>;

const SISTEMA_PROPONER = `Mantenés las reglas deterministas que clasifican la bandeja de entrada de una ONG pequeña (una o dos personas, menos de 30.000 € al año). Cada evento recibe una clasificación:
- auto: el sistema lo resuelve solo. Solo si la acción es segura, concreta, usa únicamente datos presentes en el texto y su peor resultado posible es tener que escribir un segundo correo.
- aprobar: el sistema prepara una acción concreta y una persona la aprueba antes de ejecutarla (dinero, compromisos, algo difícil de deshacer).
- humano: una persona tiene que intervenir (personas vulnerables, menores, conflictos entre personas, temas legales, quejas, falta de información).
Equivocarse hacia más autonomía de la debida es mucho más caro que quedarse corto.

## Formato de las reglas
- "reglas" se evalúan en orden; la primera cuyo "cuando" coincide decide. "cuando.tipos" vacío = cualquier tipo; "contiene_alguno" exige al menos una de las expresiones; "no_contiene" excluye; importe_min/importe_max comparan contra el importe de la donación vigente del texto. Las comparaciones de texto ignoran mayúsculas y tildes.
- "entonces.accion" es una plantilla. Solo puede citar estos campos, que extrae código fijo: ${CAMPOS.map((c) => `{${c}}`).join(", ")}. {importe} es el importe del hecho vigente (la donación de ahora, no un aporte viejo, elegido por marcadores como "hoy" vs "el mes pasado"); {importe_ultimo}, el último importe por posición (útil solo si una regla quiere el más reciente); {fecha} es la fecha del hecho principal (el CIERRE del plazo, no la de una reunión), como día de la semana, "15 de octubre" o "15/10"; {dia} es el último día de la semana mencionado. Si el texto trae más de un importe o fecha y los marcadores no alcanzan a decidir a cuál hecho pertenece, {importe}/{fecha} quedan vacíos y el evento se eleva por "si_falta_dato" (ante la duda, una persona).
- Si falta un campo de "requiere" o de la plantilla, el evento pasa a "si_falta_dato" (nunca auto).
- "salvaguardas" se evalúan después de la regla: si el texto contiene alguna de "palabras" (substring) o "palabras_exactas" (palabra completa), o menciona una edad menor que "edad_menor_de", la clasificación sube al menos a "nivel_minimo". Nunca bajan la clasificación.
- "por_defecto" aplica si ninguna regla coincide.
- Límites duros que aplica el código y no podés cambiar: ${LIMITES_SOP.join(" ")}
- "sop" es la regla en lenguaje natural para la persona que la revisa: una o dos frases, con los tipos y clasificaciones entre comillas invertidas (\`donante_acuse\`, \`auto\`).

## Qué te pido
Con la evidencia de esta semana, proponé una versión nueva de las reglas que mejore la clasificación en las tres clases, no solo en los casos que una persona corrigió: las correcciones humanas son una muestra sesgada (solo se revisa lo que se marca o se audita).
- Cambios pequeños y generales: como mucho tres cambios por propuesta, priorizando lo que más eventos afecta o lo más grave.
- Nunca reglas para un evento concreto: nada de ids, nombres propios, importes ni textos copiados literalmente. Las listas de palabras tienen que capturar la señal general en variantes habituales del español.
- No rompas lo que funciona: las decisiones que una persona confirmó como correctas tienen que seguir igual.
- "propuestasRechazadas[].rompe" lista las decisiones que una persona confirmó y que esa propuesta cambiaba: tu propuesta tiene que dejarlas como estaban.
- "sinRevisar" son decisiones que nadie miró y se asumieron correctas al cerrar la semana: tomalas como contexto, no como confirmaciones. Pueden esconder errores.
- Las acciones auto no pueden decir que van a preguntar, consultar o esperar a nadie.
- Mantené los ids de las reglas que no cambian; las nuevas usan el siguiente número libre (R5, R6… / S1, S2…).
- Si la evidencia no justifica ningún cambio, devolvé las reglas actuales sin cambios y una lista de cambios vacía.
- "titulo": una línea con el cambio principal, del estilo "R5 · donante_pregunta: responder consultas fiscales en auto".
- "razonamiento": tres o cuatro frases sobre qué patrón viste en la evidencia y por qué el cambio lo corrige sin sobreajustar.`;

const SISTEMA_REVISAR = `Revisás una propuesta de cambio en las reglas de clasificación de la bandeja de una ONG pequeña. Te paso las métricas de la versión actual y de la propuesta, calculadas sobre todos los eventos históricos, y ejemplos de eventos cuya decisión cambia.
Los veredictos de Jev vienen sumados por su confianza: un veredicto con confianza 0,3 suma 0,3, así que subas pequeñas suelen ser ruido.
Decidí si, en conjunto, la propuesta es mejor que la versión actual. Dos condiciones son innegociables: no puede romper decisiones que una persona confirmó ("confirmadasRotas") y no puede aumentar de forma clara los veredictos "demasiado_atrevida". "implicitasQueCambian" son decisiones que nadie revisó: informativas, no bloquean. Cumplidas esas dos, pesá el resto en conjunto: reproducir más correcciones humanas y sumar veredictos "correcta" es lo que más cuenta; un empeoramiento pequeño en otra métrica es aceptable si queda claramente compensado. Un aumento de autonomía que no viene acompañado de más veredictos "correcta" no es una mejora.
Si ves en los ejemplos un problema concreto (por ejemplo, una acción que promete algo sin base), decí si alcanza para rechazar o si es un riesgo a vigilar.
"por_que": dos o tres frases con los números que justifican tu decisión. "riesgos": una frase sobre qué podría salir mal con esta propuesta en eventos nuevos.`;

let cliente: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY");
  cliente ??= new Anthropic();
  return cliente;
}

function uso(modelo: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): Uso {
  const entrada = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  const [pe, ps] = PRECIOS[modelo] ?? [0, 0];
  return { modelo, via: "api", entrada, salida: u.output_tokens, costoUSD: Math.round(((entrada * pe + u.output_tokens * ps) / 1e6) * 10000) / 10000 };
}

/** La simulación se detiene hasta que alguien grabe la respuesta a este pedido. */
export class PendienteDeRespuesta extends Error {
  constructor(public id: string) {
    super(`Falta la respuesta grabada ${id}`);
  }
}

/**
 * Modo sin API: con RESPUESTAS_DIR, cada llamada lee su respuesta de `<id>.json`. Si no existe,
 * deja el pedido completo (sistema, contenido y formato) en `pendiente.json` y se detiene.
 * Quien responde ve exactamente lo mismo que vería el modelo por la API, nada más.
 */
function grabada<T>(id: string, modelo: string, effort: string, sistema: string, contenido: string, schema: z.ZodType<T>): { salida: T; uso: Uso } {
  const dir = process.env.RESPUESTAS_DIR!;
  const archivo = join(dir, `${id}.json`);
  if (existsSync(archivo)) {
    return { salida: schema.parse(JSON.parse(readFileSync(archivo, "utf8"))), uso: { modelo, via: "sesion", entrada: 0, salida: 0, costoUSD: 0 } };
  }
  writeFileSync(join(dir, "pendiente.json"), JSON.stringify({ id, modelo, effort, sistema, contenido, formato: z.toJSONSchema(schema) }, null, 1));
  throw new PendienteDeRespuesta(id);
}

async function llamar<T>(id: string, modelo: string, sistema: string, contenido: string, schema: z.ZodType<T>, effort: "medium" | "high", maxTokens: number): Promise<{ salida: T; uso: Uso }> {
  if (process.env.RESPUESTAS_DIR) return grabada(id, modelo, effort, sistema, contenido, schema);
  const stream = anthropic().beta.messages.stream({
    model: modelo,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: contenido }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error(`${modelo} rechazó la solicitud: ${msg.stop_details?.category ?? "sin categoría"}`);
  if (msg.stop_reason === "max_tokens") throw new Error(`${modelo} se quedó sin tokens de salida`);
  const texto = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { salida: schema.parse(JSON.parse(texto)), uso: uso(msg.model ?? modelo, msg.usage) };
}

export interface Evidencia {
  reglasActuales: Reglas;
  estadisticasPorRegla: Record<string, { eventos: number; corregidos: number; confirmados: number }>;
  correcciones: unknown[];
  confirmadas: unknown[];
  sinRevisar: unknown[];
  senalesDebiles: unknown[];
  propuestasRechazadas: { titulo: string; motivo: string; rompe?: unknown[] }[];
}

export async function proponer(id: string, ev: Evidencia, erroresPrevios?: string[]): Promise<{ salida: SalidaPropuesta; uso: Uso }> {
  let contenido = `Evidencia acumulada hasta hoy (JSON):\n\n${JSON.stringify(ev, null, 1)}`;
  if (erroresPrevios?.length) {
    contenido += `\n\nTu propuesta anterior no pasó la validación del motor de reglas. Corregí estos errores:\n- ${erroresPrevios.join("\n- ")}`;
  }
  return llamar(erroresPrevios?.length ? `${id}-propuesta-reintento` : `${id}-propuesta`, MODELO_PROPUESTA, SISTEMA_PROPONER, contenido, PropuestaSchema, "high", 48000);
}

export async function revisar(id: string, datos: unknown): Promise<{ salida: SalidaRevision; uso: Uso }> {
  return llamar(`${id}-revision`, MODELO_REVISION, SISTEMA_REVISAR, `Datos de la comparación (JSON):\n\n${JSON.stringify(datos, null, 1)}`, RevisionSchema, "medium", 8000);
}
