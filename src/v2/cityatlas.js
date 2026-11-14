// Painted materials for buildings and streets: wall finishes, window
// interiors, curtain walls, shop interiors, lit signs, fabrics and prints,
// road decals and paving. Drawn once at startup on 2D canvases.
import * as THREE from 'three';
import { mulberry32 } from './textures.js';
import { makeCanvas, toTexture } from './citytextures.js';

// Records named cells of a canvas and returns their UV rectangles (v up).
class Atlas {
    constructor(width, height) {
        [this.canvas, this.ctx] = makeCanvas(width, height);
        this.width = width;
        this.height = height;
        this.cells = {};
    }

    uv(x, y, w, h, inset = 1) {
        return [
            (x + inset) / this.width, 1 - (y + h - inset) / this.height,
            (x + w - inset) / this.width, 1 - (y + inset) / this.height
        ];
    }

    add(name, x, y, w, h, inset) {
        this.cells[name] = this.uv(x, y, w, h, inset);
        return this.cells[name];
    }
}

function noise(ctx, random, x, y, w, h, count, alpha, size = 2, dark = 0, light = 255) {
    for (let i = 0; i < count; i++) {
        const v = Math.floor(dark + random() * (light - dark));
        ctx.fillStyle = `rgba(${v},${v},${v},${alpha * (0.4 + random() * 0.6)})`;
        ctx.fillRect(x + random() * w, y + random() * h, size * (0.5 + random()), size * (0.5 + random()));
    }
}

// Tileable: everything near an edge is drawn again on the opposite side.
function wrapDraw(size, x, y, reach, draw) {
    for (const dx of [0, -size, size]) {
        for (const dy of [0, -size, size]) {
            if (dx && (x + reach < size && x - reach > 0)) continue;
            if (dy && (y + reach < size && y - reach > 0)) continue;
            draw(x + dx, y + dy);
        }
    }
}

function rainStreaks(ctx, random, size, count, strength) {
    for (let i = 0; i < count; i++) {
        const x = random() * size;
        const y = random() * size;
        const w = 3 + random() * 14;
        const h = size * (0.15 + random() * 0.4);
        wrapDraw(size, x, y + h / 2, h, (px, py) => {
            const gradient = ctx.createLinearGradient(0, py - h / 2, 0, py + h / 2);
            gradient.addColorStop(0, `rgba(40,36,32,${strength})`);
            gradient.addColorStop(1, 'rgba(40,36,32,0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(px, py - h / 2, w, h);
        });
    }
}

// --- Walls -------------------------------------------------------------------
// Light, near-neutral finishes: each building tints them with vertex colours.

export const WALL_SCALE = { stone: 4, plain: 4, brick: 2.4, concrete: 4 };

function stoneTexture(size, random) {
    const [canvas, ctx] = makeCanvas(size, size);
    ctx.fillStyle = '#ddd6ca';
    ctx.fillRect(0, 0, size, size);
    const courses = 8;
    const courseH = size / courses;
    for (let row = 0; row < courses; row++) {
        let x = row % 2 ? -size * 0.14 : 0;
        while (x < size) {
            const w = size * (0.22 + random() * 0.14);
            const v = 206 + Math.floor(random() * 26);
            ctx.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
            const draw = (px) => ctx.fillRect(px + 1.5, row * courseH + 1.5, w - 3, courseH - 3);
            draw(x);
            if (x + w > size) draw(x - size);
            x += w;
        }
    }
    noise(ctx, random, 0, 0, size, size, size * 9, 0.08, 2, 90, 255);
    rainStreaks(ctx, random, size, 10, 0.08);
    // Joints
    ctx.fillStyle = 'rgba(70,64,56,0.35)';
    for (let row = 0; row <= courses; row++) ctx.fillRect(0, row * courseH - 1, size, 2);
    return canvas;
}

function plainTexture(size, random) {
    const [canvas, ctx] = makeCanvas(size, size);
    ctx.fillStyle = '#e4e0d8';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 26; i++) {
        const x = random() * size;
        const y = random() * size;
        const r = size * (0.06 + random() * 0.18);
        wrapDraw(size, x, y, r, (px, py) => {
            const gradient = ctx.createRadialGradient(px, py, 0, px, py, r);
            const v = random() > 0.5 ? 255 : 120;
            gradient.addColorStop(0, `rgba(${v},${v},${v - 10},0.07)`);
            gradient.addColorStop(1, `rgba(${v},${v},${v},0)`);
            ctx.fillStyle = gradient;
            ctx.fillRect(px - r, py - r, r * 2, r * 2);
        });
    }
    noise(ctx, random, 0, 0, size, size, size * 14, 0.06, 1.5, 100, 255);
    rainStreaks(ctx, random, size, 14, 0.07);
    return canvas;
}

function brickTexture(size, random) {
    const [canvas, ctx] = makeCanvas(size, size);
    ctx.fillStyle = '#c9c4ba';
    ctx.fillRect(0, 0, size, size);
    const courses = 32;
    const per = 10;
    const ch = size / courses;
    const bw = size / per;
    for (let row = 0; row < courses; row++) {
        const offset = row % 2 ? bw / 2 : 0;
        for (let i = -1; i < per; i++) {
            const tone = random();
            const r = 150 + tone * 60 + (random() - 0.5) * 20;
            const g = 72 + tone * 34 + (random() - 0.5) * 14;
            const b = 52 + tone * 24;
            ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
            ctx.fillRect(i * bw + offset + 1, row * ch + 1, bw - 2, ch - 2);
            if (random() < 0.12) {
                ctx.fillStyle = 'rgba(40,20,14,0.25)';
                ctx.fillRect(i * bw + offset + 1, row * ch + 1, bw - 2, ch - 2);
            }
        }
    }
    noise(ctx, random, 0, 0, size, size, size * 8, 0.1, 1.5, 40, 200);
    rainStreaks(ctx, random, size, 8, 0.1);
    return canvas;
}

