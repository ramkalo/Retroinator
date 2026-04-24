import { canvas } from '../renderer/glstate.js';
import { setInstanceParam, getStack, onStackChange } from '../state/effectStack.js';
import { saveState } from '../state/undo.js';
import { setCropPreviewActive } from '../state/cropPreview.js';
import { processImageImmediate } from '../renderer/pipeline.js';

const uiOverlay = document.getElementById('uiOverlay');
const uiCtx     = uiOverlay.getContext('2d');

// Active overlay state — only one active at a time
let _mode       = null;   // 'fade' | 'blur' | 'blackBox' | 'crop' | 'viewport' | null
let _instId     = null;
let _dragging   = false;
let _xKey       = null;
let _yKey       = null;
let _handle     = null;   // blackBox/crop/viewport: handle name
let _dragAnchor = null;   // crop corner drag: { oppX, oppY, signX, signY }

let _vpResetting = false;  // re-entrancy guard for _resetPolygonVertices

// Redraw whenever any stack param changes (e.g. a slider)
onStackChange((key) => {
    if (!_instId) return;
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) { _hideActive(); return; }
    if (_mode === 'fade')       drawFade(inst.params);
    if (_mode === 'blur')       drawBlur(inst.params);
    if (_mode === 'blackBox')   drawBlackBox(inst.params);
    if (_mode === 'crop')       drawCrop(inst.params);
    if (_mode === 'matrixRain') drawMatrixRain(inst.params);
    if (_mode === 'viewport') {
        const p = inst.params;
        const shape = p.vpShape;
        if (!_vpResetting && (shape === 'triangle' || shape === 'polygon')) {
            const n = shape === 'triangle' ? 3 : Math.max(3, Math.min(12, Math.round(p.vpSides)));
            const shouldReset = key === 'vpShape' || key === 'vpSides' ||
                Array.from({ length: n }, (_, i) =>
                    p[`vpV${i}x`] === 0 && p[`vpV${i}y`] === 0
                ).every(Boolean);
            if (shouldReset) { _resetPolygonVertices(inst.id, shape, n); return; }
        }
        drawViewport(p);
    }
});

// ── Public API ────────────────────────────────────────────────────────────────

export function showFadeOverlay(inst) {
    _activate('fade', inst, 'basicFadeX', 'basicFadeY');
    drawFade(inst.params);
}

export function hideFadeOverlay() {
    if (_mode === 'fade') _hideActive();
}

export function showBlurOverlay(inst) {
    _activate('blur', inst, 'blurCenterX', 'blurCenterY');
    drawBlur(inst.params);
}

export function hideBlurOverlay() {
    if (_mode === 'blur') _hideActive();
}

export function showBlackBoxOverlay(inst) {
    _activate('blackBox', inst, 'blackBoxX', 'blackBoxY');
    drawBlackBox(inst.params);
}

export function hideBlackBoxOverlay() {
    if (_mode === 'blackBox') _hideActive();
}

export function showCropOverlay(inst) {
    _activate('crop', inst, 'cropX', 'cropY');
    setCropPreviewActive(true);
    processImageImmediate();   // re-render at full image size (skips crop transform)
    drawCrop(inst.params);
}

export function hideCropOverlay() {
    if (_mode !== 'crop') return;
    setCropPreviewActive(false);
    _hideActive();
    processImageImmediate();   // re-render with crop transform applied
}

// ── Activation / deactivation ─────────────────────────────────────────────────

function _activate(mode, inst, xKey, yKey) {
    // Clean up any previous listeners before switching
    uiOverlay.removeEventListener('pointerdown', onDown);
    uiOverlay.removeEventListener('pointermove', onHover);

    _mode     = mode;
    _instId   = inst.id;
    _dragging = false;
    _xKey     = xKey;
    _yKey     = yKey;

    uiOverlay.style.pointerEvents = 'auto';
    uiOverlay.addEventListener('pointerdown', onDown);
    uiOverlay.addEventListener('pointermove', onHover);
}

