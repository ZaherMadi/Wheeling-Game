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

export function createRider({ scene }) {
    // --- Materials --------------------------------------------------------
    const standard = (color, roughness, metalness = 0) =>
        new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const paint = standard(0x1746d1, 0.28, 0.55);
    const rubber = standard(0x0c0c0e, 0.88);
    const darkMetal = standard(0x1a1c20, 0.45, 0.75);
    const chrome = standard(0xc4cad1, 0.18, 1);
    const seatMaterial = standard(0x101114, 0.7);
    const jersey = standard(0xf6c416, 0.78);
    const jerseyPrint = new THREE.MeshStandardMaterial({ map: createJerseyTexture(), roughness: 0.78 });
    const pants = standard(0x1b1e25, 0.82);
    const helmet = standard(0x08080a, 0.1, 0.25);
    const visor = standard(0x10243d, 0.04, 0.9);
    const glove = standard(0x0e0e10, 0.6);
    const sole = standard(0xe8e8ea, 0.7);
    const plate = standard(0xe9e9e4, 0.6);
    const tailLight = new THREE.MeshBasicMaterial({ color: 0xff2a1f });
    const headLight = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
    const glowTexture = createGlowTexture();
    const materials = [
        paint, rubber, darkMetal, chrome, seatMaterial, jersey, jerseyPrint, pants, helmet, visor,
        glove, sole, plate, tailLight, headLight
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
            parts.add(chrome, box, transform(0, 0, 0, width * 0.62, rim * 1.9, 0.03, (i / 5) * Math.PI));
        }
        parts.build(wheel);
        tyre.dispose();
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
        forkParts.add(chrome, tube, transform(side * 0.11, -FORK_LENGTH / 2 + 0.03, 0, 0.03, FORK_LENGTH + 0.1, 0.03));
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
    body.add(pants, tube, transform(0, 0.6, 0.01, 0.06, 0.1, 0.06));
    body.build(pelvis);
    torsoGeometry.dispose();
    printGeometry.dispose();

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
    const arms = [-1, 1].map(() => createLimb(0.34, 0.34, 0.058, jersey, jersey));
    const legs = [-1, 1].map(() => createLimb(0.44, 0.46, 0.078, pants, pants));
    const hands = [-1, 1].map(() => {
        const mesh = new THREE.Mesh(sphere, glove);
        mesh.scale.setScalar(0.068);
        mesh.castShadow = true;
        riderGroup.add(mesh);
        return mesh;
    });
    const shoes = [-1, 1].map(() => {
        const shoe = new THREE.Group();
        const parts = new Parts();
        parts.add(glove, box, transform(0, 0.02, 0.05, 0.11, 0.1, 0.27));
        parts.add(sole, box, transform(0, -0.04, 0.05, 0.115, 0.03, 0.28));
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

    // --- Animation state --------------------------------------------------
    const pose = {
        lean: 0, steer: 0, torso: 0.42, dive: 0, bounce: 0, bounceVelocity: 0, stop: 1, skid: 0,
        brake: 0, rearSpin: 0, frontSpin: 0, wasAirborne: false, peakAngle: 0, time: 0
    };
    const crash = {
        active: false, time: 0, kind: 'hit', side: 1, spin: 0, fall: 1, tumble: 0, landed: false,
        velocity: new THREE.Vector3(), bikeVelocity: new THREE.Vector3()
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
            brake: 0, wasAirborne: false, peakAngle: 0
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

        // Bars: visible steering at walking pace, a hint of it at speed.
        const steerTarget = -steer * (0.3 - 0.24 * Math.min(1, kmh / 70)) + (skidding ? Math.sin(pose.time * 31) * 0.12 : 0);
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

        // Rider: stays upright in a wheelie, tucks at speed, shifts with load.
        const tuck = Math.max(0, Math.min(1, (kmh - 120) / 90));
        const torsoTarget = 0.42 + angle * 0.36 + tuck * 0.24 + (braking ? 0.1 : -0.07 * throttle) - pose.stop * 0.12;
        pose.torso = damp(pose.torso, torsoTarget, 7, dt);
        pelvis.rotation.x = pose.torso;
        pelvis.rotation.z = -pose.lean * 0.3 - pose.stop * 0.05 + pose.skid * Math.sin(pose.time * 17) * 0.05;
        pelvis.rotation.y = pose.steer * 0.25;
        pelvis.position.set(
            -pose.lean * 0.05,
            PELVIS_REST.y + angleRatio * 0.04 - tuck * 0.02 - pose.bounce * 0.4,
            PELVIS_REST.z - angleRatio * 0.13
        );
        head.rotation.x = -(pose.torso - 0.3) * 0.78 + tuck * 0.1;
        head.rotation.y = pose.steer * 1.1;
        head.rotation.z = pose.lean * 0.45;

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

        // Arms
        for (let i = 0; i < 2; i++) {
            const side = i === 0 ? -1 : 1;
            toRiderSpace(shoulders[i], root);
            toRiderSpace(grips[i], target);
            elbowHint.set(side * 1, -0.55, -0.35);
            solveLimb(arms[i], elbowHint);
            hands[i].position.copy(target);
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
            kneeHint.set(side * 0.35, 0.4, 1);
            solveLimb(legs[i], kneeHint);
            shoes[i].position.copy(target);
            shoes[i].rotation.set(0, side * 0.12, 0);
        }
    }

    // --- Crash ------------------------------------------------------------
    // kind 'loop' = flipped over backwards, 'hit' = taken down by an obstacle.
    const forward = new THREE.Vector3();
    function startCrash(kind, unitsPerSecond) {
        crash.active = true;
        crash.time = 0;
        crash.kind = kind;
        crash.side = Math.random() < 0.5 ? -1 : 1;
        crash.fall = kind === 'loop' ? -1 : 1;
        crash.spin = crash.fall * (kind === 'loop' ? 5 : 3.5) * (0.8 + Math.random() * 0.4);
        crash.tumble = 0;
        crash.landed = false;
        forward.set(0, 0, 1).applyQuaternion(bikeGroup.quaternion);
        const speed = Math.min(unitsPerSecond, 34);
        crash.bikeVelocity.copy(forward).multiplyScalar(speed);
        // Stay close to the bike so the fall is still in frame.
        crash.velocity.copy(forward).multiplyScalar(speed * (kind === 'loop' ? 0.82 : 0.9));
        crash.velocity.y = (kind === 'loop' ? 2.4 : 3.2) * SCALE;
        crash.velocity.x += crash.side * 2.2 * SCALE;
        scene.attach(riderGroup);
    }

    // Returns false once everything has come to rest.
    function updateCrash(dt) {
        if (!crash.active) return false;
        crash.time += dt;
        const t = crash.time;
        // Bike: finish the back-flip or lay down, then scrape to a stop.
        if (crash.kind === 'loop') {
            bikePivot.rotation.x = Math.max(-2.75, bikePivot.rotation.x - dt * 5.5);
            bikeGroup.rotation.z = damp(bikeGroup.rotation.z, crash.side * 0.5, 4, dt);
        } else {
            bikeGroup.rotation.z = damp(bikeGroup.rotation.z, crash.side * 1.36, 7, dt);
            bikePivot.rotation.x = damp(bikePivot.rotation.x, 0, 8, dt);
            bikeGroup.position.y = damp(bikeGroup.position.y, 0.16 * SCALE, 7, dt);
        }
        bikeGroup.position.addScaledVector(crash.bikeVelocity, dt);
        crash.bikeVelocity.multiplyScalar(Math.exp(-dt * 2.4));
        rearWheel.rotation.x += pose.rearSpin * Math.exp(-t * 1.5) * dt;
        frontWheel.rotation.x += pose.frontSpin * Math.exp(-t * 1.5) * dt;
        contactShadow.position.set(bikeGroup.position.x, 0.02, bikeGroup.position.z);
        contactShadow.material.opacity = 0.35;

        // Rider: thrown clear, tumbles in the air, slides out lying down.
        crash.velocity.y -= 14 * SCALE * dt;
        riderGroup.position.addScaledVector(crash.velocity, dt);
        if (riderGroup.position.y <= 0.22 * SCALE && crash.velocity.y <= 0) {
            riderGroup.position.y = 0.22 * SCALE;
            crash.velocity.y = crash.velocity.y < -2.5 ? -crash.velocity.y * 0.22 : 0;
            crash.landed = true;
        }
        let tumble;
        if (crash.landed) {
            const friction = Math.exp(-dt * 2.6);
            crash.velocity.x *= friction;
            crash.velocity.z *= friction;
            tumble = (crash.fall * Math.PI / 2 - crash.tumble) * (1 - Math.exp(-dt * 7));
        } else {
            tumble = crash.spin * dt * 0.6;
        }
        crash.tumble += tumble;
        riderGroup.rotateX(tumble);
        return t < 2.6;
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
        rearContact: new THREE.Vector3(0, 0, REAR_AXLE_Z)
    };
}
