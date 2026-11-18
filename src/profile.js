// The player's profile on every device (API profiles.py): "Mes stats", the
// cumulative points and what was bought are the same on the phone, the
// tablet and the computer once they play under the same nickname.
//
// Each device sends what it holds (its counts only grow) and gets back what
// the OTHER devices of that nickname hold; it shows the two together, so
// what happens here shows at once and the rest follows at the next sync.
// The first nickname synced on a device brings that device's whole history
// (its stats, its points); another nickname on the same device only what is
// done under it from then on.
import { statsSnapshot } from './stats.js';

const POINTS_KEY = 'wheelie_total_points';
const PENALTY_KEY = 'wheelie_points_penalty';
const DEVICE_KEY = 'wheelie_device_id';
const FIRST_KEY = 'wheelie_profile_first';
const PREFIX = 'wheelie_profile:';
const FREE_TRICKS_KEY = 'wheelie_free_tricks';
const LIVE_KEY = 'wheelie_live_unlocked';
const LOVE_WON_KEY = 'wheelie_love_won';
const LOVE_OWNED_KEY = 'wheelie_love_owned';
const POSES_KEY = 'wheelie_podium_poses';
const JET_CODE_KEY = 'wheelie_jetpack_code';
const BESTS = ['bestScore', 'topKmh'];

const keyOf = (nickname) => String(nickname || '').normalize('NFKC').trim().toLowerCase();

function number(key) {
    try {
        return Number(localStorage.getItem(key)) || 0;
    } catch {
        return 0;
    }
}

function readJson(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        return value ?? fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Kept for this visit only.
    }
}

function deviceId() {
    let id = null;
    try {
        id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
            localStorage.setItem(DEVICE_KEY, id);
        }
    } catch {
        id = id || null;
    }
    return id;
}

let config = { post: null, nickname: () => null, deviceToken: () => undefined };
export function configureProfile(options) {
    config = { ...config, ...options };
}

function currentNickname() {
    try {
        return config.nickname() || null;
    } catch {
        return null;
    }
}

// This device's record for a nickname: where its counts started, and the
// last answer from the server (others, ranked total). null: never synced.
function record(nickname = currentNickname()) {
    if (!nickname) return null;
    const found = readJson(PREFIX + keyOf(nickname), null);
    return found && typeof found === 'object' && found.others ? found : null;
}

// What this device holds for the nickname now (its share).
function mine(entry) {
    const stats = statsSnapshot();
    const start = entry.startStats || {};
    const own = {};
    for (const [name, value] of Object.entries(stats)) {
        if (typeof value !== 'number' || !(value > 0)) continue;
        if (BESTS.includes(name)) {
            if (value > (start[name] || 0) || !entry.startStats) own[name] = value;
        } else {
            const share = value - (start[name] || 0);
            if (share > 0) own[name] = Math.round(share * 1000) / 1000;
        }
    }
    return {
        stats: own,
        since: entry.startStats ? entry.startedAt : stats.since,
        legacy: entry.legacy || 0,
        earned: Math.max(0, Math.floor(number(POINTS_KEY) - (entry.startEarned || 0))),
        penalty: Math.max(0, Math.floor(number(PENALTY_KEY) - (entry.startPenalty || 0)))
    };
}

// The cumulative points on every device (null: not synced yet, the device's
// own count stands).
export function profileBalance() {
    const entry = record();
    if (!entry) return null;
    const own = mine(entry);
    const others = entry.others;
    const earned = Math.max(Math.max(others.legacy || 0, own.legacy) + (others.earned || 0) + own.earned, entry.ranked || 0);
    return Math.max(0, earned - (others.penalty || 0) - own.penalty);
}

// "Mes stats" on every device (null: this device's only).
export function profileStats() {
    const entry = record();
    if (!entry) return null;
    const own = mine(entry);
    const merged = { ...(entry.others.stats || {}) };
    for (const [name, value] of Object.entries(own.stats)) {
        merged[name] = BESTS.includes(name) ? Math.max(merged[name] || 0, value) : (merged[name] || 0) + value;
    }
    const dates = [entry.others.since, own.since].filter(Boolean).map((date) => Date.parse(date)).filter(Number.isFinite);
    merged.since = dates.length ? new Date(Math.min(...dates)).toISOString() : own.since;
    merged.devices = entry.devices || 1;
    return merged;
}

// The ranked total the server holds (from the player's stats): kept for the
// points once synced (the device's own count is no longer raised to it).
export function noteRankedTotal(total) {
    const nickname = currentNickname();
    const entry = record(nickname);
    if (!entry || !(total > (entry.ranked || 0))) return false;
    entry.ranked = Math.floor(total);
    writeJson(PREFIX + keyOf(nickname), entry);
    document.dispatchEvent(new CustomEvent('wheelie:points', { detail: { fromProfile: true } }));
    return true;
}

