# BXTRXT

Browser-based retro photo effects editor. Apply composable VHS, CRT, and analog effects to images with GPU-accelerated real-time rendering.

## Features

- Load images via file upload or drag-and-drop
- 22 composable effects in an ordered stack — add the same effect multiple times with independent params
- Live preview with real-time parameter controls (sliders, color pickers, toggles)
- Undo/redo up to 50 steps
- Double-exposure blend with a second image (7 blend modes)
- Save and load effect presets as JSON
- Export as PNG or JPG with timestamped filename
- Installable PWA with offline support
- Mobile-friendly with touch gesture support (Capacitor wrapper for iOS/Android)

## Effects

| Group | Effects |
|---|---|
| Adjustments | Basic (brightness, contrast, saturation, temperature, tint, fade mask) |
| Geometry | Transform (flip/rotate), Crop, Viewport |
| Blur & Light | Blur, Glow, Vignette |
| Color | Invert, Channel Saturation |
| Texture & Noise | Grain, Digitize (pixelate/dither/quantize) |
| Distortion | Chroma (RGB split), Waves, Digital Smear, Corrupted |
| VHS / CRT | VHS Glitch, VHS Timestamp, CRT Curvature, CRT Scanlines, CRT Static |
| Overlays | Matrix Rain, Black Box, Double Exposure |

## Getting Started

```bash
npm install
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+O` | Open image |
| `Ctrl+E` | Export |
| `Ctrl+S` | Save preset |
| `Ctrl+Shift+S` | Load preset |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |

## Architecture

All image processing runs on the GPU via WebGL2 fragment shaders. Effects are processed in stack order using double-buffered ping-pong framebuffers. Canvas 2D is used only for overlays (matrix rain, VHS timestamp, black box).

```
src/
├── main.js                  # Entry point, event wiring
├── effects/
│   ├── registry.js          # Master effect list and catalog
│   └── *.js                 # 22 effect modules (GLSL shader + param schema)
├── renderer/
│   ├── webgl.js             # GPU rendering engine, shader compilation, FBOs
│   ├── pipeline.js          # Debounced render trigger
│   └── glstate.js           # WebGL context and texture management
├── state/
│   ├── params.js            # Reactive global params (Proxy-based)
│   ├── effectStack.js       # Effect stack CRUD
│   └── undo.js              # Undo/redo (50-step buffer)
└── ui/
    ├── stackPanel.js        # Effect picker and stack list
    ├── stackControls.js     # Auto-generated parameter controls
    ├── canvasPicker.js      # Spatial overlay editing (crop, blur zone, etc.)
    ├── presets.js           # Preset save/load/import/export
    └── export.js            # PNG/JPG export
```

To add a new effect: create `src/effects/myEffect.js` and register it in `src/effects/registry.js`.

## Tech Stack

- Vanilla JavaScript (ES modules) — no framework
- WebGL2 (GLSL 300 ES)
- Vite + Vite PWA plugin
- Capacitor (iOS/Android native wrapper)
