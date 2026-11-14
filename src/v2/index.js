// Realistic version ("V2"): everything visual lives here. The simulation,
// scoring and ranked replay stay in main.js and are shared with the classic
// version, so both versions play and rank identically.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { ROAM_SCALE, createRider } from './rider.js';
import { createAdScreen } from './adscreen.js';
import { createFx } from './fx.js';
import { loadLivery, mountLiveryPanel } from './livery.js';
import { createFreeRoam } from './freeroam.js';
import { decoratePoliceCar } from './police.js';
import { installRacingUI } from '../ui/ui.js';

const DAY_CYCLE_SECONDS = 600;

export function createRealisticVersion({ scene, renderer, camera, mobile, audio, onTurn, playerVoice = null }) {
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    document.body.classList.add('v2');
    installRacingUI();
    const menuLogo = document.getElementById('menu-logo');
    if (menuLogo) {
        menuLogo.src = `${import.meta.env.BASE_URL}logo-51wheling.webp`;
        menuLogo.alt = '51Wheling';
    }

    const world = createWorld({ scene, renderer, mobile });
    // Debug and tuning: ?ambience=golden|day|overcast|night, ?seed=123
    // (same sequence of blocks on every run).
    const params = new URLSearchParams(window.location.search);
    if (params.has('ambience')) world.setAmbience(params.get('ambience'));
    const seed = params.has('seed') ? Number(params.get('seed')) : null;
    if (seed !== null) world.reseed(seed);
    const rider = createRider({ scene });
    const fx = createFx({ scene, mobile });
    const roam = createFreeRoam({ scene, world, rider, audio, onTurn, playerVoice });
    // The player's nickname is printed above the number.
    const riderName = () => {
        try {
            return localStorage.getItem('wheelie_nickname') || '';
        } catch {
            return '';
        }
    };
    rider.setLivery({ ...loadLivery(), name: riderName() });
    mountLiveryPanel(document.getElementById('rider-options'), (livery) => {
        rider.setLivery({ ...livery, name: riderName() });
        // The menu is a still frame: show the new look at once.
        renderer.render(scene, camera);
    });
    document.addEventListener('wheelie:nickname', () => {
        rider.setLivery({ ...loadLivery(), name: riderName() });
        renderer.render(scene, camera);
    });

    // The 5HC intro on the bus shelter in front of the start.
    const adScreen = createAdScreen({ scene });
    function startAd() {
        const bike = rider.bikeGroup;
        // Ahead of the bike: -z in races, either way in free roam.
        const forward = Math.cos(bike.rotation.y) < 0 ? -1 : 1;
        // Shelters on the rider's right face the rider coming towards them:
        // right-hand ones (side 1) face +z, left-hand ones (side -1) face -z.
        const side = forward < 0 ? 1 : -1;
        const ahead = world.busShelters()
            .filter((s) => s.side === side && (s.z - bike.position.z) * forward > 24 && (s.z - bike.position.z) * forward < 60)
            .sort((a, b) => (a.z - b.z) * forward)[0];
        // A shelter close enough to be seen from the start, or a screen on a post.
        if (ahead) adScreen.show(ahead.x, ahead.y, ahead.z - forward * 0.03, -forward, false);
        else adScreen.show(13.5 * side, 3.3, bike.position.z + forward * 24, -forward, true);
    }

    const bikeVelocity = new THREE.Vector3();
    const lastPosition = new THREE.Vector3();
    const point = new THREE.Vector3();
    const viewport = new THREE.Vector2();
    let cameraRoll = 0;
    let cameraKick = 0;
    let wasAirborne = false;
    let wasJumping = false;
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

    // Races: the patrol car that comes for a rider going too slowly. It rolls
    // up from behind in the next lane, then cuts in ahead to stop the bike.
    let patrol = null;
    function patrolCar() {
        if (!patrol) {
            const group = world.createCar('sedan', 0xf4f4f2);
            decoratePoliceCar(group);
            group.scale.setScalar(1.3);
            group.visible = false;
            scene.add(group);
            patrol = { group, time: 0, side: 1, stopping: false, t: 0, from: new THREE.Vector3(), fromYaw: Math.PI };
        }
        return patrol;
    }

    function updatePatrol(dt, progress) {
        if (patrol && patrol.stopping) {
            const p = patrol;
            p.time += dt;
            p.t = Math.min(1, p.t + dt / 0.9);
            const ease = 1 - Math.pow(1 - p.t, 3);
            const b = rider.bikeGroup.position;
            p.group.position.set(
                p.from.x + (b.x + p.side * 1.6 - p.from.x) * ease, 0,
                p.from.z + (b.z - 7.5 - p.from.z) * ease);
            p.group.rotation.y = p.fromYaw + p.side * 0.65 * ease;
            p.group.userData.flash(p.time);
            return;
        }
        if (progress === null || progress === undefined) {
            if (patrol) patrol.group.visible = false;
            return;
        }
        const p = patrolCar();
        const b = rider.bikeGroup.position;
        // On the roomier side of the road.
        if (!p.group.visible) p.side = b.x > 0 ? -1 : 1;
        p.time += dt;
        p.group.visible = true;
        // Out of sight behind the camera at first, alongside at the end.
        p.group.position.set(b.x + p.side * 4.4, 0, b.z + 20 - progress * 23);
        p.group.rotation.y = Math.PI;
        p.group.userData.flash(p.time);
    }

    function policeStop() {
        const p = patrolCar();
        if (!p.group.visible) {
            // Not seen coming (should not happen): start from just behind.
            const b = rider.bikeGroup.position;
            p.side = b.x > 0 ? -1 : 1;
            p.group.position.set(b.x + p.side * 4.4, 0, b.z + 6);
            p.group.rotation.y = Math.PI;
            p.group.visible = true;
        }
        p.stopping = true;
        p.t = 0;
        p.from.copy(p.group.position);
        p.fromYaw = p.group.rotation.y;
    }

    function reset() {
        if (seed !== null) world.reseed(seed);
        if (patrol) {
            patrol.stopping = false;
            patrol.group.visible = false;
        }
        roam.reset();
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
        // Races keep the arcade-size bike; free roam is life size.
        rider.setWorldScale(snapshot.linear ? 1.7 : ROAM_SCALE);
        // A confiscated bike is gone from free roam (never from races).
        if (dt > 0) adaptResolution();
        const bike = rider.bikeGroup;
        bike.visible = (snapshot.linear || roam.bikeVisible) && !snapshot.blink;
        adScreen.update(roam.mode === 'bike' || snapshot.linear ? bike.position : roam.focus);
        if (dt > 0) {
            bikeVelocity.subVectors(bike.position, lastPosition).divideScalar(dt);
            bikeVelocity.y = 0;
        }
        lastPosition.copy(bike.position);

        // Golden hour drifting to night and back.
        const phase = (snapshot.gameTime % DAY_CYCLE_SECONDS) / DAY_CYCLE_SECONDS;
        world.setDusk((0.5 - 0.5 * Math.cos(phase * Math.PI * 2)) * 0.9);

        // Boost flames: from the bike's exhaust, or the back of the car.
        const roamCar = roam.carRear;
        if (snapshot.boosting && !rider.crashing) {
            if (roamCar) {
                point.set(roamCar.x, 0.45, roamCar.z);
                fx.flame(point, -Math.sin(roamCar.yaw), -Math.cos(roamCar.yaw), bikeVelocity.set(0, 0, 0), 5);
            } else if (roam.mode === 'bike') {
                rider.exhaustPoint(point);
                const yaw = bike.rotation.y;
                fx.flame(point, -Math.sin(yaw), -Math.cos(yaw), bikeVelocity, highQuality ? 5 : 3);
            }
        }
        rider.setBoost(snapshot.boosting && roam.mode === 'bike' ? 1 : 0);
        if (rider.crashing) {
            if (rider.slideSpeed() > 3 && Math.random() < 0.7) {
                fx.spark(point.copy(bike.position).setY(0.08), bikeVelocity, highQuality ? 3 : 1);
            }
        } else if (roam.mode !== 'bike') {
            // On foot or in a car: the rider is driven by free roam.
        } else {
            rider.update(dt, snapshot);
            const airborne = snapshot.angleRatio > 0.015;
            if (snapshot.kmh > 22 && !snapshot.skidding && !snapshot.airborne) {
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
            // Touching down after a ramp jump: thump and spray.
            if (!snapshot.airborne && wasJumping) {
                cameraKick = 0.55;
                fx.spray(wheelPoint(-0.72), bikeVelocity, 260, 1 / 30);
                fx.spray(wheelPoint(0.73), bikeVelocity, 160, 1 / 30);
            }
            wasJumping = snapshot.airborne;
        }

        // Camera: bank gently with the bike, thump on landings.
        cameraRoll += (-bike.rotation.z * 0.16 * (snapshot.linear ? 1 : 0) - cameraRoll) * Math.min(1, dt * 5);
        cameraKick *= Math.exp(-dt * 9);
        camera.rotateZ(rider.crashing ? 0 : cameraRoll);
        camera.position.y -= cameraKick * 0.5;

        updatePatrol(dt, snapshot.linear ? snapshot.police : null);
        const roaming = snapshot.playing && !snapshot.linear;
        if (roaming) roam.update(dt, bike);
        world.update(camera, roaming ? roam.focus : bike.position);
        renderer.getDrawingBufferSize(viewport);
        fx.update(dt, camera, viewport.y);
    }

    // Rider screen: slow orbit around the rider, framed in the part of the
    // screen the options panel leaves free (on its left in landscape, above
    // it in portrait), close enough to see the look, never cut off.
    let showroomFrame = null;
    const savedPosition = new THREE.Vector3();
    const savedQuaternion = new THREE.Quaternion();
    const look = new THREE.Vector3();
    const SUBJECT_RADIUS = 2.6;
    const SUBJECT_HEIGHT = 1.45;
    function freeArea() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const panel = document.querySelector('#rider-screen .rider-panel')?.getBoundingClientRect();
        if (!panel || !panel.width) return { width, height, x0: 0, x1: width, y0: 0, y1: height };
        if (height > width) {
            // Portrait: above the panel (at least the top 40 % of the screen).
            return { width, height, x0: 0, x1: width, y0: 0, y1: Math.max(height * 0.4, panel.top - 6) };
        }
        return { width, height, x0: 0, x1: Math.max(width * 0.4, panel.left - 6), y0: 0, y1: height };
    }

    function frameShowroom(angle) {
        const area = freeArea();
        const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        // Half-angles of the free area as seen from the camera.
        const halfV = Math.atan(halfTan * (area.y1 - area.y0) / area.height);
        const halfH = Math.atan(halfTan * camera.aspect * (area.x1 - area.x0) / area.width);
        const distance = Math.max(5.4, SUBJECT_RADIUS / Math.sin(Math.min(halfV, halfH)));
        const b = rider.bikeGroup.position;
        camera.position.set(
            b.x + Math.sin(angle) * distance,
            SUBJECT_HEIGHT + 0.6 * distance / 5.4,
            b.z + Math.cos(angle) * distance);
        look.set(b.x, SUBJECT_HEIGHT, b.z);
        camera.lookAt(look);
        // The rider drawn at the centre of the free area, not of the screen.
        const centreX = (area.x0 + area.x1) / 2;
        const centreY = (area.y0 + area.y1) / 2;
        camera.setViewOffset(area.width, area.height, area.width / 2 - centreX, area.height / 2 - centreY, area.width, area.height);
    }

    function showroom(on) {
        if (on && showroomFrame === null) {
            savedPosition.copy(camera.position);
            savedQuaternion.copy(camera.quaternion);
            let angle = 0.9;
            const tick = () => {
                angle += 0.0045;
                frameShowroom(angle);
                renderer.render(scene, camera);
                showroomFrame = requestAnimationFrame(tick);
            };
            tick();
        } else if (!on && showroomFrame !== null) {
            cancelAnimationFrame(showroomFrame);
            showroomFrame = null;
            camera.clearViewOffset();
            camera.position.copy(savedPosition);
            camera.quaternion.copy(savedQuaternion);
            renderer.render(scene, camera);
        }
    }

    function setQuality(high) {
        highQuality = high;
        world.setQuality(high);
        resolution.base = renderer.getPixelRatio();
        resolution.scale = 1;
    }

    return {
        world, rider, fx, roam, frame, reset, setQuality, showroom, startAd, adScreen, policeStop,
        get resolutionScale() { return resolution.scale; },
        smoke: () => fx.smoke(rider.bikeGroup.position, bikeVelocity),
        spark: () => fx.spark(point.copy(rider.bikeGroup.position).setY(0.08), bikeVelocity, 2)
    };
}
