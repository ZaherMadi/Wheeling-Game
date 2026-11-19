import './gt51-porsche.css';

const TRACK_URL = '/audio/gt51-porsche.mp4';
const FADE_MS = 3000;

let audio = null;
let wideTimer = null;
let hideTimer = null;
let fadeFrame = null;
let activeRevealV2 = null;
let activeSource = null; // 'porsche' | 'vinyl' | null
let playToken = 0;
let experienceInitialized = false;

function setPlayerMeta(title, subtitle) {
    const player = ensurePlayer();
    const strong = player.querySelector('.gt51-vinyl__meta strong');
    const span = player.querySelector('.gt51-vinyl__meta span');
    if (strong) strong.textContent = title;
    if (span) span.textContent = subtitle;
}

function ensurePlayer() {
    let player = document.getElementById('gt51-vinyl-player');
    if (player) return player;
    player = document.createElement('div');
    player.id = 'gt51-vinyl-player';
    player.innerHTML =
        '<span class="gt51-vinyl__disc" aria-hidden="true"></span>' +
        '<span class="gt51-vinyl__meta"><strong>GT 51 CABRIO</strong><span>RAK33M — Je pensais pas</span></span>' +
        '<button class="gt51-vinyl__pause" type="button" aria-label="Pause ou reprise">▶</button>';
    document.body.append(player);
    player.querySelector('.gt51-vinyl__pause').addEventListener('click', (event) => {
        event.stopPropagation();
        if (activeSource === 'porsche') {
            if (!audio) return;
            if (audio.paused) {
                audio.play().then(() => syncPlayer(true)).catch(() => syncPlayer(false));
            } else {
                audio.pause();
                syncPlayer(false);
            }
        } else if (activeSource === 'vinyl') {
            document.dispatchEvent(new CustomEvent('wheelie:vinyl-toggle'));
        }
    });
    player.addEventListener('click', (event) => {
        if (event.target.closest('.gt51-vinyl__pause')) return;
        player.classList.add('is-wide');
        clearTimeout(wideTimer);
        wideTimer = setTimeout(() => player.classList.remove('is-wide'), 5200);
    });
    return player;
}

function syncPlayer(playing, { wide } = {}) {
    const player = ensurePlayer();
    player.classList.add('is-visible');
    player.classList.toggle('is-playing', !!playing);
    if (wide !== undefined) player.classList.toggle('is-wide', !!wide);
    const button = player.querySelector('.gt51-vinyl__pause');
    if (button) button.textContent = playing ? 'Ⅱ' : '▶';
}

function clearFade() {
    if (fadeFrame) cancelAnimationFrame(fadeFrame);
    fadeFrame = null;
}

function fadeIn() {
    clearFade();
    const started = performance.now();
    const target = 0.62;
    audio.volume = 0;
    const tick = (now) => {
        if (!audio || audio.paused) {
            fadeFrame = null;
            return;
        }
        const t = Math.min(1, (now - started) / FADE_MS);
        audio.volume = target * t;
        if (t < 1) fadeFrame = requestAnimationFrame(tick);
        else fadeFrame = null;
    };
    fadeFrame = requestAnimationFrame(tick);
}

export function getPorscheTrack() {
    if (!audio) {
        audio = new Audio();
        audio.preload = 'auto';
        audio.loop = true;
        audio.src = TRACK_URL;
    }
    return audio;
}

export function startPorscheTrack({ fromUnlock = false } = {}) {
    activeSource = 'porsche';
    const token = ++playToken;
    document.dispatchEvent(new CustomEvent('wheelie:porsche-audio', { detail: { playing: true } }));

    const track = getPorscheTrack();
    const player = ensurePlayer();
    setPlayerMeta('GT 51 CABRIO', 'RAK33M — Je pensais pas');
    syncPlayer(false, { wide: true });
    clearTimeout(wideTimer);
    clearTimeout(hideTimer);
    if (!fromUnlock) {
        hideTimer = setTimeout(() => {
            if (!document.body.classList.contains('gt51-reveal-active')) {
                player.classList.remove('is-wide');
            }
        }, 5200);
    }

    const begin = () => {
        if (token !== playToken) return;
        if (fromUnlock) {
            try { track.currentTime = Math.max(67, 0); } catch {}
        }
        track.loop = true;
        track.play().then(() => {
            if (token !== playToken) return;
            fadeIn();
            syncPlayer(true);
        }).catch(() => {
            if (token === playToken) syncPlayer(false);
        });
    };
    if (track.readyState >= 1) begin();
    else {
        track.addEventListener('loadedmetadata', begin, { once: true });
        if (track.readyState === 0) track.load();
    }
}

export function stopPorscheTrack({ hidePlayer = true } = {}) {
    playToken++;
    clearFade();
    if (audio) {
        audio.pause();
        try { audio.currentTime = 0; } catch {}
    }
    if (hidePlayer && activeSource === 'porsche') {
        clearTimeout(wideTimer);
        clearTimeout(hideTimer);
        activeSource = null;
        const player = document.getElementById('gt51-vinyl-player');
        if (player) {
            player.classList.remove('is-visible', 'is-playing', 'is-wide');
        }
    }
}

export function showPorscheVinyl({ wide = false, playing = true, title = 'GT 51 CABRIO', subtitle = 'Mode Porsche' } = {}) {
    const player = ensurePlayer();
    setPlayerMeta(title, subtitle);
    clearTimeout(wideTimer);
    clearTimeout(hideTimer);
    syncPlayer(playing, { wide });
    hideTimer = setTimeout(() => {
        player.classList.remove('is-wide');
    }, 5200);
}

