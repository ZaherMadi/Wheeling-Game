// First: Sentry watches everything that follows (src/monitoring.js).
import { report, reportError, logEvent, setGameSnapshot, setGameTags, setPlayer, trackFrame, openFeedback, monitoringEnabled } from './src/monitoring.js';
import * as THREE from 'three';
import './src/style.css';
import voiceLineGroups from './src/voice-lines.json';
import soundEffects from './src/sound-effects.json';
import { createAudioEngine } from './src/audio-engine.js';
import { BIKE_RECOVERY_POINTS, addPoints, finePoints, releaseBike, syncPoints, totalPoints } from './src/v2/freeroam.js';
import { createPlayerVoice } from './src/player-voice.js';
import { renderTrophyRoom } from './src/trophy-room.js';
import { rewards } from './src/unlocks.js';
import { createSpeedLines } from './src/v2/speedlines.js';
import riderVoices from './src/rider-voices.json';

// Two versions share the same simulation, scoring and ranked replay:
// 'v2' (realistic city, new rider) and 'classic' (the original V1 look).
// The choice is stored per device; ?version=classic or ?version=v2 forces it.
const VERSION_KEY = 'wheelie_version';
const requestedVersion = new URLSearchParams(window.location.search).get('version');
if (requestedVersion === 'classic' || requestedVersion === 'v2') {
    localStorage.setItem(VERSION_KEY, requestedVersion);
}
const GAME_VERSION = localStorage.getItem(VERSION_KEY) === 'classic' ? 'classic' : 'v2';
const IS_V2 = GAME_VERSION === 'v2';
// Each version has its own leaderboard (and best score), same nickname.
const HIGH_SCORE_KEY = IS_V2 ? 'wheelie_high_score_v2' : 'wheelie_high_score';
// Only the selected version's visuals are downloaded.
const createRealisticVersion = IS_V2
    ? (await import('./src/v2/index.js')).createRealisticVersion
    : null;
let v2 = null;

const CONFIG = {
    laneWidth: 10,
    maxSpeed: 6.0,
    minSpeed: 0.0,
    baseAcceleration: 0.004,
    deceleration: 0.005,
    brakeForce: 0.03,
    lateralAccel: 0.04,
    lateralFriction: 0.92,
    maxLateralSpeed: 0.56,
    wheelieLift: 0.008,
    wheelieLiftFast: 0.012,
    gravity: 0.0015,
    balancePoint: 1.2,
    maxAngle: 1.6,
    sweetSpotWidth: 0.2,
    scoreMultiplier: 10,
    dayNightCycleDuration: 600,
    freeModeSpeed: 0.15,
    freeModeMaxSpeed: 3.0,
    freeModeAcceleration: 0.015,
    freeModeDeceleration: 0.01,
    freeModeBrakeForce: 0.04
};

const FIXED_STEP = 1 / 60;
const MAX_RANKED_FRAMES = 216000; // an hour (server: MAX_FRAMES)
// Ramps and tricks. The server replays these rules to verify ranked runs:
// keep them identical to 51GamesAPI/wheelie_replay.py.
const JUMP = {
    rampHeight: 1.2,
    gravity: 30 / 3600,
    minKmh: 30,
    // Phase 1 to 23 s, 2 s of calm, phase 2 (ramps) from 25 s to 43 s, 2 s
    // of calm, phase 3 from 45 s. The server allows them earlier (1200 /
    // 2100): it only checks nothing happens before.
    rampsFrom: 1500,
    groundTricksFrom: 2700,
    spacing: 30, // frames between a landing and the next takeoff (server: TAKEOFF_SPACING_FRAMES)
    groundTrickMaxAngle: 0.2,
    airRate: 8,
    groundRate: 3,
    landingRate: 12
};
const TAKEOFF_FLAG = 0x20;
const TRICK_FLAG = 0x40;
// Boost: a clean trick landing earns a charge (up to 3); firing one pushes
// the bike for 150 frames, then the speed gained drains away. Mirrored by
// the server replay as well.
const BOOST = { frames: 150, accel: 0.02, maxSpeed: 4.0, drain: 0.004, maxCharges: 3, rate: 6 };
const BOOST_FLAG = 0x80;
// Backflips (mirrored by wheelie_replay.py): from 130 km/h, in a wheelie at
// the takeoff with the wheelie button held. Holding it in the air turns the
// bike backwards: held all the way, one turn (two from 150 km/h). Let go,
// the bike turns back to the nearest whole turn (or level) at `settle` a
// frame. Slower than 130 km/h: an ordinary jump. Judged at touchdown on how
// far the bike is from a whole turn: `clean`, `bad` (fragile 4 s), else on
// its back (the run ends).
const FLIP = {
    minAngle: 0.35, kmh: 130, doubleKmh: 150, settle: 0.04, clean: 0.1, bad: 0.3,
    bonus: [0, 100, 200], trickBonus: [0, 150, 300], badFrames: 240
};
// In the air the wheelie no longer pivots on the rear wheel: the bike
// levels out (it can no longer go over the top in mid-air).
const AIR_LEVEL_RATE = 0.03;
// Too slow: under 50 km/h for more than 4 s, the police stop the run.
// Counted once 50 km/h has been reached (or from 10 s in); skids reset it.
const SLOW = { kmh: 50, frames: 240, armFrame: 600, warnFrames: 30 };
// The police chase (competitive). Under 50 km/h a siren is heard from far,
// then the patrol shows up (sooner if it was seen less than 20 s ago).
// From then on there are about 10 s to lose it: over 35 km/h it falls back,
// over 45 it is out of sight (the siren still on), at 50 it is gone; moving
// two metres further away sideways also gains time. It hits obstacles on its
// way, and gives up after three (until the next time under 50 km/h). The
// server only checks the floor of an arrest: minFrames under 45 km/h since
// the bike was last at 50 (wheelie_replay.py POLICE_FRAMES).
const POLICE = {
    recedeKmh: 35, hideKmh: 45, escapeSeconds: 10, longGap: 20,
    sirenLong: 7, appearLong: 12, sirenQuick: 3, appearQuick: 6,
    lateralEscape: 2, lane: 4.4, maxHits: 3, minFrames: 600
};
// Bavette (mirrored by wheelie_replay.py): a wheelie going over the top no
// longer ends the run at once. The tail scrapes the road, held at the top,
// for up to bavetteFrames() frames: fewer when the wheelie came up abruptly
// (none from fatalAv) or fast. Let go of the wheelie (or brake) and the
// bike drops back; hold it to the end and it goes over.
const BAVETTE = { gentleAv: 0.02, fatalAv: 0.12, maxFrames: 45, minFrames: 4, releaseAv: -0.012 };
// A plate on the bike (V2, unlocked at 4000 points): enough bavette in one
// run tears it off, +20 points once.
const PLATE = { wearFrames: 120, bonus: 20, unlockPoints: 4000 };
// Manual backflips (setting): every jump; holding the wheelie button turns
// the bike backwards, the brake forwards (60 % as fast), at a rate set by
// the takeoff speed. Judged on the bike's whole angle at touchdown.
const FLIP_MANUAL = { brake: 0.6, good: [-0.45, 1.1], bad: [-0.8, 1.6] };

function bavetteFrames(angularVelocity, kmh) {
    if (angularVelocity >= BAVETTE.fatalAv) return 0;
    const softness = 1.0 - Math.max(0.0, angularVelocity - BAVETTE.gentleAv) / (BAVETTE.fatalAv - BAVETTE.gentleAv);
    const speedFactor = Math.max(0.5, Math.min(1.0, 1.25 - kmh / 200));
    const frames = Math.floor(BAVETTE.maxFrames * softness * speedFactor);
    return frames >= BAVETTE.minFrames ? frames : 0;
}

function manualFlipRate(kmh) {
    if (kmh <= 80) return 0.0073 * Math.max(0.0, kmh) / 80;
    if (kmh <= 115) return 0.0073 + (kmh - 80) / 35 * (0.085 - 0.0073);
    return Math.min(0.16, 0.085 + (kmh - 115) * 0.0012);
}

function manualFlipLanding(totalAngle) {
    const whole = Math.floor(totalAngle / (2 * Math.PI) + 0.5);
    const off = totalAngle - 2 * Math.PI * whole;
    if (off >= FLIP_MANUAL.good[0] && off <= FLIP_MANUAL.good[1]) {
        return whole !== 0 ? ['clean', Math.min(Math.abs(whole), 2), whole < 0] : ['none', 0];
    }
    if (off >= FLIP_MANUAL.bad[0] && off <= FLIP_MANUAL.bad[1]) return ['bad', 0];
    return ['crash', 0];
}

function flightFrames(vy) {
    let y = JUMP.rampHeight;
    let frames = 0;
    while (true) {
        y += vy;
        vy -= JUMP.gravity;
        frames += 1;
        if (y <= 0) return frames;
    }
}

function flipTurnsFor(kmh) {
    return kmh >= FLIP.doubleKmh ? 2 : 1;
}

// Button released: one frame back towards the nearest whole turn.
function flipSettle(flipAngle) {
    const target = 2 * Math.PI * Math.floor(flipAngle / (2 * Math.PI) + 0.5);
    if (flipAngle < target) return Math.min(target, flipAngle + FLIP.settle);
    return Math.max(target, flipAngle - FLIP.settle);
}

function flipLanding(flipAngle) {
    const turns = flipAngle / (2 * Math.PI);
    const whole = Math.floor(turns + 0.5);
    const off = Math.abs(turns - whole);
    if (off > FLIP.bad) return ['crash', 0];
    if (off > FLIP.clean) return ['bad', 0];
    if (whole === 0) return ['none', 0];
    return ['clean', Math.min(whole, 2)];
}

// Speed bonus on the score: x1 at 20 km/h up to x1.5 from 200 km/h.
function speedMultiplier(kmh) {
    return 1.0 + 0.5 * Math.min(1.0, (kmh - 20) / 180);
}
const RAMP = { width: 4.4, length: 5.5 };
// The sides of the road. Obstacles stopped short of them (8.5 m at most,
// the bike goes to 9), so riding against a kerb dodged everything. Some now
// sit right against the kerb, and after 2.5 s spent on a side one is put
// ahead on it, about 2 s away: no more than ~5 s there without one.
const EDGE = { zone: 7.2, kerb: 9.3, share: 0.12, after: 150, leadSeconds: 2.2, minLead: 90, maxLead: 255 };
const edgeBox = new THREE.Box3();
const TRICK_TYPES = ['superman', 'nohander', 'cancan'];
const daytimeSky = new THREE.Color(0x87CEEB);
const nighttimeSky = new THREE.Color(0x0a0a2e);
const skyColor = new THREE.Color();

let state = {
    isPlaying: false,
    isPaused: false,
    userPaused: false,
    score: 0,
    highScore: parseInt(localStorage.getItem(HIGH_SCORE_KEY)) || 0,
    speed: 0,
    distance: 0,
    gameTime: 0,
    bike: {
        angle: 0,
        angularVelocity: 0,
        lateralVelocity: 0,
        maxWheelieTimer: 0, // Timer for max wheelie in free mode
    },
    wheeliePercentage: 0, // Pourcentage d'inclinaison du wheeling (0-100%)
    wheelieTime: 0, // Temps passé en wheeling à plus de 50%
    angleMultiplier: 1.0, // Multiplicateur basé sur l'angle (x1 à x2)
    timeMultiplier: 1.0, // Multiplicateur progressif basé sur le temps (x2 à x5)
    currentMultiplier: 1.0, // Multiplicateur total (angle × temps)
    lastTimeMultiplierDisplay: 0, // Dernier temps d'affichage du multiplicateur de temps
    keys: {
        left: false,
        right: false,
        up: false,
        down: false,
        space: false,
        trick: false,
        boost: false,
        run: false,
    },
    boost: { charges: 0, frames: 0, gain: 0, wasHeld: false },
    // Simulation frame of the run (the server counts the same frames).
    frame: 0,
    jump: { airborne: false, y: 0, vy: 0, trickFrames: 0, lastLanding: -1e9, pending: false, visualY: 0, flipActive: false, flipAngle: 0, flipRate: 0, flipKmh: 0 },
    trick: { active: false, type: 'superman', was: false, spin: 0 },
    ramps: [],
    rampFreeZones: [],
    gantries: [],
    quietZones: [],
    phase: 1,
    vulnerableUntil: -1,
    badLanding: 0,
    slow: { armed: false, frames: 0, policeFrames: 0 },
    police: { phase: 'idle', lastSeen: -1e9, gaveUp: false },
    // Secret code: tricks only (no police, unranked, a tenth of the score).
    tricksOnly: false,
    // Time spent against a side of the road, and the obstacle put there.
    edge: { frames: 0, pending: null },
    // Bavette (frames left while held, and in all) and this run's plate.
    bavette: { left: 0, total: 0 },
    plate: { on: false, off: false },
    // Backflip mode of this run (the setting when it started).
    flipMode: 'auto',
    obstacles: [],
    animatedObjects: [],
    graffitiList: [],
    trafficLightState: 0,
    trafficTimer: 0,
    trafficLights: [],
    clouds: [],
    birds: [],
    skidding: false,
    skidTimer: 0,
    runToken: null,
    inputLog: [],
    runReplayOverflow: false,
    rankedRunUnavailable: false,
    smokeParticles: [],
    freeMode: {
        speed: 0,
        roadCurve: 0,
        roadCurveTimer: 0,
        speedLines: []
    }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    precision: 'highp'
});
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.addEventListener('webglcontextlost', () => {
    report('render.webgl_lost', 'Contexte WebGL perdu', {
        level: 'error', once: true,
        details: { playing: state.isPlaying, seconds: Math.round(state.gameTime), quality: localStorage.getItem('wheelie_quality') || 'auto' },
    });
});

const container = document.getElementById('game-container');
if (container) {
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
}

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
if (!IS_V2) scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
if (!IS_V2) scene.add(dirLight);

// Materials
const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
const matLine = new THREE.MeshBasicMaterial({ color: 0xffffff });
const matSidewalk = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8 });
const matBuilding = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
const matBuilding2 = new THREE.MeshStandardMaterial({ color: 0xA9A9A9 });
const matBuilding3 = new THREE.MeshStandardMaterial({ color: 0xD2691E });
const matWindow = new THREE.MeshStandardMaterial({ color: 0x87CEEB, roughness: 0.2, metalness: 0.8 });
const matWindowLit = new THREE.MeshBasicMaterial({ color: 0xFFFFE0 });
const matTrashBag = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
const matBox = new THREE.MeshStandardMaterial({ color: 0xC19A6B });
const matTire = new THREE.MeshStandardMaterial({ color: 0x111111 });
const matPole = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 });
const matLightHousing = new THREE.MeshStandardMaterial({ color: 0x222222 });
const matBalcony = new THREE.MeshStandardMaterial({ color: 0x555555 });
const matSkin = new THREE.MeshStandardMaterial({ color: 0xF4C2A0 });
const matJersey = new THREE.MeshStandardMaterial({ color: 0xFFD700 });
const matPants = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
const matShoes = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
const matBillboardFrame = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 });
const matHazardLight = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
const matConstructionStripe = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
const matHole = new THREE.MeshBasicMaterial({ color: 0x000000 });
// Bike z at the previous camera update (declared early: resetGame clears it).
let lastCameraBikeZ = null;
// "Too slow" banner (see showPoliceWarning).
let policeWarning = null;
let policeWarningShown = -1;
// Secret code progress (see secretInput).
const secretCode = { step: 0, prev: { up: false, down: false, space: false } };
// Obstacles thrown by the bike (see knockObstacle).
const knockedObstacles = [];
const knockSize = new THREE.Vector3();
let speedLines = null;
// Free roam chase camera: its heading and the last followed position.
let freeCamYaw = null;
let freeCamLast = null;

const sharedMaterials = new Set([
    matAsphalt, matLine, matSidewalk, matBuilding, matBuilding2, matBuilding3,
    matWindow, matWindowLit, matTrashBag, matBox, matTire, matPole,
    matLightHousing, matBalcony, matSkin, matJersey, matPants, matShoes,
    matBillboardFrame, matHazardLight, matConstructionStripe, matHole
]);

function disposeObjectTree(root) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();

    root.traverse((object) => {
        if (object.geometry && !object.geometry.userData.shared) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.forEach((material) => {
            if (material && !sharedMaterials.has(material)) materials.add(material);
        });
    });

    materials.forEach((material) => {
        Object.values(material).forEach((value) => {
            if (value && value.isTexture) textures.add(value);
        });
    });
    geometries.forEach((geometry) => geometry.dispose());
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
}

let bikeGroup, bikePivot;
let groundChunks = [];

const smokeParticlePool = {
    geometry: new THREE.SphereGeometry(0.25, 8, 8),
    material: new THREE.MeshBasicMaterial({
        color: 0xaaaaaa,
        transparent: true
    })
};

function createTextTexture(text, bgColor, textColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 256);
    ctx.font = 'bold 60px Arial';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 128);
    return new THREE.CanvasTexture(canvas);
}

function createSpeedLimitTexture(limit) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, 2 * Math.PI);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.lineWidth = 25;
    ctx.strokeStyle = 'red';
    ctx.stroke();
    ctx.font = 'bold 100px Arial';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(limit, 128, 135);
    return new THREE.CanvasTexture(canvas);
}

function createJerseyTexture(isFront) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = 'bold 120px Arial';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('51', 128, 128);
    return new THREE.CanvasTexture(canvas);
}

function createBike() {
    if (v2) {
        bikeGroup = v2.rider.bikeGroup;
        bikePivot = v2.rider.bikePivot;
        return bikeGroup;
    }

    bikeGroup = new THREE.Group();
    bikePivot = new THREE.Group();
    bikeGroup.add(bikePivot);

    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().load('wheelie_rider_51.gltf', (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
            // Find wheels for animation
            if (child.name === 'BackWheel') {
                bikeGroup.userData.backWheel = child;
            }
            if (child.name === 'FrontWheel') {
                bikeGroup.userData.frontWheel = child;
            }
        });

        // Scale and position adjustments
        model.scale.set(1.5, 1.5, 1.5);
        model.position.y = 0.5; // Raised higher (10cm more)
        model.rotation.y = 0; // Will be set per mode in resetGame
        model.rotation.x = 0.55; // 90 degree forward tilt (π/2 radians)

        bikePivot.add(model);
        if (!state.isPlaying) renderer.render(scene, camera);

    }, undefined, (error) => {
        console.error('An error happened loading the bike model:', error);
        reportError('asset.model', error, { once: true });
    }));

    return bikeGroup;
}

function createCloud() {
    const cloud = new THREE.Group();
    const size = 1 + Math.random() * 4;
    for (let i = 0; i < 5; i++) {
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(size + Math.random() * size, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
        );
        sphere.position.set((Math.random() - 0.5) * size * 3, (Math.random() - 0.5) * size, (Math.random() - 0.5) * size * 2);
        cloud.add(sphere);
    }
    cloud.position.set((Math.random() - 0.5) * 200, 40 + Math.random() * 30, -100 - Math.random() * 100);
    cloud.userData.speed = 0.01 + Math.random() * 0.02;
    return cloud;
}

function createBird() {
    const bird = new THREE.Group();
    const bodyGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0x333333 }));
    bird.add(body);
    const wingGeo = new THREE.BoxGeometry(1.5, 0.05, 0.4);
    const wing = new THREE.Mesh(wingGeo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
    wing.position.set(0, 0, 0);
    bird.add(wing);
    bird.userData.wing = wing;
    bird.userData.wingAngle = 0;
    bird.userData.speed = 0.1 + Math.random() * 0.1;
    bird.position.set((Math.random() - 0.5) * 100, 15 + Math.random() * 10, -50 - Math.random() * 50);
    return bird;
}

function createGlassTower(width, height, depth) {
    const group = new THREE.Group();
    group.userData.height = height;
    const geo = new THREE.BoxGeometry(width, height, depth);
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        metalness: 0.1,
        roughness: 0.2,
        transparent: true,
        opacity: 0.7
    });
    const mesh = new THREE.Mesh(geo, glassMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const frameGeo = new THREE.BoxGeometry(width + 0.2, height, depth + 0.2);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.3 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    group.add(frame);
    const lightCount = Math.floor(height / 3);
    const lightGeo = new THREE.BoxGeometry(1, 1, 1);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    for (let i = 0; i < lightCount; i++) {
        if (Math.random() > 0.3) {
            const lightMesh = new THREE.Mesh(lightGeo, lightMat);
            lightMesh.position.set(
                (Math.random() - 0.5) * (width - 2),
                (Math.random() - 0.5) * (height - 2),
                (Math.random() - 0.5) * (depth - 2)
            );
            group.add(lightMesh);
        }
    }
    return group;
}

function createDetailedBuilding(width, height, depth, colorMat) {
    const building = new THREE.Group();
    building.userData.height = height;
    const mainGeo = new THREE.BoxGeometry(width, height, depth);
    const mainMesh = new THREE.Mesh(mainGeo, colorMat);
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;
    building.add(mainMesh);
    const roofGeo = new THREE.BoxGeometry(width + 0.5, 0.5, depth + 0.5);
    const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    roofMesh.position.y = height / 2 + 0.25;
    building.add(roofMesh);
    const windowGeo = new THREE.PlaneGeometry(1.2, 1.8);
    const rows = Math.floor(height / 3);
    const cols = Math.floor(width / 2.5);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const isLit = Math.random() > 0.7;
            const winMesh = new THREE.Mesh(windowGeo, isLit ? matWindowLit : matWindow);
            winMesh.position.set(
                (c - (cols - 1) / 2) * 2.5,
                (r - (rows - 1) / 2) * 3,
                depth / 2 + 0.05
            );
            building.add(winMesh);
            if (Math.random() > 0.8) {
                const balconyGeo = new THREE.BoxGeometry(1.4, 0.1, 0.5);
                const balcony = new THREE.Mesh(balconyGeo, matBalcony);
                balcony.position.set(winMesh.position.x, winMesh.position.y - 1.0, depth / 2 + 0.25);
                building.add(balcony);
            }
        }
    }
    return building;
}

function createSidewalkBillboard(text) {
    const group = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.15, 2.5, 0.15);
    const leg1 = new THREE.Mesh(legGeo, matBillboardFrame);
    leg1.position.set(-2.0, 1.25, 0);
    group.add(leg1);
    const leg2 = new THREE.Mesh(legGeo, matBillboardFrame);
    leg2.position.set(2.0, 1.25, 0);
    group.add(leg2);
    const frameGeo = new THREE.BoxGeometry(4.5, 3, 0.3);
    const frame = new THREE.Mesh(frameGeo, matBillboardFrame);
    frame.position.set(0, 2.8, 0);
    group.add(frame);
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const tex = createTextTexture(text, '#ffffff', randomColor);
    const faceGeo = new THREE.PlaneGeometry(4.2, 2.7);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 2.8, 0.16);
    group.add(face);
    const backFace = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ color: 0x555555 }));
    backFace.position.set(0, 2.8, -0.16);
    backFace.rotation.y = Math.PI;
    group.add(backFace);
    return group;
}

function createOverheadSign(text) {
    const group = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.3, 0.3, 8);
    const poleLeft = new THREE.Mesh(poleGeo, matPole);
    poleLeft.position.set(-12, 4, 0);
    group.add(poleLeft);
    const poleRight = new THREE.Mesh(poleGeo, matPole);
    poleRight.position.set(12, 4, 0);
    group.add(poleRight);
    const beamGeo = new THREE.BoxGeometry(26, 0.5, 0.5);
    const beam = new THREE.Mesh(beamGeo, matPole);
    beam.position.set(0, 7, 0);
    group.add(beam);
    const boardW = 14;
    const boardH = 4;
    const boardGeo = new THREE.BoxGeometry(boardW, boardH, 0.2);
    const board = new THREE.Mesh(boardGeo, new THREE.MeshStandardMaterial({ color: 0x003399 }));
    board.position.set(0, 7.5, 0.3);
    group.add(board);
    const tex = createTextTexture(text, '#003399', '#ffffff');
    const faceGeo = new THREE.PlaneGeometry(boardW - 0.5, boardH - 0.5);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 7.5, 0.41);
    group.add(face);
    return group;
}

function createSpeedLimitSign(limit) {
    const group = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 4);
    const pole = new THREE.Mesh(poleGeo, matPole);
    pole.position.set(0, 2, 0);
    group.add(pole);
    const signGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 32);
    signGeo.rotateX(Math.PI / 2);
    const tex = createSpeedLimitTexture(limit);
    const signMat = new THREE.MeshBasicMaterial({ map: tex });
    const sign = new THREE.Mesh(signGeo, [new THREE.MeshBasicMaterial({ color: 0xcccccc }), new THREE.MeshBasicMaterial({ color: 0xcccccc }), signMat]);
    sign.position.set(0, 3.5, 0.1);
    group.add(sign);
    return group;
}

function createHazardCar() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(4, 1.2, 2);
    const color = Math.random() * 0xffffff;
    const bodyMat = new THREE.MeshStandardMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    group.add(body);
    const cabinGeo = new THREE.BoxGeometry(2.5, 0.8, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(-0.2, 1.6, 0);
    group.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const w1 = new THREE.Mesh(wheelGeo, wheelMat); w1.rotation.x = Math.PI / 2; w1.position.set(-1.2, 0.4, 1); group.add(w1);
    const w2 = new THREE.Mesh(wheelGeo, wheelMat); w2.rotation.x = Math.PI / 2; w2.position.set(1.2, 0.4, 1); group.add(w2);
    const w3 = new THREE.Mesh(wheelGeo, wheelMat); w3.rotation.x = Math.PI / 2; w3.position.set(-1.2, 0.4, -1); group.add(w3);
    const w4 = new THREE.Mesh(wheelGeo, wheelMat); w4.rotation.x = Math.PI / 2; w4.position.set(1.2, 0.4, -1); group.add(w4);
    const lightGeo = new THREE.SphereGeometry(0.15);
    const l1 = new THREE.Mesh(lightGeo, matHazardLight); l1.position.set(-1.9, 0.8, 0.8); group.add(l1);
    const l2 = new THREE.Mesh(lightGeo, matHazardLight); l2.position.set(-1.9, 0.8, -0.8); group.add(l2);
    const l3 = new THREE.Mesh(lightGeo, matHazardLight); l3.position.set(1.9, 0.8, 0.8); group.add(l3);
    const l4 = new THREE.Mesh(lightGeo, matHazardLight); l4.position.set(1.9, 0.8, -0.8); group.add(l4);
    group.userData.lights = [l1, l2, l3, l4];
    state.animatedObjects.push(group);
    return group;
}

