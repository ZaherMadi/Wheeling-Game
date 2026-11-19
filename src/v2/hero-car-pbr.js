// High-resolution PBR material synthesizer & studio thumbnail generator for the
// GT 51 Cabrio (2048x2048 main automotive maps on desktop, optimized mobile tiers).
// Zero external images or commercial branding.
import * as THREE from 'three';

const isMobileDevice = () =>
    typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || window.innerWidth < 820);

function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return [canvas, ctx];
}

function makeTexture(canvas, {
    srgb = false,
    wrapS = THREE.RepeatWrapping,
    wrapT = THREE.RepeatWrapping,
    anisotropy = 4,
    repeatX = 1,
    repeatY = 1
} = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = wrapS;
    tex.wrapT = wrapT;
    tex.anisotropy = anisotropy;
    if (repeatX !== 1 || repeatY !== 1) tex.repeat.set(repeatX, repeatY);
    tex.needsUpdate = true;
    return tex;
}

/**
 * Tile a source canvas into a full high-resolution target canvas so 2048x2048
 * maps build in a few milliseconds without blocking the UI thread.
 */
function tileCanvas(srcCanvas, targetSize) {
    if (srcCanvas.width === targetSize && srcCanvas.height === targetSize) return srcCanvas;
    const [out, ctx] = makeCanvas(targetSize, targetSize);
    const pat = ctx.createPattern(srcCanvas, 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, targetSize, targetSize);
    return out;
}

/**
 * Convert a tileable greyscale height Float32Array/Uint8Array into a full
 * outSize x outSize tangent-space OpenGL normal CanvasTexture via Sobel 3x3.
 */
function heightBufferToNormalCanvas(heights, tileSize, outSize, strength = 2.2) {
    const [tileCanvasEl, tileCtx] = makeCanvas(tileSize, tileSize);
    const tileImg = tileCtx.createImageData(tileSize, tileSize);
    const d = tileImg.data;
    const mask = tileSize - 1;
    const isPow2 = (tileSize & mask) === 0;
    const idxAt = isPow2
        ? (x, y) => ((y & mask) * tileSize + (x & mask))
        : (x, y) => ((((y % tileSize) + tileSize) % tileSize) * tileSize + (((x % tileSize) + tileSize) % tileSize));

    for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
            const tl = heights[idxAt(x - 1, y - 1)];
            const t = heights[idxAt(x, y - 1)];
            const tr = heights[idxAt(x + 1, y - 1)];
            const l = heights[idxAt(x - 1, y)];
            const r = heights[idxAt(x + 1, y)];
            const bl = heights[idxAt(x - 1, y + 1)];
            const b = heights[idxAt(x, y + 1)];
            const br = heights[idxAt(x + 1, y + 1)];

            const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
            const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
            let nx = -dx;
            let ny = dy;
            let nz = 1.0;
            const inv = 1 / Math.hypot(nx, ny, nz);
            nx *= inv;
            ny *= inv;
            nz *= inv;

            const o = (y * tileSize + x) * 4;
            d[o] = Math.round((nx * 0.5 + 0.5) * 255);
            d[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            d[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            d[o + 3] = 255;
        }
    }
    tileCtx.putImageData(tileImg, 0, 0);
    return tileCanvas(tileCanvasEl, outSize);
}

/**
 * Convert an arbitrary Canvas element directly to a tangent-space normal map.
 * Uses a fast downsampled 256x256 Sobel work buffer upscaled cleanly to keep cold-start under ~15 ms.
 */
