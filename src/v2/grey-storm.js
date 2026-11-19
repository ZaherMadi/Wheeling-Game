import * as THREE from 'three';
import { createCarPaintMaterial } from './hero-car-pbr.js';

const LEN = 4.45;
const WIDTH = 1.839;
const FRONT_Z = 1.34;
const REAR_Z = -1.34;
const WHEEL_R = 0.39;

function ringGeometry({
    length = LEN,
    belt = 1.07
} = {}) {
    const stations = [
        [-2.225, 0.72, 0.28, 0.96],
        [-2.06, 0.84, 0.32, 1.04],
        [-1.72, 0.89, 0.36, 1.09],
        [-0.95, 0.905, 0.38, belt],
        [0.15, 0.905, 0.38, belt],
        [0.88, 0.895, 0.38, belt],
        [1.48, 0.875, 0.36, 1.02],
        [1.96, 0.815, 0.30, 0.90],
        [2.225, 0.68, 0.24, 0.74]
    ];
    const segments = 28;
    const ringStride = segments + 1;
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i < stations.length; i++) {
        const [z, halfWidth, lower, shoulder] = stations[i];
        const u = (z + length / 2) / length;
        for (let k = 0; k <= segments; k++) {
            const v = k / segments;
            const a = v * Math.PI * 2;
            const cx = Math.cos(a);
            const sy = Math.sin(a);
            // Flatten shoulders slightly for a wide, muscular SUV hood and flanks.
            const x = Math.sign(cx) * Math.pow(Math.abs(cx), 0.76) * halfWidth;
            let y;
            if (sy >= 0) y = lower + Math.pow(sy, 0.34) * (shoulder - lower);
            else y = lower + sy * lower * 0.38;
            if (z > 1.45) y += (1 - (z - 1.45) / 0.775) * 0.015;
            if (z < -1.72) y -= 0.015;
            positions.push(x, y, z);
            uvs.push(u, v);
        }
    }

    for (let i = 0; i < stations.length - 1; i++) {
        for (let k = 0; k < segments; k++) {
            const a = i * ringStride + k;
            const b = i * ringStride + k + 1;
            const c = (i + 1) * ringStride + k;
            const d = (i + 1) * ringStride + k + 1;
            indices.push(a, b, c, b, d, c);
        }
    }

    // Closed rear and front end caps so the shell has no open holes.
    const rearCenter = positions.length / 3;
    positions.push(0, 0.60, -2.225);
    uvs.push(0, 0.5);
    const ring0 = 0;
    for (let k = 0; k < segments; k++) {
        indices.push(rearCenter, ring0 + k + 1, ring0 + k);
    }

    const frontCenter = positions.length / 3;
    positions.push(0, 0.48, 2.225);
    uvs.push(1, 0.5);
    const ringLast = (stations.length - 1) * ringStride;
    for (let k = 0; k < segments; k++) {
        indices.push(frontCenter, ringLast + k, ringLast + k + 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function meshGeometry(geometry, material, castShadow = true) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
}

function addPillar(parent, mat, x0, y0, z0, x1, y1, z1, thickness = 0.06, depth = 0.08) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    const pillar = meshGeometry(new THREE.BoxGeometry(thickness, len, depth), mat, true);
    pillar.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    parent.add(pillar);
    return pillar;
}

function makeWheel(mats, side, front) {
    const hubMount = new THREE.Group();
    const z = front ? FRONT_Z : REAR_Z;
    const x = side * (WIDTH / 2 - 0.135);
    hubMount.position.set(x, WHEEL_R, z);
    hubMount.rotation.set(0, 0, 0);

    const steerPivot = new THREE.Group();
    hubMount.add(steerPivot);

    const caliper = meshGeometry(new THREE.BoxGeometry(0.055, 0.16, 0.11), mats.caliper, false);
    caliper.position.set(side * 0.085, 0.06, front ? -0.14 : 0.14);
    steerPivot.add(caliper);

    const spinPivot = new THREE.Group();
    steerPivot.add(spinPivot);

    const tire = meshGeometry(
        new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.275, 48, 1),
        mats.tire,
        true
    );
    tire.rotation.z = Math.PI / 2;

    const rim = meshGeometry(
        new THREE.CylinderGeometry(0.285, 0.285, 0.255, 48, 1),
        mats.rim,
        true
    );
    rim.rotation.z = Math.PI / 2;
    rim.position.x = side * 0.012;

    const well = meshGeometry(
        new THREE.CylinderGeometry(0.252, 0.252, 0.26, 32),
        mats.well,
        false
    );
    well.rotation.z = Math.PI / 2;
    well.position.x = side * 0.015;

    const spokes = new THREE.Group();
    spokes.position.x = side * 0.138;
    for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5;
        const spoke = meshGeometry(
            new THREE.BoxGeometry(0.016, 0.23, 0.022),
            mats.spoke,
            true
        );
        spoke.position.set(0, Math.cos(angle) * 0.125, Math.sin(angle) * 0.125);
        spoke.rotation.x = angle;
        spokes.add(spoke);
    }

    const hub = meshGeometry(new THREE.CylinderGeometry(0.06, 0.06, 0.024, 24), mats.metal, false);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = side * 0.144;

    spinPivot.add(tire, rim, well, spokes, hub);
    return { hubMount, steerPivot, spinPivot, front, side };
}

