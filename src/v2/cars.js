// Parked cars for the street: bodies extruded from a side profile with
// rounded edges, glass cabin, roof, pillars, wheels with rims, lights,
// mirrors and plates. Built once per model; each parked car copies the parts
// into the block's car batch with its own paint colour.
import * as THREE from 'three';
import { Batch, PRIMS, transform } from './geometry.js';

export const CAR_PAINTS = [
    0xf2f2f0, 0x111214, 0xa8adb3, 0x6e747b, 0x1d3557, 0x8c1c13, 0x2f4f3f, 0xd8c9a8, 0x3a6ea5, 0xe0a526, 0x5b2a3a
];

const GLASS = 0x0c1116;
const TYRE = 0x141416;
const RIM = 0xb8bcc2;
const TRIM = 0x1a1c1f;
// Behind the spokes, bumper intakes.
const WELL = 0x2b2e33;

function profileShape(points) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    return shape;
}

// Wheel arches cut into the sill line between the bumpers.
function lowerBody(length, frontWheel, rearWheel, radius, noseHeight, tailHeight, top = []) {
    const half = length / 2;
    const points = [[-half, 0.3], [-half - 0.03, tailHeight * 0.6], [-half + 0.05, tailHeight], ...top];
    points.push([half - 0.15, noseHeight], [half, noseHeight * 0.78], [half + 0.02, 0.38], [half - 0.05, 0.3]);
    const arch = (centre) => {
        const r = radius + 0.07;
        const steps = 8;
        const out = [];
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * Math.PI;
            out.push([centre + Math.cos(angle) * r, 0.33 + Math.sin(angle) * r]);
        }
        return out;
    };
    points.push([frontWheel + radius + 0.12, 0.3], ...arch(frontWheel), [rearWheel + radius + 0.12, 0.3], ...arch(rearWheel));
    return profileShape(points);
}

function extrude(shape, width, bevel = 0.07) {
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.85,
        bevelSegments: 2, curveSegments: 4
    });
    // Shape x -> car length (+z), extrusion -> width (x), centred.
    geometry.translate(0, 0, -(width - bevel * 2) / 2);
    geometry.rotateY(-Math.PI / 2);
    return geometry;
}

