/**
 * Ejercita las funciones puras del motor determinista: normalizar, EXTRACTORES y decidir.
 * Los casos que HOY fallan (bugs que arreglan otros issues) quedan en `.skip` con el
 * comentario `// activa #N`: cuando el fix aterrice, se cambia `.skip` por el test normal.
 */
import { describe, expect, it } from "vitest";
import { camposAmbiguos, decidir, edades, EXTRACTORES, normalizar, validarReglas } from "../lib/engine";
import { SALVAGUARDAS_INMUTABLES } from "../lib/salvaguardas-inmutables";
import type { Evento } from "../lib/types";
import { DATO_AMBIGUO, DONACION_CON_DENUNCIA, DOS_FECHAS, EDAD, MULTIPLES_IMPORTES, REGLAS_BASE, REGLAS_CON_MENORES } from "./casos";

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

  it("importe es el de la donación vigente (no posicional); importe_ultimo sigue siendo el último", () => {
    // Acá el importe de HOY (300 €) además es el primero, pero `importe` lo elige por el
    // marcador "hoy", no por la posición. `importe_ultimo` es el primitivo posicional.
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

  it("fecha elige el cierre por marcadores; dia sigue siendo el último día posicional", () => {
    // #4: con dos fechas, `fecha` se queda con la del CIERRE (viernes), no con la última
    // del texto (lunes, de la reunión). `dia` queda como primitivo posicional.
    const dosFechas = "cierra el viernes; reunión el lunes";
    expect(EXTRACTORES.fecha(dosFechas)).toBe("viernes");
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

describe("#4 · cada dato extraído pertenece a su hecho", () => {
  // Los dos casos del issue (antes en skip).
  it("con importe de hoy al final, el acuse cita 300 € y no 50 €", () => {
    const d = decidir(MULTIPLES_IMPORTES[1].evento, REGLAS_BASE);
    expect(d.accion).toContain("300 €");
    expect(d.accion).not.toContain("50 €");
  });

  it("con cierre y reunión, se anota el viernes y no el lunes", () => {
    const d = decidir(DOS_FECHAS[1].evento, REGLAS_BASE);
    expect(d.accion).toContain("viernes");
    expect(d.accion).not.toContain("lunes");
  });

  // Todas las variantes de importe (orden invertido, mes vs. anterior, voseo) resuelven a
  // los 300 € de la donación vigente, nunca a los 50 € del aporte viejo.
  it("el acuse cita la donación vigente en todas las variantes de importe", () => {
    for (const { evento, descripcion } of MULTIPLES_IMPORTES) {
      const d = decidir(evento, REGLAS_BASE);
      expect(d.cls, descripcion).toBe("auto");
      expect(d.accion, descripcion).toContain("300 €");
      expect(d.accion, descripcion).not.toContain("50 €");
    }
  });

  // Todas las variantes de dos fechas anotan el CIERRE, nunca la fecha de la reunión.
  it("fecha extrae el cierre y no la reunión en todas las variantes", () => {
    const cierre: Record<string, string> = {
      "fecha-cierre-reunion": "viernes",
      "fecha-reunion-cierre": "viernes",
      "fecha-dia-mes": "14 de marzo",
      "fecha-vence-encuentro": "jueves",
    };
    const reunion: Record<string, string> = {
      "fecha-cierre-reunion": "lunes",
      "fecha-reunion-cierre": "lunes",
      "fecha-dia-mes": "10 de marzo",
      "fecha-vence-encuentro": "martes",
    };
    for (const { evento, descripcion } of DOS_FECHAS.filter((c) => c.activa === 4)) {
      expect(EXTRACTORES.fecha(evento.texto), descripcion).toBe(cierre[evento.id]);
      const d = decidir(evento, REGLAS_BASE);
      expect(d.accion, descripcion).toContain(cierre[evento.id]);
      expect(d.accion, descripcion).not.toContain(reunion[evento.id]);
    }
  });

  // Ambigüedad real entre hechos: se ELEVA por el camino de si_falta_dato (ante duda, persona).
  it("ante ambigüedad real entre hechos, eleva a humano en vez de adivinar", () => {
    for (const { evento, esperado, descripcion } of DATO_AMBIGUO) {
      const d = decidir(evento, REGLAS_BASE);
      expect(d.cls, descripcion).toBe(esperado.clasificacion);
      expect(d.motivos.join(" "), descripcion).toContain("ambiguo");
    }
  });

  it("camposAmbiguos marca el conflicto real y queda limpio cuando los marcadores deciden", () => {
    expect(camposAmbiguos("Doné 300 € y también doné 500 €.")).toContain("importe");
    expect(camposAmbiguos("Hoy doné 300 €, el mes pasado 50 €.")).toEqual([]);
  });
});

describe("#5 · validarReglas no deja pasar acciones infundadas ni borrar salvaguardas", () => {
  // Una regla auto válida que cita el importe por `{campo}` (no inventa nada). Base para
  // mutarla en cada caso negativo sin arrastrar otros errores de forma.
  const reglaOk = {
    id: "R-cert",
    sop: "Acuse de donación citando el importe extraído del texto.",
    cuando: { tipos: ["donante_acuse"], contiene_alguno: [], no_contiene: [], importe_min: null, importe_max: null },
    entonces: { clasificacion: "auto" as const, accion: "Enviado el acuse por la donación de {importe}." },
    requiere: ["importe"],
    si_falta_dato: "humano" as const,
  };
  const conReglas = (reglas: typeof reglaOk[]) => ({ ...REGLAS_BASE, salvaguardas: [], reglas });

  it("las reglas base del repo y las de menores son válidas (sin falsos positivos)", () => {
    expect(validarReglas(REGLAS_BASE)).toEqual([]);
    expect(validarReglas(REGLAS_CON_MENORES)).toEqual([]);
  });

  it("una regla con cifra inventada + 'certificado emitido' literal es rechazada", () => {
    const reglas = conReglas([
      { ...reglaOk, entonces: { clasificacion: "auto" as const, accion: "Certificado emitido por la donación de 500 €." } },
    ]);
    const errores = validarReglas(reglas);
    expect(errores.some((e) => e.includes("dato inventado"))).toBe(true);
    expect(errores.join(" ")).toContain("500 €");
  });

  it("también rechaza referencias y fechas literales fuera de un {campo}", () => {
    const ref = conReglas([{ ...reglaOk, entonces: { clasificacion: "auto" as const, accion: "Anotada la convocatoria BECA-2026 para todos." } }]);
    const fecha = conReglas([{ ...reglaOk, entonces: { clasificacion: "auto" as const, accion: "Programado el cierre para el 14 de marzo sin falta." } }]);
    expect(validarReglas(ref).some((e) => e.includes("dato inventado"))).toBe(true);
    expect(validarReglas(fecha).some((e) => e.includes("dato inventado"))).toBe(true);
  });

  it("una regla válida con {importe} no dispara 'dato inventado'", () => {
    expect(validarReglas(conReglas([reglaOk])).some((e) => e.includes("dato inventado"))).toBe(false);
  });

  it("números genéricos sin moneda ('72 h', '2 voluntarios') no se bloquean", () => {
    const reglas = conReglas([
      { ...reglaOk, entonces: { clasificacion: "auto" as const, accion: "Dados de alta 2 voluntarios y agendado un aviso 72 h antes." } },
    ]);
    expect(validarReglas(reglas).some((e) => e.includes("dato inventado"))).toBe(false);
  });

  it("una propuesta que borra/rebaja una salvaguarda inmutable es rechazada", () => {
    // Reusa el id de una inmutable (INM-acoso) pero la vacía y la baja a auto para fingir
    // cobertura. El motor igual la aplica desde código; el validador corta el intento.
    const reglas = {
      ...REGLAS_BASE,
      reglas: [reglaOk],
      salvaguardas: [
        { id: "INM-acoso", sop: "Neutralizada a propósito.", palabras: [], palabras_exactas: [], edad_menor_de: null, nivel_minimo: "auto" as const },
      ],
    };
    const errores = validarReglas(reglas);
    expect(errores.some((e) => e.includes("INM-acoso") && (e.includes("rebaja") || e.includes("borra disparadores")))).toBe(true);
  });

  it("rebajar el umbral de edad de la salvaguarda inmutable de menores es rechazado", () => {
    const reglas = {
      ...REGLAS_BASE,
      reglas: [reglaOk],
      salvaguardas: [
        { id: "INM-menores", sop: "Umbral rebajado.", palabras: ["menor de edad", "soy menor", "es menor de", "somos menores"], palabras_exactas: [], edad_menor_de: 13, nivel_minimo: "humano" as const },
      ],
    };
    expect(validarReglas(reglas).some((e) => e.includes("INM-menores") && e.includes("edad"))).toBe(true);
  });

  it("un por_defecto que resuelve en auto es rechazado", () => {
    const reglas = { ...REGLAS_BASE, reglas: [reglaOk], salvaguardas: [], por_defecto: { clasificacion: "auto" as const, accion: "Despachado en automático sin intervención." } };
    expect(validarReglas(reglas).some((e) => e.includes("por_defecto") && e.includes("automático"))).toBe(true);
  });
});