function makeWindow(x, y, z, sx, sy, sz, rotY, rotZ, mat) {
    const pane = meshGeometry(new THREE.BoxGeometry(sx, sy, sz), mat, false);
    pane.position.set(x, y, z);
    pane.rotation.set(0, rotY, rotZ);
    return pane;
}

export function createGreyStorm(paintHex = 0x777d84, { mobile = false } = {}) {
    const root = new THREE.Group();
    const lod = new THREE.LOD();
    root.add(lod);

    const paint = createCarPaintMaterial(paintHex, { mobile });
    paint.clearcoat = 1;
    paint.clearcoatRoughness = 0.025;
    paint.envMapIntensity = 1.65;

    const mats = {
        tire: new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.82 }),
        rim: new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.9, roughness: 0.18 }),
        spoke: new THREE.MeshStandardMaterial({ color: 0x626a74, metalness: 0.92, roughness: 0.16 }),
        well: new THREE.MeshStandardMaterial({ color: 0x090a0c, roughness: 0.72 }),
        metal: new THREE.MeshStandardMaterial({ color: 0xb6bec6, metalness: 1, roughness: 0.12 }),
        caliper: new THREE.MeshStandardMaterial({ color: 0xd01824, metalness: 0.4, roughness: 0.22 }),
        trim: new THREE.MeshStandardMaterial({ color: 0x101318, metalness: 0.55, roughness: 0.24 }),
        matte: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.42, metalness: 0.2 }),
        glass: new THREE.MeshPhysicalMaterial({
            color: 0x0b1a29,
            transparent: true,
            opacity: 0.80,
            roughness: 0.06,
            metalness: 0.14,
            clearcoat: 1,
            clearcoatRoughness: 0.03,
            side: THREE.DoubleSide
        }),
        interior: new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.5 }),
        leather: new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.34 }),
        ledWhite: new THREE.MeshBasicMaterial({ color: 0xf3f7ff }),
        tailBar: new THREE.MeshBasicMaterial({ color: 0xd91820 })
    };

    const hd = new THREE.Group();
    const bodyGeo = ringGeometry({ roof: 1.511 });
    const body = meshGeometry(bodyGeo, paint);
    hd.add(body);

    const roof = meshGeometry(
        new THREE.BoxGeometry(1.32, 0.055, 1.54),
        paint,
        true
    );
    roof.position.set(0, 1.46, -0.34);
    roof.rotation.x = -0.04;
    hd.add(roof);

    const panoGlass = meshGeometry(
        new THREE.BoxGeometry(1.06, 0.03, 1.14),
        mats.glass,
        false
    );
    panoGlass.position.set(0, 1.482, -0.32);
    panoGlass.rotation.x = -0.04;
    hd.add(panoGlass);

    const hoodLine = meshGeometry(
        new THREE.BoxGeometry(0.022, 0.012, 0.92),
        mats.trim,
        false
    );
    hoodLine.position.set(0, 0.985, 1.46);
    hoodLine.rotation.x = 0.14;
    hd.add(hoodLine);
    for (const x of [-0.34, 0.34]) {
        const rib = hoodLine.clone();
        rib.position.set(x, 0.96, 1.46);
        rib.rotation.z = x * 0.01;
        hd.add(rib);
    }

    for (const side of [-1, 1]) {
        // Side windows tucked cleanly from beltline shoulder up to roof edge.
        hd.add(makeWindow(
            side * 0.72,
            1.20,
            0.10,
            0.02,
            0.48,
            0.96,
            0,
            side * 0.24,
            mats.glass
        ));
        hd.add(makeWindow(
            side * 0.70,
            1.20,
            -0.74,
            0.02,
            0.44,
            0.76,
            side * -0.06,
            side * 0.24,
            mats.glass
        ));

        // Painted A/C pillars and gloss-black B pillar connecting beltline to roof.
        addPillar(hd, paint, side * 0.74, 0.98, 0.90, side * 0.64, 1.46, 0.40, 0.058, 0.08);
        addPillar(hd, mats.trim, side * 0.75, 0.98, -0.08, side * 0.65, 1.46, -0.14, 0.05, 0.07);
        addPillar(hd, paint, side * 0.73, 1.01, -1.66, side * 0.64, 1.46, -1.08, 0.075, 0.10);

        const mirror = meshGeometry(new THREE.BoxGeometry(0.16, 0.085, 0.20), mats.trim);
        mirror.position.set(side * (WIDTH / 2 + 0.03), 1.00, 0.68);
        hd.add(mirror);

        const skirt = meshGeometry(new THREE.BoxGeometry(0.055, 0.11, 2.50), mats.matte);
        skirt.position.set(side * (WIDTH / 2 - 0.02), 0.34, 0);
        hd.add(skirt);

        for (const z of [0.36, -0.46]) {
            const handle = meshGeometry(new THREE.BoxGeometry(0.03, 0.03, 0.22), mats.metal);
            handle.position.set(side * (WIDTH / 2 - 0.015), 0.86, z);
            hd.add(handle);
        }

        const archFront = meshGeometry(
            new THREE.TorusGeometry(WHEEL_R + 0.035, 0.034, 10, 28, Math.PI),
            mats.trim
        );
        for (const z of [FRONT_Z, REAR_Z]) {
            const arch = archFront.clone();
            arch.position.set(side * (WIDTH / 2 - 0.03), WHEEL_R, z);
            arch.rotation.set(0, Math.PI / 2, 0);
            hd.add(arch);
        }
    }

    const windshield = meshGeometry(new THREE.BoxGeometry(1.26, 0.66, 0.025), mats.glass);
    windshield.position.set(0, 1.24, 0.66);
    windshield.rotation.x = -0.78;
    hd.add(windshield);

    const rearGlass = meshGeometry(new THREE.BoxGeometry(1.24, 0.70, 0.026), mats.glass);
    rearGlass.position.set(0, 1.24, -1.36);
    rearGlass.rotation.x = 0.80;
    hd.add(rearGlass);

    const grille = meshGeometry(
        new THREE.BoxGeometry(0.86, 0.24, 0.045),
        mats.trim
    );
    grille.position.set(0, 0.50, 2.22);
    hd.add(grille);
    const splitter = meshGeometry(new THREE.BoxGeometry(1.24, 0.075, 0.08), mats.matte);
    splitter.position.set(0, 0.24, 2.20);
    hd.add(splitter);
    for (let i = -3; i <= 3; i++) {
        const slat = meshGeometry(new THREE.BoxGeometry(0.018, 0.21, 0.032), mats.metal);
        slat.position.set(i * 0.11, 0.50, 2.238);
        hd.add(slat);
    }

    for (const side of [-1, 1]) {
        const intake = meshGeometry(new THREE.BoxGeometry(0.24, 0.15, 0.04), mats.trim);
        intake.position.set(side * 0.58, 0.45, 2.13);
        intake.rotation.y = side * 0.28;
        hd.add(intake);

        const head = meshGeometry(new THREE.BoxGeometry(0.32, 0.08, 0.04), mats.ledWhite);
        head.position.set(side * 0.60, 0.72, 2.08);
        head.rotation.set(0.14, side * 0.28, side * -0.06);
        hd.add(head);
    }

    const rearBar = meshGeometry(new THREE.BoxGeometry(1.20, 0.055, 0.04), mats.tailBar);
    rearBar.position.set(0, 0.84, -2.215);
    hd.add(rearBar);
    for (const side of [-1, 1]) {
        const tail = meshGeometry(new THREE.BoxGeometry(0.22, 0.09, 0.04), mats.tailBar);
        tail.position.set(side * 0.62, 0.85, -2.18);
        tail.rotation.y = side * -0.22;
        hd.add(tail);
    }

    const diffuser = meshGeometry(new THREE.BoxGeometry(1.16, 0.16, 0.09), mats.matte);
    diffuser.position.set(0, 0.28, -2.215);
    hd.add(diffuser);
    for (const side of [-1, 1]) {
        const exhaust = meshGeometry(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 16), mats.metal);
        exhaust.position.set(side * 0.44, 0.28, -2.25);
        exhaust.rotation.x = Math.PI / 2;
        hd.add(exhaust);
    }

    const spoiler = meshGeometry(new THREE.BoxGeometry(1.28, 0.05, 0.20), mats.trim);
    spoiler.position.set(0, 1.45, -1.16);
    spoiler.rotation.x = -0.10;
    hd.add(spoiler);

    const floor = meshGeometry(new THREE.BoxGeometry(1.42, 0.10, 2.90), mats.interior);
    floor.position.set(0, 0.50, -0.05);
    hd.add(floor);
    const dashboard = meshGeometry(new THREE.BoxGeometry(1.36, 0.24, 0.18), mats.leather);
    dashboard.position.set(0, 0.94, 0.52);
    hd.add(dashboard);
    for (const side of [-1, 1]) {
        const seat = meshGeometry(new THREE.BoxGeometry(0.40, 0.52, 0.44), mats.leather);
        seat.position.set(side * 0.40, 0.76, -0.02);
        seat.rotation.x = -0.08;
        hd.add(seat);
        const headrest = meshGeometry(new THREE.BoxGeometry(0.26, 0.19, 0.11), mats.leather);
        headrest.position.set(side * 0.40, 1.11, -0.20);
        hd.add(headrest);
    }
    lod.addLevel(hd, 0);

    const mid = new THREE.Group();
    const midBody = meshGeometry(bodyGeo, paint);
    mid.add(midBody);
    const midRoof = roof.clone();
    mid.add(midRoof);
    for (const side of [-1, 1]) {
        mid.add(makeWindow(side * 0.71, 1.20, -0.22, 0.02, 0.46, 1.42, 0, side * 0.24, mats.glass));
        const skirt = meshGeometry(new THREE.BoxGeometry(0.05, 0.10, 2.48), mats.trim);
        skirt.position.set(side * (WIDTH / 2 - 0.02), 0.34, 0);
        mid.add(skirt);
    }
    mid.add(rearBar.clone(), grille.clone());
    lod.addLevel(mid, 38);

    const far = new THREE.Group();
    const silhouette = meshGeometry(new THREE.BoxGeometry(WIDTH, 0.78, LEN), paint);
    silhouette.position.y = 0.66;
    far.add(silhouette);
    const farRoof = meshGeometry(new THREE.BoxGeometry(1.32, 0.42, 1.54), mats.trim);
    farRoof.position.set(0, 1.26, -0.34);
    far.add(farRoof);
    lod.addLevel(far, 85);

    const wheels = [
        makeWheel(mats, 1, true),
        makeWheel(mats, -1, true),
        makeWheel(mats, 1, false),
        makeWheel(mats, -1, false)
    ];
    for (const wheel of wheels) root.add(wheel.hubMount);

    let spin = 0;
    let steer = 0;
    let pitch = 0;
    let roll = 0;

    root.userData.model = 'grey-storm';
    root.userData.length = LEN;
    root.userData.width = WIDTH;
    root.userData.height = 1.511;
    root.userData.lod = lod;
    root.userData.setPaint = (hex) => {
        if (hex !== undefined && hex !== null) paint.color.set(hex);
    };
    root.userData.animate = (dt, state = {}) => {
        const safeDt = Math.max(0.001, Math.min(0.05, dt || 0.016));
        const speed = Number(state.speed) || 0;
        const steering = Number(state.steer) || 0;
        const showroom = !!state.showroom;
        spin += (speed * safeDt) / WHEEL_R;
        steer += ((showroom ? 0.18 : steering * 0.38) - steer) * Math.min(1, safeDt * 10);
        const targetPitch = showroom ? 0 : (state.braking ? 0.018 : -Number(state.throttle || 0) * 0.012);
        const targetRoll = showroom ? 0 : (state.steer || 0) * -0.012;
        pitch += (targetPitch - pitch) * Math.min(1, safeDt * 8);
        roll += (targetRoll - roll) * Math.min(1, safeDt * 7);
        hd.position.y = pitch * 0.15;
        hd.rotation.x = pitch;
        hd.rotation.z = roll;
        for (const wheel of wheels) {
            wheel.spinPivot.rotation.x = spin;
            if (wheel.front) wheel.steerPivot.rotation.y = steer;
        }
        mats.tailBar.color.setHex(state.braking ? 0xff2b33 : 0xd91820);
    };
    root.userData.lights = {
        set(braking) {
            mats.tailBar.color.setHex(braking ? 0xff2b33 : 0xd91820);
        }
    };

    root.userData.animate(0.016, { showroom: true });
    return root;
}