const MODELS = {
    sedan: { length: 4.6, width: 1.82, belt: 0.98, roof: 1.44, wheelbase: 2.75, radius: 0.33, nose: 0.82, tail: 0.98,
        cabin: [[-1.45, 0.98], [-0.85, 1.4], [0.45, 1.42], [1.25, 0.98]] },
    sedan_sr: { length: 4.6, width: 1.82, belt: 0.98, roof: 1.44, wheelbase: 2.75, radius: 0.33, nose: 0.82, tail: 0.98,
        cabin: [[-1.45, 0.98], [-0.85, 1.4], [0.45, 1.42], [1.25, 0.98]], sunroof: 'tilt' },
    hatch: { length: 4.05, width: 1.76, belt: 0.97, roof: 1.48, wheelbase: 2.55, radius: 0.31, nose: 0.8, tail: 1.0,
        cabin: [[-1.82, 1.0], [-1.6, 1.45], [0.35, 1.47], [1.1, 0.97]] },
    hatch_sr: { length: 4.05, width: 1.76, belt: 0.97, roof: 1.48, wheelbase: 2.55, radius: 0.31, nose: 0.8, tail: 1.0,
        cabin: [[-1.82, 1.0], [-1.6, 1.45], [0.35, 1.47], [1.1, 0.97]], sunroof: 'tilt' },
    suv: { length: 4.6, width: 1.9, belt: 1.12, roof: 1.72, wheelbase: 2.75, radius: 0.37, nose: 1.0, tail: 1.12,
        cabin: [[-2.2, 1.12], [-2.05, 1.7], [0.55, 1.72], [1.25, 1.12]] },
    suv_sr: { length: 4.6, width: 1.9, belt: 1.12, roof: 1.72, wheelbase: 2.75, radius: 0.37, nose: 1.0, tail: 1.12,
        cabin: [[-2.2, 1.12], [-2.05, 1.7], [0.55, 1.72], [1.25, 1.12]], sunroof: 'panoramic' },
    van: { length: 5.1, width: 1.98, belt: 1.15, roof: 2.0, wheelbase: 3.1, radius: 0.34, nose: 1.0, tail: 1.9,
        cabin: [[1.0, 1.15], [1.05, 1.95], [1.3, 1.98], [2.05, 1.15]] },
    // Low two-door sports car (unlocked last in free roam).
    coupe: { length: 4.5, width: 1.92, belt: 0.86, roof: 1.22, wheelbase: 2.62, radius: 0.34, nose: 0.66, tail: 0.92,
        cabin: [[-1.25, 0.86], [-0.55, 1.2], [0.2, 1.22], [1.15, 0.86]], sunroof: 'tilt' },

    // --- Detailed realistic shop models -------------------------------------
    'citron-c5-air': {
        length: 4.52, width: 1.92, belt: 1.12, roof: 1.69, wheelbase: 2.73, radius: 0.36, nose: 1.02, tail: 1.16,
        cabin: [[-2.05, 1.14], [-1.75, 1.66], [0.5, 1.68], [1.22, 1.12]],
        sunroof: 'panoramic', style: 'c5air', spokes: 5, caliper: 0xc93030
    },
    'reno-3009': {
        length: 4.56, width: 1.9, belt: 1.1, roof: 1.64, wheelbase: 2.74, radius: 0.36, nose: 0.96, tail: 1.15,
        cabin: [[-2.12, 1.12], [-1.52, 1.62], [0.46, 1.64], [1.22, 1.1]],
        sunroof: 'tilt', style: 'reno3009', spokes: 6, caliper: 0xd9a220
    },
    'kupra-formento': {
        length: 4.48, width: 1.88, belt: 1.02, roof: 1.51, wheelbase: 2.68, radius: 0.35, nose: 0.88, tail: 1.08,
        cabin: [[-2.02, 1.04], [-1.42, 1.49], [0.36, 1.51], [1.14, 1.02]],
        sunroof: 'tilt', style: 'kupra', spokes: 5, caliper: 0xc87a4b
    },
    'golfe-8': {
        length: 4.28, width: 1.82, belt: 0.98, roof: 1.46, wheelbase: 2.64, radius: 0.33, nose: 0.78, tail: 1.02,
        cabin: [[-1.92, 1.0], [-1.62, 1.44], [0.38, 1.46], [1.15, 0.98]],
        sunroof: 'tilt', style: 'golfe8', spokes: 5, caliper: 0xe22424
    },
    'audo-rs3': {
        length: 4.54, width: 1.89, belt: 0.95, roof: 1.41, wheelbase: 2.68, radius: 0.34, nose: 0.78, tail: 0.98,
        cabin: [[-1.62, 0.96], [-0.95, 1.39], [0.42, 1.41], [1.2, 0.95]],
        sunroof: 'tilt', style: 'rs3', spokes: 5, caliper: 0xd92222
    },
    'merso-a45': {
        length: 4.45, width: 1.87, belt: 0.96, roof: 1.42, wheelbase: 2.72, radius: 0.34, nose: 0.78, tail: 1.0,
        cabin: [[-1.92, 0.98], [-1.52, 1.4], [0.4, 1.42], [1.18, 0.96]],
        sunroof: 'panoramic', style: 'a45', spokes: 6, caliper: 0xe6b81c
    },
    'audo-rsq3': {
        length: 4.52, width: 1.92, belt: 1.07, roof: 1.58, wheelbase: 2.68, radius: 0.37, nose: 0.92, tail: 1.12,
        cabin: [[-2.08, 1.08], [-1.36, 1.56], [0.42, 1.58], [1.18, 1.07]],
        sunroof: 'panoramic', style: 'rsq3', spokes: 5, caliper: 0xe02828
    },
    'bm-m340': {
        length: 4.72, width: 1.92, belt: 0.96, roof: 1.41, wheelbase: 2.85, radius: 0.34, nose: 0.78, tail: 0.98,
        cabin: [[-1.56, 0.96], [-0.92, 1.39], [0.4, 1.41], [1.18, 0.96]],
        sunroof: 'tilt', style: 'm3', spokes: 6, caliper: 0x2068d8
    },
    'porsh-makane': {
        length: 4.72, width: 1.96, belt: 1.06, roof: 1.57, wheelbase: 2.81, radius: 0.37, nose: 0.88, tail: 1.1,
        cabin: [[-2.1, 1.08], [-1.34, 1.55], [0.4, 1.57], [1.22, 1.06]],
        sunroof: 'panoramic', style: 'makane', spokes: 5, caliper: 0xe22424
    },
    'porsh-911': {
        length: 4.52, width: 1.94, belt: 0.84, roof: 1.28, wheelbase: 2.45, radius: 0.34, nose: 0.64, tail: 0.92,
        cabin: [[-1.48, 0.86], [-0.72, 1.26], [0.22, 1.28], [1.05, 0.84]],
        sunroof: 'tilt', style: 'gt911', spokes: 5, caliper: 0xf0c21a
    },
    'lambo-uruz': {
        length: 5.05, width: 2.04, belt: 1.08, roof: 1.6, wheelbase: 2.98, radius: 0.39, nose: 0.92, tail: 1.16,
        cabin: [[-2.25, 1.1], [-1.42, 1.58], [0.46, 1.6], [1.28, 1.08]],
        sunroof: 'panoramic', style: 'uruz', spokes: 6, caliper: 0xf2c618
    }
};

