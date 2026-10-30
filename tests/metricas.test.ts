/**
 * Ejercita `senalFuerte` de lib/metricas.ts con objetos Auditoria construidos a mano.
 * API-FREE: nunca se llama a Jev; las auditorías son sintéticas.
 *
 * El caso que HOY falla (ausencia del auditor tratada como "seguro") queda en `.skip`
 * con `// activa #2`.
 */
import { describe, expect, it } from "vitest";
import { NOUL_SENAL, senalFuerte, UMBRALES_INICIALES } from "../lib/metricas";
import type { Decision } from "../lib/types";
import { auditoria } from "./casos";

const decision = (cls: Decision["cls"]): Decision => ({ cls, regla: "R-test", accion: "—", motivos: [] });
const u = UMBRALES_INICIALES;

describe("senalFuerte · lo que ya anda", () => {
  it("en auto, marca cuando la Noul 'requiere_persona' supera el umbral", () => {
    const fuerte = auditoria("correcta", 0.9, { [NOUL_SENAL]: 0.8 });
    const debil = auditoria("correcta", 0.9, { [NOUL_SENAL]: 0.3 });
    expect(senalFuerte(decision("auto"), fuerte, u)).toBe(true);
    expect(senalFuerte(decision("auto"), debil, u)).toBe(false);
  });

  it("en aprobar/humano, marca cuando Jev duda con confianza alta", () => {
    const duda = auditoria("demasiado_atrevida", 0.9);
    const ok = auditoria("correcta", 0.95);
    expect(senalFuerte(decision("aprobar"), duda, u)).toBe(true);
    expect(senalFuerte(decision("humano"), auditoria("demasiado_cautelosa", 0.7), u)).toBe(true);
    // Un veredicto "correcta" nunca es señal fuerte, por más confianza que tenga.
    expect(senalFuerte(decision("aprobar"), ok, u)).toBe(false);
  });
});

describe("senalFuerte · regresión pendiente (skip hasta su fix)", () => {
  // activa #2 — si falta la señal del auditor en un `auto`, hay que ELEVAR, no asumir que es seguro.
  it.skip("en auto sin señal del auditor, se marca para revisión", () => {
    const sinSenal = auditoria("correcta", 0.9, {}); // no trae la Noul 'requiere_persona'
    expect(senalFuerte(decision("auto"), sinSenal, u)).toBe(true);
  });
});
