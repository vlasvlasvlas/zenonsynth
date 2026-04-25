# ZenonSynth - Fase 0 (Contrato Tecnico)

Fecha: 2026-04-24  
Estado: Aprobado para implementar Fase 1  
Objetivo: pasar de demo conceptual a instrumento audiovisual modular (synth + simulacion multi-corredor + trayectorias no lineales), manteniendo estetica retro computadora 60s/70s y despliegue en GitHub Pages.

## 1) Alcance congelado de producto (V1)

V1 incluye:
- Motor de simulacion desacoplado del render y del audio.
- Multiples corredores (`Runner`) con voces sonoras independientes.
- Trayectorias: `line`, `circle`, `spiral`.
- Motor de sintesis modular tocable (osciladores, filtros, LFO, ADSR, matriz de modulacion, reverb, delay).
- Interfaz tipo instrumento retro con paneles fijos.
- Presets serializables JSON.

V1 no incluye:
- Backend.
- Colaboracion en red.
- Plugins externos VST/AU.
- Grabacion multitrack offline avanzada.

## 2) Restricciones tecnicas

- Runtime: navegador moderno, 100% client-side.
- Deploy: GitHub Pages (assets estaticos).
- Audio: Web Audio API.
- Render: Canvas2D (base V1); WebGL opcional luego.
- Lenguaje: JavaScript modular (ESM), sin depender de build step obligatorio.
- Performance objetivo desktop:
  - 60 FPS visual estable.
  - Audio glitch-free con buffer interactivo.
  - 8 a 16 voces simultaneas (dependiendo del dispositivo).

## 3) Arquitectura objetivo

Separacion estricta por modulos:

1. `SimCore`
- Actualiza estado matematico de corredores.
- Emite eventos discretos de convergencia (`onStep`, `onNearTarget`, `onCycle`).
- No conoce UI ni Web Audio.

2. `AudioEngine`
- Gestiona grafo WebAudio.
- Gestiona voces por corredor.
- Consume eventos de `SimCore` y parametros de UI.
- Exporta metering para UI (niveles, clipping, voice count).

3. `Renderer`
- Dibuja escena principal, grilla infinita, trails, mapa global y gauge de profundidad.
- Consume estado de `SimCore`, no toca audio.

4. `UIController`
- Paneles de control (Synth, Mod, Corredores, Escena).
- Binding 2-way con `AudioEngine` y `SimCore`.
- Carga/guarda presets.

5. `PresetStore`
- Validacion y serializacion de presets con schema versionado.

## 4) Modelo de dominio

## 4.1 Runner

```js
{
  id: "runner_aq",
  name: "AQUILES",
  enabled: true,
  color: "#ffb347",
  pursuit: {
    mode: "fractional",          // fractional | fixed_step | exponential
    ratio: 0.5,                  // usado en fractional
    fixedStep: 0.01,             // usado en fixed_step
    expLambda: 2.0               // usado en exponential
  },
  path: {
    type: "line",                // line | circle | spiral
    params: { ... }              // ver 4.2
  },
  targetRef: "runner_tortuga",   // id de target o "anchor:goal_1"
  voiceRef: "voice_aq",
  historySize: 320
}
```

## 4.2 Path

### `line`
```js
{
  type: "line",
  params: {
    x0: 0.1, y0: 0.5,
    x1: 0.9, y1: 0.5
  }
}
```

### `circle`
```js
{
  type: "circle",
  params: {
    cx: 0.5, cy: 0.5,
    radius: 0.35,
    startAngle: 0,
    clockwise: true
  }
}
```

### `spiral`
```js
{
  type: "spiral",
  params: {
    cx: 0.5, cy: 0.5,
    a: 0.01,          // radio base
    b: 0.08,          // crecimiento/decrecimiento por vuelta
    theta0: 0,
    inward: true
  }
}
```

## 4.3 Eventos de simulacion (contrato con audio)

Evento minimo por paso:

```js
{
  type: "runner_step",
  runnerId: "runner_aq",
  iteration: 37,
  t: 123.45,                 // tiempo de simulacion en segundos
  remainingNorm: 7.27e-12,   // distancia normalizada restante
  jumpNorm: 7.27e-12,        // salto normalizado del paso
  worldPos: { x: 0.82, y: 0.5 },
  pathPhase: 0.9999999999
}
```

## 5) Contrato de AudioEngine (Synth modular)

## 5.1 Limites operativos V1

- `maxVoices`: 16 (desktop target), 8 fallback.
- `maxOscPerVoice`: 6.
- `maxLfo`: 4 globales + 2 por voz.
- Efectos en bus master (no insert por voz en V1).

## 5.2 VoiceSpec (por corredor)

```js
{
  id: "voice_aq",
  enabled: true,
  gain: 0.8,
  pan: 0.0,
  oscillators: [
    { wave: "square", gain: 0.5, detuneCents: 0, octave: 0, phase: 0 },
    { wave: "saw",    gain: 0.3, detuneCents: 7, octave: -1, phase: 0 }
  ],
  noise: { enabled: false, color: "white", gain: 0.0 },
  ampEnv: { attack: 0.003, decay: 0.08, sustain: 0.2, release: 0.1, curve: "exp" },
  filter: {
    routing: "hp_lp",       // hp_lp | lp_hp | bp
    lowpass: { cutoffHz: 2200, q: 0.8 },
    highpass: { cutoffHz: 120, q: 0.7 },
    bandpass: { cutoffHz: 900, q: 2.0 }
  },
  lfos: [
    { id: "lfo1", wave: "sine", rateHz: 1.8, depth: 0.4, phase: 0, sync: false }
  ]
}
```

