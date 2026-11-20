// Free roam for the realistic version: traffic and pedestrians, side
// streets to turn into (a new street each time), and getting off the bike
// to walk, take a parked car (unlocked with points) or ride again.
import * as THREE from 'three';
import { createTraffic } from './traffic.js';
import { createPeople } from './people.js';
import { createPolicePatrol } from './police.js';
import { createStreetTalk } from './street-talk.js';
import { createHangGlider } from './glider.js';
import { createJetpack } from './jetpack.js';
import { createOfficer, decoratePoliceCar } from './police.js';
import { BASE_CAR_MODEL, CAR_NAMES, CAR_UNLOCKS } from './cars.js';
import { isRealCar, ownedCars, ownsRealCar, pickRealCarPaint, realCarInfo } from './realcars.js';
import { noteSeen } from '../shop/store.js';
import { createTowService, deliveryCost } from './towtruck.js';
import { beginCinematic, boostCinematic, cinematicSpeed, endCinematic } from '../cinematic.js';
import { noteRankedTotal, profileBalance } from '../profile.js';

const POINTS_KEY = 'wheelie_total_points';
// Fines (police) are kept apart, so the server total can still raise the
// points earned without wiping them out.
const PENALTY_KEY = 'wheelie_points_penalty';
// Fined with no points left: two warnings, the third time the police take
// the bike (free roam only; 100 points in a competitive run bring it back).
const STRIKES_KEY = 'wheelie_zero_strikes';
const CONFISCATED_KEY = 'wheelie_bike_confiscated';
export const BIKE_RECOVERY_POINTS = 100;
// Nice: the Ariane and around.
const STREETS = [
    'Avenue du 51', 'Rue du Bosquet', 'Rue de l’Aspre', 'Rue Assalit', 'Rue d’Italie',
    'Boulevard de l’Ariane', 'Avenue des Pâquerettes', 'Avenue du Général Obry', 'Rue Pierre Séguran'
];
const SIDE_STREET_HALF = 4.4;
// Counted for "Mes stats" and the owner's stats (main.js bumpStat).
const stat = (name) => document.dispatchEvent(new CustomEvent('wheelie:stat', { detail: { name } }));
// On foot at life size (the rider used to be 1.7x bigger and faster).
// Units are metres: about 11 km/h walking, 26 km/h sprinting.
const WALK_SPEED = 0.05;
const RUN_SPEED = 0.12;
// Cars: 140 km/h at most (0.65 m per frame), 180 with the boost.
const CAR_TOP_SPEED = 0.65;
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