function _hideActive() {
    _mode       = null;
    _instId     = null;
    _dragging   = false;
    _xKey       = null;
    _yKey       = null;
    _handle     = null;
    _dragAnchor = null;
    clear();
    uiOverlay.style.pointerEvents = 'none';
    uiOverlay.style.cursor = '';
    uiOverlay.removeEventListener('pointerdown', onDown);
    uiOverlay.removeEventListener('pointermove', onHover);
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function syncSize() {
    const r = canvas.getBoundingClientRect();
    uiOverlay.width  = r.width;
    uiOverlay.height = r.height;
}

function clear() {
    uiCtx.clearRect(0, 0, uiOverlay.width, uiOverlay.height);
}

function drawHandle(cx, cy) {
    // Filled dot with drop shadow
    uiCtx.beginPath();
    uiCtx.arc(cx, cy, 7, 0, Math.PI * 2);
    uiCtx.fillStyle   = 'rgba(255,255,255,0.92)';
    uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
    uiCtx.shadowBlur  = 4;
    uiCtx.fill();
    uiCtx.shadowBlur  = 0;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.stroke();
    // Cross-hair lines
    uiCtx.strokeStyle = 'rgba(255,255,255,0.75)';
    uiCtx.lineWidth   = 1;
    uiCtx.beginPath();
    uiCtx.moveTo(cx - 12, cy); uiCtx.lineTo(cx + 12, cy);
    uiCtx.moveTo(cx, cy - 12); uiCtx.lineTo(cx, cy + 12);
    uiCtx.stroke();
}

// Basic Adjustments fade — handle dot always visible, dashed circle only while dragging
function drawFade(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    const cx = (0.5 + p.basicFadeX / 100) * w;
    const cy = (0.5 - p.basicFadeY / 100) * h;

    if (_dragging) {
        const mxX = Math.max(cx, w - cx);
        const mxY = Math.max(cy, h - cy);
        const r   = Math.sqrt(mxX * mxX + mxY * mxY) * (p.basicFadeRadius / 100);
        uiCtx.beginPath();
        uiCtx.arc(cx, cy, r, 0, Math.PI * 2);
        uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([5, 5]);
        uiCtx.stroke();
        uiCtx.setLineDash([]);
    }

    drawHandle(cx, cy);
}

// Blur — ellipse/rectangle always visible, handle dot always visible
function drawBlur(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);

    const cx    = (0.5 + p.blurCenterX / 100) * w;
    const cy    = (0.5 - p.blurCenterY / 100) * h;
    const a     = Math.max(1, (p.blurMajor / 100) * 0.7071 * w);
    const b     = Math.max(1, (p.blurMinor / 100) * 0.7071 * h);
    const angle = p.blurAngle * Math.PI / 180;

    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.rotate(angle);
    uiCtx.beginPath();
    if (p.blurMode === 'rectangle') {
        uiCtx.rect(-a, -b, 2 * a, 2 * b);
    } else {
        uiCtx.ellipse(0, 0, a, b, 0, 0, Math.PI * 2);
    }
    uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.setLineDash([5, 5]);
    uiCtx.stroke();
    uiCtx.setLineDash([]);
    uiCtx.restore();

    drawHandle(cx, cy);
}

// BlackBox — rotated box outline + center move handle + 4 corner resize handles
function getBlackBoxHandles(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    const cx  = (0.5 + p.blackBoxX / 100) * W;
    const cy  = (0.5 - p.blackBoxY / 100) * H;
    const bw  = (p.blackBoxW / 100) * W;
    const bh  = (p.blackBoxH / 100) * H;
    const ang = (p.blackBoxAngle ?? 0) * Math.PI / 180;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const rot = (lx, ly) => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
    return {
        center: [cx, cy],
        tl:  rot(-bw / 2, -bh / 2),
        tr:  rot(+bw / 2, -bh / 2),
        br:  rot(+bw / 2, +bh / 2),
        bl:  rot(-bw / 2, +bh / 2),
        rot: rot(0, -bh / 2 - 20),
    };
}

function drawRotHandle(cx, cy) {
    uiCtx.beginPath();
    uiCtx.arc(cx, cy, 6, 0, Math.PI * 2);
    uiCtx.fillStyle   = 'rgba(255,255,255,0.92)';
    uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
    uiCtx.shadowBlur  = 4;
    uiCtx.fill();
    uiCtx.shadowBlur  = 0;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.stroke();
}

