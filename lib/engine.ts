import { SALVAGUARDAS_INMUTABLES } from "./salvaguardas-inmutables";
import { type Clase, type Decision, type Evento, NIVEL, type Regla, type Reglas } from "./types";

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const DIAS_N = DIAS.map(normalizar);
const MESES_N = MESES.map(normalizar);

// Un número seguido de una marca de moneda (€, euros, EUR) o precedido de $.
const RE_IMPORTE = /(?:\$\s?(\d[\d.,]*))|(\d[\d.,]*)\s?(?:€|euros?\b|eur\b)/gi;
const RE_REF = /\b[A-ZÑ]{2,8}-?\d{2,6}\b/;
const RE_FECHA = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MESES_N.join("|")})\\b|\\b(\\d{1,2})/(\\d{1,2})\\b|\\b(${DIAS_N.join("|")})\\b`, "g");
// Números escritos en palabras 0–20: alcanza para edades de voluntariado (la decisión
// abierta del issue #3). Van normalizados (sin acentos): "dieciséis" se compara como
// "dieciseis". El orden no importa: el alternado de la regex matchea la palabra completa.
const PALABRAS_NUMERO: Record<string, number> = {
  cero: 0, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
};
// Corre SIEMPRE sobre texto normalizado: "16 años", "16 AÑOS" y "dieciséis años" quedan
// todos como "<n> anos". El flag `i` es defensivo por si se aplica a texto sin normalizar.
const RE_EDAD = new RegExp(`\\b(${Object.keys(PALABRAS_NUMERO).join("|")}|\\d{1,2})\\s*anos?\\b`, "gi");

/** Edades (en años) que aparecen en el texto, tanto en dígitos como escritas en palabras. */
export function edades(texto: string): number[] {
  const out: number[] = [];
  for (const m of normalizar(texto).matchAll(RE_EDAD)) {
    const tok = m[1];
    const n = /^\d+$/.test(tok) ? Number(tok) : PALABRAS_NUMERO[tok];
    if (n !== undefined) out.push(n);
  }
  return out;
}

function importes(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(RE_IMPORTE)) out.push(m[1] ? `${m[1]} $` : `${m[2]} €`);
  return out;
}

// ─── Vincular cada dato a su hecho (#4) ──────────────────────────────────────
// Un mismo texto puede traer dos donaciones ("hoy 300 €, el mes pasado 50 €") o dos
// fechas ("cierra el viernes; reunión el lunes"). Elegir por POSICIÓN (primero/último)
// ata el dato al hecho equivocado. Estos marcadores dicen a qué hecho pertenece cada
// candidato: el VIGENTE (la donación de ahora, el CIERRE del plazo) vs. uno de contexto
// (un aporte viejo, la fecha de una reunión). Van normalizados (minúsculas, sin tildes).
const MARCA_ACTUAL = ["hoy", "ahora", "este mes", "esta semana", "este ano", "acabo de", "recien", "en este momento", "actual"];
const MARCA_PREVIA = ["mes pasado", "mes anterior", "ano pasado", "ano anterior", "semana pasada", "la vez anterior", "anteriormente", "en su momento", "hace un", "hace dos"];
const MARCA_CIERRE = ["cierra", "cierre", "vence", "vencimiento", "plazo", "limite", "finaliza", "termina", "hasta el", "antes del", "fecha tope"];
const MARCA_REUNION = ["reunion", "encuentro", "junta", "charla", "evento", "taller", "asamblea", "capacitacion"];

type Marca = "vigente" | "previo" | "neutro";
type Candidato = { valor: string; marca: Marca };
type Resuelto = { valor: string | null; ambiguo: boolean };

/** La cláusula (entre `.;,`) que contiene la posición dada. Acota el contexto a un solo
 *  hecho: así los marcadores de la donación vieja no "contaminan" a la de hoy. */
function clausula(textoN: string, pos: number): string {
  let ini = 0;
  let fin = textoN.length;
  for (const m of textoN.matchAll(/[.;,]/g)) {
    if (m.index! < pos) ini = m.index! + 1;
    else {
      fin = m.index!;
      break;
    }
  }
  return textoN.slice(ini, fin);
}

/** Clasifica un candidato por los marcadores de su cláusula. Si la cláusula menciona
 *  marcas de ambos lados (o de ninguno), queda "neutro": no aporta para desempatar. */
function marcarContexto(ctx: string, vigentes: string[], previos: string[]): Marca {
  const esVigente = vigentes.some((p) => ctx.includes(p));
  const esPrevio = previos.some((p) => ctx.includes(p));
  if (esVigente && !esPrevio) return "vigente";
  if (esPrevio && !esVigente) return "previo";
  return "neutro";
}

/** Elige el candidato del hecho de la regla. Un solo candidato → ese (no cambia el
 *  historial de un dato único). Varios, pero uno solo marcado como vigente → ese. Si los
 *  marcadores no alcanzan a dejar uno solo (ninguno o más de uno vigente) → ambigüedad
 *  real: no adivinamos, se eleva (coherente con "ante la duda, una persona"). */
function elegirDelHecho(cands: Candidato[]): Resuelto {
  if (cands.length === 0) return { valor: null, ambiguo: false };
  if (cands.length === 1) return { valor: cands[0].valor, ambiguo: false };
  const vigentes = cands.filter((c) => c.marca === "vigente");
  if (vigentes.length === 1) return { valor: vigentes[0].valor, ambiguo: false };
  return { valor: null, ambiguo: true };
}

/** El importe de la donación VIGENTE del texto (no el primero ni el último por posición). */
function resolverImporte(texto: string): Resuelto {
  const textoN = normalizar(texto);
  const cands: Candidato[] = [];
  for (const m of textoN.matchAll(RE_IMPORTE)) {
    const valor = m[1] ? `${m[1]} $` : `${m[2]} €`;
    cands.push({ valor, marca: marcarContexto(clausula(textoN, m.index!), MARCA_ACTUAL, MARCA_PREVIA) });
  }
  return elegirDelHecho(cands);
}

/** La fecha del hecho principal del texto: el CIERRE del plazo, no la de una reunión. */
function resolverFecha(texto: string): Resuelto {
  const textoN = normalizar(texto);
  const cands: Candidato[] = [];
  for (const m of textoN.matchAll(RE_FECHA)) {
    let valor: string;
    if (m[1]) valor = `${m[1]} de ${MESES[MESES_N.indexOf(m[2])]}`;
    else if (m[3]) valor = `${m[3]}/${m[4]}`;
    else valor = DIAS[DIAS_N.indexOf(m[5])];
    cands.push({ valor, marca: marcarContexto(clausula(textoN, m.index!), MARCA_CIERRE, MARCA_REUNION) });
  }
  return elegirDelHecho(cands);
}

function aNumero(importe: string): number {
  const crudo = importe.replace(/[^\d.,]/g, "");
  // "1.200,50" -> 1200.50 ; "2.000" -> 2000 ; "300" -> 300
  const sinMiles = crudo.replace(/\.(?=\d{3}(\D|$))/g, "");
  return Number.parseFloat(sinMiles.replace(",", "."));
}

/** Extractores fijos. Las reglas solo pueden referenciarlos; nunca inventan datos nuevos. */
export const EXTRACTORES: Record<string, (texto: string) => string | null> = {
  // importe: el de la donación VIGENTE (por marcadores), no el primero del texto (#4).
  importe: (t) => resolverImporte(t).valor,
  // importe_ultimo: primitivo posicional (el último importe mencionado). Lo dejamos como
  // estaba por si una regla quiere "el más reciente"; la decisión por hecho vive en `importe`.
  importe_ultimo: (t) => importes(t).at(-1) ?? null,
  referencia: (t) => t.match(RE_REF)?.[0] ?? null,
  // fecha: la del hecho principal (el CIERRE del plazo), no la última del texto (#4).
  fecha: (t) => resolverFecha(t).valor,
  dia: (t) => {
    let ultimo: string | null = null;
    for (const m of normalizar(t).matchAll(new RegExp(`\\b(${DIAS_N.join("|")})s?\\b`, "g"))) ultimo = DIAS[DIAS_N.indexOf(m[1])];
    return ultimo;
  },
  mes: (t) => {
    const m = normalizar(t).match(new RegExp(`\\b(${MESES_N.join("|")})\\b`));
    return m ? MESES[MESES_N.indexOf(m[1])] : null;
  },
};
export const CAMPOS = Object.keys(EXTRACTORES);

/** Campos "por hecho" (importe, fecha) que el texto deja realmente ambiguos: hay más de un
 *  candidato y los marcadores no alcanzan a decidir a cuál hecho pertenece. `decidir` usa
 *  esto para ELEVAR con un motivo honesto («el texto trae más de uno») en vez de citar uno
 *  al azar o decir que "falta". Un dato único o desempatable NO es ambiguo. */
export function camposAmbiguos(texto: string): string[] {
  const out: string[] = [];
  if (resolverImporte(texto).ambiguo) out.push("importe");
  if (resolverFecha(texto).ambiguo) out.push("fecha");
  return out;
}

/** Límites que el loop no puede cambiar: viven en código, no en rules.json. */
export const LIMITES_DUROS = {
  siempreHumano: ["caso_familia", "denuncia_interna", "consulta_juridica", "conflicto_voluntarios"],
  nuncaAuto: ["proveedor_factura", "reparto_recursos", "subvencion_borrador", "informe_impacto", "prensa"],
};
export const LIMITES_SOP = [
  `Los tipos ${LIMITES_DUROS.siempreHumano.join(", ")} van siempre a una persona.`,
  `Los tipos ${LIMITES_DUROS.nuncaAuto.join(", ")} comprometen dinero o la voz pública de la ONG: nunca se resuelven en automático.`,
];

const max = (a: Clase, b: Clase): Clase => (NIVEL[a] >= NIVEL[b] ? a : b);

function contiene(textoN: string, palabras: string[]): string | null {
  for (const p of palabras) if (p && textoN.includes(normalizar(p))) return p;
  return null;
}

function contieneExacta(textoN: string, palabras: string[]): string | null {
  for (const p of palabras) {
    if (!p) continue;
    const re = new RegExp(`(^|[^a-z0-9ñ])${normalizar(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9ñ])`);
    if (re.test(textoN)) return p;
  }
  return null;
}

function coincide(regla: Regla, ev: Evento, textoN: string): boolean {
  const c = regla.cuando;
  if (c.tipos.length && !c.tipos.includes(ev.tipo)) return false;
  if (c.contiene_alguno.length && !contiene(textoN, c.contiene_alguno)) return false;
  if (c.no_contiene.length && contiene(textoN, c.no_contiene)) return false;
  if (c.importe_min !== null || c.importe_max !== null) {
    // Gatea contra el importe de la donación VIGENTE, no el último por posición (#4): si
    // el texto trae varios y es ambiguo, `importe` es null → la regla no coincide y el
    // evento cae al camino de elevación en vez de filtrar por el monto equivocado.
    const imp = EXTRACTORES.importe(ev.texto);
    if (!imp) return false;
    const n = aNumero(imp);
    if (c.importe_min !== null && n < c.importe_min) return false;
    if (c.importe_max !== null && n > c.importe_max) return false;
  }
  return true;
}

function renderizar(plantilla: string, datos: Record<string, string | null>): string {
  return plantilla.replace(/\{(\w+)\}/g, (_, k: string) => datos[k] ?? `{${k}}`);
}

export function decidir(ev: Evento, reglas: Reglas): Decision {
  const textoN = normalizar(ev.texto);
  const edadesEv = edades(ev.texto);
  const datos: Record<string, string | null> = {};
  for (const k of CAMPOS) datos[k] = EXTRACTORES[k](ev.texto);

  let cls: Clase;
  let regla: string;
  let accion: string;
  const motivos: string[] = [];

  const r = reglas.reglas.find((x) => coincide(x, ev, textoN));
  if (r) {
    regla = r.id;
    const usados = [...r.entonces.accion.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const faltan = [...new Set([...r.requiere, ...usados])].filter((k) => !datos[k]);
    if (faltan.length) {
      cls = r.si_falta_dato;
      // Un campo puede faltar por dos razones distintas: no está en el texto, o está pero
      // ambiguo entre varios hechos (#4). En ambos casos se eleva, pero el motivo se cuenta
      // honestamente: "el texto no lo trae" vs. "el texto trae más de uno".
      const ambiguos = new Set(camposAmbiguos(ev.texto));
      const ambig = faltan.filter((k) => ambiguos.has(k));
      const ausentes = faltan.filter((k) => !ambiguos.has(k));
      const partes: string[] = [];
      if (ausentes.length) partes.push(`confirmar ${ausentes.join(", ")} (el texto no lo trae)`);
      if (ambig.length) partes.push(`decidir a qué hecho corresponde ${ambig.join(", ")} (el texto trae más de uno)`);
      accion = `Preparada la gestión según ${r.id}, pendiente de ${partes.join("; ")}.`;
      if (ausentes.length) motivos.push(`falta ${ausentes.join(", ")}`);
      if (ambig.length) motivos.push(`ambiguo ${ambig.join(", ")}`);
    } else {
      cls = r.entonces.clasificacion;
      accion = renderizar(r.entonces.accion, datos);
    }
  } else {
    regla = "—";
    cls = reglas.por_defecto.clasificacion;
    accion = reglas.por_defecto.accion;
    motivos.push("ninguna regla coincide");
  }

  for (const s of reglas.salvaguardas) {
    let hit = contiene(textoN, s.palabras) ?? contieneExacta(textoN, s.palabras_exactas);
    if (!hit && s.edad_menor_de !== null) {
      const menor = edadesEv.find((n) => n < s.edad_menor_de!);
      if (menor !== undefined) hit = `${menor} años`;
    }
    if (hit && NIVEL[s.nivel_minimo] > NIVEL[cls]) {
      cls = s.nivel_minimo;
      regla = `${regla}·${s.id}`;
      accion =
        s.nivel_minimo === "humano"
          ? `Escalado a una persona por ${s.id} («${hit}»): ${s.sop}`
          : `Preparada la respuesta, pendiente de aprobación por ${s.id} («${hit}»): ${s.sop}`;
      motivos.push(`${s.id}: «${hit}»`);
    }
  }

  // Piso INMUTABLE por contenido. Vive en código (ver lib/salvaguardas-inmutables.ts), así
  // que el loop no lo puede quitar ni rebajar vía rules.json. Corre DESPUÉS de las reglas y
  // de las salvaguardas de rules.json y SIEMPRE eleva (sube el nivel, nunca lo baja), sea
  // cual sea el tipo del evento: una denuncia de acoso escondida en un acuse de donación
  // eleva igual aunque la regla base ya haya resuelto el acuse en `auto`.
  for (const s of SALVAGUARDAS_INMUTABLES) {
    let hit = contiene(textoN, s.palabras);
    if (!hit && s.edadMenorDe !== null) {
      const menor = edadesEv.find((n) => n < s.edadMenorDe!);
      if (menor !== undefined) hit = `${menor} años`;
    }
    if (hit && NIVEL[s.nivelMinimo] > NIVEL[cls]) {
      cls = s.nivelMinimo;
      regla = `${regla}·${s.id}`;
      accion =
        s.nivelMinimo === "humano"
          ? `Escalado a una persona por salvaguarda inmutable ${s.id} («${hit}»): ${s.sop}`
          : `Preparada la respuesta, pendiente de aprobación por salvaguarda inmutable ${s.id} («${hit}»): ${s.sop}`;
      motivos.push(`inmutable ${s.id}: «${hit}»`);
    }
  }

  const piso: Clase = LIMITES_DUROS.siempreHumano.includes(ev.tipo)
    ? "humano"
    : LIMITES_DUROS.nuncaAuto.includes(ev.tipo)
      ? "aprobar"
      : "auto";
  if (NIVEL[piso] > NIVEL[cls]) {
    cls = max(cls, piso);
    regla = `${regla}·límite`;
    motivos.push(`límite duro: ${ev.tipo}`);
    if (piso === "humano") accion = `Requiere a una persona (límite duro para ${ev.tipo}).`;
    else accion = `Preparado para aprobación (límite duro para ${ev.tipo}): ${accion}`;
  }

  return { cls, regla, accion, motivos };
}

/** Errores de forma que el schema de salida no puede expresar. Vacío = válido. */
export function validarReglas(r: Reglas): string[] {
  const errores: string[] = [];
  const ids = new Set<string>();
  for (const x of [...r.reglas, ...r.salvaguardas]) {
    if (ids.has(x.id)) errores.push(`id duplicado: ${x.id}`);
    ids.add(x.id);
  }
  for (const x of r.reglas) {
    for (const m of x.entonces.accion.matchAll(/\{(\w+)\}/g)) {
      if (!CAMPOS.includes(m[1])) errores.push(`${x.id}: campo desconocido {${m[1]}}`);
    }
    for (const k of x.requiere) if (!CAMPOS.includes(k)) errores.push(`${x.id}: requiere campo desconocido ${k}`);
    if (x.entonces.accion.trim().length < 12) errores.push(`${x.id}: acción demasiado vaga`);
    if (/\b(preguntar|consultar con|esperar|pendiente de|revisar con)\b/i.test(x.entonces.accion) && x.entonces.clasificacion === "auto") {
      errores.push(`${x.id}: acción auto que delega`);
    }
  }
  for (const x of r.reglas) {
    if (x.si_falta_dato === "auto") errores.push(`${x.id}: si falta un dato no puede resolverse en automático`);
  }
  for (const s of r.salvaguardas) {
    if (s.nivel_minimo === "auto") errores.push(`${s.id}: una salvaguarda no puede bajar a auto`);
    if (!s.palabras.length && !s.palabras_exactas.length && s.edad_menor_de === null) errores.push(`${s.id}: salvaguarda sin disparador`);
  }
  return errores;
}

export function reglaAJson(x: Regla | Reglas["salvaguardas"][number]): string[] {
  const { sop: _sop, ...resto } = x as Regla;
  return JSON.stringify(resto, null, 2).split("\n");
}