// Free roam: which cars can be driven, from how many points earned in
// competitive runs (the nicer the car, the more points).
export const CAR_UNLOCKS = { hatch: 0, sedan: 250, van: 600, suv: 1200, coupe: 2500 };
export const CAR_NAMES = {
    hatch: 'Citadine', hatch_sr: 'Citadine Toit Ouvrant',
    sedan: 'Berline', sedan_sr: 'Berline Toit Ouvrant',
    van: 'Utilitaire',
    suv: 'SUV', suv_sr: 'SUV Panoramique',
    coupe: 'Coupé sport',
    'citron-c5-air': 'Citron C5 Air',
    'reno-3009': 'Reno 3009 GT',
    'kupra-formento': 'Kupra Formento VZ',
    'golfe-8': 'Golfe 8 GTI',
    'audo-rs3': 'Audo RS3 Sport',
    'merso-a45': 'Merso A45 AMG',
    'audo-rsq3': 'Audo RSQ3',
    'bm-m340': 'BM M3 Comp',
    'porsh-makane': 'Porsh Makane GTS',
    'porsh-911': 'Porsh 911 GT',
    'lambo-uruz': 'Lambo Uruz'
};
export const STANDARD_CAR_MODELS = ['hatch', 'hatch_sr', 'sedan', 'sedan_sr', 'van', 'suv', 'suv_sr', 'coupe'];
export const BASE_CAR_MODEL = (name) => String(name || '').replace(/_sr$/, '');

