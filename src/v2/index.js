// Realistic version ("V2"): everything visual lives here. The simulation,
// scoring and ranked replay stay in main.js and are shared with the classic
// version, so both versions play and rank identically.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createRider } from './rider.js';
import { createFx } from './fx.js';
import './hud.css';

const DAY_CYCLE_SECONDS = 600;

export function createRealisticVersion({ scene, renderer, camera, mobile }) {
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    document.body.classList.add('v2');
    const menuLogo = document.getElementById('menu-logo');
    if (menuLogo) {
        menuLogo.src = `${import.meta.env.BASE_URL}logo-51wheling.webp`;
        menuLogo.alt = '51Wheling';
    }

    const world = createWorld({ scene, renderer, mobile });
    const rider = createRider({ scene });
    const fx = createFx({ scene, mobile });

    const bikeVelocity = new THREE.Vector3();
    const lastPosition = new THREE.Vector3();
    const point = new THREE.Vector3();
    const viewport = new THREE.Vector2();
    let cameraRoll = 0;
    let cameraKick = 0;
    let wasAirborne = false;
    let peakAngle = 0;
    let highQuality = true;

    // Dynamic resolution: when frames take too long, render fewer pixels;
    // give them back when there is headroom. Measured over 1.5 s windows.
    const resolution = { base: renderer.getPixelRatio(), scale: 1, min: mobile ? 0.6 : 0.7, last: 0, total: 0, frames: 0 };
    function adaptResolution() {
        const now = performance.now();
        const delta = resolution.last ? now - resolution.last : 0;
        resolution.last = now;
        // Ignore pauses (menus, tab switches).
        if (delta <= 0 || delta > 250) return;
        resolution.total += delta;
        resolution.frames++;
        if (resolution.total < 1500) return;
        const average = resolution.total / resolution.frames;
        resolution.total = 0;
        resolution.frames = 0;
        let scale = resolution.scale;
        if (average > 22 && scale > resolution.min) scale = Math.max(resolution.min, scale * 0.85);
        else if (average < 15 && scale < 1) scale = Math.min(1, scale * 1.08);
        if (scale !== resolution.scale) {
            resolution.scale = scale;
            renderer.setPixelRatio(resolution.base * scale);
        }
    }

    function reset() {
        rider.reset();
        fx.clear();
        lastPosition.copy(rider.bikeGroup.position);
        bikeVelocity.set(0, 0, 0);
        cameraRoll = 0;
        cameraKick = 0;
        wasAirborne = false;
        world.setDusk(0);
    }

    function wheelPoint(localZ) {
        return rider.bikeGroup.localToWorld(point.set(0, 0, localZ));
    }

    // Called once per rendered frame, after the camera has been placed.
    function frame(dt, snapshot) {
        if (dt > 0) adaptResolution();
        const bike = rider.bikeGroup;
        if (dt > 0) {
            bikeVelocity.subVectors(bike.position, lastPosition).divideScalar(dt);
            bikeVelocity.y = 0;
        }
        lastPosition.copy(bike.position);

        // Golden hour drifting to night and back.
        const phase = (snapshot.gameTime % DAY_CYCLE_SECONDS) / DAY_CYCLE_SECONDS;
        world.setDusk((0.5 - 0.5 * Math.cos(phase * Math.PI * 2)) * 0.9);

        if (rider.crashing) {
            if (rider.slideSpeed() > 3 && Math.random() < 0.7) {
                fx.spark(point.copy(bike.position).setY(0.08), bikeVelocity, highQuality ? 3 : 1);
            }
        } else {
            rider.update(dt, snapshot);
            const airborne = snapshot.angleRatio > 0.015;
            if (snapshot.kmh > 22 && !snapshot.skidding) {
                const amount = Math.min(1, snapshot.kmh / 150) * (highQuality ? 120 : 45);
                fx.spray(wheelPoint(-0.72), bikeVelocity, amount, dt);
                if (!airborne) fx.spray(wheelPoint(0.73), bikeVelocity, amount * 0.35, dt);
            }
            if (snapshot.angleRatio > 0.93 && snapshot.kmh > 10) {
                fx.spark(wheelPoint(-1.05).setY(0.06), bikeVelocity, highQuality ? 2 : 1);
            }
            if (airborne) peakAngle = Math.max(peakAngle, snapshot.angleRatio);
            if (!airborne && wasAirborne) {
                cameraKick = Math.min(0.5, 0.12 + peakAngle * 0.4);
                peakAngle = 0;
            }
            wasAirborne = airborne;
        }

        // Camera: bank gently with the bike, thump on landings.
        cameraRoll += (-bike.rotation.z * 0.16 * (snapshot.linear ? 1 : 0) - cameraRoll) * Math.min(1, dt * 5);
        cameraKick *= Math.exp(-dt * 9);
        camera.rotateZ(rider.crashing ? 0 : cameraRoll);
        camera.position.y -= cameraKick * 0.5;

        world.update(camera, bike.position);
        renderer.getDrawingBufferSize(viewport);
        fx.update(dt, camera, viewport.y);
    }

    function setQuality(high) {
        highQuality = high;
        world.setQuality(high);
        resolution.base = renderer.getPixelRatio();
        resolution.scale = 1;
    }

    return {
        world, rider, fx, frame, reset, setQuality,
        get resolutionScale() { return resolution.scale; },
        smoke: () => fx.smoke(rider.bikeGroup.position, bikeVelocity),
        spark: () => fx.spark(point.copy(rider.bikeGroup.position).setY(0.08), bikeVelocity, 2)
    };
}
