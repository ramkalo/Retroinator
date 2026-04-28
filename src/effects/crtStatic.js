export default {
    name: 'crtStatic',
    label: 'CRT Static',
    pass: 'post',
    paramKeys: ['crtStatic', 'crtStaticType', 'crtStaticGrain'],
    params: {
        crtStaticEnabled: { default: false },
        crtStatic:        { default: 0, min: 0, max: 100 },
        crtStaticType:    { default: 'white' },
        crtStaticGrain:   { default: 1, min: 1, max: 200 },
    },
    enabled: (p) => p.crtStaticEnabled,
    bindUniforms: (gl, prog, params) => {
        const loc = prog._locs['crtStaticType'];
        if (loc != null) gl.uniform1i(loc, { white: 0, color: 1, luma: 2, grey: 3, image: 4 }[params.crtStaticType] ?? 0);
    },
    glsl: `
uniform float crtStatic;
uniform int   crtStaticType;
uniform float crtStaticGrain;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
    vec4 c = texture(uTex, vUV);
    float intensity = crtStatic / 100.0;
    vec2 grainUV = floor(vUV * uResolution / max(crtStaticGrain, 1.0))
                 * max(crtStaticGrain, 1.0) / uResolution;
    float noise = (hash21(grainUV) - 0.5) * 255.0 * intensity;
    vec3 col = c.rgb * 255.0;
    if (crtStaticType == 0) { // white
        col = clamp(col + noise, 0.0, 255.0);
    } else if (crtStaticType == 1) { // color
        float nr = (hash21(grainUV + vec2(0.1)) - 0.5) * 255.0 * intensity;
        float ng = (hash21(grainUV + vec2(0.2)) - 0.5) * 255.0 * intensity;
        float nb = (hash21(grainUV + vec2(0.3)) - 0.5) * 255.0 * intensity;
        col = clamp(col + vec3(nr, ng, nb), 0.0, 255.0);
    } else if (crtStaticType == 2) { // luma
        float gray    = 0.299*col.r + 0.587*col.g + 0.114*col.b;
        float newGray = clamp(gray + noise, 0.0, 255.0);
        float ratio   = newGray / max(gray, 0.001);
        col = clamp(col * ratio, 0.0, 255.0);
    } else if (crtStaticType == 3) { // grey
        float greyVal = hash21(grainUV) * 255.0;
        col = mix(col, vec3(greyVal), intensity);
        col = clamp(col, 0.0, 255.0);
    } else { // image
        float nr = (hash21(grainUV + vec2(0.1)) - 0.5) * 2.0 * intensity;
        float ng = (hash21(grainUV + vec2(0.2)) - 0.5) * 2.0 * intensity;
        float nb = (hash21(grainUV + vec2(0.3)) - 0.5) * 2.0 * intensity;
        col = clamp(col * (1.0 + vec3(nr, ng, nb)), 0.0, 255.0);
    }
    fragColor = vec4(col / 255.0, c.a);
}
`,
};
