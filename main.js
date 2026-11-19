// First: Sentry watches everything that follows (src/monitoring.js).
import { report, reportError, logEvent, setGameSnapshot, setGameTags, setPlayer, trackFrame, openFeedback, monitoringEnabled } from './src/monitoring.js';
import * as THREE from 'three';
import './src/style.css';
import voiceLineGroups from './src/voice-lines.json';
import soundEffects from './src/sound-effects.json';
import { createAudioEngine } from './src/audio-engine.js';
import { BIKE_RECOVERY_POINTS, addPoints, finePoints, releaseBike, spendPoints, syncPoints, totalPoints } from './src/v2/freeroam.js';
import { createPlayerVoice } from './src/player-voice.js';
import { renderTrophyRoom } from './src/trophy-room.js';
import { HumanCheckRequired, forgetPass, runHumanCheck, storedPass } from './src/human-check.js';
import { POSES, buyPose, choosePose, chosenPose, ownedPoses } from './src/v2/poses.js';
import { DRIFT_POINTS, GLIDER_POINTS, JETPACK_POINTS, TRICKS_CODE_POINTS, hasJetpack, rewards } from './src/unlocks.js';
import { createAccount, deviceToken } from './src/account.js';
import { createSecretBird } from './src/secret-bird.js';
import { SHIELD, createShields } from './src/shield.js';
import { bestStat, bumpStat, renderStats } from './src/stats.js';
import { configureProfile, deviceId, profileStats, syncProfile } from './src/profile.js';
import { applyPadLayout, openPadEditor } from './src/pad-layout.js';
import { startActivity } from './src/activity.js';
import { createSpeedLines } from './src/v2/speedlines.js';
import riderVoices from './src/rider-voices.json';
import { createLive } from './src/live/live.js';
import { createLoveEvent } from './src/event/love.js';
import { configureShop, loadCatalogOverrides } from './src/shop/store.js';
import { applyCharacter, registerCharacters } from './src/shop/characters.js';
import { applyEquippedOutfit, registerOutfitsAndExtras } from './src/shop/outfits.js';
import { createMusicPlayer, registerMusic } from './src/music/player.js';
import { registerRealCars } from './src/v2/realcars.js';
import { installShop } from './src/shop/shop.js';
import { beginCinematic, cinematicSpeed, endCinematic } from './src/cinematic.js';
import { getUIVersion, initUITheme, setUIVersion, subscribeUITheme } from './src/ui/theme.js';
import { initPorscheExperience, startPorscheTrack, stopPorscheTrack } from './src/gt51-porsche.js';

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
// Session live (src/live/live.js): created further down; while riding a
// live turn the run is recorded for the others (liveRecordFrame).
let live = null;
let liveRecording = false;
let liveLastFrame = -1e9;
let musicPlayer = null;
let shopUI = null;

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
    // Frames between a landing and the next takeoff (server:
    // TAKEOFF_SPACING_FRAMES). Short: a ramp right after a landing is jumped.
    spacing: 2,
    groundTrickMaxAngle: 0.2,
    airRate: 8,
    // Tricks on the ground: 5 points a second up to 50 km/h, 15 from 150.
    groundMin: 5.0, groundMax: 15.0, groundFromKmh: 50.0, groundToKmh: 150.0,
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
    minAngle: 0.35, kmh: 130, doubleKmh: 150, tripleKmh: 200, settle: 0.04, clean: 0.1, bad: 0.3,
    bonus: [0, 100, 200, 400], trickBonus: [0, 150, 300, 600], badFrames: 240
};
// Rules 10 and 11 (wheelie_replay.py TRICK_HOLD_*): a trick landed earns
// bonus[1] more when the trick button was held for at least share[0] /
// share[1] of the flight's frames, else bonus[0] (let go too soon).
const TRICK_HOLD = { share: [6, 10], bonus: [50, 100] };
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
// (none from fatalAv) or fast.
// The throttle tips the bike backwards up there (rules 2: it used to be a
// points loop, throttle held and the wheelie tapped):
// - on the tail, the throttle keeps it down like the wheelie button does:
//   only letting go of both (or the brake) saves it;
// - after it, until the bike is back under rearmAngle, the throttle alone
//   lifts the bike like the wheelie does, and going over the top again is
//   a fall (no second bavette);
// - the points recharge: a bavette pays in full only rechargeFrames after
//   the one before (in proportion sooner).
// Rules 3: the stick and the bavette go together again. The gas button
// (or key) is full throttle, the stick half at most; only full throttle
// tips the bike over up there. The tail drags (drag off the speed each
// frame it scrapes) and holds longer; the bike shakes before it lets go.
// Rules 4 and 5 (2026-11-18), one per control type, sent with the run
// (server: RULES):
// - 4, the default controls (the stick): the bavette as it first was, the
//   players preferred it (the wheelie button holds the tail, letting go
//   saves it and pays every time; the throttle does nothing up there);
// - 5, arrows and custom controls: rules 3 above (the gas button tips the
//   bike over, the tail drags and holds longer, the points recharge).
// Both: tricks on the ground pay with the speed, and a brake frame without
// throttle carries its strength in the throttle byte (the automatic rear
// brake below).
// Rules 6 and 7 (2026-11-19): 4 and 5, and the speed never below zero (a
// boost drained from a bike already slowed down ran it backwards, into the
// police's "too slow"): what a skid, the brake or the drag takes comes off
// the boost's gain first, the drain and coasting stop at zero. Rules 6 (the
// default) also lift the same at every speed (`gentle`: no faster lift over
// 110 km/h, the bavette holds as long): a tap of WHEELIE at speed sent the
// bike over.
// Rules 8 and 9 (2026-11-17): 6 and 7, and the boost keeps the speed it
// reached (players: it slowed down after, sometimes below where it started).
const RULESETS = {
    4: { tipFull: false, firm: false, recharge: false, noSecond: false, longest: 45, shake: 20 },
    5: { tipFull: true, firm: true, recharge: true, noSecond: true, longest: 110, shake: 45 },
    6: { tipFull: false, firm: false, recharge: false, noSecond: false, longest: 45, shake: 20, floor: true, gentle: true },
    7: { tipFull: true, firm: true, recharge: true, noSecond: true, longest: 110, shake: 45, floor: true },
    8: { tipFull: false, firm: false, recharge: false, noSecond: false, longest: 45, shake: 20, floor: true, gentle: true, keepBoost: true },
    9: { tipFull: true, firm: true, recharge: true, noSecond: true, longest: 110, shake: 45, floor: true, keepBoost: true },
    // 8 and 9, the triple backflip (from FLIP.tripleKmh) and the trick's hold
    // bonus (TRICK_HOLD) (server: rules 10 and 11).
    10: { tipFull: false, firm: false, recharge: false, noSecond: false, longest: 45, shake: 20, floor: true, gentle: true, keepBoost: true, triple: true, holdBonus: true },
    11: { tipFull: true, firm: true, recharge: true, noSecond: true, longest: 110, shake: 45, floor: true, keepBoost: true, triple: true, holdBonus: true }
};
const rulesFor = () => (GAME_SETTINGS.controlMode === 'arrows' || GAME_SETTINGS.customControls ? 11 : 10);
const ruleset = () => RULESETS[state.rules] || RULESETS[4];
// Automatic rear brake (option, up to 50 km/h by default): a wheelie about
// to go over, or a bavette about to let go, is brought back down: throttle
// off and a touch of rear brake (strength `byte` / 255 on the speed, all of
// it on the wheelie). Recorded like any input; the server sees it (an icon
// by the score). At walking pace the rider hops off beside the bike, holds
// it, jogs it back up to `hopKmh` and hops back on (`hopFrames`).
// (Throttles given as recorded bytes: the server reads the byte.)
const AUTO_BRAKE = { byte: 51, limitKmh: 50, hopKmh: 10, hopFrames: 100, push: 89 / 255, lookAhead: 70 };
// Arrows: the wheelie button alone gives a short burst of throttle to lift
// the front (stops once it is up).
const WHEELIE_ASSIST = { burst: 179 / 255, burstFrames: 45, upAngle: 0.9 };
// The brake button brakes 10 % more than the stick pulled back (the stick's
// strength, as a recorded byte: the server reads it).
const STICK_BRAKE = 232 / 255;
const BAVETTE = {
    gentleAv: 0.02, fatalAv: 0.12, maxFrames: 45, minFrames: 4, releaseAv: -0.012,
    drag: 0.0015,
    rearmAngle: 1.2, rechargeFrames: 300,
    // Points for each bavette saved (let go before it goes over), on top of
    // the wheelie's: 5 up to 50 km/h, rising to 30 at 150 km/h, whole points.
    bonusMin: 5.0, bonusMax: 30.0, bonusFromKmh: 50.0, bonusToKmh: 150.0
};
// A plate on the bike (V2, unlocked at 4000 points): enough bavette in one
// run tears it off, +20 points once.
const PLATE = { wearFrames: 120, bonus: 20, unlockPoints: 4000 };
// Manual backflips (setting): every jump; holding the wheelie button turns
// the bike backwards, the brake forwards (60 % as fast), at a rate set by
// the takeoff speed. Judged on the bike's whole angle at touchdown.
const FLIP_MANUAL = { brake: 0.6, good: [-0.45, 1.1], bad: [-0.8, 1.6] };

function bavetteFrames(angularVelocity, kmh, longest = BAVETTE.maxFrames, steady = false) {
    if (angularVelocity >= BAVETTE.fatalAv) return 0;
    const softness = 1.0 - Math.max(0.0, angularVelocity - BAVETTE.gentleAv) / (BAVETTE.fatalAv - BAVETTE.gentleAv);
    const speedFactor = steady ? 1.0 : Math.max(0.5, Math.min(1.0, 1.25 - kmh / 200));
    const frames = Math.floor(longest * softness * speedFactor);
    return frames >= BAVETTE.minFrames ? frames : 0;
}

function wheelieLiftAt(kmh, angle) {
    let lift = kmh > 110 && !ruleset().gentle ? CONFIG.wheelieLiftFast : kmh > 0 ? CONFIG.wheelieLift : CONFIG.wheelieLift * 0.5;
    if (angle > CONFIG.balancePoint - CONFIG.sweetSpotWidth && angle < CONFIG.balancePoint + CONFIG.sweetSpotWidth) lift *= 0.5;
    return lift;
}

// Whether the wheelie, kept as it is now and braked from frame `brakeFrom`
// on, would still go over the top with nothing to hold it (no bavette).
function wheelieWouldFall(angle, av, kmh, lifting, brakeFrom, armed) {
    const rules = ruleset();
    for (let i = 0; i < AUTO_BRAKE.lookAhead; i++) {
        let lift = lifting && i < brakeFrom ? wheelieLiftAt(kmh, angle) : 0;
        if (i >= brakeFrom) lift -= CONFIG.wheelieLift * 2;
        av = (av + lift - CONFIG.gravity) * 0.98;
        angle += av;
        if (angle > CONFIG.maxAngle) return (rules.noSecond && !armed) || bavetteFrames(av, kmh, rules.longest, !!rules.gentle) === 0;
        if (av <= 0 && i >= brakeFrom) return false;
    }
    return false;
}

function bavetteBonus(kmh) {
    const span = (kmh - BAVETTE.bonusFromKmh) / (BAVETTE.bonusToKmh - BAVETTE.bonusFromKmh);
    return Math.floor(BAVETTE.bonusMin + (BAVETTE.bonusMax - BAVETTE.bonusMin) * Math.max(0.0, Math.min(1.0, span)));
}

function manualFlipRate(kmh) {
    if (kmh <= 80) return 0.0073 * Math.max(0.0, kmh) / 80;
    if (kmh <= 115) return 0.0073 + (kmh - 80) / 35 * (0.085 - 0.0073);
    return Math.min(0.16, 0.085 + (kmh - 115) * 0.0012);
}

function manualFlipLanding(totalAngle, most = 2) {
    const whole = Math.floor(totalAngle / (2 * Math.PI) + 0.5);
    const off = totalAngle - 2 * Math.PI * whole;
    if (off >= FLIP_MANUAL.good[0] && off <= FLIP_MANUAL.good[1]) {
        return whole !== 0 ? ['clean', Math.min(Math.abs(whole), most), whole < 0] : ['none', 0];
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
    if (ruleset().triple && kmh >= FLIP.tripleKmh) return 3;
    return kmh >= FLIP.doubleKmh ? 2 : 1;
}

// Button released: one frame back towards the nearest whole turn.
function flipSettle(flipAngle) {
    const target = 2 * Math.PI * Math.floor(flipAngle / (2 * Math.PI) + 0.5);
    if (flipAngle < target) return Math.min(target, flipAngle + FLIP.settle);
    return Math.max(target, flipAngle - FLIP.settle);
}

function flipLanding(flipAngle, most = 2) {
    const turns = flipAngle / (2 * Math.PI);
    const whole = Math.floor(turns + 0.5);
    const off = Math.abs(turns - whole);
    if (off > FLIP.bad) return ['crash', 0];
    if (off > FLIP.clean) return ['bad', 0];
    if (whole === 0) return ['none', 0];
    return ['clean', Math.min(whole, most)];
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
// Stunts (src/v2/rider.js TRICKS): one at random each time, never the same
// twice running. In the air, the freestyle ones too; held through a jump
// (a backflip above all) they follow one another.
const GROUND_TRICKS = ['superman', 'nohander', 'cancan', 'heelclicker', 'nacnac', 'seatstand', 'surf'];
const AIR_TRICKS = [...GROUND_TRICKS, 'handstand', 'nothing', 'lazyboy', 'seatgrab'];
// Frames each one is shown in a combo (shorter in a backflip).
const TRICK_COMBO = { frames: 44, flipFrames: 36 };
function pickTrick(air, last) {
    const list = (air ? AIR_TRICKS : GROUND_TRICKS).filter((type) => type !== last);
    return list[Math.floor(Math.random() * list.length)];
}
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
    jump: { airborne: false, y: 0, vy: 0, trickFrames: 0, airFrames: 0, flipMost: 2, lastLanding: -1e9, pending: false, visualY: 0, flipActive: false, flipAngle: 0, flipRate: 0, flipKmh: 0 },
    trick: { active: false, type: 'superman', was: false, spin: 0, since: 0 },
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
    // The Love&Faith event's race (src/event/love.js): its own road, unranked.
    loveEvent: false,
    // Time spent against a side of the road, and the obstacle put there.
    edge: { frames: 0, pending: null },
    // Bavette (frames left while held, and in all) and this run's plate.
    // Shields (src/shield.js): how many are carried (up to SHIELD.max), the
    // frame from which the next one may appear, and the frames the one just
    // used still covers.
    shield: { count: 0, nextAt: 0, graceUntil: -1, told: false },
    // armed: back down since the last one; savedAt: the frame it was saved.
    bavette: { left: 0, total: 0, armed: true, savedAt: -1e9 },
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
// Shields (src/shield.js), built with the first one.
let shields = null;
// Figures Land reached (src/v2/figures-land.js).
document.addEventListener('wheelie:figuresland', (event) => {
    bumpStat('figuresLand');
    logEvent(event.detail?.first ? 'Figures Land trouvée (moto arc-en-ciel débloquée)' : 'Figures Land retrouvée');
});
// "Mes stats" (src/stats.js): the run going on (its time is counted once,
// when it ends or is left) and its top speed.
const runStats = { counted: true, top: 0 };
function countRunTime() {
    if (runStats.counted) return;
    runStats.counted = true;
    bumpStat(GAME_SETTINGS.gameMode === 'free' ? 'freeSeconds' : 'seconds', Math.round(state.gameTime));
}
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
// V2 races: the camera's distance behind the drawn bike (eased with time).
let cameraGap = null;
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
// Free roam: the camera turned by hand (a finger or the mouse dragged on the
// picture): round the player (yaw) and up or down (pitch). Riding again, it
// comes back behind after a moment; standing or walking, it stays.
const FREE_ORBIT = { turn: 0.0065, tilt: 0.005, minPitch: -0.3, maxPitch: 0.95, wait: 2.2, back: 1.4 };
const freeOrbit = { yaw: 0, pitch: 0, pointer: null, x: 0, y: 0, lastDrag: -Infinity };
function freeOrbitOn() {
    return IS_V2 && GAME_SETTINGS.gameMode === 'free' && state.isPlaying && !state.userPaused;
}
document.addEventListener('pointerdown', (event) => {
    if (!freeOrbitOn() || freeOrbit.pointer !== null) return;
    // Not from a button, the stick, a menu or a panel.
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest('button, input, a, .ui-pad, #analog-stick-base, #analog-stick-knob, #speedometer, .screen.active, #live-root, [role="dialog"], .account-dialog')) return;
    freeOrbit.pointer = event.pointerId;
    freeOrbit.x = event.clientX;
    freeOrbit.y = event.clientY;
    freeOrbit.lastDrag = performance.now() / 1000;
}, true);
document.addEventListener('pointermove', (event) => {
    if (event.pointerId !== freeOrbit.pointer) return;
    const dx = event.clientX - freeOrbit.x;
    const dy = event.clientY - freeOrbit.y;
    freeOrbit.x = event.clientX;
    freeOrbit.y = event.clientY;
    if (!freeOrbitOn()) return;
    freeOrbit.yaw -= dx * FREE_ORBIT.turn;
    freeOrbit.yaw = Math.atan2(Math.sin(freeOrbit.yaw), Math.cos(freeOrbit.yaw));
    freeOrbit.pitch = Math.max(FREE_ORBIT.minPitch, Math.min(FREE_ORBIT.maxPitch, freeOrbit.pitch + dy * FREE_ORBIT.tilt));
    freeOrbit.lastDrag = performance.now() / 1000;
}, true);
for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(type, (event) => {
        if (event.pointerId === freeOrbit.pointer) freeOrbit.pointer = null;
    }, true);
}

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

// Room between obstacles (2026-11-18, to be judged by the players): never
// two one right after the other, and the gap grows with the speed, for the
// time to see the next one and move (at 150 km/h about 90 m, 25 at 40).
const OBSTACLE_GAP = { minUnits: 24, seconds: 0.55, depth: 3 };
// Difficulty with the score (2026-11-20): from `from` points the obstacles
// come closer (the gap down to `seconds[1]` of riding) and more often (more
// tries per block, a higher chance each), the ramps clear less road, up to
// `full` points: hard but still playable (never two in a row).
const SCORE_DIFFICULTY = {
    from: 1500, full: 20000, seconds: [0.55, 0.3], minUnits: [24, 15], tries: [4, 12], chance: 0.25, rampClear: [280, 150]
};
// Past it (2026-11-20): three more phases, each opened by its overhead sign
// once its score is reached: the obstacles closer still and more of them,
// some in pairs across the road (one way through), the ramps clearing less.
const EXTRA_PHASES = [
    { from: 35000, seconds: 0.27, minUnits: 14, tries: 14, chance: 0.06, rampClear: 140, pairs: 0.15, text: 'Plus d’obstacles, certains par deux' },
    { from: 60000, seconds: 0.24, minUnits: 13, tries: 16, chance: 0.12, rampClear: 130, pairs: 0.25, text: 'Encore plus serré : choisis vite ton passage' },
    { from: 90000, seconds: 0.21, minUnits: 12, tries: 18, chance: 0.18, rampClear: 120, pairs: 0.35, text: 'Le plus dur du jeu : bonne chance' }
];
const extraPhase = () => (state.tricksOnly || state.phase < 4 ? null : EXTRA_PHASES[state.phase - 4] || null);
function scoreDifficulty() {
    if (state.tricksOnly) return 0;
    const { from, full } = SCORE_DIFFICULTY;
    return Math.max(0, Math.min(1, (state.score - from) / (full - from)));
}
const lerpBy = ([a, b], k) => a + (b - a) * k;
function obstacleRoomAt(z) {
    const level = scoreDifficulty();
    const extra = extraPhase();
    const seconds = extra ? extra.seconds : lerpBy(SCORE_DIFFICULTY.seconds, level);
    const minUnits = extra ? extra.minUnits : lerpBy(SCORE_DIFFICULTY.minUnits, level);
    const gap = Math.max(minUnits, state.speed * 60 * seconds) + OBSTACLE_GAP.depth;
    return !state.obstacles.some((obs) => {
        if (!obs.active) return false;
        const away = z < obs.box.min.z ? obs.box.min.z - z : z > obs.box.max.z ? z - obs.box.max.z : 0;
        return away < gap;
    });
}

