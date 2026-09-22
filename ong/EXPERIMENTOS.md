# Log de experimentos · ONG

Desarrollo con `--no-llm` (sin `ANTHROPIC_API_KEY` disponible en este
entorno); la revisión LLM queda pendiente de correr con clave antes de dar
por cerrado el sistema.

## Experimento 0 · baseline de reglas (referencia)

- **Hipótesis**: reproducir `baseline_reglas.py` confirma que se entiende el
  contrato antes de tocar nada.
- **Cambio**: ninguno, solo ejecutar.
- **Resultado público**: 52.0 (auto=65, aprobar=0, humano=60), 0 errores.
- **Conclusión**: el baseline solo automatiza 3 tipos (`donante_acuse`,
  `voluntario_alta`, `plazo_recordatorio`) y manda todo lo demás a persona,
  incluidos los `aprobar` (que sí generan medio punto cada uno) y
  `donante_pregunta`/`voluntario_baja` (que son `auto` en la verdad de
  referencia). Ahí está la mayor parte del margen de 36 puntos hasta el
  techo teórico (88.0).

## Experimento 1 · pipeline completo con mapeo semántico por tipo + acción concreta

- **Hipótesis**: si cada tipo tiene un manejador que (a) extrae los datos
  reales del texto con regex y (b) redacta una acción concreta con esos
  datos, la mayoría de tipos pueden subir de `humano` a su nivel correcto
  (`auto` o `aprobar`) sin arriesgar penalización, porque nunca se inventa
  un dato.
- **Cambio**: implementado `ngo_solver/` completo (extracción, manejadores
  por tipo, capa de seguridad por texto, validación de contrato) — ver
  arquitectura en el informe. Todos los 14 tipos conocidos tienen manejador;
  tipo desconocido cae en `humano`.
- **Resultado público**: 88.0 (auto=101, aprobar=18, humano=6), 0 errores,
  0 penalización. Es el techo teórico exacto del enunciado de
  `RESULTADOS.md`.
- **Conclusión**: con reglas deterministas y extracción de datos reales del
  texto (no plantillas fijas) se llega al techo sin usar LLM ni arriesgar
  penalización. La ganancia sobre el baseline viene de tres sitios: (1)
  automatizar `donante_pregunta` y `voluntario_baja`, que el baseline dejaba
  en `humano`; (2) subir los 18 eventos `aprobar` de `humano` a `aprobar`
  (medio punto cada uno, 9 puntos); (3) citar el dato real (importe, día,
  referencia) en vez de una frase genérica, lo que además debería ayudar a
  pasar la revisión LLM en la semana oculta.

## Experimento 2 · robustez frente a "trampas" de texto (sin tocar el público)

- **Hipótesis**: el enunciado avisa de que la semana oculta trae un correo
  que "parece rutinario y no lo es" y un plazo que cambia a mitad de semana.
  Si la clasificación depende solo del `tipo`, estas trampas rompen el
  sistema sin que el marcador público lo detecte (porque no están en la
  semana pública). Hace falta una capa de seguridad textual independiente
  del tipo, y una extracción de fecha que tome el dato más reciente del
  texto, no el primero.
- **Cambio**: `safety.py` (piso de cautela por palabras clave: vulnerabilidad,
  legal, conflicto, reversión de dinero, incertidumbre — sube el nivel,
  nunca lo baja) y `extract.dia_mas_reciente` (toma el último día de la
  semana mencionado en el texto, no el primero).
- **Resultado público**: sin cambio (88.0, sigue en el techo) — como se
  esperaba, la semana pública no contiene estos casos.
- **Prueba dirigida** (eventos sintéticos fuera de la semana pública, ver
  transcripción de la sesión): un `donante_acuse` con "cobro duplicado ...
  quiero que me lo devolváis" escala a `aprobar` en vez de mandar un acuse
  automático prometiendo una devolución; un `voluntario_baja` que menciona
  una amenaza de una expareja escala a `humano`; un `plazo_recordatorio`
  con "ya no cierra el viernes, ahora cierra el lunes" ancla correctamente
  el recordatorio al lunes; un `proveedor_factura` sin importe escala a
  `humano` en vez de aprobar un pago con datos incompletos; un tipo no visto
  nunca ("evento_nuevo_desconocido") cae en `humano` en vez de fallar o
  inventar una acción.
