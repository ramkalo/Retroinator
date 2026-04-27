export default {
    name:  'lineDrag',
    label: 'Line Drag',
    pass:  'pre-crt',

    handleParams: ['lineDragX', 'lineDragY', 'lineDragFadeX', 'lineDragFadeY',
                   'lineDragFadeW', 'lineDragFadeH', 'lineDragFadeAngle'],

    paramKeys: [
        'lineDragX', 'lineDragY', 'lineDragAngle', 'lineDragDir',
        'lineDragTarget', 'lineDragThreshold', 'lineDragThresholdReverse', 'lineDragThresholdOnDest',
        'lineDragFadeEnabled', 'lineDragFadeShape', 'lineDragFade', 'lineDragFadeW',
        'lineDragFadeH', 'lineDragFadeSlope', 'lineDragFadeInvert', 'lineDragFadeAngle',
        'lineDragFadeX', 'lineDragFadeY',
    ],

    params: {
        lineDragEnabled:          { default: false },
        lineDragX:                { default: 50, min: 0, max: 100 },
        lineDragY:                { default: 50, min: 0, max: 100 },
        lineDragAngle:            { default: 0, min: -89, max: 89, step: 1 },
        lineDragDir:              { default: 'down' },
        lineDragTarget:           { default: 'lum' },
        lineDragThreshold:        { default: 0, min: 0, max: 100 },
        lineDragThresholdReverse: { default: false },
        lineDragThresholdOnDest:  { default: false },
        lineDragFadeEnabled:      { default: false },
        lineDragFadeShape:        { default: 'ellipse' },
        lineDragFade:             { default: 20, min: 0, max: 100 },
        lineDragFadeW:            { default: 40, min: 1, max: 200 },
        lineDragFadeH:            { default: 40, min: 1, max: 200 },
        lineDragFadeSlope:        { default: 3, min: 0.1, max: 8, step: 0.1 },
        lineDragFadeInvert:       { default: true },
        lineDragFadeAngle:        { default: 0, min: -180, max: 180 },
        lineDragFadeX:            { default: 0, min: -50, max: 50 },
        lineDragFadeY:            { default: 0, min: -50, max: 50 },
    },

    uiGroups: [
        { keys: ['lineDragEnabled', 'lineDragAngle', 'lineDragDir'] },
        { label: 'Threshold', keys: ['lineDragTarget', 'lineDragThreshold',
                                      'lineDragThresholdReverse', 'lineDragThresholdOnDest'] },
        { label: 'Fade', keys: ['lineDragFadeEnabled', 'lineDragFadeShape', 'lineDragFade',
                                 'lineDragFadeSlope', 'lineDragFadeInvert'] },
    ],

    enabled: (p) => p.lineDragEnabled,

    bindUniforms: (gl, prog, p) => {
        const s = prog._locs;
        const si = (k, v) => { if (s[k] != null) gl.uniform1i(s[k], v); };
        si('lineDragDir',       { down: 0, up: 1, right: 2, left: 3 }[p.lineDragDir] ?? 0);
        si('lineDragTarget',    { lum: 0, r: 1, g: 2, b: 3 }[p.lineDragTarget] ?? 0);
        si('lineDragFadeShape', { ellipse: 0, rectangle: 1 }[p.lineDragFadeShape] ?? 0);
    },

    glsl: `
uniform float lineDragX;
uniform float lineDragY;
uniform float lineDragAngle;
uniform int   lineDragDir;

uniform int   lineDragTarget;
uniform float lineDragThreshold;
uniform int   lineDragThresholdReverse;
uniform int   lineDragThresholdOnDest;

uniform int   lineDragFadeEnabled;
uniform int   lineDragFadeShape;
uniform float lineDragFadeX;
uniform float lineDragFadeY;
uniform float lineDragFade;
uniform float lineDragFadeW;
uniform float lineDragFadeH;
uniform float lineDragFadeSlope;
uniform int   lineDragFadeInvert;
uniform float lineDragFadeAngle;

void main() {
    vec2 uv = vUV;

    // Anchor in UV space; negate slope because UV y=0 is bottom (screen y is flipped)
    float lineX = lineDragX / 100.0;
    float lineY = 1.0 - lineDragY / 100.0;
    float slope = -tan(lineDragAngle * 3.14159265 / 180.0);

    // Step 1-2: determine drag region and sample point
    vec2 sampleUV;
    bool inDragRegion;

    if (lineDragDir == 0 || lineDragDir == 1) {
        float sampleY = clamp(lineY + slope * (uv.x - lineX), 0.0, 1.0);
        bool  below   = uv.y < sampleY;
        inDragRegion  = (lineDragDir == 0) ? below : !below;
        sampleUV      = vec2(uv.x, sampleY);
    } else {
        if (abs(slope) < 0.001) {
            fragColor = texture(uTex, uv);
            return;
        }
        float sampleX = clamp(lineX + (uv.y - lineY) / slope, 0.0, 1.0);
        bool  rightOf = uv.x > sampleX;
        inDragRegion  = (lineDragDir == 2) ? rightOf : !rightOf;
        sampleUV      = vec2(sampleX, uv.y);
    }

    // Step 3: sample colors
    vec4 origColor    = texture(uTex, uv);
    vec4 sampledColor = texture(uTex, sampleUV);

    // Step 4: threshold check
    float thresh = lineDragThreshold / 100.0;
    vec4  checkColor = (lineDragThresholdOnDest == 1) ? origColor : sampledColor;
    float cr = checkColor.r, cg = checkColor.g, cb = checkColor.b;
    float lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
    float targetVal = (lineDragTarget == 1) ? cr
                    : (lineDragTarget == 2) ? cg
                    : (lineDragTarget == 3) ? cb
                    : lum;
    bool passThreshold = (lineDragThresholdReverse == 1) ? (targetVal <= thresh) : (targetVal >= thresh);
    vec4 effectColor = (inDragRegion && passThreshold) ? sampledColor : origColor;

    // Step 5: fade weight
    float weight = 1.0;
    if (lineDragFadeEnabled == 1) {
        float imgX = vUV.x * uResolution.x;
        float imgY = (1.0 - vUV.y) * uResolution.y;
        float fcx  = (0.5 + lineDragFadeX / 100.0) * uResolution.x;
        float fcy  = (0.5 - lineDragFadeY / 100.0) * uResolution.y;
        float dx   = imgX - fcx;
        float dy   = imgY - fcy;
        float rad  = lineDragFadeAngle * 3.14159265 / 180.0;
        float cosA = cos(rad), sinA = sin(rad);
        float rdx  =  dx * cosA + dy * sinA;
        float rdy  = -dx * sinA + dy * cosA;
        float hw   = max(1.0, (lineDragFadeW / 100.0) * uResolution.x / 2.0);
        float hh   = max(1.0, (lineDragFadeH / 100.0) * uResolution.y / 2.0);
        float t;
        if (lineDragFadeShape == 0) {
            t = sqrt(pow(rdx / hw, 2.0) + pow(rdy / hh, 2.0));
        } else {
            t = max(abs(rdx) / hw, abs(rdy) / hh);
        }
        float beyond  = max(0.0, t - 1.0);
        float fadeAmt = lineDragFade / 100.0;
        weight = (lineDragFadeInvert == 1)
            ? clamp(beyond * lineDragFadeSlope * fadeAmt, 0.0, 1.0)
            : clamp(1.0 - beyond * lineDragFadeSlope * fadeAmt, 0.0, 1.0);
    }

    // Step 6: output
    fragColor = mix(origColor, effectColor, weight);
}
`,
};
