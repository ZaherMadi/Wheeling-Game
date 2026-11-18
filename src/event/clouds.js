// The heart mended (Love&Faith event): the road turns into a sea of clouds
// (a layer of cloud over the ground, big puffs all round, the city gone
// under it), then the bike rides into the cloud.
import * as THREE from 'three';

const SIZE = 700;
const TILE = 70;

function blobs(ctx, size, count, minR, maxR, alpha) {
    for (let i = 0; i < count; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = minR + Math.random() * (maxR - minR);
        // Drawn on all four sides too: the picture tiles without seams.
        for (const dx of [-size, 0, size]) {
            for (const dy of [-size, 0, size]) {
                const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
                g.addColorStop(0, `rgba(255,255,255,${alpha})`);
                g.addColorStop(0.6, `rgba(255,250,252,${alpha * 0.55})`);
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

function seaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255,244,248,0.82)';
    ctx.fillRect(0, 0, 512, 512);
    blobs(ctx, 512, 70, 30, 95, 0.75);
    // A little shade between the billows.
    ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 70; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 60);
        g.addColorStop(0, 'rgba(196,176,214,0.45)');
        g.addColorStop(1, 'rgba(196,176,214,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 60, y - 60, 120, 120);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(SIZE / TILE, SIZE / TILE);
    texture.anisotropy = 8;
    return texture;
}

function puffTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 60;
        const x = 128 + Math.cos(a) * d;
        const y = 140 + Math.sin(a) * d * 0.6;
        const r = 40 + Math.random() * 46;
        const g = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.7, 'rgba(250,238,246,0.6)');
        g.addColorStop(1, 'rgba(250,238,246,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export function createCloudSea(scene) {
    const map = seaTexture();
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false, color: 0xffffff }));
    sea.position.y = 0.4;
    sea.renderOrder = 1;
    sea.visible = false;
    // A second, lighter layer a little above: the billows have depth.
    const veilMap = map.clone();
    veilMap.repeat.set(SIZE / (TILE * 1.7), SIZE / (TILE * 1.7));
    const veil = new THREE.Mesh(sea.geometry, new THREE.MeshBasicMaterial({ map: veilMap, transparent: true, opacity: 0, depthWrite: false }));
    veil.position.y = 1.3;
    veil.renderOrder = 2;
    veil.visible = false;
    scene.add(sea, veil);
    const puffMap = puffTexture();
    const puffs = Array.from({ length: 64 }, () => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffMap, transparent: true, opacity: 0, depthWrite: false, color: 0xfff6fa }));
        sprite.visible = false;
        scene.add(sprite);
        return { sprite, size: 0, base: 0 };
    });
    let on = false;
    let time = 0;

    function place(puff, bikeZ, ahead) {
        const side = Math.random() < 0.5 ? -1 : 1;
        // Most beside the road, some right on it (the bike goes through).
        const x = Math.random() < 0.18 ? (Math.random() - 0.5) * 10 : side * (9 + Math.random() * 70);
        puff.size = 9 + Math.random() * 22;
        puff.base = 0.3 + Math.random() * 2.5;
        puff.sprite.scale.set(puff.size * 1.6, puff.size, 1);
        puff.sprite.position.set(x, puff.base + puff.size * 0.25, bikeZ - (ahead ? 120 + Math.random() * 220 : 30 + Math.random() * 300));
    }

    function start(bike) {
        on = true;
        time = 0;
        sea.visible = veil.visible = true;
        for (const puff of puffs) {
            place(puff, bike.z, false);
            puff.sprite.visible = true;
        }
    }

    // Returns how far the clouds have come (0 to 1).
    function update(dt, bike, camera) {
        if (!on) return 0;
        time += dt;
        const k = Math.min(1, time / 1.8);
        sea.material.opacity = k * 0.98;
        veil.material.opacity = k * 0.45;
        for (const layer of [sea, veil]) {
            layer.position.x = bike.x;
            layer.position.z = bike.z - SIZE * 0.3;
            const tile = SIZE / layer.material.map.repeat.x;
            // The clouds stay where they are while the bike goes on (the veil drifts).
            layer.material.map.offset.set(layer.position.x / tile + (layer === veil ? time * 0.02 : 0), -layer.position.z / tile);
        }
        for (const puff of puffs) {
            if (puff.sprite.position.z > bike.z + 25) place(puff, bike.z, true);
            // Thinning out as the camera gets to one (not a white screen).
            const ahead = camera ? camera.position.z - puff.sprite.position.z : 100;
            const near = Math.max(0, Math.min(1, (ahead - puff.size * 0.6) / 30));
            puff.sprite.material.opacity = k * 0.92 * near;
        }
        return k;
    }

    function stop() {
        on = false;
        sea.visible = veil.visible = false;
        sea.material.opacity = veil.material.opacity = 0;
        for (const puff of puffs) {
            puff.sprite.visible = false;
            puff.sprite.material.opacity = 0;
        }
    }

    return { start, update, stop, get on() { return on; } };
}
