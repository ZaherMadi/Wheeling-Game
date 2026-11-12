// Procedural textures for the realistic version. Everything is painted once
// on a 2D canvas at startup: no image downloads, tiny bundle, same look on
// every device.
import * as THREE from 'three';

export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, { repeat = false, srgb = true, anisotropy = 1 } = {}) {
    const texture = new THREE.CanvasTexture(canvas);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    return texture;
}

// --- Sky --------------------------------------------------------------------

export const SUN_DIRECTION = new THREE.Vector3(0.13, 0.2, -1).normalize();
export const HORIZON_COLOR = '#c3d3e6';

function drawCloud(ctx, random, cx, cy, width, warmth) {
    const height = width * 0.34;
    const puffs = 16 + Math.floor(random() * 12);
    const blobs = [];
    for (let i = 0; i < puffs; i++) {
        const t = random();
        const x = cx + (t - 0.5) * width;
        const arch = 1 - Math.pow((t - 0.5) * 2, 2);
        const y = cy - arch * height * (0.35 + random() * 0.65);
        const radius = width * (0.07 + random() * 0.09) * (0.6 + arch * 0.7);
        blobs.push({ x, y, radius });
    }
    // Shaded underside first, lit tops on top.
    for (const { x, y, radius } of blobs) {
        const gradient = ctx.createRadialGradient(x, y + radius * 0.35, 0, x, y + radius * 0.35, radius * 1.15);
        gradient.addColorStop(0, 'rgba(118,136,172,0.5)');
        gradient.addColorStop(1, 'rgba(118,136,172,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius * 2, y - radius * 2, radius * 4, radius * 4);
    }
    const lit = warmth > 0.5 ? '255,236,205' : '255,255,255';
    for (const { x, y, radius } of blobs) {
        const gradient = ctx.createRadialGradient(x, y - radius * 0.2, 0, x, y - radius * 0.2, radius);
        gradient.addColorStop(0, `rgba(${lit},0.95)`);
        gradient.addColorStop(0.55, `rgba(${lit},0.5)`);
        gradient.addColorStop(1, `rgba(${lit},0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius * 2, y - radius * 2, radius * 4, radius * 4);
    }
}

export function createSkyTexture(lowQuality) {
    const width = lowQuality ? 1024 : 2048;
    const height = width / 2;
    const [canvas, ctx] = makeCanvas(width, height);
    const random = mulberry32(51);

    const horizonY = height / 2;
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, '#12357f');
    sky.addColorStop(0.45, '#2a62bd');
    sky.addColorStop(0.8, '#6ea3e0');
    sky.addColorStop(1, HORIZON_COLOR);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizonY);
    // Below the horizon: hazy ground bounce, only ever seen in reflections.
    const ground = ctx.createLinearGradient(0, horizonY, 0, height);
    ground.addColorStop(0, HORIZON_COLOR);
    ground.addColorStop(0.2, '#56606e');
    ground.addColorStop(1, '#23272e');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // Equirect mapping used by three: u = atan2(z, x) / 2PI + 0.5
    const sunU = Math.atan2(SUN_DIRECTION.z, SUN_DIRECTION.x) / (Math.PI * 2) + 0.5;
    const sunV = Math.asin(SUN_DIRECTION.y) / Math.PI + 0.5;
    const sunX = sunU * width;
    const sunY = (1 - sunV) * height;

    // Warm band along the horizon around the sun.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const band = ctx.createRadialGradient(sunX, horizonY, 0, sunX, horizonY, width * 0.3);
    band.addColorStop(0, 'rgba(255,190,120,0.55)');
    band.addColorStop(0.5, 'rgba(255,170,110,0.18)');
    band.addColorStop(1, 'rgba(255,170,110,0)');
    ctx.fillStyle = band;
    ctx.save();
    ctx.translate(sunX, horizonY);
    ctx.scale(1, 0.3);
    ctx.translate(-sunX, -horizonY);
    ctx.fillRect(0, horizonY - width, width, width * 2);
    ctx.restore();
    ctx.restore();

    // Clouds, denser ahead of the rider (u ~ 0.25).
    const cloudCount = lowQuality ? 26 : 40;
    for (let i = 0; i < cloudCount; i++) {
        const u = i < cloudCount * 0.6 ? 0.25 + (random() - 0.5) * 0.42 : random();
        const elevation = 0.05 + Math.pow(random(), 1.4) * 0.3;
        const cloudWidth = width * (0.03 + random() * 0.07) * (0.7 + elevation * 2);
        const x = u * width;
        const y = horizonY - elevation * height;
        const warmth = 1 - Math.min(1, Math.abs(u - sunU) * 7);
        drawCloud(ctx, random, x, y, cloudWidth, warmth);
        if (x < cloudWidth) drawCloud(ctx, random, x + width, y, cloudWidth, warmth);
        if (x > width - cloudWidth) drawCloud(ctx, random, x - width, y, cloudWidth, warmth);
    }

    // Sun: wide halo, bloom, core.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [radius, color] of [
        [width * 0.16, 'rgba(255,200,140,0.32)'],
        [width * 0.06, 'rgba(255,225,180,0.6)'],
        [width * 0.018, 'rgba(255,255,245,1)']
    ]) {
        const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius);
        glow.addColorStop(0, color);
        glow.addColorStop(1, 'rgba(255,200,140,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(sunX - radius, sunY - radius, radius * 2, radius * 2);
    }
    ctx.restore();

    const texture = toTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
}

// --- Road -------------------------------------------------------------------

// One tile covers the full 20 m road width and 50 m of length.
export function createRoadTextures(lowQuality, anisotropy) {
    const width = lowQuality ? 512 : 1024;
    const height = width * 2;
    const metersX = 20;
    const metersY = 50;
    const px = width / metersX;
    const py = height / metersY;
    const random = mulberry32(7);

    const [colorCanvas, color] = makeCanvas(width, height);
    const [roughCanvas, rough] = makeCanvas(width, height);

    color.fillStyle = '#22252b';
    color.fillRect(0, 0, width, height);
    rough.fillStyle = 'rgb(0,100,0)';
    rough.fillRect(0, 0, width, height);

    // Aggregate speckle
    const speckles = width * height / 22;
    for (let i = 0; i < speckles; i++) {
        const shade = 22 + Math.floor(random() * 46);
        color.fillStyle = `rgba(${shade},${shade + 2},${shade + 6},${0.35 + random() * 0.4})`;
        const size = 1 + random() * 1.6;
        color.fillRect(random() * width, random() * height, size, size);
    }
    // Large tonal patches (repairs, wear)
    for (let i = 0; i < 26; i++) {
        const x = random() * width;
        const y = random() * height;
        const radius = (1.5 + random() * 4) * px;
        const dark = random() > 0.45;
        const gradient = color.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, dark ? 'rgba(8,9,12,0.35)' : 'rgba(80,84,92,0.16)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        color.fillStyle = gradient;
        for (const offset of [0, -height, height]) {
            color.save();
            color.translate(0, offset);
            color.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            color.restore();
        }
    }
    // Tyre-polished lanes
    for (const laneCenter of [-7.5, -2.5, 2.5, 7.5]) {
        for (const track of [-0.8, 0.8]) {
            const x = (laneCenter + track + metersX / 2) * px;
            const gradient = color.createLinearGradient(x - px * 0.6, 0, x + px * 0.6, 0);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(0.5, 'rgba(6,7,10,0.22)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            color.fillStyle = gradient;
            color.fillRect(x - px * 0.6, 0, px * 1.2, height);
            rough.fillStyle = 'rgba(0,70,0,0.25)';
            rough.fillRect(x - px * 0.4, 0, px * 0.8, height);
        }
    }
    // Cracks
    color.strokeStyle = 'rgba(5,6,8,0.6)';
    color.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
        let x = random() * width;
        let y = random() * height;
        color.beginPath();
        color.moveTo(x, y);
        const steps = 6 + Math.floor(random() * 10);
        for (let s = 0; s < steps; s++) {
            x += (random() - 0.5) * px * 1.2;
            y += (random() - 0.2) * py * 1.1;
            color.lineTo(x, y);
        }
        color.stroke();
    }

    // Puddles: mirror-smooth, slightly darker.
    for (let i = 0; i < 11; i++) {
        const cx = random() * width;
        const cy = random() * height;
        const blobs = 2 + Math.floor(random() * 3);
        const base = (0.45 + random() * 1.1) * px;
        for (let b = 0; b < blobs; b++) {
            const x = cx + (random() - 0.5) * base * 2.2;
            const y = cy + (random() - 0.5) * base * 3.5;
            const rx = base * (0.5 + random() * 0.8);
            const ry = rx * (1.2 + random() * 1.3);
            for (const offset of [0, -height, height]) {
                rough.save();
                rough.translate(x, y + offset);
                rough.scale(1, ry / rx);
                const puddle = rough.createRadialGradient(0, 0, 0, 0, 0, rx);
                puddle.addColorStop(0, 'rgba(0,38,0,1)');
                puddle.addColorStop(0.6, 'rgba(0,42,0,0.9)');
                puddle.addColorStop(1, 'rgba(0,42,0,0)');
                rough.fillStyle = puddle;
                rough.fillRect(-rx, -rx, rx * 2, rx * 2);
                rough.restore();

                color.save();
                color.translate(x, y + offset);
                color.scale(1, ry / rx);
                const wet = color.createRadialGradient(0, 0, 0, 0, 0, rx);
                wet.addColorStop(0, 'rgba(6,8,12,0.28)');
                wet.addColorStop(0.75, 'rgba(6,8,12,0.2)');
                wet.addColorStop(1, 'rgba(6,8,12,0)');
                color.fillStyle = wet;
                color.fillRect(-rx, -rx, rx * 2, rx * 2);
                color.restore();
            }
        }
    }

    // Markings (10 m period -> seamless over the 50 m tile)
    const paint = (xMeters, widthMeters, onMeters, periodMeters, alpha) => {
        const x = (xMeters + metersX / 2 - widthMeters / 2) * px;
        for (let m = 0; m < metersY; m += periodMeters) {
            color.fillStyle = `rgba(232,234,238,${alpha})`;
            color.fillRect(x, m * py, widthMeters * px, onMeters * py);
            rough.fillStyle = 'rgba(0,95,0,0.9)';
            rough.fillRect(x, m * py, widthMeters * px, onMeters * py);
            // Worn paint
            for (let w = 0; w < onMeters * 6; w++) {
                color.fillStyle = 'rgba(34,37,43,0.5)';
                color.fillRect(x + random() * widthMeters * px, (m + random() * onMeters) * py, 1 + random() * 2, 1 + random() * 3);
            }
        }
    };
    paint(0, 0.22, 6, 10, 0.95);
    paint(-5, 0.16, 3, 10, 0.85);
    paint(5, 0.16, 3, 10, 0.85);
    paint(-9.55, 0.14, 10, 10, 0.55);
    paint(9.55, 0.14, 10, 10, 0.55);

    // Gutter grime near the curbs
    for (const side of [0, 1]) {
        const gradient = color.createLinearGradient(side ? width : 0, 0, side ? width - px * 0.9 : px * 0.9, 0);
        gradient.addColorStop(0, 'rgba(4,5,7,0.55)');
        gradient.addColorStop(1, 'rgba(4,5,7,0)');
        color.fillStyle = gradient;
        color.fillRect(side ? width - px * 0.9 : 0, 0, px * 0.9, height);
    }

    const map = toTexture(colorCanvas, { repeat: true, anisotropy });
    const roughnessMap = toTexture(roughCanvas, { repeat: true, srgb: false, anisotropy });
    return { map, roughnessMap };
}

export function createSidewalkTexture(anisotropy) {
    const size = 256;
    const [canvas, ctx] = makeCanvas(size, size);
    const random = mulberry32(13);
    ctx.fillStyle = '#7d8088';
    ctx.fillRect(0, 0, size, size);
    const cells = 4;
    const cell = size / cells;
    for (let row = 0; row < cells; row++) {
        for (let col = 0; col < cells; col++) {
            const shade = 112 + Math.floor(random() * 30);
            ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 8})`;
            ctx.fillRect(col * cell + 1.5, row * cell + 1.5, cell - 3, cell - 3);
            for (let i = 0; i < 40; i++) {
                const noise = 90 + Math.floor(random() * 70);
                ctx.fillStyle = `rgba(${noise},${noise},${noise + 6},0.25)`;
                ctx.fillRect(col * cell + random() * cell, row * cell + random() * cell, 2, 2);
            }
        }
    }
    ctx.strokeStyle = 'rgba(40,42,48,0.9)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= cells; i++) {
        ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
    }
    return toTexture(canvas, { repeat: true, anisotropy });
}

