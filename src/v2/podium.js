// The leaderboard's podium (realistic version): the top three standing on a
// podium in the street, seen from behind, each with their own look (hoodie
// and helmet colours, number, name across the back) and the pose they
// bought. What changed since the player last looked is played out: a new
// first jumps up with confetti, someone climbs a step, a newcomer runs in,
// the one who drops out walks off.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HOOD_TRANSFORM, createAraiTexture, createHelmetTexture } from './rider.js';
import { LIVERY_DEFAULT } from './livery.js';
import { JERSEY_GRIP, createHeldJersey } from './held-jersey.js';

const UP = new THREE.Vector3(0, 1, 0);
const PELVIS_Y = 0.93;
const FIGURE_SCALE = 1.08;
// Rank 1, 2, 3: 2nd on the left of the picture, 3rd on the right.
const BLOCKS = [
    { x: 0, height: 1.15, glow: 0xf6c416, ink: '#f6c416', label: '1' },
    { x: -1.42, height: 0.8, glow: 0xc9ced6, ink: '#dfe3ea', label: '2' },
    { x: 1.42, height: 0.55, glow: 0xd27f3a, ink: '#e09153', label: '3' }
];
const BLOCK_WIDTH = 1.36;
const BLOCK_DEPTH = 1.2;
const luminance = (color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

function matrixOf(px, py, pz, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    return new THREE.Matrix4().compose(
        new THREE.Vector3(px, py, pz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(sx, sy, sz));
}

// One mesh per material out of placed copies of shared geometries.
function merged(parent, material, parts) {
    const geometries = parts.map(([geometry, matrix]) => geometry.clone().applyMatrix4(matrix));
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false), material);
    geometries.forEach((geometry) => geometry.dispose());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
}

let shared = null;
function sharedParts() {
    if (shared) return shared;
    const profile = [[0.0, 0.0], [0.15, 0.0], [0.162, 0.1], [0.18, 0.24], [0.188, 0.38], [0.178, 0.46], [0.14, 0.53], [0.085, 0.58], [0.0, 0.6]]
        .map(([r, y]) => new THREE.Vector2(r, y));
    const printProfile = profile.slice(2, 6).map((point) => new THREE.Vector2(point.x * 1.012, point.y));
    const standard = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    shared = {
        torso: new THREE.LatheGeometry(profile, 20),
        print: new THREE.LatheGeometry(printProfile, 16, Math.PI - 1.25, 2.5),
        hood: new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        sphere: new THREE.SphereGeometry(1, 16, 12),
        box: new THREE.BoxGeometry(1, 1, 1),
        tube: new THREE.CylinderGeometry(1, 1, 1, 10),
        collar: new THREE.TorusGeometry(0.13, 0.035, 6, 16),
        hem: new THREE.CylinderGeometry(0.165, 0.152, 0.07, 20),
        shell: new THREE.SphereGeometry(1, 24, 16),
        chin: new THREE.SphereGeometry(1, 20, 8, Math.PI * 0.5 - 1.05, 2.1, Math.PI * 0.56, Math.PI * 0.24),
        visor: new THREE.SphereGeometry(1, 24, 10, Math.PI * 0.5 - 1.2, 2.4, Math.PI * 0.3, Math.PI * 0.27),
        neckRoll: new THREE.TorusGeometry(0.15, 0.035, 8, 18),
        armUpper: new THREE.CapsuleGeometry(0.07, 0.2, 4, 8),
        armLower: new THREE.CapsuleGeometry(0.07, 0.2, 4, 8),
        legUpper: new THREE.CapsuleGeometry(0.088, 0.264, 4, 8),
        legLower: new THREE.CapsuleGeometry(0.088, 0.284, 4, 8),
        finger: new THREE.CapsuleGeometry(0.02, 0.07, 3, 6),
        pants: standard(0x16181d, 0.85),
        glove: standard(0x0e0e10, 0.6),
        sneaker: standard(0xf2f2f0, 0.62),
        sole: standard(0xd8d8d6, 0.75),
        rubber: standard(0x0c0c0e, 0.88),
        visorMaterial: new THREE.MeshPhysicalMaterial({
            color: 0x0a0e16, metalness: 0.55, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03
        })
    };
    return shared;
}