function drawCornerHandle(cx, cy) {
    const s = 5;
    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.shadowColor = 'rgba(0,0,0,0.55)';
    uiCtx.shadowBlur  = 4;
    uiCtx.fillStyle   = 'rgba(255,255,255,0.92)';
    uiCtx.fillRect(-s, -s, s * 2, s * 2);
    uiCtx.shadowBlur  = 0;
    uiCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.strokeRect(-s, -s, s * 2, s * 2);
    uiCtx.restore();
}

function drawBlackBox(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    const cx  = (0.5 + p.blackBoxX / 100) * W;
    const cy  = (0.5 - p.blackBoxY / 100) * H;
    const bw  = (p.blackBoxW / 100) * W;
    const bh  = (p.blackBoxH / 100) * H;
    const ang = (p.blackBoxAngle ?? 0) * Math.PI / 180;

    uiCtx.save();
    uiCtx.translate(cx, cy);
    uiCtx.rotate(ang);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.55)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.setLineDash([5, 5]);
    uiCtx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    uiCtx.setLineDash([]);
    uiCtx.restore();

    const handles = getBlackBoxHandles(p);

    // Connector line: top-centre of box → rotation handle
    // Local [0, -bh/2] rotated: screen_x = cx + (bh/2)*sin, screen_y = cy - (bh/2)*cos
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const tcx = cx + (bh / 2) * sin;
    const tcy = cy - (bh / 2) * cos;
    uiCtx.beginPath();
    uiCtx.moveTo(tcx, tcy);
    uiCtx.lineTo(handles.rot[0], handles.rot[1]);
    uiCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    uiCtx.lineWidth   = 1;
    uiCtx.stroke();

    drawHandle(handles.center[0], handles.center[1]);
    for (const key of ['tl', 'tr', 'br', 'bl']) {
        drawCornerHandle(handles[key][0], handles[key][1]);
    }
    drawRotHandle(handles.rot[0], handles.rot[1]);
}

// ── Crop overlay ──────────────────────────────────────────────────────────────

