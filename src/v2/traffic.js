// Free roam traffic: cars driving both ways on the avenue's four lanes.
// They keep their distance, stop behind the player and honk, and are
// recycled around the player so the street always looks busy.
import { CAR_PAINTS } from './cars.js';

const LANES = [
    { x: 2.6, dir: -1 }, { x: 7.3, dir: -1 },
    { x: -2.6, dir: 1 }, { x: -7.3, dir: 1 }
];

export function createTraffic({ scene, world, onHonk }) {
    const cars = [];
    const count = 9;
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const range = (min, max) => min + Math.random() * (max - min);

    function place(car, focusZ, initial) {
        car.lane = pick(LANES);
        car.cruise = range(13, 26);
        car.speed = car.cruise;
        car.honked = false;
        // Most cars appear ahead; a few come from behind and overtake.
        const ahead = initial ? Math.random() < 0.75 : Math.random() < 0.85;
        const distance = initial ? range(25, 190) : range(150, 200);
        // From behind: within 90 m, or it would be recycled at once.
        car.group.position.set(car.lane.x, 0, focusZ + (ahead ? -distance : distance * 0.4));
        car.group.rotation.y = car.lane.dir < 0 ? Math.PI : 0;
    }

    function ensure(focusZ) {
        while (cars.filter((car) => !car.special).length < count) {
            const model = pick(world.carModels.filter((name) => name !== 'coupe' || Math.random() < 0.3));
            const group = world.createCar(model, pick(CAR_PAINTS));
            scene.add(group);
            const car = { group, lane: LANES[0], speed: 0, cruise: 0, honked: false };
            place(car, focusZ, true);
            cars.push(car);
        }
    }

    // blockers: [{ x, z }] the player's bike, walker or car.
    const gone = [];
    function update(dt, focus, blockers) {
        ensure(focus.z);
        for (const car of cars) {
            // The police car in a chase drives itself (police.js).
            if (car.chasing) continue;
            const { lane } = car;
            const z = car.group.position.z;
            // Gap to whatever is ahead in the lane.
            let gap = Infinity;
            let player = false;
            for (const other of cars) {
                if (other === car || other.lane !== lane) continue;
                const d = (other.group.position.z - z) * lane.dir;
                if (d > 0 && d < gap) gap = d;
            }
            for (const blocker of blockers) {
                if (Math.abs(blocker.x - lane.x) > 1.9) continue;
                const d = (blocker.z - z) * lane.dir;
                if (d > 0 && d < gap) {
                    gap = d;
                    player = true;
                }
            }
            let target = gap < 7 ? 0 : gap < 22 ? car.cruise * (gap - 7) / 15 : car.cruise;
            // A car told to stop (the police pulling over) stays put.
            if (car.hold) target = 0;
            const slowing = target < car.speed - 0.5;
            car.speed += (target - car.speed) * Math.min(1, dt * (target < car.speed ? 4 : 1.2));
            // Brake lights while slowing down or standing in traffic.
            car.group.userData.lights?.set(slowing || (car.speed < 0.5 && (car.hold || gap < 9)), false);
            car.group.position.z += lane.dir * car.speed * dt;
            if (player && gap < 12 && !car.honked) {
                car.honked = true;
                onHonk?.(Math.max(-1, Math.min(1, (lane.x - focus.x) / 8)));
            }
            if (!player) car.honked = false;
            // Out of range: back into play on the other side.
            const offset = car.group.position.z - focus.z;
            if (offset > 90 || offset < -260) {
                // A patrol car that has pulled someone over stays until it is done.
                if (car.special) {
                    if (!car.hold) gone.push(car);
                }
                else place(car, focus.z, false);
            }
        }
        gone.forEach(leave);
        gone.length = 0;
    }

    // Extra cars driven by other systems (the police): they come from a
    // distance like the others, then leave for good once out of range.
    function add(group, extra = {}) {
        scene.add(group);
        const car = { group, lane: LANES[0], speed: 0, cruise: 0, honked: false, special: true, hold: false, ...extra };
        place(car, extra.focusZ ?? group.position.z, false);
        car.cruise = range(17, 24);
        car.speed = car.cruise;
        cars.push(car);
        return car;
    }

    function leave(car) {
        const index = cars.indexOf(car);
        if (index >= 0) cars.splice(index, 1);
        scene.remove(car.group);
        car.onLeave?.();
    }

    function respawn(focusZ) {
        for (const car of cars.filter((other) => other.special)) leave(car);
        for (const car of cars) place(car, focusZ, true);
    }

    function clear() {
        for (const car of cars.filter((other) => other.special)) leave(car);
        for (const car of cars) scene.remove(car.group);
        cars.length = 0;
    }

    function hitTest(x, z, radius) {
        return cars.find((car) => Math.abs(car.group.position.x - x) < 1.1 + radius &&
            Math.abs(car.group.position.z - z) < car.group.userData.length / 2 + radius);
    }

    // Moves `position` out of any car it overlaps, along the shortest way.
    // Returns the car it was pushed out of (null if none).
    function pushOut(position, radius) {
        let moved = null;
        for (const car of cars) {
            const dx = position.x - car.group.position.x;
            const dz = position.z - car.group.position.z;
            const px = 1.1 + radius - Math.abs(dx);
            const pz = car.group.userData.length / 2 + radius - Math.abs(dz);
            if (px <= 0 || pz <= 0) continue;
            if (px < pz) position.x += (dx >= 0 ? 1 : -1) * (px + 0.02);
            else position.z += (dz >= 0 ? 1 : -1) * (pz + 0.02);
            moved = car;
        }
        return moved;
    }

    return { update, respawn, clear, hitTest, pushOut, add, leave, get cars() { return cars; } };
}
