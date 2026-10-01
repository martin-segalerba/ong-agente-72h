"use client";

import { useState } from "react";
import { esCorrectiva, senalFuerte } from "@/lib/metricas";
import type { Revision, Semana, Umbrales } from "@/lib/types";
import { type EventoVista, TarjetaEvento } from "./evento";
import { Cabecera, f2 } from "./ui";

type Filtro = "todos" | "senal" | "corregidos";

interface Props {
  semana: Semana;
  eventos: EventoVista[];
  revisionDe: (e: EventoVista) => Revision | null;
  umbrales: Umbrales;
  onRevisar: (id: string, r: Revision) => void;
}

export function Logs({ semana, eventos, revisionDe, umbrales, onRevisar }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const fuerte = (e: EventoVista) => senalFuerte(e.decision, e.jev, umbrales);
  const corregido = (e: EventoVista) => esCorrectiva(revisionDe(e));
  const visibles = eventos.filter((e) => filtro === "todos" || (filtro === "senal" ? fuerte(e) : corregido(e)));
  const filtros: [Filtro, string, number][] = [
    ["todos", "Todos", eventos.length],
    ["senal", "Señal fuerte", eventos.filter(fuerte).length],
    ["corregidos", "Corregidos", eventos.filter(corregido).length],
  ];

  return (
    <div className="pila" style={{ gap: 18 }}>
      <Cabecera eyebrow={`Eventos procesados · ${semana.id} · ${eventos.length}`} titulo="Reglas, veredicto de Jev y reversiones">
        <div className="fila" style={{ gap: 16, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>
            umbral: auto {f2(umbrales.auto)} · aprobar {f2(umbrales.aprobar)} · humano {f2(umbrales.humano)}
          </span>
          <div className="fila" style={{ border: "1px solid var(--line)", borderRadius: 3 }}>
            {filtros.map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFiltro(k)}
                style={{ height: 28, padding: "0 12px", border: "none", background: filtro === k ? "var(--line)" : "transparent", color: filtro === k ? "var(--ink)" : "var(--muted)", font: "500 12px var(--sans)", cursor: "pointer", display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}
              >
                {label}
                <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>
                  {n}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Cabecera>
      {!visibles.length && <div className="nota">Nada que mostrar con este filtro.</div>}
      {visibles.map((e) => (
        <TarjetaEvento key={e.id} ev={e} revision={revisionDe(e)} umbrales={umbrales} editable={semana.enCurso} variante="logs" atenuarRuido onRevisar={(r) => onRevisar(e.id, r)} />
      ))}
    </div>
  );
}
