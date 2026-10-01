import type { Reglas } from "./types";

/**
 * Punto de partida del loop: lo que se monta en una tarde con filtros de correo.
 * Acusa donaciones, da de alta voluntarios, anota plazos y prepara facturas; lo
 * demás va a una persona. Sin salvaguardas por texto: el loop tiene que aprenderlas.
 */
export const REGLAS_V1: Reglas = {
  salvaguardas: [],
  reglas: [
    {
      id: "R1",
      sop: "Si el tipo es `donante_acuse` y el texto trae un importe, clasificar como `auto` y enviar el acuse citando el importe.",
      cuando: { tipos: ["donante_acuse"], contiene_alguno: [], no_contiene: [], importe_min: null, importe_max: null },
      entonces: { clasificacion: "auto", accion: "Enviado acuse de recibo confirmando la donación de {importe}." },
      requiere: ["importe"],
      si_falta_dato: "humano",
    },
    {
      id: "R2",
      sop: "Si el tipo es `voluntario_alta`, clasificar como `auto`, dar de alta y enviar el calendario de turnos del día indicado.",
      cuando: { tipos: ["voluntario_alta"], contiene_alguno: [], no_contiene: [], importe_min: null, importe_max: null },
      entonces: { clasificacion: "auto", accion: "Dado de alta en la base de voluntarios y enviado el calendario de turnos del {dia}." },
      requiere: ["dia"],
      si_falta_dato: "humano",
    },
    {
      id: "R3",
      sop: "Si el tipo es `plazo_recordatorio`, clasificar como `auto`, anotar el cierre de la convocatoria y programar un recordatorio.",
      cuando: { tipos: ["plazo_recordatorio"], contiene_alguno: [], no_contiene: [], importe_min: null, importe_max: null },
      entonces: { clasificacion: "auto", accion: "Anotado el cierre de la convocatoria {referencia} el {fecha} y programado un recordatorio 72 h antes." },
      requiere: ["referencia", "fecha"],
      si_falta_dato: "humano",
    },
    {
      id: "R4",
      sop: "Si el tipo es `proveedor_factura`, clasificar como `aprobar` y preparar el pago citando número de factura e importe.",
      cuando: { tipos: ["proveedor_factura"], contiene_alguno: [], no_contiene: [], importe_min: null, importe_max: null },
      entonces: { clasificacion: "aprobar", accion: "Preparado el pago de la factura {referencia} por {importe}, a la espera de aprobación." },
      requiere: ["referencia", "importe"],
      si_falta_dato: "humano",
    },
  ],
  por_defecto: { clasificacion: "humano", accion: "Sin regla aplicable: lo revisa una persona." },
};
