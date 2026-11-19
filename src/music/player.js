// Shop registration, boutique preview playback, run launch auto-play,
// and in-game pause menu soundtrack switcher (competitive + free roam).
import { equip, equipped, owns, registerItems } from '../shop/store.js';
import { createVinylCoverUrl, createVinylDiscUrl, NASHEED_TRACKS, trackSrc } from './covers.js';

const AUTOSTART_KEY = 'wheelie_music_autostart';

function readBool(key, fallback) {
    try {
        const val = localStorage.getItem(key);
        return val === null ? fallback : val === '1';
    } catch {
        return fallback;
    }
}

function writeBool(key, on) {
    try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* ignore */ }
}

export function registerMusic() {
    registerItems(NASHEED_TRACKS.map((track) => ({
        id: track.id,
        category: 'music',
        slot: 'music',
        name: track.title,
        price: track.price,
        tagline: track.tagline,
        badge: track.mood,
        accent: track.palette[0],
        icon: createVinylCoverUrl(track),
        preview: {
            type: 'music',
            slug: track.slug,
            title: track.title,
            artist: track.artist,
            mood: track.mood,
            palette: track.palette,
            cover: createVinylCoverUrl(track),
            disc: createVinylDiscUrl(track),
            src: trackSrc(track.slug)
        }
    })));
}