// The same on every device of the player once synced (src/profile.js).
export function totalPoints() {
    const shared = profileBalance();
    return shared ?? Math.max(0, stored(POINTS_KEY) - stored(PENALTY_KEY));
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

// Points spent (podium poses): taken like a fine, only if they are there.
export function spendPoints(points) {
    const amount = Math.max(0, Math.floor(points));
    if (totalPoints() < amount) return false;
    try {
        localStorage.setItem(PENALTY_KEY, String(stored(PENALTY_KEY) + amount));
    } catch {
        return false;
    }
    document.dispatchEvent(new CustomEvent('wheelie:points'));
    return true;
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

// The server keeps each player's total: never show less than that. Once the
// profile is synced, it keeps the total (the device's own count is not
// raised: it is this device's share).
export function syncPoints(serverTotal) {
    const total = Math.floor(Number(serverTotal) || 0);
    if (noteRankedTotal(total) || profileBalance() !== null) return;
    if (total <= stored(POINTS_KEY)) return;
    try {
        localStorage.setItem(POINTS_KEY, String(total));
    } catch {
        return;
    }
    document.dispatchEvent(new CustomEvent('wheelie:points'));
}

export function createFreeRoam({ scene, world, rider, audio, onTurn, playerVoice = null, fx = null }) {
    const traffic = createTraffic({
        scene, world,
        onHonk: (pan) => audio.play('horn_distant', { volume: 0.55, pan, rate: 1.1 + Math.random() * 0.2 })
    });
    const people = createPeople({ scene });
    const talk = createStreetTalk({ audio, people, playerVoice });
    const tow = createTowService({ scene, world, audio });
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
            toast(`-${applied.toLocaleString('fr-FR')} PTS`, reason === 'chase' ? 'Délit de fuite' : reason === 'wheelie' ? 'Rodéo urbain · 20 % de tes points' : 'Mauvaise conduite');
            if (lost.length) setTimeout(() => toast(lost.map((model) => CAR_NAMES[model]).join(' + '), 'Plus assez de points pour la conduire'), 2700);
        }
        return { before, after, applied, lost, strikes, confiscate };
    }
    // The bike's wheelie and speed, given by the game (for the police).
    const ride = { wheeling: false, speed: 0 };
    const patrol = createPolicePatrol({
        scene, world, traffic, audio, talk,
        totalPoints,
        onWarn: (seconds, down) => document.dispatchEvent(new CustomEvent('wheelie:police-warn', { detail: { seconds, down } })),
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
    // roof: the roof he walks on (null: the street); y is then its height.
    const walker = { x: 0, z: 0, yaw: Math.PI, speed: 0, y: 0, vy: 0, running: false, jumpHeld: false, roof: null };
    const boost = { readyAt: 0, until: 0 };
    const now = () => performance.now() / 1000;
    const drive = { group: null, model: null, speed: 0, yaw: Math.PI, braking: false, reversing: false, steer: 0, bump: 0, onKerb: false };
    const dropped = [];
    let heroSpawned = false;
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
        document.dispatchEvent(new CustomEvent('wheelie:controls', {
            detail: { mode, model: mode === 'car' ? drive.model : null }
        }));
    }

    // Boost in free roam: on the bike or in a car, every 15 s.
    function tryBoost() {
        if (mode === 'walk' || mode === 'jet' || mode === 'glide' || now() < boost.readyAt) return false;
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
            ready: (mode === 'bike' || mode === 'car') && t >= boost.readyAt,
            wait: Math.max(0, Math.ceil(boost.readyAt - t))
        };
    }

    // nx, nz: stick direction (-1..1), nz < 0 is forward.
    // keys: { run, jump } on foot.
    function move(dt, nx, nz, keys = {}, wind = null) {
        if (mode === 'glide') {
            moveGlide(dt, nx, wind);
            return;
        }
        if (mode === 'jet') {
            moveJet(dt, nx, nz, keys, wind);
            return;
        }
        // Stopped by the police: no control until they are done.
        if (frozen) {
            nx = 0;
            nz = 0;
            keys = {};
            if (mode === 'car') drive.speed *= 0.85;
        }
        const storm = wind ? (wind.storm || 0) : 0;
        if (mode === 'walk') {
            const length = Math.min(1, Math.hypot(nx, nz));
            walker.running = !!keys.run && length > 0.05;
            walker.speed = length * (walker.running ? RUN_SPEED : WALK_SPEED);
            if (length > 0.05) walker.yaw = Math.atan2(nx, nz);
            walker.x += Math.sin(walker.yaw) * walker.speed;
            walker.z += Math.cos(walker.yaw) * walker.speed;
            if (storm > 0.05 && !frozen && (!tow.active || length > 0.05)) {
                const walkMul = length > 0.05 ? 0.32 : 0.16;
                walker.x += wind.gustX * walkMul * dt;
                walker.z += wind.gustZ * walkMul * 0.5 * dt;
            }
            const ground = walker.roof ? walker.roof.y : 0;
            // Jump: one per press, only from the ground. At the edge of a
            // roof: the hang glider takes him off.
            if (keys.jump && !walker.jumpHeld && walker.y <= ground + 0.001) {
                if (walker.roof && nearEdge()) {
                    walker.jumpHeld = true;
                    leapFromRoof();
                    return;
                }
                walker.vy = 0.12;
                audio.play('ui_click', { volume: 0.25, rate: 0.7 });
            }
            walker.jumpHeld = !!keys.jump;
            if (walker.y > ground || walker.vy > 0) {
                walker.y += walker.vy;
                walker.vy -= 0.0105;
                if (walker.y <= ground) {
                    walker.y = ground;
                    walker.vy = 0;
                    audio.play('landing', { volume: 0.12, rate: 1.6 });
                }
            }
            if (walker.roof) {
                // Free on the roof, kept inside its parapets.
                const roof = walker.roof;
                walker.x = Math.max(roof.x0 + 0.35, Math.min(roof.x1 - 0.35, walker.x));
                walker.z = Math.max(roof.z0 + 0.35, Math.min(roof.z1 - 0.35, walker.z));
            } else {
                const position = new THREE.Vector3(walker.x, 0, walker.z);
                constrain(position, 19.4, 0);
                traffic.pushOut(position, 0.32);
                walker.x = position.x;
                walker.z = position.z;
            }
        } else if (mode === 'car') {
            // Speeds in metres per frame (1/60 s): accelerations in m/s² / 3600.
            const info = realCarInfo(drive.model);
            const throttle = -nz;
            const boosting = now() < boost.until;
            const top = (info ? info.topSpeed : CAR_TOP_SPEED) * (boosting ? 1.3 : 1);
            const basePull = info ? info.accel : 3;
            const brakeRate = info && info.accel >= 5 ? 11.8 : 9.5;
            const frameScale = Math.min(2.5, Math.max(0.5, (dt || 0.016) * 60));
            if (throttle * drive.speed < 0 && Math.abs(drive.speed) > 0.003) {
                // Braking (pressing against the motion).
                drive.speed -= Math.sign(drive.speed) * Math.min(Math.abs(drive.speed), brakeRate / 3600 * Math.abs(throttle) * frameScale);
                drive.hold = 0;
            } else if (throttle > 0.05) {
                // Pulls harder the longer the pedal is held + crisp low-end launch torque on sports cars.
                drive.hold = (drive.hold || 0) + (dt || 0.016);
                const launchBoost = info && info.accel >= 5.5 && drive.speed < 0.25 ? 1.45 : 1;
                const pull = (basePull * launchBoost + Math.min(5.2, drive.hold * 3.0)) * throttle / 3600;
                drive.speed += pull * Math.max(0, 1 - Math.pow(Math.max(0, drive.speed) / top, 3)) * frameScale;
            } else if (throttle < -0.05) {
                drive.speed = Math.max(-0.08, drive.speed - 2.8 / 3600 * -throttle * frameScale); // reverse
            } else {
                drive.hold = 0;
                const coast = (1.2 + 900 * drive.speed * drive.speed) / 3600;
                drive.speed = Math.sign(drive.speed) * Math.max(0, Math.abs(drive.speed) - coast * frameScale);
            }
            if (boosting && drive.speed < top) drive.speed += 6.5 / 3600 * frameScale;
            // After a boost: the speed it reached stays while the pedal is down.
            if (drive.speed > top && throttle <= 0.05) drive.speed = Math.max(top, drive.speed - 1.5 / 3600);
            // Lights: red when braking or backing up, white reversing lights, turn signals on steering.
            drive.reversing = drive.speed < -0.008;
            drive.braking = throttle * drive.speed < 0 && Math.abs(drive.speed) > 0.01;
            const turnL = nx < -0.35;
            const turnR = nx > 0.35;
            drive.group.userData.lights?.set(drive.braking || drive.reversing || (throttle < -0.05 && Math.abs(drive.speed) < 0.02), drive.reversing);
            const grip = Math.min(1, Math.abs(drive.speed) / 0.12);
            const calm = 1 - 0.42 * Math.min(1, Math.abs(drive.speed) / top);
            const turnRate = info?.model === 'gt-cabrio-5hc' ? 0.036 : 0.032;
            drive.yaw -= nx * turnRate * grip * calm * Math.sign(drive.speed || 1);
            drive.steer = (drive.steer || 0) + ((-nx) - (drive.steer || 0)) * Math.min(1, (dt || 0.016) * 12);

            const group = drive.group;
            const previous = group.position.clone();
            if (storm > 0.05 && !frozen) {
                const speedRatio = Math.min(1, Math.abs(drive.speed) / 0.22);
                drive.yaw += wind.carYawTorque * (dt || 0.016) * (0.2 + 0.8 * speedRatio);
                group.position.x += wind.gustX * (0.14 + 0.42 * speedRatio) * (dt || 0.016);
                if (Math.abs(drive.speed) > 0.04 && Math.abs(wind.gustX) > 3.5) {
                    drive.speed = Math.sign(drive.speed) * Math.max(0.03, Math.abs(drive.speed) - Math.abs(wind.gustX) * 0.002 * (dt || 0.016));
                }
                group.rotation.z = Math.max(-0.045, Math.min(0.045, -wind.gustX * 0.005));
            } else if (Math.abs(group.rotation.z) > 0.001) {
                group.rotation.z *= Math.exp(-(dt || 0.016) * 8);
                if (Math.abs(group.rotation.z) <= 0.001) group.rotation.z = 0;
            }
            group.position.x += Math.sin(drive.yaw) * drive.speed;
            group.position.z += Math.cos(drive.yaw) * drive.speed;
            group.rotation.y = drive.yaw;
            constrain(group.position, 9.1, 1.2);
            void previous;

            // Kerb ride & suspension bump feedback along outer avenue edge
            const onKerb = sideStreetAt(group.position.z) === null && Math.abs(group.position.x) > 8.75;
            if (onKerb !== !!drive.onKerb) {
                drive.onKerb = onKerb;
                drive.bump = onKerb ? 0.9 : -0.65;
            }
            drive.bump = (drive.bump || 0) * Math.exp(-(dt || 0.016) * 8);
            const targetY = onKerb ? 0.14 : 0;
            group.position.y += (targetY - group.position.y) * Math.min(1, (dt || 0.016) * 14);

            const hit = traffic.pushOut(group.position, 1.4);
            if (hit) {
                if (hit.police) patrol.bumped(hit);
                else patrol.playerHit();
                if (Math.abs(drive.speed) > 0.12) audio.play('collision', { volume: 0.4 });
                drive.speed *= -0.25;
                drive.bump = -0.9;
                constrain(group.position, 9.1, 1.2);
            }

            group.userData.animate?.(dt || 0.016, {
                speed: drive.speed * 60,
                throttle: Math.max(0, throttle),
                braking: drive.braking || (throttle < -0.05 && Math.abs(drive.speed) < 0.02),
                reversing: drive.reversing,
                steer: drive.steer,
                turningLeft: turnL,
                turningRight: turnR,
                bump: drive.bump,
                time: now(),
                showroom: false
            });
        }
    }

    // --- Secret: the hang glider ------------------------------------------
    // From high above the street, gliding down (left / right to steer). It
    // can land:
    // - on a roof: he runs a few steps and is free to walk about up there;
    //   SAUTER at the edge and the glider takes him off again, on to the
    //   next place (no police up there);
    // - on the street: a few running steps, the glider left behind; the
    //   police come, he says sorry, they take the glider and fine him (at
    //   least 50 points and at least 2.5 % of his cumulative points);
    // - on a car: the driver brakes, gets out ("on est où là ?"), the police
    //   come, the driver explains (GTA...), and the fine is three times as
    //   much.
    // The bike then waits next to him.
    const GLIDE = { sink: 1.6, speed: 12, startHeight: 42, fine: 50, share: 0.025, carFactor: 3, edge: 1.6, reach: 132 };
    const glide = { group: null, x: 0, z: 0, y: 0, yaw: Math.PI, speed: GLIDE.speed, phase: '', t: 0, roll: 0, scene: null, roof: null, car: null };
    function glideFine(factor) {
        const points = totalPoints();
        return Math.max(GLIDE.fine, Math.ceil(points * GLIDE.share)) * factor;
    }

    function ensureGlider() {
        if (!glide.group) {
            glide.group = createHangGlider();
            scene.add(glide.group);
        }
        glide.group.visible = true;
        glide.group.scale.setScalar(1);
    }

    // From the bike or on foot (in the street or on a roof), as often as
    // the code is typed.
    function startGlide() {
        if ((mode !== 'bike' && mode !== 'walk') || frozen || turning || !bike) return false;
        // The police leaving with the last one: gone at once.
        if (glide.scene && glide.scene.step === 'leave') endGlide();
        if (glide.scene) return false;
        ensureGlider();
        if (mode === 'bike') {
            glide.yaw = bike.rotation.y;
            // Starts a little behind the bike, high up.
            glide.x = bike.position.x;
            glide.z = bike.position.z - Math.cos(glide.yaw) * 25;
            glide.y = GLIDE.startHeight;
        } else {
            glide.yaw = walker.yaw;
            glide.x = walker.x;
            glide.z = walker.z - Math.cos(glide.yaw) * 12;
            glide.y = Math.max(GLIDE.startHeight, walker.y + 25);
        }
        launchGlide();
        bike.visible = false;
        rider.dismount(glide.x, glide.z, glide.yaw);
        toast('CODE SECRET', 'Deltaplane ! Gauche / droite pour te diriger · pose-toi sur un toit');
        return true;
    }

    function launchGlide() {
        glide.speed = GLIDE.speed;
        glide.phase = 'fly';
        glide.t = 0;
        glide.roll = 0;
        glide.roof = null;
        glide.car = null;
        walker.roof = null;
        setMode('glide');
        audio.play('whoosh', { volume: 0.6, rate: 0.7 });
    }

    // From the edge of a roof: the glider takes him off again.
    function leapFromRoof() {
        const roof = walker.roof;
        if (!roof || frozen) return false;
        // Off the nearest edge, the way he faces if it points out enough.
        const edges = [[walker.x - roof.x0, -Math.PI / 2], [roof.x1 - walker.x, Math.PI / 2], [walker.z - roof.z0, Math.PI], [roof.z1 - walker.z, 0]];
        const [, outward] = edges.sort((a, b) => a[0] - b[0])[0];
        const facing = Math.cos(walker.yaw - outward);
        ensureGlider();
        glide.yaw = facing > 0.3 ? walker.yaw : outward;
        glide.x = walker.x + Math.sin(glide.yaw) * 1.2;
        glide.z = walker.z + Math.cos(glide.yaw) * 1.2;
        glide.y = roof.y + 0.6;
        launchGlide();
        bumpLeaps();
        toast('🪂 C’EST PARTI', 'Vers la prochaine destination');
        return true;
    }
    let leaps = 0;
    function bumpLeaps() {
        leaps++;
    }

    function placeGlider() {
        const g = glide.group;
        g.position.set(glide.x, glide.y + 1.85 * 0.95, glide.z);
        g.rotation.set(0, glide.yaw, glide.roll);
    }

    function nearEdge() {
        const roof = walker.roof;
        if (!roof) return false;
        return Math.min(walker.x - roof.x0, roof.x1 - walker.x, walker.z - roof.z0, roof.z1 - walker.z) < GLIDE.edge;
    }

    // Left behind where he touched down: on one wingtip, off to the side.
    function dropGlider(groundY) {
        const aside = glide.x > 0 ? -1 : 1;
        glide.group.position.set(glide.x + Math.cos(glide.yaw) * aside * 2.2, groundY + 1.1, glide.z - Math.sin(glide.yaw) * aside * 2.2);
        glide.group.rotation.set(-0.2, glide.yaw, aside * 0.32);
    }

    function moveGlide(dt, nx, wind = null) {
        glide.t += dt;
        if (glide.phase === 'fly') {
            glide.yaw -= nx * 0.8 * dt;
            glide.roll += (-nx * 0.35 - glide.roll) * Math.min(1, dt * 3);
            const before = { x: glide.x, z: glide.z };
            glide.x += Math.sin(glide.yaw) * glide.speed * dt;
            glide.z += Math.cos(glide.yaw) * glide.speed * dt;
            if (wind && wind.storm > 0.05) {
                glide.x += wind.gustX * 1.35 * dt;
                glide.roll += wind.gustX * 0.014 * dt;
            }
            // Over the street and its buildings; low down, over the street.
            const limit = glide.y < 6 ? 18.5 : GLIDE.reach;
            if (Math.abs(glide.x) > limit) {
                glide.x = Math.sign(glide.x) * limit;
                glide.yaw += (Math.PI - glide.yaw) * 0.02;
            }
            glide.y = Math.max(0, glide.y - GLIDE.sink * dt);
            // A roof under him: down on it (or, far below its edge, along
            // the wall instead of through it).
            const roof = world.roofAt(glide.x, glide.z, 0.3);
            if (roof && glide.y <= roof.y + 0.05) {
                if (glide.y > roof.y - 7) {
                    glide.y = roof.y;
                    glide.roof = roof;
                    glide.phase = 'run';
                    glide.t = 0;
                    dropGlider(roof.y);
                    audio.play('landing', { volume: 0.5 });
                    stat('roofLandings');
                    toast('SUR LE TOIT !', 'Cours où tu veux · SAUTER au bord pour repartir en deltaplane');
                    return;
                }
                glide.x = before.x;
                glide.z = before.z;
                glide.yaw += Math.PI * dt;
            }
            // A car under him, at the height of its roof.
            const car = glide.y < 2.2 ? traffic.hitTest(glide.x, glide.z, 0.1) : null;
            if (car && !car.special && glide.y <= car.group.userData.height + 0.05) {
                landOnCar(car);
                return;
            }
            placeGlider();
            rider.updateWalk(dt, glide.x, glide.z, glide.yaw, 0, Math.max(0.05, glide.y), false, false, { ground: glide.y - 1 });
            if (glide.y <= 0) {
                // Touchdown in the street: a few running steps, the glider stays behind.
                stat('streetLandings');
                glide.phase = 'run';
                glide.t = 0;
                dropGlider(0);
                audio.play('landing', { volume: 0.5 });
            }
        } else if (glide.phase === 'run') {
            // A few running steps, well clear of the glider.
            const pace = Math.max(0, 5.5 * (1 - glide.t / 2.4));
            const ground = glide.roof ? glide.roof.y : 0;
            glide.x += Math.sin(glide.yaw) * pace * dt;
            glide.z += Math.cos(glide.yaw) * pace * dt;
            if (glide.roof) {
                glide.x = Math.max(glide.roof.x0 + 0.4, Math.min(glide.roof.x1 - 0.4, glide.x));
                glide.z = Math.max(glide.roof.z0 + 0.4, Math.min(glide.roof.z1 - 0.4, glide.z));
            }
            rider.updateWalk(dt, glide.x, glide.z, glide.yaw, pace / 60, ground, pace > 2, false, { ground });
            if (glide.t > (glide.roof ? 1.2 : 2.4)) {
                walker.x = glide.x;
                walker.z = glide.z;
                walker.yaw = glide.yaw;
                walker.speed = 0;
                walker.y = ground;
                walker.vy = 0;
                walker.roof = glide.roof;
                setMode('walk');
                if (!glide.roof) startGliderPolice('street');
            }
        } else if (glide.phase === 'car') {
            // Standing on the roof of the car while it brakes.
            const car = glide.car;
            const g = car.group;
            const top = g.userData.height;
            glide.x = g.position.x;
            glide.z = g.position.z;
            rider.updateWalk(dt, glide.x, glide.z, glide.yaw, 0, top, false, false, { ground: top });
            if (car.speed < 0.6 && glide.t > 1.2) {
                glide.phase = 'down';
                glide.t = 0;
                startCarScene(car);
            }
        } else if (glide.phase === 'down') {
            // Jumps down beside the car, on the pavement side.
            const stage = glide.scene;
            const k = Math.min(1, glide.t / 0.55);
            const g = glide.car.group;
            const top = g.userData.height;
            const x = g.position.x + stage.riderSide * 1.9 * k;
            const y = top * (1 - k) + Math.sin(k * Math.PI) * 0.5;
            rider.updateWalk(dt, x, g.position.z, glide.yaw, 0, y, false, false, { ground: k < 1 ? -1 : 0 });
            if (k >= 1) {
                audio.play('landing', { volume: 0.3, rate: 1.3 });
                walker.x = x;
                walker.z = g.position.z;
                walker.yaw = -stage.riderSide * Math.PI / 2;
                walker.y = 0;
                walker.vy = 0;
                walker.roof = null;
                setMode('walk');
                frozen = true;
            }
        }
    }

    // --- Landing on a car ------------------------------------------------
    function landOnCar(car) {
        glide.car = car;
        stat('carLandings');
        glide.phase = 'car';
        glide.t = 0;
        glide.y = car.group.userData.height;
        car.hold = true;
        glide.group.visible = false;
        audio.play('collision', { volume: 0.6 });
        audio.play('landing', { volume: 0.6, rate: 0.8, delay: 0.05 });
        audio.play('brake', { volume: 0.5, delay: 0.2 });
        toast('SUR UNE VOITURE !', 'Amende triple en vue…');
    }

    function startCarScene(car) {
        const g = car.group;
        // Pavement side for the rider, the road side for the driver.
        const riderSide = g.position.x >= 0 ? 1 : -1;
        const driver = createOfficer(scene, { civilian: true });
        driver.group.visible = true;
        driver.group.position.set(g.position.x - riderSide * 1.2, 0, g.position.z + car.lane.dir * 0.4);
        driver.group.rotation.y = car.lane.dir > 0 ? 0 : Math.PI;
        audio.play('car_door', { volume: 0.55 });
        const voice = talk.driverVoice();
        glide.scene = {
            kind: 'car', car, driver, voice, riderSide, step: 'shock', t: 0, time: 0,
            forward: new THREE.Vector3(0, 0, car.lane.dir), policeX: car.lane.x
        };
        // The driver, stunned.
        talk.driver('roof_shock', voice).then(() => {
            const stage = glide.scene;
            if (!stage || stage.kind !== 'car') return;
            startGliderPolice('car');
        });
    }

    function startGliderPolice(kind) {
        frozen = true;
        const police = world.createCar('sedan', 0xf4f4f2);
        decoratePoliceCar(police);
        scene.add(police);
        const carStage = kind === 'car' ? glide.scene : null;
        const forward = carStage ? carStage.forward : new THREE.Vector3(Math.sin(glide.yaw), 0, Math.cos(glide.yaw));
        const side = walker.x > 0 ? -1 : 1;
        // Comes from behind; behind the car it landed on, or beside him.
        const stopX = carStage ? carStage.policeX : walker.x + side * 3.4;
        const stopZ = carStage ? carStage.car.group.position.z - forward.z * 8.5 : walker.z - forward.z * 2;
        police.position.set(stopX, 0, stopZ - forward.z * 45);
        police.rotation.y = Math.atan2(forward.x, forward.z);
        const officer = createOfficer(scene);
        const stage = carStage || {};
        Object.assign(stage, { kind, police, officer, side, forward, stopZ, step: 'arrive', t: 0, time: stage.time || 0 });
        glide.scene = stage;
        beginCinematic('glider-police');
        audio.play('police_siren', { volume: 0.6 });
    }

    async function gliderTalk(stage) {
        const on = () => glide.scene === stage;
        if (stage.kind === 'car') {
            await talk.police('roof_ask', 0);
            if (!on()) return;
            stage.driverTalking = true;
            await talk.driver('roof_explain', stage.voice);
            stage.driverTalking = false;
            if (!on()) return;
            await talk.rider('sorry');
            if (!on()) return;
            await talk.police('roof_fine', 0);
        } else {
            await talk.police('glider', 0);
            if (!on()) return;
            await talk.rider('sorry');
            if (!on()) return;
            await talk.police('glider_fine', 0);
        }
        if (!on()) return;
        const factor = stage.kind === 'car' ? GLIDE.carFactor : 1;
        const lost = finePoints(glideFine(factor));
        stat('gliderFines');
        toast(lost ? `-${lost.toLocaleString('fr-FR')} PTS` : 'AMENDE', stage.kind === 'car' ? 'Atterrissage sur une voiture · amende ×3' : 'Trouble à l’ordre public');
        stage.step = 'take';
        stage.t = 0;
    }

    function updateGliderPolice(rawDt) {
        const stage = glide.scene;
        if (!stage) return;
        const dt = rawDt * cinematicSpeed();
        stage.t += dt;
        stage.time += dt;
        const { driver } = stage;
        if (driver) {
            // The driver stays by the car, facing whoever speaks.
            const g = driver.group;
            const look = stage.officer && stage.officer.group.visible && !stage.driverTalking ? stage.officer.group.position : new THREE.Vector3(walker.x, 0, walker.z);
            if (stage.step !== 'leave' || stage.t < 0.4) {
                g.rotation.y = Math.atan2(look.x - g.position.x, look.z - g.position.z);
                driver.animate(dt, 0, stage.step === 'shock' || !!stage.driverTalking, stage.time);
            }
        }
        if (!stage.police) return;
        const { police, officer, forward } = stage;
        police.userData.flash(stage.time);
        if (stage.step === 'arrive') {
            const remaining = (stage.stopZ - police.position.z) * forward.z;
            police.position.addScaledVector(forward, Math.min(Math.max(remaining, 0), Math.max(2, remaining * 1.6) * dt));
            if (remaining < 0.3) {
                stage.step = 'out';
                stage.t = 0;
                audio.play('car_door', { volume: 0.5 });
                officer.group.visible = true;
                officer.group.position.set(police.position.x - stage.side * 1.3, 0, police.position.z);
            }
        } else if (stage.step === 'out' || stage.step === 'talk') {
            // Stops between the car and the rider (by the driver after a car).
            const target = stage.kind === 'car'
                ? new THREE.Vector3((walker.x + stage.driver.group.position.x) / 2, 0, walker.z - forward.z * 1.6)
                : new THREE.Vector3(walker.x + (police.position.x - walker.x) * 0.45, 0, walker.z);
            const g = officer.group;
            const dx = target.x - g.position.x;
            const dz = target.z - g.position.z;
            const distance = Math.hypot(dx, dz);
            if (distance > 0.1) {
                const step = Math.min(distance, 2.4 * dt);
                g.position.x += (dx / distance) * step;
                g.position.z += (dz / distance) * step;
                g.rotation.y = Math.atan2(dx, dz);
                officer.animate(dt, 2.4, false, stage.time);
            } else {
                const facing = stage.driverTalking ? stage.driver.group.position : walker;
                g.rotation.y = Math.atan2(facing.x - g.position.x, facing.z - g.position.z);
                officer.animate(dt, 0, !stage.driverTalking, stage.time);
                if (stage.step === 'out') {
                    stage.step = 'talk';
                    walker.yaw = Math.atan2(g.position.x - walker.x, g.position.z - walker.z);
                    gliderTalk(stage);
                }
            }
        } else if (stage.step === 'take') {
            // The glider goes on the patrol car's roof, the officer back in.
            glide.group.visible = true;
            glide.group.position.set(police.position.x, police.userData.height + 0.15, police.position.z);
            glide.group.rotation.set(0, police.rotation.y, 0);
            glide.group.scale.setScalar(0.45);
            officer.group.visible = false;
            if (stage.driver) stage.driver.group.visible = false;
            if (stage.t > 0.6) {
                stage.step = 'leave';
                stage.t = 0;
                audio.play('car_door', { volume: 0.45 });
                if (stage.car) stage.car.hold = false;
                // The bike, waiting beside him.
                bike.position.set(walker.x - stage.side * 1.4, 0, walker.z + forward.z * 1.5);
                if (stage.kind === 'car') bike.position.set(walker.x + stage.riderSide * 1.3, 0, walker.z);
                bike.rotation.set(0, Math.atan2(forward.x, forward.z), 0);
                bike.visible = true;
                frozen = false;
            }
        } else if (stage.step === 'leave') {
            police.position.addScaledVector(forward, Math.min(14, 2 + stage.t * 6) * dt);
            glide.group.position.set(police.position.x, police.userData.height + 0.15, police.position.z);
            if (stage.t > 8) endGlide();
        }
    }

    function endGlide() {
        const stage = glide.scene;
        if (stage) {
            if (stage.police) scene.remove(stage.police);
            if (stage.officer) scene.remove(stage.officer.group);
            if (stage.driver) scene.remove(stage.driver.group);
            if (stage.car) stage.car.hold = false;
        }
        glide.scene = null;
        glide.phase = '';
        glide.car = null;
        if (glide.group) {
            glide.group.visible = false;
            glide.group.scale.setScalar(1);
        }
        frozen = false;
        endCinematic('glider-police');
        if (bike) bike.visible = true;
    }

    // --- Jetpack ------------------------------------------------------------
    // Fly anywhere over the street and its roofs. The fuel is the cumulative
    // points: JET.burn a second in the air, JET.boostBurn with the turbo.
    // SAUTER climbs, let go he sinks slowly; the stick flies him (forward,
    // turn); COURIR (or B) is the turbo; ATTERRIR (or J) brings him down.
    // Out of fuel: the engine coughs and he comes down. He lands on the
    // street or a roof; the bike is brought to him on the street.
    const JET = { burn: 10, boostBurn: 30, speed: 24, boostSpeed: 60, climb: 10, sink: 2.4, ceiling: 140, turn: 1.9, reach: 134, minPoints: 20 };
    const jetpack = createJetpack({ scene });
    const jet = { x: 0, y: 0, z: 0, yaw: Math.PI, speed: 0, vy: 0, pitch: 0, boost: 0, thrust: 0, debt: 0, landing: false, out: false,
        wasBoosting: false, ground: 0, roof: null, time: 0, whoosh: 0 };
    const jetVelocity = new THREE.Vector3();

    function startJet() {
        // The police leaving with the glider: gone at once.
        if (glide.scene && glide.scene.step === 'leave') endGlide();
        if (frozen || turning || glide.scene || mode === 'car' || mode === 'glide' || mode === 'jet') return false;
        if (totalPoints() < JET.minPoints) {
            toast('PAS DE CARBURANT', `Le jetpack brûle tes points cumulés : il en faut au moins ${JET.minPoints}`);
            return false;
        }
        const from = getFocus();
        jet.x = from.x;
        jet.z = from.z;
        jet.y = mode === 'walk' ? walker.y : 0;
        jet.yaw = mode === 'bike' ? bike.rotation.y : walker.yaw;
        jet.speed = 0;
        jet.vy = 9;
        jet.pitch = 0;
        jet.boost = 0;
        jet.debt = 0;
        jet.landing = false;
        jet.out = false;
        jet.time = 0;
        if (mode === 'bike') {
            rider.dismount(jet.x + Math.cos(jet.yaw) * 1.1, jet.z - Math.sin(jet.yaw) * 1.1, jet.yaw);
            jet.x += Math.cos(jet.yaw) * 1.1;
            jet.z -= Math.sin(jet.yaw) * 1.1;
        }
        walker.roof = null;
        setMode('jet');
        jetpack.ring(jet.x, jet.y + 0.1, jet.z, true);
        audio.play('boost', { volume: 0.8, rate: 0.85 });
        audio.play('backfire', { volume: 0.6, delay: 0.08 });
        audio.play('whoosh', { volume: 0.7, rate: 0.6, delay: 0.1 });
        // Small: the jetpack is what is to be seen (its fuel gauge says the rest).
        document.dispatchEvent(new CustomEvent('wheelie:toast', {
            detail: { title: '🚀 JETPACK', text: `${JET.burn} pts/s · turbo ${JET.boostBurn}`, discreet: true }
        }));
        document.dispatchEvent(new CustomEvent('wheelie:jet', { detail: { on: true } }));
        return true;
    }

    function landJet() {
        if (mode !== 'jet') return false;
        jet.landing = true;
        return true;
    }

    function endJet() {
        const roof = jet.roof;
        walker.x = jet.x;
        walker.z = jet.z;
        walker.yaw = jet.yaw;
        walker.y = jet.y;
        walker.vy = 0;
        walker.speed = 0;
        walker.roof = roof;
        jetpack.hide();
        setMode('walk');
        audio.play('landing', { volume: 0.45 });
        // On the street: the bike is brought to him (it was left far away).
        if (!roof && bike && !bikeConfiscated() && Math.hypot(bike.position.x - walker.x, bike.position.z - walker.z) > 6) {
            const side = walker.x > 0 ? -1 : 1;
            bike.position.set(Math.max(-8.5, Math.min(8.5, walker.x + side * 1.5)), 0, walker.z);
            bike.rotation.set(0, Math.PI, 0);
        }
        document.dispatchEvent(new CustomEvent('wheelie:jet', { detail: { on: false } }));
        if (roof) toast('SUR LE TOIT !', 'SAUTER au bord pour repartir en deltaplane, ou reprends le jetpack');
    }

    function moveJet(dt, nx, nz, keys, wind = null) {
        jet.time += dt;
        const forward = Math.max(-0.4, Math.min(1, -nz));
        const boosting = !jet.out && !jet.landing && !!(keys.run || keys.boost) && forward > 0.1;
        jet.yaw -= nx * JET.turn * dt * (1 - 0.35 * Math.min(1, jet.speed / JET.boostSpeed));
        const target = jet.out || jet.landing ? jet.speed * 0.6 : forward * (boosting ? JET.boostSpeed : JET.speed);
        jet.speed += (target - jet.speed) * Math.min(1, dt * (boosting ? 2.2 : 1.5));
        // Up while SAUTER is held, else a slow sink (a fast one to land, a
        // fall when the tank is empty).
        const climbing = !!keys.jump && !jet.out && !jet.landing;
        const wanted = climbing ? JET.climb : jet.out ? -11 : jet.landing ? -7 : -JET.sink;
        jet.vy += (wanted - jet.vy) * Math.min(1, dt * (climbing ? 3 : 2));
        const before = { x: jet.x, z: jet.z };
        jet.x += Math.sin(jet.yaw) * jet.speed * dt;
        jet.z += Math.cos(jet.yaw) * jet.speed * dt;
        if (wind && wind.storm > 0.05) {
            jet.x += wind.gustX * 1.15 * dt;
            jet.z += wind.gustZ * 0.45 * dt;
        }
        if (Math.abs(jet.x) > JET.reach) jet.x = Math.sign(jet.x) * JET.reach;
        jet.y = Math.min(JET.ceiling, jet.y + jet.vy * dt);
        // Buildings: over their roofs, never through their walls.
        const wall = world.roofAt(jet.x, jet.z, -0.4);
        if (wall && jet.y < wall.y - 0.4) {
            jet.x = before.x;
            jet.z = before.z;
            jet.speed *= 0.3;
        }
        const roof = world.roofAt(jet.x, jet.z, 0.3);
        // Low over the street: kept off the buildings' ground floors.
        if (!roof && jet.y < 4.5 && Math.abs(jet.x) > 18.5) jet.x = Math.sign(jet.x) * 18.5;
        jet.ground = roof ? roof.y : 0;
        if (jet.y <= jet.ground) {
            jet.y = jet.ground;
            jet.vy = Math.max(0, jet.vy);
            jet.roof = roof;
            if (jet.landing || jet.out || (!climbing && jet.speed < 1.5 && jet.time > 1.5)) {
                endJet();
                return;
            }
        }
        // The fuel: the cumulative points, taken ten at a time.
        jet.debt += (boosting ? JET.boostBurn : JET.burn) * dt;
        if (jet.debt >= 10) {
            const take = Math.floor(jet.debt);
            jet.debt -= take;
            const taken = finePoints(take);
            if (taken < take && !jet.out) {
                jet.out = true;
                audio.play('backfire', { volume: 0.7, rate: 0.6 });
                toast('PANNE SÈCHE !', 'Plus de points : le jetpack se tait, tu redescends');
            }
        }
        // Turbo: a ring of air and a bang when it kicks in.
        if (boosting && !jet.wasBoosting) {
            jetpack.ring(jet.x, jet.y + 1.2, jet.z, false, jet.yaw);
            audio.play('boost', { volume: 0.8 });
            audio.play('backfire', { volume: 0.55, delay: 0.06 });
        }
        jet.wasBoosting = boosting;
        jet.boost += ((boosting ? 1 : 0) - jet.boost) * Math.min(1, dt * 5);
        jet.thrust = jet.out ? (Math.random() < 0.15 ? 0.6 : 0) : climbing ? 1 : 0.45 + forward * 0.35 + jet.boost * 0.3;
        jet.pitch += (Math.min(1.1, jet.speed / JET.boostSpeed * 1.1) * Math.sign(jet.speed || 1) - jet.pitch) * Math.min(1, dt * 3);
        jet.whoosh -= dt;
        if (jet.speed > 30 && jet.whoosh <= 0) {
            jet.whoosh = 1.4 - jet.boost * 0.6;
            audio.play('whoosh', { volume: 0.35 + jet.boost * 0.3, rate: 0.8 + Math.random() * 0.3 });
        }
        rider.updateWalk(dt, jet.x, jet.z, jet.yaw, 0.03, jet.y, false, false, { ground: jet.y - 1, pitch: jet.pitch, fly: true });
    }

    function jetVisuals(dt) {
        if (mode !== 'jet') {
            jetpack.update(dt, { on: false });
            return;
        }
        const shown = jetpack.update(dt, {
            on: true, x: jet.x, y: jet.y, z: jet.z, yaw: jet.yaw, pitch: jet.pitch, thrust: jet.thrust, boost: jet.boost, ground: jet.ground, scale: 0.95
        });
        if (!shown || !fx) return;
        jetVelocity.set(Math.sin(jet.yaw) * jet.speed, jet.vy, Math.cos(jet.yaw) * jet.speed);
        const amount = jet.thrust > 0.05 ? (jet.boost > 0.5 ? 3 : 2) : 0;
        if (amount) for (const point of shown.points) fx.jet(point, shown.down, jetVelocity, amount, jet.boost);
    }

    function getFocus() {
        if (mode === 'glide') return focus.set(glide.x, glide.y, glide.z);
        if (mode === 'jet') return focus.set(jet.x, jet.y, jet.z);
        if (mode === 'walk') return focus.set(walker.x, walker.roof ? walker.roof.y : 0, walker.z);
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
        if (isRealCar(model)) {
            const info = realCarInfo(model);
            noteSeen(info.id);
            return ownsRealCar(model) ? null : `${info.name} · À acheter en boutique`;
        }
        const base = BASE_CAR_MODEL(model);
        const needed = CAR_UNLOCKS[base] ?? 0;
        const have = totalPoints();
        return have >= needed ? null : `${CAR_NAMES[model] || CAR_NAMES[base]} : ${needed} pts (tu as ${have})`;
    }

    function refreshPrompt() {
        if (mode === 'bike') return emit('DESCENDRE', true);
        if (mode === 'car') return emit('SORTIR', true);
        if (mode === 'jet') return emit(jet.landing ? '' : 'ATTERRIR', !jet.landing);
        if (mode === 'glide') return emit('', false);
        if (walker.roof) return emit(nearEdge() ? 'SAUTER : DELTAPLANE' : '', nearEdge());
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
        if (mode === 'jet') {
            landJet();
            return;
        }
        if (mode === 'glide') return;
        if (mode === 'walk' && walker.roof) {
            if (nearEdge()) leapFromRoof();
            return;
        }
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
                drive.steer = 0;
                drive.bump = 0;
                drive.onKerb = false;
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
    let lastHere = null;
    function update(dt, bikeGroup, wind = null) {
        bike = bikeGroup;
        // No bike while it is confiscated: on foot from the start.
        if (mode === 'bike' && bikeConfiscated() && !patrol.towing) {
            stepOff();
            if (!confiscationShown) notice('MOTO CONFISQUÉE', `Fais ${BIKE_RECOVERY_POINTS} points en mode compétitif pour la récupérer.`, 6);
        }
        confiscationShown = bikeConfiscated();
        const here = getFocus();
        // Exclusive code car (5HPORSHE): park GT 51 Cabrio right ahead along the curb for instant driving.
        if (!heroSpawned && ownsRealCar('gt-cabrio-5hc') && drive.model !== 'gt-cabrio-5hc'
            && !dropped.some((c) => c.model === 'gt-cabrio-5hc')) {
            heroSpawned = true;
            const heroGroup = world.createCar('gt-cabrio-5hc', pickRealCarPaint('gt-cabrio-5hc'));
            heroGroup.position.set(8.2, 0, here.z - 10.5);
            heroGroup.rotation.y = Math.PI;
            scene.add(heroGroup);
            dropped.push({ group: heroGroup, model: 'gt-cabrio-5hc' });
        }
        // Up in the air or on a roof, the traffic does not stop for him.
        const aloft = mode === 'glide' || mode === 'jet' || (mode === 'walk' && !!walker.roof);
        const blockers = [...(aloft ? [] : [{ x: here.x, z: here.z }]), ...patrol.blockers()];
        if (mode !== 'bike') blockers.push({ x: bike.position.x, z: bike.position.z });
        for (const car of dropped) blockers.push({ x: car.group.position.x, z: car.group.position.z });
        traffic.update(dt, here, blockers, wind);
        const storm = wind ? (wind.storm || 0) : 0;
        for (let i = 0; i < dropped.length; i++) {
            const d = dropped[i];
            const g = d.group;
            d.parkX ??= g.position.x;
            if (storm > 0.05) {
                const wave = Math.sin((now() * 2.3) + i * 1.9);
                const swayX = Math.max(-0.35, Math.min(0.35, wind.gustX * 0.045 + wave * 0.16 * storm));
                g.position.x = Math.max(-8.6, Math.min(8.6, d.parkX + swayX));
                g.rotation.z = Math.max(-0.04, Math.min(0.04, -(wind.gustX * 0.003 + wave * 0.022) * storm));
            } else {
                if (Math.abs(g.position.x - d.parkX) > 0.002) {
                    g.position.x += (d.parkX - g.position.x) * Math.min(1, (dt || 0.016) * 5);
                }
                if (Math.abs(g.rotation.z) > 0.001) {
                    g.rotation.z *= Math.exp(-(dt || 0.016) * 8);
                    if (Math.abs(g.rotation.z) <= 0.001) g.rotation.z = 0;
                }
            }
        }
        // Riding past a car fast: a whoosh on that side.
        if (lastHere && dt > 0 && mode !== 'walk') {
            const playerSpeed = Math.hypot(here.x - lastHere.x, here.z - lastHere.z) / dt;
            for (const car of traffic.cars) {
                const dz = car.group.position.z - here.z;
                const side = car.passSide ?? Math.sign(dz);
                car.passSide = Math.sign(dz);
                const dx = car.group.position.x - here.x;
                if (side !== car.passSide && Math.abs(dx) < 4.5 && playerSpeed > 14) {
                    audio.play('whoosh', { volume: Math.min(0.7, 0.25 + playerSpeed / 80), rate: 0.85 + Math.random() * 0.3, pan: Math.max(-1, Math.min(1, dx / 3)) });
                }
            }
        }
        lastHere = (lastHere || new THREE.Vector3()).copy(here);
        people.update(dt, here);
        talk.update(dt, aloft ? 'air' : mode, here);
        patrol.update(dt, here, {
            x: here.x, z: here.z, mode, radius: mode === 'car' ? 1.6 : mode === 'bike' ? 0.9 : 0.4,
            heading: mode === 'bike' ? bike.rotation.y : mode === 'car' ? drive.yaw : walker.yaw,
            speed: mode === 'bike' ? ride.speed : 0, wheeling: mode === 'bike' && ride.wheeling
        }, bike);
        if (mode === 'walk') {
            rider.updateWalk(dt, walker.x, walker.z, walker.yaw, walker.speed, walker.y, walker.running, false, { ground: walker.roof ? walker.roof.y : 0 });
        }
        if (glide.scene) updateGliderPolice(dt);
        tow.update(dt, here);
        checkCarDiscovery(here);
        emitTowState(here);
        jetVisuals(dt);
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
        endGlide();
        walker.roof = null;
        walker.y = 0;
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
        tow.cancel();
        endGlide();
        jetpack.hide();
        walker.roof = null;
        walker.y = 0;
        if (mode !== 'bike') rider.mount();
        setMode('bike');
        frozen = false;
        confiscationShown = false;
        boost.readyAt = 0;
        boost.until = 0;
        turning = false;
        heroSpawned = false;
        if (drive.group) scene.remove(drive.group);
        drive.group = null;
        drive.steer = 0;
        drive.bump = 0;
        drive.onKerb = false;
        for (const car of dropped) scene.remove(car.group);
        dropped.length = 0;
        patrol.reset();
        talk.reset();
        traffic.clear();
        people.clear();
        prompt = null;
        emit('', false);
        lastTowKey = '';
        document.dispatchEvent(new CustomEvent('wheelie:tow', { detail: { show: false } }));
    }

    function checkCarDiscovery(here) {
        const nearby = [];
        for (const c of world.realCarsNear?.(here.x, here.z, 22) || []) nearby.push(c.model);
        for (const car of traffic.cars) {
            const m = car.group?.userData?.model;
            if (isRealCar(m) && Math.hypot(car.group.position.x - here.x, car.group.position.z - here.z) < 25) nearby.push(m);
        }
        for (const model of nearby) {
            const info = realCarInfo(model);
            if (info && noteSeen(info.id)) {
                audio.play('new_record', { volume: 0.3, rate: 1.3 });
                toast(`🚗 Voiture repérée : ${info.name}`, 'Prix dévoilé dans la boutique !');
            }
        }
    }

    function deliveryOptions(here) {
        const dist = bike ? Math.hypot(bike.position.x - here.x, bike.position.z - here.z) : 0;
        const pts = totalPoints();
        const opts = [];
        if (!bikeConfiscated()) {
            opts.push({ kind: 'bike', model: null, name: 'Ma moto 51', cost: deliveryCost('bike', { distance: dist }) });
        }
        for (const car of ownedCars()) {
            opts.push({ kind: 'car', model: car.model, name: car.name, cost: deliveryCost('car', { carPrice: car.price, totalPoints: pts }) });
        }
        return { dist, opts };
    }

    let lastTowKey = '';
    function emitTowState(here) {
        const { dist, opts } = deliveryOptions(here);
        const owned = ownedCars();
        const eligible = !frozen && !turning && !glide.scene && mode !== 'glide' && mode !== 'jet'
            && ((mode !== 'bike' && !bikeConfiscated() && dist > 12) || (owned.length > 0 && mode !== 'bike'));
        const show = tow.active || eligible;
        const key = `${show}|${tow.active}|${opts.map((o) => `${o.kind}:${o.model || ''}:${o.cost}`).join(',')}`;
        if (key === lastTowKey) return;
        lastTowKey = key;
        document.dispatchEvent(new CustomEvent('wheelie:tow', {
            detail: { show, active: tow.active, distance: Math.round(dist), options: opts }
        }));
    }

    function requestDelivery(choice = null) {
        if (tow.active) {
            boostCinematic();
            return true;
        }
        if (frozen || turning || glide.scene || mode === 'glide' || mode === 'jet') return false;
        const here = getFocus();
        const { opts } = deliveryOptions(here);
        if (!opts.length) return false;
        const picked = choice
            ? opts.find((o) => o.kind === choice.kind && (o.model || null) === (choice.model || null))
            : opts.length === 1 ? opts[0] : null;
        if (!picked) {
            document.dispatchEvent(new CustomEvent('wheelie:tow-choose', { detail: { options: opts } }));
            return false;
        }
        if (totalPoints() < picked.cost) {
            toast('PAS ASSEZ DE POINTS', `Livraison : ${picked.cost.toLocaleString('fr-FR')} pts (tu as ${totalPoints().toLocaleString('fr-FR')} pts)`);
            audio.play('brake', { volume: 0.25, rate: 1.5 });
            return false;
        }
        if (walker.roof) toast('🚚 LIVRAISON EN BAS', 'La dépanneuse dépose ton véhicule dans la rue');
        tow.startDelivery({
            kind: picked.kind,
            model: picked.model,
            cost: picked.cost,
            playerPos: here,
            bikeGroup: bike,
            onDelivered: ({ kind, model, group, cost }) => {
                if (!spendPoints(cost)) finePoints(cost);
                stat('towDeliveries');
                if (kind === 'car' && group) dropped.push({ group, model });
            },
            onDone: () => { lastTowKey = ''; }
        });
        lastTowKey = '';
        emitTowState(here);
        return true;
    }
    document.addEventListener('wheelie:tow-request', (event) => requestDelivery(event.detail || null));

    return {
        move, update, action, clampBike, afterTurn, reset, tryBoost, boostState,
        startGlide, startJet, landJet,
        // The game tells how the bike rides (wheelie, speed in m/s).
        setRide(wheeling, speed) {
            ride.wheeling = wheeling;
            ride.speed = speed;
        },
        toggleJet: () => (mode === 'jet' ? landJet() : startJet()),
        get glideYaw() { return glide.yaw; },
        get jetYaw() { return jet.yaw; },
        // For the camera and the HUD: the jetpack's flight.
        get jetState() { return mode === 'jet' ? { speed: jet.speed, boost: jet.boost, height: jet.y - jet.ground, out: jet.out, climb: jet.vy } : null; },
        get onRoof() { return mode === 'walk' && !!walker.roof; },
        get gliderScene() { return glide.scene ? glide.scene.kind + ':' + glide.scene.step : glide.phase; },
        get gliding() { return mode === 'glide' || !!glide.scene; },
        // A fall on the bike: the nearest passer-by (20 m) says something.
        concern: (x, z) => talk.concern({ x, z }),
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
        get bikeVisible() { return (!bikeConfiscated() || patrol.towing) && mode !== 'glide' && !(glide.scene && glide.scene.step !== 'leave'); },
        fine,
        get carModel() { return mode === 'car' ? drive.model : null; },
        get reversing() { return mode === 'car' && drive.reversing; },
        get braking() { return mode === 'car' && drive.braking; },
        patrol, talk, people, traffic,
        // Tests: the player's position on foot.
        debug: { walker, drive, glide, jet },
        get mode() { return mode; },
        get focus() { return getFocus(); },
        get speed() { return mode === 'walk' ? walker.speed : mode === 'car' ? Math.abs(drive.speed) : mode === 'jet' ? Math.abs(jet.speed) / 60 : 0; },
        get carYaw() { return drive.yaw; }
    };
}
