// Free roam tow truck ("dépanneuse"): drives up with amber flashing beacons,
// unloads the player's bike (or chosen owned shop car), says "Et voilà chef,
// ça fera X euros", deducts the fee, and drives away. Accelerated by >> or
// spamming the delivery button (src/cinematic.js).
import * as THREE from 'three';
import { beginCinematic, cinematicSpeed, endCinematic } from '../cinematic.js';
import { MAX_REAL_CAR_PRICE, MIN_REAL_CAR_PRICE, pickRealCarPaint } from './realcars.js';

export function deliveryCost(kind, { distance = 0, carPrice = MIN_REAL_CAR_PRICE, totalPoints = 0 } = {}) {
    if (kind === 'car') {
        const cap = Math.max(50, Math.round(totalPoints * 0.05));
        const span = Math.max(1, MAX_REAL_CAR_PRICE - MIN_REAL_CAR_PRICE);
        const ratio = Math.max(0, Math.min(1, (carPrice - MIN_REAL_CAR_PRICE) / span));
        return Math.max(50, Math.min(cap, Math.round(50 + ratio * (cap - 50))));
    }
    const distRatio = Math.max(0, Math.min(1, distance / 350));
    return Math.max(50, Math.min(500, Math.round(50 + distRatio * 450)));
}

function makeBeaconGlow() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,175,30,0.6)');
    grad.addColorStop(1, 'rgba(255,140,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

function createBikeCargoMesh() {
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c014, roughness: 0.3, metalness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.65, metalness: 0.4 });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.9 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc4cad1, roughness: 0.2, metalness: 0.9 });
    const add = (geo, mat, px, py, pz, sx, sy, sz, rx = 0, rz = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, pz);
        m.scale.set(sx, sy, sz);
        m.rotation.set(rx, 0, rz);
        m.castShadow = true;
        g.add(m);
    };
    for (const z of [-0.72, 0.73]) {
        add(cyl, tyre, 0, 0.35, z, 0.35, 0.16, 0.35, 0, Math.PI / 2);
        add(cyl, chrome, 0, 0.35, z, 0.21, 0.17, 0.21, 0, Math.PI / 2);
    }
    add(box, dark, 0, 0.62, -0.05, 0.28, 0.34, 1.05);
    add(box, yellow, 0, 0.88, 0.16, 0.34, 0.24, 0.54, 0.18);
    add(box, yellow, 0, 0.85, -0.6, 0.24, 0.14, 0.62, -0.2);
    add(box, dark, 0, 0.82, -0.28, 0.26, 0.12, 0.56);
    add(cyl, chrome, 0.14, 0.68, -0.58, 0.055, 0.6, 0.055, Math.PI / 2 - 0.18);
    for (const side of [-1, 1]) {
        add(cyl, chrome, side * 0.1, 0.66, 0.6, 0.032, 0.74, 0.032, -0.35);
    }
    add(cyl, dark, 0, 1.02, 0.45, 0.025, 0.62, 0.025, 0, Math.PI / 2);
    g.scale.setScalar(1.05);
    return g;
}

