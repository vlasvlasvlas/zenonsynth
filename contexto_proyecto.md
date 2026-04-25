# Contexto Proyecto - ZenonSynth

## 1. Resumen Ejecutivo

Este proyecto evoluciono desde una demo minima de la paradoja de Zenon (Aquiles y la tortuga) hacia un instrumento audiovisual web ejecutable en GitHub Pages.

Hoy el estado del proyecto es:

- Simulador multi-runner con convergencia asintotica.
- Trayectorias no lineales (`line`, `circle`, `spiral`).
- Motor de audio modular (Web Audio API) con controles de sintesis y FX.
- UI retro estilo computadora vieja con paneles acordeon.
- Control por runner de velocidad, direccion (forward/reverse), color del punto y color de traza.
- Escala fisica configurable en kilometros para medir distancia real del recorrido.
- Presets de fabrica + guardar/cargar preset JSON.

## 2. Estado del Repositorio

Archivos principales:

- `index.html`: estructura de paneles, controles y canvas.
- `styles.css`: estetica retro, layout, acordeones, controles.
- `app.js`: simulacion, render, audio, presets e integracion UI.

Documentacion tecnica previa:

- `docs/phase-0-technical-spec.md`: contrato de fase 0.
- `docs/preset.schema.json`: schema inicial de preset.

Archivo de contexto actual:

- `contexto_proyecto.md` (este archivo).

## 3. Cronologia de Decisiones (Sesion)

### 3.1 Inicio (repo vacio)

- Se detecto repo vacio.
- Se construyo una demo inicial con 3 archivos:
  - `index.html`
  - `styles.css`
  - `app.js`
- Primer objetivo: escena lineal de convergencia + audio retro basico.

### 3.2 Zoom infinito real

- Se reemplazo camara de simple desplazamiento por ventana de mundo (`viewSpan`) que se achica con cada paso.
- Se paso de transformacion aproximada a mapeo mundo->pantalla.

### 3.3 Grilla y sensacion de infinito

- Se cambio grilla fija en pixels por grilla en coordenadas de mundo.
- Se agrego sistema por niveles para que al aumentar zoom aparezcan subniveles.
- Luego se ajusto para quitar movimiento artificial del piso y dejar solo acercamiento real por camara.

### 3.4 Decimales exactos

- Se detecto problema de truncamiento (`0.000...`).
- Se incorporo representacion exacta para caso `1/2^n` usando BigInt (`5^n / 10^n`).
- Se agrego ventana dedicada de lectura larga (`decimal-window`) para no cortar precision.

### 3.5 Replanteo de producto (comite y fases)

- Se formalizo enfoque de instrumento audiovisual, no solo demo didactica.
- Se definieron fases 0-5.
- Se genero documentacion de contrato tecnico y schema de preset.

### 3.6 Fase 1 (audio engine modular)

- Se sustituyo motor de beeps por `ModularAudioEngine`.
- Se agregaron controles synth/FX en UI.
- Se habilito multi-voice y modulacion basica en vivo.

### 3.7 Fases 2-5 integradas

- Se implemento `SimCore` multi-runner.
- Se implementaron trayectorias `line`, `circle`, `spiral`.
- Se redisenio UI completa tipo instrumento con paneles dedicados.
- Se agregaron presets factory y carga/descarga JSON.
- Se agregaron modos de calidad (`eco`, `normal`, `high`).

### 3.8 Acordeones y ergonomia

- Se paso a paneles `details/summary` para colapsar/expandir.
- Se permitio minimizar la escena y el sintetizador.

### 3.9 Curvatura de trayectoria circular

- Se ajusto trayectoria circular a semicircunferencia pronunciada (180 grados reales).

### 3.10 Controles por runner y faro

- Se agrego velocidad individual por runner (`speedMul`).
- Se agrego direccion por runner (`FWD/REV`).
- Se agrego faro/beam visual por runner orientado por direccion.
- Se ajusto camara para usar objetivo segun direccion del runner lider.

### 3.11 Escala real en kilometros

- Se agrego control `MEDIDA REAL (KM)`.
- Se implemento metrica de longitud de arco por trayectoria (no distancia lineal simple) para convertir a km de forma coherente.
- HUD y ventana decimal muestran `REM_KM` y `DELTA_KM`.
- Escala en km se serializa en presets.

### 3.12 Colores de traza y punto por runner

- Se separo color del punto (`DOT`) y color de linea (`LINE`).
- Se eliminaron defaults dorados de runners para diferenciar fondo vs entidades.

## 4. Arquitectura Actual

## 4.1 Modulos en runtime

### `SimCore`
Responsable de:

