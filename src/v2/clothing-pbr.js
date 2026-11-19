// Procedural high-resolution PBR textile textures (Albedo, Sobel Normal, Roughness, Metalness),
// embroidered original 5HC + sportbike crests, and studio shop thumbnails for 51Wheling collections.
import * as THREE from 'three';

const isMobileTex = () =>
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

function drawWrapped(ctx, width, drawFn) {
    for (const ox of [-width, 0, width]) {
        ctx.save();
        ctx.translate(ox, 0);
        drawFn();
        ctx.restore();
    }
}

function makeTexture(canvas, { srgb = false, wrapS = THREE.ClampToEdgeWrapping, wrapT = THREE.ClampToEdgeWrapping, anisotropy = 4 } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = wrapS;
    tex.wrapT = wrapT;
    tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
    return tex;
}

// Convert a greyscale height canvas into an OpenGL tangent-space Normal map with horizontal wrap.
function heightToNormalTexture(heightCanvas, strength = 2.6, wrapX = true) {
    const w = heightCanvas.width;
    const h = heightCanvas.height;
    const src = heightCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const [outCanvas, outCtx] = makeCanvas(w, h);
    const dst = outCtx.createImageData(w, h);
    const d = dst.data;

    const sample = (x, y) => {
        const sx = wrapX ? ((x % w) + w) % w : Math.max(0, Math.min(w - 1, x));
        const sy = Math.max(0, Math.min(h - 1, y));
        return src[(sy * w + sx) * 4] / 255;
    };

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const tl = sample(x - 1, y - 1);
            const t = sample(x, y - 1);
            const tr = sample(x + 1, y - 1);
            const l = sample(x - 1, y);
            const r = sample(x + 1, y);
            const bl = sample(x - 1, y + 1);
            const b = sample(x, y + 1);
            const br = sample(x + 1, y + 1);

            const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
            const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
            let nx = -dx;
            let ny = dy;
            let nz = 1.0;
            const inv = 1 / Math.hypot(nx, ny, nz);
            nx *= inv;
            ny *= inv;
            nz *= inv;

            const idx = (y * w + x) * 4;
            d[idx] = Math.round((nx * 0.5 + 0.5) * 255);
            d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            d[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            d[idx + 3] = 255;
        }
    }
    outCtx.putImageData(dst, 0, 0);
    return makeTexture(outCanvas, {
        srgb: false,
        wrapS: wrapX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping
    });
}

// Micro-weave texture overlays painted identically across Albedo, Height, Roughness.
function applyFabricGrain(albedoCtx, heightCtx, roughCtx, w, h, kind, seed = 51) {
    const rng = mulberry(seed);
    if (kind === 'boucle') {
        // Soft fuzzy/felted grey jacquard wool-nylon mix
        for (let i = 0; i < w * 14; i++) {
            const x = rng() * w;
            const y = rng() * h;
            const rad = 0.7 + rng() * 1.4;
            const bright = rng() > 0.5;
            albedoCtx.fillStyle = bright ? 'rgba(255,255,255,0.06)' : 'rgba(18,22,28,0.08)';
            albedoCtx.beginPath();
            albedoCtx.arc(x, y, rad, 0, Math.PI * 2);
            albedoCtx.fill();
            heightCtx.fillStyle = bright ? 'rgba(220,220,220,0.08)' : 'rgba(65,65,65,0.08)';
            heightCtx.fillRect(x, y, rad * 1.3, rad * 1.3);
        }
    } else if (kind === 'nylon') {
        // Fine diagonal technical ripstop/twill weave
        const step = Math.max(3, Math.round(w / 180));
        albedoCtx.strokeStyle = 'rgba(255,255,255,0.032)';
        heightCtx.strokeStyle = 'rgba(210,210,210,0.065)';
        albedoCtx.lineWidth = 1;
        heightCtx.lineWidth = 1;
        for (let y = 0; y < h; y += step) {
            albedoCtx.beginPath();
            albedoCtx.moveTo(0, y);
            albedoCtx.lineTo(w, y);
            albedoCtx.stroke();
            heightCtx.beginPath();
            heightCtx.moveTo(0, y);
            heightCtx.lineTo(w, y);
            heightCtx.stroke();
        }
        for (let x = 0; x < w; x += step) {
            heightCtx.beginPath();
            heightCtx.moveTo(x, 0);
            heightCtx.lineTo(x, h);
            heightCtx.stroke();
        }
    } else if (kind === 'mesh') {
        // Breathable micro-perforated football jersey knit
        const step = Math.max(4, Math.round(w / 128));
        for (let y = 0; y < h; y += step) {
            const shift = ((y / step) % 2) * (step * 0.5);
            for (let x = shift; x < w; x += step) {
                heightCtx.fillStyle = 'rgba(70,70,70,0.22)';
                heightCtx.fillRect(x, y, Math.max(1, step * 0.34), Math.max(1, step * 0.42));
                albedoCtx.fillStyle = 'rgba(0,0,0,0.035)';
                albedoCtx.fillRect(x, y, Math.max(1, step * 0.34), Math.max(1, step * 0.42));
                roughCtx.fillStyle = 'rgba(220,220,220,0.06)';
                roughCtx.fillRect(x, y, Math.max(1, step * 0.34), Math.max(1, step * 0.42));
            }
        }
    } else {
        // Polyester sport weave or heavyweight fleece
        const step = Math.max(3, Math.round(w / 160));
        heightCtx.fillStyle = kind === 'fleece' ? 'rgba(220,220,220,0.05)' : 'rgba(180,180,180,0.055)';
        for (let i = 0; i < w * 8; i++) {
            const x = rng() * w;
            const y = rng() * h;
            albedoCtx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
            albedoCtx.fillRect(x, y, step * 0.55, 1.4);
            heightCtx.fillRect(x, y, 1.5, 1.5);
        }
    }
}