const CROP_ASPECT_MAP = { '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9, '3:2': 3 / 2 };

// Replicates crop.js computeCropRegion so we can work in image-pixel space.
function _cropRegion(p, srcW, srcH) {
    const scale = p.cropScale / 100;
    let maxW, maxH;
    if (p.cropAspect === 'original') {
        maxW = srcW; maxH = srcH;
    } else {
        const baseRatio = CROP_ASPECT_MAP[p.cropAspect] || 1;
        const ratio = p.cropFlipAspect ? 1 / baseRatio : baseRatio;
        if (ratio > srcW / srcH) { maxW = srcW; maxH = srcW / ratio; }
        else { maxH = srcH; maxW = srcH * ratio; }
    }
    const cropW = maxW * scale;
    const cropH = maxH * scale;
    const centerX = (0.5 + p.cropX / 100) * srcW;
    const centerY = (0.5 - p.cropY / 100) * srcH;
    const sx = Math.max(0, Math.min(srcW - cropW, centerX - cropW / 2));
    const sy = Math.max(0, Math.min(srcH - cropH, centerY - cropH / 2));
    return { sx, sy, cropW, cropH, maxW, maxH };
}

// Returns the crop rect in overlay display coords, plus max box dims for corner drag.
function computeCropRect(p) {
    const iW = canvas.width, iH = canvas.height;
    const W = uiOverlay.width, H = uiOverlay.height;
    const scaleX = W / iW, scaleY = H / iH;
    const { sx, sy, cropW, cropH, maxW, maxH } = _cropRegion(p, iW, iH);
    const left   = sx * scaleX;
    const top    = sy * scaleY;
    const bw     = cropW * scaleX;
    const bh     = cropH * scaleY;
    return {
        left, top,
        right:  left + bw,
        bottom: top + bh,
        cx: left + bw / 2,
        cy: top  + bh / 2,
        bw, bh,
        maxW: maxW * scaleX,
        maxH: maxH * scaleY,
    };
}

function getCropHandles(p) {
    const { cx, cy, bw, bh, left, top, right, bottom } = computeCropRect(p);
    return {
        center: [cx, cy],
        tl: [left,  top],
        tr: [right, top],
        br: [right, bottom],
        bl: [left,  bottom],
    };
}

function hitTestCrop(e) {
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const handles = getCropHandles(inst.params);
    for (const [name, [hx, hy]] of Object.entries(handles)) {
        if (Math.hypot(mx - hx, my - hy) <= HIT_RADIUS) return name;
    }
    return null;
}

function drawCrop(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    const { cx, cy, bw, bh, left, top, right, bottom } = computeCropRect(p);

    // Dim the area outside the crop rect
    uiCtx.fillStyle = 'rgba(0,0,0,0.45)';
    uiCtx.fillRect(0, 0,      W,        top);           // above
    uiCtx.fillRect(0, bottom, W,        H - bottom);    // below
    uiCtx.fillRect(0, top,    left,     bh);            // left
    uiCtx.fillRect(right, top, W - right, bh);          // right

    // Crop border
    uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
    uiCtx.lineWidth   = 1.5;
    uiCtx.setLineDash([]);
    uiCtx.strokeRect(left, top, bw, bh);

    // Rule-of-thirds grid
    uiCtx.strokeStyle = 'rgba(255,255,255,0.3)';
    uiCtx.lineWidth   = 1;
    uiCtx.beginPath();
    for (let i = 1; i <= 2; i++) {
        const x = left + bw * i / 3;
        const y = top  + bh * i / 3;
        uiCtx.moveTo(x, top);    uiCtx.lineTo(x, bottom);
        uiCtx.moveTo(left, y);   uiCtx.lineTo(right, y);
    }
    uiCtx.stroke();

    // Handles
    drawHandle(cx, cy);
    drawCornerHandle(left,  top);
    drawCornerHandle(right, top);
    drawCornerHandle(right, bottom);
    drawCornerHandle(left,  bottom);
}

// ── Viewport overlay ──────────────────────────────────────────────────────────

export function showMatrixRainOverlay(inst) {
    _activate('matrixRain', inst, 'matrixRainX', 'matrixRainY');
    drawMatrixRain(inst.params);
}

export function hideMatrixRainOverlay() {
    if (_mode === 'matrixRain') _hideActive();
}

function drawMatrixRain(p) {
    syncSize();
    const w = uiOverlay.width, h = uiOverlay.height;
    uiCtx.clearRect(0, 0, w, h);
    const cx = (0.5 + p.matrixRainX / 100) * w;
    const cy = (0.5 - p.matrixRainY / 100) * h;
    drawHandle(cx, cy);
}

export function showViewportOverlay(inst) {
    _activate('viewport', inst, 'vpX', 'vpY');
    const p = inst.params;

    // Only reset vertices when they're all at zero (freshly added effect).
    // If the user has configured them, preserve their work.
    const shape = p.vpShape;
    if (shape === 'triangle' || shape === 'polygon') {
        const n = shape === 'triangle' ? 3 : Math.max(3, Math.min(12, Math.round(p.vpSides)));
        const allZero = Array.from({ length: n }, (_, i) =>
            p[`vpV${i}x`] === 0 && p[`vpV${i}y`] === 0
        ).every(Boolean);
        if (allZero) {
            _resetPolygonVertices(inst.id, shape, n);
            return;
        }
    }
    drawViewport(p);
}

export function hideViewportOverlay() {
    if (_mode === 'viewport') _hideActive();
}

// Computes regular polygon vertex offsets for the active shape and updates params.
function _resetPolygonVertices(instId, shape, sides) {
    _vpResetting = true;
    let n, startAngle;
    if (shape === 'triangle') {
        n = 3;
        startAngle = Math.PI / 2; // top vertex at top (Y-up param space)
    } else {
        n = Math.max(3, Math.min(12, sides));
        startAngle = 0; // first vertex at right
    }
    const R = 25; // radius in -50..50 param space
    for (let i = 0; i < 12; i++) {
        const angle = startAngle + i * (2 * Math.PI / n);
        const x = i < n ? Math.round(R * Math.cos(angle) * 100) / 100 : 0;
        const y = i < n ? Math.round(R * Math.sin(angle) * 100) / 100 : 0;
        setInstanceParam(instId, `vpV${i}x`, x);
        setInstanceParam(instId, `vpV${i}y`, y);
    }
    _vpResetting = false;
    const inst = getStack().find(i => i.id === instId);
    if (inst) drawViewport(inst.params);
}

// Returns { cx, cy } of viewport center in overlay pixels, plus shape geometry.
function _vpCenter(p) {
    const W = uiOverlay.width, H = uiOverlay.height;
    return {
        cx: (0.5 + p.vpX / 100) * W,
        cy: (0.5 - p.vpY / 100) * H,
        W, H,
    };
}

// Returns the vertex screen positions for triangle/polygon mode.
function _vpVertexScreenPositions(p) {
    const { W, H } = _vpCenter(p);
    const shape = p.vpShape;
    const n = shape === 'triangle' ? 3 : Math.max(3, Math.min(12, Math.round(p.vpSides)));
    const verts = [];
    for (let i = 0; i < n; i++) {
        verts.push([
            (0.5 + (p.vpX + (p[`vpV${i}x`] ?? 0)) / 100) * W,
            (0.5 - (p.vpY + (p[`vpV${i}y`] ?? 0)) / 100) * H,
        ]);
    }
    return verts;
}

function drawViewport(p) {
    syncSize();
    const W = uiOverlay.width, H = uiOverlay.height;
    uiCtx.clearRect(0, 0, W, H);

    const { cx, cy } = _vpCenter(p);

    if (p.vpShape === 'rectangle') {
        const hw = (p.vpW / 200) * W;
        const hh = (p.vpH / 200) * H;
        const left = cx - hw, top = cy - hh, right = cx + hw, bottom = cy + hh;

        // Dim outside
        uiCtx.fillStyle = 'rgba(0,0,0,0.45)';
        uiCtx.fillRect(0, 0, W, top);
        uiCtx.fillRect(0, bottom, W, H - bottom);
        uiCtx.fillRect(0, top, left, hh * 2);
        uiCtx.fillRect(right, top, W - right, hh * 2);

        // Border
        uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([]);
        uiCtx.strokeRect(left, top, hw * 2, hh * 2);

        drawHandle(cx, cy);
        drawCornerHandle(left,  top);
        drawCornerHandle(right, top);
        drawCornerHandle(right, bottom);
        drawCornerHandle(left,  bottom);

    } else if (p.vpShape === 'circle') {
        const r = (p.vpR / 100) * Math.min(W, H) * 0.5;

        // Dim outside using composite: fill screen then clip circle
        uiCtx.save();
        uiCtx.fillStyle = 'rgba(0,0,0,0.45)';
        uiCtx.fillRect(0, 0, W, H);
        uiCtx.globalCompositeOperation = 'destination-out';
        uiCtx.beginPath();
        uiCtx.arc(cx, cy, r, 0, Math.PI * 2);
        uiCtx.fill();
        uiCtx.restore();

        // Border
        uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([]);
        uiCtx.beginPath();
        uiCtx.arc(cx, cy, r, 0, Math.PI * 2);
        uiCtx.stroke();

        drawHandle(cx, cy);
        // Edge handle at right side of circle
        drawCornerHandle(cx + r, cy);

    } else {
        // triangle / polygon
        const verts = _vpVertexScreenPositions(p);

        // Dim outside polygon
        uiCtx.save();
        uiCtx.fillStyle = 'rgba(0,0,0,0.45)';
        uiCtx.fillRect(0, 0, W, H);
        uiCtx.globalCompositeOperation = 'destination-out';
        uiCtx.beginPath();
        if (verts.length > 0) {
            uiCtx.moveTo(verts[0][0], verts[0][1]);
            for (let i = 1; i < verts.length; i++) uiCtx.lineTo(verts[i][0], verts[i][1]);
            uiCtx.closePath();
        }
        uiCtx.fill();
        uiCtx.restore();

        // Border
        uiCtx.strokeStyle = 'rgba(255,255,255,0.85)';
        uiCtx.lineWidth   = 1.5;
        uiCtx.setLineDash([]);
        uiCtx.beginPath();
        if (verts.length > 0) {
            uiCtx.moveTo(verts[0][0], verts[0][1]);
            for (let i = 1; i < verts.length; i++) uiCtx.lineTo(verts[i][0], verts[i][1]);
            uiCtx.closePath();
        }
        uiCtx.stroke();

        drawHandle(cx, cy);
        for (const [vx, vy] of verts) drawCornerHandle(vx, vy);
    }
}

function hitTestViewport(e) {
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const p  = inst.params;
    const { cx, cy, W, H } = _vpCenter(p);

    // Center handle
    if (Math.hypot(mx - cx, my - cy) <= HIT_RADIUS) return 'center';

    if (p.vpShape === 'rectangle') {
        const hw = (p.vpW / 200) * W;
        const hh = (p.vpH / 200) * H;
        const corners = {
            tl: [cx - hw, cy - hh],
            tr: [cx + hw, cy - hh],
            br: [cx + hw, cy + hh],
            bl: [cx - hw, cy + hh],
        };
        for (const [name, [hx, hy]] of Object.entries(corners)) {
            if (Math.hypot(mx - hx, my - hy) <= HIT_RADIUS) return name;
        }
    } else if (p.vpShape === 'circle') {
        const r = (p.vpR / 100) * Math.min(W, H) * 0.5;
        if (Math.hypot(mx - (cx + r), my - cy) <= HIT_RADIUS) return 'edgeR';
    } else {
        const verts = _vpVertexScreenPositions(p);
        for (let i = 0; i < verts.length; i++) {
            if (Math.hypot(mx - verts[i][0], my - verts[i][1]) <= HIT_RADIUS) return `v${i}`;
        }
    }
    return null;
}

// ── Pointer events ────────────────────────────────────────────────────────────

const HIT_RADIUS = 18;

function getCentre() {
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) return null;
    const p = inst.params;
    return {
        cx: (0.5 + p[_xKey] / 100) * uiOverlay.width,
        cy: (0.5 - p[_yKey] / 100) * uiOverlay.height,
    };
}

