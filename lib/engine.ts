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

function aNumero(importe: string): number {
  const crudo = importe.replace(/[^\d.,]/g, "");
  // "1.200,50" -> 1200.50 ; "2.000" -> 2000 ; "300" -> 300
  const sinMiles = crudo.replace(/\.(?=\d{3}(\D|$))/g, "");
  return Number.parseFloat(sinMiles.replace(",", "."));
}

/** Extractores fijos. Las reglas solo pueden referenciarlos; nunca inventan datos nuevos. */
export const EXTRACTORES: Record<string, (texto: string) => string | null> = {
  importe: (t) => importes(t)[0] ?? null,
  importe_ultimo: (t) => importes(t).at(-1) ?? null,
  referencia: (t) => t.match(RE_REF)?.[0] ?? null,
  fecha: (t) => {
    let ultima: string | null = null;
    for (const m of normalizar(t).matchAll(RE_FECHA)) {
      if (m[1]) ultima = `${m[1]} de ${MESES[MESES_N.indexOf(m[2])]}`;
      else if (m[3]) ultima = `${m[3]}/${m[4]}`;
      else if (m[5]) ultima = DIAS[DIAS_N.indexOf(m[5])];
    }
    return ultima;
  },
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
    const imp = EXTRACTORES.importe_ultimo(ev.texto);
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
      accion = `Preparada la gestión según ${r.id}, pendiente de confirmar ${faltan.join(", ")}: el texto no lo trae.`;
      motivos.push(`falta ${faltan.join(", ")}`);
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