function createConstructionZone() {
    const group = new THREE.Group();
    const barrierGeo = new THREE.BoxGeometry(3, 1, 0.2);
    const barrier = new THREE.Mesh(barrierGeo, matConstructionStripe);
    barrier.position.set(0, 0.5, 0);
    group.add(barrier);
    const holeGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.1, 16);
    const hole = new THREE.Mesh(holeGeo, matHole);
    hole.position.set(0, 0.05, 2);
    group.add(hole);
    return group;
}

function createBench() {
    const group = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.1, 0.5, 0.4);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const l1 = new THREE.Mesh(legGeo, legMat); l1.position.set(-0.8, 0.25, 0); group.add(l1);
    const l2 = new THREE.Mesh(legGeo, legMat); l2.position.set(0.8, 0.25, 0); group.add(l2);
    const slatGeo = new THREE.BoxGeometry(1.8, 0.05, 0.1);
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    for (let i = 0; i < 3; i++) {
        const seat = new THREE.Mesh(slatGeo, slatMat);
        seat.position.set(0, 0.5, -0.15 + i * 0.15);
        group.add(seat);
    }
    for (let i = 0; i < 2; i++) {
        const back = new THREE.Mesh(slatGeo, slatMat);
        back.position.set(0, 0.8 + i * 0.15, -0.2);
        back.rotation.x = 0.2;
        group.add(back);
    }
    return group;
}

function createDetailedTrashCan() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x006400, metalness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    group.add(body);
    const lidGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 16);
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = 0.85;
    group.add(lid);
    return group;
}

function createTriangleSign() {
    const group = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2);
    const pole = new THREE.Mesh(poleGeo, matPole);
    pole.position.y = 1;
    group.add(pole);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.6);
    shape.lineTo(0.5, -0.3);
    shape.lineTo(-0.5, -0.3);
    shape.lineTo(0, 0.6);
    const geom = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide });
    const triangle = new THREE.Mesh(geom, mat);
    triangle.position.y = 2;
    group.add(triangle);
    const markGeo = new THREE.PlaneGeometry(0.1, 0.4);
    const markMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const mark = new THREE.Mesh(markGeo, markMat);
    mark.position.set(0, 2.1, 0.01);
    group.add(mark);
    const dotGeo = new THREE.PlaneGeometry(0.1, 0.1);
    const dot = new THREE.Mesh(dotGeo, markMat);
    dot.position.set(0, 1.8, 0.01);
    group.add(dot);
    return group;
}

function createBarrier() {
    const group = new THREE.Group();
    const footGeo = new THREE.BoxGeometry(0.4, 0.1, 0.4);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const f1 = new THREE.Mesh(footGeo, footMat); f1.position.set(-1, 0.05, 0); group.add(f1);
    const f2 = new THREE.Mesh(footGeo, footMat); f2.position.set(1, 0.05, 0); group.add(f2);
    const panelGeo = new THREE.BoxGeometry(2.2, 0.8, 0.1);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 0.5, 0);
    group.add(panel);
    const stripeGeo = new THREE.PlaneGeometry(0.3, 0.8);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(stripeGeo, stripeMat);
        s.position.set(-0.6 + i * 0.6, 0.5, 0.06);
        s.rotation.z = -0.5;
        group.add(s);
    }
    return group;
}

function createGroundChunk(zPos) {
    const chunk = new THREE.Group();
    chunk.position.z = zPos;
    const roadGeo = new THREE.PlaneGeometry(20, 100);
    roadGeo.rotateX(-Math.PI / 2);
    const road = new THREE.Mesh(roadGeo, matAsphalt);
    road.receiveShadow = true;
    chunk.add(road);
    const lineGeo = new THREE.PlaneGeometry(0.2, 100);
    lineGeo.rotateX(-Math.PI / 2);
    const line = new THREE.Mesh(lineGeo, matLine);
    line.position.y = 0.02;
    chunk.add(line);
    const swGeo = new THREE.PlaneGeometry(10, 100);
    swGeo.rotateX(-Math.PI / 2);
    const lSw = new THREE.Mesh(swGeo, matSidewalk);
    lSw.position.set(-15, 0.05, 0);
    lSw.receiveShadow = true;
    chunk.add(lSw);
    const rSw = new THREE.Mesh(swGeo, matSidewalk);
    rSw.position.set(15, 0.05, 0);
    rSw.receiveShadow = true;
    chunk.add(rSw);
    const curbGeo = new THREE.BoxGeometry(0.5, 0.15, 100);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const curbLeft = new THREE.Mesh(curbGeo, curbMat);
    curbLeft.position.set(-10.25, 0.075, 0);
    chunk.add(curbLeft);
    const curbRight = new THREE.Mesh(curbGeo, curbMat);
    curbRight.position.set(10.25, 0.075, 0);
    chunk.add(curbRight);
    const buildingCount = isMobile() ? 4 : 6;
    for (let i = 0; i < buildingCount; i++) {
        const isTower = Math.random() > 0.7;
        let bLeft, bRight;
        if (isTower) {
            const height = 30 + Math.random() * 30;
            const width = 8 + Math.random() * 5;
            const depth = 8 + Math.random() * 5;
            bLeft = createGlassTower(width, height, depth);
            bRight = createGlassTower(width, height, depth);
        } else {
            const height = 10 + Math.random() * 20;
            const width = 5 + Math.random() * 5;
            const depth = 5 + Math.random() * 5;
            const mat = [matBuilding, matBuilding2, matBuilding3][Math.floor(Math.random() * 3)];
            bLeft = createDetailedBuilding(width, height, depth, mat);
            bRight = createDetailedBuilding(width, height, depth, mat);
        }
        bLeft.position.set(-25 - Math.random() * 10, bLeft.userData.height / 2, (Math.random() - 0.5) * 90);
        chunk.add(bLeft);
        bRight.position.set(25 + Math.random() * 10, bRight.userData.height / 2, (Math.random() - 0.5) * 90);
        chunk.add(bRight);
    }
    if (Math.random() > 0.7) {
        const bench = createBench();
        bench.position.set(-13, 0, (Math.random() - 0.5) * 80);
        bench.rotation.y = Math.PI / 2;
        chunk.add(bench);
    }
    if (Math.random() > 0.7) {
        const trash = createDetailedTrashCan();
        trash.position.set(14, 0, (Math.random() - 0.5) * 80);
        chunk.add(trash);
    }
    if (Math.random() > 0.9 && state.graffitiList.length > 0) {
        const text = state.graffitiList[Math.floor(Math.random() * state.graffitiList.length)];
        const sign = createOverheadSign(text);
        sign.position.set(0, 0, 0);
        chunk.add(sign);
    }
    if (Math.random() > 0.8) {
        const limit = Math.random() > 0.5 ? "90" : "110";
        const sign = createSpeedLimitSign(limit);
        sign.position.set(12, 0, (Math.random() - 0.5) * 40);
        sign.rotation.y = -Math.PI / 2;
        chunk.add(sign);
    }
    if (Math.random() > 0.85) {
        const car = createHazardCar();
        car.position.set(13, 0, (Math.random() - 0.5) * 60);
        car.rotation.y = Math.PI;
        chunk.add(car);
    }
    if (state.graffitiList && state.graffitiList.length > 0) {
        if (Math.random() > 0.6) {
            const text = state.graffitiList[Math.floor(Math.random() * state.graffitiList.length)];
            const bb = createSidewalkBillboard(text);
            bb.position.set(-13, 0, (Math.random() - 0.5) * 80);
            bb.rotation.y = Math.PI / 2;
            chunk.add(bb);
        }
        if (Math.random() > 0.6) {
            const text = state.graffitiList[Math.floor(Math.random() * state.graffitiList.length)];
            const bb = createSidewalkBillboard(text);
            bb.position.set(13, 0, (Math.random() - 0.5) * 80);
            bb.rotation.y = -Math.PI / 2;
            chunk.add(bb);
        }
    }
    const streetlightCount = isMobile() ? 1 : 2;
    for (let i = 0; i < streetlightCount; i++) {
        const z = (Math.random() - 0.5) * 80;
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 6);
        const pole = new THREE.Mesh(poleGeo, matPole);
        pole.position.set(-10.5, 3, z);
        chunk.add(pole);
        const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 2);
        const arm = new THREE.Mesh(armGeo, matPole);
        arm.position.set(-9.5, 5.8, z);
        arm.rotation.z = -Math.PI / 2;
        chunk.add(arm);
        const housingGeo = new THREE.BoxGeometry(0.4, 0.2, 0.3);
        const housing = new THREE.Mesh(housingGeo, matLightHousing);
        housing.position.set(-8.5, 5.7, z);
        chunk.add(housing);
        const spot = new THREE.SpotLight(0xffaa00, 0.5);
        spot.position.set(-8.5, 5.6, z);
        spot.distance = 24;
        spot.target.position.set(-8.5, 0, z);
        spot.angle = Math.PI / 4;
        spot.penumbra = 0.5;
        chunk.add(spot);
        chunk.add(spot.target);
    }
    return chunk;
}

// Ground blocks: built on demand in classic, recycled from a pool in V2.
function makeChunk(zPos) {
    return v2 ? v2.world.acquireChunk(zPos) : createGroundChunk(zPos);
}

function dropChunk(chunk) {
    scene.remove(chunk);
    if (v2) v2.world.releaseChunk(chunk);
    else disposeObjectTree(chunk);
}

// side: -1 / 1 puts it against that kerb; otherwise now and then anyway.
function spawnObstacle(zPos, side = 0) {
    const type = Math.random();
    let obs;
    if (v2) {
        // Same odds, footprints and placement as the classic obstacles.
        if (type < 0.15) {
            obs = v2.world.createObstacle('construction');
            obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
        } else if (type < 0.3) {
            obs = v2.world.createObstacle('sign');
            obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
            obs.rotation.y = (Math.random() - 0.5) * 0.5;
        } else if (type < 0.45) {
            obs = v2.world.createObstacle('barrier');
            obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
            obs.rotation.y = (Math.random() - 0.5) * 0.5;
        } else {
            obs = v2.world.createObstacle(type < 0.6 ? 'crate' : type < 0.8 ? 'bag' : 'cone');
            obs.position.set((Math.random() - 0.5) * 16, 0.5, zPos);
            obs.rotation.y = Math.random() * Math.PI;
        }
    } else if (type < 0.15) {
        obs = createConstructionZone();
        obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
    } else if (type < 0.3) {
        obs = createTriangleSign();
        obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
        obs.rotation.y = (Math.random() - 0.5) * 0.5;
    } else if (type < 0.45) {
        obs = createBarrier();
        obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
        obs.rotation.y = (Math.random() - 0.5) * 0.5;
    } else if (type < 0.6) {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        obs = new THREE.Mesh(geo, matBox);
        obs.position.set((Math.random() - 0.5) * 16, 0.5, zPos);
    } else if (type < 0.8) {
        const geo = new THREE.SphereGeometry(0.5, 16, 16);
        obs = new THREE.Mesh(geo, matTrashBag);
        obs.position.set((Math.random() - 0.5) * 16, 0.5, zPos);
    } else {
        const geo = new THREE.CylinderGeometry(0.2, 0.2, 1);
        obs = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff4400 }));
        obs.position.set((Math.random() - 0.5) * 16, 0.5, zPos);
    }
    if (!side && Math.random() < EDGE.share) side = Math.random() < 0.5 ? -1 : 1;
    if (side) {
        // Its outer edge where a bike hugging that side rides.
        obs.updateMatrixWorld(true);
        edgeBox.setFromObject(obs);
        const outer = EDGE.kerb - Math.random() * 0.35;
        obs.position.x += side > 0 ? outer - edgeBox.max.x : -outer - edgeBox.min.x;
    }
    obs.castShadow = true;
    obs.updateMatrixWorld(true);
    scene.add(obs);
    const record = { mesh: obs, box: new THREE.Box3().setFromObject(obs), active: true };
    state.obstacles.push(record);
    return record;
}

function createCheckpoint() {
    const group = new THREE.Group();
    const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    pole1.position.set(-5, 2, 0);
    group.add(pole1);
    const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    pole2.position.set(5, 2, 0);
    group.add(pole2);
    const signTex = createTextTexture('DRIVE SAFE', '#00ff00', '#000000');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 4, 0);
    sign.rotation.y = Math.PI;
    group.add(sign);
    group.position.set(0, 0, 10);
    scene.add(group);
}

function createSparkParticle() {
    if (v2) {
        v2.spark();
        return;
    }
    // Create tiny yellow spark particle - mini explosion effect
    const geo = new THREE.SphereGeometry(0.05, 4, 4); // Very small
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffff00, // Yellow
        transparent: true,
        opacity: 1
    });
    const spark = new THREE.Mesh(geo, mat);

    // Position FIXED in space (not relative to bike) - within wheel width
    const currentX = bikeGroup.position.x;
    const currentZ = bikeGroup.position.z;
    spark.position.set(
        currentX + (Math.random() - 0.5) * 0.3, // Wheel width only (~30cm)
        0.1, // Just above ground
        currentZ + (Math.random() - 0.5) * 0.3
    );

    scene.add(spark);

    // Remove spark quickly (mini explosion effect)
    setTimeout(() => {
        scene.remove(spark);
        disposeObjectTree(spark);
    }, 150); // 0.15 seconds - disappears faster
}


async function loadGraffiti() {
    try {
        const res = await fetch('/graffiti.json');
        if (res.ok) {
            const data = await res.json();
            state.graffitiList = data;
        }
    } catch (e) {
        console.error("Could not load graffiti.json", e);
        reportError('asset.data', e, { once: true, details: { file: 'graffiti.json' } });
    }
}

function init() {
    // The classic version keeps its original badge.
    if (!IS_V2) document.getElementById('menu-logo')?.setAttribute('src', '/Logo51.png');
    if (IS_V2) {
        v2 = createRealisticVersion({ scene, renderer, camera, mobile: isMobile(), audio, playerVoice, onTurn: (sign) => changeStreet(sign) });
        v2.world.sharedMaterials.forEach((material) => sharedMaterials.add(material));
    }
    const bike = createBike();
    scene.add(bike);
    for (let i = 0; i < 5; i++) {
        const chunk = makeChunk(-i * 100);
        scene.add(chunk);
        groundChunks.push(chunk);
    }
    if (!IS_V2) {
        for (let i = 0; i < 10; i++) {
            const cloud = createCloud();
            scene.add(cloud);
            state.clouds.push(cloud);
        }
        for (let i = 0; i < 5; i++) {
            const bird = createBird();
            scene.add(bird);
            state.birds.push(bird);
        }
        createCheckpoint();
    }
    loadGraffiti();
    state.highScore = parseInt(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    const highScoreEl = document.getElementById('high-score-display');
    if (highScoreEl) {
        highScoreEl.innerText = `MEILLEUR: ${state.highScore}`;
        highScoreEl.style.display = 'block';
    }
    GAME_SETTINGS.controlMode = 'analog';
    document.querySelectorAll('.setting-btn').forEach(b => b.classList.remove('active'));
    const analogBtn = document.getElementById('control-analog');
    if (analogBtn) analogBtn.classList.add('active');
    setVoiceEnabled(GAME_SETTINGS.voiceEnabled);
    setSfxEnabled(GAME_SETTINGS.sfxEnabled);
    updateLanguageButtons();
    if (IS_V2) mountRiderVoicePicker();
    applyGraphicsQuality();
    getAudioManifest().then(() => {
        // After the first frame: decoding competes with building the city.
        const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 400));
        idle(() => warmUpVoices());
    });
    updateVersionUI();
    if (IS_V2) {
        // Menu backdrop: a three-quarter view of the rider on the wet street.
        bikeGroup.rotation.set(0, Math.PI, 0);
        camera.position.set(3.2, 2.5, 7.6);
        camera.lookAt(3.9, 1.7, -10);
        v2.frame(0, visualSnapshot());
        renderer.render(scene, camera);
    } else {
        renderScene(0);
    }
}

// Free roam bike (V2): world units are metres. Gas pulls harder the longer
// it is held, up to a realistic top speed; the bike steers like a bike.
const FREE_BIKE = { top: 38.9, boostTop: 52, brake: 11, coast: 1.3, drag: 0.0007, reverse: 1.6 };
const freeRide = { speed: 0, hold: 0, gas: 0, steer: 0 };

// Free roam falls on the bike. Over 100 km/h into the front or the back of
// a car: thrown over the bars. Into its side: a skid, and another car
// during the skid is a fall. A fall costs 50 points and 10 s: the rider
// gets up, walks to the bike, lifts it and gets back on.
const ROAM_FALL = { kmh: 100, skidSeconds: 2.5, points: 50, seconds: 10 };
const roamFall = { active: false, t: 0, phase: '', skid: 0, target: new THREE.Vector3(), at: new THREE.Vector3(), yaw: 0 };

function roamImpact(hit, v, roam) {
    const kmh = Math.abs(v) * 3.6;
    if (hit.hitSide === 'end' && kmh > ROAM_FALL.kmh) {
        startRoamFall(v, false, roam);
        return 0;
    }
    if (hit.hitSide === 'side' && kmh > 25) {
        // Still against the same car: just slowed down.
        if (roamFall.skid > 0 && hit === roamFall.skidCar) return v * 0.97;
        if (roamFall.skid > 0) {
            startRoamFall(v, true, roam);
            return 0;
        }
        roamFall.skid = ROAM_FALL.skidSeconds;
        roamFall.skidCar = hit;
        audio.play('skid', { volume: 0.6 });
        toast('DÉRAPAGE !', 'Encore une voiture et c’est la chute', { discreet: true, float: true });
        return v * 0.6;
    }
    return v * 0.35;
}

function startRoamFall(v, skidding, roam) {
    if (!v2) return;
    roamFall.active = true;
    roamFall.t = 0;
    roamFall.phase = 'crash';
    roamFall.skid = 0;
    freeRide.speed = 0;
    const unitsPerSecond = Math.abs(v);
    v2.rider.startCrash('hit', unitsPerSecond, {
        kmh: unitsPerSecond * 3.6, skidding, steer: freeRide.steer, angleRatio: 0
    });
    audio.play('collision', { volume: 0.9 });
    audio.play(unitsPerSecond * 3.6 > 90 ? 'bike_fall_fast' : 'bike_fall', { volume: 0.75, delay: 0.15 });
    const lost = finePoints(ROAM_FALL.points);
    document.dispatchEvent(new CustomEvent('wheelie:points'));
    toast(lost ? `-${lost} PTS` : 'CHUTE !', `Chute · tu te relèves (${ROAM_FALL.seconds} s)`);
    // Someone nearby asks if he is all right.
    setTimeout(() => {
        const at = bikeGroup.position;
        roam.concern(at.x, at.z);
    }, 1400);
}

// One frame of the fall and of getting back on.
function updateRoamFall(dt) {
    const rider = v2.rider;
    roamFall.t += dt;
    const t = roamFall.t;
    const bike = bikeGroup.position;
    if (roamFall.phase === 'crash') {
        rider.updateCrash(dt);
        if (t > 3.4) {
            // Gets up where he landed, facing the bike.
            rider.riderPosition(roamFall.at);
            rider.finishCrash();
            roamFall.yaw = Math.atan2(bike.x - roamFall.at.x, bike.z - roamFall.at.z);
            rider.dismount(roamFall.at.x, roamFall.at.z, roamFall.yaw);
            roamFall.phase = 'walk';
        }
    } else if (roamFall.phase === 'walk') {
        // Walks back to the bike (to its side).
        roamFall.target.set(bike.x + Math.cos(bikeGroup.rotation.y) * 0.9, 0, bike.z - Math.sin(bikeGroup.rotation.y) * 0.9);
        const dx = roamFall.target.x - roamFall.at.x;
        const dz = roamFall.target.z - roamFall.at.z;
        const distance = Math.hypot(dx, dz);
        // Jogs back when far, walks the last metres.
        const pace = distance > 3 ? 4.2 : 1.8;
        const step = Math.min(distance, pace * dt);
        if (distance > 0.05) {
            roamFall.at.x += (dx / distance) * step;
            roamFall.at.z += (dz / distance) * step;
            roamFall.yaw = Math.atan2(dx, dz);
        }
        rider.updateWalk(dt, roamFall.at.x, roamFall.at.z, roamFall.yaw, distance > 0.05 ? pace / 60 : 0, 0, pace > 2);
        if (distance <= 0.05 || t > 8.2) {
            // Never left far away: the last bit is skipped.
            roamFall.at.copy(roamFall.target);
            roamFall.phase = 'lift';
        }
    } else if (roamFall.phase === 'lift') {
        // Puts the bike back on its wheels.
        const k = 1 - Math.exp(-dt * 3);
        bikeGroup.rotation.z += (0 - bikeGroup.rotation.z) * k;
        bikeGroup.rotation.x += (0 - bikeGroup.rotation.x) * k;
        bikePivot.rotation.x += (0 - bikePivot.rotation.x) * k;
        bikeGroup.position.y += (0 - bikeGroup.position.y) * k;
        const toBike = Math.atan2(bike.x - roamFall.at.x, bike.z - roamFall.at.z);
        rider.updateWalk(dt, roamFall.at.x, roamFall.at.z, toBike, 0);
        if (t > ROAM_FALL.seconds) {
            bikeGroup.rotation.set(0, bikeGroup.rotation.y, 0);
            bikePivot.rotation.x = 0;
            bikeGroup.position.y = 0;
            rider.reset();
            roamFall.active = false;
            toast('C’EST REPARTI', 'De retour sur la moto', { discreet: true, float: true });
        }
    }
}

function rideFreeBike(dt, roam) {
    if (roamFall.active) {
        updateRoamFall(dt);
        freeRide.speed = 0;
        return 0;
    }
    roamFall.skid = Math.max(0, roamFall.skid - dt);
    let gas = 0;
    let brake = 0;
    let steer = 0;
    if (GAME_SETTINGS.controlMode === 'analog' && analogData.active) {
        steer = Math.max(-1, Math.min(1, analogData.x * 1.2));
        if (analogData.y < -0.12) gas = Math.min(1, -analogData.y * 1.3);
        else if (analogData.y > 0.35) brake = Math.min(1, analogData.y);
    }
    if (state.keys.up) gas = 1;
    if (state.keys.down) brake = 1;
    if (state.keys.left) steer = -1;
    if (state.keys.right) steer = 1;
    if (roam.frozen) {
        gas = 0;
        brake = 1;
        steer = 0;
    }
    const boosting = roam.boostFactor > 1;
    const top = boosting ? FREE_BIKE.boostTop : FREE_BIKE.top;
    let v = freeRide.speed;
    // Gas while rolling back: stop that first.
    if (gas > 0 && v < 0) v = Math.min(0, v + 6 * dt);
    if (gas > 0 && v >= -0.05) {
        freeRide.hold += dt;
        const pull = (3 + Math.min(9, freeRide.hold * 4)) * gas;
        v += pull * Math.max(0, 1 - Math.pow(Math.max(0, v) / top, 3)) * dt;
    } else {
        freeRide.hold = Math.max(0, freeRide.hold - dt * 3);
    }
    if (boosting && v < top) v += 6 * dt;
    if (brake > 0) {
        // Stopped, brake still held for a moment: the bike is walked back.
        freeRide.stopped = v <= 0.2 ? (freeRide.stopped || 0) + dt : 0;
        if (v > 0.2) v = Math.max(0, v - FREE_BIKE.brake * brake * dt);
        else if (freeRide.stopped > 0.8) v = Math.max(-FREE_BIKE.reverse, v - 2 * dt);
        else v = Math.min(v, 0);
    } else if (gas === 0) {
        const slow = (FREE_BIKE.coast + FREE_BIKE.drag * v * v) * dt;
        v = v > 0 ? Math.max(0, v - slow) : Math.min(0, v + 3 * dt);
    }
    // After a boost: back down to the normal top speed.
    if (v > top) v = Math.max(top, v - 5 * dt);
    // Held by the police: brought to a stop at once (like the car).
    if (roam.frozen) v = 0;
    // Bars: tight at walking pace, gentler at speed (reversed when backing up).
    const pace = Math.min(1, Math.abs(v) / 25);
    const rate = (Math.abs(v) < 0.3 ? 1.1 : 2.3 - 1.4 * pace) * steer;
    bikeGroup.rotation.y -= rate * dt * (v < -0.05 ? -1 : 1);
    const heading = bikeGroup.rotation.y;
    bikeGroup.position.x += Math.sin(heading) * v * dt;
    bikeGroup.position.z += Math.cos(heading) * v * dt;
    // Side streets open the way; traffic stops the bike dead.
    const hit = roam.clampBike(bikeGroup.position);
    if (hit) v = roamImpact(hit, v, roam);
    freeRide.speed = v;
    freeRide.gas = gas;
    freeRide.steer = steer * Math.min(1, Math.abs(v) / 4);
    return Math.abs(v) / 60;
}

function badLandingWobble() {
    return state.badLanding > 0 ? Math.sin(state.gameTime * 19) * 0.32 * Math.min(1, state.badLanding / 0.6) : 0;
}

// Speed shown and heard. Free roam (V2) is life size: metres per second.
function speedKmh() {
    if (GAME_SETTINGS.gameMode !== 'free') return state.speed * 50;
    return IS_V2 ? state.freeMode.speed * 216 : state.freeMode.speed * 50;
}