// --- Facades ----------------------------------------------------------------

// Each facade tile is `cols` x `rows` windows and tiles in both directions.
// Returns the albedo and an emissive map with the lit windows.
export const FACADE_STYLES = [
    { name: 'glass', cols: 8, rows: 8, cellWidth: 2.2, cellHeight: 3.6, roughness: 0.16, envMapIntensity: 1.25 },
    { name: 'office', cols: 6, rows: 8, cellWidth: 3.2, cellHeight: 3.5, roughness: 0.7, envMapIntensity: 0.5 },
    { name: 'residential', cols: 6, rows: 8, cellWidth: 3, cellHeight: 3.2, roughness: 0.85, envMapIntensity: 0.25 }
];

export function createFacadeTextures(style, seed, anisotropy) {
    const size = 512;
    const [colorCanvas, color] = makeCanvas(size, size);
    const [glowCanvas, glow] = makeCanvas(size, size);
    const random = mulberry32(seed);
    const cellW = size / style.cols;
    const cellH = size / style.rows;
    glow.fillStyle = '#000';
    glow.fillRect(0, 0, size, size);

    const warm = () => {
        const tint = random();
        if (tint < 0.6) return [255, 196 + random() * 30, 120 + random() * 40];
        if (tint < 0.85) return [255, 226, 180];
        return [190, 220, 255];
    };

    if (style.name === 'glass') {
        color.fillStyle = '#16304f';
        color.fillRect(0, 0, size, size);
        for (let row = 0; row < style.rows; row++) {
            for (let col = 0; col < style.cols; col++) {
                const x = col * cellW;
                const y = row * cellH;
                const depth = 26 + random() * 34;
                const pane = color.createLinearGradient(x, y, x, y + cellH);
                pane.addColorStop(0, `rgb(${depth + 18},${depth + 62},${depth + 110})`);
                pane.addColorStop(1, `rgb(${depth - 6},${depth + 26},${depth + 70})`);
                color.fillStyle = pane;
                color.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
                if (random() < 0.2) {
                    const [r, g, b] = warm();
                    const strength = 0.55 + random() * 0.45;
                    glow.fillStyle = `rgba(${r},${g},${b},${strength})`;
                    glow.fillRect(x + 4, y + 5, cellW - 8, cellH - 12);
                    color.fillStyle = `rgba(${r},${g},${b},0.5)`;
                    color.fillRect(x + 4, y + 5, cellW - 8, cellH - 12);
                }
            }
        }
        color.fillStyle = '#0c1826';
        for (let col = 0; col <= style.cols; col++) color.fillRect(col * cellW - 1.5, 0, 3, size);
        for (let row = 0; row <= style.rows; row++) color.fillRect(0, row * cellH - 2.5, size, 5);
    } else {
        const office = style.name === 'office';
        color.fillStyle = office ? '#8a8f98' : '#9a8674';
        color.fillRect(0, 0, size, size);
        for (let i = 0; i < 2600; i++) {
            const noise = Math.floor(random() * 50);
            color.fillStyle = `rgba(${noise},${noise},${noise},0.07)`;
            color.fillRect(random() * size, random() * size, 3, 3);
        }
        for (let row = 0; row < style.rows; row++) {
            for (let col = 0; col < style.cols; col++) {
                const marginX = office ? cellW * 0.08 : cellW * 0.24;
                const top = office ? cellH * 0.22 : cellH * 0.2;
                const windowHeight = office ? cellH * 0.5 : cellH * 0.56;
                const x = col * cellW + marginX;
                const y = row * cellH + top;
                const w = cellW - marginX * 2;
                const depth = 16 + random() * 22;
                const pane = color.createLinearGradient(x, y, x, y + windowHeight);
                pane.addColorStop(0, `rgb(${depth + 14},${depth + 44},${depth + 76})`);
                pane.addColorStop(1, `rgb(${depth},${depth + 14},${depth + 34})`);
                color.fillStyle = pane;
                color.fillRect(x, y, w, windowHeight);
                color.fillStyle = 'rgba(20,22,26,0.9)';
                color.fillRect(x + w / 2 - 1, y, 2, windowHeight);
                color.fillStyle = office ? '#6f747c' : '#7a6a5c';
                color.fillRect(x - 2, y + windowHeight, w + 4, 4);
                if (random() < (office ? 0.24 : 0.3)) {
                    const [r, g, b] = warm();
                    const strength = 0.6 + random() * 0.4;
                    glow.fillStyle = `rgba(${r},${g},${b},${strength})`;
                    glow.fillRect(x + 1, y + 1, w - 2, windowHeight - 2);
                    color.fillStyle = `rgba(${r},${g},${b},0.6)`;
                    color.fillRect(x + 1, y + 1, w - 2, windowHeight - 2);
                }
            }
            // Floor band
            color.fillStyle = 'rgba(0,0,0,0.14)';
            color.fillRect(0, row * cellH, size, 3);
        }
    }

    return {
        map: toTexture(colorCanvas, { repeat: true, anisotropy }),
        emissiveMap: toTexture(glowCanvas, { repeat: true, anisotropy })
    };
}

