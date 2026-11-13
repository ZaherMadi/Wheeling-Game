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
const UP = new THREE.Vector3(0, 1, 0);
// The street is drawn at arcade scale (20-unit road), so the bike is too.
const SCALE = 1.7;

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

// Gloss black helmet with the 5HC mark on both sides and a stripe at the
// back (sphere UVs: u 0 = left side, 0.25 = front, 0.5 = right, 0.75 = back).
function createHelmetTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#f2c014';
    ctx.fillRect(0, 96, 512, 7);
    ctx.font = 'italic 900 44px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const u of [0, 0.5, 1]) {
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#0a0a0c';
        ctx.strokeText('5HC', u * 512, 76);
        ctx.fillText('5HC', u * 512, 76);
    }
    ctx.font = '900 40px "Arial Black", Arial, sans-serif';
    ctx.fillText('51', 0.75 * 512, 72);
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
    const pants = standard(0x16181d, 0.85);
    const helmet = new THREE.MeshStandardMaterial({ map: createHelmetTexture(), roughness: 0.12, metalness: 0.2 });
    const visor = standard(0x0b1622, 0.04, 0.9);
    const glove = standard(0x0e0e10, 0.6);
    const sneaker = standard(0xf2f2f0, 0.62);
    const sole = standard(0xd8d8d6, 0.75);
    const plate = standard(0xe9e9e4, 0.6);
    const tailLight = new THREE.MeshBasicMaterial({ color: 0xff2a1f });
    const headLight = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
    const glowTexture = createGlowTexture();
    const materials = [
        paint, rubber, darkMetal, chrome, gold, seatMaterial, jersey, jerseyDark, jerseyPrint, pants, helmet, visor,
        glove, sneaker, sole, plate, tailLight, headLight
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
    frame.add(plate, box, transform(0, 0.74, -1.0, 0.17, 0.11, 0.012, 0.25));
    for (const side of [-1, 1]) {
        frame.add(darkMetal, box, transform(side * 0.13, 0.39, -0.385, 0.05, 0.075, 0.69, 0.045));
        frame.add(chrome, tube, transform(side * 0.2, 0.45, -0.27, 0.022, 0.12, 0.022, 0, 0, Math.PI / 2));
        frame.add(darkMetal, box, transform(side * 0.15, 0.5, -0.2, 0.03, 0.14, 0.22, 0.5));
    }
    frame.add(chrome, tube, transform(-0.17, 0.44, -0.2, 0.045, 0.66, 0.045, Math.PI / 2 - 0.1));
    frame.add(darkMetal, tube, transform(-0.2, 0.56, -0.68, 0.085, 0.46, 0.085, Math.PI / 2 - 0.3));
    frame.add(chrome, tube, transform(-0.2, 0.63, -0.9, 0.06, 0.04, 0.06, Math.PI / 2 - 0.3));
    frame.build(chassis);

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
    pelvis.position.copy(PELVIS_REST);
    riderGroup.add(pelvis);
    const body = new Parts();
    body.add(pants, sphere, transform(0, 0.03, 0, 0.21, 0.16, 0.19));
    const torsoGeometry = new THREE.CapsuleGeometry(0.17, 0.26, 6, 14);
    body.add(jersey, torsoGeometry, transform(0, 0.31, 0, 1.18, 1, 1));
    for (const side of [-1, 1]) body.add(jersey, sphere, transform(side * 0.215, 0.49, 0, 0.095, 0.09, 0.095));
    const printGeometry = new THREE.CylinderGeometry(0.176, 0.176, 0.34, 14, 1, true, Math.PI - 0.95, 1.9);
    body.add(jerseyPrint, printGeometry, transform(0, 0.3, 0, 1.18, 1, 1));
    // Hoodie: hood resting on the back, ribbed hem, front pocket, drawstrings.
    const hood = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    body.add(jersey, hood, transform(0, 0.55, -0.1, 0.17, 0.13, 0.12, -1.9));
    body.add(jerseyDark, new THREE.TorusGeometry(0.13, 0.035, 6, 16), transform(0, 0.6, -0.02, 1.05, 1, 0.9, Math.PI / 2 - 0.25));
    body.add(jerseyDark, torsoGeometry, transform(0, 0.08, 0, 1.2, 0.22, 1.03));
    body.add(jerseyDark, box, transform(0, 0.17, 0.17, 0.26, 0.13, 0.03, 0.12));
    for (const side of [-1, 1]) body.add(sneaker, tube, transform(side * 0.045, 0.47, 0.16, 0.007, 0.16, 0.007, 0.25));
    body.add(pants, tube, transform(0, 0.6, 0.01, 0.06, 0.1, 0.06));
    body.build(pelvis);
    torsoGeometry.dispose();
    printGeometry.dispose();
    hood.dispose();

    const head = new THREE.Group();
    head.position.set(0, 0.74, 0.03);
    pelvis.add(head);
    const headParts = new Parts();
    headParts.add(helmet, sphere, transform(0, 0.06, 0, 0.215, 0.21, 0.235));
    headParts.add(helmet, box, transform(0, -0.05, 0.14, 0.2, 0.1, 0.16));
    const visorGeometry = new THREE.SphereGeometry(1, 16, 8, Math.PI * 0.5 - 1, 2, Math.PI * 0.32, Math.PI * 0.26);
    headParts.add(visor, visorGeometry, transform(0, 0.06, 0, 0.22, 0.215, 0.24));
    headParts.build(head);
    visorGeometry.dispose();

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
    const arms = [-1, 1].map(() => createLimb(0.34, 0.34, 0.062, jersey, jersey));
    const legs = [-1, 1].map(() => createLimb(0.44, 0.46, 0.08, pants, pants));
    // Gloves wrapped round the grips: palm, fingers, thumb and the cuff.
    const hands = [-1, 1].map((side) => {
        const hand = new THREE.Group();
        const parts = new Parts();
        parts.add(glove, box, transform(0, 0.035, -0.005, 0.11, 0.05, 0.1));
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
    const kneeHint = new THREE.Vector3();
    const footTarget = new THREE.Vector3();
    const groundFoot = new THREE.Vector3();
    const forkQuaternion = new THREE.Quaternion();
    const handQuaternion = new THREE.Quaternion();

    // --- Animation state --------------------------------------------------
    const pose = {
        lean: 0, steer: 0, torso: 0.42, dive: 0, bounce: 0, bounceVelocity: 0, stop: 1, skid: 0,
        brake: 0, rearSpin: 0, frontSpin: 0, wasAirborne: false, peakAngle: 0, time: 0,
        surge: 0, pump: 0, throttle: 0, lastKmh: 0, lastAngle: 0
    };
    const crash = {
        active: false, time: 0, kind: 'hit', variant: 'tumble', side: 1, landed: false, landTime: 0,
        bikePitch: 0, bikeYaw: 0, bikeSlide: 2.4,
        velocity: new THREE.Vector3(), bikeVelocity: new THREE.Vector3(), spinRates: new THREE.Vector3()
    };

    function reset() {
        if (riderGroup.parent !== chassis) {
            chassis.add(riderGroup);
            riderGroup.position.set(0, 0, 0);
            riderGroup.rotation.set(0, 0, 0);
            riderGroup.scale.set(1, 1, 1);
            riderGroup.quaternion.identity();
        }
        crash.active = false;
        Object.assign(pose, {
            lean: 0, steer: 0, torso: 0.42, dive: 0, bounce: 0, bounceVelocity: 0, stop: 1, skid: 0,
            brake: 0, wasAirborne: false, peakAngle: 0, surge: 0, pump: 0, throttle: 0, lastKmh: 0, lastAngle: 0
        });
        chassis.position.set(0, 0, 0);
        chassis.rotation.set(0, 0, 0);
        update(0.016, { kmh: 0, throttle: 0, braking: false, steer: 0, angle: 0, angleRatio: 0, skidding: false, linear: true });
    }

    // frame: { kmh, throttle 0..1, braking, steer -1..1 (towards world +x),
    //          angle (rad), angleRatio 0..1, skidding, linear }
    function update(dt, frame) {
        pose.time += dt;
        const { kmh, throttle, braking, steer, angle, angleRatio, skidding, linear } = frame;
        const speedRatio = Math.min(1, kmh / 200);
        const airborne = angleRatio > 0.015;

        // Roll into the corner; less when balancing on the back wheel.
        const leanTarget = steer * (0.1 + 0.34 * Math.min(1, kmh / 120)) * (airborne ? 0.55 : 1);
        pose.lean = damp(pose.lean, leanTarget, 9, dt);
        pose.stop = damp(pose.stop, kmh < 4 && linear && !airborne ? 1 : 0, kmh < 4 ? 5 : 12, dt);
        pose.skid = damp(pose.skid, skidding ? 1 : 0, 10, dt);
        pose.brake = damp(pose.brake, braking ? 1 : 0, 14, dt);
        if (linear && !skidding) bikeGroup.rotation.z = pose.lean + pose.stop * 0.07;

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
        const reach = Math.min(1, kmh / 50);
        const hang = pose.lean * reach * (airborne ? 0.5 : 1);
        const tuck = Math.max(0, Math.min(1, (kmh - 120) / 90));
        const torsoTarget = 0.42 + angle * 0.36 + tuck * 0.24 + (braking ? 0.12 : -0.07 * throttle) - pose.stop * 0.12
            - pose.surge * 0.13 - pose.pump * 0.16;
        pose.torso = damp(pose.torso, torsoTarget, 7, dt);
        pelvis.rotation.x = pose.torso;
        pelvis.rotation.z = hang * 0.45 - pose.stop * 0.05 + pose.skid * Math.sin(pose.time * 17) * 0.05;
        pelvis.rotation.y = pose.steer * 0.3;
        pelvis.position.set(
            -hang * 0.2,
            PELVIS_REST.y + angleRatio * 0.04 - tuck * 0.02 - pose.bounce * 0.4,
            PELVIS_REST.z - angleRatio * 0.13 - pose.surge * 0.025 + Math.max(0, -pose.surge) * 0.02
        );
        // The head stays level and looks where the bike is going.
        head.rotation.x = -(pose.torso - 0.3) * 0.78 + tuck * 0.1;
        head.rotation.y = pose.steer * 1.1;
        head.rotation.z = -(pose.lean + hang * 0.45) * 0.65;

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
            overreach = Math.max(overreach, root.distanceTo(target) - (arms[i].lengthA + arms[i].lengthB) * 0.97);
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
            elbowHint.set(
                side * (0.85 + tuck * 0.55 + inside * 0.6 + pose.brake * 0.1),
                -0.55 + tuck * 0.3 - pose.brake * 0.25 + pose.pump * 0.25,
                -0.35 - tuck * 0.25 + inside * 0.2
            );
            solveLimb(arms[i], elbowHint);
            hands[i].position.copy(target);
            hands[i].quaternion.copy(handQuaternion);
            // Right hand (rider's right is -x): rolls the throttle open.
            if (side < 0) hands[i].rotateX(-pose.throttle * 0.5 + pose.brake * 0.15);
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
        crash.velocity.copy(forward).multiplyScalar(speed * spec.carry);
        crash.velocity.y = spec.up * SCALE * (0.9 + Math.random() * 0.2);
        crash.velocity.x += crash.side * spec.push * SCALE;
        // Spin in the bike's frame: [flip forward, yaw, roll towards the fall side].
        const jitter = () => 0.8 + Math.random() * 0.4;
        flat.crossVectors(UP, forward).normalize();
        crash.spinRates.set(0, 0, 0)
            .addScaledVector(flat, spec.spin[0] * jitter())
            .addScaledVector(UP, spec.spin[1] * (Math.random() - 0.5) * 2)
            .addScaledVector(forward, spec.spin[2] * crash.side * jitter());
        scene.attach(riderGroup);
    }

    // Arms and legs during the fall: flailing in the air, sprawled once down.
    function pelvisPoint(x, y, z, out) {
        return riderGroup.worldToLocal(pelvis.localToWorld(out.set(x, y, z)));
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
        if (!crash.active) return false;
        crash.time += dt;
        const t = crash.time;
        const spec = CRASHES[crash.variant];

        // Bike ------------------------------------------------------------
        if (spec.bike === 'flipBack') {
            bikePivot.rotation.x = Math.max(-2.75, bikePivot.rotation.x - dt * 5.5);
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
        crash.velocity.y -= 14 * SCALE * dt;
        riderGroup.position.addScaledVector(crash.velocity, dt);
        const ground = 0.22 * SCALE;
        if (riderGroup.position.y <= ground && crash.velocity.y <= 0) {
            riderGroup.position.y = ground;
            if (!crash.landed) crash.landTime = t;
            // Bounces once or twice on a hard landing.
            crash.velocity.y = crash.velocity.y < -3 ? -crash.velocity.y * 0.28 : 0;
            crash.landed = true;
        }
        if (crash.landed) {
            const friction = Math.exp(-dt * 2.6);
            crash.velocity.x *= friction;
            crash.velocity.z *= friction;
            // Keeps rolling along the ground for a moment, then settles flat.
            crash.spinRates.multiplyScalar(Math.exp(-dt * 3.2));
        }
        if (crash.spinRates.lengthSq() > 1e-4) {
            axis.copy(crash.spinRates).normalize();
            spinStep.setFromAxisAngle(axis, crash.spinRates.length() * dt);
            riderGroup.quaternion.premultiply(spinStep);
        }
        if (crash.landed && crash.spinRates.length() < 2.5) {
            // Lie down in whatever direction he was tipping.
            riderUp.set(0, 1, 0).applyQuaternion(riderGroup.quaternion);
            flat.set(riderUp.x, 0, riderUp.z);
            if (flat.lengthSq() < 1e-3) flat.copy(forward).multiplyScalar(-1);
            flat.normalize();
            settle.setFromUnitVectors(riderUp, flat);
            spinStep.identity().slerp(settle, 1 - Math.exp(-dt * 6));
            riderGroup.quaternion.premultiply(spinStep);
        }
        animateLimbs(t);
        return t < 3;
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

    reset();
    return {
        bikeGroup, bikePivot, materials, update, reset, startCrash, updateCrash, slideSpeed, getHitBox,
        get crashing() { return crash.active; },
        get crashVariant() { return crash.variant; },
        rearContact: new THREE.Vector3(0, 0, REAR_AXLE_Z)
    };
}