// Speed / input picture of the current frame for the visuals and the audio.
function visualSnapshot() {
    const free = GAME_SETTINGS.gameMode === 'free';
    const analogThrottle = analogData.active && analogData.y < -0.1;
    let throttle = 0;
    if (state.isPlaying && !state.isPaused && !state.skidding) {
        if (state.keys.up || (GAME_SETTINGS.autoRace && autoRaceActive && !free)) throttle = 1;
        else if (analogThrottle) throttle = Math.min(1, Math.abs(analogData.y) * 1.5);
    }
    const braking = state.isPlaying &&
        (state.keys.down || (analogData.active && analogData.y > 0.5 && !GAME_SETTINGS.autoRace));
    // Free mode moves slowly in world units; scale it so it still feels like riding.
    const kmh = free && !IS_V2 ? state.freeMode.speed * 50 * 3.5 : speedKmh();
    const freeBike = free && IS_V2 && !!v2 && v2.roam.mode === 'bike';
    return {
        kmh,
        throttle,
        braking,
        steer: freeBike ? freeRide.steer : free ? 0 : Math.max(-1, Math.min(1, state.bike.lateralVelocity / CONFIG.maxLateralSpeed)),
        freeBike,
        // Gas held on the free roam bike: the rider tucks in over the tank.
        gasTuck: freeBike ? freeRide.gas * (0.55 + 0.45 * Math.min(1, freeRide.speed / FREE_BIKE.top)) : 0,
        angle: state.bike.angle,
        angleRatio: Math.max(0, Math.min(1, state.bike.angle / CONFIG.maxAngle)),
        skidding: state.skidding,
        linear: !free,
        playing: state.isPlaying,
        gameTime: state.gameTime,
        jumpHeight: free ? 0 : state.jump.visualY,
        boosting: free ? !!(v2 && v2.roam.boostState().active) : state.boost.frames > 0,
        vehicle: free && v2 ? (v2.roam.mode === 'walk' ? 'foot' : v2.roam.mode) : 'bike',
        footSpeed: free && v2 ? v2.roam.footSpeed : 0,
        wobble: free ? 0 : badLandingWobble(),
        // Fragile after a bad landing: the bike blinks (faster at first).
        blink: !free && state.frame < state.vulnerableUntil &&
            Math.floor(state.frame / (state.vulnerableUntil - state.frame > 360 ? 4 : 8)) % 2 === 0,
        carModel: free && v2 ? v2.roam.carModel : null,
        reversing: free && v2 ? v2.roam.reversing : false,
        airborne: !free && state.jump.airborne,
        trick: state.trick.active ? state.trick.type : null,
        bavette: !free && state.bavette.left > 0,
        // Free roam: fallen off the bike (the rider is moved by the fall).
        fallen: free && roamFall.active,
        plateOn: !free && state.plate.on,
        // Too slow: how close the police car is (0 far behind, 1 alongside).
        police: !free && state.isPlaying && state.police.phase === 'visible' && !state.police.hidden
            ? { x: state.police.x, z: policeZ(state.police.p) } : null
    };
}

function renderScene(dt, snapshot = visualSnapshot()) {
    updateCamera();
    if (dt > 0) updateKnockedObstacles(dt);
    if (v2) v2.frame(dt, snapshot);
    renderer.render(scene, camera);
}

function resetGame() {
    state.score = 0;
    state.speed = 0;
    state.distance = 0;
    state.gameTime = 0;
    state.bike.angle = 0;
    state.bike.angularVelocity = 0;
    state.bike.lateralVelocity = 0;
    state.isPaused = false;
    state.userPaused = false;
    state.skidding = false;
    state.skidTimer = 0;
    state.runToken = null;
    state.inputLog = [];
    state.runReplayOverflow = false;
    state.rankedRunUnavailable = false;
    state.wheeliePercentage = 0;
    state.wheelieTime = 0;
    state.frame = 0;
    state.jump = { airborne: false, y: 0, vy: 0, trickFrames: 0, lastLanding: -1e9, pending: false, visualY: 0, flipActive: false, flipAngle: 0, flipRate: 0, flipKmh: 0 };
    state.trick = { active: false, type: 'superman', was: false, spin: 0 };
    state.ramps.forEach((ramp) => scene.remove(ramp.mesh));
    state.ramps = [];
    state.rampFreeZones = [];
    state.gantries.forEach((gantry) => scene.remove(gantry));
    state.gantries = [];
    state.quietZones = [];
    state.phase = 1;
    state.vulnerableUntil = -1;
    state.badLanding = 0;
    state.slow = { armed: false, frames: 0, policeFrames: 0 };
    state.police = { phase: 'idle', lastSeen: -1e9, gaveUp: false };
    state.tricksOnly = false;
    state.edge = { frames: 0, pending: null };
    secretCode.step = 0;
    state.bavette = { left: 0, total: 0 };
    // The plate rides only on the V2 bike, once unlocked and switched on.
    state.plate = { on: IS_V2 && GAME_SETTINGS.gameMode === 'linear' && plateEquipped(), off: false };
    state.flipMode = GAME_SETTINGS.flipMode;
    if (v2) v2.rider.resetPlate();
    hidePoliceWarning();
    lastCameraBikeZ = null;
    freeCamYaw = null;
    freeCamLast = null;
    freeRide.speed = 0;
    freeRide.hold = 0;
    state.keys.trick = false;
    state.keys.boost = false;
    state.boost = { charges: 0, frames: 0, gain: 0, wasHeld: false };
    state.angleMultiplier = 1.0;
    state.timeMultiplier = 1.0;
    state.currentMultiplier = 1.0;
    state.lastTimeMultiplierDisplay = 0;
    state.smokeParticles.forEach(p => {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
    });
    state.smokeParticles = [];

    // Nettoyer les lignes de vitesse du mode libre
    if (state.freeMode.speedLines) {
        state.freeMode.speedLines.forEach(line => {
            scene.remove(line.mesh);
            line.mesh.geometry.dispose();
            line.mesh.material.dispose();
        });
    }
    state.freeMode = {
        speed: 0,
        roadCurve: 0,
        roadCurveTimer: 0,
        speedLines: []
    };

    bikeGroup.position.set(0, 0, 0);
    // Apply mode-specific rotation
    if (GAME_SETTINGS.gameMode === 'free') {
        bikeGroup.rotation.set(0, 0, 0); // 0° for free mode
    } else {
        bikeGroup.rotation.set(0, Math.PI, 0); // 180° for linear mode (inverted)
    }
    bikePivot.rotation.x = 0;
    if (v2) v2.reset();
    state.obstacles.forEach(obs => scene.remove(obs.mesh));
    state.obstacles.forEach(obs => disposeObjectTree(obs.mesh));
    knockedObstacles.length = 0;
    state.obstacles = [];
    state.animatedObjects = [];
    groundChunks.forEach(dropChunk);
    groundChunks = [];
    for (let i = 0; i < 5; i++) {
        const chunk = makeChunk(-i * 100);
        scene.add(chunk);
        groundChunks.push(chunk);
    }
    wheelieHoldTime = 0;
    lastMultiplierStep = 2;
    recordAnnounced = false;
    const highScoreEl = document.getElementById('high-score-display');
    if (highScoreEl) {
        highScoreEl.innerText = `MEILLEUR: ${state.highScore}`;
    }
}

let startInProgress = false;
let completedRankedRun = null;

let connectingNotice = null;
function showConnecting(visible) {
    if (!connectingNotice) {
        if (!visible) return;
        connectingNotice = document.createElement('div');
        connectingNotice.textContent = 'Connexion au classement…';
        connectingNotice.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;' +
            'padding:14px 22px;border-radius:8px;background:rgba(10,11,14,.85);color:#f6c416;font:600 15px Roboto,Arial,sans-serif;' +
            'border:1px solid rgba(246,196,22,.4);pointer-events:none';
        document.body.append(connectingNotice);
    }
    connectingNotice.style.display = visible ? 'block' : 'none';
}

async function startGame() {
    if (startInProgress) return;
    startInProgress = true;
    flushPendingSubmission();
    crashSequence++;
    audio.prepare();
    stopVoice();
    let runToken = null;
    if (GAME_SETTINGS.gameMode === 'linear') {
        // Say so if the ranking server is slow to answer.
        const notice = setTimeout(() => showConnecting(true), 350);
        try {
            runToken = await takeWheelieRun();
        } catch (error) {
            console.error('Classement indisponible:', error);
            logEvent('Session classée indisponible au départ', { error: String(error && error.message || error) });
        } finally {
            clearTimeout(notice);
            showConnecting(false);
        }
    }

    try {
        resetGame();
        state.runToken = runToken;
        state.rankedRunUnavailable = GAME_SETTINGS.gameMode === 'linear' && !runToken;
        state.sessionError = state.rankedRunUnavailable ? lastSessionError : null;
        if (state.rankedRunUnavailable) lateSession(crashSequence);
        setRankingStatus('');
        completedRankedRun = null;
        state.isPlaying = true;
        state.speed = CONFIG.minSpeed;
        audio.startRun();
        audio.play('rev_blip', { volume: 0.4 });
        lastVoiceAt = -Infinity;
        lastPeriodicVoiceAt = 0;
        announcedWheelie = false;
        announcedCombo = false;
        announcedSpeed = false;
        announcedNearFall = false;

        const startScreen = document.getElementById('start-screen');
        const gameOverScreen = document.getElementById('game-over-screen');
        const countdownEl = document.getElementById('countdown-display');

        if (startScreen) startScreen.classList.remove('active');
        if (gameOverScreen) gameOverScreen.classList.remove('active');

        setupMobileControls();
        // "C'est parti, <pseudo> !" at the first run once the voice exists, then now and then.
        const namedStart = IS_V2 && GAME_SETTINGS.voiceEnabled ? playerVoice.startLine(riderVoiceKey()) : null;
        resetIdleVoice();
        if (namedStart) {
            lastVoiceAt = performance.now();
            audio.speak(namedStart, { volume: 0.95 });
        } else {
            speak('start', { force: true });
        }
        startAnimationLoop();
        setTimeout(() => showKeyHints(9), 300);
        startPresence();
        // Standing at the start: the 5HC intro on the bus shelter ahead.
        if (v2) setTimeout(() => v2.startAd(), 400);

        if (isMobile() && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log('Auto-fullscreen failed:', err);
            });
        }

        if (GAME_SETTINGS.autoRace) {
            autoRaceActive = false;
            state.isPaused = true;
            if (countdownEl) {
                countdownEl.style.display = 'block';
                let count = 3;
                countdownEl.innerText = count;
                audio.play('countdown_beep', { volume: 0.5 });
                const timer = setInterval(() => {
                    count--;
                    if (count > 0) {
                        countdownEl.innerText = count;
                        audio.play('countdown_beep', { volume: 0.5 });
                    } else if (count === 0) {
                        countdownEl.innerText = "GO!";
                        audio.play('go_beep', { volume: 0.55 });
                    } else {
                        clearInterval(timer);
                        countdownEl.style.display = 'none';
                        state.isPaused = false;
                        autoRaceActive = true;
                    }
                }, 1000);
            }
        }
    } finally {
        startInProgress = false;
    }
}

// Pause keeps the run: the simulation stops, nothing is lost or submitted.
function togglePause() {
    if (!state.isPlaying) return;
    if (state.userPaused) resumeGame();
    else pauseGame();
}

function pauseGame() {
    if (!state.isPlaying || state.userPaused) return;
    state.userPaused = true;
    Object.keys(state.keys).forEach((key) => { state.keys[key] = false; });
    stopVoice();
    audio.setPaused(true);
    document.getElementById('pause-screen')?.classList.add('active');
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.visibility = 'hidden';
}

function resumeGame() {
    if (!state.userPaused) return;
    state.userPaused = false;
    audio.setPaused(false);
    document.getElementById('pause-screen')?.classList.remove('active');
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.visibility = '';
    lastFrameTime = performance.now();
}

// Leaves a run without a score (from the pause or the game-over screen).
function quitToMenu() {
    state.userPaused = false;
    state.isPlaying = false;
    crashSequence++;
    stopVoice();
    audio.setPaused(false);
    audio.stopRun();
    completedRankedRun = null;
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
    const popup = document.getElementById('nickname-popup');
    if (popup) popup.style.display = 'none';
    document.getElementById('start-screen')?.classList.add('active');
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) {
        mobileControls.style.display = 'none';
        mobileControls.style.visibility = '';
    }
}

// Obstacles hit by the bike: thrown along the road, tumbling, bouncing,
// then lying where they stop (visual only, the run is decided above).
function knockObstacle(obs) {
    if (obs.knocked) return;
    obs.knocked = true;
    const mesh = obs.mesh;
    obs.box.getSize(knockSize);
    // Big ones (road works) only shift and rock; small ones fly.
    const heavy = knockSize.x * knockSize.z > 6;
    const unitsPerSecond = state.speed * 60;
    const side = Math.sign(mesh.position.x - bikeGroup.position.x) || (Math.random() < 0.5 ? -1 : 1);
    const throwSpeed = heavy ? 0.12 : 0.55 + Math.random() * 0.25;
    knockedObstacles.push({
        mesh,
        base: mesh.position.y,
        velocity: new THREE.Vector3(side * (heavy ? 0.6 : 2 + Math.random() * 3), heavy ? 0.6 : 2.5 + unitsPerSecond * 0.06,
            -unitsPerSecond * throwSpeed),
        spin: new THREE.Vector3((Math.random() - 0.5) * (heavy ? 0.6 : 9), (Math.random() - 0.5) * (heavy ? 1 : 6),
            (Math.random() - 0.5) * (heavy ? 0.6 : 9)),
        life: 4
    });
    audio.play('whoosh', { volume: 0.25, rate: 0.7 });
}

function updateKnockedObstacles(dt) {
    for (let i = knockedObstacles.length - 1; i >= 0; i--) {
        const item = knockedObstacles[i];
        const { mesh, velocity, spin } = item;
        item.life -= dt;
        if (!mesh.parent || item.life <= 0) {
            knockedObstacles.splice(i, 1);
            continue;
        }
        velocity.y -= 18 * dt;
        mesh.position.addScaledVector(velocity, dt);
        mesh.rotation.x += spin.x * dt;
        mesh.rotation.y += spin.y * dt;
        mesh.rotation.z += spin.z * dt;
        if (mesh.position.y <= item.base) {
            mesh.position.y = item.base;
            velocity.y = velocity.y < -2 ? -velocity.y * 0.35 : 0;
            velocity.x *= 0.7;
            velocity.z *= 0.7;
            spin.multiplyScalar(0.55);
        }
    }
}

function checkCollisions() {
    if (!state.isPlaying) return;
    // Flying over everything.
    if (state.jump.airborne) return;
    // V2 uses a fixed hit box so the rider's animation never changes gameplay.
    const bikeBox = v2 ? v2.rider.getHitBox() : new THREE.Box3().setFromObject(bikeGroup).expandByScalar(-0.2);
    let skidStarted = false;
    for (let i = 0; i < state.obstacles.length; i++) {
        const obs = state.obstacles[i];
        if (!obs.active) continue;
        if (bikeBox.intersectsBox(obs.box)) {
            // A second obstacle touched in the step that started the skid is
            // ignored: no skid frame is recorded yet, so ending the run here
            // would produce a replay the server refuses.
            const fragile = state.frame - 1 < state.vulnerableUntil;
            knockObstacle(obs);
            if ((state.trick.active || fragile) && !state.skidding) {
                // Hit during a stunt, or still shaken by a bad landing: no saving it.
                obs.active = false;
                gameOver(state.trick.active ? 'trickHit' : 'fragileHit');
                return;
            }
            if (state.skidding && !skidStarted) {
                gameOver('hit');
            } else if (!state.skidding) {
                startSkid();
                skidStarted = true;
            }
            obs.active = false;
        } else if (!obs.passed && obs.box.min.z > bikeBox.max.z) {
            // Just went by: a close pass at speed whooshes on that side.
            obs.passed = true;
            const gap = (obs.box.min.x + obs.box.max.x) / 2 - bikeGroup.position.x;
            const kmh = state.speed * 50;
            if (Math.abs(gap) < 3 && kmh > 60) {
                audio.play('whoosh', {
                    volume: Math.min(0.6, 0.2 + kmh / 400) * (1 - Math.abs(gap) / 4),
                    rate: 0.9 + Math.random() * 0.25,
                    pan: Math.max(-1, Math.min(1, gap / 2))
                });
            }
        }
    }
}

