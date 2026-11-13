// Trees, shrubs, hedges and planting for the realistic version.
// A tree is a real skeleton (flared trunk, leader, main branches, twigs) and a
// crown of leaf cards: small textured quads in every orientation, shaded as
// one soft volume. Everything goes into the block's foliage batch, so a whole
// avenue of trees still costs one draw call per block.
import * as THREE from 'three';
import { PRIMS, transform } from './geometry.js';
import { FOLIAGE } from './citytextures.js';
import { mulberry32 } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

export const SPECIES = {
    // Tall avenue tree, mottled pale bark, broad irregular crown.
    plane: {
        trunk: [4.6, 5.4], radius: [3.5, 4.2], crown: [6.6, 7.6], girth: [0.3, 0.38], tilt: [0.5, 0.9],
        branches: [4, 5], clusters: [24, 30], card: [2.6, 3.4], cell: 'leaf', bark: 0xcfc5ae,
        palettes: [
            [0x5a962c, 0x6ea833, 0x84b83c, 0x487f27, 0x93c04a],
            [0x4c8a2a, 0x5f9c30, 0x79ae3a, 0x3d7424, 0x6aa02f]
        ]
    },
    // Rounder, darker street tree.
    linden: {
        trunk: [3.7, 4.4], radius: [2.8, 3.3], crown: [5.1, 5.9], girth: [0.22, 0.28], tilt: [0.45, 0.8],
        branches: [3, 4], clusters: [19, 23], card: [2.3, 2.9], cell: 'leaf', bark: 0x8d7d6a,
        palettes: [
            [0x3f7d2b, 0x4d8d30, 0x5e9d37, 0x326c26],
            [0x55892f, 0x6a9a35, 0x7fab3d, 0x47782a]
        ]
    },
    // Ornamental cherry: low, spreading, in blossom.
    cherry: {
        trunk: [2.6, 3.2], radius: [3.0, 3.8], crown: [3.9, 4.8], girth: [0.2, 0.27], tilt: [0.85, 1.2],
        branches: [4, 6], clusters: [15, 30], card: [2.1, 2.8], cell: 'blossom', bark: 0x7a564a,
        palettes: [
            [0xf4a9c9, 0xf9c0d8, 0xea8fb7, 0xfcd6e6],
            [0xc986d6, 0xdaa0e3, 0xb76cc8, 0xe8b9ee],
            [0xfbdfe9, 0xf5c7da, 0xffffff, 0xf1b3cd],
            [0xe07fb0, 0xc878c8, 0xf0a0c8, 0xd890d8]
        ]
    },
    // Narrow upright tree for tight spots against the buildings.
    column: {
        trunk: [1.7, 2.1], radius: [1.3, 1.6], crown: [6.6, 7.6], girth: [0.16, 0.2], tilt: [0.2, 0.36],
        branches: [3, 4], clusters: [17, 21], card: [1.7, 2.2], cell: 'shrub', bark: 0x6d5f52,
        palettes: [[0x2f6a2a, 0x3b7a2e, 0x4a8a33, 0x285c26]]
    }
};

export const SHRUB_GREENS = [0x3f7f2c, 0x4f9031, 0x62a038, 0x34702a, 0x76ae3f];

