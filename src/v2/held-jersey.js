// The jersey of the "maillot" pose: a real shirt (two layers of cloth, short
// sleeves, collar, side panels) held by the shoulders in front of the figure
// and hanging down, its back (name and number) to the people below. The
// cloth lives: it swings under the hands when they move, folds run down it,
// the sleeves flutter.
import * as THREE from 'three';

const LENGTH = 0.66;
const HALF_WIDTH = 0.265;
// Half-distance between the hands the cloth is cut for (they hold the
// shoulders, either side of the collar).
export const JERSEY_GRIP = 0.17;
const NX = 16;
const NY = 16;
const SLEEVE_ALONG = [0, 0.3, 0.6, 0.86, 0.87, 1];
const SLEEVE_ACROSS = 4;
// Where the plain cloth and the trim are on the print (u), see the canvas.
const PRINT_U = 0.75;
const PLAIN_U = 0.83;
const TRIM_U = 0.95;

const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

// The print, and the two plain colours beside it: the back of the shirt
// (collar, crown, name, number, side panels) on the left three quarters,
// then a strip of plain cloth and a strip of trim.
export function createJerseyPrint(color, ink, number, name) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const width = size * PRINT_U;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = ink;
    ctx.fillRect(size * 0.89, 0, size * 0.11, size);
    // Side panels, widening to the hem.
    for (const side of [0, 1]) {
        const x = (value) => (side ? width - value : value);
        ctx.beginPath();
        ctx.moveTo(x(0), size * 0.36);
        ctx.quadraticCurveTo(x(width * 0.05), size * 0.62, x(width * 0.15), size);
        ctx.lineTo(x(0), size);
        ctx.closePath();
        ctx.fill();
    }
    // Collar, along the top between the hands.
    ctx.beginPath();
    ctx.roundRect(width * 0.3, -8, width * 0.4, 24, 10);
    ctx.fill();
    // A small crown over the name.
    const cx = width / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 22, 66);
    ctx.lineTo(cx - 26, 42);
    ctx.lineTo(cx - 12, 54);
    ctx.lineTo(cx, 36);
    ctx.lineTo(cx + 12, 54);
    ctx.lineTo(cx + 26, 42);
    ctx.lineTo(cx + 22, 66);
    ctx.closePath();
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (name) {
        ctx.font = '900 62px "Arial Black", Arial, sans-serif';
        ctx.fillText(name, cx, 116, width * 0.8);
    }
    ctx.font = '900 196px "Arial Black", Arial, sans-serif';
    ctx.fillText(number, cx, name ? 262 : 232, width * 0.72);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