// Draw embroidered 5HC crest (left chest of rider) with realistic stitched bevel in Height + Roughness.
function draw5HCCrest(albedoCtx, heightCtx, roughCtx, cx, cy, size, {
    fill = '#111318',
    ring = '#f6dc17',
    ink = '#f6dc17',
    stars = false,
    shield = false
} = {}) {
    const drawShape = (ctx, r, inflate = 0) => {
        ctx.beginPath();
        if (shield) {
            const rr = r + inflate;
            ctx.moveTo(cx - rr * 0.85, cy - rr * 0.92);
            ctx.lineTo(cx + rr * 0.85, cy - rr * 0.92);
            ctx.lineTo(cx + rr * 0.85, cy + rr * 0.12);
            ctx.quadraticCurveTo(cx + rr * 0.65, cy + rr * 0.88, cx, cy + rr * 1.12);
            ctx.quadraticCurveTo(cx - rr * 0.65, cy + rr * 0.88, cx - rr * 0.85, cy + rr * 0.12);
            ctx.closePath();
        } else {
            ctx.arc(cx, cy, r + inflate, 0, Math.PI * 2);
        }
    };

    // Stitched crest base
    drawShape(albedoCtx, size);
    albedoCtx.fillStyle = fill;
    albedoCtx.fill();
    albedoCtx.lineWidth = Math.max(2, size * 0.14);
    albedoCtx.strokeStyle = ring;
    albedoCtx.stroke();

    // Inner thin trim
    drawShape(albedoCtx, size * 0.78);
    albedoCtx.lineWidth = Math.max(1, size * 0.05);
    albedoCtx.strokeStyle = ink;
    albedoCtx.stroke();

    // Three championship stars above crest when requested (Bianconero style)
    if (stars) {
        for (const ox of [-0.52, 0, 0.52]) {
            const sx = cx + ox * size;
            const sy = cy - size * (shield ? 1.24 : 1.32);
            const sr = size * 0.18;
            for (const ctx of [albedoCtx, heightCtx]) {
                ctx.fillStyle = ctx === heightCtx ? '#f5f5f5' : '#eab308';
                ctx.beginPath();
                for (let k = 0; k < 10; k++) {
                    const a = -Math.PI / 2 + (k * Math.PI) / 5;
                    const rr = k % 2 === 0 ? sr : sr * 0.44;
                    if (k === 0) ctx.moveTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
                    else ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
                }
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    // Crisp "5HC" embroidery lettering
    albedoCtx.save();
    albedoCtx.fillStyle = ink;
    albedoCtx.font = `italic 900 ${Math.round(size * 0.72)}px "Arial Black", Impact, sans-serif`;
    albedoCtx.textAlign = 'center';
    albedoCtx.textBaseline = 'middle';
    albedoCtx.fillText('5HC', cx, cy + size * 0.04);
    albedoCtx.restore();

    // Relief in Height + specular thread contrast in Roughness
    drawShape(heightCtx, size, 1);
    heightCtx.fillStyle = '#cfcfcf';
    heightCtx.fill();
    heightCtx.lineWidth = Math.max(2.5, size * 0.18);
    heightCtx.strokeStyle = '#ffffff';
    heightCtx.stroke();
    heightCtx.fillStyle = '#fbfbfb';
    heightCtx.font = `italic 900 ${Math.round(size * 0.72)}px "Arial Black", Impact, sans-serif`;
    heightCtx.textAlign = 'center';
    heightCtx.textBaseline = 'middle';
    heightCtx.fillText('5HC', cx, cy + size * 0.04);

    drawShape(roughCtx, size);
    roughCtx.fillStyle = '#5c5c5c';
    roughCtx.fill();
}

// Draw original embroidered sportbike / wheelie emblem on the opposite chest.
function drawMotoLogo(albedoCtx, heightCtx, roughCtx, cx, cy, size, {
    color = '#f6dc17',
    accent = '#ffffff',
    outline = '#101216'
} = {}) {
    const drawBike = (ctx, isHeight) => {
        ctx.save();
        ctx.translate(cx, cy);
        const s = size / 24;
        ctx.scale(s, s);
        const mainCol = isHeight ? '#ffffff' : color;
        const secCol = isHeight ? '#d8d8d8' : accent;

        // Motion arc under wheel
        ctx.strokeStyle = secCol;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-19, 10);
        ctx.quadraticCurveTo(0, 14, 17, 7);
        ctx.stroke();

        // Rear & lifted front wheels (profile wheelie silhouette)
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = isHeight ? '#f2f2f2' : mainCol;
        ctx.beginPath();
        ctx.arc(-10, 5, 5.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(11, -3, 5.0, 0, Math.PI * 2);
        ctx.stroke();

        // Aggressive sportbike tank, tail, fork & rider silhouette
        ctx.fillStyle = mainCol;
        if (!isHeight) {
            ctx.strokeStyle = outline;
            ctx.lineWidth = 1.2;
        }
        ctx.beginPath();
        ctx.moveTo(-14, 2);
        ctx.lineTo(-4, -3);
        ctx.lineTo(3, -10);
        ctx.lineTo(13, -7);
        ctx.lineTo(6, -1);
        ctx.lineTo(-6, 4);
        ctx.closePath();
        ctx.fill();

        // Rider crouched
        ctx.beginPath();
        ctx.arc(-1, -13, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3.0;
        ctx.strokeStyle = mainCol;
        ctx.beginPath();
        ctx.moveTo(-7, -3);
        ctx.lineTo(-2, -10);
        ctx.lineTo(6, -8);
        ctx.stroke();

        // Small "MOTO 5HC" subtle speed ticks
        ctx.strokeStyle = secCol;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-19, -5);
        ctx.lineTo(-12, -5);
        ctx.moveTo(-18, -1);
        ctx.lineTo(-10, -1);
        ctx.stroke();
        ctx.restore();
    };

    drawBike(albedoCtx, false);
    drawBike(heightCtx, true);
    roughCtx.save();
    roughCtx.fillStyle = '#525252';
    roughCtx.beginPath();
    roughCtx.ellipse(cx, cy, size * 0.95, size * 0.72, 0, 0, Math.PI * 2);
    roughCtx.fill();
    roughCtx.restore();
}

// Draw central zipper teeth + slider + top/bottom stitch placket at UV x = w * 0.5.
function drawCenterZip(albedoCtx, heightCtx, roughCtx, metalCtx, w, h, {
    yTopFrac = 0.02,
    yBotFrac = 0.98,
    tapeColor = '#1e2026',
    teethColor = '#cbd5e1',
    pullColor = '#eab308',
    doublePull = false,
    placketWidth = 14
} = {}) {
    const cx = w * 0.5;
    const y0 = h * yTopFrac;
    const y1 = h * yBotFrac;
    const scale = w / 1024;
    const pw = placketWidth * scale;

    // Fabric placket backing + edge topstitching
    albedoCtx.fillStyle = tapeColor;
    albedoCtx.fillRect(cx - pw * 0.5, y0, pw, y1 - y0);
    heightCtx.fillStyle = '#707070';
    heightCtx.fillRect(cx - pw * 0.5, y0, pw, y1 - y0);

    // Fine topstitch along placket sides
    albedoCtx.strokeStyle = 'rgba(0,0,0,0.38)';
    heightCtx.strokeStyle = '#585858';
    for (const sx of [cx - pw * 0.5, cx + pw * 0.5]) {
        albedoCtx.beginPath();
        albedoCtx.setLineDash([4 * scale, 4 * scale]);
        albedoCtx.moveTo(sx, y0);
        albedoCtx.lineTo(sx, y1);
        albedoCtx.stroke();
        heightCtx.beginPath();
        heightCtx.setLineDash([4 * scale, 4 * scale]);
        heightCtx.moveTo(sx, y0);
        heightCtx.lineTo(sx, y1);
        heightCtx.stroke();
    }
    albedoCtx.setLineDash([]);
    heightCtx.setLineDash([]);

    // Zipper teeth
    const step = Math.max(4, Math.round(7 * scale));
    const tw = Math.max(2, 4 * scale);
    albedoCtx.fillStyle = teethColor;
    heightCtx.fillStyle = '#ededed';
    metalCtx.fillStyle = '#d8d8d8';
    roughCtx.fillStyle = '#404040';
    for (let y = y0 + step; y < y1 - step; y += step) {
        const side = ((Math.round(y / step) % 2) * 2 - 1) * 1.4 * scale;
        albedoCtx.fillRect(cx + side - tw * 0.5, y, tw, step * 0.55);
        heightCtx.fillRect(cx + side - tw * 0.5, y, tw, step * 0.55);
        metalCtx.fillRect(cx + side - tw * 0.5, y, tw, step * 0.55);
        roughCtx.fillRect(cx + side - tw * 0.5, y, tw, step * 0.55);
    }

    // Pull slider(s)
    const drawPull = (py) => {
        const sw = 12 * scale;
        const sh = 20 * scale;
        albedoCtx.fillStyle = pullColor;
        albedoCtx.fillRect(cx - sw * 0.5, py, sw, sh);
        albedoCtx.strokeStyle = 'rgba(0,0,0,0.4)';
        albedoCtx.strokeRect(cx - sw * 0.5, py, sw, sh);
        heightCtx.fillStyle = '#ffffff';
        heightCtx.fillRect(cx - sw * 0.5, py, sw, sh);
        metalCtx.fillStyle = '#f2f2f2';
        metalCtx.fillRect(cx - sw * 0.5, py, sw, sh);
        roughCtx.fillStyle = '#323232';
        roughCtx.fillRect(cx - sw * 0.5, py, sw, sh);
    };
    drawPull(y0 + 8 * scale);
    if (doublePull) drawPull(y1 - 24 * scale);
}

// Draw horizontal quilted seam valleys + light puffy crease shading aligned to UV rows.
function drawQuiltSeams(albedoCtx, heightCtx, roughCtx, w, h, rowFractions, seamOpacity = 0.34, withVerticalSides = true) {
    const scale = w / 1024;
    for (const frac of rowFractions) {
        const y = frac * h;
        // Soft puff gradient above & below seam for rich ambient occlusion
        const g = albedoCtx.createLinearGradient(0, y - 16 * scale, 0, y + 16 * scale);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, `rgba(0,0,0,${seamOpacity})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        albedoCtx.fillStyle = g;
        albedoCtx.fillRect(0, y - 16 * scale, w, 32 * scale);

        // Deep concave groove in heightmap so normal map catches studio light
        const hg = heightCtx.createLinearGradient(0, y - 16 * scale, 0, y + 16 * scale);
        hg.addColorStop(0, 'rgba(0,0,0,0)');
        hg.addColorStop(0.45, 'rgba(20,20,20,0.85)');
        hg.addColorStop(0.5, 'rgba(0,0,0,0.95)');
        hg.addColorStop(0.55, 'rgba(20,20,20,0.85)');
        hg.addColorStop(1, 'rgba(0,0,0,0)');
        heightCtx.fillStyle = hg;
        heightCtx.fillRect(0, y - 16 * scale, w, 32 * scale);

        // Micro thread stitch dots inside seam
        albedoCtx.strokeStyle = 'rgba(0,0,0,0.42)';
        albedoCtx.lineWidth = Math.max(1, 1.8 * scale);
        albedoCtx.setLineDash([5 * scale, 5 * scale]);
        albedoCtx.beginPath();
        albedoCtx.moveTo(0, y);
        albedoCtx.lineTo(w, y);
        albedoCtx.stroke();
        albedoCtx.setLineDash([]);

        roughCtx.fillStyle = 'rgba(225,225,225,0.28)';
        roughCtx.fillRect(0, y - 3 * scale, w, 6 * scale);
    }

    if (withVerticalSides) {
        for (const xFrac of [0.24, 0.76]) {
            const x = w * xFrac;
            albedoCtx.strokeStyle = 'rgba(0,0,0,0.28)';
            heightCtx.strokeStyle = 'rgba(20,20,20,0.7)';
            albedoCtx.lineWidth = Math.max(1.5, 3 * scale);
            heightCtx.lineWidth = Math.max(2, 5 * scale);
            albedoCtx.beginPath();
            albedoCtx.moveTo(x, h * 0.08);
            albedoCtx.lineTo(x, h * 0.94);
            albedoCtx.stroke();
            heightCtx.beginPath();
            heightCtx.moveTo(x, h * 0.08);
            heightCtx.lineTo(x, h * 0.94);
            heightCtx.stroke();
        }
    }
}

// Draw natural diagonal compression folds around waist, chest, and elbows.
function drawOrganicFolds(albedoCtx, heightCtx, w, h, strength = 0.08, seed = 9) {
    const rng = mulberry(seed);
    const scale = w / 1024;
    for (let i = 0; i < 24; i++) {
        const x = rng() * w;
        const y = h * (0.14 + rng() * 0.74);
        const len = (36 + rng() * 68) * scale;
        const ang = (rng() - 0.5) * 0.45;
        const dx = Math.cos(ang) * len;
        const dy = Math.sin(ang) * len;
        drawWrapped(albedoCtx, w, () => {
            albedoCtx.strokeStyle = rng() > 0.4 ? `rgba(0,0,0,${strength})` : `rgba(255,255,255,${strength * 0.5})`;
            albedoCtx.lineWidth = (2.5 + rng() * 3) * scale;
            albedoCtx.lineCap = 'round';
            albedoCtx.beginPath();
            albedoCtx.moveTo(x, y);
            albedoCtx.quadraticCurveTo(x + dx * 0.5, y + dy * 0.5 + 8 * scale, x + dx, y + dy);
            albedoCtx.stroke();
        });
        drawWrapped(heightCtx, w, () => {
            heightCtx.strokeStyle = rng() > 0.5 ? 'rgba(65,65,65,0.22)' : 'rgba(210,210,210,0.18)';
            heightCtx.lineWidth = (3.5 + rng() * 3.5) * scale;
            heightCtx.lineCap = 'round';
            heightCtx.beginPath();
            heightCtx.moveTo(x, y);
            heightCtx.quadraticCurveTo(x + dx * 0.5, y + dy * 0.5 + 8 * scale, x + dx, y + dy);
            heightCtx.stroke();
        });
    }
}

// ---------- PATTERN PAINTING FOR SPECIFIC GARMENTS ----------------------------

// Ref 3: Grey fluffy oversized puffer with embossed/jacquard 5HC monogram pattern across all surfaces.
function paintMonogramJacquard(albedoCtx, heightCtx, roughCtx, w, h, repeatX = 8, repeatY = 7) {
    const cellW = w / repeatX;
    const cellH = h / repeatY;
    for (let row = 0; row <= repeatY; row++) {
        for (let col = -1; col <= repeatX + 1; col++) {
            const cx = (col + (row % 2) * 0.5) * cellW;
            const cy = row * cellH;
            const kind = (row + col + 20) % 4;

            const drawMotif = (ctx, fill, stroke) => {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.fillStyle = fill;
                ctx.strokeStyle = stroke;
                if (kind === 0) {
                    // Interlocking 5HC monogram
                    ctx.font = `italic 900 ${Math.round(cellH * 0.42)}px "Arial Black", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('5HC', 0, 0);
                } else if (kind === 1) {
                    // Jacquard diamond quatrefoil flower
                    const r = cellH * 0.3;
                    ctx.lineWidth = Math.max(1.5, cellH * 0.06);
                    ctx.beginPath();
                    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    for (let k = 0; k < 4; k++) {
                        const a = (k * Math.PI) / 2;
                        ctx.ellipse(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.28, r * 0.16, a, 0, Math.PI * 2);
                    }
                    ctx.fill();
                } else if (kind === 2) {
                    // 4-point sharp star emblem inside soft diamond
                    const r = cellH * 0.28;
                    ctx.beginPath();
                    for (let k = 0; k < 8; k++) {
                        const a = (k * Math.PI) / 4;
                        const rr = k % 2 === 0 ? r : r * 0.34;
                        if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
                        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
                    }
                    ctx.closePath();
                    ctx.fill();
                } else {
                    // Framed 51 / petal medallion
                    const r = cellH * 0.27;
                    ctx.beginPath();
                    ctx.moveTo(0, -r);
                    ctx.lineTo(r * 0.9, 0);
                    ctx.lineTo(0, r);
                    ctx.lineTo(-r * 0.9, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.font = `900 ${Math.round(cellH * 0.24)}px Arial, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = ctx === heightCtx ? '#c4c4c4' : '#90959c';
                    ctx.fillText('51', 0, 1);
                }
                ctx.restore();
            };

            // Embossed shadow edge in height & subtle tonal jacquard in albedo
            drawWrapped(albedoCtx, w, () => {
                drawMotif(albedoCtx, 'rgba(56,61,68,0.78)', 'rgba(56,61,68,0.78)');
                albedoCtx.translate(-1.5, -1.5);
                drawMotif(albedoCtx, 'rgba(218,222,228,0.52)', 'rgba(218,222,228,0.52)');
                albedoCtx.translate(1.5, 1.5);
            });
            if (heightCtx) {
                drawWrapped(heightCtx, w, () => {
                    drawMotif(heightCtx, '#ffffff', '#ffffff');
                });
            }
            if (roughCtx) {
                drawWrapped(roughCtx, w, () => {
                    drawMotif(roughCtx, 'rgba(175,175,175,0.4)', 'rgba(175,175,175,0.4)');
                });
            }
        }
    }
}

// Ref 3bis: Beige tartan check pattern (beige sand, black, cream white, thin brick red lines).
function paintTartanCheck(albedoCtx, heightCtx, w, h, cols = 6, rows = 4) {
    // Base warm sand beige
    albedoCtx.fillStyle = '#c9b390';
    albedoCtx.fillRect(0, 0, w, h);

    const cellW = w / cols;
    const cellH = h / rows;

    // Subtle fabric woven diagonal darkening where bands cross
    const drawCrossBands = (ctx, isV, pos, span) => {
        const half = span * 0.5;
        // Thin center subtle shadow line inside beige
        ctx.fillStyle = 'rgba(28,24,20,0.34)';
        if (isV) ctx.fillRect(pos - span * 0.22, 0, span * 0.44, h);
        else ctx.fillRect(0, pos - span * 0.22, w, span * 0.44);

        // Cream white flanking bars
        ctx.fillStyle = 'rgba(244,240,232,0.58)';
        if (isV) {
            ctx.fillRect(pos - span * 0.34, 0, span * 0.14, h);
            ctx.fillRect(pos + span * 0.20, 0, span * 0.14, h);
        } else {
            ctx.fillRect(0, pos - span * 0.34, w, span * 0.14);
            ctx.fillRect(0, pos + span * 0.20, w, span * 0.14);
        }

        // Outer black triple/bold check bars
        ctx.fillStyle = 'rgba(18,20,24,0.82)';
        const bar = span * 0.11;
        if (isV) {
            ctx.fillRect(pos - half, 0, bar, h);
            ctx.fillRect(pos - span * 0.12, 0, bar * 0.7, h);
            ctx.fillRect(pos + span * 0.06, 0, bar * 0.7, h);
            ctx.fillRect(pos + half - bar, 0, bar, h);
        } else {
            ctx.fillRect(0, pos - half, w, bar);
            ctx.fillRect(0, pos - span * 0.12, w, bar * 0.7);
            ctx.fillRect(0, pos + span * 0.06, w, bar * 0.7);
            ctx.fillRect(0, pos + half - bar, w, bar);
        }

        // Signature thin brick-red center thread stripe in the middle of the sand square
        const mid = pos + span;
        ctx.fillStyle = 'rgba(196,62,46,0.82)';
        const redT = Math.max(1.8, span * 0.032);
        if (isV) {
            drawWrapped(ctx, w, () => ctx.fillRect(mid - span * 0.5 - redT * 0.5, 0, redT, h));
        } else {
            ctx.fillRect(0, mid - span * 0.5 - redT * 0.5, w, redT);
        }
    };

    for (let c = 0; c <= cols; c++) {
        drawWrapped(albedoCtx, w, () => drawCrossBands(albedoCtx, true, c * cellW, cellW * 0.44));
    }
    for (let r = 0; r <= rows; r++) {
        drawCrossBands(albedoCtx, false, r * cellH, cellH * 0.44);
    }

    // Fine twill thread texture inside the heightmap along check weave
    if (heightCtx) {
        const step = Math.max(3, Math.round(w / 180));
        heightCtx.strokeStyle = 'rgba(215,215,215,0.08)';
        heightCtx.lineWidth = 1;
        for (let d = -h; d < w + h; d += step) {
            heightCtx.beginPath();
            heightCtx.moveTo(d, 0);
            heightCtx.lineTo(d + h, h);
            heightCtx.stroke();
        }
    }
}

// Paint paint-splatter dynamic graphic for BVB Dortmund jacket upper chest + sleeves + hood.
function paintYellowSplatter(ctx, w, h, yFromFrac, yToFrac, xRanges, seed = 77) {
    const rng = mulberry(seed);
    const scale = w / 1024;
    ctx.fillStyle = '#f6dc17';
    for (const [x0f, x1f, density] of xRanges) {
        const count = Math.round(density * 140);
        for (let i = 0; i < count; i++) {
            const cx = w * (x0f + rng() * (x1f - x0f));
            const cy = h * (yFromFrac + rng() * (yToFrac - yFromFrac));
            const shards = 3 + Math.floor(rng() * 4);
            const baseR = (8 + rng() * 24) * scale;
            drawWrapped(ctx, w, () => {
                ctx.beginPath();
                for (let k = 0; k < shards; k++) {
                    const a = (k / shards) * Math.PI * 2 + rng() * 0.9;
                    const rr = baseR * (0.35 + rng() * 0.85);
                    const px = cx + Math.cos(a) * rr * (0.8 + rng() * 0.7);
                    const py = cy + Math.sin(a) * rr;
                    if (k === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
            });
        }
    }
}

// ---------- GARMENT MATERIAL BUILDERS ---------------------------------------

function createMaterialSet({
    baseColor = '#ffffff',
    size,
    heightStrength = 2.6,
    baseRoughness = 185,
    sheen = 0.2,
    sheenColor = 0xffffff,
    sheenRoughness = 0.7,
    clearcoat = 0,
    clearcoatRoughness = 0.4,
    wrapX = true,
    paintFn
}) {
    const [albedoC, albedoCtx] = makeCanvas(size, size);
    const [heightC, heightCtx] = makeCanvas(size, size);
    const [roughC, roughCtx] = makeCanvas(size, size);
    const [metalC, metalCtx] = makeCanvas(size, size);

    albedoCtx.fillStyle = baseColor;
    albedoCtx.fillRect(0, 0, size, size);
    heightCtx.fillStyle = '#808080';
    heightCtx.fillRect(0, 0, size, size);
    const r = Math.max(0, Math.min(255, Math.round(baseRoughness)));
    roughCtx.fillStyle = `rgb(${r},${r},${r})`;
    roughCtx.fillRect(0, 0, size, size);
    metalCtx.fillStyle = '#000000';
    metalCtx.fillRect(0, 0, size, size);

    paintFn(albedoCtx, heightCtx, roughCtx, metalCtx, size, size);

    const map = makeTexture(albedoC, {
        srgb: true,
        wrapS: wrapX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
    });
    const normalMap = heightToNormalTexture(heightC, heightStrength, wrapX);
    const roughnessMap = makeTexture(roughC, {
        srgb: false,
        wrapS: wrapX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
    });
    const metalnessMap = makeTexture(metalC, {
        srgb: false,
        wrapS: wrapX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
    });

    const mat = new THREE.MeshPhysicalMaterial({
        map,
        normalMap,
        normalScale: new THREE.Vector2(1.0, 1.0),
        roughnessMap,
        roughness: 1.0,
        metalnessMap,
        metalness: 1.0,
        sheen,
        sheenRoughness,
        sheenColor: new THREE.Color(sheenColor),
        clearcoat,
        clearcoatRoughness,
        envMapIntensity: 0.95
    });

    return { mat, maps: [map, normalMap, roughnessMap, metalnessMap] };
}

function buildPufferGrey(size) {
    // Soft heather grey fluffy jacquard monogram puffer
    const torso = createMaterialSet({
        baseColor: '#8d9299',
        size,
        heightStrength: 3.1,
        baseRoughness: 228, // 0.89 matte fluffy
        sheen: 0.82,
        sheenColor: 0xe2e6ec,
        sheenRoughness: 0.68,
        paintFn(a, h, r, m, W, H) {
            paintMonogramJacquard(a, h, r, W, H, 9, 8);
            applyFabricGrain(a, h, r, W, H, 'boucle', 31);
            drawQuiltSeams(a, h, r, W, H, [0.22, 0.42, 0.62, 0.82], 0.28, true);
            drawOrganicFolds(a, h, W, H, 0.075, 19);
            drawCenterZip(a, h, r, m, W, H, {
                yTopFrac: 0.02, yBotFrac: 0.98, tapeColor: '#6f747b', teethColor: '#b4bac2', pullColor: '#9ca3af', placketWidth: 16
            });
            // Subtle side welt pockets
            const sc = W / 1024;
            for (const xFrac of [0.35, 0.65]) {
                const px = W * xFrac;
                a.strokeStyle = 'rgba(35,38,44,0.55)';
                h.strokeStyle = '#303030';
                a.lineWidth = 5 * sc;
                h.lineWidth = 7 * sc;
                a.beginPath();
                a.moveTo(px - 22 * sc, H * 0.65);
                a.lineTo(px + 22 * sc, H * 0.79);
                a.stroke();
                h.beginPath();
                h.moveTo(px - 22 * sc, H * 0.65);
                h.lineTo(px + 22 * sc, H * 0.79);
                h.stroke();
            }
        }
    });

    const sleeve = createMaterialSet({
        baseColor: '#8d9299',
        size: Math.min(512, size),
        heightStrength: 2.9,
        baseRoughness: 228,
        sheen: 0.82,
        sheenColor: 0xe2e6ec,
        sheenRoughness: 0.68,
        paintFn(a, h, r, m, W, H) {
            paintMonogramJacquard(a, h, r, W, H, 4, 5);
            applyFabricGrain(a, h, r, W, H, 'boucle', 41);
            drawQuiltSeams(a, h, r, W, H, [0.33, 0.67], 0.30, false);
            drawOrganicFolds(a, h, W, H, 0.08, 43);
        }
    });

    const hood = createMaterialSet({
        baseColor: '#8a8f96',
        size: Math.min(512, size),
        heightStrength: 3.0,
        baseRoughness: 230,
        sheen: 0.85,
        sheenColor: 0xe2e6ec,
        sheenRoughness: 0.68,
        paintFn(a, h, r, m, W, H) {
            paintMonogramJacquard(a, h, r, W, H, 5, 4);
            applyFabricGrain(a, h, r, W, H, 'boucle', 53);
            drawOrganicFolds(a, h, W, H, 0.08, 59);
        }
    });

    const pants = createMaterialSet({
        baseColor: '#1e2128',
        size: Math.min(512, size),
        heightStrength: 2.0,
        baseRoughness: 215,
        sheen: 0.25,
        paintFn(a, h, r, m, W, H) {
            applyFabricGrain(a, h, r, W, H, 'fleece', 61);
            drawOrganicFolds(a, h, W, H, 0.06, 67);
            const sc = W / 512;
            a.fillStyle = '#2b303a';
            a.fillRect(W * 0.14, H * 0.25, W * 0.2, H * 0.26);
            h.fillStyle = '#a8a8a8';
            h.fillRect(W * 0.14, H * 0.25, W * 0.2, H * 0.26);
            drawQuiltSeams(a, h, r, W, H, [0.46, 0.92], 0.2, false);
            a.strokeStyle = 'rgba(255,255,255,0.08)';
            a.lineWidth = 2 * sc;
            a.strokeRect(W * 0.14, H * 0.25, W * 0.2, H * 0.26);
        }
    });

    const lining = new THREE.MeshStandardMaterial({ color: 0x3b3f47, roughness: 0.94, metalness: 0 });
    return { torso, sleeveL: sleeve, sleeveR: sleeve, hood, pants, accentMat: lining, cuffMat: lining, maps: [...torso.maps, ...sleeve.maps, ...hood.maps, ...pants.maps] };
}

function buildPufferCheck(size) {
    // Ref 3bis: Beige check technical nylon puffer with brass snap tabs & black matte lining/cuffs
    const torso = createMaterialSet({
        baseColor: '#c9b390',
        size,
        heightStrength: 3.0,
        baseRoughness: 145, // Technical nylon mat-satin ~0.57
        sheen: 0.34,
        sheenColor: 0xf7ecd9,
        sheenRoughness: 0.55,
        clearcoat: 0.05,
        clearcoatRoughness: 0.65,
        paintFn(a, h, r, m, W, H) {
            paintTartanCheck(a, h, W, H, 7, 5);
            applyFabricGrain(a, h, r, W, H, 'nylon', 101);
            drawQuiltSeams(a, h, r, W, H, [0.17, 0.34, 0.51, 0.68, 0.85], 0.38, true);
            drawOrganicFolds(a, h, W, H, 0.06, 103);
            drawCenterZip(a, h, r, m, W, H, {
                yTopFrac: 0.02, yBotFrac: 0.98, tapeColor: '#d2be9e', teethColor: '#dfc685', pullColor: '#d4a644', doublePull: true, placketWidth: 15
            });
        }
    });

    const sleeve = createMaterialSet({
        baseColor: '#c9b390',
        size: Math.min(512, size),
        heightStrength: 2.9,
        baseRoughness: 145,
        sheen: 0.34,
        sheenColor: 0xf7ecd9,
        clearcoat: 0.05,
        paintFn(a, h, r, m, W, H) {
            paintTartanCheck(a, h, W, H, 4, 3);
            applyFabricGrain(a, h, r, W, H, 'nylon', 107);
            drawQuiltSeams(a, h, r, W, H, [0.33, 0.67], 0.36, false);
            drawOrganicFolds(a, h, W, H, 0.065, 109);
        }
    });

    const hood = createMaterialSet({
        baseColor: '#c9b390',
        size: Math.min(512, size),
        heightStrength: 2.8,
        baseRoughness: 145,
        sheen: 0.34,
        sheenColor: 0xf7ecd9,
        paintFn(a, h, r, m, W, H) {
            paintTartanCheck(a, h, W, H, 4, 3);
            applyFabricGrain(a, h, r, W, H, 'nylon', 113);
            drawQuiltSeams(a, h, r, W, H, [0.5], 0.3, false);
        }
    });

    const pants = createMaterialSet({
        baseColor: '#13151a',
        size: Math.min(512, size),
        heightStrength: 1.8,
        baseRoughness: 205,
        sheen: 0.18,
        paintFn(a, h, r, m, W, H) {
            applyFabricGrain(a, h, r, W, H, 'nylon', 127);
            drawOrganicFolds(a, h, W, H, 0.06, 131);
        }
    });

    const cuffMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.88, metalness: 0.02 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a644, roughness: 0.32, metalness: 0.85 });
    return { torso, sleeveL: sleeve, sleeveR: sleeve, hood, pants, cuffMat, accentMat: cuffMat, snapMat: brassMat, maps: [...torso.maps, ...sleeve.maps, ...hood.maps, ...pants.maps] };
}

function buildTracksuitBVB(size) {
    // Ref 1: Black + vibrant yellow splatter jacket with diagonal chest wedge + 5HC left chest + Moto right chest
    const torso = createMaterialSet({
        baseColor: '#111317',
        size,
        heightStrength: 2.5,
        baseRoughness: 162, // Polyester sport ~0.64
        sheen: 0.25,
        sheenColor: 0xf8eb7a,
        paintFn(a, h, r, m, W, H) {
            // Splatter top 42% of jacket (shoulders, chest, upper back)
            paintYellowSplatter(a, W, H, 0.01, 0.44, [[0, 1, 1.0]], 211);
            // Clean black base mask over left/lower chest & back below diagonal
            a.fillStyle = '#111317';
            a.beginPath();
            a.moveTo(0, H * 0.38);
            a.lineTo(W * 0.32, H * 0.43);
            a.lineTo(W * 0.65, H * 0.34);
            a.lineTo(W, H * 0.38);
            a.lineTo(W, H);
            a.lineTo(0, H);
            a.closePath();
            a.fill();

            // Iconic bright yellow asymmetrical wedge on wearer's right chest / flank (u ~ 0.27..0.50)
            a.fillStyle = '#f5de16';
            a.beginPath();
            a.moveTo(W * 0.25, H * 0.38);
            a.lineTo(W * 0.50, H * 0.39);
            a.lineTo(W * 0.26, H * 0.58);
            a.closePath();
            a.fill();

            applyFabricGrain(a, h, r, W, H, 'poly', 223);
            drawOrganicFolds(a, h, W, H, 0.06, 227);
            // Yellow chest seam piping
            a.strokeStyle = 'rgba(0,0,0,0.45)';
            h.strokeStyle = '#383838';
            a.lineWidth = (3 * W) / 1024;
            h.lineWidth = (5 * W) / 1024;
            a.beginPath();
            a.moveTo(W * 0.26, H * 0.58);
            a.lineTo(W * 0.65, H * 0.34);
            a.stroke();
            h.beginPath();
            h.moveTo(W * 0.26, H * 0.58);
            h.lineTo(W * 0.65, H * 0.34);
            h.stroke();

            // Central yellow top quarter/half zipper + black lower seam
            drawCenterZip(a, h, r, m, W, H, {
                yTopFrac: 0.03, yBotFrac: 0.46, tapeColor: '#f5de16', teethColor: '#e2cb12', pullColor: '#f6dc17', placketWidth: 11
            });

            // Side left chest (rider left = +x = u ~ 0.585): Embroidered 5HC club crest
            draw5HCCrest(a, h, r, W * 0.588, H * 0.26, W * 0.044, {
                fill: '#111317', ring: '#f5de16', ink: '#f5de16'
            });
            // Opposite chest (rider right = -x = u ~ 0.415): Embroidered sportbike logo
            drawMotoLogo(a, h, r, W * 0.412, H * 0.26, W * 0.044, {
                color: '#f5de16', accent: '#ffffff'
            });
        }
    });

    const makeSleeve = (isRight) => createMaterialSet({
        baseColor: '#111317',
        size: Math.min(512, size),
        heightStrength: 2.3,
        baseRoughness: 162,
        sheen: 0.25,
        paintFn(a, h, r, m, W, H) {
            paintYellowSplatter(a, W, H, 0.04, 0.92, [[0.1, 0.9, 0.72]], isRight ? 233 : 239);
            if (isRight) {
                // Solid yellow panel running along inner underside of right sleeve
                a.fillStyle = '#f5de16';
                a.fillRect(W * 0.35, 0, W * 0.32, H);
            }
            applyFabricGrain(a, h, r, W, H, 'poly', isRight ? 241 : 251);
            drawOrganicFolds(a, h, W, H, 0.06, isRight ? 257 : 263);
        }
    });
    const sleeveR = makeSleeve(true);
    const sleeveL = makeSleeve(false);

    const hood = createMaterialSet({
        baseColor: '#111317',
        size: Math.min(512, size),
        heightStrength: 2.2,
        baseRoughness: 166,
        sheen: 0.24,
        paintFn(a, h, r, m, W, H) {
            paintYellowSplatter(a, W, H, 0.05, 0.95, [[0, 1, 0.9]], 269);
            applyFabricGrain(a, h, r, W, H, 'poly', 271);
        }
    });

    const pants = createMaterialSet({
        baseColor: '#101216',
        size: Math.min(512, size),
        heightStrength: 2.2,
        baseRoughness: 168,
        sheen: 0.22,
        paintFn(a, h, r, m, W, H) {
            // Vivid yellow hip-pocket/side flare panels matching reference trousers
            a.fillStyle = '#f5de16';
            for (const xCenter of [0.25, 0.75]) {
                a.beginPath();
                a.moveTo(W * (xCenter - 0.09), 0);
                a.lineTo(W * (xCenter + 0.09), 0);
                a.lineTo(W * (xCenter + 0.06), H * 0.36);
                a.lineTo(W * (xCenter - 0.06), H * 0.36);
                a.closePath();
                a.fill();
            }
            applyFabricGrain(a, h, r, W, H, 'poly', 277);
            drawOrganicFolds(a, h, W, H, 0.065, 281);
            // Thigh 5HC + Moto embroidered patches on front
            draw5HCCrest(a, h, r, W * 0.42, H * 0.34, W * 0.055, { fill: '#111317', ring: '#f5de16', ink: '#f5de16' });
            drawMotoLogo(a, h, r, W * 0.58, H * 0.34, W * 0.055, { color: '#f5de16', accent: '#ffffff' });
        }
    });

    const cuffBlack = new THREE.MeshStandardMaterial({ color: 0x121419, roughness: 0.85, metalness: 0 });
    const cuffYellow = new THREE.MeshStandardMaterial({ color: 0xf5de16, roughness: 0.82, metalness: 0 });
    return { torso, sleeveL, sleeveR, hood, pants, cuffMat: cuffBlack, cuffMatR: cuffYellow, accentMat: cuffBlack, maps: [...torso.maps, ...sleeveL.maps, ...sleeveR.maps, ...hood.maps, ...pants.maps] };
}

function buildTracksuitVolt(size) {
    // Ref 2: Electric Neon Yellow / Volt hooded tracksuit + black trim + 3 side stripes + black track pants
    const torso = createMaterialSet({
        baseColor: '#d9f11b',
        size,
        heightStrength: 2.4,
        baseRoughness: 158,
        sheen: 0.28,
        sheenColor: 0xf4ff8a,
        paintFn(a, h, r, m, W, H) {
            const sc = W / 1024;
            // Fine black shoulder/neck contrast piping
            a.fillStyle = '#121418';
            a.fillRect(0, 0, W, 22 * sc);

            // Signature 3 vertical thin black flank stripes down both sides
            for (const xMid of [W * 0.25, W * 0.75]) {
                for (const dx of [-16, 0, 16]) {
                    a.fillStyle = '#121418';
                    a.fillRect(xMid + dx * sc - 4 * sc, H * 0.42, 8 * sc, H * 0.54);
                    h.fillStyle = '#a4a4a4';
                    h.fillRect(xMid + dx * sc - 4 * sc, H * 0.42, 8 * sc, H * 0.54);
                }
            }

            // Diagonal zippered side pockets
            for (const xFrac of [0.34, 0.66]) {
                a.strokeStyle = '#181a1f';
                h.strokeStyle = '#383838';
                a.lineWidth = 4 * sc;
                h.lineWidth = 6 * sc;
                a.beginPath();
                a.moveTo(W * xFrac, H * 0.62);
                a.lineTo(W * xFrac, H * 0.84);
                a.stroke();
                h.beginPath();
                h.moveTo(W * xFrac, H * 0.62);
                h.lineTo(W * xFrac, H * 0.84);
                h.stroke();
            }

            applyFabricGrain(a, h, r, W, H, 'poly', 311);
            drawOrganicFolds(a, h, W, H, 0.055, 313);
            drawCenterZip(a, h, r, m, W, H, {
                yTopFrac: 0.02, yBotFrac: 0.98, tapeColor: '#a6ba14', teethColor: '#262930', pullColor: '#181a1f', placketWidth: 12
            });

            // Left chest (+x = u ~ 0.585): Embroidered 5HC club shield crest
            draw5HCCrest(a, h, r, W * 0.588, H * 0.25, W * 0.044, {
                fill: '#121418', ring: '#d9f11b', ink: '#ffffff', shield: true
            });
            // Opposite chest (-x = u ~ 0.415): Embroidered black sportbike emblem
            drawMotoLogo(a, h, r, W * 0.412, H * 0.25, W * 0.044, {
                color: '#121418', accent: '#121418', outline: '#d9f11b'
            });
        }
    });

    const sleeve = createMaterialSet({
        baseColor: '#d9f11b',
        size: Math.min(512, size),
        heightStrength: 2.2,
        baseRoughness: 158,
        sheen: 0.28,
        paintFn(a, h, r, m, W, H) {
            const sc = W / 512;
            a.strokeStyle = 'rgba(0,0,0,0.2)';
            a.lineWidth = 3 * sc;
            a.beginPath();
            a.moveTo(0, H * 0.94);
            a.lineTo(W, H * 0.94);
            a.stroke();
            applyFabricGrain(a, h, r, W, H, 'poly', 317);
            drawOrganicFolds(a, h, W, H, 0.06, 331);
        }
    });

    const hood = createMaterialSet({
        baseColor: '#d9f11b',
        size: Math.min(512, size),
        heightStrength: 2.2,
        baseRoughness: 160,
        sheen: 0.28,
        paintFn(a, h, r, m, W, H) {
            // Black piping around hood rim (matching ref 2)
            a.fillStyle = '#121418';
            a.fillRect(0, H * 0.88, W, H * 0.12);
            applyFabricGrain(a, h, r, W, H, 'poly', 337);
        }
    });

    const pants = createMaterialSet({
        baseColor: '#131519',
        size: Math.min(512, size),
        heightStrength: 2.1,
        baseRoughness: 175,
        sheen: 0.2,
        paintFn(a, h, r, m, W, H) {
            const sc = W / 512;
            // Articulated knee seam + subtle volt side piping
            h.strokeStyle = '#404040';
            h.lineWidth = 4 * sc;
            h.beginPath();
            h.moveTo(0, H * 0.45);
            h.lineTo(W, H * 0.45);
            h.stroke();
            a.strokeStyle = 'rgba(255,255,255,0.08)';
            a.lineWidth = 2 * sc;
            a.beginPath();
            a.moveTo(0, H * 0.45);
            a.lineTo(W, H * 0.45);
            a.stroke();

            applyFabricGrain(a, h, r, W, H, 'poly', 347);
            drawOrganicFolds(a, h, W, H, 0.06, 349);
            draw5HCCrest(a, h, r, W * 0.42, H * 0.28, W * 0.055, { fill: '#121418', ring: '#d9f11b', ink: '#ffffff', shield: true });
            drawMotoLogo(a, h, r, W * 0.58, H * 0.28, W * 0.055, { color: '#d9f11b', accent: '#ffffff' });
        }
    });

    const cuffBlack = new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.85, metalness: 0 });
    return { torso, sleeveL: sleeve, sleeveR: sleeve, hood, pants, cuffMat: cuffBlack, accentMat: cuffBlack, maps: [...torso.maps, ...sleeve.maps, ...hood.maps, ...pants.maps] };
}

function buildTracksuitRoyal(size) {
    // Chelsea Royal Blue & White track set with 5HC crest + Moto emblem
    const torso = createMaterialSet({
        baseColor: '#0e429c',
        size,
        heightStrength: 2.4,
        baseRoughness: 162,
        sheen: 0.26,
        sheenColor: 0x9ec5ff,
        paintFn(a, h, r, m, W, H) {
            const sc = W / 1024;
            // Clean white shoulder + collar trim
            a.fillStyle = '#f4f6fa';
            a.fillRect(0, 0, W, 24 * sc);
            // Side vertical white 3 stripes
            for (const xMid of [W * 0.25, W * 0.75]) {
                for (const dx of [-16, 0, 16]) {
                    a.fillStyle = '#f4f6fa';
                    a.fillRect(xMid + dx * sc - 4 * sc, H * 0.12, 8 * sc, H * 0.82);
                    h.fillStyle = '#a8a8a8';
                    h.fillRect(xMid + dx * sc - 4 * sc, H * 0.12, 8 * sc, H * 0.82);
                }
            }
            applyFabricGrain(a, h, r, W, H, 'poly', 401);
            drawOrganicFolds(a, h, W, H, 0.055, 409);
            drawCenterZip(a, h, r, m, W, H, {
                yTopFrac: 0.02, yBotFrac: 0.98, tapeColor: '#0a2d6b', teethColor: '#e2e8f0', pullColor: '#f8fafc', placketWidth: 12
            });

            draw5HCCrest(a, h, r, W * 0.588, H * 0.25, W * 0.044, {
                fill: '#0a2d6b', ring: '#f6c416', ink: '#ffffff', shield: true
            });
            drawMotoLogo(a, h, r, W * 0.412, H * 0.25, W * 0.044, {
                color: '#ffffff', accent: '#f6c416'
            });
        }
    });

    const sleeve = createMaterialSet({
        baseColor: '#0e429c',
        size: Math.min(512, size),
        heightStrength: 2.2,
        baseRoughness: 162,
        sheen: 0.26,
        paintFn(a, h, r, m, W, H) {
            const sc = W / 512;
            a.fillStyle = '#f4f6fa';
            a.fillRect(W * 0.44, 0, W * 0.04, H);
            a.fillRect(W * 0.52, 0, W * 0.04, H);
            applyFabricGrain(a, h, r, W, H, 'poly', 419);
            drawOrganicFolds(a, h, W, H, 0.06, 421);
        }
    });

    const hood = createMaterialSet({
        baseColor: '#0d3b8c',
        size: Math.min(512, size),
        heightStrength: 2.2,
        baseRoughness: 165,
        sheen: 0.25,
        paintFn(a, h, r, m, W, H) {
            a.fillStyle = '#f4f6fa';
            a.fillRect(0, H * 0.88, W, H * 0.12);
            applyFabricGrain(a, h, r, W, H, 'poly', 431);
        }
    });

    const pants = createMaterialSet({
        baseColor: '#0b1e44',
        size: Math.min(512, size),
        heightStrength: 2.1,
        baseRoughness: 170,
        sheen: 0.22,
        paintFn(a, h, r, m, W, H) {
            const sc = W / 512;
            a.fillStyle = '#f4f6fa';
            for (const xMid of [W * 0.25, W * 0.75]) {
                a.fillRect(xMid - 8 * sc, 0, 5 * sc, H);
                a.fillRect(xMid + 3 * sc, 0, 5 * sc, H);
            }
            applyFabricGrain(a, h, r, W, H, 'poly', 433);
            drawOrganicFolds(a, h, W, H, 0.06, 439);
            draw5HCCrest(a, h, r, W * 0.42, H * 0.28, W * 0.055, { fill: '#0a2d6b', ring: '#f6c416', ink: '#ffffff', shield: true });
            drawMotoLogo(a, h, r, W * 0.58, H * 0.28, W * 0.055, { color: '#ffffff', accent: '#f6c416' });
        }
    });

    const cuffWhite = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.84, metalness: 0 });
    return { torso, sleeveL: sleeve, sleeveR: sleeve, hood, pants, cuffMat: cuffWhite, accentMat: cuffWhite, maps: [...torso.maps, ...sleeve.maps, ...hood.maps, ...pants.maps] };
}

function buildJerseyBianconero(size) {
    // Ref 5: Pro Bianconero striped breathable mesh jersey + 5HC 3-star crest + Moto emblem
    const torso = createMaterialSet({
        baseColor: '#f3f4f6',
        size,
        heightStrength: 2.3,
        baseRoughness: 185, // Breathable mesh ~0.72
        sheen: 0.22,
        sheenColor: 0xffffff,
        paintFn(a, h, r, m, W, H) {
            const sc = W / 1024;
            // Vertical black/white stripes matching Juventus 2016/17 cut: black stripes split by crisp hairline white pinstripe!
            const blackBands = [
                [0.09, 0.19], // right back
                [0.29, 0.38], // front right
                [0.455, 0.545], // front center stripe
                [0.62, 0.71], // front left
                [0.81, 0.91] // left back
            ];
            for (const [f0, f1] of blackBands) {
                const x0 = f0 * W;
                const bw = (f1 - f0) * W;
                a.fillStyle = '#101216';
                a.fillRect(x0, 0, bw, H);
                // Crisp center white hairline pinstripe down each black stripe
                a.fillStyle = '#f4f5f7';
                a.fillRect(x0 + bw * 0.5 - 3 * sc, 0, 6 * sc, H);
            }

            // Crisp white shoulder yoke + back shoulder yoke
            a.fillStyle = '#f3f4f6';
            a.fillRect(0, 0, W, H * 0.175);

            // Side flanks: black panel with 3 crisp white athletic stripes
            for (const xMid of [W * 0.24, W * 0.76]) {
                a.fillStyle = '#101216';
                a.fillRect(xMid - 28 * sc, H * 0.175, 56 * sc, H * 0.825);
                a.fillStyle = '#f3f4f6';
                for (const dx of [-14, 0, 14]) {
                    a.fillRect(xMid + dx * sc - 3.5 * sc, H * 0.19, 7 * sc, H * 0.79);
                }
            }

            // Breathable athletic birdseye mesh across jersey
            applyFabricGrain(a, h, r, W, H, 'mesh', 503);
            drawOrganicFolds(a, h, W, H, 0.055, 509);

            // Pro ribbed black crew collar top
            a.fillStyle = '#101216';
            a.fillRect(0, 0, W, 28 * sc);
            h.fillStyle = '#b4b4b4';
            h.fillRect(0, 0, W, 28 * sc);

            // Left chest (+x = u ~ 0.585): Oval/shield 5HC crest + 3 gold championship stars!
            draw5HCCrest(a, h, r, W * 0.586, H * 0.255, W * 0.046, {
                fill: '#101216', ring: '#f4f5f7', ink: '#ffffff', shield: true, stars: true
            });
            // Opposite chest (-x = u ~ 0.414): Crisp embroidered sportbike mark
            drawMotoLogo(a, h, r, W * 0.414, H * 0.255, W * 0.046, {
                color: '#101216', accent: '#f4f5f7', outline: '#ffffff'
            });

            // Center chest clean custom print replacing third-party sponsor: crisp white box + bold 5HC RACING
            const boxW = W * 0.23;
            const boxH = H * 0.102;
            const bx = W * 0.5 - boxW * 0.5;
            const by = H * 0.36;
            a.fillStyle = '#f8fafc';
            a.fillRect(bx, by, boxW, boxH);
            a.strokeStyle = '#101216';
            a.lineWidth = 3 * sc;
            a.strokeRect(bx, by, boxW, boxH);
            a.fillStyle = '#101216';
            a.font = `italic 900 ${Math.round(boxH * 0.56)}px "Arial Black", Impact, sans-serif`;
            a.textAlign = 'center';
            a.textBaseline = 'middle';
            a.fillText('5HC', W * 0.5, by + boxH * 0.44);
            a.font = `800 ${Math.round(boxH * 0.2)}px Arial, sans-serif`;
            a.fillText('RACING TEAM', W * 0.5, by + boxH * 0.8);
            // Glossy heat-pressed print roughness
            r.fillStyle = '#686868';
            r.fillRect(bx, by, boxW, boxH);
            h.fillStyle = '#929292';
            h.fillRect(bx, by, boxW, boxH);

            // Back pro jersey panel centered around u = 0 / 1 (wrapped cleanly!)
            drawWrapped(a, W, () => {
                a.fillStyle = '#f8fafc';
                a.fillRect(-W * 0.11, H * 0.18, W * 0.22, H * 0.48);
                a.fillStyle = '#101216';
                a.font = `900 ${Math.round(H * 0.068)}px "Arial Black", sans-serif`;
                a.textAlign = 'center';
                a.textBaseline = 'middle';
                a.fillText('5HC', 0, H * 0.245);
                a.font = `900 ${Math.round(H * 0.22)}px "Arial Black", sans-serif`;
                a.fillText('51', 0, H * 0.44);
            });
            drawWrapped(r, W, () => {
                r.fillStyle = '#686868';
                r.fillRect(-W * 0.09, H * 0.20, W * 0.18, H * 0.42);
            });
        }
    });

    // Short sleeve top half of upper arm: white mesh jersey sleeve + double black cuff border
    const shortSleeve = createMaterialSet({
        baseColor: '#f3f4f6',
        size: Math.min(512, size),
        heightStrength: 2.0,
        baseRoughness: 185,
        sheen: 0.22,
        paintFn(a, h, r, m, W, H) {
            const sc = W / 512;
            applyFabricGrain(a, h, r, W, H, 'mesh', 521);
            // Ribbed double black cuff band at distal bottom of sleeve (canvas top v~0..0.18 -> no, remember y=+half is canvas TOP!)
            // NOTE: On LatheGeometry `y = -half` (shoulder) is j=0 -> v=0 -> canvas BOTTOM (y=H).
            // `y = +half` (elbow/cuff) is j=last -> v=1 -> canvas TOP (y=0).
            // Here the short sleeve sub-mesh stops at y=+0.04 (so cuff edge is at canvas y=0!).
            a.fillStyle = '#101216';
            a.fillRect(0, 0, W, 38 * sc);
            a.fillStyle = '#f3f4f6';
            a.fillRect(0, 38 * sc, W, 14 * sc);
            a.fillStyle = '#101216';
            a.fillRect(0, 52 * sc, W, 14 * sc);
            h.fillStyle = '#a4a4a4';
            h.fillRect(0, 0, W, 66 * sc);
        }
    });

    const pants = createMaterialSet({
        baseColor: '#101216',
        size: Math.min(512, size),
        heightStrength: 2.0,
        baseRoughness: 175,
        sheen: 0.2,
        paintFn(a, h, r, m, W, H) {
            const sc = W / 512;
            a.fillStyle = '#f3f4f6';
            for (const xMid of [W * 0.25, W * 0.75]) {
                for (const dx of [-12, 0, 12]) a.fillRect(xMid + dx * sc - 2.5 * sc, 0, 5 * sc, H);
            }
            applyFabricGrain(a, h, r, W, H, 'poly', 541);
            drawOrganicFolds(a, h, W, H, 0.055, 547);
            draw5HCCrest(a, h, r, W * 0.42, H * 0.26, W * 0.055, { fill: '#101216', ring: '#f4f5f7', ink: '#ffffff', shield: true, stars: true });
            drawMotoLogo(a, h, r, W * 0.58, H * 0.26, W * 0.055, { color: '#ffffff', accent: '#eab308' });
        }
    });

    const skinMat = new THREE.MeshStandardMaterial({ color: 0x7a4524, roughness: 0.58, metalness: 0.02 });
    const collarMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.85, metalness: 0 });
    return { torso, sleeveL: shortSleeve, sleeveR: shortSleeve, pants, skinMat, accentMat: collarMat, cuffMat: collarMat, maps: [...torso.maps, ...shortSleeve.maps, ...pants.maps] };
}

function buildFleecePro(id, { hoodie, accent, pantsColor, ink = accent }) {
    const size = isMobileTex() ? 512 : 768;
    const seed = id.split('').reduce((s, ch) => s + ch.charCodeAt(0), 17);
    const torso = createMaterialSet({
        baseColor: hoodie,
        size,
        heightStrength: 2.2,
        baseRoughness: 222, // Soft brushed cotton fleece
        sheen: 0.55,
        sheenColor: accent,
        paintFn(a, h, r, m, W, H) {
            applyFabricGrain(a, h, r, W, H, 'fleece', seed);
            drawOrganicFolds(a, h, W, H, 0.055, seed + 5);
            const sc = W / 768;
            // Raglan shoulder & hem stitching + kangaroo pocket shade
            a.strokeStyle = 'rgba(0,0,0,0.22)';
            h.strokeStyle = '#606060';
            a.lineWidth = 2.5 * sc;
            h.lineWidth = 3.5 * sc;
            a.strokeRect(W * 0.36, H * 0.62, W * 0.28, H * 0.26);
            h.strokeRect(W * 0.36, H * 0.62, W * 0.28, H * 0.26);

            // Crisp embroidered 5HC left chest + Moto emblem right chest
            draw5HCCrest(a, h, r, W * 0.585, H * 0.28, W * 0.042, { fill: '#111318', ring: accent, ink });
            drawMotoLogo(a, h, r, W * 0.415, H * 0.28, W * 0.042, { color: accent, accent: '#ffffff' });

            // Signature 51 back print wrapped
            drawWrapped(a, W, () => {
                a.fillStyle = accent;
                a.font = `900 ${Math.round(H * 0.18)}px "Arial Black", sans-serif`;
                a.textAlign = 'center';
                a.textBaseline = 'middle';
                a.fillText('51', 0, H * 0.44);
                a.font = `800 ${Math.round(H * 0.05)}px "Arial Black", sans-serif`;
                a.fillText('5HC COLLECTION', 0, H * 0.26);
            });
        }
    });

    const sleeve = createMaterialSet({
        baseColor: hoodie,
        size: 512,
        heightStrength: 2.0,
        baseRoughness: 222,
        sheen: 0.5,
        sheenColor: accent,
        paintFn(a, h, r, m, W, H) {
            applyFabricGrain(a, h, r, W, H, 'fleece', seed + 11);
            drawOrganicFolds(a, h, W, H, 0.06, seed + 13);
        }
    });

    const hood = createMaterialSet({
        baseColor: hoodie,
        size: 512,
        heightStrength: 2.0,
        baseRoughness: 222,
        sheen: 0.5,
        sheenColor: accent,
        paintFn(a, h, r, m, W, H) {
            applyFabricGrain(a, h, r, W, H, 'fleece', seed + 17);
        }
    });

    const pants = createMaterialSet({
        baseColor: pantsColor,
        size: 512,
        heightStrength: 2.0,
        baseRoughness: 215,
        sheen: 0.22,
        paintFn(a, h, r, m, W, H) {
            applyFabricGrain(a, h, r, W, H, 'fleece', seed + 23);
            drawOrganicFolds(a, h, W, H, 0.055, seed + 29);
            draw5HCCrest(a, h, r, W * 0.42, H * 0.26, W * 0.05, { fill: '#111318', ring: accent, ink: '#ffffff' });
        }
    });

    const cuffMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.78, metalness: 0.05 });
    return { torso, sleeveL: sleeve, sleeveR: sleeve, hood, pants, cuffMat, accentMat: cuffMat, maps: [...torso.maps, ...sleeve.maps, ...hood.maps, ...pants.maps] };
}

const pbrCache = new Map();

export function getGarmentMaterialSet(garmentId) {
    if (pbrCache.has(garmentId)) return pbrCache.get(garmentId);
    const size = isMobileTex() ? 512 : 1024;
    let built = null;
    if (garmentId === 'puffer-grey-5hc') built = buildPufferGrey(size);
    else if (garmentId === 'puffer-check-5hc') built = buildPufferCheck(size);
    else if (garmentId === 'tracksuit-bvb-5hc') built = buildTracksuitBVB(size);
    else if (garmentId === 'tracksuit-volt-5hc') built = buildTracksuitVolt(size);
    else if (garmentId === 'tracksuit-royal-5hc') built = buildTracksuitRoyal(size);
    else if (garmentId === 'jersey-bianconero-5hc') built = buildJerseyBianconero(size);
    else if (garmentId === 'fleece-noir-or') built = buildFleecePro(garmentId, { hoodie: '#16181e', accent: '#c9a45c', pantsColor: '#121318' });
    else if (garmentId === 'fleece-glacier') built = buildFleecePro(garmentId, { hoodie: '#dde4ed', accent: '#0284c7', pantsColor: '#1e293b', ink: '#ffffff' });
    else if (garmentId === 'fleece-venom') built = buildFleecePro(garmentId, { hoodie: '#0d130f', accent: '#22c55e', pantsColor: '#0c120e', ink: '#ffffff' });
    else if (garmentId === 'fleece-crimson') built = buildFleecePro(garmentId, { hoodie: '#b91c1c', accent: '#f8fafc', pantsColor: '#111318', ink: '#ffffff' });

    if (built) pbrCache.set(garmentId, built);
    return built;
}

// ---------- STUDIO SHOP PRODUCT THUMBNAILS ----------------------------------

const thumbCache = new Map();

export function createGarmentThumbnail(garmentId) {
    if (thumbCache.has(garmentId)) return thumbCache.get(garmentId);
    const [canvas, ctx] = makeCanvas(280, 280);
    const bg = ctx.createRadialGradient(140, 110, 12, 140, 140, 165);
    bg.addColorStop(0, '#232a3c');
    bg.addColorStop(0.65, '#111622');
    bg.addColorStop(1, '#080a10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 280, 280);

    // Subtle studio spotlight under garment
    const floor = ctx.createRadialGradient(140, 246, 8, 140, 246, 95);
    floor.addColorStop(0, 'rgba(246,196,22,0.2)');
    floor.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = floor;
    ctx.fillRect(20, 210, 240, 60);

    // Clip to stylized realistic silhouette (puffer / jacket / jersey)
    const isPuffer = garmentId.startsWith('puffer-');
    const isJersey = garmentId === 'jersey-bianconero-5hc';
    ctx.save();
    ctx.beginPath();
    if (isPuffer) {
        // Voluminous puffer silhouette with hood & wide padded sleeves
        ctx.moveTo(98, 40);
        ctx.quadraticCurveTo(140, 24, 182, 40);
        ctx.lineTo(192, 68);
        ctx.quadraticCurveTo(222, 82, 244, 162);
        ctx.lineTo(220, 174);
        ctx.lineTo(200, 128);
        ctx.quadraticCurveTo(204, 186, 194, 218);
        ctx.quadraticCurveTo(140, 226, 86, 218);
        ctx.quadraticCurveTo(76, 186, 80, 128);
        ctx.lineTo(60, 174);
        ctx.lineTo(36, 162);
        ctx.quadraticCurveTo(58, 82, 88, 68);
        ctx.closePath();
    } else if (isJersey) {
        // Athletic short-sleeve football shirt
        ctx.moveTo(106, 52);
        ctx.quadraticCurveTo(140, 68, 174, 52);
        ctx.lineTo(228, 78);
        ctx.lineTo(214, 124);
        ctx.lineTo(190, 114);
        ctx.lineTo(188, 222);
        ctx.lineTo(92, 222);
        ctx.lineTo(90, 114);
        ctx.lineTo(66, 124);
        ctx.lineTo(52, 78);
        ctx.closePath();
    } else {
        // Zip track jacket / hoodie
        ctx.moveTo(102, 44);
        ctx.quadraticCurveTo(140, 32, 178, 44);
        ctx.lineTo(188, 68);
        ctx.lineTo(234, 152);
        ctx.lineTo(214, 164);
        ctx.lineTo(194, 116);
        ctx.lineTo(190, 222);
        ctx.lineTo(90, 222);
        ctx.lineTo(86, 116);
        ctx.lineTo(66, 164);
        ctx.lineTo(46, 152);
        ctx.lineTo(92, 68);
        ctx.closePath();
    }
    ctx.clip();

    if (garmentId === 'puffer-grey-5hc') {
        ctx.fillStyle = '#92979f';
        ctx.fillRect(0, 0, 280, 280);
        paintMonogramJacquard(ctx, null, null, 280, 280, 7, 7);
        for (const y of [98, 134, 170, 200]) {
            const g = ctx.createLinearGradient(0, y - 16, 0, y + 16);
            g.addColorStop(0, 'rgba(255,255,255,0.14)');
            g.addColorStop(0.5, 'rgba(0,0,0,0.34)');
            g.addColorStop(1, 'rgba(255,255,255,0.12)');
            ctx.fillStyle = g;
            ctx.fillRect(20, y - 16, 240, 32);
        }
        ctx.fillStyle = '#6c7178';
        ctx.fillRect(137, 56, 6, 170);
    } else if (garmentId === 'puffer-check-5hc') {
        paintTartanCheck(ctx, null, 280, 280, 4, 4);
        for (const y of [96, 126, 156, 186, 210]) {
            const g = ctx.createLinearGradient(0, y - 12, 0, y + 12);
            g.addColorStop(0, 'rgba(255,255,255,0.15)');
            g.addColorStop(0.5, 'rgba(0,0,0,0.42)');
            g.addColorStop(1, 'rgba(255,255,255,0.1)');
            ctx.fillStyle = g;
            ctx.fillRect(20, y - 12, 240, 24);
        }
        ctx.fillStyle = '#d4be96';
        ctx.fillRect(137, 56, 6, 170);
    } else if (garmentId === 'tracksuit-bvb-5hc') {
        ctx.fillStyle = '#111317';
        ctx.fillRect(0, 0, 280, 280);
        paintYellowSplatter(ctx, 280, 280, 0.14, 0.48, [[0.14, 0.86, 0.9]], 211);
        ctx.fillStyle = '#111317';
        ctx.fillRect(72, 124, 136, 110);
        ctx.fillStyle = '#f5de16';
        ctx.beginPath();
        ctx.moveTo(82, 116);
        ctx.lineTo(140, 122);
        ctx.lineTo(84, 162);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(138, 66, 4, 62);
        ctx.fillRect(62, 92, 18, 72);
    } else if (garmentId === 'tracksuit-volt-5hc') {
        ctx.fillStyle = '#d9f11b';
        ctx.fillRect(0, 0, 280, 280);
        ctx.fillStyle = '#121418';
        for (const dx of [-8, 0, 8]) {
            ctx.fillRect(94 + dx, 140, 3, 84);
            ctx.fillRect(184 + dx, 140, 3, 84);
        }
        ctx.fillRect(138, 66, 4, 160);
    } else if (garmentId === 'tracksuit-royal-5hc') {
        ctx.fillStyle = '#0e429c';
        ctx.fillRect(0, 0, 280, 280);
        ctx.fillStyle = '#f4f6fa';
        for (const dx of [-6, 0, 6]) {
            ctx.fillRect(94 + dx, 94, 3, 130);
            ctx.fillRect(184 + dx, 94, 3, 130);
        }
        ctx.fillRect(138, 66, 4, 160);
    } else if (garmentId === 'jersey-bianconero-5hc') {
        ctx.fillStyle = '#f4f5f7';
        ctx.fillRect(0, 0, 280, 280);
        for (const x of [98, 130, 162]) {
            ctx.fillStyle = '#101216';
            ctx.fillRect(x, 60, 20, 170);
            ctx.fillStyle = '#f4f5f7';
            ctx.fillRect(x + 9, 60, 2, 170);
        }
        ctx.fillStyle = '#f4f5f7';
        ctx.fillRect(50, 50, 180, 34);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(102, 126, 76, 30);
        ctx.fillStyle = '#101216';
        ctx.font = 'italic 900 18px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('5HC', 140, 148);
    } else {
        const cols = {
            'fleece-noir-or': ['#16181e', '#c9a45c'],
            'fleece-glacier': ['#dde4ed', '#0284c7'],
            'fleece-venom': ['#0d130f', '#22c55e'],
            'fleece-crimson': ['#b91c1c', '#f8fafc']
        }[garmentId] || ['#181b22', '#f6c416'];
        ctx.fillStyle = cols[0];
        ctx.fillRect(0, 0, 280, 280);
        ctx.fillStyle = cols[1];
        ctx.font = '900 44px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('51', 140, 152);
    }

    // Subtle crest badges on thumb for tracksuits & jersey
    if (!isPuffer) {
        const leftBadge = garmentId === 'tracksuit-volt-5hc' ? ['#121418', '#d9f11b'] : ['#111317', '#f6c416'];
        ctx.fillStyle = leftBadge[0];
        ctx.beginPath();
        ctx.arc(163, 102, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = leftBadge[1];
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = garmentId === 'tracksuit-volt-5hc' ? '#121418' : leftBadge[1];
        ctx.beginPath();
        ctx.ellipse(117, 102, 9, 5, -0.2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // Rim lighting outline around garment contour for crisp dark-studio readability
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const url = canvas.toDataURL('image/png');
    thumbCache.set(garmentId, url);
    return url;
}
