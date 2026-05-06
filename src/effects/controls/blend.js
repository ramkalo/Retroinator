const BLEND_MODES = [
    ['screen',     'Screen'],
    ['multiply',   'Multiply'],
    ['add',        'Add'],
    ['overlay',    'Overlay'],
    ['difference', 'Difference'],
    ['normal',     'Normal'],
];

const BLEND_MAP = { normal: 0, screen: 1, multiply: 2, add: 3, overlay: 4, difference: 5 };

const BLEND_GLSL = `
uniform int   __P__BlendMode;
uniform float __P__Opacity;

float __P__BlendCh(float a, float b) {
    if      (__P__BlendMode == 1) return 1.0 - (1.0-a)*(1.0-b);
    else if (__P__BlendMode == 2) return a * b;
    else if (__P__BlendMode == 3) return min(1.0, a + b);
    else if (__P__BlendMode == 4) return a < 0.5 ? 2.0*a*b : 1.0 - 2.0*(1.0-a)*(1.0-b);
    else if (__P__BlendMode == 5) return abs(a - b);
    return a;
}

vec3 __P__Blend(vec3 base, vec3 src) {
    vec3 blended = vec3(
        __P__BlendCh(base.r, src.r),
        __P__BlendCh(base.g, src.g),
        __P__BlendCh(base.b, src.b)
    );
    return mix(base, blended, __P__Opacity / 100.0);
}
`;

export function buildBlendControl(prefix, defaults = {}) {
    const p    = prefix;
    const glsl = BLEND_GLSL.replaceAll('__P__', p);

    return {
        glsl,
        blendFn:   `${p}Blend`,
        blendChFn: `${p}BlendCh`,
        params: {
            [`${p}BlendMode`]: { default: defaults.mode    ?? 'screen', options: BLEND_MODES, label: 'Blend Mode' },
            [`${p}Opacity`]:   { default: defaults.opacity ?? 100, min: 0, max: 100,           label: 'Opacity' },
        },
        paramKeys: [`${p}Opacity`],
        uiGroup: {
            keys: [`${p}BlendMode`, `${p}Opacity`],
        },
        bindUniforms(gl, prog, params) {
            const loc = prog._locs[`${p}BlendMode`];
            if (loc != null) gl.uniform1i(loc, BLEND_MAP[params[`${p}BlendMode`]] ?? 1);
        },
    };
}