// side: -1 / 1 puts it against that kerb; otherwise now and then anyway.
// x: where across the road (then never against a kerb).
function spawnObstacle(zPos, side = 0, x = null) {
    const type = Math.random();
    let obs;
    let kind = null;
    if (v2) {
        // Same odds, footprints and placement as the classic obstacles.
        if (type < 0.15) {
            obs = v2.world.createObstacle(kind = 'construction');
            obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
        } else if (type < 0.3) {
            obs = v2.world.createObstacle(kind = 'sign');
            obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
            obs.rotation.y = (Math.random() - 0.5) * 0.5;
        } else if (type < 0.45) {
            obs = v2.world.createObstacle(kind = 'barrier');
            obs.position.set((Math.random() - 0.5) * 14, 0, zPos);
            obs.rotation.y = (Math.random() - 0.5) * 0.5;
        } else {
            obs = v2.world.createObstacle(kind = type < 0.6 ? 'crate' : type < 0.8 ? 'bag' : 'cone');
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
    if (x !== null) {
        obs.position.x = x;
        side = 0;
    } else if (!side && Math.random() < EDGE.share) side = Math.random() < 0.5 ? -1 : 1;
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
    if (liveRecording && kind) {
        const p = obs.position;
        live.recordSpawn(['o', state.frame, kind, Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100,
            Math.round(obs.rotation.y * 1000) / 1000]);
    }
    return record;
}

// Phases 4 to 6: two across the road at once, one way through (both
// kerbs, or the middle and one kerb).
function spawnPair(z) {
    if (Math.random() < 0.5) {
        spawnObstacle(z, -1);
        spawnObstacle(z, 1);
    } else {
        spawnObstacle(z, 0, (Math.random() - 0.5) * 3);
        spawnObstacle(z, Math.random() < 0.5 ? -1 : 1);
    }
}

// An obstacle seen in a session: where the rider's game put it.
function placeObstacle(kind, x, y, z, rotY) {
    if (!v2) return null;
    const obs = v2.world.createObstacle(kind);
    obs.position.set(x, y, z);
    obs.rotation.y = rotY;
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
    setControls(readSetting('wheelie_controls') || 'analog', { save: false });
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
// travel: the direction it moves (differs from where it points while it
// drifts); slip: the angle between them; drift: 0..1, for smoke and sound.
const freeRide = { speed: 0, hold: 0, gas: 0, steer: 0, travel: undefined, slip: 0, drift: 0, drifting: false };

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

function startRoamFall(v, skidding, roam, kind = 'hit') {
    if (!v2) return;
    bumpStat('roamFalls');
    roamFall.active = true;
    roamFall.t = 0;
    roamFall.phase = 'crash';
    roamFall.skid = 0;
    freeRide.speed = 0;
    beginCinematic('roam-fall');
    const unitsPerSecond = Math.abs(v);
    freeWheelie.bavette = 0;
    v2.rider.startCrash(kind, unitsPerSecond, {
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
function updateRoamFall(rawDt) {
    const dt = rawDt * cinematicSpeed();
    const rider = v2.rider;
    roamFall.t += dt;
    const t = roamFall.t;
    const bike = bikeGroup.position;
    if (roamFall.phase === 'crash') {
        rider.updateCrash(dt);
        if (t > 3.4) {
            // Gets up where he landed (no jump to his feet), facing the bike.
            rider.riderPosition(roamFall.at);
            rider.finishCrash();
            roamFall.yaw = Math.atan2(bike.x - roamFall.at.x, bike.z - roamFall.at.z);
            if (!rider.startGetUp(roamFall.at.x, roamFall.at.z, roamFall.yaw)) rider.dismount(roamFall.at.x, roamFall.at.z, roamFall.yaw);
            roamFall.phase = 'getup';
        }
    } else if (roamFall.phase === 'getup') {
        if (!rider.updateGetUp(dt)) {
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
            endCinematic('roam-fall');
            toast('C’EST REPARTI', 'De retour sur la moto', { discreet: true, float: true });
        }
    }
}

// Free roam drift (unlocked at DRIFT_POINTS). minSpeed in m/s (~25 km/h);
// turn: the tail's extra swing (rad/s at full lock); grip / recover: how
// fast the travel follows the heading sliding / gripping; maxSlip: the
// widest angle between them; brake: share of the normal braking.
const FREE_DRIFT = { minSpeed: 7, keepSpeed: 3, turn: 1.9, grip: 0.9, recover: 6, maxSlip: 1.15, brake: 0.28 };
let driftSmokeTime = 0;
const rearWheel = new THREE.Vector3();

// Smoke from the rear tyre and its mark on the road while it slides; the
// screech is the audio engine's (snapshot.drift).
function driftEffects(dt, heading) {
    if (!v2) return;
    if (freeRide.drift < 0.25) {
        v2.skidmarks.lift();
        return;
    }
    const back = 0.72 * (v2.rider.worldScale || 1.1);
    rearWheel.set(bikeGroup.position.x - Math.sin(heading) * back, 0, bikeGroup.position.z - Math.cos(heading) * back);
    v2.skidmarks.add(rearWheel.x, rearWheel.z);
    driftSmokeTime -= dt;
    if (driftSmokeTime <= 0) {
        v2.smokeAt(rearWheel, freeRide.drift);
        driftSmokeTime = (isMobile() ? 0.09 : 0.05) / freeRide.drift;
    }
}

// Tricks in free roam (on the bike): an investment, offered from 50 000
// cumulative points and costing 50 000 once (5000 until 2026-11-17: the
// best players pile up far more now); they pay twice the competitive
// ground rate (10 to 30 points a second with the speed), straight into the
// cumulative points. Buying them also gives the Figures Land code. The
// first time the player has enough, the offer opens by itself (the game
// paused if a run is on).
const FREE_TRICKS = { cost: 50000, need: 50000, factor: 2, key: 'wheelie_free_tricks', shownKey: 'wheelie_free_tricks_offered' };
const freeTrick = { points: 0 };
function freeTricksUnlocked() {
    return readSetting(FREE_TRICKS.key) === '1';
}
const LAND_CODE_TEXT = 'WHEELIE, WHEELIE, FREIN, puis 3 touches sur le compteur (en mode libre, sur la moto)';
function buyFreeTricks() {
    if (freeTricksUnlocked()) return;
    const points = totalPoints();
    if (points < FREE_TRICKS.cost || !spendPoints(FREE_TRICKS.cost)) {
        toast('FIGURES EN MODE LIBRE', `Il te manque ${(FREE_TRICKS.cost - points).toLocaleString('fr-FR')} points cumulés`, { discreet: true, float: true });
        return;
    }
    try {
        localStorage.setItem(FREE_TRICKS.key, '1');
    } catch {
        // Kept for this visit.
    }
    bumpStat('freeTricksBought');
    audio.play('new_record', { volume: 0.6 });
    document.dispatchEvent(new CustomEvent('wheelie:points'));
    document.dispatchEvent(new CustomEvent('wheelie:notice', {
        detail: {
            title: '🤸 FIGURES EN MODE LIBRE',
            text: `Activées : FIGURE sur la moto, 2× les points des figures. Et un cadeau, le code de Figures Land : ${LAND_CODE_TEXT}. Il est aussi dans l’oiseau doré.`,
            seconds: 12
        }
    }));
}
document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-free-tricks]')) return;
    const points = totalPoints();
    if (points < FREE_TRICKS.need) {
        toast('50 000 POINTS MINIMUM', `Figures en mode libre : il te manque ${(FREE_TRICKS.need - points).toLocaleString('fr-FR')} points cumulés`, { discreet: true, float: true });
        return;
    }
    showFreeTricksOffer();
});

// The offer: what free roam tricks are, in pictures, and why they are worth
// their price (an investment).
const FREE_TRICK_PICTURES = [
    ['seatstand', 'Debout sur la selle'], ['heelclicker', 'Heel clicker'], ['surf', 'Surf'], ['superman', 'Superman']
];
let freeTricksDialog = null;
function showFreeTricksOffer() {
    if (freeTricksUnlocked() || (freeTricksDialog && !freeTricksDialog.hidden)) return;
    try {
        localStorage.setItem(FREE_TRICKS.shownKey, '1');
    } catch {
        // Shown again next time.
    }
    // A run on: paused while the player reads.
    const pausedHere = state.isPlaying && !state.userPaused;
    if (pausedHere) pauseGame();
    if (!freeTricksDialog) {
        freeTricksDialog = document.createElement('div');
        freeTricksDialog.id = 'free-tricks-dialog';
        freeTricksDialog.className = 'account-dialog';
        freeTricksDialog.setAttribute('role', 'dialog');
        freeTricksDialog.setAttribute('aria-modal', 'true');
        freeTricksDialog.setAttribute('aria-labelledby', 'free-tricks-title');
        document.body.append(freeTricksDialog);
    }
    const pictures = FREE_TRICK_PICTURES.map(([name, label]) =>
        `<figure><img src="/img/free-tricks/${name}.jpg" alt="${label}" loading="lazy"><figcaption>${label}</figcaption></figure>`).join('');
    freeTricksDialog.innerHTML = `<div class="account-card free-tricks-card">
        <h2 id="free-tricks-title">🤸 Figures en mode libre</h2>
        <p class="account-text">Tu as assez de points : les figures du compétitif, maintenant dans la ville, sur ta moto (bouton FIGURE).</p>
        <div class="free-tricks-pictures">${pictures}</div>
        <div class="free-tricks-deal">
            <p><b>Ça coûte</b><span>50 000 points, une seule fois</span></p>
            <p><b>Ça rapporte</b><span>2× les points des figures du compétitif : 10 à 30 points par seconde de figure, selon la vitesse</span></p>
            <p><b>Rentabilisé</b><span>en 42 minutes de figures à 100 km/h, puis tout est bonus</span></p>
            <p><b>En cadeau</b><span>un code secret pour trouver Figures Land</span></p>
        </div>
        <p class="account-text free-tricks-note">C’est un investissement : tu dépenses maintenant, tu gagnes plus après.</p>
        <button type="button" class="account-btn account-btn--primary free-tricks-buy">INVESTIR 50 000 POINTS</button>
        <button type="button" class="account-btn account-btn--quiet free-tricks-later">Plus tard</button>
    </div>`;
    freeTricksDialog.hidden = false;
    const close = () => {
        freeTricksDialog.hidden = true;
        if (pausedHere) resumeGame();
    };
    freeTricksDialog.querySelector('.free-tricks-buy').addEventListener('click', () => {
        buyFreeTricks();
        close();
    });
    freeTricksDialog.querySelector('.free-tricks-later').addEventListener('click', close);
}
// The first time the cumulative points reach the minimum: the offer, once
// (after a run's points, free roam tricks, or any change of the points).
function maybeOfferFreeTricks() {
    if (!IS_V2 || freeTricksUnlocked() || readSetting(FREE_TRICKS.shownKey) === '1') return;
    // Not over the Love&Faith event's ending: at the next points, after it.
    if (state.loveEvent) return;
    if (totalPoints() >= FREE_TRICKS.need) setTimeout(showFreeTricksOffer, 1200);
}
document.addEventListener('wheelie:points', maybeOfferFreeTricks);

// Free roam wheelies (on the bike): WHEELIE lifts the front as in a
// competitive run, and pays like one: a point a second, times the angle,
// the time up and the speed, straight into the cumulative points (shown as
// they come, ten at a time). At the top the tail touches the road: a
// bavette (sparks). Let go in time: its bonus (5 to 30 points with the
// speed, as in competitive); held too long, or up too fast, the bike goes
// over (a fall). The police take a dim view of it (police.js).
const freeWheelie = { points: 0, time: 0, bavette: 0, armed: true, shownAt: 0 };
function freeWheelieStep(dt, roam) {
    const bike = state.bike;
    const can = roam.mode === 'bike' && !roam.frozen && !roamFall.active && !state.trick.active;
    const kmh = Math.abs(freeRide.speed) * 3.6;
    const up = can && !!state.keys.space && kmh > 6;
    if (freeWheelie.bavette > 0) {
        // The tail on the road: held there by WHEELIE (the gas is held all
        // the time in free roam: it does not count).
        if (up) {
            freeWheelie.bavette -= 1;
            if (freeWheelie.bavette === 0) {
                bike.angle = 0;
                bike.angularVelocity = 0;
                startRoamFall(freeRide.speed, false, roam, 'loop');
                return;
            }
        } else {
            freeWheelie.bavette = 0;
            bike.angle = CONFIG.maxAngle;
            bike.angularVelocity = BAVETTE.releaseAv;
            const bonus = bavetteBonus(kmh);
            addPoints(bonus);
            state.score += bonus;
            bumpStat('bavettes');
            bumpStat('freeBavettes');
            scoreBonus(bonus, 'BAVETTE');
            audio.play('new_record', { volume: 0.3, rate: 1.4 });
        }
    } else if (can) {
        let lift = 0;
        if (up) {
            lift = kmh > 110 ? CONFIG.wheelieLiftFast : CONFIG.wheelieLift;
            if (Math.abs(bike.angle - CONFIG.balancePoint) < CONFIG.sweetSpotWidth) lift *= 0.5;
        }
        bike.angularVelocity += lift - CONFIG.gravity;
        bike.angularVelocity *= 0.98;
        bike.angle += bike.angularVelocity;
        if (bike.angle < 0) {
            bike.angle = 0;
            bike.angularVelocity = 0;
        }
        if (bike.angle > CONFIG.maxAngle) {
            const frames = freeWheelie.armed ? bavetteFrames(bike.angularVelocity, kmh, BAVETTE.maxFrames, true) : 0;
            if (frames === 0) {
                bike.angle = 0;
                bike.angularVelocity = 0;
                startRoamFall(freeRide.speed, false, roam, 'loop');
                return;
            }
            bike.angle = CONFIG.maxAngle;
            bike.angularVelocity = 0;
            freeWheelie.bavette = frames;
            freeWheelie.armed = false;
            audio.play('skid', { volume: 0.45, rate: 1.5 });
        }
        if (bike.angle < BAVETTE.rearmAngle) freeWheelie.armed = true;
    } else {
        // Off the bike, held by the police, a trick: the front comes down.
        bike.angle = Math.max(0, bike.angle - 0.04);
        bike.angularVelocity = 0;
    }
    bikePivot.rotation.x = -bike.angle;
    // Points: as a competitive run's.
    const ratio = Math.max(0, Math.min(1, bike.angle / CONFIG.maxAngle));
    if (can && kmh > 20 && ratio > 0.08) {
        freeWheelie.time = bike.angle > CONFIG.maxAngle * 0.5 ? freeWheelie.time + dt : 0;
        const timeMultiplier = freeWheelie.time > 0 ? Math.min(2 + freeWheelie.time / 30 * 3, 5) : 1;
        freeWheelie.points += dt * (1 + ratio) * timeMultiplier * speedMultiplier(kmh);
    } else {
        freeWheelie.time = 0;
    }
    if (freeWheelie.points >= 10 || (ratio < 0.02 && freeWheelie.points >= 1)) {
        const whole = Math.floor(freeWheelie.points);
        freeWheelie.points -= whole;
        addPoints(whole);
        state.score += whole;
        if (whole >= 5 || performance.now() - freeWheelie.shownAt > 2500) {
            freeWheelie.shownAt = performance.now();
            scoreBonus(whole, 'WHEELING');
        }
    }
    roam.setRide(ratio > 0.12 || freeWheelie.bavette > 0, Math.abs(freeRide.speed));
}

function freeTrickStep(dt, roam) {
    const can = freeTricksUnlocked() && roam.mode === 'bike' && !roam.frozen && !roamFall.active;
    setTrick(can && !!state.keys.trick);
    if (!state.trick.active) return;
    const kmh = speedKmh();
    if (kmh <= 10) return;
    freeTrick.points += FREE_TRICKS.factor * groundTrickRate(Math.min(kmh, JUMP.groundToKmh)) * dt;
    if (freeTrick.points >= 10) {
        const whole = Math.floor(freeTrick.points);
        freeTrick.points -= whole;
        addPoints(whole);
        scoreBonus(whole, 'FIGURE ×2');
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
    // Drift (unlocked): brake + steer when going fast enough. The rear steps
    // out: the bike turns faster than it travels and slides on.
    // Once sliding, it goes on down to a lower speed (no sudden grip).
    const drifting = totalPoints() >= DRIFT_POINTS && !roam.frozen && brake > 0.3 && Math.abs(steer) > 0.35
        && v > (freeRide.drifting ? FREE_DRIFT.keepSpeed : FREE_DRIFT.minSpeed);
    freeRide.drifting = drifting;
    if (drifting) {
        // The rear brake slows it a little; the gas holds the slide.
        v = Math.max(0, v - FREE_BIKE.brake * FREE_DRIFT.brake * brake * (1 - gas * 0.8) * dt);
    } else if (brake > 0) {
        // Stopped, brake still held for a moment: the bike is walked back.
        freeRide.stopped = v <= 0.2 ? (freeRide.stopped || 0) + dt : 0;
        if (v > 0.2) v = Math.max(0, v - FREE_BIKE.brake * brake * dt);
        else if (freeRide.stopped > 0.8) v = Math.max(-FREE_BIKE.reverse, v - 2 * dt);
        else v = Math.min(v, 0);
    } else if (gas === 0) {
        const slow = (FREE_BIKE.coast + FREE_BIKE.drag * v * v) * dt;
        v = v > 0 ? Math.max(0, v - slow) : Math.min(0, v + 3 * dt);
    }
    // After a boost: the speed it reached is kept while the gas is held
    // (gas off, it coasts down like any speed).
    if (v > top && gas === 0 && brake === 0) v = Math.max(top, v - 1.5 * dt);
    // Held by the police: brought to a hard stop (cut off: they brake in
    // front of him).
    if (roam.frozen) v = Math.max(0, v - 28 * dt);
    // Bars: tight at walking pace, gentler at speed (reversed when backing up).
    const pace = Math.min(1, Math.abs(v) / 25);
    const rate = (Math.abs(v) < 0.3 ? 1.1 : 2.3 - 1.4 * pace) * steer;
    bikeGroup.rotation.y -= rate * dt * (v < -0.05 ? -1 : 1);
    // Sliding: the tail swings round on top of the steering.
    if (drifting) bikeGroup.rotation.y -= steer * FREE_DRIFT.turn * dt;
    const heading = bikeGroup.rotation.y;
    // The way the bike travels follows where it points: slowly while it
    // slides, at once when the tyres grip.
    if (freeRide.travel === undefined || Math.abs(v) < 0.3) freeRide.travel = heading;
    let slip = Math.atan2(Math.sin(heading - freeRide.travel), Math.cos(heading - freeRide.travel));
    slip -= slip * Math.min(1, (drifting ? FREE_DRIFT.grip : FREE_DRIFT.recover) * dt);
    slip = Math.max(-FREE_DRIFT.maxSlip, Math.min(FREE_DRIFT.maxSlip, slip));
    freeRide.travel = heading - slip;
    freeRide.slip = slip;
    freeRide.drift += ((drifting ? Math.min(1, 0.35 + Math.abs(slip) * 1.6) : 0) - freeRide.drift) * Math.min(1, dt * 8);
    bikeGroup.position.x += Math.sin(freeRide.travel) * v * dt;
    bikeGroup.position.z += Math.cos(freeRide.travel) * v * dt;
    driftEffects(dt, heading);
    // Side streets open the way; traffic stops the bike dead.
    const hit = roam.clampBike(bikeGroup.position);
    if (hit) v = roamImpact(hit, v, roam);
    freeRide.speed = v;
    freeRide.gas = gas;
    freeRide.steer = steer * Math.min(1, Math.abs(v) / 4);
    return Math.abs(v) / 60;
}

// Seen only: the bike shakes after a bad landing (while it is fragile), and
// at the end of a bavette, just before it lets go. Nothing in the ride
// depends on it (it used to roll wide and blink: hard to ride).
function bikeTremble() {
    let shake = 0;
    if (state.badLanding > 0) shake += Math.min(1, state.badLanding / 2.5) * 0.05;
    const left = state.bavette.left;
    const shakeFrames = ruleset().shake;
    if (left > 0 && left <= shakeFrames) shake += 0.015 + (1 - left / shakeFrames) * 0.07;
    if (!shake) return 0;
    const t = state.gameTime;
    return (Math.sin(t * 47) + Math.sin(t * 31 + 1.3) * 0.6) * shake;
}

// The automatic rear brake took over: the brake pad blinks once (and the
// first time in a run, a word on what happened).
function autoBrakeShown() {
    for (const id of ['analog-brake', 'btn-down']) {
        const pad = document.getElementById(id);
        if (!pad) continue;
        pad.classList.remove('is-auto');
        void pad.offsetWidth;
        pad.classList.add('is-auto');
        setTimeout(() => pad.classList.remove('is-auto'), 700);
    }
    audio.play('brake', { volume: 0.35, rate: 1.1 });
    if (!state.assist.told) {
        state.assist.told = true;
        toast('FREIN AUTO', 'Frein arrière : la roue redescend (option dans Paramètres)', { discreet: true, float: true });
    }
}

// Sideways in competitive (stick or arrows), `scale` of the usual grip.
function steerLinear(scale = 1) {
    const bike = state.bike;
    if (GAME_SETTINGS.controlMode === 'analog' && analogData.active) {
        const sensitivity = state.speed * 50 < 200 ? 0.5 : 1;
        bike.lateralVelocity = analogData.x * CONFIG.maxLateralSpeed * sensitivity * scale;
    } else {
        if (state.keys.left) bike.lateralVelocity -= CONFIG.lateralAccel * scale;
        if (state.keys.right) bike.lateralVelocity += CONFIG.lateralAccel * scale;
    }
    bike.lateralVelocity *= CONFIG.lateralFriction;
    bike.lateralVelocity = Math.max(-CONFIG.maxLateralSpeed, Math.min(CONFIG.maxLateralSpeed, bike.lateralVelocity));
    bikeGroup.position.x = Math.max(-9, Math.min(9, bikeGroup.position.x + bike.lateralVelocity));
}

// The police chase seen from above, as soon as the siren is heard: the road,
// the bike, the patrol car and how far behind it is (discreet, top left).
let policeMap = null;
function updatePoliceMap() {
    const police = state.police;
    const on = state.isPlaying && GAME_SETTINGS.gameMode === 'linear' && !!police && !!police.siren &&
        police.phase !== 'idle' && !police.gaveUp && !state.userPaused;
    if (!on) {
        if (policeMap && !policeMap.root.hidden) policeMap.root.hidden = true;
        return;
    }
    if (!policeMap) {
        const root = document.createElement('div');
        root.id = 'police-map';
        root.setAttribute('aria-label', 'Poursuite de police, vue de dessus');
        root.innerHTML = '<div class="police-map__road"><i class="police-map__lane"></i><b class="police-map__bike"></b><b class="police-map__car"></b></div><span class="police-map__gap"></span>';
        document.body.append(root);
        policeMap = {
            root,
            bike: root.querySelector('.police-map__bike'),
            car: root.querySelector('.police-map__car'),
            gap: root.querySelector('.police-map__gap')
        };
    }
    policeMap.root.hidden = false;
    // 1: far behind (just heard), 0: alongside.
    const far = police.phase === 'coming'
        ? 1 - 0.35 * Math.min(1, police.t / police.appearAt)
        : 0.65 * (1 - police.p);
    const bikeX = bikeGroup.position.x;
    const carX = police.phase === 'visible' ? police.x : bikeX + (bikeX > 0 ? 1 : -1) * POLICE.lane;
    const across = (x) => `${((Math.max(-11, Math.min(11, x)) + 11) / 22 * 100).toFixed(1)}%`;
    policeMap.bike.style.left = across(bikeX);
    policeMap.car.style.left = across(carX);
    policeMap.car.style.top = `${(16 + far * 74).toFixed(1)}%`;
    policeMap.car.classList.toggle('is-near', far < 0.25);
    policeMap.root.classList.toggle('is-hidden-car', !!police.hidden);
    policeMap.gap.textContent = `${Math.round(far * 120)} m`;
}

function groundTrickRate(kmh) {
    const span = (kmh - JUMP.groundFromKmh) / (JUMP.groundToKmh - JUMP.groundFromKmh);
    return JUMP.groundMin + (JUMP.groundMax - JUMP.groundMin) * Math.max(0.0, Math.min(1.0, span));
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
        wobble: free ? 0 : bikeTremble(),
        blink: false,
        // Off beside the bike at walking pace (the automatic brake).
        hop: !free && state.assist?.hop ? { t: (state.frame - state.assist.hop.start) / 60, side: state.assist.hop.side } : null,
        // Pulling the bike up (the "animation wheeling" option).
        liftEffort: !free && !!state.assist?.effort,
        carModel: free && v2 ? v2.roam.carModel : null,
        reversing: free && v2 ? v2.roam.reversing : false,
        airborne: !free && state.jump.airborne,
        trick: state.trick.active ? state.trick.type : null,
        bavette: free ? freeWheelie.bavette > 0 : state.bavette.left > 0,
        // Free roam drift: how much the rear slides (screech).
        drift: freeBike ? freeRide.drift : 0,
        // Free roam: fallen off the bike (the rider is moved by the fall).
        fallen: free && roamFall.active,
        plateOn: !free && state.plate.on,
        // Too slow: how close the police car is (0 far behind, 1 alongside).
        police: !free && state.isPlaying && state.police.phase === 'visible' && !state.police.hidden
            ? { x: state.police.x, z: policeZ(state.police.p) } : null
    };
}

function renderScene(dt, snapshot = visualSnapshot()) {
    cameraDt = dt > 0 ? Math.min(0.1, dt) : FIXED_STEP;
    if (!cameraHold) updateCamera();
    if (state.loveEvent && loveEvent) loveEvent.frame(dt);
    // Tests: where the bike and the camera were drawn.
    if (import.meta.env.DEV && bikeGroup) window.__drawn = { bike: bikeGroup.position.z, cam: camera.position.z };
    if (dt > 0) updateKnockedObstacles(dt);
    if (shields && dt > 0) shields.update(dt, performance.now() / 1000, bikeGroup.position);
    updateRampArrows();
    if (v2) v2.frame(dt, snapshot);
    renderer.render(scene, camera);
    if (live) live.renderReactors(renderer);
}

function resetGame() {
    state.score = 0;
    state.speed = 0;
    state.distance = 0;
    state.gameTime = 0;
    state.bike.angle = 0;
    state.bike.angularVelocity = 0;
    state.bike.lateralVelocity = 0;
    freeWheelie.bavette = 0;
    freeWheelie.points = 0;
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
    state.jump = { airborne: false, y: 0, vy: 0, trickFrames: 0, airFrames: 0, flipMost: 2, lastLanding: -1e9, pending: false, visualY: 0, flipActive: false, flipAngle: 0, flipRate: 0, flipKmh: 0 };
    state.trick = { active: false, type: 'superman', was: false, spin: 0 };
    state.ramps.forEach((ramp) => scene.remove(ramp.mesh));
    state.ramps = [];
    state.rampFreeZones = [];
    state.gantries.forEach((gantry) => scene.remove(gantry));
    state.gantries = [];
    state.quietZones = [];
    state.phase = 1;
    state.extraSigns = 0;
    state.vulnerableUntil = -1;
    state.badLanding = 0;
    state.slow = { armed: false, frames: 0, policeFrames: 0 };
    state.police = { phase: 'idle', lastSeen: -1e9, gaveUp: false };
    state.tricksOnly = false;
    state.loveEvent = false;
    // The usual mix (the event sets its own as it begins).
    audio.setMix(null);
    state.edge = { frames: 0, pending: null };
    state.turns = 0;
    state.obstacleRamp = null;
    // Free roam drift: start gripping, no marks left from before.
    freeRide.travel = undefined;
    freeRide.drift = 0;
    freeRide.slip = 0;
    if (v2) v2.skidmarks.clear();
    secretCode.step = 0;
    secretCode.recent = [];
    state.difficultyStep = 0;
    state.bavette = { left: 0, total: 0, armed: true, savedAt: -1e9 };
    // The control type's rules, for the whole run.
    state.rules = rulesFor();
    // The assists: the arrows' wheelie burst, the automatic rear brake (and
    // its hop off at walking pace), whether it helped this run.
    state.assist = { burst: 0, braking: false, hop: null, used: false, told: false, effort: false };
    state.shield = { count: 0, nextAt: 0, graceUntil: -1, told: false };
    showShields();
    // The plate rides only on the V2 bike, once unlocked and switched on.
    state.plate = { on: IS_V2 && GAME_SETTINGS.gameMode === 'linear' && plateEquipped(), off: false };
    state.flipMode = GAME_SETTINGS.flipMode;
    if (v2) v2.rider.resetPlate();
    hidePoliceWarning();
    lastCameraBikeZ = null;
    cameraGap = null;
    renderFrom.valid = false;
    cameraHold = false;
    freeCamYaw = null;
    freeCamLast = null;
    freeOrbit.yaw = 0;
    freeOrbit.pitch = 0;
    freeOrbit.pointer = null;
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
// The game-over screen's buttons ignore taps this long after it appears
// (a finger still hammering the controls), see the screen tap guard.
const GAME_OVER_TAP_GUARD_MS = 700;
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
    // Taking up a cut run (competitive only).
    const resume = GAME_SETTINGS.gameMode === 'linear' ? pendingResume : null;
    pendingResume = null;
    flushPendingSubmission();
    crashSequence++;
    audio.prepare();
    stopVoice();
    let runToken = null;
    let humanCheckSkipped = false;
    const love = lovePending && GAME_SETTINGS.gameMode === 'linear';
    lovePending = false;
    if (GAME_SETTINGS.gameMode === 'linear' && !love) {
        // Say so if the ranking server is slow to answer.
        const notice = setTimeout(() => showConnecting(true), 350);
        let check = null;
        try {
            runToken = resume
                ? await Promise.race([createWheelieRun(resume), new Promise((_, reject) => setTimeout(() => reject(new Error('le serveur ne répond pas')), 6000))])
                : await takeWheelieRun();
        } catch (error) {
            if (error instanceof HumanCheckRequired) check = error;
            else {
                console.error('Classement indisponible:', error);
                logEvent('Session classée indisponible au départ', { error: String(error && error.message || error) });
            }
        } finally {
            clearTimeout(notice);
            showConnecting(false);
        }
        // First ranked run of the visit (or the pass expired): the human check.
        if (check) {
            // On a phone the home-made check runs unseen: say it is connecting.
            const phone = window.matchMedia('(pointer: coarse)').matches;
            const working = phone && check.check.mode === 'home' ? setTimeout(() => showConnecting(true), 350) : null;
            const result = await runHumanCheck({
                check: check.check, phone, apiBase: API_BASE_URL, apiFetch,
                onEvent: (event) => {
                    clearTimeout(working);
                    showConnecting(false);
                    logEvent('Vérification anti-robot', { result: event });
                }
            });
            clearTimeout(working);
            showConnecting(false);
            if (result === 'cancel') {
                startInProgress = false;
                quitToMenu();
                return;
            }
            if (result === 'passed') {
                const notice = setTimeout(() => showConnecting(true), 350);
                try {
                    runToken = await Promise.race([createWheelieRun(resume),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('le serveur ne répond pas')), 6000))]);
                } catch (error) {
                    logEvent('Session classée indisponible après la vérification', { error: String(error && error.message || error) });
                } finally {
                    clearTimeout(notice);
                    showConnecting(false);
                }
            } else {
                humanCheckSkipped = true;
            }
        }
    }

    try {
        resetGame();
        if (love && loveEvent) {
            state.loveEvent = true;
            loveEvent.begin();
        }
        state.runToken = runToken;
        // A resumed run starts at the cut run's score (the server's).
        state.resume = resume && !resume.refused ? resume : null;
        state.resumeBase = state.resume ? (Number.isInteger(state.resume.base) ? state.resume.base : state.resume.saved) : 0;
        state.score = state.resumeBase;
        if (resume && resume.refused) {
            toast('REPRISE IMPOSSIBLE', 'Partie trop ancienne ou déjà reprise : ton score reste enregistré. Nouvelle partie !', { discreet: true, float: true });
        }
        state.rankedRunUnavailable = GAME_SETTINGS.gameMode === 'linear' && !runToken && !state.loveEvent;
        state.sessionError = humanCheckSkipped ? HUMAN_CHECK_SKIPPED : state.rankedRunUnavailable ? lastSessionError : null;
        if (state.rankedRunUnavailable) lateSession(crashSequence);
        setRankingStatus('');
        completedRankedRun = null;
        state.isPlaying = true;
        document.body.classList.toggle('ui-competitive', GAME_SETTINGS.gameMode === 'linear' && !state.loveEvent);
        runStats.counted = false;
        runStats.top = 0;
        if (!state.loveEvent) bumpStat(GAME_SETTINGS.gameMode === 'free' ? 'freeSessions' : 'runs');
        state.speed = CONFIG.minSpeed;
        audio.startRun();
        musicPlayer?.onRunStart(state.loveEvent);
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
        const namedStart = IS_V2 && GAME_SETTINGS.voiceEnabled && eventVoices() ? playerVoice.startLine(riderVoiceKey()) : null;
        resetIdleVoice();
        if (namedStart) {
            lastVoiceAt = performance.now();
            audio.speak(namedStart, { volume: 0.95 });
        } else {
            speak('start', { force: true });
        }
        startAnimationLoop();
        if (state.resume) supersonicStart(state.resumeBase);
        else setTimeout(() => showKeyHints(9), 300);
        startPresence();
        // Standing at the start: the 5HC intro on the bus shelter ahead.
        if (v2) setTimeout(() => v2.startAd(), 400);

        // iPhones have no fullscreen for pages: nothing to do there.
        if (isMobile() && !document.fullscreenElement) requestFullscreen();

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

// Fullscreen where the browser has it (not on iPhone): true when it worked.
function fullscreenAvailable() {
    const root = document.documentElement;
    return typeof (root.requestFullscreen || root.webkitRequestFullscreen) === 'function';
}

function requestFullscreen() {
    const root = document.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (typeof request !== 'function') return Promise.resolve(false);
    try {
        return Promise.resolve(request.call(root)).then(() => true, () => false);
    } catch {
        return Promise.resolve(false);
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
    musicPlayer?.refreshPause(state.loveEvent);
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
// Back on the bike, upright (V2): a run left mid-crash, mid-fall, on foot,
// in a car or under the glider must not leave the rider lying on the road
// behind the menu, the rider screen or the podium.
function standRiderUp() {
    if (!v2) return;
    roamFall.active = false;
    roamFall.skid = 0;
    state.jump.airborne = false;
    state.jump.visualY = 0;
    state.trick.active = false;
    state.skidding = false;
    v2.roam.reset();
    bikeGroup.rotation.set(0, GAME_SETTINGS.gameMode === 'free' ? bikeGroup.rotation.y : Math.PI, 0);
    bikePivot.rotation.x = 0;
    bikeGroup.position.y = 0;
    v2.rider.reset();
}

function quitToMenu() {
    // Out of the Love&Faith event.
    if (state.loveEvent && loveEvent) loveEvent.leave();
    state.loveEvent = false;
    // A session live turn left: the next one rides.
    if (liveRecording && live) {
        live.turnOver({ score: Math.floor(state.score), reason: 'left', seconds: Math.round(state.gameTime * 10) / 10, kmh: Math.round(runStats.top || 0) });
        liveRecording = false;
    }
    // Left on purpose: not a run cut short.
    clearLiveRun();
    countRunTime();
    state.shield.count = 0;
    showShields();
    state.userPaused = false;
    state.isPlaying = false;
    document.body.classList.remove('ui-competitive');
    crashSequence++;
    endCinematic('crash');
    endCinematic('police-linear');
    endCinematic('love-end');
    endCinematic('tow');
    endCinematic('police');
    endCinematic('glider-police');
    endCinematic('roam-fall');
    stopVoice();
    audio.setPaused(false);
    audio.stopRun();
    musicPlayer?.stopRun();
    stopPorscheTrack();
    completedRankedRun = null;
    standRiderUp();
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
            if (state.frame < state.shield.graceUntil || state.shield.count > 0) {
                // A shield takes it (and whatever is touched with it).
                if (state.frame >= state.shield.graceUntil) breakShield();
                obs.active = false;
                continue;
            }
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

// Shields: now and then a ramp carries one, in a bubble on the way of its
// jump; the jump picks it up, and it takes one obstacle (src/shield.js). Up
// to SHIELD.max are carried at once.
function maybeShield(ramp) {
    const shield = state.shield;
    if (state.tricksOnly || shield.count >= SHIELD.max || state.frame < shield.nextAt) return;
    if (state.ramps.some((other) => other.shield && !other.shield.userData.taken)) return;
    if (Math.random() >= SHIELD.chance) return;
    shield.nextAt = state.frame + SHIELD.gapFrames;
    if (!shields) shields = createShields(scene);
    ramp.shield = shields.pickup();
    ramp.shield.position.set(0, SHIELD.height, -RAMP.length / 2 - SHIELD.ahead);
    ramp.mesh.add(ramp.shield);
}

const SHIELD_ICON = '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M2 3.5 Q12 0.5 22 3.5 V13 Q21.5 22 12 27 Q2.5 22 2 13 Z" fill="#1f6bff" stroke="#e8eef8" stroke-width="2"/><path d="M12 7.5 13.6 12 18 13.5 13.6 15 12 19.5 10.4 15 6 13.5 10.4 12 Z" fill="#ffc928"/></svg>';

// A shield took a hit: beside the score, it cracks in two and falls apart.
function showShieldBreak() {
    const container = document.getElementById('score-container');
    if (!container) return;
    const broken = document.createElement('span');
    broken.className = 'score-shield-break';
    broken.setAttribute('aria-hidden', 'true');
    broken.innerHTML = `<i class="half half--left">${SHIELD_ICON}</i><i class="half half--right">${SHIELD_ICON}</i><i class="flash"></i>`;
    container.append(broken);
    setTimeout(() => broken.remove(), 950);
}

// The mark beside the score (with their number from two), and the bubbles
// around the bike.
function showShields() {
    const count = state.shield.count;
    if (shields) shields.carry(count);
    const container = document.getElementById('score-container');
    let mark = document.getElementById('score-shield');
    if (!mark && count > 0 && container) {
        mark = document.createElement('span');
        mark.id = 'score-shield';
        mark.setAttribute('role', 'img');
        mark.setAttribute('aria-label', 'Bouclier');
        mark.innerHTML = `${SHIELD_ICON}<b></b>`;
        container.append(mark);
    }
    if (!mark) return;
    mark.classList.toggle('is-on', count > 0);
    mark.setAttribute('aria-label', count > 1 ? `${count} boucliers` : 'Bouclier');
    mark.querySelector('b').textContent = count > 1 ? `×${count}` : '';
}

function takeShield(pickup) {
    shields.take(pickup);
    bumpStat('shields');
    state.shield.count = Math.min(SHIELD.max, state.shield.count + 1);
    showShields();
    audio.play('multiplier_up', { volume: 0.6 });
    if (state.shield.count > 1) {
        toast(`BOUCLIER ×${state.shield.count}`, 'Le maximum', { discreet: true, float: true });
    } else if (!state.shield.told) {
        state.shield.told = true;
        toast('BOUCLIER', 'Il encaisse 1 obstacle', { discreet: true, float: true });
    }
}

function breakShield() {
    const shield = state.shield;
    shield.count -= 1;
    bumpStat('shieldSaves');
    shield.graceUntil = state.frame + SHIELD.grace;
    shield.nextAt = Math.max(shield.nextAt, state.frame + SHIELD.afterBreakFrames);
    if (shields) shields.burst(shield.count);
    showShields();
    showShieldBreak();
    audio.play('plate_snap', { volume: 0.8 });
    audio.play('whoosh', { volume: 0.45, rate: 0.8 });
    toast('BOUCLIER BRISÉ', shield.count > 0 ? 'Obstacle encaissé · il en reste 1' : 'Obstacle encaissé', { discreet: true, float: true });
}

// Arrows up both edges of the ramps, lit one after the other from the
// bottom to the lip: seen from far, they say "take me".
const RAMP_ARROWS = 5;
let rampArrows = null;
function rampArrowParts() {
    if (rampArrows) return rampArrows;
    const slope = Math.hypot(RAMP.length, JUMP.rampHeight);
    const up = JUMP.rampHeight / slope;
    const along = RAMP.length / slope;
    const geometries = [];
    for (let i = 0; i < RAMP_ARROWS; i++) {
        const positions = [];
        // A chevron lying on the deck, s metres up the slope from its foot.
        const point = (x, s) => positions.push(x, s * up + 0.03, RAMP.length / 2 - s * along);
        const s0 = slope * (0.12 + i * 0.17);
        for (const side of [-1, 1]) {
            const cx = side * (RAMP.width / 2 - 0.34);
            const half = 0.24;
            const rise = 0.3;
            const thick = 0.17;
            for (const arm of [-1, 1]) {
                const outer = [cx + arm * half, s0];
                const tip = [cx, s0 + rise];
                const tipIn = [cx, s0 + rise - thick];
                const inner = [cx + arm * half, s0 - thick];
                for (const [x, s] of [outer, tip, tipIn, outer, tipIn, inner]) point(x, s);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.userData.shared = true;
        geometries.push(geometry);
    }
    const materials = geometries.map(() => {
        const material = new THREE.MeshBasicMaterial({ color: 0x5a4a10, side: THREE.DoubleSide, toneMapped: false });
        sharedMaterials.add(material);
        return material;
    });
    rampArrows = { geometries, materials, dim: new THREE.Color(0x6b5a14), lit: new THREE.Color(0xfff2a0) };
    return rampArrows;
}

// The light running up the arrows (all the ramps together).
function updateRampArrows() {
    if (!rampArrows || !state.ramps.length) return;
    const head = (performance.now() / 1000 * 7) % (RAMP_ARROWS + 2.5);
    rampArrows.materials.forEach((material, i) => {
        material.color.lerpColors(rampArrows.dim, rampArrows.lit, Math.max(0, 1 - Math.abs(head - i) * 0.8));
    });
}

function spawnRamp(z) {
    const x = (Math.random() - 0.5) * 12;
    // A little wider than it was (5 to 10 %, each its own): seen from further.
    const wider = 1.05 + Math.random() * 0.05;
    placeRamp(x, z, wider, true);
    if (liveRecording) live.recordSpawn(['r', state.frame, Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(wider * 1000) / 1000]);
}

// withShield: maybe a shield on it (the rider's game; not in a session's
// replay, where only what is seen matters).
function placeRamp(x, z, wider, withShield = false) {
    const mesh = createRampMesh();
    mesh.scale.x = wider;
    mesh.position.set(x, 0, z);
    const arrows = rampArrowParts();
    arrows.geometries.forEach((geometry, i) => mesh.add(new THREE.Mesh(geometry, arrows.materials[i])));
    scene.add(mesh);
    const ramp = { mesh, x, z, half: RAMP.width / 2 * wider, front: z + RAMP.length / 2, lip: z - RAMP.length / 2, launched: false };
    state.ramps.push(ramp);
    if (withShield) maybeShield(ramp);
    // Not stretched with its ramp.
    if (ramp.shield) ramp.shield.scale.x = SHIELD.size / wider;
    // Clear the run-up and the landing zone of obstacles (less road as the
    // score climbs).
    const extra = extraPhase();
    const zone = { from: z + 25, to: z - (extra ? extra.rampClear : lerpBy(SCORE_DIFFICULTY.rampClear, scoreDifficulty())) };
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
    return state.ramps.find((ramp) => Math.abs(x - ramp.x) < ramp.half && z <= ramp.front && z >= ramp.lip - 0.5);
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
        if (ramp.launched || Math.abs(x - ramp.x) >= ramp.half) continue;
        // Crossed the lip this frame: the takeoff happens on the next one.
        if (z <= ramp.lip && z + state.speed > ramp.lip) {
            ramp.launched = true;
            state.jump.pending = true;
            state.jump.visualY = JUMP.rampHeight;
            bikeGroup.position.y = JUMP.rampHeight;
        }
    }
    // The shield of the ramp just jumped: picked up as the bike flies by.
    for (const ramp of state.ramps) {
        const pickup = ramp.shield;
        if (!pickup || pickup.userData.taken || !ramp.launched || !state.jump.airborne) continue;
        const past = ramp.lip - SHIELD.ahead - z;
        if (past >= -1.5 && past < 12 && Math.abs(x - ramp.x) < ramp.half + 1.2) takeShield(pickup);
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
        trick.type = pickTrick(state.jump.airborne, trick.type);
        trick.since = state.frame;
        bumpStat('tricks');
        audio.play('whoosh', { volume: 0.4, rate: 1.2 });
    } else if (active && state.jump.airborne) {
        // Held through a jump: one stunt after the other (a freestyle combo).
        const every = state.jump.flipActive ? TRICK_COMBO.flipFrames : TRICK_COMBO.frames;
        if (state.frame - trick.since >= every) {
            trick.type = pickTrick(true, trick.type);
            trick.since = state.frame;
            bumpStat('tricks');
            audio.play('whoosh', { volume: 0.3, rate: 1.35 });
        }
    }
    trick.active = active;
}

// What the takeoff speed allows, said as the bike leaves the ramp.
function announceFlip(kmh) {
    if (ruleset().triple && kmh >= FLIP.tripleKmh) toast('TRIPLE BACKFLIP POSSIBLE', 'Reste appuyé : triple (400 pts) · lâche plus tôt : double ou simple', { discreet: true, float: true });
    else if (kmh >= FLIP.doubleKmh) toast('DOUBLE BACKFLIP POSSIBLE', 'Reste appuyé : double · lâche après un tour : simple', { discreet: true, float: true });
    else if (kmh >= FLIP.kmh) toast('BACKFLIP', 'Reste appuyé jusqu’à l’atterrissage', { discreet: true, float: true });
    // In a wheelie but too slow: just a jump, nothing to fear.
    else toast('PAS DE BACKFLIP', `Il faut ${FLIP.kmh} km/h au tremplin`, { discreet: true, float: true });
}

function landFlip(frame) {
    const jump = state.jump;
    const manual = state.flipMode === 'manual';
    const most = jump.flipMost || 2;
    const [outcome, turns, forwards] = manual ? manualFlipLanding(state.bike.angle + jump.flipAngle, most) : flipLanding(jump.flipAngle, most);
    if (outcome === 'clean') {
        const bonus = (jump.trickFrames > 0 ? FLIP.trickBonus : FLIP.bonus)[turns];
        state.score += bonus;
        bumpStat(turns >= 3 ? 'tripleFlips' : turns >= 2 ? 'doubleFlips' : 'flips');
        const flip = forwards ? 'FRONTFLIP' : 'BACKFLIP';
        const name = turns >= 3 ? `TRIPLE ${flip}` : turns >= 2 ? `DOUBLE ${flip}` : flip;
        toast(`+${bonus}`, jump.trickFrames > 0 ? `${name} + FIGURE !` : `${name} !`, { float: true });
        audio.play('new_record', { volume: 0.45 });
        audio.play('landing', { volume: 0.5 });
    } else if (outcome === 'bad') {
        state.vulnerableUntil = frame + FLIP.badFrames;
        state.badLanding = FLIP.badFrames / 60;
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
    toast('BAVETTE !', `Lâche ${isMobile() ? 'WHEELIE' : 'le wheeling'} avant qu’elle lâche${ruleset().tipFull ? ' · pas de GAZ à fond' : ''}`, { discreet: true, float: true });
}

// Saved: its points (5 to 30 with the speed, less right after another one)
// beside the score.
function endBavette(saved, bonus = 0) {
    if (saved) bumpStat('bavettes');
    if (!saved || !bonus) return;
    const held = state.frame - (state.bavette.started ?? state.frame);
    scoreBonus(bonus, held >= 20 ? 'BELLE BAVETTE' : 'BAVETTE');
    if (held >= 20) audio.play('landing', { volume: 0.4 });
}

// A bonus shown for a moment to the right of the score (top centre).
function scoreBonus(points, label) {
    const container = document.getElementById('score-container');
    if (!container) return;
    let bonus = document.getElementById('score-bonus');
    if (!bonus) {
        bonus = document.createElement('span');
        bonus.id = 'score-bonus';
        bonus.setAttribute('aria-hidden', 'true');
        container.append(bonus);
    }
    const tag = document.createElement('small');
    tag.textContent = label;
    bonus.replaceChildren(`+${points}`, tag);
    bonus.classList.remove('is-shown');
    void bonus.offsetWidth;
    bonus.classList.add('is-shown');
}

function plateTornOff() {
    bumpStat('plates');
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
        // Rules 10 and 11: held through most of the flight, 100 more; else 50.
        let hold = 0;
        let held = false;
        if (ruleset().holdBonus) {
            held = trickFrames * TRICK_HOLD.share[1] >= state.jump.airFrames * TRICK_HOLD.share[0];
            hold = TRICK_HOLD.bonus[held ? 1 : 0];
            state.score += hold;
            if (held) bumpStat('heldTricks');
        }
        const air = trickFrames * FIXED_STEP * JUMP.airRate * difficulty;
        state.boost.charges = Math.min(BOOST.maxCharges, state.boost.charges + 1);
        const text = !hold ? 'FIGURE RÉUSSIE · BOOST +1 (B)'
            : held ? `FIGURE TENUE +${hold} · BOOST +1 (B)` : `FIGURE +${hold} (figure lâchée trop tôt) · BOOST +1`;
        toast(`+${Math.round(bonus + air + hold)}`, text, { float: true });
        audio.play('multiplier_up', { volume: 0.45, rate: 1.15 });
        speak('landing', { force: true });
    }
}

// Free roam ----------------------------------------------------------------------
// The jetpack (J, or its pad): on, or down to land.
function roamJet() {
    if (!v2 || !state.isPlaying || state.isPaused || GAME_SETTINGS.gameMode !== 'free') return;
    if (roamFall.active) return;
    if (v2.roam.mode !== 'jet' && !jetUnlocked()) {
        toast('JETPACK', `Tape son code secret (révélé à ${JETPACK_POINTS.toLocaleString('fr-FR')} points cumulés)`, { discreet: true, float: true });
        return;
    }
    if (v2.roam.toggleJet() && v2.roam.mode === 'jet') bumpStat('jetpacks');
}

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
        // A new street: the old one's tyre marks go with it.
        v2.skidmarks.clear();
        freeRide.travel = undefined;
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
    if (liveRecording && float) live.recordMark(state.frame, title, text);
}

// Phases of a competitive run, each opened by an overhead motorway sign:
// 1 obstacles (0-20 s), 2 tricks on ramps without obstacles (20-35 s),
// 3 tricks and obstacles (35 s on).
const PHASES = [
    null,
    { title: 'PHASE 1', subtitle: 'OBSTACLES', color: '#0b6b3a' },
    { title: 'PHASE 2', subtitle: 'FIGURES', color: '#1d4fa8' },
    { title: 'PHASE 3', subtitle: 'FIGURES + OBSTACLES', color: '#a8321d' },
    // Past the full difficulty (EXTRA_PHASES).
    { title: 'PHASE 4', subtitle: 'EXTRÊME', color: '#6b1fa3' },
    { title: 'PHASE 5', subtitle: 'INFERNALE', color: '#9c0f16' },
    { title: 'PHASE 6', subtitle: 'LÉGENDE', color: '#15161a' },
    // The Love&Faith event's start.
    { title: 'LOVE&FAITH', subtitle: 'RÉPARE TON CŒUR', color: '#760000' }
];
const LOVE_SIGN = 7;
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
// Phase 3's return of the obstacles: calm for the 2.6 s of its message and
// about 2 s more (from the sign), then the density rises from a few to the
// usual over about 8 s of road.
const OBSTACLE_RETURN = { calmFrames: 300, rampFrames: 480, minDensity: 0.15 };

function rampObstaclesFrom(from) {
    const to = from - Math.max(160, state.speed * OBSTACLE_RETURN.rampFrames);
    state.obstacleRamp = { from, to };
    // Thin out those already placed there at full density.
    state.obstacles = state.obstacles.filter((obs) => {
        const oz = obs.mesh.position.z;
        if (oz > from || oz < to || Math.random() < obstacleDensity(oz)) return true;
        scene.remove(obs.mesh);
        disposeObjectTree(obs.mesh);
        return false;
    });
}

// 1 = the usual number of obstacles at road position z (less while they come back).
function obstacleDensity(z) {
    const ramp = state.obstacleRamp;
    if (!ramp || z > ramp.from || z <= ramp.to) return 1;
    return OBSTACLE_RETURN.minDensity + (1 - OBSTACLE_RETURN.minDensity) * (ramp.from - z) / (ramp.from - ramp.to);
}

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
    return to;
}
const inQuietZone = (z) => state.quietZones.some((zone) => z <= zone.from && z >= zone.to);

function updatePhases(frame) {
    const lead = 120;
    const calm = 120;
    const ahead = (frames) => bikeGroup.position.z - state.speed * frames - 20;
    if (frame === 1 && state.gantries.length === 0) {
        spawnGantry(state.loveEvent ? LOVE_SIGN : 1, -45);
        quietAfter(-45, 150);
    }
    // Tricks-only mode (secret code): no phases, no signs.
    if (state.tricksOnly) return;
    // Sign 2 crossed 2 s before the ramps start (phase 2 sign at 23 s).
    if (frame === JUMP.rampsFrom - calm - lead && !state.loveEvent) {
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
    if (frame === JUMP.groundTricksFrom - calm - lead && !state.loveEvent) {
        const z = ahead(lead);
        spawnGantry(3, z);
        // Obstacles come back: nothing while the message is up and a moment
        // after it, then a few at first, up to the usual rhythm.
        const to = quietAfter(z, OBSTACLE_RETURN.calmFrames);
        rampObstaclesFrom(to);
    }
    // The next phase past the full difficulty: its sign once its score is
    // reached (and the last sign crossed: one at a time).
    const signs = state.extraSigns || 0;
    const nextPhase = EXTRA_PHASES[signs];
    if (nextPhase && !state.loveEvent && frame >= JUMP.groundTricksFrom && state.phase === 3 + signs && state.score >= nextPhase.from) {
        state.extraSigns = signs + 1;
        const z = ahead(lead);
        spawnGantry(4 + signs, z);
        quietAfter(z, 90);
    }
    state.quietZones = state.quietZones.filter((zone) => zone.to < bikeGroup.position.z + 40);
    for (const gantry of state.gantries) {
        if (!gantry.userData.announced && bikeGroup.position.z < gantry.position.z) {
            gantry.userData.announced = true;
            const { title, subtitle } = PHASES[gantry.userData.phase];
            const phase = gantry.userData.phase;
            if (phase === LOVE_SIGN) {
                toast(`${title} · ${subtitle}`, 'Lève la roue · attrape cœurs, câlins et lettres · évite les cœurs brisés et les larmes');
                continue;
            }
            state.phase = phase;
            if (phase >= 4) audio.play('new_record', { volume: 0.4 });
            toast(`${title} · ${subtitle}`, phase === 2 ? `Tremplins : FIGURE${isMobile() ? '' : ' (F)'} en l’air · backflip : en wheeling à 130 km/h, garde ${isMobile() ? 'WHEELIE' : 'ESPACE'}`
                : phase === 3 ? 'Un obstacle pendant une figure = chute' : phase >= 4 ? EXTRA_PHASES[phase - 4].text : 'Évite les obstacles');
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
    if (state.tricksOnly || state.loveEvent) return false;
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
    if (inQuietZone(z) || state.rampFreeZones.some((zone) => z <= zone.from && z >= zone.to) || !obstacleRoomAt(z)) return;
    // Not while the obstacles are only just coming back (phase 3).
    if (obstacleDensity(z) < 0.6) return;
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
// Free roam, on the bike: Figures Land in one of the next side streets
// (revealed by buying the free roam tricks).
const LAND_SEQUENCE = ['wheelie', 'wheelie', 'brake', 'tap', 'tap', 'tap'];
// Free roam, on the bike: the jetpack (and it is the player's from then on).
const JET_SEQUENCE = ['brake', 'gas', 'wheelie', 'tap', 'tap', 'tap'];
const PORSCHE_TAPS_SEQUENCE = ['tap', 'tap', 'tap', 'tap', 'tap'];
const JET_CODE_KEY = 'wheelie_jetpack_code';
// The jetpack's button: there once its code has been typed (never before;
// JETPACK_POINTS only reveals the code).
function jetUnlocked() {
    return readSetting(JET_CODE_KEY) === '1';
}
function secretInput(kind) {
    if (!state.isPlaying || state.userPaused) return;
    const competitive = GAME_SETTINGS.gameMode === 'linear';
    // The codes work for whoever knows them; cumulative points only reveal
    // them (the golden bird on the menu, the trophy room).
    if (competitive && (state.gameTime > 10 || state.tricksOnly)) return;
    // Free roam: on the bike or on foot (street or roof), any time.
    const porscheCabrio = !competitive && v2?.roam.mode === 'car' && v2.roam.carModel === 'gt-cabrio-5hc';
    if (!competitive && !(v2 && (v2.roam.mode === 'bike' || v2.roam.mode === 'walk' || porscheCabrio) && !roamFall.active && !v2.roam.frozen)) return;
    const recent = (secretCode.recent ||= []);
    recent.push(kind);
    if (recent.length > 6) recent.shift();
    const typed = (sequence) => recent.length >= sequence.length
        && sequence.every((step, index) => step === recent[recent.length - sequence.length + index]);
    if (porscheCabrio && typed(PORSCHE_TAPS_SEQUENCE)) {
        recent.length = 0;
        startPorscheTrack({ fromUnlock: false });
        toast('🎵 GT 51 CABRIO', 'RAK33M — Je pensais pas', { float: true });
        return;
    }
    if (!competitive && typed(LAND_SEQUENCE)) {
        recent.length = 0;
        v2.figuresLand.summon();
        bumpStat('landCode');
        audio.play('new_record', { volume: 0.5 });
        toast('🎡 FIGURES LAND', 'Elle t’attend dans une des prochaines rues : suis le panneau', { float: true });
        return;
    }
    if (!competitive && typed(JET_SEQUENCE)) {
        recent.length = 0;
        try {
            localStorage.setItem(JET_CODE_KEY, '1');
        } catch {
            // Works for this visit.
        }
        bumpStat('jetCode');
        audio.play('new_record', { volume: 0.5 });
        toast('CODE SECRET', 'Jetpack ! Le bouton JETPACK (touche J) est à toi maintenant', { float: true });
        if (v2.roam.startJet()) bumpStat('jetpacks');
        return;
    }
    if (!typed(SECRET_SEQUENCE)) return;
    recent.length = 0;
    secretCode.step = 0;
    if (competitive) startTricksOnly();
    else if (v2.roam.startGlide(bikeGroup)) bumpStat('gliders');
}

// Presses of gas, brake and wheelie (keyboard, pads, or the joystick pushed
// up then pulled down), once a frame.
function watchSecretKeys() {
    const stick = GAME_SETTINGS.controlMode === 'analog' && analogData.active ? analogData.y : 0;
    const now = { up: !!state.keys.up || stick < -0.3, down: !!state.keys.down || stick > 0.35, space: !!state.keys.space };
    const before = secretCode.prev;
    if (now.up && !before.up) secretInput('gas');
    if (now.down && !before.down) secretInput('brake');
    if (now.space && !before.space) secretInput('wheelie');
    secretCode.prev = now;
}

function startTricksOnly() {
    if (state.loveEvent) return;
    state.tricksOnly = true;
    bumpStat('codeTricks');
    state.police.phase = 'idle';
    hidePoliceWarning();
    state.obstacles.forEach((obs) => {
        obs.active = false;
        obs.mesh.visible = false;
    });
    // No phases any more: the signs still ahead go too.
    state.gantries = state.gantries.filter((gantry) => {
        if (gantry.userData.announced) return true;
        scene.remove(gantry);
        return false;
    });
    state.quietZones = [];
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
    bumpStat('skids');
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
    bavette: ['BAVETTE LÂCHÉE', 'Bavette tenue trop longtemps (ou GAZ à fond dessus) : la moto est passée par-dessus.'],
    earlyGas: ['TROP TÔT', 'Après une bavette, laisse la moto redescendre avant de la relever ou de remettre GAZ à fond.']
};

function showDefeatReason(reason) {
    const element = document.getElementById('gameover-reason');
    let [label, detail] = DEFEAT_REASONS[reason] || [];
    if (reason === 'bavette' && !ruleset().tipFull) detail = 'Resté appuyé trop longtemps sur la bavette : la moto est passée par-dessus.';
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
    // The Love&Faith event: its own end (nothing ranked).
    if (state.loveEvent) {
        loveCrash(reason);
        return;
    }
    // The run ends normally: nothing to report at the next visit.
    clearLiveRun();
    musicPlayer?.stopRun();
    speedLines?.hide();
    hidePoliceWarning();
    if (!runStats.counted) {
        bumpStat(reason === 'slow' ? 'arrests' : 'falls');
        if (GAME_SETTINGS.gameMode === 'linear') {
            bumpStat('score', Math.floor(state.score));
            bestStat('bestScore', Math.floor(state.score));
            bestStat('topKmh', Math.round(runStats.top));
        }
        countRunTime();
    }
    state.shield.count = 0;
    showShields();
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
            plate: state.plate.on || state.plate.off,
            rules: state.rules
        };
    } else {
        completedRankedRun = null;
        if (GAME_SETTINGS.gameMode === 'linear') {
            unrankedReason = state.runReplayOverflow ? 'partie de plus d’une heure'
                : !state.runToken ? `pas de session de classement (${state.sessionError || lastSessionError || 'serveur injoignable au départ'})`
                    : 'partie trop courte';
            reportUnrankedRun(unrankedReason, Math.floor(state.score), state.gameTime);
            // Playing without the human check is a choice, not a fault.
            if (state.score >= 30 && state.sessionError !== HUMAN_CHECK_SKIPPED) {
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
    const crashKind = reason === 'loop' || reason === 'flip' || reason === 'bavette' || reason === 'earlyGas' || state.bike.angle > CONFIG.maxAngle ||
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
    // A session live turn: the others are told (src/live/live.js).
    const liveTurn = liveRecording && !!live && live.turnOver({
        score: currentScore, reason, seconds: Math.round(state.gameTime * 10) / 10, kmh: Math.round(runStats.top || 0)
    });
    liveRecording = false;
    // Tricks only: a tenth of the score, for free roam.
    const tricksPoints = Math.floor(currentScore / 10);
    if (GAME_SETTINGS.gameMode === 'linear') {
        const before = totalPoints();
        addPoints(tricksOnly ? tricksPoints : currentScore);
        maybeOfferFreeTricks();
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

    if (liveTurn) {
        // The session shows what follows; the run is still ranked.
        if (nickname && !tricksOnly) await submitCompletedRun(nickname);
        return;
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

// --- The Love&Faith event (src/event/love.js) -----------------------------------
let loveEvent = null;
let lovePending = false;
function startLoveRun() {
    if (!v2 || startInProgress) return;
    if (state.isPlaying) {
        state.isPlaying = false;
        crashSequence++;
        audio.stopRun();
    }
    lovePending = true;
    GAME_SETTINGS.gameMode = 'linear';
    document.querySelectorAll('.screen.active').forEach((screen) => screen.classList.remove('active'));
    startGame();
}

// A fall in the event: the fall plays out, then the event's card.
function loveCrash(reason) {
    speedLines?.hide();
    bumpStat('loveFalls');
    countRunTime();
    audio.stopRun();
    audio.play('collision', { volume: 0.8 });
    const crashKind = reason === 'loop' || reason === 'bavette' || reason === 'earlyGas' || state.bike.angle > CONFIG.maxAngle ? 'loop' : 'hit';
    const crashSpeed = state.speed * 60;
    const crashInfo = visualSnapshot();
    state.isPlaying = false;
    state.skidding = false;
    const sequence = ++crashSequence;
    if (v2) playCrashSequence(crashKind, crashSpeed, sequence, crashInfo);
    hideRunControls();
    loveEvent?.finish('fall', { seconds: state.gameTime, points: bankLovePoints() });
}

// Mended (into the cloud, on at a cruise) or broken (rolling to a stop):
// the race stops, the picture goes on until the card's answer.
function loveFinish(kind) {
    if (!state.isPlaying) return;
    speedLines?.hide();
    countRunTime();
    audio.stopRun();
    if (kind === 'repaired') audio.play('new_record', { volume: 0.6 });
    state.isPlaying = false;
    state.skidding = false;
    hideRunControls();
    const sequence = ++crashSequence;
    let speed = state.speed * 60;
    const start = performance.now();
    let last = start;
    const tick = (now) => {
        if (sequence !== crashSequence || state.isPlaying || !state.loveEvent) return;
        const rawDt = Math.min((now - last) / 1000, 0.05);
        const dt = rawDt * cinematicSpeed();
        last = now;
        const cruise = kind === 'repaired' ? 45 : 0;
        speed += (cruise - speed) * Math.min(1, dt * (kind === 'repaired' ? 0.5 : 0.8));
        bikeGroup.position.z -= speed * dt;
        state.speed = speed / 60;
        state.bike.angle *= Math.pow(0.4, dt);
        bikePivot.rotation.x = -state.bike.angle;
        renderScene(rawDt);
        if (now - start < 60000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    loveEvent?.finish(kind, { seconds: state.gameTime, points: bankLovePoints() });
}

// What the race earned (the wheeling's points): added to the cumulative
// points, as a race of the competitive mode.
function bankLovePoints() {
    const points = Math.max(0, Math.floor(state.score));
    if (points > 0) {
        addPoints(points);
        bumpStat('lovePoints', points);
        document.dispatchEvent(new CustomEvent('wheelie:points'));
    }
    return points;
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
    beginCinematic('crash');
    let last = performance.now();
    const tick = (now) => {
        if (sequence !== crashSequence || state.isPlaying) {
            endCinematic('crash');
            return;
        }
        const dt = Math.min((now - last) / 1000, 0.05) * cinematicSpeed();
        last = now;
        const moving = v2.rider.updateCrash(dt);
        renderScene(dt);
        if (moving) requestAnimationFrame(tick);
        else endCinematic('crash');
    };
    requestAnimationFrame(tick);
}

// V2, too slow: the patrol car cuts in ahead and the bike rolls to a stop.
function playPoliceStop(sequence, variant) {
    v2.policeStop(variant);
    let rolling = state.speed * 60;
    state.speed = 0;
    updateUI();
    beginCinematic('police-linear');
    const start = performance.now();
    let last = start;
    let elapsed = 0;
    const tick = (now) => {
        if (sequence !== crashSequence || state.isPlaying) {
            endCinematic('police-linear');
            return;
        }
        const dt = Math.min((now - last) / 1000, 0.05) * cinematicSpeed();
        last = now;
        elapsed += dt;
        rolling = Math.max(0, rolling - 70 * dt);
        bikeGroup.position.z -= rolling * dt;
        renderScene(dt);
        if (elapsed < 6) requestAnimationFrame(tick);
        else endCinematic('police-linear');
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
// The physics moves in steps of 1/60 s; the screen does not always draw one
// step a frame (0 or 2 when the phone is busy, or a 120 Hz screen). Drawn
// where the step left it, the bike jerked against the camera (it seemed to
// go back a moment). Races: drawn between its last two steps instead.
const renderFrom = { x: 0, y: 0, z: 0, valid: false };
const renderAt = { x: 0, y: 0, z: 0 };
let cameraDt = FIXED_STEP;
// The camera left where it is (the Love&Faith storm takes the rider away).
let cameraHold = false;

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
        if (bikeGroup) {
            renderFrom.x = bikeGroup.position.x;
            renderFrom.y = bikeGroup.position.y;
            renderFrom.z = bikeGroup.position.z;
            renderFrom.valid = true;
        }
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
            const beforeSkid = state.speed;
            state.speed *= 0.98;
            // Rules 6 and 7: off the boost's gain first.
            if (ruleset().floor) state.boost.gain = Math.max(0, state.boost.gain - (beforeSkid - state.speed));
            bikeGroup.position.z -= state.speed;
            // Still steering while it skids (a little less): room to get out
            // of the way of the next one. Seen only (the server does not
            // follow the bike sideways).
            steerLinear(0.8);
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
                let stickX = moveX / unit;
                let stickZ = moveZ / unit;
                if (roam.mode === 'walk' && freeOrbit.yaw) {
                    const yaw = Math.PI + freeOrbit.yaw;
                    const forward = -stickZ;
                    stickX = moveX / unit * -Math.cos(yaw) + forward * Math.sin(yaw);
                    stickZ = moveX / unit * Math.sin(yaw) + forward * Math.cos(yaw);
                }
                roam.move(dt, stickX, stickZ, { run: state.keys.run, jump: state.keys.space, boost: state.keys.boost });
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
                freeTrickStep(dt, roam);
                freeWheelieStep(dt, roam);
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

            // Wheelie mechanics in free mode (V2: freeWheelieStep).
            if (!roam) {
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
            }

            state.distance += Math.abs(moveZ) + Math.abs(moveX);
            }
        } else {
            let isAccelerating = state.keys.up;
            let isBraking = state.keys.down;
            let stickBrake = false;
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
                    if (analogData.y > 0.5) {
                        // The stick alone: a little less than the button.
                        if (!isBraking) stickBrake = true;
                        isBraking = true;
                    }
                }
            } else {
                if (state.keys.left) state.bike.lateralVelocity -= CONFIG.lateralAccel;
                if (state.keys.right) state.bike.lateralVelocity += CONFIG.lateralAccel;
            }
            // The gas button (or key) is full throttle. The stick alone is
            // half at most, and the automatic throttle just under full: they
            // keep the speed up without tipping the bike over on a bavette.
            // Driven with the exact value that is recorded (one byte), so the
            // server replay sees the same throttle as the game.
            // The stick: full throttle on the default controls, part of it
            // on custom controls (their setting).
            const rules = ruleset();
            let accelerationScale = 1;
            if (!state.keys.up && GAME_SETTINGS.controlMode === 'analog' && analogData.active) {
                const stickShare = GAME_SETTINGS.customControls ? GAME_SETTINGS.stickThrottle : 1;
                if (GAME_SETTINGS.autoRace) accelerationScale = rules.tipFull ? 254 / 255 : 1;
                else if (analogData.y < -0.1) accelerationScale = Math.round(Math.min(1, Math.abs(analogData.y) * 1.5) * stickShare * 255) / 255;
            }
            // Ramp takeoff and tricks, decided on the speed at the start of
            // the frame exactly as the server does.
            const frame = state.frame;
            const startKmh = state.speed * 50;
            if (startKmh > runStats.top) runStats.top = startKmh;
            const jump = state.jump;
            const offTheLip = jump.pending && !jump.airborne;
            const takeoff = offTheLip && startKmh > JUMP.minKmh &&
                frame >= rampsFrom() && frame - jump.lastLanding >= JUMP.spacing;
            jump.pending = false;
            if (takeoff) {
                jump.airborne = true;
                jump.y = JUMP.rampHeight;
                jump.vy = (10 + startKmh * 0.08) / 60;
                jump.trickFrames = 0;
                jump.airFrames = 0;
                jump.flipMost = ruleset().triple && startKmh >= FLIP.tripleKmh ? 3 : 2;
                jump.hop = null;
                bumpStat('jumps');
                audio.play('rev_blip', { volume: 0.45, rate: 1.15 });
            } else if (offTheLip) {
                // Too slow (or too soon) for a real jump: a little hop off
                // the ramp all the same. Seen only: no flight, no tricks, no
                // points (the server does not know it).
                jump.hop = { y: JUMP.rampHeight, vy: 0.06 + Math.min(0.06, startKmh * 0.002) };
                audio.play('rev_blip', { volume: 0.25, rate: 0.95 });
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
                bumpStat('boosts');
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
            let wheelieInput = state.keys.space && !trickGround;
            const assist = state.assist;
            const startAngle = state.bike.angle;
            // Arrows: the wheelie button alone lifts the front with a short
            // burst of throttle, which stops once it is up.
            if (GAME_SETTINGS.controlMode === 'arrows' && wheelieInput && !isAccelerating && !isBraking && grounded &&
                state.bavette.left === 0 && !assist.hop) {
                if (assist.burst < WHEELIE_ASSIST.burstFrames && startAngle < WHEELIE_ASSIST.upAngle) {
                    assist.burst += 1;
                    isAccelerating = true;
                    accelerationScale = WHEELIE_ASSIST.burst;
                }
            } else if (!wheelieInput) {
                assist.burst = 0;
            }
            // Hopped off at walking pace (the automatic brake): the rider
            // holds the bike beside him, its front comes down, he jogs it
            // back up to speed, then hops back on. The player's throttle and
            // wheelie wait meanwhile.
            let autoBrake = false;
            if (assist.hop && grounded) {
                if (frame - assist.hop.start >= AUTO_BRAKE.hopFrames) {
                    assist.hop = null;
                } else {
                    wheelieInput = false;
                    isAccelerating = false;
                    if (startAngle > 0.02) {
                        isBraking = true;
                        autoBrake = true;
                    } else if (startKmh < AUTO_BRAKE.hopKmh) {
                        isAccelerating = true;
                        accelerationScale = AUTO_BRAKE.push;
                    }
                }
            }
            // The automatic rear brake: only when it is needed now to keep the
            // wheelie from going over (or on the last frame of a bavette).
            const brakeLimit = GAME_SETTINGS.autoBrake === 'off' ? -1 : GAME_SETTINGS.autoBrake === 'always' ? Infinity : AUTO_BRAKE.limitKmh;
            if (!autoBrake && !isBraking && grounded && startKmh <= brakeLimit && !assist.hop) {
                const bav = state.bavette;
                const holding = wheelieInput || (rules.tipFull && isAccelerating && accelerationScale === 1);
                if (bav.left > 0) {
                    autoBrake = bav.left === 1 && holding;
                } else if (state.bike.angularVelocity > 0 && startAngle > 0.4) {
                    const lifting = wheelieInput && isAccelerating;
                    autoBrake = wheelieWouldFall(startAngle, state.bike.angularVelocity, startKmh, lifting, 1, bav.armed);
                }
                if (autoBrake) {
                    isAccelerating = false;
                    isBraking = true;
                    if (!assist.braking) {
                        assist.used = true;
                        bumpStat('autoBrakes');
                        // At walking pace: off beside the bike (the side the
                        // stick or arrow points to, else up on the pegs).
                        if (startKmh <= AUTO_BRAKE.hopKmh && v2) {
                            const x = GAME_SETTINGS.controlMode === 'analog' && analogData.active ? analogData.x
                                : (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
                            assist.hop = { start: frame, side: x > 0.3 ? -1 : x < -0.3 ? 1 : 0 };
                            wheelieInput = false;
                        }
                        autoBrakeShown();
                    }
                }
            }
            assist.braking = autoBrake;
            // Rules 4 and 5: without throttle, the byte is the brake's strength
            // (full, but for the automatic rear brake).
            if (autoBrake) accelerationScale = AUTO_BRAKE.byte / 255;
            else if (!isAccelerating) accelerationScale = isBraking && stickBrake ? STICK_BRAKE : 1;
            // The lift effort (an option: the rider pulls the bike up).
            assist.effort = GAME_SETTINGS.liftAnimation && wheelieInput && isAccelerating && startAngle < 0.7;
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
            const bavette = state.bavette;
            // Full throttle (the gas button) tips the bike over up there
            // (rules 5).
            const fullThrottle = rules.tipFull && isAccelerating && accelerationScale === 1;
            // Just out of a bavette (not back down yet), full throttle alone
            // lifts the bike.
            if ((wheelieInput || (!bavette.armed && fullThrottle)) && isAccelerating) {
                if (kmh > 110 && !rules.gentle) lift = CONFIG.wheelieLiftFast;
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

                // Its strength (the throttle byte, without throttle).
                const brakeStrength = isAccelerating ? 1 : Math.round(accelerationScale * 255) / 255;
                const brakePower = CONFIG.brakeForce * brakeEfficiency * brakeStrength;
                const beforeBrake = state.speed;
                state.speed = Math.max(0, state.speed - brakePower);
                if (rules.floor) state.boost.gain = Math.max(0, state.boost.gain - (beforeBrake - state.speed));
            }
            const scraping = grounded && bavette.left > 0;
            if (scraping) {
                // Bavette: the tail on the road, held at the top by the
                // wheelie button or full throttle. It drags.
                bavette.total += 1;
                if (rules.firm) {
                    const beforeDrag = state.speed;
                    state.speed = Math.max(0, state.speed - BAVETTE.drag);
                    if (rules.floor) state.boost.gain = Math.max(0, state.boost.gain - (beforeDrag - state.speed));
                }
                if ((wheelieInput || fullThrottle) && !isBraking) {
                    bavette.left -= 1;
                    if (bavette.left === 0) gameOver('bavette');
                } else {
                    // Saved: the bavette's points, as far as they recharged
                    // (as the server counts them).
                    bavette.left = 0;
                    state.bike.angle = CONFIG.maxAngle;
                    state.bike.angularVelocity = BAVETTE.releaseAv;
                    const recharged = Math.min(1.0, (frame - bavette.savedAt) / BAVETTE.rechargeFrames);
                    const bonus = rules.recharge ? Math.floor(bavetteBonus(kmh) * recharged) : bavetteBonus(kmh);
                    bavette.savedAt = frame;
                    state.score += bonus;
                    endBavette(true, bonus);
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
                    // Over again before coming back down: no second chance.
                    const tooSoon = rules.noSecond && !bavette.armed;
                    bavette.left = tooSoon ? 0 : bavetteFrames(state.bike.angularVelocity, kmh, rules.longest, !!rules.gentle);
                    if (bavette.left === 0) {
                        gameOver(tooSoon ? 'earlyGas' : 'loop');
                    } else {
                        state.bike.angle = CONFIG.maxAngle;
                        state.bike.angularVelocity = 0;
                        bavette.armed = false;
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
            if (state.bike.angle < BAVETTE.rearmAngle) bavette.armed = true;
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
            // Bad landing, or a bavette about to let go: the bike shakes.
            if (state.badLanding > 0) state.badLanding = Math.max(0, state.badLanding - dt);
            bikeGroup.rotation.z += bikeTremble();
            if (isAccelerating) {
                let accel = CONFIG.baseAcceleration;
                if (kmh > 130) accel *= 0.15;
                else if (kmh > 120) accel *= 0.3;
                else if (kmh > 100) accel *= 0.5;
                else if (kmh > 80) accel *= 0.7;
                else if (kmh > 60) accel *= 0.85;
                accel *= accelerationScale;
                // While the tail scrapes, the stick's throttle does not push
                // the bike (it only keeps it from coasting): it slows down.
                if (state.speed < CONFIG.maxSpeed && !(rules.firm && scraping && !fullThrottle)) state.speed += accel;
            } else if (grounded && !isBraking) {
                if (state.speed > CONFIG.minSpeed) {
                    state.speed = rules.floor ? Math.max(0, state.speed - CONFIG.deceleration) : state.speed - CONFIG.deceleration;
                }
            }
            if (boost.frames > 0) {
                if (grounded && state.speed < BOOST.maxSpeed) {
                    state.speed += BOOST.accel;
                    boost.gain += BOOST.accel;
                }
                state.score += BOOST.rate * FIXED_STEP * (GAME_SETTINGS.difficulty === 'hard' ? 1.4 : GAME_SETTINGS.difficulty === 'medium' ? 1.2 : 1.0);
                boost.frames -= 1;
            } else if (boost.gain > 0 && !rules.keepBoost) {
                const drain = Math.min(BOOST.drain, boost.gain);
                state.speed = rules.floor ? Math.max(0, state.speed - drain) : state.speed - drain;
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
                state.score += groundTrickRate(startKmh) * FIXED_STEP;
            }
            if (jump.airborne) {
                jump.airFrames += 1;
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
            if (!state.tricksOnly && !state.loveEvent) updatePoliceChase(endKmh, dt);
            if (!IS_V2) {
                state.trick.spin = state.trick.active ? state.trick.spin + dt * 7.5 : 0;
                bikeGroup.rotation.z += state.trick.spin;
            }
            if (jump.hop) {
                jump.hop.y += jump.hop.vy;
                jump.hop.vy -= JUMP.gravity;
                if (jump.hop.y <= 0 || jump.airborne) {
                    if (!jump.airborne) audio.play('landing', { volume: 0.3 });
                    jump.hop = null;
                }
            }
            jump.visualY = jump.airborne ? jump.y
                : Math.max(rampHeightAt(bikeGroup.position.x, bikeGroup.position.z), jump.hop ? jump.hop.y : 0);
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
            // The Love&Faith event: its own things on the road (no ramps,
            // no obstacles). Only spawn obstacles in linear mode.
            if (GAME_SETTINGS.gameMode === 'linear' && state.loveEvent) {
                loveEvent?.spawn(newZ, newZ + 100);
            } else if (GAME_SETTINGS.gameMode === 'linear') {
                // From about 20 s on, one block in two gets a ramp. In phase 3
                // fewer ramps: each one clears ~300 m of obstacles, which left
                // "figures + obstacles" almost without obstacles.
                const rampChance = state.tricksOnly ? 0.7 : state.frame >= JUMP.groundTricksFrom - 240 ? 0.25 : 0.5;
                const rampZ = newZ + 20 + Math.random() * 60;
                if (state.frame >= rampsFrom() && Math.random() < rampChance && !inQuietZone(rampZ)) spawnRamp(rampZ);
                state.rampFreeZones = state.rampFreeZones.filter((zone) => zone.to < bikeGroup.position.z);
                // More of them as the score climbs (SCORE_DIFFICULTY).
                const level = scoreDifficulty();
                const extra = extraPhase();
                const tries = extra ? extra.tries : Math.round(lerpBy(SCORE_DIFFICULTY.tries, level));
                // A word at each quarter of the way up.
                const step = Math.floor(level * 4 + 1e-9);
                if (step > (state.difficultyStep || 0)) {
                    state.difficultyStep = step;
                    toast('ÇA SE CORSE', step === 4 ? `Plus d’obstacles · phase 4 à ${EXTRA_PHASES[0].from.toLocaleString('fr-FR')} pts` : 'Plus d’obstacles', { discreet: true, float: true });
                }
                for (let i = 0; i < tries; i++) {
                    // Difficulty-based spawning
                    let spawnChance = 0.3; // Easy default
                    if (GAME_SETTINGS.difficulty === 'medium') spawnChance = 0.6;
                    if (GAME_SETTINGS.difficulty === 'hard') spawnChance = 0.9;
                    spawnChance = Math.min(1, spawnChance + SCORE_DIFFICULTY.chance * level + (extra ? extra.chance : 0));

                    const z = newZ + Math.random() * 100;
                    // Fewer while they come back (phase 3).
                    if (Math.random() < spawnChance * obstacleDensity(z)) {
                        if (obstaclesAllowed() && !inQuietZone(z) && !state.rampFreeZones.some((zone) => z <= zone.from && z >= zone.to) &&
                            obstacleRoomAt(z)) {
                            if (extra && Math.random() < extra.pairs) spawnPair(z);
                            else spawnObstacle(z);
                        }
                    }
                }
            }
        }

        // Only check collisions in linear mode
        if (GAME_SETTINGS.gameMode === 'linear') {
            guardEdges();
            checkCollisions();
            if (state.loveEvent && state.isPlaying) loveEvent?.step(dt);
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
    if (liveRecording) liveRecordFrame();
    const snapshot = visualSnapshot();
    audio.update(elapsed, snapshot);
    if (GAME_SETTINGS.gameMode === 'free' && v2) updateIdleVoice(elapsed);
    if (v2) {
        if (!speedLines) speedLines = createSpeedLines();
        const free = GAME_SETTINGS.gameMode === 'free';
        const boosting = free ? v2.roam.boostState().active || (v2.roam.jetState?.boost || 0) > 0.4 : state.boost.frames > 0;
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
    const smooth = GAME_SETTINGS.gameMode === 'linear' && renderFrom.valid && bikeGroup && !(import.meta.env.DEV && window.__noSmooth)
        && Math.abs(bikeGroup.position.z - renderFrom.z) < 30 && Math.abs(bikeGroup.position.x - renderFrom.x) < 5;
    if (smooth) {
        const k = Math.max(0, Math.min(1, simulationAccumulator / FIXED_STEP));
        renderAt.x = bikeGroup.position.x;
        renderAt.y = bikeGroup.position.y;
        renderAt.z = bikeGroup.position.z;
        bikeGroup.position.set(renderFrom.x + (renderAt.x - renderFrom.x) * k, renderFrom.y + (renderAt.y - renderFrom.y) * k,
            renderFrom.z + (renderAt.z - renderFrom.z) * k);
    }
    renderScene(elapsed, snapshot);
    if (smooth) bikeGroup.position.set(renderAt.x, renderAt.y, renderAt.z);
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
        if (roamMode === 'jet') fovBoost += (v2.roam.jetState?.boost || 0) * 12;
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
            heightOffset = 2.5 + target.y;
        } else if (roamMode === 'jet') {
            // Behind and above the jetpack, further back the faster it goes.
            const jet = v2.roam.jetState || { speed: 0, boost: 0 };
            distanceOffset = 5.2 + Math.abs(jet.speed) * 0.05 + jet.boost * 1.3;
            heightOffset = target.y + 2.4 - Math.min(1.2, Math.abs(jet.speed) * 0.02);
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
        // Turned by hand: riding again (or flying), it comes back behind.
        const orbitNow = performance.now() / 1000;
        const moving = roamMode !== 'walk' && kmh > 8;
        if (v2 && freeOrbit.pointer === null && moving && orbitNow - freeOrbit.lastDrag > FREE_ORBIT.wait) {
            const k = Math.min(1, FREE_ORBIT.back / 60);
            freeOrbit.yaw -= freeOrbit.yaw * k;
            freeOrbit.pitch -= freeOrbit.pitch * k;
        }
        const tilt = v2 ? freeOrbit.pitch : 0;
        heightOffset += distanceOffset * Math.max(0, tilt) * 0.9 + Math.min(0, tilt) * (heightOffset - target.y - 0.6);
        distanceOffset *= 1 - Math.max(0, tilt) * 0.22;
        let targetX = target.x;
        let targetZ = target.z + distanceOffset;
        const targetY = heightOffset;
        let lookX = target.x;
        let lookZ = target.z - 8;
        if (v2 && roamMode === 'walk') {
            // On foot: the view looks along -z, turned by hand round him.
            const yaw = Math.PI + freeOrbit.yaw;
            targetX = target.x - Math.sin(yaw) * distanceOffset;
            targetZ = target.z - Math.cos(yaw) * distanceOffset;
            lookX = target.x + Math.sin(yaw) * 8;
            lookZ = target.z + Math.cos(yaw) * 8;
        }
        if (v2 && roamMode !== 'walk') {
            // Riding or driving: behind the vehicle, turning with it.
            const heading = roamMode === 'car' ? v2.roam.carYaw : roamMode === 'glide' ? v2.roam.glideYaw : roamMode === 'jet' ? v2.roam.jetYaw : bikeGroup.rotation.y;
            if (freeCamYaw === null) freeCamYaw = heading;
            let turn = heading - freeCamYaw;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            freeCamYaw += turn * (roamMode === 'jet' ? 0.11 : 0.08);
            const yaw = freeCamYaw + freeOrbit.yaw;
            targetX = target.x - Math.sin(yaw) * distanceOffset;
            targetZ = target.z - Math.cos(yaw) * distanceOffset;
            lookX = target.x + Math.sin(yaw) * 8;
            lookZ = target.z + Math.cos(yaw) * 8;
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

        // Quicker while the finger turns it.
        const follow = freeOrbit.pointer !== null ? 0.3 : 0.12;
        camera.position.x += (targetX - camera.position.x) * follow;
        camera.position.z += (targetZ - camera.position.z) * follow;
        camera.position.y += (targetY - camera.position.y) * follow;
        // Road buzz at speed.
        const buzz = v2 && roamMode !== 'walk' ? Math.max(0, Math.min(1, (kmh - 100) / 60)) : 0;
        if (buzz > 0) {
            camera.position.x += (Math.random() - 0.5) * 0.05 * buzz;
            camera.position.y += (Math.random() - 0.5) * 0.04 * buzz;
        }
        if (roamMode === 'jet' && v2.roam.jetState?.boost > 0.3) {
            // Turbo: the air shakes.
            const shake = v2.roam.jetState.boost * 0.06;
            camera.position.x += (Math.random() - 0.5) * shake;
            camera.position.y += (Math.random() - 0.5) * shake;
        }
        camera.lookAt(lookX, roamMode === 'glide' ? target.y + 0.5 : roamMode === 'jet' ? target.y + 1 : roamMode === 'walk' ? 1.25 + target.y : 1, lookZ);
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
        // A jump lifts the bike several metres: the camera rises with it
        // (V2: the bike as drawn, between two physics steps).
        const lift = IS_V2 ? bikeGroup.position.y : state.jump.visualY;
        const targetY = (isMobileDevice ? (IS_V2 ? 4 : 3.5) : 4.5) + lift * 0.6;

        // Eased by the time since the last frame (as at 60 images a second,
        // whatever the screen draws).
        const ease = (rate) => 1 - Math.pow(1 - rate, cameraDt * 60);
        camera.position.x += (bikeGroup.position.x - camera.position.x) * ease(0.1) + shakeX;
        // Catch up faster during jumps and stunts so the trick can be seen.
        const followRate = state.jump.airborne || state.trick.active ? 0.35 : 0.15;
        if (IS_V2) {
            // V2: the camera keeps a distance behind the drawn bike, and that
            // distance eases with time: the same steady picture whatever the
            // frame rate (it used to follow frame by frame, and jerked when
            // frames came unevenly). At speed the bike pulls a little ahead,
            // as much as before (the old lag grew to ~17 m at 150 km/h).
            const pullAhead = 0.1 * Math.max(0, state.speed) / -Math.log(1 - followRate);
            if (cameraGap === null || lastCameraBikeZ === null) cameraGap = camera.position.z - bikeGroup.position.z;
            lastCameraBikeZ = bikeGroup.position.z;
            cameraGap += (distanceOffset + pullAhead - cameraGap) * ease(followRate);
            camera.position.z = bikeGroup.position.z + cameraGap;
        } else {
            camera.position.z += (targetZ - camera.position.z) * ease(followRate);
        }
        camera.position.y += (targetY - camera.position.y) * ease(0.1) + shakeY;

        // Look slightly ahead of the bike
        camera.lookAt(bikeGroup.position.x, 2 + lift * 0.5, bikeGroup.position.z - 20);
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
    const freeTricks = state.isPlaying && GAME_SETTINGS.gameMode === 'free' && !!v2 && v2.roam.mode === 'bike' && freeTricksUnlocked();
    const available = freeTricks || (state.isPlaying && GAME_SETTINGS.gameMode === 'linear' && state.frame >= JUMP.rampsFrom);
    const ready = freeTricks || state.jump.airborne || (state.frame >= JUMP.groundTricksFrom && state.bike.angle < JUMP.groundTrickMaxAngle);
    if (button) {
        if (button.hidden === available) button.hidden = !available;
        // Free roam: its own place (the action pad is where it usually is).
        button.classList.toggle('ui-pad--free', freeTricks);
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

// What free roam counts (src/v2/freeroam.js, police.js).
document.addEventListener('wheelie:stat', (event) => {
    if (event.detail?.name) bumpStat(event.detail.name);
});

// Free roam: the police's last warning (a wheelie in front of them): the
// seconds left to put the front wheel down.
document.addEventListener('wheelie:police-warn', (event) => {
    const { seconds = null, down = false } = event.detail || {};
    let banner = document.getElementById('ui-police-warn');
    if (seconds === null) {
        if (banner) banner.hidden = true;
        return;
    }
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'ui-police-warn';
        (document.getElementById('ui-layer') || document.body).append(banner);
    }
    banner.hidden = false;
    banner.classList.toggle('is-ok', !!down);
    banner.innerHTML = `<b>🚨 ${down ? 'ROUE AU SOL : GARDE-LA' : 'ROUE AVANT AU SOL !'}</b><span>${Math.ceil(seconds)} s</span>`;
});

// Free roam: the jetpack's pad, and its fuel (the cumulative points).
function updateJetHud() {
    const roaming = !!v2 && state.isPlaying && GAME_SETTINGS.gameMode === 'free';
    const mode = roaming ? v2.roam.mode : null;
    document.body.classList.toggle('ui-roam', roaming);
    document.body.classList.toggle('ui-jet', mode === 'jet');
    const pad = document.getElementById('analog-jet');
    if (pad) {
        pad.hidden = !roaming || mode === 'car' || mode === 'glide' || roamFall.active || v2.roam.frozen || (mode !== 'jet' && !jetUnlocked());
        const label = pad.querySelector('.ui-pad__label');
        if (label) label.textContent = mode === 'jet' ? 'ATTERRIR' : 'JETPACK';
    }
    let gauge = document.getElementById('ui-jet-fuel');
    const jet = mode === 'jet' ? v2.roam.jetState : null;
    if (!jet) {
        if (gauge) gauge.hidden = true;
        return;
    }
    if (!gauge) {
        gauge = document.createElement('div');
        gauge.id = 'ui-jet-fuel';
        (document.getElementById('ui-layer') || document.body).append(gauge);
    }
    gauge.hidden = false;
    gauge.classList.toggle('is-turbo', jet.boost > 0.4);
    gauge.classList.toggle('is-out', !!jet.out);
    gauge.innerHTML = `<b>⛽ ${totalPoints().toLocaleString('fr-FR')}</b><span>${jet.out ? 'PANNE SÈCHE' : jet.boost > 0.4 ? 'TURBO −30 pts/s' : '−10 pts/s'} · ${Math.round(Math.abs(jet.speed) * 3.6)} km/h · ${Math.round(jet.height)} m</span>`;
}

function updateUI() {
    updateJetHud();
    updateTrickButton();
    updatePoliceMap();
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
    flipMode: readSetting('wheelie_flip_mode') === 'manual' ? 'manual' : 'auto',
    // Custom controls: the stick (and the pads where the player put them)
    // with the rules of the arrows; the stick gives this share of the throttle.
    customControls: false,
    stickThrottle: Math.max(0.3, Math.min(1, Number(readSetting('wheelie_stick_throttle')) || 0.5)),
    // The rider pulls the bike up when the front lifts (seen only).
    liftAnimation: readSetting('wheelie_lift_animation') !== 'off',
    // Automatic rear brake on a wheelie about to go over: '50' (up to
    // 50 km/h), 'always' or 'off'.
    autoBrake: ['50', 'always', 'off'].includes(readSetting('wheelie_auto_brake')) ? readSetting('wheelie_auto_brake') : '50'
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

// The list of sounds, asked again twice if the network hiccups (one failure
// used to leave the whole visit silent).
async function fetchAudioManifest() {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch('/audio/manifest.json');
            if (!response.ok) throw new Error(`Audio manifest request failed: ${response.status}`);
            return await response.json();
        } catch (error) {
            if (attempt >= 3) throw error;
            await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        }
    }
}

function getAudioManifest() {
    if (!audioManifestPromise) {
        audioManifestPromise = fetchAudioManifest()
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

// The AI voices: off in the Love&Faith event unless asked for there.
const eventVoices = () => !state.loveEvent || !!loveEvent?.voices();
function speak(eventName, { force = false, allowWhenStopped = false } = {}) {
    if (GAME_SETTINGS.gameMode === 'free' && !FREE_ROAM_EVENTS.has(eventName)) return;
    if (!eventVoices()) return;
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

    if (GAME_SETTINGS.controlMode === 'arrows' && !IS_V2) {
        mobileControls.style.display = 'block';
        arrowControls.style.display = 'block';
        analogControls.style.display = 'none';
    } else if (GAME_SETTINGS.controlMode === 'analog' || GAME_SETTINGS.controlMode === 'arrows') {
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

// Arrows (new version): two pads where the stick is, the other pads as they are.
const ARROW_ICON = (d) => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
function ensureArrowPads() {
    const analog = document.getElementById('analog-controls');
    if (!analog || document.getElementById('pad-left')) return;
    analog.insertAdjacentHTML('beforeend',
        `<button class="action-btn ui-pad ui-pad--arrow" id="pad-left" type="button" aria-label="Gauche">${ARROW_ICON('M15.5 4 7.5 12l8 8 1.8-1.8L11.1 12l6.2-6.2z')}</button>` +
        `<button class="action-btn ui-pad ui-pad--arrow" id="pad-right" type="button" aria-label="Droite">${ARROW_ICON('M8.5 4 6.7 5.8l6.2 6.2-6.2 6.2L8.5 20l8-8z')}</button>`);
}

function setupAnalogControls() {
    ensureArrowPads();
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
        'analog-run': 'run',
        'pad-left': 'left',
        'pad-right': 'right'
    };
    document.getElementById('analog-action')?.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        roamAction();
    });
    document.getElementById('analog-jet')?.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        roamJet();
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

function applyResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Redraw for the new size (the game loop does it while a run is on).
    if (bikeGroup && !state.isPlaying && !(v2 && v2.rider.crashing)) {
        if (v2) v2.frame(0, visualSnapshot());
        else updateCamera();
        renderer.render(scene, camera);
    }
}

// Turning the phone: iOS sends several resizes while it turns, each one
// reallocating the whole picture (memory the phone may not have: the page
// is then reloaded, the run lost). One resize once it has settled. A run
// in progress pauses: the screen moves under the fingers mid-ride.
let resizeTimer = 0;
let wasLandscape = window.innerWidth > window.innerHeight;
window.addEventListener('resize', () => {
    const landscape = window.innerWidth > window.innerHeight;
    if (landscape !== wasLandscape) {
        wasLandscape = landscape;
        if (state.isPlaying && !state.userPaused) {
            pauseGame();
            state.turns = (state.turns || 0) + 1;
            noteLiveRun();
            logEvent('Téléphone tourné pendant une partie : pause', { landscape, seconds: Math.round(state.gameTime) });
        }
    }
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyResize, 150);
});

// A tap that opens a screen must not also press the button that appears
// under the finger (JOUER then MODE LIBRE, a death then MENU): a screen's
// buttons ignore clicks for a moment after it shows up.
const SCREEN_TAP_GUARD_MS = 350;
// The game-over screen comes while fingers still hammer the controls.
const guardFor = (screen) => (screen.id === 'game-over-screen' ? GAME_OVER_TAP_GUARD_MS : SCREEN_TAP_GUARD_MS);
const screenShownAt = new WeakMap();
const screenObserver = new MutationObserver((mutations) => {
    for (const { target } of mutations) {
        const active = target.classList.contains('active');
        if (active && !target.dataset.wasActive) screenShownAt.set(target, performance.now());
        target.dataset.wasActive = active ? '1' : '';
    }
});
document.querySelectorAll('.screen').forEach((screen) => screenObserver.observe(screen, { attributes: true, attributeFilter: ['class'] }));
document.addEventListener('click', (event) => {
    const screen = event.target.closest?.('.screen');
    const shownAt = screen ? screenShownAt.get(screen) : undefined;
    if (shownAt !== undefined && performance.now() - shownAt < guardFor(screen) && event.isTrusted) {
        event.stopPropagation();
        event.preventDefault();
    }
}, true);

// Safari on iPhone ignores user-scalable=no: no zoom from a double tap
// (fast taps on the controls) or a pinch.
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
    const now = event.timeStamp;
    if (now - lastTouchEnd < 320 && !event.target.closest?.('input, textarea, select')) event.preventDefault();
    lastTouchEnd = now;
}, { passive: false });

document.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.code === 'ArrowLeft' || e.code === 'KeyQ') state.keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') state.keys.right = true;
    if (e.code === 'ArrowUp' || e.code === 'KeyZ') state.keys.up = true;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') state.keys.down = true;

    if (e.code === 'KeyF' || e.code === 'KeyE') state.keys.trick = true;
    if (e.code === 'KeyG' && !e.repeat) roamAction();
    if (e.code === 'KeyJ' && !e.repeat) roamJet();
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
document.getElementById('btn-cat-appearance')?.addEventListener('click', () => showSubmenu('submenu-appearance'));
document.getElementById('btn-cat-version')?.addEventListener('click', () => showSubmenu('submenu-version'));

function syncAppearanceUI(version = getUIVersion()) {
    const modern = version === 'modern';
    document.getElementById('ui-theme-modern')?.classList.toggle('active', modern);
    document.getElementById('ui-theme-classic')?.classList.toggle('active', !modern);
    const desc = document.getElementById('ui-theme-desc');
    if (desc) {
        desc.textContent = modern
            ? 'Interface Moderne 51 : Boutique 51 repensée et commandes Carbon Fiber 3D.'
            : 'Interface Classique : apparence originale conservée à l’identique.';
    }
}
document.getElementById('ui-theme-modern')?.addEventListener('click', () => setUIVersion('modern'));
document.getElementById('ui-theme-classic')?.addEventListener('click', () => setUIVersion('classic'));
subscribeUITheme(syncAppearanceUI);
syncAppearanceUI();
// Rider screen: the rider is shown turning while the look is changed.
document.getElementById('rider-btn')?.addEventListener('click', () => {
    document.getElementById('start-screen')?.classList.remove('active');
    document.getElementById('rider-screen')?.classList.add('active');
    if (v2) v2.showroom(true);
    shopUI?.onRiderOpen();
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
    if (label) label.innerText = IS_V2 ? '51 Games - New Version (beta)' : '51 Games - V1.0 Classique';
    const board = document.getElementById('leaderboard-version');
    if (board) board.innerText = IS_V2 ? 'NEW VERSION (BETA)' : 'VERSION 1 · CLASSIQUE';
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

// Control types: 'analog' (the default: the stick, the bavette as it first
// was), 'arrows' (left / right, the gas button), 'custom' (the stick at the
// share of throttle chosen, the pads where the player put them). Arrows and
// custom play the firmer bavette (rules 5).
const CONTROL_TEXT = {
    analog: 'Joystick : il fait accélérer à fond, la bavette comme avant.',
    arrows: 'Gauche / droite pour les obstacles, GAZ pour accélérer à fond. WHEELIE seul donne un petit coup de gaz pour lever la roue. Bavette : pas de GAZ à fond dessus.',
    custom: 'Joystick à la part d’accélération choisie, GAZ à fond, les boutons où tu veux. Bavette : pas de GAZ à fond dessus.'
};
function setControls(type, { save = true } = {}) {
    const kind = ['analog', 'arrows', 'custom'].includes(type) ? type : 'analog';
    GAME_SETTINGS.controlMode = kind === 'arrows' ? 'arrows' : 'analog';
    GAME_SETTINGS.customControls = kind === 'custom';
    if (save) {
        try {
            localStorage.setItem('wheelie_controls', kind);
        } catch {
            // Kept for this visit.
        }
    }
    for (const name of ['analog', 'arrows', 'custom']) {
        document.getElementById(`control-${name}`)?.classList.toggle('active', name === kind);
    }
    const desc = document.getElementById('control-desc');
    if (desc) desc.textContent = CONTROL_TEXT[kind];
    const throttleRow = document.getElementById('custom-throttle-row');
    if (throttleRow) throttleRow.hidden = kind !== 'custom';
    document.body.classList.toggle('controls-arrows', kind === 'arrows' && IS_V2);
    applyPadLayout(kind === 'custom' && IS_V2);
}
document.getElementById('control-analog')?.addEventListener('click', () => setControls('analog'));
document.getElementById('control-arrows')?.addEventListener('click', () => setControls('arrows'));
document.getElementById('control-custom')?.addEventListener('click', () => setControls('custom'));
document.getElementById('control-layout')?.addEventListener('click', () => {
    if (!IS_V2) {
        toast('PERSONNALISER LES TOUCHES', 'Disponible dans la New Version (beta)', { discreet: true, float: true });
        return;
    }
    // Editing the pads is the custom controls.
    setControls('custom');
    settingsScreen?.classList.remove('active');
    openPadEditor({
        onClose: () => {
            settingsScreen?.classList.add('active');
            setControls('custom');
        }
    });
});
const customThrottle = document.getElementById('custom-throttle');
function showStickThrottle() {
    const value = Math.round(GAME_SETTINGS.stickThrottle * 100);
    if (customThrottle) customThrottle.value = String(value);
    const output = document.getElementById('custom-throttle-value');
    if (output) output.textContent = `${value} %`;
}
customThrottle?.addEventListener('input', () => {
    GAME_SETTINGS.stickThrottle = Math.max(0.3, Math.min(1, Number(customThrottle.value) / 100));
    try {
        localStorage.setItem('wheelie_stick_throttle', String(GAME_SETTINGS.stickThrottle));
    } catch {
        // Kept for this visit.
    }
    showStickThrottle();
});
showStickThrottle();

// Wheeling aids: the lift animation, the automatic rear brake.
const AUTOBRAKE_TEXT = {
    '50': 'Jusqu’à 50 km/h, un wheeling qui allait passer par-dessus est rattrapé au frein arrière (le bouton FREIN clignote). Au pas, le pilote descend à côté de la moto puis remonte. Ces scores portent l’icône 🛟 sur la page du classement.',
    always: 'À toute vitesse, un wheeling qui allait passer par-dessus est rattrapé au frein arrière. Ces scores portent l’icône 🛟 sur la page du classement.',
    off: 'Pas d’aide : un wheeling trop haut fait tomber.'
};
function showWheelieAids() {
    const lift = document.getElementById('option-lift-anim');
    if (lift) {
        lift.textContent = `🏋️ ANIMATION WHEELING : ${GAME_SETTINGS.liftAnimation ? 'ON' : 'OFF'}`;
        lift.classList.toggle('active', GAME_SETTINGS.liftAnimation);
    }
    for (const value of ['50', 'always', 'off']) {
        document.getElementById(`autobrake-${value}`)?.classList.toggle('active', GAME_SETTINGS.autoBrake === value);
    }
    const desc = document.getElementById('autobrake-desc');
    if (desc) desc.textContent = AUTOBRAKE_TEXT[GAME_SETTINGS.autoBrake];
}
document.getElementById('option-lift-anim')?.addEventListener('click', () => {
    GAME_SETTINGS.liftAnimation = !GAME_SETTINGS.liftAnimation;
    try {
        localStorage.setItem('wheelie_lift_animation', GAME_SETTINGS.liftAnimation ? 'on' : 'off');
    } catch {
        // Kept for this visit.
    }
    showWheelieAids();
});
for (const value of ['50', 'always', 'off']) {
    document.getElementById(`autobrake-${value}`)?.addEventListener('click', () => {
        GAME_SETTINGS.autoBrake = value;
        try {
            localStorage.setItem('wheelie_auto_brake', value);
        } catch {
            // Kept for this visit.
        }
        showWheelieAids();
    });
}
showWheelieAids();

document.getElementById('mode-linear').addEventListener('click', () => {
    GAME_SETTINGS.gameMode = 'linear';
    document.getElementById('mode-linear').classList.add('active');
    document.getElementById('mode-free').classList.remove('active');
    // Descriptions some layouts do not have.
    document.getElementById('desc-linear')?.style.setProperty('display', 'inline');
    document.getElementById('desc-free')?.style.setProperty('display', 'none');
    // Remettre l'emoji souffle pour le mode linéaire
    const gasEmoji = document.getElementById('gas-emoji');
    if (gasEmoji) gasEmoji.innerText = '💨';
});

document.getElementById('mode-free').addEventListener('click', () => {
    GAME_SETTINGS.gameMode = 'free';
    document.getElementById('mode-free').classList.add('active');
    document.getElementById('mode-linear').classList.remove('active');
    document.getElementById('desc-linear')?.style.setProperty('display', 'none');
    document.getElementById('desc-free')?.style.setProperty('display', 'inline');
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

// No fullscreen for pages on iPhone: no button that does nothing.
if (!fullscreenAvailable()) document.getElementById('fullscreen-btn')?.style.setProperty('display', 'none');
document.getElementById('fullscreen-btn')?.addEventListener('click', async () => {
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
        }
        if (!(await requestFullscreen())) return;
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
// What the player is doing now (the sessions page, the stats page).
const MENU_ACTIVITIES = {
    'leaderboard-screen': 'menu-leaderboard', 'trophy-screen': 'menu-trophies', 'rider-screen': 'menu-rider',
    'settings-screen': 'menu-settings', 'pose-screen': 'menu-poses', 'game-over-screen': 'menu-gameover'
};
function currentActivity() {
    const inLive = live?.activity();
    if (inLive) return inLive;
    if (state.isPlaying) {
        if (state.userPaused) return 'menu-pause';
        if (GAME_SETTINGS.gameMode === 'free') return v2 ? `free-${v2.roam.mode}` : 'free-bike';
        return state.loveEvent ? 'love-event' : state.tricksOnly ? 'tricks' : 'competitive';
    }
    return MENU_ACTIVITIES[document.querySelector('.screen.active')?.id] || 'menu';
}
function sendPresence() {
    if (document.hidden) return;
    const mode = !state.isPlaying ? 'menu' : GAME_SETTINGS.gameMode === 'free' ? 'free' : 'competitive';
    apiFetch(`${API_BASE_URL}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: presenceId, nickname: localStorage.getItem('wheelie_nickname') || undefined, mode,
            version: IS_V2 ? 'v2' : 'v1', score: state.isPlaying && mode === 'competitive' ? Math.floor(state.score) : undefined,
            activity: currentActivity(), open_seconds: Math.round(performance.now() / 1000)
        })
    }, 6000).catch(() => {});
}
function startPresence() {
    clearInterval(presenceTimer);
    sendPresence();
    presenceTimer = setInterval(sendPresence, 30000);
}
// From the menu on (not only once a run has started).
setTimeout(startPresence, 5000);
// The owner's stats (API /stats): what is used, for how long.
startActivity({
    version: IS_V2 ? 'v2' : 'v1',
    current: currentActivity,
    send: (body, keepalive) => apiFetch(`${API_BASE_URL}/activity`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive, body: JSON.stringify(body)
    }, 8000).catch(() => {})
});
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

// `resume`: taking up a run the phone cut short (see offerResume). The
// server refuses it (409) when it is too late or already taken up: then a
// new run, and `resume.refused`.
async function createWheelieRun(resume = null) {
    const response = await apiFetch(`${API_BASE_URL}/wheelie-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            difficulty: GAME_SETTINGS.difficulty, version: IS_V2 ? 'v2' : 'v1', nickname: localStorage.getItem('wheelie_nickname') || undefined,
            human_pass: storedPass() || undefined, human_check: 1,
            resume_token: resume && !resume.refused ? resume.token : undefined
        })
    });
    if (response.status === 409 && resume && !resume.refused) {
        resume.refused = true;
        logEvent('Reprise de partie refusée');
        return createWheelieRun(resume);
    }

    if (response.status === 403) {
        // No pass, or an expired one: the human check comes first.
        const data = await response.json().catch(() => ({}));
        const check = data && data.human_check;
        // The Cloudflare box (site key), or the home-made check (challenge).
        if (check && (check.sitekey || (check.mode === 'home' && check.challenge))) {
            forgetPass();
            lastSessionError = HUMAN_CHECK_SKIPPED;
            throw new HumanCheckRequired(check);
        }
    }
    if (!response.ok) {
        lastSessionError = response.status === 429 ? 'trop de parties lancées en peu de temps' : `serveur de classement en erreur (${response.status})`;
        if (response.status === 429) report('ranking.rate_limited', 'Session classée refusée : trop de parties', { once: true });
        else logEvent('Session classée refusée', { status: response.status });
        throw new Error(`Impossible d’ouvrir une session classée (${response.status})`);
    }

    const data = await response.json();
    if (!data.run_token) throw new Error('L’API n’a pas fourni de jeton de partie');
    lastSessionError = null;
    if (resume && !resume.refused && Number.isInteger(data.base_score)) resume.base = data.base_score;
    return data.run_token;
}

// No session at the start (slow network, server waking up): keep asking for
// a while; the server accepts a session up to 30 s younger than the run.
let lastSessionError = null;
// Why a run is unranked when the player did not do the human check.
const HUMAN_CHECK_SKIPPED = 'vérification anti-robot non faite';
async function lateSession(sequence) {
    if (state.sessionError === HUMAN_CHECK_SKIPPED) return;
    for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (sequence !== crashSequence || !state.isPlaying || state.runToken) return;
        if (state.gameTime > 24) break;
        try {
            const token = await Promise.race([createWheelieRun(state.resume), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))]);
            if (sequence !== crashSequence || !state.isPlaying || state.gameTime > 26) return;
            state.runToken = token;
            settleResumeScore();
            state.rankedRunUnavailable = false;
            state.sessionError = null;
            return;
        } catch (error) {
            // The check cannot be shown during a ride: this one stays unranked.
            if (error instanceof HumanCheckRequired) {
                state.sessionError = HUMAN_CHECK_SKIPPED;
                return;
            }
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

    submitting = true;
    try {
        return await sendCompletedRun(nickname);
    } finally {
        submitting = false;
    }
}

async function sendCompletedRun(nickname) {
    const run = completedRankedRun;
    const inputLog = encodeInputLog(run.inputLog);
    // How the podium shows this player (V2).
    const look = v2 ? v2.podiumLook() : undefined;
    let codeAsked = 0;
    setRankingStatus('Envoi du score…');
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await apiFetch(`${API_BASE_URL}/wheelie-sessions/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    run_token: run.runToken, nickname, input_log: inputLog, flip_mode: run.flipMode, plate: run.plate, rules: run.rules, look,
                    // A protected nickname: this device's token (src/account.js).
                    device_token: deviceToken(nickname)
                })
            }, 10000);
            if (response.status === 403) {
                const refusal = await response.clone().json().catch(() => ({}));
                if (refusal.account === 'code_required') {
                    // The session is not used up: once the password is
                    // given, the same run is sent again.
                    if (codeAsked < 2 && await account.askCode('Ce pseudo est protégé par un mot de passe. Entre-le pour classer ce score (cet appareil sera reconnu ensuite).', nickname)) {
                        codeAsked += 1;
                        attempt -= 1;
                        setRankingStatus('Envoi du score…');
                        continue;
                    }
                    setRankingStatus('Score non classé : ce pseudo est protégé par un mot de passe.');
                    completedRankedRun = null;
                    return false;
                }
            }
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
                    token: run.runToken, nickname, log: encodeInputLog(run.inputLog), at: Date.now(), flipMode: run.flipMode, plate: run.plate, rules: run.rules
                });
                setRankingStatus('Score en attente : il sera envoyé dès que le serveur répond (' + error.message + ').');
                return false;
            }
            await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        }
    }
    return false;
}

// Checkpoints: during a ranked run, once the score is worth keeping, the
// replay since the last one goes to the server every 10 s, and when the page
// is hidden. The server replays it and, with a nickname, the run is on the
// leaderboard at that score: a run cut short (phone out of memory, page
// reloaded, app closed) keeps what it reached. The final submission
// replaces it.
const CHECKPOINT = { everySeconds: 10, minScore: 100, minGapMs: 3500 };
let checkpoint = { token: null, sentFrames: 0, busy: false, at: 0, stopped: false };

function checkpointWanted() {
    return state.isPlaying && GAME_SETTINGS.gameMode === 'linear' && !!state.runToken && !state.tricksOnly
        && state.score >= CHECKPOINT.minScore && state.inputLog && !state.runReplayOverflow;
}

async function sendCheckpoint({ keepalive = false } = {}) {
    if (!checkpointWanted() || checkpoint.busy) return;
    const token = state.runToken;
    if (checkpoint.token !== token) checkpoint = { token, sentFrames: 0, busy: false, at: 0, stopped: false };
    if (checkpoint.stopped || Date.now() - checkpoint.at < CHECKPOINT.minGapMs) return;
    const frames = state.inputLog.length >> 1;
    const from = checkpoint.sentFrames;
    if (frames <= from) return;
    checkpoint.busy = true;
    checkpoint.at = Date.now();
    try {
        const response = await apiFetch(`${API_BASE_URL}/wheelie-sessions/checkpoint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive,
            body: JSON.stringify({
                run_token: token, nickname: localStorage.getItem('wheelie_nickname') || undefined,
                device_token: deviceToken(localStorage.getItem('wheelie_nickname')),
                offset: from, chunk: encodeInputLog(state.inputLog.slice(from * 2, frames * 2)),
                flip_mode: state.flipMode, plate: state.plate.on || state.plate.off, rules: state.rules,
                look: v2 && from === 0 ? v2.podiumLook() : undefined
            })
        }, 8000);
        if (checkpoint.token !== token) return;
        if (response.ok) {
            const data = await response.json().catch(() => ({}));
            checkpoint.sentFrames = frames;
            if (data.ranked && Number.isFinite(data.score)) checkpoint.savedScore = data.score;
            noteLiveRun();
        } else if (response.status === 409) {
            // A piece lost on the way: start again where the server is.
            const data = await response.json().catch(() => ({}));
            if (Number.isInteger(data.expected_offset)) checkpoint.sentFrames = Math.min(data.expected_offset, frames);
            else checkpoint.stopped = true;
        } else if (response.status === 401 || response.status === 422) {
            // The final submission will say why; no point sending more.
            checkpoint.stopped = true;
            report('ranking.checkpoint', `Point d’étape refusé (${response.status})`, {
                group: `checkpoint ${response.status}`, details: { status: response.status, frames, score: Math.floor(state.score) },
            });
        }
    } catch {
        // Offline for now: the next one carries this piece too.
    } finally {
        if (checkpoint.token === token) checkpoint.busy = false;
    }
}

// A run the page did not live to finish (phone out of memory after being
// turned, app closed, reload): noted on the phone while it goes, read at
// the next visit to tell the player what was kept, and Sentry how often.
const LIVE_RUN_KEY = 'wheelie_live_run';
function noteLiveRun() {
    if (!state.isPlaying || GAME_SETTINGS.gameMode !== 'linear' || state.tricksOnly || state.loveEvent) return;
    try {
        const saved = checkpoint.token === state.runToken ? checkpoint.savedScore || 0 : 0;
        localStorage.setItem(LIVE_RUN_KEY, JSON.stringify({
            score: Math.floor(state.score), saved,
            ranked: !!state.runToken, seconds: Math.round(state.gameTime), turns: state.turns || 0,
            landscape: window.innerWidth > window.innerHeight, at: Date.now(),
            // To take it up (once: not a run that was itself taken up).
            token: saved > 0 && !state.resume ? state.runToken : null,
            difficulty: GAME_SETTINGS.difficulty, version: IS_V2 ? 'v2' : 'v1', resumed: !!state.resume
        }));
    } catch {
        // No storage: nothing noted.
    }
}
function clearLiveRun() {
    try {
        localStorage.removeItem(LIVE_RUN_KEY);
    } catch {
        // No storage.
    }
}
function checkCutRun() {
    let run = null;
    try {
        run = JSON.parse(localStorage.getItem(LIVE_RUN_KEY) || 'null');
    } catch {
        run = null;
    }
    clearLiveRun();
    if (!run || Date.now() - run.at > 2 * 3600 * 1000 || run.score < 30) return;
    report('ranking.run_cut', `Partie coupée avant la fin : ${run.score} points (${run.saved} enregistrés)`, {
        level: run.score >= 300 && run.saved < run.score * 0.8 ? 'error' : 'warning',
        group: run.saved ? 'enregistrée' : 'perdue', details: run,
    });
    if (run.saved > 0 && canResume(run)) {
        // After the intro video, if it is still on.
        const offer = () => {
            const splash = document.getElementById('splash');
            if (splash && !splash.classList.contains('hidden')) setTimeout(offer, 400);
            else offerResume(run);
        };
        offer();
    } else if (run.saved > 0) {
        welcome('Ta dernière partie a été coupée', `Le téléphone a rechargé la page, mais ton score est enregistré au classement : ${run.saved} points.`);
    } else if (run.ranked) {
        welcome('Ta dernière partie a été coupée', `Le téléphone a rechargé la page avant que ton score (${run.score} points) puisse être enregistré.`);
    }
}
setTimeout(checkCutRun, 2500);

// Taking up a cut run: offered at the next visit when its score was saved
// (a checkpoint), within 25 minutes (the server allows 30 after the last
// checkpoint), once (not a run that was itself taken up). It starts again
// at that score (the difficulty that goes with it), after a supersonic
// start.
const RESUME = { withinMs: 25 * 60 * 1000, pauseMs: 1700, showMs: 2300 };
let pendingResume = null;
function canResume(run) {
    return !!run.token && !run.resumed && run.ranked && Date.now() - run.at < RESUME.withinMs
        && (run.version || 'v2') === (IS_V2 ? 'v2' : 'v1') && ['easy', 'medium', 'hard'].includes(run.difficulty);
}
let resumeDialog = null;
function offerResume(run) {
    if (state.isPlaying || startInProgress) return;
    report('ranking.resume_offered', `Reprise proposée : ${run.saved} points`, { level: 'info', once: true });
    if (!resumeDialog) {
        resumeDialog = document.createElement('div');
        resumeDialog.id = 'resume-dialog';
        resumeDialog.className = 'account-dialog';
        resumeDialog.setAttribute('role', 'dialog');
        resumeDialog.setAttribute('aria-modal', 'true');
        resumeDialog.setAttribute('aria-labelledby', 'resume-title');
        document.body.append(resumeDialog);
    }
    const points = run.saved.toLocaleString('fr-FR');
    resumeDialog.innerHTML = `<div class="account-card resume-card">
        <h2 id="resume-title">⚡ Partie coupée</h2>
        <p class="account-text">Le téléphone a rechargé la page pendant ta partie. Ton score est enregistré : <b>${points} points</b>.</p>
        <p class="account-text">Reprends-la : tu repars à ${points} points, avec la difficulté qui va avec. Une seule reprise par partie.</p>
        <button type="button" class="account-btn account-btn--primary resume-go">⚡ REPRENDRE À ${points} POINTS</button>
        <button type="button" class="account-btn account-btn--quiet resume-later">Non, garder mon score</button>
    </div>`;
    resumeDialog.hidden = false;
    resumeDialog.querySelector('.resume-later').addEventListener('click', () => {
        resumeDialog.hidden = true;
        logEvent('Reprise de partie déclinée');
    });
    resumeDialog.querySelector('.resume-go').addEventListener('click', () => {
        resumeDialog.hidden = true;
        if (state.isPlaying || startInProgress) return;
        // Too late meanwhile: the server says so, and it is a new run.
        pendingResume = { token: run.token, saved: run.saved };
        GAME_SETTINGS.difficulty = run.difficulty;
        GAME_SETTINGS.gameMode = 'linear';
        document.querySelectorAll('.screen.active').forEach((screen) => screen.classList.remove('active'));
        logEvent('Reprise de partie', { saved: run.saved });
        startGame();
    });
}

// The session came late (or the server's score differs from the one the
// phone had): the score follows the server's.
function settleResumeScore() {
    if (!state.resume) return;
    const base = state.resume.refused ? 0 : Number.isInteger(state.resume.base) ? state.resume.base : state.resumeBase;
    state.score = Math.max(0, state.score + base - state.resumeBase);
    state.resumeBase = base;
    if (state.resume.refused) state.resume = null;
}

// The supersonic start: the bike held still a moment (nothing recorded),
// a flash, the shock wave, the score counting up to where the run stopped,
// then off it goes.
function supersonicStart(score) {
    document.getElementById('supersonic')?.remove();
    const pauseHere = !GAME_SETTINGS.autoRace;
    if (pauseHere) state.isPaused = true;
    const layer = document.createElement('div');
    layer.id = 'supersonic';
    layer.className = 'supersonic';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<div class="supersonic__lines"></div><div class="supersonic__flash"></div>
        <div class="supersonic__ring"></div><div class="supersonic__ring supersonic__ring--late"></div>
        <div class="supersonic__text"><small>REPRISE</small><b>SUPERSONIQUE</b><span class="supersonic__score">0</span></div>`;
    document.body.append(layer);
    audio.play('whoosh', { volume: 0.8 });
    const counter = layer.querySelector('.supersonic__score');
    const started = performance.now();
    const count = (now) => {
        const k = Math.min(1, (now - started) / 1100);
        counter.textContent = Math.round(score * (1 - (1 - k) ** 3)).toLocaleString('fr-FR');
        if (k < 1 && layer.isConnected) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    setTimeout(() => audio.play('backfire', { volume: 0.9 }), 650);
    const sequence = crashSequence;
    setTimeout(() => {
        audio.play('boost', { volume: 0.8 });
        if (pauseHere && sequence === crashSequence && state.isPlaying) state.isPaused = false;
        layer.classList.add('supersonic--go');
    }, RESUME.pauseMs);
    setTimeout(() => layer.remove(), RESUME.showMs);
}

setInterval(() => {
    if (checkpointWanted() && Date.now() - checkpoint.at >= CHECKPOINT.everySeconds * 1000) sendCheckpoint();
    if (state.isPlaying && Math.round(state.gameTime) % 5 === 0) noteLiveRun();
}, 1000);
// Leaving the page (app switch, lock, tab closed): send what is there now.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        noteLiveRun();
        sendCheckpoint({ keepalive: true });
    }
});
window.addEventListener('pagehide', () => sendCheckpoint({ keepalive: true }));

// A tab left open across an update keeps the old game: its lazily loaded
// files are gone ("Importing a module script failed") and the server may
// expect more of it (the human check). Back on the main menu, with nothing
// in progress, it reloads into the new one.
const loadedBuild = document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') || null;
let submitting = false;
function safeToReload() {
    return !state.isPlaying && !startInProgress && !submitting
        && document.getElementById('start-screen')?.classList.contains('active')
        && document.getElementById('nickname-popup')?.style.display !== 'flex';
}
async function reloadIfUpdated() {
    if (!loadedBuild || !safeToReload()) return;
    try {
        const html = await (await fetch('/', { cache: 'no-store' })).text();
        const latest = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
        if (latest && !loadedBuild.endsWith(latest) && safeToReload()) {
            logEvent('Nouvelle version du jeu : rechargement', { from: loadedBuild, to: latest });
            location.reload();
        }
    } catch {
        // Offline: next time.
    }
}
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reloadIfUpdated();
});
setInterval(reloadIfUpdated, 5 * 60 * 1000);
// The service worker asks every open page whether it is a recent version
// (old ones do not answer, and are reloaded): this one is.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'wheelie:alive?' && event.ports && event.ports[0]) {
            event.ports[0].postMessage({ type: 'wheelie:alive' });
        }
    });
    navigator.serviceWorker.startMessages?.();
}
// A lazily loaded file of an older version missing: reload if nothing is lost.
window.addEventListener('vite:preloadError', (event) => {
    if (!state.isPlaying && !submitting) {
        event.preventDefault();
        location.reload();
    }
});

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
                flip_mode: entry.flipMode || 'auto', plate: !!entry.plate, device_token: deviceToken(entry.nickname),
                // A run kept by the game as it was before the rules changed.
                rules: entry.rules || 1
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
        // The day's leaderboard (since 5:50, French time) or of all time.
        const period = boardPeriod === 'day' ? '&period=day' : '';
        const url = `${API_BASE_URL}/leaderboard/${GAME_NAME}?skip=${skip}&limit=${limit}${period}`;
        // The server waking up can take a few seconds: once more, longer.
        const response = await apiFetch(url).catch(() => apiFetch(url, {}, 15000));

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
        // A protected nickname this device does not know: its password first.
        if (known && known.protected && !deviceToken(known.nickname)) {
            const given = await account.askCode('Ce pseudo est protégé par un mot de passe. Si c’est le tien, entre-le (cet appareil sera reconnu ensuite).', known.nickname);
            if (!given) {
                nicknameNote('Ce pseudo est protégé : choisis-en un autre, ou entre son mot de passe.');
                return;
            }
        }
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

function nicknameNote(text) {
    const input = document.getElementById('nickname-input');
    if (!input) return;
    let note = document.getElementById('nickname-note');
    if (!note) {
        note = document.createElement('p');
        note.id = 'nickname-note';
        note.style.cssText = 'color:#ffb4b4;font-size:14px;margin:-8px 0 14px;';
        input.after(note);
    }
    note.textContent = text;
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
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: wanted, device_token: deviceToken(current) })
        }, 8000);
        if (response.status === 403) return say('Ton pseudo est protégé : entre ton mot de passe dans Mon compte (en haut à droite du menu).');
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

    // Always there: it opens the account (no nickname yet: "Mon compte").
    if (nicknameDisplay && playerNickname) {
        nicknameDisplay.innerText = nickname || 'Mon compte';
        playerNickname.style.display = 'block';
    }
    account.refresh();
}

// The golden bird of the menu: tapped, the secret codes the player's points
// have revealed (src/secret-bird.js).
createSecretBird({ menu: document.getElementById('start-screen'), points: totalPoints, newVersion: IS_V2 });

// Account: top right of the menu (the nickname). Protect it with a password
// and an optional email; other devices then give the password once.
const account = createAccount({
    post: (path, payload) => apiFetch(`${API_BASE_URL}/account/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }, 9000),
    nickname: () => localStorage.getItem('wheelie_nickname'),
    // "Mes stats": the codes' own lines once the codes are revealed. The
    // same on every device of the player (src/profile.js): drawn at once,
    // again when the sync answers.
    stats: (container) => {
        // What the server knows of the player (games since the very first).
        let server = null;
        const nickname = localStorage.getItem('wheelie_nickname');
        const draw = () => {
            const holder = document.createElement('div');
            renderStats(holder, {
                points: totalPoints(), all: profileStats(), server,
                codes: { glider: IS_V2 && totalPoints() >= GLIDER_POINTS, tricks: totalPoints() >= TRICKS_CODE_POINTS }
            });
            const drawn = container.querySelector('.stats');
            if (drawn) drawn.replaceWith(...holder.childNodes);
            else container.prepend(...holder.childNodes);
        };
        draw();
        syncProfile({ force: true }).then((synced) => {
            if (synced && container.isConnected) draw();
        });
        if (nickname) {
            getPlayerStats(nickname).then((found) => {
                if (!found || !container.isConnected) return;
                server = found;
                draw();
            });
        }
    },
    onStatus: (status) => {
        const chip = document.getElementById('player-nickname');
        chip?.classList.toggle('is-protected', !!status?.protected && !!status?.trusted);
        chip?.classList.toggle('needs-code', !!status?.protected && !status?.trusted);
    }
});
(() => {
    const chip = document.getElementById('player-nickname');
    if (!chip) return;
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('aria-label', 'Mon compte');
    chip.classList.add('account-chip');
    chip.addEventListener('click', () => account.open());
    chip.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            account.open();
        }
    });
})();

// The player's profile on every device (src/profile.js): stats, points and
// what was bought. Synced at start, a moment after the points change (a
// run, a fine, a purchase), every two minutes, when the page is hidden and
// when the nickname changes.
configureProfile({
    post: (path, payload, keepalive) => {
        const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
        return keepalive ? fetch(`${API_BASE_URL}/${path}`, { ...init, keepalive: true }) : apiFetch(`${API_BASE_URL}/${path}`, init, 9000);
    },
    nickname: () => localStorage.getItem('wheelie_nickname'),
    deviceToken
});
setTimeout(() => syncProfile({ force: true }), 2500);
let profileTimer = null;
document.addEventListener('wheelie:points', (event) => {
    if (event.detail?.fromProfile) return;
    clearTimeout(profileTimer);
    profileTimer = setTimeout(() => syncProfile(), 5000);
});
document.addEventListener('wheelie:nickname', () => setTimeout(() => syncProfile({ force: true }), 300));
setInterval(() => {
    if (!document.hidden) syncProfile();
}, 120000);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) syncProfile({ keepalive: true });
});

// --- Session live (src/live/live.js) ---------------------------------------
// The rider's game records what it shows: a snapshot every LIVE_EVERY frames
// (frame, x, z, height, lean, wheelie angle, flip, speed, score, multiplier,
// flags, trick, sideways speed). The others play it back LIVE_DELAY frames
// late (it comes a second at a time), with the obstacles and ramps where
// the rider's game put them, the bonuses it showed, and the fall at the end.
const LIVE_EVERY = 6;
const LIVE_DELAY = 150;
const LIVE_FLAGS = { bavette: 1, boost: 2, skid: 4, plate: 8, air: 16, trick: 32, brake: 64, flip: 128 };

function liveRecordFrame() {
    if (state.frame - liveLastFrame < LIVE_EVERY) return;
    liveLastFrame = state.frame;
    const jump = state.jump;
    const r = (value, scale) => Math.round((value || 0) * scale) / scale;
    const flags = (state.bavette.left > 0 ? LIVE_FLAGS.bavette : 0) | (state.boost.frames > 0 ? LIVE_FLAGS.boost : 0)
        | (state.skidding ? LIVE_FLAGS.skid : 0) | (state.plate.on ? LIVE_FLAGS.plate : 0) | (jump.airborne ? LIVE_FLAGS.air : 0)
        | (state.trick.active ? LIVE_FLAGS.trick : 0) | (state.keys.down ? LIVE_FLAGS.brake : 0) | (jump.flipActive ? LIVE_FLAGS.flip : 0);
    const flip = jump.flipActive ? (state.flipMode === 'manual' ? state.bike.angle + jump.flipAngle : jump.flipAngle) : 0;
    live.recordFrame([state.frame, r(bikeGroup.position.x, 100), r(bikeGroup.position.z, 100), r(jump.visualY, 100), r(bikeGroup.rotation.z, 1000),
        r(state.bike.angle, 1000), r(flip, 1000), r(state.speed, 1000), Math.floor(state.score), r(state.currentMultiplier || 1, 100), flags,
        Math.max(0, AIR_TRICKS.indexOf(state.trick.type)), r(state.bike.lateralVelocity, 1000)]);
}

const spectator = {
    active: false, run: null, frames: [], spawns: [], marks: [], playhead: null, last: 0, raf: 0,
    result: null, crashAt: 0, crashed: false, done: false, audio: false
};

function hideRunControls() {
    for (const id of ['mobile-controls', 'analog-controls']) {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    }
}

// The street ahead of the watched bike (the game does it in its loop):
// built ahead, dropped behind; rebuilt round it after a jump.
function spectateGround() {
    const z = bikeGroup.position.z;
    const last = groundChunks[groundChunks.length - 1];
    if (!last || z < last.position.z - 300 || z > groundChunks[0].position.z + 300) {
        groundChunks.forEach(dropChunk);
        groundChunks = [];
        const start = Math.ceil(z / 100) * 100 + 100;
        for (let i = 0; i < 6; i++) {
            const chunk = makeChunk(start - i * 100);
            scene.add(chunk);
            groundChunks.push(chunk);
        }
        return;
    }
    while (z < groundChunks[groundChunks.length - 1].position.z + 200) {
        const chunk = makeChunk(groundChunks[groundChunks.length - 1].position.z - 100);
        scene.add(chunk);
        groundChunks.push(chunk);
        if (groundChunks.length > 6) {
            const old = groundChunks.shift();
            state.animatedObjects = state.animatedObjects.filter((object) => object.parent !== old);
            dropChunk(old);
        }
    }
}

function spectateStop() {
    if (v2) v2.wearLook(null);
    if (!spectator.active) return;
    spectator.active = false;
    cancelAnimationFrame(spectator.raf);
    if (spectator.audio) audio.stopRun();
    spectator.audio = false;
}

function spectateBegin(run, rider = null) {
    spectateStop();
    // The rider watched, as he really looks.
    if (v2 && rider) v2.wearLook({ ...(rider.look || {}), name: rider.name });
    // A fresh run's scene: nothing left from the last one, no fall playing.
    crashSequence++;
    if (v2) v2.podiumView(false);
    GAME_SETTINGS.gameMode = 'linear';
    resetGame();
    if (v2) v2.rider.reset();
    state.isPlaying = false;
    document.querySelectorAll('.screen.active').forEach((screen) => screen.classList.remove('active'));
    hideRunControls();
    Object.assign(spectator, { active: true, run, frames: [], spawns: [], marks: [], playhead: null, result: null, crashAt: 0, crashed: false, done: false });
    try {
        audio.prepare();
        audio.startRun();
        spectator.audio = true;
    } catch {
        spectator.audio = false;
    }
    spectator.last = performance.now();
    spectator.raf = requestAnimationFrame(spectateTick);
}

function spectatePush(batch) {
    for (const frame of batch.f || []) {
        if (!spectator.frames.length || frame[0] > spectator.frames[spectator.frames.length - 1][0]) spectator.frames.push(frame);
    }
    for (const item of batch.s || []) spectator.spawns.push(item);
    for (const item of batch.m || []) spectator.marks.push(item);
    // Kept short: what is far behind the playhead goes.
    if (spectator.frames.length > 400) spectator.frames.splice(0, spectator.frames.length - 400);
}

function spectateApply(a, b, k) {
    const mix = (i) => (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * k;
    const near = k < 0.5 ? a : b;
    const flags = near[10] || 0;
    bikeGroup.position.set(mix(1), mix(3), mix(2));
    bikeGroup.rotation.set(0, Math.PI, mix(4));
    state.bike.angle = mix(5);
    state.bike.lateralVelocity = mix(12);
    state.speed = mix(7);
    state.score = near[8] || 0;
    state.currentMultiplier = mix(9) || 1;
    state.jump.visualY = mix(3);
    state.jump.airborne = !!(flags & LIVE_FLAGS.air);
    state.jump.flipActive = !!(flags & LIVE_FLAGS.flip);
    state.bavette.left = flags & LIVE_FLAGS.bavette ? 10 : 0;
    state.boost.frames = flags & LIVE_FLAGS.boost ? 1 : 0;
    state.skidding = !!(flags & LIVE_FLAGS.skid);
    state.plate.on = !!(flags & LIVE_FLAGS.plate);
    state.trick.active = !!(flags & LIVE_FLAGS.trick);
    state.trick.type = AIR_TRICKS[near[11]] || 'superman';
    const flip = state.jump.flipActive ? mix(6) : 0;
    // V2: the flip turns the bike's pivot itself (its angle, not the wheelie's).
    if (v2) v2.rider.setFlip(flip);
    if (!v2 || !state.jump.flipActive) bikePivot.rotation.x = -(state.jump.flipActive ? flip : state.bike.angle);
}

function spectateTick(now) {
    if (!spectator.active) return;
    spectator.raf = requestAnimationFrame(spectateTick);
    const dt = Math.min(0.05, Math.max(0, (now - spectator.last) / 1000));
    spectator.last = now;
    const frames = spectator.frames;
    if (frames.length && !spectator.crashed) {
        const newest = frames[frames.length - 1][0];
        if (spectator.playhead === null) spectator.playhead = Math.max(frames[0][0], newest - LIVE_DELAY);
        // About LIVE_DELAY behind: a little faster when far behind, a little
        // slower when catching up; once the run is over, to its end.
        const lag = newest - spectator.playhead;
        if (lag > LIVE_DELAY * 5) spectator.playhead = newest - LIVE_DELAY;
        const rate = spectator.result ? 1.15 : lag > LIVE_DELAY * 1.6 ? 1.25 : lag > LIVE_DELAY * 1.15 ? 1.08 : lag < LIVE_DELAY * 0.35 ? 0.8 : 1;
        spectator.playhead = Math.min(newest, spectator.playhead + dt * 60 * rate);
        let index = frames.findIndex((frame) => frame[0] > spectator.playhead);
        if (index === -1) index = frames.length - 1;
        const b = frames[index];
        const a = frames[Math.max(0, index - 1)];
        const span = b[0] - a[0];
        spectateApply(a, b, span > 0 ? Math.max(0, Math.min(1, (spectator.playhead - a[0]) / span)) : 1);
        // Joined late or jumped ahead: the camera straight behind the bike.
        if (Math.abs(camera.position.z - bikeGroup.position.z) > 40) {
            camera.position.set(bikeGroup.position.x, camera.position.y, bikeGroup.position.z + 6);
        }
        // What appeared on the road, and the bonuses, when the rider saw them.
        while (spectator.spawns.length && spectator.spawns[0][1] <= spectator.playhead) {
            const item = spectator.spawns.shift();
            if (item[0] === 'o') placeObstacle(item[2], item[3], item[4], item[5], item[6]);
            else if (item[0] === 'r') placeRamp(item[2], item[3], item[4]);
        }
        while (spectator.marks.length && spectator.marks[0][0] <= spectator.playhead) {
            const [, title, text] = spectator.marks.shift();
            toast(title, text, { float: true });
        }
        // Behind the bike: gone.
        const behind = bikeGroup.position.z + 40;
        state.obstacles = state.obstacles.filter((obs) => {
            if (obs.mesh.position.z <= behind) return true;
            scene.remove(obs.mesh);
            disposeObjectTree(obs.mesh);
            return false;
        });
        state.ramps = state.ramps.filter((ramp) => {
            if (ramp.z <= behind) return true;
            scene.remove(ramp.mesh);
            return false;
        });
        spectateGround();
        live.watchFrame({ score: state.score, kmh: speedKmh() });
        // The end of the run reached: the fall.
        if (spectator.result && spectator.playhead >= newest - 0.5) spectateCrash();
    } else if (spectator.result && !spectator.crashed && !frames.length) {
        spectator.done = true;
    }
    if (spectator.crashed && v2) {
        const moving = v2.rider.updateCrash(dt);
        if (!moving || now - spectator.crashAt > 3800) spectator.done = true;
    }
    try {
        if (spectator.audio) audio.update(dt, visualSnapshot());
    } catch {
        // Sound is a bonus.
    }
    updateUI();
    renderScene(dt);
}

function spectateCrash() {
    if (spectator.crashed) return;
    spectator.crashed = true;
    spectator.crashAt = performance.now();
    const reason = spectator.result?.reason || 'crash';
    if (spectator.audio) {
        audio.stopRun();
        spectator.audio = false;
    }
    if (reason === 'absent' || reason === 'left' || reason === 'skipped') {
        spectator.done = true;
        return;
    }
    audio.play(reason === 'slow' ? 'police_siren' : 'collision', { volume: 0.8 });
    if (!v2) {
        spectator.done = true;
        return;
    }
    const kind = ['loop', 'flip', 'bavette', 'earlyGas'].includes(reason) || state.bike.angle > CONFIG.maxAngle * 0.95 ? 'loop' : 'hit';
    const unitsPerSecond = Math.max(4, state.speed * 60);
    audio.play(unitsPerSecond * 3.6 / 1.7 > 90 ? 'bike_fall_fast' : 'bike_fall', { volume: 0.6, delay: 0.12 });
    v2.rider.startCrash(kind, unitsPerSecond, visualSnapshot());
}

// The street behind the menus, as when the game opens.
function renderMenuBackdrop() {
    spectateStop();
    crashSequence++;
    resetGame();
    if (v2) {
        v2.rider.reset();
        bikeGroup.rotation.set(0, Math.PI, 0);
        camera.position.set(3.2, 2.5, 7.6);
        camera.lookAt(3.9, 1.7, -10);
        v2.frame(0, visualSnapshot());
        renderer.render(scene, camera);
    }
}

let livePodiumOn = false;
live = createLive({
    post: async (path, body) => {
        const response = await apiFetch(`${API_BASE_URL}/${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }, 8000);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    },
    identity: () => {
        const nickname = localStorage.getItem('wheelie_nickname');
        return {
            nickname, device_token: nickname ? deviceToken(nickname) : undefined,
            look: v2 ? v2.podiumLook() : {}, voice: riderVoiceKey()
        };
    },
    setNickname: (name) => setNickname(name),
    points: () => totalPoints(),
    spend: (amount) => spendPoints(amount),
    stat: (name, amount = 1) => bumpStat(name, amount),
    toast: (title, text) => toast(title, text, { discreet: true }),
    say: (clipId) => {
        try {
            audio.say(clipId, { volume: 1 });
        } catch {
            // No voice: the bubble says it.
        }
    },
    voiceOn: () => GAME_SETTINGS.voiceEnabled,
    game: {
        ride: () => {
            spectateStop();
            liveRecording = true;
            liveLastFrame = -1e9;
            GAME_SETTINGS.gameMode = 'linear';
            document.querySelectorAll('.screen.active').forEach((screen) => screen.classList.remove('active'));
            startGame();
        },
        watch: {
            begin: (run, rider) => spectateBegin(run, rider),
            push: (batch) => spectatePush(batch),
            end: (result) => { spectator.result = result; },
            stop: () => spectateStop(),
            done: () => !spectator.active || spectator.done
        },
        podium: (entries) => {
            if (!v2) return;
            if (!entries) {
                if (livePodiumOn) v2.podiumView(false);
                livePodiumOn = false;
                return;
            }
            spectateStop();
            if (!livePodiumOn) {
                // The last fall's rider is not left lying beside the podium.
                crashSequence++;
                resetGame();
                v2.rider.reset();
            }
            v2.podium.setSolo(false);
            v2.podium.setStandings(entries, null);
            if (!livePodiumOn) v2.podiumView(true);
            livePodiumOn = true;
        },
        stopAll: () => {
            document.querySelectorAll('.screen.active').forEach((screen) => screen.classList.remove('active'));
        }
    },
    menu: () => {
        renderMenuBackdrop();
        document.getElementById('mode-select-screen')?.classList.add('active');
    },
    loveCode: () => loveEvent?.unlockFromCode()
});

// The shop's core (src/shop/store.js): the points it takes, the stats.
initUITheme();
configureShop({
    points: () => totalPoints(),
    spend: (n) => spendPoints(n),
    stat: (name, n = 1) => bumpStat(name, n)
});

registerCharacters(() => v2);
registerOutfitsAndExtras(() => v2, {
    onLoveUnlock: () => loveEvent?.installEntry(),
    onFreeTricksUnlock: () => document.dispatchEvent(new CustomEvent('wheelie:points'))
});
registerRealCars();
registerMusic();
initPorscheExperience();
musicPlayer = createMusicPlayer();
musicPlayer.mountPause(document.getElementById('pause-music'));
shopUI = installShop({
    apiBase: API_BASE_URL,
    apiFetch,
    nickname: () => localStorage.getItem('wheelie_nickname') || '',
    deviceId,
    deviceToken,
    askAccountCode: (reason, name) => account.askCode(reason, name),
    v2: () => v2,
    musicPlayer,
    stat: (name, n = 1) => bumpStat(name, n),
    onLoveUnlock: () => loveEvent?.installEntry(),
    onFreeTricksUnlock: () => document.dispatchEvent(new CustomEvent('wheelie:points'))
});
loadCatalogOverrides(API_BASE_URL, apiFetch);

loveEvent = createLoveEvent({
    scene, camera,
    v2: () => v2,
    bike: () => bikeGroup,
    speed: () => state.speed,
    startRun: () => startLoveRun(),
    end: (kind) => loveFinish(kind),
    toMenu: () => {
        quitToMenu();
        renderMenuBackdrop();
        document.querySelectorAll('.screen.active').forEach((screen) => screen.classList.remove('active'));
        document.getElementById('mode-select-screen')?.classList.add('active');
    },
    stat: (name, n = 1) => bumpStat(name, n),
    points: () => totalPoints(),
    spend: (n) => spendPoints(n),
    // The race's points so far (the wheeling's).
    score: () => Math.max(0, Math.floor(state.score)),
    // The event's mix: the effects 30 % lower, softened under the music,
    // the AI voices off unless asked for.
    mix: (on) => audio.setMix(on ? { level: 0.7, tone: 5200, engine: 0.8, voice: loveEvent?.voices() ? 1 : 0 } : null),
    // The event's studio: the rider shown turning above its panel.
    showroom: (on) => {
        if (!v2) return;
        if (on) document.querySelectorAll('.screen.active').forEach((screen) => screen.classList.remove('active'));
        v2.showroom(on, '#love-card');
    },
    menu: () => {
        renderMenuBackdrop();
        document.getElementById('mode-select-screen')?.classList.add('active');
    },
    cameraHold: (on) => { cameraHold = !!on; },
    // The city under the sea of clouds.
    city: (visible) => {
        groundChunks.forEach((chunk) => { chunk.visible = visible; });
        state.gantries.forEach((gantry) => { gantry.visible = visible; });
        v2?.world.setSkylineVisible(visible);
    }
});

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
// Something unlocked: a small line, no box, the surprise kept for the
// trophy room ("à découvrir").
function announceUnlocks(before, after) {
    const unlocked = rewards().filter((reward) => reward.points > before && reward.points <= after);
    if (!unlocked.length) return;
    setTimeout(() => {
        let line = document.getElementById('gift-line');
        if (!line) {
            line = document.createElement('p');
            line.id = 'gift-line';
            line.setAttribute('role', 'status');
            document.body.append(line);
        }
        line.textContent = `🎁 ${unlocked.length > 1 ? `${unlocked.length} nouveautés` : 'Nouveau'} · à voir dans la salle des trophées`;
        line.classList.remove('is-shown');
        void line.offsetWidth;
        line.classList.add('is-shown');
        audio.play('new_record', { volume: 0.35 });
    }, 1600);
}

async function showLeaderboard() {
    const startScreen = document.getElementById('start-screen');
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    const leaderboardList = document.getElementById('leaderboard-list');

    if (startScreen) startScreen.classList.remove('active');
    if (leaderboardScreen) leaderboardScreen.classList.add('active');
    openPodium();
    showBoardPeriod();
    if (leaderboardList) await reloadBoard();
}

// Podium (V2): the top three on a podium beside / above the list, played
// from what this player saw last time (who climbed, who came in, a new
// first with confetti), refreshed every 15 s while the screen is open.
const PODIUM_SEEN_KEY = 'wheelie_podium_seen';
// What was seen, for each leaderboard (all time, the day's).
const podiumSeenKey = () => (boardPeriod === 'day' ? `${PODIUM_SEEN_KEY}_day` : PODIUM_SEEN_KEY);
let podiumTimer = null;
let podiumCaptionTimer = null;
function podiumEntries(rows) {
    const mine = (localStorage.getItem('wheelie_nickname') || '').toLowerCase();
    return rows.slice(0, 3).map((row) => {
        const key = String(row.nickname).toLowerCase();
        // The player's own look from this phone, even before a ranked run sends it.
        return { key, name: String(row.nickname), score: row.best_score, look: key === mine ? v2.podiumLook() : row.look || null };
    });
}

function updatePodium(rows) {
    if (!v2) return;
    let previous = null;
    try {
        previous = JSON.parse(localStorage.getItem(podiumSeenKey()) || 'null');
    } catch {
        previous = null;
    }
    const entries = podiumEntries(rows);
    const seen = Array.isArray(previous) ? previous : null;
    const same = !!seen && seen.map((entry) => `${entry.key}:${entry.score}`).join('|') === entries.map((entry) => `${entry.key}:${entry.score}`).join('|');
    // The classic look plays the arrival every time, the changes when any.
    const events = v2.podium.setStandings(entries, boardStyle() === 'classic' && same ? null : seen);
    try {
        localStorage.setItem(podiumSeenKey(), JSON.stringify(entries));
    } catch {
        // Not kept: the next visit plays it all again.
    }
    showPodiumCaption(events);
    if (boardStyle() === 'classic') {
        showBoardPage('podium');
        scheduleBoardSlide();
    }
}

function showPodiumCaption(events) {
    const caption = document.getElementById('podium-caption');
    if (!caption || !events.length) return;
    const place = ['1re', '2e', '3e'];
    const lines = events.map(({ type, name, rank }) =>
        rank === 0 ? `${name} prend la 1re place !`
            : type === 'enter' ? `${name} monte sur le podium (${place[rank]})`
                : `${name} passe ${place[rank]}`);
    let index = 0;
    clearTimeout(podiumCaptionTimer);
    const next = () => {
        if (index >= lines.length) {
            caption.classList.remove('is-shown');
            return;
        }
        caption.textContent = lines[index++];
        caption.classList.add('is-shown');
        podiumCaptionTimer = setTimeout(next, 4200);
    };
    next();
    audio.play('new_record', { volume: 0.35 });
}

async function refreshPodium() {
    // The pose screen uses the podium too: no refresh meanwhile.
    if (document.getElementById('pose-screen')?.classList.contains('active')) return;
    if (!document.getElementById('leaderboard-screen')?.classList.contains('active')) return closePodium();
    const rows = await fetchLeaderboardFromAPI(0, 3);
    let previous = [];
    try {
        previous = JSON.parse(localStorage.getItem(podiumSeenKey()) || '[]');
    } catch {
        previous = [];
    }
    const changed = rows.slice(0, 3).map((row) => `${String(row.nickname).toLowerCase()}:${row.best_score}`).join('|')
        !== (previous || []).map((entry) => `${entry.key}:${entry.score}`).join('|');
    if (!changed) return;
    updatePodium(rows);
    // The list too, from the top (someone moved).
    const fresh = await fetchLeaderboardFromAPI(0, 20);
    if (!fresh.length) return;
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
    leaderboardPage = { shown: 0, loading: false, done: false, sequence: (leaderboardPage.sequence || 0) + 1 };
    appendLeaderboardRows(fresh, 20);
}

// The leaderboard's look (Paramètres › Qualité graphique): 'podium' (the
// podium beside / above the list, the default) or 'classic' (the podium
// full screen first, then the old list slides in; swipe left, or ‹ PODIUM,
// to see the podium again; every visit and every change plays it again).
const BOARD_STYLE_KEY = 'wheelie_board_style';
let boardSlideTimer = null;
function boardStyle() {
    return readSetting(BOARD_STYLE_KEY) === 'classic' ? 'classic' : 'podium';
}
function showBoardStyle() {
    document.getElementById('board-podium')?.classList.toggle('active', boardStyle() === 'podium');
    document.getElementById('board-classic')?.classList.toggle('active', boardStyle() === 'classic');
}
for (const [id, style] of [['board-podium', 'podium'], ['board-classic', 'classic']]) {
    document.getElementById(id)?.addEventListener('click', () => {
        try {
            localStorage.setItem(BOARD_STYLE_KEY, style);
        } catch {
            // Not kept: this visit only.
        }
        showBoardStyle();
    });
}
showBoardStyle();

// The 24H leaderboard: the timer at the top right switches the list (and
// the podium) to the scores of the day, which starts again at 6:00 GMT
// (the server's daily.py).
let boardPeriod = 'all';
function showBoardPeriod() {
    const day = boardPeriod === 'day';
    const button = document.getElementById('daily-btn');
    button?.classList.toggle('active', day);
    button?.setAttribute('aria-pressed', String(day));
    button?.setAttribute('aria-label', day ? 'Classement général' : 'Classement 24H');
    const title = document.querySelector('#leaderboard-screen h1');
    if (title) title.textContent = day ? 'CLASSEMENT 24H' : 'CLASSEMENT';
    const label = document.getElementById('leaderboard-version');
    if (label) label.innerText = day ? 'RÉINITIALISATION À 6:00 GMT' : (IS_V2 ? 'NEW VERSION (BETA)' : 'VERSION 1 · CLASSIQUE');
}
async function reloadBoard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<p style="color: #888;">Chargement...</p>';
    leaderboardPage = { shown: 0, loading: false, done: false, sequence: (leaderboardPage.sequence || 0) + 1 };
    const rows = await fetchLeaderboardFromAPI(0, 20);
    list.innerHTML = '';
    if (!rows.length) {
        const empty = document.createElement('p');
        empty.style.color = '#888';
        empty.textContent = boardPeriod === 'day' ? 'Personne n’a encore de score sur ces 24H : la première place est à prendre !' : 'Aucun score enregistré...';
        list.append(empty);
    } else {
        appendLeaderboardRows(rows, 20);
    }
    updatePodium(rows);
}
document.getElementById('daily-btn')?.addEventListener('click', () => {
    boardPeriod = boardPeriod === 'day' ? 'all' : 'day';
    showBoardPeriod();
    reloadBoard();
});

// The list, its heading and buttons in one panel (built once), so the
// stage and the panel can sit side by side, stacked, or slide.
function boardPanel() {
    const screen = document.getElementById('leaderboard-screen');
    let panel = screen.querySelector(':scope > .lb-panel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'lb-panel';
    const moving = [...screen.children].filter((child) => child.id !== 'podium-stage' && child.id !== 'daily-btn' && !child.classList.contains('podium-tabs'));
    screen.prepend(panel);
    panel.append(...moving);
    // "Position sur le podium" right under the trophy room.
    const trophies = document.getElementById('trophies-btn');
    const pose = document.getElementById('pose-btn');
    if (trophies && pose) trophies.after(pose);
    return panel;
}

function showBoardPage(page) {
    const screen = document.getElementById('leaderboard-screen');
    screen.classList.toggle('show-podium', page === 'podium');
    screen.classList.toggle('show-list', page === 'list');
}

// Classic look: once every figure is on its step (however slow the phone
// plays it), a moment to look, then the list slides in.
function scheduleBoardSlide() {
    clearTimeout(boardSlideTimer);
    if (!v2 || boardStyle() !== 'classic') return;
    const started = performance.now();
    let settledAt = null;
    const check = () => {
        const screen = document.getElementById('leaderboard-screen');
        if (!screen.classList.contains('active') || !screen.classList.contains('board-classic') || !screen.classList.contains('show-podium')) return;
        const now = performance.now();
        if (v2.podium.remaining() > 0) settledAt = null;
        else if (settledAt === null) settledAt = now;
        if (settledAt !== null && now - settledAt >= 1400 && now - started >= 2800) {
            showBoardPage('list');
            return;
        }
        boardSlideTimer = setTimeout(check, 200);
    };
    boardSlideTimer = setTimeout(check, 200);
}

function openPodium() {
    const screen = document.getElementById('leaderboard-screen');
    if (!v2 || !screen) return;
    boardPanel();
    const style = boardStyle();
    screen.classList.add('has-podium');
    screen.classList.toggle('board-podium', style === 'podium');
    screen.classList.toggle('board-classic', style === 'classic');
    if (style === 'classic') {
        showBoardPage('podium');
        scheduleBoardSlide();
    } else if (!screen.classList.contains('tab-list')) {
        screen.classList.add('tab-podium');
    }
    v2.podiumView(true);
    clearInterval(podiumTimer);
    podiumTimer = setInterval(refreshPodium, 15000);
}

function closePodium() {
    clearInterval(podiumTimer);
    podiumTimer = null;
    clearTimeout(podiumCaptionTimer);
    clearTimeout(boardSlideTimer);
    document.getElementById('podium-caption')?.classList.remove('is-shown');
    if (v2) v2.podiumView(false);
}

function selectPodiumTab(tab) {
    const screen = document.getElementById('leaderboard-screen');
    if (!screen) return;
    screen.classList.toggle('tab-podium', tab === 'podium');
    screen.classList.toggle('tab-list', tab === 'list');
    document.getElementById('podium-tab')?.setAttribute('aria-selected', String(tab === 'podium'));
    document.getElementById('list-tab')?.setAttribute('aria-selected', String(tab === 'list'));
}
document.getElementById('podium-tab')?.addEventListener('click', () => selectPodiumTab('podium'));
document.getElementById('list-tab')?.addEventListener('click', () => selectPodiumTab('list'));
document.getElementById('podium-to-list')?.addEventListener('click', () => {
    clearTimeout(boardSlideTimer);
    showBoardPage('list');
});
document.getElementById('list-to-podium')?.addEventListener('click', () => {
    clearTimeout(boardSlideTimer);
    showBoardPage('podium');
});
// Swipes (not on the podium itself, where the finger turns the camera):
// short screens switch tabs; the classic look goes back to the podium
// with a swipe to the left.
{
    let startX = null;
    const screen = document.getElementById('leaderboard-screen');
    screen?.addEventListener('touchstart', (event) => {
        const onStage = event.target.closest?.('#podium-stage');
        startX = event.touches.length === 1 && !onStage ? event.touches[0].clientX : null;
    }, { passive: true });
    screen?.addEventListener('touchend', (event) => {
        if (startX === null || !screen.classList.contains('has-podium')) return;
        const dx = event.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) < 60) return;
        if (screen.classList.contains('board-classic')) {
            if (dx < 0 && screen.classList.contains('show-list')) {
                clearTimeout(boardSlideTimer);
                showBoardPage('podium');
            }
            return;
        }
        if (getComputedStyle(document.querySelector('.podium-tabs')).display === 'none') return;
        selectPodiumTab(dx < 0 ? 'list' : 'podium');
    }, { passive: true });
}

// Position sur le podium: the player alone on the top step, trying the
// poses (a second tap buys one with cumulative points), choosing one.
function openPoseScreen() {
    if (!v2) return;
    clearTimeout(boardSlideTimer);
    document.getElementById('leaderboard-screen')?.classList.remove('active');
    document.getElementById('pose-screen')?.classList.add('active');
    poseToConfirm = null;
    v2.podiumView(true);
    v2.podium.resetOrbit();
    v2.podium.setSolo(true, v2.podiumLook(), v2.riderName() || 'TOI');
    renderPosePicker();
}

function closePoseScreen() {
    if (v2) v2.podium.setSolo(false);
    v2?.podium.resetOrbit();
    document.getElementById('pose-screen')?.classList.remove('active');
    document.getElementById('leaderboard-screen')?.classList.add('active');
}
document.getElementById('pose-btn')?.addEventListener('click', openPoseScreen);
document.getElementById('back-from-pose')?.addEventListener('click', closePoseScreen);

let poseToConfirm = null;
let poseTrying = null;
function renderPosePicker(note = '') {
    const picker = document.getElementById('pose-picker');
    if (!picker || !v2) return;
    const owned = ownedPoses();
    const chosen = chosenPose();
    picker.replaceChildren();
    const title = document.createElement('div');
    title.className = 'pose-picker__title';
    title.innerHTML = `<span>tes points cumulés : <b>${totalPoints()}</b></span>`;
    const list = document.createElement('div');
    list.className = 'pose-picker__list';
    for (const pose of POSES) {
        if (pose.jetpack && !hasJetpack() && !owned.has(pose.id)) continue;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'pose-chip';
        chip.classList.toggle('is-chosen', pose.id === chosen);
        chip.classList.toggle('is-trying', pose.id === poseTrying && pose.id !== chosen);
        chip.classList.toggle('is-confirm', pose.id === poseToConfirm);
        const label = document.createElement('span');
        label.textContent = pose.id === poseToConfirm ? `ACHETER ?` : pose.name;
        const tag = document.createElement('em');
        tag.textContent = pose.id === poseToConfirm ? `${pose.price.toLocaleString('fr-FR')} pts`
            : owned.has(pose.id) ? (pose.id === chosen ? '✓' : '') : `${pose.price.toLocaleString('fr-FR')} pts`;
        chip.append(label, tag);
        chip.addEventListener('click', () => pickPose(pose));
        list.append(chip);
    }
    const message = document.createElement('p');
    message.className = 'pose-picker__note';
    message.textContent = note;
    picker.append(title, list, message);
}

function pickPose(pose) {
    poseTrying = pose.id;
    v2.podium.preview({ ...v2.podiumLook(), pose: pose.id }, v2.riderName() || 'TOI');
    if (ownedPoses().has(pose.id)) {
        poseToConfirm = null;
        choosePose(pose.id);
        renderPosePicker('Pose choisie. Les autres la verront dès ta prochaine partie classée.');
        return;
    }
    if (poseToConfirm !== pose.id) {
        poseToConfirm = pose.id;
        renderPosePicker(`« ${pose.name} » : touche encore pour l’acheter (${pose.price.toLocaleString('fr-FR')} points cumulés).`);
        return;
    }
    poseToConfirm = null;
    const result = buyPose(pose.id);
    if (result === 'short') {
        renderPosePicker(`Il te manque ${(pose.price - totalPoints()).toLocaleString('fr-FR')} points cumulés pour « ${pose.name} ».`);
        return;
    }
    audio.play('new_record', { volume: 0.4 });
    v2.podium.celebrate(2.5);
    renderPosePicker('Pose achetée ! Les autres la verront dès ta prochaine partie classée.');
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
document.getElementById('trophies-btn')?.addEventListener('click', () => {
    closePodium();
    showTrophyRoom();
});
document.getElementById('back-from-trophies')?.addEventListener('click', () => {
    document.getElementById('trophy-screen')?.classList.remove('active');
    document.getElementById('leaderboard-screen')?.classList.add('active');
    openPodium();
});
document.getElementById('back-from-leaderboard')?.addEventListener('click', () => {
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    const startScreen = document.getElementById('start-screen');
    closePodium();
    if (leaderboardScreen) leaderboardScreen.classList.remove('active');
    if (startScreen) startScreen.classList.add('active');
});

// Afficher le pseudo au chargement si il existe
displayNickname();

try {
    initUITheme();
    init();
    // A Love&Faith rider or shop character/outfit bought and chosen: worn from the start.
    loveEvent?.applyWear();
    applyCharacter(v2);
    applyEquippedOutfit(v2);
    shopUI?.refresh();
} catch (error) {
    console.error('Startup error:', error);
    reportError('startup', error);
} finally {
    releaseSplash();
}

// The intro animation plays while the city is generated. It leaves once the
// game is ready and the animation has finished, or on a tap once ready;
// later visits in the same session do not wait for the end.
function releaseSplash() {
    window.__splashHandled = true;
    clearTimeout(window.__splashTimer);
    const splash = document.getElementById('splash');
    const video = document.getElementById('splash-video');
    if (!splash) return;
    if (video) video.loop = false;
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
        spawnRamp, spawnObstacle, SHIELD, get bikeGroup() { return bikeGroup; },
        get analogData() { return analogData; }, GAME_SETTINGS,
        get v2() { return v2; },
        // Free roam fall at `kmh` (skidding: the side-impact kind).
        fallTest(kmh, skidding = false) { startRoamFall(kmh / 3.6, skidding, v2.roam); },
        get roamFall() { return roamFall; },
        get live() { return live; },
        get spectator() { return spectator; },
        spectate: { begin: (run) => spectateBegin(run), push: (batch) => spectatePush(batch) },
        get loveDebug() { return loveEvent?.debug; }
    };
}
