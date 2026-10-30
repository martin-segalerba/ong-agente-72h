/**
 * Ejercita las funciones puras del motor determinista: normalizar, EXTRACTORES y decidir.
 * Los casos que HOY fallan (bugs que arreglan otros issues) quedan en `.skip` con el
 * comentario `// activa #N`: cuando el fix aterrice, se cambia `.skip` por el test normal.
 */
import { describe, expect, it } from "vitest";
import { decidir, EXTRACTORES, normalizar } from "../lib/engine";
import { DONACION_CON_DENUNCIA, DOS_FECHAS, EDAD, MULTIPLES_IMPORTES, REGLAS_BASE, REGLAS_CON_MENORES } from "./casos";

describe("normalizar", () => {
  it("pasa a minúsculas y saca los acentos", () => {
    expect(normalizar("TENGO 16 AÑOS")).toBe("tengo 16 anos");
    expect(normalizar("dieciséis")).toBe("dieciseis");
    expect(normalizar("Miércoles")).toBe("miercoles");
  });
});

describe("EXTRACTORES", () => {
  const texto = "Hoy he donado 300 €, el mes pasado doné 50 €.";

  it("importe toma la primera coincidencia; importe_ultimo la última", () => {
    expect(EXTRACTORES.importe(texto)).toBe("300 €");
    expect(EXTRACTORES.importe_ultimo(texto)).toBe("50 €");
  });

  it("devuelve null cuando no hay dato en vez de inventarlo", () => {
    expect(EXTRACTORES.importe("Gracias por todo, un abrazo.")).toBeNull();
    expect(EXTRACTORES.referencia("Sin referencia por aquí.")).toBeNull();
  });

  it("referencia reconoce el patrón de código (BECA-2026)", () => {
    expect(EXTRACTORES.referencia("La convocatoria BECA-2026 cierra pronto.")).toBe("BECA-2026");
  });

  it("fecha/dia devuelven la ÚLTIMA fecha o día del texto", () => {
    // Esta es la conducta actual (posicional), la que #4 va a corregir para citar el cierre.
    const dosFechas = "cierra el viernes; reunión el lunes";
    expect(EXTRACTORES.dia(dosFechas)).toBe("lunes");
    expect(EXTRACTORES.fecha("vence el 14 de marzo")).toBe("14 de marzo");
  });
});

describe("decidir · casos que ya andan", () => {
  it("menor de edad en minúsculas eleva a humano", () => {
    const { evento } = EDAD[0];
    expect(decidir(evento, REGLAS_CON_MENORES).cls).toBe("humano");
  });

  it("acuse de donación con importe se resuelve en auto y lo cita", () => {
    const { evento } = MULTIPLES_IMPORTES[0];
    const d = decidir(evento, REGLAS_BASE);
    expect(d.cls).toBe("auto");
    expect(d.accion).toContain("300 €");
  });

  it("si falta el dato requerido, no se resuelve en automático", () => {
    const evento = { id: "sin-importe", t: "2026-10-01T10:00:00Z", tipo: "donante_acuse", texto: "Muchas gracias por recibir mi aporte." };
    const d = decidir(evento, REGLAS_BASE);
    expect(d.cls).toBe("humano");
    expect(d.motivos.join(" ")).toContain("falta");
  });

  it("un límite duro de 'nunca auto' pisa una regla que clasificaría en auto", () => {
    // proveedor_factura está en LIMITES_DUROS.nuncaAuto: aunque una regla diga auto, sube a aprobar.
    const reglas = {
      ...REGLAS_BASE,
      reglas: [
        {
          id: "R-test",
          sop: "Factura en auto (a propósito, para probar el límite duro).",
          cuando: { tipos: ["proveedor_factura"], contiene_alguno: [], no_contiene: [], importe_min: null, importe_max: null },
          entonces: { clasificacion: "auto" as const, accion: "Pagada la factura de {importe}." },
          requiere: ["importe"],
          si_falta_dato: "humano" as const,
        },
      ],
    };
    const evento = { id: "fac", t: "2026-10-01T10:00:00Z", tipo: "proveedor_factura", texto: "Factura por 500 €." };
    expect(decidir(evento, reglas).cls).toBe("aprobar");
  });
});

describe("decidir · regresiones pendientes (quedan en skip hasta su fix)", () => {
  // activa #3 — la MISMA edad en MAYÚSCULAS tiene que elevar igual que en minúsculas.
  it.skip("edad en MAYÚSCULAS eleva a humano", () => {
    const { evento } = EDAD[1];
    expect(decidir(evento, REGLAS_CON_MENORES).cls).toBe("humano");
  });

  // activa #3 — la edad escrita en palabras («dieciséis») también es un menor.
  it.skip("edad en palabras eleva a humano", () => {
    const { evento } = EDAD[2];
    expect(decidir(evento, REGLAS_CON_MENORES).cls).toBe("humano");
  });

  // activa #3 — multi-intención: una denuncia de acoso dentro de un acuse exige persona.
  it.skip("donación con denuncia de acoso no se resuelve en auto", () => {
    for (const { evento } of DONACION_CON_DENUNCIA) {
      expect(decidir(evento, REGLAS_BASE).cls).toBe("humano");
    }
  });

  // activa #4 — el acuse debe citar la donación de HOY aunque no sea el primer importe del texto.
  it.skip("con importe de hoy al final, el acuse cita 300 € y no 50 €", () => {
    const { evento } = MULTIPLES_IMPORTES[1];
    const d = decidir(evento, REGLAS_BASE);
    expect(d.accion).toContain("300 €");
    expect(d.accion).not.toContain("50 €");
  });

  // activa #4 — con dos fechas, el recordatorio debe anotar el cierre (viernes), no la reunión (lunes).
  it.skip("con cierre y reunión, se anota el viernes y no el lunes", () => {
    const { evento } = DOS_FECHAS[1];
    const d = decidir(evento, REGLAS_BASE);
    expect(d.accion).toContain("viernes");
    expect(d.accion).not.toContain("lunes");
  });
});
