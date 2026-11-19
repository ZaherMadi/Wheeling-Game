// Global cinematic speedup: shows an interactive capsule during cutscenes
// (tow truck, police stops, podium entrances, Love&Faith endings, crashes).
// Tapping or holding progressively accelerates playback.
import { installModernIcons, modernIcon } from './ui/modern-icons.js';

const active = new Set();
let speed = 1;
let lastTap = 0;
let lastRead = 0;
let isHeld = false;
let lastTriggerAt = 0;
let lastRenderedBoost = null;
let lastRenderedRate = null;
let button = null;

const MAX_SPEED = 8;
const HOLD_MS = 2400;

function releaseHold() {
    if (!isHeld) return;
    isHeld = false;
    button?.classList.remove('is-held');
}

function ensureButton() {
    if (button) return button;
    installModernIcons();
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'ui-cinema-skip';
    button.className = 'ui-cinema-skip';
    button.hidden = true;
    button.setAttribute('aria-label', 'Accélérer la cinématique');
    button.innerHTML =
        `<span class="ui-cinema-skip__badge" aria-hidden="true">${modernIcon('fastfwd', 'ui-cinema-skip__icon')}</span>` +
        `<span class="ui-cinema-skip__text">ACCÉLÉRER</span>` +
        `<span class="ui-cinema-skip__rate"></span>`;

    const triggerBoost = (event) => {
        if (active.size === 0) return;
        const now = performance.now();
        if (now - lastTriggerAt < 140) return;
        lastTriggerAt = now;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        boostCinematic();
    };

    button.addEventListener('pointerdown', (event) => {
        if (active.size === 0) return;
        isHeld = true;
        button.classList.add('is-held');
        triggerBoost(event);
    }, { passive: false });

    button.addEventListener('click', (event) => {
        // Deduplicate paired pointerdown + click while supporting synthetic/keyboard clicks.
        if (performance.now() - lastTriggerAt < 250) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        triggerBoost(event);
    });

    button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            isHeld = true;
            button.classList.add('is-held');
            triggerBoost(event);
        }
    });
    button.addEventListener('keyup', (event) => {
        if (event.key === 'Enter' || event.key === ' ') releaseHold();
    });

    window.addEventListener('pointerup', releaseHold);
    window.addEventListener('pointercancel', releaseHold);
    window.addEventListener('blur', releaseHold);

    document.body.append(button);
    return button;
}

function renderButton() {
    const el = ensureButton();
    const shouldShow = active.size > 0;
    if (el.hidden === shouldShow) el.hidden = !shouldShow;
    const boosted = speed > 1.05;
    const rateLabel = boosted ? `×${speed.toFixed(1)}` : '';
    if (lastRenderedRate !== rateLabel) {
        const rate = el.querySelector('.ui-cinema-skip__rate');
        if (rate) rate.textContent = rateLabel;
        lastRenderedRate = rateLabel;
    }
    if (lastRenderedBoost !== boosted) {
        el.classList.toggle('is-boosted', boosted);
        lastRenderedBoost = boosted;
    }
}

export function beginCinematic(name = 'scene') {
    if (active.has(name)) return;
    if (active.size === 0) {
        speed = 1;
        lastTap = 0;
        isHeld = false;
        lastRenderedBoost = null;
        lastRenderedRate = null;
        lastRead = performance.now();
    }
    active.add(name);
    renderButton();
}

export function endCinematic(name = 'scene') {
    if (!active.has(name)) return;
    active.delete(name);
    if (active.size === 0) {
        speed = 1;
        lastTap = 0;
        releaseHold();
    }
    renderButton();
}

export function boostCinematic() {
    if (active.size === 0) return 1;
    speed = Math.min(MAX_SPEED, Math.round((speed * 1.28 + 0.4) * 10) / 10);
    lastTap = performance.now();
    renderButton();
    if (button) {
        button.classList.remove('is-pulse');
        void button.offsetWidth;
        button.classList.add('is-pulse');
    }
    return speed;
}

export function cinematicSpeed() {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - lastRead) / 1000));
    lastRead = now;
    if (active.size === 0) return 1;
    if (isHeld) {
        const next = Math.min(MAX_SPEED, speed + dt * 5.2);
        if (next !== speed) {
            speed = next;
            lastTap = now;
            renderButton();
        }
        return speed;
    }
    if (speed > 1 && lastTap > 0 && now - lastTap > HOLD_MS) {
        speed = Math.max(1, speed - dt * 0.85);
        renderButton();
    }
    return speed;
}

export function cinematicActive() {
    return active.size > 0;
}