// Ramps ----------------------------------------------------------------------
// Kicker ramps on the road from 20 s on. Riding over the lip (fast enough)
// launches the bike; the jump itself is simulated in the step above.
let rampGeometry = null;
let rampMaterial = null;
function createRampMesh() {
    if (!rampGeometry) {
        const w = RAMP.width / 2;
        const l = RAMP.length;
        const h = JUMP.rampHeight;
        const positions = [];
        const colors = [];
        const face = (points, color) => {
            const c = new THREE.Color(color);
            for (const index of [0, 1, 2, 0, 2, 3]) {
                positions.push(...points[index]);
                colors.push(c.r, c.g, c.b);
            }
        };
        // Deck in strips: dark plates with yellow chevron bands; the lip is yellow.
        const strips = 8;
        for (let i = 0; i < strips; i++) {
            const z0 = l / 2 - (i / strips) * l;
            const z1 = l / 2 - ((i + 1) / strips) * l;
            const y0 = (i / strips) * h;
            const y1 = ((i + 1) / strips) * h;
            face([[-w, y0, z0], [w, y0, z0], [w, y1, z1], [-w, y1, z1]], i === strips - 1 ? 0xf6c416 : i % 2 ? 0x2b2e34 : 0x3a3e46);
        }
        face([[-w, 0, -l / 2], [-w, h, -l / 2], [w, h, -l / 2], [w, 0, -l / 2]], 0x1b1d21);
        const side = (x, color) => {
            const c = new THREE.Color(color);
            const tri = x < 0 ? [[x, 0, l / 2], [x, h, -l / 2], [x, 0, -l / 2]] : [[x, 0, l / 2], [x, 0, -l / 2], [x, h, -l / 2]];
            for (const point of tri) {
                positions.push(...point);
                colors.push(c.r, c.g, c.b);
            }
        };
        side(-w, 0xd4a20f);
        side(w, 0xd4a20f);
        rampGeometry = new THREE.BufferGeometry();
        rampGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        rampGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        rampGeometry.computeVertexNormals();
        rampGeometry.userData.shared = true;
        rampMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
        sharedMaterials.add(rampMaterial);
    }
    const mesh = new THREE.Mesh(rampGeometry, rampMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function spawnRamp(z) {
    const x = (Math.random() - 0.5) * 12;
    const mesh = createRampMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    state.ramps.push({ mesh, x, z, front: z + RAMP.length / 2, lip: z - RAMP.length / 2, launched: false });
    // Clear the run-up and the landing zone of obstacles.
    const zone = { from: z + 25, to: z - 280 };
    state.rampFreeZones.push(zone);
    state.obstacles = state.obstacles.filter((obs) => {
        const oz = obs.mesh.position.z;
        if (oz <= zone.from && oz >= zone.to) {
            scene.remove(obs.mesh);
            disposeObjectTree(obs.mesh);
            return false;
        }
        return true;
    });
}

function rampAt(x, z) {
    return state.ramps.find((ramp) => Math.abs(x - ramp.x) < RAMP.width / 2 && z <= ramp.front && z >= ramp.lip - 0.5);
}

// Height of the deck under the bike (visual only).
function rampHeightAt(x, z) {
    const ramp = rampAt(x, z);
    if (!ramp) return 0;
    return JUMP.rampHeight * Math.min(1, (ramp.front - z) / RAMP.length);
}

function updateRamps() {
    const { x, z } = bikeGroup.position;
    for (const ramp of state.ramps) {
        if (ramp.launched || Math.abs(x - ramp.x) >= RAMP.width / 2) continue;
        // Crossed the lip this frame: the takeoff happens on the next one.
        if (z <= ramp.lip && z + state.speed > ramp.lip) {
            ramp.launched = true;
            state.jump.pending = true;
            state.jump.visualY = JUMP.rampHeight;
            bikeGroup.position.y = JUMP.rampHeight;
        }
    }
    state.ramps = state.ramps.filter((ramp) => {
        if (ramp.z > z + 60) {
            scene.remove(ramp.mesh);
            return false;
        }
        return true;
    });
}

function setTrick(active) {
    const trick = state.trick;
    if (active && !trick.active) {
        trick.type = TRICK_TYPES[(TRICK_TYPES.indexOf(trick.type) + 1) % TRICK_TYPES.length];
        audio.play('whoosh', { volume: 0.4, rate: 1.2 });
    }
    trick.active = active;
}

// What the takeoff speed allows, said as the bike leaves the ramp.
function announceFlip(kmh) {
    if (kmh >= FLIP.doubleKmh) toast('DOUBLE BACKFLIP POSSIBLE', 'Reste appuyé : double · lâche après un tour : simple', { discreet: true, float: true });
    else if (kmh >= FLIP.kmh) toast('BACKFLIP', 'Reste appuyé jusqu’à l’atterrissage', { discreet: true, float: true });
    // In a wheelie but too slow: just a jump, nothing to fear.
    else toast('PAS DE BACKFLIP', `Il faut ${FLIP.kmh} km/h au tremplin`, { discreet: true, float: true });
}

function landFlip(frame) {
    const jump = state.jump;
    const manual = state.flipMode === 'manual';
    const [outcome, turns, forwards] = manual ? manualFlipLanding(state.bike.angle + jump.flipAngle) : flipLanding(jump.flipAngle);
    if (outcome === 'clean') {
        const bonus = (jump.trickFrames > 0 ? FLIP.trickBonus : FLIP.bonus)[turns];
        state.score += bonus;
        const flip = forwards ? 'FRONTFLIP' : 'BACKFLIP';
        const name = turns >= 2 ? `DOUBLE ${flip}` : flip;
        toast(`+${bonus}`, jump.trickFrames > 0 ? `${name} + FIGURE !` : `${name} !`, { float: true });
        audio.play('new_record', { volume: 0.45 });
        audio.play('landing', { volume: 0.5 });
    } else if (outcome === 'bad') {
        state.vulnerableUntil = frame + FLIP.badFrames;
        state.badLanding = 1.6;
        audio.play('skid', { volume: 0.45 });
        // The bike slams down: sparks under it.
        if (v2) for (let i = 0; i < 3; i++) v2.spark();
        toast('MAUVAISE RÉCEPTION', 'Fragile 4 s : un obstacle = chute', { discreet: true, float: true });
    } else if (outcome === 'crash') {
        // Landed on its back.
        gameOver('flip');
    }
}

// Bavette ------------------------------------------------------------------
function startBavette() {
    state.bavette.started = state.frame;
    // The tip once a run; after that the sparks and the grinding say it.
    if (state.bavette.tipped) return;
    state.bavette.tipped = true;
    toast('BAVETTE !', `Lâche le ${isMobile() ? 'WHEELIE' : 'wheeling'} avant qu’elle lâche`, { discreet: true, float: true });
}

function endBavette(saved) {
    const held = state.frame - (state.bavette.started ?? state.frame);
    if (saved && held >= 20) {
        toast('BELLE BAVETTE', 'Rattrapée de justesse', { discreet: true, float: true });
        audio.play('landing', { volume: 0.4 });
    }
}

function plateTornOff() {
    toast(`+${PLATE.bonus}`, 'PLAQUE ARRACHÉE !', { float: true });
    audio.play('plate_snap', { volume: 0.7 });
    if (v2) {
        v2.rider.tearPlate(state.speed * 60);
        // A burst of sparks as it tears off.
        for (let i = 0; i < 4; i++) v2.spark();
    }
}

// The plate: unlocked at 4000 points, switched on in the rider screen.
function plateEquipped() {
    try {
        // On by default once unlocked (src/v2/livery.js).
        const livery = JSON.parse(localStorage.getItem('wheelie_rider_livery') || 'null') || {};
        return livery.plate !== false && totalPoints() >= PLATE.unlockPoints;
    } catch {
        return false;
    }
}

function readSetting(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function land(trickFrames, difficulty) {
    audio.play('landing', { volume: 0.55 });
    if (trickFrames > 0) {
        const bonus = trickFrames * FIXED_STEP * JUMP.landingRate * difficulty;
        state.score += bonus;
        const air = trickFrames * FIXED_STEP * JUMP.airRate * difficulty;
        state.boost.charges = Math.min(BOOST.maxCharges, state.boost.charges + 1);
        toast(`+${Math.round(bonus + air)}`, 'FIGURE RÉUSSIE · BOOST +1 (B)', { float: true });
        audio.play('multiplier_up', { volume: 0.45, rate: 1.15 });
        speak('landing', { force: true });
    }
}

// Free roam ----------------------------------------------------------------------
function roamAction() {
    if (!v2 || !state.isPlaying || state.isPaused || GAME_SETTINGS.gameMode !== 'free') return;
    // Getting up after a fall: nothing to get off.
    if (roamFall.active) return;
    v2.roam.action();
}

// Turned into a side street: fade, rebuild a new street around the player.
let streetChanging = false;
let fadeOverlay = null;
function changeStreet(sign) {
    if (!v2 || streetChanging) return;
    streetChanging = true;
    if (!fadeOverlay) {
        fadeOverlay = document.createElement('div');
        fadeOverlay.style.cssText = 'position:fixed;inset:0;background:#05060a;opacity:0;pointer-events:none;transition:opacity .35s ease;z-index:30';
        document.body.append(fadeOverlay);
    }
    fadeOverlay.style.opacity = '1';
    setTimeout(() => {
        const z = v2.roam.focus.z;
        groundChunks.forEach(dropChunk);
        groundChunks = [];
        const base = Math.round(z / 100) * 100;
        for (let i = -1; i < 5; i++) {
            const chunk = makeChunk(base - i * 100);
            scene.add(chunk);
            groundChunks.push(chunk);
        }
        const street = v2.roam.afterTurn(bikeGroup);
        const focus = v2.roam.focus;
        camera.position.set(focus.x, 6, focus.z + 12);
        toast(street.toUpperCase(), sign > 0 ? 'Tu as tourné à droite' : 'Tu as tourné à gauche');
        fadeOverlay.style.opacity = '0';
        streetChanging = false;
    }, 380);
}

function fireBoostEffects() {
    audio.play('boost', { volume: 0.75 });
    audio.play('backfire', { volume: 0.55, delay: 0.12 });
}

function toast(title, text, { discreet = false, float = false } = {}) {
    document.dispatchEvent(new CustomEvent('wheelie:toast', { detail: { title, text, discreet, float } }));
}

// Phases of a competitive run, each opened by an overhead motorway sign:
// 1 obstacles (0-20 s), 2 tricks on ramps without obstacles (20-35 s),
// 3 tricks and obstacles (35 s on).
const PHASES = [
    null,
    { title: 'PHASE 1', subtitle: 'OBSTACLES', color: '#0b6b3a' },
    { title: 'PHASE 2', subtitle: 'FIGURES', color: '#1d4fa8' },
    { title: 'PHASE 3', subtitle: 'FIGURES + OBSTACLES', color: '#a8321d' }
];
const gantryTextures = [];
function gantryTexture(phase) {
    if (gantryTextures[phase]) return gantryTextures[phase];
    const { title, subtitle, color } = PHASES[phase];
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = '#f4f4f0';
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, 996, 228);
    ctx.fillStyle = '#f4f4f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 104px "Arial Black", Arial, sans-serif';
    ctx.fillText(title, 512, 98, 940);
    ctx.font = '700 60px Arial, sans-serif';
    ctx.fillText(subtitle, 512, 186, 940);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    gantryTextures[phase] = texture;
    return texture;
}

let gantryParts = null;
function spawnGantry(phase, z) {
    if (!gantryParts) {
        const steel = new THREE.MeshLambertMaterial({ color: 0x8d939b });
        gantryParts = {
            steel,
            pole: new THREE.CylinderGeometry(0.22, 0.28, 9.6, 10),
            beam: new THREE.BoxGeometry(22, 0.55, 0.55),
            panel: new THREE.PlaneGeometry(10, 2.5),
            back: new THREE.BoxGeometry(10.3, 2.8, 0.18)
        };
        for (const key of ['pole', 'beam', 'panel', 'back']) gantryParts[key].userData.shared = true;
        sharedMaterials.add(steel);
    }
    const group = new THREE.Group();
    for (const x of [-10.8, 10.8]) {
        const pole = new THREE.Mesh(gantryParts.pole, gantryParts.steel);
        pole.position.set(x, 4.8, 0);
        group.add(pole);
    }
    for (const y of [9.1, 8.2]) {
        const beam = new THREE.Mesh(gantryParts.beam, gantryParts.steel);
        beam.position.set(0, y, 0);
        group.add(beam);
    }
    const back = new THREE.Mesh(gantryParts.back, gantryParts.steel);
    back.position.set(0, 8.65, 0.25);
    group.add(back);
    const material = new THREE.MeshBasicMaterial({ map: gantryTexture(phase), color: 0xd8d8d8 });
    const panel = new THREE.Mesh(gantryParts.panel, material);
    panel.position.set(0, 8.65, 0.36);
    group.add(panel);
    group.position.set(0, 0, z);
    group.userData.phase = phase;
    group.userData.announced = false;
    scene.add(group);
    state.gantries.push(group);
}

// Placed where the bike will be when the phase starts.
// Calm stretch after a sign: nothing in it, time to read the message.
function quietAfter(z, frames) {
    const to = z - Math.max(60, state.speed * frames + 30);
    state.quietZones.push({ from: z + 5, to });
    state.obstacles = state.obstacles.filter((obs) => {
        const oz = obs.mesh.position.z;
        if (oz <= z + 5 && oz >= to) {
            scene.remove(obs.mesh);
            disposeObjectTree(obs.mesh);
            return false;
        }
        return true;
    });
    state.ramps = state.ramps.filter((ramp) => {
        if (ramp.z <= z + 5 && ramp.z >= to) {
            scene.remove(ramp.mesh);
            return false;
        }
        return true;
    });
}
const inQuietZone = (z) => state.quietZones.some((zone) => z <= zone.from && z >= zone.to);

function updatePhases(frame) {
    const lead = 120;
    const calm = 120;
    const ahead = (frames) => bikeGroup.position.z - state.speed * frames - 20;
    if (frame === 1 && state.gantries.length === 0) {
        spawnGantry(1, -45);
        quietAfter(-45, 150);
    }
    // Sign 2 crossed 2 s before the ramps start (phase 2 sign at 23 s).
    if (frame === JUMP.rampsFrom - calm - lead) {
        const z = ahead(lead);
        spawnGantry(2, z);
        // Phase 2 is for tricks: clear the obstacles past its sign.
        state.obstacles = state.obstacles.filter((obs) => {
            if (obs.mesh.position.z < z + 5) {
                scene.remove(obs.mesh);
                disposeObjectTree(obs.mesh);
                return false;
            }
            return true;
        });
        quietAfter(z, calm);
    }
    if (frame === JUMP.groundTricksFrom - calm - lead) {
        const z = ahead(lead);
        spawnGantry(3, z);
        quietAfter(z, calm);
    }
    state.quietZones = state.quietZones.filter((zone) => zone.to < bikeGroup.position.z + 40);
    for (const gantry of state.gantries) {
        if (!gantry.userData.announced && bikeGroup.position.z < gantry.position.z) {
            gantry.userData.announced = true;
            const { title, subtitle } = PHASES[gantry.userData.phase];
            state.phase = gantry.userData.phase;
            toast(`${title} · ${subtitle}`, gantry.userData.phase === 2 ? `Tremplins : FIGURE${isMobile() ? '' : ' (F)'} en l’air · backflip : en wheeling à 130 km/h, garde ${isMobile() ? 'WHEELIE' : 'ESPACE'}`
                : gantry.userData.phase === 3 ? 'Un obstacle pendant une figure = chute' : 'Évite les obstacles');
        }
    }
    state.gantries = state.gantries.filter((gantry) => {
        if (gantry.position.z > bikeGroup.position.z + 80) {
            scene.remove(gantry);
            gantry.traverse((object) => { if (object.material && object.material.map) object.material.dispose(); });
            return false;
        }
        return true;
    });
}

// Obstacles are dropped during phase 2 (tricks only), from its sign.
function obstaclesAllowed() {
    if (state.tricksOnly) return false;
    return state.frame < JUMP.rampsFrom - 240 || state.frame >= JUMP.groundTricksFrom - 240;
}

// Riding against a side of the road: after EDGE.after frames there, an
// obstacle against that kerb, ~2 s ahead; the next once it has gone by.
// Leaving the side winds the count back twice as fast.
function guardEdges() {
    const edge = state.edge;
    if (!state.isPlaying || !obstaclesAllowed()) {
        edge.frames = 0;
        return;
    }
    const x = bikeGroup.position.x;
    edge.frames = Math.abs(x) >= EDGE.zone ? edge.frames + 1 : Math.max(0, edge.frames - 2);
    if (edge.frames < EDGE.after) return;
    const pending = edge.pending;
    if (pending && pending.active && pending.mesh.position.z < bikeGroup.position.z) return;
    const lead = Math.max(EDGE.minLead, Math.min(EDGE.maxLead, state.speed * 60 * EDGE.leadSeconds));
    const z = bikeGroup.position.z - lead;
    if (inQuietZone(z) || state.rampFreeZones.some((zone) => z <= zone.from && z >= zone.to)) return;
    edge.pending = spawnObstacle(z, Math.sign(x));
}

// Tricks-only mode (secret code): ramps and ground tricks from the start.
function rampsFrom() {
    return state.tricksOnly ? 0 : JUMP.rampsFrom;
}

function groundTricksFrom() {
    return state.tricksOnly ? 0 : JUMP.groundTricksFrom;
}

// Secret code: gas, brake, wheelie, then three taps on the speedometer. In
// the first 10 s of a competitive run: tricks only (no obstacles, no police,
// unranked, a tenth of the score added to the cumulative points). In free
// roam, on the bike: a hang glider.
const SECRET_SEQUENCE = ['gas', 'brake', 'wheelie', 'tap', 'tap', 'tap'];
function secretInput(kind) {
    if (!state.isPlaying || state.userPaused) return;
    const competitive = GAME_SETTINGS.gameMode === 'linear';
    if (competitive && (state.gameTime > 10 || state.tricksOnly)) return;
    if (!competitive && !(v2 && v2.roam.mode === 'bike' && !roamFall.active)) return;
    if (kind === SECRET_SEQUENCE[secretCode.step]) secretCode.step += 1;
    else secretCode.step = kind === SECRET_SEQUENCE[0] ? 1 : 0;
    if (secretCode.step < SECRET_SEQUENCE.length) return;
    secretCode.step = 0;
    if (competitive) startTricksOnly();
    else v2.roam.startGlide(bikeGroup);
}

// Presses of gas, brake and wheelie (keyboard or pads), once a frame.
function watchSecretKeys() {
    const now = { up: !!state.keys.up, down: !!state.keys.down, space: !!state.keys.space };
    const before = secretCode.prev;
    if (now.up && !before.up) secretInput('gas');
    if (now.down && !before.down) secretInput('brake');
    if (now.space && !before.space) secretInput('wheelie');
    secretCode.prev = now;
}

function startTricksOnly() {
    state.tricksOnly = true;
    state.police.phase = 'idle';
    hidePoliceWarning();
    state.obstacles.forEach((obs) => {
        obs.active = false;
        obs.mesh.visible = false;
    });
    audio.play('new_record', { volume: 0.5 });
    toast('CODE SECRET', 'Mode figures : pas d’obstacles ni de police · non classé', { float: true });
    logEvent('Code secret : mode figures');
}

function announceTricks(frame) {
    updatePhases(frame);
}

function recordRankedInput(flags, accelerationScale = 1) {
    // Recorded from the first frame even before the session arrives (it may
    // come a few seconds late: see lateSession()).
    if (state.runReplayOverflow || GAME_SETTINGS.gameMode !== 'linear') return;
    if (state.inputLog.length / 2 >= MAX_RANKED_FRAMES) {
        state.runReplayOverflow = true;
        return;
    }

    state.inputLog.push(flags, Math.round(Math.max(0, Math.min(1, accelerationScale)) * 255));
}

function startSkid() {
    state.skidding = true;
    state.skidTimer = 1.5;
    audio.play('skid', { volume: 0.6 });
    speak('skid');
    bikeGroup.rotation.z = Math.PI / 8;
    // Reduced from 20 to 10 for better performance
    for (let i = 0; i < 10; i++) {
        createSmokeParticle();
    }
}

function createSmokeParticle() {
    if (v2) {
        v2.smoke();
        return;
    }
    // Limit max smoke particles for performance
    if (state.smokeParticles.length >= 30) {
        const oldest = state.smokeParticles.shift();
        scene.remove(oldest.mesh);
        oldest.mesh.material.dispose();
    }

    // Reuse pooled geometry and clone material for individual opacity
    const mat = smokeParticlePool.material.clone();
    mat.opacity = 0.6;
    const mesh = new THREE.Mesh(smokeParticlePool.geometry, mat);

    const pos = bikeGroup.position.clone();
    pos.y += 0.5;
    pos.z += 0.5;
    pos.x += (Math.random() - 0.5) * 0.5;
    mesh.position.copy(pos);

    // Random scale for variety
    const scale = 0.8 + Math.random() * 0.4;
    mesh.scale.set(scale, scale, scale);

    scene.add(mesh);
    state.smokeParticles.push({
        mesh: mesh,
        life: 1.0 + Math.random() * 0.5,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.1 + Math.random() * 0.1, 0.1)
    });
}

function updateSmoke(dt) {
    for (let i = state.smokeParticles.length - 1; i >= 0; i--) {
        const p = state.smokeParticles[i];
        p.life -= dt;
        p.mesh.position.add(p.velocity);
        p.mesh.material.opacity = p.life * 0.6;
        p.mesh.scale.multiplyScalar(1.02);
        if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.material.dispose();
            state.smokeParticles.splice(i, 1);
        }
    }
}

// Fonction pour créer des lignes de vitesse (speed lines)
function createSpeedLine() {
    if (state.freeMode.speedLines.length >= 20) {
        const oldest = state.freeMode.speedLines.shift();
        scene.remove(oldest.mesh);
        oldest.mesh.geometry.dispose();
        oldest.mesh.material.dispose();
    }

    const geometry = new THREE.PlaneGeometry(0.2, 2);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);

    const pos = bikeGroup.position.clone();
    pos.x += (Math.random() - 0.5) * 8;
    pos.y += Math.random() * 2;
    pos.z += (Math.random() - 0.5) * 5 + 3;
    mesh.position.copy(pos);
    mesh.rotation.y = Math.PI / 2;

    scene.add(mesh);
    state.freeMode.speedLines.push({
        mesh: mesh,
        life: 0.3,
        velocity: new THREE.Vector3(0, 0, 3)
    });
}

function updateSpeedLines(dt) {
    for (let i = state.freeMode.speedLines.length - 1; i >= 0; i--) {
        const line = state.freeMode.speedLines[i];
        line.life -= dt;
        line.mesh.position.add(line.velocity);
        line.mesh.material.opacity = line.life * 2.5;
        if (line.life <= 0) {
            scene.remove(line.mesh);
            line.mesh.geometry.dispose();
            line.mesh.material.dispose();
            state.freeMode.speedLines.splice(i, 1);
        }
    }
}

// Why the run ended, shown on the game-over screen.
const DEFEAT_REASONS = {
    slow: ['TROP LENT', 'La police t’a rattrapé.'],
    loop: ['WHEELING TROP HAUT', 'La moto est passée par-dessus.'],
    hit: ['COLLISION', 'Un deuxième obstacle pendant le dérapage.'],
    trickHit: ['OBSTACLE EN FIGURE', 'Un obstacle touché pendant une figure.'],
    fragileHit: ['OBSTACLE APRÈS UNE MAUVAISE RÉCEPTION', 'Juste après un saut mal reçu, un obstacle fait tomber.'],
    trickLanding: ['ATTERRISSAGE EN FIGURE', 'Relâche FIGURE avant de toucher le sol.'],
    flip: ['BACKFLIP RATÉ', 'Atterri sur le dos : garde le wheeling jusqu’au bout du saut.'],
    bavette: ['BAVETTE LÂCHÉE', 'Resté appuyé trop longtemps sur la bavette : la moto est passée par-dessus.']
};

function showDefeatReason(reason) {
    const element = document.getElementById('gameover-reason');
    let [label, detail] = DEFEAT_REASONS[reason] || [];
    if (reason === 'flip' && state.flipMode === 'manual') {
        detail = 'Posé trop penché : pose-toi à plat (wheeling = en arrière, frein = en avant).';
    }
    if (element) {
        element.textContent = '';
        if (label) {
            const strong = document.createElement('strong');
            strong.textContent = label;
            const span = document.createElement('span');
            span.textContent = detail;
            element.append(strong, span);
        }
        element.hidden = !label;
    }
    // V2: "ARRÊTÉ !" when the police end the run, "CHUTE !" otherwise.
    const title = document.querySelector('#game-over-screen h1');
    if (IS_V2 && title) title.textContent = reason === 'slow' ? 'ARRÊTÉ !' : 'CHUTE !';
}

// Police warning while the bike is too slow (both versions; its state is
// declared at the top: resetGame clears it).
// "TROP LENT !" in red for 2 s when the siren is first heard; the game
// says the rest (the siren, the patrol in the mirror).
function flashTooSlow() {
    if (!policeWarning) {
        policeWarning = document.createElement('div');
        policeWarning.id = 'police-warning';
        policeWarning.setAttribute('role', 'alert');
        policeWarning.textContent = 'TROP LENT !';
        document.body.append(policeWarning);
    }
    policeWarning.classList.add('is-shown');
    clearTimeout(policeWarningShown);
    policeWarningShown = setTimeout(() => policeWarning.classList.remove('is-shown'), 2000);
}

function hidePoliceWarning() {
    clearTimeout(policeWarningShown);
    policeWarning?.classList.remove('is-shown');
}

// Where the patrol is: from just beside the camera (p 0, already in sight)
// to alongside the bike (p 1).
function policeZ(p) {
    return bikeGroup.position.z + 9 - p * 12;
}

function updatePoliceChase(kmh, dt) {
    const police = state.police;
    const slow = state.slow;
    if (!slow.armed || !state.isPlaying) return;
    if (kmh >= SLOW.kmh) {
        // Lost: the siren stops; it will come back under 50 km/h.
        if (police.phase !== 'idle' && police.seen) police.lastSeen = state.gameTime;
        police.phase = 'idle';
        police.gaveUp = false;
        return;
    }
    if (police.gaveUp) return;
    const bikeX = bikeGroup.position.x;
    if (police.phase === 'idle') {
        const long = state.gameTime - police.lastSeen >= POLICE.longGap;
        Object.assign(police, {
            phase: 'coming', t: 0, sirenAt: long ? POLICE.sirenLong : POLICE.sirenQuick,
            appearAt: long ? POLICE.appearLong : POLICE.appearQuick, siren: false, nextSiren: 0,
            seen: false, p: 0, seenTime: 0, hits: 0, hidden: false
        });
    }
    police.t += dt;
    if (police.t >= police.sirenAt) {
        if (!police.siren) {
            police.siren = true;
            flashTooSlow();
        }
        if (police.t >= police.nextSiren) {
            police.nextSiren = police.t + 3.4;
            const near = police.phase === 'visible' ? 0.3 + police.p * 0.45 : 0.14;
            audio.play('police_siren', { volume: near, pan: (police.side || 0) * 0.4 });
        }
    }
    if (police.phase === 'coming' && police.t >= police.appearAt) {
        // From the side with the least room: the player can get away from it.
        police.side = bikeX > 0 ? 1 : -1;
        police.x = Math.max(-11, Math.min(11, bikeX + police.side * POLICE.lane));
        police.baseGap = Math.abs(bikeX - police.x);
        police.phase = 'visible';
        police.seen = true;
    }
    if (police.phase !== 'visible') return;
    police.lastSeen = state.gameTime;
    const awaySideways = Math.abs(bikeX - police.x) - police.baseGap >= POLICE.lateralEscape;
    police.hidden = kmh >= POLICE.hideKmh;
    if (police.hidden) {
        police.p = Math.max(0, police.p - dt / 2);
    } else {
        police.seenTime += dt;
        if (kmh >= POLICE.recedeKmh || awaySideways) police.p = Math.max(0, police.p - dt / 3);
        else police.p = Math.min(1, police.p + dt / POLICE.escapeSeconds);
    }
    // Left behind sideways, it changes lane back towards the bike, slowly.
    const lane = Math.max(-11, Math.min(11, bikeX + police.side * POLICE.lane));
    police.x += Math.sign(lane - police.x) * Math.min(Math.abs(lane - police.x), 1.2 * dt);
    // What lies in its way is knocked over; three and it gives up.
    if (v2 && !police.hidden) {
        const z = policeZ(police.p);
        for (const obs of state.obstacles) {
            if (!obs.active || obs.knocked) continue;
            const o = obs.mesh.position;
            if (Math.abs(o.x - police.x) < 1.5 && Math.abs(o.z - z) < 2.8) {
                obs.active = false;
                knockObstacle(obs);
                audio.play('collision', { volume: 0.3, rate: 1.2 });
                police.hits += 1;
                police.p = Math.max(0, police.p - 0.15);
                if (police.hits >= POLICE.maxHits) {
                    police.gaveUp = true;
                    police.phase = 'idle';
                    toast('LA POLICE ABANDONNE', 'Trois obstacles dans le pare-chocs', { discreet: true, float: true });
                    return;
                }
            }
        }
    }
    // Alongside after 10 s in sight: stopped (never before the server's floor).
    if (police.p >= 1 && police.seenTime >= POLICE.escapeSeconds && slow.policeFrames >= POLICE.minFrames) gameOver('slow');
}

async function gameOver(reason = 'crash') {
    if (!state.isPlaying) return;
    speedLines?.hide();
    hidePoliceWarning();
    showDefeatReason(reason);
    unrankedReason = null;
    const tricksOnly = state.tricksOnly && GAME_SETTINGS.gameMode === 'linear';
    if (tricksOnly) {
        completedRankedRun = null;
    } else if (state.runToken && !state.runReplayOverflow && state.inputLog.length >= 120) {
        state.inputLog[state.inputLog.length - 2] |= 0x10;
        completedRankedRun = {
            runToken: state.runToken,
            inputLog: Uint8Array.from(state.inputLog),
            flipMode: state.flipMode,
            plate: state.plate.on || state.plate.off
        };
    } else {
        completedRankedRun = null;
        if (GAME_SETTINGS.gameMode === 'linear') {
            unrankedReason = state.runReplayOverflow ? 'partie de plus d’une heure'
                : !state.runToken ? `pas de session de classement (${state.sessionError || lastSessionError || 'serveur injoignable au départ'})`
                    : 'partie trop courte';
            reportUnrankedRun(unrankedReason, Math.floor(state.score), state.gameTime);
            if (state.score >= 30) {
                report('ranking.unranked', `Partie non classée : ${unrankedReason}`, {
                    level: state.score >= 300 ? 'error' : 'warning',
                    group: unrankedReason.replace(/\(\d+\)/g, '(n)'),
                    details: {
                        score: Math.floor(state.score), seconds: Math.round(state.gameTime), difficulty: GAME_SETTINGS.difficulty,
                        version: IS_V2 ? 'v2' : 'v1', frames: state.inputLog.length / 2, reason: unrankedReason,
                    },
                });
            }
        }
    }
    state.runToken = null;
    // A fall in the first seconds gets laughed at.
    speak(state.gameTime < 10 ? 'earlyCrash' : 'crash', { force: true, allowWhenStopped: true });
    audio.stopRun();
    if (reason === 'slow') audio.play('police_siren', { volume: 0.7 });
    else audio.play('collision', { volume: 0.85 });
    const crashKind = reason === 'loop' || reason === 'flip' || reason === 'bavette' || state.bike.angle > CONFIG.maxAngle ||
        GAME_SETTINGS.gameMode === 'free' ? 'loop' : 'hit';
    // Then the bike itself going down, harder the faster it was going.
    if (reason !== 'slow') {
        const fallKmh = speedKmh();
        audio.play(fallKmh > 90 ? 'bike_fall_fast' : 'bike_fall', { volume: 0.55 + Math.min(0.4, fallKmh / 400), delay: 0.12 });
    }
    const crashSpeed = (GAME_SETTINGS.gameMode === 'free' ? state.freeMode.speed : state.speed) * 60;
    // How the rider was riding decides how he falls.
    const crashInfo = visualSnapshot();
    state.isPlaying = false;
    state.skidding = false;
    const sequence = ++crashSequence;
    // Arrests vary; the handcuffs only after more than 500 points.
    const arrests = ['one', 'two', 'ticket', 'gun', ...(state.score > 500 ? ['cuffs', 'cuffs'] : [])];
    if (v2 && reason === 'slow') playPoliceStop(sequence, arrests[Math.floor(Math.random() * arrests.length)]);
    else if (v2) playCrashSequence(crashKind, crashSpeed, sequence, crashInfo);
    const screenDelay = new Promise((resolve) => setTimeout(resolve, v2 ? (reason === 'slow' ? 3800 : 1150) : 0));
    const currentScore = Math.floor(state.score);
    const previousBest = state.highScore;
    // Tricks only: a tenth of the score, for free roam.
    const tricksPoints = Math.floor(currentScore / 10);
    if (GAME_SETTINGS.gameMode === 'linear') {
        const before = totalPoints();
        addPoints(tricksOnly ? tricksPoints : currentScore);
        // Something new unlocked by this run? Said once the screen is up.
        announceUnlocks(before, totalPoints());
        document.dispatchEvent(new CustomEvent('wheelie:points'));
    }
    // The bike taken by the police in free roam comes back with 100 points.
    if (GAME_SETTINGS.gameMode === 'linear' && currentScore >= BIKE_RECOVERY_POINTS && releaseBike()) {
        document.dispatchEvent(new CustomEvent('wheelie:notice', { detail: {
            title: 'MOTO RÉCUPÉRÉE', text: 'Elle t’attend dans le monde libre.', seconds: 6
        } }));
    }

    // Récupérer le nickname
    const nickname = localStorage.getItem('wheelie_nickname');

    // Récupérer le high score depuis l'API si on a un nickname, sinon depuis localStorage
    let highScore = state.highScore;
    if (nickname) {
        const stats = await Promise.race([getPlayerStats(nickname), screenDelay.then(() => null)]);
        // The best score of this version's leaderboard only.
        const versionBest = stats?.games?.find((game) => game.game_name === GAME_NAME)?.best_score || 0;
        if (versionBest > highScore) {
            highScore = versionBest;
            state.highScore = highScore;
            localStorage.setItem(HIGH_SCORE_KEY, highScore);
        }
    }

    // Mettre à jour le high score si le score actuel est meilleur
    if (currentScore > highScore && !tricksOnly) {
        highScore = currentScore;
        state.highScore = highScore;
        localStorage.setItem(HIGH_SCORE_KEY, highScore);
    }

    await screenDelay;
    // A new run may already have started while the crash was playing out.
    if (sequence !== crashSequence) return;
    if (currentScore > previousBest && previousBest > 0 && currentScore === highScore) {
        audio.play('new_record', { volume: 0.5 });
        setTimeout(() => {
            if (sequence !== crashSequence) return;
            // "Nouveau record, <pseudo> !" one time in two once the voice exists.
            const recordClip = `record_${riderVoiceKey()}`;
            if (IS_V2 && GAME_SETTINGS.voiceEnabled && playerVoice.has(recordClip) && Math.random() < 0.5) {
                lastVoiceAt = performance.now();
                audio.speak(playerVoice.clipId(recordClip), { volume: 0.95 });
            } else {
                speak('record', { force: true, allowWhenStopped: true });
            }
        }, 900);
    }

    const finalScore = document.getElementById('final-score');
    const gameOverScreen = document.getElementById('game-over-screen');
    const bestScore = document.getElementById('best-score-gameover');
    if (finalScore) finalScore.innerText = currentScore;
    if (bestScore) bestScore.innerText = highScore;
    if (gameOverScreen) gameOverScreen.classList.add('active');
    // "Rejouer" is the likely next tap: open the next ranked session now.
    if (GAME_SETTINGS.gameMode === 'linear') prefetchWheelieRun();
    if (tricksOnly) {
        setRankingStatus(`Mode figures (code secret), non classé : ${currentScore} ÷ 10 = ${tricksPoints} points ajoutés à tes points cumulés, pour le monde libre.`);
    } else if (completedRankedRun) {
        setRankingStatus('');
    } else if (GAME_SETTINGS.gameMode === 'free') {
        setRankingStatus('Mode libre : le score n’est pas classé.');
    } else {
        setRankingStatus(`Score non classé : ${unrankedReason || 'la partie n’a pas produit de replay valide'}.`);
    }

    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = 'none';

    // Afficher la popup de pseudo tant qu'on n'a pas de pseudo
    if (tricksOnly) {
        // Nothing to submit.
    } else if (!nickname) {
        // Afficher la popup de pseudo après un court délai
        setTimeout(() => {
            showNicknamePopup(currentScore);
        }, 1000);
    } else {
        await submitCompletedRun(nickname);
    }
}

