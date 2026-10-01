"use client";

import { useEffect, useState } from "react";
import { LIMITES_SOP } from "@/lib/engine";
import { mediaMovil } from "@/lib/metricas";
import { type Clase, type PreguntaJev, type Reglas, type Semana, type Umbrales, type VersionReglas } from "@/lib/types";
import { Badge, Cabecera, f2, ST } from "./ui";

export function tokens(line: string): { t: string; c: string }[] {
  const out: { t: string; c: string }[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\s+)|([^\s"{}[\],:]+)/g;
  for (const m of line.matchAll(re)) {
    if (m[1]) {
      if (m[2]) {
        out.push({ t: m[1], c: "#d9d6cf" }, { t: m[2], c: "#6c6a64" });
      } else {
        const s = ST[m[1].slice(1, -1) as Clase];
        out.push({ t: m[1], c: s ? s.c : "#ada68f" });
      }
    } else if (m[3] || m[4]) out.push({ t: m[0], c: "#d6ec6a" });
    else if (m[5]) out.push({ t: m[0], c: "#6c6a64" });
    else out.push({ t: m[0], c: "#9a978f" });
  }
  return out;
}

export function Sop({ texto }: { texto: string }) {
  return (
    <>
      {texto.split("`").map((t, i) =>
        i % 2 ? (
          <span key={i} className="mono" style={{ fontSize: 12.5, color: ST[t as Clase]?.c ?? "#d9d6cf" }}>
            {t}
          </span>
        ) : (
          <span key={i} style={{ color: "var(--ink-2)" }}>
            {t}
          </span>
        ),
      )}
    </>
  );
}

/** JSON indentado, pero con las listas de valores simples en una sola línea. */
function jsonCompacto(x: unknown): string {
  return JSON.stringify(x, null, 2).replace(/\[\n\s+((?:"[^"\n]*"|-?\d+(?:\.\d+)?|null|true|false)(?:,\n\s+(?:"[^"\n]*"|-?\d+(?:\.\d+)?|null|true|false))*)\n\s*\]/g, (_, items: string) => `[${items.split(/,\n\s+/).join(", ")}]`);
}

function filasReglas(r: Reglas) {
  const quitarSop = <T extends { sop: string }>({ sop: _s, ...x }: T) => x;
  return [
    ...r.reglas.map((x) => ({ id: x.id, sop: x.sop, json: quitarSop(x) })),
    ...r.salvaguardas.map((x) => ({ id: x.id, sop: x.sop, json: quitarSop(x) })),
    { id: "—", sop: `Si ninguna regla coincide, clasificar como \`${r.por_defecto.clasificacion}\`: ${r.por_defecto.accion}`, json: { por_defecto: r.por_defecto } },
  ];
}

interface Props {
  version: VersionReglas;
  semanas: Semana[];
  umbrales: Umbrales;
  setUmbrales: (u: Umbrales) => void;
  preguntas: PreguntaJev[];
  onGuardarPregunta: (p: Omit<PreguntaJev, "v" | "fecha">) => void;
}

export function Setup({ version, semanas, umbrales, setUmbrales, preguntas, onGuardarPregunta }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  let linea = 1;
  const filas = filasReglas(version.reglas).map((f) => ({ ...f, lineas: jsonCompacto(f.json).split("\n").map((l) => ({ n: linea++, toks: tokens(l) })) }));

  const cerradas = semanas.filter((s) => !s.enCurso);
  const ultimas = cerradas.slice(-4);

  return (
    <div className="pila" style={{ gap: 40 }}>
      <section className="pila" style={{ gap: 14 }}>
        <Cabecera eyebrow={`Reglas deterministas · v${version.v}`} titulo="Procedimiento y su implementación" nivel={2}>
          <span className="nota">Las reglas se evalúan en orden y decide la primera que coincide; después, las salvaguardas pueden subir el nivel.</span>
        </Cabecera>
        <div style={{ border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
          <div className="mono" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.15fr)", background: "var(--card)", fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--muted)" }}>
            <div style={{ padding: "10px 18px" }}>SOP · LENGUAJE NATURAL</div>
            <div style={{ padding: "10px 18px", borderLeft: "1px solid var(--line)" }}>rules.json · IMPLEMENTACIÓN</div>
          </div>
          {filas.map((f) => (
            <div
              key={f.id}
              onMouseEnter={() => setHover(f.id)}
              onMouseLeave={() => setHover(null)}
              style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.15fr)", borderTop: "1px solid var(--line)", background: hover === f.id ? "var(--hover)" : "transparent" }}
            >
              <div style={{ padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: hover === f.id ? "var(--accent)" : "var(--muted)", paddingTop: 2, flex: "none", width: 22 }}>
                  {f.id}
                </span>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, textWrap: "pretty" }}>
                  <Sop texto={f.sop} />
                </p>
              </div>
              <div className="codigo" style={{ borderLeft: "1px solid var(--line)", background: "var(--deep)", padding: "12px 0", overflowX: "auto" }}>
                {f.lineas.map((ln) => (
                  <div key={ln.n} style={{ display: "flex" }}>
                    <span className="ln">{ln.n}</span>
                    <span style={{ whiteSpace: "pre-wrap", paddingRight: 16, minWidth: 0 }}>
                      {ln.toks.map((t, i) => (
                        <span key={i} style={{ color: t.c }}>
                          {t.t}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: "14px 18px", display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 auto" }}>
            <div className="eyebrow-sm">Límites duros</div>
            <div className="nota-sm" style={{ marginTop: 4 }}>
              En código. El loop no puede cambiarlos.
            </div>
          </div>
          <div className="pila" style={{ gap: 6, flex: 1, minWidth: 280 }}>
            {LIMITES_SOP.map((l) => (
              <span key={l} style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="pila" style={{ gap: 14 }}>
        <Cabecera eyebrow="Umbral de confianza de Jev" titulo="Cuándo pesa el veredicto, por clasificación" nivel={2} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 10 }}>
          {(["humano", "aprobar", "auto"] as Clase[]).map((k) => {
            const historico = cerradas.map((s) => s.umbralCalibrado[k]);
            const rec = historico.length ? mediaMovil(historico) : umbrales[k];
            const igual = Math.abs(umbrales[k] - rec) < 0.001;
            return (
              <div key={k} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                <span style={{ alignSelf: "flex-start" }}>
                  <Badge cls={k} />
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div className="eyebrow-sm">Actual</div>
                    <div className="mono" style={{ fontSize: 30, fontWeight: 500, marginTop: 4 }}>
                      {f2(umbrales[k])}
                    </div>
                  </div>
                  <div style={{ borderLeft: "1px solid var(--line)", paddingLeft: 12 }}>
                    <div className="eyebrow-sm">Recomendado</div>
                    <div className="mono" style={{ fontSize: 30, fontWeight: 500, marginTop: 4, color: "var(--muted)" }}>
                      {f2(rec)}
                    </div>
                  </div>
                </div>
                <input type="range" min={0} max={1} step={0.01} value={umbrales[k]} onChange={(e) => setUmbrales({ ...umbrales, [k]: Number(e.target.value) })} style={{ width: "100%", margin: 0, accentColor: ST[k].c }} aria-label={`Umbral ${k}`} />
                <div className="fila" style={{ justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
                  <div className="fila mono" style={{ gap: 10, fontSize: 11, color: "var(--muted-2)", flexWrap: "wrap" }}>
                    {ultimas.map((s) => (
                      <span key={s.id}>
                        {s.id} <span style={{ color: "var(--muted)" }}>{f2(s.umbralCalibrado[k])}</span>
                      </span>
                    ))}
                  </div>
                  <button type="button" className="btn" disabled={igual} onClick={() => setUmbrales({ ...umbrales, [k]: rec })}>
                    {igual ? "Adoptado" : `Adoptar ${f2(rec)}`}
                  </button>
                </div>
                <div className="nota-sm" style={{ marginTop: -6 }}>
                  Recomendado = media móvil de las últimas 4 semanas de ejecuciones.
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <EditorJev preguntas={preguntas} onGuardar={onGuardarPregunta} />
    </div>
  );
}

function EditorJev({ preguntas, onGuardar }: { preguntas: PreguntaJev[]; onGuardar: Props["onGuardarPregunta"] }) {
  const activa = preguntas[0];
  const [instr, setInstr] = useState(activa.instrucciones);
  const [crit, setCrit] = useState(activa.criterios);
  const [nota, setNota] = useState("");
  const [guardado, setGuardado] = useState(false);
  useEffect(() => {
    setInstr(activa.instrucciones);
    setCrit(activa.criterios);
  }, [activa]);
  const sucio = instr !== activa.instrucciones || JSON.stringify(crit) !== JSON.stringify(activa.criterios);
  const upd = (i: number, p: Partial<{ k: string; d: string }>) => {
    setCrit((c) => c.map((x, j) => (j === i ? { ...x, ...p } : x)));
    setGuardado(false);
  };

  return (
    <section className="pila" style={{ gap: 14 }}>
      <Cabecera eyebrow="Evaluador · Jev" titulo="Pregunta y criterios" nivel={2}>
        <span className="nota">Las próximas ejecuciones del loop usan la versión activa.</span>
      </Cabecera>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 10, alignItems: "start" }}>
        <div className="card pila">
          <div className="pila" style={{ padding: 16, gap: 8 }}>
            <label className="mono" style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--muted)" }} htmlFor="instr">
              instructions
            </label>
            <textarea id="instr" className="campo" rows={4} value={instr} onChange={(e) => (setInstr(e.target.value), setGuardado(false))} style={{ lineHeight: 1.55 }} />
          </div>
          <div className="pila" style={{ padding: "0 16px 16px", gap: 6 }}>
            <div className="mono" style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr) 28px", gap: 6, fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--muted)", paddingBottom: 2 }}>
              <span>criteria · clave</span>
              <span>descripción</span>
              <span />
            </div>
            {crit.map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr) 28px", gap: 6 }}>
                <input className="input mono" value={c.k} onChange={(e) => upd(i, { k: e.target.value })} style={{ fontSize: 12.5, fontWeight: 500 }} aria-label="Clave del criterio" />
                <input className="input" value={c.d} onChange={(e) => upd(i, { d: e.target.value })} style={{ fontSize: 13 }} aria-label="Descripción del criterio" title={c.d} />
                <button type="button" title="Quitar criterio" className="btn btn-quiet" style={{ height: 34, padding: 0 }} onClick={() => setCrit((x) => x.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-quiet" style={{ alignSelf: "flex-start", marginTop: 4, borderStyle: "dashed" }} onClick={() => setCrit((x) => [...x, { k: "nuevo_criterio", d: "" }])}>
              + añadir criterio
            </button>
          </div>
          {sucio && (
            <div className="pila" style={{ padding: "0 16px 12px", gap: 6 }}>
              <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué cambia en esta versión (opcional)" style={{ fontSize: 13 }} />
            </div>
          )}
          <div className="fila" style={{ borderTop: "1px solid var(--line)", padding: "12px 16px", gap: 10 }}>
            <span className="mono" style={{ fontSize: 12, color: sucio ? "var(--accent)" : "var(--muted-2)" }}>
              {guardado ? `Guardado como v${activa.v}` : sucio ? "Cambios sin guardar" : `Sin cambios · v${activa.v}`}
            </span>
            <button type="button" className="btn btn-quiet" style={{ marginLeft: "auto", height: 30 }} disabled={!sucio} onClick={() => (setInstr(activa.instrucciones), setCrit(activa.criterios))}>
              Descartar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 30 }}
              disabled={!sucio || crit.length < 2}
              onClick={() => {
                onGuardar({ instrucciones: instr, criterios: crit, nota: nota || "Edición manual en Setup" });
                setNota("");
                setGuardado(true);
              }}
            >
              Guardar como v{activa.v + 1}
            </button>
          </div>
        </div>
        <div className="card">
          <div className="mono" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--muted)" }}>
            VERSIONES
          </div>
          {preguntas.map((v) => (
            <div key={v.v} className="pila" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", gap: 3 }}>
              <div className="fila mono" style={{ gap: 8, fontSize: 12, fontWeight: 500 }}>
                <span>v{v.v}</span>
                <span style={{ color: "var(--muted-2)", fontWeight: 400 }}>{v.fecha}</span>
                {v.v === activa.v && <span style={{ marginLeft: "auto", color: "var(--accent)", fontSize: 10, letterSpacing: "0.06em" }}>ACTIVA</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.nota}</div>
            </div>
          ))}
          <div className="nota-sm" style={{ padding: "10px 14px" }}>
            Cada guardado crea una versión nueva. Nada se sobrescribe.
          </div>
        </div>
      </div>
    </section>
  );
}

