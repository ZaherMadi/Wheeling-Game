// Street furniture and ground for the realistic version: pavements with
// granite kerbs, parking bays with parked cars, crossings, side streets,
// lamps, traffic lights, signs, benches, bins, bollards, shelters,
// advertising, café terraces, and the decals painted on the tarmac.
//
// Authored for the right side of a 100 m block in street coordinates (x out
// from the road centre, z along the road, the rider travels towards -z);
// the left side is the same code under a half-turn base matrix.
import * as THREE from 'three';
import { PRIMS, transform } from './geometry.js';
import { PAVING_SCALE } from './cityatlas.js';
import { CAR_PAINTS, addCar } from './cars.js';

export const ROAD_HALF = 10;
export const KERB = 0.15;
export const LAYBY_EDGE = 12.4;
export const FACADE_LINE = 20;
// Ground offset of a shadow per metre of height, right side of the street.
// The sun light in world.js comes from the matching direction.
export const SHADOW_PER_METRE = { x: -0.25, z: 2.2 };

const IRON = 0x1d2026;
const STEEL = 0x8f959c;
const WARM = 0xffb565;
const v = (x, y, z) => ({ x, y, z });

export function createStreetKit({ random, atlases, vegetation, cars }) {
    const range = (min, max) => min + random() * (max - min);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const chance = (p) => random() < p;
    const { prints, decals } = atlases;
    const carModels = Object.values(cars);

    // Pavement and kerb ------------------------------------------------------
    function paving(sink, x0, z0, x1, z1, tint = 0xffffff) {
        const s = PAVING_SCALE;
        sink.both.sidewalk.floor(x0, z0, x1, z1, KERB, tint, [x0 / s, -z1 / s, x1 / s, -z0 / s]);
    }

    // Granite kerb along z at x (face looking towards -x, the road).
    function kerbZ(sink, x, z0, z1) {
        if (z1 - z0 < 0.01) return;
        sink.both.stone.block(x, 0, z0, x + 0.3, KERB, z1, 0xa9acb2, 2, 'xY');
    }

    // Kerb along x at z, face looking towards `facing` (+1: +z).
    function kerbX(sink, z, x0, x1, facing) {
        const z0 = facing > 0 ? z - 0.3 : z;
        const z1 = facing > 0 ? z : z + 0.3;
        sink.both.stone.block(x0, 0, z0, x1, KERB, z1, 0xa9acb2, 2, facing > 0 ? 'Z' : 'z');
    }

    function asphalt(sink, x0, z0, x1, z1) {
        // Clean asphalt between the lane lines of the road texture.
        const u0 = 0.29;
        const u1 = 0.46;
        sink.both.road.floor(x0, z0, x1, z1, 0.002, 0xffffff, [u0, -z1 / 50, u1, -z0 / 50]);
    }

    // Decals -------------------------------------------------------------------
    // The cell's v axis runs along z (towards -z = up), or along x with alongX.
    function decal(sink, cell, x0, z0, x1, z1, tint = 0xffffff, y = 0.012, alongX = false) {
        const uv = decals[cell];
        if (!alongX) {
            sink.hi.decal.floor(x0, z0, x1, z1, y, tint, uv);
            return;
        }
        sink.hi.decal.quad(v(x0, y, z0), v(x0, y, z1), v(x1, y, z1), v(x1, y, z0), tint, uv);
    }

    // Where the pavement starts at the current spot (kerb face + kerb).
    let edge = ROAD_HALF + 0.3;
    function setEdge(value) {
        edge = value;
    }
    let lightX = SHADOW_PER_METRE.x;
    let lightZ = SHADOW_PER_METRE.z;
    // +1 on the right side: local +z then points towards the camera.
    let towardsCamera = 1;
    function setSide(side) {
        towardsCamera = side;
        lightX = SHADOW_PER_METRE.x * side;
        lightZ = SHADOW_PER_METRE.z * side;
    }

    // Shadow of a box (footprint x +- hx, z +- hz, from height h0 to h1).
    function castShade(sink, cell, x, z, hx, hz, h0, h1, strength = 1) {
        const sx = [lightX * h0, lightX * h1];
        const sz = [lightZ * h0, lightZ * h1];
        shade(sink, cell, x - hx + Math.min(...sx), z - hz + Math.min(...sz), x + hx + Math.max(...sx), z + hz + Math.max(...sz), 0, strength);
    }

    // Shadow on the ground, split at the kerb (road level / pavement). The
    // strength goes in the red channel: the shade material reads it as alpha.
    function shade(sink, cell, x0, z0, x1, z1, edgeOverride, strength = 1) {
        const split = edge;
        void edgeOverride;
        const uv = decals[cell];
        const tint = new THREE.Color(strength, strength, strength).getHex();
        if (z1 < z0) [z0, z1] = [z1, z0];
        const lerpU = (x) => uv[0] + (uv[2] - uv[0]) * (x - x0) / (x1 - x0);
        if (x1 > split) {
            const a = Math.max(x0, split);
            sink.both.shade.floor(a, z0, x1, z1, KERB + 0.008, tint, [lerpU(a), uv[1], uv[2], uv[3]]);
        }
        if (x0 < split) {
            const b = Math.min(x1, split);
            sink.both.shade.floor(x0, z0, b, z1, 0.008, tint, [uv[0], uv[1], lerpU(b), uv[3]]);
        }
    }

    // Lamps ---------------------------------------------------------------------
    function lamp(sink, x, z, style, light) {
        const hi = sink.hi.props;
        const lo = sink.lo.props;
        if (style === 'classic') {
            const top = 4.6;
            hi.add(PRIMS.cylinder, transform(x, KERB + 0.35, z, 0.22, 0.7, 0.22), IRON);
            hi.add(PRIMS.cylinder, transform(x, KERB + 0.78, z, 0.15, 0.2, 0.15), IRON);
            hi.tube([v(x, KERB + 0.8, z), v(x, top - 0.4, z)], [0.09, 0.06], IRON, 8);
            hi.add(PRIMS.cylinder, transform(x, top - 0.35, z, 0.13, 0.1, 0.13), IRON);
            hi.add(PRIMS.taper, transform(x, top + 0.25, z, 0.3, 0.8, 0.3, Math.PI, 0, 0), 0x232529);
            sink.hi.emissive.add(PRIMS.taper, transform(x, top + 0.2, z, 0.25, 0.62, 0.25, Math.PI, 0, 0), 0xffe2a8);
            hi.add(PRIMS.cone, transform(x, top + 0.8, z, 0.42, 0.35, 0.42), 0x232529);
            hi.add(PRIMS.spike, transform(x, top + 1.08, z, 0.05, 0.22, 0.05), 0x232529);
            lo.add(PRIMS.box, transform(x, KERB + top / 2, z, 0.14, top, 0.14), IRON);
            sink.lo.emissive.add(PRIMS.box, transform(x, top + 0.25, z, 0.45, 0.6, 0.45), 0xffe2a8);
            if (light) {
                sink.both.glow.wallX(x - 1.2, top - 0.95, x + 1.2, top + 1.45, z + 0.05, 1, WARM, [0.02, 0.02, 0.98, 0.98]);
                sink.both.glow.floor(x - 3.5, z - 3.5, x + 3.5, z + 3.5, KERB + 0.03, WARM, [0.05, 0.05, 0.95, 0.95]);
            }
            return;
        }
        const top = 8;
        const reach = 2.3;
        const head = x - reach;
        hi.add(PRIMS.cylinder, transform(x, KERB + 0.3, z, 0.17, 0.6, 0.17), 0x2a2d33);
        hi.tube([v(x, KERB + 0.6, z), v(x, top - 0.3, z)], [0.1, 0.065], 0x2a2d33, 8);
        hi.tube([v(x, top - 0.6, z), v(x - 0.15, top, z), v(x - 0.6, top + 0.22, z), v(head + 0.35, top + 0.22, z)], [0.06, 0.055, 0.05, 0.045], 0x2a2d33, 6);
        hi.add(PRIMS.box, transform(head, top + 0.18, z, 0.95, 0.12, 0.36, 0, 0, 0.05), 0x30343b);
        sink.hi.emissive.add(PRIMS.box, transform(head, top + 0.1, z, 0.78, 0.03, 0.26), 0xfff0cf);
        lo.add(PRIMS.box, transform(x, KERB + top / 2, z, 0.16, top, 0.16), 0x2a2d33);
        lo.add(PRIMS.box, transform((x + head) / 2, top + 0.2, z, reach, 0.12, 0.2), 0x2a2d33);
        sink.lo.emissive.add(PRIMS.box, transform(head, top + 0.1, z, 0.78, 0.05, 0.26), 0xfff0cf);
        if (light) {
            sink.both.glow.wallX(head - 1.7, top - 1.6, head + 1.7, top + 1.8, z + 0.05, 1, WARM, [0.02, 0.02, 0.98, 0.98]);
            sink.both.glow.floor(head - 4.5, z - 4.5, head + 4.5, z + 4.5, 0.03, WARM, [0.05, 0.05, 0.95, 0.95]);
            // Light smeared on the wet tarmac towards the rider.
            const far = z + towardsCamera * 26;
            sink.both.glow.floor(head - 1.2, Math.min(z, far), head + 1.2, Math.max(z, far), 0.035, 0x7a5a32, [0.2, 0.3, 0.8, 0.7]);
        }
    }

    // Small furniture -----------------------------------------------------------
    function bench(sink, x, z) {
        const props = sink.hi.props;
        const wood = 0x7a4a2a;
        for (let i = 0; i < 3; i++) props.block(x - 0.2 + i * 0.16, KERB + 0.44, z - 0.95, x - 0.08 + i * 0.16, KERB + 0.48, z + 0.95, wood);
        for (let i = 0; i < 2; i++) props.block(x + 0.3, KERB + 0.62 + i * 0.17, z - 0.95, x + 0.34, KERB + 0.74 + i * 0.17, z + 0.95, wood);
        for (const dz of [-0.82, 0.82]) {
            props.block(x - 0.25, KERB, dz + z - 0.03, x + 0.3, KERB + 0.44, dz + z + 0.03, 0x1c1e22);
            props.block(x + 0.27, KERB + 0.44, dz + z - 0.03, x + 0.33, KERB + 0.95, dz + z + 0.03, 0x1c1e22);
            props.block(x - 0.25, KERB + 0.62, dz + z - 0.03, x + 0.3, KERB + 0.66, dz + z + 0.03, 0x1c1e22);
        }
        sink.lo.props.block(x - 0.25, KERB, z - 0.95, x + 0.3, KERB + 0.9, z + 0.95, 0x4a3426);
    }

    function bin(sink, x, z) {
        sink.hi.props.add(PRIMS.cylinder, transform(x, KERB + 0.45, z, 0.26, 0.9, 0.26), 0x2b4a3a);
        sink.hi.props.add(PRIMS.cylinder, transform(x, KERB + 0.92, z, 0.29, 0.06, 0.29), 0x1c2a22);
        sink.hi.props.add(PRIMS.cylinder, transform(x, KERB + 0.6, z, 0.27, 0.05, 0.27), 0x9aa0a6);
    }

    function bollards(sink, x, z0, count, gap = 1.6) {
        for (let i = 0; i < count; i++) {
            const z = z0 + i * gap;
            sink.hi.props.add(PRIMS.cylinder, transform(x, KERB + 0.45, z, 0.07, 0.9, 0.07), 0x3a2a22);
            sink.hi.props.add(PRIMS.cylinder, transform(x, KERB + 0.82, z, 0.075, 0.06, 0.075), 0xd8dadf);
            sink.hi.props.add(PRIMS.spike, transform(x, KERB + 0.95, z, 0.07, 0.1, 0.07), 0x3a2a22);
        }
    }

    function hydrant(sink, x, z) {
        sink.hi.props.add(PRIMS.cylinder, transform(x, KERB + 0.35, z, 0.12, 0.7, 0.12), 0xc8282a);
        sink.hi.props.add(PRIMS.cylinder, transform(x, KERB + 0.74, z, 0.08, 0.1, 0.08), 0xc8282a);
        sink.hi.props.add(PRIMS.cylinder6, transform(x, KERB + 0.45, z, 0.045, 0.32, 0.045, 0, 0, Math.PI / 2), 0xb02022);
    }

    function bikeRack(sink, x, z) {
        for (let i = 0; i < 3; i++) {
            const zc = z + (i - 1) * 0.8;
            const points = [];
            for (let k = 0; k <= 6; k++) {
                const a = (k / 6) * Math.PI;
                points.push(v(x + Math.cos(a) * 0.35, KERB + 0.1 + Math.sin(a) * 0.75, zc));
            }
            points[0].y = KERB;
            points[6].y = KERB;
            sink.hi.props.tube(points, points.map(() => 0.025), STEEL, 5);
        }
    }

    // Sign on a pole, its face looking towards +z (the oncoming rider).
    function poleSign(sink, x, z, cells, height = 2.6) {
        sink.hi.props.tube([v(x, KERB, z), v(x, KERB + height + 0.35 * cells.length, z)], [0.035, 0.035], STEEL, 6);
        cells.forEach((cell, i) => {
            const y = KERB + height + i * 0.62;
            sink.hi.print.wallX(x - 0.3, y - 0.3, x + 0.3, y + 0.3, z + 0.045, 1, 0xffffff, prints[cell]);
            sink.hi.props.block(x - 0.29, y - 0.29, z + 0.02, x + 0.29, y + 0.29, z + 0.04, 0x9aa0a6, 1, 'z');
        });
        sink.lo.props.block(x - 0.04, KERB, z - 0.04, x + 0.04, KERB + height, z + 0.04, STEEL);
    }

    function trafficLight(sink, x, z, facing = 1) {
        const props = sink.hi.props;
        props.tube([v(x, KERB, z), v(x, KERB + 3.4, z)], [0.07, 0.06], 0x2a2d33, 6);
        props.block(x - 0.2, KERB + 2.35, z - 0.14, x + 0.2, KERB + 3.45, z + 0.14, 0x1b1d21);
        const front = z + facing * 0.145;
        const lamps = [[0xff2a1f, 3.25], [0x4a3a10, 2.9], [0x0e3a1a, 2.55]];
        for (const [color, y] of lamps) {
            const batch = color === 0xff2a1f ? sink.hi.emissive : props;
            batch.add(PRIMS.cylinder, transform(x, KERB + y, front, 0.12, 0.02, 0.12, Math.PI / 2, 0, 0), color);
            props.block(x - 0.15, KERB + y + 0.1, front - (facing > 0 ? 0 : 0.18), x + 0.15, KERB + y + 0.13, front + (facing > 0 ? 0.18 : 0), 0x1b1d21);
        }
        sink.both.glow.wallX(x - 0.7, KERB + 2.55, x + 0.7, KERB + 3.95, front + facing * 0.05, facing, 0xff3a2a, [0.05, 0.05, 0.95, 0.95]);
        // Pedestrian signal lower down.
        props.block(x - 0.14, KERB + 1.9, z - 0.1, x + 0.14, KERB + 2.25, z + 0.1, 0x1b1d21);
        sink.hi.emissive.block(x - 0.09, KERB + 1.95, front - 0.02 * facing, x + 0.09, KERB + 2.07, front + 0.005 * facing, 0x5aff8a);
        sink.lo.props.block(x - 0.06, KERB, z - 0.06, x + 0.06, KERB + 3.4, z + 0.06, 0x2a2d33);
        sink.lo.emissive.block(x - 0.12, KERB + 3.1, z - 0.15, x + 0.12, KERB + 3.4, z + 0.15, 0xff2a1f);
    }

    function busShelter(sink, x, z) {
        const frame = 0x2b2e34;
        const props = sink.hi.props;
        const top = KERB + 2.55;
        props.block(x - 0.85, top, z - 2.2, x + 0.85, top + 0.12, z + 2.2, frame);
        for (const dz of [-2.1, 2.1]) props.block(x + 0.7, KERB, z + dz - 0.05, x + 0.8, top, z + dz + 0.05, frame);
        sink.hi.glass.wallZ(z - 2.1, KERB + 0.1, z + 2.1, top - 0.05, x + 0.76, -1, 0xd8e4ea);
        sink.hi.glass.wallX(x - 0.6, KERB + 0.1, x + 0.75, top - 0.05, z - 2.1, -1, 0xd8e4ea);
        props.block(x + 0.25, KERB + 0.45, z - 1.4, x + 0.65, KERB + 0.5, z + 1.0, 0x4b4f57);
        // Lit advertising panel at the end facing the rider.
        props.block(x - 0.75, KERB + 0.2, z + 2.0, x + 0.75, KERB + 2.4, z + 2.18, frame);
        sink.both.printLit.wallX(x - 0.62, KERB + 0.35, x + 0.62, KERB + 2.25, z + 2.19, 1, 0xffffff, pick(prints.posters));
        sink.both.glow.wallX(x - 1.8, KERB - 0.6, x + 1.8, KERB + 3.2, z + 2.25, 1, 0xcfe0ff, [0.1, 0.1, 0.9, 0.9]);
        sink.lo.props.block(x - 0.85, KERB, z - 2.2, x + 0.85, top + 0.12, z + 2.2, 0x6a7a88);
        castShade(sink, 'box', x, z, 0.85, 2.2, 0.4, 2.6, 0.75);
        poleSign(sink, ROAD_HALF + 0.55, z - 3, ['busStop']);
    }

    function mupi(sink, x, z) {
        sink.hi.props.block(x - 0.12, KERB, z - 0.3, x + 0.12, KERB + 0.3, z + 0.3, 0x2b2e34);
        sink.hi.props.block(x - 0.08, KERB + 0.3, z - 0.68, x + 0.08, KERB + 2.35, z + 0.68, 0x2b2e34);
        sink.both.printLit.wallZ(z - 0.6, KERB + 0.42, z + 0.6, KERB + 2.24, x - 0.09, -1, 0xffffff, pick(prints.posters));
        sink.both.printLit.wallZ(z - 0.6, KERB + 0.42, z + 0.6, KERB + 2.24, x + 0.09, 1, 0xffffff, pick(prints.posters));
    }

    function adColumn(sink, x, z) {
        const props = sink.hi.props;
        props.add(PRIMS.cylinder, transform(x, KERB + 0.15, z, 0.7, 0.3, 0.7), 0x26402e);
        props.add(PRIMS.cylinder, transform(x, KERB + 1.75, z, 0.6, 3.0, 0.6), 0x26402e);
        props.add(PRIMS.cylinder, transform(x, KERB + 3.3, z, 0.7, 0.15, 0.7), 0x26402e);
        props.add(PRIMS.cone, transform(x, KERB + 3.65, z, 0.55, 0.55, 0.55), 0x2f4f3a);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const px = x + Math.cos(a) * 0.61;
            const pz = z + Math.sin(a) * 0.61;
            const cell = pick(prints.posters);
            // Poster facing outwards.
            const nx = Math.cos(a);
            const nz = Math.sin(a);
            const tx = -nz * 0.31;
            const tz = nx * 0.31;
            sink.hi.print.quad(v(px + tx, KERB + 0.6, pz + tz), v(px - tx, KERB + 0.6, pz - tz), v(px - tx, KERB + 2.95, pz - tz),
                v(px + tx, KERB + 2.95, pz + tz), 0xffffff, cell);
        }
        sink.lo.props.add(PRIMS.cylinder6, transform(x, KERB + 1.9, z, 0.62, 3.6, 0.62), 0x3a5040);
    }

    function planter(sink, x, z, length) {
        const props = sink.both.props;
        props.block(x - 0.5, KERB, z - length / 2, x + 0.5, KERB + 0.62, z + length / 2, 0x6d7078);
        sink.hi.props.block(x - 0.43, KERB + 0.6, z - length / 2 + 0.07, x + 0.43, KERB + 0.64, z + length / 2 - 0.07, 0x2b2118);
        const foliage = sink.hi.foliage;
        if (chance(0.5)) {
            vegetation.addHedge(foliage, x, z - length / 2 + 0.2, x, z + length / 2 - 0.2, KERB + 0.6, 0.85, 0.85);
        } else {
            for (let dz = -length / 2 + 0.5; dz <= length / 2 - 0.4; dz += 0.75) {
                if (chance(0.45)) vegetation.addShrub(foliage, x, KERB + 0.6, z + dz, 0.9, 0.9, 0.9);
                else vegetation.addTuft(foliage, x + range(-0.15, 0.15), KERB + 0.62, z + dz, 0.8, range(0.9, 1.5));
            }
        }
        sink.lo.foliage.add(PRIMS.box, transform(x, KERB + 1.0, z, 0.9, 0.7, length - 0.2), 0x3f7f2c, null, [0.1, 0.6, 0.4, 0.9]);
    }

    function cafeTerrace(sink, z0, z1, facade) {
        const props = sink.hi.props;
        const x0 = facade - 3.4;
        const tables = Math.max(1, Math.floor((z1 - z0) / 1.8));
        const step = (z1 - z0) / tables;
        const parasol = chance(0.5) ? prints.parasol : prints.parasolGreen;
        for (let i = 0; i < tables; i++) {
            const z = z0 + (i + 0.5) * step;
            for (const x of [x0 + 0.7, x0 + 2.2]) {
                if (chance(0.15)) continue;
                props.add(PRIMS.cylinder, transform(x, KERB + 0.74, z, 0.34, 0.03, 0.34), 0x2b2e33);
                props.add(PRIMS.cylinder6, transform(x, KERB + 0.37, z, 0.03, 0.74, 0.03), 0x2b2e33);
                props.add(PRIMS.cylinder6, transform(x, KERB + 0.02, z, 0.22, 0.04, 0.22), 0x2b2e33);
                for (const side of [-1, 1]) {
                    if (chance(0.2)) continue;
                    const cz = z + side * 0.55;
                    const color = pick([0x7a4a2a, 0x2b2e33, 0xb8b2a6]);
                    props.block(x - 0.2, KERB + 0.44, cz - 0.2, x + 0.2, KERB + 0.48, cz + 0.2, color);
                    props.block(x - 0.2, KERB + 0.48, cz + side * 0.17, x + 0.2, KERB + 0.88, cz + side * 0.2, color);
                    for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
                        props.block(x + dx - 0.015, KERB, cz + dz - 0.015, x + dx + 0.015, KERB + 0.44, cz + dz + 0.015, 0x2b2e33);
                    }
                }
            }
            if (i % 2 === 0) {
                // Square parasol: four sloped panels.
                const px = x0 + 1.45;
                const top = KERB + 2.55;
                const edge = KERB + 2.1;
                const r = 1.25;
                props.tube([v(px, KERB, z), v(px, top + 0.1, z)], [0.03, 0.03], 0xd8d2c4, 5);
                const corners = [v(px - r, edge, z - r), v(px + r, edge, z - r), v(px + r, edge, z + r), v(px - r, edge, z + r)];
                for (let k = 0; k < 4; k++) {
                    const a = corners[k];
                    const b = corners[(k + 1) % 4];
                    sink.hi.print.quad(a, b, v(px, top, z), v(px, top, z), 0xffffff, parasol);
                }
                castShade(sink, 'blob', px, z, 1.1, 1.1, 2.1, 2.6, 0.7);
            }
        }
        // Glass windbreak and a menu board.
        sink.hi.glass.wallZ(z0, KERB, z1, KERB + 1.2, x0 - 0.1, -1, 0xe0e8ec);
        props.block(x0 - 0.14, KERB, z0, x0 - 0.06, KERB + 0.12, z1, 0x2b2e33);
        const mz = z0 - 0.6;
        sink.hi.print.quad(v(x0 - 0.3, KERB, mz - 0.3), v(x0 - 0.3, KERB, mz + 0.3), v(x0, KERB + 1.0, mz + 0.3), v(x0, KERB + 1.0, mz - 0.3), 0xffffff, prints.menu);
        sink.lo.props.block(x0, KERB, z0, facade - 0.3, KERB + 1.0, z1, 0x5a5048);
    }

    // Trees in pits with their long evening shadow.
    function streetTree(sink, x, z, species, shadow) {
        const seed = Math.floor(random() * 1e9);
        const grown = vegetation.addTree(sink.hi.foliage, x, KERB, z, species, { seed });
        // Distant version: same skeleton, fewer and larger leaf cards.
        vegetation.addTree(sink.lo.foliage, x, KERB, z, species, { seed, density: 0.45, cardScale: 1.3 });
        const pit = 1.2;
        const props = sink.hi.props;
        props.block(x - pit, KERB - 0.02, z - pit, x + pit, KERB + 0.012, z + pit, 0x2b2118, 1, 'Y');
        props.block(x - pit - 0.1, KERB, z - pit - 0.1, x + pit + 0.1, KERB + 0.035, z - pit, 0x9a9da4, 1, 'Yz');
        props.block(x - pit - 0.1, KERB, z + pit, x + pit + 0.1, KERB + 0.035, z + pit + 0.1, 0x9a9da4, 1, 'YZ');
        for (let i = -3; i <= 3; i++) {
            if (i === 0) continue;
            props.block(x + i * 0.32 - 0.035, KERB, z - pit + 0.05, x + i * 0.32 + 0.035, KERB + 0.025, z + pit - 0.05, 0x1b1d21, 1, 'xXY');
        }
        shadow(grown);
    }

    return {
        paving, kerbZ, kerbX, asphalt, decal, shade, castShade, setEdge, setSide, lamp, bench, bin, bollards, hydrant, bikeRack, poleSign,
        trafficLight, busShelter, mupi, adColumn, planter, cafeTerrace, streetTree,
        parkedCar(sink, x, z) {
            const model = pick(carModels);
            const yaw = chance(0.85) ? Math.PI : 0;
            addCar(sink, model, x, z, yaw + range(-0.02, 0.02), pick(CAR_PAINTS));
            castShade(sink, 'box', x, z, 0.95, model.length / 2, 0, model.height * 0.8, 0.9);
            return model.length;
        }
    };
}
