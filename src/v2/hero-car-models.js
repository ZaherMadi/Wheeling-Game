// Photorealistic 3D sculpted convertible sports car (GT 51 Cabrio — Code 5HPORSHE).
// Seamless parametric lofted surfaces: elliptical wrapped nose & tail bumpers,
// semicircular wheel-arch cutouts, canvas soft top with matte headliner, flush
// raked windshield + framed side glass, flush 4-point sloped oval headlights,
// curved rear LED lightbar, full interior, forged 10-spoke rims & yellow calipers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
    createCarPaintMaterial,
    createDynamicLightMaterials,
    getHeroCarSharedAssets
} from './hero-car-pbr.js';

const CAR_LEN = 4.52;
const FRONT_Z = 1.26;
const REAR_Z = -1.19;
const FRONT_R = 0.345;
const REAR_R = 0.362;
const FRONT_TRACK = 0.805;
const REAR_TRACK = 0.848;
const ARCH_F_R = 0.376;
const ARCH_R_R = 0.394;

// Nose & tail plan-view ellipse split lines (flanks blend into curved wrap bumpers here)
const NOSE_SPLIT_Z = 2.00;
const NOSE_APEX_Z = 2.26;
const TAIL_SPLIT_Z = -1.98;
const TAIL_APEX_Z = -2.26;

function sampleCurve(knots, z) {
    if (z >= knots[0][0]) return knots[0][1];
    const last = knots.length - 1;
    if (z <= knots[last][0]) return knots[last][1];
    for (let i = 0; i < last; i++) {
        const [z0, y0] = knots[i];
        const [z1, y1] = knots[i + 1];
        if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) {
            const span = z1 - z0;
            const t = Math.abs(span) < 1e-6 ? 0 : (z - z0) / span;
            const s = t * t * (3 - 2 * t);
            return y0 + (y1 - y0) * s;
        }
    }
    return knots[last][1];
}

// Body upper belt/shoulder height from front nose to rear tail
const BELT_Y_KNOTS = [
    [2.26, 0.45],
    [2.14, 0.565],
    [2.00, 0.625],
    [1.82, 0.685],
    [1.56, 0.742],
    [1.26, 0.772],
    [0.98, 0.758],
    [0.74, 0.822],
    [0.45, 0.842],
    [-0.15, 0.86],
    [-0.45, 0.882],
    [-0.86, 0.942],
    [-1.22, 0.968],
    [-1.58, 0.938],
    [-1.92, 0.885],
    [-2.04, 0.848],
    [-2.18, 0.795],
    [-2.26, 0.75]
];

// Central hood valley / rear engine deck camber relative to outer wings
const CROWN_DELTA_KNOTS = [
    [2.26, 0.0],
    [2.05, 0.008],
    [1.76, -0.028],
    [1.34, -0.046],
    [0.98, -0.022],
    [0.74, 0.012],
    [-0.86, 0.018],
    [-1.25, 0.03],
    [-1.72, 0.022],
    [-2.05, 0.008],
    [-2.26, 0.0]
];

// Side body outer half-width along avenue Z (with muscular rear haunches)
const HALF_W_KNOTS = [
    [2.26, 0.0],
    [2.16, 0.56],
    [2.00, 0.855],
    [1.78, 0.89],
    [1.36, 0.922],
    [1.04, 0.908],
    [0.62, 0.885],
    [0.10, 0.882],
    [-0.36, 0.908],
    [-0.86, 0.965],
    [-1.24, 0.98],
    [-1.65, 0.952],
    [-1.98, 0.885],
    [-2.14, 0.62],
    [-2.26, 0.0]
];

// Shared cabin upper drip-rail coordinates (connects windshield A-pillars, header & soft-top!)
const RAIL_X_KNOTS = [
    [0.74, 0.775],
    [0.45, 0.708],
    [0.16, 0.642],
    [0.02, 0.645],
    [-0.26, 0.658],
    [-0.58, 0.650],
    [-0.90, 0.638],
    [-1.26, 0.618]
];
const RAIL_Y_KNOTS = [
    [0.74, 0.822],
    [0.45, 1.035],
    [0.16, 1.245],
    [0.02, 1.268],
    [-0.26, 1.288],
    [-0.58, 1.242],
    [-0.90, 1.135],
    [-1.26, 0.962]
];

function archOpeningAt(z, cz, cy, r) {
    const dz = z - cz;
    if (Math.abs(dz) >= r - 0.002) return null;
    return cy + Math.sqrt(r * r - dz * dz);
}

function sillHeightAt(z) {
    const fArch = archOpeningAt(z, FRONT_Z, FRONT_R, ARCH_F_R);
    if (fArch !== null) return fArch;
    const rArch = archOpeningAt(z, REAR_Z, REAR_R, ARCH_R_R);
    if (rArch !== null) return rArch;
    if (z > FRONT_Z + ARCH_F_R) {
        const t = Math.max(0, Math.min(1, (z - (FRONT_Z + ARCH_F_R)) / (NOSE_APEX_Z - (FRONT_Z + ARCH_F_R))));
        return 0.145 + t * t * 0.035;
    }
    if (z < REAR_Z - ARCH_R_R) {
        const t = Math.max(0, Math.min(1, ((REAR_Z - ARCH_R_R) - z) / (Math.abs(TAIL_APEX_Z) - Math.abs(REAR_Z - ARCH_R_R))));
        return 0.155 + t * 0.055;
    }
    return 0.14;
}

/**
 * Smooth elliptical bumper plan-view contour for both front (+Z) and rear (-Z).
 */
function noseArcPoint(u, vRow) {
    // u in [-1, 1] maps angle -PI/2 .. +PI/2 along front corner -> apex -> corner
    const ang = u * (Math.PI / 2);
    const sinA = Math.sin(ang);
    const cosA = Math.cos(ang);
    const zBase = NOSE_SPLIT_Z + (NOSE_APEX_Z - NOSE_SPLIT_Z) * cosA;
    const hwAtZ = 0.855 * sinA;
    const topY = sampleCurve(BELT_Y_KNOTS, zBase);
    const botY = sillHeightAt(zBase);
    const y = topY - vRow * (topY - botY);
    // Match side-flank shoulder & rocker tuck at u = ±1 so corner seams weld flush!
    const xTuck = 1 - 0.05 * (1 - vRow) - (vRow >= 0.9 ? (vRow - 0.88) * 0.22 : 0);
    const protrude = Math.sin(vRow * Math.PI) * 0.032 - (vRow > 0.82 ? (vRow - 0.82) * 0.09 : 0);
    return [hwAtZ * xTuck, y, zBase + protrude * cosA];
}

function tailArcPoint(u, vRow) {
    const ang = u * (Math.PI / 2);
    const sinA = Math.sin(ang);
    const cosA = Math.cos(ang);
    const zBase = TAIL_SPLIT_Z - (Math.abs(TAIL_APEX_Z) - Math.abs(TAIL_SPLIT_Z)) * cosA;
    const hwAtZ = 0.885 * sinA;
    const topY = sampleCurve(BELT_Y_KNOTS, zBase);
    const botY = 0.22;
    const y = topY - vRow * (topY - botY);
    const xTuck = 1 - 0.05 * (1 - vRow) - (vRow >= 0.72 ? (vRow - 0.72) * 0.24 : 0);
    // Athletic Porsche rear bumper undercut pulling forward under the taillight toward diffuser
    const zCurve = vRow < 0.38
        ? Math.sin((vRow / 0.38) * Math.PI) * 0.015
        : -Math.pow((vRow - 0.38) / 0.62, 1.35) * 0.16;
    return [hwAtZ * xTuck, y, zBase - zCurve * cosA];
}