// Strip of lit shop windows, tiles horizontally. 24 m wide, 4.6 m tall.
export function createShopfrontTexture(anisotropy) {
    const width = 1024;
    const height = 256;
    const [canvas, ctx] = makeCanvas(width, height);
    const random = mulberry32(99);
    ctx.fillStyle = '#1a1c22';
    ctx.fillRect(0, 0, width, height);
    const bays = 6;
    const bayWidth = width / bays;
    const awnings = ['#b6402f', '#2f5d8a', '#3a7a54', '#c98a2b', '#56418a', '#b6402f'];
    for (let bay = 0; bay < bays; bay++) {
        const x = bay * bayWidth;
        // Sign band
        ctx.fillStyle = '#24272f';
        ctx.fillRect(x + 4, 6, bayWidth - 8, 44);
        ctx.fillStyle = `rgba(255,${200 + random() * 40},${140 + random() * 80},0.9)`;
        const signWidth = bayWidth * (0.35 + random() * 0.3);
        ctx.fillRect(x + (bayWidth - signWidth) / 2, 20, signWidth, 14);
        // Window
        const glass = ctx.createLinearGradient(0, 60, 0, height);
        glass.addColorStop(0, '#ffe6b0');
        glass.addColorStop(0.5, '#ffc777');
        glass.addColorStop(1, '#e29a4a');
        ctx.fillStyle = glass;
        ctx.fillRect(x + 10, 62, bayWidth - 20, height - 78);
        // Interior silhouettes
        for (let i = 0; i < 7; i++) {
            ctx.fillStyle = `rgba(${90 + random() * 60},${50 + random() * 40},${20 + random() * 30},0.45)`;
            const w = 10 + random() * 26;
            const h = 20 + random() * 70;
            ctx.fillRect(x + 14 + random() * (bayWidth - 40 - w), height - 18 - h, w, h);
        }
        // Mullions, door
        ctx.fillStyle = '#14161b';
        ctx.fillRect(x + bayWidth * 0.5 - 2, 62, 4, height - 78);
        if (bay % 2 === 0) ctx.fillRect(x + bayWidth * 0.72, 62, 4, height - 78);
        ctx.fillRect(x + 10, 110, bayWidth - 20, 3);
        // Awning
        ctx.fillStyle = awnings[bay];
        ctx.beginPath();
        ctx.moveTo(x + 6, 52);
        ctx.lineTo(x + bayWidth - 6, 52);
        ctx.lineTo(x + bayWidth - 2, 74);
        ctx.lineTo(x + 2, 74);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x + 2, 70, bayWidth - 4, 4);
        // Plinth
        ctx.fillStyle = '#2b2e36';
        ctx.fillRect(x, height - 16, bayWidth, 16);
    }
    const texture = toTexture(canvas, { anisotropy });
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
}

