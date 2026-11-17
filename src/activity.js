// What players do, for the owner's stats page (API /stats): how many times
// each feature is used, and the time spent on each activity. Sent about
// once a minute (and when the page is hidden) with a random id kept by this
// browser: no name, no personal data.
const ID_KEY = 'wheelie_activity_id';
const TICK = 5;

function browserId() {
    try {
        let id = localStorage.getItem(ID_KEY);
        if (!id) {
            id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('');
            localStorage.setItem(ID_KEY, id);
        }
        return id;
    } catch {
        return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
}

const pending = { counts: {}, seconds: {} };
let empty = true;

export function track(name, amount = 1) {
    if (!(amount > 0)) return;
    pending.counts[name] = (pending.counts[name] || 0) + Math.round(amount);
    empty = false;
}

function trackTime(name, seconds) {
    pending.seconds[name] = (pending.seconds[name] || 0) + seconds;
    empty = false;
}

// Clicks worth counting: element id (or class) -> feature.
const CLICKS = {
    'leaderboard-btn': 'openLeaderboard', 'daily-btn': 'openDaily', 'trophies-btn': 'openTrophies', 'rider-btn': 'openRider',
    'pose-btn': 'openPoses', 'settings-btn': 'openSettings', 'player-nickname': 'openAccount', 'golden-bird': 'birdClicked',
    'control-analog': 'controlsAnalog', 'control-arrows': 'controlsArrows', 'control-custom': 'controlsCustom', 'control-layout': 'padEditor'
};
const CLASS_CLICKS = { 'account-stats-btn': 'openMyStats' };

// send(body, keepalive): posts it. current(): what the player is doing now
// (competitive, free-car, menu-leaderboard...).
export function startActivity({ send, current, version }) {
    const id = browserId();
    track('app');
    document.addEventListener('click', (event) => {
        let element = event.target instanceof Element ? event.target : null;
        while (element && element !== document.body) {
            if (element.id && CLICKS[element.id]) return track(CLICKS[element.id]);
            for (const [name, feature] of Object.entries(CLASS_CLICKS)) {
                if (element.classList?.contains(name)) return track(feature);
            }
            element = element.parentElement;
        }
        return undefined;
    }, true);
    setInterval(() => {
        if (!document.hidden) trackTime(current(), TICK);
    }, TICK * 1000);
    const flush = (keepalive = false) => {
        if (empty) return;
        const body = { client_id: id, version, counts: pending.counts, seconds: pending.seconds };
        pending.counts = {};
        pending.seconds = {};
        empty = true;
        send(body, keepalive);
    };
    setTimeout(() => flush(), 8000);
    setInterval(() => flush(), 60000);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) flush(true);
    });
}