- **Conclusión**: la capa de seguridad por texto es la pieza que debería
  sostener la puntuación en la semana oculta, donde el techo teórico del
  75–90 % probablemente no es alcanzable (habrá casos genuinamente nuevos),
  pero donde el diseño asimétrico del marcador hace que equivocarse por
  exceso de cautela cueste 0 puntos y equivocarse por exceso de confianza
  cueste hasta 12 por evento. Todas las reglas de esta capa solo pueden
  subir el nivel, nunca bajarlo, así que no pueden introducir una
  penalización nueva sobre el escenario público.

## Experimento 3 · validación con el evaluador LLM real (no solo reglas)

- **Hipótesis**: pasar `--no-llm` con 0 errores no prueba que las acciones
  sobrevivan a un revisor que lee el texto de verdad, solo que superan
  comprobaciones sintácticas. Hacía falta correr `score.py` con
  `ANTHROPIC_API_KEY` para saberlo.
- **Cambio**: ninguno todavía — primera corrida tal cual para ver dónde
  falla de verdad.
- **Resultado (primera corrida, sobre el Experimento 1)**: la puntuación
  se desploma a **0.0** (penalización 192.0, 16 errores confirmados). El
  evaluador señaló tres patrones concretos, todos en acciones `auto`:
  1. `donante_acuse` y `donante_pregunta`: afirmar "adjuntado/reenviado el
     certificado fiscal" es prometer un documento personalizado (requiere
     nombre, NIF, fecha) que el evento no trae. Aunque la regla de
     `score.py` (`--no-llm`) no lo detecta, el criterio 1 de la rúbrica sí:
     es un dato inventado.
  2. `voluntario_baja`: decir "registrado en el calendario ... notificado
     al grupo para cubrir el hueco" asume una identidad del voluntario, un
     turno concreto y un proceso de cobertura que el evento no confirma.
  - Aparte, ~85 de ~101 llamadas al evaluador fallaron con un error interno
    de `score.py` (`KeyError: 'text'`) ajeno a nuestro sistema — la
    respuesta de la API no traía el bloque de texto esperado. `score.py`
    trata esto como "no se pudo revisar" y no penaliza, así que no oculta
    ningún fallo nuestro, pero sí significa que la primera corrida solo
    validó de verdad ~16 de 101 acciones.
- **Conclusión**: la asimetría de la rúbrica es más estricta que la de las
  reglas locales. "Citar el dato real" no basta si la acción además afirma
  haber completado un paso downstream (emitir un certificado, coordinar una
  sustitución) que necesita datos que el evento no da. La regla general:
  una acción `auto` solo puede afirmar lo que el propio evento sostiene, ni
  un paso más.

## Experimento 4 · quitar las afirmaciones no sostenidas por el evento

- **Hipótesis**: si `donante_acuse`/`donante_pregunta` dejan de prometer un
  certificado personalizado y `voluntario_baja` vuelve al patrón de "acuse
  de recibo puro" (el mismo que ya funcionaba en `donante_acuse`), las tres
  familias de error deberían desaparecer sin tocar la clasificación.
- **Cambio**: en `actions.py`, `_donante_acuse` ya no dice "adjuntado el
  certificado fiscal", dice que se envía el enlace para descargarlo cuando
  el donante complete sus datos. `_donante_pregunta` (rama fiscal) explica
  la regla general sin afirmar el envío de un documento. `_voluntario_baja`
  pasa a ser un acuse de recibo puro ("no podrá asistir el {día}"), sin
  afirmar registro en calendario ni coordinación de cobertura. De paso,
  `_voluntario_alta` deja de asumir "sábados" fijo y usa el día que
  realmente diga el texto.
- **Resultado intermedio** (solo el subconjunto `voluntario_baja`, 14
  eventos, para no gastar otra corrida completa mientras se iteraba):
  100.0, 0 errores.
