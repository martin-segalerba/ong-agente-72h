"use client";

import type { Clase, Revision, Semana, Umbrales } from "@/lib/types";
import { type EventoVista, TarjetaEvento } from "./evento";
import { Cabecera, ST } from "./ui";

const ORDEN: Clase[] = ["humano", "aprobar", "auto"];
const SUBTITULO: Record<Clase, string> = {
  humano: "Necesitan a una persona",
  aprobar: "Preparado, falta tu sí",
  auto: "Resuelto solo",
};

interface Props {
  semana: Semana;
  eventos: EventoVista[];
  revisionDe: (e: EventoVista) => Revision | null;
  umbrales: Umbrales;
  onRevisar: (id: string, r: Revision) => void;
}

export function Home({ semana, eventos, revisionDe, umbrales, onRevisar }: Props) {
  const grupos = ORDEN.map((k) => ({ k, items: eventos.filter((e) => e.decision.cls === k) }));
  const pendientes = grupos[1].items.filter((e) => !revisionDe(e)).length;

  return (
    <div className="pila" style={{ gap: 22 }}>
      <Cabecera eyebrow={`${semana.etiqueta} · ${eventos.length} eventos`} titulo={semana.enCurso ? "Qué llegó esta semana" : `Qué llegó en ${semana.id}`}>
        <div className="fila" style={{ gap: 22, flexWrap: "wrap" }}>
          {grupos.map(({ k, items }) => (
            <div key={k} className="fila" style={{ gap: 8 }}>
              <span className="punto" style={{ background: ST[k].c }} />
              <span className="mono" style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: ST[k].c }}>
                {ST[k].label}
              </span>
              <span className="mono" style={{ fontSize: 15, fontWeight: 500 }}>
                {items.length}
              </span>
            </div>
          ))}
        </div>
      </Cabecera>

      <div className="fila" style={{ gap: 2, height: 4 }}>
        {grupos.map(({ k, items }) => (
          <div key={k} style={{ flex: items.length, height: 4, background: ST[k].c }} />
        ))}
      </div>

      {semana.enCurso && pendientes > 0 && (
        <div className="nota" style={{ marginTop: -8 }}>
          {pendientes} {pendientes === 1 ? "acción preparada espera" : "acciones preparadas esperan"} tu aprobación.
        </div>
      )}

      {grupos.map(({ k, items }) =>
        items.length ? (
          <section key={k} className="pila" style={{ gap: 10 }}>
            <div className="fila" style={{ gap: 8, paddingTop: 6 }}>
              <span className="punto" style={{ background: ST[k].c }} />
              <span className="mono" style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: ST[k].c }}>
                {ST[k].label} · {items.length}
              </span>
              <span className="nota-sm" style={{ marginLeft: 6 }}>
                {SUBTITULO[k]}
              </span>
            </div>
            <div className="grid-cards" style={{ alignItems: "start" }}>
              {items.map((e) => (
                <TarjetaEvento
                  key={e.id}
                  ev={e}
                  revision={revisionDe(e)}
                  umbrales={umbrales}
                  editable={semana.enCurso}
                  variante="home"
                  atenuarRuido
                  onRevisar={(r) => onRevisar(e.id, r)}
                />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
