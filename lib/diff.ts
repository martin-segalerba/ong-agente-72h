import type { Reglas } from "./types";

export interface LineaDiff {
  k: " " | "+" | "-" | "@";
  o: number | "";
  n: number | "";
  t: string;
}

/** Diff de líneas por LCS, con contexto de `ctx` líneas alrededor de cada cambio. */
export function diffLineas(a: string[], b: string[], ctx = 2): LineaDiff[] {
  const m = a.length;
  const n = b.length;
  const L: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const todo: LineaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) todo.push({ k: " ", o: ++i, n: ++j, t: a[i - 1] });
    else if (j < n && (i === m || L[i][j + 1] >= L[i + 1][j])) todo.push({ k: "+", o: "", n: ++j, t: b[j - 1] });
    else todo.push({ k: "-", o: ++i, n: "", t: a[i - 1] });
  }
  const visible = todo.map((l, idx) => l.k !== " " || todo.slice(Math.max(0, idx - ctx), idx + ctx + 1).some((x) => x.k !== " "));
  const out: LineaDiff[] = [];
  todo.forEach((l, idx) => {
    if (!visible[idx]) return;
    if (idx > 0 && !visible[idx - 1]) out.push({ k: "@", o: "", n: "", t: `@@ línea ${l.o || l.n} @@` });
    out.push(l);
  });
  return out;
}

export function sopLineas(r: Reglas): string[] {
  return [
    ...r.salvaguardas.map((s) => `${s.id} · ${s.sop.replace(/`/g, "")}`),
    ...r.reglas.map((x) => `${x.id} · ${x.sop.replace(/`/g, "")}`),
    `Por defecto · ${r.por_defecto.clasificacion}: ${r.por_defecto.accion}`,
  ];
}

export function jsonLineas(r: Reglas): string[] {
  const sinSop = {
    salvaguardas: r.salvaguardas.map(({ sop: _s, ...x }) => x),
    reglas: r.reglas.map(({ sop: _s, ...x }) => x),
    por_defecto: r.por_defecto,
  };
  return JSON.stringify(sinSop, null, 2).split("\n");
}
