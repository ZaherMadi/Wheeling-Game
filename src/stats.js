// "Mes stats": what the player has done, counted on this device since the
// first time (bavettes, falls, backflips, minutes played...). Shown from
// the account window. Kept in localStorage, written a moment after each
// change and when the page is hidden.
import { track } from './activity.js';

const KEY = 'wheelie_stats';

function load() {
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (stored && typeof stored === 'object') return stored;
    } catch {
        // Unreadable: start again.
    }
    return { since: new Date().toISOString() };
}

const stats = load();
let pending = null;

function save() {
    pending = null;
    try {
        localStorage.setItem(KEY, JSON.stringify(stats));
    } catch {
        // Not kept (private browsing, storage full): still shown this visit.
    }
}

function saveSoon() {
    if (pending === null) pending = setTimeout(save, 1500);
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pending !== null) {
        clearTimeout(pending);
        save();
    }
});

export function bumpStat(name, amount = 1) {
    if (!(amount > 0)) return;
    stats[name] = (stats[name] || 0) + amount;
    saveSoon();
    // The owner's stats too (time is counted there on its own).
    if (name !== 'seconds' && name !== 'freeSeconds') track(name, amount);
}

export function bestStat(name, value) {
    if (value > (stats[name] || 0)) {
        stats[name] = value;
        saveSoon();
    }
}

export const statOf = (name) => stats[name] || 0;

// A copy of this device's stats (src/profile.js sends them).
export function statsSnapshot() {
    return { ...stats };
}

const whole = (value) => Math.floor(value || 0).toLocaleString('fr-FR');

function duration(seconds) {
    const minutes = Math.floor((seconds || 0) / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

// Session live trophies (the API's live_rooms.py TROPHIES).
const LIVE_TROPHIES = [['winner', '🏆 Vainqueur'], ['best_run', '⚡ Meilleure partie'], ['clown', '😂 Le comique'], ['booed', '👎 Le plus hué'],
    ['darling', '🔥 Le chouchou'], ['mouth', '💬 La grande gueule'], ['express', '💥 Chute express']];

// points: the cumulative points now; codes: which secret codes the player
// has been shown ({ glider, tricks }): their stats appear with them, or as
// soon as they have been used. all: the stats of every device the player
// uses (src/profile.js), else this device's. server: what the server knows
// of the player (ranked games, total, best, sessions live): it counts since
// the very first game, the game's own stats only since they exist.
export function renderStats(container, { points = 0, codes = {}, all = null, server = null } = {}) {
    const stats = { ...(all || statsSnapshot()) };
    if (server) {
        stats.runs = Math.max(stats.runs || 0, server.games_played || 0);
        stats.score = Math.max(stats.score || 0, server.total_score || 0);
        stats.bestScore = Math.max(stats.bestScore || 0, server.best_score || 0);
        const liveStats = server.live || {};
        stats.liveSessions = Math.max(stats.liveSessions || 0, liveStats.sessions || 0);
        stats.liveWins = Math.max(stats.liveWins || 0, liveStats.wins || 0);
        stats.liveTrophyCounts = liveStats.trophies || {};
    }
    const groups = [
        ['Général', [
            ['Parties classées', whole(stats.runs)],
            ['Temps de jeu', duration((stats.seconds || 0) + (stats.freeSeconds || 0))],
            ['Score cumulé', whole(stats.score)],
            ['Meilleur score', whole(stats.bestScore)],
            ['Points cumulés (à dépenser)', whole(points)],
            ['Vitesse max', `${whole(stats.topKmh)} km/h`]
        ]],
        ['Wheeling', [
            ['Bavettes réussies', whole(stats.bavettes)],
            ['Plaques arrachées', whole(stats.plates)],
            ['Chutes', whole(stats.falls)],
            ['Arrêté par la police', whole(stats.arrests)],
            ['Dérapages', whole(stats.skids)],
            ['Rattrapés par le frein auto', whole(stats.autoBrakes)]
        ]],
        ['Sauts et figures', [
            ['Sauts', whole(stats.jumps)],
            ['Figures', whole(stats.tricks)],
            ['Backflips', whole(stats.flips)],
            ['Doubles backflips', whole(stats.doubleFlips)],
            ['Triples backflips', whole(stats.tripleFlips)],
            ['Figures tenues (60 % du saut)', whole(stats.heldTricks)],
            ['Boosts', whole(stats.boosts)]
        ]],
        ['Boucliers', [
            ['Ramassés', whole(stats.shields)],
            ['Obstacles encaissés', whole(stats.shieldSaves)]
        ]],
        ['Mode libre', [
            ['Sorties', whole(stats.freeSessions)],
            ['Temps', duration(stats.freeSeconds)],
            ['Figures Land trouvée', whole(stats.figuresLand)],
            ['Vols en jetpack', whole(stats.jetpacks)]
        ]]
    ];
    // The Love&Faith event (testers), once played.
    if (stats.loveRuns) {
        groups.push(['Événement Love&Faith', [
            ['Courses', whole(stats.loveRuns)],
            ['Cœurs réparés', whole(stats.loveRepaired)],
            ['Cœurs brisés', whole(stats.loveBroken)],
            ['Attrapés (cœurs, câlins, lettres)', whole(stats.lovePickups)],
            ['Touchés (cœurs brisés, larmes)', whole(stats.loveHits)]
        ]]);
    }
    if (stats.liveSessions || stats.liveTurns || stats.liveReactions) {
        const trophies = LIVE_TROPHIES.filter(([id]) => stats.liveTrophyCounts?.[id]).map(([id, label]) => [label, whole(stats.liveTrophyCounts[id])]);
        groups.push(['Sessions live', [
            ['Sessions jouées', whole(stats.liveSessions)],
            ['Sessions gagnées', whole(stats.liveWins)],
            ['Tours joués', whole(stats.liveTurns)],
            ['Réactions envoyées', whole(stats.liveReactions)],
            ['Trophées de session', whole(stats.liveTrophies || trophies.reduce((sum, [, n]) => sum + Number(String(n).replace(/\D/g, '')), 0))],
            ...trophies
        ]]);
    }
    const secret = [];
    if (codes.glider || stats.gliders) secret.push(['Séances de deltaplane', whole(stats.gliders)]);
    if (codes.tricks || stats.codeTricks) secret.push(['Parties sans obstacles', whole(stats.codeTricks)]);
    if (secret.length) groups.push(['Codes secrets', secret]);

    const wrap = document.createElement('div');
    wrap.className = 'stats';
    for (const [title, rows] of groups) {
        const section = document.createElement('section');
        section.className = 'stats-group';
        const heading = document.createElement('h3');
        heading.textContent = title;
        const list = document.createElement('dl');
        for (const [label, value] of rows) {
            const name = document.createElement('dt');
            name.textContent = label;
            const figure = document.createElement('dd');
            figure.textContent = value;
            list.append(name, figure);
        }
        section.append(heading, list);
        wrap.append(section);
    }
    const note = document.createElement('p');
    note.className = 'stats-note';
    const since = new Date(stats.since || Date.now());
    const day = since.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    note.textContent = all
        ? `Comptées sur ${all.devices > 1 ? `tes ${all.devices} appareils` : 'tous tes appareils'} depuis le ${day}.`
        : `Comptées sur cet appareil depuis le ${day}. Choisis un pseudo pour les retrouver sur tes autres appareils.`;
    wrap.append(note);
    container.append(wrap);
}