// The back print of the podium figures: the name big across the upper back
// (readable from the camera), the number under it. The print wraps 2.5 rad
// of the torso and its rows are not evenly spread (lathe UVs), hence the
// tall, narrow letters on the canvas.
function createBackTexture(number, color, ink, name) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    ctx.fillStyle = ink;
    if (name) {
        ctx.font = '900 150px "Arial Black", Arial, sans-serif';
        ctx.lineWidth = 16;
        ctx.strokeText(name, size / 2, 116, size * 0.92);
        ctx.fillText(name, size / 2, 116, size * 0.92);
    }
    ctx.font = 'italic 900 250px "Arial Black", Arial, sans-serif';
    ctx.lineWidth = 18;
    ctx.strokeText(number, size / 2, name ? 362 : 300, size * 0.7);
    ctx.fillText(number, size / 2, name ? 362 : 300, size * 0.7);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

// Hands (left, right) in pelvis space for a figure facing +z (its left is
// +x), the elbows' bend, the head, for each pose. t: seconds, for life.
// front: the figure turns to face the people (the others show their back).
function poseOf(id, t) {
    const hip = (s) => ({ hand: [s * 0.235, 0.09, -0.02], pole: [s, 0, -0.45] });
    const sway = Math.sin(t * 2.1);
    switch (id) {
        case 'victoire': return {
            sides: [1, -1].map((s) => ({ hand: [s * 0.5, 1.12 + Math.sin(t * 3 + s) * 0.03, 0.06], pole: [s, -0.3, 0] }))
        };
        case 'cestmoi': return {
            sides: [1, -1].map((s) => ({ hand: [s * 0.21, 0.73 + Math.sin(t * 4) * 0.02, -0.08], pole: [s * 0.6, -0.4, 1] })),
            head: [0.08, 0, 0]
        };
        case 'muscles': return {
            sides: [1, -1].map((s) => ({ hand: [s * (0.4 + Math.sin(t * 3) * 0.015), 0.8, -0.02], pole: [s, -0.5, 0] }))
        };
        case 'maillot': {
            // The jersey held by the shoulders in front of the chest, hanging
            // down; every few seconds it is held out to the people below.
            // Then the arms reach forwards and down and the top of the cloth
            // leans out, the print turned to those looking up.
            const out = Math.max(0, Math.sin(t * 1.2)) ** 2;
            const grip = JERSEY_GRIP + out * 0.022;
            const y = 0.43 - out * 0.1 + sway * 0.008;
            const z = 0.3 + out * 0.2;
            return {
                sides: [1, -1].map((s) => ({ hand: [s * grip, y, z], pole: [s, -0.12, -0.3] })),
                head: [0.22 + out * 0.12, Math.sin(t * 0.6) * 0.06, 0],
                jersey: { y: y + 0.035, z: z - 0.025, grip, tilt: 0.08 + out * 0.3 },
                front: true
            };
        }
        case 'numero1': return {
            sides: [hip(1), { hand: [-0.27, 1.2, 0.08], pole: [-1, -0.2, 0] }],
            finger: true, head: [-0.12, 0, 0]
        };
        case 'dab': return {
            sides: [{ hand: [0.64, 0.98, 0.18], pole: [1, 0, 0] }, { hand: [0.03, 0.8, 0.27], pole: [-1, 0.6, 0.2] }],
            head: [0.45, -0.5, 0.15]
        };
        default: return { sides: [hip(1), hip(-1)] };
    }
}

