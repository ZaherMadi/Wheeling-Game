// Racing interface for the realistic version: menu, settings, leaderboard,
// game over, HUD and touch controls. It only restyles and decorates the
// existing elements (same ids, same listeners), so main.js keeps driving
// the game exactly as before and the classic version is left untouched.
import { icon, installIcons } from './icons.js';
import './ui.css';

const $ = (id) => document.getElementById(id);

// Inline styles that only carried the old look (never toggled by the game).
function dropInlineLook(element) {
    if (element) element.removeAttribute('style');
}

function button(element, { icon: name, label, variant = 'secondary', sub = null, trailing = null }) {
    if (!element) return;
    dropInlineLook(element);
    const [main, ...extra] = variant.split(' ');
    element.classList.add('ui-btn', `ui-btn--${main}`, ...extra);
    element.innerHTML = `<span class="ui-btn__inner">${name ? icon(name) : ''}<span class="ui-btn__text">` +
        `<span class="ui-btn__label">${label}</span>${sub ? `<span class="ui-btn__sub">${sub}</span>` : ''}</span>` +
        `${trailing ? icon(trailing, 'ui-icon ui-icon--trailing') : ''}</span>`;
}

function decorateMenu() {
    const start = $('start-screen');
    if (!start) return;
    start.classList.add('ui-menu');
    const brand = document.createElement('div');
    brand.className = 'ui-brand';
    const actions = document.createElement('div');
    actions.className = 'ui-actions';
    const secondary = document.createElement('div');
    secondary.className = 'ui-actions__row';

    const logo = $('menu-logo');
    dropInlineLook(logo);
    const label = $('version-label');
    label.classList.add('ui-chip');
    brand.append(logo, $('menu-title'), label);

    button($('start-btn'), { icon: 'play', label: 'JOUER', variant: 'primary' });
    button($('settings-btn'), { icon: 'gear', label: 'PARAMÈTRES' });
    button($('leaderboard-btn'), { icon: 'trophy', label: 'CLASSEMENT' });
    button($('fullscreen-btn'), { icon: 'fullscreen', label: 'PLEIN ÉCRAN' });
    secondary.append($('settings-btn'), $('leaderboard-btn'), $('fullscreen-btn'));
    actions.append($('start-btn'), secondary);

    const hint = start.querySelector('.controls');
    if (hint) {
        hint.classList.add('ui-hint');
        hint.innerHTML = '<span><kbd>↑</kbd> Gaz</span><span><kbd>Espace</kbd> Wheeling</span>' +
            '<span><kbd>↓</kbd> Frein</span><span><kbd>←</kbd><kbd>→</kbd> Diriger</span><span><kbd>Échap</kbd> Pause</span>';
    }
    const nickname = $('player-nickname');
    if (nickname) {
        nickname.classList.add('ui-player');
        nickname.style.removeProperty('top');
        nickname.style.removeProperty('right');
        nickname.style.removeProperty('color');
        nickname.style.removeProperty('font-size');
        nickname.style.removeProperty('text-shadow');
        nickname.firstChild.textContent = '';
        nickname.insertAdjacentHTML('afterbegin', icon('user'));
    }
    start.prepend(brand);
    brand.after(actions);
    if (hint) actions.after(hint);
}

function decorateModeSelect() {
    const screen = $('mode-select-screen');
    if (!screen) return;
    screen.classList.add('ui-panel-screen');
    const title = screen.querySelector('h1');
    dropInlineLook(title);
    title.classList.add('ui-title');
    const list = title.nextElementSibling;
    dropInlineLook(list);
    list.classList.add('ui-cards');
    button($('select-competitive'), { icon: 'flag', label: 'COMPÉTITIF', sub: 'Classement + obstacles', variant: 'card' });
    button($('select-freemode'), { icon: 'compass', label: 'MODE LIBRE', sub: 'Balade sans obstacles', variant: 'card ui-btn--alt' });
    button($('back-from-mode-select'), { icon: 'back', label: 'RETOUR', variant: 'ghost' });
}