export function createHeldJersey() {
    const positions = [];
    const uvs = [];
    const indices = [];
    // For each vertex: how freely it hangs (0 held, 1 the hem), its place
    // across (-1..1), and a phase of its own for the folds.
    const hang = [];
    const across = [];
    const phase = [];
    const vertex = (x, y, z, u, v, weight, place, shift) => {
        positions.push(x, y, z);
        uvs.push(u, v);
        hang.push(weight);
        across.push(place);
        phase.push(shift);
        return hang.length - 1;
    };
    const quad = (a, b, c, d, front) => {
        if (front) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
    };

    // Body: the layer shown to the people (+z, the shirt's back with the
    // print) and the other one, a lens of air between them. Held along the
    // top; the shoulders slope, the neck dips (more on the far layer).
    for (const layer of [1, -1]) {
        const rows = [];
        for (let j = 0; j <= NY; j++) {
            const v = j / NY;
            const row = [];
            for (let i = 0; i <= NX; i++) {
                const u = i / NX * 2 - 1;
                const slope = -0.05 * Math.abs(u) ** 1.5;
                const neck = Math.abs(u) < 0.4 ? (layer > 0 ? 0.022 : 0.075) * (1 - (u / 0.4) ** 2) : 0;
                const top = slope - neck;
                const y = top + (-LENGTH - top) * v;
                const x = u * (HALF_WIDTH + 0.022 * v);
                const lens = 0.007 + 0.05 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.25 + 0.75 * smooth(0, 0.35, v));
                const printed = layer > 0;
                row.push(vertex(x, y, layer * lens, printed ? (u + 1) / 2 * PRINT_U : PLAIN_U, printed ? 1 - v : 0.5,
                    smooth(0.02, 1, v), u, layer * 0.4));
            }
            rows.push(row);
        }
        for (let j = 0; j < NY; j++) {
            for (let i = 0; i < NX; i++) quad(rows[j][i], rows[j][i + 1], rows[j + 1][i], rows[j + 1][i + 1], layer > 0);
        }
    }
    // Sleeves: short, out and down from the shoulders, a trim cuff.
    for (const side of [1, -1]) {
        const corner = {
            innerTop: [side * HALF_WIDTH, -0.05], innerBottom: [side * (HALF_WIDTH + 0.006), -0.255],
            outerTop: [side * (HALF_WIDTH + 0.175), -0.15], outerBottom: [side * (HALF_WIDTH + 0.115), -0.31]
        };
        for (const layer of [1, -1]) {
            const rows = [];
            for (let b = 0; b <= SLEEVE_ACROSS; b++) {
                const q = b / SLEEVE_ACROSS;
                const row = [];
                for (const a of SLEEVE_ALONG) {
                    const x = (corner.innerTop[0] + (corner.outerTop[0] - corner.innerTop[0]) * a) * (1 - q)
                        + (corner.innerBottom[0] + (corner.outerBottom[0] - corner.innerBottom[0]) * a) * q;
                    const y = (corner.innerTop[1] + (corner.outerTop[1] - corner.innerTop[1]) * a) * (1 - q)
                        + (corner.innerBottom[1] + (corner.outerBottom[1] - corner.innerBottom[1]) * a) * q;
                    const lens = 0.006 + 0.024 * Math.sin(Math.PI * q) * (0.4 + 0.6 * a);
                    row.push(vertex(x, y, layer * lens, a > 0.865 ? TRIM_U : PLAIN_U, 0.5, 0.12 + 0.3 * a + 0.12 * q, side * (1 + a * 0.5), side * 1.7 + layer * 0.3));
                }
                rows.push(row);
            }
            for (let b = 0; b < SLEEVE_ACROSS; b++) {
                for (let a = 0; a < SLEEVE_ALONG.length - 1; a++) {
                    quad(rows[b][a], rows[b][a + 1], rows[b + 1][a], rows[b + 1][a + 1], (layer > 0) === (side > 0));
                }
            }
        }
    }

    const rest = new Float32Array(positions);
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.Float32BufferAttribute(positions, 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', attribute);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ roughness: 0.82, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;

    // The hem follows the hands late (a pendulum), forwards and sideways.
    const swing = { z: 0, vz: 0, x: 0, vx: 0, lastZ: null, lastX: 0, topVz: 0, topVx: 0, time: null };

    return {
        mesh,
        material,
        setPrint(color, ink, number, name) {
            material.map?.dispose();
            material.map = createJerseyPrint(color, ink, number, name);
            material.needsUpdate = true;
        },
        // t: seconds. x, y, z: the middle of the grip (the top of the cloth).
        // grip: half-distance between the hands (the cloth is pulled taut).
        // tilt: the top leant forwards, the print turned downwards (radians).
        update(t, x, y, z, grip, tilt = 0) {
            const dt = swing.time === null ? 0 : Math.max(0, Math.min(0.05, t - swing.time));
            swing.time = t;
            if (swing.lastZ === null || dt === 0) {
                swing.lastZ = z;
                swing.lastX = x;
            }
            // The hem keeps going as it was while the hands move (so it
            // trails behind them), then swings back to under them.
            if (dt > 0) {
                const topVz = (z - swing.lastZ) / dt;
                const topVx = (x - swing.lastX) / dt;
                swing.vz += (-46 * swing.z - 4.2 * swing.vz) * dt - (topVz - swing.topVz);
                swing.vx += (-46 * swing.x - 4.2 * swing.vx) * dt - (topVx - swing.topVx);
                swing.topVz = topVz;
                swing.topVx = topVx;
                swing.z = Math.max(-0.22, Math.min(0.22, swing.z + swing.vz * dt));
                swing.x = Math.max(-0.12, Math.min(0.12, swing.x + swing.vx * dt));
                swing.lastZ = z;
                swing.lastX = x;
            }
            mesh.position.set(x, y, z);
            mesh.rotation.x = tilt;
            const stretch = grip / JERSEY_GRIP;
            const array = attribute.array;
            for (let i = 0, p = 0; i < hang.length; i++, p += 3) {
                const w = hang[i];
                const u = across[i];
                const loose = w * Math.sqrt(w);
                // Folds running down the cloth, deeper towards the hem, and a
                // slower breath of air through it.
                const folds = Math.sin(u * 5.2 + w * 2.4 - t * 1.6 + phase[i]) * 0.02 * w
                    + Math.sin(u * 9.5 + t * 1.05 + 1.3) * 0.011 * w * w
                    + Math.sin(t * 0.9 + u * 1.4) * 0.014 * loose;
                array[p] = rest[p] * (1 + (stretch - 1) * (1 - 0.6 * w)) + swing.x * loose + Math.sin(t * 1.3 + w * 3) * 0.004 * w;
                // Pulled taut between the hands, the cloth rises a little.
                array[p + 1] = rest[p + 1] + (stretch - 1) * 0.05 * w + Math.abs(swing.z) * 0.12 * loose;
                array[p + 2] = rest[p + 2] + swing.z * loose + folds;
            }
            attribute.needsUpdate = true;
            geometry.computeVertexNormals();
        },
        dispose() {
            material.map?.dispose();
            material.dispose();
            geometry.dispose();
        }
    };
}
