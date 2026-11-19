// Love&Faith × 51Wheling: the event (testers only for now: the code 5HC
// typed in the session live's code field unlocks it).
// A race where only the wheelie counts: catch hearts, hugs and letters (+1
// love each), avoid broken hearts (-3) and tears (-2). The love bar goes
// from 8 to 20: full, the heart is mended (no more obstacles, into a cloud,
// "mission réussie"); empty, it is broken. Under 12 it rains, darker and
// harder as it goes down, and the rider is sad (head down, tears, "pourquoi
// ?"); over 12 the sky clears, brighter as it goes up. Every word written as
// with a fountain pen; the artist's music at random.
import * as THREE from 'three';
import './love.css';
import { createInk } from './ink.js';
import { createRain } from './rain.js';
import { createItemFactory, ITEM_KINDS } from './items.js';
import { createMusic, FIRST_TRACK, MUSIC_CREDIT, MUSIC_MODES } from './music.js';
import { createCloudSea } from './clouds.js';
import { createPuddles } from './puddles.js';
import { beginCinematic, cinematicSpeed, endCinematic } from '../cinematic.js';

export const LOVE_CODE = '5HC';
const UNLOCK_KEY = 'wheelie_love_event';
const OUTFIT_KEY = 'wheelie_love_outfit';
const BAND_KEY = 'wheelie_love_band';
// Who rides in the event: the boy (by default) or the girl; asked the first
// time, changed in the event's panel or the game's settings.
const RIDER_KEY = 'wheelie_love_rider';
const RIDERS = [['boy', 'Garçon', '🧔🏾‍♂️'], ['girl', 'Fille', '👩🏾‍🦱']];
const BEST_KEY = 'wheelie_love_best';
// The girl's hairstyle; the music (the artist's by default); the tutorial seen.
const HAIR_KEY = 'wheelie_love_hair';
const HAIRS = [['vanilles', 'Vanilles', 'Noires, des perles aux pointes'], ['afro', 'Afro vanille', 'Des perles dans les boucles']];
const MUSIC_KEY = 'wheelie_love_music';
const MUSIC_HINTS = { music: 'Les morceaux de MWL, au hasard', anasheed: 'Cinq anasheed, au hasard', both: 'Musique et anasheed mélangés' };
const TUTO_KEY = 'wheelie_love_tuto';
const TUTORIAL = [
    ['Lève la roue', 'Gaz et wheeling : ici, rien d’autre ne compte. Pas de police, pas de tremplins.'],
    ['Attrape', 'Cœurs, nounours (des câlins) et lettres : +1 d’amour chacun, et un mot s’écrit à la plume.'],
    ['Évite', 'Cœur brisé : −3. Larme : −2. Passe à côté en te décalant à gauche ou à droite.'],
    ['Sous 12, il pleut', 'La nuit tombe, ton perso pleure et se demande pourquoi. Les flaques éclaboussent.'],
    ['À 20 : cœur réparé', 'La route devient une mer de nuages et tu entres dans le nuage. Mission réussie.'],
    ['À 0 : tempête émotionnelle', 'Elle emporte tout sur son passage. C’est perdu… et ça se recommence.']
];
const STEP_LABELS = { rider: 'Perso', hair: 'Coiffure', outfit: 'Tenue', band: 'Bandeau', music: 'Musique' };
// The Love&Faith riders for the whole game: the heart mended with him (or
// her) gives the right to buy him, CHARACTER_PRICE points; or his code.
// Worn everywhere once chosen in the rider screen.
const WON_KEY = 'wheelie_love_won';
const OWNED_KEY = 'wheelie_love_owned';
const WEAR_KEY = 'wheelie_love_wear';
export const CHARACTER_PRICE = 600000;
const CHARACTER_CODES = { LOVE51: 'boy', FAITH51: 'girl' };
// The shop (open once a heart has been mended): the event's pieces for the
// rider's own look, in the whole game.
const SHOP_KEY = 'wheelie_love_shop';
const SHOP_WEAR_KEY = 'wheelie_love_shop_wear';
const SWEATS = { lva: 'Sweat LVA', plva: 'Sweat PLVA', 'world-love': 'Sweat World Love', 'fabulous-love-and-faith': 'Sweat Fabulous' };
export const SHOP_ITEMS = [
    ...Object.entries(SWEATS).map(([print, name]) => ({ id: `sweat-${print}`, print, name, price: 150000, icon: `icon-${print}.webp` })),
    { id: 'bonnet', head: true, name: 'Bonnet & bandeau', price: 120000, icon: 'beanie.jpg' }
];
// The AI rider's lines in the race: off unless asked for.
const VOICE_KEY = 'wheelie_love_voices';
// The last race started: back after half an hour or more (or the very first
// time), the first track is "Ne m’abandonne pas".
const LAST_KEY = 'wheelie_love_last';
const FRESH_MS = 30 * 60 * 1000;
const readList = (key) => {
    try {
        const list = JSON.parse(readLocal(key) || '[]');
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
};
const FILES = '/event/love/';
export const LOVE = { max: 20, start: 8, sun: 12 };
// Placement on the road: one slot every `seconds` of riding, each one a
// catch (good), a danger (bad, more as the run goes on) or nothing.
const SPAWN = { seconds: 0.5, minGap: 22, maxGap: 80, good: 0.24, bad: 0.32, badMore: 0.14, badRampSeconds: 120, width: 7.2, height: 1.55, calm: 2.5 };
// The blindfold's colour (a setting of the event's panel): cloth and ink.
const BANDS = [
    ['rouge', 'Rouge', '#c90025', '#ffffff'], ['noir', 'Noir', '#111111', '#f4ede9'], ['blanc', 'Blanc', '#f4ede9', '#c90025'],
    ['rose', 'Rose', '#ff8fb1', '#7a0016'], ['bleu', 'Bleu', '#2f5fd0', '#ffffff'], ['or', 'Or', '#c9a45c', '#1a0e05']
];
// Puddles while it rains: one stretch of road in two or so; now and then a
// big one.
const PUDDLES = { chance: 0.55, big: 0.35 };
const OUTFITS = [
    ['lva', 'For real lovers'],
    ['plva', 'Pour les vrais amoureux'],
    ['world-love', 'Love rules the world'],
    ['fabulous-love-and-faith', 'Fabulous Love&Faith']
];
const WORDS = {
    heart: ['Je t’aime', 'Je suis désolé', 'Pardonne-moi', 'Tu me manques', 'Reviens-moi', 'Toi et moi', 'Pour toujours', 'Je pense à toi', 'Mon cœur est à toi', 'On recommence ?', 'Je crois en nous'],
    hug: ['Viens là', 'Serre-moi fort', 'Je suis là', 'Tout ira bien', 'Reste encore un peu'],
    letter: ['Mon amour,', 'Je t’écris pour te dire…', 'Sans toi rien n’a de sens', 'Lis-moi jusqu’au bout', 'Je garde chaque mot'],
    broken: ['C’est pas toi, c’est moi', 'Comment on en est arrivé là', 'Désolé mais je peux plus', 'J’ai plus la force'],
    tear: ['Tu m’avais promis', 'J’y croyais tellement', 'Il pleut dans mon cœur', 'On s’était dit pour toujours'],
    thought: ['Pourquoi ?', 'Pourquoi moi ?', 'Qu’est-ce que j’ai fait ?', 'J’aurais dû le dire', 'Tu me manques…', 'Pourquoi c’est si dur ?']
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const readLocal = (key) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};
const writeLocal = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Kept for this visit only.
    }
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function loveUnlocked() {
    return readLocal(UNLOCK_KEY) === '1';
}

// The fonts of the event (the partner's site: Playfair Display, Poppins;
// the pen: Parisienne), only once the event is opened.
let fontsAdded = false;
function addFonts() {
    if (fontsAdded) return;
    fontsAdded = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Parisienne&family=Playfair+Display:ital,wght@0,700;1,700;1,900&family=Poppins:wght@400;600&display=swap';
    document.head.append(link);
}

