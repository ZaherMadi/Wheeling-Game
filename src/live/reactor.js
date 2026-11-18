// Session live: whoever reacts appears small at the side of the screen, in
// his own look (helmet, hoodie, number), doing what he chose: laughing,
// booing, cheering, clapping, or talking (a ready-made line, said in his
// voice). Two places, left and right; drawn in the game's own picture (no
// second WebGL context), each in the box of its HTML stage.
import * as THREE from 'three';
import { createFigure } from '../v2/podium.js';

const POSES = { laugh: 'r_laugh', boo: 'r_boo', cheer: 'r_cheer', clap: 'r_clap', phrase: 'r_talk' };
const SHOWN = 3.4;
const POP = 0.22;

export function createReactor(container) {
    const slots = ['left', 'right'].map((side) => {
        const element = document.createElement('div');
        element.className = `live-reactor live-reactor--${side}`;
        element.innerHTML = '<div class="live-reactor__stage"></div><div class="live-reactor__bubble"><b></b><span></span></div>';
        container.append(element);
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3442, 1.7));
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(side === 'left' ? 1.5 : -1.5, 2.4, 3);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x3ad7ff, 1.2);
        rim.position.set(side === 'left' ? -2 : 2, 1.6, -2);
        scene.add(rim);
        const figure = createFigure(scene);
        const camera = new THREE.PerspectiveCamera(28, 0.8, 0.1, 30);
        camera.position.set(0, 1.25, 4.3);
        camera.lookAt(0, 1.02, 0);
        return {
            side, element, stage: element.querySelector('.live-reactor__stage'), name: element.querySelector('b'),
            text: element.querySelector('span'), scene, figure, camera, shownAt: -Infinity, until: -Infinity
        };
    });
    let turn = 0;

    // reaction: { name, look, kind, text }
    function show(reaction) {
        const now = performance.now() / 1000;
        // A free place, else the one shown the longest.
        const free = slots.find((slot) => slot.until < now);
        const slot = free || slots.reduce((a, b) => (a.shownAt < b.shownAt ? a : b));
        if (!free) turn++;
        slot.figure.setLook({ ...(reaction.look || {}), pose: POSES[reaction.kind] || 'r_talk' }, reaction.name);
        slot.figure.root.visible = true;
        slot.figure.root.position.set(0, 0, 0);
        slot.figure.root.rotation.y = slot.side === 'left' ? 0.35 : -0.35;
        slot.name.textContent = reaction.name || '';
        slot.text.textContent = reaction.text || '';
        slot.shownAt = now;
        slot.until = now + SHOWN + Math.min(2.5, (reaction.text || '').length * 0.03);
        slot.element.classList.remove('is-shown');
        void slot.element.offsetWidth;
        slot.element.classList.add('is-shown');
        slot.element.dataset.kind = reaction.kind;
        return slot.side;
    }

    const size = new THREE.Vector2();
    // After the game's picture: each figure in its stage's box.
    function render(renderer) {
        const now = performance.now() / 1000;
        const shown = slots.filter((slot) => slot.until > now);
        for (const slot of slots) {
            if (slot.until <= now && slot.element.classList.contains('is-shown')) {
                slot.element.classList.remove('is-shown');
                slot.figure.root.visible = false;
            }
        }
        if (!shown.length) return;
        renderer.getSize(size);
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.setScissorTest(true);
        for (const slot of shown) {
            const box = slot.stage.getBoundingClientRect();
            if (box.width < 4 || box.height < 4) continue;
            const age = now - slot.shownAt;
            const left = slot.until - now;
            const scale = Math.min(1, age / POP, left / POP);
            slot.figure.root.scale.setScalar(1.08 * Math.max(0.01, 1 - (1 - scale) ** 2));
            slot.figure.animate(now, 'stand', 0);
            const x = box.left;
            const y = size.y - box.bottom;
            renderer.setViewport(x, y, box.width, box.height);
            renderer.setScissor(x, y, box.width, box.height);
            slot.camera.aspect = box.width / box.height;
            slot.camera.updateProjectionMatrix();
            renderer.clearDepth();
            renderer.render(slot.scene, slot.camera);
        }
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, size.x, size.y);
        renderer.autoClear = autoClear;
    }

    function clear() {
        for (const slot of slots) {
            slot.until = -Infinity;
            slot.element.classList.remove('is-shown');
            slot.figure.root.visible = false;
        }
    }

    return { show, render, clear, get active() { return slots.some((slot) => slot.until > performance.now() / 1000); }, get turn() { return turn; } };
}
