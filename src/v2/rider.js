// Rider + motorcycle for the realistic version. Built from primitives (no
// model download) and fully articulated: steering, suspension, spinning
// wheels, and a rider whose arms and legs follow the bike through IK.
// Purely visual: it reads the simulation state and never writes to it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createGlowTexture, createJerseyTexture } from './textures.js';

const REAR_AXLE_Z = -0.72;
const FRONT_AXLE_Z = 0.73;
const REAR_RADIUS = 0.36;
const FRONT_RADIUS = 0.34;
const STEERING_HEAD = new THREE.Vector3(0, 1.02, 0.5);
const RAKE = Math.atan2(FRONT_AXLE_Z - STEERING_HEAD.z, STEERING_HEAD.y - FRONT_RADIUS);
const FORK_LENGTH = Math.hypot(FRONT_AXLE_Z - STEERING_HEAD.z, STEERING_HEAD.y - FRONT_RADIUS);
const PELVIS_REST = new THREE.Vector3(0, 1.0, -0.28);

// Stunts: what each adds to the riding position at full blend.
//   torso: the body leant (rad, + forwards); up / forward: the pelvis moved
//   (m); yaw / roll: the pelvis turned.
//   hands / feet: where they go instead of the grips / pegs. at: [x, y, z]
//   for the rider's left (+x), mirrored for the right, or one point per
//   side ([right, left]); in the pelvis's space (it follows the body) or
//   the bike's ('rider': the seat, the tail). bend: the elbows / knees.
//   side: only that hand / foot (-1 right, 1 left).
// The first three were the only ones; the others came with the freestyle
// (ground: any but `air: true`).
export const TRICKS = {
    superman: { torso: 0.62, up: 0.16, feet: { at: [0.14, 0.12, -0.95] } },
    nohander: { torso: -0.2, up: 0.04, hands: { at: [0.5, 1.05, 0.05], bend: [1, 0.3, -0.2] } },
    cancan: { yaw: 0.35, feet: { at: [0.34, -0.4, 0.32], side: -1, mirror: false } },
    // Heels clicked together over the bars.
    heelclicker: { torso: -0.22, up: 0.1, feet: { at: [0.05, 0.3, 0.78], bend: [1, 0.5, 0.2] } },
    // A leg swung back over the tail to the other side.
    nacnac: { torso: 0.15, yaw: -0.55, roll: 0.18, feet: { at: [-0.32, -0.25, -0.72], side: 1, mirror: false, bend: [0.4, 0.8, -0.3] } },
    // Standing (crouched) on the seat, hands on the bars.
    seatstand: { torso: 0.42, up: 0.4, forward: 0.06, feet: { at: [[-0.08, 0.93, -0.4], [0.08, 0.93, -0.2]], space: 'rider', bend: [0.5, 0.2, 1] } },
    // Surfing: upright on the seat, sideways, arms out.
    surf: {
        torso: -0.32, up: 0.6, yaw: 1.05, forward: -0.02,
        feet: { at: [[-0.02, 0.93, -0.5], [0.02, 0.93, -0.1]], space: 'rider', bend: [0.3, 0.1, 1] },
        hands: { at: [0.6, 0.5, 0.02], bend: [1, -0.4, -0.3] }
    },
    // Air only -----------------------------------------------------------
    // Only the hands on the bars, the body straight up over them.
    handstand: { air: true, torso: 2.05, up: 0.72, forward: 0.5, feet: { at: [0.1, -0.9, 0.04], bend: [0.3, 0, 1] } },
    // Nothing: hands and feet off, thrown wide.
    nothing: { air: true, torso: -0.3, up: 0.28, hands: { at: [0.62, 0.78, 0.08], bend: [1, 0.2, -0.3] }, feet: { at: [0.5, -0.6, 0.36], bend: [1, 0.3, 0.6] } },
    // Lying back on the seat, arms stretched behind the head.
    lazyboy: { air: true, torso: -1.15, up: 0.02, forward: 0.1, hands: { at: [0.2, 1.02, -0.1], bend: [1, 0.2, 0.4] }, feet: { at: [0.17, -0.72, 0.5], bend: [0.6, 0.6, 0.6] } },
    // Superman seat grab: the hands on the tail, the body flying behind.
    seatgrab: {
        air: true, torso: 1.2, up: 0.42, forward: -0.78,
        hands: { at: [[-0.1, 0.96, -0.72], [0.1, 0.96, -0.72]], space: 'rider', bend: [1, -0.3, 0.2] },
        feet: { at: [0.14, -0.88, -0.06], bend: [0.3, 0.2, 1] }
    }
};
const UP = new THREE.Vector3(0, 1, 0);
// The street is drawn at arcade scale (20-unit road), so the bike is too.
const SCALE = 1.7;
// Free roam is next to life-size cars and people: a smaller bike, and the
// rider on foot at about 1.85 m (helmet included).
export const ROAM_SCALE = 1.1;
const WALK_SCALE = 0.95;
const WALK_REFERENCE = 0.05;

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const euler = new THREE.Euler();

function transform(px, py, pz, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    position.set(px, py, pz);
    quaternion.setFromEuler(euler.set(rx, ry, rz));
    scale.set(sx, sy, sz);
    return matrix.compose(position, quaternion, scale);
}

// Groups primitives by material and merges each group into a single mesh.
class Parts {
    constructor() {
        this.byMaterial = new Map();
    }

    add(material, geometry, mat) {
        const part = geometry.clone().applyMatrix4(mat);
        if (!this.byMaterial.has(material)) this.byMaterial.set(material, []);
        this.byMaterial.get(material).push(part);
        return this;
    }

    build(parent) {
        this.byMaterial.forEach((parts, material) => {
            const mesh = new THREE.Mesh(mergeGeometries(parts, false), material);
            parts.forEach((part) => part.dispose());
            mesh.castShadow = true;
            parent.add(mesh);
        });
        this.byMaterial.clear();
    }
}

const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

// The hood on the back (shared with the podium figures): high and short, so
// it stops above the name printed across the shoulders.
export const HOOD_TRANSFORM = () => transform(0, 0.585, -0.1, 0.16, 0.11, 0.1, -1.95);

// Gloss black helmet with the 5HC mark on both sides and a stripe at the
// back (sphere UVs: u 0 = left side, 0.25 = front, 0.5 = right, 0.75 = back).
export function createHelmetTexture(base = '#0a0a0c', accent = '#f2c014', number = '51') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 96, 512, 7);
    ctx.font = 'italic 900 44px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const u of [0, 0.5, 1]) {
        ctx.lineWidth = 6;
        ctx.strokeStyle = base;
        ctx.strokeText('5HC', u * 512, 76);
        ctx.fillText('5HC', u * 512, 76);
    }
    ctx.font = '900 40px "Arial Black", Arial, sans-serif';
    ctx.fillText(number, 0.75 * 512, 72);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

// The Arai: a racing helmet's paint. A band over the crown, swept wings on
// both sides, pinstripes, the number at the back (same UVs as above).
export function createAraiTexture(base = '#f2f2f0', accent = '#e8282e', number = '51') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 256);
    // Crown band from the front over the top to the back.
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 512, 34);
    // Wings sweeping back on each side (u 0 / 1 = left, 0.5 = right).
    for (const centre of [0, 0.5, 1]) {
        const x = centre * 512;
        ctx.beginPath();
        ctx.moveTo(x - 70, 140);
        ctx.quadraticCurveTo(x, 60, x + 90, 44);
        ctx.lineTo(x + 110, 64);
        ctx.quadraticCurveTo(x + 10, 92, x - 40, 150);
        ctx.closePath();
        ctx.fill();
    }
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.lineTo(512, 40);
    ctx.stroke();
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 168, 512, 6);
    ctx.font = '900 46px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = base;
    ctx.strokeText(number, 0.75 * 512, 100);
    ctx.fillStyle = accent;
    ctx.fillText(number, 0.75 * 512, 100);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

