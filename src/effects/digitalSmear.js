import { buildFadeControl, buildBlendControl } from './controls/index.js';

const fade  = buildFadeControl('digitalSmear');
const blend = buildBlendControl('digitalSmear');

const NODE_SLOTS = 24;
const nodeParamKeys = Array.from({ length: NODE_SLOTS }, (_, i) => [`smearNx${i}`, `smearNy${i}`]).flat();
const nodeParamDefs = Object.fromEntries(
    Array.from({ length: NODE_SLOTS }, (_, i) => [
        [`smearNx${i}`, { default: 0, min: 0, max: 100 }],
        [`smearNy${i}`, { default: 0, min: 0, max: 100 }],
    ]).flat()
);

export default {
    name:  'digital-smear',
    label: 'Digital Smear',
    pass:  'pre-crt',
    paramKeys: [
        'smearMode',
        'smearRadius', 'smearNodeMode', 'smearRandomCount',
        'smearLinearDx', 'smearLinearDy', 'smearRotAngle', 'smearRadialAmt',
        ...fade.paramKeys, ...blend.paramKeys,
    ],
    handleParams: [
        'smearCenterX', 'smearCenterY', 'smearNodeCount',
        ...nodeParamKeys,
        ...fade.handleParams,
    ],
    uiGroups: (p) => {
        const mode = p.smearMode ?? 'linear';
        const groups = [
            { keys: ['smearMode'] },
            { keys: ['smearNodeMode'] },
        ];
        if ((p.smearNodeMode ?? 'manual') === 'random') {
            groups.push({ keys: ['smearRandomCount'] });
        }
        groups.push({ keys: ['smearRadius'] });
        if (mode === 'linear')     groups.push({ keys: ['smearLinearDx', 'smearLinearDy'] });
        if (mode === 'rotational') groups.push({ keys: ['smearRotAngle'] });
        if (mode === 'radial')     groups.push({ keys: ['smearRadialAmt'] });
        groups.push(fade.uiGroup, blend.uiGroup);
        return groups;
    },
    params: {
        smearEnabled: { default: false, label: 'Enable' },
        smearMode: {
            default: 'linear', label: 'Mode',
            options: [['linear','Linear'],['rotational','Rotational'],['radial','Radial']],
        },

        // Node shared
        smearNodeCount:   { default: 0,  min: 0,   max: 24 },
        smearRadius:      { default: 15, min: 1,   max: 100, label: 'Radius' },
        smearNodeMode:    { default: 'random', label: 'Placement',
            options: [['manual','Manual'],['random','Random']] },
        smearRandomCount: { default: 8,  min: 1,   max: 24,  label: 'Node Count' },

        // Center handle
        smearCenterX: { default: 50, min: 0, max: 100 },
        smearCenterY: { default: 50, min: 0, max: 100 },

        // 24 node slots
        ...nodeParamDefs,

        // Linear mode
        smearLinearDx: { default: 50, min: -100, max: 100, label: 'Shift X' },
        smearLinearDy: { default: 0, min: -100, max: 100, label: 'Shift Y' },

        // Rotational mode
        smearRotAngle: { default: 45, min: -180, max: 180, label: 'Angle' },

        // Radial mode
        smearRadialAmt: { default: 50, min: -100, max: 100, label: 'Amount' },

        ...fade.params,
        ...blend.params,
    },
    enabled: (p) => p.smearEnabled && (p.smearNodeCount ?? 0) > 0,
    overlays: { fade: fade.overlay },
    bindUniforms: (gl, prog, p) => {
        const locs = prog._locs;
        const si = (k, v) => { if (locs[k] != null) gl.uniform1i(locs[k], v); };

        si('smearMode',      { linear: 0, rotational: 1, radial: 2 }[p.smearMode] ?? 0);
        si('smearNodeCount', p.smearNodeCount ?? 0);

        if (locs['smearCenter'] != null) {
            gl.uniform2f(locs['smearCenter'],
                (p.smearCenterX ?? 50) / 100,
                1.0 - (p.smearCenterY ?? 50) / 100
            );
        }

        const count = Math.min(NODE_SLOTS, p.smearNodeCount ?? 0);
        const nodes = new Float32Array(NODE_SLOTS * 2);
        for (let i = 0; i < count; i++) {
            nodes[i * 2]     =  (p[`smearNx${i}`] ?? 0) / 100;
            nodes[i * 2 + 1] = 1.0 - (p[`smearNy${i}`] ?? 0) / 100;
        }
        if (locs['smearNodes[0]'] != null) gl.uniform2fv(locs['smearNodes[0]'], nodes);

        fade.bindUniforms(gl, prog, p);
        blend.bindUniforms(gl, prog, p);
    },
    glsl: `
uniform int   smearMode;       // 0=linear 1=rotational 2=radial
uniform vec2  smearNodes[24];
uniform int   smearNodeCount;
uniform float smearRadius;
uniform float smearLinearDx;
uniform float smearLinearDy;
uniform float smearRotAngle;
uniform float smearRadialAmt;
uniform vec2  smearCenter;
${fade.glsl}
${blend.glsl}

float smearGauss(float d, float sigma) {
    return exp(-(d * d) / (2.0 * sigma * sigma));
}

void main() {
    vec4 c = texture(uTex, vUV);

    float sigma    = smearRadius / 100.0 * 0.25;
    vec2  totalDisp = vec2(0.0);
    float totalW   = 0.0;

    for (int i = 0; i < 24; i++) {
        if (i >= smearNodeCount) break;
        vec2  nPos = smearNodes[i];
        float d    = distance(vUV, nPos);
        float w    = smearGauss(d, sigma);

        vec2 disp = vec2(0.0);
        if (smearMode == 0) {
            disp = -vec2(smearLinearDx, smearLinearDy) / 100.0 * 0.15;
        } else if (smearMode == 1) {
            vec2  rel    = nPos - smearCenter;
            float rotRad = smearRotAngle * 3.14159265 / 180.0;
            float cosR   = cos(rotRad);
            float sinR   = sin(rotRad);
            vec2  rotated = vec2(rel.x * cosR - rel.y * sinR,
                                 rel.x * sinR + rel.y * cosR);
            disp = (rotated - rel) * 0.5;
        } else {
            vec2 dir = normalize(nPos - smearCenter + vec2(0.0001));
            disp = dir * smearRadialAmt / 100.0 * 0.15;
        }

        totalDisp += w * disp;
        totalW    += w;
    }

    vec2 uv = vUV;
    if (totalW > 0.001) {
        uv = clamp(vUV + totalDisp / max(totalW, 1.0), vec2(0.0), vec2(1.0));
    }

    float weight  = ${fade.fnName}();
    vec3 adjusted = texture(uTex, uv).rgb;
    vec3 faded    = mix(c.rgb, adjusted, weight);
    if (!${blend.thresholdFn}(c, vec4(faded, c.a))) { fragColor = c; return; }
    fragColor = vec4(${blend.blendFn}(c.rgb, faded), c.a);
}
`,
};