// V2 only: keep rendering after the run ends so the fall plays out.
let crashSequence = 0;
function playCrashSequence(kind, unitsPerSecond, sequence, info) {
    // Mid-flip: the fall starts from the bike's turn, within one turn
    // backwards (on its back: 'loop') or the nearest way round otherwise.
    if (state.jump.flipActive) {
        const turn = 2 * Math.PI;
        let angle = ((state.jump.flipAngle % turn) + turn) % turn;
        if (kind !== 'loop' && angle > Math.PI) angle -= turn;
        v2.rider.setFlip(angle);
        v2.rider.bikePivot.rotation.x = -angle;
    }
    v2.rider.startCrash(kind, unitsPerSecond, info);
    state.speed = 0;
    state.freeMode.speed = 0;
    updateUI();
    let last = performance.now();
    const tick = (now) => {
        if (sequence !== crashSequence || state.isPlaying) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const moving = v2.rider.updateCrash(dt);
        renderScene(dt);
        if (moving) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

// V2, too slow: the patrol car cuts in ahead and the bike rolls to a stop.
function playPoliceStop(sequence, variant) {
    v2.policeStop(variant);
    let rolling = state.speed * 60;
    state.speed = 0;
    updateUI();
    const start = performance.now();
    let last = start;
    const tick = (now) => {
        if (sequence !== crashSequence || state.isPlaying) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        rolling = Math.max(0, rolling - 70 * dt);
        bikeGroup.position.z -= rolling * dt;
        renderScene(dt);
        if (now - start < 6000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

let wheelieHoldTime = 0;
let lastMultiplierStep = 2;
let recordAnnounced = false;
let animationLoopRunning = false;
let lastFrameTime = 0;
let simulationAccumulator = 0;
let uiAccumulator = 0;

function startAnimationLoop() {
    if (animationLoopRunning) return;
    animationLoopRunning = true;
    lastFrameTime = performance.now();
    simulationAccumulator = 0;
    requestAnimationFrame(animate);
}

function animate(timestamp = performance.now()) {
    if (!state.isPlaying) {
        animationLoopRunning = false;
        return;
    }

    requestAnimationFrame(animate);
    trackFrame(timestamp, frameReport);
    const elapsed = Math.min((timestamp - lastFrameTime) / 1000, 0.083);
    lastFrameTime = timestamp;
    simulationAccumulator += elapsed;

    while (simulationAccumulator >= FIXED_STEP) {
        const dt = FIXED_STEP;
        if (state.isPlaying && !state.isPaused && !state.userPaused && bikeGroup) {
        // Development only: tests drive the inputs frame by frame.
        if (import.meta.env.DEV && window.__wheelieStep) window.__wheelieStep(state);
        watchSecretKeys();
        state.gameTime += dt;
        if (!IS_V2) {
            const dayProgress = (state.gameTime % CONFIG.dayNightCycleDuration) / CONFIG.dayNightCycleDuration;
            skyColor.lerpColors(daytimeSky, nighttimeSky, dayProgress);
            scene.background = skyColor;
            if (scene.fog) scene.fog.color.copy(skyColor);
        }

        if (bikeGroup.userData.frontWheel && bikeGroup.userData.backWheel) {
            const rotationSpeed = state.speed * 2.0;
            bikeGroup.userData.frontWheel.rotation.x -= rotationSpeed;
            bikeGroup.userData.backWheel.rotation.x -= rotationSpeed;
        }

        if (Math.floor(state.gameTime * 2) % 2 === 0) {
            state.animatedObjects.forEach(obj => {
                if (obj.userData.lights) obj.userData.lights.forEach(l => l.visible = true);
            });
        } else {
            state.animatedObjects.forEach(obj => {
                if (obj.userData.lights) obj.userData.lights.forEach(l => l.visible = false);
            });
        }

        state.clouds.forEach(cloud => {
            cloud.position.x += cloud.userData.speed;
            if (cloud.position.x > 150) cloud.position.x = -150;
        });

        state.birds.forEach(bird => {
            bird.position.x += bird.userData.speed;
            if (bird.position.x > 100) bird.position.x = -100;
            bird.userData.wingAngle += 0.15;
            bird.userData.wing.rotation.z = Math.sin(bird.userData.wingAngle) * 0.3;
        });

        updateSmoke(dt);

        if (state.skidding) {
            recordRankedInput(0x08);
            state.frame++;
            // A skid does not count as riding too slowly (server: the same).
            state.slow.frames = 0;
            // Every recorded skid frame slows the bike, including the last
            // one: the server replay (wheelie_replay.py) does the same.
            state.speed *= 0.98;
            bikeGroup.position.z -= state.speed;
            state.skidTimer -= dt;
            if (state.skidTimer <= 0) {
                state.skidding = false;
                bikeGroup.rotation.z = 0;
            } else {
                // Reduced continuous smoke: every 3rd frame instead of 50% chance
                if (Math.floor(state.gameTime * 60) % 3 === 0) {
                    createSmokeParticle();
                }
                bikeGroup.rotation.z = (Math.PI / 8) + Math.sin(Date.now() * 0.02) * 0.1;
            }
        } else if (GAME_SETTINGS.gameMode === 'free') {
            let moveX = 0;
            let moveZ = 0;
            if (GAME_SETTINGS.controlMode === 'analog' && analogData.active) {
                moveX = analogData.x * CONFIG.freeModeSpeed * 3;
                moveZ = analogData.y * CONFIG.freeModeSpeed * 3;
            } else {
                if (state.keys.left) moveX -= CONFIG.freeModeSpeed * 3;
                if (state.keys.right) moveX += CONFIG.freeModeSpeed * 3;
                if (state.keys.up) moveZ -= CONFIG.freeModeSpeed * 3;
                if (state.keys.down) moveZ += CONFIG.freeModeSpeed * 3;
            }
            const roam = v2 ? v2.roam : null;
            const boostEdge = state.keys.boost && !state.boost.wasHeld;
            state.boost.wasHeld = state.keys.boost;
            if (roam && boostEdge) roam.tryBoost();
            if (roam && roam.mode === 'bike') {
                moveX *= roam.boostFactor;
                moveZ *= roam.boostFactor;
                // Stopped by the police.
                if (roam.frozen) {
                    moveX = 0;
                    moveZ = 0;
                }
            }
            if (roam && roam.mode !== 'bike') {
                const unit = CONFIG.freeModeSpeed * 3;
                roam.move(dt, moveX / unit, moveZ / unit, { run: state.keys.run, jump: state.keys.space });
                state.freeMode.speed = roam.speed;
                state.distance += roam.speed;
                freeRide.speed = 0;
                freeRide.hold = 0;
                moveX = 0;
                moveZ = 0;
            } else {
            const previous = bikeGroup.position.clone();
            if (roam) {
                // V2: ridden like a bike (gas, brake, bars), see rideFreeBike().
                state.freeMode.speed = rideFreeBike(dt, roam);
            } else {
            bikeGroup.position.x += moveX;
            bikeGroup.position.z += moveZ;
            if (Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01) {
                const targetRotation = Math.atan2(moveX, moveZ);
                bikeGroup.rotation.y = targetRotation;
            }
            const speed = Math.sqrt(moveX * moveX + moveZ * moveZ);
            state.freeMode.speed = speed;
            if (bikeGroup.userData.frontWheel) bikeGroup.userData.frontWheel.rotation.x -= speed * 2;
            if (bikeGroup.userData.backWheel) bikeGroup.userData.backWheel.rotation.x -= speed * 2;
            if (bikeGroup.position.x > 9) bikeGroup.position.x = 9;
            if (bikeGroup.position.x < -9) bikeGroup.position.x = -9;
            }
            void previous;

            // Wheelie mechanics in free mode
            let lift = 0;
            if (state.keys.space) {
                lift = CONFIG.wheelieLift;
                if (state.bike.angle > CONFIG.balancePoint - CONFIG.sweetSpotWidth &&
                    state.bike.angle < CONFIG.balancePoint + CONFIG.sweetSpotWidth) {
                    lift *= 0.5;
                }
            }
            state.bike.angularVelocity += lift;
            state.bike.angularVelocity -= CONFIG.gravity;
            state.bike.angularVelocity *= 0.98;
            state.bike.angle += state.bike.angularVelocity;
            if (state.bike.angle < 0) {
                state.bike.angle = 0;
                state.bike.angularVelocity = 0;
            }
            if (state.bike.angle > CONFIG.maxAngle) {
                state.bike.angle = CONFIG.maxAngle;
                state.bike.angularVelocity = 0;
            }
            bikePivot.rotation.x = -state.bike.angle;

            // Inverted lateral lean in free mode (opposite of linear mode).
            // V2 leans into its turns in rider.update().
            const lateralLean = -moveX * 0.5; // Negative to inverse the lean direction
            if (!roam) bikeGroup.rotation.z = lateralLean;

            // Special wheelie effects in free mode
            const wheelieProgress = state.bike.angle / CONFIG.maxAngle; // 0 to 1

            // Yellow sparks at the very end of wheelie (90%+)
            if (wheelieProgress > 0.9 && Math.random() > 0.6) {
                createSparkParticle();
            }

            // Progressive levitation from 50% to 100% wheelie
            if (wheelieProgress > 0.5) {
                const levitationProgress = (wheelieProgress - 0.5) / 0.5; // 0 to 1 from 50% to 100%
                bikeGroup.position.y = 0.5 * levitationProgress; // Gradually rises to 0.5m
            } else {
                bikeGroup.position.y = 0; // Normal height
            }

            // Progressive wheelie failure mechanics
            if (wheelieProgress >= 0.99) {
                state.bike.maxWheelieTimer += dt;

                // Shake left-right after 1 second
                if (state.bike.maxWheelieTimer >= 1.0 && state.bike.maxWheelieTimer < 3.0) {
                    const shakeIntensity = 0.15;
                    bikeGroup.rotation.z = Math.sin(state.gameTime * 10) * shakeIntensity;
                }

                // Fall backward after 3 seconds
                if (state.bike.maxWheelieTimer >= 3.0) {
                    const fallProgress = Math.min((state.bike.maxWheelieTimer - 3.0) / 0.5, 1); // 0.5s fall animation
                    bikePivot.rotation.x = -state.bike.angle - (fallProgress * 1.5); // Rotate backward

                    // Game over when fall is complete
                    if (fallProgress >= 1.0) {
                        gameOver('loop');
                    }
                }
            } else {
                state.bike.maxWheelieTimer = 0; // Reset timer
                if (!roam) bikeGroup.rotation.z = lateralLean; // Restore normal lean
            }

            state.distance += Math.abs(moveZ) + Math.abs(moveX);
            }
        } else {
            let isAccelerating = state.keys.up;
            let isBraking = state.keys.down;
            if (GAME_SETTINGS.controlMode === 'analog' && analogData.active) {
                let sensitivity = 1.0;
                const kmh = state.speed * 50;
                if (kmh < 200) sensitivity = 0.5;
                state.bike.lateralVelocity = analogData.x * CONFIG.maxLateralSpeed * sensitivity;
                if (GAME_SETTINGS.autoRace) {
                    if (autoRaceActive) isAccelerating = true;
                    if (analogData.y > 0.2) state.keys.space = true;
                    else state.keys.space = false;
                    if (state.keys.down) isBraking = true;
                } else {
                    if (analogData.y < -0.1) isAccelerating = true;
                    if (analogData.y > 0.5) isBraking = true;
                }
            } else {
                if (state.keys.left) state.bike.lateralVelocity -= CONFIG.lateralAccel;
                if (state.keys.right) state.bike.lateralVelocity += CONFIG.lateralAccel;
            }
            let accelerationScale = 1;
            if (GAME_SETTINGS.controlMode === 'analog' && analogData.active && analogData.y < -0.1) {
                // Driven with the exact value that is recorded (one byte), so the
                // server replay sees the same throttle as the game.
                accelerationScale = Math.round(Math.min(1, Math.abs(analogData.y) * 1.5) * 255) / 255;
            }
            // Ramp takeoff and tricks, decided on the speed at the start of
            // the frame exactly as the server does.
            const frame = state.frame;
            const startKmh = state.speed * 50;
            const jump = state.jump;
            const takeoff = jump.pending && !jump.airborne && startKmh > JUMP.minKmh &&
                frame >= rampsFrom() && frame - jump.lastLanding >= JUMP.spacing;
            jump.pending = false;
            if (takeoff) {
                jump.airborne = true;
                jump.y = JUMP.rampHeight;
                jump.vy = (10 + startKmh * 0.08) / 60;
                jump.trickFrames = 0;
                audio.play('rev_blip', { volume: 0.45, rate: 1.15 });
            }
            const trickAir = state.keys.trick && jump.airborne && frame >= rampsFrom();
            const trickGround = state.keys.trick && !jump.airborne && frame >= groundTricksFrom() &&
                state.bike.angle < JUMP.groundTrickMaxAngle;
            setTrick(trickAir || trickGround);
            const grounded = !jump.airborne;
            const boost = state.boost;
            const boostPressed = state.keys.boost && !boost.wasHeld;
            boost.wasHeld = state.keys.boost;
            const boostStart = boostPressed && boost.charges > 0 && boost.frames === 0 && grounded;
            if (boostStart) {
                boost.charges -= 1;
                boost.frames = BOOST.frames;
                fireBoostEffects();
            }
            // No traction in the air; no throttle or wheelie during a stunt.
            // The wheelie button is recorded in the air too: it drives the
            // backflip (it gives no lift there, as on the server).
            isAccelerating = isAccelerating && grounded && !trickGround;
            const manualFlips = state.flipMode === 'manual';
            // Manual backflips: the brake in the air turns the bike forwards
            // (recorded; it does nothing else there, as on the server).
            const airBrake = manualFlips && !grounded && isBraking;
            isBraking = isBraking && grounded;
            const wheelieInput = state.keys.space && !trickGround;
            if (takeoff && manualFlips) {
                jump.flipActive = true;
                jump.flipKmh = startKmh;
                jump.flipAngle = 0;
                jump.flipRate = manualFlipRate(startKmh);
                if (!jump.hinted && startKmh >= 115) {
                    jump.hinted = true;
                    toast('BACKFLIP MANUEL', `${isMobile() ? 'WHEELIE' : 'ESPACE'} : en arrière · FREIN : en avant · pose-toi à plat`, { discreet: true, float: true });
                }
            } else if (takeoff) {
                const inWheelie = wheelieInput && state.bike.angle >= FLIP.minAngle;
                jump.flipActive = inWheelie && startKmh >= FLIP.kmh;
                if (jump.flipActive) {
                    jump.flipKmh = startKmh;
                    jump.flipAngle = state.bike.angle;
                    jump.flipRate = (2 * Math.PI * flipTurnsFor(startKmh) - state.bike.angle) / flightFrames(jump.vy);
                }
                if (inWheelie) announceFlip(startKmh);
            }
            const inputFlags =
                (isAccelerating ? 0x01 : 0) |
                (isBraking || airBrake ? 0x02 : 0) |
                (wheelieInput ? 0x04 : 0) |
                (takeoff ? TAKEOFF_FLAG : 0) |
                (trickAir || trickGround ? TRICK_FLAG : 0) |
                (boostStart ? BOOST_FLAG : 0);
            recordRankedInput(inputFlags, accelerationScale);
            state.bike.lateralVelocity *= CONFIG.lateralFriction;
            if (state.bike.lateralVelocity > CONFIG.maxLateralSpeed) state.bike.lateralVelocity = CONFIG.maxLateralSpeed;
            if (state.bike.lateralVelocity < -CONFIG.maxLateralSpeed) state.bike.lateralVelocity = -CONFIG.maxLateralSpeed;
            bikeGroup.position.x += state.bike.lateralVelocity;
            if (bikeGroup.position.x > 9) {
                bikeGroup.position.x = 9;
                state.bike.lateralVelocity = 0;
            }
            if (bikeGroup.position.x < -9) {
                bikeGroup.position.x = -9;
                state.bike.lateralVelocity = 0;
            }

            // Realistic Speed-Based Lean Physics
            const kmh = state.speed * 50;
            let leanFactor = 0.5;

            if (state.bike.angle > 0.2) {
                // WHEELIE: Inverse sway for balancing effect
                leanFactor = -1.5; // Negative = inverse direction (prevents sinking)
            } else if (kmh < 70) {
                // LOW SPEED (<70 km/h): Inverse lean (road tilts opposite to wheel)
                leanFactor = -0.8; // Negative = inverse direction
            } else {
                // HIGH SPEED (>=70 km/h): Normal lean (bike tilts toward turn)
                leanFactor = 1.2; // Positive = normal direction, amplified for realism
            }

            bikeGroup.rotation.z = state.bike.lateralVelocity * leanFactor;

            let lift = 0;
            if (wheelieInput && isAccelerating) {
                if (kmh > 110) lift = CONFIG.wheelieLiftFast;
                else if (kmh > 0) lift = CONFIG.wheelieLift;
                else lift = CONFIG.wheelieLift * 0.5;
                if (state.bike.angle > CONFIG.balancePoint - CONFIG.sweetSpotWidth &&
                    state.bike.angle < CONFIG.balancePoint + CONFIG.sweetSpotWidth) {
                    lift *= 0.5;
                }
            }
            if (isBraking) {
                lift -= CONFIG.wheelieLift * 2;

                // Système de freinage réaliste : moins efficace à haute vitesse
                const kmh = state.speed * 50;
                let brakeEfficiency = 1.0;

                if (kmh > 100) {
                    // À partir de 100 km/h, l'efficacité diminue progressivement
                    // À 100 km/h: 100%, à 150 km/h: 50%, à 200 km/h: 30%
                    brakeEfficiency = Math.max(0.3, 1.0 - ((kmh - 100) / 200));
                }

                const brakePower = CONFIG.brakeForce * brakeEfficiency;
                state.speed = Math.max(0, state.speed - brakePower);
            }
            const bavette = state.bavette;
            if (grounded && bavette.left > 0) {
                // Bavette: the tail on the road, held at the top.
                bavette.total += 1;
                if (wheelieInput && !isBraking) {
                    bavette.left -= 1;
                    if (bavette.left === 0) gameOver('bavette');
                } else {
                    bavette.left = 0;
                    state.bike.angle = CONFIG.maxAngle;
                    state.bike.angularVelocity = BAVETTE.releaseAv;
                    endBavette(true);
                }
                if (state.plate.on && bavette.total >= PLATE.wearFrames) {
                    state.plate.on = false;
                    state.plate.off = true;
                    state.score += PLATE.bonus;
                    plateTornOff();
                }
            } else if (grounded) {
                state.bike.angularVelocity += lift;
                state.bike.angularVelocity -= CONFIG.gravity;
                state.bike.angularVelocity *= 0.98;
                state.bike.angle += state.bike.angularVelocity;
                if (state.bike.angle < 0) {
                    state.bike.angle = 0;
                    state.bike.angularVelocity = 0;
                }
                if (state.bike.angle > CONFIG.maxAngle) {
                    bavette.left = bavetteFrames(state.bike.angularVelocity, kmh);
                    if (bavette.left === 0) {
                        gameOver('loop');
                    } else {
                        state.bike.angle = CONFIG.maxAngle;
                        state.bike.angularVelocity = 0;
                        startBavette(bavette.left);
                    }
                }
            } else {
                // In the air: no rear wheel to pivot on, the bike levels out.
                if (bavette.left > 0) endBavette(false);
                bavette.left = 0;
                state.bike.angularVelocity = 0;
                state.bike.angle = Math.max(0, state.bike.angle - AIR_LEVEL_RATE);
            }
            if (state.bike.angle > CONFIG.maxAngle) {
                gameOver('loop');
            }
            // In the air the nose follows the flight: up off the lip, down to land.
            const airPitch = jump.airborne ? Math.max(-0.45, Math.min(0.5, jump.vy * 3.2)) : 0;
            if (jump.flipActive && jump.airborne) {
                // Manual: the whole bike's angle (levelling wheelie + the turn).
                const shown = manualFlips ? state.bike.angle + jump.flipAngle : jump.flipAngle;
                if (v2) v2.rider.setFlip(shown);
                else bikePivot.rotation.x = -shown;
            } else {
                if (v2) v2.rider.setFlip(0);
                bikePivot.rotation.x = -state.bike.angle - airPitch;
            }
            // Bad landing: the bike slides left and right for a moment.
            if (state.badLanding > 0) {
                state.badLanding = Math.max(0, state.badLanding - dt);
                bikeGroup.rotation.z += badLandingWobble();
            }
            if (isAccelerating) {
                let accel = CONFIG.baseAcceleration;
                if (kmh > 130) accel *= 0.15;
                else if (kmh > 120) accel *= 0.3;
                else if (kmh > 100) accel *= 0.5;
                else if (kmh > 80) accel *= 0.7;
                else if (kmh > 60) accel *= 0.85;
                accel *= accelerationScale;
                if (state.speed < CONFIG.maxSpeed) state.speed += accel;
            } else if (grounded && !isBraking) {
                if (state.speed > CONFIG.minSpeed) state.speed -= CONFIG.deceleration;
            }
            if (boost.frames > 0) {
                if (grounded && state.speed < BOOST.maxSpeed) {
                    state.speed += BOOST.accel;
                    boost.gain += BOOST.accel;
                }
                state.score += BOOST.rate * FIXED_STEP * (GAME_SETTINGS.difficulty === 'hard' ? 1.4 : GAME_SETTINGS.difficulty === 'medium' ? 1.2 : 1.0);
                boost.frames -= 1;
            } else if (boost.gain > 0) {
                const drain = Math.min(BOOST.drain, boost.gain);
                state.speed -= drain;
                boost.gain -= drain;
            }
            bikeGroup.position.z -= state.speed;
            state.distance += state.speed;
            state.distance += state.speed;

            // Nouveau système de score basé sur le temps
            // Base : 1 point par seconde (60 points par minute)
            // Utiliser la variable kmh déjà déclarée plus haut

            // Seulement donner des points si la vitesse dépasse 20 km/h (en mouvement)
            if (kmh > 20) {
                let scoreIncrement = dt; // dt est en secondes, donc 1 point/seconde de base

                // Calculer le pourcentage d'inclinaison (0% à 100%)
                const wheeliePercentage = Math.max(0, Math.min(100, (state.bike.angle / CONFIG.maxAngle) * 100));
                state.wheeliePercentage = wheeliePercentage;

                // Multiplicateur BLEU basé sur l'angle instantané : de x1 à x2
                // 0% = x1, 50% = x1.5, 100% = x2
                const angleMultiplier = 1.0 + (wheeliePercentage / 100.0);
                state.angleMultiplier = angleMultiplier;

                // Multiplicateur PROGRESSIF basé sur le temps en wheeling haut
                const wheelieThreshold = CONFIG.maxAngle * 0.5; // 50% de la hauteur
                const isInHighWheelie = state.bike.angle > wheelieThreshold;
                if (isInHighWheelie) {
                    // Augmenter le temps de wheeling
                    state.wheelieTime += dt;

                    // Multiplicateur progressif : de x2 à x5 sur 30 secondes
                    state.timeMultiplier = Math.min(2.0 + (state.wheelieTime / 30.0) * 3.0, 5.0);
                } else {
                    // Réinitialiser le temps de wheeling
                    state.wheelieTime = 0;
                    state.timeMultiplier = 1.0;
                }

                // MULTIPLICATION des deux multiplicateurs
                // Exemple: 75% d'angle (x1.75) × x3 de temps = x5.25 total
                const combinedWheelieMultiplier = angleMultiplier * state.timeMultiplier;
                state.currentMultiplier = combinedWheelieMultiplier;
                if (state.currentMultiplier >= 3.5 && !announcedCombo) {
                    speak('combo');
                    announcedCombo = true;
                } else if (state.currentMultiplier < 2.5) {
                    announcedCombo = false;
                }

                // Application du multiplicateur de difficulté
                let difficultyMult = 1.0;
                if (GAME_SETTINGS.difficulty === 'medium') difficultyMult = 1.2;
                if (GAME_SETTINGS.difficulty === 'hard') difficultyMult = 1.4;

                // Multiplicateur total : (angle × temps) × vitesse × difficulté
                // (vitesse : x1 à 20 km/h jusqu'à x1,5 dès 200 km/h).
                const totalMultiplier = combinedWheelieMultiplier * speedMultiplier(kmh) * difficultyMult;

                scoreIncrement *= totalMultiplier;
                state.score += scoreIncrement;
            } else {
                // Si vitesse trop faible, réinitialiser
                state.wheeliePercentage = 0;
                state.wheelieTime = 0;
                state.angleMultiplier = 1.0;
                state.timeMultiplier = 1.0;
                state.currentMultiplier = 1.0;
            }

            // Tricks and the flight, in the server's order.
            const trickDifficulty = GAME_SETTINGS.difficulty === 'hard' ? 1.4 : GAME_SETTINGS.difficulty === 'medium' ? 1.2 : 1.0;
            if (trickAir) {
                state.score += JUMP.airRate * FIXED_STEP * trickDifficulty;
                jump.trickFrames += 1;
            } else if (trickGround) {
                state.score += JUMP.groundRate * FIXED_STEP * trickDifficulty;
            }
            if (jump.airborne) {
                if (jump.flipActive && manualFlips) {
                    if (wheelieInput) jump.flipAngle += jump.flipRate;
                    else if (airBrake) jump.flipAngle -= jump.flipRate * FLIP_MANUAL.brake;
                } else if (jump.flipActive) {
                    jump.flipAngle = wheelieInput ? jump.flipAngle + jump.flipRate : flipSettle(jump.flipAngle);
                }
                jump.y += jump.vy;
                jump.vy -= JUMP.gravity;
                if (jump.y <= 0) {
                    jump.airborne = false;
                    jump.y = 0;
                    jump.lastLanding = frame;
                    if (trickAir) {
                        // Still in the stunt when the wheels touch down.
                        gameOver('trickLanding');
                    } else {
                        land(jump.trickFrames, trickDifficulty);
                        if (jump.flipActive) landFlip(frame);
                    }
                    jump.flipActive = false;
                }
            }
            // Too slow for too long: the police stop the run (server: the same,
            // on the speed at the end of the frame).
            const slow = state.slow;
            const endKmh = state.speed * 50;
            if (endKmh >= SLOW.kmh) {
                slow.armed = true;
                slow.frames = 0;
                slow.policeFrames = 0;
            } else if (slow.armed || frame >= SLOW.armFrame) {
                slow.armed = true;
                slow.frames += 1;
                if (endKmh < POLICE.hideKmh) slow.policeFrames += 1;
            }
            if (!state.tricksOnly) updatePoliceChase(endKmh, dt);
            if (!IS_V2) {
                state.trick.spin = state.trick.active ? state.trick.spin + dt * 7.5 : 0;
                bikeGroup.rotation.z += state.trick.spin;
            }
            jump.visualY = jump.airborne ? jump.y : rampHeightAt(bikeGroup.position.x, bikeGroup.position.z);
            bikeGroup.position.y = jump.visualY;
            updateRamps();
            announceTricks(frame);
            state.frame++;
        }

        // A long wheelie brought back down cleanly gets a word from the rider.
        if (state.bike.angle > CONFIG.maxAngle * 0.3) {
            wheelieHoldTime += dt;
        } else if (state.bike.angle === 0) {
            if (wheelieHoldTime > 3 && state.isPlaying) speak('landing');
            wheelieHoldTime = 0;
        }
        const multiplierStep = Math.floor(state.timeMultiplier);
        if (multiplierStep > lastMultiplierStep) {
            audio.play('multiplier_up', { volume: 0.35, rate: 1 + (multiplierStep - 3) * 0.08 });
        }
        lastMultiplierStep = Math.max(2, multiplierStep);
        if (!recordAnnounced && state.highScore > 0 && state.score > state.highScore) {
            recordAnnounced = true;
            audio.play('multiplier_up', { volume: 0.4, rate: 1.3 });
        }

        if (state.bike.angle >= CONFIG.maxAngle * 0.5 && !announcedWheelie) {
            speak('wheelie');
            announcedWheelie = true;
        } else if (state.bike.angle < CONFIG.maxAngle * 0.4) {
            announcedWheelie = false;
        }
        if (state.bike.angle >= CONFIG.maxAngle * 0.9 && !announcedNearFall) {
            speak('nearFall');
            announcedNearFall = true;
        } else if (state.bike.angle < CONFIG.maxAngle * 0.8) {
            announcedNearFall = false;
        }
        const currentKmh = (GAME_SETTINGS.gameMode === 'free' ? state.freeMode.speed : state.speed) * 50;
        if (currentKmh >= 150 && !announcedSpeed) {
            speak('speed');
            announcedSpeed = true;
        } else if (currentKmh < 120) {
            announcedSpeed = false;
        }
        if (state.gameTime - lastPeriodicVoiceAt >= 30) {
            lastPeriodicVoiceAt = state.gameTime;
            speak('periodic');
        }

        const roaming = GAME_SETTINGS.gameMode === 'free' && v2;
        const focusZ = roaming ? v2.roam.focus.z : bikeGroup.position.z;
        if (roaming) {
            const first = groundChunks[0];
            if (focusZ > first.position.z - 200) {
                const chunk = makeChunk(first.position.z + 100);
                scene.add(chunk);
                groundChunks.unshift(chunk);
                if (groundChunks.length > 7) dropChunk(groundChunks.pop());
            }
        }
        const lastChunk = groundChunks[groundChunks.length - 1];
        if (focusZ < lastChunk.position.z + 200) {
            const newZ = lastChunk.position.z - 100;
            const chunk = makeChunk(newZ);
            scene.add(chunk);
            groundChunks.push(chunk);
            // V2 blocks are pooled: keep only what can still be seen behind.
            if (groundChunks.length > (IS_V2 ? (roaming ? 7 : 6) : 12)) {
                const old = groundChunks.shift();
                state.animatedObjects = state.animatedObjects.filter((object) => object.parent !== old);
                dropChunk(old);
            }
            // Only spawn obstacles in linear mode
            if (GAME_SETTINGS.gameMode === 'linear') {
                // From about 20 s on, one block in two gets a ramp. In phase 3
                // fewer ramps: each one clears ~300 m of obstacles, which left
                // "figures + obstacles" almost without obstacles.
                const rampChance = state.tricksOnly ? 0.7 : state.frame >= JUMP.groundTricksFrom - 240 ? 0.25 : 0.5;
                const rampZ = newZ + 20 + Math.random() * 60;
                if (state.frame >= rampsFrom() && Math.random() < rampChance && !inQuietZone(rampZ)) spawnRamp(rampZ);
                state.rampFreeZones = state.rampFreeZones.filter((zone) => zone.to < bikeGroup.position.z);
                for (let i = 0; i < 4; i++) {
                    // Difficulty-based spawning
                    let spawnChance = 0.3; // Easy default
                    if (GAME_SETTINGS.difficulty === 'medium') spawnChance = 0.6;
                    if (GAME_SETTINGS.difficulty === 'hard') spawnChance = 0.9;

                    if (Math.random() < spawnChance) {
                        const z = newZ + Math.random() * 100;
                        if (obstaclesAllowed() && !inQuietZone(z) && !state.rampFreeZones.some((zone) => z <= zone.from && z >= zone.to)) spawnObstacle(z);
                    }
                }
            }
        }

        // Only check collisions in linear mode
        if (GAME_SETTINGS.gameMode === 'linear') {
            guardEdges();
            checkCollisions();
        }

        // Performance: Clean up old obstacles periodically
        obstacleCleanupCounter++;
        if (obstacleCleanupCounter > 300) {  // Every ~5 seconds at 60fps
            state.obstacles = state.obstacles.filter(obs => {
                if (obs.mesh.position.z > bikeGroup.position.z + 100) {
                    scene.remove(obs.mesh);
                    disposeObjectTree(obs.mesh);
                    return false;
                }
                return true;
            });
            obstacleCleanupCounter = 0;
        }
        }
        simulationAccumulator -= FIXED_STEP;
    }

    // The run may have just ended in this frame: the crash sequence renders it.
    if (!state.isPlaying) return;
    const snapshot = visualSnapshot();
    audio.update(elapsed, snapshot);
    if (GAME_SETTINGS.gameMode === 'free' && v2) updateIdleVoice(elapsed);
    if (v2) {
        if (!speedLines) speedLines = createSpeedLines();
        const free = GAME_SETTINGS.gameMode === 'free';
        const boosting = free ? v2.roam.boostState().active : state.boost.frames > 0;
        const kmhNow = speedKmh();
        const intensity = free && v2.roam.mode !== 'walk' ? Math.max(0, Math.min(1, (kmhNow - 95) / 55)) : 0;
        speedLines.update(elapsed, Math.min(1, intensity + (boosting ? 0.45 : 0)));
    }
    uiAccumulator += elapsed;
    if (uiAccumulator >= 0.1) {
        updateUI();
        updateMultiplierDisplay();
        uiAccumulator %= 0.1;
    }
    renderScene(elapsed, snapshot);
}

function updateCamera() {
    if (!bikeGroup) return;

    // Adjust FOV for portrait vs landscape
    const isPortrait = window.innerHeight > window.innerWidth;
    const targetBaseFOV = isPortrait ? 75 : 60;  // Wider FOV for portrait

    if (GAME_SETTINGS.gameMode === 'free') {
        const kmh = speedKmh();
        const roamMode = v2 ? v2.roam.mode : 'bike';
        const target = v2 ? v2.roam.focus : bikeGroup.position;

        // FOV dynamique basé sur la vitesse
        // V2: the view opens up with speed, much more past 90 km/h.
        const fast = Math.max(0, Math.min(1, (kmh - 90) / 60));
        let fovBoost = IS_V2 ? Math.min(1, kmh / 90) * 5 + Math.pow(fast, 1.2) * 13 : state.freeMode.speed * 10;
        if (state.keys.up || (GAME_SETTINGS.controlMode === 'analog' && analogData.y < -0.3)) {
            fovBoost += IS_V2 ? 3 : 8; // Boost supplémentaire lors de l'accélération
        }
        const targetFOV = targetBaseFOV + fovBoost;
        camera.fov += (targetFOV - camera.fov) * 0.08;
        camera.updateProjectionMatrix();

        // Distance de caméra dynamique
        let distanceOffset = 12; // Distance de base
        let heightOffset = 6; // Hauteur de base

        // À l'accélération : la moto "décolle" de la caméra
        if (state.keys.up || (GAME_SETTINGS.controlMode === 'analog' && analogData.y < -0.3)) {
            if (kmh > 100) {
                distanceOffset = 18; // S'éloigne rapidement
                heightOffset = 8;
            } else {
                distanceOffset = 15;
                heightOffset = 7;
            }
        } else if (state.keys.down || (GAME_SETTINGS.controlMode === 'analog' && analogData.y > 0.3)) {
            // Au freinage : caméra se rapproche
            distanceOffset = 8;
            heightOffset = 5;
        } else if (kmh > 50) {
            // Vitesse normale : distance intermédiaire
            distanceOffset = 12 + (kmh - 50) / 50; // Augmente progressivement
            heightOffset = 6;
        }

        // Track time at high speed for gradual return
        if (!state.highSpeedTimer) state.highSpeedTimer = 0;
        if (kmh > 100 && !(state.keys.up || (GAME_SETTINGS.controlMode === 'analog' && analogData.y < -0.3))) {
            state.highSpeedTimer += 1 / 60;
        } else {
            state.highSpeedTimer = 0;
        }

        // Après 2 secondes à haute vitesse sans accélérer, revenir progressivement
        if (state.highSpeedTimer > 2) {
            const returnFactor = Math.min((state.highSpeedTimer - 2) / 2, 1);
            distanceOffset = distanceOffset - (returnFactor * 4);
        }

        if (roamMode === 'walk') {
            distanceOffset = 4.6;
            heightOffset = 2.5;
        } else if (roamMode === 'bike' && v2) {
            // The bike is smaller in free roam (life-size street); at speed
            // the camera drops lower and closer, the road rushes by.
            const fast = Math.max(0, Math.min(1, (kmh - 90) / 60));
            distanceOffset *= 0.56 * (1 - 0.38 * fast);
            heightOffset *= 0.6 * (1 - 0.36 * fast);
        } else if (roamMode === 'car') {
            distanceOffset = 13 + state.freeMode.speed * 4;
            heightOffset = 5.5;
        } else if (roamMode === 'glide') {
            // Behind and a little above the hang glider, all the way down.
            distanceOffset = 10;
            heightOffset = target.y + 3.4;
        }
        let targetX = target.x;
        let targetZ = target.z + distanceOffset;
        const targetY = heightOffset;
        let lookX = target.x;
        let lookZ = target.z - 8;
        if (v2 && roamMode !== 'walk') {
            // Riding or driving: behind the vehicle, turning with it.
            const heading = roamMode === 'car' ? v2.roam.carYaw : roamMode === 'glide' ? v2.roam.glideYaw : bikeGroup.rotation.y;
            if (freeCamYaw === null) freeCamYaw = heading;
            let turn = heading - freeCamYaw;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            freeCamYaw += turn * 0.08;
            targetX = target.x - Math.sin(freeCamYaw) * distanceOffset;
            targetZ = target.z - Math.cos(freeCamYaw) * distanceOffset;
            lookX = target.x + Math.sin(freeCamYaw) * 8;
            lookZ = target.z + Math.cos(freeCamYaw) * 8;
            // Ride along: at 140 km/h the camera must not trail far behind.
            if (freeCamLast) {
                const dx = target.x - freeCamLast.x;
                const dz = target.z - freeCamLast.z;
                if (Math.hypot(dx, dz) < 10) {
                    camera.position.x += dx * 0.9;
                    camera.position.z += dz * 0.9;
                }
            }
        } else {
            freeCamYaw = null;
        }
        if (!freeCamLast) freeCamLast = new THREE.Vector3();
        freeCamLast.set(target.x, 0, target.z);

        camera.position.x += (targetX - camera.position.x) * 0.12;
        camera.position.z += (targetZ - camera.position.z) * 0.12;
        camera.position.y += (targetY - camera.position.y) * 0.12;
        // Road buzz at speed.
        const buzz = v2 && roamMode !== 'walk' ? Math.max(0, Math.min(1, (kmh - 100) / 60)) : 0;
        if (buzz > 0) {
            camera.position.x += (Math.random() - 0.5) * 0.05 * buzz;
            camera.position.y += (Math.random() - 0.5) * 0.04 * buzz;
        }
        camera.lookAt(lookX, roamMode === 'glide' ? target.y + 0.5 : roamMode === 'walk' ? 1.25 : 1, lookZ);
    } else {
        // Dynamic FOV based on speed (Visual Acceleration)
        // Base increase + extra kick when accelerating
        // V2: a much smaller widening (it reached +50° at 150 km/h and made the
        // bike shrink into the distance). Classic keeps its original feel.
        let fovBoost = IS_V2 ? Math.min(state.speed, 4) * 5 : state.speed * 15;
        if (state.keys.up || (GAME_SETTINGS.controlMode === 'analog' && analogData.y < -0.1)) {
            fovBoost += IS_V2 ? 3 : 5; // Extra FOV kick when gas is pressed
        }

        const targetFOV = targetBaseFOV + fovBoost;
        camera.fov += (targetFOV - camera.fov) * 0.05; // Smoother transition
        camera.updateProjectionMatrix();

        // Dynamic Shake & Zoom
        const kmh = state.speed * 50;
        let shakeIntensity = 0;

        if (kmh > 150) {
            // Moderate shake starting at 150km/h
            shakeIntensity = (kmh - 150) * 0.002;
        }

        if (kmh > 200) {
            // Intense shake at 200km/h+
            shakeIntensity += (kmh - 200) * 0.005;
        }

        // Cap shake to avoid being unplayable
        shakeIntensity = Math.min(shakeIntensity, 0.8);

        const shakeX = (Math.random() - 0.5) * shakeIntensity;
        const shakeY = (Math.random() - 0.5) * shakeIntensity * 0.5;

        // Camera distance logic - comfortable distance
        // Sur mobile, réduire fortement les distances pour garder la moto visible
        // Priorité à la width pour éviter les bugs de user agent
        const isMobileDevice = (window.innerWidth < 768) || isMobile();

        // Distance de base réduite sur mobile
        // The V2 rider is larger on screen: stand a little further back on phones.
        let baseDistance = isMobileDevice ? (IS_V2 ? 6.5 : 5) : 8;
        let distanceOffset = baseDistance;

        // Éloignement progressif dès 25 km/h
        if (kmh > 25) {
            const speedExcess = IS_V2 ? Math.min(1, (kmh - 25) / 125) : (kmh - 25) / 125; // 0 to 1 as speed goes from 25 to 150
            // Sur mobile: max +0.5, sur desktop: max +2
            const maxExtraDistance = isMobileDevice ? 0.5 : 2;
            distanceOffset = baseDistance + (speedExcess * maxExtraDistance);
        }

        // Effet d'accélération: la moto s'éloigne un peu
        const isAccelerating = state.keys.up || (GAME_SETTINGS.controlMode === 'analog' && analogData.y < -0.1);
        if (isAccelerating && kmh > 25) {
            // Sur mobile: +0.2 max, sur desktop: +1.5
            distanceOffset += isMobileDevice ? 0.2 : 1.5;
        }

        // Track time at medium speed for auto-return
        if (!state.highSpeedTimer) state.highSpeedTimer = 0;
        if (kmh > 60 && !isAccelerating) {
            state.highSpeedTimer += 1 / 60; // Increment in seconds
        } else {
            state.highSpeedTimer = 0;
        }

        // Après 1.5 secondes sans accélérer, ramener la caméra progressivement
        if (state.highSpeedTimer > 1.5) {
            const returnFactor = Math.min((state.highSpeedTimer - 1.5) / 1.5, 1);
            const returnAmount = isMobileDevice ? 0.5 : 2.5;
            distanceOffset = distanceOffset - (returnFactor * returnAmount);
            distanceOffset = Math.max(distanceOffset, baseDistance - 0.5);
        }

        const targetZ = bikeGroup.position.z + distanceOffset;
        // A jump lifts the bike several metres: the camera rises with it.
        const targetY = (isMobileDevice ? (IS_V2 ? 4 : 3.5) : 4.5) + state.jump.visualY * 0.6;

        // Rattrapage plus rapide (0.15 au lieu de 0.1)
        camera.position.x += (bikeGroup.position.x - camera.position.x) * 0.1 + shakeX;
        // The camera rides along with most of the bike's motion, then eases
        // the rest: at speed the bike only pulls a little ahead instead of
        // running away from the camera (the old lag grew to ~17 m at 150 km/h).
        const bikeDz = lastCameraBikeZ === null ? 0 : bikeGroup.position.z - lastCameraBikeZ;
        lastCameraBikeZ = bikeGroup.position.z;
        if (IS_V2 && Math.abs(bikeDz) < 10) camera.position.z += bikeDz * 0.9;
        // Catch up faster during jumps and stunts so the trick can be seen.
        const followRate = state.jump.airborne || state.trick.active ? 0.35 : 0.15;
        camera.position.z += (targetZ - camera.position.z) * followRate;
        camera.position.y += (targetY - camera.position.y) * 0.1 + shakeY;

        // Look slightly ahead of the bike
        camera.lookAt(bikeGroup.position.x, 2 + state.jump.visualY * 0.5, bikeGroup.position.z - 20);
    }
}

function updateBoostState() {
    let detail;
    if (GAME_SETTINGS.gameMode === 'free') {
        detail = v2 ? { mode: 'free', ...v2.roam.boostState() } : null;
    } else {
        detail = { mode: 'ranked', charges: state.boost.charges, active: state.boost.frames > 0, ready: state.boost.charges > 0 };
    }
    if (detail) document.dispatchEvent(new CustomEvent('wheelie:boost', { detail }));
}

let lastTrickHint = '';
function updateTrickButton() {
    const button = document.getElementById('analog-trick');
    const available = state.isPlaying && GAME_SETTINGS.gameMode === 'linear' && state.frame >= JUMP.rampsFrom;
    const ready = state.jump.airborne || (state.frame >= JUMP.groundTricksFrom && state.bike.angle < JUMP.groundTrickMaxAngle);
    if (button) {
        if (button.hidden === available) button.hidden = !available;
        button.classList.toggle('is-ready', available && ready);
    }
    // Computer: the F key reminder (the pad only exists on touch screens).
    const hint = `${available}${available && ready}${state.trick.active}`;
    if (hint !== lastTrickHint) {
        lastTrickHint = hint;
        document.dispatchEvent(new CustomEvent('wheelie:trick', { detail: { available, ready: available && ready, active: state.trick.active } }));
    }
}

// Keyboard reminders for the current situation (computer only, see ui.js).
function showKeyHints(seconds = 8) {
    if (!state.isPlaying) return;
    const mode = GAME_SETTINGS.gameMode === 'free' ? (v2 ? v2.roam.mode : 'bike') : 'race';
    document.dispatchEvent(new CustomEvent('wheelie:keys', { detail: { mode, seconds } }));
}
document.addEventListener('wheelie:controls', () => {
    if (GAME_SETTINGS.gameMode === 'free') setTimeout(() => showKeyHints(7), 0);
});

function updateUI() {
    updateTrickButton();
    if (state.isPlaying) updateBoostState();
    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.innerText = Math.floor(state.score);
    const speedText = document.getElementById('speed-text');
    const speedNeedle = document.getElementById('gauge-needle');
    if (speedText && speedNeedle) {
        const kmh = Math.max(0, Math.floor(speedKmh()));
        speedText.innerText = `${kmh}`;
        const maxKmh = 200;
        const pct = Math.min(1, kmh / maxKmh);
        // 270 degree range: Starts at 135deg (bottom left) to 405deg (bottom right)
        // Or -225 to +45
        // Let's calibrate: 0 speed = 135deg. Max speed = 405deg.
        const deg = 135 + (pct * 270);
        speedNeedle.style.transform = `rotate(${deg}deg)`;
        if (IS_V2) document.getElementById('speedometer').style.setProperty('--speed', pct.toFixed(3));
    }
}

function updateMultiplierDisplay() {
    // 1. Multiplicateur de temps (orange/jaune/rouge) - popup toutes les 3 secondes
    const timeMultEl = document.getElementById('time-multiplier-display');
    if (timeMultEl && state.timeMultiplier > 1.0) {
        const currentTime = Date.now();
        if (currentTime - state.lastTimeMultiplierDisplay > 3000) {
            state.lastTimeMultiplierDisplay = currentTime;

            // Position aléatoire: gauche ou droite
            const isLeft = Math.random() < 0.5;
            if (isLeft) {
                timeMultEl.style.left = '15%';
                timeMultEl.style.right = 'auto';
                timeMultEl.style.transform = 'rotate(-8deg)';
            } else {
                timeMultEl.style.right = '15%';
                timeMultEl.style.left = 'auto';
                timeMultEl.style.transform = 'rotate(8deg)';
            }

            // Couleur selon le niveau: orange -> jaune -> rouge
            let color, shadow;
            if (state.timeMultiplier >= 4.5) {
                color = '#FF1744'; // Rouge vif
                shadow = '3px 3px 0px #000, 0 0 30px rgba(255, 23, 68, 0.9)';
            } else if (state.timeMultiplier >= 3.5) {
                color = '#FF9800'; // Orange
                shadow = '3px 3px 0px #000, 0 0 25px rgba(255, 152, 0, 0.8)';
            } else {
                color = '#FFC107'; // Jaune
                shadow = '3px 3px 0px #000, 0 0 20px rgba(255, 193, 7, 0.7)';
            }

            timeMultEl.style.color = color;
            timeMultEl.style.textShadow = shadow;
            timeMultEl.textContent = `x${state.timeMultiplier.toFixed(1)}`;
            timeMultEl.classList.add('show');

            // Cacher après 2.5 secondes
            setTimeout(() => {
                timeMultEl.classList.remove('show');
                setTimeout(() => {
                    timeMultEl.style.opacity = '0';
                }, 400);
            }, 2500);
        }
    }

    // 2. Multiplicateur d'angle (bleu) - fixe en dessous
    const angleMultEl = document.getElementById('angle-multiplier-display');
    if (angleMultEl) {
        if (state.angleMultiplier > 1.0) {
            angleMultEl.textContent = `x${state.angleMultiplier.toFixed(2)}`;
            angleMultEl.style.opacity = '1';
        } else {
            angleMultEl.style.opacity = '0';
        }
    }

    // 3. Pourcentage de wheeling avec emoji moto
    const percentageEl = document.getElementById('wheelie-percentage-display');
    const bikeEmoji = document.getElementById('bike-emoji');
    const percentageText = document.getElementById('percentage-text');

    if (percentageEl && bikeEmoji && percentageText) {
        if (state.wheeliePercentage > 0) {
            percentageText.textContent = `${Math.floor(state.wheeliePercentage)}%`;

            // Incliner l'emoji selon le pourcentage (inversé pour que la moto se lève)
            const rotation = 45 - (state.wheeliePercentage / 100) * 45; // De 45° à 0°
            const scale = 1 + (state.wheeliePercentage / 100) * 0.3; // De 1 à 1.3
            bikeEmoji.style.transform = `rotate(${rotation}deg) scale(${scale})`;

            percentageEl.style.opacity = '1';
        } else {
            percentageEl.style.opacity = '0';
        }
    }
}

function isMobile() {
    return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
}

const GAME_SETTINGS = {
    controlMode: 'analog',
    gameMode: 'linear',
    difficulty: 'hard', // easy, medium, hard
    autoRace: false,
    graphicsQuality: 'high',
    voiceEnabled: localStorage.getItem('wheelie_voice_enabled') !== 'false',
    sfxEnabled: localStorage.getItem('wheelie_sfx_enabled') !== 'false',
    language: localStorage.getItem('wheelie_language') === 'en' ? 'en' : 'fr',
    // 'player': the voice talks to the player; 'self': the rider talks about himself.
    perspective: localStorage.getItem('wheelie_voice_perspective') === 'self' ? 'self' : 'player',
    // Backflips: 'auto' (hold through the jump) or 'manual' (turn it yourself).
    flipMode: readSetting('wheelie_flip_mode') === 'manual' ? 'manual' : 'auto'
};

let audioManifestPromise;
let voiceAssetsAvailable = false;
let sfxAssetsAvailable = false;
const audio = createAudioEngine({ effects: soundEffects, getManifest: () => getAudioManifest() });
audio.setEnabled(GAME_SETTINGS.sfxEnabled);
// The classic version keeps its original commentary; V2 uses the rider's voice.
const voiceGroup = () => {
    if (!IS_V2) return 'classic';
    return GAME_SETTINGS.perspective === 'self' ? `${GAME_SETTINGS.language}_self` : GAME_SETTINGS.language;
};
let lastVoiceAt = -Infinity;
let lastPeriodicVoiceAt = 0;
let announcedWheelie = false;
let announcedCombo = false;
let announcedSpeed = false;
let announcedNearFall = false;

function getAudioManifest() {
    if (!audioManifestPromise) {
        audioManifestPromise = fetch('/audio/manifest.json')
            .then((response) => {
                if (!response.ok) throw new Error(`Audio manifest request failed: ${response.status}`);
                return response.json();
            })
            .then((manifest) => {
                const available = new Set(Array.isArray(manifest.available) ? manifest.available : []);
                voiceAssetsAvailable = Object.values(voiceLineGroups[voiceGroup()] || {})
                    .some((lines) => lines.some((line) => available.has(line.id)));
                sfxAssetsAvailable = soundEffects.some((effect) => available.has(effect.id));
                updateVoiceToggle();
                updateSfxToggle();
                return { available, hashes: manifest.hashes || {} };
            })
            .catch((error) => {
                console.warn('Game audio is unavailable:', error);
                reportError('asset.audio', error, { once: true, details: { file: 'audio/manifest.json' } });
                voiceAssetsAvailable = false;
                sfxAssetsAvailable = false;
                updateVoiceToggle();
                updateSfxToggle();
                return { available: new Set(), hashes: {} };
            });
    }
    return audioManifestPromise;
}

// The rider's voice (V2): Young Jamal, Will or Victoire. Each voice has its
// own copy of every line (prefix), loaded only once it is chosen.
const RIDER_VOICE_KEY = 'wheelie_rider_voice';
function riderVoiceKey() {
    const key = localStorage.getItem(RIDER_VOICE_KEY);
    return riderVoices.voices[key] ? key : riderVoices.default;
}
function voicePrefix() {
    return IS_V2 ? riderVoices.voices[riderVoiceKey()].prefix : '';
}

function setRiderVoice(key) {
    if (!riderVoices.voices[key]) return;
    localStorage.setItem(RIDER_VOICE_KEY, key);
    updateRiderVoiceButtons();
    warmUpVoices();
    previewRiderVoice(key);
}

function previewRiderVoice(key) {
    audio.unlock();
    audio.speak(`voice_preview_${key}_${GAME_SETTINGS.language}`, { volume: 0.95 });
}

function mountRiderVoicePicker() {
    const box = document.getElementById('rider-voice-options');
    if (!box || box.childElementCount) return;
    for (const [key, voice] of Object.entries(riderVoices.voices)) {
        const row = document.createElement('div');
        row.className = 'rider-voice';
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'rider-voice__pick';
        pick.dataset.voice = key;
        pick.innerHTML = `<strong></strong><span></span>`;
        pick.querySelector('strong').textContent = voice.label;
        pick.querySelector('span').textContent = voice.description;
        pick.addEventListener('click', () => setRiderVoice(key));
        const listen = document.createElement('button');
        listen.type = 'button';
        listen.className = 'rider-voice__listen';
        listen.setAttribute('aria-label', `Écouter ${voice.label}`);
        listen.textContent = '▶ Écouter';
        listen.addEventListener('click', () => previewRiderVoice(key));
        row.append(pick, listen);
        box.append(row);
    }
    updateRiderVoiceButtons();
}

function updateRiderVoiceButtons() {
    const current = riderVoiceKey();
    document.querySelectorAll('.rider-voice__pick').forEach((button) => {
        button.classList.toggle('active', button.dataset.voice === current);
    });
}

// Free roam has its own lines: no race commentary there.
const FREE_ROAM_EVENTS = new Set(['start', 'idle', 'wheelie', 'speed']);

function speak(eventName, { force = false, allowWhenStopped = false } = {}) {
    if (GAME_SETTINGS.gameMode === 'free' && !FREE_ROAM_EVENTS.has(eventName)) return;
    const group = voiceLineGroups[voiceGroup()];
    // Events newer than a group (the classic voice) fall back to the closest one.
    const lines = group?.[eventName] || (eventName === 'earlyCrash' ? group?.crash : null);
    if (!GAME_SETTINGS.voiceEnabled || !lines || (!state.isPlaying && !allowWhenStopped)) return;
    if (!force && performance.now() - lastVoiceAt < 8000) return;

    lastVoiceAt = performance.now();
    getAudioManifest().then(({ available, hashes }) => {
        if (!GAME_SETTINGS.voiceEnabled || (!state.isPlaying && !allowWhenStopped)) return;
        const prefix = voicePrefix();
        const choices = lines.filter((line) => available.has(prefix + line.id));
        if (choices.length === 0 || (!force && audio.speaking)) return;
        void hashes;
        const line = choices[Math.floor(Math.random() * choices.length)];
        audio.speak(prefix + line.id, { volume: 0.9 });
    });
}

function stopVoice() {
    audio.stopVoice();
}

// Standing still in free roam: "Kéfa ?", "Mec, tu veux pas bouger un peu ?"…
// now and then, every 30 s to 4 min, within the street dialogue's limit.
let idleTime = 0;
let nextIdleAt = 30 + Math.random() * 210;
function resetIdleVoice() {
    idleTime = 0;
    nextIdleAt = 30 + Math.random() * 210;
}
function updateIdleVoice(dt) {
    const roam = v2.roam;
    if (state.isPaused || state.userPaused || roam.frozen || state.freeMode.speed > 0.01) {
        idleTime = 0;
        return;
    }
    idleTime += dt;
    if (idleTime < nextIdleAt) return;
    resetIdleVoice();
    if (!GAME_SETTINGS.voiceEnabled || !roam.talk.claim()) return;
    speak('idle', { force: true });
}

// Decode the voice lines of the current group ahead of the first ride.
function warmUpVoices() {
    const prefix = voicePrefix();
    const ids = Object.values(voiceLineGroups[voiceGroup()] || {}).flat().map((line) => prefix + line.id);
    audio.warmUp(GAME_SETTINGS.voiceEnabled ? ids : []);
}

function setVoiceEnabled(enabled) {
    GAME_SETTINGS.voiceEnabled = enabled;
    localStorage.setItem('wheelie_voice_enabled', String(enabled));
    updateVoiceToggle();
    if (!enabled) stopVoice();
}

function updateVoiceToggle() {
    const voiceToggle = document.getElementById('voice-toggle');
    if (voiceToggle) {
        voiceToggle.classList.toggle('active', GAME_SETTINGS.voiceEnabled);
        voiceToggle.textContent = !voiceAssetsAvailable && GAME_SETTINGS.voiceEnabled
            ? '🎙️ VOIX : À GÉNÉRER'
            : GAME_SETTINGS.voiceEnabled ? '🔊 VOIX : ON' : '🔇 VOIX : OFF';
    }
}

function setSfxEnabled(enabled) {
    GAME_SETTINGS.sfxEnabled = enabled;
    localStorage.setItem('wheelie_sfx_enabled', String(enabled));
    updateSfxToggle();
    audio.setEnabled(enabled);
    if (enabled && state.isPlaying) {
        audio.prepare();
        audio.startRun();
    }
}

function updateSfxToggle() {
    const sfxToggle = document.getElementById('sfx-toggle');
    if (!sfxToggle) return;
    sfxToggle.classList.toggle('active', GAME_SETTINGS.sfxEnabled);
    sfxToggle.textContent = !sfxAssetsAvailable && GAME_SETTINGS.sfxEnabled
        ? '🎚️ EFFETS : À GÉNÉRER'
        : GAME_SETTINGS.sfxEnabled ? '🔊 EFFETS : ON' : '🔇 EFFETS : OFF';
}

function setAudioLanguage(language) {
    if (language !== 'fr' && language !== 'en') return;
    GAME_SETTINGS.language = language;
    localStorage.setItem('wheelie_language', language);
    updateLanguageButtons();
    warmUpVoices();
}

function setVoicePerspective(perspective) {
    if (perspective !== 'self' && perspective !== 'player') return;
    GAME_SETTINGS.perspective = perspective;
    localStorage.setItem('wheelie_voice_perspective', perspective);
    updateLanguageButtons();
    warmUpVoices();
}

function updateLanguageButtons() {
    document.getElementById('language-fr')?.classList.toggle('active', GAME_SETTINGS.language === 'fr');
    document.getElementById('language-en')?.classList.toggle('active', GAME_SETTINGS.language === 'en');
    document.getElementById('perspective-player')?.classList.toggle('active', GAME_SETTINGS.perspective === 'player');
    document.getElementById('perspective-self')?.classList.toggle('active', GAME_SETTINGS.perspective === 'self');
}

// Apply graphics quality settings
function applyGraphicsQuality() {
    const isTouchDevice = isMobile();
    if (v2) {
        const high = GAME_SETTINGS.graphicsQuality === 'high';
        renderer.shadowMap.enabled = high || !isTouchDevice;
        renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.5 : 2) : 1);
        v2.setQuality(high);
        renderer.setSize(window.innerWidth, window.innerHeight);
        return;
    }
    renderer.shadowMap.enabled = !isTouchDevice || GAME_SETTINGS.graphicsQuality === 'high';
    dirLight.castShadow = renderer.shadowMap.enabled;
    if (GAME_SETTINGS.graphicsQuality === 'high') {
        scene.fog = new THREE.Fog(0x87CEEB, 70, 400);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.5 : 2));
        dirLight.shadow.mapSize.set(isTouchDevice ? 1024 : 2048, isTouchDevice ? 1024 : 2048);
    } else {
        scene.fog = new THREE.Fog(0x87CEEB, 50, 300);
        renderer.setPixelRatio(1);
        dirLight.shadow.mapSize.set(1024, 1024);
    }
    dirLight.shadow.needsUpdate = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
}

let mobileControlsInitialized = false;
let analogData = { x: 0, y: 0, active: false };
let autoRaceCountdown = 0;
let autoRaceActive = false;
let obstacleCleanupCounter = 0;  // Performance: periodic obstacle cleanup

function setupMobileControls() {
    const mobileControls = document.getElementById('mobile-controls');
    const arrowControls = document.getElementById('arrow-controls');
    const analogControls = document.getElementById('analog-controls');
    if (!mobileControls) return;
    if (!isMobile()) {
        mobileControls.style.display = 'none';
        return;
    }

    // Mettre à jour l'emoji du bouton gaz selon le mode de jeu
    const gasEmoji = document.getElementById('gas-emoji');
    if (gasEmoji) {
        gasEmoji.innerText = GAME_SETTINGS.gameMode === 'free' ? '⚡' : '💨';
    }

    if (GAME_SETTINGS.controlMode === 'arrows') {
        mobileControls.style.display = 'block';
        arrowControls.style.display = 'block';
        analogControls.style.display = 'none';
    } else if (GAME_SETTINGS.controlMode === 'analog') {
        mobileControls.style.display = 'block';
        arrowControls.style.display = 'none';
        analogControls.style.display = 'block';
        const brakeBtn = document.getElementById('analog-brake');
        const gasBtn = document.getElementById('analog-gas');
        const wheelieBtn = document.getElementById('analog-wheelie');
        if (GAME_SETTINGS.autoRace) {
            if (gasBtn) gasBtn.style.display = 'none';
            if (wheelieBtn) wheelieBtn.style.display = 'none';
            if (brakeBtn) {
                brakeBtn.style.display = 'block';
                brakeBtn.style.right = '30px';
                brakeBtn.style.bottom = '50px';
            }
        } else {
            if (gasBtn) gasBtn.style.display = 'block';
            if (wheelieBtn) wheelieBtn.style.display = 'block';
            if (brakeBtn) {
                brakeBtn.style.display = 'block';
                brakeBtn.style.right = '90px';
            }
        }
    } else {
        mobileControls.style.display = 'none';
    }
    if (!mobileControlsInitialized) {
        setupArrowControls();
        setupAnalogControls();
        mobileControlsInitialized = true;
    }
}

function setupArrowControls() {
    const buttons = {
        'btn-left': 'left',
        'btn-right': 'right',
        'btn-up': 'up',
        'btn-down': 'down',
        'btn-wheelie': 'space'
    };
    Object.entries(buttons).forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            btn.setPointerCapture(event.pointerId);
            state.keys[key] = true;
        });
        const release = () => { state.keys[key] = false; };
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('lostpointercapture', release);
    });
}