function buildSurfaceFromGrid(grid, { outwardHint = null, closedU = false, uScale = 1, vScale = 1 } = {}) {
    const nu = grid.length;
    const nv = grid[0].length;
    const positions = new Float32Array(nu * nv * 3);
    const uvs = new Float32Array(nu * nv * 2);

    for (let iu = 0; iu < nu; iu++) {
        for (let iv = 0; iv < nv; iv++) {
            const p = grid[iu][iv];
            const idx = iu * nv + iv;
            positions[idx * 3] = p[0];
            positions[idx * 3 + 1] = p[1];
            positions[idx * 3 + 2] = p[2];
            uvs[idx * 2] = (iu / (nu - 1)) * uScale;
            uvs[idx * 2 + 1] = (iv / (nv - 1)) * vScale;
        }
    }

    let flip = false;
    if (outwardHint) {
        const mu = Math.floor((nu - 1) / 2);
        const mv = Math.floor((nv - 1) / 2);
        const a = grid[mu][mv];
        const b = grid[mu + 1][mv];
        const c = grid[mu][mv + 1];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        if (nx * outwardHint[0] + ny * outwardHint[1] + nz * outwardHint[2] < 0) flip = true;
    }

    const indices = [];
    for (let iu = 0; iu < nu - 1; iu++) {
        for (let iv = 0; iv < nv - 1; iv++) {
            const i00 = iu * nv + iv;
            const i10 = (iu + 1) * nv + iv;
            const i01 = iu * nv + (iv + 1);
            const i11 = (iu + 1) * nv + (iv + 1);
            if (!flip) {
                indices.push(i00, i10, i01, i10, i11, i01);
            } else {
                indices.push(i00, i01, i10, i10, i01, i11);
            }
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    if (closedU) {
        const nAttr = geo.attributes.normal;
        for (let iv = 0; iv < nv; iv++) {
            const iA = iv;
            const iB = (nu - 1) * nv + iv;
            const nx = (nAttr.getX(iA) + nAttr.getX(iB)) * 0.5;
            const ny = (nAttr.getY(iA) + nAttr.getY(iB)) * 0.5;
            const nz = (nAttr.getZ(iA) + nAttr.getZ(iB)) * 0.5;
            const len = Math.hypot(nx, ny, nz) || 1;
            nAttr.setXYZ(iA, nx / len, ny / len, nz / len);
            nAttr.setXYZ(iB, nx / len, ny / len, nz / len);
        }
        nAttr.needsUpdate = true;
    }
    return geo;
}

function mergeNormalized(list) {
    const clean = [];
    for (const g of list) {
        if (!g) continue;
        const copy = g.index ? g.toNonIndexed() : g.clone();
        if (!copy.attributes.normal) copy.computeVertexNormals();
        if (!copy.attributes.uv) {
            const count = copy.attributes.position.count;
            copy.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        for (const key of Object.keys(copy.attributes)) {
            if (key !== 'position' && key !== 'normal' && key !== 'uv') copy.deleteAttribute(key);
        }
        clean.push(copy);
        g.dispose();
    }
    const merged = mergeGeometries(clean, false);
    for (const c of clean) c.dispose();
    return merged;
}

function transformGeo(geo, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().compose(
        new THREE.Vector3(px, py, pz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(sx, sy, sz)
    );
    geo.applyMatrix4(m);
    return geo;
}

function makeSideStations() {
    const zSet = new Set([
        NOSE_SPLIT_Z, 1.88, 1.76,
        +(FRONT_Z + ARCH_F_R + 0.008).toFixed(4),
        ...Array.from({ length: 23 }, (_, k) => {
            const a = (k / 22) * Math.PI;
            return +(FRONT_Z + Math.cos(a) * ARCH_F_R).toFixed(4);
        }),
        +(FRONT_Z - ARCH_F_R - 0.008).toFixed(4),
        0.74, 0.68, 0.56, 0.44, 0.34, 0.22, 0.10, -0.03, -0.16, -0.28, -0.40, -0.51, -0.62,
        +(REAR_Z + ARCH_R_R + 0.008).toFixed(4),
        ...Array.from({ length: 23 }, (_, k) => {
            const a = (k / 22) * Math.PI;
            return +(REAR_Z + Math.cos(a) * ARCH_R_R).toFixed(4);
        }),
        +(REAR_Z - ARCH_R_R - 0.008).toFixed(4),
        -1.72, -1.86, TAIL_SPLIT_Z
    ]);
    return [...zSet].sort((a, b) => b - a);
}

/**
 * Generate seamless sculpted body panels (side flanks + wrapped elliptical nose & tail
 * + frunk hood + rear tonneau/deck + tapered A-pillars/header + arch eyebrow flares).
 */
function buildPaintBodyParts() {
    const parts = [];
    const zs = makeSideStations();

    // 1. Left (+X) & Right (-X) sculpted quarter/door flanks spanning NOSE_SPLIT_Z -> TAIL_SPLIT_Z
    for (const side of [-1, 1]) {
        const grid = [];
        for (const z of zs) {
            const hw = sampleCurve(HALF_W_KNOTS, z);
            const belt = sampleCurve(BELT_Y_KNOTS, z);
            const sill = sillHeightAt(z);
            const rearHaunch = Math.exp(-Math.pow((z + 1.18) / 0.72, 2));
            const midBulge = 0.012 + rearHaunch * 0.018;
            const col = [];
            const rowV = [0, 0.08, 0.16, 0.28, 0.42, 0.56, 0.68, 0.78, 0.90, 0.96, 1.0];
            for (const v of rowV) {
                const y = belt - v * (belt - sill);
                let x = hw * (1 - 0.05 * (1 - v));
                if (v > 0.10 && v < 0.82) x += Math.sin(((v - 0.10) / 0.72) * Math.PI) * midBulge;
                if (v >= 0.9) x -= (v - 0.86) * 0.22;
                col.push([side * x, y, z]);
            }
            grid.push(col);
        }
        parts.push(buildSurfaceFromGrid(grid, { outwardHint: [side, 0, 0], uScale: 2.0, vScale: 0.7 }));
    }

    // 2. Elliptical Wrap-Around Front Bumper & Tail Bumper Fascias + continuous top-apron overlap (zero nose gap!)
    {
        const nu = 31;
        const rowV = [-0.04, 0.02, 0.10, 0.20, 0.34, 0.50, 0.64, 0.76, 0.88, 0.96, 1.0];
        const fGrid = [];
        const rGrid = [];
        for (let iu = 0; iu < nu; iu++) {
            const u = -1 + (2 * iu) / (nu - 1);
            fGrid.push(rowV.map((v) => {
                if (v < 0) {
                    const p = noseArcPoint(u, 0);
                    return [p[0] * 0.96, p[1] + 0.012, p[2] - 0.055];
                }
                return noseArcPoint(u, v);
            }));
            rGrid.push(rowV.map((v) => {
                if (v < 0) {
                    const p = tailArcPoint(u, 0);
                    return [p[0] * 0.96, p[1] + 0.012, p[2] + 0.055];
                }
                return tailArcPoint(u, v);
            }));
        }
        parts.push(buildSurfaceFromGrid(fGrid, { outwardHint: [0, 0, 1] }));
        parts.push(buildSurfaceFromGrid(rGrid, { outwardHint: [0, 0, -1] }));
    }

    // 3. Sculpted Front Frunk Hood & Proud Front Fenders (z = +2.26 down to windshield cowl +0.74)
    {
        const hz = [NOSE_APEX_Z, 2.23, 2.19, 2.13, 2.06, 2.00, 1.92, 1.84, 1.74, 1.66, 1.56, 1.46, 1.36, 1.26, 1.16, 1.04, 0.94, 0.86, 0.80, 0.74];
        const nu = 31;
        const grid = [];
        for (let iu = 0; iu < nu; iu++) {
            const u = -1 + (2 * iu) / (nu - 1);
            const col = [];
            for (const z of hz) {
                const rawHW = z >= NOSE_SPLIT_Z
                    ? 0.855 * Math.sin(Math.acos(Math.min(1, (z - NOSE_SPLIT_Z) / (NOSE_APEX_Z - NOSE_SPLIT_Z))))
                    : sampleCurve(HALF_W_KNOTS, z);
                const hw = rawHW * 0.952;
                const belt = sampleCurve(BELT_Y_KNOTS, z);
                const cDelta = sampleCurve(CROWN_DELTA_KNOTS, z);
                const absU = Math.abs(u);
                const wingBump = Math.exp(-Math.pow((absU - 0.72) / 0.18, 2)) * (z > 0.92 && z < 1.92 ? 0.032 : 0.008);
                const shoulderRadius = Math.pow(1 - absU, 1.35);
                const y = belt + (1 - absU * absU) * cDelta + wingBump * shoulderRadius;
                col.push([u * hw, y, z]);
            }
            grid.push(col);
        }
        parts.push(buildSurfaceFromGrid(grid, { outwardHint: [0, 1, 0], uScale: 1.4, vScale: 1.3 }));
    }

    // 4. Rear Tonneau Decklid & Curved Boat-Tail Spoiler Shelf (z = -0.86 down to tail -2.26)
    {
        const rz = [-0.86, -0.94, -1.04, -1.14, -1.24, -1.34, -1.46, -1.58, -1.70, -1.82, -1.94, -2.02, -2.06, -2.12, -2.17, -2.22, TAIL_APEX_Z];
        const nu = 29;
        const grid = [];
        for (let iu = 0; iu < nu; iu++) {
            const u = -1 + (2 * iu) / (nu - 1);
            const col = [];
            for (const z of rz) {
                const rawHW = z <= TAIL_SPLIT_Z
                    ? 0.885 * Math.sin(Math.acos(Math.min(1, (TAIL_SPLIT_Z - z) / (Math.abs(TAIL_APEX_Z) - Math.abs(TAIL_SPLIT_Z)))))
                    : sampleCurve(HALF_W_KNOTS, z);
                const hw = rawHW * 0.95;
                const belt = sampleCurve(BELT_Y_KNOTS, z);
                const cDelta = sampleCurve(CROWN_DELTA_KNOTS, z);
                const absU = Math.abs(u);
                const boatTail = Math.pow(1 - absU, 1.18);
                const y = belt + (1 - absU * absU) * cDelta - Math.exp(-Math.pow((z + 1.78) / 0.38, 2)) * boatTail * 0.018;
                col.push([u * hw, y, z]);
            }
            grid.push(col);
        }
        parts.push(buildSurfaceFromGrid(grid, { outwardHint: [0, 1, 0], uScale: 1.5, vScale: 1.2 }));
    }

    // 5. Door Belt Shoulder Caps bridging sides continuously into cabin interior tub
    for (const side of [-1, 1]) {
        const bGrid = [];
        for (const z of [0.74, 0.45, 0.12, -0.25, -0.58, -0.88]) {
            const outerX = sampleCurve(HALF_W_KNOTS, z) * 0.95;
            const innerX = sampleCurve(HALF_W_KNOTS, z) * 0.80;
            const y = sampleCurve(BELT_Y_KNOTS, z);
            bGrid.push([
                [side * outerX, y, z],
                [side * ((outerX + innerX) * 0.5), y + 0.008, z],
                [side * innerX, y - 0.01, z]
            ]);
        }
        parts.push(buildSurfaceFromGrid(bGrid, { outwardHint: [0, 1, 0] }));
    }

    // 6. Sculpted Yellow A-Pillars & Front Cabriolet Header Frame following exact rail curve!
    for (const side of [-1, 1]) {
        const pts = [];
        for (const z of [0.74, 0.56, 0.36, 0.16]) {
            pts.push(new THREE.Vector3(side * sampleCurve(RAIL_X_KNOTS, z), sampleCurve(RAIL_Y_KNOTS, z), z));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.TubeGeometry(curve, 12, 0.036, 8, false);
        parts.push(tube);
    }
    {
        // Curved yellow windshield header bar from left A-pillar top to right A-pillar top
        const nu = 15;
        const hz = [0.17, 0.10, 0.02];
        const hGrid = [];
        for (let iu = 0; iu < nu; iu++) {
            const u = -1 + (2 * iu) / (nu - 1);
            const archZ = (1 - u * u) * 0.038;
            const crownY = (1 - u * u) * 0.018;
            const col = hz.map((z) => [
                u * sampleCurve(RAIL_X_KNOTS, z),
                sampleCurve(RAIL_Y_KNOTS, z) + crownY,
                z + archZ
            ]);
            hGrid.push(col);
        }
        parts.push(buildSurfaceFromGrid(hGrid, { outwardHint: [0, 1, 0] }));
    }

    // 7. Aerodynamic Door-Mounted Painted Side Mirrors & Flush Handles
    for (const side of [-1, 1]) {
        const cap = new THREE.SphereGeometry(0.064, 16, 12);
        transformGeo(cap, side * 0.945, 0.905, 0.48, 0, side * 0.18, side * -0.1, 1.32, 0.68, 1.44);
        parts.push(cap);
        const handle = new THREE.BoxGeometry(0.022, 0.022, 0.145);
        transformGeo(handle, side * 0.89, 0.765, -0.24);
        parts.push(handle);
    }

    // 8. Painted Wheel-Arch Eyebrow Flares aligned cleanly over arch openings
    for (const [cz, cy, r, trackX] of [
        [FRONT_Z, FRONT_R, ARCH_F_R, 0.862],
        [REAR_Z, REAR_R, ARCH_R_R, 0.922]
    ]) {
        for (const side of [-1, 1]) {
            const lip = new THREE.TorusGeometry(r + 0.014, 0.026, 16, 32, Math.PI * 0.94);
            lip.rotateY(Math.PI / 2);
            transformGeo(lip, side * trackX, cy, cz, -0.04, 0, 0, 1.35, 1, 1);
            parts.push(lip);
        }
    }

    return mergeNormalized(parts);
}

function buildSoftTopGeo() {
    // Exterior woven charcoal fabric canvas dome + flush C-pillar sails + interior dark acoustic headliner
    const tz = [0.045, -0.08, -0.12, -0.20, -0.30, -0.41, -0.52, -0.64, -0.76, -0.88, -1.00, -1.10, -1.18, -1.23, -1.27];
    const nu = 29;
    const outerGrid = [];
    const innerGrid = [];

    for (let iu = 0; iu < nu; iu++) {
        const u = -1 + (2 * iu) / (nu - 1);
        const absU = Math.abs(u);
        const domeCurve = 1 - Math.pow(absU, 2.35);
        const colOut = [];
        const colIn = [];
        for (const z of tz) {
            const hw = sampleCurve(RAIL_X_KNOTS, z);
            const railY = sampleCurve(RAIL_Y_KNOTS, z);
            const centerDrop = z > -0.7 ? 0.024 : 0.015;
            const archZ = z > -0.15 ? (1 - u * u) * 0.036 * ((0.15 + z) / 0.17) : 0;
            const yOut = railY + domeCurve * centerDrop;
            colOut.push([u * hw, yOut, z + archZ]);
            colIn.push([u * hw * 0.96, yOut - 0.022, z + archZ]);
        }
        outerGrid.push(colOut);
        innerGrid.push(colIn);
    }

    const domeOutGeo = buildSurfaceFromGrid(outerGrid, { outwardHint: [0, 1, 0], uScale: 1, vScale: 1 });
    const headlinerGeo = buildSurfaceFromGrid(innerGrid, { outwardHint: [0, -1, 0], uScale: 1, vScale: 1 });

    // Solid C-pillar canvas sail flanks sealing smoothly from drip rail down to rear quarter beltline!
    const sails = [];
    for (const side of [-1, 1]) {
        const sz = [-0.74, -0.92, -1.10, -1.26];
        const sGrid = [[], []];
        for (const z of sz) {
            const topX = sampleCurve(RAIL_X_KNOTS, z);
            const topY = sampleCurve(RAIL_Y_KNOTS, z);
            const botX = sampleCurve(HALF_W_KNOTS, z) * 0.85;
            const botY = sampleCurve(BELT_Y_KNOTS, z) - 0.005;
            sGrid[0].push([side * topX, topY, z]);
            sGrid[1].push([side * botX, botY, z]);
        }
        sails.push(buildSurfaceFromGrid(sGrid, { outwardHint: [side, 0.35, -0.1] }));
    }

    return {
        outerGeo: mergeNormalized([domeOutGeo, ...sails]),
        innerGeo: headlinerGeo
    };
}

function buildTrimParts(detailLevel = 0) {
    const glossParts = [];
    const matteParts = [];
    const archParts = [];

    // Wheelwell dark matte cylindrical liners (completely enclosed behind wheels)
    for (const [cz, cy, r, hw] of [
        [FRONT_Z, FRONT_R, ARCH_F_R, 0.86],
        [REAR_Z, REAR_R, ARCH_R_R, 0.91]
    ]) {
        for (const side of [-1, 1]) {
            const barrel = new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.42, 20, 1, false, 0, Math.PI);
            barrel.rotateZ(Math.PI / 2);
            transformGeo(barrel, side * (hw - 0.21), cy, cz);
            archParts.push(barrel);
        }
    }

    // Flat underbody aero floorpan & sculpted curved side skirts
    const pan = new THREE.BoxGeometry(1.48, 0.05, 4.02);
    transformGeo(pan, 0, 0.136, -0.02);
    matteParts.push(pan);

    for (const side of [-1, 1]) {
        const skirt = new THREE.BoxGeometry(0.052, 0.036, 1.66);
        transformGeo(skirt, side * 0.875, 0.145, 0.05);
        glossParts.push(skirt);

        const mirrorStalk = new THREE.BoxGeometry(0.045, 0.05, 0.07);
        transformGeo(mirrorStalk, side * 0.855, 0.865, 0.49, 0, 0, side * -0.45);
        glossParts.push(mirrorStalk);

        // Door beltline window seal trim + forward-canted B-pillar divider strip
        const beltSeal = new THREE.BoxGeometry(0.026, 0.02, 1.48);
        transformGeo(beltSeal, side * 0.775, 0.855, -0.06);
        glossParts.push(beltSeal);

        const bPillar = new THREE.BoxGeometry(0.02, 0.34, 0.044);
        transformGeo(bPillar, side * 0.69, 1.045, -0.46, 0.14, 0, side * 0.34);
        glossParts.push(bPillar);
    }

    // Curved black soft-top rear tonneau collar gasket
    const collar = new THREE.TorusGeometry(0.585, 0.018, 6, 20, Math.PI);
    collar.rotateX(Math.PI / 2);
    collar.rotateZ(Math.PI);
    transformGeo(collar, 0, 0.962, -0.92, 0, 0, 0, 1.07, 0.66, 1);
    matteParts.push(collar);

    // Subtle contoured front chin splitter following the nose arc (never boxy planks!)
    {
        const nu = 17;
        const sGrid = [];
        for (let iu = 0; iu < nu; iu++) {
            const u = -1 + (2 * iu) / (nu - 1);
            const p = noseArcPoint(u, 0.98);
            const scale = 1.03;
            sGrid.push([
                [p[0] * scale, 0.132, p[2] + (1 - u * u) * 0.032],
                [p[0] * 0.94, 0.132, p[2] - 0.14]
            ]);
        }
        matteParts.push(buildSurfaceFromGrid(sGrid, { outwardHint: [0, 1, 0] }));
    }

    // Recessed matte front intake openings & subtle black louvers tucked INSIDE bumper curvature
    const centerIn = new THREE.BoxGeometry(0.62, 0.13, 0.06);
    transformGeo(centerIn, 0, 0.23, 2.215);
    matteParts.push(centerIn);
    for (const side of [-1, 1]) {
        const sideIn = new THREE.BoxGeometry(0.32, 0.13, 0.06);
        transformGeo(sideIn, side * 0.52, 0.24, 2.09, 0, side * 0.42, 0);
        matteParts.push(sideIn);
        if (detailLevel === 0) {
            for (const oy of [-0.035, 0.005, 0.045]) {
                const blade = new THREE.BoxGeometry(0.30, 0.012, 0.068);
                transformGeo(blade, side * 0.52, 0.24 + oy, 2.095, 0, side * 0.42, 0);
                glossParts.push(blade);
            }
            // Wiper blades parked low on windshield cowl
            const wiper = new THREE.BoxGeometry(0.44, 0.014, 0.02);
            transformGeo(wiper, side * 0.23 - 0.04, 0.832, 0.74, -0.32, 0, -0.05);
            matteParts.push(wiper);
        }

        // Flush oval black headlight interior bezel aligned to exact -0.40 fender slope
        const bezel = new THREE.TorusGeometry(0.108, 0.011, 8, 22);
        bezel.rotateX(Math.PI / 2);
        transformGeo(bezel, side * 0.64, 0.635, 1.88, -0.40, side * 0.14, side * 0.14, 0.96, 1.0, 1.36);
        glossParts.push(bezel);

        // Door & front fender vertical shut lines
        const doorSeam = new THREE.BoxGeometry(0.008, 0.62, 0.01);
        transformGeo(doorSeam, side * 0.885, 0.51, -0.34);
        matteParts.push(doorSeam);
        const frontSeam = new THREE.BoxGeometry(0.008, 0.60, 0.01);
        transformGeo(frontSeam, side * 0.885, 0.49, 0.64);
        matteParts.push(frontSeam);
    }

    // Rear engine decklid recessed vertical intake slats
    const grilleBase = new THREE.BoxGeometry(0.74, 0.026, 0.25);
    transformGeo(grilleBase, 0, 0.935, -1.52, -0.14, 0, 0);
    matteParts.push(grilleBase);
    if (detailLevel === 0) {
        for (let i = -4; i <= 4; i++) {
            const slat = new THREE.BoxGeometry(0.016, 0.032, 0.23);
            transformGeo(slat, i * 0.075, 0.942, -1.52, -0.14, 0, 0);
            glossParts.push(slat);
        }
    }

    // Contoured rear bumper lower diffuser tucked gracefully inside elliptical rear undercut!
    {
        const nu = 15;
        const dGrid = [];
        for (let iu = 0; iu < nu; iu++) {
            const u = -0.80 + (1.60 * iu) / (nu - 1);
            const topP = tailArcPoint(u, 0.72);
            const botP = tailArcPoint(u, 1.0);
            dGrid.push([
                [topP[0], topP[1], topP[2] - 0.004],
                [botP[0] * 0.96, botP[1] - 0.01, botP[2] + 0.02]
            ]);
        }
        matteParts.push(buildSurfaceFromGrid(dGrid, { outwardHint: [0, 0, -1] }));

        for (const u of [-0.48, -0.24, 0, 0.24, 0.48]) {
            const p = tailArcPoint(u, 0.85);
            const fin = new THREE.BoxGeometry(0.018, 0.14, 0.14);
            transformGeo(fin, p[0], p[1], p[2] + 0.02, 0.12, 0, 0);
            glossParts.push(fin);
        }
    }

    // Rear bumper side vents & wrapped taillight dark recessed trough
    for (const side of [-1, 1]) {
        const sP = tailArcPoint(side * 0.78, 0.62);
        const vent = new THREE.BoxGeometry(0.16, 0.095, 0.06);
        transformGeo(vent, sP[0] * 0.98, 0.44, sP[2] + 0.01, 0, side * 0.42, 0);
        matteParts.push(vent);
    }

    return {
        glossGeo: mergeNormalized(glossParts),
        matteGeo: mergeNormalized(matteParts),
        archGeo: mergeNormalized(archParts)
    };
}

function buildInteriorAndGlass(mats, softInnerGeo, detailLevel = 0) {
    const group = new THREE.Group();
    const glassParts = [];

    // 1. Curved lofted windshield flush between A-pillars, header & hood cowl
    {
        const nu = 15;
        const wz = [0.74, 0.54, 0.34, 0.16];
        const wsGrid = [];
        for (let iu = 0; iu < nu; iu++) {
            const u = -1 + (2 * iu) / (nu - 1);
            const archZ = (1 - u * u) * 0.048;
            const col = wz.map((z) => [
                u * sampleCurve(RAIL_X_KNOTS, z),
                sampleCurve(RAIL_Y_KNOTS, z),
                z + archZ
            ]);
            wsGrid.push(col);
        }
        glassParts.push(buildSurfaceFromGrid(wsGrid, { outwardHint: [0, 0.8, 0.6] }));
    }

    // 2. Curved side door & rear quarter windows lofted cleanly from drip-rail down into door belt!
    for (const side of [-1, 1]) {
        const sz = [0.64, 0.42, 0.18, -0.08, -0.38, -0.62, -0.80];
        const sGrid = [[], []];
        for (const z of sz) {
            const topX = sampleCurve(RAIL_X_KNOTS, z) - 0.01;
            const topY = sampleCurve(RAIL_Y_KNOTS, z) - 0.008;
            const botX = sampleCurve(HALF_W_KNOTS, z) * 0.87;
            const botY = sampleCurve(BELT_Y_KNOTS, z) + 0.004;
            sGrid[0].push([side * topX, topY, z]);
            sGrid[1].push([side * botX, botY, z]);
        }
        glassParts.push(buildSurfaceFromGrid(sGrid, { outwardHint: [side, 0.25, 0] }));
    }

    // Inset rear window on sloped fabric top
    const rw = new THREE.BoxGeometry(0.84, 0.26, 0.014);
    transformGeo(rw, 0, 1.08, -1.03, 1.02, 0, 0);
    glassParts.push(rw);

    const glassMesh = new THREE.Mesh(mergeNormalized(glassParts), mats.sideGlassMat);
    glassMesh.renderOrder = 3;
    group.add(glassMesh);

    if (detailLevel >= 2) return { group, steeringWheel: null };

    // Solid dark charcoal acoustic inner roof headliner so sky never leaks inside cabin!
    const innerHeadMesh = new THREE.Mesh(softInnerGeo.clone(), mats.archLinerMat);
    group.add(innerHeadMesh);

    // Cabin interior tub, seats, dashboard, tunnel & yellow seat belts
    const leatherParts = [];
    const beltParts = [];

    const tub = new THREE.BoxGeometry(1.36, 0.12, 1.38);
    transformGeo(tub, 0, 0.25, -0.05);
    leatherParts.push(tub);

    const tunnel = new THREE.BoxGeometry(0.24, 0.30, 1.15);
    transformGeo(tunnel, 0, 0.42, 0.04, 0.06, 0, 0);
    leatherParts.push(tunnel);

    const bulkhead = new THREE.BoxGeometry(1.34, 0.56, 0.08);
    transformGeo(bulkhead, 0, 0.62, -0.78);
    leatherParts.push(bulkhead);

    const dash = new THREE.BoxGeometry(1.36, 0.22, 0.32);
    transformGeo(dash, 0, 0.71, 0.56, 0.14, 0, 0);
    leatherParts.push(dash);

    const binnacle = new THREE.CylinderGeometry(0.14, 0.15, 0.18, 14, 1, false, 0, Math.PI);
    binnacle.rotateZ(Math.PI / 2);
    binnacle.rotateY(Math.PI / 2);
    transformGeo(binnacle, 0.34, 0.795, 0.48, 0, 0, 0, 1.45, 0.65, 1);
    leatherParts.push(binnacle);

    for (const sx of [-0.34, 0.34]) {
        const cushion = new THREE.BoxGeometry(0.42, 0.11, 0.46);
        transformGeo(cushion, sx, 0.38, -0.06, -0.08, 0, 0);
        leatherParts.push(cushion);

        const backrest = new THREE.BoxGeometry(0.40, 0.52, 0.11);
        transformGeo(backrest, sx, 0.68, -0.32, -0.26, 0, 0);
        leatherParts.push(backrest);

        const headrest = new THREE.BoxGeometry(0.22, 0.20, 0.10);
        transformGeo(headrest, sx, 0.99, -0.39, -0.2, 0, 0);
        leatherParts.push(headrest);

        for (const side of [-1, 1]) {
            const bolster = new THREE.BoxGeometry(0.065, 0.44, 0.14);
            transformGeo(bolster, sx + side * 0.20, 0.65, -0.27, -0.26, 0, side * 0.16);
            leatherParts.push(bolster);
        }

        const strap = new THREE.BoxGeometry(0.042, 0.48, 0.022);
        transformGeo(strap, sx + (sx > 0 ? 0.13 : -0.13), 0.68, -0.23, -0.26, 0, sx > 0 ? -0.35 : 0.35);
        beltParts.push(strap);
    }

    for (const side of [-1, 1]) {
        const card = new THREE.BoxGeometry(0.055, 0.42, 1.05);
        transformGeo(card, side * 0.69, 0.58, 0.02);
        leatherParts.push(card);
    }

    group.add(new THREE.Mesh(mergeNormalized(leatherParts), mats.leatherMat));
    if (beltParts.length) group.add(new THREE.Mesh(mergeNormalized(beltParts), mats.seatbeltMat));

    const gaugeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.11), mats.dashGaugeMat);
    gaugeMesh.position.set(0.34, 0.795, 0.435);
    gaugeMesh.rotation.y = Math.PI;
    group.add(gaugeMesh);

    let steeringWheel = null;
    if (detailLevel === 0) {
        steeringWheel = new THREE.Group();
        steeringWheel.position.set(0.34, 0.76, 0.29);
        steeringWheel.rotation.x = -0.36;

        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.017, 10, 24), mats.leatherMat);
        const topBand = new THREE.Mesh(
            new THREE.TorusGeometry(0.1425, 0.0185, 8, 8, 0.22),
            mats.seatbeltMat
        );
        topBand.rotation.z = Math.PI / 2 - 0.11;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 14), mats.leatherMat);
        hub.rotation.x = Math.PI / 2;
        const spokeH = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.022, 0.016), mats.chromeMat);
        const spokeB = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.13, 0.016), mats.chromeMat);
        spokeB.position.y = -0.07;

        steeringWheel.add(rim, topBand, hub, spokeH, spokeB);
        group.add(steeringWheel);
    }

    return { group, steeringWheel };
}