function createFigure(scene) {
    const parts = sharedParts();
    const root = new THREE.Group();
    root.scale.setScalar(FIGURE_SCALE);
    root.visible = false;
    scene.add(root);
    const pelvis = new THREE.Group();
    pelvis.position.set(0, PELVIS_Y, 0);
    root.add(pelvis);

    const jersey = new THREE.MeshStandardMaterial({ color: 0xf6c416, roughness: 0.86 });
    const jerseyDark = new THREE.MeshStandardMaterial({ color: 0xd9a80f, roughness: 0.9 });
    const print = new THREE.MeshStandardMaterial({ roughness: 0.86 });
    const helmet = new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.2 });
    const shell = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.12, metalness: 0.2 });
    const sneaker = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.62 });
    const arai = new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.15 });
    const araiShell = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.12, metalness: 0.2 });
    const own = [jersey, jerseyDark, print, helmet, shell, sneaker, arai, araiShell];

    const shoulderBall = (s) => [parts.sphere, matrixOf(s * 0.205, 0.445, 0, 0.082, 0.08, 0.08)];
    merged(pelvis, jersey, [[parts.torso, matrixOf(0, 0.02, 0, 1.22, 1, 0.9)], shoulderBall(1), shoulderBall(-1), [parts.hood, HOOD_TRANSFORM().clone()]]);
    merged(pelvis, print, [[parts.print, matrixOf(0, 0.02, 0, 1.22, 1, 0.9)]]);
    merged(pelvis, jerseyDark, [
        [parts.collar, matrixOf(0, 0.6, -0.02, 1.05, 1, 0.9, Math.PI / 2 - 0.25)],
        [parts.hem, matrixOf(0, 0.045, 0, 1.23, 1, 0.92)],
        [parts.box, matrixOf(0, 0.17, 0.17, 0.26, 0.13, 0.03, 0.12)]
    ]);
    merged(pelvis, parts.pants, [[parts.sphere, matrixOf(0, 0.03, 0, 0.2, 0.15, 0.17)], [parts.tube, matrixOf(0, 0.6, 0.01, 0.06, 0.1, 0.06)]]);

    const head = new THREE.Group();
    head.position.set(0, 0.74, 0.03);
    pelvis.add(head);
    const classicHead = new THREE.Group();
    head.add(classicHead);
    merged(classicHead, helmet, [[parts.shell, matrixOf(0, 0.06, -0.005, 0.215, 0.212, 0.238)]]);
    merged(classicHead, shell, [[parts.chin, matrixOf(0, 0.05, 0.012, 0.222, 0.235, 0.252)], [parts.box, matrixOf(0, 0.2, -0.2, 0.17, 0.035, 0.07, 0.5)]]);
    merged(classicHead, parts.visorMaterial, [[parts.visor, matrixOf(0, 0.062, 0.004, 0.229, 0.224, 0.254)]]);
    // The Arai (as the rider's): longer shell, sharp chin, vents, big spoiler.
    const araiHead = new THREE.Group();
    araiHead.visible = false;
    head.add(araiHead);
    merged(araiHead, arai, [[parts.shell, matrixOf(0, 0.065, -0.012, 0.219, 0.216, 0.252)]]);
    merged(araiHead, araiShell, [
        [parts.chin, matrixOf(0, 0.045, 0.02, 0.226, 0.24, 0.262)],
        [parts.box, matrixOf(0, -0.06, 0.225, 0.13, 0.05, 0.05, -0.35)],
        [parts.box, matrixOf(0, 0.22, -0.21, 0.21, 0.04, 0.1, 0.6)],
        [parts.tube, matrixOf(0.226, 0.078, 0.034, 0.038, 0.016, 0.038, 0, 0, Math.PI / 2)],
        [parts.tube, matrixOf(-0.226, 0.078, 0.034, 0.038, 0.016, 0.038, 0, 0, Math.PI / 2)]
    ]);
    merged(araiHead, parts.visorMaterial, [[parts.visor, matrixOf(0, 0.064, 0.008, 0.233, 0.227, 0.262)]]);
    merged(head, parts.rubber, [[parts.neckRoll, matrixOf(0, -0.13, 0, 1.15, 1.25, 1, Math.PI / 2)]]);

    const limb = (upperGeometry, lowerGeometry, lengthA, lengthB, material) => {
        const upper = new THREE.Mesh(upperGeometry, material);
        const lower = new THREE.Mesh(lowerGeometry, material);
        upper.castShadow = lower.castShadow = true;
        pelvis.add(upper, lower);
        return { upper, lower, lengthA, lengthB };
    };
    const arms = [0, 1].map(() => limb(parts.armUpper, parts.armLower, 0.34, 0.34, jersey));
    const legs = [0, 1].map(() => limb(parts.legUpper, parts.legLower, 0.44, 0.46, parts.pants));
    const hands = [0, 1].map(() => {
        const hand = new THREE.Mesh(parts.sphere, parts.glove);
        hand.scale.set(0.068, 0.068, 0.074);
        pelvis.add(hand);
        return hand;
    });
    const finger = new THREE.Mesh(parts.finger, parts.glove);
    pelvis.add(finger);
    const shoes = [0, 1].map(() => {
        const shoe = new THREE.Group();
        const upper = new THREE.Mesh(parts.box, sneaker);
        upper.scale.set(0.11, 0.095, 0.25);
        upper.position.set(0, 0.025, 0.04);
        const sole = new THREE.Mesh(parts.box, parts.sole);
        sole.scale.set(0.118, 0.035, 0.29);
        sole.position.set(0, -0.035, 0.05);
        shoe.add(upper, sole);
        pelvis.add(shoe);
        return shoe;
    });
    // The jersey of the "maillot" pose (held-jersey.js).
    const held = createHeldJersey();
    pelvis.add(held.mesh);

    // Two-bone IK, pelvis space (as the rider's).
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const joint = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const pole = new THREE.Vector3();
    const segment = new THREE.Vector3();
    const place = (mesh, a, b, nominal) => {
        segment.subVectors(b, a);
        const length = segment.length();
        mesh.position.copy(a).addScaledVector(segment, 0.5);
        mesh.quaternion.setFromUnitVectors(UP, segment.divideScalar(length || 1));
        mesh.scale.set(1, length / nominal, 1);
    };
    const solve = (part, poleHint) => {
        direction.subVectors(to, from);
        const reach = part.lengthA + part.lengthB;
        const distance = Math.min(direction.length(), reach * 0.999);
        direction.normalize();
        to.copy(from).addScaledVector(direction, distance);
        const along = (part.lengthA * part.lengthA - part.lengthB * part.lengthB + distance * distance) / (2 * distance);
        const height = Math.sqrt(Math.max(0, part.lengthA * part.lengthA - along * along));
        pole.copy(poleHint).addScaledVector(direction, -poleHint.dot(direction)).normalize();
        joint.copy(from).addScaledVector(direction, along).addScaledVector(pole, height);
        place(part.upper, from, joint, part.lengthA);
        place(part.lower, joint, to, part.lengthB);
    };
    const hint = new THREE.Vector3();

    let look = null;
    let lookKey = '';
    function setLook(next, name) {
        const value = { ...LIVERY_DEFAULT, ...(next || {}) };
        const key = `${value.number}|${value.hoodie}|${value.helmet}|${value.helmetStyle}|${value.shoes}|${name}`;
        if (key === lookKey) {
            look = value;
            return;
        }
        lookKey = key;
        look = value;
        sneaker.color.set(value.shoes || '#f2f2f0');
        const araiOn = value.helmetStyle === 'arai';
        classicHead.visible = !araiOn;
        araiHead.visible = araiOn;
        if (araiOn) {
            const base = luminance(new THREE.Color(value.helmet)) > 0.6 ? '#1a1b1f' : '#f2f2f0';
            arai.map?.dispose();
            arai.map = createAraiTexture(base, value.helmet, String(value.number));
            arai.needsUpdate = true;
            araiShell.color.set(base);
        }
        jersey.color.set(value.hoodie);
        jerseyDark.color.set(value.hoodie).multiplyScalar(0.84);
        const ink = luminance(jersey.color) > 0.35 ? '#111' : '#f6c416';
        print.map?.dispose();
        print.map = createBackTexture(String(value.number), value.hoodie, ink, String(name || '').slice(0, 15));
        print.needsUpdate = true;
        const shellColor = new THREE.Color(value.helmet);
        helmet.map?.dispose();
        helmet.map = createHelmetTexture(value.helmet, luminance(shellColor) > 0.45 ? '#111111' : '#f2c014', String(value.number));
        helmet.needsUpdate = true;
        shell.color.set(value.helmet);
        held.setPrint(value.hoodie, ink, String(value.number), String(name || '').slice(0, 12));
    }

    // Body: 'stand' (the pose), 'run' or 'air'. phase: running cycle.
    function animate(t, motion, phase) {
        const pose = poseOf(look?.pose, t);
        const breathing = motion === 'stand' ? Math.sin(t * 2) * 0.006 : 0;
        pelvis.position.y = PELVIS_Y + breathing + (motion === 'run' ? Math.abs(Math.sin(phase)) * 0.04 : 0);
        head.rotation.set(...(motion === 'stand' && pose.head ? pose.head : [0, 0, 0]));
        const holding = motion === 'stand' && !!pose.jersey;
        held.mesh.visible = holding;
        if (holding) held.update(t, 0, pose.jersey.y, pose.jersey.z, pose.jersey.grip, pose.jersey.tilt);
        finger.visible = false;
        for (let i = 0; i < 2; i++) {
            const s = i === 0 ? 1 : -1;
            // Legs: feet under the hips, swinging when running, tucked in the air.
            const swing = motion === 'run' ? Math.sin(phase + i * Math.PI) : 0;
            const tuck = motion === 'air' ? 0.22 : 0;
            from.set(s * 0.12, 0, 0.02);
            to.set(s * 0.13, -PELVIS_Y + 0.1 + tuck + Math.max(0, swing) * 0.12, 0.03 + swing * 0.28 + tuck * 0.3);
            solve(legs[i], hint.set(0, 0, 1));
            shoes[i].position.set(to.x, to.y - 0.05, to.z);
            // Arms: the pose standing, swinging when running, up in the air.
            from.set(s * 0.215, 0.49, 0);
            if (motion === 'run') {
                to.set(s * 0.24, 0.22, -swing * 0.26);
                hint.set(s * 0.3, -0.2, -1);
            } else if (motion === 'air') {
                to.set(s * 0.42, 0.85, 0.05);
                hint.set(s, -0.4, 0);
            } else {
                const side = pose.sides[i];
                to.set(...side.hand);
                hint.set(...side.pole);
            }
            solve(arms[i], hint);
            hands[i].position.copy(to);
            if (motion === 'stand' && pose.finger && i === 1) {
                finger.visible = true;
                finger.position.set(to.x, to.y + 0.09, to.z);
            }
        }
    }

    function dispose() {
        own.forEach((material) => {
            material.map?.dispose();
            material.dispose();
        });
        held.dispose();
        scene.remove(root);
    }

    return {
        root, setLook, animate, dispose,
        get look() { return look; },
        // Standing, this pose faces the people (0) or shows its back (pi).
        get facing() { return poseOf(look?.pose, 0).front ? 0 : Math.PI; }
    };
}