// Little sounds of its own (no files): a chime for what is caught, a heavy
// heartbeat for a broken heart, a drop for a tear.
function createChimes() {
    let context = null;
    let bus = null;
    // 30 % lower, the highs softened and a little room round them: they
    // melt into the music instead of sitting on top of it.
    const ctx = () => {
        if (!context) {
            const Context = window.AudioContext || window.webkitAudioContext;
            if (!Context) return null;
            context = new Context();
            bus = context.createGain();
            bus.gain.value = 0.7;
            const soft = context.createBiquadFilter();
            soft.type = 'lowpass';
            soft.frequency.value = 4800;
            soft.Q.value = 0.5;
            bus.connect(soft);
            soft.connect(context.destination);
            const room = context.createConvolver();
            const length = Math.floor(context.sampleRate * 1.3);
            const impulse = context.createBuffer(2, length, context.sampleRate);
            for (let channel = 0; channel < 2; channel++) {
                const data = impulse.getChannelData(channel);
                for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
            }
            room.buffer = impulse;
            const wet = context.createGain();
            wet.gain.value = 0.22;
            soft.connect(room);
            room.connect(wet);
            wet.connect(context.destination);
        }
        if (context.state === 'suspended') context.resume().catch(() => {});
        return context;
    };
    const tone = (freq, start, length, volume, type = 'sine', slide = 0) => {
        const c = ctx();
        if (!c) return;
        const t = c.currentTime + start;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + length);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
        osc.connect(gain).connect(bus);
        osc.start(t);
        osc.stop(t + length + 0.02);
    };
    return {
        unlock: () => ctx(),
        good(step = 0) {
            const base = 660 * Math.pow(2, (step % 5) / 12);
            tone(base, 0, 0.35, 0.18);
            tone(base * 1.5, 0.07, 0.4, 0.13);
            tone(base * 2, 0.14, 0.5, 0.08);
        },
        broken() {
            tone(70, 0, 0.22, 0.5, 'sine', -25);
            tone(62, 0.24, 0.3, 0.42, 'sine', -22);
            tone(180, 0.02, 0.5, 0.05, 'triangle', -120);
        },
        tear() {
            tone(1250, 0, 0.18, 0.16, 'sine', -700);
            tone(520, 0.12, 0.25, 0.06, 'sine', -200);
        },
        splash(strength = 1) {
            const c = ctx();
            if (!c) return;
            const length = 0.55;
            const buffer = c.createBuffer(1, Math.floor(c.sampleRate * length), c.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                const t = i / data.length;
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * (t < 0.02 ? t / 0.02 : 1);
            }
            const source = c.createBufferSource();
            source.buffer = buffer;
            const filter = c.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1600, c.currentTime);
            filter.frequency.exponentialRampToValueAtTime(700, c.currentTime + length);
            filter.Q.value = 0.7;
            const gain = c.createGain();
            gain.gain.value = 0.55 * Math.min(1.2, strength);
            source.connect(filter).connect(gain).connect(bus);
            source.start();
        },
        repaired() {
            [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.9, 0.14));
        },
        // A crack, then the rumble rolling away.
        thunder(strength = 1) {
            const c = ctx();
            if (!c) return;
            const length = 2.6;
            const buffer = c.createBuffer(1, Math.floor(c.sampleRate * length), c.sampleRate);
            const data = buffer.getChannelData(0);
            let last = 0;
            for (let i = 0; i < data.length; i++) {
                const t = i / c.sampleRate;
                // Brown noise: a deep rumble.
                last = (last + (Math.random() * 2 - 1) * 0.08) * 0.985;
                const crack = t < 0.12 ? (Math.random() * 2 - 1) * (1 - t / 0.12) * 0.8 : 0;
                data[i] = (last * 6 * Math.exp(-t * 1.4) * (0.7 + 0.3 * Math.sin(t * 7))) + crack;
            }
            const source = c.createBufferSource();
            source.buffer = buffer;
            const filter = c.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 900;
            const gain = c.createGain();
            gain.gain.value = 0.5 * strength;
            source.connect(filter).connect(gain).connect(bus);
            source.start();
        }
    };
}

// deps: { scene, camera, v2 (getter), bike (getter: the bike group),
// speed (getter: units a frame), startRun(), end(kind), toMenu(),
// stat(name, n), hud(on) }
const HEART_GLASS_SVG = `
<svg class="love-heart-svg" viewBox="0 0 48 44" aria-hidden="true">
  <defs>
    <radialGradient id="lf-heart-ruby" cx="50%" cy="68%" r="64%">
      <stop offset="0%" stop-color="#ff4963"/>
      <stop offset="38%" stop-color="#d80026"/>
      <stop offset="76%" stop-color="#7c0214"/>
      <stop offset="100%" stop-color="#2c0208" stop-opacity="0.92"/>
    </radialGradient>
    <linearGradient id="lf-heart-rim" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.92"/>
      <stop offset="40%" stop-color="#ffb3c1" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#ff2344" stop-opacity="0.88"/>
    </linearGradient>
    <linearGradient id="lf-heart-sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.58"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#ff6b81" stop-opacity="0.28"/>
    </linearGradient>
  </defs>
  <path d="M24 40.5C22.4 39.2 5.2 26.8 3.6 15.2C2.3 6.9 9.1 2.2 15.9 3.6C19.8 4.4 22.7 7.1 24 9.7C25.3 7.1 28.2 4.4 32.1 3.6C38.9 2.2 45.7 6.9 44.4 15.2C42.8 26.8 25.6 39.2 24 40.5Z" fill="url(#lf-heart-ruby)" stroke="url(#lf-heart-rim)" stroke-width="1.5"/>
  <path d="M8.2 15.5C9.2 10.1 13.7 7.2 18.2 8.2C21.2 8.9 23.1 11.4 24 13.2C24.9 11.4 26.8 8.9 29.8 8.2C34.3 7.2 38.8 10.1 39.8 15.5C38.6 24.4 25.4 34.4 24 35.6C22.6 34.4 9.4 24.4 8.2 15.5Z" fill="url(#lf-heart-sheen)" opacity="0.72"/>
  <path d="M6.8 14.5C6.8 8.8 11.4 5.7 15.7 6.3" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-opacity="0.88"/>
  <path d="M31.6 6.2C35.8 5.6 40.1 8.4 40.8 13.2" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-opacity="0.68"/>
  <ellipse cx="24" cy="30.5" rx="9" ry="4.2" fill="#ff4d6d" fill-opacity="0.34"/>
  <path d="M17.5 31.8C20.2 34.5 23.1 36.7 24 37.5C25.1 36.6 28.4 34 31.2 31.2" fill="none" stroke="#ffd4dc" stroke-width="1.15" stroke-linecap="round" stroke-opacity="0.78"/>
</svg>`;

const MUSIC_NOTE_SVG = `
<svg class="love-note-svg" viewBox="0 0 24 24" aria-hidden="true">
  <defs>
    <linearGradient id="lf-note-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff85ad"/>
      <stop offset="55%" stop-color="#ff3b74"/>
      <stop offset="100%" stop-color="#d6154e"/>
    </linearGradient>
  </defs>
  <path d="M9 17.5V5.8l10-2.2v11.7" fill="none" stroke="url(#lf-note-grad)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M9 8.7l10-2.1" fill="none" stroke="url(#lf-note-grad)" stroke-width="2.1" stroke-linecap="round"/>
  <ellipse cx="6.7" cy="17.8" rx="3.1" ry="2.4" transform="rotate(-18 6.7 17.8)" fill="url(#lf-note-grad)"/>
  <ellipse cx="16.7" cy="15.5" rx="3.1" ry="2.4" transform="rotate(-18 16.7 15.5)" fill="url(#lf-note-grad)"/>
</svg>`;

const LIQUID_WAVE_SVG = `
<svg class="love-wave-svg" viewBox="0 0 240 24" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 10 C20 3, 40 3, 60 10 C80 17, 100 17, 120 10 C140 3, 160 3, 180 10 C200 17, 220 17, 240 10 L240 24 L0 24 Z" fill="rgba(255, 64, 96, 0.42)"/>
  <path d="M0 10 C20 3, 40 3, 60 10 C80 17, 100 17, 120 10 C140 3, 160 3, 180 10 C200 17, 220 17, 240 10" fill="none" stroke="rgba(255, 228, 234, 0.88)" stroke-width="1.35"/>
</svg>`;