function buildModel(name) {
    const m = MODELS[name];
    const half = m.length / 2;
    const front = m.wheelbase / 2;
    const rear = -m.wheelbase / 2;
    const parts = [];
    const add = (geometry, color, paint = false) => parts.push({ geometry, color, paint });

    if (name === 'van') {
        // Box body up to the roof, sloped windscreen, glass on the cab sides.
        const screenTop = half - 1.25;
        add(extrude(lowerBody(m.length, front, rear, m.radius, m.nose, m.roof, [[screenTop, m.roof]]), m.width), 0xffffff, true);
        const cab = profileShape([[screenTop - 0.55, m.belt], [screenTop - 0.55, m.roof - 0.14], [screenTop - 0.05, m.roof - 0.14], [half - 0.45, m.belt]]);
        add(extrude(cab, m.width + 0.02, 0.03), GLASS);
        const dz = half - 0.15 - screenTop;
        const dy = m.nose - m.roof;
        const length = Math.hypot(dz, dy) * 0.82;
        add(PRIMS.box.clone().applyMatrix4(transform(0, (m.roof + m.nose) / 2 + 0.08, (screenTop + half - 0.15) / 2 - 0.02,
            m.width - 0.24, length, 0.03, Math.atan2(dz, dy), 0, 0)), GLASS);
    } else {
        add(extrude(lowerBody(m.length, front, rear, m.radius, m.nose, m.tail), m.width), 0xffffff, true);
        const cabin = profileShape(m.cabin);
        add(extrude(cabin, m.width - 0.16, 0.05), GLASS);
        // Roof skin and pillars in body colour.
        const roofStart = m.cabin[1][0] + 0.05;
        const roofEnd = m.cabin[2][0] - 0.05;
        const roof = profileShape([[roofStart, m.roof - 0.06], [roofEnd, m.roof - 0.06], [roofEnd + 0.05, m.roof + 0.02], [roofStart - 0.05, m.roof + 0.02]]);
        add(extrude(roof, m.width - 0.14, 0.05), m.style === 'reno3009' ? TRIM : 0xffffff, m.style !== 'reno3009');
        const pillar = (z0, y0, z1, y1, thickness = 0.09, pillarTrim = false) => {
            const dz = z1 - z0;
            const dy = y1 - y0;
            const length = Math.hypot(dz, dy);
            for (const side of [-1, 1]) {
                const g = PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 - 0.1), (y0 + y1) / 2, (z0 + z1) / 2,
                    0.04, length, thickness, Math.atan2(dz, dy), 0, 0));
                add(g, pillarTrim ? TRIM : 0xffffff, !pillarTrim);
            }
        };
        const blackPillars = m.style === 'reno3009' || m.style === 'c5air';
        pillar(m.cabin[3][0], m.cabin[3][1], m.cabin[2][0], m.cabin[2][1], 0.09, blackPillars);
        pillar(m.cabin[0][0], m.cabin[0][1], m.cabin[1][0], m.cabin[1][1], 0.14, blackPillars);
        const b = (m.cabin[1][0] + m.cabin[2][0]) / 2 + 0.1;
        pillar(b, m.belt, b, m.roof - 0.04, 0.1, !!m.style);

        // Sunroof: recessed cabin frame + glass panel (tilted open or panoramic).
        if (m.sunroof) {
            const srW = (m.width - 0.56);
            const srZ0 = roofStart + 0.12;
            const srZ1 = Math.min(roofEnd - 0.08, srZ0 + 0.78);
            const srCz = (srZ0 + srZ1) / 2;
            const srL = Math.max(0.45, srZ1 - srZ0);
            add(PRIMS.box.clone().applyMatrix4(transform(0, m.roof + 0.025, srCz, srW + 0.08, 0.03, srL + 0.08)), TRIM);
            if (m.sunroof === 'tilt') {
                // Tilted-up glass roof panel open towards the rear.
                add(PRIMS.box.clone().applyMatrix4(transform(0, m.roof + 0.075, srCz, srW, 0.025, srL, 0.13, 0, 0)), 0x102230);
            } else {
                // Full panoramic glass panel + rear tilt section.
                const panL = Math.max(0.6, (roofEnd - roofStart) * 0.74);
                const panZ = (roofStart + roofEnd) / 2;
                add(PRIMS.box.clone().applyMatrix4(transform(0, m.roof + 0.035, panZ, srW, 0.025, panL)), 0x0b1620);
                add(PRIMS.box.clone().applyMatrix4(transform(0, m.roof + 0.072, srCz + 0.1, srW - 0.06, 0.022, srL * 0.65, 0.11, 0, 0)), 0x152b3b);
            }
        }
    }
    // Wheels: tyre, alloy rim (silver lip, dark wheel well, five-ish
    // spokes), hub, plus colored brake calipers on sporty models.
    const spokes = m.spokes || 3;
    const rimColor = m.style === 'kupra' ? 0xc87a4b : m.style === 'gt911' || m.style === 'uruz' ? 0x262930 : RIM;
    for (const z of [front, rear]) {
        for (const side of [-1, 1]) {
            const x = side * (m.width / 2 - 0.13);
            add(PRIMS.cylinder.clone().rotateZ(Math.PI / 2).applyMatrix4(transform(x, m.radius, z, 0.24, m.radius, m.radius)), TYRE);
            add(PRIMS.cylinder.clone().rotateZ(Math.PI / 2).applyMatrix4(transform(x + side * 0.02, m.radius, z, 0.22, m.radius * 0.68, m.radius * 0.68)), rimColor);
            add(PRIMS.cylinder.clone().rotateZ(Math.PI / 2).applyMatrix4(transform(x + side * 0.024, m.radius, z, 0.22, m.radius * 0.58, m.radius * 0.58)), WELL);
            if (m.caliper) {
                add(PRIMS.box.clone().applyMatrix4(transform(x + side * 0.06, m.radius + 0.05, z - 0.09, 0.08, 0.12, 0.08)), m.caliper);
            }
            for (let k = 0; k < spokes; k++) {
                add(PRIMS.box.clone().applyMatrix4(transform(x + side * 0.122, m.radius, z, 0.02, m.radius * 1.14, 0.048, (k * Math.PI) / spokes, 0, 0)), rimColor);
            }
            add(PRIMS.cylinder6.clone().rotateZ(Math.PI / 2).applyMatrix4(transform(x + side * 0.032, m.radius, z, 0.22, m.radius * 0.19, m.radius * 0.19)), m.style === 'kupra' ? 0xc87a4b : TRIM);
        }
    }
    // Sills between the wheels, bumpers (lower intake, rear diffuser),
    // door shut lines, wipers, an exhaust.
    const sill = front - rear - m.radius * 2 - 0.3;
    for (const side of [-1, 1]) {
        add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 - 0.01), 0.37, (front + rear) / 2, 0.05, 0.1, sill)), TRIM);
        if (name !== 'van') {
            const b = (m.cabin[1][0] + m.cabin[2][0]) / 2 + 0.1;
            for (const seam of [b - 0.06, m.cabin[3][0] - 0.12, m.cabin[1][0] - (name === 'coupe' ? 0 : 0.1)]) {
                add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 + 0.004), (0.45 + m.belt) / 2, seam, 0.012, m.belt - 0.45, 0.012)), TRIM);
            }
        }
        // Orange side repeater behind the front wheel.
        add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 + 0.004), m.nose * 0.7, front + m.radius + 0.25, 0.012, 0.03, 0.07)), 0xe08a1a);
    }
    add(PRIMS.box.clone().applyMatrix4(transform(0, 0.42, half - 0.01, m.width * 0.62, 0.11, 0.07)), WELL);
    add(PRIMS.box.clone().applyMatrix4(transform(0, 0.4, -half - 0.01, m.width * 0.72, 0.12, 0.06)), WELL);
    if (name !== 'van') {
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * 0.28, m.belt + 0.03, m.cabin[3][0] - 0.1, 0.42, 0.015, 0.03, 0, side * 0.25, 0)), TRIM);
        }
    }
    if (m.style) {
        addDetailedStyling(add, m, half, front, rear);
    } else {
        add(PRIMS.cylinder6.clone().rotateX(Math.PI / 2).applyMatrix4(transform(m.width * 0.3, 0.33, -half - 0.03, 0.045, 0.045, 0.14)), RIM);
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 - 0.3), m.nose * 0.82, half - 0.02, 0.36, 0.12, 0.08)), 0xf4f1e6);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 - 0.25), (name === 'van' ? 1.0 : m.tail * 0.86), -half - 0.02, 0.32, 0.12, 0.06)), 0xb3141a);
        }
    }
    // Mirrors, door handles, plates, floorpan.
    for (const side of [-1, 1]) {
        const mirrorCol = (m.style === 'rs3' || m.style === 'rsq3' || m.style === 'm3' || m.style === 'a45') ? TRIM : 0xffffff;
        add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 + 0.06), m.belt + 0.08, m.cabin[3][0] - 0.25, 0.15, 0.1, 0.18)), mirrorCol, mirrorCol === 0xffffff);
        for (const z of [0.3, -0.75]) add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 + 0.005), m.belt - 0.12, z, 0.02, 0.03, 0.16)), TRIM);
    }
    if (!m.style) add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.62, half + 0.01, m.width * 0.45, 0.16, 0.06)), TRIM);
    add(PRIMS.box.clone().applyMatrix4(transform(0, 0.52, half + 0.04, 0.52, 0.11, 0.02)), 0xf2f2f2);
    add(PRIMS.box.clone().applyMatrix4(transform(0, 0.62, -half - 0.05, 0.52, 0.11, 0.02)), 0xf2f2f2);
    add(PRIMS.box.clone().applyMatrix4(transform(0, 0.36, 0, m.width - 0.2, 0.14, m.length - 0.4)), TRIM);
    return { parts, length: m.length, width: m.width, height: m.roof, tail: name === 'van' ? 1.0 : m.tail * 0.86 };
}

