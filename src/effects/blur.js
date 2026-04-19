import { params } from '../state/params.js';

function gaussianKernel(radius) {
    const sigma = Math.max(1, radius / 2);
    const size = 2 * radius + 1;
    const k = new Float32Array(size);
    let sum = 0;
    for (let i = 0; i < size; i++) {
        const x = i - radius;
        k[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
        sum += k[i];
    }
    for (let i = 0; i < size; i++) k[i] /= sum;
    return k;
}

function gaussianBlur(src, width, height, radius) {
    const k = gaussianKernel(radius);
    const tmp = new Float32Array(src.length);
    const out = new Uint8ClampedArray(src.length);

    // Horizontal pass: src → tmp
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0;
            for (let d = -radius; d <= radius; d++) {
                const sx = Math.max(0, Math.min(width - 1, x + d));
                const si = (y * width + sx) * 4;
                const w = k[d + radius];
                r += src[si]   * w;
                g += src[si+1] * w;
                b += src[si+2] * w;
            }
            const di = (y * width + x) * 4;
            tmp[di] = r; tmp[di+1] = g; tmp[di+2] = b;
        }
    }

    // Vertical pass: tmp → out
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0;
            for (let d = -radius; d <= radius; d++) {
                const sy = Math.max(0, Math.min(height - 1, y + d));
                const si = (sy * width + x) * 4;
                const w = k[d + radius];
                r += tmp[si]   * w;
                g += tmp[si+1] * w;
                b += tmp[si+2] * w;
            }
            const di = (y * width + x) * 4;
            out[di] = r; out[di+1] = g; out[di+2] = b; out[di+3] = src[di+3];
        }
    }

    return out;
}

function applyBlur(imageData, p = params) {
    const { data, width, height } = imageData;
    const radius = Math.round(p.blurRadius);
    if (radius < 1) return imageData;

    const blurLo = gaussianBlur(data, width, height, Math.max(1, Math.floor(radius / 2)));
    const blurHi = gaussianBlur(data, width, height, radius);

    const mode     = p.blurMode;
    const angleRad = (p.blurAngle ?? 0) * Math.PI / 180;
    const cosA     = Math.cos(angleRad);
    const sinA     = Math.sin(angleRad);
    const a        = (p.blurMajor / 100) * 0.7071;
    const b        = (p.blurMinor / 100) * 0.7071;
    const centerUX = 0.5 + p.blurCenterX / 100;
    const centerUY = 0.5 - p.blurCenterY / 100;
    const edgeStr  = p.blurEdge   / 100;
    const centerStr = p.blurCenter / 100;

    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            const dx = px / width  - centerUX;
            const dy = py / height - centerUY;
            const rx =  cosA * dx + sinA * dy;
            const ry = -sinA * dx + cosA * dy;

            const dist    = (mode === 'rectangle')
                ? Math.max(Math.abs(rx) / a, Math.abs(ry) / b)
                : Math.sqrt((rx / a) * (rx / a) + (ry / b) * (ry / b));
            const falloff = Math.pow(Math.min(dist, 1.0), 2);
            const weight  = falloff * edgeStr + (1 - falloff) * centerStr;
            if (weight <= 0) continue;

            const i = (py * width + px) * 4;
            // Interpolate between adjacent levels to avoid ghosting:
            // 0–0.5 → original→blurLo, 0.5–1 → blurLo→blurHi
            if (weight <= 0.5) {
                const t = weight * 2;
                data[i]   = data[i]   + (blurLo[i]   - data[i])   * t;
                data[i+1] = data[i+1] + (blurLo[i+1] - data[i+1]) * t;
                data[i+2] = data[i+2] + (blurLo[i+2] - data[i+2]) * t;
            } else {
                const t = (weight - 0.5) * 2;
                data[i]   = blurLo[i]   + (blurHi[i]   - blurLo[i])   * t;
                data[i+1] = blurLo[i+1] + (blurHi[i+1] - blurLo[i+1]) * t;
                data[i+2] = blurLo[i+2] + (blurHi[i+2] - blurLo[i+2]) * t;
            }
        }
    }

    return imageData;
}

export default {
    name:  'blur',
    label: 'Blur',
    pass:  'pre-crt',
    params: {
        blurEnabled: { default: false },
        blurMode:    { default: 'ellipse' },
        blurRadius:  { default: 8,   min: 1,   max: 50  },
        blurMajor:   { default: 100, min: 0,   max: 150 },
        blurMinor:   { default: 100, min: 0,   max: 150 },
        blurAngle:   { default: 0,   min: 0,   max: 180 },
        blurCenterX: { default: 0,   min: -50, max: 50  },
        blurCenterY: { default: 0,   min: -50, max: 50  },
        blurEdge:    { default: 100, min: 0,   max: 100 },
        blurCenter:  { default: 0,   min: 0,   max: 100 },
    },
    enabled:  (p) => p.blurEnabled,
    canvas2d: applyBlur,
};
