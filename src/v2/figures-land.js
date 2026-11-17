// Figures Land (free roam): a secret amusement park at the end of a side
// street. One free roam ride in RARITY finds it: a sign on the avenue, then
// in the side street a car and bike park, the park's gate (striped pillars,
// a lit arch with its name, chase lights, flags), a Ferris wheel turning
// behind. The gate is closed (under construction): who reaches it gets the
// rainbow bike instead.
import * as THREE from 'three';
import { ROAD_HALF } from './street.js';

export const RARITY = 20;
export const RAINBOW_KEY = 'wheelie_rainbow_bike';
// Along the side street (metres from the avenue's centre line).
const GATE_X = 20;
const STOP_X = 18.6;
const REACH_X = 17.4;
const HALF_WIDTH = 4.4;

export function rainbowUnlocked() {
    try {
        return localStorage.getItem(RAINBOW_KEY) === '1';
    } catch {
        return false;
    }
}

function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

const RAINBOW = ['#ff3b3b', '#ff9a1f', '#ffe14a', '#3fd16b', '#2f9bff', '#8a5cff', '#ff5cc8'];

function signTexture() {
    return canvasTexture(1024, 256, (ctx, w, h) => {
        const back = ctx.createLinearGradient(0, 0, 0, h);
        back.addColorStop(0, '#2a0f4a');
        back.addColorStop(1, '#12051f');
        ctx.fillStyle = back;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#ffe14a';
        ctx.lineWidth = 10;
        ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.font = '900 104px "Arial Black", Arial, sans-serif';
        ctx.textBaseline = 'middle';
        const text = 'FIGURES LAND';
        let x = (w - ctx.measureText(text).width) / 2;
        [...text].forEach((letter, index) => {
            ctx.fillStyle = RAINBOW[index % RAINBOW.length];
            ctx.strokeStyle = '#1a0830';
            ctx.lineWidth = 12;
            ctx.strokeText(letter, x, h * 0.52);
            ctx.fillText(letter, x, h * 0.52);
            x += ctx.measureText(letter).width;
        });
    });
}

function stripeTexture(a, b) {
    const texture = canvasTexture(64, 256, (ctx, w, h) => {
        for (let i = 0; i < 16; i++) {
            ctx.fillStyle = i % 2 ? a : b;
            ctx.beginPath();
            ctx.moveTo(0, i * 16 - 16);
            ctx.lineTo(w, i * 16);
            ctx.lineTo(w, i * 16 + 16);
            ctx.lineTo(0, i * 16);
            ctx.fill();
        }
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 3);
    return texture;
}

function panelTexture(lines, back, ink) {
    return canvasTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = back;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 12;
        ctx.strokeRect(8, 8, w - 16, h - 16);
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        lines.forEach(([text, size], index) => {
            ctx.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
            ctx.fillText(text, w / 2, h * (lines.length === 1 ? 0.5 : 0.32 + index * 0.38), w - 40);
        });
    });
}

