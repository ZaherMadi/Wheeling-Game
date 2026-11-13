// Free roam for the realistic version: traffic and pedestrians, side
// streets to turn into (a new street each time), and getting off the bike
// to walk, take a parked car (unlocked with points) or ride again.
import * as THREE from 'three';
import { createTraffic } from './traffic.js';
import { createPeople } from './people.js';
import { CAR_NAMES, CAR_UNLOCKS } from './cars.js';

const POINTS_KEY = 'wheelie_total_points';
const STREETS = [
    'Avenue du 51', 'Rue de la Paix', 'Boulevard Haussmann', 'Rue des Lilas', 'Avenue des Fleurs', 'Rue du Marché',
    'Boulevard du Soleil', 'Rue Victor Hugo', 'Avenue de la Gare', 'Rue des Artistes', 'Quai des Brumes', 'Rue Lafayette'
];
const SIDE_STREET_HALF = 4.4;
const WALK_SPEED = 0.085;
const CAR_TOP_SPEED = 1.25;

export function totalPoints() {
    try {
        return Number(localStorage.getItem(POINTS_KEY)) || 0;
    } catch {
        return 0;
    }
}

export function addPoints(points) {
    try {
        localStorage.setItem(POINTS_KEY, String(totalPoints() + Math.max(0, Math.floor(points))));
    } catch {
        // Not saved.
    }
}

export function createFreeRoam({ scene, world, rider, audio, onTurn }) {
    const traffic = createTraffic({
        scene, world,
        onHonk: (pan) => audio.play('horn_distant', { volume: 0.55, pan, rate: 1.1 + Math.random() * 0.2 })
    });
    const people = createPeople({ scene });
    const focus = new THREE.Vector3();
    const walker = { x: 0, z: 0, yaw: Math.PI, speed: 0 };
    const drive = { group: null, model: null, speed: 0, yaw: Math.PI };
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

    function clampBike(position, previous) {
        constrain(position, 9, 0.6);
        if (traffic.hitTest(position.x, position.z, 0.6)) {
            position.copy(previous);
            return true;
        }
        return false;
    }

    // nx, nz: stick direction (-1..1), nz < 0 is forward.
    function move(dt, nx, nz) {
        if (mode === 'walk') {
            const length = Math.min(1, Math.hypot(nx, nz));
            walker.speed = length * WALK_SPEED;
            if (length > 0.05) walker.yaw = Math.atan2(nx, nz);
            walker.x += Math.sin(walker.yaw) * walker.speed;
            walker.z += Math.cos(walker.yaw) * walker.speed;
            const position = new THREE.Vector3(walker.x, 0, walker.z);
            constrain(position, 19.4, 0);
            walker.x = position.x;
            walker.z = position.z;
        } else if (mode === 'car') {
            const throttle = -nz;
            drive.speed += throttle * (throttle * drive.speed < 0 ? 0.04 : 0.012);
            drive.speed *= 0.992;
            if (Math.abs(throttle) < 0.05) drive.speed *= 0.985;
            drive.speed = Math.max(-0.4, Math.min(CAR_TOP_SPEED, drive.speed));
            const grip = Math.min(1, Math.abs(drive.speed) / 0.5);
            drive.yaw -= nx * 0.032 * grip * Math.sign(drive.speed || 1);
            const group = drive.group;
            const previous = group.position.clone();
            group.position.x += Math.sin(drive.yaw) * drive.speed;
            group.position.z += Math.cos(drive.yaw) * drive.speed;
            group.rotation.y = drive.yaw;
            constrain(group.position, 8.4, 1.2);
            const hit = traffic.hitTest(group.position.x, group.position.z, 1.4);
            if (hit) {
                group.position.copy(previous);
                if (Math.abs(drive.speed) > 0.3) audio.play('collision', { volume: 0.4 });
                drive.speed *= -0.25;
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
        if (bike && here.distanceTo(bike.position) < 3.6) return { kind: 'bike' };
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

    function action() {
        if (turning) return;
        if (mode === 'bike') {
            // Step off to the right of the bike.
            const yaw = bike.rotation.y;
            walker.x = bike.position.x + Math.cos(yaw) * 1.6;
            walker.z = bike.position.z - Math.sin(yaw) * 1.6;
            walker.yaw = yaw;
            walker.speed = 0;
            rider.dismount(walker.x, walker.z, walker.yaw);
            mode = 'walk';
            audio.play('ui_click', { volume: 0.4 });
        } else if (mode === 'car') {
            const group = drive.group;
            const yaw = drive.yaw;
            walker.x = group.position.x + Math.cos(yaw) * 2.4;
            walker.z = group.position.z - Math.sin(yaw) * 2.4;
            walker.yaw = yaw;
            dropped.push({ group, model: drive.model });
            drive.group = null;
            rider.dismount(walker.x, walker.z, walker.yaw);
            mode = 'walk';
            audio.play('brake', { volume: 0.25 });
        } else {
            const ride = nearestRide();
            if (!ride) return;
            if (ride.kind === 'bike') {
                rider.mount();
                mode = 'bike';
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
                mode = 'car';
                audio.play('rev_blip', { volume: 0.6, rate: 0.75 });
            }
        }
        prompt = null;
        refreshPrompt();
    }

    function update(dt, bikeGroup) {
        bike = bikeGroup;
        const here = getFocus();
        const blockers = [{ x: here.x, z: here.z }];
        if (mode !== 'bike') blockers.push({ x: bike.position.x, z: bike.position.z });
        traffic.update(dt, here, blockers);
        people.update(dt, here);
        if (mode === 'walk') rider.updateWalk(dt, walker.x, walker.z, walker.yaw, walker.speed);
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
        mode = 'bike';
        turning = false;
        if (drive.group) scene.remove(drive.group);
        drive.group = null;
        for (const car of dropped) scene.remove(car.group);
        dropped.length = 0;
        traffic.clear();
        people.clear();
        prompt = null;
        emit('', false);
    }

    return {
        move, update, action, clampBike, afterTurn, reset,
        get mode() { return mode; },
        get focus() { return getFocus(); },
        get speed() { return mode === 'walk' ? walker.speed : mode === 'car' ? Math.abs(drive.speed) : 0; },
        get carYaw() { return drive.yaw; }
    };
}
