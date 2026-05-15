import { canvas } from '../../renderer/glstate.js';
import { setInstanceParam, getStack } from '../../state/effectStack.js';
import { processImageImmediate } from '../../renderer/pipeline.js';
import { uiCtx, uiOverlay, syncSize } from '../overlayUtils.js';

let _activeStroke = null;

// Mirrors _runLinear's palette tracking: last enabled colorPalette before instId.
function _getActivePalette(instId) {
    let palette = null;
    for (const inst of getStack()) {
        if (inst.id === instId) break;
        if (inst.effectName === 'colorPalette' && inst.params.paletteEnabled) {
            palette = Array.from({ length: 8 }, (_, j) => inst.params[`palette${j}`]);
        }
    }
    return palette;
}

function _resolveColorKey(colorKey, activePalette) {
    if (colorKey === 'black') return '#000000';
    if (colorKey === 'white') return '#ffffff';
    const m = colorKey.match(/^palette(\d)$/);
    if (m && activePalette) return activePalette[+m[1]] ?? '#000000';
    return '#000000';
}

function _previewColor(stroke) {
    if (stroke.fillType === 'static') return 'rgba(160,160,160,0.75)';
    return stroke.color ?? '#000000';
}

export function drawDrawTool(_params) {
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);
}

export function hitTestDrawTool(_e) {
    return 'canvas';
}

export function onDrawToolDown(e, inst, rect) {
    const p = inst.params;
    const x = Math.round(((e.clientX - rect.left) / rect.width)  * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top)  / rect.height) * 1000) / 10;

    const activePalette = _getActivePalette(inst.id);
    // Resolve to actual hex at draw time so the stored stroke needs no palette lookup.
    const colorHex = _resolveColorKey(p.drawToolColor ?? 'palette0', activePalette);

    _activeStroke = {
        color:      colorHex,
        size:       p.drawToolSize       ?? 10,
        fillType:   p.drawToolFillType   ?? 'solid',
        staticType: p.drawToolStaticType ?? 'greyscale',
        grainSize:  p.drawToolGrainSize  ?? 4,
        seed:       Math.floor(Math.random() * 65536),
        points:     [{ x, y }],
    };

    syncSize();
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);
    _paintDot(_activeStroke, x, y);
}

export function onDragDrawTool(e, inst, rect) {
    if (!_activeStroke) return;
    const x = Math.round(((e.clientX - rect.left) / rect.width)  * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top)  / rect.height) * 1000) / 10;
    const pts  = _activeStroke.points;
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5) return;
    pts.push({ x, y });
    _paintSegment(_activeStroke, pts[pts.length - 2], { x, y });
}

export function finalizeDrawToolStroke(instId, params) {
    if (!_activeStroke) return;
    let strokes;
    try { strokes = JSON.parse(params.drawToolStrokes || '[]'); } catch { strokes = []; }

    strokes.push({ ..._activeStroke });
    _activeStroke = null;

    setInstanceParam(instId, 'drawToolStrokes', JSON.stringify(strokes));
    processImageImmediate();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _scale() {
    return uiOverlay.width / canvas.width;
}

function _paintDot(stroke, x, y) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const sz = Math.max(1, stroke.size * _scale());
    uiCtx.save();
    uiCtx.beginPath();
    uiCtx.arc((x / 100) * W, (y / 100) * H, sz / 2, 0, Math.PI * 2);
    uiCtx.fillStyle = _previewColor(stroke);
    uiCtx.fill();
    uiCtx.restore();
}

function _paintSegment(stroke, prev, curr) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const sz = Math.max(1, stroke.size * _scale());
    uiCtx.save();
    uiCtx.beginPath();
    uiCtx.moveTo((prev.x / 100) * W, (prev.y / 100) * H);
    uiCtx.lineTo((curr.x / 100) * W, (curr.y / 100) * H);
    uiCtx.strokeStyle = _previewColor(stroke);
    uiCtx.lineWidth   = sz;
    uiCtx.lineCap     = 'round';
    uiCtx.lineJoin    = 'round';
    uiCtx.stroke();
    uiCtx.restore();
}
