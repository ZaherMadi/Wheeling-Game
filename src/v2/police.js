// Free roam police: a patrol car passes every 30 s to 3 min. Bump into it
// (on the bike or in a car) and it pulls over: two officers get out, walk up
// to you, fine you 100 points, then drive off.
import * as THREE from 'three';

const S = 1.02;
const range = (min, max) => min + Math.random() * (max - min);

let bandTexture = null;
function policeBand() {
    if (bandTexture) return bandTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#16307a';
    ctx.fillRect(0, 0, 1024, 96);
    ctx.fillStyle = '#f4f4f2';
    ctx.fillRect(0, 0, 1024, 8);
    ctx.fillStyle = '#d42a2a';
    ctx.fillRect(0, 84, 1024, 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 64px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('POLICE', 512, 48);
    bandTexture = new THREE.CanvasTexture(canvas);
    bandTexture.colorSpace = THREE.SRGBColorSpace;
    bandTexture.anisotropy = 4;
    return bandTexture;
}

let glowMap = null;
function glow() {
    if (glowMap) return glowMap;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    glowMap = new THREE.CanvasTexture(canvas);
    return glowMap;
}

// Livery and light bar on a sedan built by world.createCar.
export function decoratePoliceCar(group) {
    const { length, width, height } = group.userData;
    const bandMaterial = new THREE.MeshStandardMaterial({
        map: policeBand(), roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2
    });
    for (const side of [-1, 1]) {
        const band = new THREE.Mesh(new THREE.PlaneGeometry(length * 0.7, 0.3), bandMaterial);
        band.rotation.y = side * Math.PI / 2;
        band.position.set(side * (width / 2 + 0.015), 0.66, 0.05);
        group.add(band);
    }
    const dark = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.3), dark);
    base.position.set(0, height + 0.05, -0.2);
    group.add(base);
    const lamps = [];
    for (const side of [-1, 1]) {
        const material = new THREE.MeshBasicMaterial({ color: 0x0a1440 });
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.26), material);
        lamp.position.set(side * 0.29, height + 0.14, -0.2);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glow(), color: 0x2a5cff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0
        }));
        halo.position.set(side * 0.29, height + 0.2, -0.2);
        halo.scale.setScalar(2.2);
        group.add(lamp, halo);
        lamps.push({ material, halo });
    }
    // Alternating blue flashes.
    group.userData.flash = (time) => {
        const beat = Math.floor(time * 7) % 4;
        lamps.forEach(({ material, halo }, index) => {
            const on = index === 0 ? beat === 0 || beat === 1 : beat === 2 || beat === 3;
            material.color.set(on ? 0x3a6cff : 0x0a1440);
            halo.material.opacity = on ? 0.95 : 0;
        });
    };
    group.userData.police = true;
}

