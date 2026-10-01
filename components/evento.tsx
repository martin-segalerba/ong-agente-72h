"use client";

import { useState } from "react";
import { senalFuerte } from "@/lib/metricas";
import type { EventoProcesado, Revision, Umbrales } from "@/lib/types";
import { Badge, f2, fechaCorta, PanelRechazar, PanelRevertir, ResumenRevision } from "./ui";

export type EventoVista = Omit<EventoProcesado, "verdad">;

interface Props {
  ev: EventoVista;
  revision: Revision | null;
  umbrales: Umbrales;
  editable: boolean;
  variante: "home" | "logs";
  atenuarRuido: boolean;
  onRevisar: (r: Revision) => void;
}

export function TarjetaEvento({ ev, revision, umbrales, editable, variante, atenuarRuido, onRevisar }: Props) {
  const [panel, setPanel] = useState<"revertir" | "rechazar" | null>(null);
  const d = ev.decision;
  const umbral = umbrales[d.cls];
  const pesa = ev.jev.conf >= umbral;
  const fuerte = senalFuerte(d, ev.jev, umbrales);
  const base = { por: "usuario" as const, clsOriginal: d.cls, accionOriginal: d.accion };
  const puedeActuar = editable && !revision;

  const revisar = (r: Omit<Revision, "por" | "clsOriginal" | "accionOriginal">) => {
    onRevisar({ ...base, ...r });
    setPanel(null);
  };

  const botones = puedeActuar && (
    <div className="fila" style={{ gap: 8, marginLeft: "auto" }}>
      {d.cls === "aprobar" && (
        <>
          <button type="button" className="btn" onClick={() => setPanel(panel === "rechazar" ? null : "rechazar")}>
            Rechazar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => revisar({ tipo: "aprobado", objetivo: null, motivo: "" })}>
            Aprobar
          </button>
        </>
      )}
      <button type="button" className="btn btn-quiet" onClick={() => setPanel(panel === "revertir" ? null : "revertir")}>
        {panel === "revertir" ? "Cerrar" : "Revertir"}
      </button>
    </div>
  );

  const pie = (revision || puedeActuar) && (
    <div className="fila" style={{ borderTop: "1px solid var(--line)", padding: variante === "logs" ? "10px 18px" : "10px 14px", gap: 12, minHeight: 48, flexBasis: "100%" }}>
      {revision ? (
        <ResumenRevision r={revision} />
      ) : variante === "logs" ? (
        <span className="nota-sm">{d.cls === "aprobar" ? "Esperando tu aprobación." : "Sin revisar."}</span>
      ) : null}
      {botones}
    </div>
  );

  const paneles = (
    <>
      {panel === "revertir" && (
        <div style={{ flexBasis: "100%" }}>
          <PanelRevertir actual={d.cls} onCancelar={() => setPanel(null)} onConfirmar={(objetivo, motivo) => revisar({ tipo: "revertido", objetivo, motivo })} />
        </div>
      )}
      {panel === "rechazar" && (
        <div style={{ flexBasis: "100%" }}>
          <PanelRechazar onCancelar={() => setPanel(null)} onConfirmar={(motivo) => revisar({ tipo: "rechazado", objetivo: d.cls, motivo })} />
        </div>
      )}
    </>
  );

  const etiquetas = (
    <div className="fila" style={{ gap: 6, minWidth: 0 }}>
      <span className="tag tag-id">{ev.id}</span>
      <span className="tag">{ev.tipo}</span>
      <span className="ts">{fechaCorta(ev.t)}</span>
    </div>
  );

  if (variante === "home") {
    return (
      <article className="card" style={{ display: "flex", flexWrap: "wrap", borderColor: panel ? "var(--line-strong)" : undefined }}>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, flexBasis: "100%", minWidth: 0 }}>
          {etiquetas}
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, textWrap: "pretty" }}>{ev.texto}</p>
          {d.cls === "aprobar" && (
            <div style={{ background: "var(--deep)", border: "1px solid var(--line-soft)", borderRadius: 3, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="eyebrow-sm">Acción preparada</span>
              <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "var(--ink-2)" }}>{d.accion}</span>
            </div>
          )}
          <div className="fila" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line-soft)", paddingTop: 10, gap: 8 }}>
            <Badge cls={d.cls} />
            <span className="mono" style={{ fontSize: 11, color: fuerte ? "var(--accent)" : "var(--muted-2)" }}>
              {fuerte ? `señal fuerte · ${ev.jev.v}` : d.regla}
            </span>
          </div>
        </div>
        {pie}
        {paneles}
      </article>
    );
  }

  return (
    <article className="card" style={{ display: "flex", flexWrap: "wrap", borderColor: panel ? "var(--line-strong)" : undefined }}>
      <div style={{ flex: "1 1 460px", minWidth: 0, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {etiquetas}
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, textWrap: "pretty" }}>{ev.texto}</p>
        <div className="fila" style={{ gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
          <span className="eyebrow-sm">Reglas v{ev.reglasVersion}</span>
          <Badge cls={d.cls} />
          <span className="mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)" }}>
            {d.regla}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {d.accion}
        </span>
      </div>
      <div style={{ flex: "0 1 300px", minWidth: 240, borderLeft: "1px solid var(--line)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, opacity: !pesa && atenuarRuido ? 0.55 : 1 }}>
        <span className="eyebrow-sm">Jev · veredicto</span>
        <span className="mono" style={{ fontSize: 13, fontWeight: 500 }}>
          {ev.jev.v}
        </span>
        <div className="fila" style={{ alignItems: "baseline", gap: 8 }}>
          <span className="mono" style={{ fontSize: 36, lineHeight: 1, fontWeight: 500, color: pesa ? "var(--ink)" : "var(--muted-2)" }}>
            {f2(ev.jev.conf)}
          </span>
          <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>
            confianza
          </span>
        </div>
        <div style={{ position: "relative", height: 6, background: "var(--line)", marginTop: 4 }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${ev.jev.conf * 100}%`, background: pesa ? "var(--ink)" : "var(--muted-2)" }} />
          <div style={{ position: "absolute", top: -4, height: 14, width: 2, left: `${umbral * 100}%`, background: "var(--ink)" }} title={`umbral ${f2(umbral)}`} />
        </div>
        <span className="mono" style={{ fontSize: 11, color: fuerte ? "var(--accent)" : "var(--muted)" }}>
          {fuerte
            ? `≥ umbral ${f2(umbral)} · señal fuerte, revisar`
            : ev.jev.v === "correcta"
              ? pesa
                ? `≥ umbral ${f2(umbral)} · confirma la decisión`
                : `< umbral ${f2(umbral)} · sin peso`
              : `< umbral ${f2(umbral)} · ignorado como ruido`}
        </span>
      </div>
      {pie}
      {paneles}
    </article>
  );
}