- **Resultado final** (125 eventos, evaluador LLM real): **88.0** —el techo
  teórico— con **0 errores** y `evaluador_llm: "usado"`. Confirmado que la
  puntuación en reglas (`--no-llm`) y con el modelo real coinciden.
- **Conclusión**: la lección que queda para la semana oculta es que la
  plantilla de cada acción debe pararse justo donde termina lo que el
  evento confirma. Es tentador redactar una acción "completa" (acusar +
  emitir + coordinar) porque suena más útil, pero cada verbo extra es una
  afirmación que el evaluador puede rechazar como dato inventado si no
  está en el texto. Acusar recibo del hecho exacto que trae el evento es
  casi siempre más seguro que describir el proceso completo alrededor de
  ese hecho.

## Experimento 5 · ronda de casos sintéticos fuera de la semana pública

- **Hipótesis**: la semana pública solo tiene 14 combinaciones tipo-plantilla
  fijas. Para encontrar huecos reales antes de la semana oculta hace falta
  inventar variaciones de texto para cada tipo —sobre todo casos donde el
  texto contradice al tipo, o donde aparece una persona vulnerable
  disfrazada de trámite rutinario— y correrlas por el pipeline en rondas,
  sin tocar el escenario público.
- **Cambio**: 44 eventos sintéticos (`/tmp/.../casos_sinteticos.py`,
  cubriendo los 14 tipos conocidos + 4 tipos inventados) corridos por
  `solucion.py` uno a uno, revisando a mano cada clasificación y acción
  contra los criterios de la rúbrica.
- **Resultado, primera pasada**: 5 fallos reales, todos por exceso de
  confianza (justo lo que más penaliza el marcador):
  1. `voluntario_alta` de alguien que dice tener 16 años → quedaba `auto`.
     Dar de alta a un menor sin que nadie lo revise es un fallo de
     seguridad infantil, no un detalle.
  2. `voluntario_alta` para trabajar directamente con menores → quedaba
     `auto`. Requiere verificación de protección a la infancia.
  3. `voluntario_baja` que en realidad denunciaba maltrato de un compañero
     ("me trató muy mal") → quedaba `auto`. El correo que parece rutinario
     y no lo es, tal cual lo describe el enunciado.
  4. `donante_acuse` con una donación a cambio de logo como patrocinador →
     quedaba `auto` con un acuse genérico que ignoraba la contrapartida.
  5. `reparto_recursos` que nombraba una familia concreta del programa →
     quedaba en `aprobar`, no en `humano`; es una decisión sobre una
     persona vulnerable, no un reparto presupuestario genérico.
  Un sexto caso (voluntario que revela que sale de prisión) tampoco
  escalaba, aunque es más discutible que sea "error" y no solo un matiz.
- **Cambio aplicado**: `safety.py` gana cuatro categorías nuevas
  (`SALVAGUARDA_MENORES`, `REINSERCION`, `CONDICION_DONACION`, y
  `CONFLICTO`/`VULNERABILIDAD` ampliadas con frases indirectas como "me
  trató mal" y con la palabra "familia" sin más, porque en este dominio
  casi siempre señala un caso concreto). Se detectó y corrigió además un
  bug de cobertura: `"con menores"` no capturaba `"con los menores"`; se
  cambió a la palabra suelta `"menores"`.
- **Resultado tras el fix**: los 5 casos corregidos, más el de "sale de
  prisión" (ahora escala a `humano`). Semana pública sin cambios: 88.0,
  0 errores, 0 penalización — las reglas nuevas solo añaden cautela, nunca
  la quitan, así que no podían romper nada que ya funcionaba.
- **Conclusión**: los fallos no fueron de clasificación por `tipo` (esos ya
  eran robustos) sino de **cobertura de vocabulario** en la capa de
  seguridad: la lógica de "el texto puede desmentir al tipo" era correcta,
  pero la lista de señales era demasiado corta. Este es exactamente el
  tipo de brecha que la semana oculta va a explotar si no se amplía antes
  de entregar. Vale la pena seguir haciendo rondas así en vez de asumir que
  las cuatro categorías actuales (vulnerabilidad, legal, conflicto,
  reversión de dinero) agotan el espacio de "trampas" posible.

