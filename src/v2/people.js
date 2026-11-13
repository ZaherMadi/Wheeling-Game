// Free roam pedestrians: people walking on both pavements, drawn as
// instances (one mesh per body part for the whole crowd) and animated with a
// simple walk cycle. Recycled around the player. Stick figures with style:
// caps, beanies, hats, sunglasses, headphones, backpacks, skirts, ponytails
// (no faces). They stop to talk to the player and stagger when bumped.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const S = 1.02; // Life size: about 1.75 m.
const SHIRTS = [0xe8e2d6, 0x2b3a55, 0xa8322d, 0x3f6b3a, 0xd6a64a, 0x6b4c8a, 0x1d1e22, 0xf2f2f0, 0x4a7ea8, 0xc75b8a, 0xe07a2e, 0x2e8c84];
const TROUSERS = [0x22252b, 0x2f3d5c, 0x5c4a38, 0x8a8f98, 0x1a1b1f, 0x3b5a7a, 0xc8b89a];
const SKINS = [0xf1c8a8, 0xd9a07a, 0xa86b4a, 0x6e4430, 0xe8b894];
const HAIR = [0x1a1410, 0x3b2a1e, 0x6b4a2e, 0xc9a46a, 0x2a2a2a, 0x8a8a8a, 0x9a3a22];
const HATS = [0x1d1e22, 0xf2f2f0, 0xa8322d, 0x2b3a55, 0xd6a64a, 0x3f6b3a, 0xe07a2e, 0x8a8f98, 0xc75b8a];
const SHOES = [0xf4f4f0, 0x1a1a1c, 0x8a5a3a, 0xd8d8d8, 0xa8322d];
const LENSES = [0x0a0a0c, 0x1a1208, 0x0d1a2e, 0x2a0f12];
const PACKS = [0x1d1e22, 0x2b3a55, 0xa8322d, 0x3f6b3a, 0xd6a64a, 0x8a8f98];

const at = (geometry, x, y, z, rx = 0, ry = 0, rz = 0) => {
    geometry.rotateX(rx).rotateY(ry).rotateZ(rz);
    return geometry.translate(x * S, y * S, z * S);
};
const merge = (...parts) => {
    const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    parts.forEach((g) => g.dispose());
    return merged;
};