function setupAnalogControls() {
    const analogBase = document.getElementById('analog-stick-base');
    const analogKnob = document.getElementById('analog-stick-knob');
    if (analogBase && analogKnob) {
        const handleAnalog = (e) => {
            e.preventDefault();
            const rect = analogBase.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const x = e.clientX - rect.left - centerX;
            const y = e.clientY - rect.top - centerY;
            const distance = Math.sqrt(x * x + y * y);
            const maxDistance = 40;
            let knobX = x;
            let knobY = y;
            if (distance > maxDistance) {
                const angle = Math.atan2(y, x);
                analogData.x = Math.cos(angle);
                analogData.y = Math.sin(angle);
                knobX = Math.cos(angle) * maxDistance;
                knobY = Math.sin(angle) * maxDistance;
            } else {
                analogData.x = x / maxDistance;
                analogData.y = y / maxDistance;
            }
            analogKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
            analogData.active = true;
        };
        const resetAnalog = () => {
            analogData.x = 0;
            analogData.y = 0;
            analogData.active = false;
            analogKnob.style.transform = 'translate(-50%, -50%)';
        };
        let pointerId = null;
        analogBase.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            pointerId = event.pointerId;
            analogBase.setPointerCapture(pointerId);
            handleAnalog(event);
        });
        analogBase.addEventListener('pointermove', (event) => {
            if (event.pointerId === pointerId) handleAnalog(event);
        });
        const releaseAnalog = (event) => {
            if (event.pointerId !== pointerId) return;
            pointerId = null;
            resetAnalog();
        };
        analogBase.addEventListener('pointerup', releaseAnalog);
        analogBase.addEventListener('pointercancel', releaseAnalog);
        analogBase.addEventListener('lostpointercapture', releaseAnalog);
    }
    const buttons = {
        'analog-gas': 'up',
        'analog-brake': 'down',
        'analog-wheelie': 'space',
        'analog-trick': 'trick',
        'analog-boost': 'boost',
        'analog-jump': 'space',
        'analog-run': 'run'
    };
    document.getElementById('analog-action')?.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        roamAction();
    });
    Object.entries(buttons).forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            btn.setPointerCapture(event.pointerId);
            state.keys[key] = true;
        });
        const release = () => { state.keys[key] = false; };
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('lostpointercapture', release);
    });
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Redraw for the new size (the game loop does it while a run is on).
    if (bikeGroup && !state.isPlaying && !(v2 && v2.rider.crashing)) {
        if (v2) v2.frame(0, visualSnapshot());
        else updateCamera();
        renderer.render(scene, camera);
    }
});

