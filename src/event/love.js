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
import { createMusic, MUSIC_CREDIT } from './music.js';
import { createPuddles } from './puddles.js';

export const LOVE_CODE = '5HC';
const UNLOCK_KEY = 'wheelie_love_event';
const OUTFIT_KEY = 'wheelie_love_outfit';
const BAND_KEY = 'wheelie_love_band';
const BEST_KEY = 'wheelie_love_best';
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
    const ctx = () => {
        if (!context) {
            const Context = window.AudioContext || window.webkitAudioContext;
            if (!Context) return null;
            context = new Context();
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
        osc.connect(gain).connect(c.destination);
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
            source.connect(filter).connect(gain).connect(c.destination);
            source.start();
        },
        repaired() {
            [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.9, 0.14));
        }
    };
}

// deps: { scene, camera, v2 (getter), bike (getter: the bike group),
// speed (getter: units a frame), startRun(), end(kind), toMenu(),
// stat(name, n), hud(on) }
export function createLoveEvent(deps) {
    const root = document.createElement('div');
    root.id = 'love-root';
    root.innerHTML = `
        <div class="love-hud" id="love-hud" hidden>
            <div class="love-brand"><img src="${FILES}logo-heart.png" alt=""><span>LOVE&amp;FAITH <i>×</i> 51WHELING</span></div>
            <div class="love-bar" id="love-bar" role="meter" aria-label="Barre d’amour" aria-valuemin="0" aria-valuemax="${LOVE.max}">
                <span class="love-bar__heart" aria-hidden="true">❤</span>
                <div class="love-bar__cells" id="love-cells"></div>
                <b class="love-bar__count" id="love-count"></b>
            </div>
            <div class="love-now" id="love-now" hidden><span>♪</span><a target="_blank" rel="noopener" id="love-now-title"></a></div>
        </div>
        <div class="love-ink" id="love-ink" aria-live="polite"></div>
        <div class="love-flash" id="love-flash"></div>
        <div class="love-screen" id="love-screen" hidden><div class="love-card" id="love-card"></div></div>
        <div class="love-music" id="love-music" aria-hidden="true"></div>`;
    document.body.append(root);
    const $ = (id) => root.querySelector(`#${id}`);
    const ink = createInk($('love-ink'));
    const chimes = createChimes();
    const music = createMusic({
        onTrack(track) {
            const now = $('love-now');
            if (!track) {
                now.hidden = true;
                return;
            }
            const link = $('love-now-title');
            link.textContent = `${MUSIC_CREDIT.name} — ${track.title}`;
            link.href = track.url || MUSIC_CREDIT.url;
            now.hidden = false;
        }
    });
    let items = null;
    let rain = null;
    const cells = [];
    for (let i = 0; i < LOVE.max; i++) {
        const cell = document.createElement('i');
        if (i === LOVE.sun - 1) cell.className = 'is-sun';
        $('love-cells').append(cell);
        cells.push(cell);
    }

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
    const look = () => {
        const [, , color, ink] = bandChoice();
        return { print: outfit(), band: { color, ink } };
    };
    let puddles = null;

    // --- The bar --------------------------------------------------------------------
    function showBar() {
        const love = run.love;
        cells.forEach((cell, i) => cell.classList.toggle('is-full', i < love));
        $('love-count').textContent = `${love}/${LOVE.max}`;
        $('love-bar').setAttribute('aria-valuenow', String(love));
        $('love-hud').classList.toggle('is-sad', love < LOVE.sun);
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

    function open() {
        if (!loveUnlocked()) return;
        const chosen = outfit();
        const best = Number(readLocal(BEST_KEY)) || 0;
        show(`
            <button type="button" class="love-close" data-act="close" aria-label="Fermer">✕</button>
            <img class="love-logo" src="${FILES}logo-heart.png" alt="Love&Faith">
            <p class="love-kicker">ÉVÉNEMENT · LOVE&amp;FAITH × 51WHELING</p>
            <h2 class="love-title">Répare ton cœur</h2>
            <ul class="love-rules">
                <li><b>Lève la roue</b> et roule : rien d’autre ne compte.</li>
                <li><span class="love-ico">❤ 🧸 ✉</span> Cœurs, câlins, lettres : <b>+1</b> d’amour.</li>
                <li><span class="love-ico">💔</span> Cœur brisé : <b>−3</b> · <span class="love-ico">💧</span> larme : <b>−2</b>.</li>
                <li>Tu pars à <b>${LOVE.start}</b>. Remplis la barre jusqu’à <b>${LOVE.max}</b> : cœur réparé. Sous ${LOVE.sun}, il pleut…</li>
            </ul>
            <h4 class="love-h4">Ta tenue Love&amp;Faith</h4>
            <div class="love-outfits">${OUTFITS.map(([id, name]) => `<button type="button" class="love-outfit ${id === chosen ? 'is-on' : ''}" data-outfit="${id}">
                <img src="${FILES}icon-${id}.webp" alt=""><span>${esc(name)}</span></button>`).join('')}</div>
            <h4 class="love-h4">Ton bandeau « L’amour rend aveugle »</h4>
            <div class="love-bands">${BANDS.map(([id, name, color, ink]) => `<button type="button" class="love-band ${id === bandChoice()[0] ? 'is-on' : ''}" data-band="${id}"
                style="--band:${color};--band-ink:${ink}" aria-label="Bandeau ${esc(name)}"><span>${esc(name)}</span></button>`).join('')}</div>
            <h4 class="love-h4">Musique · ${esc(MUSIC_CREDIT.name)} (au hasard)</h4>
            <div class="love-player" id="love-player-slot"></div>
            <button type="button" class="love-btn love-btn--primary" data-act="play">❤ JOUER</button>
            ${best ? `<p class="love-best">Ton record : cœur réparé en <b>${formatTime(best)}</b></p>` : ''}
            <p class="love-note">Événement en test : garde le code pour toi.</p>`);
        mountPlayer($('love-player-slot'));
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
            requestAnimationFrame(follow);
        };
        follow();
    }
    function parkPlayer() {
        playerSlot = null;
        $('love-music').classList.remove('is-shown');
    }

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
        clearRun();
        Object.assign(run, {
            on: true, love: LOVE.start, shownLove: LOVE.start, nextZ: null, time: 0, ended: false, caught: 0, hits: 0,
            thoughtAt: 6 + Math.random() * 4, tearAt: 0, slot: 0, lastZ: null, hitUntil: 0, cloud: 0, outcome: null
        });
        hidePanel();
        parkPlayer();
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
        if (kind === 'repaired') chimes.repaired();
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
        if (run.outcome === 'broken') rainAmount = 1;
        deps.v2()?.setSky({ ...sky });
        return rainAmount;
    }

    function frame(dt) {
        if (!run.on) return;
        const t = performance.now() / 1000;
        const v2 = deps.v2();
        const camera = deps.camera;
        for (const item of run.items) items.animate(item, t);
        const rainAmount = dt > 0 ? updateSky(dt) : 0;
        if (rain && dt > 0) rain.update(dt, camera, rainAmount, deps.speed() * 60);
        puddles?.frame(dt, rain ? rain.amount : 0, deps.bike().position.z + 40, camera.position.z);
        // The rider's mood.
        const sadness = run.outcome === 'repaired' ? 0 : Math.max(0, Math.min(1, (LOVE.sun - run.shownLove) / 8));
        v2?.rider.setMood(run.outcome === 'broken' ? 1 : sadness);
        if (dt > 0 && !run.outcome) moodMoments(dt, sadness);
        updateTears(dt, sadness);
        updateSparks(dt);
        // Into the cloud once mended.
        if (run.outcome === 'repaired' && dt > 0) intoCloud(dt);
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
    function finish(kind, { seconds = run.time } = {}) {
        run.outcome = run.outcome || kind;
        run.ended = true;
        const best = Number(readLocal(BEST_KEY)) || 0;
        let record = false;
        if (kind === 'repaired') {
            deps.stat('loveRepaired');
            if (!best || seconds < best) {
                writeLocal(BEST_KEY, String(Math.round(seconds)));
                record = !!best;
            }
        } else if (kind === 'broken') {
            deps.stat('loveBroken');
        }
        const delay = kind === 'repaired' ? 3200 : kind === 'broken' ? 2200 : 1400;
        setTimeout(() => {
            if (!run.on) return;
            const title = kind === 'repaired' ? 'Cœur réparé' : kind === 'broken' ? 'Cœur brisé' : 'Chute…';
            const sub = kind === 'repaired' ? 'MISSION RÉUSSIE' : kind === 'broken' ? 'LA BARRE EST VIDE' : 'LE CŒUR À ' + run.love + '/' + LOVE.max;
            show(`
                <p class="love-kicker">LOVE&amp;FAITH × 51WHELING</p>
                <div class="love-end__title" id="love-end-title"></div>
                <p class="love-end__sub ${kind === 'repaired' ? 'is-win' : ''}">${sub}</p>
                <dl class="love-stats">
                    <div><dt>Temps</dt><dd>${formatTime(seconds)}</dd></div>
                    <div><dt>Attrapés</dt><dd>${run.caught}</dd></div>
                    <div><dt>Touchés</dt><dd>${run.hits}</dd></div>
                </dl>
                ${record ? '<p class="love-best is-record">Nouveau record !</p>' : ''}
                ${kind === 'broken' ? '<p class="love-text">L’amour se reconstruit : remonte la barre, évite les larmes.</p>' : ''}
                <button type="button" class="love-btn love-btn--primary" data-act="again">❤ REJOUER</button>
                <button type="button" class="love-btn love-btn--ghost" data-act="menu">Menu</button>`, true);
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
        }, delay);
    }

    // Out of the event (back to the menu, or before another race).
    function leave({ keepMusic = false } = {}) {
        run.on = false;
        run.ended = true;
        clearRun();
        rain?.hide();
        hidePanel();
        $('love-hud').hidden = true;
        document.body.classList.remove('love-on');
        const v2 = deps.v2();
        v2?.setSky(null);
        v2?.setOutfit(null);
        v2?.rider.setMood(0);
        if (!keepMusic) {
            music.stop();
            $('love-now').hidden = true;
        }
    }

    root.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-act], [data-outfit], [data-band]') : null;
        if (!target) return;
        if (target.dataset.band) {
            writeLocal(BAND_KEY, target.dataset.band);
            root.querySelectorAll('.love-band').forEach((b) => b.classList.toggle('is-on', b === target));
            return;
        }
        if (target.dataset.outfit) {
            writeLocal(OUTFIT_KEY, target.dataset.outfit);
            root.querySelectorAll('.love-outfit').forEach((b) => b.classList.toggle('is-on', b === target));
            return;
        }
        const act = target.dataset.act;
        if (act === 'close') {
            hidePanel();
        } else if (act === 'open') {
            open();
        } else if (act === 'play') {
            // The tap starts the sound (and the chimes) now.
            chimes.unlock();
            music.start();
            deps.startRun();
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

    installEntry();

    return {
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