function hitTest(e) {
    const c = getCentre();
    if (!c) return false;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - rect.left) - c.cx;
    const dy = (e.clientY - rect.top)  - c.cy;
    return Math.sqrt(dx * dx + dy * dy) <= HIT_RADIUS;
}

function hitTestBlackBox(e) {
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const handles = getBlackBoxHandles(inst.params);
    for (const [name, [hx, hy]] of Object.entries(handles)) {
        const dx = mx - hx, dy = my - hy;
        if (Math.sqrt(dx * dx + dy * dy) <= HIT_RADIUS) return name;
    }
    return null;
}

const CROP_CURSOR = { center: 'grab', tl: 'nw-resize', tr: 'ne-resize', br: 'se-resize', bl: 'sw-resize' };

function onHover(e) {
    if (_dragging) return;
    if (_mode === 'blackBox') {
        const h = hitTestBlackBox(e);
        uiOverlay.style.cursor = h === 'center' ? 'grab' : h === 'rot' ? 'crosshair' : h ? 'nwse-resize' : 'default';
    } else if (_mode === 'crop') {
        const h = hitTestCrop(e);
        uiOverlay.style.cursor = h ? (CROP_CURSOR[h] || 'default') : 'default';
    } else if (_mode === 'viewport') {
        const h = hitTestViewport(e);
        uiOverlay.style.cursor = h === 'center' ? 'grab' : h ? 'nwse-resize' : 'default';
    } else {
        uiOverlay.style.cursor = hitTest(e) ? 'grab' : 'default';
    }
}

