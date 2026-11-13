// Free roam for the realistic version: traffic and pedestrians, side
// streets to turn into (a new street each time), and getting off the bike
// to walk, take a parked car (unlocked with points) or ride again.
import * as THREE from 'three';
import { createTraffic } from './traffic.js';
import { createPeople } from './people.js';
import { createPolicePatrol } from './police.js';
import { createStreetTalk } from './street-talk.js';
import { CAR_NAMES, CAR_UNLOCKS } from './cars.js';

const POINTS_KEY = 'wheelie_total_points';
// Fines (police) are kept apart, so the server total can still raise the
// points earned without wiping them out.
const PENALTY_KEY = 'wheelie_points_penalty';
// Fined with no points left: two warnings, the third time the police take
// the bike (free roam only; 100 points in a competitive run bring it back).
const STRIKES_KEY = 'wheelie_zero_strikes';
const CONFISCATED_KEY = 'wheelie_bike_confiscated';
export const BIKE_RECOVERY_POINTS = 100;
const STREETS = [
    'Avenue du 51', 'Rue de la Paix', 'Boulevard Haussmann', 'Rue des Lilas', 'Avenue des Fleurs', 'Rue du Marché',
    'Boulevard du Soleil', 'Rue Victor Hugo', 'Avenue de la Gare', 'Rue des Artistes', 'Quai des Brumes', 'Rue Lafayette'
];
const SIDE_STREET_HALF = 4.4;
// On foot at life size (the rider used to be 1.7x bigger and faster).
const WALK_SPEED = 0.065;
const RUN_SPEED = 0.16;
const CAR_TOP_SPEED = 1.25;
// Free roam boost: once every 15 s, for 2.5 s.
const BOOST_COOLDOWN = 15;
const BOOST_TIME = 2.5;

function stored(key) {
    try {
        return Number(localStorage.getItem(key)) || 0;
    } catch {
        return 0;
    }
}

export function totalPoints() {
    return Math.max(0, stored(POINTS_KEY) - stored(PENALTY_KEY));
}

export function addPoints(points) {
    try {
        localStorage.setItem(POINTS_KEY, String(stored(POINTS_KEY) + Math.max(0, Math.floor(points))));
    } catch {
        // Not saved.
    }
}

// Police fine in free roam: never below zero (no hidden debt).
export function finePoints(points) {
    const applied = Math.min(totalPoints(), Math.max(0, Math.floor(points)));
    try {
        localStorage.setItem(PENALTY_KEY, String(stored(PENALTY_KEY) + applied));
    } catch {
        // Not saved.
    }
    document.dispatchEvent(new CustomEvent('wheelie:points'));
    return applied;
}

function save(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, String(value));
    } catch {
        // Not saved.
    }
}

export function bikeConfiscated() {
    try {
        return localStorage.getItem(CONFISCATED_KEY) === '1';
    } catch {
        return false;
    }
}

// A competitive run of 100 points or more: the bike is back.
export function releaseBike() {
    if (!bikeConfiscated()) return false;
    save(CONFISCATED_KEY, null);
    save(STRIKES_KEY, null);
    document.dispatchEvent(new CustomEvent('wheelie:points'));
    return true;
}

function notice(title, text, seconds = 7) {
    document.dispatchEvent(new CustomEvent('wheelie:notice', { detail: { title, text, seconds } }));
}

// The server keeps each player's total: never show less than that.
export function syncPoints(serverTotal) {
    const total = Math.floor(Number(serverTotal) || 0);
    if (total <= stored(POINTS_KEY)) return;
    try {
        localStorage.setItem(POINTS_KEY, String(total));
    } catch {
        return;
    }
    document.dispatchEvent(new CustomEvent('wheelie:points'));
}

