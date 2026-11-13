// Building facades for the realistic version, authored as real geometry:
// window openings with reveals, frames, sills, shutters and railings,
// balconies, cornices, mansard roofs and dormers, curtain walls with fins,
// and shop fronts with recessed windows, doors, awnings and lit signs.
//
// Everything is written in the canonical facade frame (see geometry.js):
// facade plane x = 0 looking towards -x, running along +z from 0 to width,
// building body towards +x. sink.both holds what the distant version keeps.
import { PRIMS, transform } from './geometry.js';
import { CURTAIN_TILE, WALL_SCALE } from './cityatlas.js';

export const GROUND_FLOOR = 4.4;

const STONE_TINTS = [0xf1e6d0, 0xece0c8, 0xe6d8bf, 0xf4ecdc, 0xe9dcc4, 0xddd0b8];
const RENDER_TINTS = [0xf2efe8, 0xefe3cd, 0xe9cdb0, 0xd9a98a, 0xf0dca8, 0xcfd9df, 0xe6e6e2, 0xc9b8a4, 0xb9c8b4];
const BRICK_TINTS = [0xffffff, 0xe6d6cc, 0xc4b2a8, 0xf2e2d2];
const FRAME_WHITE = 0xecebe6;
const FRAME_DARK = 0x34383e;
const SHUTTER_TINTS = [0x5e7d6a, 0x7c95a8, 0xefeee8, 0x8c5a3c, 0x4f6b8a, 0x9aa38f];

