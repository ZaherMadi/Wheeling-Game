// Free roam jetpack: what is seen. Two yellow and black tanks on the rider's
// back (5HC colours), two jets of flame under them (a white-blue core, an
// orange tongue, longer and wider with the turbo), the glow they throw on
// the ground below, a ring of air blown out on take-off and on each turbo,
// and the flames and smoke left behind (fx.jet). The flight itself is in
// freeroam.js.
import * as THREE from 'three';

let glowTexture = null;
function glow() {
    if (glowTexture) return glowTexture;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    glowTexture = new THREE.CanvasTexture(canvas);
    return glowTexture;
}

const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false
});

export function createJetpack({ scene }) {
    const pack = new THREE.Group();
    pack.name = 'jetpack';
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c014, roughness: 0.3, metalness: 0.55 });
    const black = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.45, metalness: 0.6 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc4cad1, roughness: 0.18, metalness: 1 });
    const nozzles = [];
    const flames = [];
    // Harness plate on the back.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.06), black);
    plate.position.set(0, 0, 0.02);
    pack.add(plate);
    for (const side of [-1, 1]) {
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.4, 6, 14), yellow);
        tank.position.set(side * 0.12, 0, -0.1);
        pack.add(tank);
        for (const y of [-0.12, 0.12]) {
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 14), black);
            band.position.set(side * 0.12, y, -0.1);
            pack.add(band);
        }
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.12, 12, 1, true), chrome);
        nozzle.position.set(side * 0.12, -0.33, -0.1);
        pack.add(nozzle);
        nozzles.push(nozzle);
        // Flames: hanging from the nozzle (cones pointing down).
        const flame = new THREE.Group();
        flame.position.set(side * 0.12, -0.38, -0.1);
        const outer = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1, 12, 1, true).rotateX(Math.PI).translate(0, -0.5, 0), additive(0xff7a1a, 0.85));
        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.6, 10, 1, true).rotateX(Math.PI).translate(0, -0.3, 0), additive(0xbfe4ff, 0.95));
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        halo.scale.setScalar(0.7);
        flame.add(outer, inner, halo);
        pack.add(flame);
        flames.push({ group: flame, outer, inner, halo });
    }
    pack.visible = false;
    scene.add(pack);

    // Light thrown on the ground under the jets.
    const groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: glow(), color: 0xff8a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    groundGlow.renderOrder = 3;
    scene.add(groundGlow);

    // Rings of air: on take-off and each turbo.
    const rings = [];
    function ring(x, y, z, flat = true, yaw = 0) {
        let entry = rings.find((item) => item.t >= item.life);
        if (!entry) {
            const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), additive(0xfff1c8, 0));
            scene.add(mesh);
            entry = { mesh, t: 1, life: 1 };
            rings.push(entry);
        }
        entry.t = 0;
        entry.life = flat ? 0.7 : 0.5;
        entry.mesh.position.set(x, y, z);
        entry.mesh.rotation.set(flat ? Math.PI / 2 : 0, flat ? 0 : yaw, 0);
        entry.mesh.scale.setScalar(0.3);
    }

    const back = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const tilt = new THREE.Euler(0, 0, 0, 'YXZ');
    let time = 0;
    // state: { x, y, z, yaw, pitch, thrust 0..1, boost 0..1, ground, scale,
    // on }. Returns the nozzles' world points (for the particles).
    const points = [new THREE.Vector3(), new THREE.Vector3()];
    function update(dt, state) {
        time += dt;
        for (const entry of rings) {
            if (entry.t >= entry.life) continue;
            entry.t += dt;
            const k = Math.min(1, entry.t / entry.life);
            entry.mesh.scale.setScalar(0.3 + k * (entry.life > 0.6 ? 7 : 3.2));
            entry.mesh.material.opacity = (1 - k) * 0.85;
        }
        pack.visible = !!state.on;
        if (!state.on) {
            groundGlow.material.opacity = 0;
            return null;
        }
        // On his back, between the shoulders, tilted with him.
        tilt.set(state.pitch, state.yaw, 0);
        offset.set(0, 1.25 * state.scale, -0.24 * state.scale).applyEuler(tilt);
        pack.position.set(state.x + offset.x, state.y + offset.y, state.z + offset.z);
        pack.rotation.copy(tilt);
        pack.scale.setScalar(state.scale);
        const power = state.thrust * (1 + state.boost * 1.2);
        flames.forEach((flame, index) => {
            const flicker = 0.82 + Math.sin(time * 61 + index * 2.3) * 0.1 + Math.random() * 0.12;
            const length = (0.25 + power * 1.25) * flicker;
            flame.outer.scale.set(1 + state.boost * 0.6, length, 1 + state.boost * 0.6);
            flame.inner.scale.set(1, length * 0.9, 1);
            flame.outer.material.color.setHex(state.boost > 0.3 ? 0xff5a2a : 0xff8a2a);
            flame.halo.scale.setScalar(0.45 + power * 0.7 * flicker);
            flame.halo.material.opacity = 0.5 + power * 0.4;
            nozzles[index].updateMatrixWorld();
            points[index].set(0, -0.08, 0);
            nozzles[index].localToWorld(points[index]);
        });
        // Ground glow: strong and wide low down, gone above 25 m.
        const height = Math.max(0, state.y - state.ground);
        const near = Math.max(0, 1 - height / 25);
        groundGlow.position.set(state.x, state.ground + 0.05, state.z);
        groundGlow.scale.setScalar(2 + height * 0.35 + state.boost * 2);
        groundGlow.material.opacity = near * (0.35 + power * 0.45) * (0.9 + Math.random() * 0.1);
        back.set(0, -1, 0).applyEuler(tilt);
        return { points, down: back };
    }

    function hide() {
        pack.visible = false;
        groundGlow.material.opacity = 0;
    }

    return { update, ring, hide, group: pack };
}
