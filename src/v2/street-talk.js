// Street dialogue in free roam, on foot: passers-by react when you walk by
// (compliments, and one time in ten the 5HC exchange), complain when you
// bump into them (not every time), and the police talk when they fine you.
// At most three exchanges in any ten seconds, never two at once.
import data from '../street-lines.json';
import riderVoices from '../rider-voices.json';
import { streetClips } from '../street-lines.js';

// The main character speaks with the voice picked in the settings.
const RIDER_STREET_VOICES = Object.entries(riderVoices.voices).map(([key, voice]) => (voice.prefix ? `rider_${key}` : 'rider'));
function riderStreetVoice() {
    let key = riderVoices.default;
    try {
        const saved = localStorage.getItem('wheelie_rider_voice');
        if (riderVoices.voices[saved]) key = saved;
    } catch {
        // Default voice.
    }
    return riderVoices.voices[key].prefix ? `rider_${key}` : 'rider';
}

const WINDOW = 10;
const MAX_IN_WINDOW = 3;
const GREET_RADIUS = 2.6;
const BUMP_RADIUS = 0.72;

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export function createStreetTalk({ audio, people, playerVoice = null }) {
    const clips = streetClips(data, RIDER_STREET_VOICES);
    const byKey = new Map();
    for (const clip of clips) {
        const key = `${clip.voice}:${clip.category}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(clip);
    }
    const women = data.pedestrianVoices.filter((voice) => data.voices[voice].gender === 'f');
    const men = data.pedestrianVoices.filter((voice) => data.voices[voice].gender !== 'f');
    const recent = [];
    let clock = 0;
    let busy = false;
    let token = 0;
    let warmed = false;
    let interactions = 0;
    const stats = { greet: 0, ad: 0, bump: 0, police: 0, skipped: 0 };

    const voiceOn = () => {
        try {
            return localStorage.getItem('wheelie_voice_enabled') !== 'false';
        } catch {
            return true;
        }
    };

    function allowed() {
        while (recent.length && clock - recent[0] > WINDOW) recent.shift();
        return !busy && recent.length < MAX_IN_WINDOW;
    }

    function subtitle(who, text, seconds) {
        document.dispatchEvent(new CustomEvent('wheelie:subtitle', { detail: { who, text, seconds } }));
    }

    // One line: subtitle, then the clip (or a pause if it cannot play).
    // named: a clip with the player's name, when it has been generated.
    async function line(voice, category, who, { volume = 0.95, pan = 0, named = null } = {}) {
        const clip = named && playerVoice?.has(named)
            ? { id: playerVoice.clipId(named), text: playerVoice.text(named) }
            : pick(byKey.get(`${voice}:${category}`) || []);
        if (!clip) return;
        const fallback = Math.max(1.2, clip.text.length * 0.065);
        subtitle(who, clip.text, fallback + 0.6);
        const played = voiceOn() ? await audio.say(clip.id, { volume, pan }) : false;
        if (!played) await wait(fallback);
    }

    async function run(steps) {
        busy = true;
        recent.push(clock);
        const mine = ++token;
        try {
            for (const step of steps) {
                if (mine !== token) return;
                await step();
            }
        } finally {
            if (mine === token) busy = false;
        }
    }

    function voiceFor(walker) {
        if (!walker.voice) walker.voice = pick(walker.feminine ? women : men);
        return walker.voice;
    }

    function greet(walker, player) {
        const voice = voiceFor(walker);
        const pan = Math.max(-0.8, Math.min(0.8, (walker.x - player.x) / 4));
        interactions++;
        // The 5HC exchange is one interaction in ten.
        if (Math.random() < 0.1) {
            stats.ad++;
            people.talk(walker, player.x, player.z, 9);
            run([
                () => line(voice, 'ask5hc', 'Passant', { pan }),
                () => line(riderStreetVoice(), 'reply5hc', 'Toi', { volume: 1 }),
                () => line(voice, 'confirm5hc', 'Passant', { pan }),
                () => people.talk(walker, player.x, player.z, 0.8)
            ]);
            return;
        }
        stats.greet++;
        people.talk(walker, player.x, player.z, 3.2);
        const steps = [() => line(voice, 'compliment', 'Passant', { pan })];
        if (Math.random() < 0.4) steps.push(() => line(riderStreetVoice(), 'thanks', 'Toi', { volume: 1 }));
        run(steps);
    }

    function complain(walker, player) {
        const voice = voiceFor(walker);
        const pan = Math.max(-0.8, Math.min(0.8, (walker.x - player.x) / 4));
        stats.bump++;
        people.talk(walker, player.x, player.z, 2.2);
        run([() => line(voice, 'bump', 'Passant', { pan, volume: 1 })]);
    }

    // mode: 'walk' | 'bike' | 'car'; player: { x, z }
    let fallWarmed = false;
    function update(dt, mode, player) {
        clock += dt;
        // In free roam: what passers-by say after a fall, ready in advance.
        if (!fallWarmed) {
            fallWarmed = true;
            audio.warmUp(clips.filter((clip) => clip.category === 'fall').map((clip) => clip.id));
        }
        if (mode !== 'walk') return;
        if (!warmed) {
            warmed = true;
            const rider = riderStreetVoice();
            audio.warmUp(clips.filter((clip) => clip.group === 'pedestrian' || clip.voice === rider).map((clip) => clip.id));
        }
        // Bumping into someone: they step aside; sometimes they say so.
        for (const walker of people.near(player.x, player.z, BUMP_RADIUS)) {
            const fresh = clock - walker.lastBump > 6;
            people.bump(walker, player.x, player.z);
            if (fresh && Math.random() < 0.5) {
                if (allowed()) complain(walker, player);
                else stats.skipped++;
            }
            walker.lastBump = clock;
            walker.greeted = true;
        }
        // Walking past someone: they may say something (once each).
        for (const walker of people.near(player.x, player.z, GREET_RADIUS)) {
            if (walker.greeted) continue;
            walker.greeted = true;
            if (Math.random() < 0.55) {
                if (allowed()) greet(walker, player);
                else stats.skipped++;
            }
            break;
        }
    }

    // The player fell: the nearest passer-by within `radius` metres reacts.
    function concern(player, radius = 20) {
        const walker = people.near(player.x, player.z, radius)
            .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
        if (!walker) return false;
        if (busy) {
            token++;
            audio.stopSaying();
        }
        const voice = voiceFor(walker);
        const pan = Math.max(-0.8, Math.min(0.8, (walker.x - player.x) / 6));
        people.talk(walker, player.x, player.z, 3);
        run([() => line(voice, 'fall', 'Passant', { pan, volume: 1 })]);
        return true;
    }

    // The police speak over anything else (and count as an exchange).
    // named: use the line with the player's name if there is one (it is
    // spoken by the first officer's voice).
    function police(category, speaker, { named = false, namedClip = category } = {}) {
        stats.police++;
        if (busy) {
            token++;
            audio.stopSaying();
        }
        const useName = named && playerVoice?.has(namedClip);
        const voice = data.policeVoices[(useName ? 0 : speaker) % data.policeVoices.length];
        return run([() => line(voice, category, 'Police', { volume: 1, named: useName ? namedClip : null })]);
    }

    // Another speaker (the rider standing still) takes a slot in the limit.
    function claim() {
        if (!allowed()) return false;
        recent.push(clock);
        return true;
    }

    function warmPolice() {
        audio.warmUp(clips.filter((clip) => clip.group === 'police').map((clip) => clip.id));
    }

    function reset() {
        token++;
        busy = false;
        audio.stopSaying();
    }

    return {
        update, police, warmPolice, reset, claim, concern,
        get stats() { return { ...stats, interactions, recent: recent.length }; },
        get busy() { return busy; }
    };
}
