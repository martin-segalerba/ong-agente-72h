import type { Propuesta } from "./types";

/**
 * La ÚNICA barrera de aprobación. La comparten el simulador (`decisionSimulada`) y el botón de
 * aprobar de la UI, de modo que la interfaz nunca puede aplicar una propuesta que el simulador
 * rechazaría. Es una función pura: solo mira los números de la propuesta y el estado actual, nunca
 * la narrativa del modelo ni llama a la red.
 */

/** Margen para «demasiado_atrevida» ponderado: medio veredicto seguro de diferencia es ruido. */
export const TOLERANCIA_ATREVIDA = 0.5;

/** El estado contra el que se valida la transición. Hoy alcanza con la versión de reglas activa. */
export interface EstadoTransicion {
  versionActiva: number;
}

export interface ResultadoTransicion {
  aprobar: boolean;
  motivo: string;
  /** Cada barrera que la propuesta no supera, en lenguaje legible. Vacío si aprueba. */
  fallos: string[];
}

export function validarTransicion(p: Propuesta, estado: EstadoTransicion): ResultadoTransicion {
  const a = p.metricasAntes;
  const d = p.metricasDespues;
  const fallos: string[] = [];

  // La propuesta se midió contra sus reglas base: si ya no son las activas, sus métricas no comparan.
  if (p.baseVersion !== estado.versionActiva)
    fallos.push(`se armó sobre reglas v${p.baseVersion}, pero las activas son v${estado.versionActiva}`);
  if (!p.revision.mejora) fallos.push("la revisión no encuentra mejora");
  if (d.veredictos.demasiado_atrevida > a.veredictos.demasiado_atrevida + TOLERANCIA_ATREVIDA)
    fallos.push(`sube «demasiado_atrevida» ponderado (${a.veredictos.demasiado_atrevida} → ${d.veredictos.demasiado_atrevida})`);
  if (d.confirmadasRotas > a.confirmadasRotas) fallos.push(`cambia ${d.confirmadasRotas - a.confirmadasRotas} decisiones que una persona confirmó`);
  if (d.reversionesReproducidas < a.reversionesReproducidas) fallos.push("reproduce menos correcciones humanas");
  if (d.veredictos.correcta < a.veredictos.correcta - TOLERANCIA_ATREVIDA) fallos.push(`baja «correcta» ponderado (${a.veredictos.correcta} → ${d.veredictos.correcta})`);

  return fallos.length
    ? { aprobar: false, motivo: `Rechazada: ${fallos.join("; ")}.`, fallos }
    : {
        aprobar: true,
        motivo: `Aprobada: reproduce ${d.reversionesReproducidas}/${d.reversionesTotales} correcciones (antes ${a.reversionesReproducidas}), «correcta» ponderado ${a.veredictos.correcta} → ${d.veredictos.correcta}, sin cambiar decisiones confirmadas.`,
        fallos,
      };
}
