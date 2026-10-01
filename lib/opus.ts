import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CAMPOS, LIMITES_SOP } from "./engine";
import type { Reglas } from "./types";

export const MODELO_OPUS = "claude-opus-5-5";

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
- "reglas" se evalúan en orden; la primera cuyo "cuando" coincide decide. "cuando.tipos" vacío = cualquier tipo; "contiene_alguno" exige al menos una de las expresiones; "no_contiene" excluye; importe_min/importe_max comparan contra el último importe del texto. Las comparaciones de texto ignoran mayúsculas y tildes.
- "entonces.accion" es una plantilla. Solo puede citar estos campos, que extrae código fijo: ${CAMPOS.map((c) => `{${c}}`).join(", ")}. {importe} es el primer importe del texto; {importe_ultimo}, el último (útil cuando el texto menciona más de uno); {fecha} es la fecha más reciente mencionada (día de la semana, "15 de octubre" o "15/10"); {dia} es el último día de la semana mencionado.
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
- Las acciones auto no pueden decir que van a preguntar, consultar o esperar a nadie.
- Mantené los ids de las reglas que no cambian; las nuevas usan el siguiente número libre (R5, R6… / S1, S2…).
- Si la evidencia no justifica ningún cambio, devolvé las reglas actuales sin cambios y una lista de cambios vacía.
- "titulo": una línea con el cambio principal, del estilo "R5 · donante_pregunta: responder consultas fiscales en auto".
- "razonamiento": tres o cuatro frases sobre qué patrón viste en la evidencia y por qué el cambio lo corrige sin sobreajustar.`;

const SISTEMA_REVISAR = `Revisás una propuesta de cambio en las reglas de clasificación de la bandeja de una ONG pequeña. Te paso las métricas de la versión actual y de la propuesta, calculadas sobre todos los eventos históricos, y ejemplos de eventos cuya decisión cambia.
Decidí si, en conjunto, la propuesta es mejor que la versión actual. Dos condiciones son innegociables: no puede romper decisiones que una persona confirmó y no puede aumentar los veredictos "demasiado_atrevida". Cumplidas esas dos, pesá el resto en conjunto: reproducir más correcciones humanas y sumar veredictos "correcta" es lo que más cuenta; un empeoramiento pequeño en otra métrica es aceptable si queda claramente compensado. Un aumento de autonomía que no viene acompañado de más veredictos "correcta" no es una mejora.
Si ves en los ejemplos un problema concreto (por ejemplo, una acción que promete algo sin base), decí si alcanza para rechazar o si es un riesgo a vigilar.
"por_que": dos o tres frases con los números que justifican tu decisión. "riesgos": una frase sobre qué podría salir mal con esta propuesta en eventos nuevos.`;

let cliente: Anthropic | null = null;
function opus(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY");
  cliente ??= new Anthropic();
  return cliente;
}

async function llamar<T>(sistema: string, contenido: string, schema: z.ZodType<T>, effort: "medium" | "high", maxTokens: number): Promise<T> {
  const stream = opus().beta.messages.stream({
    model: MODELO_OPUS,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: contenido }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error(`Opus rechazó la solicitud: ${msg.stop_details?.category ?? "sin categoría"}`);
  if (msg.stop_reason === "max_tokens") throw new Error("Opus se quedó sin tokens de salida");
  const texto = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return schema.parse(JSON.parse(texto));
}

export interface Evidencia {
  reglasActuales: Reglas;
  estadisticasPorRegla: Record<string, { eventos: number; corregidos: number; confirmados: number }>;
  correcciones: unknown[];
  confirmadas: unknown[];
  senalesDebiles: unknown[];
  propuestasRechazadas: { titulo: string; motivo: string }[];
}

export async function proponer(ev: Evidencia, erroresPrevios?: string[]): Promise<SalidaPropuesta> {
  let contenido = `Evidencia acumulada hasta hoy (JSON):\n\n${JSON.stringify(ev, null, 1)}`;
  if (erroresPrevios?.length) {
    contenido += `\n\nTu propuesta anterior no pasó la validación del motor de reglas. Corregí estos errores:\n- ${erroresPrevios.join("\n- ")}`;
  }
  return llamar(SISTEMA_PROPONER, contenido, PropuestaSchema, "high", 48000);
}

export async function revisar(datos: unknown): Promise<SalidaRevision> {
  return llamar(SISTEMA_REVISAR, `Datos de la comparación (JSON):\n\n${JSON.stringify(datos, null, 1)}`, RevisionSchema, "medium", 8000);
}