export function createFiguresLand({ scene }) {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    const materials = [];
    const mat = (options, Kind = THREE.MeshStandardMaterial) => {
        const material = new Kind(options);
        materials.push(material);
        return material;
    };
    const textures = [];
    const tex = (texture) => {
        textures.push(texture);
        return texture;
    };
    const geometries = [];
    const geo = (geometry) => {
        geometries.push(geometry);
        return geometry;
    };
    const add = (geometry, material, x, y, z, parent = group) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        parent.add(mesh);
        return mesh;
    };

    // Parking: painted bays on the side street, a P sign, kerb stops.
    const paintWhite = mat({ color: 0xf2f2f0, roughness: 0.8 });
    const asphalt = mat({ color: 0x24262c, roughness: 0.95 });
    const parkingBase = add(geo(new THREE.BoxGeometry(6.6, 0.02, HALF_WIDTH * 2 - 0.4)), asphalt, 13.9, 0.012, 0);
    parkingBase.castShadow = false;
    for (let i = 0; i <= 4; i++) {
        const line = add(geo(new THREE.BoxGeometry(5.2, 0.03, 0.12)), paintWhite, 13.9, 0.03, -3.6 + i * 1.8);
        line.castShadow = false;
    }
    const blue = mat({ color: 0x1f5fd6, roughness: 0.5, emissive: 0x0b2a66, emissiveIntensity: 0.4 });
    const steel = mat({ color: 0x9aa1ab, roughness: 0.4, metalness: 0.6 });
    add(geo(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8)), steel, 11.2, 1.3, HALF_WIDTH + 0.4);
    const pSign = add(geo(new THREE.BoxGeometry(0.06, 0.8, 0.8)), mat({ map: tex(panelTexture([['P', 190]], '#1f5fd6', '#ffffff')), roughness: 0.5 }), 11.2, 2.7, HALF_WIDTH + 0.4);
    pSign.rotation.y = Math.PI / 2;
    void blue;

    // The gate: candy-striped pillars, a lit arch, the name, flags.
    const candy = mat({ map: tex(stripeTexture('#ff3b3b', '#fff4e0')), roughness: 0.45 });
    const gold = mat({ color: 0xffc928, metalness: 0.6, roughness: 0.3, emissive: 0x7a5200, emissiveIntensity: 0.5 });
    for (const side of [-1, 1]) {
        const z = side * (HALF_WIDTH + 0.35);
        add(geo(new THREE.CylinderGeometry(0.42, 0.5, 8.6, 20)), candy, GATE_X, 4.3, z);
        add(geo(new THREE.CylinderGeometry(0.62, 0.62, 0.4, 20)), gold, GATE_X, 0.2, z);
        add(geo(new THREE.SphereGeometry(0.62, 20, 14)), gold, GATE_X, 8.9, z);
        // A flag on top.
        add(geo(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6)), steel, GATE_X, 10.3, z);
        const flag = add(geo(new THREE.ConeGeometry(0.35, 1.0, 3)), mat({ color: side > 0 ? 0x2f9bff : 0xff5cc8, side: THREE.DoubleSide, emissive: side > 0 ? 0x0b3a66 : 0x661a4f, emissiveIntensity: 0.5 }), GATE_X, 10.85, z + 0.45);
        flag.rotation.x = Math.PI / 2;
        flag.userData.wave = side;
    }
    const arch = add(geo(new THREE.TorusGeometry(HALF_WIDTH + 0.35, 0.28, 12, 48, Math.PI)), gold, GATE_X, 8.6, 0);
    arch.rotation.y = Math.PI / 2;
    const signFace = mat({ map: tex(signTexture()), roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.35 });
    signFace.emissiveMap = signFace.map;
    // The name on both faces along x (the avenue side is -x).
    add(geo(new THREE.BoxGeometry(0.3, 2.3, 9.4)), [signFace, signFace, steel, steel, steel, steel], GATE_X - 0.1, 7.1, 0);

    // Chase lights along the arch and the sign.
    const bulbs = [];
    const bulbGeometry = geo(new THREE.SphereGeometry(0.11, 10, 8));
    const bulbOn = mat({ color: 0xfff2b0, emissive: 0xffd34a, emissiveIntensity: 2.2, toneMapped: false });
    const bulbOff = mat({ color: 0x4a3a10, emissive: 0x000000 });
    for (let i = 0; i <= 26; i++) {
        const a = Math.PI * i / 26;
        const bulb = add(bulbGeometry, bulbOff, GATE_X - 0.32, 8.6 + Math.sin(a) * (HALF_WIDTH + 0.35), Math.cos(a) * (HALF_WIDTH + 0.35));
        bulb.castShadow = false;
        bulbs.push(bulb);
    }
    for (let i = 0; i <= 18; i++) {
        for (const y of [5.9, 8.3]) {
            const bulb = add(bulbGeometry, bulbOff, GATE_X - 0.3, y, -4.5 + i * 0.5);
            bulb.castShadow = false;
            bulbs.push(bulb);
        }
    }

    // Closed: a barrier, the panel, cones.
    const barrierStripes = mat({ map: tex(stripeTexture('#ff3b3b', '#ffffff')), roughness: 0.5 });
    const barrier = add(geo(new THREE.BoxGeometry(0.18, 0.28, HALF_WIDTH * 2 - 0.4)), barrierStripes, GATE_X + 0.4, 1.05, 0);
    barrier.material.map.repeat.set(1, 6);
    for (const side of [-1, 1]) add(geo(new THREE.BoxGeometry(0.25, 1.1, 0.25)), steel, GATE_X + 0.4, 0.55, side * (HALF_WIDTH - 0.3));
    const works = add(geo(new THREE.BoxGeometry(0.08, 1.2, 2.4)),
        mat({ map: tex(panelTexture([['EN CONSTRUCTION', 54], ['À BIENTÔT !', 50]], '#ffd21a', '#111111')), roughness: 0.6 }), GATE_X + 0.55, 2.0, 0);
    void works;
    const coneMaterial = mat({ color: 0xff5a14, roughness: 0.6 });
    for (const z of [-2.8, -1.2, 1.2, 2.8]) add(geo(new THREE.ConeGeometry(0.22, 0.7, 14)), coneMaterial, GATE_X - 0.8, 0.35, z);
    // Ticket booths on both sides of the gate.
    const booth = mat({ color: 0xff5cc8, roughness: 0.5 });
    const roof = mat({ color: 0xffe14a, roughness: 0.5 });
    for (const side of [-1, 1]) {
        add(geo(new THREE.BoxGeometry(1.4, 2.4, 1.0)), booth, GATE_X + 1.6, 1.2, side * (HALF_WIDTH - 0.8));
        const top = add(geo(new THREE.ConeGeometry(1.05, 0.9, 4)), roof, GATE_X + 1.6, 2.85, side * (HALF_WIDTH - 0.8));
        top.rotation.y = Math.PI / 4;
    }

    // Behind: a Ferris wheel, turning.
    const wheel = new THREE.Group();
    wheel.position.set(GATE_X + 14, 13, 0);
    group.add(wheel);
    const wheelFrame = mat({ color: 0xf2f2f0, metalness: 0.5, roughness: 0.35, emissive: 0x333344, emissiveIntensity: 0.4 });
    const rim = add(geo(new THREE.TorusGeometry(10, 0.22, 10, 64)), wheelFrame, 0, 0, 0, wheel);
    rim.rotation.y = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
        const spoke = add(geo(new THREE.CylinderGeometry(0.07, 0.07, 20, 6)), wheelFrame, 0, 0, 0, wheel);
        spoke.rotation.x = Math.PI * i / 12;
    }
    const cabins = [];
    for (let i = 0; i < 12; i++) {
        const a = Math.PI * 2 * i / 12;
        const cabin = add(geo(new THREE.BoxGeometry(1.2, 1.1, 1.2)), mat({ color: new THREE.Color(RAINBOW[i % RAINBOW.length]), roughness: 0.5, emissive: new THREE.Color(RAINBOW[i % RAINBOW.length]), emissiveIntensity: 0.25 }), 0, Math.sin(a) * 10, Math.cos(a) * 10, wheel);
        cabin.userData.angle = a;
        cabins.push(cabin);
    }
    for (const side of [-1, 1]) {
        const leg = add(geo(new THREE.CylinderGeometry(0.25, 0.35, 14.5, 8)), wheelFrame, GATE_X + 14, 6.5, side * 3.4);
        leg.rotation.x = side * 0.25;
    }

    // On the avenue: the way, on a pole at the corner.
    const avenueSign = new THREE.Group();
    scene.add(avenueSign);
    avenueSign.visible = false;
    add(geo(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 8)), steel, 0, 1.8, 0, avenueSign);
    // Which way: the side street's side of the avenue (+x is on the right).
    const arrowFaces = {
        1: tex(panelTexture([['FIGURES LAND', 64], ['➜', 96]], '#2a0f4a', '#ffe14a')),
        [-1]: tex(panelTexture([['FIGURES LAND', 64], ['⬅', 96]], '#2a0f4a', '#ffe14a'))
    };
    const arrowSign = add(geo(new THREE.BoxGeometry(2.6, 0.9, 0.08)),
        mat({ map: arrowFaces[1], roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.25, emissiveMap: arrowFaces[1] }), 0, 3.3, 0, avenueSign);

    // State: armed (this ride found it), where it stands, reached.
    let armed = false;
    let placed = null;
    let reached = false;
    let time = 0;

    function unplace() {
        placed = null;
        group.visible = false;
        avenueSign.visible = false;
    }

    // A new free roam ride: one in RARITY finds the park (force: tests).
    function newRide(force = false) {
        armed = force || Math.random() < 1 / RARITY;
        reached = false;
        unplace();
        return armed;
    }

    function place(crossingZ, side) {
        placed = { z: crossingZ, side };
        group.position.set(0, 0, crossingZ);
        // Turned round (not mirrored: the writing stays the right way).
        group.rotation.y = side > 0 ? 0 : Math.PI;
        group.visible = true;
        // The avenue sign on the corner before the side street (coming from
        // +z), facing the riders.
        avenueSign.position.set(side * (ROAD_HALF + 0.7), 0, crossingZ + HALF_WIDTH + 2.5);
        arrowSign.material.map = arrowFaces[side];
        arrowSign.material.emissiveMap = arrowFaces[side];
        arrowSign.material.needsUpdate = true;
        avenueSign.visible = true;
    }

    // focus: where the player is; crossings: the side streets' z; mover:
    // what to push back at the closed gate. Returns 'reached' once.
    function update(dt, focus, crossings, mover) {
        time += dt;
        if (!armed) return null;
        if (!placed) {
            // The next side street well ahead (the avenue goes towards -z).
            const ahead = crossings.filter((z) => z < focus.z - 140 && z > focus.z - 480).sort((a, b) => b - a)[0];
            if (ahead !== undefined) place(ahead, Math.random() < 0.5 ? 1 : -1);
            return null;
        }
        // Its side street gone (another street, or the blocks redrawn).
        if (Math.abs(placed.z - focus.z) < 260 && !crossings.some((z) => Math.abs(z - placed.z) < 1)) {
            unplace();
            return null;
        }
        // Lights chasing round the arch, the wheel turning, flags.
        const head = Math.floor(time * 14);
        bulbs.forEach((bulb, index) => { bulb.material = (index + head) % 4 < 2 ? bulbOn : bulbOff; });
        wheel.rotation.x = time * 0.12;
        cabins.forEach((cabin) => { cabin.rotation.x = -wheel.rotation.x; });
        group.children.forEach((child) => {
            if (child.userData.wave) child.rotation.z = Math.sin(time * 4 + child.userData.wave) * 0.25;
        });
        // In its side street, at the gate.
        const along = (focus.x) * placed.side;
        const inside = Math.abs(focus.z - placed.z) < HALF_WIDTH;
        if (!inside) return null;
        if (along > STOP_X && mover) mover.x = placed.side * STOP_X;
        if (along > REACH_X && !reached) {
            reached = true;
            return 'reached';
        }
        return null;
    }

    return {
        newRide, update,
        hide: unplace,
        get armed() { return armed; },
        get placed() { return placed; },
        dispose() {
            scene.remove(group);
            scene.remove(avenueSign);
            materials.forEach((material) => material.dispose());
            textures.forEach((texture) => texture.dispose());
            geometries.forEach((geometry) => geometry.dispose());
        }
    };
}
