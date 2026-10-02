"use client";

import { useState } from "react";
import type { Propuesta, Semana } from "@/lib/types";

const W = 760;
const H = 220;
const M = { t: 16, r: 116, b: 30, l: 40 };

const SERIES = [
  { k: "vista" as const, corto: "vista", label: "Precisión en frases vistas", color: "var(--serie-precision)", guion: undefined, valor: (s: Semana) => s.metricas.precisionVerdad ?? 0 },
  { k: "nueva" as const, corto: "nueva", label: "Precisión en frases nuevas", color: "var(--serie-nueva)", guion: "5 4", valor: (s: Semana) => s.metricas.precisionNueva ?? 0 },
  { k: "autonomia" as const, corto: "autonomía", label: "Resuelto sin persona", color: "var(--serie-autonomia)", guion: undefined, valor: (s: Semana) => s.metricas.sinPersona },
];

/** Precisión contra la etiqueta sintética (en frases vistas y nuevas) y autonomía, en un solo eje: todas en %. */
export function Evolucion({ semanas, propuestas }: { semanas: Semana[]; propuestas: Propuesta[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = (i: number) => M.l + (semanas.length === 1 ? iw / 2 : (i / (semanas.length - 1)) * iw);
  const y = (v: number) => M.t + ih - (v / 100) * ih;
  const camino = (f: (s: Semana) => number) => semanas.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f(s)).toFixed(1)}`).join(" ");
  const cambios = semanas.map((s, i) => (i > 0 && s.reglasVersion !== semanas[i - 1].reglasVersion ? s.reglasVersion : null));
  const ultima = semanas.length - 1;
  const correcciones = (s: Semana) => s.metricas.reversionesTotales;
  // Etiquetas del extremo derecho separadas al menos 13 px para que no se pisen.
  const yEtiqueta: Record<string, number> = {};
  [...SERIES]
    .map((s) => ({ k: s.k, y: y(s.valor(semanas[ultima])) }))
    .sort((a, b) => a.y - b.y)
    .forEach((e, i, xs) => {
      yEtiqueta[e.k] = i ? Math.max(e.y, yEtiqueta[xs[i - 1].k] + 13) : e.y;
    });

  return (
    <section className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="cabecera" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">Evolución · {semanas[0]?.id}–{semanas.at(-1)?.id}</div>
          <h2 className="h2" style={{ fontSize: 17 }}>
            Cómo cambió el sistema solo, semana a semana
          </h2>
        </div>
        <div className="fila" style={{ gap: 16, flexWrap: "wrap" }}>
          {SERIES.map((s) => (
            <span key={s.k} className="fila" style={{ gap: 7, fontSize: 12, color: "var(--ink-2)" }}>
              <svg width="16" height="4" aria-hidden="true">
                <line x1="0" x2="16" y1="2" y2="2" stroke={s.color} strokeWidth="2" strokeDasharray={s.guion} />
              </svg>
              {s.label}
            </span>
          ))}
          <button type="button" className="btn btn-quiet" onClick={() => setTabla((t) => !t)}>
            {tabla ? "Ver gráfico" : "Ver tabla"}
          </button>
        </div>
      </div>

      {tabla ? (
        <div style={{ overflowX: "auto" }}>
          <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "right" }}>
                {["semana", "reglas", "eventos", "precisión vista", "precisión nueva", "sin persona", "correcciones", "señales fuertes"].map((h, i) => (
                  <th key={h} style={{ fontWeight: 500, padding: "6px 8px", textAlign: i < 2 ? "left" : "right", borderBottom: "1px solid var(--line)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((s) => (
                <tr key={s.id} style={{ textAlign: "right" }}>
                  <td style={{ padding: "6px 8px", textAlign: "left" }}>
                    {s.id}
                    {s.enCurso ? " · en curso" : ""}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "left", color: "var(--muted)" }}>v{s.reglasVersion}</td>
                  <td style={{ padding: "6px 8px" }}>{s.metricas.eventos}</td>
                  <td style={{ padding: "6px 8px" }}>{s.metricas.precisionVerdad ?? "—"} %</td>
                  <td style={{ padding: "6px 8px" }}>{s.metricas.precisionNueva ?? "—"} %</td>
                  <td style={{ padding: "6px 8px" }}>{s.metricas.sinPersona} %</td>
                  <td style={{ padding: "6px 8px" }}>{s.enCurso ? "—" : correcciones(s)}</td>
                  <td style={{ padding: "6px 8px" }}>{s.metricas.sobreUmbral}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Precisión en frases vistas y nuevas, y porcentaje resuelto sin persona, por semana" onMouseLeave={() => setHover(null)}>
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line x1={M.l} x2={M.l + iw} y1={y(v)} y2={y(v)} stroke="var(--line-soft)" strokeWidth={1} />
                <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--muted-2)" fontFamily="var(--mono)">
                  {v}%
                </text>
              </g>
            ))}
            {cambios.map((v, i) =>
              v ? (
                <g key={i}>
                  <line x1={x(i)} x2={x(i)} y1={M.t} y2={M.t + ih} stroke="var(--line)" strokeDasharray="2 3" />
                  <text x={x(i) + 4} y={M.t + ih - 6} fontSize={10} fill="var(--muted)" fontFamily="var(--mono)">
                    v{v}
                  </text>
                </g>
              ) : null,
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ih} stroke="var(--muted-2)" strokeWidth={1} />}
            {SERIES.map((s) => (
              <g key={s.k}>
                <path d={camino(s.valor)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.guion} />
                {semanas.map((w, i) => (
                  <circle key={w.id} cx={x(i)} cy={y(s.valor(w))} r={hover === i ? 5 : 4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                ))}
                <text x={x(ultima) + 10} y={yEtiqueta[s.k] + 4} fontSize={11} fill="var(--ink-2)" fontFamily="var(--mono)">
                  {s.valor(semanas[ultima]).toFixed(0)}% {s.corto}
                </text>
              </g>
            ))}
            {semanas.map((s, i) => (
              <g key={s.id}>
                <text x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill={s.enCurso ? "var(--ink)" : "var(--muted-2)"} fontFamily="var(--mono)">
                  {s.id}
                </text>
                <rect x={x(i) - iw / (semanas.length - 1 || 1) / 2} y={M.t} width={iw / (semanas.length - 1 || 1)} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            ))}
          </svg>
          {hover !== null && (
            <div
              className="card mono"
              style={{
                position: "absolute",
                top: 8,
                left: `${(x(hover) / W) * 100}%`,
                transform: hover > semanas.length / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
                padding: "8px 10px",
                fontSize: 11,
                lineHeight: 1.6,
                pointerEvents: "none",
                background: "var(--deep)",
                borderColor: "var(--line-strong)",
                whiteSpace: "nowrap",
              }}
            >
              <div style={{ color: "var(--ink)", fontWeight: 600 }}>
                {semanas[hover].id} · reglas v{semanas[hover].reglasVersion}
                {semanas[hover].enCurso ? " · en curso" : ""}
              </div>
              <div style={{ color: "var(--ink-2)" }}>precisión en frases vistas {semanas[hover].metricas.precisionVerdad ?? "—"} %</div>
              <div style={{ color: "var(--ink-2)" }}>precisión en frases nuevas {semanas[hover].metricas.precisionNueva ?? "—"} %</div>
              <div style={{ color: "var(--ink-2)" }}>sin persona {semanas[hover].metricas.sinPersona} %</div>
              <div style={{ color: "var(--muted)" }}>
                {semanas[hover].metricas.eventos} eventos · {semanas[hover].metricas.sobreUmbral} señales fuertes
              </div>
              {propuestas.find((p) => p.fecha.slice(0, 10) === semanas[hover].inicio) && (
                <div style={{ color: "var(--muted)" }}>
                  lunes: {propuestas.find((p) => p.fecha.slice(0, 10) === semanas[hover].inicio)!.id} ·{" "}
                  {propuestas.find((p) => p.fecha.slice(0, 10) === semanas[hover].inicio)!.estado}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="nota-sm">
        La precisión se mide contra la etiqueta que conoce el generador de semanas sintéticas; ni las reglas, ni Jev, ni los modelos la ven. «Vista» usa los mismos textos de los
        que aprende el loop; «nueva», paráfrasis que el loop nunca leyó: la distancia entre las dos es cuánto memoriza en vez de generalizar. En producción no existe ninguna de las dos.
      </div>
    </section>
  );
}