function canvasToNormalTexture(heightCanvas, strength = 2.0, opts = {}) {
    const w = heightCanvas.width;
    const h = heightCanvas.height;
    const sw = Math.min(256, w);
    const sh = Math.min(256, h);
    let sampleCanvas = heightCanvas;
    if (sw !== w || sh !== h) {
        const [small, sCtx] = makeCanvas(sw, sh);
        sCtx.drawImage(heightCanvas, 0, 0, sw, sh);
        sampleCanvas = small;
    }

    const src = sampleCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const [work, workCtx] = makeCanvas(sw, sh);
    const dst = workCtx.createImageData(sw, sh);
    const d = dst.data;
    const wrapX = opts.wrapS !== THREE.ClampToEdgeWrapping;
    const wrapY = opts.wrapT !== THREE.ClampToEdgeWrapping;

    for (let y = 0; y < sh; y++) {
        const y0 = wrapY ? (y - 1 + sh) % sh : Math.max(0, y - 1);
        const y2 = wrapY ? (y + 1) % sh : Math.min(sh - 1, y + 1);
        for (let x = 0; x < sw; x++) {
            const x0 = wrapX ? (x - 1 + sw) % sw : Math.max(0, x - 1);
            const x2 = wrapX ? (x + 1) % sw : Math.min(sw - 1, x + 1);

            const tl = src[(y0 * sw + x0) * 4] / 255;
            const t = src[(y0 * sw + x) * 4] / 255;
            const tr = src[(y0 * sw + x2) * 4] / 255;
            const l = src[(y * sw + x0) * 4] / 255;
            const r = src[(y * sw + x2) * 4] / 255;
            const bl = src[(y2 * sw + x0) * 4] / 255;
            const b = src[(y2 * sw + x) * 4] / 255;
            const br = src[(y2 * sw + x2) * 4] / 255;

            const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
            const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
            let nx = -dx;
            let ny = dy;
            let nz = 1.0;
            const inv = 1 / Math.hypot(nx, ny, nz);
            nx *= inv;
            ny *= inv;
            nz *= inv;

            const idx = (y * sw + x) * 4;
            d[idx] = Math.round((nx * 0.5 + 0.5) * 255);
            d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            d[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            d[idx + 3] = 255;
        }
    }
    workCtx.putImageData(dst, 0, 0);
    return makeTexture(work, { srgb: false, ...opts });
}

function buildPaintMaps(paintSize, anisotropy) {
    // Seamless 256 metallic micro-flake tile repeated smoothly (saves ~45 MB VRAM vs 3x2048 copies)
    const tile = 256;
    const rng = mulberry(99251);
    const [albTile, albCtx] = makeCanvas(tile, tile);
    const [rghTile, rghCtx] = makeCanvas(tile, tile);
    const heights = new Float32Array(tile * tile);

    albCtx.fillStyle = '#fcfcfc';
    albCtx.fillRect(0, 0, tile, tile);
    rghCtx.fillStyle = '#383838';
    rghCtx.fillRect(0, 0, tile, tile);
    heights.fill(0.5);

    for (let i = 0; i < 6500; i++) {
        const x = rng() * tile;
        const y = rng() * tile;
        const rad = 0.5 + rng() * 1.1;
        const shade = rng();
        const v = shade > 0.55 ? 'rgba(255,255,255,0.065)' : 'rgba(225,220,205,0.045)';
        albCtx.fillStyle = v;
        albCtx.fillRect(x, y, rad, rad);

        const rVal = 48 + Math.round(rng() * 18);
        rghCtx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
        rghCtx.fillRect(x, y, rad, rad);

        const ix = Math.floor(x) & (tile - 1);
        const iy = Math.floor(y) & (tile - 1);
        heights[iy * tile + ix] = 0.44 + rng() * 0.12;
    }

    const albedoCanvas = tileCanvas(albTile, paintSize);
    const roughCanvas = tileCanvas(rghTile, paintSize);
    const normalCanvas = heightBufferToNormalCanvas(heights, tile, paintSize, 0.35);
    const rep = Math.round((2048 / paintSize) * 4);

    return {
        map: makeTexture(albedoCanvas, { srgb: true, anisotropy, repeatX: rep, repeatY: rep }),
        roughnessMap: makeTexture(roughCanvas, { srgb: false, anisotropy, repeatX: rep, repeatY: rep }),
        normalMap: makeTexture(normalCanvas, { srgb: false, anisotropy, repeatX: rep, repeatY: rep })
    };
}

function buildSoftTopMaps(mainSize, auxSize, anisotropy) {
    // Diagonal Sonnenland canvas weave + structural bow tension seams
    const tile = 256;
    const rng = mulberry(51992);
    const [wTile, wCtx] = makeCanvas(tile, tile);
    const [rTile, rCtx] = makeCanvas(tile, tile);
    const heights = new Float32Array(tile * tile);

    wCtx.fillStyle = '#191b20';
    wCtx.fillRect(0, 0, tile, tile);
    rCtx.fillStyle = '#e8e8e8';
    rCtx.fillRect(0, 0, tile, tile);

    // Fine 2x2 twill canvas weave
    const wImg = wCtx.getImageData(0, 0, tile, tile);
    const rImg = rCtx.getImageData(0, 0, tile, tile);
    const wd = wImg.data;
    const rd = rImg.data;
    for (let y = 0; y < tile; y++) {
        for (let x = 0; x < tile; x++) {
            const twill = ((x + y) & 3) < 2 ? 1 : 0;
            const warp = ((x * 2) & 3) === 0 ? 1 : 0;
            const noise = (rng() - 0.5) * 10;
            const lum = Math.max(14, Math.min(44, Math.round(23 + twill * 7 - warp * 4 + noise * 0.6)));
            const i = (y * tile + x) * 4;
            wd[i] = lum - 1;
            wd[i + 1] = lum;
            wd[i + 2] = lum + 3;
            wd[i + 3] = 255;

            const rVal = Math.max(205, Math.min(250, Math.round(228 - twill * 12 + noise)));
            rd[i] = rd[i + 1] = rd[i + 2] = rVal;
            rd[i + 3] = 255;

            heights[y * tile + x] = 0.42 + twill * 0.16 - warp * 0.06 + (noise * 0.004);
        }
    }
    wCtx.putImageData(wImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);

    const albCanvas = tileCanvas(wTile, mainSize);
    const albCtx = albCanvas.getContext('2d', { willReadFrequently: true });
    const rghCanvas = tileCanvas(rTile, auxSize);
    const nrmCanvas = heightBufferToNormalCanvas(heights, tile, auxSize, 1.85);
    const nrmCtx = nrmCanvas.getContext('2d', { willReadFrequently: true });

    // Twin longitudinal topstitch seams along U ~ 0.21 & 0.79 and 3 structural bow bands along V
    for (const u of [0.21, 0.79]) {
        const sx = Math.round(u * mainSize);
        albCtx.fillStyle = 'rgba(8, 9, 12, 0.72)';
        albCtx.fillRect(sx - 2, 0, 4, mainSize);
        albCtx.setLineDash([6, 4]);
        albCtx.strokeStyle = 'rgba(72, 76, 86, 0.55)';
        albCtx.lineWidth = 1.4;
        for (const ox of [-4, 4]) {
            albCtx.beginPath();
            albCtx.moveTo(sx + ox, 0);
            albCtx.lineTo(sx + ox, mainSize);
            albCtx.stroke();
        }
        albCtx.setLineDash([]);

        const nx = Math.round(u * auxSize);
        nrmCtx.fillStyle = 'rgba(70, 128, 235, 0.55)';
        nrmCtx.fillRect(nx - 3, 0, 2, auxSize);
        nrmCtx.fillStyle = 'rgba(186, 128, 235, 0.55)';
        nrmCtx.fillRect(nx + 1, 0, 2, auxSize);
    }

    for (const v of [0.27, 0.52, 0.74]) {
        const by = Math.round(v * mainSize);
        const grad = albCtx.createLinearGradient(0, by - 10, 0, by + 10);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
        grad.addColorStop(1, 'rgba(0,0,0,0.08)');
        albCtx.fillStyle = grad;
        albCtx.fillRect(0, by - 10, mainSize, 20);
    }

    return {
        map: makeTexture(albCanvas, { srgb: true, anisotropy, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }),
        roughnessMap: makeTexture(rghCanvas, { srgb: false, anisotropy, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }),
        normalMap: makeTexture(nrmCanvas, { srgb: false, anisotropy, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping })
    };
}

function buildTireMaps(size, anisotropy) {
    // 1) Circumferential tread block + groove map (mapped along tire cylinder circumference & width)
    const w = size;
    const h = size;
    const [tAlb, tCtx] = makeCanvas(w, h);
    const [tHgt, thCtx] = makeCanvas(w, h);

    tCtx.fillStyle = '#151619';
    tCtx.fillRect(0, 0, w, h);
    thCtx.fillStyle = '#d4d4d4';
    thCtx.fillRect(0, 0, w, h);

    // Subtle rubber wear grain
    const rng = mulberry(30530);
    for (let i = 0; i < w * 6; i++) {
        const x = rng() * w;
        const y = rng() * h;
        tCtx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.06)';
        tCtx.fillRect(x, y, 2, 2);
    }

    // Main longitudinal rain grooves along X (in LatheGeometry, UV.x is circumference phi, UV.y is tread width!)
    const grooves = [0.22, 0.39, 0.61, 0.78];
    for (const v of grooves) {
        const gy = Math.round(v * h);
        const gw = Math.round(h * 0.042);
        tCtx.fillStyle = '#09090b';
        tCtx.fillRect(0, gy - gw / 2, w, gw);
        thCtx.fillStyle = '#242424';
        thCtx.fillRect(0, gy - gw / 2, w, gw);
    }

    // Angled shoulder sipes along U
    const pitch = w / 28;
    for (let i = 0; i < 28; i++) {
        const x0 = i * pitch;
        tCtx.strokeStyle = '#0a0a0d';
        thCtx.strokeStyle = '#363636';
        tCtx.lineWidth = Math.max(2, Math.round(w / 110));
        thCtx.lineWidth = tCtx.lineWidth;

        // Outer shoulders
        for (const [y0, y1] of [[0.03, 0.21], [0.97, 0.79]]) {
            tCtx.beginPath();
            tCtx.moveTo(x0, y0 * h);
            tCtx.lineTo(x0 + pitch * 0.55, y1 * h);
            tCtx.stroke();

            thCtx.beginPath();
            thCtx.moveTo(x0, y0 * h);
            thCtx.lineTo(x0 + pitch * 0.55, y1 * h);
            thCtx.stroke();
        }
        // Center angled sipes
        for (const [y0, y1] of [[0.4, 0.5], [0.6, 0.5]]) {
            tCtx.beginPath();
            tCtx.moveTo(x0 + pitch * 0.25, y0 * h);
            tCtx.lineTo(x0 + pitch * 0.75, y1 * h);
            tCtx.stroke();

            thCtx.beginPath();
            thCtx.moveTo(x0 + pitch * 0.25, y0 * h);
            thCtx.lineTo(x0 + pitch * 0.75, y1 * h);
            thCtx.stroke();
        }
    }

    const treadNormal = canvasToNormalTexture(tHgt, 2.5, { anisotropy, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });

    // 2) Tire sidewall disc (radial UV ring around rim)
    const [sAlb, sCtx] = makeCanvas(w, h);
    const [sHgt, shCtx] = makeCanvas(w, h);
    const cx = w / 2;
    const cy = h / 2;
    sCtx.fillStyle = '#16171b';
    sCtx.fillRect(0, 0, w, h);
    shCtx.fillStyle = '#909090';
    shCtx.fillRect(0, 0, w, h);

    // Concentric sidewall ribs & molded bead protector
    for (const [rf, lw, col, hcol] of [
        [0.48, 8, '#101114', '#b8b8b8'],
        [0.435, 3, '#1f2127', '#e0e0e0'],
        [0.39, 3, '#1f2127', '#d2d2d2'],
        [0.35, 6, '#121317', '#c0c0c0']
    ]) {
        sCtx.strokeStyle = col;
        sCtx.lineWidth = Math.max(2, Math.round((w / 512) * lw));
        sCtx.beginPath();
        sCtx.arc(cx, cy, w * rf, 0, Math.PI * 2);
        sCtx.stroke();

        shCtx.strokeStyle = hcol;
        shCtx.lineWidth = sCtx.lineWidth;
        shCtx.beginPath();
        shCtx.arc(cx, cy, w * rf, 0, Math.PI * 2);
        shCtx.stroke();
    }

    // Generic technical sidewall lettering curved around circumference
    const drawCurvedText = (ctx, text, radius, startAngle, fill) => {
        ctx.save();
        ctx.fillStyle = fill;
        ctx.font = `700 ${Math.round(w * 0.029)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const step = 0.088;
        for (let i = 0; i < text.length; i++) {
            const a = startAngle + i * step;
            ctx.save();
            ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
            ctx.rotate(a + Math.PI / 2);
            ctx.fillText(text[i], 0, 0);
            ctx.restore();
        }
        ctx.restore();
    };
    drawCurvedText(sCtx, '51 SPORT GT', w * 0.412, -Math.PI * 0.68, 'rgba(130, 136, 148, 0.52)');
    drawCurvedText(shCtx, '51 SPORT GT', w * 0.412, -Math.PI * 0.68, '#ffffff');
    drawCurvedText(sCtx, '305/30 ZR21', w * 0.412, Math.PI * 0.28, 'rgba(130, 136, 148, 0.52)');
    drawCurvedText(shCtx, '305/30 ZR21', w * 0.412, Math.PI * 0.28, '#ffffff');

    const sidewallNormal = canvasToNormalTexture(shCtx.canvas, 1.8, { anisotropy, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });

    return {
        treadMap: makeTexture(tAlb, { srgb: true, anisotropy, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, repeatX: 2, repeatY: 1 }),
        treadNormal,
        sidewallMap: makeTexture(sAlb, { srgb: true, anisotropy, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }),
        sidewallNormal
    };
}

function buildRotorMaps(size, anisotropy) {
    const [alb, ctx] = makeCanvas(size, size);
    const [hgt, hCtx] = makeCanvas(size, size);
    const cx = size / 2;
    const cy = size / 2;

    const grad = ctx.createRadialGradient(cx, cy, size * 0.14, cx, cy, size * 0.49);
    grad.addColorStop(0, '#5a5f68');
    grad.addColorStop(0.32, '#8b929d');
    grad.addColorStop(0.65, '#afb5bf');
    grad.addColorStop(1, '#757b84');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    hCtx.fillStyle = '#c8c8c8';
    hCtx.fillRect(0, 0, size, size);

    // Fine circumferential steel machining rings
    for (let r = size * 0.22; r < size * 0.47; r += Math.max(2, size / 140)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        hCtx.strokeStyle = 'rgba(245,245,245,0.35)';
        hCtx.beginPath();
        hCtx.arc(cx, cy, r, 0, Math.PI * 2);
        hCtx.stroke();
    }

    // Cross-drilled cooling ventilation holes along curved rotor vanes
    const holeR = Math.max(2, size * 0.0085);
    for (let arm = 0; arm < 20; arm++) {
        const baseA = (arm / 20) * Math.PI * 2;
        for (let step = 0; step < 4; step++) {
            const rad = size * (0.25 + step * 0.056);
            const ang = baseA + step * 0.075;
            const hx = cx + Math.cos(ang) * rad;
            const hy = cy + Math.sin(ang) * rad;
            ctx.fillStyle = '#181a1f';
            ctx.beginPath();
            ctx.arc(hx, hy, holeR, 0, Math.PI * 2);
            ctx.fill();

            hCtx.fillStyle = '#181818';
            hCtx.beginPath();
            hCtx.arc(hx, hy, holeR, 0, Math.PI * 2);
            hCtx.fill();
        }
    }

    return {
        map: makeTexture(alb, { srgb: true, anisotropy, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping }),
        normalMap: canvasToNormalTexture(hgt, 2.2, { anisotropy, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping })
    };
}

function buildInteriorTextures(size, anisotropy) {
    // 1) Perforated sport leather
    const tile = 128;
    const rng = mulberry(7788);
    const [lTile, lCtx] = makeCanvas(tile, tile);
    const heights = new Float32Array(tile * tile);
    lCtx.fillStyle = '#1c1e23';
    lCtx.fillRect(0, 0, tile, tile);
    heights.fill(0.56);
    for (let y = 0; y < tile; y += 6) {
        for (let x = 0; x < tile; x += 6) {
            const ox = (y % 12 === 0 ? 0 : 3) + (rng() - 0.5) * 0.4;
            lCtx.fillStyle = '#0e1013';
            lCtx.beginPath();
            lCtx.arc(x + ox, y, 1.05, 0, Math.PI * 2);
            lCtx.fill();
            const ix = Math.round(x + ox) & (tile - 1);
            heights[y * tile + ix] = 0.25;
        }
    }
    const leatherMap = makeTexture(tileCanvas(lTile, size), { srgb: true, anisotropy, repeatX: 3, repeatY: 3 });
    const leatherNormal = makeTexture(heightBufferToNormalCanvas(heights, tile, size, 1.35), { srgb: false, anisotropy, repeatX: 3, repeatY: 3 });

    // 2) Instrument cluster 5-dial sports tachometer + infotainment nav map
    const [dCanvas, dCtx] = makeCanvas(512, 192);
    dCtx.fillStyle = '#07090e';
    dCtx.fillRect(0, 0, 512, 192);
    const dials = [92, 168, 256, 344, 420];
    dials.forEach((dx, idx) => {
        const r = idx === 2 ? 52 : 34;
        const cy = 96;
        dCtx.strokeStyle = idx === 2 ? '#f6d117' : '#38bdf8';
        dCtx.lineWidth = idx === 2 ? 3 : 2;
        dCtx.beginPath();
        dCtx.arc(dx, cy, r, Math.PI * 0.72, Math.PI * 2.28);
        dCtx.stroke();
        // Tick marks
        for (let t = 0; t <= 12; t++) {
            const a = Math.PI * 0.72 + (t / 12) * Math.PI * 1.56;
            dCtx.strokeStyle = t >= 10 && idx === 2 ? '#ef4444' : 'rgba(226,232,240,0.65)';
            dCtx.lineWidth = 1.5;
            dCtx.beginPath();
            dCtx.moveTo(dx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
            dCtx.lineTo(dx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
            dCtx.stroke();
        }
        // Yellow needle
        const na = idx === 2 ? -Math.PI * 0.85 : Math.PI * 0.9;
        dCtx.strokeStyle = '#f6d117';
        dCtx.lineWidth = 2.5;
        dCtx.beginPath();
        dCtx.moveTo(dx, cy);
        dCtx.lineTo(dx + Math.cos(na) * (r - 9), cy + Math.sin(na) * (r - 9));
        dCtx.stroke();
    });
    const dashMap = makeTexture(dCanvas, { srgb: true, anisotropy, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });

    // 3) Clean generic 51-5HC European-proportion plate (original 51 Games identity)
    const [pCanvas, pCtx] = makeCanvas(512, 128);
    pCtx.fillStyle = '#f4f6f9';
    pCtx.fillRect(0, 0, 512, 128);
    pCtx.strokeStyle = '#181a1f';
    pCtx.lineWidth = 6;
    pCtx.strokeRect(3, 3, 506, 122);
    pCtx.fillStyle = '#1348a8';
    pCtx.fillRect(6, 6, 56, 116);
    pCtx.fillStyle = '#f6d117';
    pCtx.font = '800 22px system-ui, sans-serif';
    pCtx.textAlign = 'center';
    pCtx.fillText('51', 34, 48);
    pCtx.fillStyle = '#ffffff';
    pCtx.font = '800 20px system-ui, sans-serif';
    pCtx.fillText('FR', 34, 102);
    pCtx.fillStyle = '#111318';
    pCtx.font = '900 58px system-ui, sans-serif';
    pCtx.fillText('GT · 51 · 5HC', 282, 85);
    const plateMap = makeTexture(pCanvas, { srgb: true, anisotropy, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });

    return { leatherMap, leatherNormal, dashMap, plateMap };
}

let lightGlowTex = null;
function getLightGlowTexture() {
    if (lightGlowTex) return lightGlowTex;
    const [c, ctx] = makeCanvas(128, 128);
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.28, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    lightGlowTex = new THREE.CanvasTexture(c);
    return lightGlowTex;
}

const sharedCache = new Map();

export function getHeroCarSharedAssets({ mobile = isMobileDevice() } = {}) {
    const tier = mobile ? 'mob' : 'hd';
    if (sharedCache.has(tier)) return sharedCache.get(tier);

    // Fast GPU-lightweight texture budget (~7.5 MB total vs 116 MB): identical texel sharpness, instant shop opening
    const paintSize = mobile ? 256 : 512;
    const topMainSize = mobile ? 512 : 1024;
    const topAuxSize = mobile ? 256 : 512;
    const wheelSize = mobile ? 256 : 512;
    const interiorSize = 256;
    const anisotropy = mobile ? 4 : 8;

    const paintMaps = buildPaintMaps(paintSize, anisotropy);
    const softTopMaps = buildSoftTopMaps(topMainSize, topAuxSize, anisotropy);
    const tireMaps = buildTireMaps(wheelSize, anisotropy);
    const rotorMaps = buildRotorMaps(wheelSize, anisotropy);
    const interiorMaps = buildInteriorTextures(interiorSize, anisotropy);

    const assets = {
        paintMaps,
        softTopMat: new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            map: softTopMaps.map,
            normalMap: softTopMaps.normalMap,
            normalScale: new THREE.Vector2(0.85, 0.85),
            roughnessMap: softTopMaps.roughnessMap,
            roughness: 1.0,
            metalness: 0.02,
            sheen: 0.65,
            sheenRoughness: 0.72,
            sheenColor: new THREE.Color(0x464b58),
            envMapIntensity: 0.42
        }),
        tireTreadMat: new THREE.MeshStandardMaterial({
            map: tireMaps.treadMap,
            normalMap: tireMaps.treadNormal,
            normalScale: new THREE.Vector2(1.15, 1.15),
            roughness: 0.88,
            metalness: 0.02,
            envMapIntensity: 0.35
        }),
        tireSidewallMat: new THREE.MeshStandardMaterial({
            map: tireMaps.sidewallMap,
            normalMap: tireMaps.sidewallNormal,
            normalScale: new THREE.Vector2(0.95, 0.95),
            roughness: 0.86,
            metalness: 0.03,
            envMapIntensity: 0.4
        }),
        rotorMat: new THREE.MeshStandardMaterial({
            color: 0xd0d6df,
            map: rotorMaps.map,
            normalMap: rotorMaps.normalMap,
            normalScale: new THREE.Vector2(0.85, 0.85),
            metalness: 0.72,
            roughness: 0.26,
            envMapIntensity: 1.45
        }),
        rimDarkMat: new THREE.MeshStandardMaterial({
            color: 0x3b404a,
            metalness: 0.78,
            roughness: 0.28,
            envMapIntensity: 1.4
        }),
        rimFaceMat: new THREE.MeshStandardMaterial({
            color: 0xeef2f7,
            metalness: 0.9,
            roughness: 0.14,
            envMapIntensity: 1.6
        }),
        caliperMat: new THREE.MeshStandardMaterial({
            color: 0xffd60a,
            emissive: 0x261e00,
            metalness: 0.22,
            roughness: 0.16,
            envMapIntensity: 1.5
        }),
        windshieldMat: new THREE.MeshStandardMaterial({
            color: 0x0b121a,
            transparent: true,
            opacity: 0.46,
            roughness: 0.04,
            metalness: 0.14,
            envMapIntensity: 2.35,
            depthWrite: false,
            side: THREE.DoubleSide
        }),
        sideGlassMat: new THREE.MeshStandardMaterial({
            color: 0x0c141d,
            transparent: true,
            opacity: 0.5,
            roughness: 0.04,
            metalness: 0.14,
            envMapIntensity: 2.25,
            depthWrite: false,
            side: THREE.DoubleSide
        }),
        headlightLensMat: new THREE.MeshStandardMaterial({
            color: 0xf0f6ff,
            transparent: true,
            opacity: 0.22,
            roughness: 0.04,
            metalness: 0.12,
            envMapIntensity: 2.4,
            depthWrite: false
        }),
        tailLensMat: new THREE.MeshStandardMaterial({
            color: 0x7e060e,
            emissive: 0x1c0002,
            transparent: true,
            opacity: 0.68,
            roughness: 0.06,
            metalness: 0.14,
            envMapIntensity: 1.9,
            depthWrite: false
        }),
        glossBlackMat: new THREE.MeshStandardMaterial({
            color: 0x121317,
            metalness: 0.25,
            roughness: 0.12,
            envMapIntensity: 1.45
        }),
        matteBlackMat: new THREE.MeshStandardMaterial({
            color: 0x141519,
            metalness: 0.08,
            roughness: 0.84,
            envMapIntensity: 0.45
        }),
        archLinerMat: new THREE.MeshStandardMaterial({
            color: 0x0b0c0f,
            metalness: 0.04,
            roughness: 0.94,
            envMapIntensity: 0.2
        }),
        chromeMat: new THREE.MeshStandardMaterial({
            color: 0xd8dde5,
            metalness: 0.95,
            roughness: 0.12,
            envMapIntensity: 1.65
        }),
        exhaustMat: new THREE.MeshStandardMaterial({
            color: 0x9aa0aa,
            metalness: 0.9,
            roughness: 0.22,
            envMapIntensity: 1.4
        }),
        mirrorGlassMat: new THREE.MeshStandardMaterial({
            color: 0xaabccc,
            metalness: 0.96,
            roughness: 0.06,
            envMapIntensity: 2.0
        }),
        leatherMat: new THREE.MeshStandardMaterial({
            map: interiorMaps.leatherMap,
            normalMap: interiorMaps.leatherNormal,
            normalScale: new THREE.Vector2(0.65, 0.65),
            roughness: 0.68,
            metalness: 0.05,
            envMapIntensity: 0.55
        }),
        seatbeltMat: new THREE.MeshStandardMaterial({
            color: 0xe6be14,
            roughness: 0.65,
            metalness: 0.04
        }),
        dashGaugeMat: new THREE.MeshStandardMaterial({
            map: interiorMaps.dashMap,
            emissiveMap: interiorMaps.dashMap,
            emissive: 0xffffff,
            emissiveIntensity: 0.85,
            roughness: 0.2,
            metalness: 0.1
        }),
        plateMat: new THREE.MeshStandardMaterial({
            map: interiorMaps.plateMap,
            roughness: 0.35,
            metalness: 0.18
        }),
        reflectorRedMat: new THREE.MeshStandardMaterial({
            color: 0xaa111a,
            emissive: 0x220204,
            roughness: 0.25,
            metalness: 0.2
        }),
        sideMarkerAmberMat: new THREE.MeshStandardMaterial({
            color: 0x3b2a10,
            emissive: 0x261400,
            roughness: 0.22,
            metalness: 0.25
        })
    };

    sharedCache.set(tier, assets);
    return assets;
}

export function createCarPaintMaterial(hexColor = 0xffd510, opts = {}) {
    const shared = getHeroCarSharedAssets(opts);
    return new THREE.MeshPhysicalMaterial({
        color: hexColor,
        map: shared.paintMaps.map,
        normalMap: shared.paintMaps.normalMap,
        normalScale: new THREE.Vector2(0.10, 0.10),
        roughnessMap: shared.paintMaps.roughnessMap,
        roughness: 0.16,
        metalness: 0.18,
        clearcoat: 1.0,
        clearcoatRoughness: 0.028,
        reflectivity: 0.96,
        envMapIntensity: 1.48
    });
}

/**
 * Per-instance dynamic optical materials & glow sprites for independent lights
 * on every spawned GT 51 Cabrio (showroom + road + traffic).
 */
export function createDynamicLightMaterials() {
    const glowTex = getLightGlowTexture();
    const drlMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
    const lowBeamMat = new THREE.MeshBasicMaterial({ color: 0xdceaff });
    const tailRunMat = new THREE.MeshBasicMaterial({ color: 0xd9141c });
    const brakeMat = new THREE.MeshBasicMaterial({ color: 0x6c080d });
    const reverseMat = new THREE.MeshBasicMaterial({ color: 0x3b3d42 });
    const turnLMat = new THREE.MeshBasicMaterial({ color: 0x2c1b06 });
    const turnRMat = new THREE.MeshBasicMaterial({ color: 0x2c1b06 });

    const brakeGlowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xff1e24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0
    });
    const reverseGlowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xf4f8ff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0
    });
    const headGlowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xf2f7ff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.14
    });

    return {
        drlMat,
        lowBeamMat,
        tailRunMat,
        brakeMat,
        reverseMat,
        turnLMat,
        turnRMat,
        brakeGlowMat,
        reverseGlowMat,
        headGlowMat
    };
}

const thumbCache = new Map();

/**
 * Studio side-profile vector render of GT 51 Cabrio for Boutique cards & unboxing modal.
 */
export function createHeroCarThumbnail(colourHex = 0xf6d117) {
    const hexKey = Number(colourHex || 0xf6d117) >>> 0;
    if (thumbCache.has(hexKey)) return thumbCache.get(hexKey);

    const w = 400;
    const h = 240;
    const [canvas, ctx] = makeCanvas(w, h);
    const bodyHex = `#${hexKey.toString(16).padStart(6, '0')}`;
    const c = new THREE.Color(hexKey);
    const lightCol = `#${c.clone().offsetHSL(0, 0.04, 0.14).getHexString()}`;
    const darkCol = `#${c.clone().offsetHSL(0, 0.02, -0.22).getHexString()}`;

    // Dark automotive studio backdrop + floor glow
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.44, 14, w * 0.5, h * 0.52, w * 0.68);
    bg.addColorStop(0, '#222836');
    bg.addColorStop(0.55, '#12151f');
    bg.addColorStop(1, '#080a0f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle overhead softbox stripe
    const overhead = ctx.createLinearGradient(0, 12, 0, 110);
    overhead.addColorStop(0, 'rgba(255, 250, 232, 0.14)');
    overhead.addColorStop(1, 'rgba(255, 250, 232, 0)');
    ctx.fillStyle = overhead;
    ctx.fillRect(50, 14, 300, 96);

    // Floor contact shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.beginPath();
    ctx.ellipse(202, 180, 156, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Front = left (facing left like reference photo!)
    // Black fabric convertible soft top
    const topGrad = ctx.createLinearGradient(0, 82, 0, 118);
    topGrad.addColorStop(0, '#2c303a');
    topGrad.addColorStop(0.5, '#191b22');
    topGrad.addColorStop(1, '#101217');
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(148, 114);
    ctx.quadraticCurveTo(175, 86, 206, 86);
    ctx.bezierCurveTo(246, 86, 286, 98, 316, 116);
    ctx.lineTo(142, 118);
    ctx.closePath();
    ctx.fill();

    // Side window opening + subtle glass gradient + yellow mirror stalk/head
    const glassGrad = ctx.createLinearGradient(0, 92, 0, 118);
    glassGrad.addColorStop(0, '#101720');
    glassGrad.addColorStop(1, '#253344');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.moveTo(148, 116);
    ctx.quadraticCurveTo(176, 94, 212, 95);
    ctx.lineTo(256, 106);
    ctx.lineTo(260, 118);
    ctx.closePath();
    ctx.fill();

    // Yellow body paint gradient along side profile
    const paintGrad = ctx.createLinearGradient(0, 108, 0, 174);
    paintGrad.addColorStop(0, lightCol);
    paintGrad.addColorStop(0.45, bodyHex);
    paintGrad.addColorStop(1, darkCol);
    ctx.fillStyle = paintGrad;
    ctx.beginPath();
    ctx.moveTo(46, 162);
    ctx.quadraticCurveTo(44, 146, 56, 136);
    ctx.quadraticCurveTo(88, 121, 136, 116);
    ctx.lineTo(164, 92);
    ctx.lineTo(174, 93);
    ctx.lineTo(154, 116);
    ctx.lineTo(290, 118);
    ctx.quadraticCurveTo(324, 116, 352, 130);
    ctx.quadraticCurveTo(360, 142, 356, 160);
    ctx.lineTo(318, 166);
    ctx.lineTo(80, 167);
    ctx.closePath();
    ctx.fill();

    // Dark bumper lower intakes & rear diffuser
    ctx.fillStyle = '#0e1015';
    ctx.fillRect(49, 152, 22, 12);
    ctx.fillRect(326, 152, 29, 12);
    ctx.fillRect(118, 165, 158, 4);

    // Sloped front headlight & sleek rear LED taillight blade
    ctx.fillStyle = '#dbeafe';
    ctx.beginPath();
    ctx.ellipse(66, 134, 13, 5, -0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(328, 135, 25, 4);

    // Painted side mirror & door shut line
    ctx.fillStyle = bodyHex;
    ctx.beginPath();
    ctx.ellipse(160, 113, 9, 4.5, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(152, 120);
    ctx.lineTo(156, 163);
    ctx.stroke();

    // Twin 10-spoke wheels with yellow brake calipers
    for (const [wx, r] of [[104, 26.5], [296, 28]]) {
        ctx.fillStyle = '#0c0d11';
        ctx.beginPath();
        ctx.arc(wx, 158, r + 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#181a20';
        ctx.beginPath();
        ctx.arc(wx, 158, r, 0, Math.PI * 2);
        ctx.fill();

        // Yellow caliper
        ctx.fillStyle = '#f4cb12';
        ctx.beginPath();
        ctx.arc(wx + (wx < 200 ? 7 : -7), 156, r * 0.5, -0.7, 0.8);
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#f4cb12';
        ctx.stroke();

        // Rim & twin spokes
        ctx.strokeStyle = '#d4dae3';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.arc(wx, 158, r * 0.68, 0, Math.PI * 2);
        ctx.stroke();
        for (let k = 0; k < 10; k++) {
            const a = (k * Math.PI * 2) / 10 + (k % 2 ? 0.14 : -0.14);
            ctx.beginPath();
            ctx.moveTo(wx, 158);
            ctx.lineTo(wx + Math.cos(a) * r * 0.67, 158 + Math.sin(a) * r * 0.67);
            ctx.stroke();
        }
        ctx.fillStyle = '#2d3139';
        ctx.beginPath();
        ctx.arc(wx, 158, 4.5, 0, Math.PI * 2);
        ctx.fill();
    }

    const url = canvas.toDataURL('image/png');
    thumbCache.set(hexKey, url);
    return url;
}

const greyStormThumbCache = new Map();

export function createGreyStormThumbnail(colourHex = 0x777d84) {
    const hexKey = Number(colourHex || 0x777d84) >>> 0;
    if (greyStormThumbCache.has(hexKey)) return greyStormThumbCache.get(hexKey);

    const w = 400;
    const h = 240;
    const [canvas, ctx] = makeCanvas(w, h);
    const bodyHex = `#${hexKey.toString(16).padStart(6, '0')}`;
    const c = new THREE.Color(hexKey);
    const lightCol = `#${c.clone().offsetHSL(0, 0.02, 0.16).getHexString()}`;
    const darkCol = `#${c.clone().offsetHSL(0, 0.01, -0.22).getHexString()}`;

    const bg = ctx.createRadialGradient(200, 112, 12, 200, 126, 210);
    bg.addColorStop(0, '#252b36');
    bg.addColorStop(0.58, '#121620');
    bg.addColorStop(1, '#080a0f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.beginPath();
    ctx.ellipse(204, 182, 158, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    const paint = ctx.createLinearGradient(0, 106, 0, 178);
    paint.addColorStop(0, lightCol);
    paint.addColorStop(0.45, bodyHex);
    paint.addColorStop(1, darkCol);

    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.moveTo(42, 158);
    ctx.quadraticCurveTo(48, 138, 68, 126);
    ctx.quadraticCurveTo(112, 108, 158, 106);
    ctx.lineTo(190, 74);
    ctx.quadraticCurveTo(214, 62, 250, 70);
    ctx.quadraticCurveTo(292, 78, 318, 104);
    ctx.quadraticCurveTo(346, 116, 358, 137);
    ctx.lineTo(358, 158);
    ctx.lineTo(318, 166);
    ctx.lineTo(78, 166);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#11161d';
    ctx.beginPath();
    ctx.moveTo(186, 80);
    ctx.quadraticCurveTo(214, 66, 248, 73);
    ctx.quadraticCurveTo(286, 80, 308, 105);
    ctx.lineTo(248, 108);
    ctx.lineTo(188, 106);
    ctx.closePath();
    ctx.fill();

    const glass = ctx.createLinearGradient(0, 76, 0, 116);
    glass.addColorStop(0, '#172d40');
    glass.addColorStop(1, '#080d13');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(188, 82);
    ctx.quadraticCurveTo(215, 68, 246, 76);
    ctx.quadraticCurveTo(276, 82, 294, 106);
    ctx.lineTo(248, 108);
    ctx.lineTo(188, 106);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#101318';
    ctx.fillRect(42, 151, 34, 13);
    ctx.fillRect(318, 151, 38, 13);
    ctx.fillRect(112, 164, 174, 5);

    ctx.fillStyle = '#f2f7ff';
    ctx.beginPath();
    ctx.ellipse(64, 132, 16, 5, -0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff2530';
    ctx.fillRect(327, 132, 29, 4);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(214, 108);
    ctx.lineTo(218, 164);
    ctx.moveTo(298, 108);
    ctx.lineTo(302, 164);
    ctx.stroke();

    for (const wx of [102, 302]) {
        ctx.fillStyle = '#090a0d';
        ctx.beginPath();
        ctx.arc(wx, 158, 31, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#282c33';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(wx, 158, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#7e8791';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(wx, 158, 20, 0, Math.PI * 2);
        ctx.stroke();
        for (let k = 0; k < 10; k++) {
            const a = k * Math.PI / 5 + 0.08;
            ctx.beginPath();
            ctx.moveTo(wx, 158);
            ctx.lineTo(wx + Math.cos(a) * 19, 158 + Math.sin(a) * 19);
            ctx.stroke();
        }
        ctx.fillStyle = '#b71320';
        ctx.beginPath();
        ctx.ellipse(wx + (wx < 200 ? 8 : -8), 158, 5, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b8bec4';
        ctx.beginPath();
        ctx.arc(wx, 158, 4.5, 0, Math.PI * 2);
        ctx.fill();
    }

    const url = canvas.toDataURL('image/png');
    greyStormThumbCache.set(hexKey, url);
    return url;
}