// An officer: stick figure in navy uniform and peaked cap (no face).
export function createOfficer(scene) {
    const navy = new THREE.MeshLambertMaterial({ color: 0x1b2740 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x24375c });
    const black = new THREE.MeshLambertMaterial({ color: 0x111214 });
    const skin = new THREE.MeshLambertMaterial({ color: [0xf1c8a8, 0xd9a07a, 0xa86b4a, 0x6e4430][Math.floor(Math.random() * 4)] });
    const white = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    const group = new THREE.Group();
    const add = (geometry, material, x, y, z, parent = group) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x * S, y * S, z * S);
        mesh.castShadow = true;
        parent.add(mesh);
        return mesh;
    };
    add(new THREE.CapsuleGeometry(0.18 * S, 0.42 * S, 4, 10), shirt, 0, 1.18, 0);
    add(new THREE.CylinderGeometry(0.185 * S, 0.185 * S, 0.06 * S, 14), black, 0, 0.97, 0);
    add(new THREE.BoxGeometry(0.06 * S, 0.07 * S, 0.02 * S), white, 0.08, 1.38, 0.17);
    add(new THREE.SphereGeometry(0.11 * S, 12, 10), skin, 0, 1.62, 0);
    // Peaked cap: crown, band, visor.
    add(new THREE.CylinderGeometry(0.135 * S, 0.11 * S, 0.07 * S, 16), navy, 0, 1.745, 0);
    add(new THREE.CylinderGeometry(0.113 * S, 0.113 * S, 0.035 * S, 16), black, 0, 1.7, 0);
    const visor = add(new THREE.BoxGeometry(0.17 * S, 0.012 * S, 0.09 * S), black, 0, 1.69, 0.12);
    visor.rotation.x = 0.2;
    const limb = (radius, length, material, x, y) => {
        const pivot = new THREE.Group();
        pivot.position.set(x * S, y * S, 0);
        group.add(pivot);
        const mesh = add(new THREE.CapsuleGeometry(radius * S, length * S, 4, 6), material, 0, -(length / 2 + radius), 0, pivot);
        return { pivot, mesh };
    };
    const legs = [-1, 1].map((side) => limb(0.077, 0.74, navy, side * 0.1, 0.94));
    legs.forEach(({ pivot }) => add(new THREE.BoxGeometry(0.12 * S, 0.075 * S, 0.24 * S), black, 0, -0.885, 0.045, pivot));
    const arms = [-1, 1].map((side) => limb(0.055, 0.56, shirt, side * 0.245, 1.43));
    // What the right hand can hold: a fine (paper) or a service weapon.
    const props = {
        paper: add(new THREE.BoxGeometry(0.16 * S, 0.21 * S, 0.008 * S), white, 0, -0.7, 0.05, arms[1].pivot),
        gun: (() => {
            const gun = new THREE.Group();
            gun.position.set(0, -0.69 * S, 0.06 * S);
            arms[1].pivot.add(gun);
            add(new THREE.BoxGeometry(0.035 * S, 0.05 * S, 0.17 * S), black, 0, 0, 0.06, gun);
            add(new THREE.BoxGeometry(0.03 * S, 0.1 * S, 0.04 * S), black, 0, -0.05, 0, gun);
            gun.rotation.x = Math.PI / 2;
            return gun;
        })()
    };
    props.paper.rotation.x = 0.4;
    Object.values(props).forEach((prop) => { prop.visible = false; });
    group.visible = false;
    scene.add(group);
    let phase = 0;
    return {
        group,
        hold(name) {
            Object.entries(props).forEach(([key, prop]) => { prop.visible = key === name; });
        },
        // moving: walking pace in units/s (0 standing). talking: hand
        // gestures. pose: 'ticket' (holding out the fine), 'gun' (aiming),
        // 'cuff' (both hands forward, on the wrists).
        animate(dt, moving, talking, time, pose = null) {
            phase += dt * moving * 3.4;
            const stride = moving > 0.1 ? Math.sin(phase) * 0.45 : 0;
            legs.forEach(({ pivot }, i) => { pivot.rotation.x = stride * (i ? 1 : -1); });
            arms.forEach(({ pivot }, i) => {
                pivot.rotation.x = talking && i === 1 ? -1.0 + Math.sin(time * 6) * 0.25 : -stride * (i ? 1 : -1) * 0.8;
                pivot.rotation.z = (i ? 1 : -1) * 0.08;
                if (pose === 'ticket' && i === 1) pivot.rotation.x = -1.15;
                if (pose === 'gun') {
                    pivot.rotation.x = -1.5;
                    pivot.rotation.z = (i ? 1 : -1) * -0.18;
                }
                if (pose === 'cuff') {
                    pivot.rotation.x = -0.75;
                    pivot.rotation.z = (i ? 1 : -1) * -0.25;
                }
            });
        }
    };
}

// What a fine leads to (see freeroam.js fine()): { before, applied, lost: [car models], strikes, confiscate }.
const LOST_LINES = { 'sedan,van': 'lost_sedan_van', sedan: 'lost_sedan', van: 'lost_van', suv: 'lost_suv', coupe: 'lost_coupe' };
const FLEE_DISTANCE = 20;
const CHASE_SHOUT_EVERY = 10;
const CHASE_FINE = 400; // in all, with the 100 of the first stop