function onDown(e) {
    if (_mode === 'blackBox') {
        const h = hitTestBlackBox(e);
        if (!h) return;
        _handle   = h;
        _dragging = true;
        uiOverlay.setPointerCapture(e.pointerId);
        uiOverlay.style.cursor = h === 'center' ? 'grabbing' : h === 'rot' ? 'crosshair' : 'nwse-resize';
    } else if (_mode === 'crop') {
        const h = hitTestCrop(e);
        if (!h) return;
        _handle   = h;
        _dragging = true;
        uiOverlay.setPointerCapture(e.pointerId);
        uiOverlay.style.cursor = h === 'center' ? 'grabbing' : (CROP_CURSOR[h] || 'default');
        // Record anchor for corner drags (opposite corner stays fixed)
        if (h !== 'center') {
            const inst = getStack().find(i => i.id === _instId);
            if (inst) {
                const { cx, cy, bw, bh } = computeCropRect(inst.params);
                const SIGNS = { tl: [-1, -1], tr: [+1, -1], br: [+1, +1], bl: [-1, +1] };
                const [signX, signY] = SIGNS[h];
                _dragAnchor = {
                    oppX: cx - signX * bw / 2,
                    oppY: cy - signY * bh / 2,
                    signX, signY,
                };
            }
        }
    } else if (_mode === 'viewport') {
        const h = hitTestViewport(e);
        if (!h) return;
        _handle   = h;
        _dragging = true;
        uiOverlay.setPointerCapture(e.pointerId);
        uiOverlay.style.cursor = h === 'center' ? 'grabbing' : 'nwse-resize';
    } else {
        if (!hitTest(e)) return;
        _dragging = true;
        uiOverlay.setPointerCapture(e.pointerId);
        uiOverlay.style.cursor = 'grabbing';
    }
    uiOverlay.addEventListener('pointermove', onDrag);
    uiOverlay.addEventListener('pointerup',   onUp);
}