function concreteTexture(size, random) {
    const [canvas, ctx] = makeCanvas(size, size);
    ctx.fillStyle = '#cfccc6';
    ctx.fillRect(0, 0, size, size);
    noise(ctx, random, 0, 0, size, size, size * 16, 0.07, 1.5, 80, 255);
    // Formwork panels and tie holes
    ctx.strokeStyle = 'rgba(60,60,60,0.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(0, i * size / 2); ctx.lineTo(size, i * size / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * size / 2, 0); ctx.lineTo(i * size / 2, size); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(50,50,50,0.35)';
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            ctx.beginPath();
            ctx.arc(size * (0.125 + i * 0.25), size * (0.125 + j * 0.25), 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    rainStreaks(ctx, random, size, 12, 0.08);
    return canvas;
}

export function createWallTextures(lowQuality, anisotropy) {
    const size = lowQuality ? 256 : 512;
    const random = mulberry32(8080);
    const options = { repeat: true, anisotropy };
    return {
        stone: toTexture(stoneTexture(size, random), options),
        plain: toTexture(plainTexture(size, random), options),
        brick: toTexture(brickTexture(size, random), options),
        concrete: toTexture(concreteTexture(size, random), options)
    };
}

// --- Window interiors ----------------------------------------------------------
// 8 x 4 cells of tall rooms seen through a window. The albedo is dim (rooms are
// darker than the street in daylight); the emissive map holds the lit rooms.

function paintRoom(ctx, random, x, y, w, h, lit) {
    const warm = [[243, 217, 168], [239, 197, 138], [232, 215, 192], [207, 224, 240], [240, 184, 120], [226, 206, 178]];
    const dark = [[42, 48, 56], [35, 40, 48], [48, 53, 61], [29, 34, 41]];
    const [r, g, b] = (lit ? warm : dark)[Math.floor(random() * (lit ? warm.length : dark.length))];
    const k = lit ? 1 : 1;
    const rgb = (m, a = 1) => `rgba(${Math.min(255, r * m * k) | 0},${Math.min(255, g * m * k) | 0},${Math.min(255, b * m * k) | 0},${a})`;
    // Box room in perspective
    const bx0 = x + w * 0.16;
    const bx1 = x + w * 0.84;
    const by0 = y + h * 0.1;
    const by1 = y + h * 0.74;
    ctx.fillStyle = rgb(0.62);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = rgb(0.9);
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    ctx.fillStyle = rgb(0.72);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx0, by0); ctx.lineTo(bx0, by1); ctx.lineTo(x, y + h); ctx.fill();
    ctx.fillStyle = rgb(0.66);
    ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(bx1, by0); ctx.lineTo(bx1, by1); ctx.lineTo(x + w, y + h); ctx.fill();
    ctx.fillStyle = rgb(1.05);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(bx1, by0); ctx.lineTo(bx0, by0); ctx.fill();
    ctx.fillStyle = lit ? 'rgba(120,86,60,0.9)' : 'rgba(22,24,28,0.9)';
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(bx0, by1); ctx.lineTo(bx1, by1); ctx.lineTo(x + w, y + h); ctx.fill();
    // Furniture and pictures
    const furniture = 2 + Math.floor(random() * 3);
    for (let i = 0; i < furniture; i++) {
        const fw = (bx1 - bx0) * (0.2 + random() * 0.35);
        const fh = (by1 - by0) * (0.15 + random() * 0.45);
        const fx = bx0 + random() * (bx1 - bx0 - fw);
        const tone = 0.25 + random() * 0.4;
        ctx.fillStyle = `rgba(${(60 + random() * 80) * tone | 0},${(50 + random() * 60) * tone | 0},${(40 + random() * 60) * tone | 0},0.9)`;
        ctx.fillRect(fx, by1 - fh + h * 0.03, fw, fh);
    }
    if (random() < 0.6) {
        ctx.fillStyle = `rgba(${random() * 120 | 0},${random() * 120 | 0},${random() * 120 | 0},0.7)`;
        ctx.fillRect(bx0 + (bx1 - bx0) * random() * 0.6, by0 + (by1 - by0) * 0.18, (bx1 - bx0) * 0.25, (by1 - by0) * 0.2);
    }
    if (random() < 0.4) {
        // Plant
        ctx.fillStyle = 'rgba(40,90,40,0.85)';
        ctx.beginPath();
        ctx.ellipse(bx1 - w * 0.08, by1 - h * 0.1, w * 0.07, h * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    if (lit) {
        const lamp = ctx.createRadialGradient(x + w / 2, by0 + h * 0.05, 0, x + w / 2, by0 + h * 0.05, w * 0.7);
        lamp.addColorStop(0, 'rgba(255,240,210,0.65)');
        lamp.addColorStop(1, 'rgba(255,240,210,0)');
        ctx.fillStyle = lamp;
        ctx.fillRect(x, y, w, h);
    }
    // Curtains or blinds
    const dressing = random();
    if (dressing < 0.45) {
        const fabric = [[220, 210, 190], [180, 60, 50], [70, 90, 120], [235, 235, 230], [120, 140, 90], [200, 170, 110]][Math.floor(random() * 6)];
        const m = lit ? 0.95 : 0.35;
        for (const side of [0, 1]) {
            const cw = w * (0.12 + random() * 0.24);
            const cx = side ? x + w - cw : x;
            const gradient = ctx.createLinearGradient(cx, 0, cx + cw, 0);
            for (let s = 0; s <= 6; s++) {
                const fold = 0.75 + 0.25 * Math.sin(s * 2.3 + side);
                gradient.addColorStop(s / 6, `rgba(${fabric[0] * m * fold | 0},${fabric[1] * m * fold | 0},${fabric[2] * m * fold | 0},0.95)`);
            }
            ctx.fillStyle = gradient;
            ctx.fillRect(cx, y, cw, h);
        }
        if (random() < 0.4) {
            // Sheer net curtain
            ctx.fillStyle = lit ? 'rgba(255,250,240,0.35)' : 'rgba(200,205,210,0.25)';
            ctx.fillRect(x, y, w, h * (0.6 + random() * 0.4));
        }
    } else if (dressing < 0.7) {
        const drop = h * (0.25 + random() * 0.6);
        const tone = lit ? [236, 226, 206] : [120, 124, 128];
        for (let s = 0; s < drop; s += 6) {
            ctx.fillStyle = `rgba(${tone[0]},${tone[1]},${tone[2]},0.95)`;
            ctx.fillRect(x, y + s, w, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(x, y + s + 4, w, 1);
        }
    }
}

export function createWindowAtlas(lowQuality) {
    const cols = 8;
    const rows = 4;
    const cw = lowQuality ? 64 : 128;
    const ch = cw * 2;
    const atlas = new Atlas(cols * cw, rows * ch);
    const random = mulberry32(1234);
    const [lightCanvas, light] = makeCanvas(atlas.width, atlas.height);
    light.fillStyle = '#000';
    light.fillRect(0, 0, atlas.width, atlas.height);
    const lit = [];
    const dark = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const isLit = row < 2;
            const x = col * cw;
            const y = row * ch;
            paintRoom(atlas.ctx, random, x, y, cw, ch, isLit);
            const uv = atlas.uv(x, y, cw, ch, 1);
            (isLit ? lit : dark).push(uv);
            if (isLit) light.drawImage(atlas.canvas, x, y, cw, ch, x, y, cw, ch);
        }
    }
    // Daylight albedo: rooms are much darker than the street outside.
    const ctx = atlas.ctx;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgb(64,66,70)';
    ctx.fillRect(0, 0, atlas.width, atlas.height);
    ctx.globalCompositeOperation = 'source-over';
    return {
        map: toTexture(atlas.canvas),
        emissiveMap: toTexture(lightCanvas),
        lit, dark
    };
}

// --- Curtain wall --------------------------------------------------------------
// One tile = 4 panels (1.5 m) x 4 floors (3.6 m): vision glass and spandrels.
export const CURTAIN_TILE = { width: 6, height: 14.4 };

export function createCurtainWallTextures(lowQuality, anisotropy) {
    const size = lowQuality ? 256 : 512;
    const [canvas, ctx] = makeCanvas(size, size);
    const [lightCanvas, light] = makeCanvas(size, size);
    const random = mulberry32(777);
    light.fillStyle = '#000';
    light.fillRect(0, 0, size, size);
    const pw = size / 4;
    const fh = size / 4;
    for (let floor = 0; floor < 4; floor++) {
        const y = floor * fh;
        const spandrel = fh * 0.28;
        for (let panel = 0; panel < 4; panel++) {
            const x = panel * pw;
            const tone = 0.85 + random() * 0.3;
            const glass = ctx.createLinearGradient(0, y, 0, y + fh - spandrel);
            glass.addColorStop(0, `rgb(${46 * tone | 0},${74 * tone | 0},${92 * tone | 0})`);
            glass.addColorStop(1, `rgb(${24 * tone | 0},${40 * tone | 0},${54 * tone | 0})`);
            ctx.fillStyle = glass;
            ctx.fillRect(x, y, pw, fh - spandrel);
            // Interior: ceiling light rows, a few desks.
            const isLit = random() < 0.42;
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = isLit ? 'rgba(220,235,255,0.5)' : 'rgba(120,140,160,0.18)';
                ctx.fillRect(x + 3, y + 4 + i * 5, pw - 6, 2);
            }
            ctx.fillStyle = 'rgba(10,16,22,0.5)';
            for (let i = 0; i < 2; i++) ctx.fillRect(x + random() * pw * 0.7, y + (fh - spandrel) * 0.72, pw * 0.25, (fh - spandrel) * 0.28);
            if (random() < 0.3) {
                ctx.fillStyle = 'rgba(200,205,210,0.55)';
                ctx.fillRect(x, y, pw, (fh - spandrel) * (0.2 + random() * 0.5));
            }
            if (isLit) {
                const glow = light.createLinearGradient(0, y, 0, y + fh - spandrel);
                glow.addColorStop(0, 'rgba(230,240,255,0.95)');
                glow.addColorStop(1, 'rgba(160,180,210,0.55)');
                light.fillStyle = glow;
                light.fillRect(x + 2, y + 2, pw - 4, fh - spandrel - 4);
                light.fillStyle = 'rgba(0,0,0,0.6)';
                for (let i = 0; i < 2; i++) light.fillRect(x + random() * pw * 0.7, y + (fh - spandrel) * 0.72, pw * 0.25, (fh - spandrel) * 0.28);
            }
            // Spandrel panel
            ctx.fillStyle = `rgb(${30 * tone | 0},${38 * tone | 0},${46 * tone | 0})`;
            ctx.fillRect(x, y + fh - spandrel, pw, spandrel);
        }
        // Transoms
        ctx.fillStyle = 'rgba(160,170,180,0.9)';
        ctx.fillRect(0, y + fh - spandrel - 2, size, 3);
    }
    // Mullions
    ctx.fillStyle = 'rgba(150,160,170,0.9)';
    for (let i = 0; i <= 4; i++) ctx.fillRect(i * pw - 1.5, 0, 3, size);
    const options = { repeat: true, anisotropy };
    return { map: toTexture(canvas, options), emissiveMap: toTexture(lightCanvas, options) };
}

