// The Love&Faith event's music: the artist's own SoundCloud tracks (MWL),
// played at random through SoundCloud's own player (embedded, nothing
// downloaded), another at random when one ends. A browser only plays sound
// after a tap: the first play is asked from the event's panel (a tap on
// JOUER, or on the player itself on iPhone).
const ARTIST = 'https://api.soundcloud.com/users/582246534';
const WIDGET_API = 'https://w.soundcloud.com/player/api.js';
export const MUSIC_CREDIT = { name: 'MWL', url: 'https://soundcloud.com/ousseni-laid' };

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

export function createMusic({ onTrack = () => {} } = {}) {
    let frame = null;
    let widget = null;
    let ready = false;
    let sounds = [];
    let wanted = false;
    let volume = 0.7;
    let lastIndex = -1;

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
                    if (wanted) playRandom();
                });
            });
            widget.bind(SC.Widget.Events.FINISH, () => { if (wanted) playRandom(); });
            widget.bind(SC.Widget.Events.PLAY, () => {
                widget.getCurrentSound((sound) => onTrack(sound ? { title: sound.title, url: sound.permalink_url } : null));
            });
        }).catch(() => onTrack(null));
    }

    function playRandom() {
        if (!ready || !widget) return;
        const count = sounds.length;
        if (!count) {
            widget.play();
            return;
        }
        let index = Math.floor(Math.random() * count);
        if (count > 1 && index === lastIndex) index = (index + 1) % count;
        lastIndex = index;
        widget.skip(index);
        widget.play();
    }

    // A tap just happened: start (at random) or go on.
    function start() {
        wanted = true;
        if (ready) playRandom();
    }

    function stop() {
        wanted = false;
        if (ready && widget) widget.pause();
    }

    function setVolume(value) {
        volume = Math.max(0, Math.min(1, value));
        if (ready && widget) widget.setVolume(Math.round(volume * 100));
    }

    return { mount, start, stop, setVolume, next: playRandom, get ready() { return ready; } };
}
