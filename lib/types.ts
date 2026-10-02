export type Clase = "auto" | "aprobar" | "humano";
export const CLASES: Clase[] = ["auto", "aprobar", "humano"];
export const NIVEL: Record<Clase, number> = { auto: 0, aprobar: 1, humano: 2 };

export type Veredicto = "correcta" | "demasiado_cautelosa" | "demasiado_atrevida" | "accion_no_fundamentada";
export const VEREDICTOS: Veredicto[] = ["correcta", "demasiado_cautelosa", "demasiado_atrevida", "accion_no_fundamentada"];

export interface Evento {
  id: string;
  t: string;
  tipo: string;
  texto: string;
}

export interface Salvaguarda {
  id: string;
  sop: string;
  palabras: string[];
  palabras_exactas: string[];
  edad_menor_de: number | null;
  nivel_minimo: Clase;
}

export interface Regla {
  id: string;
  sop: string;
  cuando: {
    tipos: string[];
    contiene_alguno: string[];
    no_contiene: string[];
    importe_min: number | null;
    importe_max: number | null;
  };
  entonces: { clasificacion: Clase; accion: string };
  requiere: string[];
  si_falta_dato: Clase;
}

export interface Reglas {
  salvaguardas: Salvaguarda[];
  reglas: Regla[];
  por_defecto: { clasificacion: Clase; accion: string };
}

export interface Decision {
  cls: Clase;
  regla: string;
  accion: string;
  motivos: string[];
}

export interface Auditoria {
  v: Veredicto;
  conf: number;
  /** Probabilidad de "sí" de cada pregunta Noul adicional, por clave. */
  nouls: Record<string, number>;
}

export type TipoRevision = "aprobado" | "rechazado" | "revertido" | "confirmado" | "gestionado";

export interface Revision {
  tipo: TipoRevision;
  objetivo: Clase | null;
  motivo: string;
  /** "implicito": la semana cerró con revisiones y este evento quedó sin tocar; se asume correcto. */
  por: "simulado" | "usuario" | "implicito";
  clsOriginal: Clase;
  accionOriginal: string;
}

/** Solo existe en datos sintéticos: la etiqueta que el generador sabe que es la correcta. */
export interface Verdad {
  cls: Clase;
  clave: string | null;
}

export interface EventoProcesado extends Evento {
  semana: string;
  reglasVersion: number;
  decision: Decision;
  jev: Auditoria;
  revision: Revision | null;
  verdad?: Verdad;
}

export type Umbrales = Record<Clase, number>;

export interface Metricas {
  eventos: number;
  /** Veredictos de Jev sumando su confianza: un veredicto con 0,3 pesa 0,3, no 1. */
  veredictos: Record<Veredicto, number>;
  veredictosConteo: Record<Veredicto, number>;
  sobreUmbral: number;
  clases: Record<Clase, number>;
  sinPersona: number;
  reversionesReproducidas: number;
  reversionesTotales: number;
  confirmadasRotas: number;
  implicitasQueCambian: number;
  /** Contra la etiqueta sintética, en los mismos textos de los que aprende el loop. */
  precisionVerdad?: number;
  /** Contra la etiqueta sintética, en paráfrasis que el loop nunca vio. */
  precisionNueva?: number;
}

export interface CambioPropuesto {
  regla: string;
  tipo: "añadir" | "modificar" | "eliminar";
  descripcion: string;
}

export interface Ejemplo {
  id: string;
  tipo: string;
  texto: string;
  antes: Decision & Auditoria;
  despues: Decision & Auditoria;
  revision: Revision | null;
}

export type EstadoPropuesta = "pendiente" | "aprobada" | "rechazada";

export interface Uso {
  modelo: string;
  /** "api": llamada pagada a la API de Anthropic; "sesion": respuesta grabada de un subagente de Claude Code, sin costo de API. */
  via: "api" | "sesion";
  entrada: number;
  salida: number;
  costoUSD: number;
}

export interface Propuesta {
  id: string;
  fecha: string;
  semanaDatos: string;
  baseVersion: number;
  nuevaVersion: number;
  titulo: string;
  razonamiento: string;
  cambios: CambioPropuesto[];
  reglas: Reglas;
  metricasAntes: Metricas;
  metricasDespues: Metricas;
  cambiados: number;
  /** Decisiones confirmadas por una persona que esta propuesta cambia (lo que se le señala si se rechaza). */
  rompe: { tipo: string; texto: string; confirmada: Clase; propuesta: Clase }[];
  ejemplos: Ejemplo[];
  revision: { modelo: string; mejora: boolean; porQue: string; riesgos: string };
  uso: { propuesta: Uso; revision: Uso; costoUSD: number };
  estado: EstadoPropuesta;
  decididaPor: "simulado" | "usuario" | null;
  motivoDecision: string;
}

export interface VersionReglas {
  v: number;
  fecha: string;
  propuesta: string | null;
  nota: string;
  reglas: Reglas;
}

export interface PreguntaNoul {
  k: string;
  instrucciones: string;
  criterios: { true: string; false: string };
}

export interface PreguntaJev {
  v: number;
  fecha: string;
  nota: string;
  instrucciones: string;
  criterios: { k: string; d: string }[];
  adicionales: PreguntaNoul[];
}

export interface Calibracion {
  t: number;
  revisados: number;
  errores: number;
}

export interface Semana {
  id: string;
  inicio: string;
  fin: string;
  etiqueta: string;
  reglasVersion: number;
  umbrales: Umbrales;
  umbralCalibrado: Umbrales;
  /** Con cuántos casos se calibró el umbral de esa semana; null si no hubo con qué. */
  calibracion: Record<Clase, Calibracion | null>;
  metricas: Metricas;
  enCurso: boolean;
}

export interface Historial {
  generado: string;
  modeloPropuesta: string;
  modeloRevision: string;
  modeloJev: string;
  semanas: Semana[];
  eventos: EventoProcesado[];
  versiones: VersionReglas[];
  propuestas: Propuesta[];
  preguntasJev: PreguntaJev[];
  jevCache: Record<string, Auditoria>;
}
