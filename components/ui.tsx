"use client";

import { useState } from "react";
import { type Clase, CLASES, type Revision } from "@/lib/types";

export const ST: Record<Clase, { c: string; bg: string; bd: string; label: string }> = {
  auto: { c: "#7fa8d4", bg: "rgba(127,168,212,0.10)", bd: "rgba(127,168,212,0.38)", label: "AUTO" },
  aprobar: { c: "#bb98d0", bg: "rgba(187,152,208,0.10)", bd: "rgba(187,152,208,0.38)", label: "APROBAR" },
  humano: { c: "#e48a60", bg: "rgba(228,138,96,0.10)", bd: "rgba(228,138,96,0.38)", label: "HUMANO" },
};

export const f2 = (n: number) => n.toFixed(2);

export function Badge({ cls, sufijo }: { cls: Clase; sufijo?: string }) {
  const s = ST[cls];
  return (
    <span className="badge" style={{ color: s.c, background: s.bg, borderColor: s.bd }}>
      <i style={{ background: s.c }} />
      {s.label}
      {sufijo}
    </span>
  );
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function fechaCorta(t: string): string {
  const d = new Date(t);
  const local = new Date(d.getTime() + 2 * 3600 * 1000);
  return `${DIAS[local.getUTCDay()]} ${local.getUTCDate()} · ${t.slice(11, 16)}`;
}

export function Cabecera({ eyebrow, titulo, nivel = 1, children }: { eyebrow: string; titulo: string; nivel?: 1 | 2; children?: React.ReactNode }) {
  return (
    <div className="cabecera">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        {nivel === 1 ? <h1 className="h1">{titulo}</h1> : <h2 className="h2">{titulo}</h2>}
      </div>
      {children}
    </div>
  );
}

const ETIQUETA_REVISION: Record<Revision["tipo"], string> = {
  aprobado: "aprobado",
  rechazado: "rechazado",
  revertido: "revertido →",
  confirmado: "correcto",
  gestionado: "gestionado por una persona",
};

export function ResumenRevision({ r }: { r: Revision }) {
  return (
    <div className="fila" style={{ gap: 10, minWidth: 0, flexWrap: "wrap" }}>
      <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
        {ETIQUETA_REVISION[r.tipo]}
      </span>
      {r.tipo === "revertido" && r.objetivo && (
        <span className="mono" style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: ST[r.objetivo].c }}>
          {ST[r.objetivo].label}
        </span>
      )}
      {r.motivo && <span style={{ fontSize: 13, color: "var(--ink-2)", minWidth: 0 }}>“{r.motivo}”</span>}
      <span className="mono" style={{ fontSize: 10, color: "var(--muted-2)", letterSpacing: "0.06em" }}>
        {r.por === "usuario" ? "· VOS" : r.por === "implicito" ? "· SE ASUMIÓ AL CERRAR LA SEMANA" : "· REVISIÓN SEMANAL"}
      </span>
    </div>
  );
}

/** Panel para revertir una clasificación: elegir la correcta y justificar, obligatorio. */
export function PanelRevertir({ actual, onConfirmar, onCancelar }: { actual: Clase; onConfirmar: (objetivo: Clase, motivo: string) => void; onCancelar: () => void }) {
  const [objetivo, setObjetivo] = useState<Clase | null>(null);
  const [motivo, setMotivo] = useState("");
  const ok = !!objetivo && motivo.trim().length > 0;
  return (
    <div className="panel">
      <span className="eyebrow-sm">Debería haber sido</span>
      <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
        {CLASES.map((k) => {
          const cur = k === actual;
          const sel = objetivo === k;
          return (
            <button
              key={k}
              type="button"
              className="opcion"
              disabled={cur}
              onClick={() => setObjetivo(k)}
              style={{ color: sel ? "var(--bg)" : ST[k].c, background: sel ? ST[k].c : "transparent", borderColor: sel ? ST[k].c : ST[k].bd, opacity: cur ? 0.35 : 1 }}
            >
              <span className="punto" style={{ width: 7, height: 7, background: sel ? "var(--bg)" : ST[k].c }} />
              {ST[k].label}
              {cur ? " · actual" : ""}
            </button>
          );
        })}
      </div>
      <span className="eyebrow-sm">Por qué · obligatorio</span>
      <textarea className="campo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Qué dato del texto justifica la otra clasificación." />
      <div className="fila" style={{ gap: 8 }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>
          {!objetivo ? "Elegí la clasificación correcta." : !ok ? "Falta la justificación." : "Listo para confirmar."}
        </span>
        <button type="button" className="btn btn-quiet" style={{ marginLeft: "auto", height: 30 }} onClick={onCancelar}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" style={{ height: 30 }} disabled={!ok} onClick={() => objetivo && onConfirmar(objetivo, motivo.trim())}>
          Confirmar reversión
        </button>
      </div>
    </div>
  );
}

/** Panel para rechazar una acción preparada: la clasificación puede estar bien, la acción no. */
export function PanelRechazar({ onConfirmar, onCancelar }: { onConfirmar: (motivo: string) => void; onCancelar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const ok = motivo.trim().length > 0;
  return (
    <div className="panel">
      <span className="eyebrow-sm">Por qué se rechaza · obligatorio</span>
      <textarea className="campo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Qué está mal en la acción preparada: un dato, un compromiso, un destinatario." />
      <div className="fila" style={{ gap: 8 }}>
        <button type="button" className="btn btn-quiet" style={{ marginLeft: "auto", height: 30 }} onClick={onCancelar}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" style={{ height: 30 }} disabled={!ok} onClick={() => onConfirmar(motivo.trim())}>
          Confirmar rechazo
        </button>
      </div>
    </div>
  );
}