/**
 * Helper to create a slender curved bar wrapping cleanly around the rear elliptical contour.
 */
function buildCurvedTailBar(uStart, uEnd, y, h, thick, zOff = -0.008) {
    const nu = 15;
    const grid = [];
    for (let iu = 0; iu < nu; iu++) {
        const u = uStart + (uEnd - uStart) * (iu / (nu - 1));
        const p = tailArcPoint(u, 0.08);
        grid.push([
            [p[0] * 0.99, y + h / 2, p[2] + zOff],
            [p[0] * 0.99, y - h / 2, p[2] + zOff - thick * 0.2]
        ]);
    }
    return buildSurfaceFromGrid(grid, { outwardHint: [0, 0, -1] });
}

function buildOpticsAndMechanicals(mats, lights, detailLevel = 0) {
    const group = new THREE.Group();
    const chromeParts = [];
    const lensHeadParts = [];
    const drlParts = [];
    const lowBeamParts = [];
    const turnLParts = [];
    const turnRParts = [];
    const tailRunParts = [];
    const brakeParts = [];
    const reverseParts = [];
    const sideMarkerParts = [];
    const mirrorGlassParts = [];

    // Flush sloped oval 911 headlights angled along the fender slope (-0.40 rad) with 4-point DRLs
    for (const side of [-1, 1]) {
        const hx = side * 0.64;
        const hy = 0.635;
        const hz = 1.88;
        const pitch = -0.40;

        const bowl = new THREE.CylinderGeometry(0.092, 0.082, 0.03, 18);
        transformGeo(bowl, hx, hy - 0.008, hz, pitch, side * 0.14, side * 0.14, 0.96, 1, 1.32);
        chromeParts.push(bowl);

        const projector = new THREE.SphereGeometry(0.04, 12, 10);
        transformGeo(projector, hx, hy + 0.004, hz + 0.006, pitch, side * 0.14, 0, 0.95, 0.7, 1.05);
        lowBeamParts.push(projector);

        // 4-Point Matrix LED DRL dots nestled flush beneath clear oval cover
        if (detailLevel === 0) {
            for (const [ox, oz] of [[-0.034, -0.048], [0.034, -0.048], [-0.034, 0.048], [0.034, 0.048]]) {
                const dot = new THREE.SphereGeometry(0.011, 8, 6);
                transformGeo(dot, hx + ox, hy + 0.010 - oz * 0.42, hz + oz * 0.9);
                drlParts.push(dot);
            }
        }

        // Shallow convex glass lens hugging the fender slope cleanly
        const lens = new THREE.SphereGeometry(0.104, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.36);
        transformGeo(lens, hx, hy + 0.002, hz + 0.008, pitch, side * 0.14, side * 0.14, 0.98, 0.28, 1.34);
        lensHeadParts.push(lens);

        // Front bumper amber/smoked horizontal marker bar ahead of front wheel arch (exact photo match!)
        const indBar = new THREE.BoxGeometry(0.026, 0.022, 0.16);
        transformGeo(indBar, side * 0.848, 0.43, 1.88, 0, side * -0.08, 0);
        sideMarkerParts.push(indBar);

        const tP = noseArcPoint(side * 0.64, 0.52);
        const turnFront = new THREE.BoxGeometry(0.20, 0.016, 0.024);
        transformGeo(turnFront, tP[0], 0.355, tP[2] + 0.005, 0, side * -0.45, 0);
        if (side > 0) turnLParts.push(turnFront);
        else turnRParts.push(turnFront);

        const mGlass = new THREE.PlaneGeometry(0.125, 0.062);
        transformGeo(mGlass, side * 0.945, 0.905, 0.415, 0, Math.PI + side * 0.15, 0);
        mirrorGlassParts.push(mGlass);
    }

    // Seamless full-width wrap-around rear LED light blade following curved tail contour
    tailRunParts.push(buildCurvedTailBar(-0.88, 0.88, 0.778, 0.024, 0.015, -0.012));
    const tailLens = buildCurvedTailBar(-0.90, 0.90, 0.776, 0.048, 0.02, -0.016);

    const thirdBrake = new THREE.BoxGeometry(0.36, 0.016, 0.024);
    transformGeo(thirdBrake, 0, 0.92, -1.68);
    brakeParts.push(thirdBrake);

    for (const side of [-1, 1]) {
        const u0 = side > 0 ? 0.56 : -0.84;
        const u1 = side > 0 ? 0.84 : -0.56;
        brakeParts.push(buildCurvedTailBar(u0, u1, 0.782, 0.03, 0.012, -0.015));
        const turnR = buildCurvedTailBar(u0, u1, 0.752, 0.014, 0.01, -0.016);
        if (side > 0) turnLParts.push(turnR);
        else turnRParts.push(turnR);

        const r0 = side > 0 ? 0.36 : -0.52;
        const r1 = side > 0 ? 0.52 : -0.36;
        reverseParts.push(buildCurvedTailBar(r0, r1, 0.754, 0.014, 0.01, -0.016));

        // Lower bumper red reflector bar (just above diffuser edge)
        const refP = tailArcPoint(side * 0.74, 0.55);
        const lowRef = new THREE.BoxGeometry(0.18, 0.02, 0.032);
        transformGeo(lowRef, refP[0] * 0.98, 0.49, refP[2] - 0.008, 0, side * 0.42, 0);
        sideMarkerParts.push(lowRef);
    }

    // Twin dual oval brushed stainless steel exhausts nestled neatly inside diffuser apron
    for (const side of [-1, 1]) {
        const muffler = new THREE.CylinderGeometry(0.082, 0.082, 0.32, 10);
        muffler.rotateZ(Math.PI / 2);
        transformGeo(muffler, side * 0.36, 0.23, -1.94);
        chromeParts.push(muffler);

        for (const offset of [0.22, 0.36]) {
            const zTip = -2.19 - (1 - Math.abs(offset)) * 0.015;
            const tip = new THREE.CylinderGeometry(0.044, 0.042, 0.13, 14);
            tip.rotateX(Math.PI / 2);
            transformGeo(tip, side * offset, 0.228, zTip, 0, 0, 0, 1.18, 0.92, 1);
            chromeParts.push(tip);

            const bore = new THREE.CylinderGeometry(0.034, 0.034, 0.04, 12);
            bore.rotateX(Math.PI / 2);
            transformGeo(bore, side * offset, 0.228, zTip - 0.055, 0, 0, 0, 1.18, 0.92, 1);
            group.add(new THREE.Mesh(bore, mats.matteBlackMat));
        }
    }

    // Curved front & rear 51-5HC license plates cleanly outside curved nose/tail surfaces
    const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.11), mats.plateMat);
    rearPlate.position.set(0, 0.515, -2.265);
    rearPlate.rotation.y = Math.PI;
    rearPlate.rotation.x = 0.08;
    group.add(rearPlate);

    const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.10), mats.plateMat);
    frontPlate.position.set(0, 0.33, 2.295);
    frontPlate.rotation.x = -0.08;
    group.add(frontPlate);

    group.add(new THREE.Mesh(mergeNormalized(chromeParts), mats.exhaustMat));
    const headGlass = new THREE.Mesh(mergeNormalized(lensHeadParts), mats.headlightLensMat);
    headGlass.renderOrder = 3;
    const tailGlass = new THREE.Mesh(tailLens, mats.tailLensMat);
    tailGlass.renderOrder = 3;
    group.add(headGlass, tailGlass);

    if (drlParts.length) group.add(new THREE.Mesh(mergeNormalized(drlParts), lights.drlMat));
    group.add(new THREE.Mesh(mergeNormalized(lowBeamParts), lights.lowBeamMat));
    group.add(new THREE.Mesh(mergeNormalized(tailRunParts), lights.tailRunMat));
    group.add(new THREE.Mesh(mergeNormalized(brakeParts), lights.brakeMat));
    group.add(new THREE.Mesh(mergeNormalized(reverseParts), lights.reverseMat));
    group.add(new THREE.Mesh(mergeNormalized(turnLParts), lights.turnLMat));
    group.add(new THREE.Mesh(mergeNormalized(turnRParts), lights.turnRMat));
    group.add(new THREE.Mesh(mergeNormalized(sideMarkerParts), mats.reflectorRedMat));
    if (detailLevel === 0) group.add(new THREE.Mesh(mergeNormalized(mirrorGlassParts), mats.mirrorGlassMat));

    if (detailLevel === 0) {
        for (const side of [-1, 1]) {
            const bGlow = new THREE.Sprite(lights.brakeGlowMat);
            bGlow.position.set(side * 0.58, 0.77, -2.26);
            bGlow.scale.setScalar(1.0);
            const rGlow = new THREE.Sprite(lights.reverseGlowMat);
            rGlow.position.set(side * 0.40, 0.75, -2.28);
            rGlow.scale.setScalar(0.5);
            const hGlow = new THREE.Sprite(lights.headGlowMat);
            hGlow.position.set(side * 0.62, 0.60, 2.04);
            hGlow.scale.setScalar(0.85);
            group.add(bGlow, rGlow, hGlow);
        }
    }

    return group;
}

