"use client";

import { useState } from "react";
import { diffLineas, jsonLineas, sopLineas } from "@/lib/diff";
import type { Ejemplo, Metricas, Propuesta, Semana, Umbrales, VersionReglas } from "@/lib/types";
import { Evolucion } from "./evolucion";
import { tokens } from "./setup";
import { Badge, f2, ST } from "./ui";

const ESTADO: Record<Propuesta["estado"], { label: string; c: string; bd: string }> = {
  pendiente: { label: "PENDIENTE DE REVISIÓN", c: "var(--accent)", bd: "rgba(214,236,106,0.4)" },
  aprobada: { label: "APROBADA", c: "var(--ink)", bd: "var(--line-strong)" },
  rechazada: { label: "RECHAZADA", c: "var(--muted)", bd: "var(--line-strong)" },
};

function fechaHora(f: string) {
  const d = new Date(`${f.length <= 16 ? `${f}:00` : f}`);
  const dia = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getDay()];
  const mes = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getMonth()];
  return `${dia} ${d.getDate()} ${mes} ${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function filasMetricas(a: Metricas, b: Metricas) {
  const fila = (k: string, va: number, vb: number, bueno: 1 | -1 | 0, color?: string, sufijo = "") => ({ k, va, vb, bueno, color, sufijo });
  return [
    { h: "Veredictos de Jev · Σ confianza" },
    fila("correcta", a.veredictos.correcta, b.veredictos.correcta, 1),
    fila("demasiado_cautelosa", a.veredictos.demasiado_cautelosa, b.veredictos.demasiado_cautelosa, -1),
    fila("demasiado_atrevida", a.veredictos.demasiado_atrevida, b.veredictos.demasiado_atrevida, -1),
    fila("accion_no_fundamentada", a.veredictos.accion_no_fundamentada, b.veredictos.accion_no_fundamentada, -1),
    fila("señal fuerte (≥ umbral)", a.sobreUmbral, b.sobreUmbral, -1),
    { h: "Clasificación de reglas" },
    fila("auto", a.clases.auto, b.clases.auto, 0, ST.auto.c),
    fila("aprobar", a.clases.aprobar, b.clases.aprobar, 0, ST.aprobar.c),
    fila("humano", a.clases.humano, b.clases.humano, 0, ST.humano.c),
    fila("resuelto sin persona", a.sinPersona, b.sinPersona, 0, undefined, " %"),
    { h: "Historial humano" },
    fila(`correcciones reproducidas /${b.reversionesTotales}`, a.reversionesReproducidas, b.reversionesReproducidas, 1),
    fila("confirmadas por una persona que cambian", a.confirmadasRotas, b.confirmadasRotas, -1),
    fila("sin revisar, asumidas correctas, que cambian", a.implicitasQueCambian ?? 0, b.implicitasQueCambian ?? 0, 0),
    ...(a.precisionVerdad !== undefined && b.precisionVerdad !== undefined
      ? [
          { h: "Datos sintéticos · no lo ve el loop" },
          fila("precisión en frases vistas", a.precisionVerdad, b.precisionVerdad, 1, undefined, " %"),
          ...(a.precisionNueva !== undefined && b.precisionNueva !== undefined ? [fila("precisión en frases nuevas", a.precisionNueva, b.precisionNueva, 1, undefined, " %")] : []),
        ]
      : []),
  ];
}

const NOMBRE_MODELO: Record<string, string> = {
  "claude-opus-5-5": "Opus 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-opus-5": "Opus 5",
  "claude-sonnet-5": "Sonnet 5",
};
const modelo = (id: string) => NOMBRE_MODELO[id] ?? id;

function Diff({ antes, despues }: { antes: VersionReglas["reglas"]; despues: VersionReglas["reglas"] }) {
  const archivos = [
    { file: "rules.sop.md", code: false, lineas: diffLineas(sopLineas(antes), sopLineas(despues), 0) },
    { file: "rules.json", code: true, lineas: diffLineas(jsonLineas(antes), jsonLineas(despues), 2) },
  ];
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden", background: "var(--deep)" }}>
      {archivos.map((f) => (
        <div key={f.file}>
          <div className="mono fila" style={{ padding: "9px 14px", background: "var(--card)", borderBottom: "1px solid var(--line)", gap: 10, fontSize: 11, fontWeight: 500, color: "var(--muted)" }}>
            <span>{f.file}</span>
            <span style={{ marginLeft: "auto", color: "var(--accent)" }}>+{f.lineas.filter((l) => l.k === "+").length}</span>
            <span>−{f.lineas.filter((l) => l.k === "-").length}</span>
          </div>
          <div className="codigo" style={{ padding: "6px 0 10px", maxHeight: f.code ? 420 : undefined, overflowY: "auto" }}>
            {!f.lineas.length && <div className="nota-sm" style={{ padding: "4px 14px" }}>Sin cambios en este archivo.</div>}
            {f.lineas.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "38px 38px 22px minmax(0,1fr)", background: l.k === "+" ? "rgba(214,236,106,0.08)" : l.k === "-" ? "rgba(255,255,255,0.03)" : l.k === "@" ? "var(--hover)" : "transparent" }}>
                <span style={{ textAlign: "right", paddingRight: 8, color: "var(--faint)", userSelect: "none" }}>{l.o}</span>
                <span style={{ textAlign: "right", paddingRight: 8, color: "var(--faint)", userSelect: "none" }}>{l.n}</span>
                <span style={{ textAlign: "center", color: l.k === "+" ? "var(--accent)" : "var(--muted)", userSelect: "none" }}>{l.k === "-" ? "−" : l.k === "+" ? "+" : ""}</span>
                <span style={{ whiteSpace: "pre-wrap", paddingRight: 14, textDecoration: l.k === "-" ? "line-through" : "none", fontFamily: f.code || l.k === "@" ? "var(--mono)" : "var(--sans)" }}>
                  {l.k === "-" ? (
                    <span style={{ color: "#7d7a73" }}>{l.t}</span>
                  ) : l.k === "@" ? (
                    <span style={{ color: "var(--muted-2)" }}>{l.t}</span>
                  ) : f.code ? (
                    tokens(l.t).map((t, j) => (
                      <span key={j} style={{ color: t.c }}>
                        {t.t}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: l.k === "+" ? "var(--ink)" : "var(--muted)" }}>{l.t}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Lado({ d, umbrales }: { d: Ejemplo["antes"]; umbrales: Umbrales }) {
  const pesa = d.conf >= umbrales[d.cls];
  return (
    <div className="pila" style={{ gap: 6, minWidth: 0 }}>
      <span style={{ alignSelf: "flex-start" }}>
        <Badge cls={d.cls} />
      </span>
      <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
        {d.v}{" "}
        <span style={{ fontWeight: 600, color: pesa ? "var(--ink)" : "var(--muted-2)" }}>{f2(d.conf)}</span>
      </span>
      <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>{d.accion}</span>
    </div>
  );
}

interface Props {
  semanas: Semana[];
  propuestas: Propuesta[];
  versiones: VersionReglas[];
  activa: VersionReglas;
  umbrales: Umbrales;
  onDecidir: (p: Propuesta, aprobar: boolean) => void;
  onRevertirVersion: (v: number) => void;
  onEjecutarLoop: () => Promise<void>;
  ejecutando: string | null;
  errorLoop: string | null;
  revisionesUsuario: number;
  loopHabilitado: boolean;
  revertidas: number[];
}

export function Mejoras({ semanas, propuestas, versiones, activa, umbrales, onDecidir, onRevertirVersion, onEjecutarLoop, ejecutando, errorLoop, revisionesUsuario, loopHabilitado, revertidas }: Props) {
  const pendiente = propuestas.find((p) => p.estado === "pendiente");
  const [selId, setSelId] = useState<string | null>(null);
  const [confirmarRevert, setConfirmarRevert] = useState(false);
  const p = propuestas.find((x) => x.id === selId) ?? pendiente ?? propuestas[0];
  const base = p && versiones.find((v) => v.v === p.baseVersion);
  const idxActiva = versiones.findIndex((v) => v.v === activa.v);
  const anterior = versiones[idxActiva + 1];
  const siguienteV = Math.max(...versiones.map((v) => v.v)) + 1;
  const baseVieja = !!p && p.baseVersion !== activa.v;

  return (
    <div className="pila" style={{ gap: 22 }}>
      <Evolucion semanas={semanas} propuestas={propuestas} />

      {p && base && (
        <>
          <div className="cabecera" style={{ marginTop: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">
                Propuesta {p.id} · Opus · {fechaHora(p.fecha)}
              </div>
              <h1 className="h1" style={{ textWrap: "pretty" }}>
                {p.titulo.replace(/`/g, "")}
              </h1>
            </div>
            <span className="mono" style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 10px", border: `1px solid ${ESTADO[p.estado].bd}`, borderRadius: 3, fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: ESTADO[p.estado].c }}>
              {ESTADO[p.estado].label}
              {p.estado === "aprobada" ? ` · v${p.nuevaVersion}` : ""}
            </span>
          </div>
          <div className="mono fila" style={{ fontSize: 12, color: "var(--muted)", gap: 18, flexWrap: "wrap", marginTop: -10 }}>
            <span>base: reglas v{p.baseVersion}</span>
            <span>
              ejecución: {p.metricasDespues.eventos} / {p.metricasDespues.eventos} casos históricos
            </span>
            <span>cambian {p.cambiados}</span>
            <span>datos hasta {p.semanaDatos}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: 10, alignItems: "start" }}>
            <Diff antes={base.reglas} despues={p.reglas} />
            <div className="pila" style={{ gap: 10 }}>
              <div style={{ border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden", background: "var(--card)" }}>
                <div className="tabla-metricas mono" style={{ padding: "9px 14px", borderBottom: "1px solid var(--line)", fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", color: "var(--muted)" }}>
                  <span>métrica</span>
                  <span style={{ textAlign: "right" }}>v{p.baseVersion}</span>
                  <span style={{ textAlign: "right" }}>{p.id}</span>
                  <span style={{ textAlign: "right" }}>Δ</span>
                </div>
                {filasMetricas(p.metricasAntes, p.metricasDespues).map((m, i) =>
                  "h" in m ? (
                    <div key={i} className="eyebrow-sm" style={{ padding: "12px 14px 6px", borderTop: "1px solid var(--line)", background: "var(--deep)" }}>
                      {m.h}
                    </div>
                  ) : (
                    <div key={i} className="tabla-metricas mono" style={{ padding: "8px 14px", borderTop: "1px solid var(--line-soft)", fontSize: 12.5, alignItems: "center" }}>
                      <span style={{ color: m.color ?? "var(--ink-2)" }}>{m.k}</span>
                      <span style={{ textAlign: "right", color: "var(--muted)" }}>
                        {m.va}
                        {m.sufijo}
                      </span>
                      <span style={{ textAlign: "right" }}>
                        {m.vb}
                        {m.sufijo}
                      </span>
                      <span style={{ textAlign: "right", color: m.bueno !== 0 && Math.sign(m.vb - m.va) === m.bueno ? "var(--accent)" : "var(--muted)" }}>
                        {m.vb === m.va ? "0" : `${m.vb > m.va ? "+" : "−"}${Math.round(Math.abs(m.vb - m.va) * 10) / 10}`}
                      </span>
                    </div>
                  ),
                )}
              </div>
              <div className="card pila" style={{ padding: "12px 14px", gap: 8 }}>
                <span className="eyebrow-sm">Lectura de los modelos · secundaria a los números</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>
                  PROPUESTA · {modelo(p.uso?.propuesta.modelo ?? "")}
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)" }}>{p.razonamiento}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 4 }}>
                  REVISIÓN · {modelo(p.revision.modelo)}
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)" }}>
                  <span className="mono" style={{ fontSize: 11, color: p.revision.mejora ? "var(--accent)" : "var(--muted)" }}>
                    {p.revision.mejora ? "MEJORA · " : "NO MEJORA · "}
                  </span>
                  {p.revision.porQue}
                </span>
                <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>Riesgo: {p.revision.riesgos}</span>
                {p.uso && (
                  <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)", borderTop: "1px solid var(--line-soft)", paddingTop: 8, marginTop: 2 }}>
                    {p.uso.propuesta.via === "sesion"
                      ? "generada por subagentes en una sesión de Claude Code, a ciegas y sin costo de API"
                      : `costo de esta propuesta: US$ ${p.uso.costoUSD.toFixed(2)} · ${(p.uso.propuesta.entrada + p.uso.revision.entrada).toLocaleString("es-ES")} tokens de entrada · ${(p.uso.propuesta.salida + p.uso.revision.salida).toLocaleString("es-ES")} de salida`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <section className="pila" style={{ gap: 10 }}>
            <div className="eyebrow">
              Eventos cuya decisión cambia · {p.ejemplos.length} de {p.cambiados}
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
              <div className="mono" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr) 24px minmax(0,1fr)", gap: 16, padding: "9px 16px", background: "var(--card)", fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", color: "var(--muted)" }}>
                <span>evento</span>
                <span>reglas v{p.baseVersion}</span>
                <span />
                <span>reglas {p.id}</span>
              </div>
              {p.ejemplos.map((x) => (
                <div key={x.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr) 24px minmax(0,1fr)", gap: 16, padding: "14px 16px", borderTop: "1px solid var(--line)", alignItems: "center" }}>
                  <div className="pila" style={{ gap: 6, minWidth: 0 }}>
                    <div className="fila" style={{ gap: 6 }}>
                      <span className="tag tag-id">{x.id}</span>
                      <span className="tag">{x.tipo}</span>
                    </div>
                    <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>{x.texto}</span>
                    {x.revision && x.revision.motivo && (
                      <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
                        Persona: “{x.revision.motivo}”
                      </span>
                    )}
                  </div>
                  <div style={{ opacity: 0.7 }}>
                    <Lado d={x.antes} umbrales={umbrales} />
                  </div>
                  <span className="mono" style={{ fontSize: 14, color: "var(--muted-2)", textAlign: "center" }}>
                    →
                  </span>
                  <Lado d={x.despues} umbrales={umbrales} />
                </div>
              ))}
            </div>
          </section>

          <div className="fila" style={{ gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 18 }}>
            <span className="nota">
              {p.estado === "pendiente"
                ? "La regla nueva no se aplica hasta que una persona la apruebe."
                : `${p.decididaPor === "usuario" ? "Decidido por vos" : "Decidido en la revisión semanal"}. ${p.motivoDecision}`}
            </span>
            {p.estado === "pendiente" && (
              <>
                <button type="button" className="btn btn-lg" style={{ marginLeft: "auto" }} onClick={() => onDecidir(p, false)}>
                  Rechazar
                </button>
                <button type="button" className="btn btn-primary btn-lg" disabled={baseVieja} onClick={() => onDecidir(p, true)}>
                  Aprobar y aplicar como v{siguienteV}
                </button>
              </>
            )}
            {p.estado === "pendiente" && baseVieja && (
              <span className="mono" style={{ flexBasis: "100%", fontSize: 12, color: ST.humano.c, textAlign: "right" }}>
                Armada sobre v{p.baseVersion}; las reglas activas son v{activa.v}. Ejecutá el loop sobre la versión activa para tener una propuesta comparable.
              </span>
            )}
          </div>
        </>
      )}

      <section className="card pila" style={{ padding: "14px 16px", gap: 10 }}>
        <div className="fila" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="pila" style={{ gap: 4 }}>
            <span className="eyebrow-sm">Loop en vivo</span>
            <span className="nota">
              Opus propone sobre todo el historial más tus {revisionesUsuario} {revisionesUsuario === 1 ? "revisión" : "revisiones"} de esta semana; se re-ejecutan todos los casos y Jev audita lo que cambia.
            </span>
          </div>
          <button type="button" className="btn btn-primary" style={{ marginLeft: "auto", height: 32 }} disabled={!!ejecutando || !loopHabilitado} onClick={onEjecutarLoop}>
            {ejecutando ? "Ejecutando…" : "Ejecutar el loop ahora"}
          </button>
        </div>
        {ejecutando && <span className="mono" style={{ fontSize: 12, color: "var(--accent)" }}>{ejecutando}</span>}
        {!loopHabilitado && (
          <span className="nota-sm">Desactivado en este despliegue. Las propuestas de arriba se generaron con llamadas reales a Opus y a Jev; para ejecutarlo en vivo hacen falta las claves y LOOP_EN_VIVO=1.</span>
        )}
        {errorLoop && <span className="mono" style={{ fontSize: 12, color: ST.humano.c }}>{errorLoop}</span>}
      </section>

      <section className="card">
        <div className="fila" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", gap: 12, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", color: "var(--muted)" }}>
            VERSIONES DE REGLAS
          </span>
          <span className="nota-sm">Independiente de la propuesta: se puede revertir en cualquier momento.</span>
          <button type="button" className="btn" style={{ marginLeft: "auto", height: 30 }} disabled={!anterior} onClick={() => setConfirmarRevert(true)}>
            Revertir a versión anterior{anterior ? ` (v${anterior.v})` : ""}
          </button>
        </div>
        {confirmarRevert && anterior && (
          <div className="fila" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "var(--deep)", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13 }}>
              Las reglas activas pasan de <span className="mono">v{activa.v}</span> a <span className="mono">v{anterior.v}</span>. Los próximos eventos se clasifican con v{anterior.v}.
            </span>
            <button type="button" className="btn btn-quiet" style={{ marginLeft: "auto", height: 30 }} onClick={() => setConfirmarRevert(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn"
              style={{ height: 30, background: "var(--ink)", color: "var(--bg)", border: "none", fontWeight: 600 }}
              onClick={() => {
                onRevertirVersion(anterior.v);
                setConfirmarRevert(false);
              }}
            >
              Confirmar reversión
            </button>
          </div>
        )}
        {versiones.map((v) => (
          <div key={v.v} className="mono" style={{ display: "grid", gridTemplateColumns: "56px 100px 70px minmax(0,1fr) auto", gap: 14, padding: "10px 16px", borderBottom: "1px solid var(--line-soft)", alignItems: "center", fontSize: 12, opacity: revertidas.includes(v.v) ? 0.5 : 1 }}>
            <span style={{ fontWeight: 600 }}>v{v.v}</span>
            <span style={{ color: "var(--muted-2)" }}>{v.fecha}</span>
            <span style={{ color: "var(--muted)" }}>{v.propuesta ?? "—"}</span>
            <span style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink-2)" }}>{v.nota.replace(/`/g, "")}</span>
            <span style={{ color: "var(--accent)", fontSize: 10, letterSpacing: "0.08em" }}>{v.v === activa.v ? "ACTIVA" : revertidas.includes(v.v) ? "REVERTIDA" : ""}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="mono" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", color: "var(--muted)" }}>
          TODAS LAS PROPUESTAS
        </div>
        {propuestas.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setSelId(x.id)}
            className="mono"
            style={{ width: "100%", textAlign: "left", display: "grid", gridTemplateColumns: "64px 100px minmax(0,1fr) 120px", gap: 14, padding: "10px 16px", border: "none", borderBottom: "1px solid var(--line-soft)", background: x.id === p?.id ? "var(--hover)" : "transparent", alignItems: "center", fontSize: 12, cursor: "pointer" }}
          >
            <span style={{ fontWeight: 600 }}>{x.id}</span>
            <span style={{ color: "var(--muted-2)" }}>{x.fecha.slice(0, 10)}</span>
            <span style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.titulo.replace(/`/g, "")}</span>
            <span style={{ color: ESTADO[x.estado].c, fontSize: 10, letterSpacing: "0.08em", textAlign: "right" }}>{ESTADO[x.estado].label.split(" ")[0]}</span>
          </button>
        ))}
      </section>
    </div>
  );
}
