function applyStatic(imageData, p) {
    if (p.crtStatic <= 0) return imageData;

    const data      = imageData.data;
    const intensity = p.crtStatic / 100;
    const type      = p.crtStaticType;

    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 255 * intensity;
        if (type === 'white') {
            data[i]     = Math.max(0, Math.min(255, data[i]     + noise));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        } else if (type === 'color') {
            data[i]     = Math.max(0, Math.min(255, data[i]     + noise * Math.random()));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise * Math.random()));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise * Math.random()));
        } else if (type === 'luma') {
            const gray    = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const newGray = Math.max(0, Math.min(255, gray + noise));
            const ratio   = newGray / (gray || 1);
            data[i]     *= ratio;
            data[i + 1] *= ratio;
            data[i + 2] *= ratio;
        }
    }

    return imageData;
}

export default {
    name: 'crtStatic',
    label: 'CRT Static',
    pass: 'post',
    params: {
        crtStaticEnabled: { default: false },
        crtStatic:        { default: 0, min: 0, max: 100 },
        crtStaticType:    { default: 'white' },
    },
    enabled: (p) => p.crtStaticEnabled,
    canvas2d: applyStatic,
};
