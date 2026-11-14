// A digital ad on a bus shelter near the start: the 5HC intro plays on it
// (muted, looping) while the player has not left yet. If no shelter is in
// sight it stands on its own post on the pavement.
import * as THREE from 'three';

const WIDTH = 1.24;
const HEIGHT = 1.9;

export function createAdScreen({ scene }) {
    let video = null;
    let group = null;
    let post = null;

    function ensure() {
        if (group) return;
        video = document.createElement('video');
        video.src = '/5hc-intro.mp4';
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        group = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(WIDTH + 0.16, HEIGHT + 0.16, 0.08), new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: 0.5 }));
        frame.position.z = -0.05;
        const back = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), new THREE.MeshBasicMaterial({ color: 0x04060b }));
        // 16:9 video across the panel, a little above the middle.
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, WIDTH * 9 / 16), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
        screen.position.set(0, 0.22, 0.004);
        post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), frame.material);
        group.add(frame, back, screen, post);
        group.visible = false;
        scene.add(group);
    }

    // centre of the panel; faces +z (towards a rider coming down -z) or -z.
    function show(x, y, z, facing = 1, standalone = false) {
        ensure();
        group.position.set(x, y, z);
        group.rotation.y = facing > 0 ? 0 : Math.PI;
        // On its own post it is a bigger board, seen from further away.
        const size = standalone ? 2.2 : 1;
        group.scale.setScalar(size);
        post.visible = standalone;
        post.scale.y = Math.max(0.1, y / size - HEIGHT / 2);
        post.position.set(0, -HEIGHT / 2 - post.scale.y / 2, -0.05);
        group.visible = true;
        try {
            video.currentTime = 0;
        } catch {
            // Not loaded yet.
        }
        video.play().catch(() => {});
    }

    function hide() {
        if (!group || !group.visible) return;
        group.visible = false;
        video.pause();
    }

    // Out of sight behind the player: stop it.
    function update(focus) {
        if (group && group.visible && Math.abs(focus.z - group.position.z) > 170) hide();
    }

    return { show, hide, update, get visible() { return !!group && group.visible; }, get position() { return group ? group.position : null; }, get video() { return video; } };
}
