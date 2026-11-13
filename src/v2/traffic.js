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
        car.group.position.set(car.lane.x, 0, focusZ + (ahead ? -distance : distance * 0.6));
        car.group.rotation.y = car.lane.dir < 0 ? Math.PI : 0;
    }

    function ensure(focusZ) {
        while (cars.length < count) {
            const model = pick(world.carModels.filter((name) => name !== 'coupe' || Math.random() < 0.3));
            const group = world.createCar(model, pick(CAR_PAINTS));
            scene.add(group);
            const car = { group, lane: LANES[0], speed: 0, cruise: 0, honked: false };
            place(car, focusZ, true);
            cars.push(car);
        }
    }

    // blockers: [{ x, z }] the player's bike, walker or car.
    function update(dt, focus, blockers) {
        ensure(focus.z);
        for (const car of cars) {
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
            const target = gap < 7 ? 0 : gap < 22 ? car.cruise * (gap - 7) / 15 : car.cruise;
            car.speed += (target - car.speed) * Math.min(1, dt * (target < car.speed ? 4 : 1.2));
            car.group.position.z += lane.dir * car.speed * dt;
            if (player && gap < 12 && !car.honked) {
                car.honked = true;
                onHonk?.(Math.max(-1, Math.min(1, (lane.x - focus.x) / 8)));
            }
            if (!player) car.honked = false;
            // Out of range: back into play on the other side.
            const offset = car.group.position.z - focus.z;
            if (offset > 90 || offset < -260) place(car, focus.z, false);
        }
    }

    function respawn(focusZ) {
        for (const car of cars) place(car, focusZ, true);
    }

    function clear() {
        for (const car of cars) scene.remove(car.group);
        cars.length = 0;
    }

    function hitTest(x, z, radius) {
        return cars.find((car) => Math.abs(car.group.position.x - x) < 1.1 + radius &&
            Math.abs(car.group.position.z - z) < car.group.userData.length / 2 + radius);
    }

    return { update, respawn, clear, hitTest, get cars() { return cars; } };
}
