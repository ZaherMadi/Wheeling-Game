// What the Love&Faith event puts on the road. To catch (+1 love): hearts,
// hugs (a teddy holding a heart), letters (sealed with a heart). To avoid:
// broken hearts (-3), tears (-2). Shared shapes and materials.
import * as THREE from 'three';

// (The good ones bigger: seen from far; caught as wide as they look.)
export const ITEM_KINDS = {
    heart: { good: true, love: 1, radius: 1.45 },
    hug: { good: true, love: 1, radius: 1.45 },
    letter: { good: true, love: 1, radius: 1.5 },
    broken: { good: false, love: -3, radius: 1.05 },
    tear: { good: false, love: -2, radius: 0.95 }
};

// The heart curve, upright (tip down), about 1 wide.
function heartPoints(steps = 72) {
    const points = [];
    for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        points.push(new THREE.Vector2(x / 32, y / 32));
    }
    return points;
}

function extrude(shape, depth = 0.22) {
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 12
    });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
}

// Half a heart and the crack down its middle (side: -1 left, 1 right).
function halfHeart(side) {
    const all = heartPoints(96);
    // t = 0 is the dip at the top, t = pi the tip: the right side is t in
    // [0, pi], the left [pi, 2 pi].
    const half = side > 0 ? all.slice(0, 49) : [...all.slice(48), all[0]];
    const crack = [[0, 0.155], [0.05, 0.06], [-0.045, -0.05], [0.055, -0.17], [-0.04, -0.28], [0.03, -0.4], [0, -0.53]]
        .map(([x, y]) => new THREE.Vector2(x, y));
    // Right: dip -> lobe -> tip, then up the crack. Left: tip -> lobe -> dip, then down the crack.
    const outline = side > 0 ? [...half, ...crack.slice().reverse()] : [...half, ...crack];
    return new THREE.Shape(outline);
}

function glowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// A flare (a glow and four rays): what to catch shines from far away.
function flareTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const glow = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    glow.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 256, 256);
    ctx.translate(128, 128);
    for (let i = 0; i < 4; i++) {
        const long = i % 2 === 0;
        ctx.rotate(Math.PI / 4);
        const ray = ctx.createLinearGradient(0, -128, 0, 128);
        ray.addColorStop(0, 'rgba(255,255,255,0)');
        ray.addColorStop(0.5, `rgba(255,255,255,${long ? 0.95 : 0.55})`);
        ray.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = ray;
        ctx.fillRect(long ? -3 : -2, long ? -128 : -84, long ? 6 : 4, long ? 256 : 168);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// The flare's colour for each good thing.
const FLARES = { heart: 0xff2a50, hug: 0xffc35a, letter: 0xfff1d2 };

export function createItemFactory() {
    const heartShape = new THREE.Shape(heartPoints());
    const geometries = {
        heart: extrude(heartShape),
        left: extrude(halfHeart(-1)),
        right: extrude(halfHeart(1)),
        sphere: new THREE.SphereGeometry(1, 18, 12),
        envelope: new THREE.BoxGeometry(1.05, 0.7, 0.06),
        flap: new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.525, 0.35), new THREE.Vector2(0.525, 0.35), new THREE.Vector2(0, -0.06)])),
        tear: (() => {
            const profile = [];
            for (let i = 0; i <= 24; i++) {
                const t = (i / 24) * Math.PI;
                profile.push(new THREE.Vector2(Math.sin(t) * Math.pow(1 - t / Math.PI, 0.85) * 0.62, -Math.cos(t) * 0.58));
            }
            return new THREE.LatheGeometry(profile, 24);
        })()
    };
    const materials = {
        heart: new THREE.MeshStandardMaterial({ color: 0xff1f3d, emissive: 0x8a0016, emissiveIntensity: 0.7, roughness: 0.32, metalness: 0.08 }),
        broken: new THREE.MeshStandardMaterial({ color: 0x5c0b1c, emissive: 0x2c0410, emissiveIntensity: 0.8, roughness: 0.6, metalness: 0.05 }),
        crack: new THREE.MeshBasicMaterial({ color: 0x6d5cff }),
        fur: new THREE.MeshStandardMaterial({ color: 0x9a6236, roughness: 0.92 }),
        muzzle: new THREE.MeshStandardMaterial({ color: 0xe0c29a, roughness: 0.9 }),
        dark: new THREE.MeshStandardMaterial({ color: 0x1a0e08, roughness: 0.5 }),
        paper: new THREE.MeshStandardMaterial({ color: 0xf4ede9, roughness: 0.82, side: THREE.DoubleSide }),
        flap: new THREE.MeshStandardMaterial({ color: 0xe6dcd2, roughness: 0.85, side: THREE.DoubleSide }),
        tear: new THREE.MeshPhysicalMaterial({
            color: 0x7fc0ff, emissive: 0x0d3f86, emissiveIntensity: 0.55, roughness: 0.06, metalness: 0, clearcoat: 1,
            transparent: true, opacity: 0.82
        })
    };
    const glow = glowTexture();
    const flare = flareTexture();
    const glows = {
        good: new THREE.SpriteMaterial({ map: glow, color: 0xff6f8f, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
        bad: new THREE.SpriteMaterial({ map: glow, color: 0x6f86c8, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending })
    };

    const mesh = (geometry, material, x = 0, y = 0, z = 0, s = 1, sy = s, sz = s) => {
        const m = new THREE.Mesh(geometry, material);
        m.position.set(x, y, z);
        m.scale.set(s, sy, sz);
        m.castShadow = true;
        return m;
    };

    const builders = {
        heart() {
            const group = new THREE.Group();
            group.add(mesh(geometries.heart, materials.heart, 0, 0, 0, 1.7));
            return group;
        },
        broken() {
            const group = new THREE.Group();
            // The two halves well apart: the crack shows from far.
            const left = mesh(geometries.left, materials.broken, -0.13, 0.02, 0, 1.15);
            left.rotation.z = 0.24;
            const right = mesh(geometries.right, materials.broken, 0.13, -0.03, 0, 1.15);
            right.rotation.z = -0.24;
            group.add(left, right);
            return group;
        },
        tear() {
            const group = new THREE.Group();
            group.add(mesh(geometries.tear, materials.tear, 0, 0, 0, 1.25));
            return group;
        },
        hug() {
            // A teddy holding a heart against him.
            const group = new THREE.Group();
            group.add(mesh(geometries.sphere, materials.fur, 0, -0.12, 0, 0.36, 0.42, 0.32));
            group.add(mesh(geometries.sphere, materials.fur, 0, 0.42, 0, 0.3));
            for (const side of [-1, 1]) {
                group.add(mesh(geometries.sphere, materials.fur, side * 0.22, 0.66, -0.02, 0.1));
                group.add(mesh(geometries.sphere, materials.fur, side * 0.2, -0.05, 0.2, 0.11, 0.2, 0.11));
                group.add(mesh(geometries.sphere, materials.fur, side * 0.17, -0.5, 0.05, 0.13, 0.11, 0.15));
                group.add(mesh(geometries.sphere, materials.dark, side * 0.1, 0.5, 0.26, 0.035));
            }
            group.add(mesh(geometries.sphere, materials.muzzle, 0, 0.35, 0.24, 0.12, 0.09, 0.08));
            group.add(mesh(geometries.sphere, materials.dark, 0, 0.39, 0.31, 0.04, 0.03, 0.03));
            group.add(mesh(geometries.heart, materials.heart, 0, -0.06, 0.3, 0.42));
            group.scale.setScalar(1.6);
            return group;
        },
        letter() {
            const group = new THREE.Group();
            group.add(mesh(geometries.envelope, materials.paper, 0, 0, 0, 1));
            const flap = mesh(geometries.flap, materials.flap, 0, 0, 0.035, 1);
            flap.castShadow = false;
            group.add(flap);
            group.add(mesh(geometries.heart, materials.heart, 0, -0.02, 0.07, 0.26, 0.26, 0.14));
            // Bigger, and leaning back a little: its face to the rider.
            group.scale.setScalar(1.8);
            group.rotation.x = -0.25;
            return group;
        }
    };

    // An item: { kind, object, x, z, phase, ... }. What to catch gets its
    // own flare (bright from far, gone close up); a tear a dim blue glow; a
    // broken heart none: from far, the full heart shines, the broken one not.
    function create(kind, x, y, z) {
        const object = builders[kind]();
        let shine = null;
        if (ITEM_KINDS[kind].good) {
            // The heart's red shows even on a bright road (not added to it).
            shine = new THREE.Sprite(new THREE.SpriteMaterial({
                map: flare, color: FLARES[kind], transparent: true, opacity: 0, depthWrite: false,
                blending: kind === 'heart' ? THREE.NormalBlending : THREE.AdditiveBlending
            }));
            shine.renderOrder = 5;
            // Just in front of it: from far the flare covers it.
            shine.position.z = 0.5 / object.scale.x;
            object.add(shine);
        } else if (kind === 'tear') {
            const halo = new THREE.Sprite(glows.bad);
            halo.scale.setScalar(2.4);
            halo.position.z = -0.25;
            object.add(halo);
        }
        object.position.set(x, y, z);
        return { kind, object, shine, x, y, z, phase: Math.random() * Math.PI * 2, spin: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.5) };
    }

    // Floating and turning (the hearts beat); the flare by the distance
    // from the camera (full from 58 units, none under 24: about 15 ahead of
    // the bike).
    function animate(item, t, camera) {
        const o = item.object;
        if (item.shine) {
            const away = camera ? camera.z - o.position.z : 60;
            const k = Math.max(0, Math.min(1, (away - 24) / 34));
            const twinkle = 1 + Math.sin(t * 6 + item.phase) * 0.12;
            item.shine.material.opacity = 0.95 * k;
            item.shine.visible = k > 0.01;
            // The flare is not scaled with the item (the group's scale undone).
            const size = (3.2 + k * 3.4) * (item.kind === 'heart' ? 1.25 : 1) * twinkle / o.scale.x;
            item.shine.scale.set(size, size, 1);
            item.shine.material.rotation = t * 0.4 + item.phase;
        }
        o.position.y = item.y + Math.sin(t * 2.1 + item.phase) * 0.16;
        if (item.kind === 'heart' || item.kind === 'broken') {
            o.rotation.y = Math.sin(t * item.spin + item.phase) * 0.6;
            const beat = item.kind === 'heart' ? 1 + Math.max(0, Math.sin(t * 7 + item.phase)) ** 6 * 0.12 : 1;
            o.scale.setScalar(beat);
        } else if (item.kind === 'tear') {
            o.rotation.y += 0.01;
            o.scale.set(1, 1 + Math.sin(t * 3 + item.phase) * 0.05, 1);
        } else {
            o.rotation.y = Math.sin(t * 0.9 * item.spin + item.phase) * 0.5;
        }
    }

    function dispose() {
        Object.values(geometries).forEach((g) => g.dispose());
        Object.values(materials).forEach((m) => m.dispose());
        Object.values(glows).forEach((m) => m.dispose());
        glow.dispose();
        flare.dispose();
    }

    return { create, animate, dispose };
}