## 5.3 Mod Matrix

Sources:
- `lfo1..lfo6`
- `env_amp`
- `runner_remaining_norm`
- `runner_jump_norm`
- `runner_iteration_norm`
- `runner_speed_norm`

Destinations:
- `osc[n].detune`
- `osc[n].gain`
- `filter.lowpass.cutoffHz`
- `filter.lowpass.q`
- `filter.highpass.cutoffHz`
- `amp.gain`
- `pan`
- `delay.mix`
- `reverb.mix`

Slot:

```js
{
  id: "mod_1",
  enabled: true,
  source: "runner_remaining_norm",
  destination: "filter.lowpass.cutoffHz",
  amount: 0.65,
  bipolar: false,
  transform: "exp"     // linear | exp | log | step
}
```

## 5.4 FX Rack master

```js
{
  saturation: { enabled: true, drive: 0.18, mix: 0.25 },
  delay: { enabled: true, timeMs: 220, feedback: 0.32, mix: 0.24, highCutHz: 3600 },
  reverb: { enabled: true, preDelayMs: 18, decaySec: 1.7, dampHz: 4200, mix: 0.18 },
  limiter: { enabled: true, thresholdDb: -0.7, releaseSec: 0.08 }
}
```

## 6) Interfaz retro (wireframe contractual)

Distribucion fija en desktop:

```text
+----------------------------------------------------------------------------------+
| HEADER: ZENON SYNTH / tempo-convergencia / preset / transport                   |
+-------------------------------------+--------------------------------------------+
| ESCENA + HUD                        | SYNTH                                      |
| - canvas principal                  | - osciladores (N ondas)                    |
| - mapa global                       | - ADSR                                     |
| - gauge infinito n / 2^n            | - filtros LP/HP/BP cutoff/res             |
| - trayectoria activa                | - LFO                                      |
+-------------------------------------+--------------------------------------------+
| CORREDORES                          | MOD + FX                                   |
| - alta/baja de runner               | - matriz de modulacion                     |
| - target                            | - delay / reverb / sat                     |
| - color / voiceRef                  | - macros en vivo                           |
| - ratio y path params               |                                            |
+----------------------------------------------------------------------------------+
```

Mobile:
- Tabs horizontales: `Escena`, `Synth`, `Runners`, `Mod/FX`.
- Mantener HUD minimo siempre visible (paso, zoom, rem exacta).

## 7) Contrato de UX funcional

- Cada corredor visible debe tener su pista de movimiento (trail) y metrica.
- El usuario debe poder:
  - Crear/eliminar corredor.
  - Elegir trayectoria por corredor (`line/circle/spiral`).
  - Asignar voz y editarla.
  - Editar filtros y LFO en vivo sin reiniciar simulacion.
  - Activar/desactivar efectos individualmente.
- Cambio de preset no debe bloquear render > 100ms.

## 8) Plan de fases ejecutables

## Fase 1 (Audio Engine V2)
- Implementar `AudioEngine` modular con `VoiceSpec`, filtros, ADSR, LFO, delay/reverb.
- Integrar evento `runner_step` al disparo sonoro.
- DoD:
  - 3 voces concurrentes estables.
  - Controles de cutoff/resonance/LFO/delay/reverb funcionales.
  - Sin clipping audible sostenido con limiter activo.

## Fase 2 (SimCore multi-runner)
- Extraer logica actual a `SimCore`.
- Soportar N runners, targets dinamicos y reglas de convergencia.
- DoD:
  - Minimo 4 corredores simultaneos.
  - Cada uno con `ratio` propio y trail propio.

## Fase 3 (Trayectorias no lineales)
- Implementar `circle` y `spiral`.
- Mantener zoom/referencias claras de infinito.
- DoD:
  - Switch de trayectoria en vivo sin romper audio.
  - Mapa global coherente para las 3 trayectorias.

## Fase 4 (UI final instrumento)
- Rediseño panelado completo con controles estilo hardware retro.
- Presets factory y macros de performance.
- DoD:
  - Flujo completo sin abrir consola.
  - Guardar/cargar presets JSON validos.

## Fase 5 (Hardening GitHub Pages)
- Perfilado de CPU/audio.
- Fallback de calidad para equipos lentos.
- Documentacion de uso.
- DoD:
  - Demo publica estable en GitHub Pages.

## 9) Riesgos y mitigacion

- Riesgo: demasiadas voces/osciladores saturan CPU.
  - Mitigacion: limites por preset y modo `eco`.
- Riesgo: clicks por cambios bruscos de parametros.
  - Mitigacion: `setTargetAtTime` / ramps en todos los parametros de audio.
- Riesgo: UI demasiado compleja.
  - Mitigacion: macros principales visibles + panel avanzado colapsable.

## 10) Criterio de aceptacion de Fase 0

Fase 0 se considera cerrada cuando:
- El contrato tecnico y de datos esta versionado.
- El schema de preset valida estructura minima.
- Las fases 1-5 tienen DoD claro y medible.

Resultado: cumplido con este documento + `docs/preset.schema.json`.
