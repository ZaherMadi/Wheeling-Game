// Puddles in the rain (Love&Faith event, under 12): dark mirrors on the
// road, rings where the rain falls in them. The bike through one throws the
// water out as a tyre does: two sheets out to the sides at once, then a
// tail of drops up behind the rear wheel while it is in the water, and a
// little mist; more the faster it goes.
import * as THREE from 'three';

const MAX_DROPS = 2400;
// A wet tyre goes on throwing water a moment after the puddle (seconds).
const WET = 0.8;
const MAX_MIST = 160;
const GRAVITY = 20;
// Air slows the drops (a second's worth): they fall behind the bike little by little.
const DRAG = 1.3;

function dotTexture(soft) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(soft ? 0.25 : 0.22, `rgba(255,255,255,${soft ? 0.45 : 0.85})`);
    gradient.addColorStop(soft ? 1 : 0.55, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// An uneven round, flat on the road (scaled to the puddle's size).
function blobGeometry() {
    const shape = new THREE.Shape();
    const a = Math.random() * 10;
    const b = Math.random() * 10;
    for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        const r = 1 + Math.sin(3 * t + a) * 0.12 + Math.sin(5 * t + b) * 0.07 + Math.sin(2 * t + a * 0.5) * 0.06;
        if (i === 0) shape.moveTo(Math.cos(t) * r, Math.sin(t) * r);
        else shape.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

function particles(max, size, opacity, soft) {
    const positions = new Float32Array(max * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const material = new THREE.PointsMaterial({
        map: dotTexture(soft), color: soft ? 0xe4eefa : 0xc9ddf6, size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 4;
    return { points, positions, geometry, list: [], max };
}

export function createPuddles(scene) {
    const water = new THREE.MeshStandardMaterial({
        color: 0x7d93b4, roughness: 0.03, metalness: 1, envMapIntensity: 2.2, transparent: true, opacity: 0.82,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    });
    const ringGeometry = new THREE.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xc4d8f2, transparent: true, opacity: 0.4, depthWrite: false });
    const drops = particles(MAX_DROPS, 0.2, 0.75, false);
    const mist = particles(MAX_MIST, 2.4, 0.26, true);
    let wet = 0;
    scene.add(drops.points, mist.points);
    const puddles = [];
    const wheel = new THREE.Vector3();

    function add(x, z, width, length) {
        const mesh = new THREE.Mesh(blobGeometry(), water);
        mesh.scale.set(width / 2, 1, length / 2);
        mesh.position.set(x, 0.03, z);
        mesh.receiveShadow = true;
        mesh.renderOrder = 1;
        scene.add(mesh);
        const rings = Array.from({ length: Math.round(2 + width * length / 14) }, () => {
            const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
            ring.renderOrder = 2;
            scene.add(ring);
            return { ring, phase: Math.random(), x: 0, z: 0 };
        });
        puddles.push({ mesh, rings, x, z, hw: width / 2, hl: length / 2, inside: false });
    }

    function emit(system, x, y, z, vx, vy, vz, life) {
        if (system.list.length >= system.max) return;
        system.list.push({ x, y, z, vx, vy, vz, life, age: 0 });
    }

    // Into the water at speed (units a second): the two sheets out.
    function sheets(at, speed, strength) {
        const k = Math.min(1.7, Math.max(0.45, speed / 110)) * strength;
        const count = Math.round(240 * k);
        for (let i = 0; i < count; i++) {
            const side = i % 2 ? 1 : -1;
            emit(drops, at.x + side * (0.25 + Math.random() * 0.3), 0.12, at.z - Math.random() * 1.5,
                side * (2.5 + Math.random() * 7) * k, (3 + Math.random() * 7) * k, -speed * (0.86 + Math.random() * 0.14), 0.8 + Math.random() * 0.7);
        }
        for (let i = 0; i < 14 * k; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            emit(mist, at.x + side * (0.5 + Math.random()), 0.5 + Math.random() * 0.6, at.z - Math.random(),
                side * (1 + Math.random() * 3), 1 + Math.random() * 1.5, -speed * (0.75 + Math.random() * 0.2), 0.9 + Math.random() * 0.5);
        }
    }

    // Through it: the tail of water up behind the rear wheel.
    function tail(at, speed, dt) {
        const k = Math.min(1.7, Math.max(0.4, speed / 110));
        const count = Math.round(700 * k * dt);
        for (let i = 0; i < count; i++) {
            emit(drops, at.x + (Math.random() - 0.5) * 0.35, 0.2, at.z + 0.2,
                (Math.random() - 0.5) * 2.6 * k, (4 + Math.random() * 6) * k, -speed * (0.9 + Math.random() * 0.1), 0.7 + Math.random() * 0.6);
        }
        if (Math.random() < 10 * dt * k) {
            emit(mist, at.x + (Math.random() - 0.5), 0.8, at.z + 0.6, (Math.random() - 0.5) * 2, 1.4, -speed * 0.85, 1);
        }
    }

    // Each physics step: the rear wheel in a puddle or not. Returns the
    // strength of a splash that just started (0: none).
    function step(dt, rider, speed) {
        if (!puddles.length && wet <= 0) return 0;
        wheel.copy(rider.rearContact);
        rider.bikeGroup.updateMatrixWorld();
        rider.bikeGroup.localToWorld(wheel);
        let splash = 0;
        let soaked = false;
        for (const puddle of puddles) {
            const dx = (wheel.x - puddle.x) / puddle.hw;
            const dz = (wheel.z - puddle.z) / puddle.hl;
            const inside = dx * dx + dz * dz < 0.92;
            if (inside && !puddle.inside && speed > 8) {
                const strength = Math.min(1.3, 0.6 + puddle.hw * puddle.hl / 30);
                sheets(wheel, speed, strength);
                splash = Math.max(splash, strength * Math.min(1, speed / 110));
            }
            if (inside && speed > 8) {
                tail(wheel, speed, dt);
                soaked = true;
            }
            puddle.inside = inside;
        }
        // Out of it, the wet tyre still throws water a moment.
        if (soaked) wet = WET;
        else if (wet > 0 && speed > 8) {
            tail(wheel, speed, dt * (wet / WET));
            wet -= dt;
        }
        return splash;
    }

    // The drops that come up to the camera go (they would fill the screen).
    let nearZ = Infinity;
    function move(system, dt) {
        const { list, positions } = system;
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            p.age += dt;
            if (p.still) continue;
            p.vy -= GRAVITY * dt * (system === mist ? 0.15 : 1);
            const drag = Math.exp(-DRAG * dt * (system === mist ? 1.6 : 1));
            p.vx *= drag;
            p.vz *= drag;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            if (p.age > p.life || p.y < 0 || p.z > nearZ) {
                list[i] = list[list.length - 1];
                list.pop();
            }
        }
        for (let i = 0; i < list.length; i++) {
            positions[i * 3] = list[i].x;
            positions[i * 3 + 1] = list[i].y;
            positions[i * 3 + 2] = list[i].z;
        }
        system.geometry.attributes.position.needsUpdate = true;
        system.geometry.setDrawRange(0, list.length);
    }

    // Each frame: the drops fly, the rain rings spread (as much as it rains).
    function frame(dt, rain, behindZ, cameraZ = Infinity) {
        if (dt <= 0) return;
        nearZ = cameraZ - 3.5;
        move(drops, dt);
        move(mist, dt);
        for (let i = puddles.length - 1; i >= 0; i--) {
            const puddle = puddles[i];
            if (puddle.z - puddle.hl > behindZ) {
                remove(puddle);
                puddles.splice(i, 1);
                continue;
            }
            for (const r of puddle.rings) {
                r.phase += dt / 0.75;
                if (r.phase >= 1) {
                    r.phase -= 1;
                    const angle = Math.random() * Math.PI * 2;
                    const d = Math.sqrt(Math.random()) * 0.75;
                    r.x = puddle.x + Math.cos(angle) * d * puddle.hw;
                    r.z = puddle.z + Math.sin(angle) * d * puddle.hl;
                }
                r.ring.position.set(r.x, 0.045, r.z);
                r.ring.scale.setScalar(0.08 + r.phase * 0.42);
                r.ring.material.opacity = (1 - r.phase) * 0.55 * rain;
                r.ring.visible = rain > 0.05;
            }
        }
    }

    function remove(puddle) {
        scene.remove(puddle.mesh);
        puddle.mesh.geometry.dispose();
        for (const r of puddle.rings) {
            scene.remove(r.ring);
            r.ring.material.dispose();
        }
    }

    function clear() {
        puddles.forEach(remove);
        puddles.length = 0;
        drops.list.length = 0;
        mist.list.length = 0;
        drops.geometry.setDrawRange(0, 0);
        mist.geometry.setDrawRange(0, 0);
    }

    return {
        add, step, frame, clear, get count() { return puddles.length; }, get drops() { return drops.list.length; },
        // Tests: drops hanging still at a place.
        hang(x, y, z, n = 40) {
            for (let i = 0; i < n; i++) {
                emit(drops, x + (Math.random() - 0.5) * 2, y + Math.random(), z + (Math.random() - 0.5) * 2, 0, 0, 0, 30);
                drops.list[drops.list.length - 1].still = true;
            }
        }
    };
}
