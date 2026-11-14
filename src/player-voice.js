import { reportError } from './monitoring.js';
// The player's name, spoken. For each new nickname the ranking server asks
// ElevenLabs (its key never reaches the browser) for a few lines with the
// name in them ("C'est parti, Joueur77 !", the police lines...), stores the
// MP3s in its database and serves them at fixed, cacheable addresses.
// Here we only remember which lines exist for the current nickname
// (localStorage) and hand their addresses to the audio engine; the browser
// cache keeps the files themselves.
const RECORD_KEY = 'wheelie_player_voice';
// Server format: the rider lines exist per voice (start_will...).
const FORMAT = '2';
const ANNOUNCED_KEY = 'wheelie_player_voice_announced';

function read(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
        return null;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Not kept: fetched again next time.
    }
}

export function createPlayerVoice({ apiBase, audio, apiFetch }) {
    let record = read(RECORD_KEY);
    if (record && record.version !== FORMAT) record = null;
    let pending = null;

    const currentNickname = () => {
        try {
            return localStorage.getItem('wheelie_nickname') || '';
        } catch {
            return '';
        }
    };
    const clipId = (clip) => `pv_${clip}`;
    const url = (clip) => `${apiBase()}/player-voice/${encodeURIComponent(record.nickname)}/${clip}.mp3?v=${record.version}`;

    function register() {
        if (!record) return;
        for (const clip of Object.keys(record.clips || {})) audio.registerClip(clipId(clip), url(clip));
    }
    register();

    // Gets (or, after a ranked run, has the server make) the lines for this
    // nickname. Quietly gives up when the server cannot.
    function ensure(nickname = currentNickname(), { generate = false } = {}) {
        if (!nickname) return Promise.resolve(false);
        if (record && record.nickname === nickname) {
            register();
            return Promise.resolve(true);
        }
        if (pending) return pending;
        const address = `${apiBase()}/player-voice/${encodeURIComponent(nickname)}`;
        pending = (async () => {
            try {
                let response = await apiFetch(address, {}, 6000);
                if (response.status === 404 && generate) {
                    response = await apiFetch(`${apiBase()}/player-voice`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nickname })
                    }, 30000);
                }
                if (!response.ok) return false;
                const data = await response.json();
                if (!data || !data.clips || data.nickname !== nickname || String(data.version) !== FORMAT) return false;
                record = { nickname, version: String(data.version), clips: data.clips };
                write(RECORD_KEY, record);
                register();
                audio.warmUp(Object.keys(record.clips).map(clipId));
                return true;
            } catch (error) {
                console.warn('Player voice unavailable:', error);
                reportError('voice.player', error, { once: true, details: { generate: !!generate } });
                return false;
            } finally {
                pending = null;
            }
        })();
        return pending;
    }

    const has = (clip) => !!record && record.nickname === currentNickname() && !!record.clips?.[clip];

    return {
        ensure,
        has,
        clipId,
        text: (clip) => (has(clip) ? record.clips[clip] : ''),
        // "C'est parti, X !" in the rider's voice: at the first run once the
        // voice is there, then now and then (about one run in four).
        startLine(voice) {
            const clip = `start_${voice}`;
            if (!has(clip)) return null;
            const stamp = `${record.nickname}|${record.version}`;
            if (read(ANNOUNCED_KEY) !== stamp) {
                write(ANNOUNCED_KEY, stamp);
                return clipId(clip);
            }
            return Math.random() < 0.25 ? clipId(clip) : null;
        },
        get nickname() { return record ? record.nickname : null; }
    };
}
