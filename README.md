# ZenonSynth

ZenonSynth es un instrumento audiovisual basado en la web que explora la paradoja de la dicotomía de Zenón a través de una simulación de convergencia asintótica combinada con un motor de síntesis modular. 

Al configurar *runners* (corredores) que intentan alcanzar un objetivo, cada iteración los acerca exponencialmente, creando dinámicas rítmicas, armónicas y visuales fascinantes que nunca terminan de resolverse.

## 🔗 Demo
[**¡Probá ZenonSynth acá!**](https://vlasvlasvlas.github.io/zenonsynth/)

---

## 💡 La Paradoja de Zenón (La Dicotomía)

**ZenonSynth** se fundamenta filosófica y matemáticamente en la **Paradoja de la Dicotomía** atribuida a Zenón de Elea (siglo V a.C.).

La paradoja establece que el movimiento es imposible porque, para que un objeto llegue de un punto A a un punto B, primero debe recorrer la mitad de la distancia que los separa. Una vez allí, debe recorrer la mitad de la distancia restante, luego la mitad de lo que queda, y así sucesivamente. Dado que el espacio puede dividirse infinitamente, el objeto debe realizar un número infinito de pasos, lo que implica que **nunca alcanzará su destino final**.

Matemáticamente, esto se representa como la serie infinita:
`1/2 + 1/4 + 1/8 + 1/16 + ... = 1`

### Traducción a Síntesis Audiovisual

En **ZenonSynth**, representamos esta idea con entidades llamadas *runners*. Cada paso que dan acorta la distancia hacia su destino a la mitad (o según el ratio exponencial que le configures). Esto genera un patrón de intervalos de tiempo cada vez más cortos, acelerando hacia el infinito sin nunca llegar realmente a detenerse (asíntota).

El motor de audio y el motor visual interpretan esta simulación en tiempo real:
- A medida que el *runner* se acerca, el intervalo de tiempo entre "pasos" se comprime, elevando la velocidad rítmica exponencialmente hasta llegar a rangos de audiofrecuencia (generando un glissando asintótico).
- La frecuencia del oscilador puede estar atada a la distancia restante, subiendo o bajando de tono asintóticamente.
- Múltiples runners corriendo a distintas velocidades y ratios de convergencia generan polirritmias irracionales extremadamente complejas.
- La interfaz visual pulsa y estalla (Convergence FX) a medida que la entidad queda atrapada en el límite infinitesimal.

## 🎛️ Características

- **Motor Físico Asintótico**: Corre la simulación en tiempo real, calculando la distancia y dibujando la iteración de Aquiles y la Tortuga.
- **Arquitectura Per-Runner**: Cada *runner* es una voz de síntesis independiente con su propia configuración de forma de onda (WAVE) y ganancia (GAIN).
- **Mod Matrix V1**: Una matriz de modulación de 4 slots. Permite asignar variables de la simulación (Remaining, Jump, Iteration) a propiedades del sintetizador (Filter Cutoff, Resonance, Detune, Gain, Delay, Reverb).
- **Envolventes ADSR**: Control total sobre el ataque, decaimiento, sostenido y relajación de cada salto.
- **Escalas Musicales**: Cuantización en tiempo real a 7 escalas musicales distintas y afinación de nota base (MIDI).
- **Reactividad Visual**: El sistema visual procesa el FFT y el RMS del motor de audio maestro para hacer vibrar la cuadrícula (*grid jitter*), generar *bloom* reactivo y emitir partículas.
- **Session Recorder**: Grabador integrado en el navegador para capturar video (WebM), audio, y exportar la data bruta (CSV).
- **URL State**: Todo el estado del sintetizador y la simulación se puede codificar en la URL para compartir *presets* con un simple click.

---

## ⌨️ Shortcuts y Controles

| Tecla | Acción |
|-------|--------|
| `Space` | Iniciar / Pausar simulación |
| `R` | Reiniciar simulación (reset) |
| `+` / `-` | Agregar / Quitar un Runner |
| `F` | Pantalla Completa |
| `M` | Mutear master |
| `[` / `]` | Cambiar trayectoria (Línea / Círculo / Espiral) |
| `1`, `2`, `3` | Cargar *Factory Presets* |
| `Ctrl+Z` | Undo (deshacer) |
| `Ctrl+Shift+Z` | Redo (rehacer) |
| `Ctrl+S` | Descargar el preset actual en `.json` |

## 🚀 Instalación y Desarrollo Local

ZenonSynth está construido sobre estándares web crudos (Vanilla JS, CSS) impulsados por `Vite` para el empaquetado (ESM modularizado).

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/vlasvlasvlas/zenonsynth.git
   cd zenonsynth
   ```
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   *El proyecto estará disponible en `http://localhost:3000`*.

4. Build para producción:
   ```bash
   npm run build
   ```
   *Los archivos compilados irán a la carpeta `/dist`*.

## 🛠️ Stack Tecnológico
- **Core**: Vanilla JavaScript (ESM) + HTML5 + CSS3 (arquitectura *brutalist* y *glassmorphism*).
- **Audio Engine**: `Web Audio API` (Oscillators, BiquadFilters, AnalyserNode, DelayNode, ConvolverNode simulado).
- **Visual Engine**: `HTML5 Canvas 2D` API.
- **Build Tool**: Vite.

---
*Desarrollado como instrumento de performance.*
