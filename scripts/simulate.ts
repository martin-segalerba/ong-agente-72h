/**
 * Simula ocho semanas de operación con el loop real: cada lunes Opus propone sobre
 * todo lo anterior, se re-ejecuta el historial, Jev audita lo que cambia y una persona
 * simulada aprueba o rechaza mirando las métricas. La semana en curso (S40) queda con
 * su propuesta pendiente y sin revisiones, para que las haga una persona de verdad.
 *
 *   npm run simulate           (necesita ANTHROPIC_API_KEY y TYPESAFE_API_KEY)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decidir } from "../lib/engine";
import { auditarLote, PREGUNTA_JEV_V1 } from "../lib/jev";
import { decisionSimulada, ejecutarLoop } from "../lib/loop";
import { aciertaVerdad, calcularMetricas, calibrarUmbral, type Fila, mediaMovil, senalFuerte, UMBRALES_INICIALES } from "../lib/metricas";
import { MODELO_OPUS } from "../lib/opus";
import { REGLAS_V1 } from "../lib/reglas-v1";
import { type Auditoria, CLASES, type Clase, type Decision, type EventoProcesado, type Historial, type Revision, type Umbrales } from "../lib/types";
import { type EventoSintetico, generarSemana, PLANTILLAS, rng } from "./semanas";

for (const l of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const SEMANAS = ["S33", "S34", "S35", "S36", "S37", "S38", "S39", "S40"].slice(0, Number(process.env.SEMANAS ?? 8));
const PRIMER_LUNES = Date.UTC(2026, 7, 10); // lunes 10 ago 2026
const AHORA = new Date("2026-10-01T15:30:00+02:00");
const POR_SEMANA = 36;
const CACHE = "data/jev-cache.json";

const lunesDe = (i: number) => new Date(PRIMER_LUNES + i * 7 * 86400000);
const fmt = (d: Date) => `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;

function revisionSimulada(e: EventoSintetico, d: Decision, a: Auditoria, u: Umbrales, r: () => number): Revision | null {
  const auditoria = d.cls === "auto" && r() < 0.2;
  if (d.cls === "auto" && !senalFuerte(d, a, u) && !auditoria) return null;
  const p = PLANTILLAS[e.plantilla];
  const base = { por: "simulado" as const, clsOriginal: d.cls, accionOriginal: d.accion };
  if (d.cls !== e.verdad.cls) return { ...base, tipo: "revertido", objetivo: e.verdad.cls, motivo: p.motivo };
  if (!aciertaVerdad(d, e.verdad)) {
    return { ...base, tipo: "rechazado", objetivo: d.cls, motivo: p.motivoAccion ?? `La acción no cita el dato correcto (${e.verdad.clave}).` };
  }
  const tipo = d.cls === "aprobar" ? "aprobado" : d.cls === "humano" ? "gestionado" : "confirmado";
  return { ...base, tipo, objetivo: null, motivo: "" };
}

async function main() {
  mkdirSync("data", { recursive: true });
  const cache: Record<string, Auditoria> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const pregunta = PREGUNTA_JEV_V1;
  const h: Historial = {
    generado: new Date().toISOString(),
    modeloOpus: MODELO_OPUS,
    modeloJev: "jev-latest",
    semanas: [],
    eventos: [],
    versiones: [{ v: 1, fecha: "2026-08-10", propuesta: null, nota: "Reglas iniciales: acuse, alta, plazo y factura", reglas: REGLAS_V1 }],
    propuestas: [],
    preguntasJev: [pregunta],
    jevCache: cache,
  };
  let reglas = REGLAS_V1;
  let version = 1;
  const umbrales: Umbrales = { ...UMBRALES_INICIALES };
  const calibrados: Record<Clase, number[]> = { auto: [], aprobar: [], humano: [] };
  let nId = 1;

  for (const [i, s] of SEMANAS.entries()) {
    const lunes = lunesDe(i);
    const enCurso = s === "S40";
    console.log(`\n== ${s} (${fmt(lunes)}) reglas v${version}`);

    if (i > 0) {
      const fecha = `${lunes.toISOString().slice(0, 10)}T06:00`;
      const id = `P-${String(i).padStart(3, "0")}`;
      try {
        const p = await ejecutarLoop({
          eventos: h.eventos,
          reglas,
          version,
          pregunta,
          umbrales,
          cache,
          rechazadas: h.propuestas.filter((x) => x.estado === "rechazada").map((x) => ({ titulo: x.titulo, motivo: x.motivoDecision })),
          id,
          fecha,
          semanaDatos: SEMANAS[i - 1],
          log: console.log,
        });
        if (p) {
          if (!enCurso) {
            const dec = decisionSimulada(p);
            p.estado = dec.aprobar ? "aprobada" : "rechazada";
            p.decididaPor = "simulado";
            p.motivoDecision = dec.motivo;
            if (dec.aprobar) {
              version = p.nuevaVersion;
              reglas = p.reglas;
              h.versiones.unshift({ v: version, fecha: fecha.slice(0, 10), propuesta: id, nota: p.titulo, reglas });
            }
          }
          h.propuestas.unshift(p);
          console.log(`  ${id}: ${p.titulo} -> ${p.estado} | verdad ${p.metricasAntes.precisionVerdad}% -> ${p.metricasDespues.precisionVerdad}%`);
        }
      } catch (err) {
        console.error(`  loop falló en ${s}:`, err instanceof Error ? err.message : err);
      }
      writeFileSync(CACHE, JSON.stringify(cache));
    }

    const hasta = enCurso ? AHORA : undefined;
    const sint = generarSemana(s, lunes, enCurso ? 30 : POR_SEMANA, 1000 + i * 97, hasta);
    for (const e of sint) e.id = `e${String(nId++).padStart(3, "0")}`;
    const decisiones = sint.map((e) => decidir(e, reglas));
    const auds = await auditarLote(pregunta, sint.map((e, j) => ({ ev: e, d: decisiones[j] })), cache);
    writeFileSync(CACHE, JSON.stringify(cache));

    const r = rng(77 + i);
    const procesados: EventoProcesado[] = sint.map((e, j) => ({
      id: e.id,
      t: e.t,
      tipo: e.tipo,
      texto: e.texto,
      semana: s,
      reglasVersion: version,
      decision: decisiones[j],
      jev: auds[j],
      revision: enCurso ? null : revisionSimulada(e, decisiones[j], auds[j], umbrales, r),
      verdad: e.verdad,
    }));
    h.eventos.push(...procesados);

    const filas: Fila[] = procesados.map((e) => ({ decision: e.decision, jev: e.jev, revision: e.revision, verdad: e.verdad }));
    const calibrado = {} as Umbrales;
    for (const c of CLASES) {
      const t = enCurso ? null : calibrarUmbral(filas, c);
      if (t !== null) calibrados[c].push(t);
      calibrado[c] = calibrados[c].length ? calibrados[c].at(-1)! : umbrales[c];
    }
    const fin = new Date(lunes.getTime() + 6 * 86400000);
    const m = calcularMetricas(filas, umbrales);
    h.semanas.push({
      id: s,
      inicio: lunes.toISOString().slice(0, 10),
      fin: fin.toISOString().slice(0, 10),
      etiqueta: `${s} · ${fmt(lunes)} – ${fmt(fin)} ${fin.getUTCFullYear()}`,
      reglasVersion: version,
      umbrales: { ...umbrales },
      umbralCalibrado: calibrado,
      metricas: m,
      enCurso,
    });
    console.log(`  ${procesados.length} eventos | verdad ${m.precisionVerdad}% | sin persona ${m.sinPersona}% | señales ${m.sobreUmbral}`);
  }

  for (const c of CLASES) console.log(`recomendado ${c}: ${calibrados[c].length ? mediaMovil(calibrados[c]) : "—"} (${calibrados[c].join(", ")})`);
  h.jevCache = cache;
  writeFileSync("data/historial.json", JSON.stringify(h));
  writeFileSync(CACHE, JSON.stringify(cache));
  console.log(`\nescrito data/historial.json · ${h.eventos.length} eventos · ${h.propuestas.length} propuestas · reglas v${version}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
