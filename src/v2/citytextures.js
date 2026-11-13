// Painted atlases for the street: foliage, paving, facades, shop fronts,
// signs and road decals. Like textures.js, everything is drawn once on a 2D
// canvas at startup, so the game ships no image files for its scenery.
import * as THREE from 'three';
import { mulberry32 } from './textures.js';

function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, { repeat = false, repeatX = false, repeatY = false, srgb = true, anisotropy = 1 } = {}) {
    const texture = new THREE.CanvasTexture(canvas);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    if (repeat || repeatX) texture.wrapS = THREE.RepeatWrapping;
    if (repeat || repeatY) texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    return texture;
}

// UV rectangle [u0, v0, u1, v1] of a canvas area, v pointing up.
export function rectUV(x, y, w, h, width, height, inset = 0) {
    return [
        (x + inset) / width, 1 - (y + h - inset) / height,
        (x + w - inset) / width, 1 - (y + inset) / height
    ];
}

// --- Foliage ----------------------------------------------------------------

// Atlas cells (UV, v up). Leaves are painted in near-neutral tones and tinted
// per vertex, so one atlas serves green trees, pink cherries and hedges.
export const FOLIAGE = {
    leaf: [0.004, 0.504, 0.496, 0.996],
    blossom: [0.504, 0.504, 0.996, 0.996],
    shrub: [0.004, 0.004, 0.496, 0.496],
    flower: [0.506, 0.004, 0.744, 0.496],
    bark: [0.765, 0.02, 0.985, 0.48]
};

function leafPath(ctx, length, width) {
    ctx.beginPath();
    ctx.moveTo(0, -length / 2);
    ctx.quadraticCurveTo(width, -length * 0.12, 0, length / 2);
    ctx.quadraticCurveTo(-width, -length * 0.12, 0, -length / 2);
    ctx.closePath();
}

function paintLeaves(ctx, random, cx, cy, radius, count, length, lumMin, lumMax) {
    for (let i = 0; i < count; i++) {
        // Back to front: the first leaves are deeper in the crown, so darker.
        const depth = i / count;
        const angle = random() * Math.PI * 2;
        const distance = radius * Math.sqrt(random()) * (1 - length / radius * 0.45);
        const lum = (lumMin + (lumMax - lumMin) * (0.2 + 0.8 * depth)) * (0.82 + random() * 0.18);
        const warm = random();
        ctx.save();
        ctx.translate(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance);
        ctx.rotate(random() * Math.PI * 2);
        const size = length * (0.7 + random() * 0.6);
        leafPath(ctx, size, size * 0.42);
        ctx.fillStyle = `rgb(${Math.round(lum * (0.9 + warm * 0.1))},${Math.round(lum)},${Math.round(lum * (0.78 + (1 - warm) * 0.14))})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(0,0,0,${0.16 + random() * 0.1})`;
        ctx.lineWidth = Math.max(1, size * 0.035);
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.42);
        ctx.lineTo(0, size * 0.42);
        ctx.stroke();
        ctx.restore();
    }
}