function addDetailedStyling(add, m, half, front, rear) {
    const s = m.style;
    const hw = m.width / 2;
    const copper = 0xc87a4b;
    const ledWhite = 0xf4f7ff;
    const ledRed = 0xe61e26;

    // Sporty wide side skirts & flared arch accents.
    for (const side of [-1, 1]) {
        add(PRIMS.box.clone().applyMatrix4(transform(side * (hw + 0.015), 0.31, 0, 0.06, 0.08, m.length * 0.52)), TRIM);
        // Sculpted wheel arch lip.
        for (const z of [front, rear]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw + 0.01), m.radius + 0.32, z, 0.05, 0.06, m.radius * 1.45)),
                s === 'c5air' || s === 'rsq3' || s === 'uruz' ? TRIM : 0xffffff, !(s === 'c5air' || s === 'rsq3' || s === 'uruz'));
        }
        // Shark fin antenna on roof.
    }
    add(PRIMS.box.clone().applyMatrix4(transform(0, m.roof + 0.08, m.cabin[1][0] + 0.28, 0.05, 0.1, 0.18, 0.25, 0, 0)), TRIM);

    // Front splitter & aggressive side intakes.
    add(PRIMS.box.clone().applyMatrix4(transform(0, 0.29, half + 0.03, m.width * 0.94, 0.05, 0.14)), s === 'kupra' ? copper : TRIM);
    for (const side of [-1, 1]) {
        add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.26), m.nose * 0.52, half + 0.02, 0.34, 0.19, 0.06)), WELL);
    }

    // Distinct grilles & headlight signatures.
    if (s === 'kupra') {
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.68, half + 0.015, m.width * 0.48, 0.22, 0.07)), TRIM);
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.7, half + 0.05, 0.12, 0.09, 0.02)), copper);
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.28), m.nose * 0.82, half - 0.01, 0.38, 0.09, 0.08, 0, side * 0.14, 0)), ledWhite);
        }
        // Full width coast-to-coast rear LED bar.
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.tail * 0.87, -half - 0.025, m.width * 0.84, 0.065, 0.05)), ledRed);
    } else if (s === 'reno3009') {
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.66, half + 0.015, m.width * 0.56, 0.24, 0.07)), TRIM);
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.26), m.nose * 0.83, half - 0.01, 0.38, 0.08, 0.07)), ledWhite);
            // Triple claw DRLs!
            for (let c = 0; c < 3; c++) {
                add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.22 - c * 0.06), m.nose * 0.66, half + 0.04, 0.025, 0.16, 0.03)), ledWhite);
                add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.22 - c * 0.08), m.tail * 0.86, -half - 0.025, 0.035, 0.12, 0.05)), ledRed);
            }
        }
    } else if (s === 'c5air') {
        // Airbump side pods + roof rails + split headlights.
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw + 0.015), 0.54, 0.1, 0.04, 0.17, 1.5)), TRIM);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw + 0.02), 0.54, 0.45, 0.045, 0.09, 0.24)), 0xe22424);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.36), m.roof + 0.05, -0.35, 0.06, 0.07, 1.9)), RIM);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.26), m.nose * 0.86, half, 0.36, 0.05, 0.06)), ledWhite);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.28), m.nose * 0.69, half + 0.01, 0.32, 0.09, 0.06)), ledWhite);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.26), m.tail * 0.86, -half - 0.025, 0.34, 0.14, 0.05)), ledRed);
        }
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.66, half + 0.01, m.width * 0.48, 0.2, 0.06)), TRIM);
    } else if (s === 'golfe8') {
        // Iconic red GTI stripe + full-width front LED line + 5-dot lower grille fogs!
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.81, half + 0.03, m.width * 0.82, 0.045, 0.04)), ledWhite);
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.77, half + 0.035, m.width * 0.78, 0.03, 0.04)), ledRed);
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.48, half + 0.015, m.width * 0.74, 0.2, 0.06)), TRIM);
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.27), m.nose * 0.82, half, 0.34, 0.09, 0.07)), ledWhite);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.24), m.tail * 0.86, -half - 0.025, 0.36, 0.11, 0.05)), ledRed);
            for (let k = 0; k < 3; k++) {
                add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.22 - k * 0.055), m.nose * 0.48, half + 0.045, 0.032, 0.032, 0.02)), ledWhite);
            }
        }
    } else if (s === 'rs3' || s === 'rsq3') {
        // Massive Singleframe honeycomb grille + aggressive intakes + twin oval RS exhausts!
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.62, half + 0.02, m.width * 0.56, 0.34, 0.07)), TRIM);
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.62, half + 0.05, m.width * 0.5, 0.26, 0.02)), WELL);
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.26), m.nose * 0.83, half, 0.36, 0.09, 0.07)), ledWhite);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.25), m.tail * 0.87, -half - 0.025, 0.4, 0.1, 0.05)), ledRed);
        }
    } else if (s === 'a45') {
        // Panamericana vertical grille slats + rear aero wing.
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.65, half + 0.015, m.width * 0.54, 0.24, 0.07)), TRIM);
        for (let i = -4; i <= 4; i++) {
            add(PRIMS.box.clone().applyMatrix4(transform(i * 0.09, m.nose * 0.65, half + 0.052, 0.02, 0.21, 0.02)), RIM);
        }
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.25), m.nose * 0.83, half, 0.35, 0.09, 0.07)), ledWhite);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.25), m.tail * 0.86, -half - 0.025, 0.36, 0.1, 0.05)), ledRed);
        }
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.roof + 0.12, -half + 0.14, m.width * 0.82, 0.04, 0.24)), TRIM);
    } else if (s === 'm3') {
        // Twin vertical BMW kidney grilles + ducktail lip.
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * 0.19, m.nose * 0.64, half + 0.025, 0.3, 0.32, 0.06)), TRIM);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.26), m.nose * 0.82, half, 0.36, 0.08, 0.07)), ledWhite);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.24), m.tail * 0.87, -half - 0.025, 0.38, 0.09, 0.05)), ledRed);
        }
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.tail + 0.03, -half + 0.06, m.width * 0.78, 0.06, 0.1)), TRIM);
    } else if (s === 'makane') {
        // 4-point quad LED headlamps + full-width rear light strip.
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.56, half + 0.015, m.width * 0.64, 0.22, 0.06)), TRIM);
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.28), m.nose * 0.85, half, 0.32, 0.11, 0.07)), ledWhite);
        }
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.tail * 0.87, -half - 0.025, m.width * 0.88, 0.075, 0.05)), ledRed);
    } else if (s === 'gt911') {
        // Sloped front pods + iconic large rear GT wing + full lightbar.
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.27), m.nose * 0.92, half - 0.12, 0.28, 0.12, 0.24)), ledWhite);
            add(PRIMS.box.clone().applyMatrix4(transform(side * 0.42, m.tail + 0.2, -half + 0.14, 0.05, 0.26, 0.12)), TRIM);
        }
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.tail + 0.33, -half + 0.12, m.width * 0.86, 0.04, 0.28)), TRIM);
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.tail * 0.88, -half - 0.025, m.width * 0.86, 0.06, 0.05)), ledRed);
    } else if (s === 'uruz') {
        // Hexagonal aggressive Y-intakes & fierce lights.
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.56, half + 0.02, m.width * 0.72, 0.32, 0.07)), TRIM);
        for (const side of [-1, 1]) {
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.28), m.nose * 0.84, half, 0.4, 0.08, 0.07, 0, side * 0.18, 0)), ledWhite);
            add(PRIMS.box.clone().applyMatrix4(transform(side * (hw - 0.26), m.tail * 0.88, -half - 0.025, 0.42, 0.09, 0.05)), ledRed);
        }
        add(PRIMS.box.clone().applyMatrix4(transform(0, m.roof + 0.05, -half + 0.18, m.width * 0.74, 0.05, 0.2)), TRIM);
    }

    // Rear diffuser + sporty exhaust pipes (oval RS, quad tips, or center dual).
    add(PRIMS.box.clone().applyMatrix4(transform(0, 0.34, -half - 0.02, m.width * 0.74, 0.14, 0.08)), TRIM);
    if (s === 'rs3' || s === 'rsq3') {
        for (const side of [-1, 1]) {
            add(PRIMS.cylinder6.clone().rotateX(Math.PI / 2).applyMatrix4(transform(side * (hw - 0.35), 0.33, -half - 0.04, 0.095, 0.06, 0.14)), TRIM);
        }
    } else if (s === 'gt911') {
        for (const side of [-1, 1]) {
            add(PRIMS.cylinder6.clone().rotateX(Math.PI / 2).applyMatrix4(transform(side * 0.11, 0.33, -half - 0.04, 0.052, 0.052, 0.15)), RIM);
        }
    } else if (s === 'kupra' || s === 'a45' || s === 'm3' || s === 'makane' || s === 'uruz') {
        const tipColor = s === 'kupra' ? copper : s === 'makane' ? TRIM : RIM;
        for (const side of [-1, 1]) {
            for (const offset of [0.28, 0.44]) {
                add(PRIMS.cylinder6.clone().rotateX(Math.PI / 2).applyMatrix4(transform(side * (hw - offset), 0.33, -half - 0.04, 0.048, 0.048, 0.14)), tipColor);
            }
        }
    } else {
        for (const side of [-1, 1]) {
            add(PRIMS.cylinder6.clone().rotateX(Math.PI / 2).applyMatrix4(transform(side * (hw - 0.34), 0.33, -half - 0.04, 0.055, 0.055, 0.14)), RIM);
        }
    }
}