export function createLoveEvent(deps) {
    const root = document.createElement('div');
    root.id = 'love-root';
    root.innerHTML = `
        <div class="love-hud" id="love-hud" hidden>
            <div class="love-brand"><img src="${FILES}logo-heart.png" alt=""><span>LOVE&amp;FAITH <i>×</i> 51WHELING</span></div>
            <div class="love-bar" id="love-bar" role="meter" aria-label="Barre d’amour" aria-valuemin="0" aria-valuemax="${LOVE.max}" style="--love-pct:${(LOVE.start / LOVE.max) * 100}">
                <span class="love-bar__rim" aria-hidden="true"></span>
                <span class="love-bar__heart" aria-hidden="true">${HEART_GLASS_SVG}</span>
                <div class="love-bar__gauge">
                    <div class="love-bar__tank" id="love-tank">
                        <div class="love-tank__glass-bg" aria-hidden="true"></div>
                        <div class="love-tank__liquid" id="love-liquid">
                            <div class="love-tank__body"></div>
                            <div class="love-tank__wave love-tank__wave--back">${LIQUID_WAVE_SVG}${LIQUID_WAVE_SVG}</div>
                            <div class="love-tank__wave love-tank__wave--front">${LIQUID_WAVE_SVG}${LIQUID_WAVE_SVG}</div>
                            <div class="love-tank__bubbles">
                                <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
                            </div>
                        </div>
                        <span class="love-tank__sheen" aria-hidden="true"></span>
                    </div>
                    <span class="love-tank__cursor" id="love-cursor" aria-hidden="true"></span>
                </div>
                <b class="love-bar__count" id="love-count"><span class="love-bar__cur">${LOVE.start}</span><span class="love-bar__sep">/</span><span class="love-bar__max">${LOVE.max}</span></b>
            </div>
            <b class="love-points" id="love-points">0 pts</b>
            <div class="love-now" id="love-now" hidden><span class="love-now__note" aria-hidden="true">${MUSIC_NOTE_SVG}</span><a target="_blank" rel="noopener" id="love-now-title"></a></div>
        </div>
        <div class="love-ink" id="love-ink" aria-live="polite"></div>
        <div class="love-flash" id="love-flash"></div>
        <div class="love-screen" id="love-screen" hidden><div class="love-card" id="love-card"></div></div>
        <div class="love-tuto" id="love-tuto" hidden><div class="love-tuto__card" id="love-tuto-card"></div></div>
        <div class="love-music" id="love-music" aria-hidden="true"></div>`;
    document.body.append(root);
    const $ = (id) => root.querySelector(`#${id}`);
    const ink = createInk($('love-ink'));
    const chimes = createChimes();
    const music = createMusic({
        mode: MUSIC_MODES.some(([id]) => id === readLocal(MUSIC_KEY)) ? readLocal(MUSIC_KEY) : 'music',
        onTrack(track) {
            const now = $('love-now');
            if (!track) {
                now.hidden = true;
                return;
            }
            const link = $('love-now-title');
            link.textContent = track.title;
            if (track.url) link.href = track.url;
            else link.removeAttribute('href');
            now.hidden = false;
        }
    });
    let items = null;
    let rain = null;
    // Liquid gauge needs no pre-built segment cells; showBar updates --love-pct continuously.

    const run = {
        on: false, love: LOVE.start, shownLove: LOVE.start, items: [], nextZ: null, time: 0, ended: false,
        caught: 0, hits: 0, thoughtAt: 0, tearAt: 0, slot: 0, lastZ: null, hitUntil: 0, sky: null, cloud: 0, outcome: null
    };
    const tears = [];
    const sparks = [];
    const point = new THREE.Vector3();
    const tearGeometry = new THREE.SphereGeometry(1, 8, 6);
    const tearMaterial = new THREE.MeshBasicMaterial({ color: 0x8cc8ff, transparent: true, opacity: 0.85 });
    let sparkMaterial = null;
    const outfit = () => {
        const saved = readLocal(OUTFIT_KEY);
        return OUTFITS.some(([id]) => id === saved) ? saved : OUTFITS[0][0];
    };
    const bandChoice = () => BANDS.find(([id]) => id === readLocal(BAND_KEY)) || BANDS[0];
    const riderChoice = () => (readLocal(RIDER_KEY) === 'girl' ? 'girl' : 'boy');
    const hairChoice = () => (readLocal(HAIR_KEY) === 'afro' ? 'afro' : 'vanilles');
    const voicesOn = () => readLocal(VOICE_KEY) === '1';
    const look = () => {
        const [, , color, ink] = bandChoice();
        return { print: outfit(), band: { color, ink }, gender: riderChoice(), hair: hairChoice() };
    };
    let puddles = null;
    let clouds = null;
    // Leaves and papers blown across by the storm.
    let debrisMaterials = null;
    const debris = [];
    const shake = new THREE.Vector3();

    // --- The bar --------------------------------------------------------------------
    function showBar() {
        const love = Math.max(0, Math.min(LOVE.max, run.love));
        const pct = (love / LOVE.max) * 100;
        const bar = $('love-bar');
        if (bar) {
            bar.style.setProperty('--love-pct', pct.toFixed(2));
            bar.setAttribute('aria-valuenow', String(love));
        }
        const count = $('love-count');
        if (count) {
            count.innerHTML = `<span class="love-bar__cur">${love}</span><span class="love-bar__sep">/</span><span class="love-bar__max">${LOVE.max}</span>`;
        }
        $('love-hud')?.classList.toggle('is-sad', love < LOVE.sun);
    }

    function bump(kind) {
        const bar = $('love-bar');
        bar.classList.remove('is-up', 'is-down');
        void bar.offsetWidth;
        bar.classList.add(kind);
    }

    // --- The panel ---------------------------------------------------------------
    function show(html, wide = false) {
        addFonts();
        $('love-card').innerHTML = html;
        $('love-card').classList.toggle('love-card--wide', wide);
        $('love-screen').hidden = false;
        document.body.classList.add('love-panel');
    }
    function hidePanel() {
        $('love-screen').hidden = true;
        document.body.classList.remove('love-panel');
        parkPlayer();
    }

    // --- The studio: the rider turning above (as on the rider screen), one
    // slide per choice below, each choice seen on him at once. -------------------
    let slideAt = 0;
    let studioOn = false;
    const steps = () => ['rider', 'hair', 'outfit', 'band', 'music'].filter((id) => id !== 'hair' || riderChoice() === 'girl');
    const choice = (attr, id, on, emoji, name, hint, extra = '') => `<button type="button" class="love-choice ${on ? 'is-on' : ''}" data-${attr}="${id}" ${extra}>
        ${emoji ? `<span class="love-choice__icon">${emoji}</span>` : ''}<b>${esc(name)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</button>`;

    function slide(id) {
        if (id === 'rider') {
            return ['Qui roule ?', 'Garçon ou fille : tu pourras changer à tout moment (ici ou dans les paramètres).',
                `<div class="love-choices love-choices--two">${choice('rider', 'boy', riderChoice() === 'boy', '🧔🏾‍♂️', 'Garçon', 'Bonnet, bandeau, barbe légère')}
                ${choice('rider', 'girl', riderChoice() === 'girl', '👩🏾‍🦱', 'Fille', 'Vanilles ou afro, avec des perles')}</div>`];
        }
        if (id === 'hair') {
            return ['Sa coiffure', 'Ses cheveux sortent du bonnet sur les côtés et dans le dos.',
                `<div class="love-choices love-choices--two">${HAIRS.map(([h, name, hint]) => choice('hair', h, hairChoice() === h, h === 'vanilles' ? '〰️' : '☁️', name, hint)).join('')}</div>`];
        }
        if (id === 'outfit') {
            return ['Ta tenue Love&Faith', 'Les créations du site, au dos et sur la poitrine.',
                `<div class="love-outfits">${OUTFITS.map(([o, name]) => `<button type="button" class="love-outfit ${o === outfit() ? 'is-on' : ''}" data-outfit="${o}">
                    <img src="${FILES}icon-${o}.webp" alt=""><span>${esc(name)}</span></button>`).join('')}</div>`];
        }
        if (id === 'band') {
            const [, , color, inkColor] = bandChoice();
            return ['Ton bandeau', 'Sur les yeux : l’amour rend aveugle.',
                `<div class="love-band-preview" style="--band:${color};--band-ink:${inkColor}"><span>L’amour rend aveugle</span></div>
                <div class="love-bands">${BANDS.map(([b, name, c, k]) => `<button type="button" class="love-band ${b === bandChoice()[0] ? 'is-on' : ''}" data-band="${b}"
                    style="--band:${c};--band-ink:${k}" aria-label="Bandeau ${esc(name)}"><span>${esc(name)}</span></button>`).join('')}</div>`];
        }
        const mode = music.mode;
        return ['La musique', 'Elle tourne au hasard pendant la course.',
            `<div class="love-choices love-choices--three">${MUSIC_MODES.map(([m, name]) => choice('music', m, mode === m, m === 'anasheed' ? '🌙' : m === 'both' ? '🔀' : '🎵', name, MUSIC_HINTS[m])).join('')}</div>
            <button type="button" class="love-voices ${voicesOn() ? 'is-on' : ''}" data-act="voices" aria-pressed="${voicesOn()}">
                <span>${voicesOn() ? '🗣️ Voix IA activées' : '🔇 Voix IA coupées'}</span><small>pendant la course · toucher pour changer</small></button>
            ${mode === 'anasheed' ? '' : '<div class="love-player" id="love-player-slot"></div>'}`];
    }

    function renderStudio(direction = 0) {
        const list = steps();
        slideAt = Math.max(0, Math.min(list.length - 1, slideAt));
        const id = list[slideAt];
        const [title, hint, body] = slide(id);
        const best = Number(readLocal(BEST_KEY)) || 0;
        $('love-screen').classList.add('is-studio');
        show(`
            <div class="love-studio__top">
                <img class="love-studio__logo" src="${FILES}logo-heart.png" alt="">
                <div><p class="love-kicker">LOVE&amp;FAITH × 51WHELING</p><b class="love-studio__name">Répare ton cœur</b></div>
                <button type="button" class="love-close" data-act="close" aria-label="Fermer">✕</button>
            </div>
            <div class="love-steps">${list.map((s, i) => `<button type="button" class="love-step ${i === slideAt ? 'is-on' : ''} ${i < slideAt ? 'is-done' : ''}" data-step="${i}">${STEP_LABELS[s]}</button>`).join('')}</div>
            <div class="love-slide ${direction > 0 ? 'from-right' : direction < 0 ? 'from-left' : ''}" id="love-slide">
                <h3 class="love-slide__title">${esc(title)}</h3>
                <p class="love-slide__hint">${esc(hint)}</p>
                ${body}
            </div>
            <div class="love-nav">
                <button type="button" class="love-arrow" data-act="prev" ${slideAt === 0 ? 'disabled' : ''} aria-label="Précédent">‹</button>
                <span class="love-nav__dots">${list.map((_, i) => `<i class="${i === slideAt ? 'is-on' : ''}"></i>`).join('')}</span>
                <button type="button" class="love-arrow" data-act="next" ${slideAt === list.length - 1 ? 'disabled' : ''} aria-label="Suivant">›</button>
            </div>
            <div class="love-actions">
                <button type="button" class="love-btn love-btn--ghost" data-act="tuto">Tutoriel</button>
                <button type="button" class="love-btn love-btn--primary" data-act="play">❤ JOUER</button>
            </div>
            ${best ? `<p class="love-best">Ton record : cœur réparé en <b>${formatTime(best)}</b></p>` : ''}`);
        $('love-card').classList.add('love-card--studio');
        const slot = $('love-player-slot');
        if (slot) mountPlayer(slot);
        else parkPlayer();
    }

    function open() {
        if (!loveUnlocked()) return;
        addFonts();
        studioOn = true;
        slideAt = 0;
        deps.v2()?.setOutfit(look());
        // SoundCloud's player loaded now (out of sight): ready for JOUER even
        // without a look at the music slide.
        if (music.mode !== 'anasheed') music.mount($('love-music'));
        renderStudio();
        deps.showroom(true);
        if (readLocal(TUTO_KEY) === null) tutorial(0);
    }

    // Out of the studio: the race starts, or back to the modes.
    function closeStudio(toMenu) {
        if (!studioOn) return;
        studioOn = false;
        hidePanel();
        $('love-screen').classList.remove('is-studio');
        deps.showroom(false);
        if (toMenu) {
            deps.v2()?.setOutfit(null);
            deps.menu();
        }
    }

    function goStep(next) {
        const list = steps();
        const target = Math.max(0, Math.min(list.length - 1, next));
        if (target === slideAt) return;
        const direction = Math.sign(target - slideAt);
        slideAt = target;
        renderStudio(direction);
    }

    // A choice made: seen on the rider at once.
    function chosen() {
        deps.v2()?.setOutfit(look());
        if (studioOn) renderStudio(0);
        applyWear();
    }

    // --- The tutorial: a screen of the game for each thing to know. ----------------
    let tutoAt = 0;
    function tutorial(at = 0) {
        addFonts();
        tutoAt = Math.max(0, Math.min(TUTORIAL.length - 1, at));
        const [title, text] = TUTORIAL[tutoAt];
        const last = tutoAt === TUTORIAL.length - 1;
        $('love-tuto-card').innerHTML = `
            <div class="love-tuto__shot"><img src="${FILES}tuto/tuto-${tutoAt + 1}.webp" alt=""><span class="love-tuto__num">${tutoAt + 1}/${TUTORIAL.length}</span></div>
            <h3 class="love-tuto__title">${esc(title)}</h3>
            <p class="love-tuto__text">${esc(text)}</p>
            <div class="love-nav__dots">${TUTORIAL.map((_, i) => `<i class="${i === tutoAt ? 'is-on' : ''}"></i>`).join('')}</div>
            <div class="love-actions">
                <button type="button" class="love-btn love-btn--ghost" data-act="tuto-skip">${last ? 'Revoir' : 'Passer'}</button>
                <button type="button" class="love-btn love-btn--primary" data-act="${last ? 'tuto-done' : 'tuto-next'}">${last ? 'C’EST PARTI' : 'SUIVANT'}</button>
            </div>`;
        $('love-tuto').hidden = false;
        // SoundCloud's player (over its place in the panel) out of the way.
        parkPlayer();
    }
    function closeTutorial() {
        $('love-tuto').hidden = true;
        writeLocal(TUTO_KEY, '1');
        if (studioOn) renderStudio(0);
    }

    // The SoundCloud player: shown over its place in the panel (a tap on it
    // starts the sound on iPhone), out of sight during the ride (the title
    // shows at the top). Never moved in the page: an iframe moved reloads.
    let playerSlot = null;
    function mountPlayer(slot) {
        const holder = $('love-music');
        music.mount(holder);
        playerSlot = slot;
        holder.classList.add('is-shown');
        const follow = () => {
            if (playerSlot !== slot || !slot.isConnected || $('love-screen').hidden) return;
            const box = slot.getBoundingClientRect();
            holder.style.left = `${box.left}px`;
            holder.style.top = `${box.top}px`;
            holder.style.width = `${box.width}px`;
            holder.style.height = `${box.height}px`;
            // Cut where the slide scrolls it out of sight.
            const view = slot.closest('.love-slide')?.getBoundingClientRect();
            if (view) {
                const top = Math.max(0, view.top - box.top);
                const bottom = Math.max(0, box.bottom - view.bottom);
                holder.style.clipPath = `inset(${top}px 0 ${bottom}px 0 round 10px)`;
            } else {
                holder.style.clipPath = '';
            }
            requestAnimationFrame(follow);
        };
        follow();
    }
    function parkPlayer() {
        playerSlot = null;
        $('love-music').classList.remove('is-shown');
    }

    // Swipes: the slides (the studio's, the tutorial's); a finger elsewhere
    // turns the rider.
    let swipe = null;
    root.addEventListener('pointerdown', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const inTuto = !!target?.closest('#love-tuto');
        const inSlide = !!target?.closest('#love-slide');
        const free = studioOn && !inTuto && target?.closest('#love-screen') && !target.closest('#love-card');
        if (!inTuto && !inSlide && !free) return;
        swipe = { x: event.clientX, y: event.clientY, lastX: event.clientX, inTuto, free };
    });
    root.addEventListener('pointermove', (event) => {
        if (!swipe?.free) return;
        deps.v2()?.showroomTurn((event.clientX - swipe.lastX) * 0.012);
        swipe.lastX = event.clientX;
    });
    root.addEventListener('pointerup', (event) => {
        if (!swipe) return;
        const dx = event.clientX - swipe.x;
        const dy = event.clientY - swipe.y;
        const { inTuto, free } = swipe;
        swipe = null;
        if (free || Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        if (inTuto) tutorial(tutoAt + (dx < 0 ? 1 : -1));
        else goStep(slideAt + (dx < 0 ? 1 : -1));
    });

    function welcome() {
        show(`
            <img class="love-logo love-logo--big" src="${FILES}logo-heart.png" alt="Love&Faith">
            <p class="love-kicker">ACCÈS TESTEUR</p>
            <h2 class="love-title">Événement Love&amp;Faith débloqué</h2>
            <p class="love-text">Un monde à part, en partenariat avec Love&amp;Faith : répare ton cœur à coups de wheeling. Il n’est pas encore public : garde le code pour toi.</p>
            <button type="button" class="love-btn love-btn--primary" data-act="open">❤ Y ALLER</button>
            <button type="button" class="love-btn love-btn--ghost" data-act="close">Plus tard</button>`);
    }

    function unlockFromCode() {
        const first = !loveUnlocked();
        writeLocal(UNLOCK_KEY, '1');
        if (first) deps.stat('loveUnlocks');
        installEntry();
        installSettings();
        installWear();
        welcome();
    }

    // The entry on the mode screen, once unlocked.
    function installEntry() {
        if (!loveUnlocked() || document.getElementById('select-love')) return;
        const anchor = document.getElementById('select-live') || document.getElementById('select-freemode');
        if (!anchor) return;
        const entry = document.createElement('button');
        entry.type = 'button';
        entry.id = 'select-love';
        entry.className = 'love-entry';
        entry.innerHTML = `<img src="${FILES}logo-heart.png" alt=""><span class="love-entry__title">LOVE&amp;FAITH</span><span class="love-entry__sub">Événement · répare ton cœur</span>`;
        anchor.after(entry);
        entry.addEventListener('click', () => open());
    }

    // --- The run ------------------------------------------------------------------------
    function begin() {
        if (!items) items = createItemFactory();
        if (!rain) rain = createRain(deps.scene);
        if (!puddles) puddles = createPuddles(deps.scene);
        if (!clouds) clouds = createCloudSea(deps.scene);
        clearRun();
        Object.assign(run, {
            on: true, love: LOVE.start, shownLove: LOVE.start, nextZ: null, time: 0, ended: false, caught: 0, hits: 0,
            thoughtAt: 6 + Math.random() * 4, tearAt: 0, slot: 0, lastZ: null, hitUntil: 0, cloud: 0, outcome: null,
            end: 0, cityHidden: false, storm: null, shownScore: 0
        });
        $('love-points').textContent = '0 pts';
        // The effects lower and softer, the AI voices off (unless asked for).
        deps.mix?.(true);
        hidePanel();
        parkPlayer();
        writeLocal(LAST_KEY, String(Date.now()));
        $('love-hud').hidden = false;
        document.body.classList.add('love-on');
        showBar();
        const v2 = deps.v2();
        v2?.setOutfit(look());
        v2?.rider.setMood(0);
        updateSky(0, true);
        deps.stat('loveRuns');
        setTimeout(() => {
            if (run.on && !run.ended) ink.write('Répare ton cœur', { tone: 'love', size: 40, className: 'ink--slot0', hold: 1.6 });
        }, 600);
    }

    function clearRun() {
        for (const item of run.items) deps.scene.remove(item.object);
        run.items = [];
        for (const tear of tears) deps.scene.remove(tear.mesh);
        tears.length = 0;
        for (const spark of sparks) deps.scene.remove(spark.sprite);
        sparks.length = 0;
        puddles?.clear();
        ink.clear();
    }

    // A new stretch of road [from, to] (z decreasing ahead): its slots.
    function spawn(from, to) {
        if (!run.on || run.ended || run.outcome) return;
        const bike = deps.bike();
        const perSecond = Math.max(1, deps.speed() * 60);
        const gap = Math.max(SPAWN.minGap, Math.min(SPAWN.maxGap, perSecond * SPAWN.seconds));
        if (run.nextZ === null) run.nextZ = Math.min(to, bike.position.z - perSecond * SPAWN.calm);
        const bad = SPAWN.bad + SPAWN.badMore * Math.min(1, run.time / SPAWN.badRampSeconds);
        if (run.shownLove < LOVE.sun && Math.random() < PUDDLES.chance) {
            const big = Math.random() < PUDDLES.big;
            const width = big ? 5 + Math.random() * 3.5 : 2.6 + Math.random() * 2;
            const length = big ? 10 + Math.random() * 8 : 4 + Math.random() * 4;
            puddles.add((Math.random() * 2 - 1) * (8 - width / 2), from + Math.random() * (to - from), width, length);
        }
        while (run.nextZ > from) {
            const z = run.nextZ;
            run.nextZ -= gap * (0.75 + Math.random() * 0.5);
            if (z > to) continue;
            const roll = Math.random();
            let kind = null;
            if (roll < SPAWN.good) kind = pick(['heart', 'heart', 'hug', 'letter']);
            else if (roll < SPAWN.good + bad) kind = Math.random() < 0.55 ? 'broken' : 'tear';
            if (!kind) continue;
            const x = (Math.random() * 2 - 1) * SPAWN.width;
            const item = items.create(kind, x, SPAWN.height, z);
            deps.scene.add(item.object);
            run.items.push(item);
        }
    }

    // Each physics step: what the bike went through.
    function step(dt) {
        if (!run.on || run.ended) return;
        run.time += dt;
        const bike = deps.bike().position;
        const v2 = deps.v2();
        if (v2 && puddles) {
            const splash = puddles.step(dt, v2.rider, deps.speed() * 60);
            if (splash > 0) chimes.splash(splash);
        }
        const lastZ = run.lastZ ?? bike.z;
        run.lastZ = bike.z;
        for (const item of run.items) {
            if (item.done) continue;
            const spec = ITEM_KINDS[item.kind];
            const crossed = lastZ + 0.9 >= item.z && bike.z - 0.9 <= item.z;
            if (!crossed || Math.abs(bike.x - item.x) > spec.radius) continue;
            if (!spec.good && run.time < run.hitUntil) continue;
            item.done = true;
            meet(item, spec);
            if (run.ended) return;
        }
        // Behind the bike: gone.
        run.items = run.items.filter((item) => {
            if (item.object.position.z <= bike.z + 25 && !(item.done && item.gone)) return true;
            deps.scene.remove(item.object);
            return false;
        });
    }

    function meet(item, spec) {
        const before = run.love;
        run.love = Math.max(0, Math.min(LOVE.max, run.love + spec.love));
        burst(item);
        if (spec.good) {
            run.caught++;
            deps.stat('lovePickups');
            chimes.good(run.caught);
            bump('is-up');
            say(pick(WORDS[item.kind]), 'love');
        } else {
            run.hits++;
            run.hitUntil = run.time + 0.6;
            deps.stat('loveHits');
            if (item.kind === 'broken') chimes.broken();
            else chimes.tear();
            bump('is-down');
            flash(item.kind);
            say(pick(WORDS[item.kind]), 'sad');
            if (navigator.vibrate) navigator.vibrate(item.kind === 'broken' ? [40, 60, 40] : 30);
        }
        showBar();
        // The sun comes out (or goes in) at 12.
        if ((before < LOVE.sun) !== (run.love < LOVE.sun)) flash(run.love >= LOVE.sun ? 'sun' : 'cloud');
        if (run.love >= LOVE.max) finishRun('repaired');
        else if (run.love <= 0) finishRun('broken');
    }

    // Two at most at once, one under the other.
    function say(text, tone) {
        const slot = run.slot++ % 2;
        ink.write(text, { tone, size: tone === 'love' ? 36 : 32, className: `ink--slot${slot}`, hold: 1.1 });
    }

    function flash(kind) {
        const box = $('love-flash');
        box.className = 'love-flash';
        void box.offsetWidth;
        box.className = `love-flash is-${kind}`;
    }

    function finishRun(kind) {
        if (run.ended) return;
        run.ended = true;
        run.outcome = kind;
        // Nothing more on the road: the ones ahead go.
        for (const item of run.items) deps.scene.remove(item.object);
        run.items = [];
        if (kind === 'repaired') {
            chimes.repaired();
            // The road turns into a sea of clouds.
            clouds.start(deps.bike().position);
        } else {
            // The emotional storm.
            run.storm = { t: 0, next: 0.15, said: 0, swept: false, vx: 0 };
            chimes.thunder(1.2);
            flash('lightning');
        }
        deps.end(kind);
    }

    // --- Each frame -----------------------------------------------------------------------
    const sky = { ambience: 'golden', dusk: 0 };
    function updateSky(dt, now = false) {
        // The weather follows the bar, gently.
        const target = run.outcome === 'repaired' ? LOVE.max : run.love;
        run.shownLove += (target - run.shownLove) * (now ? 1 : Math.min(1, dt * 1.4));
        const love = run.shownLove;
        let rainAmount = 0;
        if (love < LOVE.sun) {
            sky.ambience = 'overcast';
            const sadness = (LOVE.sun - love) / LOVE.sun;
            sky.dusk = Math.min(0.97, 0.12 + sadness * 0.9);
            rainAmount = Math.min(1, 0.2 + sadness * 0.95);
        } else {
            sky.ambience = love >= 16 ? 'day' : 'golden';
            sky.dusk = 0;
        }
        if (run.outcome === 'broken') {
            rainAmount = 1;
            sky.ambience = 'overcast';
            sky.dusk = 0.99;
        }
        if (run.outcome === 'repaired') {
            sky.ambience = 'day';
            sky.dusk = 0;
        }
        deps.v2()?.setSky({ ...sky });
        return rainAmount;
    }

    function frame(dt) {
        if (!run.on) return;
        // The wheeling's points, added to the cumulative points at the end.
        const score = run.ended ? run.shownScore : deps.score?.() || 0;
        if (score !== run.shownScore) {
            run.shownScore = score;
            $('love-points').textContent = `${fmtPoints(score)} pts`;
        }
        const t = performance.now() / 1000;
        const v2 = deps.v2();
        const camera = deps.camera;
        for (const item of run.items) items.animate(item, t, camera.position);
        const rainAmount = dt > 0 ? updateSky(dt) : 0;
        if (rain && dt > 0) rain.update(dt, camera, rainAmount, deps.speed() * 60, run.storm ? 26 + Math.min(30, run.storm.t * 10) : 0);
        puddles?.frame(dt, rain ? rain.amount : 0, deps.bike().position.z + 40, camera.position.z);
        // The rider's mood.
        const sadness = run.outcome === 'repaired' ? 0 : Math.max(0, Math.min(1, (LOVE.sun - run.shownLove) / 8));
        v2?.rider.setMood(run.outcome === 'broken' ? 1 : sadness);
        if (dt > 0 && !run.outcome) moodMoments(dt, sadness);
        updateTears(dt, sadness);
        updateSparks(dt);
        const endDt = dt * (run.ended ? cinematicSpeed() : 1);
        if (endDt > 0 && run.outcome === 'repaired') seaOfClouds(endDt);
        if (endDt > 0 && run.storm) storm(endDt);
        if (endDt > 0 && run.endCard) {
            run.endCard.left -= endDt;
            if (run.endCard.left <= 0) {
                const showCard = run.endCard.show;
                run.endCard = null;
                endCinematic('love-end');
                showCard();
            }
        }
        ink.update();
    }

    function moodMoments(dt, sadness) {
        if (sadness <= 0.05) return;
        run.thoughtAt -= dt;
        if (run.thoughtAt > 0) return;
        run.thoughtAt = 11 - sadness * 4 + Math.random() * 4;
        deps.v2()?.rider.shakeHead();
        ink.write(pick(WORDS.thought), { tone: 'thought', size: 30, hold: 1.3, place: headOnScreen });
    }

    // Above the rider's head, on the screen.
    const headPoint = new THREE.Vector3();
    function headOnScreen() {
        const v2 = deps.v2();
        if (!v2) return null;
        v2.rider.eyePoint(headPoint, 0);
        headPoint.y += 1.2;
        headPoint.project(deps.camera);
        return { x: (headPoint.x + 1) / 2 * window.innerWidth, y: (1 - headPoint.y) / 2 * window.innerHeight };
    }

    function updateTears(dt, sadness) {
        const v2 = deps.v2();
        if (v2 && sadness > 0.4 && !run.outcome && dt > 0) {
            run.tearAt -= dt;
            if (run.tearAt <= 0) {
                run.tearAt = 0.18 + (1 - sadness) * 0.6 + Math.random() * 0.25;
                const side = Math.random() < 0.5 ? -1 : 1;
                const mesh = new THREE.Mesh(tearGeometry, tearMaterial);
                v2.rider.eyePoint(mesh.position, side);
                mesh.scale.set(0.05, 0.08, 0.05);
                deps.scene.add(mesh);
                tears.push({ mesh, vy: 0.5, vx: side * 0.6, life: 0.9 });
            }
        }
        const drift = deps.speed() * 60 * 0.25;
        for (let i = tears.length - 1; i >= 0; i--) {
            const tear = tears[i];
            tear.life -= dt;
            tear.vy -= 9 * dt;
            tear.mesh.position.y += tear.vy * dt;
            tear.mesh.position.x += tear.vx * dt;
            tear.mesh.position.z += drift * dt;
            if (tear.life <= 0 || tear.mesh.position.y < 0) {
                deps.scene.remove(tear.mesh);
                tears.splice(i, 1);
            }
        }
    }

    function burst(item) {
        if (!sparkMaterial) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.font = '52px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❤', 32, 36);
            const texture = new THREE.CanvasTexture(canvas);
            sparkMaterial = { good: new THREE.SpriteMaterial({ map: texture, color: 0xff4f73, transparent: true, depthWrite: false }),
                bad: new THREE.SpriteMaterial({ map: texture, color: 0x7f8fb8, transparent: true, depthWrite: false }) };
        }
        const good = ITEM_KINDS[item.kind].good;
        const origin = item.object.position;
        for (let i = 0; i < (good ? 10 : 6); i++) {
            const sprite = new THREE.Sprite(good ? sparkMaterial.good : sparkMaterial.bad);
            sprite.position.copy(origin);
            sprite.scale.setScalar(0.35 + Math.random() * 0.25);
            deps.scene.add(sprite);
            const angle = Math.random() * Math.PI * 2;
            sparks.push({ sprite, vx: Math.cos(angle) * 3, vy: 2 + Math.random() * 3, vz: Math.sin(angle) * 2 - deps.speed() * 60 * 0.6, life: 0.7 });
        }
        item.gone = true;
        deps.scene.remove(item.object);
    }

    function updateSparks(dt) {
        for (let i = sparks.length - 1; i >= 0; i--) {
            const spark = sparks[i];
            spark.life -= dt;
            spark.vy -= 6 * dt;
            spark.sprite.position.x += spark.vx * dt;
            spark.sprite.position.y += spark.vy * dt;
            spark.sprite.position.z += spark.vz * dt;
            if (spark.life <= 0) {
                deps.scene.remove(spark.sprite);
                sparks.splice(i, 1);
            }
        }
    }

    // Mended: the clouds cover the road and the city goes under them; the
    // bike rides on over them a moment, then into the cloud.
    const skyFog = new THREE.Color(0xf7e8f2);
    function seaOfClouds(dt) {
        run.end += dt;
        const k = clouds.update(dt, deps.bike().position, deps.camera);
        const fog = deps.scene.fog;
        if (fog && run.end < 3.2) {
            // Far and soft over the clouds.
            fog.color.lerp(skyFog, Math.min(1, dt * 1.5));
            fog.far += (320 - fog.far) * Math.min(1, dt);
        }
        if (k >= 1 && !run.cityHidden) {
            run.cityHidden = true;
            deps.city(false);
        }
        if (run.end > 3.2) intoCloud(dt);
    }

    // The storm: lightning, thunder, rain and wind across, the picture
    // shaking, the words; then the gust takes the rider away.
    function storm(dt) {
        const s = run.storm;
        s.t += dt;
        s.next -= dt;
        if (s.next <= 0) {
            s.next = 0.55 + Math.random() * 1.1;
            flash('lightning');
            setTimeout(() => chimes.thunder(0.6 + Math.random() * 0.6), 120 + Math.random() * 400);
        }
        if (s.said === 0 && s.t > 0.5) {
            s.said = 1;
            ink.write('Tempête émotionnelle', { tone: 'storm', size: Math.min(46, window.innerWidth / 9), className: 'ink--center', hold: 4 });
        }
        if (s.said === 1 && s.t > 1.8) {
            s.said = 2;
            ink.write('Elle emporte tout sur son passage', { tone: 'storm', size: Math.min(27, window.innerWidth / 15), className: 'ink--center2', hold: 2.8 });
        }
        // The picture shakes harder and harder.
        const camera = deps.camera;
        camera.position.sub(shake);
        const amount = Math.min(1, s.t / 1.6) * 0.14;
        shake.set((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount, 0);
        camera.position.add(shake);
        blowDebris(dt, s);
        // The gust: the rider and the bike carried away.
        if (s.t > 2.7) {
            const bike = deps.bike();
            if (!s.swept) {
                s.swept = true;
                deps.cameraHold(true);
                deps.v2()?.rider.shakeHead();
            }
            s.vx = Math.min(48, s.vx + 42 * dt);
            bike.position.x += s.vx * dt;
            bike.position.y = Math.min(6, bike.position.y + s.vx * 0.05 * dt);
            bike.rotation.z -= 2.6 * dt;
            bike.rotation.x += 0.9 * dt;
        }
    }

    function blowDebris(dt, s) {
        if (!debrisMaterials) {
            const make = (draw) => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 32;
                draw(canvas.getContext('2d'));
                const texture = new THREE.CanvasTexture(canvas);
                texture.colorSpace = THREE.SRGBColorSpace;
                return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
            };
            debrisMaterials = [
                make((ctx) => { ctx.fillStyle = '#5a3a1a'; ctx.beginPath(); ctx.ellipse(16, 16, 13, 6, 0.6, 0, Math.PI * 2); ctx.fill(); }),
                make((ctx) => { ctx.fillStyle = '#7a5a20'; ctx.beginPath(); ctx.ellipse(16, 16, 11, 5, -0.4, 0, Math.PI * 2); ctx.fill(); }),
                make((ctx) => { ctx.fillStyle = '#e8e4da'; ctx.fillRect(7, 9, 18, 14); })
            ];
        }
        const camera = deps.camera;
        const want = Math.min(110, 30 + s.t * 30);
        while (debris.length < want) {
            const sprite = new THREE.Sprite(debrisMaterials[Math.floor(Math.random() * debrisMaterials.length)]);
            sprite.scale.setScalar(0.25 + Math.random() * 0.45);
            sprite.position.set(camera.position.x - 22 - Math.random() * 20, 0.3 + Math.random() * 7, camera.position.z - 4 - Math.random() * 45);
            deps.scene.add(sprite);
            debris.push({ sprite, vx: 26 + Math.random() * 30, vy: (Math.random() - 0.3) * 4, spin: (Math.random() - 0.5) * 12 });
        }
        for (let i = debris.length - 1; i >= 0; i--) {
            const d = debris[i];
            d.sprite.position.x += d.vx * dt;
            d.sprite.position.y += (d.vy + Math.sin(performance.now() / 180 + i) * 2) * dt;
            d.sprite.material.rotation += d.spin * dt;
            if (d.sprite.position.x > camera.position.x + 24) {
                deps.scene.remove(d.sprite);
                debris.splice(i, 1);
            }
        }
    }

    // The fog closes in, pink and white: a cloud.
    const cloudColor = new THREE.Color(0xffe3ec);
    function intoCloud(dt) {
        run.cloud = Math.min(1, run.cloud + dt / 3.5);
        const fog = deps.scene.fog;
        if (!fog) return;
        const k = run.cloud * run.cloud;
        fog.color.lerp(cloudColor, Math.min(1, dt * 2.5));
        fog.near = fog.near + (2 - fog.near) * k * Math.min(1, dt * 2);
        fog.far = fog.far + (38 - fog.far) * k * Math.min(1, dt * 2);
    }

    // --- The end ---------------------------------------------------------------------------
    function formatTime(seconds) {
        const s = Math.max(0, Math.round(seconds));
        return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
    }

    // kind: 'repaired' | 'broken' | 'fall'.
    function finish(kind, { seconds = run.time, points = 0 } = {}) {
        run.outcome = run.outcome || kind;
        run.ended = true;
        run.shownScore = points;
        $('love-points').textContent = `${fmtPoints(points)} pts`;
        const best = Number(readLocal(BEST_KEY)) || 0;
        let record = false;
        const shopNew = kind === 'repaired' && !shopOpen();
        if (kind === 'repaired') {
            deps.stat('loveRepaired');
            markWon(riderChoice());
            if (!best || seconds < best) {
                writeLocal(BEST_KEY, String(Math.round(seconds)));
                record = !!best;
            }
        } else if (kind === 'broken') {
            deps.stat('loveBroken');
        }
        const delay = kind === 'repaired' ? 5600 : kind === 'broken' ? 5400 : 1400;
        beginCinematic('love-end');
        run.endCard = {
            left: delay / 1000,
            show: () => {
                if (!run.on) return;
                const title = kind === 'repaired' ? 'Cœur réparé' : kind === 'broken' ? 'Cœur brisé' : 'Chute…';
                const sub = kind === 'repaired' ? 'MISSION RÉUSSIE' : kind === 'broken' ? 'PERDU · LA TEMPÊTE A TOUT EMPORTÉ' : 'LE CŒUR À ' + run.love + '/' + LOVE.max;
                const gender = riderChoice();
                const who = gender === 'girl' ? 'la fille' : 'le garçon';
                const reward = kind !== 'repaired' ? ''
                    : owned(gender) ? `<p class="love-reward">Ce perso est à toi : porte-le partout dans « Personnage ».</p>`
                        : `<div class="love-reward"><b>Débloqué : ${who} pour tout le jeu</b>
                        <span>${fmtPoints(CHARACTER_PRICE)} points, ou son code dans « Personnage »</span>
                        <button type="button" class="love-btn love-btn--gold" data-act="buy-rider" ${deps.points() < CHARACTER_PRICE ? 'disabled' : ''}>
                            ${deps.points() < CHARACTER_PRICE ? `Il te manque ${fmtPoints(CHARACTER_PRICE - deps.points())} pts` : `ACHETER · ${fmtPoints(CHARACTER_PRICE)} PTS`}</button></div>`;
                show(`
                <p class="love-kicker">LOVE&amp;FAITH × 51WHELING</p>
                <div class="love-end__title" id="love-end-title"></div>
                <p class="love-end__sub ${kind === 'repaired' ? 'is-win' : ''}">${sub}</p>
                <dl class="love-stats">
                    <div><dt>Temps</dt><dd>${formatTime(seconds)}</dd></div>
                    <div><dt>Attrapés</dt><dd>${run.caught}</dd></div>
                    <div><dt>Touchés</dt><dd>${run.hits}</dd></div>
                </dl>
                <p class="love-gain"><b>+${fmtPoints(points)}</b> points cumulés</p>
                ${record ? '<p class="love-best is-record">Nouveau record !</p>' : ''}
                ${reward}
                ${shopNew ? `<p class="love-reward love-reward--shop"><b>🛍️ Boutique Love&amp;Faith ouverte</b> · sweats, bonnet et bandeau, dans « Personnage »</p>` : ''}
                ${kind === 'broken' ? '<p class="love-text">L’amour se reconstruit : remonte la barre, évite les larmes.</p>' : ''}
                <div class="love-end__actions">
                    <button type="button" class="love-btn love-btn--primary" data-act="again">❤ REJOUER</button>
                    <button type="button" class="love-btn love-btn--ghost" data-act="menu">Menu</button>
                </div>`, true);
                $('love-card').classList.add(`love-card--${kind}`);
                // The title written by the pen, in the card.
                const holder = $('love-end-title');
                const local = createInk(holder);
                local.write(title, { tone: kind === 'repaired' ? 'win' : 'sad', size: kind === 'repaired' ? 64 : 56, hold: 9999 });
                const tick = () => {
                    if (!holder.isConnected) return;
                    local.update();
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }
        };
    }

    // Out of the event (back to the menu, or before another race).
    function leave({ keepMusic = false } = {}) {
        run.on = false;
        run.ended = true;
        run.endCard = null;
        endCinematic('love-end');
        clearRun();
        deps.mix?.(false);
        rain?.hide();
        clouds?.stop();
        for (const d of debris) deps.scene.remove(d.sprite);
        debris.length = 0;
        deps.camera.position.sub(shake);
        shake.set(0, 0, 0);
        run.storm = null;
        if (run.cityHidden) deps.city(true);
        run.cityHidden = false;
        deps.cameraHold(false);
        $('love-flash').className = 'love-flash';
        hidePanel();
        $('love-hud').hidden = true;
        document.body.classList.remove('love-on');
        const v2 = deps.v2();
        v2?.setSky(null);
        v2?.setOutfit(null);
        applyWear();
        v2?.rider.setMood(0);
        if (!keepMusic) {
            music.stop();
            $('love-now').hidden = true;
        }
    }

    root.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-act], [data-outfit], [data-band], [data-rider], [data-hair], [data-music], [data-step]') : null;
        if (!target || target.disabled) return;
        if (target.dataset.step) {
            goStep(Number(target.dataset.step));
            return;
        }
        if (target.dataset.rider) {
            setRider(target.dataset.rider);
            return;
        }
        if (target.dataset.hair) {
            writeLocal(HAIR_KEY, target.dataset.hair);
            chosen();
            return;
        }
        if (target.dataset.music) {
            setMusic(target.dataset.music);
            return;
        }
        if (target.dataset.band) {
            writeLocal(BAND_KEY, target.dataset.band);
            chosen();
            return;
        }
        if (target.dataset.outfit) {
            writeLocal(OUTFIT_KEY, target.dataset.outfit);
            chosen();
            return;
        }
        const act = target.dataset.act;
        if (act === 'close') {
            if (studioOn) closeStudio(true);
            else hidePanel();
        } else if (act === 'open') {
            open();
        } else if (act === 'prev' || act === 'next') {
            goStep(slideAt + (act === 'next' ? 1 : -1));
        } else if (act === 'voices') {
            setVoices(!voicesOn());
        } else if (act === 'tuto') {
            tutorial(0);
        } else if (act === 'tuto-next') {
            tutorial(tutoAt + 1);
        } else if (act === 'tuto-skip') {
            if (tutoAt === TUTORIAL.length - 1) tutorial(0);
            else closeTutorial();
        } else if (act === 'tuto-done') {
            closeTutorial();
        } else if (act === 'play') {
            // The tap starts the sound (and the chimes) now.
            if (!readLocal(RIDER_KEY)) writeLocal(RIDER_KEY, riderChoice());
            chimes.unlock();
            music.start(Date.now() - (Number(readLocal(LAST_KEY)) || 0) > FRESH_MS ? { first: FIRST_TRACK } : {});
            closeStudio(false);
            deps.startRun();
        } else if (act === 'buy-rider') {
            if (target.dataset.confirm !== '1') {
                target.dataset.confirm = '1';
                target.textContent = `CONFIRMER · −${fmtPoints(CHARACTER_PRICE)} PTS`;
                return;
            }
            if (buy(riderChoice())) {
                const box = target.closest('.love-reward');
                if (box) box.innerHTML = '<b>Perso acheté !</b><span>Il est déjà sur ta moto. Change dans « Personnage ».</span>';
            }
        } else if (act === 'again') {
            chimes.unlock();
            music.start();
            leave({ keepMusic: true });
            deps.startRun();
        } else if (act === 'menu') {
            leave();
            deps.toMenu();
        }
    });

    function setRider(id) {
        writeLocal(RIDER_KEY, id === 'girl' ? 'girl' : 'boy');
        document.querySelectorAll('#love-settings [data-rider]').forEach((b) => b.classList.toggle('active', b.dataset.rider === riderChoice()));
        if (run.on || studioOn) chosen();
    }

    function setVoices(on) {
        writeLocal(VOICE_KEY, on ? '1' : '0');
        document.querySelectorAll('#love-settings [data-voices]').forEach((b) => b.classList.toggle('active', (b.dataset.voices === 'on') === voicesOn()));
        if (studioOn) renderStudio(0);
    }

    function setMusic(mode) {
        writeLocal(MUSIC_KEY, mode);
        music.setMode(mode);
        document.querySelectorAll('#love-settings [data-music]').forEach((b) => b.classList.toggle('active', b.dataset.music === mode));
        if (studioOn) renderStudio(0);
    }

    // The game's settings (Options): the event's rider, once unlocked.
    function installSettings() {
        if (!loveUnlocked() || document.getElementById('love-settings')) return;
        const group = document.querySelector('#submenu-options .settings-group');
        if (!group) return;
        const block = document.createElement('div');
        block.id = 'love-settings';
        block.innerHTML = `<h3>ÉVÉNEMENT LOVE&amp;FAITH</h3><div class="settings-group">
            <p class="setting-desc">Ton perso dans l’événement</p>
            ${RIDERS.map(([id, name, emoji]) => `<button type="button" class="setting-btn ${id === riderChoice() ? 'active' : ''}" data-rider="${id}">${emoji} ${name.toUpperCase()}</button>`).join('')}
            <p class="setting-desc">Musique de l’événement</p>
            ${MUSIC_MODES.map(([id, name]) => `<button type="button" class="setting-btn ${id === music.mode ? 'active' : ''}" data-music="${id}">${id === 'anasheed' ? '🌙' : id === 'both' ? '🔀' : '🎵'} ${name.toUpperCase()}</button>`).join('')}
            <p class="setting-desc">Voix IA pendant l’événement</p>
            <button type="button" class="setting-btn ${voicesOn() ? '' : 'active'}" data-voices="off">🔇 COUPÉES</button>
            <button type="button" class="setting-btn ${voicesOn() ? 'active' : ''}" data-voices="on">🗣️ ACTIVÉES</button>
        </div>`;
        group.after(block);
        block.addEventListener('click', (event) => {
            const button = event.target instanceof Element ? event.target.closest('[data-rider], [data-music], [data-voices]') : null;
            if (!button) return;
            if (button.dataset.voices) setVoices(button.dataset.voices === 'on');
            else if (button.dataset.music) setMusic(button.dataset.music);
            else setRider(button.dataset.rider);
        });
    }

    // --- The riders for the whole game ----------------------------------------------
    const fmtPoints = (value) => Math.floor(value).toLocaleString('fr-FR');
    const won = (gender) => readList(WON_KEY).includes(gender);
    const owned = (gender) => readList(OWNED_KEY).includes(gender);
    const wearing = () => {
        const gender = readLocal(WEAR_KEY);
        return (gender === 'boy' || gender === 'girl') && owned(gender) ? gender : '';
    };
    function addTo(key, gender) {
        const list = readList(key);
        if (!list.includes(gender)) writeLocal(key, JSON.stringify([...list, gender]));
    }
    function notifyShopSync() {
        document.dispatchEvent(new CustomEvent('wheelie:love-sync'));
    }
    function markWon(gender) {
        if (!won(gender)) deps.stat(`loveWon${gender === 'girl' ? 'Girl' : 'Boy'}`);
        addTo(WON_KEY, gender);
        renderWear();
        notifyShopSync();
    }
    function buy(gender) {
        if (owned(gender) || !won(gender) || !deps.spend(CHARACTER_PRICE)) return false;
        addTo(OWNED_KEY, gender);
        deps.stat('loveRiderBought');
        wear(gender);
        notifyShopSync();
        return true;
    }
    function redeem(code) {
        const gender = CHARACTER_CODES[String(code || '').trim().toUpperCase()];
        if (!gender) return null;
        addTo(OWNED_KEY, gender);
        deps.stat('loveRiderCode');
        wear(gender);
        notifyShopSync();
        return gender;
    }
    function wear(gender) {
        writeLocal(WEAR_KEY, gender || '');
        applyWear();
        renderWear();
    }

    // The shop: open once a heart has been mended (with either rider).
    const shopOpen = () => readList(WON_KEY).length > 0;
    const shopOwned = (id) => readList(SHOP_KEY).includes(id);
    function shopWorn() {
        let saved = {};
        try {
            saved = JSON.parse(readLocal(SHOP_WEAR_KEY) || '{}') || {};
        } catch {
            saved = {};
        }
        const sweat = SHOP_ITEMS.find((item) => item.print && item.print === saved.print && shopOwned(item.id));
        return { print: sweat ? sweat.print : null, head: !!saved.head && shopOwned('bonnet') };
    }
    // Worn on the rider's own look (a Love&Faith rider taken off for it).
    function shopWear(pieces) {
        writeLocal(SHOP_WEAR_KEY, JSON.stringify(pieces));
        writeLocal(WEAR_KEY, '');
        applyWear();
        renderWear();
    }
    function shopToggle(item) {
        const worn = shopWorn();
        const on = wearing() === '' && (item.head ? worn.head : worn.print === item.print);
        if (item.head) shopWear({ ...worn, head: !on });
        else shopWear({ ...worn, print: on ? null : item.print });
    }
    function shopBuy(item) {
        if (!shopOpen() || shopOwned(item.id) || !deps.spend(item.price)) return false;
        addTo(SHOP_KEY, item.id);
        deps.stat('loveShopBought');
        const worn = shopWorn();
        shopWear(item.head ? { ...worn, head: true } : { ...worn, print: item.print });
        notifyShopSync();
        return true;
    }

    // The chosen rider on the bike, in every mode (the event's own look
    // while racing it): a Love&Faith rider, or the shop's pieces on the
    // rider's own livery.
    function applyWear() {
        notifyShopSync();
        const gender = wearing();
        if (gender) {
            deps.v2()?.setBaseOutfit({ ...look(), gender });
            return;
        }
        const pieces = shopWorn();
        if (pieces.print || pieces.head) {
            deps.v2()?.setBaseOutfit({ parts: pieces, band: look().band });
        }
    }

    // The legacy text rider-wear panel is replaced by the visual gallery + boutique.
    function note() {}
    function installWear() {}
    function renderWear() {}
    document.getElementById('rider-btn')?.addEventListener('click', () => {
        installWear();
        note('');
        renderWear();
    });
    document.addEventListener('wheelie:points', () => renderWear());

    installEntry();
    installSettings();
    installWear();

    return {
        applyWear,
        voices: () => voicesOn(),
        open, unlockFromCode, installEntry, begin, spawn, step, frame, finish, leave,
        get active() { return run.on; },
        get love() { return run.love; },
        // Tests.
        debug: {
            run,
            set love(value) { run.love = value; showBar(); },
            get rain() { return rain ? rain.amount : 0; },
            get puddles() { return puddles ? puddles.count : 0; },
            get drops() { return puddles ? puddles.drops : 0; },
            get puddleSystem() { return puddles; },
            get music() { return music.playing; },
            get track() { return music.current; },
            get sounds() { return music.sounds; },
            // A puddle right in the bike's way.
            puddleAhead(width = 6, length = 12) {
                const bike = deps.bike().position;
                puddles.add(bike.x, bike.z - Math.max(30, deps.speed() * 60 * 0.8), width, length);
            },
            // One of these right in the bike's way.
            forceNext(kind) {
                const bike = deps.bike().position;
                const item = items.create(kind, bike.x, SPAWN.height, bike.z - Math.max(25, deps.speed() * 60 * 0.6));
                deps.scene.add(item.object);
                run.items.push(item);
            }
        }
    };
}
