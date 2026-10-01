"use client";

import { useEffect, useState } from "react";
import type { EstadoPropuesta, Historial, PreguntaJev, Propuesta, Revision, Umbrales, VersionReglas } from "./types";

export type HistorialCliente = Omit<Historial, "jevCache">;

export interface EstadoLocal {
  revisiones: Record<string, Revision>;
  umbrales: Umbrales | null;
  preguntas: PreguntaJev[];
  versiones: VersionReglas[];
  reglasActiva: number | null;
  decisiones: Record<string, { estado: EstadoPropuesta; motivo: string }>;
  propuestasVivas: Propuesta[];
}

export const ESTADO_VACIO: EstadoLocal = {
  revisiones: {},
  umbrales: null,
  preguntas: [],
  versiones: [],
  reglasActiva: null,
  decisiones: {},
  propuestasVivas: [],
};

const CLAVE = "auditor:estado:v1";

/** Estado de la persona que usa la demo: vive en su navegador y nunca pisa el historial. */
export function useEstadoLocal(): [EstadoLocal, (f: (e: EstadoLocal) => EstadoLocal) => void, () => void] {
  const [estado, setEstado] = useState<EstadoLocal>(ESTADO_VACIO);
  useEffect(() => {
    try {
      const crudo = localStorage.getItem(CLAVE);
      if (crudo) setEstado({ ...ESTADO_VACIO, ...JSON.parse(crudo) });
    } catch {}
  }, []);
  const actualizar = (f: (e: EstadoLocal) => EstadoLocal) =>
    setEstado((prev) => {
      const next = f(prev);
      try {
        localStorage.setItem(CLAVE, JSON.stringify(next));
      } catch {}
      return next;
    });
  const reiniciar = () => {
    try {
      localStorage.removeItem(CLAVE);
    } catch {}
    setEstado(ESTADO_VACIO);
  };
  return [estado, actualizar, reiniciar];
}

export function versionesDe(h: HistorialCliente, e: EstadoLocal): VersionReglas[] {
  return [...e.versiones, ...h.versiones].sort((a, b) => b.v - a.v);
}

export function versionActiva(h: HistorialCliente, e: EstadoLocal): VersionReglas {
  const vs = versionesDe(h, e);
  return vs.find((v) => v.v === e.reglasActiva) ?? vs[0];
}

export function propuestasDe(h: HistorialCliente, e: EstadoLocal): Propuesta[] {
  return [...e.propuestasVivas, ...h.propuestas].map((p) => {
    const d = e.decisiones[p.id];
    return d ? { ...p, estado: d.estado, decididaPor: "usuario" as const, motivoDecision: d.motivo } : p;
  });
}

export function preguntasDe(h: HistorialCliente, e: EstadoLocal): PreguntaJev[] {
  return [...e.preguntas, ...h.preguntasJev].sort((a, b) => b.v - a.v);
}

export const hoy = () => new Date().toISOString().slice(0, 10);