export function createVegetation(baseRandom) {
    // Trees can be grown from their own seed, so the distant version of a
    // block repeats the exact silhouette of the detailed one.
    let random = baseRandom;
    const range = (min, max) => min + random() * (max - min);
    const between = ([min, max]) => range(min, max);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const tint = new THREE.Color();
    const normal = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const bitangent = new THREE.Vector3();
    const axisA = new THREE.Vector3();
    const axisB = new THREE.Vector3();
    const corner = new THREE.Vector3();
    const corners = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, r: 0, g: 0, b: 0 }));

    // One leaf card at `p`, shaded as part of the volume centred on `centre`
    // (radii rx / ry). facing: optional preferred normal (hedge faces).
    function card(batch, p, size, cellName, color, centre, rx, ry, light = 1, facing = null, aspect = 1) {
        if (facing) {
            normal.copy(facing).addScaledVector(axisA.set(range(-1, 1), range(-1, 1), range(-1, 1)), 0.45).normalize();
        } else {
            normal.set(range(-1, 1), range(-0.25, 1), range(-1, 1)).normalize();
        }
        tangent.crossVectors(normal, Math.abs(normal.y) > 0.95 ? X_AXIS : UP).normalize();
        bitangent.crossVectors(normal, tangent);
        const spin = facing && aspect !== 1 ? 0 : random() * Math.PI * 2;
        axisA.copy(tangent).multiplyScalar(Math.cos(spin)).addScaledVector(bitangent, Math.sin(spin));
        axisB.copy(bitangent).multiplyScalar(Math.cos(spin)).addScaledVector(tangent, -Math.sin(spin));
        tint.set(color);
        const halfW = size / 2;
        const halfH = size * aspect / 2;
        const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        const jitter = range(0.9, 1.08) * light;
        for (let i = 0; i < 4; i++) {
            corner.copy(p).addScaledVector(axisA, signs[i][0] * halfW).addScaledVector(axisB, signs[i][1] * halfH);
            const dx = (corner.x - centre.x) / rx;
            const dy = (corner.y - centre.y) / ry;
            const dz = (corner.z - centre.z) / rx;
            const distance = Math.min(1.25, Math.hypot(dx, dy, dz));
            // Soft "ball" normals: the crown shades as one rounded mass.
            const length = Math.hypot(dx, dy + 0.55, dz) || 1;
            const height = Math.max(0, Math.min(1, dy * 0.5 + 0.5));
            const k = (0.5 + 0.6 * height) * (0.7 + 0.32 * distance) * jitter;
            const out = corners[i];
            out.x = corner.x; out.y = corner.y; out.z = corner.z;
            out.nx = dx / length; out.ny = (dy + 0.55) / length; out.nz = dz / length;
            out.r = tint.r * k; out.g = tint.g * k; out.b = tint.b * k;
        }
        const cell = FOLIAGE[cellName];
        const flip = random() < 0.5;
        const u0 = flip ? cell[2] : cell[0];
        const u1 = flip ? cell[0] : cell[2];
        const uvs = [[u0, cell[1]], [u1, cell[1]], [u1, cell[3]], [u0, cell[3]]];
        for (const i of [0, 1, 2, 0, 2, 3]) {
            const c = corners[i];
            batch.vertex(c.x, c.y, c.z, c.nx, c.ny, c.nz, uvs[i][0], uvs[i][1], c.r, c.g, c.b);
        }
    }

    function limb(batch, points, radii, bark, sides, shades) {
        batch.tube(points, radii, bark, sides, FOLIAGE.bark, shades);
    }

    // Grows one tree with its base at (x, y, z). Returns its footprint.
    function addTree(batch, x, y, z, speciesName, options = {}) {
        if (options.seed === undefined) return growTree(batch, x, y, z, speciesName, options);
        const previous = random;
        random = mulberry32(options.seed);
        try {
            return growTree(batch, x, y, z, speciesName, options);
        } finally {
            random = previous;
        }
    }

    function growTree(batch, x, y, z, speciesName, options) {
        const species = SPECIES[speciesName];
        const size = options.size || 1;
        const trunkHeight = between(species.trunk) * size;
        const radius = between(species.radius) * size;
        const crownHeight = between(species.crown) * size;
        const girth = between(species.girth) * size;
        const palette = pick(species.palettes);
        const bark = species.bark;
        const centre = new THREE.Vector3(x, y + trunkHeight + crownHeight * 0.42, z);

        // Trunk: root flare, slight lean, taper.
        const leanX = range(-0.22, 0.22);
        const leanZ = range(-0.22, 0.22);
        const trunk = [
            new THREE.Vector3(x, y - 0.05, z),
            new THREE.Vector3(x + leanX * 0.1, y + 0.55, z + leanZ * 0.1),
            new THREE.Vector3(x + leanX * 0.6, y + trunkHeight * 0.55, z + leanZ * 0.6),
            new THREE.Vector3(x + leanX, y + trunkHeight, z + leanZ)
        ];
        limb(batch, trunk, [girth * 1.75, girth * 1.08, girth * 0.94, girth * 0.82], bark, 8, [0.62, 0.8, 0.95, 1]);
        const top = trunk[3];

        // Leader carrying on through the crown.
        const leaderTop = new THREE.Vector3(top.x + range(-0.4, 0.4), top.y + crownHeight * 0.66, top.z + range(-0.4, 0.4));
        const leaderMid = top.clone().lerp(leaderTop, 0.5).add(new THREE.Vector3(range(-0.25, 0.25), 0, range(-0.25, 0.25)));
        limb(batch, [top, leaderMid, leaderTop], [girth * 0.74, girth * 0.42, girth * 0.12], bark, 5);

        // Main branches, each with two twigs. Their tips carry foliage.
        const tips = [leaderTop, leaderMid];
        const branchCount = Math.round(between(species.branches));
        const firstAzimuth = random() * Math.PI * 2;
        for (let i = 0; i < branchCount; i++) {
            const azimuth = firstAzimuth + (i / branchCount) * Math.PI * 2 + range(-0.35, 0.35);
            const tilt = between(species.tilt);
            const length = radius * range(0.72, 1);
            const origin = trunk[2].clone().lerp(top, range(0.55, 1));
            const direction = new THREE.Vector3(Math.cos(azimuth) * Math.sin(tilt), Math.cos(tilt), Math.sin(azimuth) * Math.sin(tilt));
            const mid = origin.clone().addScaledVector(direction, length * 0.5).addScaledVector(UP, length * 0.05);
            const end = origin.clone().addScaledVector(direction, length).addScaledVector(UP, length * 0.24);
            limb(batch, [origin, mid, end], [girth * 0.52, girth * 0.34, girth * 0.15], bark, 5);
            for (let k = 0; k < 2; k++) {
                const twigAzimuth = azimuth + (k ? 1 : -1) * range(0.5, 0.95);
                const twigTilt = Math.max(0.15, tilt + range(-0.3, 0.2));
                const twigLength = length * range(0.42, 0.66);
                const from = k ? mid : mid.clone().lerp(end, 0.55);
                const twigEnd = from.clone()
                    .addScaledVector(axisA.set(
                        Math.cos(twigAzimuth) * Math.sin(twigTilt), Math.cos(twigTilt), Math.sin(twigAzimuth) * Math.sin(twigTilt)
                    ), twigLength)
                    .addScaledVector(UP, twigLength * 0.18);
                limb(batch, [from, twigEnd], [girth * 0.21, girth * 0.07], bark, 4);
                tips.push(twigEnd, from.clone().lerp(twigEnd, 0.5));
            }
            tips.push(end, mid);
        }

        // Foliage: on the branch tips first, then filling the crown.
        const density = options.density || 1;
        const clusters = Math.round(between(species.clusters) * density);
        const points = tips.slice(0, clusters);
        while (points.length < clusters) {
            normal.set(range(-1, 1), range(-0.4, 1), range(-1, 1)).normalize();
            const reach = range(0.45, 0.98);
            points.push(new THREE.Vector3(
                centre.x + normal.x * radius * reach,
                centre.y + normal.y * crownHeight * 0.5 * reach,
                centre.z + normal.z * radius * reach
            ));
        }
        const cardSize = species.card;
        const cardScale = options.cardScale || 1;
        for (const point of points) {
            for (let c = 0; c < 3; c++) {
                corner.set(point.x + range(-0.45, 0.45), point.y + range(-0.35, 0.35), point.z + range(-0.45, 0.45));
                const fresh = species.cell === 'blossom' && random() < 0.1;
                card(
                    batch, corner.clone(), between(cardSize) * size * cardScale,
                    fresh ? 'leaf' : species.cell, fresh ? 0x7d9a42 : pick(palette),
                    centre, radius, crownHeight * 0.5
                );
            }
        }
        return { radius, height: trunkHeight + crownHeight, girth, trunkHeight, crownHeight };
    }

    // Loose rounded shrub made of fine foliage cards.
    function addShrub(batch, x, y, z, width, height, depth, palette = SHRUB_GREENS, cellName = 'shrub') {
        const centre = new THREE.Vector3(x, y + height * 0.42, z);
        const count = Math.max(7, Math.round((width + depth) * height * 2.4));
        for (let i = 0; i < count; i++) {
            corner.set(
                x + range(-0.5, 0.5) * width * 0.72,
                y + height * range(0.18, 0.78),
                z + range(-0.5, 0.5) * depth * 0.72
            );
            card(batch, corner.clone(), range(0.85, 1.25) * Math.min(1.5, Math.max(0.75, height)),
                cellName, pick(palette), centre, Math.max(width, depth) * 0.5, height * 0.5, 1.05);
        }
    }

    // Clipped hedge from (x0, z0) to (x1, z1): dark core, leafy skin.
    function addHedge(batch, x0, z0, x1, z1, y, height, width, palette = SHRUB_GREENS) {
        const length = Math.hypot(x1 - x0, z1 - z0);
        const yaw = Math.atan2(x1 - x0, z1 - z0);
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        batch.add(PRIMS.box, transform(cx, y + height * 0.46, cz, width * 0.82, height * 0.92, length, 0, yaw, 0),
            0x2c5a22, (t) => 0.5 + t * 0.6, FOLIAGE.bark);
        const centre = new THREE.Vector3(cx, y + height * 0.4, cz);
        const along = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const steps = Math.max(2, Math.round(length / 0.62));
        const faces = [
            { normal: UP, offset: (s) => corner.copy(centre).addScaledVector(across, s * width * 0.3).setY(y + height) },
            { normal: across, offset: (s) => corner.copy(centre).addScaledVector(across, width * 0.5).setY(y + height * (0.5 + s * 0.3)) },
            { normal: across.clone().negate(), offset: (s) => corner.copy(centre).addScaledVector(across, -width * 0.5).setY(y + height * (0.5 + s * 0.3)) }
        ];
        for (const face of faces) {
            for (let i = 0; i < steps; i++) {
                for (const row of [-1, 1]) {
                    face.offset(row);
                    corner.addScaledVector(along, ((i + 0.5) / steps - 0.5) * length + range(-0.15, 0.15));
                    card(batch, corner.clone(), range(1.0, 1.35), 'shrub', pick(palette), centre,
                        Math.max(length, width) * 0.5, height * 0.6, 1.08, face.normal);
                }
            }
        }
    }

    // Upright crossed cards: ornamental grasses and flower beds.
    function addTuft(batch, x, y, z, width, height, cellName = 'flower', color = 0xffffff) {
        const cell = FOLIAGE[cellName];
        tint.set(color);
        const yaw = random() * Math.PI;
        for (let k = 0; k < 2; k++) {
            const angle = yaw + k * Math.PI / 2;
            const dx = Math.cos(angle) * width / 2;
            const dz = Math.sin(angle) * width / 2;
            const quad = [
                [x - dx, y, z - dz, cell[0], cell[1], 0.72],
                [x + dx, y, z + dz, cell[2], cell[1], 0.72],
                [x + dx, y + height, z + dz, cell[2], cell[3], 1.05],
                [x - dx, y + height, z - dz, cell[0], cell[3], 1.05]
            ];
            for (const i of [0, 1, 2, 0, 2, 3]) {
                const q = quad[i];
                batch.vertex(q[0], q[1], q[2], 0, 1, 0, q[3], q[4], tint.r * q[5], tint.g * q[5], tint.b * q[5]);
            }
        }
    }

    return { addTree, addShrub, addHedge, addTuft };
}