export function createCarModels() {
    const models = {};
    for (const name of Object.keys(MODELS)) models[name] = buildModel(name);
    return models;
}

// Two geometries per model: the painted body (white, tinted per car) and
// everything else (glass, tyres, lights) in its own colours.
export function buildCarGeometries(model) {
    const body = new Batch();
    const rest = new Batch();
    const identity = new THREE.Matrix4();
    for (const { geometry, color, paint } of model.parts) {
        (paint ? body : rest).add(geometry, identity, paint ? 0xffffff : color);
    }
    return { body: body.build(), rest: rest.build() };
}

// A drivable / moving car: a group with the two meshes.
export function createCarMesh(geometries, bodyMaterial, restMaterial) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(geometries.body, bodyMaterial);
    const rest = new THREE.Mesh(geometries.rest, restMaterial);
    body.castShadow = true;
    rest.castShadow = true;
    group.add(body, rest);
    return group;
}

// Copies a parked car into the batches. hi: detailed, lo: a two-box stand-in.
export function addCar(sink, model, x, z, yaw, paint, detailed = true) {
    const place = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
    const part = new THREE.Matrix4();
    if (detailed) {
        for (const { geometry, color, paint: painted } of model.parts) {
            sink.hi.car.add(geometry, part.copy(place), painted ? paint : color);
        }
    }
    const lo = sink.lo.car;
    const h = model.height;
    lo.add(PRIMS.box, part.copy(place).multiply(transform(0, 0.62, 0, model.width, 0.62, model.length)), paint);
    lo.add(PRIMS.box, part.copy(place).multiply(transform(0, h - 0.25, -0.1, model.width - 0.2, 0.5, model.length * 0.5)), GLASS);
}