function buildGeometries() {
    const headY = 1.62;
    return {
        torso: new THREE.CapsuleGeometry(0.17 * S, 0.42 * S, 4, 10).translate(0, 1.18 * S, 0),
        head: new THREE.SphereGeometry(0.11 * S, 12, 10).translate(0, headY * S, 0),
        hair: new THREE.SphereGeometry(0.118 * S, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, (headY + 0.02) * S, -0.01 * S),
        // Limbs hang from their joint: the origin is the hip / shoulder.
        leg: new THREE.CapsuleGeometry(0.075 * S, 0.74 * S, 4, 6).translate(0, -0.44 * S, 0),
        arm: new THREE.CapsuleGeometry(0.052 * S, 0.56 * S, 4, 6).translate(0, -0.33 * S, 0),
        shoe: new THREE.BoxGeometry(0.12 * S, 0.075 * S, 0.24 * S).translate(0, -0.885 * S, 0.045 * S),
        cap: merge(
            at(new THREE.SphereGeometry(0.122, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(S, S, S), 0, headY + 0.01, 0),
            at(new THREE.BoxGeometry(0.2 * S, 0.016 * S, 0.13 * S), 0, headY + 0.03, 0.135, -0.12)
        ),
        beanie: merge(
            at(new THREE.SphereGeometry(0.124, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(S, S * 1.18, S), 0, headY + 0.005, 0),
            at(new THREE.TorusGeometry(0.118 * S, 0.022 * S, 6, 18), 0, headY + 0.02, 0, Math.PI / 2),
            at(new THREE.SphereGeometry(0.035 * S, 8, 6), 0, headY + 0.155, 0)
        ),
        bucket: merge(
            at(new THREE.CylinderGeometry(0.1 * S, 0.122 * S, 0.1 * S, 16), 0, headY + 0.1, 0),
            at(new THREE.CylinderGeometry(0.185 * S, 0.2 * S, 0.014 * S, 18), 0, headY + 0.05, 0)
        ),
        fedora: merge(
            at(new THREE.CylinderGeometry(0.092 * S, 0.112 * S, 0.12 * S, 16), 0, headY + 0.13, 0),
            at(new THREE.CylinderGeometry(0.21 * S, 0.21 * S, 0.012 * S, 20), 0, headY + 0.075, 0)
        ),
        // Wrap-around sunglasses: a band of dark glass across the front.
        glasses: merge(
            at(new THREE.CylinderGeometry(0.117 * S, 0.117 * S, 0.042 * S, 18, 1, true, -0.95, 1.9), 0, headY + 0.015, 0),
            at(new THREE.CylinderGeometry(0.119 * S, 0.119 * S, 0.012 * S, 18, 1, true, -1.55, 3.1), 0, headY + 0.03, 0)
        ),
        headphones: merge(
            at(new THREE.TorusGeometry(0.128 * S, 0.014 * S, 6, 18, Math.PI), 0, headY, 0),
            at(new THREE.CylinderGeometry(0.048 * S, 0.048 * S, 0.04 * S, 12), 0.125, headY - 0.01, 0, 0, 0, Math.PI / 2),
            at(new THREE.CylinderGeometry(0.048 * S, 0.048 * S, 0.04 * S, 12), -0.125, headY - 0.01, 0, 0, 0, Math.PI / 2)
        ),
        backpack: merge(
            at(new THREE.BoxGeometry(0.28 * S, 0.34 * S, 0.13 * S), 0, 1.24, -0.215),
            at(new THREE.BoxGeometry(0.2 * S, 0.12 * S, 0.05 * S), 0, 1.13, -0.29)
        ),
        skirt: new THREE.CylinderGeometry(0.18 * S, 0.27 * S, 0.36 * S, 16, 1, true).translate(0, 0.8 * S, 0),
        ponytail: new THREE.CapsuleGeometry(0.038 * S, 0.14 * S, 4, 6).rotateX(0.35).translate(0, (headY - 0.04) * S, -0.13 * S)
    };
}

const ACCESSORIES = ['cap', 'beanie', 'bucket', 'fedora', 'glasses', 'headphones', 'backpack', 'skirt', 'ponytail'];

export function createPeople({ scene, count = 18 }) {
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.7 });
    const skirtMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const geometries = buildGeometries();
    const instanced = (geometry, n, mat = material) => new THREE.InstancedMesh(geometry, mat, n);
    const meshes = {
        torso: instanced(geometries.torso, count),
        head: instanced(geometries.head, count),
        hair: instanced(geometries.hair, count),
        leg: instanced(geometries.leg, count * 2),
        arm: instanced(geometries.arm, count * 2),
        shoe: instanced(geometries.shoe, count * 2)
    };
    for (const name of ACCESSORIES) {
        meshes[name] = instanced(geometries[name], count, name === 'glasses' ? glassMaterial : name === 'skirt' ? skirtMaterial : material);
    }
    for (const mesh of Object.values(meshes)) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const range = (min, max) => min + Math.random() * (max - min);
    const color = new THREE.Color();
    const walkers = [];
    let added = false;
    let clock = 0;

    function paint(mesh, index, hex) {
        mesh.setColorAt(index, color.set(hex));
    }

    function place(walker, focusZ, initial) {
        const side = Math.random() < 0.5 ? -1 : 1;
        walker.x = side * range(13.6, 18.6);
        walker.side = side;
        walker.dir = Math.random() < 0.5 ? -1 : 1;
        walker.speed = range(1.5, 2.2);
        walker.z = focusZ + (initial ? range(-150, 60) : (Math.random() < 0.7 ? -range(100, 150) : range(50, 80)));
        walker.phase = Math.random() * Math.PI * 2;
        walker.talkUntil = 0;
        walker.stagger = 0;
        walker.greeted = false;
        walker.voice = null;
        walker.lastBump = -10;
        const i = walker.index;
        const shirt = pick(SHIRTS);
        paint(meshes.torso, i, shirt);
        // A jacket in another colour now and then.
        const sleeves = Math.random() < 0.25 ? pick(SHIRTS) : shirt;
        paint(meshes.arm, i * 2, sleeves);
        paint(meshes.arm, i * 2 + 1, sleeves);
        const trousers = pick(TROUSERS);
        paint(meshes.leg, i * 2, trousers);
        paint(meshes.leg, i * 2 + 1, trousers);
        const shoes = pick(SHOES);
        paint(meshes.shoe, i * 2, shoes);
        paint(meshes.shoe, i * 2 + 1, shoes);
        paint(meshes.head, i, pick(SKINS));
        const hair = pick(HAIR);
        paint(meshes.hair, i, hair);
        // Style: at most one hat, then independent extras.
        const roll = Math.random();
        const hat = roll < 0.22 ? 'cap' : roll < 0.36 ? 'beanie' : roll < 0.46 ? 'bucket' : roll < 0.54 ? 'fedora' : null;
        walker.feminine = Math.random() < 0.5;
        walker.style = {
            cap: hat === 'cap', beanie: hat === 'beanie', bucket: hat === 'bucket', fedora: hat === 'fedora',
            glasses: Math.random() < 0.38,
            headphones: !hat && Math.random() < 0.2 || hat === 'cap' && Math.random() < 0.15,
            backpack: Math.random() < 0.28,
            skirt: walker.feminine && Math.random() < 0.45,
            ponytail: walker.feminine && hat !== 'beanie' && Math.random() < 0.6
        };
        for (const name of ['cap', 'beanie', 'bucket', 'fedora']) paint(meshes[name], i, pick(HATS));
        paint(meshes.glasses, i, pick(LENSES));
        paint(meshes.headphones, i, pick([0x1a1a1c, 0xf2f2f0, 0xa8322d, 0x3a6ea5]));
        paint(meshes.backpack, i, pick(PACKS));
        paint(meshes.skirt, i, pick(SHIRTS));
        paint(meshes.ponytail, i, hair);
        for (const mesh of Object.values(meshes)) mesh.instanceColor.needsUpdate = true;
    }

    const base = new THREE.Matrix4();
    const part = new THREE.Matrix4();
    const swing = new THREE.Matrix4();
    const out = new THREE.Matrix4();
    const tilt = new THREE.Matrix4();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

    function update(dt, focus) {
        clock += dt;
        if (!added) {
            for (let i = 0; i < count; i++) {
                const walker = { index: i };
                walkers.push(walker);
                place(walker, focus.z, true);
            }
            Object.values(meshes).forEach((mesh) => scene.add(mesh));
            added = true;
        }
        for (const walker of walkers) {
            const talking = clock < walker.talkUntil;
            if (!talking) {
                walker.z += walker.dir * walker.speed * dt;
                walker.phase += walker.speed * dt * 3.4;
            }
            walker.stagger = Math.max(0, walker.stagger - dt);
            const offset = walker.z - focus.z;
            if (offset > 90 || offset < -170) place(walker, focus.z, false);
            const i = walker.index;
            // Talking: turned towards the player, standing still.
            const yaw = talking ? Math.atan2(walker.lookX - walker.x, walker.lookZ - walker.z) : walker.dir > 0 ? 0 : Math.PI;
            base.makeRotationY(yaw);
            if (walker.stagger > 0) base.multiply(tilt.makeRotationZ(Math.sin(walker.stagger * 18) * walker.stagger * 0.6));
            base.setPosition(walker.x, talking ? 0 : Math.abs(Math.sin(walker.phase)) * 0.03 * S, walker.z);
            meshes.torso.setMatrixAt(i, base);
            meshes.head.setMatrixAt(i, base);
            meshes.hair.setMatrixAt(i, walker.style.beanie || walker.style.fedora ? hidden : base);
            for (const name of ACCESSORIES) meshes[name].setMatrixAt(i, walker.style[name] ? base : hidden);
            const stride = talking ? 0 : Math.sin(walker.phase) * 0.45;
            for (const side of [-1, 1]) {
                const k = side < 0 ? 0 : 1;
                part.makeTranslation(side * 0.1 * S, 0.94 * S, 0);
                swing.makeRotationX(stride * side);
                out.multiplyMatrices(base, part).multiply(swing);
                meshes.leg.setMatrixAt(i * 2 + k, out);
                meshes.shoe.setMatrixAt(i * 2 + k, out);
                part.makeTranslation(side * 0.235 * S, 1.43 * S, 0);
                // While talking the right hand moves with the words.
                const gesture = talking && side > 0 ? -0.9 + Math.sin(clock * 7 + i) * 0.25 : -stride * side * 0.8;
                swing.makeRotationX(gesture).multiply(tilt.makeRotationZ(side * 0.08));
                out.multiplyMatrices(base, part).multiply(swing);
                meshes.arm.setMatrixAt(i * 2 + k, out);
            }
        }
        for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
    }

    // People within `radius` of (x, z), closest first.
    function near(x, z, radius) {
        return walkers
            .map((walker) => ({ walker, distance: Math.hypot(walker.x - x, walker.z - z) }))
            .filter(({ distance }) => distance < radius)
            .sort((a, b) => a.distance - b.distance)
            .map(({ walker }) => walker);
    }

    // Stops and faces (x, z) for `seconds`.
    function talk(walker, x, z, seconds) {
        walker.talkUntil = clock + seconds;
        walker.lookX = x;
        walker.lookZ = z;
    }

    // Shoved by the player at (x, z): steps aside and staggers.
    function bump(walker, x, z) {
        const dx = walker.x - x;
        const dz = walker.z - z;
        const length = Math.hypot(dx, dz) || 1;
        walker.x += (dx / length) * 0.45;
        walker.z += (dz / length) * 0.45;
        const side = Math.sign(walker.x) || 1;
        walker.x = side * Math.max(13.2, Math.min(19.2, Math.abs(walker.x)));
        walker.stagger = 0.45;
    }

    function respawn(focusZ) {
        for (const walker of walkers) place(walker, focusZ, true);
    }

    function clear() {
        Object.values(meshes).forEach((mesh) => scene.remove(mesh));
        walkers.length = 0;
        added = false;
    }

    return { update, respawn, clear, near, talk, bump, get time() { return clock; }, get walkers() { return walkers; } };
}
