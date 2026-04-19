import { canvas } from '../renderer/glstate.js';

function rotate90CW(srcCanvas) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const dst = document.createElement('canvas');
    dst.width = h;
    dst.height = w;
    const dctx = dst.getContext('2d');
    dctx.translate(h, 0);
    dctx.rotate(Math.PI / 2);
    dctx.drawImage(srcCanvas, 0, 0);
    return dst;
}

function rotate90CCW(srcCanvas) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const dst = document.createElement('canvas');
    dst.width = h;
    dst.height = w;
    const dctx = dst.getContext('2d');
    dctx.translate(0, w);
    dctx.rotate(-Math.PI / 2);
    dctx.drawImage(srcCanvas, 0, 0);
    return dst;
}

function rotate180(srcCanvas) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const dst = document.createElement('canvas');
    dst.width = w;
    dst.height = h;
    const dctx = dst.getContext('2d');
    dctx.translate(w, h);
    dctx.rotate(Math.PI);
    dctx.drawImage(srcCanvas, 0, 0);
    return dst;
}

function applyTransform(ctx, p) {
    if (!p.transformEnabled) return;

    const do90  = p.rotate90  || false;
    const do180 = p.rotate180 || false;
    const do270 = p.rotate270 || false;
    const flipH = p.flipH || false;
    const flipV = p.flipV || false;

    if (!do90 && !do180 && !do270 && !flipH && !flipV) return;

    let src = canvas;

    if (do90) {
        src = rotate90CW(src);
    } else if (do180) {
        src = rotate180(src);
    } else if (do270) {
        src = rotate90CCW(src);
    }

    if (do90 || do180 || do270) {
        canvas.width = src.width;
        canvas.height = src.height;
        ctx.drawImage(src, 0, 0);
        src = canvas;
    }
    
    if (flipH || flipV) {
        const w = src.width;
        const h = src.height;
        
        const flipped = document.createElement('canvas');
        flipped.width = w;
        flipped.height = h;
        const fctx = flipped.getContext('2d');
        
        fctx.save();
        fctx.translate(w / 2, h / 2);
        if (flipH) fctx.scale(-1, 1);
        if (flipV) fctx.scale(1, -1);
        fctx.translate(-w / 2, -h / 2);
        fctx.drawImage(src, 0, 0);
        fctx.restore();
        
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(flipped, 0, 0);
    }
}

export default {
    name: 'transform',
    label: 'Rotate',
    pass: 'transform',
    params: {
        transformEnabled: { default: false },
        rotate90:         { default: false },
        rotate180:        { default: false },
        rotate270:        { default: false },
        flipH:            { default: false },
        flipV:            { default: false },
    },
    enabled: (p) => p.transformEnabled && (p.rotate90 || p.rotate180 || p.rotate270 || p.flipH || p.flipV),
    canvas2d: applyTransform,
};