export function createFoliageTexture(lowQuality, anisotropy = 1) {
    const size = lowQuality ? 512 : 1024;
    const cell = size / 2;
    const [canvas, ctx] = makeCanvas(size, size);
    const random = mulberry32(4151);

    // Broadleaf cluster.
    paintLeaves(ctx, random, cell / 2, cell / 2, cell * 0.47, 190, cell * 0.125, 105, 255);

    // Blossom cluster: twigs, a few dark leaves, then masses of small flowers.
    {
        const cx = cell * 1.5;
        const cy = cell / 2;
        ctx.strokeStyle = 'rgb(70,58,52)';
        ctx.lineCap = 'round';
        for (let i = 0; i < 9; i++) {
            const angle = random() * Math.PI * 2;
            ctx.lineWidth = cell * (0.006 + random() * 0.008);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * cell * 0.05, cy + Math.sin(angle) * cell * 0.05);
            ctx.quadraticCurveTo(
                cx + Math.cos(angle + 0.4) * cell * 0.25, cy + Math.sin(angle + 0.4) * cell * 0.25,
                cx + Math.cos(angle) * cell * 0.42, cy + Math.sin(angle) * cell * 0.42
            );
            ctx.stroke();
        }
        paintLeaves(ctx, random, cx, cy, cell * 0.44, 46, cell * 0.08, 90, 150);
        const flowers = 330;
        for (let i = 0; i < flowers; i++) {
            const depth = i / flowers;
            const angle = random() * Math.PI * 2;
            const distance = cell * 0.45 * Math.sqrt(random());
            const x = cx + Math.cos(angle) * distance;
            const y = cy + Math.sin(angle) * distance;
            const petal = cell * (0.011 + random() * 0.009);
            const lum = 170 + depth * 85;
            const spin = random() * Math.PI;
            ctx.fillStyle = `rgb(${Math.round(lum)},${Math.round(lum * (0.9 + random() * 0.1))},${Math.round(lum * 0.97)})`;
            for (let p = 0; p < 5; p++) {
                const a = spin + (p / 5) * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(x + Math.cos(a) * petal * 0.95, y + Math.sin(a) * petal * 0.95, petal, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = `rgba(150,110,96,${0.5 + random() * 0.4})`;
            ctx.beginPath();
            ctx.arc(x, y, petal * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Fine, dense foliage for shrubs, hedges and narrow trees.
    paintLeaves(ctx, random, cell / 2, cell * 1.5, cell * 0.48, 520, cell * 0.062, 95, 255);

    // Grass tuft with flowers, in real colours (tall half cell).
    {
        const left = cell;
        const top = cell;
        const w = cell / 2;
        const baseY = top + cell * 0.985;
        const blades = 54;
        for (let i = 0; i < blades; i++) {
            const t = i / blades;
            const rootX = left + w * (0.3 + random() * 0.4);
            const lean = (random() - 0.5) * w * 0.85;
            const height = cell * (0.4 + random() * 0.5);
            const shade = 0.55 + t * 0.45;
            ctx.strokeStyle = `rgb(${Math.round((70 + random() * 60) * shade)},${Math.round((135 + random() * 60) * shade)},${Math.round((40 + random() * 30) * shade)})`;
            ctx.lineWidth = w * (0.018 + random() * 0.02);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(rootX, baseY);
            ctx.quadraticCurveTo(rootX + lean * 0.2, baseY - height * 0.6, rootX + lean, baseY - height);
            ctx.stroke();
            if (random() < 0.34) {
                const palette = ['#ff5d7a', '#ffd23c', '#ffffff', '#c08cff', '#ff8a3c', '#ff4f4f'];
                const radius = w * (0.045 + random() * 0.03);
                ctx.fillStyle = palette[Math.floor(random() * palette.length)];
                for (let p = 0; p < 6; p++) {
                    const a = (p / 6) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(rootX + lean + Math.cos(a) * radius * 0.75, baseY - height + Math.sin(a) * radius * 0.75,
                        radius * 0.62, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#f2b824';
                ctx.beginPath();
                ctx.arc(rootX + lean, baseY - height, radius * 0.45, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Bark: opaque strip wrapped around trunks and branches.
    {
        const left = cell * 1.5;
        const top = cell;
        const w = cell / 2;
        ctx.fillStyle = 'rgb(150,144,134)';
        ctx.fillRect(left, top, w, cell);
        for (let i = 0; i < 90; i++) {
            const x = left + random() * w;
            const lum = 70 + random() * 55;
            ctx.strokeStyle = `rgba(${lum},${lum * 0.96},${lum * 0.9},${0.5 + random() * 0.4})`;
            ctx.lineWidth = 1 + random() * w * 0.022;
            ctx.beginPath();
            let y = top + random() * cell;
            ctx.moveTo(x, y);
            let px = x;
            const steps = 3 + Math.floor(random() * 5);
            for (let s = 0; s < steps; s++) {
                px += (random() - 0.5) * w * 0.04;
                y += cell * (0.04 + random() * 0.08);
                ctx.lineTo(px, y);
            }
            ctx.stroke();
        }
        // Plane-tree mottling and lenticels.
        for (let i = 0; i < 16; i++) {
            const lum = 185 + random() * 40;
            ctx.fillStyle = `rgba(${lum},${lum},${lum * 0.9},${0.35 + random() * 0.3})`;
            ctx.beginPath();
            ctx.ellipse(left + random() * w, top + random() * cell, w * (0.04 + random() * 0.08),
                cell * (0.03 + random() * 0.07), random() * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(60,54,50,0.5)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 26; i++) {
            const x = left + random() * w * 0.85;
            const y = top + random() * cell;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + w * (0.05 + random() * 0.1), y);
            ctx.stroke();
        }
    }

    // Give fully transparent pixels a foliage colour (alpha stays 0) so that
    // filtering never drags black into the leaf edges, then upload as raw
    // data, flipped to match the canvas-texture UV convention.
    const image = ctx.getImageData(0, 0, size, size);
    const source = image.data;
    const data = new Uint8Array(source.length);
    for (let y = 0; y < size; y++) {
        const from = y * size * 4;
        const to = (size - 1 - y) * size * 4;
        for (let x = 0; x < size * 4; x += 4) {
            const alpha = source[from + x + 3];
            if (alpha < 10) {
                data[to + x] = 150;
                data[to + x + 1] = 160;
                data[to + x + 2] = 135;
                data[to + x + 3] = 0;
            } else {
                data[to + x] = source[from + x];
                data[to + x + 1] = source[from + x + 1];
                data[to + x + 2] = source[from + x + 2];
                data[to + x + 3] = alpha;
            }
        }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
}

export { makeCanvas, toTexture };
