const THRESHOLD_GLSL = `
uniform float __P__Threshold;
uniform int   __P__ThresholdTarget;
uniform int   __P__ThresholdReverse;

bool __FN__(vec4 color) {
    float val;
    if      (__P__ThresholdTarget == 1) val = color.r;
    else if (__P__ThresholdTarget == 2) val = color.g;
    else if (__P__ThresholdTarget == 3) val = color.b;
    else                                val = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float thresh = __P__Threshold / 100.0;
    return (__P__ThresholdReverse == 1) ? (val <= thresh) : (val >= thresh);
}
`;

export function buildThresholdControl(prefix, defaults = {}) {
    const p   = prefix;
    const cap = p.charAt(0).toUpperCase() + p.slice(1);
    const fn  = `calc${cap}ThresholdMet`;
    const glsl = THRESHOLD_GLSL.replaceAll('__P__', p).replaceAll('__FN__', fn);

    return {
        glsl,
        fnName: fn,
        params: {
            [`${p}Threshold`]:        { default: defaults.threshold ?? 0, min: 0, max: 100, label: 'Threshold' },
            [`${p}ThresholdTarget`]:  { default: 'lum', options: [['lum', 'Luminance'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']], label: 'Target' },
            [`${p}ThresholdReverse`]: { default: false, label: 'Reverse Threshold' },
        },
        paramKeys: [`${p}Threshold`, `${p}ThresholdTarget`, `${p}ThresholdReverse`],
        uiGroup: {
            label: 'Threshold',
            keys: [`${p}Threshold`, `${p}ThresholdTarget`, `${p}ThresholdReverse`],
        },
        bindUniforms(gl, prog, params) {
            const loc = prog._locs[`${p}ThresholdTarget`];
            if (loc != null) gl.uniform1i(loc, { lum: 0, r: 1, g: 2, b: 3 }[params[`${p}ThresholdTarget`]] ?? 0);
        },
    };
}
