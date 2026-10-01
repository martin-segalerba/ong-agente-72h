"use client";

import { useState } from "react";
import type { Propuesta, Semana } from "@/lib/types";

const W = 760;
const H = 220;
const M = { t: 16, r: 116, b: 30, l: 40 };

const SERIES = [
  { k: "precision" as const, label: "Precisión real", color: "var(--serie-precision)", valor: (s: Semana) => s.metricas.precisionVerdad ?? 0 },
  { k: "autonomia" as const, label: "Resuelto sin persona", color: "var(--serie-autonomia)", valor: (s: Semana) => s.metricas.sinPersona },
];

/** Precisión contra la etiqueta sintética y autonomía, semana a semana, en un solo eje (ambas en %). */
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
              <span style={{ width: 14, height: 2, background: s.color, display: "inline-block" }} />
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
                {["semana", "reglas", "eventos", "precisión real", "sin persona", "correcciones", "señales fuertes"].map((h, i) => (
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
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Precisión real y porcentaje resuelto sin persona por semana" onMouseLeave={() => setHover(null)}>
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
                <path d={camino(s.valor)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {semanas.map((w, i) => (
                  <circle key={w.id} cx={x(i)} cy={y(s.valor(w))} r={hover === i ? 5 : 4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                ))}
                <text x={x(ultima) + 10} y={y(s.valor(semanas[ultima])) + 4} fontSize={11} fill="var(--ink-2)" fontFamily="var(--mono)">
                  {s.valor(semanas[ultima]).toFixed(0)}% {s.k === "precision" ? "precisión" : "autonomía"}
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
              <div style={{ color: "var(--ink-2)" }}>precisión real {semanas[hover].metricas.precisionVerdad ?? "—"} %</div>
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
        La precisión real se mide contra la etiqueta que conoce el generador de semanas sintéticas: ni las reglas, ni Jev, ni Opus la ven. En producción no existe;
        ahí el sistema se guía solo por las correcciones humanas y el veredicto de Jev.
      </div>
    </section>
  );
}