/**
 * Articulated 20"/21" 10-spoke forged wheel + cross-drilled bright rotor + prominent yellow 6-piston caliper.
 */
function buildWheelAssembly({ isFront, side, mats }) {
    const outerR = isFront ? FRONT_R : REAR_R;
    const width = isFront ? 0.255 : 0.305;
    const hw = width / 2;
    const rimR = outerR * 0.768; // Sleek ultra-low-profile tire matching photo stance!

    const hubMount = new THREE.Group();
    const xPos = side * (isFront ? FRONT_TRACK : REAR_TRACK);
    hubMount.position.set(xPos, outerR, isFront ? FRONT_Z : REAR_Z);

    const steerPivot = new THREE.Group();
    hubMount.add(steerPivot);

    // Prominent Racing Yellow 6-piston brake caliper (mirroring photo: front caliper rearward -Z, rear caliper forward +Z!)
    const caliperDir = isFront ? -1 : 1;
    const outFaceX = side * (hw - 0.015);
    const calGroup = new THREE.Group();
    const calGeo = new THREE.CapsuleGeometry(0.044, 0.125, 4, 10);
    transformGeo(calGeo, outFaceX - side * 0.056, 0.025, caliperDir * rimR * 0.58, caliperDir * 0.35, 0, 0, 0.85, 1.0, 1.0);
    const calMesh = new THREE.Mesh(calGeo, mats.caliperMat);
    calMesh.castShadow = true;

    const armGeo = new THREE.BoxGeometry(0.24, 0.032, 0.055);
    transformGeo(armGeo, side * -0.14, -0.05, 0);
    const armMesh = new THREE.Mesh(armGeo, mats.matteBlackMat);
    calGroup.add(calMesh, armMesh);
    steerPivot.add(calGroup);

    const spinPivot = new THREE.Group();
    steerPivot.add(spinPivot);

    // 1) Sculpted radial tire tread barrel
    const pts = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const axial = (t - 0.5) * width;
        const edge = Math.abs(t - 0.5) * 2;
        const bulge = edge > 0.78 ? Math.pow((edge - 0.78) / 0.22, 1.8) * 0.011 : Math.sin(edge * Math.PI) * 0.002;
        pts.push(new THREE.Vector2(outerR - bulge, axial));
    }
    const treadGeo = new THREE.LatheGeometry(pts, 32);
    treadGeo.rotateZ(Math.PI / 2);
    const treadMesh = new THREE.Mesh(treadGeo, mats.tireTreadMat);
    treadMesh.castShadow = true;
    treadMesh.receiveShadow = true;

    // 2) Tire sidewalls
    const wallParts = [];
    for (const s of [-1, 1]) {
        const ring = new THREE.RingGeometry(rimR * 0.985, outerR - 0.008, 32, 2);
        ring.rotateY(s > 0 ? Math.PI / 2 : -Math.PI / 2);
        transformGeo(ring, s * (hw - 0.002), 0, 0);
        wallParts.push(ring);
    }
    const wallMesh = new THREE.Mesh(mergeNormalized(wallParts), mats.tireSidewallMat);

    // 3) Slender 10-Spoke (5 split twin-spoke V-pairs) machined diamond-cut rims
    const darkRimParts = [];
    const faceRimParts = [];

    const barrel = new THREE.CylinderGeometry(rimR, rimR, width * 0.9, 28, 1, true);
    barrel.rotateZ(Math.PI / 2);
    darkRimParts.push(barrel);

    // Crisp outer silver machined rim flange
    const lip = new THREE.TorusGeometry(rimR * 0.978, 0.01, 8, 32);
    lip.rotateY(Math.PI / 2);
    transformGeo(lip, outFaceX + side * 0.004, 0, 0);
    faceRimParts.push(lip);

    // 5 twin-spoke pairs (10 slender sharp spokes reaching center hub to outer flange!)
    const hubR = rimR * 0.16;
    const spokeLen = rimR * 0.97 - hubR * 0.7;
    const spokeMid = (rimR * 0.97 + hubR * 0.7) * 0.5;
    for (let pair = 0; pair < 5; pair++) {
        const baseA = (pair / 5) * Math.PI * 2;
        for (const splay of [-0.15, 0.15]) {
            const ang = baseA + splay;
            const cy = Math.cos(ang) * spokeMid;
            const cz = Math.sin(ang) * spokeMid;

            const bodySpoke = new THREE.BoxGeometry(0.016, spokeLen, 0.015);
            transformGeo(bodySpoke, outFaceX - side * 0.008, cy, cz, -ang, 0, side * -0.05);
            darkRimParts.push(bodySpoke);

            const machFace = new THREE.BoxGeometry(0.006, spokeLen, 0.009);
            transformGeo(machFace, outFaceX + side * 0.001, cy, cz, -ang, 0, side * -0.05);
            faceRimParts.push(machFace);
        }
    }

    // Recessed center hub + 5 lug bolts
    const hubCyl = new THREE.CylinderGeometry(rimR * 0.21, rimR * 0.24, 0.036, 18);
    hubCyl.rotateZ(Math.PI / 2);
    transformGeo(hubCyl, outFaceX - side * 0.014, 0, 0);
    darkRimParts.push(hubCyl);

    const capRing = new THREE.TorusGeometry(rimR * 0.145, 0.007, 6, 18);
    capRing.rotateY(Math.PI / 2);
    transformGeo(capRing, outFaceX + side * 0.004, 0, 0);
    faceRimParts.push(capRing);

    for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const lug = new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 6);
        lug.rotateZ(Math.PI / 2);
        transformGeo(lug, outFaceX + side * 0.003, Math.cos(a) * rimR * 0.145, Math.sin(a) * rimR * 0.145);
        faceRimParts.push(lug);
    }

    // Bright silver ventilated cross-drilled brake rotor clearly visible behind slender spokes
    const rotorDisk = new THREE.CylinderGeometry(rimR * 0.84, rimR * 0.84, 0.016, 28);
    rotorDisk.rotateZ(Math.PI / 2);
    transformGeo(rotorDisk, outFaceX - side * 0.068, 0, 0);
    const rotorMesh = new THREE.Mesh(rotorDisk, mats.rotorMat);

    const darkRimMesh = new THREE.Mesh(mergeNormalized(darkRimParts), mats.rimDarkMat);
    const faceRimMesh = new THREE.Mesh(mergeNormalized(faceRimParts), mats.rimFaceMat);

    spinPivot.add(treadMesh, wallMesh, darkRimMesh, faceRimMesh, rotorMesh);

    return {
        hubMount,
        steerPivot,
        spinPivot,
        baseY: outerR,
        radius: outerR,
        isFront,
        side
    };
}