export function createMusicPlayer() {
    const audio = new Audio();
    audio.preload = 'none';
    audio.volume = 0.48;

    let currentId = null;
    let mode = 'idle'; // 'idle' | 'preview' | 'run'
    let playing = false;
    let loadingId = null;
    let pauseContainer = null;
    let pauseIsLove = false;

    const listeners = new Set();
    const notify = () => {
        const snapshot = state();
        listeners.forEach((fn) => fn(snapshot));
        renderPausePanel();
    };

    const ownedTracks = () => NASHEED_TRACKS.filter((t) => owns(t.id));
    const findTrack = (id) => NASHEED_TRACKS.find((t) => t.id === id) || null;

    function playUrl(id, nextMode, loopTrack) {
        const track = findTrack(id);
        if (!track) return;
        const src = trackSrc(track.slug);
        mode = nextMode;
        currentId = id;
        audio.loop = !!loopTrack;
        audio.volume = nextMode === 'preview' ? 0.55 : 0.45;
        document.dispatchEvent(new CustomEvent('wheelie:vinyl-track', {
            detail: { title: track.title, subtitle: `${track.artist || '51 Wheeling'} · ${track.mood || 'Vinyle'}`, playing: true }
        }));
        if (!audio.src.endsWith(src)) audio.src = src;
        loadingId = id;
        audio.play().then(() => {
            if (currentId !== id) return;
            playing = true;
            loadingId = null;
            notify();
        }).catch(() => {
            if (currentId === id) {
                playing = false;
                loadingId = null;
                document.dispatchEvent(new CustomEvent('wheelie:vinyl-track', {
                    detail: { title: track.title, subtitle: `${track.artist || '51 Wheeling'} · ${track.mood || 'Vinyle'}`, playing: false }
                }));
                notify();
            }
        });
        notify();
    }

    audio.addEventListener('ended', () => {
        if (mode === 'preview') {
            playing = false;
            mode = 'idle';
            document.dispatchEvent(new CustomEvent('wheelie:vinyl-track', { detail: { stopped: true } }));
            notify();
        }
    });

    function stop() {
        audio.pause();
        audio.currentTime = 0;
        playing = false;
        loadingId = null;
        mode = 'idle';
        document.dispatchEvent(new CustomEvent('wheelie:vinyl-track', { detail: { stopped: true } }));
        notify();
    }

    function togglePreview(id) {
        if (mode === 'preview' && currentId === id && playing) {
            stop();
            return false;
        }
        playUrl(id, 'preview', false);
        return true;
    }

    function stopPreview() {
        if (mode === 'preview') stop();
    }

    function onRunStart(isLoveEvent) {
        stopPreview();
        pauseIsLove = !!isLoveEvent;
        if (isLoveEvent) {
            stop();
            return;
        }
        if (!autoStartEnabled()) {
            stop();
            return;
        }
        const eq = equipped('music');
        const target = eq && owns(eq) ? eq : ownedTracks()[0]?.id || null;
        if (!target) {
            stop();
            return;
        }
        if (!eq) equip('music', target);
        playUrl(target, 'run', true);
    }

    function stopRun() {
        if (mode === 'run') stop();
    }

    function selectInRun(id) {
        if (!owns(id)) return;
        equip('music', id);
        playUrl(id, 'run', true);
    }

    function toggleRunPlay() {
        if (pauseIsLove) return;
        if (playing) {
            audio.pause();
            playing = false;
            const active = findTrack(currentId);
            document.dispatchEvent(new CustomEvent('wheelie:vinyl-track', {
                detail: {
                    title: active?.title || '51 Wheeling',
                    subtitle: active ? `${active.artist || '51 Wheeling'} · En pause` : 'En pause',
                    playing: false
                }
            }));
            notify();
            return;
        }
        const target = (currentId && owns(currentId) ? currentId : null)
            || equipped('music')
            || ownedTracks()[0]?.id;
        if (target) playUrl(target, 'run', true);
    }

    document.addEventListener('wheelie:vinyl-toggle', () => {
        if (mode === 'preview') stop();
        else toggleRunPlay();
    });
    document.addEventListener('wheelie:porsche-audio', (event) => {
        if (event.detail?.playing) stop();
    });

    function autoStartEnabled() {
        return readBool(AUTOSTART_KEY, true);
    }

    function setAutoStart(on) {
        writeBool(AUTOSTART_KEY, !!on);
        notify();
    }

    function state() {
        return {
            currentId,
            playing,
            loadingId,
            mode,
            autoStart: autoStartEnabled()
        };
    }

    function refreshPause(isLoveEvent) {
        pauseIsLove = !!isLoveEvent;
        renderPausePanel();
    }

    function mountPause(container) {
        pauseContainer = container || document.getElementById('pause-music');
        if (!pauseContainer) return;
        pauseContainer.addEventListener('click', (event) => {
            const btn = event.target instanceof Element ? event.target.closest('[data-music-act]') : null;
            if (!btn) return;
            const act = btn.dataset.musicAct;
            if (act === 'toggle') toggleRunPlay();
            else if (act === 'autostart') setAutoStart(!autoStartEnabled());
            else if (act === 'select' && btn.dataset.id) selectInRun(btn.dataset.id);
        });
        document.addEventListener('wheelie:shop', () => renderPausePanel());
        renderPausePanel();
    }

    function renderPausePanel() {
        const box = pauseContainer || document.getElementById('pause-music');
        if (!box) return;
        if (pauseIsLove) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        box.hidden = false;
        const owned = ownedTracks();
        if (!owned.length) {
            box.innerHTML = `
              <div class="pause-music__empty">
                <span>💿</span>
                <div>
                  <strong>Bande-son Anasheed</strong>
                  <small>Achète un vinyle dans la Boutique pour changer la musique en partie.</small>
                </div>
              </div>`;
            return;
        }
        const activeId = (currentId && owns(currentId) ? currentId : null) || equipped('music') || owned[0].id;
        const active = findTrack(activeId) || owned[0];
        const discUrl = createVinylDiscUrl(active);
        const autoOn = autoStartEnabled();

        box.innerHTML = `
          <div class="pause-music__card">
            <div class="pause-music__now">
              <img class="pause-music__disc ${playing ? 'is-spinning' : ''}" src="${discUrl}" alt="">
              <div class="pause-music__meta">
                <span class="pause-music__kicker">💿 Vinyle en jeu</span>
                <strong class="pause-music__title">${active.title}</strong>
                <small class="pause-music__mood">${active.mood} · ${playing ? 'Lecture en cours' : 'En pause'}</small>
              </div>
              <div class="pause-music__actions">
                <button type="button" class="pause-music__btn" data-music-act="toggle" title="${playing ? 'Mettre en pause' : 'Lire'}">${playing ? '⏸' : '▶'}</button>
                <button type="button" class="pause-music__auto ${autoOn ? 'is-on' : ''}" data-music-act="autostart" title="Lancer automatiquement au début de chaque partie">Auto ${autoOn ? 'ON' : 'OFF'}</button>
              </div>
            </div>
            <div class="pause-music__list">
              ${owned.map((t) => {
                  const isActive = t.id === active.id;
                  return `<button type="button" class="pause-music__track ${isActive ? 'is-on' : ''}" data-music-act="select" data-id="${t.id}">
                    <img src="${createVinylCoverUrl(t)}" alt="">
                    <span>${t.title}</span>
                  </button>`;
              }).join('')}
            </div>
          </div>`;
    }

    return {
        togglePreview,
        stopPreview,
        stop,
        onRunStart,
        stopRun,
        selectInRun,
        toggleRunPlay,
        refreshPause,
        mountPause,
        state,
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        }
    };
}
