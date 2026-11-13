// Free roam pedestrians: people walking on both pavements, drawn as
// instances (one mesh per body part for the whole crowd) and animated with a
// simple walk cycle. Recycled around the player.
import * as THREE from 'three';

const S = 1.7; // Same scale as the rider.
const SHIRTS = [0xe8e2d6, 0x2b3a55, 0xa8322d, 0x3f6b3a, 0xd6a64a, 0x6b4c8a, 0x1d1e22, 0xf2f2f0, 0x4a7ea8, 0xc75b8a];
const TROUSERS = [0x22252b, 0x2f3d5c, 0x5c4a38, 0x8a8f98, 0x1a1b1f, 0x3b5a7a];
const SKINS = [0xf1c8a8, 0xd9a07a, 0xa86b4a, 0x6e4430, 0xe8b894];
const HAIR = [0x1a1410, 0x3b2a1e, 0x6b4a2e, 0xc9a46a, 0x2a2a2a, 0x8a8a8a];

export function createPeople({ scene, count = 18 }) {
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const torsoGeometry = new THREE.CapsuleGeometry(0.17 * S, 0.42 * S, 4, 8).translate(0, 1.18 * S, 0);
    const headGeometry = new THREE.SphereGeometry(0.11 * S, 10, 8).translate(0, 1.62 * S, 0);
    const hairGeometry = new THREE.SphereGeometry(0.118 * S, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.64 * S, -0.01 * S);
    // Limbs hang from their joint: the origin is the hip / shoulder.
    const legGeometry = new THREE.CapsuleGeometry(0.075 * S, 0.74 * S, 4, 6).translate(0, -0.44 * S, 0);
    const armGeometry = new THREE.CapsuleGeometry(0.052 * S, 0.56 * S, 4, 6).translate(0, -0.33 * S, 0);
    const meshes = {
        torso: new THREE.InstancedMesh(torsoGeometry, material, count),
        head: new THREE.InstancedMesh(headGeometry, material, count),
        hair: new THREE.InstancedMesh(hairGeometry, material, count),
        leg: new THREE.InstancedMesh(legGeometry, material, count * 2),
        arm: new THREE.InstancedMesh(armGeometry, material, count * 2)
    };
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

    function place(walker, focusZ, initial) {
        const side = Math.random() < 0.5 ? -1 : 1;
        walker.x = side * range(13.6, 18.6);
        walker.dir = Math.random() < 0.5 ? -1 : 1;
        walker.speed = range(2.1, 2.9);
        walker.z = focusZ + (initial ? range(-150, 60) : (Math.random() < 0.7 ? -range(100, 150) : range(50, 80)));
        walker.phase = Math.random() * Math.PI * 2;
        const i = walker.index;
        const shirt = pick(SHIRTS);
        meshes.torso.setColorAt(i, color.set(shirt));
        meshes.arm.setColorAt(i * 2, color.set(shirt));
        meshes.arm.setColorAt(i * 2 + 1, color.set(shirt));
        const trousers = pick(TROUSERS);
        meshes.leg.setColorAt(i * 2, color.set(trousers));
        meshes.leg.setColorAt(i * 2 + 1, color.set(trousers));
        meshes.head.setColorAt(i, color.set(pick(SKINS)));
        meshes.hair.setColorAt(i, color.set(pick(HAIR)));
        for (const mesh of Object.values(meshes)) mesh.instanceColor.needsUpdate = true;
    }

    const base = new THREE.Matrix4();
    const part = new THREE.Matrix4();
    const swing = new THREE.Matrix4();
    const out = new THREE.Matrix4();
    const tilt = new THREE.Matrix4();

    function update(dt, focus) {
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
            walker.z += walker.dir * walker.speed * dt;
            walker.phase += walker.speed * dt * 2.6;
            const offset = walker.z - focus.z;
            if (offset > 90 || offset < -170) place(walker, focus.z, false);
            const i = walker.index;
            base.makeRotationY(walker.dir > 0 ? 0 : Math.PI).setPosition(walker.x, Math.abs(Math.sin(walker.phase)) * 0.03 * S, walker.z);
            meshes.torso.setMatrixAt(i, base);
            meshes.head.setMatrixAt(i, base);
            meshes.hair.setMatrixAt(i, base);
            const stride = Math.sin(walker.phase) * 0.45;
            for (const side of [-1, 1]) {
                const k = side < 0 ? 0 : 1;
                part.makeTranslation(side * 0.1 * S, 0.94 * S, 0);
                swing.makeRotationX(stride * side);
                out.multiplyMatrices(base, part).multiply(swing);
                meshes.leg.setMatrixAt(i * 2 + k, out);
                part.makeTranslation(side * 0.235 * S, 1.43 * S, 0);
                swing.makeRotationX(-stride * side * 0.8).multiply(tilt.makeRotationZ(side * 0.08));
                out.multiplyMatrices(base, part).multiply(swing);
                meshes.arm.setMatrixAt(i * 2 + k, out);
            }
        }
        for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
    }

    function respawn(focusZ) {
        for (const walker of walkers) place(walker, focusZ, true);
    }

    function clear() {
        Object.values(meshes).forEach((mesh) => scene.remove(mesh));
        walkers.length = 0;
        added = false;
    }

    return { update, respawn, clear };
}