function decorateSettings() {
    const screen = $('settings-screen');
    if (!screen) return;
    screen.classList.add('ui-panel-screen', 'ui-settings');
    screen.querySelector('h1').classList.add('ui-title');
    const items = {
        'btn-cat-controls': ['gamepad', 'TYPE DE CONTRÔLES'],
        'btn-cat-gamemode': ['flag', 'MODE DE JEU'],
        'btn-cat-options': ['sliders', 'SON & VOIX'],
        'btn-cat-graphics': ['sparkle', 'QUALITÉ GRAPHIQUE'],
        'btn-cat-version': ['layers', 'VERSION DU JEU'],
        'btn-cat-rider': ['helmet', 'PERSONNAGE']
    };
    for (const [id, [name, label]] of Object.entries(items)) {
        button($(id), { icon: name, label, variant: 'row', trailing: 'chevron' });
    }
    screen.querySelectorAll('.back-to-main-btn').forEach((element) => {
        button(element, { icon: 'back', label: 'RETOUR', variant: 'ghost' });
    });
    button($('back-btn'), { icon: 'back', label: 'RETOUR AU JEU', variant: 'ghost' });
    screen.querySelectorAll('.settings-submenu').forEach((menu) => {
        menu.classList.add('ui-submenu');
        menu.querySelectorAll('h3').forEach((heading) => dropInlineLook(heading));
        menu.querySelectorAll('.settings-group').forEach((group) => dropInlineLook(group));
    });
}

function decorateLeaderboard() {
    const screen = $('leaderboard-screen');
    if (!screen) return;
    screen.classList.add('ui-panel-screen');
    const header = screen.firstElementChild;
    dropInlineLook(header);
    header.classList.add('ui-heading');
    header.querySelector('span').outerHTML = icon('trophy', 'ui-icon ui-icon--hero');
    const title = header.querySelector('h1');
    dropInlineLook(title);
    title.classList.add('ui-title');
    const list = $('leaderboard-list');
    dropInlineLook(list);
    list.classList.add('ui-board');
    button($('back-from-leaderboard'), { icon: 'back', label: 'RETOUR', variant: 'ghost' });
}

function decorateGameOver() {
    const screen = $('game-over-screen');
    if (!screen) return;
    screen.classList.add('ui-gameover');
    const [logo, title] = screen.children;
    logo.remove();
    dropInlineLook(title);
    title.classList.add('ui-title', 'ui-title--alert');
    title.textContent = 'CHUTE !';
    const score = $('final-score').parentElement;
    score.classList.add('ui-final');
    score.innerHTML = '<span class="ui-final__label">SCORE</span>';
    const value = document.createElement('span');
    value.id = 'final-score';
    value.className = 'ui-final__value';
    value.textContent = '0';
    score.append(value);
    $('high-score-display').classList.add('ui-best');
    const status = $('ranking-status');
    status.style.removeProperty('color');
    status.style.removeProperty('max-width');
    status.classList.add('ui-status');
    button($('restart-btn'), { icon: 'replay', label: 'REJOUER', variant: 'primary' });
}

function decorateNickname() {
    const popup = $('nickname-popup');
    if (!popup) return;
    popup.classList.add('ui-dialog');
    const card = popup.firstElementChild;
    dropInlineLook(card);
    card.classList.add('ui-dialog__card');
    for (const element of card.querySelectorAll('h2, p, input')) dropInlineLook(element);
    card.querySelectorAll('br').forEach((element) => element.remove());
    const close = $('close-nickname-popup');
    dropInlineLook(close);
    close.className = 'ui-dialog__close';
    close.innerHTML = icon('close');
    close.setAttribute('aria-label', 'Fermer');
    button($('submit-nickname'), { icon: 'check', label: 'VALIDER', variant: 'primary' });
    button($('skip-nickname'), { label: 'PASSER', variant: 'ghost' });
}

// HUD ------------------------------------------------------------------------
const GAUGE_ARC = 'M25.6 94.4A48.6 48.6 0 1 1 94.4 94.4';

