/**
 * Issue #6 — la MISMA barrera rige el simulador y el botón de aprobar de la UI.
 *
 * API-FREE: `validarTransicion` y `decisionSimulada` son funciones puras; acá se las ejercita con
 * `Propuesta` sintéticas armadas a mano, sin tocar Opus, Jev ni la red.
 */
import { describe, expect, it } from "vitest";
import { decisionSimulada } from "../lib/loop";
import { validarTransicion } from "../lib/transicion";
import type { Metricas, Propuesta } from "../lib/types";

const metricas = (over: Partial<Metricas> = {}): Metricas => ({
  eventos: 10,
  veredictos: { correcta: 8, demasiado_cautelosa: 1, demasiado_atrevida: 0.5, accion_no_fundamentada: 0 },
  veredictosConteo: { correcta: 8, demasiado_cautelosa: 1, demasiado_atrevida: 1, accion_no_fundamentada: 0 },
  sobreUmbral: 2,
  clases: { auto: 5, aprobar: 3, humano: 2 },
  sinPersona: 65,
  reversionesReproducidas: 3,
  reversionesTotales: 4,
  confirmadasRotas: 0,
  implicitasQueCambian: 0,
  ...over,
});

const propuesta = (over: { antes?: Partial<Metricas>; despues?: Partial<Metricas>; mejora?: boolean; baseVersion?: number } = {}): Propuesta => ({
  id: "P-999",
  fecha: "2026-10-01T10:00",
  semanaDatos: "S-1",
  baseVersion: over.baseVersion ?? 1,
  nuevaVersion: (over.baseVersion ?? 1) + 1,
  titulo: "Propuesta de prueba",
  razonamiento: "—",
  cambios: [],
  reglas: { salvaguardas: [], reglas: [], por_defecto: { clasificacion: "auto", accion: "—" } },
  metricasAntes: metricas(over.antes),
  metricasDespues: metricas(over.despues),
  cambiados: 1,
  rompe: [],
  ejemplos: [],
  revision: { modelo: "test", mejora: over.mejora ?? true, porQue: "—", riesgos: "—" },
  uso: { propuesta: { modelo: "test", via: "sesion", entrada: 0, salida: 0, costoUSD: 0 }, revision: { modelo: "test", via: "sesion", entrada: 0, salida: 0, costoUSD: 0 }, costoUSD: 0 },
  estado: "pendiente",
  decididaPor: null,
  motivoDecision: "",
});

const activa = { versionActiva: 1 };

describe("validarTransicion · una sola barrera (#6)", () => {
  it("aprueba una propuesta limpia armada sobre la versión activa", () => {
    const p = propuesta();
    const r = validarTransicion(p, activa);
    expect(r.aprobar).toBe(true);
    expect(r.fallos).toEqual([]);
  });

  it("lo que la UI aprobaría por baseVersion, pero el simulador rechaza, ya NO pasa el validador único", () => {
    // baseVersion === activa (la ÚNICA barrera que tenía la UI), pero rompe una confirmada: debe caer.
    const p = propuesta({ antes: { confirmadasRotas: 0 }, despues: { confirmadasRotas: 2 } });
    expect(p.baseVersion).toBe(activa.versionActiva); // la vieja barrera de la UI estaría conforme
    const r = validarTransicion(p, activa);
    expect(r.aprobar).toBe(false);
    expect(r.fallos.join(" ")).toContain("confirmó");
  });

  it("rechaza si la revisión no encuentra mejora", () => {
    expect(validarTransicion(propuesta({ mejora: false }), activa).aprobar).toBe(false);
  });

  it("rechaza si reproduce menos correcciones humanas", () => {
    const p = propuesta({ antes: { reversionesReproducidas: 3 }, despues: { reversionesReproducidas: 1 } });
    expect(validarTransicion(p, activa).aprobar).toBe(false);
  });

  it("rechaza si sube «demasiado_atrevida» más allá de la tolerancia", () => {
    const p = propuesta({ antes: { veredictos: metricas().veredictos }, despues: { veredictos: { ...metricas().veredictos, demasiado_atrevida: 2 } } });
    expect(validarTransicion(p, activa).aprobar).toBe(false);
  });

  it("rechaza una propuesta armada sobre una versión que ya no es la activa", () => {
    const p = propuesta({ baseVersion: 1 });
    const r = validarTransicion(p, { versionActiva: 3 });
    expect(r.aprobar).toBe(false);
    expect(r.fallos.join(" ")).toContain("v1");
  });
});

describe("decisionSimulada usa la misma barrera que la UI", () => {
  it("coincide con validarTransicion sobre la versión base de la propuesta", () => {
    for (const p of [propuesta(), propuesta({ mejora: false }), propuesta({ despues: { confirmadasRotas: 1 } })]) {
      const sim = decisionSimulada(p);
      const uni = validarTransicion(p, { versionActiva: p.baseVersion });
      expect(sim.aprobar).toBe(uni.aprobar);
      expect(sim.motivo).toBe(uni.motivo);
    }
  });
});