// Brake and reversing lights for a car that moves (traffic, the player's,
// the police): lit boxes over the tail lights plus a soft glow.
let glowMap = null;
function lightGlow() {
    if (glowMap) return glowMap;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    glowMap = new THREE.CanvasTexture(canvas);
    return glowMap;
}

const lightBox = new THREE.BoxGeometry(1, 1, 1);
export function addCarLights(group, model) {
    const half = model.length / 2;
    const brake = new THREE.MeshBasicMaterial({ color: 0x4a080a });
    const reverse = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });
    const brakeGlow = new THREE.SpriteMaterial({ map: lightGlow(), color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const reverseGlow = new THREE.SpriteMaterial({ map: lightGlow(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    for (const side of [-1, 1]) {
        const x = side * (model.width / 2 - 0.25);
        const lamp = new THREE.Mesh(lightBox, brake);
        lamp.position.set(x, model.tail, -half - 0.055);
        lamp.scale.set(0.3, 0.1, 0.02);
        const glow = new THREE.Sprite(brakeGlow);
        glow.position.set(x, model.tail, -half - 0.2);
        glow.scale.setScalar(0.9);
        const white = new THREE.Mesh(lightBox, reverse);
        white.position.set(side * (model.width / 2 - 0.5), model.tail - 0.1, -half - 0.055);
        white.scale.set(0.12, 0.06, 0.02);
        const whiteGlow = new THREE.Sprite(reverseGlow);
        whiteGlow.position.set(side * (model.width / 2 - 0.5), model.tail - 0.1, -half - 0.2);
        whiteGlow.scale.setScalar(0.42);
        group.add(lamp, glow, white, whiteGlow);
    }
    let state = '';
    group.userData.lights = {
        set(braking, reversing) {
            const key = `${braking ? 1 : 0}${reversing ? 1 : 0}`;
            if (key === state) return;
            state = key;
            brake.color.set(braking ? 0xff1a1a : 0x4a080a);
            brakeGlow.opacity = braking ? 0.85 : 0;
            reverse.color.set(reversing ? 0xffffff : 0x3a3a3a);
            reverseGlow.opacity = reversing ? 0.7 : 0;
        },
        get braking() { return state[0] === '1'; },
        get reversing() { return state[1] === '1'; }
    };
}