document.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.code === 'ArrowLeft' || e.code === 'KeyQ') state.keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') state.keys.right = true;
    if (e.code === 'ArrowUp' || e.code === 'KeyZ') state.keys.up = true;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') state.keys.down = true;

    if (e.code === 'KeyF' || e.code === 'KeyE') state.keys.trick = true;
    if (e.code === 'KeyG' && !e.repeat) roamAction();
    if (e.code === 'KeyH' && !e.repeat) showKeyHints(8);
    if (e.code === 'KeyB') state.keys.boost = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        state.keys.run = true;
        state.keys.boost = true;
    }

    // Space ONLY for wheelie (no restart functionality)
    if (e.code === 'Space') {
        e.preventDefault();
        state.keys.space = true;
    }

    // R key for restart/start game
    if (e.code === 'KeyR') {
        if (document.getElementById('start-screen').classList.contains('active') ||
            document.getElementById('game-over-screen').classList.contains('active')) {
            startGame();
        }
    }

    // Escape for pause
    if (e.code === 'Escape') {
        e.preventDefault();
        togglePause();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyQ') state.keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') state.keys.right = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyZ') state.keys.up = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') state.keys.down = false;
    if (e.code === 'Space') state.keys.space = false;
    if (e.code === 'KeyF' || e.code === 'KeyE') state.keys.trick = false;
    if (e.code === 'KeyB') state.keys.boost = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        state.keys.run = false;
        state.keys.boost = false;
    }
});
// The prompt chip at the top acts like the G key / action pad.
document.addEventListener('wheelie:action', () => roamAction());

window.addEventListener('blur', () => {
    Object.keys(state.keys).forEach((key) => { state.keys[key] = false; });
    analogData.x = 0;
    analogData.y = 0;
    analogData.active = false;
    const analogKnob = document.getElementById('analog-stick-knob');
    if (analogKnob) analogKnob.style.transform = 'translate(-50%, -50%)';
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.isPlaying) pauseGame();
});

// Settings Menu Navigation
const settingsMainMenu = document.getElementById('settings-main-menu');
const submenus = document.querySelectorAll('.settings-submenu');

function showSubmenu(id) {
    if (settingsMainMenu) settingsMainMenu.style.display = 'none';
    submenus.forEach(sm => sm.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'flex';
    // Hide main back button when in submenu
    if (backBtn) backBtn.style.display = 'none';
}

function showSettingsMain() {
    if (settingsMainMenu) settingsMainMenu.style.display = 'flex';
    submenus.forEach(sm => sm.style.display = 'none');
    if (backBtn) backBtn.style.display = 'block';
}

// Backflip mode: automatic (hold through the jump) or manual.
const FLIP_MODE_TEXT = {
    auto: 'Automatique : en wheeling à 130 km/h au tremplin, garde le wheeling, la moto fait le tour seule.',
    manual: 'Manuel : en l’air, wheeling = tourner en arrière, frein = en avant. C’est l’angle à l’atterrissage qui compte. Lent sous 80 km/h, un tour complet possible dès 115.'
};
function showFlipMode() {
    document.getElementById('flip-auto')?.classList.toggle('active', GAME_SETTINGS.flipMode === 'auto');
    document.getElementById('flip-manual')?.classList.toggle('active', GAME_SETTINGS.flipMode === 'manual');
    const desc = document.getElementById('flip-desc');
    if (desc) desc.textContent = FLIP_MODE_TEXT[GAME_SETTINGS.flipMode];
}
function setFlipMode(mode) {
    GAME_SETTINGS.flipMode = mode;
    try {
        localStorage.setItem('wheelie_flip_mode', mode);
    } catch {
        // Kept for this visit.
    }
    showFlipMode();
}
document.getElementById('flip-auto')?.addEventListener('click', () => setFlipMode('auto'));
document.getElementById('flip-manual')?.addEventListener('click', () => setFlipMode('manual'));
showFlipMode();

// Category Buttons
document.getElementById('btn-cat-controls')?.addEventListener('click', () => showSubmenu('submenu-controls'));
document.getElementById('btn-cat-gamemode')?.addEventListener('click', () => showSubmenu('submenu-gamemode'));
document.getElementById('btn-cat-options')?.addEventListener('click', () => showSubmenu('submenu-options'));
document.getElementById('btn-cat-graphics')?.addEventListener('click', () => showSubmenu('submenu-graphics'));
document.getElementById('btn-cat-version')?.addEventListener('click', () => showSubmenu('submenu-version'));
// Rider screen: the rider is shown turning while the look is changed.
document.getElementById('rider-btn')?.addEventListener('click', () => {
    document.getElementById('start-screen')?.classList.remove('active');
    document.getElementById('rider-screen')?.classList.add('active');
    if (v2) v2.showroom(true);
});
document.getElementById('back-from-rider')?.addEventListener('click', () => {
    document.getElementById('rider-screen')?.classList.remove('active');
    document.getElementById('start-screen')?.classList.add('active');
    if (v2) v2.showroom(false);
});

// Switching version reloads the page: scores, nickname and settings are kept.
function switchVersion(version) {
    if (version === GAME_VERSION) return;
    localStorage.setItem(VERSION_KEY, version);
    const url = new URL(window.location.href);
    url.searchParams.delete('version');
    window.location.replace(url);
}

function updateVersionUI() {
    document.getElementById('version-v2')?.classList.toggle('active', IS_V2);
    document.getElementById('version-classic')?.classList.toggle('active', !IS_V2);
    const label = document.getElementById('version-label');
    if (label) label.innerText = IS_V2 ? '51 Games - V2.0 Réaliste' : '51 Games - V1.0 Classique';
    const board = document.getElementById('leaderboard-version');
    if (board) board.innerText = IS_V2 ? 'VERSION 2 · RÉALISTE' : 'VERSION 1 · CLASSIQUE';
    // The rider's language only applies to the V2 voice.
    document.querySelectorAll('.v2-only').forEach((element) => {
        element.style.display = IS_V2 ? '' : 'none';
    });
}

document.getElementById('version-v2')?.addEventListener('click', () => switchVersion('v2'));
document.getElementById('version-classic')?.addEventListener('click', () => switchVersion('classic'));

document.addEventListener('click', (event) => {
    if (event.target.closest('button')) audio.play('ui_click', { volume: 0.45 });
});

// Back to Main Buttons
document.querySelectorAll('.back-to-main-btn').forEach(btn => {
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Back to main clicked');
            showSettingsMain();
        });
    }
});

// Reset to main menu when opening settings
const settingsBtn = document.getElementById('settings-btn');
const settingsScreen = document.getElementById('settings-screen');
const backBtn = document.getElementById('back-btn');

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        console.log('Settings button clicked');
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.classList.remove('active');
        if (settingsScreen) {
            settingsScreen.classList.add('active');
            showSettingsMain();
        }
    });
}

if (backBtn) {
    backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Back button clicked');
        if (settingsScreen) settingsScreen.classList.remove('active');
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.classList.add('active');
    });
} else {
    console.error('back-btn element not found!');
}

document.getElementById('control-arrows').addEventListener('click', () => {
    GAME_SETTINGS.controlMode = 'arrows';
    document.getElementById('control-arrows').classList.add('active');
    document.getElementById('control-analog').classList.remove('active');
});

document.getElementById('control-analog').addEventListener('click', () => {
    GAME_SETTINGS.controlMode = 'analog';
    document.getElementById('control-analog').classList.add('active');
    document.getElementById('control-arrows').classList.remove('active');
});

document.getElementById('mode-linear').addEventListener('click', () => {
    GAME_SETTINGS.gameMode = 'linear';
    document.getElementById('mode-linear').classList.add('active');
    document.getElementById('mode-free').classList.remove('active');
    document.getElementById('desc-linear').style.display = 'inline';
    document.getElementById('desc-free').style.display = 'none';
    // Remettre l'emoji souffle pour le mode linéaire
    const gasEmoji = document.getElementById('gas-emoji');
    if (gasEmoji) gasEmoji.innerText = '💨';
});

document.getElementById('mode-free').addEventListener('click', () => {
    GAME_SETTINGS.gameMode = 'free';
    document.getElementById('mode-free').classList.add('active');
    document.getElementById('mode-linear').classList.remove('active');
    document.getElementById('desc-linear').style.display = 'none';
    document.getElementById('desc-free').style.display = 'inline';
    // Changer l'emoji du bouton gaz en éclair pour le mode libre
    const gasEmoji = document.getElementById('gas-emoji');
    if (gasEmoji) gasEmoji.innerText = '⚡';
});

const autoRaceToggle = document.getElementById('option-auto-race');
if (autoRaceToggle) {
    autoRaceToggle.addEventListener('click', () => {
        GAME_SETTINGS.autoRace = !GAME_SETTINGS.autoRace;
        if (GAME_SETTINGS.autoRace) {
            autoRaceToggle.classList.add('active');
            autoRaceToggle.innerText = "⚡ COURSE AUTO: ON";
        } else {
            autoRaceToggle.classList.remove('active');
            autoRaceToggle.innerText = "⚡ COURSE AUTO";
        }
    });
}

// Graphics Quality toggle
document.getElementById('quality-high').addEventListener('click', () => {
    GAME_SETTINGS.graphicsQuality = 'high';
    document.getElementById('quality-high').classList.add('active');
    document.getElementById('quality-low').classList.remove('active');
    applyGraphicsQuality();
});

document.getElementById('quality-low').addEventListener('click', () => {
    GAME_SETTINGS.graphicsQuality = 'low';
    document.getElementById('quality-low').classList.add('active');
    document.getElementById('quality-high').classList.remove('active');
    applyGraphicsQuality();
});

// Cumulative points shown on the mode screen start from the player's
// total on the server (read only; nothing is sent).
function syncServerPoints() {
    const nickname = localStorage.getItem('wheelie_nickname');
    if (!nickname || !IS_V2) return;
    getPlayerStats(nickname).then((stats) => {
        if (stats && typeof stats.total_score === 'number') syncPoints(stats.total_score);
    });
}
// Deferred: the API constants are declared further down this module.
setTimeout(syncServerPoints, 1500);

document.getElementById('start-btn').addEventListener('click', () => {
    prefetchWheelieRun();
    syncServerPoints();
    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('mode-select-screen').classList.add('active');
});

document.getElementById('select-competitive').addEventListener('click', () => {
    GAME_SETTINGS.gameMode = 'linear';
    document.getElementById('mode-select-screen').classList.remove('active');
    startGame();
});

