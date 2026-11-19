// Endless approaching backdrop for the realistic version: layers a mountain
// ridge and distant city behind 3D mega-landmarks (cable-stayed bridge,
// downtown spire district, illuminated stadium, ferris wheel, elevated metro
// viaduct) that steadily approach the camera as you ride, passing overhead or
// flanking the avenue before the next landmark emerges from the horizon haze.
import * as THREE from 'three';

function makeCanvasTexture(w, h, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

export function createHorizon({ scene }) {
    const group = new THREE.Group();
    group.renderOrder = -1;
    scene.add(group);

    const ridgeMat = new THREE.MeshBasicMaterial({
        map: makeCanvasTexture(1024, 256, (ctx, w, h) => {
            const grad = ctx.createLinearGradient(0, 40, 0, h);
            grad.addColorStop(0, 'rgba(90,115,152,0.55)');
            grad.addColorStop(1, 'rgba(176,194,218,0.85)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, h);
            let y = 130;
            for (let x = 0; x <= w; x += 24) {
                y = 110 + Math.sin(x * 0.008) * 32 + Math.cos(x * 0.023) * 18;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fill();
        }),
        transparent: true,
        depthWrite: false,
        fog: false
    });
    const ridge = new THREE.Mesh(new THREE.PlaneGeometry(1400, 140), ridgeMat);
    ridge.frustumCulled = false;
    group.add(ridge);

    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x5c6878 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a313d });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x7aa2c4, emissive: 0x2a4a6e, emissiveIntensity: 0.45 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe4a0 });
    const cyanMat = new THREE.MeshBasicMaterial({ color: 0x62dcff });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff3b2f });

    function mesh(geo, mat, px, py, pz, sx, sy, sz, rx = 0, ry = 0, rz = 0, parent) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, pz);
        m.scale.set(sx, sy, sz);
        m.rotation.set(rx, ry, rz);
        parent.add(m);
        return m;
    }

    // 1. Cable-stayed bridge high over the avenue with a sliding train.
    function buildBridge() {
        const g = new THREE.Group();
        // Deck clearing the avenue (y = 26m).
        mesh(box, darkMat, 0, 26, 0, 180, 2.2, 11, 0, 0, 0, g);
        mesh(box, lightMat, 0, 27.3, 4.8, 176, 0.35, 0.3, 0, 0, 0, g);
        // Twin A-frame pylons flanking the boulevard (|x| = 42m).
        for (const side of [-1, 1]) {
            mesh(box, steelMat, side * 42, 42, 0, 3.6, 84, 4.2, 0, 0, 0, g);
            mesh(box, steelMat, side * 42, 62, 0, 10, 2.5, 4.4, 0, 0, 0, g);
            mesh(box, redMat, side * 42, 85, 0, 0.9, 0.9, 0.9, 0, 0, 0, g);
            for (let i = 1; i <= 5; i++) {
                const span = i * 9;
                const len = Math.hypot(span, 34);
                const ang = Math.atan2(span, 34);
                mesh(box, steelMat, side * 42 - side * span * 0.5, 43, 3, 0.28, len, 0.28, 0, 0, -side * ang, g);
                mesh(box, steelMat, side * 42 + side * span * 0.5, 43, 3, 0.28, len, 0.28, 0, 0, side * ang, g);
            }
        }
        const train = new THREE.Group();
        train.position.set(-70, 28, 2);
        mesh(box, cyanMat, 0, 0, 0, 28, 1.8, 2.2, 0, 0, 0, train);
        mesh(box, lightMat, 0, 0.2, 1.15, 26, 0.6, 0.1, 0, 0, 0, train);
        g.add(train);
        g.userData.animate = (t) => {
            train.position.x = ((t * 16) % 170) - 85;
        };
        return g;
    }

    // 2. Downtown spire & glowing glass skyscrapers flanking the avenue ahead.
    function buildSpireDistrict() {
        const g = new THREE.Group();
        const towers = [
            [-56, 72, 18, 18], [-38, 118, 17, 17], [38, 134, 20, 20], [58, 86, 18, 18], [-76, 56, 22, 18], [76, 68, 20, 20]
        ];
        towers.forEach(([x, h, w, d], idx) => {
            mesh(box, glassMat, x, h / 2, 0, w, h, d, 0, 0, 0, g);
            mesh(box, darkMat, x, h + 3, 0, w * 0.65, 6, d * 0.65, 0, 0, 0, g);
            mesh(box, idx % 2 ? cyanMat : lightMat, x, h + 0.5, d / 2 + 0.2, w * 0.85, 1.2, 0.3, 0, 0, 0, g);
            if (h > 100) {
                mesh(cyl, steelMat, x, h + 16, 0, 0.6, 22, 0.6, 0, 0, 0, g);
                mesh(box, redMat, x, h + 27, 0, 1.2, 1.2, 1.2, 0, 0, 0, g);
            }
        });
        return g;
    }

    // 3. Illuminated stadium dome & floodlight towers off to the right flank.
    function buildStadium() {
        const g = new THREE.Group();
        mesh(cyl, darkMat, 66, 12, 0, 34, 24, 34, 0, 0, 0, g);
        mesh(cyl, lightMat, 66, 24.5, 0, 35, 1.4, 35, 0, 0, 0, g);
        mesh(cyl, cyanMat, 66, 26, 0, 26, 0.8, 26, 0, 0, 0, g);
        for (const [dx, dz] of [[-22, -16], [22, -16], [-22, 16], [22, 16]]) {
            mesh(box, steelMat, 66 + dx, 24, dz, 1.6, 48, 1.6, 0, 0, 0, g);
            mesh(box, lightMat, 66 + dx, 48, dz, 7, 3.2, 2.2, 0.3, 0, 0, g);
        }
        return g;
    }

    // 4. Giant rotating Ferris wheel on the left riverfront flank.
    function buildFerrisWheel() {
        const g = new THREE.Group();
        const cx = -56;
        const cy = 42;
        mesh(box, steelMat, cx - 5, cy / 2, -2, 1.8, cy + 4, 1.8, 0, 0, -0.22, g);
        mesh(box, steelMat, cx + 5, cy / 2, -2, 1.8, cy + 4, 1.8, 0, 0, 0.22, g);
        const wheel = new THREE.Group();
        wheel.position.set(cx, cy, 0);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(28, 0.9, 6, 28), lightMat);
        wheel.add(rim);
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            mesh(box, steelMat, Math.cos(a) * 14, Math.sin(a) * 14, 0, 0.45, 28, 0.45, 0, 0, a + Math.PI / 2, wheel);
            mesh(box, i % 2 ? cyanMat : lightMat, Math.cos(a) * 28, Math.sin(a) * 28, 0, 2.8, 2.8, 2.4, 0, 0, 0, wheel);
        }
        g.add(wheel);
        g.userData.animate = (t) => { wheel.rotation.z = t * 0.22; };
        return g;
    }

    // 5. Elevated monumental highway arch spanning the boulevard.
    function buildArch() {
        const g = new THREE.Group();
        for (const side of [-1, 1]) {
            mesh(box, darkMat, side * 34, 22, 0, 5, 44, 6, 0, 0, side * 0.2, g);
        }
        mesh(box, steelMat, 0, 42, 0, 62, 4.2, 5.5, 0, 0, 0, g);
        mesh(box, lightMat, 0, 44.5, 2.9, 60, 0.7, 0.4, 0, 0, 0, g);
        mesh(box, cyanMat, 0, 39.6, 2.9, 58, 0.6, 0.4, 0, 0, 0, g);
        return g;
    }

    const stages = [
        { node: buildBridge(), lead: 260 },
        { node: buildSpireDistrict(), lead: 480 },
        { node: buildFerrisWheel(), lead: 700 },
        { node: buildStadium(), lead: 920 },
        { node: buildArch(), lead: 1140 }
    ];
    stages.forEach((s) => group.add(s.node));

    // Distant cruising airplane with blinking navigation beacons.
    const plane = new THREE.Group();
    mesh(box, new THREE.MeshBasicMaterial({ color: 0xe8edf5 }), 0, 0, 0, 8, 1.1, 1.4, 0, 0, 0, plane);
    mesh(box, new THREE.MeshBasicMaterial({ color: 0xd0d8e6 }), 0, 0, 0, 2.2, 0.3, 9.5, 0, 0, 0, plane);
    const strobe = mesh(box, redMat, -3.5, 0.8, 0, 0.9, 0.9, 0.9, 0, 0, 0, plane);
    group.add(plane);

    // High-altitude drifting cloud ribbons.
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf7e4d4, transparent: true, opacity: 0.24, depthWrite: false, fog: false });
    const clouds = Array.from({ length: 10 }, (_, i) => {
        const c = new THREE.Mesh(box, cloudMat);
        c.scale.set(45 + (i % 4) * 28, 2.5, 14);
        c.userData = { x: ((i * 173) % 600) - 300, y: 78 + (i % 5) * 14, dz: -240 - (i % 6) * 85, speed: 2.5 + (i % 3) * 1.4 };
        group.add(c);
        return c;
    });

    let lastCamZ = null;
    let enabled = true;

    function update(camera, time, freeMode = false) {
        if (!enabled) return;
        const camZ = camera.position.z;
        const dz = lastCamZ === null ? 0 : Math.max(-2, Math.min(20, lastCamZ - camZ));
        lastCamZ = camZ;

        ridge.position.set(camera.position.x * 0.9, 44, camZ - 690);

        // High-altitude clouds & distant plane always gently drift.
        for (const c of clouds) {
            const u = c.userData;
            const px = ((u.x + time * u.speed + 350) % 700) - 350;
            c.position.set(camera.position.x * 0.7 + px, u.y, camZ + u.dz);
        }
        const planeCycle = ((time * 18) % 520) - 260;
        plane.position.set(camera.position.x + planeCycle, 125, camZ - 410);
        strobe.visible = Math.floor(time * 2.5) % 2 === 0;

        // Approaching 3D landmarks (linear/competitive mode).
        for (const s of stages) {
            s.node.visible = !freeMode;
            if (freeMode) continue;
            // Advance ~45% as fast as camera travel so each landmark noticeably grows closer over ~20-30s!
            s.lead -= dz * 0.48;
            if (s.lead < -55) {
                const farthest = Math.max(...stages.map((other) => other.lead));
                s.lead = Math.max(960, farthest + 220);
            }
            s.node.position.set(0, 0, camZ - s.lead);
            // Smooth fade-in scale from far horizon so landmarks emerge naturally instead of popping.
            const scaleIn = s.lead > 660 ? Math.max(0.05, 1 - (s.lead - 660) / 340) : 1;
            s.node.scale.setScalar(scaleIn);
            s.node.userData.animate?.(time);
        }
    }

    function setDusk(dusk) {
        const k = Math.max(0, Math.min(1, dusk));
        ridgeMat.color.setScalar(1 - k * 0.65);
        cloudMat.opacity = 0.24 - k * 0.12;
        glassMat.emissiveIntensity = 0.35 + k * 1.4;
        lightMat.color.setHex(k > 0.5 ? 0xffd27a : 0xffe4a0);
    }

    function reset() {
        lastCamZ = null;
        stages.forEach((s, i) => { s.lead = 260 + i * 220; });
    }

    return {
        group,
        update,
        setDusk,
        reset,
        setVisible(visible) {
            enabled = !!visible;
            group.visible = enabled;
        }
    };
}