// --- Small helpers ----------------------------------------------------------

export function createGlowTexture() {
    const size = 128;
    const [canvas, ctx] = makeCanvas(size, size);
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return toTexture(canvas);
}

export function createSkylineTexture() {
    const width = 2048;
    const height = 512;
    const [canvas, ctx] = makeCanvas(width, height);
    const random = mulberry32(2026);
    for (const [layer, colorTop, colorBottom, alpha] of [
        [0, '#8fa9cc', '#b7c7dc', 0.75],
        [1, '#5d7eae', '#a3b6d1', 0.92]
    ]) {
        let x = -20;
        while (x < width) {
            const w = 26 + random() * 60;
            const centre = 1 - Math.min(1, Math.abs(x + w / 2 - width / 2) / (width * 0.5));
            const h = (70 + random() * 190 + centre * 150) * (layer ? 0.8 : 1);
            const gradient = ctx.createLinearGradient(0, height - h, 0, height);
            gradient.addColorStop(0, colorTop);
            gradient.addColorStop(1, colorBottom);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = gradient;
            ctx.fillRect(x, height - h, w, h);
            if (random() > 0.6) ctx.fillRect(x + w * 0.3, height - h - 16 - random() * 30, w * 0.4, 50);
            // Lit windows
            ctx.globalAlpha = 0.5 + layer * 0.3;
            for (let i = 0; i < w * h / 190; i++) {
                ctx.fillStyle = random() > 0.3 ? '#ffe2a8' : '#d8ecff';
                ctx.fillRect(x + 3 + random() * (w - 7), height - h + 6 + random() * (h - 12), 2, 2.4);
            }
            x += w + random() * 14 - 2;
        }
    }
    ctx.globalAlpha = 1;
    // Haze rising from the street
    const haze = ctx.createLinearGradient(0, height * 0.45, 0, height);
    haze.addColorStop(0, 'rgba(195,211,230,0)');
    haze.addColorStop(1, 'rgba(195,211,230,0.85)');
    ctx.fillStyle = haze;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    return toTexture(canvas);
}