function onDrag(e) {
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) return;
    const rect = canvas.getBoundingClientRect();

    if (_mode === 'blackBox') {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const W  = uiOverlay.width, H = uiOverlay.height;
        if (_handle === 'center') {
            const x = Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100)));
            const y = Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100)));
            setInstanceParam(_instId, 'blackBoxX', x);
            setInstanceParam(_instId, 'blackBoxY', y);
        } else if (_handle === 'rot') {
            // Rotation — angle of mouse relative to box center, offset so 0° = up
            const p  = inst.params;
            const cx = (0.5 + p.blackBoxX / 100) * W;
            const cy = (0.5 - p.blackBoxY / 100) * H;
            let deg  = Math.atan2(my - cy, mx - cx) * 180 / Math.PI + 90;
            if (deg > 180)  deg -= 360;
            if (deg < -180) deg += 360;
            setInstanceParam(_instId, 'blackBoxAngle', Math.round(deg));
        } else {
            // Symmetric resize around center — project mouse onto local box axes
            const p   = inst.params;
            const cx  = (0.5 + p.blackBoxX / 100) * W;
            const cy  = (0.5 - p.blackBoxY / 100) * H;
            const ang = (p.blackBoxAngle ?? 0) * Math.PI / 180;
            const cos = Math.cos(ang), sin = Math.sin(ang);
            const dx  = mx - cx, dy = my - cy;
            const lx  = dx * cos + dy * sin;
            const ly  = -dx * sin + dy * cos;
            setInstanceParam(_instId, 'blackBoxW', Math.round(Math.max(1, Math.min(100, Math.abs(lx) * 2 / W * 100))));
            setInstanceParam(_instId, 'blackBoxH', Math.round(Math.max(1, Math.min(100, Math.abs(ly) * 2 / H * 100))));
        }
    } else if (_mode === 'crop') {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const W  = uiOverlay.width, H = uiOverlay.height;
        if (_handle === 'center') {
            const x = Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100)));
            const y = Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100)));
            setInstanceParam(_instId, 'cropX', x);
            setInstanceParam(_instId, 'cropY', y);
        } else if (_dragAnchor) {
            const { oppX, oppY, signX, signY } = _dragAnchor;
            const { maxW, maxH } = computeCropRect(inst.params);
            const rawW = Math.max(1, Math.abs(mx - oppX));
            const rawH = Math.max(1, Math.abs(my - oppY));
            const scaleFromW = rawW / maxW;
            const scaleFromH = rawH / maxH;
            const newScaleFrac = Math.max(0.1, Math.min(1.0, (scaleFromW + scaleFromH) / 2));
            const newScale = Math.round(newScaleFrac * 100);
            const newBW = maxW * newScaleFrac;
            const newBH = maxH * newScaleFrac;
            // New center: midpoint between fixed opp corner and new active corner
            const newCX = oppX + signX * newBW / 2;
            const newCY = oppY + signY * newBH / 2;
            const newCropX = Math.round(Math.max(-50, Math.min(50,  (newCX / W - 0.5) * 100)));
            const newCropY = Math.round(Math.max(-50, Math.min(50, -(newCY / H - 0.5) * 100)));
            setInstanceParam(_instId, 'cropScale', newScale);
            setInstanceParam(_instId, 'cropX', newCropX);
            setInstanceParam(_instId, 'cropY', newCropY);
        }
    } else if (_mode === 'viewport') {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const W  = uiOverlay.width, H = uiOverlay.height;
        const inst = getStack().find(i => i.id === _instId);
        if (!inst) return;
        const p = inst.params;

        if (_handle === 'center') {
            const x = Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100)));
            const y = Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100)));
            setInstanceParam(_instId, 'vpX', x);
            setInstanceParam(_instId, 'vpY', y);
        } else if (_handle === 'tl' || _handle === 'tr' || _handle === 'br' || _handle === 'bl') {
            const cx = (0.5 + p.vpX / 100) * W;
            const cy = (0.5 - p.vpY / 100) * H;
            const newW = Math.round(Math.max(1, Math.min(100, Math.abs(mx - cx) * 2 / W * 100)));
            const newH = Math.round(Math.max(1, Math.min(100, Math.abs(my - cy) * 2 / H * 100)));
            setInstanceParam(_instId, 'vpW', newW);
            setInstanceParam(_instId, 'vpH', newH);
        } else if (_handle === 'edgeR') {
            const cx = (0.5 + p.vpX / 100) * W;
            const cy = (0.5 - p.vpY / 100) * H;
            const dist = Math.hypot(mx - cx, my - cy);
            const r = Math.round(Math.max(1, Math.min(100, dist / (Math.min(W, H) * 0.5) * 100)));
            setInstanceParam(_instId, 'vpR', r);
        } else if (_handle && _handle.startsWith('v')) {
            const idx = parseInt(_handle.slice(1), 10);
            const ox = Math.round(Math.max(-50, Math.min(50,  (mx / W - 0.5) * 100)) - p.vpX);
            const oy = Math.round(Math.max(-50, Math.min(50, -(my / H - 0.5) * 100)) - p.vpY);
            setInstanceParam(_instId, `vpV${idx}x`, Math.max(-50, Math.min(50, ox)));
            setInstanceParam(_instId, `vpV${idx}y`, Math.max(-50, Math.min(50, oy)));
        }
    } else {
        const x = Math.round(Math.max(-50, Math.min(50, ((e.clientX - rect.left) / rect.width  - 0.5) * 100)));
        const y = Math.round(Math.max(-50, Math.min(50, -((e.clientY - rect.top)  / rect.height - 0.5) * 100)));
        setInstanceParam(_instId, _xKey, x);
        setInstanceParam(_instId, _yKey, y);
    }
    // onStackChange fires → draw() called automatically
}

function onUp() {
    _dragging   = false;
    _handle     = null;
    _dragAnchor = null;
    uiOverlay.style.cursor = 'default';
    uiOverlay.removeEventListener('pointermove', onDrag);
    uiOverlay.removeEventListener('pointerup',   onUp);
    saveState();
    const inst = getStack().find(i => i.id === _instId);
    if (!inst) return;
    if (_mode === 'fade')       drawFade(inst.params);
    if (_mode === 'blur')       drawBlur(inst.params);
    if (_mode === 'blackBox')   drawBlackBox(inst.params);
    if (_mode === 'crop')       drawCrop(inst.params);
    if (_mode === 'matrixRain') drawMatrixRain(inst.params);
    if (_mode === 'viewport')   drawViewport(inst.params);
}
