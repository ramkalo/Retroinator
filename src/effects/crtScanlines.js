function applyScanlines(imageData, p) {
    if (p.crtScanline <= 0) return imageData;

    const width   = imageData.width;
    const height  = imageData.height;
    const data    = imageData.data;
    const darken  = 1 - (p.crtScanline / 100) * 0.7;
    const spacing = Math.floor(p.crtScanSpacing);

    for (let y = 0; y < height; y++) {
        if (y % spacing < 1) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                data[i]     *= darken;
                data[i + 1] *= darken;
                data[i + 2] *= darken;
            }
        }
    }

    return imageData;
}

export default {
    name: 'crtScanlines',
    label: 'CRT Scanlines',
    pass: 'post',
    params: {
        crtScanlineEnabled: { default: false },
        crtScanline:        { default: 0, min: 0, max: 100 },
        crtScanSpacing:     { default: 4, min: 2, max: 12  },
    },
    enabled: (p) => p.crtScanlineEnabled,
    canvas2d: applyScanlines,
};