let cachedStaticGeos = null;
function getStaticCarGeos() {
    if (!cachedStaticGeos) {
        cachedStaticGeos = {
            paintGeo: buildPaintBodyParts(),
            soft: buildSoftTopGeo(),
            trim0: buildTrimParts(0),
            trim1: buildTrimParts(1)
        };
    }
    return cachedStaticGeos;
}

/**
 * Instantiate a complete sculpted 3D GT 51 Cabrio with LOD levels, PBR materials,
 * rotating wheels, steering, suspension physics animation, and interactive lights.
 */
export function createGtCabrioCar(paintHex = 0xffd510, { mobile = false } = {}) {
    const mats = getHeroCarSharedAssets({ mobile });
    const paintMat = createCarPaintMaterial(paintHex, { mobile });
    const lights = createDynamicLightMaterials();

    const root = new THREE.Group();
    const chassis = new THREE.Group();
    root.add(chassis);

    const lod = new THREE.LOD();
    chassis.add(lod);

    const { paintGeo, soft, trim0, trim1 } = getStaticCarGeos();
    const cabin0 = buildInteriorAndGlass(mats, soft.innerGeo, 0);
    const optics0 = buildOpticsAndMechanicals(mats, lights, 0);

    // LOD 0 — Showroom & Close Gameplay HD Model
    const lvl0 = new THREE.Group();
    const body0 = new THREE.Mesh(paintGeo, paintMat);
    body0.castShadow = true;
    body0.receiveShadow = true;
    const top0 = new THREE.Mesh(soft.outerGeo, mats.softTopMat);
    top0.castShadow = true;
    lvl0.add(
        body0,
        top0,
        new THREE.Mesh(trim0.glossGeo, mats.glossBlackMat),
        new THREE.Mesh(trim0.matteGeo, mats.matteBlackMat),
        new THREE.Mesh(trim0.archGeo, mats.archLinerMat),
        cabin0.group,
        optics0
    );
    lod.addLevel(lvl0, 0);

    // LOD 1 — Medium Distance
    const cabin1 = buildInteriorAndGlass(mats, soft.innerGeo, 1);
    const optics1 = buildOpticsAndMechanicals(mats, lights, 1);
    const lvl1 = new THREE.Group();
    const body1 = new THREE.Mesh(paintGeo, paintMat);
    body1.castShadow = true;
    lvl1.add(
        body1,
        new THREE.Mesh(soft.outerGeo, mats.softTopMat),
        new THREE.Mesh(trim1.glossGeo, mats.glossBlackMat),
        new THREE.Mesh(trim1.matteGeo, mats.matteBlackMat),
        new THREE.Mesh(trim1.archGeo, mats.archLinerMat),
        cabin1.group,
        optics1
    );
    lod.addLevel(lvl1, 34);

    // LOD 2 — Far Distance Lightweight Silhouette
    const lvl2 = new THREE.Group();
    const body2 = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.56, 4.44), paintMat);
    body2.position.y = 0.56;
    const top2 = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.34, 1.38), mats.softTopMat);
    top2.position.set(0, 1.06, -0.58);
    lvl2.add(body2, top2);
    lod.addLevel(lvl2, 82);

    const wheels = [
        buildWheelAssembly({ isFront: true, side: 1, mats }),
        buildWheelAssembly({ isFront: true, side: -1, mats }),
        buildWheelAssembly({ isFront: false, side: 1, mats }),
        buildWheelAssembly({ isFront: false, side: -1, mats })
    ];
    for (const w of wheels) root.add(w.hubMount);

    let spinAngle = 0;
    let steerAngle = 0;
    let bodyPitch = 0;
    let bodyRoll = 0;
    let bodyHeave = 0;
    let lightKey = '';
    const steeringWheel = cabin0.steeringWheel;

    function applyLights(braking, reversing, turnLeft, turnRight, dusk, time, showroom) {
        const blinkOn = (Math.floor(time * 4.2) & 1) === 0;
        const lOn = turnLeft && blinkOn;
        const rOn = turnRight && blinkOn;
        const key = `${braking ? 1 : 0}${reversing ? 1 : 0}${lOn ? 1 : 0}${rOn ? 1 : 0}${dusk ? 1 : 0}${showroom ? 1 : 0}`;
        if (key === lightKey) return;
        lightKey = key;

        lights.drlMat.color.setHex(0xffffff);
        lights.lowBeamMat.color.setHex(dusk || showroom ? 0xf2f7ff : 0xc8d8ef);
        lights.headGlowMat.opacity = showroom ? 0.16 : dusk ? 0.42 : 0.12;
        lights.tailRunMat.color.setHex(braking ? 0xff2228 : 0xd9141c);
        lights.brakeMat.color.setHex(braking ? 0xff1e24 : 0x5c080c);
        lights.brakeGlowMat.opacity = braking ? 0.9 : 0;
        lights.reverseMat.color.setHex(reversing ? 0xffffff : 0x3b3d42);
        lights.reverseGlowMat.opacity = reversing ? 0.72 : 0;
        lights.turnLMat.color.setHex(lOn ? 0xffa614 : 0x2c1b06);
        lights.turnRMat.color.setHex(rOn ? 0xffa614 : 0x2c1b06);
    }

    function animate(dt, state = {}) {
        const safeDt = Math.max(0.001, Math.min(0.05, dt || 0.016));
        const speedMps = Number(state.speed) || 0;
        const steerInput = Number(state.steer) || 0;
        const throttle = Number(state.throttle) || 0;
        const braking = !!state.braking;
        const reversing = !!state.reversing;
        const bump = Number(state.bump) || 0;
        const time = Number(state.time) || 0;
        const showroom = !!state.showroom;

        spinAngle += (speedMps * safeDt) / FRONT_R;
        const smoothSteer = showroom ? 0.24 : steerInput * 0.42;
        steerAngle += (smoothSteer - steerAngle) * Math.min(1, safeDt * 14);

        const targetPitch = showroom ? 0 : (braking ? 0.026 : -throttle * 0.021);
        const targetRoll = showroom ? 0 : steerAngle * Math.min(1, Math.abs(speedMps) / 14) * 0.065;
        const roadVibration = showroom ? 0 : Math.sin(time * 24) * Math.min(0.005, Math.abs(speedMps) * 0.00025);
        const targetHeave = roadVibration + bump * 0.028;

        bodyPitch += (targetPitch - bodyPitch) * Math.min(1, safeDt * 9);
        bodyRoll += (targetRoll - bodyRoll) * Math.min(1, safeDt * 10);
        bodyHeave += (targetHeave - bodyHeave) * Math.min(1, safeDt * 14);

        chassis.rotation.set(bodyPitch, 0, bodyRoll);
        chassis.position.y = bodyHeave;

        for (const w of wheels) {
            w.spinPivot.rotation.x = spinAngle * (FRONT_R / w.radius);
            if (w.isFront) w.steerPivot.rotation.y = steerAngle;
            const sideShift = w.side * bodyRoll * 0.42;
            const endShift = (w.isFront ? 1 : -1) * bodyPitch * 0.6;
            const wheelBump = bump * (w.isFront ? 0.025 : 0.018);
            w.hubMount.position.y = Math.max(w.radius - 0.035, Math.min(w.radius + 0.04, w.baseY - sideShift - endShift + wheelBump));
        }

        if (steeringWheel) steeringWheel.rotation.z = -steerAngle * 2.1;

        applyLights(braking, reversing, !!state.turningLeft, !!state.turningRight, !!state.dusk, time, showroom);
    }

    root.userData.model = 'gt-cabrio-5hc';
    root.userData.length = CAR_LEN;
    root.userData.width = 1.94;
    root.userData.height = 1.29;
    root.userData.paintMaterial = paintMat;
    root.userData.wheels = wheels;
    root.userData.chassis = chassis;
    root.userData.lod = lod;
    root.userData.setPaint = (hex) => {
        if (hex !== undefined && hex !== null) paintMat.color.set(hex);
    };
    root.userData.lights = {
        set(braking, reversing) {
            applyLights(!!braking, !!reversing, false, false, false, 0, false);
        },
        get braking() { return lightKey[0] === '1'; },
        get reversing() { return lightKey[1] === '1'; }
    };
    root.userData.animate = animate;

    animate(0.016, { showroom: true, time: 0 });
    return root;
}