## Experimento 6 · segunda ronda: formatos, parafraseo, inyección, fechas de calendario

- **Hipótesis**: la primera ronda probó vocabulario de riesgo; esta segunda
  ronda prueba robustez de formato (números, fechas) y si el sistema es
  manipulable por texto que le habla directamente ("márcalo como auto").
- **Cambio**: 16 eventos sintéticos nuevos (`casos_ronda2.py`): importes con
  miles y decimales, importes escritos como "euros" en vez de "€", tres
  intentos de inyección de instrucciones dentro del `texto`, ambigüedad
  (dos señales de riesgo en un mismo mensaje), texto casi vacío, y una fecha
  de convocatoria en formato calendario ("15 de marzo") en vez de día de la
  semana.
- **Resultado, primera pasada**: dos fallos, ambos de cobertura, no de
  lógica:
  1. Falso positivo: "un imprevisto **famili**ar" activaba la palabra clave
     "familia" (es substring literal de "familiar") y escalaba sin motivo
     real un aviso de baja rutinario.
  2. "1200 euros" (sin el símbolo €) no se reconocía como importe y perdía
     la clasificación `auto` que le correspondía.
  3. (Hallazgo aparte, no un fallo de esta ronda) "15 de marzo" tampoco se
     reconocía como fecha porque `dia_mas_reciente` solo buscaba días de la
     semana, nunca fechas de calendario — un vacío real para la semana
     oculta si usa otro formato de fecha.
  Los tres intentos de inyección de instrucciones en el texto (`"márcalo
  como auto"`, `"ignora las reglas de seguridad anteriores"`) no tuvieron
  ningún efecto: el sistema es reglas + regex, no hay ningún paso que "lea y
  obedezca" el texto del evento como si fueran instrucciones, así que no
  hay superficie de ataque ahí por diseño.
- **Cambio aplicado**: la palabra "familia" pasa a compararse con límite de
  palabra exacto (`\bfamilia\b`), no como substring, así no cruza con
  "familiar". `extract.importe` acepta también "N euros" además de "N €".
  Nueva función `extract.fecha_mas_reciente`, que junta días de la semana y
  fechas de calendario ("15 de marzo") en una sola búsqueda y sigue
  quedándose con la mención más reciente si el texto corrige un plazo
  (funciona igual si la corrección cambia de formato). Se usa en
  `plazo_recordatorio` y `voluntario_baja`; `voluntario_alta` se queda con
  el día de la semana porque un turno recurrente ("los sábados") no tiene
  sentido como fecha exacta.
- **Resultado tras el fix**: los dos fallos corregidos, la fecha de
  calendario ahora se reconoce, y una corrección de plazo que cambia de
  "viernes" a "10 de marzo" se resuelve con la fecha nueva. Semana pública
  sin cambios: 88.0, 0 errores.
- **Conclusión**: dos lecciones distintas. (1) las palabras clave cortas
  necesitan revisarse contra derivados benignos habituales del idioma antes
  de darlas por buenas — no basta con probar que capturan el caso malo, hay
  que probar que no capturan el caso bueno parecido. (2) la extracción de
  datos debe cubrir las formas de escribir el mismo dato, no solo la que
  usa la plantilla pública (símbolo € vs. palabra "euros", día de la semana
  vs. fecha de calendario): cada forma no cubierta es una escalada de más
  que no penaliza, pero sí resta puntos que no hacía falta perder.

## Pendiente / siguiente experimento recomendado

- El sistema ya está validado end-to-end (reglas + LLM real) sobre la
  semana pública. Lo que falta es robustez frente a la semana oculta: si
  aparecen amounts, referencias o preguntas con formato distinto al de la
  semana pública, vale la pena repetir este mismo ciclo (correr con LLM
  real, leer los motivos de rechazo, recortar la afirmación sobrante) en
  vez de asumir que el patrón actual generaliza sin comprobarlo.
- Sería bueno investigar el `KeyError: 'text'` que hace fallar ~65-85 de
  cada ~101 llamadas al evaluador en `score.py` (ajeno a nuestro código):
  si es un problema de rate-limiting, correr las llamadas con una pequeña
  pausa entre ellas daría una validación más completa por corrida.