- Estado de runners.
- Reglas de convergencia temporal y espacial.
- Generacion de eventos `runner_step` para audio.
- Calculo de metrica en km usando longitud de arco de la trayectoria.

Funciones clave:

- `setPathType`, `setSpeed`, `setQuality`, `setRealLengthKm`
- `addRunner`, `removeRunner`, `updateRunner`, `resetRunner`, `resetAll`
- `step(now)`
- `serializeRunners`, `loadRunners`

### `ModularAudioEngine`
Responsable de:

- Construccion del grafo Web Audio.
- Disparo de voces por evento de simulacion.
- Filtros, LFO, saturacion, delay, reverb, compresion y master.
- Parametros leidos desde UI y actualizados en tiempo real.

### `Renderer`
Responsable de:

- Malla/grilla de fondo en mundo (sin drift artificial).
- Dibujo de trayectoria, trails, runners, goal.
- Faro por runner orientado por direccion.
- Mini mapa global y gauge de profundidad.
- Camara de seguimiento con lock progresivo al objetivo.

## 4.2 Flujo de datos por frame

1. `requestAnimationFrame` llama `animate(now)`.
2. `SimCore.step(now)` produce `events` de runners que avanzaron.
3. `AudioEngine.consumeEvents(events)` sintetiza audio.
4. `Renderer.draw()` renderiza estado visual.
5. `updateReadout()` actualiza HUD y decimal window.

## 5. Modelo de Runner (actual)

Cada runner contiene:

- Identidad y visual:
  - `id`, `name`, `enabled`
  - `color` (punto/faro)
  - `trailColor` (linea)
- Movimiento:
  - `ratio` (fraccion de avance por paso)
  - `startS` (posicion inicial normalizada)
  - `direction` (`1` forward, `-1` reverse)
  - `targetS` (0 o 1 segun direccion)
  - `speedMul` (0..2)
- Audio:
  - `voiceIndex` (A/B/C)
- Estado dinamico:
  - `s`, `iteration`, `lastStepAt`
  - `startGap`, `remainingNorm`, `lastJumpNorm`
  - `remainingKm`, `lastJumpKm`
  - `history`
- Exactitud decimal (caso especial):
  - `exactHalf`, `pow5`, `remainingExact`

## 6. Matematica de Simulacion

## 6.1 Avance por paso

Por runner:

- `s_next = s + (targetS - s) * ratio`

Con:

- `ratio in [0.05, 0.95]`
- `targetS in {0,1}` segun direccion.

## 6.2 Tiempo entre pasos

- Base global: `baseIntervalMs * intervalShrink^iteration`
- Ajuste por velocidad global y runner:
  - `effectiveSpeed = speedGlobal * speedMul`
  - `interval = formula / effectiveSpeed`

Si `speedMul = 0`, el runner se frena.

## 6.3 Distancia real y km

Se precalcula una tabla de longitud de arco para la trayectoria activa (`arcLengthTable`, 1024 muestras).

- `distanceAlongPath(a,b) = |L(b)-L(a)|`
- `pathDistanceToKm(d) = (d / pathTotalLength) * realLengthKm`

Esto evita errores conceptuales en curva/espiral (no usa distancia euclidea directa para medir km de recorrido).

## 6.4 Caso exacto 1/2^n

Solo se considera exactitud decimal completa cuando:

- `direction = FWD`
- `ratio = 0.5`
- `startS = 0`

En ese caso:

- `remainingExact = 5^n / 10^n` con BigInt.

## 7. Trayectorias Implementadas

## 7.1 `line`

- Parametrizacion recta de izquierda a derecha.

## 7.2 `circle`

- Arco de 180 grados (semicircunferencia pronunciada), pedido explicitamente por usuario.

## 7.3 `spiral`

- Trayectoria espiral con radio decreciente para efecto de convergencia visual.

## 8. Camara, Piso y Sensacion de Infinito

Decisiones clave:

- El piso (malla) esta anclado al mundo, no se desplaza aleatoriamente.
- La sensacion de acercamiento viene de zoom/camara real.
- Se usa `cameraAnchor` con blend entre runner lider y su objetivo segun `lockToGoal`.
- `span` visual se reduce asintoticamente con `remainingNorm`.

Malla de fondo:

- Lineas por niveles (`step = base / 2^level`).
- Puntos de malla sobre niveles visibles para sensacion de profundidad.
- Color de fondo separado del color de runners.

## 9. Faro / Iluminacion Runner

Cada runner dibuja:

- Glow radial alrededor del punto.
- Haz/cono direccional (`beam`) orientado por tangente local de movimiento.

Direccion del haz:

- Se calcula con `aheadS = s + 0.02 * direction`.
- Si `direction = REV`, el haz se invierte.

## 10. Audio Engine - Decisiones Tecnicas

Grafo actual (resumen):