export function createPolicePatrol({ scene, world, traffic, audio, talk, onFine, onCaught, onEscape, freezePlayer, confiscateBike }) {
    let group = null;
    let car = null;
    let clock = 0;
    let nextAt = range(30, 180);
    let sirenDone = false;
    let stop = null;
    const officers = [];
    const ahead = new THREE.Vector3();

    function spawn(focus) {
        if (!group) {
            group = world.createCar('sedan', 0xf4f4f2);
            decoratePoliceCar(group);
        }
        group.position.set(0, 0, focus.z);
        car = traffic.add(group, {
            police: true,
            focusZ: focus.z,
            onLeave: () => {
                car = null;
                stop = null;
                hideOfficers();
                nextAt = clock + range(30, 180);
            }
        });
        sirenDone = false;
        talk.warmPolice();
    }

    function hideOfficers() {
        officers.forEach((officer) => { officer.group.visible = false; });
    }

    function walk(officer, dt, x, z, speed) {
        const g = officer.group;
        const dx = x - g.position.x;
        const dz = z - g.position.z;
        const distance = Math.hypot(dx, dz);
        const step = Math.min(distance, speed * dt);
        if (distance > 0.01) {
            g.position.x += (dx / distance) * step;
            g.position.z += (dz / distance) * step;
            g.rotation.y = Math.atan2(dx, dz);
        }
        officer.animate(dt, step > 0.001 ? speed : 0, false, clock);
        return distance;
    }

    function face(officer, x, z, talking, dt) {
        const g = officer.group;
        g.rotation.y = Math.atan2(x - g.position.x, z - g.position.z);
        officer.animate(dt, 0, talking, clock);
    }

    function getOut() {
        while (officers.length < 2) officers.push(createOfficer(scene));
        const yaw = group.rotation.y;
        officers.forEach((officer, index) => {
            const side = index ? 1 : -1;
            ahead.set(side * 1.35, 0, 0.3).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
            officer.group.position.set(group.position.x + ahead.x, 0, group.position.z + ahead.z);
            officer.group.visible = true;
            officer.home = officer.group.position.clone();
        });
        audio.play('car_door', { volume: 0.5 });
        audio.play('car_door', { volume: 0.4, delay: 0.25, rate: 1.05 });
    }

    // Player touched the patrol car while driving.
    function bumped(record) {
        if (!car || record !== car || stop || car.towing) return;
        car.hold = true;
        stop = { phase: 'brake', t: 0, speaker: 0, context: 'bump', fined: 0, token: 0, hits: 0 };
        audio.play('police_siren', { volume: 0.6 });
    }

    // Player hit something during the chase: twice and they are caught.
    let lastHit = -10;
    function playerHit() {
        if (!stop || stop.phase !== 'chase' || clock - lastHit < 0.8) return;
        lastHit = clock;
        stop.hits++;
    }

    // The officers' verdict: fine, then what it costs (cars lost, warning
    // at zero points, the bike taken away the third time).
    async function sentence(context, mine) {
        const total = context === 'chase' ? CHASE_FINE - stop.fined : 100;
        const result = onFine(total, context);
        stop.fined += result.applied;
        const lines = [];
        if (result.before === 0) {
            lines.push(result.confiscate ? 'confiscate' : 'zero');
        } else {
            lines.push(context === 'chase' ? 'chasefine' : 'fine');
            const key = result.lost.join(',');
            const lost = LOST_LINES[key] || (result.lost.length ? LOST_LINES[result.lost[result.lost.length - 1]] : null);
            if (lost) lines.push(lost);
            else if (Math.random() < 0.5) lines.push('after');
        }
        for (const [index, category] of lines.entries()) {
            if (!stop || stop.token !== mine) return;
            // The player's name now and then (always for the serious ones).
            const named = category === 'fine' ? Math.random() < 0.5 : ['chasefine', 'zero', 'confiscate'].includes(category);
            const other = index > 0 && (category.startsWith('lost_') || category === 'after');
            await talk.police(category, other ? 1 - stop.speaker : stop.speaker, { named });
        }
        if (result.confiscate && stop && stop.token === mine) {
            stop.towing = true;
            confiscateBike?.();
        }
    }

    function startChase() {
        stop.token++;
        talk.reset();
        hideOfficers();
        audio.play('car_door', { volume: 0.5 });
        car.hold = false;
        car.chasing = true;
        stop.phase = 'chase';
        stop.t = 0;
        stop.hits = 0;
        stop.lastShout = -8.5;
        stop.lastSiren = -10;
        document.dispatchEvent(new CustomEvent('wheelie:toast', { detail: { title: 'POURSUITE !', text: 'Change de rue pour les semer' } }));
    }

    function caught(player) {
        car.chasing = false;
        car.hold = true;
        car.speed = 0;
        // Pulled up just behind the player.
        const dx = group.position.x - player.x;
        const dz = group.position.z - player.z;
        const length = Math.hypot(dx, dz) || 1;
        const gap = player.radius + 3.2;
        group.position.set(player.x + (dx / length) * gap, 0, player.z + (dz / length) * gap);
        group.rotation.y = Math.atan2(-dx, -dz);
        freezePlayer?.(true);
        onCaught?.();
        stop.context = 'chase';
        stop.phase = 'out';
        stop.t = 0;
    }

    // player: { x, z, radius, mode }
    function update(dt, focus, player, bike) {
        clock += dt;
        if (!car && clock > nextAt) spawn(focus);
        if (!car) return;
        group.userData.flash(clock);
        if (car.towing) tow(bike);
        const distance = Math.hypot(group.position.x - player.x, group.position.z - player.z);
        const pan = Math.max(-1, Math.min(1, (group.position.x - focus.x) / 10));
        if (!sirenDone && distance < 55) {
            sirenDone = true;
            audio.play('police_siren', { volume: 0.45, pan });
        }
        if (!stop) return;
        stop.t += dt;
        const fleeing = distance > FLEE_DISTANCE;
        if (stop.phase === 'brake' && stop.t > 0.9 && car.speed < 1) {
            getOut();
            stop.phase = 'approach';
            stop.t = 0;
        } else if (stop.phase === 'out' && stop.t > 0.6) {
            getOut();
            stop.phase = 'approach';
            stop.t = 0;
        } else if (stop.phase === 'approach') {
            if (fleeing && stop.context === 'bump') {
                startChase();
                return;
            }
            // Up to the player, on the side of the patrol car, side by side.
            let closest = Infinity;
            const dx = group.position.x - player.x;
            const dz = group.position.z - player.z;
            const length = Math.hypot(dx, dz) || 1;
            const reach = player.radius + 0.9;
            officers.forEach((officer, index) => {
                const offset = index ? 0.75 : -0.75;
                const x = player.x + (dx / length) * reach + (-dz / length) * offset;
                const z = player.z + (dz / length) * reach + (dx / length) * offset;
                closest = Math.min(closest, walk(officer, dt, x, z, 2.6));
            });
            if (closest < 0.4 || stop.t > 4) {
                stop.phase = 'talk';
                stop.t = 0;
                stop.speaker = 0;
                const mine = stop.token;
                sentence(stop.context, mine).then(() => {
                    if (stop && stop.token === mine && stop.phase === 'talk') {
                        stop.phase = 'back';
                        stop.t = 0;
                    }
                });
            }
        } else if (stop.phase === 'talk') {
            // Driving off in the middle of it: the chase starts.
            if (fleeing && stop.context === 'bump' && !stop.towing) {
                startChase();
                return;
            }
            officers.forEach((officer, index) => face(officer, player.x, player.z, index === stop.speaker, dt));
            if (stop.t > 16) {
                stop.phase = 'back';
                stop.t = 0;
            }
        } else if (stop.phase === 'chase') {
            // Faster and faster: whoever does not turn off is caught.
            // m/s: from 50 km/h, faster each second, up to ~210 km/h (above
            // the bike's 140 and the boosts): time to turn off, not forever.
            const base = player.mode === 'walk' ? 8 : 14;
            const speed = Math.min(58, base + 2.5 * stop.t);
            const dx = player.x - group.position.x;
            const dz = player.z - group.position.z;
            const length = Math.hypot(dx, dz) || 1;
            const step = Math.min(Math.max(0, length - (player.radius + 3)), speed * dt);
            group.position.x += (dx / length) * step;
            group.position.z += (dz / length) * step;
            const yaw = Math.atan2(dx, dz);
            let turn = yaw - group.rotation.y;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            group.rotation.y += turn * Math.min(1, dt * 6);
            car.speed = speed;
            if (stop.t - stop.lastSiren > 3.6) {
                stop.lastSiren = stop.t;
                audio.play('police_siren', { volume: 0.35 + 0.4 * Math.max(0, 1 - distance / 120), pan });
            }
            if (stop.t - stop.lastShout > CHASE_SHOUT_EVERY) {
                stop.lastShout = stop.t;
                talk.police('chase', 0, { named: Math.random() < 0.5, namedClip: 'stop' });
            }
            if (distance < player.radius + 4.2 || stop.hits >= 2) caught(player);
        } else if (stop.phase === 'back') {
            freezePlayer?.(false);
            // A confiscated bike leaves with them, ridden ahead of the car.
            let farthest = 0;
            officers.forEach((officer, index) => {
                const target = stop.towing && index === 1 && bike ? bike.position : officer.home;
                farthest = Math.max(farthest, walk(officer, dt, target.x, target.z, 2.6));
            });
            if (farthest < 0.5 || stop.t > 6) {
                hideOfficers();
                audio.play('car_door', { volume: 0.45 });
                car.hold = false;
                if (stop.towing) car.towing = true;
                stop = null;
            }
        }
    }

    // The bike rides off in front of the patrol car.
    function tow(bike) {
        if (!car || !car.towing || !bike) return false;
        const yaw = group.rotation.y;
        bike.position.set(group.position.x + Math.sin(yaw) * 6.5, 0, group.position.z + Math.cos(yaw) * 6.5);
        bike.rotation.set(0, yaw, 0);
        return true;
    }

    // New street: the police lose track of the player.
    function reset() {
        const escaped = !!stop && stop.phase === 'chase';
        if (car) traffic.leave(car);
        car = null;
        stop = null;
        hideOfficers();
        freezePlayer?.(false);
        nextAt = clock + range(30, 180);
        if (escaped) onEscape?.();
    }

    // Officers on foot: traffic stops for them.
    function blockers() {
        return officers.filter((officer) => officer.group.visible).map((officer) => officer.group.position);
    }

    return {
        update, bumped, playerHit, reset, blockers,
        // Tests and debugging: bring the patrol now.
        callNow() { nextAt = clock; },
        get car() { return car; },
        get stopped() { return !!stop; },
        get chasing() { return !!stop && stop.phase === 'chase'; },
        get hits() { return stop ? stop.hits : 0; },
        get towing() { return !!car && !!car.towing; },
        get phase() { return stop ? stop.phase : car ? (car.towing ? 'towing' : 'patrol') : 'none'; }
    };
}