export function createFreeRoam({ scene, world, rider, audio, onTurn, playerVoice = null }) {
    const traffic = createTraffic({
        scene, world,
        onHonk: (pan) => audio.play('horn_distant', { volume: 0.55, pan, rate: 1.1 + Math.random() * 0.2 })
    });
    const people = createPeople({ scene });
    const talk = createStreetTalk({ audio, people, playerVoice });
    let frozen = false;
    const toast = (title, text) => document.dispatchEvent(new CustomEvent('wheelie:toast', { detail: { title, text } }));
    // A fine and what it costs: cars that can no longer be driven, a
    // warning when there is nothing left to take, the bike the third time.
    function fine(points, reason) {
        const before = totalPoints();
        const applied = finePoints(points);
        const after = totalPoints();
        const lost = Object.entries(CAR_UNLOCKS)
            .filter(([, needed]) => needed > 0 && needed <= before && needed > after)
            .sort((a, b) => a[1] - b[1])
            .map(([model]) => model);
        let strikes = 0;
        let confiscate = false;
        if (before === 0) {
            strikes = stored(STRIKES_KEY) + 1;
            confiscate = strikes >= 3;
            save(STRIKES_KEY, confiscate ? 0 : strikes);
            toast('PLUS DE POINTS', confiscate ? 'La police confisque ta moto' : `Avertissement ${strikes}/3`);
        } else {
            toast(`-${applied} PTS`, reason === 'chase' ? 'Délit de fuite' : 'Mauvaise conduite');
            if (lost.length) setTimeout(() => toast(lost.map((model) => CAR_NAMES[model]).join(' + '), 'Plus assez de points pour la conduire'), 2700);
        }
        return { before, after, applied, lost, strikes, confiscate };
    }
    const patrol = createPolicePatrol({
        scene, world, traffic, audio, talk,
        onFine: fine,
        freezePlayer: (value) => { frozen = value; },
        onCaught: () => toast('RATTRAPÉ !', 'La police t\'arrête'),
        onEscape: () => toast('POLICE SEMÉE', 'Changement de rue'),
        confiscateBike: () => {
            save(CONFISCATED_KEY, 1);
            if (mode === 'bike') stepOff();
            notice('MOTO CONFISQUÉE', `Repasse par le mode compétitif et atteins ${BIKE_RECOVERY_POINTS} points pour récupérer ta moto dans le monde libre.`, 9);
            document.dispatchEvent(new CustomEvent('wheelie:points'));
        }
    });
    const focus = new THREE.Vector3();
    const walker = { x: 0, z: 0, yaw: Math.PI, speed: 0, y: 0, vy: 0, running: false, jumpHeld: false };
    const boost = { readyAt: 0, until: 0 };
    const now = () => performance.now() / 1000;
    const drive = { group: null, model: null, speed: 0, yaw: Math.PI, braking: false, reversing: false };
    const dropped = [];
    let mode = 'bike';
    let bike = null;
    let prompt = '';
    let turning = false;
    let lastStreet = STREETS[0];

    function emit(text, available) {
        if (text === prompt) return;
        prompt = text;
        document.dispatchEvent(new CustomEvent('wheelie:prompt', { detail: { text, available } }));
    }

    function sideStreetAt(z) {
        return world.crossings().find((cz) => Math.abs(z - cz) < SIDE_STREET_HALF) ?? null;
    }

    // Keeps a position on the road (or pavement when walking); side streets
    // open the way left and right.
    function constrain(position, limit, margin = 0) {
        const cross = sideStreetAt(position.z);
        if (cross !== null) {
            position.x = Math.max(-46, Math.min(46, position.x));
        } else {
            position.x = Math.max(-limit, Math.min(limit, position.x));
        }
        // Inside a side street: stay between its kerbs.
        if (Math.abs(position.x) > limit + 0.5) {
            const near = world.crossings().reduce((best, cz) => (Math.abs(cz - position.z) < Math.abs(best - position.z) ? cz : best), Infinity);
            if (Number.isFinite(near)) {
                position.z = Math.max(near - SIDE_STREET_HALF + margin, Math.min(near + SIDE_STREET_HALF - margin, position.z));
            }
        }
        if (!turning && Math.abs(position.x) > 30) {
            turning = true;
            onTurn(Math.sign(position.x));
        }
    }

    // Never ends up inside a car: pushed out of it instead of stuck.
    function clampBike(position) {
        constrain(position, 9, 0.6);
        const hit = traffic.pushOut(position, 0.6);
        if (hit) {
            constrain(position, 9, 0.6);
            if (hit.police) patrol.bumped(hit);
            else patrol.playerHit();
        }
        return hit;
    }

    function setMode(next) {
        mode = next;
        document.dispatchEvent(new CustomEvent('wheelie:controls', { detail: { mode } }));
    }

    // Boost in free roam: on the bike or in a car, every 15 s.
    function tryBoost() {
        if (mode === 'walk' || now() < boost.readyAt) return false;
        boost.until = now() + BOOST_TIME;
        boost.readyAt = now() + BOOST_COOLDOWN;
        audio.play('boost', { volume: 0.7 });
        audio.play('backfire', { volume: 0.5, delay: 0.1 });
        return true;
    }

    function boostState() {
        const t = now();
        return {
            active: t < boost.until,
            ready: mode !== 'walk' && t >= boost.readyAt,
            wait: Math.max(0, Math.ceil(boost.readyAt - t))
        };
    }

    // nx, nz: stick direction (-1..1), nz < 0 is forward.
    // keys: { run, jump } on foot.
    function move(dt, nx, nz, keys = {}) {
        // Stopped by the police: no control until they are done.
        if (frozen) {
            nx = 0;
            nz = 0;
            keys = {};
            if (mode === 'car') drive.speed *= 0.85;
        }
        if (mode === 'walk') {
            const length = Math.min(1, Math.hypot(nx, nz));
            walker.running = !!keys.run && length > 0.05;
            walker.speed = length * (walker.running ? RUN_SPEED : WALK_SPEED);
            if (length > 0.05) walker.yaw = Math.atan2(nx, nz);
            walker.x += Math.sin(walker.yaw) * walker.speed;
            walker.z += Math.cos(walker.yaw) * walker.speed;
            // Jump: one per press, only from the ground.
            if (keys.jump && !walker.jumpHeld && walker.y === 0) {
                walker.vy = 0.12;
                audio.play('ui_click', { volume: 0.25, rate: 0.7 });
            }
            walker.jumpHeld = !!keys.jump;
            if (walker.y > 0 || walker.vy > 0) {
                walker.y += walker.vy;
                walker.vy -= 0.0105;
                if (walker.y <= 0) {
                    walker.y = 0;
                    walker.vy = 0;
                    audio.play('landing', { volume: 0.12, rate: 1.6 });
                }
            }
            const position = new THREE.Vector3(walker.x, 0, walker.z);
            constrain(position, 19.4, 0);
            traffic.pushOut(position, 0.32);
            walker.x = position.x;
            walker.z = position.z;
        } else if (mode === 'car') {
            const throttle = -nz;
            drive.speed += throttle * (throttle * drive.speed < 0 ? 0.04 : 0.012);
            drive.speed *= 0.992;
            if (Math.abs(throttle) < 0.05) drive.speed *= 0.985;
            const boosting = now() < boost.until;
            if (boosting) drive.speed += 0.03;
            drive.speed = Math.max(-0.4, Math.min(CAR_TOP_SPEED * (boosting ? 1.6 : 1), drive.speed));
            // Lights: red when braking or backing up, white reversing lights.
            drive.reversing = drive.speed < -0.01;
            drive.braking = throttle * drive.speed < 0 && Math.abs(drive.speed) > 0.01;
            drive.group.userData.lights?.set(drive.braking || drive.reversing || (throttle < -0.05 && Math.abs(drive.speed) < 0.02), drive.reversing);
            const grip = Math.min(1, Math.abs(drive.speed) / 0.5);
            drive.yaw -= nx * 0.032 * grip * Math.sign(drive.speed || 1);
            const group = drive.group;
            const previous = group.position.clone();
            group.position.x += Math.sin(drive.yaw) * drive.speed;
            group.position.z += Math.cos(drive.yaw) * drive.speed;
            group.rotation.y = drive.yaw;
            constrain(group.position, 8.4, 1.2);
            void previous;
            const hit = traffic.pushOut(group.position, 1.4);
            if (hit) {
                if (hit.police) patrol.bumped(hit);
                else patrol.playerHit();
                if (Math.abs(drive.speed) > 0.3) audio.play('collision', { volume: 0.4 });
                drive.speed *= -0.25;
                constrain(group.position, 8.4, 1.2);
            }
        }
    }

    function getFocus() {
        if (mode === 'walk') return focus.set(walker.x, 0, walker.z);
        if (mode === 'car' && drive.group) return focus.copy(drive.group.position);
        return focus.copy(bike ? bike.position : focus);
    }

    // What the action button would do right now.
    function nearestRide() {
        const here = getFocus();
        if (bike && !bikeConfiscated() && here.distanceTo(bike.position) < 3.6) return { kind: 'bike' };
        const parked = world.parkedNear(here.x, here.z, 3.8);
        const droppedCar = dropped.find((car) => here.distanceTo(car.group.position) < 3.8);
        if (droppedCar) return { kind: 'dropped', car: droppedCar, model: droppedCar.model };
        if (parked) return { kind: 'parked', found: parked, model: parked.model };
        return null;
    }

    function lockLabel(model) {
        const needed = CAR_UNLOCKS[model] ?? 0;
        const have = totalPoints();
        return have >= needed ? null : `${CAR_NAMES[model]} : ${needed} pts (tu as ${have})`;
    }

    function refreshPrompt() {
        if (mode === 'bike') return emit('DESCENDRE', true);
        if (mode === 'car') return emit('SORTIR', true);
        const ride = nearestRide();
        if (!ride) return emit('', false);
        if (ride.kind === 'bike') return emit('MONTER SUR LA MOTO', true);
        const locked = lockLabel(ride.model);
        return emit(locked ? `🔒 ${locked}` : `CONDUIRE : ${CAR_NAMES[ride.model].toUpperCase()}`, !locked);
    }

    // Step off to the right of the bike.
    function stepOff() {
        const yaw = bike.rotation.y;
        walker.x = bike.position.x + Math.cos(yaw) * 1.1;
        walker.z = bike.position.z - Math.sin(yaw) * 1.1;
        walker.yaw = yaw;
        walker.speed = 0;
        rider.dismount(walker.x, walker.z, walker.yaw);
        walker.y = 0;
        walker.vy = 0;
        setMode('walk');
        prompt = null;
    }

    function action() {
        if (turning || frozen) return;
        if (mode === 'bike') {
            stepOff();
            audio.play('ui_click', { volume: 0.4 });
        } else if (mode === 'car') {
            const group = drive.group;
            const yaw = drive.yaw;
            walker.x = group.position.x + Math.cos(yaw) * 2.4;
            walker.z = group.position.z - Math.sin(yaw) * 2.4;
            walker.yaw = yaw;
            dropped.push({ group, model: drive.model });
            group.userData.lights?.set(false, false);
            drive.group = null;
            drive.reversing = false;
            drive.braking = false;
            audio.play('car_door', { volume: 0.45 });
            rider.dismount(walker.x, walker.z, walker.yaw);
            walker.y = 0;
            walker.vy = 0;
            setMode('walk');
            audio.play('brake', { volume: 0.25 });
        } else {
            const ride = nearestRide();
            if (!ride) return;
            if (ride.kind === 'bike') {
                rider.mount();
                setMode('bike');
                audio.play('rev_blip', { volume: 0.5 });
            } else {
                if (lockLabel(ride.model)) {
                    audio.play('brake', { volume: 0.2, rate: 1.6 });
                    return;
                }
                let group;
                if (ride.kind === 'dropped') {
                    group = ride.car.group;
                    dropped.splice(dropped.indexOf(ride.car), 1);
                } else {
                    world.takeParked(ride.found);
                    group = world.createCar(ride.model, ride.found.paint);
                    group.position.set(ride.found.x, 0, ride.found.z);
                    group.rotation.y = ride.found.yaw;
                    scene.add(group);
                }
                drive.group = group;
                drive.model = ride.model;
                drive.yaw = group.rotation.y;
                drive.speed = 0;
                rider.setRiderVisible(false);
                setMode('car');
                audio.play('car_door', { volume: 0.45 });
                audio.play('rev_blip', { volume: 0.6, rate: 0.75, delay: 0.35 });
            }
        }
        prompt = null;
        refreshPrompt();
    }

    let confiscationShown = false;
    function update(dt, bikeGroup) {
        bike = bikeGroup;
        // No bike while it is confiscated: on foot from the start.
        if (mode === 'bike' && bikeConfiscated() && !patrol.towing) {
            stepOff();
            if (!confiscationShown) notice('MOTO CONFISQUÉE', `Fais ${BIKE_RECOVERY_POINTS} points en mode compétitif pour la récupérer.`, 6);
        }
        confiscationShown = bikeConfiscated();
        const here = getFocus();
        const blockers = [{ x: here.x, z: here.z }, ...patrol.blockers()];
        if (mode !== 'bike') blockers.push({ x: bike.position.x, z: bike.position.z });
        traffic.update(dt, here, blockers);
        people.update(dt, here);
        talk.update(dt, mode, here);
        patrol.update(dt, here, { x: here.x, z: here.z, mode, radius: mode === 'car' ? 1.6 : mode === 'bike' ? 0.9 : 0.4 }, bike);
        if (mode === 'walk') rider.updateWalk(dt, walker.x, walker.z, walker.yaw, walker.speed, walker.y, walker.running);
        // Cars left behind on another block go away.
        for (let i = dropped.length - 1; i >= 0; i--) {
            if (Math.abs(dropped[i].group.position.z - here.z) > 300) {
                scene.remove(dropped[i].group);
                dropped.splice(i, 1);
            }
        }
        refreshPrompt();
    }

    // The world has been rebuilt as a new street along -z.
    function afterTurn(bikeGroup) {
        const here = getFocus();
        const z = here.z;
        if (mode === 'bike') {
            bikeGroup.position.set(4.5, 0, z);
            bikeGroup.rotation.set(0, Math.PI, 0);
        } else {
            bikeGroup.position.set(8.6, 0, z + 5);
            bikeGroup.rotation.set(0, Math.PI, 0);
            if (mode === 'walk') {
                walker.x = 13.5;
                walker.yaw = Math.PI;
            } else {
                drive.group.position.set(4.5, 0, z);
                drive.yaw = Math.PI;
                drive.group.rotation.y = Math.PI;
            }
        }
        for (const car of dropped) scene.remove(car.group);
        dropped.length = 0;
        patrol.reset();
        talk.reset();
        traffic.respawn(z);
        people.respawn(z);
        turning = false;
        let street = lastStreet;
        while (street === lastStreet) street = STREETS[Math.floor(Math.random() * STREETS.length)];
        lastStreet = street;
        return street;
    }

    function reset() {
        if (mode !== 'bike') rider.mount();
        setMode('bike');
        frozen = false;
        confiscationShown = false;
        boost.readyAt = 0;
        boost.until = 0;
        turning = false;
        if (drive.group) scene.remove(drive.group);
        drive.group = null;
        for (const car of dropped) scene.remove(car.group);
        dropped.length = 0;
        patrol.reset();
        talk.reset();
        traffic.clear();
        people.clear();
        prompt = null;
        emit('', false);
    }

    return {
        move, update, action, clampBike, afterTurn, reset, tryBoost, boostState,
        get boostFactor() { return now() < boost.until ? 2 : 1; },
        get carRear() {
            if (mode !== 'car' || !drive.group) return null;
            const g = drive.group;
            const back = -(g.userData.length / 2 + 0.1);
            return { x: g.position.x + Math.sin(drive.yaw) * back, z: g.position.z + Math.cos(drive.yaw) * back, yaw: drive.yaw };
        },
        get footSpeed() { return mode === 'walk' ? walker.speed / WALK_SPEED : 0; },
        get frozen() { return frozen; },
        // The bike is shown in free roam only when it is ours (or being taken away).
        get bikeVisible() { return !bikeConfiscated() || patrol.towing; },
        fine,
        get carModel() { return mode === 'car' ? drive.model : null; },
        get reversing() { return mode === 'car' && drive.reversing; },
        get braking() { return mode === 'car' && drive.braking; },
        patrol, talk, people, traffic,
        // Tests: the player's position on foot.
        debug: { walker, drive },
        get mode() { return mode; },
        get focus() { return getFocus(); },
        get speed() { return mode === 'walk' ? walker.speed : mode === 'car' ? Math.abs(drive.speed) : 0; },
        get carYaw() { return drive.yaw; }
    };
}