- `inputBus`
- `highpass -> lowpass`
- saturacion (`WaveShaper`)
- rama dry
- rama delay (send, delay, feedback, tone, wet)
- rama reverb (convolver)
- compresor
- master

Modulacion:

- LFO conectado a frecuencia de LP.
- Fuente de mod seleccionable (`remaining/jump/iteration/none`) aplicada al cutoff.

Voces:

- 3 voces (A/B/C), seleccionables por runner.
- Capas de oscilador (`oscLayers`) con detune/spread.
- Soporte de ruido por voz.

## 11. UI / UX y Controles

## 11.1 Paneles acordeon

Paneles colapsables:

- Escena/vector movimiento
- Transporte/escena
- Synth/mod/fx
- Corredores
- Presets

## 11.2 Transporte y escena

- `INICIAR`, `PAUSAR`, `REINICIAR`
- `+ RUNNER`, `- RUNNER`
- `VELOCIDAD` global
- `TRAYECTORIA`
- `CALIDAD`
- `MEDIDA REAL (KM)`

## 11.3 Runner card

Por runner:

- `ON`
- `DOT` color
- `LINE` color
- `RATIO`
- `START S`
- `SPEED`
- `VOICE`
- `DIR` (`FWD/REV`)

## 11.4 Synth

Incluye:

- modo de filtro
- cutoff/resonance
- lfo rate/depth
- mod source/amount
- layers y waves A/B/C
- delay/reverb/master
- enable por voice A/B/C

## 11.5 Lecturas

- HUD principal (`readout`): estado corto con runner lider.
- `decimal-window`: lectura larga con precision y datos extendidos.

## 12. Presets

Soporte:

- 3 presets factory:
  - `zenon_dry`
  - `infinite_drone`
  - `pursuit_percussive`
- Guardar preset a JSON.
- Cargar preset desde JSON.

Persistencia de preset incluye:

- `scene`: trayectoria, velocidad, calidad, escala km.
- `synth`: parametros audio + voices on/wave.
- `runners`: lista serializada con color/trailColor/ratio/startS/speedMul/direction/voice.

## 13. Decisiones Visuales de Color

- Fondo usa paleta fosforo dorado para malla e interfaz retro.
- Runners usan paleta separada (blanco/cian/magenta/verde/rojo/azul suave) para no confundirse con fondo.
- Color de traza independiente de color de punto/faro.

## 14. Rendimiento y Calidad

`QUALITY`:

- `eco`: menos niveles de grilla/trails/eventos audio.
- `normal`: balanceado.
- `high`: mayor densidad visual y eventos.

Controles de performance:

- Limite de eventos de audio por frame segun calidad.
- Recorte de historial por runner.
- Render de puntos de malla solo en rango util de escala de pixel.

## 15. Validaciones Ejecutadas en la Sesion

Se corrio repetidamente:

- `node --check app.js` (syntax OK)

Servidor local utilizado para prueba manual:

- `python3 -m http.server 8000`
- URL: `http://localhost:8000`

## 16. Limitaciones Actuales / Riesgos

- No hay test automatizados (unit/integration).
- No hay schema runtime estricto para presets cargados (se parsea JSON sin validacion completa contra schema).
- La representacion decimal exacta completa esta optimizada para caso especial `ratio=0.5` forward desde 0.
- Audio puede exigir CPU en modo `high` con muchos runners activos y capas altas.

## 17. Proximos Pasos Recomendados

1. Validar presets cargados contra `docs/preset.schema.json` antes de aplicar.
2. Agregar modo `ping-pong` por runner (rebote automatico al llegar a target).
3. Agregar control de orden de render/prioridad por runner.
4. Exportar snapshot/registro de sesion de corrida (CSV/JSON).
5. Incorporar tests de regresion para:
   - conversion km por trayectoria
   - direccion reverse + orientacion faro
   - serializacion/deserializacion de presets

## 18. Relacion con Documentacion Fase 0

`docs/phase-0-technical-spec.md` definio la arquitectura objetivo. El estado actual implementa esa direccion de manera pragmatica en un unico `app.js` con separacion por clases (`SimCore`, `ModularAudioEngine`, `Renderer`).

`docs/preset.schema.json` sigue siendo referencia importante; falta cerrar validacion estricta en runtime para convergencia total entre schema y loader.

## 19. Conclusiones

El proyecto ya no es una demo minima: funciona como instrumento audiovisual interactivo, con simulacion multi-runner, control sonoro extenso, escala fisica en km, direccion reversible, faros por entidad, y UX retro modular.

La base es funcional para seguir en refinamiento (tests, validacion schema, nuevos modos de movimiento y performabilidad fina), sin necesidad de rehacer arquitectura.
