/**
 * Ejercita las funciones puras del motor determinista: normalizar, EXTRACTORES y decidir.
 * Los casos que HOY fallan (bugs que arreglan otros issues) quedan en `.skip` con el
 * comentario `// activa #N`: cuando el fix aterrice, se cambia `.skip` por el test normal.
 */
import { describe, expect, it } from "vitest";
import { decidir, edades, EXTRACTORES, normalizar } from "../lib/engine";
import { SALVAGUARDAS_INMUTABLES } from "../lib/salvaguardas-inmutables";
import type { Evento } from "../lib/types";
import { DONACION_CON_DENUNCIA, DOS_FECHAS, EDAD, MULTIPLES_IMPORTES, REGLAS_BASE, REGLAS_CON_MENORES } from "./casos";

const ev = (tipo: string, texto: string): Evento => ({ id: "t", t: "2026-10-01T10:00:00Z", tipo, texto });

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

describe("#3 · edad robusta a formato (dígitos, MAYÚSCULAS y palabras)", () => {
  it("extrae la edad en dígitos y en palabras, en cualquier caja y con acentos", () => {
    expect(edades("Tengo 16 años")).toEqual([16]);
    expect(edades("TENGO 16 AÑOS")).toEqual([16]);
    expect(edades("Tengo dieciséis años")).toEqual([16]);
    expect(edades("DISPONIBLE, TENGO DIECISIETE AÑOS")).toEqual([17]);
    expect(edades("Gracias por todo, sin edad acá.")).toEqual([]);
  });

  it("todas las variantes de EDAD elevan a humano (misma frase, distinto formato)", () => {
    for (const { evento, descripcion } of EDAD) {
      expect(decidir(evento, REGLAS_CON_MENORES).cls, descripcion).toBe("humano");
    }
  });

  it("la misma frase en minúsculas, MAYÚSCULAS y en palabras da el mismo resultado", () => {
    const min = decidir(EDAD[0].evento, REGLAS_CON_MENORES).cls; // "16 años"
    const may = decidir(EDAD[1].evento, REGLAS_CON_MENORES).cls; // "16 AÑOS"
    const pal = decidir(EDAD[2].evento, REGLAS_CON_MENORES).cls; // "dieciséis años"
    expect([may, pal]).toEqual([min, min]);
  });
});

describe("#3 · multi-intención: una señal sensible eleva aunque la regla base ya haya actuado", () => {
  it("donación + denuncia de acoso no recibe acuse automático (eleva a humano)", () => {
    for (const { evento, descripcion } of DONACION_CON_DENUNCIA) {
      const d = decidir(evento, REGLAS_BASE);
      expect(d.cls, descripcion).toBe("humano");
      expect(d.regla).toContain("INM-acoso");
    }
  });
});

describe("#3 · capa de salvaguardas INMUTABLES por contenido", () => {
  // Partimos de un acuse de donación que SIN señal sensible resuelve en `auto` (R1 con
  // importe) y SIN ninguna salvaguarda en rules.json (REGLAS_BASE): así se ve que la capa
  // eleva desde código, por contenido, aunque el tipo sea "inofensivo".
  const dispara = (texto: string) => decidir(ev("donante_acuse", texto), REGLAS_BASE);

  it("menores: edad < 18 eleva; 18+ no (umbral estricto en 18)", () => {
    expect(dispara("Doné 20 €. Tengo 17 años.").cls).toBe("humano");
    expect(dispara("Doné 20 €. Tengo 18 años.").cls).toBe("auto");
    expect(dispara("Doné 20 €. Tengo diecisiete años.").cls).toBe("humano");
  });

  it("acoso / denuncia / abuso eleva a humano", () => {
    expect(dispara("Doné 20 €. Quiero denunciar un abuso de un coordinador.").regla).toContain("INM-acoso");
    expect(dispara("Doné 20 €. Sufrí acoso en el evento.").cls).toBe("humano");
    expect(dispara("Doné 20 €. Hubo maltrato hacia una compañera.").cls).toBe("humano");
  });

  it("conflicto entre personas eleva a humano", () => {
    expect(dispara("Doné 20 €. Hay un conflicto entre dos voluntarios.").regla).toContain("INM-conflicto");
    expect(dispara("Doné 20 €. Tuvimos una pelea en la sede.").cls).toBe("humano");
  });

  it("autolesión / urgencia médica / riesgo vital eleva a humano", () => {
    expect(dispara("Doné 20 €. Un chico habló de autolesión.").regla).toContain("INM-urgencia");
    expect(dispara("Doné 20 €. Fue una urgencia médica, no podía respirar.").cls).toBe("humano");
  });

  it("un mensaje sin ninguna señal sensible NO se eleva (no rompe el historial)", () => {
    expect(dispara("Muchas gracias, acabo de donar 50 € este mes.").cls).toBe("auto");
  });

  it("las cuatro señales son humano (ningún borrador automático ante contenido sensible)", () => {
    expect(SALVAGUARDAS_INMUTABLES.map((s) => s.nivelMinimo)).toEqual(["humano", "humano", "humano", "humano"]);
  });
});

describe("decidir · regresiones pendientes (quedan en skip hasta su fix)", () => {
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
