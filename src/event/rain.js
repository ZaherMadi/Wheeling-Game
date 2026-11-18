// Rain round the camera (Love&Faith event): streaks falling, slanted by the
// ride; how many, from none to a downpour. Drawn as one set of lines.
import * as THREE from 'three';

const COUNT = 1600;
const BOX = { x: 26, y: 22, zBack: 14, zAhead: 70 };

export function createRain(scene) {
    const positions = new Float32Array(COUNT * 6);
    const drops = Array.from({ length: COUNT }, () => ({
        x: (Math.random() - 0.5) * BOX.x * 2,
        y: Math.random() * BOX.y,
        z: -Math.random() * BOX.zAhead + BOX.zBack,
        speed: 26 + Math.random() * 14,
        length: 0.5 + Math.random() * 0.5
    }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineBasicMaterial({ color: 0xaac4e6, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.renderOrder = 3;
    lines.visible = false;
    scene.add(lines);
    let shown = 0;

    // amount: 0 to 1; ride: how fast the camera goes forward (units a
    // second); wind: sideways (the storm), units a second.
    function update(dt, camera, amount, ride = 0, wind = 0) {
        shown += (amount - shown) * Math.min(1, dt * 1.2);
        const count = Math.floor(COUNT * Math.max(0, Math.min(1, shown)));
        lines.visible = count > 0;
        if (!count) return;
        material.opacity = 0.25 + shown * 0.35;
        const cx = camera.position.x;
        const cz = camera.position.z;
        // The ride slants them towards the camera.
        const slant = Math.min(0.9, ride / 60);
        for (let i = 0; i < count; i++) {
            const drop = drops[i];
            drop.y -= drop.speed * dt;
            drop.z += ride * dt * 0.15;
            drop.x += wind * dt;
            if (drop.x > BOX.x) drop.x -= BOX.x * 2;
            if (drop.y < 0 || drop.z > BOX.zBack) {
                drop.y = BOX.y * (0.6 + Math.random() * 0.4);
                drop.x = (Math.random() - 0.5) * BOX.x * 2;
                drop.z = BOX.zBack - Math.random() * BOX.zAhead;
            }
            const x = cx + drop.x;
            const z = cz + drop.z;
            const o = i * 6;
            positions[o] = x;
            positions[o + 1] = drop.y;
            positions[o + 2] = z;
            positions[o + 3] = x - 0.08 - wind * 0.02 * drop.length;
            positions[o + 4] = drop.y + drop.length * (1 + shown);
            positions[o + 5] = z - slant * drop.length;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.setDrawRange(0, count * 2);
    }

    // Gone at once (out of the event).
    function hide() {
        shown = 0;
        lines.visible = false;
        geometry.setDrawRange(0, 0);
    }

    function dispose() {
        scene.remove(lines);
        geometry.dispose();
        material.dispose();
    }

    return { update, hide, dispose, get amount() { return shown; } };
}
