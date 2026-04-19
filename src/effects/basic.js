import { params } from '../state/params.js';

function applyBasicAdjustments(imageData, p = params) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    const fadeAmount = p.basicFade / 100;
    const cx = width  * (0.5 + p.basicFadeX / 100);
    const cy = height * (0.5 - p.basicFadeY / 100);
    const maxDist = Math.sqrt(Math.max(cx, width - cx) ** 2 + Math.max(cy, height - cy) ** 2);
    const fadeDist = Math.max(1, maxDist * (p.basicFadeRadius / 100));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r0 = data[i], g0 = data[i+1], b0 = data[i+2];

            const dx = x - cx;
            const dy = y - cy;
            const t = Math.sqrt(dx * dx + dy * dy) / fadeDist;
            const weight = p.basicFadeInvert
                ? Math.min(1, Math.max(0, 1 - fadeAmount * (1 - t)))
                : Math.max(0, 1 - fadeAmount * t);

            let r = r0, g = g0, b = b0;

            const lum = 0.299*r + 0.587*g + 0.114*b;
            const contrastFactor = (p.contrast + 100) / 100;
            const brightness = p.brightness;

            if (p.highlights !== 0) {
                const hf = p.highlights * (lum / 255) * 0.3;
                r += hf; g += hf; b += hf;
            }
            if (p.shadows !== 0) {
                const sf = p.shadows * ((255 - lum) / 255) * 0.3;
                r += sf; g += sf; b += sf;
            }

            r = r * contrastFactor + brightness;
            g = g * contrastFactor + brightness;
            b = b * contrastFactor + brightness;

            if (p.saturation !== 0) {
                const sat = 1 + p.saturation / 100;
                const gray = 0.299*r + 0.587*g + 0.114*b;
                r = gray + sat*(r - gray);
                g = gray + sat*(g - gray);
                b = gray + sat*(b - gray);
            }
            if (p.temperature !== 0) {
                const temp = p.temperature / 100;
                r += temp * 25;
                b -= temp * 25;
            }
            if (p.tint !== 0) {
                g += p.tint * 0.25;
            }

            data[i]   = Math.max(0, Math.min(255, r0 + (r - r0) * weight));
            data[i+1] = Math.max(0, Math.min(255, g0 + (g - g0) * weight));
            data[i+2] = Math.max(0, Math.min(255, b0 + (b - b0) * weight));
        }
    }
    return imageData;
}

export default {
    name: 'basic',
    label: 'Basic Adjustments',
    pass: 'pre-crt',
    params: {
        basicEnabled:  { default: false },
        brightness:    { default: 0, min: -100, max: 100 },
        contrast:      { default: 0, min: -100, max: 100 },
        saturation:    { default: 0, min: -100, max: 100 },
        highlights:    { default: 0, min: -100, max: 100 },
        shadows:       { default: 0, min: -100, max: 100 },
        temperature:   { default: 0, min: -100, max: 100 },
        tint:          { default: 0, min: -100, max: 100 },
        basicFade:           { default: 0,   min: 0,   max: 100 },
        basicFadeRadius:       { default: 100, min: 1,   max: 100 },
        basicFadeInvert:     { default: false },
        basicFadeX:         { default: 0,   min: -50, max: 50  },
        basicFadeY:         { default: 0,   min: -50, max: 50  },
    },
    enabled: (p) => p.basicEnabled &&
        (p.brightness!==0 || p.contrast!==0 || p.saturation!==0 ||
         p.highlights!==0 || p.shadows!==0 || p.temperature!==0 || p.tint!==0 ||
         p.basicFade!==0),
    canvas2d: applyBasicAdjustments, // (imageData, p?) → imageData
};