function createTowTruckMesh() {
    const group = new THREE.Group();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 16);

    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2a814, roughness: 0.35, metalness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.6, metalness: 0.3 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x7b818a, roughness: 0.45, metalness: 0.65 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x111c26, roughness: 0.12, metalness: 0.2 });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x131416, roughness: 0.85 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xbac0c8, roughness: 0.3, metalness: 0.7 });
    const whiteLit = new THREE.MeshBasicMaterial({ color: 0xfff5d6 });
    const redLit = new THREE.MeshBasicMaterial({ color: 0xd92222 });

    const part = (geo, mat, px, py, pz, sx, sy, sz, rx = 0, parent = group) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, pz);
        m.scale.set(sx, sy, sz);
        m.rotation.x = rx;
        m.castShadow = true;
        parent.add(m);
        return m;
    };

    // Chassis rails & bumpers.
    part(box, dark, 0, 0.56, -0.2, 2.05, 0.26, 7.3);
    part(box, dark, 0, 0.5, 3.55, 2.26, 0.34, 0.32);
    part(box, dark, 0, 0.48, -3.9, 2.24, 0.28, 0.24);

    // Cab (front +z).
    part(box, yellow, 0, 1.48, 2.35, 2.22, 1.64, 2.05);
    part(box, glass, 0, 1.72, 3.39, 1.94, 0.72, 0.04);
    for (const side of [-1, 1]) {
        part(box, glass, side * 1.12, 1.72, 2.45, 0.04, 0.66, 1.1);
        part(box, dark, side * 1.18, 1.66, 3.1, 0.14, 0.28, 0.1);
        part(box, whiteLit, side * 0.82, 0.85, 3.41, 0.34, 0.16, 0.05);
        part(box, redLit, side * 0.84, 0.62, -3.96, 0.36, 0.14, 0.05);
    }
    part(box, dark, 0, 0.94, 3.4, 1.25, 0.36, 0.06);

    // Amber lightbar on cab roof.
    part(box, dark, 0, 2.36, 2.35, 1.45, 0.08, 0.32);
    const glowTex = makeBeaconGlow();
    const beacons = [-0.52, 0.52].map((bx) => {
        const mat = new THREE.MeshBasicMaterial({ color: 0x6b4100 });
        const lamp = part(box, mat, bx, 2.44, 2.35, 0.34, 0.12, 0.28);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTex, color: 0xffa61a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0
        }));
        halo.position.set(bx, 2.52, 2.35);
        halo.scale.setScalar(2.6);
        group.add(halo);
        return { lamp, mat, halo };
    });

    // Wheels (single front, dual rear).
    for (const [z, dual] of [[2.45, false], [-2.05, true]]) {
        for (const side of [-1, 1]) {
            const offsets = dual ? [0.95, 0.72] : [0.98];
            for (const ox of offsets) {
                const w = new THREE.Mesh(cyl, tyre);
                w.rotation.z = Math.PI / 2;
                w.position.set(side * ox, 0.44, z);
                w.scale.set(0.44, 0.26, 0.44);
                w.castShadow = true;
                group.add(w);
            }
            const r = new THREE.Mesh(cyl, rim);
            r.rotation.z = Math.PI / 2;
            r.position.set(side * 1.01, 0.44, z);
            r.scale.set(0.26, 0.24, 0.26);
            group.add(r);
        }
    }

    // Tilting flatbed pivot at the rear axle.
    const bed = new THREE.Group();
    bed.position.set(0, 0.76, -2.05);
    group.add(bed);
    part(box, steel, 0, 0.08, 0.65, 2.28, 0.14, 5.05, 0, bed);
    part(box, yellow, 0, 0.65, 3.1, 2.22, 1.05, 0.12, 0, bed);
    for (const side of [-1, 1]) {
        part(box, yellow, side * 1.12, 0.22, 0.65, 0.08, 0.22, 5.05, 0, bed);
    }
    const cargoAnchor = new THREE.Group();
    cargoAnchor.position.set(0, 0.16, 0.65);
    bed.add(cargoAnchor);

    // High-vis tow truck driver character.
    const driver = new THREE.Group();
    const vest = new THREE.MeshLambertMaterial({ color: 0xff6b1a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x222938 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98c66 });
    const cap = new THREE.MeshLambertMaterial({ color: 0xf6c416 });
    part(new THREE.CapsuleGeometry(0.18, 0.42, 4, 8), vest, 0, 1.18, 0, 1, 1, 1, 0, driver);
    part(new THREE.SphereGeometry(0.12, 10, 8), skin, 0, 1.62, 0, 1, 1, 1, 0, driver);
    part(new THREE.CylinderGeometry(0.13, 0.12, 0.07, 12), cap, 0, 1.72, 0, 1, 1, 1, 0, driver);
    const legs = [-1, 1].map((side) => {
        const p = new THREE.Group();
        p.position.set(side * 0.1, 0.92, 0);
        driver.add(p);
        part(new THREE.CapsuleGeometry(0.075, 0.72, 4, 6), pants, 0, -0.44, 0, 1, 1, 1, 0, p);
        return p;
    });
    const arms = [-1, 1].map((side) => {
        const p = new THREE.Group();
        p.position.set(side * 0.24, 1.42, 0);
        driver.add(p);
        part(new THREE.CapsuleGeometry(0.055, 0.54, 4, 6), vest, 0, -0.32, 0, 1, 1, 1, 0, p);
        return p;
    });
    driver.visible = false;

    return {
        group,
        bed,
        cargoAnchor,
        driver,
        animateDriver(dt, moving, talking, t) {
            const stride = moving ? Math.sin(t * 9) * 0.45 : 0;
            legs.forEach((p, i) => { p.rotation.x = stride * (i ? 1 : -1); });
            arms.forEach((p, i) => {
                p.rotation.x = talking && i === 1 ? -1.15 + Math.sin(t * 7) * 0.28 : -stride * (i ? 1 : -1) * 0.7;
                p.rotation.z = (i ? 1 : -1) * 0.08;
            });
            void dt;
        },
        flash(time) {
            const step = Math.floor(time * 8) % 4;
            beacons.forEach((b, i) => {
                const on = i === 0 ? step < 2 : step >= 2;
                b.mat.color.setHex(on ? 0xffb824 : 0x5c3600);
                b.halo.material.opacity = on ? 0.92 : 0;
            });
        }
    };
}

