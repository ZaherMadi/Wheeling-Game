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
    hatch: { length: 4.05, width: 1.76, belt: 0.97, roof: 1.48, wheelbase: 2.55, radius: 0.31, nose: 0.8, tail: 1.0,
        cabin: [[-1.82, 1.0], [-1.6, 1.45], [0.35, 1.47], [1.1, 0.97]] },
    suv: { length: 4.6, width: 1.9, belt: 1.12, roof: 1.72, wheelbase: 2.75, radius: 0.37, nose: 1.0, tail: 1.12,
        cabin: [[-2.2, 1.12], [-2.05, 1.7], [0.55, 1.72], [1.25, 1.12]] },
    van: { length: 5.1, width: 1.98, belt: 1.15, roof: 2.0, wheelbase: 3.1, radius: 0.34, nose: 1.0, tail: 1.9,
        cabin: [[1.0, 1.15], [1.05, 1.95], [1.3, 1.98], [2.05, 1.15]] },
    // Low two-door sports car (unlocked last in free roam).
    coupe: { length: 4.5, width: 1.92, belt: 0.86, roof: 1.22, wheelbase: 2.62, radius: 0.34, nose: 0.66, tail: 0.92,
        cabin: [[-1.25, 0.86], [-0.55, 1.2], [0.2, 1.22], [1.15, 0.86]] }
};

// Free roam: which cars can be driven, from how many points earned in
// competitive runs (the nicer the car, the more points).
export const CAR_UNLOCKS = { hatch: 0, sedan: 250, van: 600, suv: 1200, coupe: 2500 };
export const CAR_NAMES = { hatch: 'Citadine', sedan: 'Berline', van: 'Utilitaire', suv: 'SUV', coupe: 'Coupé sport' };

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
        add(extrude(roof, m.width - 0.14, 0.05), 0xffffff, true);
        const pillar = (z0, y0, z1, y1, thickness = 0.09) => {
            const dz = z1 - z0;
            const dy = y1 - y0;
            const length = Math.hypot(dz, dy);
            for (const side of [-1, 1]) {
                const g = PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 - 0.1), (y0 + y1) / 2, (z0 + z1) / 2,
                    0.04, length, thickness, Math.atan2(dz, dy), 0, 0));
                add(g, 0xffffff, true);
            }
        };
        pillar(m.cabin[3][0], m.cabin[3][1], m.cabin[2][0], m.cabin[2][1]);
        pillar(m.cabin[0][0], m.cabin[0][1], m.cabin[1][0], m.cabin[1][1], 0.14);
        const b = (m.cabin[1][0] + m.cabin[2][0]) / 2 + 0.1;
        pillar(b, m.belt, b, m.roof - 0.04, 0.1);
    }
    // Wheels: tyre, alloy rim (silver lip, dark wheel well, five-ish
    // spokes), hub.
    for (const z of [front, rear]) {
        for (const side of [-1, 1]) {
            const x = side * (m.width / 2 - 0.13);
            add(PRIMS.cylinder.clone().rotateZ(Math.PI / 2).applyMatrix4(transform(x, m.radius, z, 0.22, m.radius, m.radius)), TYRE);
            add(PRIMS.cylinder.clone().rotateZ(Math.PI / 2).applyMatrix4(transform(x + side * 0.02, m.radius, z, 0.2, m.radius * 0.64, m.radius * 0.64)), RIM);
            add(PRIMS.cylinder.clone().rotateZ(Math.PI / 2).applyMatrix4(transform(x + side * 0.024, m.radius, z, 0.2, m.radius * 0.55, m.radius * 0.55)), WELL);
            for (let k = 0; k < 3; k++) {
                add(PRIMS.box.clone().applyMatrix4(transform(x + side * 0.112, m.radius, z, 0.02, m.radius * 1.08, 0.055, (k * Math.PI) / 3, 0, 0)), RIM);
            }
            add(PRIMS.cylinder6.clone().rotateZ(Math.PI / 2).applyMatrix4(transform(x + side * 0.03, m.radius, z, 0.2, m.radius * 0.18, m.radius * 0.18)), TRIM);
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
    add(PRIMS.cylinder6.clone().rotateX(Math.PI / 2).applyMatrix4(transform(m.width * 0.3, 0.33, -half - 0.03, 0.045, 0.045, 0.14)), RIM);
    // Lights, grille, plates, mirrors, door handles.
    for (const side of [-1, 1]) {
        add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 - 0.3), m.nose * 0.82, half - 0.02, 0.36, 0.12, 0.08)), 0xf4f1e6);
        add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 - 0.25), (name === 'van' ? 1.0 : m.tail * 0.86), -half - 0.02, 0.32, 0.12, 0.06)), 0xb3141a);
        add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 + 0.06), m.belt + 0.08, m.cabin[3][0] - 0.25, 0.14, 0.1, 0.18)), 0xffffff, true);
        for (const z of [0.3, -0.75]) add(PRIMS.box.clone().applyMatrix4(transform(side * (m.width / 2 + 0.005), m.belt - 0.12, z, 0.02, 0.03, 0.16)), TRIM);
    }
    add(PRIMS.box.clone().applyMatrix4(transform(0, m.nose * 0.62, half + 0.01, m.width * 0.45, 0.16, 0.06)), TRIM);
    add(PRIMS.box.clone().applyMatrix4(transform(0, 0.52, half + 0.04, 0.52, 0.11, 0.02)), 0xf2f2f2);
    add(PRIMS.box.clone().applyMatrix4(transform(0, 0.62, -half - 0.05, 0.52, 0.11, 0.02)), 0xf2f2f2);
    add(PRIMS.box.clone().applyMatrix4(transform(0, 0.36, 0, m.width - 0.2, 0.14, m.length - 0.4)), TRIM);
    return { parts, length: m.length, width: m.width, height: m.roof, tail: name === 'van' ? 1.0 : m.tail * 0.86 };
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
