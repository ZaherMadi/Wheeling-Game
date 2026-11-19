// Global cinematic speedup: shows a '>>' button during cutscenes (tow truck,
// police stops, podium entrances, Love&Faith endings, crash sequences). Tapping
// or spamming it progressively speeds the scene up.

const active = new Set();
let speed = 1;
let lastTap = 0;
let lastRead = 0;
let button = null;

const MAX_SPEED = 7;
const HOLD_MS = 2400;

function ensureButton() {
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'ui-cinema-skip';
    button.className = 'ui-cinema-skip';
    button.hidden = true;
    button.setAttribute('aria-label', 'Accélérer la cinématique');
    button.innerHTML = '<span class="ui-cinema-skip__arrows">&gt;&gt;</span><span class="ui-cinema-skip__rate"></span>';
    const trigger = (event) => {
        event.preventDefault();
        event.stopPropagation();
        boostCinematic();
    };
    button.addEventListener('pointerdown', trigger);
    button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') trigger(event);
    });
    (document.getElementById('ui-layer') || document.body).append(button);
    return button;
}

function renderButton() {
    const el = ensureButton();
    el.hidden = active.size === 0;
    const rate = el.querySelector('.ui-cinema-skip__rate');
    if (rate) rate.textContent = speed > 1.05 ? `×${speed.toFixed(1)}` : '';
    el.classList.toggle('is-boosted', speed > 1.05);
}

export function beginCinematic(name = 'scene') {
    if (active.size === 0) {
        speed = 1;
        lastTap = 0;
    }
    active.add(name);
    lastRead = performance.now();
    renderButton();
}

export function endCinematic(name = 'scene') {
    active.delete(name);
    if (active.size === 0) {
        speed = 1;
        lastTap = 0;
    }
    renderButton();
}

export function boostCinematic() {
    if (active.size === 0) return 1;
    speed = Math.min(MAX_SPEED, Math.round((speed * 1.28 + 0.35) * 10) / 10);
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
    if (speed > 1 && lastTap > 0 && now - lastTap > HOLD_MS) {
        speed = Math.max(1, speed - dt * 0.85);
        renderButton();
    }
    return speed;
}

export function cinematicActive() {
    return active.size > 0;
}