export function createJerseyTexture() {
    const size = 256;
    const [canvas, ctx] = makeCanvas(size, size);
    ctx.fillStyle = '#f6c416';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < size; i += 6) ctx.fillRect(0, i, size, 1);
    ctx.font = '900 150px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111';
    ctx.fillText('51', size / 2, size / 2 + 8);
    return toTexture(canvas, { anisotropy: 4 });
}

export function createBillboardTexture(title, subtitle, palette) {
    const width = 512;
    const height = 320;
    const [canvas, ctx] = makeCanvas(width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, palette[0]);
    gradient.addColorStop(1, palette[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    // Low sun and a rider silhouette on one wheel
    const sun = ctx.createRadialGradient(width * 0.7, height * 0.62, 0, width * 0.7, height * 0.62, 170);
    sun.addColorStop(0, 'rgba(255,240,200,0.95)');
    sun.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8,10,16,0.92)';
    ctx.fillRect(0, height * 0.78, width, height * 0.22);
    ctx.save();
    ctx.translate(width * 0.66, height * 0.76);
    ctx.rotate(-0.55);
    ctx.beginPath(); ctx.arc(-46, -22, 24, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(46, -22, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-46, -52, 96, 20);
    ctx.fillRect(-18, -92, 26, 46);
    ctx.beginPath(); ctx.arc(-2, -104, 15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd21f';
    ctx.font = 'italic 900 54px "Arial Black", Arial, sans-serif';
    ctx.fillText(title, 24, 74, width * 0.62);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText(subtitle, 26, 110, width * 0.6);
    return toTexture(canvas, { anisotropy: 4 });
}
