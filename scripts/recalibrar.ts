/**
 * Recalcula el umbral calibrado de cada semana a partir del historial ya generado.
 * Es determinista (solo usa revisiones y veredictos guardados): no llama a ningún modelo.
 *
 *   npx tsx scripts/recalibrar.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { calibrarUmbral, type Fila, mediaMovil } from "../lib/metricas";
import { CLASES, type Clase, type Historial } from "../lib/types";

const h: Historial = JSON.parse(readFileSync("data/historial.json", "utf8"));
const calibrados: Record<Clase, number[]> = { auto: [], aprobar: [], humano: [] };

for (const s of h.semanas) {
  const filas: Fila[] = h.eventos.filter((e) => e.semana === s.id).map((e) => ({ decision: e.decision, jev: e.jev, revision: e.revision, verdad: e.verdad }));
  for (const c of CLASES) {
    const t = s.enCurso ? null : calibrarUmbral(filas, c);
    if (t !== null) calibrados[c].push(t);
    s.umbralCalibrado[c] = calibrados[c].length ? calibrados[c].at(-1)! : s.umbrales[c];
  }
  console.log(s.id, JSON.stringify(s.umbralCalibrado));
}
for (const c of CLASES) console.log(`recomendado ${c}: ${calibrados[c].length ? mediaMovil(calibrados[c]) : "sin datos"}`);
writeFileSync("data/historial.json", JSON.stringify(h));