document.getElementById('select-freemode').addEventListener('click', () => {
    GAME_SETTINGS.gameMode = 'free';
    document.getElementById('mode-select-screen').classList.remove('active');
    startGame();
});

document.getElementById('back-from-mode-select').addEventListener('click', () => {
    document.getElementById('mode-select-screen').classList.remove('active');
    document.getElementById('start-screen').classList.add('active');
});

document.getElementById('voice-toggle')?.addEventListener('click', () => {
    setVoiceEnabled(!GAME_SETTINGS.voiceEnabled);
});

document.getElementById('sfx-toggle')?.addEventListener('click', () => {
    setSfxEnabled(!GAME_SETTINGS.sfxEnabled);
});

document.getElementById('language-fr')?.addEventListener('click', () => {
    setAudioLanguage('fr');
});

document.getElementById('perspective-player')?.addEventListener('click', () => {
    setVoicePerspective('player');
});

document.getElementById('perspective-self')?.addEventListener('click', () => {
    setVoicePerspective('self');
});

document.getElementById('language-en')?.addEventListener('click', () => {
    setAudioLanguage('en');
});

document.getElementById('fullscreen-btn')?.addEventListener('click', async () => {
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
        }
        await document.documentElement.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape').catch((error) => {
                console.info('Landscape orientation lock is unavailable:', error);
            });
        }
    } catch (error) {
        console.warn('Fullscreen mode is unavailable:', error);
    }
});

document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('pause-btn').addEventListener('click', togglePause);
document.getElementById('resume-btn')?.addEventListener('click', resumeGame);
document.getElementById('pause-restart-btn')?.addEventListener('click', () => {
    quitToMenu();
    document.getElementById('start-screen')?.classList.remove('active');
    startGame();
});
document.getElementById('pause-menu-btn')?.addEventListener('click', quitToMenu);
document.getElementById('gameover-menu-btn')?.addEventListener('click', quitToMenu);

// What Sentry receives with each report: where the game is at.
setGameSnapshot(() => ({
    version: IS_V2 ? 'v2' : 'v1',
    mode: !state.isPlaying ? 'menu' : GAME_SETTINGS.gameMode === 'free' ? 'libre' : 'compétitif',
    difficulty: GAME_SETTINGS.difficulty,
    score: Math.floor(state.score),
    seconds: Math.round(state.gameTime),
    speed: Math.round(state.speed * 10) / 10,
    ranked: !!state.runToken,
    frames: state.inputLog ? state.inputLog.length / 2 : 0,
    paused: state.isPaused || state.userPaused,
    quality: localStorage.getItem('wheelie_quality') || 'auto',
}));
setGameTags({ game_version: IS_V2 ? 'v2' : 'v1' });
setPlayer(localStorage.getItem('wheelie_nickname'));
function frameReport() {
    const info = renderer.info.render;
    return {
        mode: GAME_SETTINGS.gameMode, quality: localStorage.getItem('wheelie_quality') || 'auto',
        pixelRatio: renderer.getPixelRatio(), width: window.innerWidth, height: window.innerHeight,
        drawCalls: info.calls, triangles: info.triangles,
    };
}
// Paramètres › Signaler un problème (hidden when Sentry is off).
{
    const button = document.getElementById('btn-report-problem');
    if (button) {
        if (!monitoringEnabled()) button.style.display = 'none';
        button.addEventListener('click', () => {
            openFeedback().catch((error) => console.warn('Feedback form unavailable:', error));
        });
    }
}

// API Configuration
const API_BASE_URL = 'https://51-games-api.vercel.app/api/ranking';
let unrankedReason = null;

// A run the game could not rank: the owner sees it on the sessions page.
function reportUnrankedRun(reason, score, seconds) {
    if (score < 30) return;
    apiFetch(`${API_BASE_URL}/run-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nickname: localStorage.getItem('wheelie_nickname') || undefined, score, reason: reason.slice(0, 160),
            version: IS_V2 ? 'v2' : 'v1', difficulty: GAME_SETTINGS.difficulty, seconds: Math.round(seconds)
        })
    }, 8000).catch(() => {});
}

// Who is playing (sessions page): every 30 s during a run.
let presenceTimer = null;
const presenceId = (() => {
    try {
        let id = sessionStorage.getItem('wheelie_client_id');
        if (!id) {
            id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
            sessionStorage.setItem('wheelie_client_id', id);
        }
        return id;
    } catch {
        return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
})();
function sendPresence() {
    if (document.hidden) return;
    const mode = !state.isPlaying ? 'menu' : GAME_SETTINGS.gameMode === 'free' ? 'free' : 'competitive';
    apiFetch(`${API_BASE_URL}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: presenceId, nickname: localStorage.getItem('wheelie_nickname') || undefined, mode,
            version: IS_V2 ? 'v2' : 'v1', score: state.isPlaying && mode === 'competitive' ? Math.floor(state.score) : undefined
        })
    }, 6000).catch(() => {});
}
function startPresence() {
    clearInterval(presenceTimer);
    sendPresence();
    presenceTimer = setInterval(sendPresence, 30000);
}
// The player's nickname spoken in some lines (see src/player-voice.js).
// Created here, after the API address: it registers the stored clips at once.
const playerVoice = createPlayerVoice({ apiBase: () => API_BASE_URL, audio, apiFetch });
setTimeout(() => { if (IS_V2) playerVoice.ensure(undefined, { generate: true }); }, 3000);
// V1 (classic) and V2 (realistic) are ranked apart.
const GAME_NAME = IS_V2 ? 'WheelieKingV2' : 'WheelieKing';

function setRankingStatus(message) {
    const status = document.getElementById('ranking-status');
    if (!status) return;
    status.innerText = message;
    status.style.display = message ? 'block' : 'none';
}

// Every API call has a deadline: a slow or silent server must never leave
// the game waiting on a menu.
async function apiFetch(url, options = {}, timeout = 7000) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
    try {
        return await fetch(url, controller ? { ...options, signal: controller.signal } : options);
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('le serveur ne répond pas');
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function createWheelieRun() {
    const response = await apiFetch(`${API_BASE_URL}/wheelie-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty: GAME_SETTINGS.difficulty, version: IS_V2 ? 'v2' : 'v1', nickname: localStorage.getItem('wheelie_nickname') || undefined })
    });

    if (!response.ok) {
        lastSessionError = response.status === 429 ? 'trop de parties lancées en peu de temps' : `serveur de classement en erreur (${response.status})`;
        if (response.status === 429) report('ranking.rate_limited', 'Session classée refusée : trop de parties', { once: true });
        else logEvent('Session classée refusée', { status: response.status });
        throw new Error(`Impossible d’ouvrir une session classée (${response.status})`);
    }

    const data = await response.json();
    if (!data.run_token) throw new Error('L’API n’a pas fourni de jeton de partie');
    lastSessionError = null;
    return data.run_token;
}

// No session at the start (slow network, server waking up): keep asking for
// a while; the server accepts a session up to 30 s younger than the run.
let lastSessionError = null;
async function lateSession(sequence) {
    for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (sequence !== crashSequence || !state.isPlaying || state.runToken) return;
        if (state.gameTime > 24) break;
        try {
            const token = await Promise.race([createWheelieRun(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))]);
            if (sequence !== crashSequence || !state.isPlaying || state.gameTime > 26) return;
            state.runToken = token;
            state.rankedRunUnavailable = false;
            state.sessionError = null;
            return;
        } catch {
            if (!lastSessionError) lastSessionError = 'serveur de classement injoignable';
        }
    }
    state.sessionError = lastSessionError || 'serveur de classement injoignable';
    if (sequence === crashSequence && state.isPlaying) {
        report('ranking.session', `Pas de session classée après 25 s : ${state.sessionError}`, {
            group: state.sessionError.replace(/\(\d+\)/g, '(n)'),
            details: { reason: state.sessionError, difficulty: GAME_SETTINGS.difficulty, version: IS_V2 ? 'v2' : 'v1', online: navigator.onLine },
        });
    }
}

// A ranked session is opened ahead of the ride (the API can take a couple of
// seconds to wake up) and kept for the next competitive start.
let pendingRun = null;
function prefetchWheelieRun() {
    if (pendingRun && Date.now() - pendingRun.at < 20 * 60 * 1000) return;
    const promise = createWheelieRun();
    promise.catch(() => {
        if (pendingRun && pendingRun.promise === promise) pendingRun = null;
    });
    pendingRun = { promise, at: Date.now() };
}

function takeWheelieRun() {
    const pending = pendingRun && Date.now() - pendingRun.at < 20 * 60 * 1000 ? pendingRun : null;
    pendingRun = null;
    const run = pending ? pending.promise.catch(() => createWheelieRun()) : createWheelieRun();
    // Never hold the start for more than a few seconds: ride unranked instead.
    return Promise.race([run, new Promise((_, reject) => setTimeout(() => reject(new Error('le serveur ne répond pas')), 4500))]);
}

function encodeInputLog(inputLog) {
    const bytes = inputLog instanceof Uint8Array ? inputLog : Uint8Array.from(inputLog);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
}

async function submitCompletedRun(nickname) {
    if (!completedRankedRun) {
        // Keep the reason given at the game over (it used to be replaced here).
        if (!unrankedReason) setRankingStatus('Score non classé : aucun replay vérifiable n’est disponible.');
        return false;
    }

    const run = completedRankedRun;
    const body = JSON.stringify({
        run_token: run.runToken, nickname, input_log: encodeInputLog(run.inputLog), flip_mode: run.flipMode, plate: run.plate
    });
    setRankingStatus('Envoi du score…');
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await apiFetch(`${API_BASE_URL}/wheelie-sessions/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body
            }, 10000);
            if (response.status === 409) {
                // Already received on an earlier attempt.
                setRankingStatus('Score classé.');
                completedRankedRun = null;
                return true;
            }
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                const message = error.detail || `Échec de l’envoi du score (${response.status})`;
                // The server refused the run itself: retrying will not help.
                if (response.status < 500) {
                    report('ranking.rejected', `Score refusé par le serveur : ${message}`, {
                        level: 'error', group: String(message).replace(/\d+/g, 'n'),
                        details: { status: response.status, message, frames: run.inputLog.length / 2, version: IS_V2 ? 'v2' : 'v1', difficulty: GAME_SETTINGS.difficulty },
                    });
                    setRankingStatus(`Score non classé : ${message}`);
                    completedRankedRun = null;
                    return false;
                }
                throw new Error(message);
            }
            const data = await response.json();
            updateLeaderboard(nickname, data.score);
            setRankingStatus(`Score classé : ${data.score} points.`);
            // A ranked player: the server can now record their name (once).
            if (IS_V2) playerVoice.ensure(nickname, { generate: true });
            completedRankedRun = null;
            return true;
        } catch (error) {
            console.warn(`Score submission attempt ${attempt} failed:`, error);
            if (attempt === 3) {
                report('ranking.submit_failed', `Score non envoyé après 3 essais : ${error.message}`, {
                    group: String(error.message).replace(/\d+/g, 'n'),
                    details: { error: error.message, frames: run.inputLog.length / 2, online: navigator.onLine },
                });
                // Keep it: sent again at the next start (the session lasts 30 min).
                savePendingSubmission({
                    token: run.runToken, nickname, log: encodeInputLog(run.inputLog), at: Date.now(), flipMode: run.flipMode, plate: run.plate
                });
                setRankingStatus('Score en attente : il sera envoyé dès que le serveur répond (' + error.message + ').');
                return false;
            }
            await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        }
    }
    return false;
}

const PENDING_KEY = 'wheelie_pending_submission';
function savePendingSubmission(entry) {
    try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(entry));
    } catch (error) {
        // Storage unavailable: the score is lost.
        reportError('storage.unavailable', error, { details: { lost: 'score en attente' } });
    }
}

// A score that could not be sent last time (network), while its session lasts.
async function flushPendingSubmission() {
    let entry = null;
    try {
        entry = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    } catch {
        entry = null;
    }
    if (!entry) return;
    if (Date.now() - entry.at > 28 * 60 * 1000) {
        localStorage.removeItem(PENDING_KEY);
        return;
    }
    try {
        const response = await apiFetch(`${API_BASE_URL}/wheelie-sessions/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                run_token: entry.token, nickname: entry.nickname, input_log: entry.log,
                flip_mode: entry.flipMode || 'auto', plate: !!entry.plate
            })
        }, 10000);
        if (response.ok || (response.status >= 400 && response.status < 500)) localStorage.removeItem(PENDING_KEY);
        if (response.status >= 400 && response.status < 500 && response.status !== 409) {
            report('ranking.rejected', `Score en attente refusé par le serveur (${response.status})`, { level: 'error', group: `pending ${response.status}` });
        } else if (response.ok) logEvent('Score en attente envoyé');
    } catch {
        // Still offline: try again next time.
    }
}

// Fonction pour récupérer le classement depuis l'API
async function fetchLeaderboardFromAPI(skip = 0, limit = 20) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/leaderboard/${GAME_NAME}?skip=${skip}&limit=${limit}`);

        if (!response.ok) {
            throw new Error('Erreur lors de la récupération du classement');
        }

        const data = await response.json();
        return data.leaderboard || [];
    } catch (error) {
        console.error('Erreur API:', error);
        reportError('ranking.leaderboard', error, { once: true, details: { skip, limit, game: GAME_NAME, online: navigator.onLine } });
        return [];
    }
}

// Fonction pour récupérer les statistiques d'un joueur depuis l'API
async function getPlayerStats(nickname) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/player/${encodeURIComponent(nickname)}`, {}, 4000);

        if (!response.ok) {
            if (response.status === 404) {
                return null; // Joueur non trouvé
            }
            throw new Error('Erreur lors de la récupération des stats');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erreur API:', error);
        reportError('ranking.player', error, { once: true, details: { step: 'statistiques du joueur', online: navigator.onLine } });
        return null;
    }
}

// Nickname & Leaderboard Functions
function showNicknamePopup(score) {
    const popup = document.getElementById('nickname-popup');
    const popupScore = document.getElementById('popup-score');
    const nicknameInput = document.getElementById('nickname-input');

    if (popup && popupScore && nicknameInput) {
        popupScore.innerText = score;
        nicknameInput.value = '';
        popup.style.display = 'flex';
        nicknameInput.focus();
    }
}

async function submitNickname() {
    const nicknameInput = document.getElementById('nickname-input');
    let nickname = nicknameInput.value.trim();

    if (nickname.length > 0) {
        // "MAZ", "Maz" and "mAz" are one player: back under their own name.
        const known = await Promise.race([getPlayerStats(nickname), new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
        if (known && known.nickname) {
            nickname = known.nickname;
            welcome(`Bon retour parmi nous ${nickname} !`, 'Tu peux changer l’apparence de ton pseudo dans Paramètres › Son & voix.');
        } else {
            welcome(`Bienvenue ${nickname} !`, 'Ton pseudo est enregistré avec ce score.');
        }
        // The nickname is kept whatever happens to this run's submission.
        await submitCompletedRun(nickname);

        setNickname(nickname);

        // Afficher le pseudo dans le menu
        displayNickname();

        // Fermer la popup
        closeNicknamePopup();
    }
}

function welcome(title, text) {
    if (IS_V2) document.dispatchEvent(new CustomEvent('wheelie:notice', { detail: { title, text, seconds: 5, tone: 'welcome' } }));
    else setRankingStatus(`${title} ${text}`);
}

function setNickname(nickname) {
    localStorage.setItem('wheelie_nickname', nickname);
    setPlayer(nickname);
    displayNickname();
    document.dispatchEvent(new CustomEvent('wheelie:nickname', { detail: { nickname } }));
}

// Settings: the same nickname, written another way (case only).
async function changeNicknameLook() {
    const input = document.getElementById('nickname-look');
    const result = document.getElementById('nickname-look-result');
    const current = localStorage.getItem('wheelie_nickname');
    const wanted = (input?.value || '').trim();
    const say = (text) => { if (result) result.textContent = text; };
    if (!current) return say('Termine une partie classée pour créer ton pseudo.');
    if (!wanted) return say('Écris ton pseudo comme tu veux qu’il apparaisse.');
    if (wanted.toLowerCase() !== current.toLowerCase()) return say(`Seules les majuscules et minuscules peuvent changer (${current}).`);
    say('Enregistrement…');
    try {
        const response = await apiFetch(`${API_BASE_URL}/player-display`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: wanted })
        }, 8000);
        if (!response.ok && response.status !== 404) throw new Error(String(response.status));
        setNickname(wanted);
        say(`C’est fait : ${wanted}`);
    } catch (error) {
        reportError('ranking.player', error, { details: { step: 'apparence du pseudo' } });
        say('Le serveur ne répond pas, réessaie plus tard.');
    }
}
document.getElementById('nickname-look-save')?.addEventListener('click', changeNicknameLook);
document.getElementById('nickname-look')?.addEventListener('focus', (event) => {
    if (!event.target.value) event.target.value = localStorage.getItem('wheelie_nickname') || '';
});

function closeNicknamePopup() {
    const popup = document.getElementById('nickname-popup');
    if (popup) popup.style.display = 'none';
    completedRankedRun = null;
}

function displayNickname() {
    const nickname = localStorage.getItem('wheelie_nickname');
    const nicknameDisplay = document.getElementById('nickname-display');
    const playerNickname = document.getElementById('player-nickname');

    if (nickname && nicknameDisplay && playerNickname) {
        nicknameDisplay.innerText = nickname;
        playerNickname.style.display = 'block';
    }
}

function updateLeaderboard(nickname, score) {
    // Récupérer le leaderboard actuel
    let leaderboard = JSON.parse(localStorage.getItem('wheelie_leaderboard') || '[]');

    // Chercher si le joueur existe déjà
    const existingIndex = leaderboard.findIndex(entry => entry.nickname === nickname);

    if (existingIndex !== -1) {
        // Mettre à jour le score seulement s'il est meilleur
        if (score > leaderboard[existingIndex].score) {
            leaderboard[existingIndex].score = score;
        }
    } else {
        // Ajouter le nouveau joueur
        leaderboard.push({ nickname, score });
    }

    // Trier par score décroissant
    leaderboard.sort((a, b) => b.score - a.score);

    // Garder seulement le top 10
    leaderboard = leaderboard.slice(0, 10);

    // Sauvegarder
    localStorage.setItem('wheelie_leaderboard', JSON.stringify(leaderboard));
}

async function showTrophyRoom() {
    document.getElementById('leaderboard-screen')?.classList.remove('active');
    document.getElementById('trophy-screen')?.classList.add('active');
    const content = document.getElementById('trophy-content');
    const nickname = readSetting('wheelie_nickname');
    const points = totalPoints();
    renderTrophyRoom(content, { trophies: null, points, nickname, error: nickname ? 'Chargement des trophées…' : null });
    if (!nickname) return;
    try {
        const response = await apiFetch(`${API_BASE_URL}/player/${encodeURIComponent(nickname)}/trophies?version=${IS_V2 ? 'v2' : 'v1'}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        renderTrophyRoom(content, { trophies: await response.json(), points, nickname });
    } catch (error) {
        report('ranking.player', 'Trophées indisponibles', { once: true, details: { error: String(error.message || error) } });
        renderTrophyRoom(content, { trophies: null, points, nickname, error: 'Trophées indisponibles pour le moment (serveur).' });
    }
}

// Rewards crossed by the points of the run that just ended.
function announceUnlocks(before, after) {
    const unlocked = rewards().filter((reward) => reward.points > before && reward.points <= after);
    if (!unlocked.length) return;
    const names = unlocked.map((reward) => reward.name).join(' · ');
    setTimeout(() => {
        if (IS_V2) {
            document.dispatchEvent(new CustomEvent('wheelie:notice', { detail: {
                title: 'DÉBLOQUÉ !', text: `${names} — voir la salle des trophées.`, seconds: 7
            } }));
        } else {
            toast('DÉBLOQUÉ !', names);
        }
        audio.play('new_record', { volume: 0.45 });
    }, 1600);
}

async function showLeaderboard() {
    const startScreen = document.getElementById('start-screen');
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    const leaderboardList = document.getElementById('leaderboard-list');

    if (startScreen) startScreen.classList.remove('active');
    if (leaderboardScreen) leaderboardScreen.classList.add('active');

    // Afficher un message de chargement
    leaderboardList.innerHTML = '<p style="color: #888;">Chargement...</p>';
    leaderboardPage = { shown: 0, loading: false, done: false, sequence: (leaderboardPage.sequence || 0) + 1 };
    const rows = await fetchLeaderboardFromAPI(0, 20);
    leaderboardList.innerHTML = '';
    if (rows.length === 0) {
        leaderboardList.innerHTML = '<p style="color: #888;">Aucun score enregistré...</p>';
        return;
    }
    appendLeaderboardRows(rows, 20);
}

// Rows are built as elements: nicknames are typed by players, never HTML.
let leaderboardPage = { shown: 0, loading: false, done: true, sequence: 0 };
function appendLeaderboardRows(rows, requested) {
    const list = document.getElementById('leaderboard-list');
    list.querySelector('.leaderboard-more')?.remove();
    const mine = (localStorage.getItem('wheelie_nickname') || '').toLowerCase();
    for (const entry of rows) {
        const rank = ++leaderboardPage.shown;
        const row = document.createElement('div');
        row.className = 'leaderboard-entry';
        if (mine && String(entry.nickname).toLowerCase() === mine) row.classList.add('is-me');
        const cells = [rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`, entry.nickname, entry.best_score];
        ['leaderboard-rank', 'leaderboard-name', 'leaderboard-score'].forEach((name, i) => {
            const cell = document.createElement('div');
            cell.className = name;
            cell.textContent = String(cells[i]);
            row.append(cell);
        });
        list.append(row);
    }
    leaderboardPage.done = rows.length < requested;
    if (!leaderboardPage.done) {
        const more = document.createElement('p');
        more.className = 'leaderboard-more';
        more.style.cssText = 'color: #888; text-align: center; margin: 10px 0;';
        more.textContent = 'Fais défiler pour voir la suite…';
        list.append(more);
    }
}

async function loadMoreLeaderboard() {
    if (leaderboardPage.loading || leaderboardPage.done) return;
    leaderboardPage.loading = true;
    const sequence = leaderboardPage.sequence;
    const rows = await fetchLeaderboardFromAPI(leaderboardPage.shown, 10);
    if (sequence !== leaderboardPage.sequence) return;
    leaderboardPage.loading = false;
    if (rows.length) appendLeaderboardRows(rows, 10);
    else leaderboardPage.done = true;
}
document.getElementById('leaderboard-list')?.addEventListener('scroll', (event) => {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 30) loadMoreLeaderboard();
});

// Event Listeners pour le système de pseudo et classement
document.getElementById('submit-nickname')?.addEventListener('click', submitNickname);
document.getElementById('close-nickname-popup')?.addEventListener('click', closeNicknamePopup);
document.getElementById('skip-nickname')?.addEventListener('click', closeNicknamePopup);

document.getElementById('nickname-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        submitNickname();
    }
});

// Empêcher le zoom sur focus de l'input sur mobile
document.getElementById('nickname-input')?.addEventListener('focus', function(e) {
    this.style.fontSize = '16px'; // Évite le zoom automatique sur iOS
});

document.getElementById('leaderboard-btn')?.addEventListener('click', showLeaderboard);
// Secret code: taps on the speedometer.
(() => {
    const speedometer = document.getElementById('speedometer');
    if (!speedometer) return;
    speedometer.style.pointerEvents = 'auto';
    speedometer.addEventListener('pointerdown', () => secretInput('tap'));
})();
// Trophy room: from the leaderboard and back.
document.getElementById('trophies-btn')?.addEventListener('click', showTrophyRoom);
document.getElementById('back-from-trophies')?.addEventListener('click', () => {
    document.getElementById('trophy-screen')?.classList.remove('active');
    document.getElementById('leaderboard-screen')?.classList.add('active');
});
document.getElementById('back-from-leaderboard')?.addEventListener('click', () => {
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    const startScreen = document.getElementById('start-screen');
    if (leaderboardScreen) leaderboardScreen.classList.remove('active');
    if (startScreen) startScreen.classList.add('active');
});

// Afficher le pseudo au chargement si il existe
displayNickname();

init();
releaseSplash();

// The intro animation plays while the city is generated. It leaves once the
// game is ready and the animation has finished, or on a tap once ready;
// later visits in the same session do not wait for the end.
function releaseSplash() {
    const splash = document.getElementById('splash');
    const video = document.getElementById('splash-video');
    if (!splash) return;
    let seen = false;
    try {
        seen = sessionStorage.getItem('wheelie_splash_seen') === '1';
        sessionStorage.setItem('wheelie_splash_seen', '1');
    } catch {
        // Storage can be unavailable (private mode): just play it.
    }
    let done = seen || !video || video.ended || video.error;
    const close = () => {
        if (splash.classList.contains('hidden')) return;
        splash.classList.add('hidden');
        setTimeout(() => {
            if (video) video.pause();
            splash.remove();
        }, 800);
    };
    splash.classList.add('ready');
    if (done) {
        close();
        return;
    }
    video.addEventListener('ended', close);
    video.addEventListener('error', close);
    splash.addEventListener('pointerdown', close);
    // Autoplay can be refused (power saving): never keep the player waiting.
    const playing = video.play();
    if (playing && playing.catch) playing.catch(close);
    setTimeout(close, Math.max(1500, ((video.duration || 10) - video.currentTime) * 1000 + 500));
}

// Development only: lets tests and the console inspect a running game.
if (import.meta.env.DEV) {
    window.__wheelie = {
        state, renderer, scene, camera, audio, CONFIG, playerVoice, gameOver, setIdleIn(seconds) { idleTime = 0; nextIdleAt = seconds; },
        get v2() { return v2; },
        // Free roam fall at `kmh` (skidding: the side-impact kind).
        fallTest(kmh, skidding = false) { startRoamFall(kmh / 3.6, skidding, v2.roam); },
        get roamFall() { return roamFall; }
    };
}