// --- Shop interiors --------------------------------------------------------------
const SHOP_KINDS = ['cafe', 'boutique', 'pharmacy', 'bakery', 'grocery', 'phone', 'bar', 'books'];

export function createShopAtlas(lowQuality) {
    const cw = lowQuality ? 128 : 256;
    const ch = cw;
    const atlas = new Atlas(cw * 4, ch * 2);
    const ctx = atlas.ctx;
    const random = mulberry32(31);
    const cells = {};
    SHOP_KINDS.forEach((kind, index) => {
        const x = (index % 4) * cw;
        const y = Math.floor(index / 4) * ch;
        const palettes = {
            cafe: ['#d9a46a', '#7a4a2a'], boutique: ['#f2ece4', '#2b2b2b'], pharmacy: ['#eaf6ef', '#2fa35a'],
            bakery: ['#f0c98c', '#9a5a2a'], grocery: ['#f1efe6', '#d0402a'], phone: ['#f4f7fb', '#3060c0'],
            bar: ['#b86a36', '#3a1a10'], books: ['#e8d2a8', '#5a3a22']
        };
        const [wall, accent] = palettes[kind];
        ctx.fillStyle = wall;
        ctx.fillRect(x, y, cw, ch);
        // Floor
        const floor = ctx.createLinearGradient(0, y + ch * 0.72, 0, y + ch);
        floor.addColorStop(0, 'rgba(60,50,44,0.55)');
        floor.addColorStop(1, 'rgba(30,24,20,0.8)');
        ctx.fillStyle = floor;
        ctx.fillRect(x, y + ch * 0.72, cw, ch * 0.28);
        // Shelves with products
        const shelves = kind === 'cafe' || kind === 'bar' ? 2 : 4;
        for (let s = 0; s < shelves; s++) {
            const sy = y + ch * (0.12 + s * 0.13);
            ctx.fillStyle = accent;
            ctx.fillRect(x + cw * 0.06, sy + ch * 0.085, cw * 0.88, ch * 0.012);
            for (let p = 0; p < 14; p++) {
                const pw = cw * (0.025 + random() * 0.03);
                const ph = ch * (0.03 + random() * 0.05);
                ctx.fillStyle = `hsl(${random() * 360},${40 + random() * 40}%,${35 + random() * 35}%)`;
                ctx.fillRect(x + cw * 0.07 + p * cw * 0.062, sy + ch * 0.085 - ph, pw, ph);
            }
        }
        // Counter / tables / racks
        ctx.fillStyle = accent;
        if (kind === 'cafe' || kind === 'bar' || kind === 'bakery') {
            ctx.fillRect(x + cw * 0.1, y + ch * 0.6, cw * 0.55, ch * 0.16);
            for (let t = 0; t < 3; t++) {
                ctx.fillStyle = 'rgba(40,30,24,0.85)';
                ctx.fillRect(x + cw * (0.15 + t * 0.28), y + ch * 0.82, cw * 0.16, ch * 0.03);
                ctx.fillRect(x + cw * (0.22 + t * 0.28), y + ch * 0.82, cw * 0.02, ch * 0.14);
            }
        } else if (kind === 'boutique') {
            for (let t = 0; t < 6; t++) {
                ctx.fillStyle = `hsl(${random() * 360},45%,${30 + random() * 40}%)`;
                ctx.fillRect(x + cw * (0.1 + t * 0.13), y + ch * 0.5, cw * 0.09, ch * 0.3);
            }
            ctx.fillStyle = '#222';
            ctx.fillRect(x + cw * 0.08, y + ch * 0.49, cw * 0.84, ch * 0.012);
        } else {
            ctx.fillRect(x + cw * 0.55, y + ch * 0.62, cw * 0.38, ch * 0.14);
        }
        // Ceiling spots
        for (let l = 0; l < 4; l++) {
            const lx = x + cw * (0.15 + l * 0.23);
            const glow = ctx.createRadialGradient(lx, y + ch * 0.05, 0, lx, y + ch * 0.05, cw * 0.18);
            glow.addColorStop(0, 'rgba(255,250,235,0.9)');
            glow.addColorStop(1, 'rgba(255,250,235,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(lx - cw * 0.2, y, cw * 0.4, ch * 0.3);
        }
        // Sale posters on the glass for some
        if (random() < 0.5) {
            ctx.fillStyle = accent;
            ctx.fillRect(x + cw * 0.7, y + ch * 0.3, cw * 0.18, ch * 0.24);
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${cw * 0.06 | 0}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(kind === 'phone' ? '5G' : '-30%', x + cw * 0.79, y + ch * 0.44);
        }
        cells[kind] = atlas.uv(x, y, cw, ch, 2);
    });
    return { map: toTexture(atlas.canvas), cells, kinds: SHOP_KINDS };
}

// --- Lit signs -------------------------------------------------------------------
export const SIGN_NAMES = [
    ['CAFÉ DU 51', 'cafe'], ['BOULANGERIE', 'bakery'], ['PHARMACIE', 'pharmacy'], ['BOUTIQUE ÉLAN', 'boutique'],
    ['MARCHÉ FRAIS', 'grocery'], ['5HC MOBILE', 'phone'], ['LE COMPTOIR', 'bar'], ['LIBRAIRIE', 'books'],
    ['BRASSERIE', 'cafe'], ['PIZZERIA ROMA', 'bar'], ['SNEAKERS 51', 'boutique'], ['FLEURISTE', 'grocery'],
    ['OPTIQUE', 'phone'], ['SUSHI BAR', 'bar'], ['BARBER SHOP', 'boutique'], ['TABAC PRESSE', 'books']
];

export function createSignAtlas(lowQuality) {
    const cw = lowQuality ? 256 : 512;
    const ch = cw / 8;
    const atlas = new Atlas(cw * 2, ch * 16);
    const ctx = atlas.ctx;
    const random = mulberry32(5151);
    const styles = [
        { bg: '#14161b', fg: '#ffe7b0', glow: 'rgba(255,200,120,0.8)', font: '700 {s}px Georgia, serif' },
        { bg: '#1d2b22', fg: '#f4f1e6', glow: 'rgba(255,255,230,0.6)', font: '700 {s}px "Times New Roman", serif' },
        { bg: '#f3f1ea', fg: '#c7262c', glow: null, font: '900 {s}px "Arial Black", Arial, sans-serif' },
        { bg: '#0f1a33', fg: '#7fe3ff', glow: 'rgba(80,220,255,0.9)', font: '800 {s}px Arial, sans-serif' },
        { bg: '#2a1408', fg: '#ffb347', glow: 'rgba(255,160,60,0.9)', font: 'italic 700 {s}px Georgia, serif' },
        { bg: '#111', fg: '#ff4fa0', glow: 'rgba(255,60,160,0.9)', font: '800 {s}px "Trebuchet MS", sans-serif' }
    ];
    const cells = [];
    SIGN_NAMES.forEach(([name, kind], index) => {
        const x = (index % 2) * cw;
        const y = Math.floor(index / 2) * ch;
        const style = kind === 'pharmacy' ? { bg: '#0d4a2a', fg: '#e8fff0', glow: 'rgba(80,255,140,0.7)', font: '800 {s}px Arial, sans-serif' }
            : styles[Math.floor(random() * styles.length)];
        ctx.fillStyle = style.bg;
        ctx.fillRect(x, y, cw, ch);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
        ctx.font = style.font.replace('{s}', Math.round(ch * 0.62));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (style.glow) {
            ctx.shadowColor = style.glow;
            ctx.shadowBlur = ch * 0.35;
        }
        ctx.fillStyle = style.fg;
        ctx.fillText(name, x + cw / 2, y + ch * 0.54, cw * 0.9);
        ctx.shadowBlur = 0;
        cells.push({ uv: atlas.uv(x, y, cw, ch, 1), kind, name });
    });
    const texture = toTexture(atlas.canvas);
    return { map: texture, cells };
}

// --- Prints: awnings, railings, shutters, road signs, posters, doors -------------
// Used by one double-sided, alpha-tested material.
export function paintSponsor(ctx, { x, y, w, h }, logo) {
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, '#0b0f18');
    gradient.addColorStop(1, '#02030a');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#f6c416';
    ctx.fillRect(x + w * 0.1, y + h * 0.2, w * 0.8, Math.max(1, h * 0.008));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e9edf3';
    ctx.font = `700 ${Math.round(w * 0.085)}px Arial, sans-serif`;
    ctx.fillText('SPONSORED BY', x + w / 2, y + h * 0.13, w * 0.9);
    if (logo) {
        const scale = (w * 0.94) / logo.width;
        const lw = logo.width * scale;
        const lh = logo.height * scale;
        ctx.drawImage(logo, x + (w - lw) / 2, y + h * 0.52 - lh / 2, lw, lh);
    } else {
        ctx.fillStyle = '#f6c416';
        ctx.font = `italic 900 ${Math.round(w * 0.32)}px "Arial Black", Arial, sans-serif`;
        ctx.fillText('5HC', x + w / 2, y + h * 0.52, w * 0.9);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `600 ${Math.round(w * 0.065)}px Arial, sans-serif`;
    ctx.fillText('sites · applications · design', x + w / 2, y + h * 0.88, w * 0.92);
}

export function createPrintAtlas(lowQuality, anisotropy) {
    const size = lowQuality ? 512 : 1024;
    const u = size / 8;
    const atlas = new Atlas(size, size);
    const ctx = atlas.ctx;
    const random = mulberry32(99);

    // Awnings: 6 stripe patterns, 2u x 1u each (top-left 4u x 3u).
    const awnings = [
        ['#b6402f', '#f2ece0'], ['#2f5d8a', '#f2ece0'], ['#3a7a54', '#f2ece0'],
        ['#1d1f24', '#1d1f24'], ['#c98a2b', '#f6efe0'], ['#5a2440', '#5a2440']
    ];
    atlas.cells.awnings = [];
    awnings.forEach(([a, b], index) => {
        const x = (index % 2) * 2 * u;
        const y = Math.floor(index / 2) * u;
        const stripes = 10;
        for (let i = 0; i < stripes; i++) {
            ctx.fillStyle = i % 2 ? b : a;
            ctx.fillRect(x + (i * 2 * u) / stripes, y, (2 * u) / stripes + 1, u * 0.86);
        }
        // Fabric shading folds and valance scallops
        const shade = ctx.createLinearGradient(0, y, 0, y + u * 0.86);
        shade.addColorStop(0, 'rgba(0,0,0,0.25)');
        shade.addColorStop(0.6, 'rgba(255,255,255,0.05)');
        shade.addColorStop(1, 'rgba(0,0,0,0.12)');
        ctx.fillStyle = shade;
        ctx.fillRect(x, y, 2 * u, u * 0.86);
        for (let i = 0; i < stripes; i++) {
            ctx.fillStyle = i % 2 ? b : a;
            ctx.beginPath();
            ctx.arc(x + (i + 0.5) * (2 * u) / stripes, y + u * 0.86, (u / stripes) * 0.98, 0, Math.PI);
            ctx.fill();
        }
        atlas.cells.awnings.push(atlas.uv(x, y, 2 * u, u, 1));
    });

    // Railings (alpha): wrought iron and modern bars, 2u x 1u each.
    {
        const x = 4 * u;
        const y = 0;
        ctx.strokeStyle = '#1b1c1f';
        ctx.lineWidth = Math.max(2, u * 0.035);
        ctx.strokeRect(x + 2, y + 4, 2 * u - 4, u - 8);
        for (let i = 0; i < 12; i++) {
            const px = x + (i + 0.5) * (2 * u) / 12;
            ctx.beginPath(); ctx.moveTo(px, y + 4); ctx.lineTo(px, y + u - 4); ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(px + u / 12, y + u * 0.5, u / 14, u * 0.18, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(x, y + u * 0.2); ctx.lineTo(x + 2 * u, y + u * 0.2); ctx.stroke();
        atlas.add('railIron', x, y, 2 * u, u);
        const x2 = 6 * u;
        ctx.fillStyle = '#26282d';
        ctx.fillRect(x2, y + 2, 2 * u, u * 0.07);
        ctx.fillRect(x2, y + u - u * 0.07 - 2, 2 * u, u * 0.07);
        for (let i = 0; i <= 16; i++) ctx.fillRect(x2 + (i * (2 * u - 4)) / 16, y + 2, Math.max(2, u * 0.025), u - 4);
        atlas.add('railBars', x2, y, 2 * u, u);
    }

    // Shutters: louvred, 1u x 2u (light, tinted per building).
    {
        const x = 4 * u;
        const y = u;
        ctx.fillStyle = '#e8e6e0';
        ctx.fillRect(x, y, u, 2 * u);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        for (let s = 0; s < 2 * u; s += u * 0.07) ctx.fillRect(x + u * 0.1, y + s + u * 0.04, u * 0.8, u * 0.025);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 3, y + 3, u - 6, 2 * u - 6);
        atlas.add('shutter', x, y, u, 2 * u);
    }

    // Doors: wood with glass, glass with frame (1u x 2u).
    {
        let x = 5 * u;
        const y = u;
        ctx.fillStyle = '#5a3a24';
        ctx.fillRect(x, y, u, 2 * u);
        ctx.fillStyle = '#20262c';
        ctx.fillRect(x + u * 0.18, y + u * 0.18, u * 0.64, u * 0.9);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.strokeRect(x + u * 0.18, y + u * 1.25, u * 0.64, u * 0.6);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(x + u * 0.78, y + u * 1.15, u * 0.06, u * 0.12);
        atlas.add('doorWood', x, y, u, 2 * u);
        x = 6 * u;
        ctx.fillStyle = '#2b2e33';
        ctx.fillRect(x, y, u, 2 * u);
        ctx.fillStyle = '#5d7488';
        ctx.fillRect(x + u * 0.1, y + u * 0.1, u * 0.8, u * 1.8);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.moveTo(x + u * 0.1, y + u * 0.6); ctx.lineTo(x + u * 0.5, y + u * 0.1); ctx.lineTo(x + u * 0.7, y + u * 0.1);
        ctx.lineTo(x + u * 0.1, y + u * 0.9); ctx.fill();
        ctx.fillStyle = '#9aa0a6';
        ctx.fillRect(x + u * 0.75, y + u * 0.8, u * 0.05, u * 0.5);
        atlas.add('doorGlass', x, y, u, 2 * u);
        x = 7 * u;
        // Garage roller shutter
        ctx.fillStyle = '#8d9096';
        ctx.fillRect(x, y, u, 2 * u);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let s = 0; s < 2 * u; s += u * 0.1) ctx.fillRect(x, y + s, u, 2);
        ctx.fillStyle = 'rgba(30,30,30,0.6)';
        ctx.font = `bold ${u * 0.22 | 0}px Arial`;
        ctx.save();
        ctx.translate(x + u / 2, y + u);
        ctx.rotate(-0.15);
        ctx.fillText('51', -u * 0.12, 0);
        ctx.restore();
        atlas.add('roller', x, y, u, 2 * u);
    }

    // Road signs (1u each), row 3.
    {
        const y = 3 * u;
        const disc = (x, ring, fill) => {
            ctx.fillStyle = ring;
            ctx.beginPath(); ctx.arc(x + u / 2, y + u / 2, u * 0.47, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = fill;
            ctx.beginPath(); ctx.arc(x + u / 2, y + u / 2, u * 0.37, 0, Math.PI * 2); ctx.fill();
        };
        disc(0, '#c8202a', '#1f4fa8');
        ctx.strokeStyle = '#c8202a';
        ctx.lineWidth = u * 0.09;
        ctx.beginPath(); ctx.moveTo(u * 0.24, y + u * 0.24); ctx.lineTo(u * 0.76, y + u * 0.76); ctx.stroke();
        atlas.add('noParking', 0, y, u, u);
        disc(u, '#c8202a', '#f7f7f2');
        ctx.fillStyle = '#111';
        ctx.font = `900 ${u * 0.38 | 0}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('50', u * 1.5, y + u * 0.53);
        atlas.add('speed50', u, y, u, u);
        // Pedestrian crossing (blue square)
        ctx.fillStyle = '#1f5fbf';
        ctx.fillRect(2 * u + 2, y + 2, u - 4, u - 4);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(2.5 * u, y + u * 0.14); ctx.lineTo(2.86 * u, y + u * 0.8); ctx.lineTo(2.14 * u, y + u * 0.8); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.fillRect(2.47 * u, y + u * 0.4, u * 0.06, u * 0.24);
        ctx.beginPath(); ctx.arc(2.5 * u, y + u * 0.36, u * 0.05, 0, Math.PI * 2); ctx.fill();
        atlas.add('crossing', 2 * u, y, u, u);
        // Parking P
        ctx.fillStyle = '#1f5fbf';
        ctx.fillRect(3 * u + 2, y + 2, u - 4, u - 4);
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${u * 0.7 | 0}px Arial`;
        ctx.fillText('P', 3.5 * u, y + u * 0.55);
        atlas.add('parking', 3 * u, y, u, u);
        // Bus stop
        ctx.fillStyle = '#f3f3ee';
        ctx.fillRect(4 * u + 2, y + 2, u - 4, u - 4);
        ctx.fillStyle = '#1b6e3a';
        ctx.fillRect(4 * u + 2, y + 2, u - 4, u * 0.32);
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${u * 0.24 | 0}px Arial`;
        ctx.fillText('BUS', 4.5 * u, y + u * 0.19);
        ctx.fillStyle = '#1b6e3a';
        ctx.font = `900 ${u * 0.36 | 0}px Arial`;
        ctx.fillText('51', 4.5 * u, y + u * 0.66);
        atlas.add('busStop', 4 * u, y, u, u);
        // One way (white arrow on blue)
        ctx.fillStyle = '#1f5fbf';
        ctx.fillRect(5 * u + 2, y + 2, u - 4, u - 4);
        ctx.fillStyle = '#fff';
        ctx.fillRect(5.2 * u, y + u * 0.42, u * 0.42, u * 0.16);
        ctx.beginPath(); ctx.moveTo(5.62 * u, y + u * 0.28); ctx.lineTo(5.84 * u, y + u * 0.5); ctx.lineTo(5.62 * u, y + u * 0.72); ctx.fill();
        atlas.add('oneWay', 5 * u, y, u, u);
        // Street name plate
        ctx.fillStyle = '#1d3f8f';
        ctx.fillRect(6 * u, y + u * 0.25, 2 * u, u * 0.5);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(6 * u + 5, y + u * 0.25 + 5, 2 * u - 10, u * 0.5 - 10);
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${u * 0.17 | 0}px Arial`;
        ctx.fillText('AVENUE DU 51', 7 * u, y + u * 0.51);
        atlas.add('streetName', 6 * u, y + u * 0.25, 2 * u, u * 0.5);
    }

    // Posters (1u x 1.5u) and a café menu board, row 4-5.
    {
        const y = 4 * u;
        const posters = [
            ['51WHELING', 'RIDE THE CITY', '#f6c416', '#111'],
            ['NEW DROP', '5HC STREETWEAR', '#111', '#f6c416'],
            ['CONCERT', 'SAMEDI 21H', '#6a2bd6', '#ffd23c'],
            ['SOLDES', 'JUSQU\'À -50%', '#e8282e', '#fff'],
            ['WHEELIE KING', 'TOP 1 ?', '#0e2a5c', '#7fe3ff'],
            ['CINÉMA', 'NOUVEAU FILM', '#1d1d1d', '#ff7a2a']
        ];
        atlas.cells.posters = [];
        posters.forEach(([title, subtitle, bg, fg], index) => {
            const x = index * u;
            const h = 1.5 * u;
            const gradient = ctx.createLinearGradient(x, y, x, y + h);
            gradient.addColorStop(0, bg);
            gradient.addColorStop(1, '#000');
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, u, h);
            ctx.fillStyle = fg;
            ctx.globalAlpha = 0.85;
            ctx.beginPath(); ctx.arc(x + u * 0.5, y + h * 0.42, u * (0.2 + random() * 0.12), 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.font = `900 ${u * 0.15 | 0}px "Arial Black", Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(title, x + u / 2, y + h * 0.16, u * 0.9);
            ctx.font = `700 ${u * 0.09 | 0}px Arial`;
            ctx.fillStyle = '#fff';
            ctx.fillText(subtitle, x + u / 2, y + h * 0.84, u * 0.9);
            atlas.cells.posters.push(atlas.uv(x, y, u, h, 1));
        });
        // Menu board
        const x = 6 * u;
        ctx.fillStyle = '#5a3a24';
        ctx.fillRect(x, y, u, 1.5 * u);
        ctx.fillStyle = '#1e2420';
        ctx.fillRect(x + u * 0.08, y + u * 0.08, u * 0.84, 1.5 * u - u * 0.16);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `italic 700 ${u * 0.12 | 0}px Georgia`;
        ctx.fillText('Menu', x + u / 2, y + u * 0.28);
        ctx.font = `${u * 0.07 | 0}px Georgia`;
        ['Café 2€', 'Croissant', 'Formule 12€', 'Plat du jour'].forEach((line, i) => ctx.fillText(line, x + u / 2, y + u * (0.5 + i * 0.2)));
        atlas.add('menu', x, y, u, 1.5 * u);
        // Parasol fabric (cream with border)
        const px = 7 * u;
        ctx.fillStyle = '#efe6d2';
        ctx.fillRect(px, y, u, u);
        ctx.fillStyle = '#8a2a2a';
        ctx.fillRect(px, y + u * 0.85, u, u * 0.15);
        atlas.add('parasol', px, y, u, u);
        ctx.fillStyle = '#26402e';
        ctx.fillRect(px, y + u, u, u * 0.5);
        ctx.fillStyle = '#efe6d2';
        ctx.fillRect(px, y + u * 1.4, u, u * 0.1);
        atlas.add('parasolGreen', px, y + u, u, u * 0.5);
    }

    // Graffiti / mural strip for blank party walls (2u x 2u), and tactile paving.
    {
        const x = 0;
        const y = 6 * u;
        ctx.fillStyle = '#d8d2c6';
        ctx.fillRect(x, y, 4 * u, 2 * u);
        const colors = ['#f6c416', '#e8282e', '#2a8ad6', '#25b36a', '#ff7a2a', '#9b4ad6'];
        for (let i = 0; i < 9; i++) {
            ctx.fillStyle = colors[i % colors.length];
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.ellipse(x + random() * 4 * u, y + u * (0.5 + random()), u * (0.3 + random() * 0.6), u * (0.2 + random() * 0.4), random() * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.font = `italic 900 ${u * 0.9 | 0}px "Arial Black", Arial`;
        ctx.textAlign = 'center';
        ctx.lineWidth = u * 0.06;
        ctx.strokeStyle = '#111';
        ctx.strokeText('51 WHELING', x + 2 * u, y + u * 1.3, 3.8 * u);
        ctx.fillStyle = '#fff';
        ctx.fillText('51 WHELING', x + 2 * u, y + u * 1.3, 3.8 * u);
        atlas.add('mural', x, y, 4 * u, 2 * u);
        ctx.fillStyle = '#d6b23a';
        ctx.fillRect(4 * u, y, u, u);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 6; j++) {
                ctx.beginPath(); ctx.arc(4 * u + (i + 0.5) * u / 6, y + (j + 0.5) * u / 6, u * 0.03, 0, Math.PI * 2); ctx.fill();
            }
        }
        atlas.add('tactile', 4 * u, y, u, u);
    }

    // Bus shelter poster "Sponsored by 5HC" (1u x 1.5u): the logo is painted
    // in when its image has loaded (world.js, paintSponsor).
    const sponsorRect = { x: 5 * u, y: 6 * u, w: u, h: 1.5 * u };
    paintSponsor(ctx, sponsorRect, null);
    atlas.add('sponsor', sponsorRect.x, sponsorRect.y, sponsorRect.w, sponsorRect.h, 1);

    const texture = toTexture(atlas.canvas, { anisotropy });
    return { map: texture, cells: atlas.cells, canvas: atlas.canvas, sponsorRect };
}

// --- Road decals -------------------------------------------------------------------
export function createDecalAtlas(lowQuality, anisotropy) {
    const size = lowQuality ? 512 : 1024;
    const u = size / 8;
    const atlas = new Atlas(size, size);
    const ctx = atlas.ctx;
    const random = mulberry32(4242);
    const worn = (x, y, w, h, count) => {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < count; i++) {
            ctx.fillStyle = `rgba(0,0,0,${0.3 + random() * 0.6})`;
            ctx.beginPath();
            ctx.arc(x + random() * w, y + random() * h, 1 + random() * u * 0.025, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    };

    // Paint bar (zebra stripe, stop line), 1u x 4u.
    ctx.fillStyle = 'rgba(238,238,232,0.95)';
    ctx.fillRect(4, 4, u - 8, 4 * u - 8);
    worn(0, 0, u, 4 * u, 140);
    atlas.add('paint', 0, 0, u, 4 * u, 2);

    // Arrows (white), 1u x 2u.
    ctx.fillStyle = 'rgba(238,238,232,0.95)';
    ctx.fillRect(u * 1.42, u * 0.7, u * 0.16, u * 1.2);
    ctx.beginPath(); ctx.moveTo(u * 1.2, u * 0.75); ctx.lineTo(u * 1.5, u * 0.1); ctx.lineTo(u * 1.8, u * 0.75); ctx.fill();
    worn(u, 0, u, 2 * u, 120);
    atlas.add('arrow', u, 0, u, 2 * u);

    // Bus lane letters, 2u x 1u.
    ctx.fillStyle = 'rgba(238,238,232,0.95)';
    ctx.font = `900 ${u * 0.8 | 0}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(u * 3, u * 0.5);
    ctx.scale(1, 1.6);
    ctx.fillText('BUS', 0, 0, u * 1.9);
    ctx.restore();
    worn(2 * u, 0, 2 * u, u, 160);
    atlas.add('bus', 2 * u, 0, 2 * u, u);

    // Manhole cover, 1u.
    {
        const cx = u * 4.5;
        const cy = u * 0.5;
        ctx.fillStyle = '#2b2c2f';
        ctx.beginPath(); ctx.arc(cx, cy, u * 0.47, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4a4b4f';
        ctx.lineWidth = u * 0.04;
        ctx.beginPath(); ctx.arc(cx, cy, u * 0.43, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#3c3d41';
        ctx.lineWidth = u * 0.025;
        for (let r = 0.1; r < 0.4; r += 0.08) { ctx.beginPath(); ctx.arc(cx, cy, u * r, 0, Math.PI * 2); ctx.stroke(); }
        for (let a = 0; a < 8; a++) {
            ctx.beginPath(); ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a * Math.PI / 4) * u * 0.42, cy + Math.sin(a * Math.PI / 4) * u * 0.42); ctx.stroke();
        }
        atlas.add('manhole', 4 * u, 0, u, u);
    }
    // Drain grate (avaloir), 1u x 0.5u.
    {
        const x = 5 * u;
        ctx.fillStyle = '#3a3b3e';
        ctx.fillRect(x + 2, 2, u - 4, u * 0.5 - 4);
        ctx.fillStyle = '#0a0a0b';
        for (let i = 0; i < 9; i++) ctx.fillRect(x + u * 0.08 + i * u * 0.095, u * 0.08, u * 0.05, u * 0.34);
        atlas.add('grate', x, 0, u, u * 0.5);
    }
    // Oil stain, 1u.
    {
        const cx = u * 6.5;
        const cy = u * 0.5;
        for (let i = 0; i < 5; i++) {
            const gradient = ctx.createRadialGradient(cx + (random() - 0.5) * u * 0.3, cy + (random() - 0.5) * u * 0.3, 0, cx, cy, u * 0.45);
            gradient.addColorStop(0, 'rgba(8,8,10,0.35)');
            gradient.addColorStop(1, 'rgba(8,8,10,0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(6 * u, 0, u, u);
        }
        atlas.add('oil', 6 * u, 0, u, u);
    }
    // Tyre skid marks, 1u x 3u.
    {
        const x = 7 * u;
        for (const lane of [0.3, 0.7]) {
            for (let i = 0; i < 6; i++) {
                ctx.strokeStyle = `rgba(5,5,6,${0.08 + random() * 0.08})`;
                ctx.lineWidth = u * (0.06 + random() * 0.06);
                ctx.beginPath();
                ctx.moveTo(x + u * lane, u * 1.05);
                ctx.bezierCurveTo(x + u * (lane + 0.05), u * 2, x + u * (lane - 0.1), u * 3, x + u * (lane + 0.12), u * 3.9);
                ctx.stroke();
            }
        }
        atlas.add('skid', x, u, u, 3 * u);
    }
    // Asphalt repair patch, 2u.
    {
        const x = u * 1;
        const y = u * 2;
        ctx.fillStyle = 'rgba(14,15,18,0.55)';
        ctx.fillRect(x + u * 0.1, y + u * 0.1, u * 1.8, u * 1.8);
        noise(ctx, random, x + u * 0.1, y + u * 0.1, u * 1.8, u * 1.8, 900, 0.25, 2, 0, 90);
        ctx.strokeStyle = 'rgba(5,5,6,0.65)';
        ctx.lineWidth = u * 0.03;
        ctx.strokeRect(x + u * 0.1, y + u * 0.1, u * 1.8, u * 1.8);
        atlas.add('patch', x, y, 2 * u, 2 * u);
    }
    // Crack network, 2u.
    {
        const x = u * 3;
        const y = u * 2;
        ctx.strokeStyle = 'rgba(6,6,8,0.7)';
        for (let c = 0; c < 6; c++) {
            ctx.lineWidth = 1 + random() * 2;
            ctx.beginPath();
            let px = x + u * (0.3 + random() * 1.4);
            let py = y + u * 0.1;
            ctx.moveTo(px, py);
            while (py < y + u * 1.9) {
                px += (random() - 0.5) * u * 0.25;
                py += u * (0.08 + random() * 0.12);
                px = Math.max(x + 2, Math.min(x + 2 * u - 2, px));
                ctx.lineTo(px, Math.min(py, y + u * 1.95));
            }
            ctx.stroke();
        }
        atlas.add('cracks', x, y, 2 * u, 2 * u);
    }
    // Bicycle symbol, 1u.
    {
        const x = 5 * u;
        const y = u;
        ctx.strokeStyle = 'rgba(238,238,232,0.95)';
        ctx.lineWidth = u * 0.06;
        ctx.beginPath(); ctx.arc(x + u * 0.28, y + u * 0.62, u * 0.18, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + u * 0.72, y + u * 0.62, u * 0.18, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + u * 0.28, y + u * 0.62); ctx.lineTo(x + u * 0.45, y + u * 0.35);
        ctx.lineTo(x + u * 0.65, y + u * 0.35); ctx.lineTo(x + u * 0.72, y + u * 0.62); ctx.lineTo(x + u * 0.5, y + u * 0.62);
        ctx.lineTo(x + u * 0.42, y + u * 0.3); ctx.stroke();
        atlas.add('bike', x, y, u, u);
    }
    // Dappled tree shadow (alpha = darkness), 2u x 4u, and a soft blob.
    {
        const x = 5 * u;
        const y = 2 * u;
        const w = 2 * u;
        const h = 4 * u;
        const [maskCanvas, mask] = makeCanvas(w, h);
        const gradient = mask.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        gradient.addColorStop(0, 'rgba(0,0,0,0.8)');
        gradient.addColorStop(0.7, 'rgba(0,0,0,0.6)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        mask.save();
        mask.translate(w / 2, h / 2);
        mask.scale(1, h / w);
        mask.translate(-w / 2, -h / 2);
        mask.fillStyle = gradient;
        mask.fillRect(0, 0, w, w);
        mask.restore();
        // Sun flecks through the leaves
        mask.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 140; i++) {
            mask.fillStyle = `rgba(0,0,0,${0.4 + random() * 0.6})`;
            mask.beginPath();
            mask.ellipse(random() * w, random() * h, u * (0.015 + random() * 0.05), u * (0.04 + random() * 0.12), 0, 0, Math.PI * 2);
            mask.fill();
        }
        ctx.drawImage(maskCanvas, x, y);
        atlas.add('treeShadow', x, y, w, h, 2);
        // Plain soft shadow, 1u.
        const bx = 0;
        const by = 6 * u;
        const blob = ctx.createRadialGradient(bx + u / 2, by + u / 2, 0, bx + u / 2, by + u / 2, u / 2);
        blob.addColorStop(0, 'rgba(0,0,0,0.75)');
        blob.addColorStop(0.6, 'rgba(0,0,0,0.45)');
        blob.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = blob;
        ctx.fillRect(bx, by, u, u);
        atlas.add('blob', bx, by, u, u, 2);
        // Hard-edged pole shadow (for lamps, signs), 0.25u x 2u.
        const lx = u;
        const ly = 6 * u;
        const line = ctx.createLinearGradient(lx, 0, lx + u * 0.25, 0);
        line.addColorStop(0, 'rgba(0,0,0,0)');
        line.addColorStop(0.5, 'rgba(0,0,0,0.6)');
        line.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = line;
        ctx.fillRect(lx, ly, u * 0.25, 2 * u);
        atlas.add('line', lx, ly, u * 0.25, 2 * u, 0);
        // Square soft shadow (benches, shelters, cars), 1u.
        const sx = 2 * u;
        const sy = 6 * u;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.filter = `blur(${u * 0.06}px)`;
        ctx.fillRect(sx + u * 0.12, sy + u * 0.12, u * 0.76, u * 0.76);
        ctx.filter = 'none';
        atlas.add('box', sx, sy, u, u, 1);
    }
    return { map: toTexture(atlas.canvas, { anisotropy }), cells: atlas.cells };
}

// --- Paving --------------------------------------------------------------------------
// One tile = 2.4 m x 2.4 m of 0.6 x 1.2 m flags laid in a running bond.
export const PAVING_SCALE = 2.4;

export function createPavingTexture(lowQuality, anisotropy) {
    const size = lowQuality ? 256 : 512;
    const [canvas, ctx] = makeCanvas(size, size);
    const random = mulberry32(13);
    ctx.fillStyle = '#5e6168';
    ctx.fillRect(0, 0, size, size);
    const rows = 4;
    const rh = size / rows;
    for (let row = 0; row < rows; row++) {
        const offset = row % 2 ? size / 4 : 0;
        for (let i = -1; i < 2; i++) {
            const x = i * size / 2 + offset;
            const v = 132 + Math.floor(random() * 30);
            const tint = random() * 6;
            ctx.fillStyle = `rgb(${v + tint | 0},${v + 2 | 0},${v + 8 | 0})`;
            ctx.fillRect(x + 2, row * rh + 2, size / 2 - 4, rh - 4);
            // Bevel: light top edge, dark bottom edge
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(x + 2, row * rh + 2, size / 2 - 4, 2);
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(x + 2, row * rh + rh - 4, size / 2 - 4, 2);
        }
    }
    noise(ctx, random, 0, 0, size, size, size * 18, 0.12, 1.5, 60, 220);
    // Chewing-gum spots and stains
    for (let i = 0; i < 22; i++) {
        ctx.fillStyle = `rgba(40,40,44,${0.15 + random() * 0.25})`;
        ctx.beginPath(); ctx.arc(random() * size, random() * size, 1.5 + random() * 3, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 5; i++) {
        const x = random() * size;
        const y = random() * size;
        const r = size * (0.05 + random() * 0.08);
        wrapDraw(size, x, y, r, (px, py) => {
            const gradient = ctx.createRadialGradient(px, py, 0, px, py, r);
            gradient.addColorStop(0, 'rgba(30,30,34,0.16)');
            gradient.addColorStop(1, 'rgba(30,30,34,0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(px - r, py - r, r * 2, r * 2);
        });
    }
    return toTexture(canvas, { repeat: true, anisotropy });
}