export function createTowService({ scene, world, audio }) {
    let rig = null;
    let sceneState = null;

    function ensureRig() {
        if (rig) return rig;
        rig = createTowTruckMesh();
        rig.group.visible = false;
        scene.add(rig.group);
        scene.add(rig.driver);
        return rig;
    }

    function clearCargo() {
        if (!rig) return;
        while (rig.cargoAnchor.children.length) rig.cargoAnchor.remove(rig.cargoAnchor.children[0]);
    }

    function cancel() {
        if (!sceneState) return;
        clearCargo();
        if (sceneState.cargo) scene.remove(sceneState.cargo);
        if (rig) {
            rig.group.visible = false;
            rig.driver.visible = false;
            rig.bed.rotation.x = 0;
        }
        sceneState = null;
        endCinematic('tow');
    }

    function startDelivery({ kind = 'bike', model = null, cost = 50, playerPos, bikeGroup, onDelivered, onDone }) {
        if (sceneState) return false;
        const r = ensureRig();
        clearCargo();
        const dropX = Math.max(-6.8, Math.min(6.8, playerPos.x + (playerPos.x > 0 ? -2.2 : 2.2)));
        const dropZ = playerPos.z - 1.5;
        const startZ = dropZ + 62;
        const leaveZ = dropZ - 75;
        const paint = kind === 'car' ? pickRealCarPaint(model) : null;

        let cargoMesh = null;
        if (kind === 'car') {
            cargoMesh = world.createCar(model, paint);
            cargoMesh.position.set(0, 0, 0);
            r.cargoAnchor.add(cargoMesh);
        } else {
            cargoMesh = createBikeCargoMesh();
            r.cargoAnchor.add(cargoMesh);
        }

        r.group.position.set(dropX, 0, startZ);
        r.group.rotation.set(0, Math.PI, 0);
        r.group.visible = true;
        r.bed.rotation.x = 0;
        r.driver.visible = false;

        sceneState = {
            kind,
            model,
            paint,
            cost,
            dropX,
            dropZ,
            startZ,
            leaveZ,
            playerPos: playerPos.clone(),
            bikeGroup,
            cargoMesh,
            cargo: null,
            phase: 'approach',
            t: 0,
            clock: 0,
            delivered: false,
            onDelivered,
            onDone
        };

        beginCinematic('tow');
        audio.play('horn_distant', { volume: 0.45, rate: 0.78 });
        return true;
    }

    function update(rawDt, playerNow) {
        if (!sceneState || !rig) return;
        const s = sceneState;
        const dt = rawDt * cinematicSpeed();
        s.clock += dt;
        s.t += dt;
        rig.flash(s.clock);

        const targetDropZ = (playerNow ? playerNow.z : s.dropZ) - 1.5;
        const px = playerNow ? playerNow.x : s.playerPos.x;
        const pz = playerNow ? playerNow.z : s.playerPos.z;

        if (s.phase === 'approach') {
            const stopZ = s.dropZ + 4.2;
            const remain = rig.group.position.z - stopZ;
            const speed = Math.max(8, Math.min(26, remain * 1.6));
            rig.group.position.z = Math.max(stopZ, rig.group.position.z - speed * dt);
            if (rig.group.position.z <= stopZ + 0.08) {
                rig.group.position.z = stopZ;
                s.phase = 'unload';
                s.t = 0;
                audio.play('brake', { volume: 0.35, rate: 0.85 });
            }
        } else if (s.phase === 'unload') {
            const k = Math.min(1, s.t / 1.35);
            // Bed tilts back toward -z (world +z since truck faces -z) to slide cargo onto asphalt.
            rig.bed.rotation.x = Math.sin(k * Math.PI) * 0.34;
            if (s.cargoMesh) {
                s.cargoMesh.position.z = -Math.max(0, (k - 0.25) / 0.75) * 4.8;
            }
            if (k >= 1) {
                rig.bed.rotation.x = 0;
                clearCargo();
                const finalX = Math.max(-7.6, Math.min(7.6, s.dropX));
                const finalZ = s.dropZ;
                let deliveredCarGroup = null;
                if (s.kind === 'car') {
                    deliveredCarGroup = world.createCar(s.model, s.paint);
                    deliveredCarGroup.position.set(finalX, 0, finalZ);
                    deliveredCarGroup.rotation.set(0, Math.PI, 0);
                    scene.add(deliveredCarGroup);
                } else if (s.bikeGroup) {
                    s.bikeGroup.position.set(finalX, 0, finalZ);
                    s.bikeGroup.rotation.set(0, Math.PI, 0);
                    s.bikeGroup.visible = true;
                }
                s.delivered = true;
                s.onDelivered?.({ kind: s.kind, model: s.model, group: deliveredCarGroup, cost: s.cost, x: finalX, z: finalZ });
                rig.driver.position.set(rig.group.position.x + 1.35, 0, rig.group.position.z + 2.2);
                rig.driver.visible = true;
                audio.play('car_door', { volume: 0.45 });
                s.phase = 'walk-out';
                s.t = 0;
            }
        } else if (s.phase === 'walk-out') {
            const tx = px + (rig.driver.position.x > px ? 1.4 : -1.4);
            const tz = pz - 1.2;
            const dx = tx - rig.driver.position.x;
            const dz = tz - rig.driver.position.z;
            const dist = Math.hypot(dx, dz);
            const step = Math.min(dist, 3.2 * dt);
            if (dist > 0.12) {
                rig.driver.position.x += (dx / dist) * step;
                rig.driver.position.z += (dz / dist) * step;
                rig.driver.rotation.y = Math.atan2(dx, dz);
                rig.animateDriver(dt, true, false, s.clock);
            } else {
                s.phase = 'speak';
                s.t = 0;
                const priceText = Math.round(s.cost).toLocaleString('fr-FR');
                document.dispatchEvent(new CustomEvent('wheelie:subtitle', {
                    detail: { who: '🚚 Dépanneur', text: `Et voilà chef, ça fera ${priceText} euros`, seconds: 3.4 }
                }));
                audio.play('ui_click', { volume: 0.45, rate: 1.2 });
            }
        } else if (s.phase === 'speak') {
            rig.driver.rotation.y = Math.atan2(px - rig.driver.position.x, pz - rig.driver.position.z);
            rig.animateDriver(dt, false, true, s.clock);
            if (s.t >= 2.2) {
                s.phase = 'walk-back';
                s.t = 0;
            }
        } else if (s.phase === 'walk-back') {
            const tx = rig.group.position.x + 1.35;
            const tz = rig.group.position.z + 2.2;
            const dx = tx - rig.driver.position.x;
            const dz = tz - rig.driver.position.z;
            const dist = Math.hypot(dx, dz);
            const step = Math.min(dist, 3.6 * dt);
            if (dist > 0.15 && s.t < 2.5) {
                rig.driver.position.x += (dx / dist) * step;
                rig.driver.position.z += (dz / dist) * step;
                rig.driver.rotation.y = Math.atan2(dx, dz);
                rig.animateDriver(dt, true, false, s.clock);
            } else {
                rig.driver.visible = false;
                audio.play('car_door', { volume: 0.4 });
                s.phase = 'leave';
                s.t = 0;
            }
        } else if (s.phase === 'leave') {
            const speed = Math.min(28, 6 + s.t * 14);
            rig.group.position.z -= speed * dt;
            if (rig.group.position.z < targetDropZ - 85 || s.t > 5) {
                rig.group.visible = false;
                const done = s.onDone;
                sceneState = null;
                endCinematic('tow');
                done?.();
            }
        }
    }

    return {
        startDelivery,
        update,
        cancel,
        get active() { return Boolean(sceneState); }
    };
}