function ownedHere() {
    const owned = [];
    try {
        if (localStorage.getItem(FREE_TRICKS_KEY) === '1') owned.push('freeTricks');
        if (localStorage.getItem(LIVE_KEY)) owned.push('liveUnlocked');
        if (localStorage.getItem(JET_CODE_KEY) === '1') owned.push('jetpackCode');
    } catch {
        // Nothing to add.
    }
    const poses = readJson(POSES_KEY, []);
    if (Array.isArray(poses)) poses.forEach((id) => typeof id === 'string' && owned.push(`pose:${id}`));
    // The Love&Faith riders: won, bought.
    for (const [key, prefix] of [[LOVE_WON_KEY, 'loveWon'], [LOVE_OWNED_KEY, 'love']]) {
        const list = readJson(key, []);
        if (Array.isArray(list)) list.forEach((g) => (g === 'boy' || g === 'girl') && owned.push(`${prefix}:${g}`));
    }
    return owned;
}

// What the other devices bought: bought here too.
function applyOwned(owned) {
    let changed = false;
    if (owned.includes('freeTricks')) {
        try {
            if (localStorage.getItem(FREE_TRICKS_KEY) !== '1') {
                localStorage.setItem(FREE_TRICKS_KEY, '1');
                changed = true;
            }
        } catch {
            // Not kept.
        }
    }
    if (owned.includes('liveUnlocked')) {
        try {
            if (!localStorage.getItem(LIVE_KEY)) {
                localStorage.setItem(LIVE_KEY, 'synced');
                changed = true;
            }
        } catch {
            // Not kept.
        }
    }
    if (owned.includes('jetpackCode')) {
        try {
            if (localStorage.getItem(JET_CODE_KEY) !== '1') localStorage.setItem(JET_CODE_KEY, '1');
        } catch {
            // Not kept.
        }
    }
    const poses = new Set(readJson(POSES_KEY, []));
    for (const item of owned) {
        if (item.startsWith('pose:') && !poses.has(item.slice(5))) {
            poses.add(item.slice(5));
            changed = true;
        }
    }
    if (changed) writeJson(POSES_KEY, [...poses]);
    for (const [key, prefix] of [[LOVE_WON_KEY, 'loveWon'], [LOVE_OWNED_KEY, 'love']]) {
        const list = new Set(readJson(key, []));
        const before = list.size;
        for (const item of owned) {
            const [name, gender] = item.split(':');
            if (name === prefix && (gender === 'boy' || gender === 'girl')) list.add(gender);
        }
        if (list.size !== before) {
            writeJson(key, [...list]);
            changed = true;
        }
    }
    return changed;
}

let syncing = null;
let lastSync = 0;
// Sends this device's share and keeps what the others hold. keepalive: the
// page is going away (no answer expected).
export function syncProfile({ keepalive = false, force = false } = {}) {
    const nickname = currentNickname();
    const device = deviceId();
    if (!nickname || !device || !config.post) return Promise.resolve(false);
    if (syncing && !keepalive) return syncing;
    if (!force && !keepalive && Date.now() - lastSync < 4000) return Promise.resolve(false);
    lastSync = Date.now();
    const key = PREFIX + keyOf(nickname);
    // First time for this nickname here: where this device's counts start.
    const known = readJson(key, null);
    let first = false;
    try {
        first = !localStorage.getItem(FIRST_KEY) || localStorage.getItem(FIRST_KEY) === keyOf(nickname);
    } catch {
        first = false;
    }
    const entry = known && typeof known === 'object' && known.startedAt ? known : {
        startedAt: new Date().toISOString(),
        startStats: first ? null : statsSnapshot(),
        startEarned: number(POINTS_KEY),
        startPenalty: first ? 0 : number(PENALTY_KEY),
        legacy: first ? number(POINTS_KEY) : 0
    };
    const own = mine(entry);
    const body = {
        nickname, device_id: device, device_token: config.deviceToken(nickname) || undefined,
        stats: own.stats, since: own.since || undefined,
        points: { legacy: own.legacy, earned: own.earned, penalty: own.penalty },
        owned: ownedHere()
    };
    const request = config.post('profile/sync', body, keepalive).then(async (response) => {
        if (!response || !response.ok) return false;
        const answer = await response.json();
        if (!answer || typeof answer.others !== 'object') return false;
        entry.others = answer.others;
        entry.ranked = Math.max(entry.ranked || 0, Number(answer.ranked_total) || 0);
        entry.devices = answer.devices || 1;
        entry.syncedAt = new Date().toISOString();
        writeJson(key, entry);
        try {
            if (first) localStorage.setItem(FIRST_KEY, keyOf(nickname));
        } catch {
            // Asked again next time.
        }
        applyOwned(answer.others.owned || []);
        document.dispatchEvent(new CustomEvent('wheelie:points', { detail: { fromProfile: true } }));
        document.dispatchEvent(new CustomEvent('wheelie:profile'));
        return true;
    }).catch(() => false).finally(() => {
        if (syncing === request) syncing = null;
    });
    if (!keepalive) syncing = request;
    return request;
}

// Tests and the sessions page: the state of the sync.
export function profileDebug() {
    const entry = record();
    return entry ? { ...entry, mine: mine(entry), balance: profileBalance() } : null;
}