export function closeGt51UnlockReveal() {
    const reveal = document.getElementById('gt51-unlock-reveal');
    if (!reveal || !reveal.classList.contains('is-visible')) return;
    reveal.classList.remove('is-visible');
    document.body.classList.remove('gt51-reveal-active');
    activeRevealV2?.showroomPreset?.('side');
    const player = document.getElementById('gt51-vinyl-player');
    if (player && activeSource === 'porsche') {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            player.classList.remove('is-wide');
        }, 4000);
    }
}

export function showGt51UnlockReveal({ v2, name = 'GT 51 Cabrio' } = {}) {
    activeRevealV2 = v2 || null;
    let reveal = document.getElementById('gt51-unlock-reveal');
    if (!reveal) {
        reveal = document.createElement('div');
        reveal.id = 'gt51-unlock-reveal';
        reveal.innerHTML =
            '<h2 class="gt51-reveal__title">Vous avez débloqué</h2>' +
            '<button class="gt51-reveal__close" type="button" aria-label="Quitter">×</button>' +
            '<h3 class="gt51-reveal__name"></h3>';
        document.body.append(reveal);

        for (let i = 0; i < 42; i++) {
            const spark = document.createElement('i');
            spark.className = 'gt51-reveal__spark';
            const angle = (i / 42) * Math.PI * 2 + Math.random() * 0.25;
            const radius = 180 + Math.random() * 320;
            spark.style.setProperty('--spark-x', `${Math.cos(angle) * radius}px`);
            spark.style.setProperty('--spark-y', `${Math.sin(angle) * radius}px`);
            spark.style.setProperty('--spark-delay', `${0.15 + Math.random() * 0.55}s`);
            spark.style.setProperty('--spark-time', `${1.2 + Math.random() * 1.4}s`);
            spark.style.setProperty('--spark-color', i % 3 === 0 ? '#ffffff' : i % 2 === 0 ? '#ffdf45' : '#ffd000');
            reveal.append(spark);
        }

        reveal.querySelector('.gt51-reveal__close').addEventListener('click', (event) => {
            event.stopPropagation();
            closeGt51UnlockReveal();
        });
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && reveal.classList.contains('is-visible')) {
                closeGt51UnlockReveal();
            }
        });
        reveal.addEventListener('wheel', (event) => {
            event.preventDefault();
            activeRevealV2?.showroomPreset?.('zoom');
        }, { passive: false });
        let dragging = false;
        let lastX = 0;
        const activePointers = new Map();
        let pinchDistance = 0;
        reveal.addEventListener('pointerdown', (event) => {
            if (event.target instanceof Element && event.target.closest('.gt51-reveal__close')) return;
            dragging = true;
            lastX = event.clientX;
            activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            reveal.setPointerCapture?.(event.pointerId);
        });
        reveal.addEventListener('pointermove', (event) => {
            if (activePointers.has(event.pointerId)) {
                activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            }
            if (activePointers.size >= 2) {
                const points = Array.from(activePointers.values());
                const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
                if (pinchDistance > 0 && Math.abs(distance - pinchDistance) > 18) {
                    activeRevealV2?.showroomPreset?.('zoom');
                }
                pinchDistance = distance;
                return;
            }
            if (!dragging) return;
            const dx = event.clientX - lastX;
            if (Math.abs(dx) > 1) {
                activeRevealV2?.showroomTurn?.(dx * 0.012);
                lastX = event.clientX;
            }
        });
        reveal.addEventListener('pointerup', (event) => {
            activePointers.delete(event.pointerId);
            pinchDistance = 0;
            dragging = activePointers.size > 0;
        });
        reveal.addEventListener('pointercancel', (event) => {
            activePointers.delete(event.pointerId);
            pinchDistance = 0;
            dragging = false;
        });
    }

    reveal.querySelector('.gt51-reveal__name').textContent = name;
    reveal.classList.remove('is-visible');
    void reveal.offsetWidth;
    document.body.classList.add('gt51-reveal-active');
    reveal.classList.add('is-visible');
    activeRevealV2?.showroomPreset?.('spin');
    startPorscheTrack({ fromUnlock: true });
}

export function initPorscheExperience() {
    if (experienceInitialized) return;
    experienceInitialized = true;

    document.addEventListener('wheelie:controls', (event) => {
        const mode = event.detail?.mode;
        const model = event.detail?.model || null;
        if (mode !== 'car' || model !== 'gt-cabrio-5hc') stopPorscheTrack();
    });
    document.addEventListener('wheelie:vinyl-track', (event) => {
        if (event.detail?.stopped) {
            if (activeSource === 'vinyl') {
                clearTimeout(wideTimer);
                clearTimeout(hideTimer);
                activeSource = null;
                const player = document.getElementById('gt51-vinyl-player');
                if (player) {
                    player.classList.remove('is-visible', 'is-playing', 'is-wide');
                }
            }
            return;
        }
        stopPorscheTrack({ hidePlayer: false });
        activeSource = 'vinyl';
        showPorscheVinyl({
            wide: true,
            playing: event.detail?.playing !== false,
            title: event.detail?.title || '51 Wheeling',
            subtitle: event.detail?.subtitle || 'Lecture en cours'
        });
    });
}
