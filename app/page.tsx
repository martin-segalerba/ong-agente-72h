import historialJson from "@/data/historial.json";
import type { HistorialCliente } from "@/lib/cliente";
import type { Historial } from "@/lib/types";
import { Auditor } from "./auditor";

export default function Pagina() {
  const { jevCache: _cache, eventos, ...resto } = historialJson as unknown as Historial;
  // La etiqueta sintética de cada evento no viaja al navegador: solo existen sus agregados semanales.
  const historial: HistorialCliente = { ...resto, eventos: eventos.map(({ verdad: _v, ...e }) => e) };
  return <Auditor historial={historial} />;
}