function decorateHud() {
    const score = $('score-container');
    if (score) {
        const value = $('score');
        score.textContent = '';
        score.insertAdjacentHTML('afterbegin', '<span class="ui-score__label">SCORE</span>');
        value.classList.add('ui-score__value');
        score.append(value);
    }
    const pause = $('pause-btn');
    if (pause) {
        pause.innerHTML = icon('pause');
        pause.setAttribute('aria-label', 'Pause');
    }

    // Speedometer: graduated ring, progress arc, glowing digits.
    const speedometer = $('speedometer');
    if (speedometer) {
        const ticks = [];
        for (let i = 0; i <= 20; i++) {
            const angle = (135 + i * 13.5) * Math.PI / 180;
            const major = i % 5 === 0;
            const r0 = major ? 37 : 40;
            const r1 = 44;
            ticks.push(`<line x1="${(60 + Math.cos(angle) * r0).toFixed(2)}" y1="${(60 + Math.sin(angle) * r0).toFixed(2)}" ` +
                `x2="${(60 + Math.cos(angle) * r1).toFixed(2)}" y2="${(60 + Math.sin(angle) * r1).toFixed(2)}" class="${major ? 'major' : ''}"/>`);
        }
        speedometer.insertAdjacentHTML('afterbegin', `
            <svg class="ui-gauge" viewBox="0 0 120 120" aria-hidden="true">
                <defs>
                    <linearGradient id="ui-gauge-fill" x1="0" y1="1" x2="1" y2="0">
                        <stop offset="0" stop-color="#f6c416"/>
                        <stop offset="0.6" stop-color="#ff8a1f"/>
                        <stop offset="1" stop-color="#ff2f3d"/>
                    </linearGradient>
                </defs>
                <circle cx="60" cy="60" r="57" class="ui-gauge__face"/>
                <path d="${GAUGE_ARC}" pathLength="100" class="ui-gauge__track"/>
                <path d="${GAUGE_ARC}" pathLength="100" class="ui-gauge__fill"/>
                <g class="ui-gauge__ticks">${ticks.join('')}</g>
            </svg>`);
        const fill = speedometer.querySelector('.ui-gauge__fill');
        const sync = () => {
            const pct = Math.max(0, Math.min(1, Number(speedometer.style.getPropertyValue('--speed')) || 0));
            fill.style.strokeDashoffset = String(100 - pct * 100);
            speedometer.classList.toggle('is-redline', pct > 0.82);
        };
        new MutationObserver(sync).observe(speedometer, { attributes: true, attributeFilter: ['style'] });
        sync();
    }

    const bike = $('bike-emoji');
    if (bike) bike.innerHTML = icon('wheelie');
}

// Touch controls --------------------------------------------------------------
function control(element, name, label) {
    if (!element) return;
    element.classList.add('ui-pad');
    element.innerHTML = `${icon(name)}<span class="ui-pad__label">${label}</span>`;
}

function pressFeedback(element) {
    if (!element) return;
    const on = () => element.classList.add('is-pressed');
    const off = () => element.classList.remove('is-pressed');
    element.addEventListener('pointerdown', on);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) element.addEventListener(type, off);
}

function decorateControls() {
    control($('analog-gas'), 'throttle', 'GAZ');
    control($('analog-brake'), 'brake', 'FREIN');
    control($('analog-wheelie'), 'wheelie', 'WHEELIE');
    const analog = $('analog-controls');
    if (analog && !$('analog-trick')) {
        // Shown by the game when tricks become available.
        analog.insertAdjacentHTML('beforeend', '<button class="action-btn ui-pad ui-pad--trick" id="analog-trick" hidden></button>');
        control($('analog-trick'), 'trick', 'FIGURE');
    }
    for (const id of ['analog-gas', 'analog-brake', 'analog-wheelie', 'analog-trick']) pressFeedback($(id));
    const arrows = { 'btn-left': ['back', ''], 'btn-right': ['chevron', ''], 'btn-up': ['throttle', 'GAZ'], 'btn-down': ['brake', 'FREIN'], 'btn-wheelie': ['wheelie', 'WHEELIE'] };
    for (const [id, [name, label]] of Object.entries(arrows)) {
        control($(id), name, label);
        pressFeedback($(id));
    }
    const base = $('analog-stick-base');
    if (base) {
        base.insertAdjacentHTML('afterbegin', '<span class="ui-stick__guides" aria-hidden="true"></span>');
        pressFeedback(base);
    }
    const countdown = $('countdown-display');
    if (countdown) {
        dropInlineLook(countdown);
        countdown.style.display = 'none';
        countdown.classList.add('ui-countdown');
    }
}

// Short messages from the game (tricks unlocked, trick landed).
function installToasts() {
    const box = document.createElement('div');
    box.id = 'ui-toast';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.getElementById('ui-layer')?.append(box);
    let timer = null;
    document.addEventListener('wheelie:toast', (event) => {
        const { title, text } = event.detail || {};
        box.innerHTML = `<span class="ui-toast__title">${title || ''}</span>${text ? `<span class="ui-toast__text">${text}</span>` : ''}`;
        box.classList.remove('is-shown');
        void box.offsetWidth;
        box.classList.add('is-shown');
        clearTimeout(timer);
        timer = setTimeout(() => box.classList.remove('is-shown'), 2600);
    });
}

export function installRacingUI() {
    installIcons();
    document.body.classList.add('ui-racing');
    // A styling problem must never stop the game: each part fails alone.
    for (const decorate of [decorateMenu, decorateModeSelect, decorateSettings, decorateLeaderboard,
        decorateGameOver, decorateNickname, decorateHud, decorateControls, installToasts]) {
        try {
            decorate();
        } catch (error) {
            console.warn(`Interface: ${decorate.name} failed`, error);
        }
    }
    // iOS only applies :active styles when a touch listener exists.
    document.addEventListener('touchstart', () => {}, { passive: true });
}
