// A trophy turning in 3D (trophy room, when a trophy won is tapped): a cup
// or a medal, in its metal. A small canvas of its own, made when shown and
// freed when closed.
import * as THREE from 'three';

function metal(color) {
    return new THREE.MeshPhongMaterial({ color, specular: 0xffffff, shininess: 90 });
}

function cup(color) {
    const group = new THREE.Group();
    const gold = metal(color);
    const dark = metal(new THREE.Color(color).multiplyScalar(0.62));
    // Bowl: a profile turned round the axis (outside up, inside back down).
    const profile = [
        [0.0, 0.0], [0.16, 0.02], [0.3, 0.1], [0.42, 0.28], [0.5, 0.52], [0.54, 0.8], [0.56, 1.0],
        [0.5, 1.0], [0.47, 0.8], [0.43, 0.54], [0.35, 0.32], [0.24, 0.16], [0.0, 0.12]
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), gold);
    bowl.position.y = 0.62;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.34, 24), dark);
    stem.position.y = 0.46;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), gold);
    knot.position.y = 0.6;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.1, 32), gold);
    foot.position.y = 0.25;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.2, 0.86), new THREE.MeshPhongMaterial({ color: 0x17181c, shininess: 30 }));
    base.position.y = 0.1;
    group.add(bowl, stem, knot, foot, base);
    for (const side of [-1, 1]) {
        // Half a ring in the cup's plane, opening towards the bowl.
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 28, Math.PI), gold);
        handle.position.set(side * 0.5, 1.3, 0);
        handle.rotation.z = -side * Math.PI / 2;
        group.add(handle);
    }
    group.position.y = -0.82;
    return group;
}

function faceTexture(label, color) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = `#${new THREE.Color(color).getHexString()}`;
    context.fillRect(0, 0, 256, 256);
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.font = `900 ${label.length > 2 ? 86 : 150}px "Arial Black", Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 128, 138);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function medal(color, label) {
    const group = new THREE.Group();
    const rim = metal(new THREE.Color(color).multiplyScalar(0.7));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 48), rim);
    disc.rotation.x = Math.PI / 2;
    group.add(disc);
    for (const side of [-1, 1]) {
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.53, 48),
            new THREE.MeshPhongMaterial({ map: faceTexture(label, color), specular: 0xffffff, shininess: 80 }));
        face.position.z = side * 0.052;
        if (side < 0) face.rotation.y = Math.PI;
        group.add(face);
    }
    const ribbonBlue = new THREE.MeshPhongMaterial({ color: 0x2d5bd6, side: THREE.DoubleSide });
    const ribbonRed = new THREE.MeshPhongMaterial({ color: 0xe8282e, side: THREE.DoubleSide });
    for (const [x, tilt, material] of [[-0.2, 0.22, ribbonBlue], [0.2, -0.22, ribbonBlue], [0, 0, ribbonRed]]) {
        const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.75), material);
        ribbon.position.set(x, 0.9, -0.01);
        ribbon.rotation.z = tilt;
        group.add(ribbon);
    }
    group.position.y = -0.3;
    return group;
}

// host: an element the canvas goes in. Returns a function that frees it.
export function showTrophy3D(host, { kind = 'cup', color = '#f6c416', label = '1', size = 150 } = {}) {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
        // No more WebGL to give: the flat picture stays.
        return () => {};
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(size, size);
    renderer.domElement.className = 'trophy-3d';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0, 0.25, 4.4);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x554422, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 4);
    const fill = new THREE.DirectionalLight(0xffe2a0, 1.1);
    fill.position.set(-3, 1, 2);
    scene.add(key, fill);
    const trophy = kind === 'medal' ? medal(color, label) : cup(color);
    const pivot = new THREE.Group();
    pivot.add(trophy);
    scene.add(pivot);

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let last = performance.now();
    let stopped = false;
    function tick(now) {
        if (stopped) return;
        // Gone from the page (room closed, another trophy tapped): free it.
        if (!renderer.domElement.isConnected) return dispose();
        pivot.rotation.y += still ? 0 : Math.min(0.05, (now - last) / 1000) * 1.6;
        last = now;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
    }
    function dispose() {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(frame);
        scene.traverse((object) => {
            object.geometry?.dispose();
            if (object.material) {
                object.material.map?.dispose();
                object.material.dispose();
            }
        });
        renderer.dispose();
        renderer.forceContextLoss?.();
        renderer.domElement.remove();
    }
    if (still) pivot.rotation.y = 0.5;
    frame = requestAnimationFrame(tick);
    return dispose;
}