// The label on each step's front: laurel, the place, the name and score.
function createLabelTexture(block, name, score) {
    const width = 512;
    const height = Math.round(width * block.height / BLOCK_WIDTH);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1d2027');
    gradient.addColorStop(1, '#0d0f13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = block.ink;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.globalAlpha = 1;
    const cx = width / 2;
    const numberY = Math.min(height * 0.36, 150);
    // Laurel: leaves along two arcs around the number.
    ctx.fillStyle = block.ink;
    const radius = Math.min(110, height * 0.3);
    for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
            const a = Math.PI / 2 + side * (0.55 + i * 0.27);
            const x = cx + Math.cos(a) * radius;
            const y = numberY - Math.sin(a) * radius * 0.85 + radius * 0.25;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-a + (side > 0 ? 0.6 : -0.6));
            ctx.beginPath();
            ctx.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(Math.min(150, height * 0.42))}px "Arial Black", Arial, sans-serif`;
    ctx.fillStyle = block.ink;
    ctx.fillText(block.label, cx, numberY);
    if (name) {
        let size = Math.round(Math.min(58, height * 0.17));
        ctx.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
        while (size > 24 && ctx.measureText(name).width > width - 60) {
            size -= 2;
            ctx.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillText(name, cx, height * 0.7);
        ctx.font = `900 ${Math.round(size * 0.85)}px "Arial Black", Arial, sans-serif`;
        ctx.fillStyle = block.ink;
        ctx.fillText(String(score), cx, height * 0.7 + size * 1.05);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

export function createPodium({ scene }) {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);

    // Base: a dark disc ringed with light.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.45, 0.08, 48), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.4, metalness: 0.4 }));
    base.position.y = 0.04;
    base.receiveShadow = true;
    group.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.32, 0.03, 8, 96), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xf6c416, emissiveIntensity: 2 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.085;
    group.add(ring);

    const stepMaterial = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.35, metalness: 0.45 });
    const steps = BLOCKS.map((block) => {
        const label = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.22 });
        label.emissiveMap = null;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_WIDTH, block.height, BLOCK_DEPTH),
            [stepMaterial, stepMaterial, stepMaterial, stepMaterial, label, stepMaterial]);
        mesh.position.set(block.x, 0.08 + block.height / 2, 0);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        // Light strips along the top edges.
        const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: block.glow, emissiveIntensity: 1.8 });
        const strip = (w, d, x, z) => {
            const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), glow);
            edge.position.set(block.x + x, 0.08 + block.height + 0.005, z);
            group.add(edge);
        };
        strip(BLOCK_WIDTH, 0.03, 0, BLOCK_DEPTH / 2);
        strip(BLOCK_WIDTH, 0.03, 0, -BLOCK_DEPTH / 2);
        strip(0.03, BLOCK_DEPTH, BLOCK_WIDTH / 2, 0);
        strip(0.03, BLOCK_DEPTH, -BLOCK_WIDTH / 2, 0);
        return { block, mesh, label, top: new THREE.Vector3(block.x, 0.08 + block.height, -0.05), labelKey: '' };
    });

    // Confetti: small gold and white papers falling and turning.
    const CONFETTI = 150;
    const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.045),
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONFETTI);
    confetti.frustumCulled = false;
    group.add(confetti);
    const papers = Array.from({ length: CONFETTI }, (_, i) => ({
        position: new THREE.Vector3(0, -10, 0), velocity: new THREE.Vector3(), spin: new THREE.Vector3(),
        rotation: new THREE.Euler(), alive: false
    }));
    const palette = [0xf6c416, 0xffe27a, 0xffffff, 0xd9a21b, 0xf6c416];
    papers.forEach((_, i) => confetti.setColorAt(i, new THREE.Color(palette[i % palette.length])));
    let confettiTime = 0;
    const dummy = new THREE.Object3D();
    function launchPaper(paper, high) {
        paper.alive = true;
        paper.position.set((Math.random() - 0.5) * 6, high ? 3.5 + Math.random() * 3 : 2 + Math.random(), (Math.random() - 0.5) * 2.4);
        paper.velocity.set((Math.random() - 0.5) * 0.4, -(0.7 + Math.random() * 0.7), (Math.random() - 0.5) * 0.3);
        paper.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    }
    function celebrate(seconds = 4.5) {
        confettiTime = Math.max(confettiTime, seconds);
        papers.forEach((paper) => launchPaper(paper, true));
    }

    // Figures by player; a separate one for the player's own preview.
    const figures = new Map();
    const spare = [];
    let time = 0;
    function figureFor(key) {
        let entry = figures.get(key);
        if (!entry) {
            entry = { figure: spare.pop() || createFigure(group), key, path: [], rank: null, leaving: false, phase: 0, motion: 'stand', facing: Math.PI };
            figures.set(key, entry);
        }
        return entry;
    }
    const groundFront = (x) => new THREE.Vector3(x, 0.08, 1.25);

    // Moves: run (on the ground), jump (an arc), wait. Each from where the
    // previous one ends.
    function go(entry, kind, to, duration, height = 0) {
        const from = entry.path.length ? entry.path[entry.path.length - 1].to : entry.figure.root.position.clone();
        entry.path.push({ kind, from: from.clone(), to: to.clone(), duration, height, t: 0 });
    }
    function wait(entry, seconds) {
        go(entry, 'wait', entry.path.length ? entry.path[entry.path.length - 1].to : entry.figure.root.position, seconds);
    }

    function standOn(entry, rank) {
        entry.rank = rank;
        entry.path = [];
        entry.figure.root.position.copy(steps[rank].top);
        entry.figure.root.visible = true;
    }

    function enter(entry, rank, delay) {
        const side = steps[rank].block.x < 0 || (steps[rank].block.x === 0 && Math.random() < 0.5) ? -1 : 1;
        entry.rank = rank;
        entry.leaving = false;
        entry.path = [];
        entry.figure.root.position.set(side * 6.5, 0.08, 1.4);
        entry.figure.root.visible = delay <= 0;
        if (delay > 0) wait(entry, delay);
        go(entry, 'run', groundFront(steps[rank].block.x), 1.3);
        go(entry, 'jump', steps[rank].top, 0.75, 0.55);
    }

    function climb(entry, rank) {
        entry.rank = rank;
        entry.path = [];
        go(entry, 'jump', steps[rank].top, 1.1, 1.2);
    }

    function leave(entry) {
        entry.leaving = true;
        entry.rank = null;
        entry.path = [];
        const x = entry.figure.root.position.x;
        go(entry, 'jump', groundFront(x), 0.6, 0.4);
        go(entry, 'run', new THREE.Vector3(x < 0 ? -7 : 7, 0.08, 1.4), 1.2);
    }

    function setLabels(entries) {
        steps.forEach((step, rank) => {
            const entry = entries[rank];
            const key = entry ? `${entry.name}|${entry.score}` : '';
            if (key === step.labelKey) return;
            step.labelKey = key;
            step.label.map?.dispose();
            step.label.map = createLabelTexture(step.block, entry?.name || '', entry?.score ?? '');
            step.label.emissiveMap = step.label.map;
            step.label.needsUpdate = true;
        });
    }

    // entries: [{ key, name, score, look }] best first (3 at most). previous:
    // the same, as last seen, or null the first time. Returns what changed,
    // for the caption.
    function setStandings(entries, previous) {
        const events = [];
        const before = new Map((previous || []).map((entry, rank) => [entry.key, rank]));
        const now = new Set(entries.map((entry) => entry.key));
        lastEntries = entries;
        // Those who drop out walk off: they need a figure to do it.
        (previous || []).forEach((old) => {
            if (now.has(old.key)) return;
            const entry = figureFor(old.key);
            entry.figure.setLook(old.look, old.name);
        });
        setLabels(entries);
        entries.forEach((data, rank) => {
            const entry = figureFor(data.key);
            entry.figure.setLook(data.look, data.name);
            const was = before.has(data.key) ? before.get(data.key) : null;
            if (!previous) {
                // First visit: they all come in, third first.
                enter(entry, rank, (2 - rank) * 0.45);
            } else if (was === null) {
                if (entry.rank === null || entry.leaving) enter(entry, rank, 0.4);
                events.push({ type: 'enter', name: data.name, rank });
            } else if (was !== rank) {
                if (entry.rank === null) standOn(entry, was);
                climb(entry, rank);
                if (rank < was) events.push({ type: 'up', name: data.name, rank });
            } else if (entry.rank !== rank || !entry.figure.root.visible) {
                standOn(entry, rank);
            }
        });
        for (const [key, entry] of figures) {
            if (now.has(key) || entry.leaving) continue;
            if (entry.rank === null && before.has(key)) standOn(entry, before.get(key));
            if (entry.rank !== null) leave(entry);
        }
        if (!previous || (entries[0] && before.get(entries[0].key) !== 0)) celebrate(previous ? 5 : 3);
        // The most striking first: a new first place.
        return events.sort((a, b) => a.rank - b.rank);
    }

    // The player's own figure, trying a pose: alone on the top step (the
    // pose screen, "solo"), or beside the steps for a few seconds.
    let preview = null;
    let previewTime = 0;
    let solo = false;
    let lastEntries = [];
    function showPreview(look, name) {
        if (!preview) preview = { figure: createFigure(group) };
        preview.figure.setLook(look, name);
        if (solo) {
            preview.figure.root.position.copy(steps[0].top);
            previewTime = Infinity;
        } else {
            // Beside the steps, not in front of the labels.
            preview.figure.root.position.set(2.65, 0.08, 1.5);
            previewTime = 6;
        }
        if (preview.facing === undefined) preview.facing = preview.figure.facing;
        preview.figure.root.rotation.y = preview.facing;
        preview.figure.root.visible = true;
    }
    function setSolo(on, look, name) {
        solo = on;
        if (on) {
            setLabels([{ name, score: '' }]);
            showPreview(look, name);
        } else {
            previewTime = 0;
            setLabels(lastEntries);
        }
    }
    // Seconds until every figure has reached its step (0 when still).
    function remaining() {
        let longest = 0;
        for (const entry of figures.values()) {
            const left = entry.path.reduce((sum, move) => sum + Math.max(0, move.duration - move.t), 0);
            longest = Math.max(longest, left);
        }
        return longest;
    }

    const step = new THREE.Vector3();
    function update(dt) {
        time += dt;
        for (const [key, entry] of figures) {
            const root = entry.figure.root;
            let motion = 'stand';
            const move = entry.path[0];
            if (move) {
                move.t += dt;
                const k = Math.min(1, move.t / move.duration);
                if (move.kind === 'wait') {
                    root.visible = false;
                } else {
                    root.visible = true;
                    const eased = move.kind === 'run' ? k : k * k * (3 - 2 * k);
                    root.position.lerpVectors(move.from, move.to, eased);
                    if (move.kind === 'jump') root.position.y += 4 * move.height * k * (1 - k);
                    motion = move.kind === 'jump' ? 'air' : 'run';
                    step.subVectors(move.to, move.from);
                    if (motion === 'run' && step.lengthSq() > 1e-4) entry.facing = Math.atan2(step.x, step.z);
                }
                if (k >= 1) entry.path.shift();
            } else if (entry.leaving) {
                root.visible = false;
                entry.leaving = false;
                figures.delete(key);
                spare.push(entry.figure);
                continue;
            }
            if (motion === 'stand') entry.facing += (entry.figure.facing - entry.facing) * Math.min(1, dt * 6);
            root.rotation.y = entry.facing;
            entry.phase += dt * 11;
            entry.figure.animate(time + key.length, motion, entry.phase);
            // The pose screen: only the player, on the top step.
            if (solo) root.visible = false;
        }
        if (preview) {
            previewTime -= dt;
            preview.figure.root.visible = previewTime > 0;
            if (previewTime > 0) {
                // Turns round when the pose tried faces the other way.
                preview.facing += (preview.figure.facing - preview.facing) * Math.min(1, dt * 6);
                preview.figure.root.rotation.y = preview.facing;
                preview.figure.animate(time, 'stand', 0);
            }
        }
        // Confetti
        confettiTime = Math.max(0, confettiTime - dt);
        papers.forEach((paper, i) => {
            if (paper.alive) {
                paper.position.addScaledVector(paper.velocity, dt);
                paper.position.x += Math.sin(time * 2 + i) * dt * 0.3;
                paper.rotation.x += paper.spin.x * dt;
                paper.rotation.y += paper.spin.y * dt;
                paper.rotation.z += paper.spin.z * dt;
                if (paper.position.y < 0.1) {
                    if (confettiTime > 0) launchPaper(paper, true);
                    else paper.alive = false;
                }
            }
            dummy.position.copy(paper.alive ? paper.position : step.set(0, -50, 0));
            dummy.rotation.copy(paper.rotation);
            dummy.updateMatrix();
            confetti.setMatrixAt(i, dummy.matrix);
        });
        confetti.instanceMatrix.needsUpdate = true;
    }

    // Placed on the road ahead of the bike (the menu's view), facing away.
    function place(anchor) {
        group.position.set(anchor.x, 0, anchor.z - 14);
    }

    // The camera behind the figures, framing the podium in the free part of
    // the screen (beside or above the leaderboard). orbit: turned by the
    // player's finger (all the way round to see their faces).
    const target = new THREE.Vector3();
    let orbit = 0;
    let orbitSpeed = 0;
    let dragging = false;
    // Two fingers apart (or the mouse wheel): closer, to read the names.
    let zoom = 1;
    function orbitBy(radians) {
        orbit += radians;
        orbitSpeed = radians;
    }
    function zoomBy(factor) {
        zoom = Math.max(0.38, Math.min(1.5, zoom / factor));
    }
    function setDragging(on) {
        dragging = on;
    }
    function frame(camera, area) {
        const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const halfV = Math.atan(halfTan * (area.y1 - area.y0) / area.height);
        const halfH = Math.atan(halfTan * camera.aspect * (area.x1 - area.x0) / area.width);
        // Solo: closer, on the one figure.
        const radius = solo ? 1.7 : 2.75;
        const distance = Math.max(solo ? 3.4 : 4.6, radius / Math.sin(Math.min(halfV, halfH))) * zoom;
        // A little momentum after the finger leaves.
        if (!dragging) {
            orbit += orbitSpeed;
            orbitSpeed *= 0.9;
        }
        const sway = Math.sin(time * 0.25) * 0.15 + orbit;
        const focusX = solo ? steps[0].top.x : 0;
        // Zoomed in: aim up at the backs, where the names are.
        const closer = Math.max(0, Math.min(1, (1 - zoom) / 0.62));
        const focusY = (solo ? steps[0].top.y + 0.95 : 1.5) + closer * (solo ? 0.25 : 0.55);
        camera.position.set(
            group.position.x + focusX + Math.sin(sway) * distance,
            group.position.y + focusY - 0.15 + distance * 0.16,
            group.position.z + Math.cos(sway) * distance);
        target.set(group.position.x + focusX, group.position.y + focusY, group.position.z);
        camera.lookAt(target);
        const centreX = (area.x0 + area.x1) / 2;
        const centreY = (area.y0 + area.y1) / 2;
        camera.setViewOffset(area.width, area.height, area.width / 2 - centreX, area.height / 2 - centreY, area.width, area.height);
    }

    return {
        group, setStandings, update, place, frame, celebrate, preview: showPreview, setSolo, remaining, orbitBy, setDragging, zoomBy,
        resetOrbit: () => { orbit = 0; orbitSpeed = 0; zoom = 1; }
    };
}
