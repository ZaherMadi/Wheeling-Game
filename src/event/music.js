// The Love&Faith event's sound (a setting): the artist's own SoundCloud
// tracks (MWL, the default), played through SoundCloud's own player
// (embedded, nothing downloaded), or the anasheed shipped with the game, or
// both; at random, another at random when one ends. A
// browser only plays sound after a tap: the first play starts from the
// event's panel (the tap on JOUER).
const ARTIST = 'https://api.soundcloud.com/users/582246534';
const WIDGET_API = 'https://w.soundcloud.com/player/api.js';
export const MUSIC_CREDIT = { name: 'MWL', url: 'https://soundcloud.com/ousseni-laid' };
const NASHEEDS = [
    ['victory-march', 'Victory March'],
    ['steady-motivation', 'Steady Motivation'],
    ['peaceful-contemplation', 'Peaceful Contemplation'],
    ['gentle-reflection', 'Gentle Reflection'],
    ['focused-determination', 'Focused Determination']
];
const FILES = '/event/love/music/';

let apiPromise = null;
function loadApi() {
    if (window.SC?.Widget) return Promise.resolve(window.SC);
    if (!apiPromise) {
        apiPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = WIDGET_API;
            script.async = true;
            script.onload = () => (window.SC?.Widget ? resolve(window.SC) : reject(new Error('no widget')));
            script.onerror = () => reject(new Error('widget api'));
            document.head.append(script);
        });
    }
    return apiPromise;
}

export const MUSIC_MODES = [['music', 'Musique (MWL)'], ['anasheed', 'Anasheed'], ['both', 'Les deux']];
// The track played first when the event comes back after a while (the end
// of its address on SoundCloud).
export const FIRST_TRACK = 'ne-mabandonne-pas';
// "Ne m’abandonne pas" → "nemabandonnepas", as its address without dashes.
const plain = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isTrack = (sound, slug) => !!sound && (String(sound.permalink_url || '').split('?')[0].endsWith(`/${slug}`) || plain(sound.title) === plain(slug));

export function createMusic({ onTrack = () => {}, mode: firstMode = 'music' } = {}) {
    let mode = firstMode;
    // Music asked before SoundCloud's player was ready: it starts then.
    let waiting = false;
    let unavailable = false;
    let frame = null;
    let widget = null;
    let ready = false;
    let sounds = [];
    let wanted = false;
    // (The effects are 30 % lower in the event, the music on top.)
    let volume = 0.85;
    let playing = null;
    let lastFile = -1;
    let lastSound = -1;
    // A track asked for first (start({ first })), else at random.
    let firstWanted = null;
    // The anasheed: one player, kept for every one of them (a phone lets it
    // play again once a tap has started it).
    const audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => { if (wanted && playing === 'file') next(); });
    audio.addEventListener('error', () => { if (wanted && playing === 'file') setTimeout(next, 400); });

    function mount(container) {
        if (frame) {
            if (frame.parentNode !== container) container.append(frame);
            return;
        }
        frame = document.createElement('iframe');
        frame.className = 'love-music__player';
        frame.title = `Musique : ${MUSIC_CREDIT.name} sur SoundCloud`;
        frame.allow = 'autoplay; encrypted-media';
        frame.loading = 'eager';
        const params = new URLSearchParams({
            url: ARTIST, auto_play: 'false', visual: 'false', color: '#c90025', show_comments: 'false',
            show_user: 'true', show_reposts: 'false', show_teaser: 'false', hide_related: 'true', buying: 'false',
            sharing: 'false', download: 'false', show_playcount: 'false', single_active: 'true'
        });
        frame.src = `https://w.soundcloud.com/player/?${params}`;
        container.append(frame);
        loadApi().then((SC) => {
            widget = SC.Widget(frame);
            widget.bind(SC.Widget.Events.READY, () => {
                ready = true;
                widget.setVolume(Math.round(volume * 100));
                widget.getSounds((list) => {
                    sounds = Array.isArray(list) ? list : [];
                    if (waiting && wanted) {
                        waiting = false;
                        playSoundCloud();
                    }
                });
            });
            widget.bind(SC.Widget.Events.FINISH, () => { if (wanted && playing === 'sc') next(); });
            widget.bind(SC.Widget.Events.PLAY, () => {
                // Started from the player itself: that is what plays now.
                if (playing !== 'sc') {
                    audio.pause();
                    playing = 'sc';
                }
                widget.getCurrentSound((sound) => onTrack(sound ? { title: `${MUSIC_CREDIT.name} — ${sound.title}`, url: sound.permalink_url } : null));
            });
        }).catch(() => {
            // No SoundCloud: the anasheed rather than nothing.
            unavailable = true;
            if (waiting && wanted) {
                waiting = false;
                playFile();
            }
        });
    }

    function playFile() {
        let index = Math.floor(Math.random() * NASHEEDS.length);
        if (index === lastFile) index = (index + 1) % NASHEEDS.length;
        lastFile = index;
        const [id, title] = NASHEEDS[index];
        if (ready && widget) widget.pause();
        playing = 'file';
        audio.src = `${FILES}${id}.mp3`;
        audio.volume = volume;
        audio.play().catch(() => {});
        onTrack({ title: `Anasheed — ${title}`, url: null });
    }

    function playSoundCloud() {
        audio.pause();
        playing = 'sc';
        const count = sounds.length;
        if (!count) {
            widget.play();
            return;
        }
        let index = firstWanted ? sounds.findIndex((sound) => isTrack(sound, firstWanted)) : -1;
        firstWanted = null;
        if (index < 0) {
            index = Math.floor(Math.random() * count);
            if (count > 1 && index === lastSound) index = (index + 1) % count;
        }
        lastSound = index;
        widget.skip(index);
        widget.play();
    }

    // The next one, as the setting says (both: one chance in two).
    function next() {
        // (The track asked for first: the artist's, unless only anasheed.)
        const asked = !!firstWanted && mode !== 'anasheed';
        const music = asked || mode === 'music' || (mode === 'both' && Math.random() < 0.5);
        if (!music || unavailable) {
            firstWanted = null;
            playFile();
        } else if (ready && widget) {
            playSoundCloud();
        } else {
            audio.pause();
            playing = 'sc';
            waiting = true;
        }
    }

    function setMode(value) {
        if (!MUSIC_MODES.some(([id]) => id === value) || value === mode) return;
        mode = value;
        if (wanted) next();
    }

    // A tap just happened: start (at random, or `first`) or go on.
    function start({ first = null } = {}) {
        if (wanted && playing) return;
        wanted = true;
        firstWanted = first;
        next();
    }

    function stop() {
        wanted = false;
        waiting = false;
        playing = null;
        audio.pause();
        if (ready && widget) widget.pause();
    }

    function setVolume(value) {
        volume = Math.max(0, Math.min(1, value));
        audio.volume = volume;
        if (ready && widget) widget.setVolume(Math.round(volume * 100));
    }

    return {
        mount, start, stop, setVolume, setMode, next,
        get ready() { return ready; }, get playing() { return playing; }, get mode() { return mode; },
        // Tests: what SoundCloud's player has, what plays.
        get sounds() { return sounds.map((sound) => ({ title: sound.title, url: sound.permalink_url })); },
        get current() { return lastSound >= 0 ? sounds[lastSound]?.permalink_url || null : null; }
    };
}
