"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventoVista } from "@/components/evento";
import { Home } from "@/components/home";
import { Logs } from "@/components/logs";
import { Mejoras } from "@/components/mejoras";
import { Setup } from "@/components/setup";
import { type HistorialCliente, hoy, preguntasDe, propuestasDe, useEstadoLocal, versionActiva, versionesDe } from "@/lib/cliente";
import type { Propuesta, Revision } from "@/lib/types";

type Tab = "home" | "setup" | "logs" | "mejoras";

export function Auditor({ historial }: { historial: HistorialCliente }) {
  const [estado, actualizar, reiniciar] = useEstadoLocal();
  const [tab, setTab] = useState<Tab>("home");
  const [semanaId, setSemanaId] = useState(historial.semanas.at(-1)!.id);
  const [ejecutando, setEjecutando] = useState<string | null>(null);
  const [errorLoop, setErrorLoop] = useState<string | null>(null);
  const [loop, setLoop] = useState<{ habilitado: boolean; requiereClave: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/loop")
      .then((r) => r.json())
      .then(setLoop)
      .catch(() => setLoop({ habilitado: false, requiereClave: false }));
  }, []);

  const semana = historial.semanas.find((s) => s.id === semanaId)!;
  const eventos: EventoVista[] = useMemo(() => historial.eventos.filter((e) => e.semana === semanaId), [historial, semanaId]);
  const umbrales = estado.umbrales ?? historial.semanas.at(-1)!.umbrales;
  const versiones = versionesDe(historial, estado);
  const activa = versionActiva(historial, estado);
  const propuestas = propuestasDe(historial, estado);
  const preguntas = preguntasDe(historial, estado);
  const revisionDe = (e: EventoVista): Revision | null => estado.revisiones[e.id] ?? e.revision;
  const pendientes = propuestas.filter((p) => p.estado === "pendiente").length;
  const misRevisiones = Object.keys(estado.revisiones).length;

  const onRevisar = (id: string, r: Revision) => actualizar((s) => ({ ...s, revisiones: { ...s.revisiones, [id]: r } }));

  const onDecidir = (p: Propuesta, aprobar: boolean) =>
    actualizar((s) => {
      // Una propuesta armada sobre otra versión no se puede aplicar: sus métricas no comparan contra las reglas activas.
      if (aprobar && p.baseVersion !== versionActiva(historial, s).v) return s;
      const decisiones = {
        ...s.decisiones,
        [p.id]: aprobar
          ? { estado: "aprobada" as const, motivo: "Aprobada por vos después de revisar el diff y las métricas." }
          : { estado: "rechazada" as const, motivo: "Rechazada por vos después de revisar el diff y las métricas." },
      };
      if (!aprobar) return { ...s, decisiones };
      const v = Math.max(...versionesDe(historial, s).map((x) => x.v)) + 1;
      return { ...s, decisiones, versiones: [{ v, fecha: hoy(), propuesta: p.id, nota: p.titulo, reglas: p.reglas }, ...s.versiones], reglasActiva: v };
    });

  const onEjecutarLoop = async () => {
    setErrorLoop(null);
    let clave: string | null = null;
    if (loop?.requiereClave) {
      clave = window.prompt("Clave del loop en vivo");
      if (!clave) return;
    }
    setEjecutando("Opus está leyendo la evidencia y proponiendo cambios. Tarda entre uno y tres minutos.");
    try {
      const r = await fetch("/api/loop", {
        method: "POST",
        headers: { "content-type": "application/json", ...(clave ? { "x-loop-clave": clave } : {}) },
        body: JSON.stringify({
          reglas: activa.reglas,
          version: activa.v,
          umbrales,
          pregunta: preguntas[0],
          revisiones: estado.revisiones,
          rechazadas: propuestas.filter((p) => p.estado === "rechazada").map((p) => ({ titulo: p.titulo, motivo: p.motivoDecision, rompe: p.rompe })),
          propuestasPrevias: estado.propuestasVivas.length,
        }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error ?? `Error ${r.status}`);
      if (datos.sinCambios) setErrorLoop("Opus no encontró evidencia suficiente para proponer cambios.");
      else actualizar((s) => ({ ...s, propuestasVivas: [datos.propuesta, ...s.propuestasVivas] }));
    } catch (err) {
      setErrorLoop(err instanceof Error ? err.message : "El loop falló.");
    } finally {
      setEjecutando(null);
    }
  };

  const tabs: [Tab, string, string | number][] = [
    ["home", "Home", eventos.length],
    ["setup", "Setup", ""],
    ["logs", "Logs", eventos.length],
    ["mejoras", "Mejoras", pendientes || ""],
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="marca">
          <i />
          AUDITOR
        </div>
        <nav className="tabs">
          {tabs.map(([k, label, n]) => (
            <button key={k} type="button" className="tab" data-on={tab === k ? "1" : "0"} onClick={() => setTab(k)}>
              {label}
              <span>{n}</span>
            </button>
          ))}
        </nav>
        <div className="meta-top">
          <select className="selector" value={semanaId} onChange={(e) => setSemanaId(e.target.value)} aria-label="Semana">
            {[...historial.semanas].reverse().map((s) => (
              <option key={s.id} value={s.id}>
                {s.etiqueta}
                {s.enCurso ? " · en curso" : ""}
              </option>
            ))}
          </select>
          <span>reglas v{activa.v}</span>
          <span>jev-instr v{preguntas[0].v}</span>
          <button type="button" onClick={reiniciar} title="Borra tus revisiones y decisiones guardadas en este navegador" style={{ background: "none", border: "none", color: "var(--muted-2)", font: "400 11px var(--mono)", cursor: "pointer", padding: 0 }}>
            restablecer
          </button>
        </div>
      </header>

      <main className="cuerpo">
        {tab === "home" && <Home semana={semana} eventos={eventos} revisionDe={revisionDe} umbrales={umbrales} onRevisar={onRevisar} />}
        {tab === "setup" && (
          <Setup
            version={activa}
            semanas={historial.semanas}
            umbrales={umbrales}
            setUmbrales={(u) => actualizar((s) => ({ ...s, umbrales: u }))}
            preguntas={preguntas}
            onGuardarPregunta={(p) => actualizar((s) => ({ ...s, preguntas: [{ ...p, v: Math.max(...preguntasDe(historial, s).map((x) => x.v)) + 1, fecha: hoy() }, ...s.preguntas] }))}
          />
        )}
        {tab === "logs" && <Logs semana={semana} eventos={eventos} revisionDe={revisionDe} umbrales={umbrales} onRevisar={onRevisar} />}
        {tab === "mejoras" && (
          <Mejoras
            semanas={historial.semanas}
            propuestas={propuestas}
            versiones={versiones}
            activa={activa}
            umbrales={umbrales}
            onDecidir={onDecidir}
            onRevertirVersion={(v) => actualizar((s) => ({ ...s, reglasActiva: v, revertidas: [...new Set([...s.revertidas, versionActiva(historial, s).v])] }))}
            revertidas={estado.revertidas}
            onEjecutarLoop={onEjecutarLoop}
            ejecutando={ejecutando}
            errorLoop={errorLoop}
            revisionesUsuario={misRevisiones}
            loopHabilitado={!!loop?.habilitado}
          />
        )}
      </main>
    </div>
  );
}