// Number plate, French style: blue bands (F on the left, 06 on the right),
// the player's text in the middle (8 characters at most).
export function createPlateTexture(text = '51-WHEEL') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 232;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f7f2';
    ctx.fillRect(0, 0, 512, 232);
    ctx.fillStyle = '#1d3f9e';
    ctx.fillRect(0, 0, 62, 232);
    ctx.fillRect(450, 0, 62, 232);
    ctx.fillStyle = '#f4c20d';
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(31 + Math.cos(a) * 17, 70 + Math.sin(a) * 17, 3.2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 46px Arial, sans-serif';
    ctx.fillText('F', 31, 168);
    ctx.font = '900 40px Arial, sans-serif';
    ctx.fillText('06', 481, 168);
    ctx.fillStyle = '#111';
    const label = String(text || '').toUpperCase().slice(0, 8);
    let size = 120;
    ctx.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
    while (size > 40 && ctx.measureText(label).width > 370) {
        size -= 4;
        ctx.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
    }
    ctx.fillText(label, 256, 122);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#111';
    ctx.strokeRect(4, 4, 504, 224);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

export function createRider({ scene }) {
    // --- Materials --------------------------------------------------------
    const standard = (color, roughness, metalness = 0) =>
        new THREE.MeshStandardMaterial({ color, roughness, metalness });
    // Livery of the 51Wheling logo: black and yellow bike, yellow hoodie
    // with 51 on the back, black helmet marked 5HC, black joggers, white
    // sneakers.
    const paint = standard(0xf2c014, 0.3, 0.35);
    const rubber = standard(0x0c0c0e, 0.88);
    const darkMetal = standard(0x17181b, 0.42, 0.7);
    const chrome = standard(0xc4cad1, 0.18, 1);
    const gold = standard(0xd9a21b, 0.25, 1);
    const seatMaterial = standard(0x101114, 0.7);
    const jersey = standard(0xf6c416, 0.86);
    const jerseyDark = standard(0xd9a80f, 0.9);
    const jerseyPrint = new THREE.MeshStandardMaterial({ map: createJerseyTexture(), roughness: 0.86 });
    const jerseyAccent = jersey.color.clone();
    const pants = standard(0x16181d, 0.85);
    const helmet = new THREE.MeshStandardMaterial({ map: createHelmetTexture(), roughness: 0.12, metalness: 0.2 });
    const helmetShell = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.12, metalness: 0.2 });
    // Smoked visor with an iridescent sheen (no face to be seen behind it).
    const visor = new THREE.MeshPhysicalMaterial({
        color: 0x0a0e16, metalness: 0.55, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
        iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 680], envMapIntensity: 2.2
    });
    const glove = standard(0x0e0e10, 0.6);
    // The shoes' colour can change (unlocked); the hoodie's cords stay white.
    const sneaker = standard(0xf2f2f0, 0.62);
    const cords = standard(0xf2f2f0, 0.62);
    // The Arai (unlocked): its paint and a shell coloured to match.
    const arai = new THREE.MeshStandardMaterial({ map: createAraiTexture(), roughness: 0.1, metalness: 0.15 });
    const araiShell = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.12, metalness: 0.2 });
    const sole = standard(0xd8d8d6, 0.75);
    const plate = standard(0xe9e9e4, 0.6);
    const tailLight = new THREE.MeshBasicMaterial({ color: 0xff2a1f });
    const headLight = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
    const glowTexture = createGlowTexture();
    const materials = [
        paint, rubber, darkMetal, chrome, gold, seatMaterial, jersey, jerseyDark, jerseyPrint, pants, helmet, helmetShell, visor,
        glove, sneaker, cords, arai, araiShell, sole, plate, tailLight, headLight
    ];

    // --- Primitives -------------------------------------------------------
    const box = new THREE.BoxGeometry(1, 1, 1);
    const sphere = new THREE.SphereGeometry(1, 18, 12);
    const tube = new THREE.CylinderGeometry(1, 1, 1, 12);
    const axleTube = new THREE.CylinderGeometry(1, 1, 1, 20).rotateZ(Math.PI / 2);

    // --- Hierarchy --------------------------------------------------------
    const bikeGroup = new THREE.Group();
    bikeGroup.scale.setScalar(SCALE);
    const bikePivot = new THREE.Group();
    bikePivot.position.set(0, REAR_RADIUS, REAR_AXLE_Z);
    bikeGroup.add(bikePivot);
    const rig = new THREE.Group();
    rig.position.set(0, -REAR_RADIUS, -REAR_AXLE_Z);
    bikePivot.add(rig);
    const chassis = new THREE.Group();
    rig.add(chassis);

    // Chassis
    const frame = new Parts();
    frame.add(darkMetal, box, transform(0, 0.5, 0.06, 0.34, 0.36, 0.46));
    frame.add(darkMetal, box, transform(0, 0.73, 0.15, 0.3, 0.2, 0.3, -0.3));
    frame.add(darkMetal, box, transform(0, 0.8, 0.2, 0.22, 0.12, 0.56, -0.25));
    frame.add(darkMetal, box, transform(0, 0.62, 0.37, 0.28, 0.24, 0.05, -0.15));
    frame.add(paint, sphere, transform(0, 0.95, 0.17, 0.2, 0.16, 0.34, -0.08));
    frame.add(paint, box, transform(0, 0.99, -0.74, 0.21, 0.11, 0.36, 0.22));
    frame.add(paint, box, transform(0.12, 0.8, 0.02, 0.03, 0.2, 0.42, -0.3));
    frame.add(paint, box, transform(-0.12, 0.8, 0.02, 0.03, 0.2, 0.42, -0.3));
    frame.add(seatMaterial, box, transform(0, 0.94, -0.36, 0.27, 0.09, 0.56, 0.06));
    frame.add(darkMetal, box, transform(0, 0.78, -0.8, 0.2, 0.035, 0.42, 0.35));

    for (const side of [-1, 1]) {
        frame.add(darkMetal, box, transform(side * 0.13, 0.39, -0.385, 0.05, 0.075, 0.69, 0.045));
        frame.add(chrome, tube, transform(side * 0.2, 0.45, -0.27, 0.022, 0.12, 0.022, 0, 0, Math.PI / 2));
        frame.add(darkMetal, box, transform(side * 0.15, 0.5, -0.2, 0.03, 0.14, 0.22, 0.5));
    }
    frame.add(chrome, tube, transform(-0.17, 0.44, -0.2, 0.045, 0.66, 0.045, Math.PI / 2 - 0.1));
    frame.add(darkMetal, tube, transform(-0.2, 0.56, -0.68, 0.085, 0.46, 0.085, Math.PI / 2 - 0.3));
    frame.add(chrome, tube, transform(-0.2, 0.63, -0.9, 0.06, 0.04, 0.06, Math.PI / 2 - 0.3));
    frame.build(chassis);

    // The number plate under the tail (customised, can be torn off).
    const plateFace = new THREE.MeshStandardMaterial({ map: createPlateTexture(), roughness: 0.45, metalness: 0.15 });
    const plateMesh = new THREE.Mesh(box, [plate, plate, plate, plate, plate, plateFace]);
    const PLATE_REST = { x: 0, y: 0.74, z: -1.0, tilt: 0.25 };
    plateMesh.scale.set(0.24, 0.105, 0.012);
    plateMesh.castShadow = true;
    let plateEnabled = false;
    let plateText = '';
    const loosePlate = { active: false, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), rest: false };
    function restPlate() {
        if (plateMesh.parent !== chassis) chassis.add(plateMesh);
        plateMesh.position.set(PLATE_REST.x, PLATE_REST.y, PLATE_REST.z);
        plateMesh.rotation.set(PLATE_REST.tilt, 0, 0);
        plateMesh.scale.set(0.24, 0.105, 0.012);
        plateMesh.visible = plateEnabled;
        loosePlate.active = false;
    }
    restPlate();

    const tailLamp = new THREE.Mesh(box, tailLight);
    tailLamp.position.set(0, 0.985, -0.925);
    tailLamp.scale.set(0.2, 0.075, 0.04);
    tailLamp.rotation.x = 0.22;
    chassis.add(tailLamp);
    const tailGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture, color: 0xff2a1f, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    }));
    tailGlow.position.set(0, 0.985, -0.96);
    chassis.add(tailGlow);

    // Wheels
    function createWheel(radius, tubeRadius, width) {
        const wheel = new THREE.Group();
        const parts = new Parts();
        const tyre = new THREE.TorusGeometry(radius - tubeRadius, tubeRadius, 10, 26).rotateY(Math.PI / 2);
        parts.add(rubber, tyre, transform(0, 0, 0, width / (tubeRadius * 2), 1, 1));
        const rim = radius - tubeRadius * 1.55;
        parts.add(darkMetal, axleTube, transform(0, 0, 0, width * 0.55, rim + 0.05, rim + 0.05));
        parts.add(chrome, axleTube, transform(width * 0.36, 0, 0, 0.012, rim * 0.72, rim * 0.72));
        parts.add(chrome, axleTube, transform(0, 0, 0, width * 0.9, 0.035, 0.035));
        for (let i = 0; i < 5; i++) {
            parts.add(darkMetal, box, transform(0, 0, 0, width * 0.62, rim * 1.9, 0.03, (i / 5) * Math.PI));
        }
        // Yellow rim stripe, as on the logo.
        const stripe = new THREE.TorusGeometry(rim + 0.035, 0.012, 6, 32).rotateY(Math.PI / 2);
        for (const side of [-1, 1]) parts.add(paint, stripe, transform(side * width * 0.3, 0, 0));
        parts.build(wheel);
        tyre.dispose();
        stripe.dispose();
        return wheel;
    }
    const rearWheel = createWheel(REAR_RADIUS, 0.125, 0.3);
    rearWheel.position.set(0, REAR_RADIUS, REAR_AXLE_Z);
    rig.add(rearWheel);

    // Front end: tilt by the rake, then steer about the fork axis.
    const forkTilt = new THREE.Group();
    forkTilt.position.copy(STEERING_HEAD);
    forkTilt.rotation.x = -RAKE;
    chassis.add(forkTilt);
    const fork = new THREE.Group();
    forkTilt.add(fork);
    const forkParts = new Parts();
    for (const side of [-1, 1]) {
        forkParts.add(gold, tube, transform(side * 0.11, -FORK_LENGTH / 2 + 0.03, 0, 0.03, FORK_LENGTH + 0.1, 0.03));
        forkParts.add(darkMetal, tube, transform(side * 0.11, -FORK_LENGTH + 0.16, 0, 0.042, 0.34, 0.042));
        forkParts.add(rubber, tube, transform(side * 0.33, 0.13, -0.06, 0.027, 0.13, 0.027, 0, 0, Math.PI / 2));
    }
    forkParts.add(darkMetal, box, transform(0, 0.03, 0, 0.3, 0.05, 0.1));
    forkParts.add(darkMetal, box, transform(0, -0.12, 0, 0.3, 0.04, 0.09));
    forkParts.add(chrome, tube, transform(0, 0.13, -0.06, 0.017, 0.62, 0.017, 0, 0, Math.PI / 2));
    forkParts.add(darkMetal, box, transform(0, 0.08, -0.03, 0.14, 0.1, 0.05));
    forkParts.add(paint, box, transform(0, -FORK_LENGTH + FRONT_RADIUS + 0.03, 0.02, 0.16, 0.035, 0.46, 0.05));
    forkParts.add(paint, box, transform(0, -0.02, 0.13, 0.26, 0.2, 0.05, -0.2));
    forkParts.add(darkMetal, sphere, transform(0, -0.07, 0.12, 0.1, 0.1, 0.08));
    forkParts.build(fork);
    const headLamp = new THREE.Mesh(sphere, headLight);
    headLamp.position.set(0, -0.07, 0.17);
    headLamp.scale.set(0.075, 0.075, 0.04);
    fork.add(headLamp);
    const frontWheel = createWheel(FRONT_RADIUS, 0.1, 0.2);
    frontWheel.position.set(0, -FORK_LENGTH, 0);
    fork.add(frontWheel);
    const grips = [-1, 1].map((side) => {
        const target = new THREE.Object3D();
        target.position.set(side * 0.33, 0.15, -0.07);
        fork.add(target);
        return target;
    });
    const pegs = [-1, 1].map((side) => {
        const target = new THREE.Object3D();
        target.position.set(side * 0.21, 0.5, -0.27);
        chassis.add(target);
        return target;
    });

    // Rider
    const riderGroup = new THREE.Group();
    chassis.add(riderGroup);
    const pelvis = new THREE.Group();
    pelvis.name = 'pelvis';
    pelvis.position.copy(PELVIS_REST);
    riderGroup.add(pelvis);
    const body = new Parts();
    body.add(pants, sphere, transform(0, 0.03, 0, 0.2, 0.15, 0.17));
    // Hoodie body turned from a profile: waist, chest, shoulders sloping to
    // the neck. Wider than deep, like a real torso.
    const profile = [[0.0, 0.0], [0.15, 0.0], [0.162, 0.1], [0.18, 0.24], [0.188, 0.38], [0.178, 0.46], [0.14, 0.53], [0.085, 0.58], [0.0, 0.6]]
        .map(([r, y]) => new THREE.Vector2(r, y));
    const torsoGeometry = new THREE.LatheGeometry(profile, 24);
    body.add(jersey, torsoGeometry, transform(0, 0.02, 0, 1.22, 1, 0.9));
    for (const side of [-1, 1]) body.add(jersey, sphere, transform(side * 0.205, 0.445, 0, 0.082, 0.08, 0.08));
    // The number across the back follows the same surface.
    const printProfile = profile.slice(2, 6).map((point) => new THREE.Vector2(point.x * 1.012, point.y));
    const printGeometry = new THREE.LatheGeometry(printProfile, 12, Math.PI - 0.95, 1.9);
    body.add(jerseyPrint, printGeometry, transform(0, 0.02, 0, 1.22, 1, 0.9));
    // Hoodie: hood resting on the back, ribbed hem, front pocket, drawstrings.
    // Folded high against the neck: the name across the shoulders shows.
    const hood = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    body.add(jersey, hood, HOOD_TRANSFORM());
    body.add(jerseyDark, new THREE.TorusGeometry(0.13, 0.035, 6, 16), transform(0, 0.6, -0.02, 1.05, 1, 0.9, Math.PI / 2 - 0.25));
    body.add(jerseyDark, new THREE.CylinderGeometry(0.165, 0.152, 0.07, 24), transform(0, 0.045, 0, 1.23, 1, 0.92));
    body.add(jerseyDark, box, transform(0, 0.17, 0.17, 0.26, 0.13, 0.03, 0.12));
    for (const side of [-1, 1]) body.add(cords, tube, transform(side * 0.045, 0.47, 0.16, 0.007, 0.16, 0.007, 0.25));
    body.add(pants, tube, transform(0, 0.6, 0.01, 0.06, 0.1, 0.06));
    body.build(pelvis);
    torsoGeometry.dispose();
    printGeometry.dispose();
    hood.dispose();

    const head = new THREE.Group();
    head.position.set(0, 0.74, 0.03);
    pelvis.add(head);
    // Full-face helmet: shell, chin bar, a wide tinted visor that hides the
    // face completely, visor pivots, vents, rear spoiler, neck roll.
    const headParts = new Parts();
    const shell = new THREE.SphereGeometry(1, 28, 18);
    headParts.add(helmet, shell, transform(0, 0.06, -0.005, 0.215, 0.212, 0.238));
    const chin = new THREE.SphereGeometry(1, 24, 8, Math.PI * 0.5 - 1.05, 2.1, Math.PI * 0.56, Math.PI * 0.24);
    headParts.add(helmetShell, chin, transform(0, 0.05, 0.012, 0.222, 0.235, 0.252));
    headParts.add(rubber, new THREE.SphereGeometry(1, 16, 10), transform(0, 0.05, 0, 0.2, 0.2, 0.22));
    const visorGeometry = new THREE.SphereGeometry(1, 30, 10, Math.PI * 0.5 - 1.2, 2.4, Math.PI * 0.3, Math.PI * 0.27);
    headParts.add(visor, visorGeometry, transform(0, 0.062, 0.004, 0.229, 0.224, 0.254));
    for (const side of [-1, 1]) {
        headParts.add(darkMetal, tube, transform(side * 0.222, 0.075, 0.03, 0.03, 0.012, 0.03, 0, 0, Math.PI / 2));
    }
    headParts.add(helmetShell, box, transform(0, 0.2, -0.2, 0.17, 0.035, 0.07, 0.5));
    headParts.add(rubber, new THREE.TorusGeometry(0.15, 0.035, 8, 20), transform(0, -0.13, 0, 1.15, 1.25, 1, Math.PI / 2));
    const classicHead = new THREE.Group();
    head.add(classicHead);
    headParts.build(classicHead);
    // The Arai: longer shell, a sharper chin bar, crown vents, a big rear
    // spoiler and visor pods; the same tinted visor.
    const araiHead = new THREE.Group();
    araiHead.visible = false;
    head.add(araiHead);
    const araiParts = new Parts();
    araiParts.add(arai, shell, transform(0, 0.065, -0.012, 0.219, 0.216, 0.252));
    araiParts.add(araiShell, chin, transform(0, 0.045, 0.02, 0.226, 0.24, 0.262));
    araiParts.add(araiShell, box, transform(0, -0.06, 0.225, 0.13, 0.05, 0.05, -0.35));
    araiParts.add(visor, visorGeometry, transform(0, 0.064, 0.008, 0.233, 0.227, 0.262));
    for (const side of [-1, 1]) {
        araiParts.add(araiShell, tube, transform(side * 0.226, 0.078, 0.034, 0.038, 0.016, 0.038, 0, 0, Math.PI / 2));
        araiParts.add(darkMetal, box, transform(side * 0.05, 0.27, 0.06, 0.04, 0.025, 0.07, -0.25));
    }
    araiParts.add(araiShell, box, transform(0, 0.22, -0.21, 0.21, 0.04, 0.1, 0.6));
    araiParts.add(darkMetal, box, transform(0, 0.24, -0.2, 0.19, 0.012, 0.07, 0.6));
    araiParts.add(rubber, new THREE.TorusGeometry(0.15, 0.035, 8, 20), transform(0, -0.13, 0, 1.15, 1.25, 1, Math.PI / 2));
    araiParts.build(araiHead);
    for (const geometry of [shell, chin, visorGeometry]) geometry.dispose();

    const shoulders = [-1, 1].map((side) => {
        const target = new THREE.Object3D();
        target.position.set(side * 0.215, 0.49, 0);
        pelvis.add(target);
        return target;
    });
    const hips = [-1, 1].map((side) => {
        const target = new THREE.Object3D();
        target.position.set(side * 0.12, 0, 0.02);
        pelvis.add(target);
        return target;
    });

    function createLimb(lengthA, lengthB, radius, materialA, materialB) {
        const make = (length, material) => {
            const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 10), material);
            mesh.castShadow = true;
            riderGroup.add(mesh);
            return mesh;
        };
        return { upper: make(lengthA, materialA), lower: make(lengthB, materialB), lengthA, lengthB };
    }
    const arms = [-1, 1].map(() => createLimb(0.34, 0.34, 0.07, jersey, jersey));
    const legs = [-1, 1].map(() => createLimb(0.44, 0.46, 0.088, pants, pants));
    // Gloves wrapped round the grips: palm, fingers, thumb and the cuff.
    const hands = [-1, 1].map((side) => {
        const hand = new THREE.Group();
        const parts = new Parts();
        parts.add(glove, sphere, transform(0, 0.03, 0.0, 0.058, 0.04, 0.062));
        parts.add(glove, box, transform(0, -0.005, 0.05, 0.1, 0.075, 0.035, 0.3));
        parts.add(glove, box, transform(side * -0.06, 0.02, 0.03, 0.035, 0.03, 0.06, 0, 0, 0.5 * side));
        parts.add(jerseyDark, tube, transform(side * 0.08, 0.03, -0.02, 0.05, 0.05, 0.05, 0, 0, Math.PI / 2));
        parts.build(hand);
        riderGroup.add(hand);
        return hand;
    });
    const shoes = [-1, 1].map(() => {
        const shoe = new THREE.Group();
        const parts = new Parts();
        parts.add(sneaker, box, transform(0, 0.025, 0.04, 0.11, 0.095, 0.25));
        parts.add(sneaker, sphere, transform(0, 0.02, 0.16, 0.056, 0.05, 0.06));
        parts.add(sole, box, transform(0, -0.035, 0.05, 0.118, 0.035, 0.29));
        parts.add(darkMetal, box, transform(0, 0.03, 0.05, 0.113, 0.012, 0.12, 0.35));
        parts.build(shoe);
        riderGroup.add(shoe);
        return shoe;
    });

    // Soft contact shadow, keeps the bike grounded even without shadow maps.
    const contactShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
            map: glowTexture, color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
        })
    );
    contactShadow.scale.set(1.5 * SCALE, 1, 3 * SCALE);
    contactShadow.renderOrder = 1;
    scene.add(contactShadow);

    // --- IK ---------------------------------------------------------------
    const root = new THREE.Vector3();
    const target = new THREE.Vector3();
    const joint = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const pole = new THREE.Vector3();
    const segment = new THREE.Vector3();

    function placeSegment(mesh, from, to, nominalLength) {
        segment.subVectors(to, from);
        const length = segment.length();
        mesh.position.copy(from).addScaledVector(segment, 0.5);
        mesh.quaternion.setFromUnitVectors(UP, segment.divideScalar(length || 1));
        mesh.scale.set(1, length / nominalLength, 1);
    }

    // Two-bone IK from `root` to `target` (riderGroup space), bending towards `pole`.
    function solveLimb(limb, poleHint) {
        direction.subVectors(target, root);
        const reach = limb.lengthA + limb.lengthB;
        const distance = Math.min(direction.length(), reach * 0.999);
        direction.normalize();
        target.copy(root).addScaledVector(direction, distance);
        const along = (limb.lengthA * limb.lengthA - limb.lengthB * limb.lengthB + distance * distance) / (2 * distance);
        const height = Math.sqrt(Math.max(0, limb.lengthA * limb.lengthA - along * along));
        pole.copy(poleHint).addScaledVector(direction, -poleHint.dot(direction)).normalize();
        joint.copy(root).addScaledVector(direction, along).addScaledVector(pole, height);
        placeSegment(limb.upper, root, joint, limb.lengthA);
        placeSegment(limb.lower, joint, target, limb.lengthB);
    }

    const toRiderSpace = (object, out) => riderGroup.worldToLocal(object.getWorldPosition(out));
    const elbowHint = new THREE.Vector3();
    const hopPelvis = new THREE.Vector3();
    const kneeHint = new THREE.Vector3();
    const footTarget = new THREE.Vector3();
    const groundFoot = new THREE.Vector3();
    const forkQuaternion = new THREE.Quaternion();
    const handQuaternion = new THREE.Quaternion();

    // --- Animation state --------------------------------------------------
    const pose = {
        lean: 0, steer: 0, torso: 0.42, dive: 0, bounce: 0, bounceVelocity: 0, stop: 1, skid: 0,
        brake: 0, rearSpin: 0, frontSpin: 0, wasAirborne: false, peakAngle: 0, time: 0,
        surge: 0, pump: 0, throttle: 0, lastKmh: 0, lastAngle: 0, trick: 0, trickType: 'superman', tuckAir: 0
    };
    // The rider's fall turns about his own middle (a pivot at the pelvis),
    // not about the bike's base at road level: turning about that point sent
    // his head and shoulders through the road.
    const crashPivot = new THREE.Group();
    crashPivot.name = 'crash-pivot';
    const crash = {
        active: false, time: 0, kind: 'hit', variant: 'tumble', side: 1, landed: false, landTime: 0,
        bikePitch: 0, bikeYaw: 0, bikeSlide: 2.4, style: 'tumble', contacts: 0,
        velocity: new THREE.Vector3(), bikeVelocity: new THREE.Vector3(), spinRates: new THREE.Vector3()
    };
    const getUp = { active: false, t: 0, from: new THREE.Vector3(), fromQuaternion: new THREE.Quaternion(), fromScale: 1,
        to: new THREE.Vector3(), toQuaternion: new THREE.Quaternion(), yaw: 0 };

    // Torn off by the bavette: it flies off behind and slides on the road.
    function tearPlate(unitsPerSecond = 0) {
        if (!plateEnabled || loosePlate.active) return;
        const worldScale = new THREE.Vector3();
        plateMesh.getWorldScale(worldScale);
        scene.attach(plateMesh);
        plateMesh.scale.copy(worldScale);
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(bikeGroup.quaternion);
        loosePlate.velocity.copy(forward).multiplyScalar(Math.min(unitsPerSecond, 40) * 0.55);
        loosePlate.velocity.y = 2.6;
        loosePlate.velocity.x += (Math.random() - 0.5) * 2;
        loosePlate.spin.set(8 + Math.random() * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8);
        loosePlate.active = true;
        loosePlate.rest = false;
    }

    function stepLoosePlate(dt) {
        if (!loosePlate.active || loosePlate.rest) return;
        loosePlate.velocity.y -= 14 * dt;
        plateMesh.position.addScaledVector(loosePlate.velocity, dt);
        plateMesh.rotation.x += loosePlate.spin.x * dt;
        plateMesh.rotation.y += loosePlate.spin.y * dt;
        plateMesh.rotation.z += loosePlate.spin.z * dt;
        if (plateMesh.position.y <= 0.03) {
            plateMesh.position.y = 0.03;
            // Bounces, then slides flat to a stop.
            if (loosePlate.velocity.y < -2) loosePlate.velocity.y *= -0.3;
            else loosePlate.velocity.y = 0;
            loosePlate.velocity.x *= 0.85;
            loosePlate.velocity.z *= 0.85;
            loosePlate.spin.multiplyScalar(0.6);
            if (loosePlate.velocity.lengthSq() < 0.05) {
                plateMesh.rotation.set(-Math.PI / 2, plateMesh.rotation.y, 0);
                loosePlate.rest = true;
            }
        }
    }

    // Where the plate is (sparks of the bavette).
    function platePoint(out) {
        return plateMesh.getWorldPosition(out);
    }

    function reset() {
        restPlate();
        if (riderGroup.parent !== chassis) {
            chassis.add(riderGroup);
            riderGroup.position.set(0, 0, 0);
            riderGroup.rotation.set(0, 0, 0);
            riderGroup.scale.set(1, 1, 1);
            riderGroup.quaternion.identity();
        }
        riderGroup.visible = true;
        crash.active = false;
        Object.assign(pose, {
            lean: 0, steer: 0, torso: 0.42, dive: 0, bounce: 0, bounceVelocity: 0, stop: 1, skid: 0,
            brake: 0, wasAirborne: false, peakAngle: 0, surge: 0, pump: 0, throttle: 0, lastKmh: 0, lastAngle: 0,
            trick: 0, tuckAir: 0
        });
        chassis.position.set(0, 0, 0);
        chassis.rotation.set(0, 0, 0);
        update(0.016, { kmh: 0, throttle: 0, braking: false, steer: 0, angle: 0, angleRatio: 0, skidding: false, linear: true });
    }

    // frame: { kmh, throttle 0..1, braking, steer -1..1 (towards world +x),
    //          angle (rad), angleRatio 0..1, skidding, linear }
    function update(dt, frame) {
        pose.time += dt;
        stepLoosePlate(dt);
        animateRainbow(pose.time);
        const { kmh, throttle, braking, steer, angle, angleRatio, skidding, linear } = frame;
        const speedRatio = Math.min(1, kmh / 200);
        const airborne = angleRatio > 0.015;

        // Roll into the corner; less when balancing on the back wheel.
        const leanTarget = steer * (0.1 + 0.34 * Math.min(1, kmh / 120)) * (airborne ? 0.55 : 1);
        pose.lean = damp(pose.lean, leanTarget, 9, dt);
        pose.stop = damp(pose.stop, kmh < 4 && linear && !airborne ? 1 : 0, kmh < 4 ? 5 : 12, dt);
        pose.skid = damp(pose.skid, skidding ? 1 : 0, 10, dt);
        pose.brake = damp(pose.brake, braking ? 1 : 0, 14, dt);
        if ((linear || frame.freeBike) && !skidding) bikeGroup.rotation.z = pose.lean + pose.stop * 0.07 + (frame.wobble || 0);

        // Bars: wide steering at walking pace, still visible at speed.
        const steerTarget = -steer * (0.34 - 0.2 * Math.min(1, kmh / 70)) + (skidding ? Math.sin(pose.time * 31) * 0.12 : 0);
        pose.steer = damp(pose.steer, steerTarget, 12, dt);
        fork.rotation.y = pose.steer;

        // Wheels. The front one coasts down while it is in the air.
        const spin = Math.min(26, (kmh / 3.6) / REAR_RADIUS * 0.4);
        pose.rearSpin = spin;
        pose.frontSpin = airborne ? pose.frontSpin * Math.exp(-dt * 0.9) : damp(pose.frontSpin, spin, 14, dt);
        rearWheel.rotation.x += pose.rearSpin * dt;
        frontWheel.rotation.x += pose.frontSpin * dt;

        // Suspension: brake dive / throttle squat, landing thump, road buzz.
        if (airborne) pose.peakAngle = Math.max(pose.peakAngle, angleRatio);
        if (!airborne && pose.wasAirborne) {
            pose.bounceVelocity -= 0.35 + pose.peakAngle * 1.1;
            pose.peakAngle = 0;
        }
        pose.wasAirborne = airborne;
        pose.bounceVelocity += (-pose.bounce * 190 - pose.bounceVelocity * 15) * dt;
        pose.bounce += pose.bounceVelocity * dt;
        const diveTarget = airborne ? 0 : (braking ? 0.04 : -0.022 * throttle);
        pose.dive = damp(pose.dive, diveTarget, 8, dt);
        const buzz = Math.sin(pose.time * 41) * 0.0022 * (1 - speedRatio) +
            Math.sin(pose.time * 23.7) * Math.sin(pose.time * 7.3) * 0.006 * speedRatio;
        chassis.position.y = pose.bounce + buzz;
        chassis.rotation.x = pose.dive - pose.bounce * 0.35;

        // Body language. The rider is pushed back when the bike surges and
        // thrown forward when it slows, pulls on the bars while the front
        // lifts and pushes as it comes down, slides the hips to the inside
        // of a turn and drops the shoulders into it, tucks in at speed.
        if (dt > 0) {
            const accel = (kmh - pose.lastKmh) / dt;
            const lift = (angleRatio - pose.lastAngle) / dt;
            pose.surge = damp(pose.surge, Math.max(-1, Math.min(1, accel / 45)), 6, dt);
            pose.pump = damp(pose.pump, Math.max(-1, Math.min(1, lift * 2.5)), 9, dt);
        }
        pose.lastKmh = kmh;
        pose.lastAngle = angleRatio;
        pose.throttle = damp(pose.throttle, throttle, 14, dt);
        // The throttle twist is a visible gesture (slower than the throttle itself).
        pose.twist = damp(pose.twist || 0, throttle, 7, dt);
        // Stunts (TRICKS), blended in and out quickly. Another one asked
        // while one is shown: back to the riding position first, then out
        // into the new one (never from one straight into the other).
        const wanted = frame.trick && TRICKS[frame.trick] ? frame.trick : null;
        if (wanted && wanted !== pose.trickType && pose.trick > 0.06) {
            pose.trick = damp(pose.trick, 0, 17, dt);
        } else {
            if (wanted) pose.trickType = wanted;
            pose.trick = damp(pose.trick, wanted ? 1 : 0, wanted ? 11 : 8, dt);
        }
        pose.tuckAir = damp(pose.tuckAir, frame.airborne ? 1 : 0, 6, dt);
        // Free roam: crouched over the tank while the gas is held.
        pose.gasTuck = damp(pose.gasTuck || 0, frame.gasTuck || 0, 5, dt);
        const stunt = pose.trick;
        const trick = TRICKS[pose.trickType] || TRICKS.superman;
        // Pulling the bike up (the "animation wheeling" option): a short lean
        // forward over the bars, then back, pulling on them.
        if (frame.liftEffort && !pose.effortOn) {
            pose.effortOn = true;
            pose.effortTime = 0;
        }
        if (!frame.liftEffort) pose.effortOn = false;
        if (pose.effortOn) pose.effortTime += dt;
        const effortTime = pose.effortOn ? pose.effortTime : 9;
        const leanIn = effortTime < 0.16 ? Math.sin(effortTime / 0.16 * Math.PI / 2) * 0.16
            : effortTime < 0.3 ? 0.16 * (1 - (effortTime - 0.16) / 0.14) : 0;
        const pullBack = effortTime < 0.16 ? 0
            : Math.min(1, (effortTime - 0.16) / 0.18) * Math.max(0, 1 - Math.max(0, effortTime - 0.7) / 0.4) * 0.24;
        pose.effort = damp(pose.effort || 0, leanIn - pullBack, 18, dt);
        // Off beside the bike at walking pace (the automatic brake): on the
        // side asked (or up on the pegs), hands on the bars, jogging, then
        // back on. hop: how far off (0 on the seat).
        pose.hop = damp(pose.hop || 0, frame.hop ? 1 : 0, frame.hop ? 10 : 8, dt);
        if (frame.hop) {
            pose.hopSide = frame.hop.side;
            pose.hopTime = frame.hop.t;
        }
        const hop = pose.hop > 0.002 ? pose.hop : 0;
        const hopSide = pose.hopSide || 0;
        const reach = Math.min(1, kmh / 50);
        const hang = pose.lean * reach * (airborne ? 0.5 : 1);
        const tuck = Math.max(0, Math.min(1, (kmh - 120) / 90));
        // Gas held in free roam: crouched over the tank (beats the push back).
        const crouch = pose.gasTuck;
        const torsoTarget = 0.42 + angle * 0.36 + tuck * 0.24 + crouch * 0.36 + (braking ? 0.12 : -0.07 * throttle * (1 - crouch)) - pose.stop * 0.12
            - pose.surge * 0.13 * (1 - 0.75 * crouch) - pose.pump * 0.16 + stunt * (trick.torso || 0) + pose.tuckAir * 0.08;
        pose.torso = damp(pose.torso, torsoTarget + hop * (0.18 - torsoTarget), 7, dt);
        pelvis.rotation.x = pose.torso + pose.effort;
        pelvis.rotation.z = hang * 0.45 - pose.stop * 0.05 + pose.skid * Math.sin(pose.time * 17) * 0.05 + stunt * (trick.roll || 0);
        pelvis.rotation.y = pose.steer * 0.3 + stunt * (trick.yaw || 0);
        pelvis.position.set(
            -hang * 0.2,
            PELVIS_REST.y + angleRatio * 0.04 - tuck * 0.02 - crouch * 0.05 - pose.bounce * 0.4 + stunt * (trick.up || 0),
            PELVIS_REST.z - angleRatio * 0.13 - pose.surge * 0.025 + Math.max(0, -pose.surge) * 0.02 + stunt * (trick.forward || 0)
        );
        if (hop) {
            // Beside the bike (standing, a little behind the bars), or up on
            // the pegs; a little jump on the way off and back on.
            const off = hopSide !== 0;
            hopPelvis.set(off ? hopSide * 0.6 : 0, off ? 0.93 : PELVIS_REST.y + 0.42, PELVIS_REST.z + 0.08);
            pelvis.position.lerp(hopPelvis, hop);
            pelvis.position.y += Math.sin(Math.PI * hop) * 0.16 + (off ? Math.abs(Math.sin((pose.hopTime || 0) * 11)) * 0.03 * hop : 0);
            pelvis.rotation.y += -hopSide * 0.25 * hop;
        }
        // The head stays level and looks where the bike is going (as far
        // as a neck goes, when the body is upside down).
        head.rotation.x = Math.max(-0.95, Math.min(0.95, -(pose.torso - 0.3) * 0.78 + tuck * 0.1));
        head.rotation.y = pose.steer * 1.1;
        head.rotation.z = -(pose.lean + hang * 0.45) * 0.65;
        // Sad (the Love&Faith event): the head hangs, turns slowly, shakes.
        mood.level += (mood.target - mood.level) * Math.min(1, dt * 1.5);
        mood.shake = Math.max(0, mood.shake - dt * 0.7);
        if (mood.level > 0.01 || mood.shake > 0) {
            const t = performance.now() / 1000;
            head.rotation.x += mood.level * (0.3 + Math.sin(t * 1.7) * 0.05);
            head.rotation.y += mood.level * Math.sin(t * 0.7) * 0.3 + mood.shake * Math.sin(t * 10) * 0.28;
            head.rotation.z += mood.level * Math.sin(t * 0.9 + 1) * 0.08;
        }

        // Lights
        tailLight.color.setRGB(0.75 + pose.brake * 0.25, 0.06 + pose.brake * 0.12, 0.05 + pose.brake * 0.08);
        const glowSize = 0.5 + pose.brake * 0.75;
        tailGlow.scale.set(glowSize, glowSize, 1);
        tailGlow.material.opacity = 0.55 + pose.brake * 0.45;

        contactShadow.position.set(bikeGroup.position.x, 0.02, bikeGroup.position.z);
        contactShadow.rotation.y = bikeGroup.rotation.y;
        contactShadow.material.opacity = 0.6 - angleRatio * 0.2;

        if (crash.active) return;
        bikeGroup.updateMatrixWorld(true);

        // Arms: the hands stay on the grips. If the body has moved out of
        // reach, slide it forward on the seat rather than letting go.
        let overreach = 0;
        for (let i = 0; i < 2; i++) {
            toRiderSpace(shoulders[i], root);
            toRiderSpace(grips[i], target);
            if (!(trick.hands && stunt > 0.5)) overreach = Math.max(overreach, root.distanceTo(target) - (arms[i].lengthA + arms[i].lengthB) * 0.97);
        }
        if (overreach > 0) {
            pelvis.position.z += overreach;
            pelvis.updateMatrixWorld(true);
        }
        fork.getWorldQuaternion(forkQuaternion);
        riderGroup.getWorldQuaternion(handQuaternion).invert().multiply(forkQuaternion);
        for (let i = 0; i < 2; i++) {
            const side = i === 0 ? -1 : 1;
            // Inside arm bends, outside arm reaches; elbows flare when tucked,
            // drop when braking, lift when pulling the front up.
            const inside = Math.max(0, -side * hang) * 2.2;
            toRiderSpace(shoulders[i], root);
            toRiderSpace(grips[i], target);
            // Right arm (side < 0): the elbow lifts as the wrist rolls the gas on.
            const twist = side < 0 ? pose.twist : 0;
            elbowHint.set(
                side * (0.85 + tuck * 0.55 + inside * 0.6 + pose.brake * 0.1 + twist * 0.25),
                -0.55 + tuck * 0.3 - pose.brake * 0.25 + pose.pump * 0.25 + twist * 0.55,
                -0.35 - tuck * 0.25 + inside * 0.2 - twist * 0.15
            );
            if (stunt > 0.001 && stuntPoint(trick.hands, side, i, footTarget)) {
                // Off the grips (arms up, out, back to the seat...).
                target.lerp(footTarget, stunt);
                const bend = trick.hands.bend;
                if (bend) elbowHint.set(side * bend[0], bend[1], bend[2]);
            }
            solveLimb(arms[i], elbowHint);
            hands[i].position.copy(target);
            hands[i].quaternion.copy(handQuaternion);
            // Right hand (rider's right is -x): rolls the throttle open.
            if (side < 0) hands[i].rotateX(-pose.twist * 1.15 + pose.brake * 0.15);
            else hands[i].rotateX(pose.brake * 0.1);
        }
        // Legs: on the pegs; one foot down at a standstill, one out in a skid.
        for (let i = 0; i < 2; i++) {
            const side = i === 0 ? -1 : 1;
            toRiderSpace(hips[i], root);
            toRiderSpace(pegs[i], footTarget);
            if (side < 0 && pose.stop > 0.001) {
                groundFoot.set(-0.36, 0.1, -0.08);
                footTarget.lerp(groundFoot, pose.stop);
            }
            if (side > 0 && pose.skid > 0.001) {
                groundFoot.set(0.5, 0.2, 0.25);
                footTarget.lerp(groundFoot, pose.skid);
            }
            target.copy(footTarget);
            // The inside knee opens towards the turn.
            const knee = Math.max(0, -side * hang) * 2.4;
            kneeHint.set(side * (0.35 + knee), 0.4 - knee * 0.2, 1);
            if (stunt > 0.001 && stuntPoint(trick.feet, side, i, groundFoot)) {
                // Off the pegs (behind, over the bars, on the seat...).
                target.lerp(groundFoot, stunt);
                const bend = trick.feet.bend;
                if (bend) kneeHint.lerp(segment.set(side * bend[0], bend[1], bend[2]), stunt);
            }
            if (hop && hopSide !== 0) {
                // Jogging beside the bike.
                const stride = Math.sin((pose.hopTime || 0) * 11 + i * Math.PI);
                groundFoot.set(hopSide * 0.6 + side * 0.11, 0.05 + Math.max(0, stride) * 0.12, PELVIS_REST.z + 0.05 + stride * 0.24);
                target.lerp(groundFoot, hop);
                kneeHint.lerp(segment.set(0, 0.2, 1), hop);
            }
            solveLimb(legs[i], kneeHint);
            shoes[i].position.copy(target);
            shoes[i].rotation.set(0, side * 0.12, 0);
        }
    }

    // --- Crash ------------------------------------------------------------
    // The way the rider goes down depends on how he was riding:
    //   loopFlip   wheelie over the top at low speed: back-flip, lands on his back
    //   loopSlide  over the top at speed: thrown back, slides on his back
    //   highside   head-on at high speed: launched over the bars, forward flips
    //   tumble     head-on at medium speed: thrown off, rolls
    //   lowside    while leaning or skidding: bike slides out, rider rolls sideways
    //   bail       hit with the front wheel up: falls off the back
    //   tipover    almost stopped: the bike tips over, the rider stumbles off
    const forward = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const riderUp = new THREE.Vector3();
    const flat = new THREE.Vector3();
    const settle = new THREE.Quaternion();
    const spinStep = new THREE.Quaternion();

    function chooseCrash(kind, info) {
        const kmh = info.kmh || 0;
        if (kind === 'loop') return kmh > 60 ? 'loopSlide' : 'loopFlip';
        if (info.skidding) return 'lowside';
        if ((info.angleRatio || 0) > 0.22) return 'bail';
        if (kmh < 28) return 'tipover';
        if (Math.abs(info.steer || 0) > 0.45) return 'lowside';
        if (kmh > 95) return 'highside';
        return 'tumble';
    }

    // speed (units/s along the road), up, side push: all in rider units.
    const CRASHES = {
        loopFlip: { carry: 0.55, up: 2.6, push: 0.8, spin: [-6, 0.6, 0], bike: 'flipBack', slide: 2.6 },
        loopSlide: { carry: 0.86, up: 1.5, push: 0.6, spin: [-4.2, 0.4, 0], bike: 'flipBack', slide: 1.7 },
        highside: { carry: 1.02, up: 4.4, push: 0.9, spin: [7.5, 0.8, 2.5], bike: 'endo', slide: 1.9 },
        tumble: { carry: 0.9, up: 3.2, push: 2.2, spin: [4, 0.5, 1.5], bike: 'layDown', slide: 2.4 },
        lowside: { carry: 0.95, up: 0.9, push: 1.8, spin: [1, 0.3, 6], bike: 'layDown', slide: 1.5 },
        bail: { carry: 0.7, up: 2.8, push: 1.2, spin: [-5, 0.6, 0.8], bike: 'flipBack', slide: 2.4 },
        tipover: { carry: 0.6, up: 1.1, push: 1.6, spin: [0.6, 0.2, 3], bike: 'tip', slide: 4 }
    };
    // What the body does once it hits the road: tumbles over and over
    // (bouncing), rolls along, slides on its back or side, or stumbles.
    const STYLES = { highside: 'tumble', tumble: 'tumble', bail: 'roll', loopFlip: 'roll', loopSlide: 'slide', lowside: 'slide', tipover: 'stumble' };
    // Friction on the road (1/s) and bounce, per style.
    const GROUND = {
        tumble: { friction: 1.6, bounce: 0.42, roll: 1 },
        roll: { friction: 1.9, bounce: 0.3, roll: 1 },
        slide: { friction: 1.5, bounce: 0.15, roll: 0 },
        stumble: { friction: 3, bounce: 0.2, roll: 0.4 }
    };
    // What can touch the road: the corners of each part of the body (taken
    // when the fall starts; the parts move, their corners with them).
    const contacts = [];
    const contactPoint = new THREE.Vector3();
    function gatherContacts() {
        contacts.length = 0;
        riderGroup.traverse((object) => {
            if (!object.isMesh || !object.visible || !object.geometry) return;
            if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
            const { min, max } = object.geometry.boundingBox;
            const corners = [];
            for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) corners.push(new THREE.Vector3(x, y, z));
            contacts.push({ object, corners });
        });
    }
    const crashScale = new THREE.Vector3();
    const rollAxis = new THREE.Vector3();
    const riderQuaternion = new THREE.Quaternion();

    function startCrash(kind, unitsPerSecond, info = {}) {
        crash.active = true;
        crash.time = 0;
        crash.kind = kind;
        crash.variant = chooseCrash(kind, info);
        const spec = CRASHES[crash.variant];
        // Fall towards the side the bike was leaning or steering, else at random.
        const lean = info.steer || bikeGroup.rotation.z || 0;
        crash.side = Math.abs(lean) > 0.05 ? Math.sign(lean) : (Math.random() < 0.5 ? -1 : 1);
        crash.landed = false;
        crash.landTime = 0;
        crash.bikePitch = 0;
        crash.bikeYaw = (Math.random() - 0.5) * (crash.variant === 'lowside' || crash.variant === 'highside' ? 5 : 2);
        forward.set(0, 0, 1).applyQuaternion(bikeGroup.quaternion);
        const speed = Math.min(unitsPerSecond, 34);
        crash.bikeVelocity.copy(forward).multiplyScalar(speed);
        crash.bikeSlide = spec.slide;
        // Stay close to the bike so the fall is still in frame.
        // Not too far: a few metres along the road, still near the bike.
        crash.velocity.copy(forward).multiplyScalar(Math.min(speed * spec.carry, 12 * (bikeGroup.scale.x || 1)));
        crash.velocity.y = spec.up * SCALE * (0.9 + Math.random() * 0.2);
        crash.velocity.x += crash.side * spec.push * SCALE;
        // Spin in the bike's frame: [flip forward, yaw, roll towards the fall side].
        const jitter = () => 0.8 + Math.random() * 0.4;
        flat.crossVectors(UP, forward).normalize();
        crash.spinRates.set(0, 0, 0)
            .addScaledVector(flat, spec.spin[0] * jitter())
            .addScaledVector(UP, spec.spin[1] * (Math.random() - 0.5) * 2)
            .addScaledVector(forward, spec.spin[2] * crash.side * jitter());
        crash.style = STYLES[crash.variant] || 'tumble';
        gatherContacts();
        crash.contacts = 0;
        getUp.active = false;
        // The pivot at his middle, then he leaves the bike with it.
        if (!crashPivot.parent) scene.add(crashPivot);
        pelvis.getWorldPosition(crashPivot.position);
        crashPivot.quaternion.identity();
        crashPivot.scale.set(1, 1, 1);
        crashPivot.updateMatrixWorld(true);
        crashPivot.attach(riderGroup);
    }

    // The lowest point of the body under the road (> 0: how far under).
    function underRoad() {
        crashPivot.updateMatrixWorld(true);
        let deepest = -Infinity;
        for (const { object, corners } of contacts) {
            const e = object.matrixWorld.elements;
            for (const c of corners) deepest = Math.max(deepest, -(e[1] * c.x + e[5] * c.y + e[9] * c.z + e[13]));
        }
        return deepest;
    }

    // Arms and legs during the fall: flailing in the air, sprawled once down.
    function pelvisPoint(x, y, z, out) {
        return riderGroup.worldToLocal(pelvis.localToWorld(out.set(x, y, z)));
    }

    // Where a stunt puts this hand or foot (rider space), or null when it
    // stays where it is. spec: TRICKS[...].hands or .feet; i: 0 right, 1 left.
    function stuntPoint(spec, side, i, out) {
        if (!spec || (spec.side && spec.side !== side)) return null;
        const each = Array.isArray(spec.at[0]);
        const at = each ? spec.at[i] : spec.at;
        const x = each || spec.mirror === false ? at[0] : at[0] * side;
        return spec.space === 'rider' ? out.set(x, at[1], at[2]) : pelvisPoint(x, at[1], at[2], out);
    }

    function animateLimbs(t) {
        const air = crash.landed ? Math.exp(-(t - crash.landTime) * 4) : 1;
        riderGroup.updateMatrixWorld(true);
        for (let i = 0; i < 2; i++) {
            const side = i === 0 ? -1 : 1;
            const wave = Math.sin(t * 13 + i * 2.1);
            const wave2 = Math.cos(t * 10.5 + i * 1.3);
            toRiderSpace(shoulders[i], root);
            pelvisPoint(
                side * (0.5 + 0.12 * air * wave),
                0.42 + air * (0.28 * wave2 + 0.12),
                0.12 + air * 0.25 * wave,
                target
            );
            elbowHint.set(side, 0.2, -0.4);
            solveLimb(arms[i], elbowHint);
            hands[i].position.copy(target);
            toRiderSpace(hips[i], root);
            pelvisPoint(
                side * (0.24 + 0.1 * air * wave2),
                -0.62 + air * (0.22 + 0.12 * wave),
                0.22 + air * 0.2 * wave2,
                target
            );
            kneeHint.set(side * 0.4, 0.2, 1);
            solveLimb(legs[i], kneeHint);
            shoes[i].position.copy(target);
        }
    }

    // Returns false once everything has come to rest.
    function updateCrash(dt) {
        stepLoosePlate(dt);
        if (!crash.active) return false;
        crash.time += dt;
        const t = crash.time;
        const spec = CRASHES[crash.variant];

        // Bike ------------------------------------------------------------
        if (spec.bike === 'flipBack') {
            // Turned further than that (a backflip landed on its back): it
            // falls back onto it rather than snapping.
            const pitch = bikePivot.rotation.x;
            bikePivot.rotation.x = pitch < -2.75 ? damp(pitch, -2.75, 6, dt) : Math.max(-2.75, pitch - dt * 5.5);
            bikeGroup.rotation.z = damp(bikeGroup.rotation.z, crash.side * 0.5, 4, dt);
        } else if (spec.bike === 'endo') {
            // Nose dives over the front wheel, then the bike falls on its side.
            const pitchTarget = t < 0.42 ? 1.15 : 0;
            crash.bikePitch = damp(crash.bikePitch, pitchTarget, t < 0.42 ? 9 : 4, dt);
            bikePivot.rotation.x = crash.bikePitch;
            if (t > 0.3) bikeGroup.rotation.z = damp(bikeGroup.rotation.z, crash.side * 1.36, 5, dt);
            bikeGroup.position.y = 1.45 * SCALE * Math.sin(Math.max(0, crash.bikePitch)) * 0.92 +
                (t > 0.3 ? damp(0, 0.16 * SCALE, 6, t - 0.3) : 0);
        } else {
            const rate = spec.bike === 'tip' ? 3.2 : 7;
            bikeGroup.rotation.z = damp(bikeGroup.rotation.z, crash.side * 1.36, rate, dt);
            bikePivot.rotation.x = damp(bikePivot.rotation.x, 0, 8, dt);
            bikeGroup.position.y = damp(bikeGroup.position.y, 0.16 * SCALE, rate, dt);
        }
        // A bike on its side spins round as it slides.
        if (spec.bike !== 'flipBack' && t > 0.25) {
            bikeGroup.rotation.y += crash.bikeYaw * dt * Math.min(1, crash.bikeVelocity.length() / 10);
        }
        bikeGroup.position.addScaledVector(crash.bikeVelocity, dt);
        crash.bikeVelocity.multiplyScalar(Math.exp(-dt * crash.bikeSlide));
        rearWheel.rotation.x += pose.rearSpin * Math.exp(-t * 1.5) * dt;
        frontWheel.rotation.x += pose.frontSpin * Math.exp(-t * 1.5) * dt;
        contactShadow.position.set(bikeGroup.position.x, 0.02, bikeGroup.position.z);
        contactShadow.material.opacity = 0.35;

        // Rider -----------------------------------------------------------
        // Flies, turning about his middle; on the road, never through it.
        const ground = GROUND[crash.style];
        const size = SCALE * (riderGroup.getWorldScale(crashScale).x || 1) / SCALE;
        crash.velocity.y -= 14 * SCALE * dt;
        crashPivot.position.addScaledVector(crash.velocity, dt);
        if (crash.spinRates.lengthSq() > 1e-4) {
            axis.copy(crash.spinRates).normalize();
            spinStep.setFromAxisAngle(axis, crash.spinRates.length() * dt);
            crashPivot.quaternion.premultiply(spinStep);
        }
        const under = underRoad();
        const touching = under > -0.05 * size;
        if (under > 0) {
            crashPivot.position.y += under;
            if (crash.velocity.y < 0) {
                if (!crash.landed) crash.landTime = t;
                crash.landed = true;
                crash.contacts++;
                // Hard hits bounce him back up (several times when he tumbles).
                crash.velocity.y = crash.velocity.y < -2.2 * size ? -crash.velocity.y * ground.bounce : 0;
            }
        }
        const along = Math.hypot(crash.velocity.x, crash.velocity.z);
        if (crash.landed && touching) {
            const friction = Math.exp(-dt * ground.friction);
            crash.velocity.x *= friction;
            crash.velocity.z *= friction;
            if (ground.roll > 0 && along > 1.2 * size) {
                // Rolls along the road, over and over, as fast as he goes.
                rollAxis.set(crash.velocity.x, 0, crash.velocity.z).normalize();
                rollAxis.crossVectors(UP, rollAxis).multiplyScalar(ground.roll * along / (0.42 * size));
                crash.spinRates.lerp(rollAxis, 1 - Math.exp(-dt * 7));
            } else {
                // Sliding (or nearly stopped): the spin dies away.
                crash.spinRates.multiplyScalar(Math.exp(-dt * (crash.style === 'slide' ? 6 : 3.2)));
            }
        }
        if (crash.landed && (crash.style === 'slide' || along < 1.5 * size) && crash.spinRates.length() < 2.5) {
            // Lie down in whatever direction he was tipping.
            riderGroup.getWorldQuaternion(riderQuaternion);
            riderUp.set(0, 1, 0).applyQuaternion(riderQuaternion);
            flat.set(riderUp.x, 0, riderUp.z);
            if (flat.lengthSq() < 1e-3) flat.copy(forward).multiplyScalar(-1);
            flat.normalize();
            settle.setFromUnitVectors(riderUp, flat);
            spinStep.identity().slerp(settle, 1 - Math.exp(-dt * 5));
            crashPivot.quaternion.premultiply(spinStep);
            const lifted = underRoad();
            if (lifted > 0) crashPivot.position.y += lifted;
        }
        animateLimbs(t);
        return t < 3;
    }

    // Free roam: back on his feet, from where he lies to standing at (x, z)
    // facing `yaw` (then walked by updateWalk).
    function startGetUp(x, z, yaw) {
        if (riderGroup.parent !== crashPivot) return false;
        scene.attach(riderGroup);
        getUp.active = true;
        getUp.t = 0;
        getUp.from.copy(riderGroup.position);
        getUp.fromQuaternion.copy(riderGroup.quaternion);
        getUp.fromScale = riderGroup.scale.x;
        getUp.to.set(x, 0, z);
        getUp.toQuaternion.setFromAxisAngle(UP, yaw);
        getUp.yaw = yaw;
        return true;
    }

    // One frame of getting up; false once standing.
    function updateGetUp(dt) {
        if (!getUp.active) return false;
        getUp.t = Math.min(1, getUp.t + dt / 0.9);
        const k = getUp.t * getUp.t * (3 - 2 * getUp.t);
        updateWalk(0, getUp.to.x, getUp.to.z, getUp.yaw, 0);
        riderGroup.position.lerpVectors(getUp.from, getUp.to, k);
        riderGroup.quaternion.slerpQuaternions(getUp.fromQuaternion, getUp.toQuaternion, k);
        riderGroup.scale.setScalar(getUp.fromScale + (WALK_SCALE - getUp.fromScale) * k);
        if (getUp.t >= 1) getUp.active = false;
        return getUp.active;
    }

    // Free roam: the fall is over, the rider gets up (the bike stays down).
    function finishCrash() {
        crash.active = false;
    }

    // Where he lies: under his middle, on the road.
    function riderPosition(out) {
        pelvis.getWorldPosition(out);
        out.y = 0;
        return out;
    }

    function slideSpeed() {
        return crash.active ? crash.bikeVelocity.length() : 0;
    }

    const hitBox = new THREE.Box3();
    function getHitBox() {
        const { x, z } = bikeGroup.position;
        hitBox.min.set(x - 0.42, 0, z - 1.2);
        hitBox.max.set(x + 0.42, 2.4, z + 1.2);
        return hitBox;
    }

    // --- Boost: a flame glow at the exhaust ---------------------------------
    const exhaustGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture, color: 0xff7a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0
    }));
    exhaustGlow.position.set(-0.2, 0.68, -1.05);
    chassis.add(exhaustGlow);
    function setBoost(level) {
        exhaustGlow.material.opacity = level;
        exhaustGlow.scale.setScalar(0.35 + level * (0.6 + Math.random() * 0.25));
    }
    function exhaustPoint(out) {
        return chassis.localToWorld(out.set(-0.2, 0.67, -1.0));
    }

    // --- On foot (free roam) ---------------------------------------------
    // The rider gets off the bike and walks: stepping legs, swinging arms.
    let walkPhase = 0;
    function dismount(x, z, yaw) {
        scene.attach(riderGroup);
        riderGroup.scale.setScalar(WALK_SCALE);
        riderGroup.rotation.set(0, yaw, 0);
        riderGroup.position.set(x, 0, z);
        riderGroup.visible = true;
        walkPhase = 0;
        updateWalk(0, x, z, yaw, 0);
    }

    // ground: the height he stands on (a roof); pitch: leaning forward
    // (flying); fly: the jetpack pose (arms back, legs together).
    function updateWalk(dt, x, z, yaw, speed, y = 0, running = false, cuffed = false, { ground = 0, pitch = 0, fly = false } = {}) {
        // stride 0..1 walking, up to ~1.8 running (longer steps, faster).
        const stride = Math.min(running ? 1.8 : 1, speed / WALK_REFERENCE);
        const step = Math.min(1, stride);
        // Quicker steps than the big rider had, so the feet keep up with the ground.
        walkPhase += dt * (2 + stride * 6.6) * (stride > 0.05 ? 1 : 0);
        const bob = Math.abs(Math.sin(walkPhase)) * 0.03 * stride;
        const air = y - ground > 0.02 && !fly ? 1 : 0;
        riderGroup.position.set(x, y * 1, z);
        riderGroup.rotation.set(0, yaw, 0, 'YXZ');
        riderGroup.rotation.x = pitch;
        pelvis.position.set(0, 0.94 + bob - air * 0.08, 0);
        pelvis.rotation.set(0.05 + step * 0.05 + (running ? 0.22 : 0), Math.sin(walkPhase) * 0.1 * step, 0);
        head.rotation.set(-0.08, -Math.sin(walkPhase) * 0.06 * stride, 0);
        riderGroup.updateMatrixWorld(true);
        for (let i = 0; i < 2; i++) {
            const side = i === 0 ? -1 : 1;
            const phase = walkPhase + (i ? Math.PI : 0);
            toRiderSpace(hips[i], root);
            target.set(side * 0.11, 0.07 + Math.max(0, Math.sin(phase)) * 0.13 * stride, Math.cos(phase) * 0.3 * stride);
            // In the air the knees come up.
            if (air) target.set(side * 0.13, 0.32 + (i ? 0.08 : 0), 0.16);
            if (fly) target.set(side * 0.1, 0.02 + Math.sin(walkPhase * 0.7 + i) * 0.03, -0.12);
            kneeHint.set(side * 0.1, 0, 1);
            solveLimb(legs[i], kneeHint);
            shoes[i].position.copy(target);
            shoes[i].rotation.set(0, 0, 0);
            toRiderSpace(shoulders[i], root);
            target.set(side * 0.27, running ? 1.0 : 0.8, -Math.cos(phase) * (running ? 0.3 : 0.22) * stride + 0.04);
            if (running) target.y += Math.max(0, -Math.cos(phase)) * 0.15;
            if (air) target.set(side * 0.42, 1.55, 0.1);
            if (fly) target.set(side * 0.34, 0.85, -0.32);
            // Hands together behind the back.
            if (cuffed) target.set(side * 0.06, 0.96, -0.2);
            elbowHint.set(side * 0.3, running ? -0.3 : 0, -1);
            if (cuffed) elbowHint.set(side * 0.6, 0, -0.4);
            solveLimb(arms[i], elbowHint);
            hands[i].position.copy(target);
            hands[i].rotation.set(0, 0, 0);
        }
    }

    function mount() {
        chassis.add(riderGroup);
        riderGroup.position.set(0, 0, 0);
        riderGroup.rotation.set(0, 0, 0);
        riderGroup.scale.set(1, 1, 1);
        riderGroup.visible = true;
    }

    function setRiderVisible(visible) {
        riderGroup.visible = visible;
    }

    // Backflip: the bike turns about its middle, not the rear axle.
    const pivotRest = new THREE.Vector3(0, REAR_RADIUS, REAR_AXLE_Z);
    const flipCentre = new THREE.Vector3(0, REAR_RADIUS + 0.45, (REAR_AXLE_Z + FRONT_AXLE_Z) / 2);
    function setFlip(angle) {
        if (!angle) {
            bikePivot.position.copy(pivotRest);
            bikePivot.rotation.x = 0;
            return;
        }
        const phi = -angle;
        const dy = pivotRest.y - flipCentre.y;
        const dz = pivotRest.z - flipCentre.z;
        bikePivot.rotation.x = phi;
        bikePivot.position.set(0,
            flipCentre.y + dy * Math.cos(phi) - dz * Math.sin(phi),
            flipCentre.z + dy * Math.sin(phi) + dz * Math.cos(phi));
    }

    // Bike + rider size: arcade scale in races, smaller in free roam.
    let worldScale = SCALE;
    function setWorldScale(value) {
        if (value === worldScale) return;
        worldScale = value;
        bikeGroup.scale.setScalar(value);
        contactShadow.scale.set(1.5 * value, 1, 3 * value);
    }

    // The rainbow bike (found in Figures Land): the paint a flowing rainbow,
    // glowing a little, and sparkles twinkling on it.
    let rainbow = null;
    function rainbowParts() {
        if (rainbow) return rainbow;
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 256, 0);
        ['#ff3b3b', '#ff9a1f', '#ffe14a', '#3fd16b', '#2f9bff', '#8a5cff', '#ff5cc8', '#ff3b3b'].forEach((color, index, list) => {
            gradient.addColorStop(index / (list.length - 1), color);
        });
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 8);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 1);
        const sparkleMaterial = new THREE.SpriteMaterial({
            map: glowTexture, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
        });
        const sparkles = [];
        for (let i = 0; i < 12; i++) {
            const sprite = new THREE.Sprite(sparkleMaterial);
            sprite.position.set((Math.random() - 0.5) * 0.5, 0.45 + Math.random() * 0.55, -0.9 + Math.random() * 1.7);
            sprite.userData.phase = Math.random() * Math.PI * 2;
            sprite.userData.rate = 3 + Math.random() * 4;
            sprite.visible = false;
            chassis.add(sprite);
            sparkles.push(sprite);
        }
        rainbow = { texture, sparkles, on: false };
        return rainbow;
    }
    function setBikeModel(model) {
        const on = model === 'rainbow';
        if (!on && !rainbow) return;
        const parts = rainbowParts();
        parts.on = on;
        paint.map = on ? parts.texture : null;
        paint.emissiveMap = on ? parts.texture : null;
        paint.emissive.set(on ? 0xffffff : 0x000000);
        paint.emissiveIntensity = on ? 0.35 : 1;
        paint.needsUpdate = true;
        parts.sparkles.forEach((sprite) => { sprite.visible = on; });
    }
    function animateRainbow(time) {
        if (!rainbow || !rainbow.on) return;
        rainbow.texture.offset.x = (time * 0.22) % 1;
        paint.emissiveIntensity = 0.32 + Math.sin(time * 7) * 0.12;
        for (const sprite of rainbow.sparkles) {
            const flash = Math.max(0, Math.sin(time * sprite.userData.rate + sprite.userData.phase));
            sprite.scale.setScalar(0.02 + Math.pow(flash, 6) * 0.22);
        }
    }

    // --- The Love&Faith event's outfit (src/event/love.js) -----------------------
    // As the partner's figure: a blue beanie with the kiss, the face showing,
    // a white long sleeve with the chosen creation on the back and the chest,
    // bare hands, white sneakers. Built (and its pictures loaded) the first
    // time it is worn.
    const OUTFIT_FILES = '/event/love/';
    const mood = { level: 0, target: 0, shake: 0 };
    let outfit = null;
    function buildOutfit() {
        const loader = new THREE.TextureLoader();
        const load = (name) => {
            const texture = loader.load(OUTFIT_FILES + name);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            return texture;
        };
        const skin = standard(0x7a4524, 0.6);
        const knit = new THREE.MeshStandardMaterial({ map: load('beanie.jpg'), roughness: 0.95 });
        const decal = (name, roughness = 0.85) => new THREE.MeshStandardMaterial({
            map: load(name), transparent: true, roughness, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        });
        const face = decal('face.png', 0.5);
        const kiss = decal('beanie-kiss.png');
        const nameDown = decal('beanie-back.png');
        const group = new THREE.Group();
        group.visible = false;
        head.add(group);
        const parts = new Parts();
        parts.add(skin, sphere, transform(0, 0.04, 0.005, 0.168, 0.19, 0.175));
        parts.add(skin, tube, transform(0, -0.12, -0.005, 0.075, 0.12, 0.075));
        const crown = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
        parts.add(knit, crown, transform(0, 0.085, 0, 0.188, 0.2, 0.195));
        const band = new THREE.CylinderGeometry(1, 1.03, 1, 28, 1, true);
        parts.add(knit, band, transform(0, 0.098, 0, 0.192, 0.07, 0.199));
        parts.build(group);
        const patch = (material, geometry, matrix) => {
            const mesh = new THREE.Mesh(geometry.applyMatrix4(matrix), material);
            mesh.renderOrder = 2;
            group.add(mesh);
        };
        // The face on the front of the head, the kiss on the beanie's front,
        // LOVE&FAITH down its back.
        patch(face, new THREE.SphereGeometry(1, 20, 12, Math.PI / 2 - 0.82, 1.64, Math.PI * 0.34, Math.PI * 0.4),
            transform(0, 0.04, 0.005, 0.171, 0.193, 0.178));
        patch(kiss, new THREE.SphereGeometry(1, 16, 8, Math.PI / 2 - 0.62, 1.1, Math.PI * 0.2, Math.PI * 0.27),
            transform(0, 0.085, 0, 0.191, 0.203, 0.198));
        patch(nameDown, new THREE.SphereGeometry(1, 6, 16, Math.PI * 1.5 - 0.13, 0.26, Math.PI * 0.05, Math.PI * 0.45),
            transform(0, 0.085, 0, 0.191, 0.203, 0.198));
        crown.dispose();
        band.dispose();
        // The creation on the chest (the back's own print takes the number's place).
        const frontMaterial = new THREE.MeshStandardMaterial({
            transparent: true, roughness: 0.86, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
        });
        const chestProfile = [[0.18, 0.24], [0.188, 0.38], [0.178, 0.46]].map(([r, y]) => new THREE.Vector2(r * 1.014, y));
        const chest = new THREE.Mesh(new THREE.LatheGeometry(chestProfile, 12, -0.56, 1.12).applyMatrix4(transform(0, 0.02, 0, 1.22, 1, 0.9)), frontMaterial);
        chest.visible = false;
        chest.renderOrder = 2;
        pelvis.add(chest);
        return { group, chest, frontMaterial, skin, print: null, look: null, pictures: {} };
    }

    // A creation's print, on white fleece (back) or alone (chest).
    function printTexture(image, back) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = back ? 512 : 448;
        const ctx = canvas.getContext('2d');
        if (back) {
            ctx.fillStyle = '#f1f0ec';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        if (image) {
            // The back's lathe is wider than tall: drawn taller to look right.
            const stretch = back ? 1.15 : 1.1;
            const room = back ? 0.86 : 0.92;
            const k = Math.min(canvas.width * room / image.width, canvas.height * room / (image.height * stretch));
            const w = image.width * k;
            const h = image.height * k * stretch;
            ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2 + (back ? 16 : 0), w, h);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        return texture;
    }

    function loadPicture(name) {
        if (outfit.pictures[name]) return outfit.pictures[name];
        outfit.pictures[name] = new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = OUTFIT_FILES + name;
        });
        return outfit.pictures[name];
    }

    function dressOutfit() {
        const look = outfit.look;
        classicHead.visible = false;
        araiHead.visible = false;
        jersey.color.set('#f1f0ec');
        jerseyAccent.set('#f1f0ec');
        jerseyDark.color.set('#dcdad5');
        sneaker.color.set('#f4f4f2');
        glove.color.set(0x7a4524);
        if (outfit.print === look.print) return;
        outfit.print = look.print;
        jerseyPrint.map.dispose();
        jerseyPrint.map = printTexture(null, true);
        jerseyPrint.needsUpdate = true;
        const wanted = look.print;
        Promise.all([loadPicture(`print-${wanted}-back.webp`), loadPicture(`print-${wanted}-front.webp`)]).then(([back, front]) => {
            if (!outfit.look || outfit.print !== wanted) return;
            jerseyPrint.map.dispose();
            jerseyPrint.map = printTexture(back, true);
            jerseyPrint.needsUpdate = true;
            outfit.frontMaterial.map?.dispose();
            outfit.frontMaterial.map = printTexture(front, false);
            outfit.frontMaterial.needsUpdate = true;
        });
    }

    // look: { print: 'lva' | 'plva' | 'world-love' | 'fabulous-love-and-faith' }, or null.
    function setEventLook(look) {
        if (look && !outfit) outfit = buildOutfit();
        if (!outfit) return;
        outfit.look = look || null;
        outfit.group.visible = !!look;
        outfit.chest.visible = !!look;
        if (look) dressOutfit();
        else {
            outfit.print = null;
            glove.color.set(0x0e0e10);
        }
    }

    // 0 (fine) to 1 (heartbroken).
    function setMood(level) {
        mood.target = Math.max(0, Math.min(1, level));
    }
    function shakeHead() {
        mood.shake = 1;
    }
    // Where a tear starts: under the left (-1) or right (1) eye.
    function eyePoint(out, side) {
        out.set(side * 0.058, 0.035, 0.175);
        return head.localToWorld(out);
    }

    // Rider customisation: number, hoodie, helmet and bike colours.
    const luminance = (color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    function setLivery({
        number = '51', hoodie = '#f6c416', helmet: helmetColor = '#0a0a0c', bike = '#f2c014', name = '', plate: withPlate = false, plateText: text = '',
        helmetStyle = 'classic', shoes = '#f2f2f0', bikeModel = 'standard'
    } = {}) {
        sneaker.color.set(shoes);
        const araiOn = helmetStyle === 'arai';
        classicHead.visible = !araiOn;
        araiHead.visible = araiOn;
        if (araiOn) {
            // The helmet colour paints the Arai's wings and crown band.
            const base = luminance(new THREE.Color(helmetColor)) > 0.6 ? '#1a1b1f' : '#f2f2f0';
            arai.map.dispose();
            arai.map = createAraiTexture(base, helmetColor, String(number));
            arai.needsUpdate = true;
            araiShell.color.set(base);
        }
        plateEnabled = !!withPlate;
        if (!loosePlate.active) plateMesh.visible = plateEnabled;
        if (text !== plateText) {
            plateText = text;
            plateFace.map.dispose();
            plateFace.map = createPlateTexture(text || '51-WHEEL');
            plateFace.needsUpdate = true;
        }
        jersey.color.set(hoodie);
        jerseyAccent.set(hoodie);
        jerseyDark.color.copy(jerseyAccent).multiplyScalar(0.84);
        const ink = luminance(jerseyAccent) > 0.35 ? '#111' : '#f6c416';
        const print = createJerseyTexture(String(number), hoodie, ink, String(name || '').slice(0, 15));
        jerseyPrint.map.dispose();
        jerseyPrint.map = print;
        jerseyPrint.needsUpdate = true;
        const shell = new THREE.Color(helmetColor);
        const accent = luminance(shell) > 0.45 ? '#111111' : '#f2c014';
        const helmetMap = createHelmetTexture(helmetColor, accent, String(number));
        helmet.map.dispose();
        helmet.map = helmetMap;
        helmet.needsUpdate = true;
        helmetShell.color.set(helmetColor);
        // The rainbow paint is its own colours.
        paint.color.set(bikeModel === 'rainbow' ? '#ffffff' : bike);
        setBikeModel(bikeModel);
        // The event's outfit stays on over any livery change.
        if (outfit?.look) {
            outfit.print = null;
            dressOutfit();
        }
    }

    reset();
    return {
        setLivery, dismount, updateWalk, mount, setRiderVisible, setBoost, exhaustPoint, setWorldScale, setFlip,
        setEventLook, setMood, shakeHead, eyePoint,
        tearPlate, platePoint, resetPlate: restPlate, finishCrash, riderPosition, startGetUp, updateGetUp,
        get worldScale() { return worldScale; },
        // How far into a stunt the rider is (0: the riding position).
        get trickBlend() { return pose.trick; },
        bikeGroup, bikePivot, materials, update, reset, startCrash, updateCrash, slideSpeed, getHitBox,
        get crashing() { return crash.active; },
        get crashVariant() { return crash.variant; },
        rearContact: new THREE.Vector3(0, 0, REAR_AXLE_Z)
    };
}