export function createBuildingKit({ random, atlases }) {
    const range = (min, max) => min + random() * (max - min);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const chance = (p) => random() < p;
    const { windows, shops, signs, prints } = atlases;

    // --- Openings -----------------------------------------------------------
    // Wall with a regular grid of openings: bands above and below each row,
    // piers between openings. Planar UVs keep the finish continuous.
    function wallWithOpenings(batch, wallKey, tint, width, y0, y1, rows, skin = 0) {
        const s = WALL_SCALE[wallKey];
        const quad = (z0, ya, z1, yb) => {
            if (z1 - z0 < 0.01 || yb - ya < 0.01) return;
            batch.wallZ(z0, ya, z1, yb, skin, -1, tint, [z0 / s, ya / s, z1 / s, yb / s]);
        };
        let cursor = y0;
        for (const row of rows) {
            quad(0, cursor, width, row.bottom);
            let z = 0;
            for (const opening of row.openings) {
                quad(z, row.bottom, opening.z0, row.top);
                z = opening.z1;
            }
            quad(z, row.bottom, width, row.top);
            cursor = row.top;
        }
        quad(0, cursor, width, y1);
    }

    function reveals(batch, wallKey, tint, o, depth) {
        const s = WALL_SCALE[wallKey];
        batch.wallX(0, o.y0, depth, o.y1, o.z0, 1, tint, [0, o.y0 / s, depth / s, o.y1 / s]);
        batch.wallX(0, o.y0, depth, o.y1, o.z1, -1, tint, [0, o.y0 / s, depth / s, o.y1 / s]);
        batch.ceil(0, o.z0, depth, o.z1, o.y1, tint, [0, o.z0 / s, depth / s, o.z1 / s]);
        batch.floor(0, o.z0, depth, o.z1, o.y0, tint, [0, o.z0 / s, depth / s, o.z1 / s]);
    }

    function windowCell() {
        return chance(0.36) ? pick(windows.lit) : pick(windows.dark);
    }

    // A glazed opening: glass, frame with mullion and transom, optional sill.
    function windowUnit(sink, wallKey, tint, o, options) {
        const { depth = 0.22, frame = FRAME_WHITE, mullion = true, transom = true, sill = true, glassTint = 0xffffff } = options;
        const cell = windowCell();
        reveals(sink.hi[wallKey], wallKey, tint, o, depth);
        sink.hi.window.wallZ(o.z0, o.y0, o.z1, o.y1, depth, -1, glassTint, cell);
        // Distant version: glass set into the wall plane.
        sink.lo.window.wallZ(o.z0, o.y0, o.z1, o.y1, -0.04, -1, glassTint, cell);
        const props = sink.hi.props;
        const t = 0.065;
        const x = depth - 0.015;
        props.wallZ(o.z0, o.y0, o.z0 + t, o.y1, x, -1, frame);
        props.wallZ(o.z1 - t, o.y0, o.z1, o.y1, x, -1, frame);
        props.wallZ(o.z0, o.y1 - t, o.z1, o.y1, x, -1, frame);
        props.wallZ(o.z0, o.y0, o.z1, o.y0 + t * 1.3, x, -1, frame);
        if (mullion && o.z1 - o.z0 > 0.9) {
            const c = (o.z0 + o.z1) / 2;
            props.wallZ(c - t / 2, o.y0, c + t / 2, o.y1, x - 0.01, -1, frame);
        }
        if (transom && o.y1 - o.y0 > 1.7) {
            const y = o.y0 + (o.y1 - o.y0) * 0.74;
            props.wallZ(o.z0, y - t / 2, o.z1, y + t / 2, x - 0.012, -1, frame);
        }
        if (sill) {
            sink.hi[wallKey].block(-0.07, o.y0 - 0.07, o.z0 - 0.07, 0, o.y0, o.z1 + 0.07, tint, WALL_SCALE[wallKey], 'xyYzZ');
        }
    }

    // Railing printed on quads of about `segment` metres (atlas cells cannot tile).
    function railing(batch, cell, z0, z1, y0, y1, x, segment = 2.4) {
        const count = Math.max(1, Math.round((z1 - z0) / segment));
        const step = (z1 - z0) / count;
        for (let i = 0; i < count; i++) batch.wallZ(z0 + i * step, y0, z0 + (i + 1) * step, y1, x, -1, 0xffffff, cell);
    }

    function shutters(sink, o, color) {
        const cell = prints.shutter;
        const w = (o.z1 - o.z0) / 2;
        const print = sink.hi.print;
        print.wallZ(o.z0 - w, o.y0, o.z0, o.y1, -0.045, -1, color, cell);
        print.wallZ(o.z1, o.y0, o.z1 + w, o.y1, -0.045, -1, color, cell);
    }

    // Grid of openings for a run of floors.
    function grid(width, bayWidth, openingWidth, floors) {
        const bays = Math.max(1, Math.round(width / bayWidth));
        const bay = width / bays;
        const rows = floors.map(({ bottom, top }) => ({
            bottom, top,
            openings: Array.from({ length: bays }, (_, i) => ({
                z0: i * bay + (bay - openingWidth) / 2, z1: i * bay + (bay + openingWidth) / 2, y0: bottom, y1: top
            }))
        }));
        return { rows, bays, bay };
    }

    // --- Ground floor: shop fronts --------------------------------------------
    // Returns the units so the street can put terraces in front of cafes.
    function shopFronts(sink, wallKey, tint, width, height = GROUND_FLOOR) {
        const s = WALL_SCALE[wallKey];
        const units = [];
        const count = Math.max(1, Math.round(width / range(6, 9)));
        const unit = width / count;
        const pier = 0.5;
        const pavement = 0.15;
        const plinth = 0.6;
        const head = height - 1.15;
        // Pilasters and fascia (both levels: they make the silhouette).
        for (let i = 0; i <= count; i++) {
            const z = i * unit;
            const z0 = Math.max(0, z - pier / 2);
            const z1 = Math.min(width, z + pier / 2);
            sink.both[wallKey].block(-0.1, 0, z0, 0, head, z1, tint, s, 'xzZ');
        }
        sink.both[wallKey].wallZ(0, head, width, height, 0, -1, tint, [0, head / s, width / s, height / s]);
        sink.both[wallKey].block(-0.22, height - 0.12, 0, 0, height + 0.06, width, tint, s, 'xyYzZ');
        for (let i = 0; i < count; i++) {
            const z0 = i * unit + pier / 2;
            const z1 = (i + 1) * unit - pier / 2;
            const sign = pick(signs.cells);
            const kind = sign.kind;
            units.push({ z0, z1, kind });
            const doorLeft = chance(0.5);
            const doorWidth = 1.15;
            const dz0 = doorLeft ? z0 + 0.15 : z1 - 0.15 - doorWidth;
            const winZ0 = doorLeft ? dz0 + doorWidth + 0.12 : z0 + 0.12;
            const winZ1 = doorLeft ? z1 - 0.12 : dz0 - 0.12;
            const recess = 0.7;
            // Dark shop interior behind everything, plinth under the window.
            sink.both.props.wallZ(z0, 0, z1, head, recess + 0.05, -1, 0x1a1b1e);
            sink.both[wallKey].wallZ(winZ0, 0, winZ1, plinth, 0.05, -1, tint, [winZ0 / s, 0, winZ1 / s, plinth / s]);
            sink.hi.props.block(-0.02, plinth - 0.06, winZ0, 0.12, plinth, winZ1, 0x2a2c30);
            // Interior seen through the glass, glass in front (reflections).
            sink.both.shop.wallZ(winZ0, plinth, winZ1, head, recess, -1, 0xffffff, shops.cells[kind]);
            sink.hi.glass.wallZ(winZ0, plinth, winZ1, head, 0.18, -1, 0xffffff);
            // Reveal of the shop window and its frame.
            const frame = pick([0x1e2024, 0x2d3b33, 0x3a2a20, 0xd8d6d0]);
            const props = sink.hi.props;
            props.wallX(0, plinth, recess, head, winZ0, 1, 0x2a2c30);
            props.wallX(0, plinth, recess, head, winZ1, -1, 0x2a2c30);
            props.ceil(0, winZ0, recess, winZ1, head, 0x3a3c40);
            props.wallZ(winZ0, plinth, winZ0 + 0.08, head, 0.16, -1, frame);
            props.wallZ(winZ1 - 0.08, plinth, winZ1, head, 0.16, -1, frame);
            props.wallZ(winZ0, head - 0.08, winZ1, head, 0.16, -1, frame);
            if (winZ1 - winZ0 > 3) {
                const c = (winZ0 + winZ1) / 2;
                props.wallZ(c - 0.04, plinth, c + 0.04, head, 0.15, -1, frame);
            }
            // Door, recessed with a step.
            const doorTop = pavement + 2.4;
            sink.both.print.wallZ(dz0, pavement + 0.04, dz0 + doorWidth, doorTop, 0.4, -1, 0xffffff, kind === 'bar' ? prints.doorWood : prints.doorGlass);
            props.wallX(0, pavement, 0.4, doorTop, dz0, 1, 0x2a2c30);
            props.wallX(0, pavement, 0.4, doorTop, dz0 + doorWidth, -1, 0x2a2c30);
            props.ceil(0, dz0, 0.4, dz0 + doorWidth, doorTop, 0x2a2c30);
            props.block(-0.25, pavement, dz0, 0.4, pavement + 0.05, dz0 + doorWidth, 0x9a9da4, 1, 'xyYzZ');
            sink.both[wallKey].wallZ(dz0, doorTop, dz0 + doorWidth, head, 0.02, -1, tint, [dz0 / s, doorTop / s, (dz0 + doorWidth) / s, head / s]);
            // Lit sign on the fascia.
            const signW = Math.min(z1 - z0 - 0.4, range(2.8, 4.4));
            const sc = (z0 + z1) / 2;
            sink.both.sign.wallZ(sc - signW / 2, head + 0.22, sc + signW / 2, head + 0.82, -0.1, -1, 0xffffff, sign.uv);
            props.block(-0.09, head + 0.18, sc - signW / 2 - 0.04, 0, head + 0.86, sc + signW / 2 + 0.04, 0x15171b, 1, 'yYzZ');
            // Awning or projecting sign.
            if (chance(0.55)) {
                const cell = pick(prints.awnings);
                const depth = range(1.3, 1.8);
                const top = head - 0.05;
                const low = top - 0.75;
                const print = sink.both.print;
                const a = [winZ0 - 0.1, winZ1 + 0.1];
                print.quad({ x: -depth, y: low, z: a[0] }, { x: -depth, y: low, z: a[1] }, { x: 0, y: top, z: a[1] }, { x: 0, y: top, z: a[0] },
                    0xffffff, [cell[0], cell[1] + (cell[3] - cell[1]) * 0.28, cell[2], cell[3]]);
                print.wallZ(a[0], low - 0.32, a[1], low, -depth, -1, 0xffffff, [cell[0], cell[1], cell[2], cell[1] + (cell[3] - cell[1]) * 0.28]);
                sink.hi.props.tube([{ x: -depth, y: low, z: a[0] }, { x: -depth, y: low, z: a[1] }].map((p) => vec(p)), [0.025, 0.025], 0x2a2c30, 5);
                sink.hi.props.tube([vec({ x: 0, y: top - 0.6, z: a[0] + 0.1 }), vec({ x: -depth, y: low, z: a[0] + 0.1 })], [0.018, 0.018], 0x2a2c30, 4);
                sink.hi.props.tube([vec({ x: 0, y: top - 0.6, z: a[1] - 0.1 }), vec({ x: -depth, y: low, z: a[1] - 0.1 })], [0.018, 0.018], 0x2a2c30, 4);
            } else if (chance(0.5)) {
                const zb = doorLeft ? z1 - 0.3 : z0 + 0.3;
                sink.hi.props.block(-0.95, head + 0.95, zb - 0.06, 0, head + 1.0, zb + 0.06, 0x1b1d21);
                sink.hi.props.block(-0.85, head + 0.15, zb - 0.07, -0.1, head + 0.95, zb + 0.07, 0x15171b);
                if (kind === 'pharmacy') {
                    for (const [w, h] of [[0.6, 0.2], [0.2, 0.6]]) {
                        sink.hi.emissive.block(-0.475 - w / 2, head + 0.55 - h / 2, zb - 0.08, -0.475 + w / 2, head + 0.55 + h / 2, zb + 0.08, 0x3cff7a, 1, 'zZ');
                    }
                } else {
                    const uv = sign.uv;
                    const half = (uv[2] - uv[0]) * 0.36;
                    const mid = (uv[0] + uv[2]) / 2;
                    const blade = [mid - half, uv[1], mid + half, uv[3]];
                    sink.hi.sign.wallX(-0.82, head + 0.4, -0.13, head + 0.72, zb - 0.075, -1, 0xffffff, blade);
                    sink.hi.sign.wallX(-0.82, head + 0.4, -0.13, head + 0.72, zb + 0.075, 1, 0xffffff, blade);
                }
            }
            // Light spilling on the pavement.
            sink.both.glow.floor(-4.2, z0 + 0.3, -0.2, z1 - 0.3, 0.17, kind === 'pharmacy' ? 0x7dffb0 : 0xffb565, [0.12, 0.12, 0.88, 0.88]);
        }
        return units;
    }

    // --- Roofs -------------------------------------------------------------------
    function mansard(sink, width, depth, top, tint) {
        const slate = 0x5b6470;
        const s = WALL_SCALE.plain;
        const rise = 3.1;
        const inset = 1.55;
        const both = sink.both.plain;
        both.quad(vec({ x: -0.25, y: top, z: 0 }), vec({ x: -0.25, y: top, z: width }), vec({ x: inset, y: top + rise, z: width }),
            vec({ x: inset, y: top + rise, z: 0 }), slate, [0, top / s, width / s, (top + rise) / s]);
        both.floor(inset, 0, depth, width, top + rise, slate);
        both.quad(vec({ x: -0.25, y: top, z: 0 }), vec({ x: inset, y: top + rise, z: 0 }), vec({ x: depth, y: top + rise, z: 0 }),
            vec({ x: depth, y: top, z: 0 }), slate);
        both.quad(vec({ x: -0.25, y: top, z: width }), vec({ x: depth, y: top, z: width }), vec({ x: depth, y: top + rise, z: width }),
            vec({ x: inset, y: top + rise, z: width }), slate);
        // Dormers with small windows.
        const dormers = Math.max(1, Math.floor(width / 3.2));
        const spacing = width / dormers;
        for (let i = 0; i < dormers; i++) {
            if (chance(0.25)) continue;
            const c = (i + 0.5) * spacing;
            const x0 = 0.45;
            sink.both.plain.block(x0, top + 0.5, c - 0.62, x0 + 1.3, top + 2.15, c + 0.62, tint, s, 'xzZ');
            sink.hi.window.wallZ(c - 0.38, top + 0.75, c + 0.38, top + 1.85, x0 + 0.08, -1, 0xffffff, windowCell());
            sink.hi.props.wallZ(c - 0.42, top + 0.72, c + 0.42, top + 0.8, x0 - 0.01, -1, FRAME_WHITE);
            sink.hi.props.wallZ(c - 0.03, top + 0.75, c + 0.03, top + 1.85, x0 + 0.06, -1, FRAME_WHITE);
            sink.lo.window.wallZ(c - 0.38, top + 0.75, c + 0.38, top + 1.85, x0 - 0.03, -1, 0xffffff, windowCell());
            const ridge = top + 2.75;
            sink.both.props.quad(vec({ x: x0 - 0.1, y: top + 2.1, z: c - 0.75 }), vec({ x: x0 - 0.1, y: ridge, z: c }),
                vec({ x: x0 + 1.4, y: ridge, z: c }), vec({ x: x0 + 1.4, y: top + 2.1, z: c - 0.75 }), slate);
            sink.both.props.quad(vec({ x: x0 - 0.1, y: top + 2.1, z: c + 0.75 }), vec({ x: x0 + 1.4, y: top + 2.1, z: c + 0.75 }),
                vec({ x: x0 + 1.4, y: ridge, z: c }), vec({ x: x0 - 0.1, y: ridge, z: c }), slate);
            sink.hi.props.quad(vec({ x: x0, y: top + 2.15, z: c - 0.62 }), vec({ x: x0, y: top + 2.15, z: c + 0.62 }),
                vec({ x: x0, y: ridge - 0.08, z: c }), vec({ x: x0, y: ridge - 0.08, z: c }), tint);
        }
        // Chimney stacks.
        const stacks = 1 + Math.floor(width / 10);
        for (let i = 0; i < stacks; i++) {
            const c = range(1, width - 1.5);
            const x0 = range(2.2, Math.max(2.4, depth - 3));
            sink.both.brick.block(x0, top + 2.4, c, x0 + 0.7, top + 4.3, c + 1.3, 0xd8c8c0, WALL_SCALE.brick, 'xXzZY');
            for (let k = 0; k < 3; k++) {
                sink.hi.props.add(PRIMS.cylinder6, transform(x0 + 0.35, top + 4.5, c + 0.25 + k * 0.4, 0.09, 0.4, 0.09), 0x9a6a4a);
            }
        }
    }

    function flatRoof(sink, wallKey, tint, width, depth, top, options = {}) {
        const s = WALL_SCALE[wallKey];
        sink.both[wallKey].block(-0.12, top, 0, 0.3, top + (options.parapet ?? 0.9), width, tint, s, 'xXzZY');
        sink.both.props.floor(0.3, 0, depth, width, top + 0.2, 0x55575c);
        // Rooftop clutter seen above the parapet.
        const units = Math.floor(width / 7) + 1;
        for (let i = 0; i < units; i++) {
            const c = range(1, width - 2);
            const x0 = range(3, Math.max(3.2, depth - 4));
            if (chance(0.5)) {
                sink.both.props.block(x0, top + 0.2, c, x0 + 1.6, top + 1.4, c + 1.1, 0xb8bcc2, 1, 'xXzZY');
            } else {
                sink.hi.props.add(PRIMS.cylinder, transform(x0, top + 1.6, c, 1.1, 2.8, 1.1), 0x8d7f6c);
                sink.hi.props.add(PRIMS.cone, transform(x0, top + 3.3, c, 1.15, 0.6, 1.15), 0x5a5048);
                for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
                    sink.hi.props.add(PRIMS.box, transform(x0 + dx, top + 0.6, c + dz, 0.08, 0.9, 0.08), 0x3a3c40);
                }
            }
        }
        if (chance(0.4)) {
            sink.hi.props.tube([vec({ x: depth * 0.5, y: top, z: width * 0.4 }), vec({ x: depth * 0.5, y: top + 5, z: width * 0.4 })], [0.05, 0.03], 0x3a3c40, 4);
        }
    }

    // ends: [start, end] — false where another facade takes the place.
    function endWalls(sink, wallKey, tint, width, depth, height, ends = [true, true]) {
        const s = WALL_SCALE[wallKey];
        if (ends[0]) sink.both[wallKey].wallX(0, 0, depth, height, 0, -1, tint, [-depth / s, 0, 0, height / s]);
        if (ends[1]) sink.both[wallKey].wallX(0, 0, depth, height, width, 1, tint, [0, 0, depth / s, height / s]);
    }

    // --- Building types ------------------------------------------------------------

    // Stone apartment block: French windows, two balcony floors, cornices,
    // slate mansard with dormers.
    function classic(sink, width, depth, options = {}) {
        const tint = pick(STONE_TINTS);
        const floors = options.floors ?? Math.round(range(4, 6));
        const fh = range(3.05, 3.3);
        const top = GROUND_FLOOR + floors * fh;
        const units = options.shops === false ? [] : shopFronts(sink, 'stone', tint, width);
        // Rusticated band above the shops.
        sink.both.stone.block(-0.16, GROUND_FLOOR - 0.05, 0, 0, GROUND_FLOOR + 0.3, width, tint, WALL_SCALE.stone, 'xyYzZ');
        const rows = [];
        for (let f = 0; f < floors; f++) {
            const y = GROUND_FLOOR + f * fh;
            rows.push({ bottom: y + 0.12, top: y + fh - 0.62 });
        }
        const g = grid(width, range(2.6, 3.2), range(1.1, 1.3), rows);
        wallWithOpenings(sink.hi.stone, 'stone', tint, width, GROUND_FLOOR, top, g.rows);
        sink.lo.stone.wallZ(0, GROUND_FLOOR, width, top, 0, -1, tint,
            [0, GROUND_FLOOR / WALL_SCALE.stone, width / WALL_SCALE.stone, top / WALL_SCALE.stone]);
        const frame = chance(0.8) ? FRAME_WHITE : 0x5d6a5e;
        const balconyFloors = new Set([1, floors >= 5 ? 4 : floors - 1]);
        g.rows.forEach((row, f) => {
            const y = GROUND_FLOOR + f * fh;
            // Floor band
            sink.both.stone.block(-0.12, y - 0.1, 0, 0, y + 0.06, width, tint, WALL_SCALE.stone, 'xyYzZ');
            for (const o of row.openings) {
                windowUnit(sink, 'stone', tint, o, { frame, sill: !balconyFloors.has(f) });
                // Carved lintel
                sink.hi.stone.block(-0.06, o.y1, o.z0 - 0.12, 0, o.y1 + 0.28, o.z1 + 0.12, tint, WALL_SCALE.stone, 'xyYzZ');
                if (!balconyFloors.has(f)) {
                    sink.hi.print.wallZ(o.z0, o.y0, o.z1, o.y0 + 0.95, 0.06, -1, 0xffffff, prints.railIron);
                }
            }
            if (balconyFloors.has(f)) {
                const slab = y + 0.06;
                sink.both.stone.block(-0.85, slab - 0.16, 0.25, 0, slab, width - 0.25, tint, WALL_SCALE.stone, 'xyYzZ');
                for (let i = 0; i <= g.bays; i++) {
                    const z = Math.min(width - 0.45, Math.max(0.45, i * g.bay));
                    sink.hi.stone.block(-0.6, slab - 0.55, z - 0.12, 0, slab - 0.16, z + 0.12, tint, WALL_SCALE.stone, 'xyzZ');
                }
                const print = sink.both.print;
                railing(print, prints.railIron, 0.3, width - 0.3, slab, slab + 1.0, -0.8);
                print.wallX(-0.8, slab, 0, slab + 1.0, 0.3, -1, 0xffffff, prints.railIron);
                print.wallX(-0.8, slab, 0, slab + 1.0, width - 0.3, 1, 0xffffff, prints.railIron);
            }
        });
        // Main cornice
        sink.both.stone.block(-0.3, top - 0.35, 0, 0, top, width, tint, WALL_SCALE.stone, 'xyzZ');
        sink.both.stone.block(-0.6, top, 0, 0, top + 0.3, width, tint, WALL_SCALE.stone, 'xyYzZ');
        mansard(sink, width, depth, top + 0.3, tint);
        endWalls(sink, 'stone', tint, width, depth, top + 0.3, options.ends);
        return { height: top + 3.4, units };
    }

    // Brick block: punched windows with stone lintels, shutters, flat roof.
    function brick(sink, width, depth, options = {}) {
        const tint = pick(BRICK_TINTS);
        const trim = pick(STONE_TINTS);
        const floors = options.floors ?? Math.round(range(3, 5));
        const fh = range(2.9, 3.1);
        const top = GROUND_FLOOR + floors * fh;
        const units = options.shops === false ? [] : shopFronts(sink, 'stone', trim, width);
        const rows = [];
        for (let f = 0; f < floors; f++) {
            const y = GROUND_FLOOR + f * fh;
            rows.push({ bottom: y + 0.85, top: y + fh - 0.45 });
        }
        const g = grid(width, range(2.4, 2.9), range(1.0, 1.15), rows);
        wallWithOpenings(sink.hi.brick, 'brick', tint, width, GROUND_FLOOR, top, g.rows);
        sink.lo.brick.wallZ(0, GROUND_FLOOR, width, top, 0, -1, tint,
            [0, GROUND_FLOOR / WALL_SCALE.brick, width / WALL_SCALE.brick, top / WALL_SCALE.brick]);
        const hasShutters = chance(0.6);
        const shutterColor = pick(SHUTTER_TINTS);
        const frame = chance(0.7) ? FRAME_WHITE : FRAME_DARK;
        for (const row of g.rows) {
            for (const o of row.openings) {
                windowUnit(sink, 'brick', tint, o, { frame, depth: 0.18, sill: false });
                sink.hi.stone.block(-0.05, o.y1, o.z0 - 0.1, 0, o.y1 + 0.24, o.z1 + 0.1, trim, WALL_SCALE.stone, 'xyYzZ');
                sink.hi.stone.block(-0.08, o.y0 - 0.1, o.z0 - 0.08, 0, o.y0, o.z1 + 0.08, trim, WALL_SCALE.stone, 'xyYzZ');
                if (hasShutters && g.bay - (o.z1 - o.z0) > 1.1) shutters(sink, o, shutterColor);
            }
        }
        sink.both.stone.block(-0.12, GROUND_FLOOR - 0.05, 0, 0, GROUND_FLOOR + 0.25, width, trim, WALL_SCALE.stone, 'xyYzZ');
        sink.both.stone.block(-0.4, top - 0.4, 0, 0, top, width, trim, WALL_SCALE.stone, 'xyYzZ');
        flatRoof(sink, 'brick', tint, width, depth, top);
        endWalls(sink, 'brick', tint, width, depth, top + 0.9, options.ends);
        if (chance(0.35)) {
            // Painted mural on the blank end wall.
            const h = Math.min(top - GROUND_FLOOR - 1, 8);
            sink.both.print.wallX(0.6, GROUND_FLOOR + 1, Math.min(depth - 0.6, 0.6 + h * 2), GROUND_FLOOR + 1 + h, -0.03, -1, 0xffffff, prints.mural);
        }
        return { height: top + 0.9, units };
    }

    // Rendered modern block: large windows, glass balconies, set-back attic.
    function modern(sink, width, depth, options = {}) {
        const tint = pick(RENDER_TINTS);
        const floors = options.floors ?? Math.round(range(4, 7));
        const fh = 2.95;
        const top = GROUND_FLOOR + floors * fh;
        const units = options.shops === false ? [] : shopFronts(sink, 'plain', tint, width);
        const rows = [];
        for (let f = 0; f < floors; f++) {
            const y = GROUND_FLOOR + f * fh;
            rows.push({ bottom: y + 0.1, top: y + fh - 0.45 });
        }
        const g = grid(width, range(3.2, 4.2), range(1.7, 2.3), rows);
        wallWithOpenings(sink.hi.plain, 'plain', tint, width, GROUND_FLOOR, top, g.rows);
        sink.lo.plain.wallZ(0, GROUND_FLOOR, width, top, 0, -1, tint,
            [0, GROUND_FLOOR / WALL_SCALE.plain, width / WALL_SCALE.plain, top / WALL_SCALE.plain]);
        const pattern = Math.floor(random() * 3);
        g.rows.forEach((row, f) => {
            row.openings.forEach((o, i) => {
                windowUnit(sink, 'plain', tint, o, { frame: FRAME_DARK, depth: 0.16, sill: false, transom: false });
                const balcony = pattern === 0 ? (i + f) % 2 === 0 : pattern === 1 ? i % 2 === 0 : f % 2 === 1;
                if (balcony) {
                    const z0 = o.z0 - 0.35;
                    const z1 = o.z1 + 0.35;
                    sink.both.concrete.block(-1.25, o.y0 - 0.22, z0, 0, o.y0 - 0.02, z1, 0xe8e6e2, WALL_SCALE.concrete, 'xyYzZ');
                    sink.hi.glass.wallZ(z0 + 0.03, o.y0 - 0.02, z1 - 0.03, o.y0 + 1.0, -1.2, -1, 0xd8e4ea);
                    sink.hi.glass.wallX(-1.2, o.y0 - 0.02, 0, o.y0 + 1.0, z0 + 0.03, -1, 0xd8e4ea);
                    sink.hi.glass.wallX(-1.2, o.y0 - 0.02, 0, o.y0 + 1.0, z1 - 0.03, 1, 0xd8e4ea);
                    sink.hi.props.block(-1.24, o.y0 + 1.0, z0, -1.16, o.y0 + 1.05, z1, 0x9aa0a6, 1, 'xXyYzZ');
                } else {
                    sink.hi.print.wallZ(o.z0, o.y0, o.z1, o.y0 + 1.0, 0.05, -1, 0xffffff, prints.railBars);
                }
            });
        });
        sink.both.plain.block(-0.1, top - 0.25, 0, 0, top + 0.3, width, tint, WALL_SCALE.plain, 'xyYzZ');
        // Set-back attic with a terrace railing.
        const attic = 2.8;
        sink.both.curtain.wallZ(0, top + 0.3, width - 0.1, top + 0.3 + attic, 2.2, -1, 0xffffff,
            [0, 0, width / CURTAIN_TILE.width, attic / CURTAIN_TILE.height]);
        sink.both.plain.block(2.0, top + 0.3 + attic, 0, depth, top + 0.6 + attic, width, tint, WALL_SCALE.plain, 'xzZ');
        railing(sink.hi.print, prints.railBars, 0.05, width - 0.05, top + 0.3, top + 1.3, -0.02, 3);
        endWalls(sink, 'plain', tint, width, depth, top + 0.3, options.ends);
        const ps = WALL_SCALE.plain;
        sink.both.plain.wallX(2.2, top + 0.3, depth, top + 0.3 + attic, 0, -1, tint, [-depth / ps, (top + 0.3) / ps, -2.2 / ps, (top + 0.3 + attic) / ps]);
        sink.both.plain.wallX(2.2, top + 0.3, depth, top + 0.3 + attic, width, 1, tint, [2.2 / ps, (top + 0.3) / ps, depth / ps, (top + 0.3 + attic) / ps]);
        return { height: top + 3.4, units };
    }

    // Office tower: curtain wall with fins, tall lobby, mechanical crown.
    function tower(sink, width, depth, options = {}) {
        const lobby = 5.6;
        const height = options.height ?? range(30, 62);
        const metal = pick([0x9aa3ad, 0x6f7781, 0xc2c6cc, 0x3c4148]);
        const glassTint = pick([0xffffff, 0xd8ecff, 0xd6f0e6, 0xf2e6d6]);
        const cw = CURTAIN_TILE.width;
        const ch = CURTAIN_TILE.height;
        // Curtain wall all round (towers rise above their neighbours).
        const fins = Math.max(2, Math.round(width / 1.5));
        sink.both.curtain.wallZ(0, lobby, width, height, 0, -1, glassTint, [0, 0, fins / 4, (height - lobby) / ch]);
        const ends = options.ends ?? [true, true];
        if (ends[0]) sink.both.curtain.wallX(0, lobby, depth, height, 0, -1, glassTint, [0, 0, depth / cw, (height - lobby) / ch]);
        if (ends[1]) sink.both.curtain.wallX(0, lobby, depth, height, width, 1, glassTint, [0, 0, depth / cw, (height - lobby) / ch]);
        for (let i = 0; i <= fins; i++) {
            const z = Math.min(width - 0.05, Math.max(0.05, (i * width) / fins));
            sink.hi.props.block(-0.34, lobby, z - 0.05, 0, height, z + 0.05, metal, 1, 'xzZ');
        }
        for (let y = lobby; y < height; y += ch) {
            sink.hi.props.block(-0.2, y - 0.12, 0, 0, y + 0.12, width, metal, 1, 'xyYzZ');
        }
        // Lobby: recessed glass between columns.
        const s = WALL_SCALE.concrete;
        sink.both.shop.wallZ(0.4, 0, width - 0.4, lobby - 0.4, 2.2, -1, 0xffffff, shops.cells.phone);
        sink.hi.glass.wallZ(0.4, 0, width - 0.4, lobby - 0.4, 1.2, -1, 0xffffff);
        sink.both.concrete.ceil(0, 0, 2.2, width, lobby - 0.4, 0xd8d6d2, [0, 0, 2.2 / s, width / s]);
        sink.both.concrete.wallZ(0, lobby - 0.4, width, lobby, 0, -1, 0xd8d6d2);
        if (ends[0]) sink.both.concrete.wallX(0, 0, depth, lobby, 0, -1, 0xd8d6d2, [-depth / s, 0, 0, lobby / s]);
        if (ends[1]) sink.both.concrete.wallX(0, 0, depth, lobby, width, 1, 0xd8d6d2, [0, 0, depth / s, lobby / s]);
        const columns = Math.max(2, Math.round(width / 6));
        for (let i = 0; i <= columns; i++) {
            const z = Math.min(width - 0.35, Math.max(0.35, (i * width) / columns));
            sink.both.concrete.block(-0.1, 0, z - 0.35, 0.6, lobby, z + 0.35, 0xd8d6d2, s, 'xzZ');
        }
        const entrance = width * range(0.3, 0.7);
        sink.both.props.block(-2.4, lobby - 0.95, entrance - 2.5, 0, lobby - 0.7, entrance + 2.5, metal);
        const sign = pick(signs.cells);
        sink.both.sign.wallZ(entrance - 2, lobby - 0.68, entrance + 2, lobby - 0.18, -2.0, -1, 0xffffff, sign.uv);
        sink.hi.glow.floor(-5, entrance - 3.5, -0.3, entrance + 3.5, 0.17, 0xd8e4ff, [0.1, 0.1, 0.9, 0.9]);
        // Crown
        sink.both.props.block(-0.45, height, 0, depth, height + 1.4, width, metal, 1, 'xXzZY');
        sink.both.concrete.block(4, height + 1.4, 3, Math.max(5, depth - 3), height + 5, Math.max(4, width - 3), 0xc8c6c2, s, 'xXzZY');
        sink.hi.props.tube([vec({ x: depth / 2, y: height + 5, z: width / 2 }), vec({ x: depth / 2, y: height + 13, z: width / 2 })], [0.12, 0.04], 0x2a2c30, 5);
        sink.both.emissive.block(depth / 2 - 0.15, height + 13, width / 2 - 0.15, depth / 2 + 0.15, height + 13.3, width / 2 + 0.15, 0xff3020);
        return { height: height + 5, units: [] };
    }

    // Lower filler: a two-storey shop building with a big sign and a mural.
    function lowrise(sink, width, depth, options = {}) {
        const tint = pick(RENDER_TINTS);
        const top = GROUND_FLOOR + 3.2;
        const units = shopFronts(sink, 'plain', tint, width);
        const rows = [{ bottom: GROUND_FLOOR + 0.9, top: top - 0.6 }];
        const g = grid(width, 3.2, 2.2, rows);
        wallWithOpenings(sink.hi.plain, 'plain', tint, width, GROUND_FLOOR, top, g.rows);
        sink.lo.plain.wallZ(0, GROUND_FLOOR, width, top, 0, -1, tint,
            [0, GROUND_FLOOR / WALL_SCALE.plain, width / WALL_SCALE.plain, top / WALL_SCALE.plain]);
        for (const o of g.rows[0].openings) windowUnit(sink, 'plain', tint, o, { frame: FRAME_DARK, depth: 0.14, transom: false });
        flatRoof(sink, 'plain', tint, width, depth, top, { parapet: 0.6 });
        endWalls(sink, 'plain', tint, width, depth, top + 0.6, options.ends);
        return { height: top + 0.6, units };
    }

    const TYPES = { classic, brick, modern, tower, lowrise };
    return {
        TYPES,
        build(sink, type, width, depth, options) {
            return TYPES[type](sink, width, depth, options);
        }
    };
}

function vec({ x, y, z }) {
    return { x, y, z, isVector3: true };
}
