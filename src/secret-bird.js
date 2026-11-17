// A small golden bird crosses the menu every 30 s. Tapped, it tells the
// secret codes the player's rank (cumulative points) has revealed: what each
// does, the keys to press in pictures, and a short video. The codes work
// for whoever knows them; the bird only tells them.
import { GLIDER_POINTS, TRICKS_CODE_POINTS } from './unlocks.js';

const EVERY_MS = 30000;
const FIRST_MS = 12000;

// v2Only: the glider lives in the new version's free roam.
export const SECRET_CODES = [
    {
        key: 'glider', points: GLIDER_POINTS, name: 'Deltaplane', v2Only: true,
        where: 'En mode libre, assis sur la moto',
        does: 'Un deltaplane t’emmène au-dessus de la rue : gauche / droite pour te diriger, puis tu te poses en courant. La police vient le reprendre (une fois sur deux avec 50 points).',
        video: '/video/code-deltaplane.mp4', poster: '/video/code-deltaplane.jpg'
    },
    {
        key: 'tricks', points: TRICKS_CODE_POINTS, name: 'Mode figures',
        where: 'En compétitif, dans les 10 premières secondes',
        does: 'Plus d’obstacles ni de police : tremplins et figures dès le départ. La partie n’est plus classée ; un dixième du score s’ajoute à tes points cumulés.',
        video: '/video/code-figures.mp4', poster: '/video/code-figures.jpg'
    },
    {
        // Revealed by buying the free roam tricks (not by points).
        key: 'land', name: 'Figures Land', v2Only: true, steps: [2, 2, 1, 3],
        unlocked: () => {
            try {
                return localStorage.getItem('wheelie_free_tricks') === '1';
            } catch {
                return false;
            }
        },
        locked: 'Code révélé en activant les figures en mode libre (5 000 points cumulés, dans le choix du mode libre).',
        where: 'En mode libre, assis sur la moto',
        does: 'Figures Land, le parc secret, t’attend dans une des prochaines rues : suis le panneau.'
    }
];

const STEPS = [
    ['Gaz', '<path d="M12 19V6M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>', 'touche ↑ ou bouton GAZ'],
    ['Frein', '<path d="M12 5v13M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>', 'touche ↓ ou bouton FREIN'],
    ['Wheeling', '<circle cx="7" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 17l5-7h5M12 10l-2-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>', 'Espace ou bouton WHEELIE'],
    ['Compteur ×3', '<path d="M4 16a8 8 0 1 1 16 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 16l4-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16" r="1.6" fill="currentColor"/>', '3 touches sur le compteur de vitesse']
];

const BIRD = `<svg viewBox="0 0 48 36" width="44" height="33" aria-hidden="true">
    <defs><linearGradient id="bird-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".45" stop-color="#f6c416"/><stop offset="1" stop-color="#b8860b"/></linearGradient></defs>
    <path class="golden-bird__wing golden-bird__wing--up" d="M22 17C19 8 12 3 5 2c3 4 5 9 8 15z" fill="url(#bird-gold)"/>
    <path class="golden-bird__wing golden-bird__wing--down" d="M22 18c-4 6-10 10-17 11 5-5 6-9 9-12z" fill="url(#bird-gold)"/>
    <path d="M9 19c4-5 12-6 20-4 4 1 7 3 9 5-4 4-11 6-18 5-5-1-8-3-11-6z" fill="url(#bird-gold)"/>
    <path d="M9 19L1 15l2 6-2 5z" fill="#d9a21b"/><circle cx="35" cy="17" r="5.2" fill="url(#bird-gold)"/>
    <path d="M39.5 16l7 1.6-7 2.2z" fill="#ff9d2e"/><circle cx="36.3" cy="15.8" r="1.1" fill="#3a2a05"/>
</svg>`;

function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

// menu: the start screen; points(): cumulative points; newVersion: V2.
export function createSecretBird({ menu, points, newVersion }) {
    if (!menu) return null;
    const codes = SECRET_CODES.filter((code) => newVersion || !code.v2Only);

    const bird = node('div', 'golden-bird');
    bird.id = 'golden-bird';
    bird.setAttribute('role', 'button');
    bird.tabIndex = -1;
    bird.setAttribute('aria-label', 'Oiseau doré : les codes secrets');
    bird.innerHTML = BIRD;
    menu.append(bird);

    const dialog = node('div', 'account-dialog codes-dialog');
    dialog.id = 'codes-dialog';
    dialog.hidden = true;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'codes-title');
    dialog.innerHTML = '<div class="account-card codes-card"><button type="button" class="account-close" aria-label="Fermer">✕</button>' +
        '<h2 id="codes-title">Codes secrets</h2><p class="account-text codes-rank"></p><div class="codes-list"></div></div>';
    document.body.append(dialog);

    function close() {
        dialog.querySelectorAll('video').forEach((video) => video.pause());
        dialog.hidden = true;
    }
    dialog.querySelector('.account-close').addEventListener('click', close);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) close();
    });
    dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close();
        event.stopPropagation();
    });

    function renderCode(code, total) {
        const card = node('section', 'code-card');
        if (code.unlocked ? !code.unlocked() : total < code.points) {
            card.classList.add('is-hidden');
            card.append(node('h3', 'code-card__name', '???'));
            card.append(node('p', 'code-card__text', code.locked || `Code révélé à ${code.points.toLocaleString('fr-FR')} points cumulés (il t’en manque ${(code.points - total).toLocaleString('fr-FR')}).`));
            return card;
        }
        card.append(node('h3', 'code-card__name', code.name));
        card.append(node('p', 'code-card__where', code.where));
        card.append(node('p', 'code-card__text', code.does));
        const steps = node('ol', 'code-steps');
        steps.setAttribute('aria-label', 'Le code, dans l’ordre');
        (code.steps || [0, 1, 2, 3]).map((step) => STEPS[step]).forEach(([label, picture, hint], index) => {
            const step = node('li', 'code-step');
            step.style.setProperty('--step', index);
            step.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">${picture}</svg>`;
            step.append(node('b', '', label), node('small', '', hint));
            steps.append(step);
        });
        card.append(steps);
        if (!code.video) return card;
        const video = node('video', 'code-video');
        video.src = code.video;
        video.poster = code.poster;
        video.controls = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'none';
        video.setAttribute('aria-label', `Vidéo : ${code.name}`);
        // No video (offline, missing file): the pictures and the text remain.
        video.addEventListener('error', () => video.remove());
        card.append(video);
        return card;
    }

    function open() {
        const total = points();
        dialog.querySelector('.codes-rank').textContent = `Ton rang : ${total.toLocaleString('fr-FR')} points cumulés. ` +
            'Les codes se révèlent avec les points ; ils se tapent pendant la partie.';
        const list = dialog.querySelector('.codes-list');
        list.textContent = '';
        codes.forEach((code) => list.append(renderCode(code, total)));
        dialog.hidden = false;
        dialog.querySelector('.account-close').focus();
    }
    bird.addEventListener('click', (event) => {
        event.stopPropagation();
        open();
    });
    bird.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
        }
    });

    // One crossing: a height and a side picked each time.
    function fly() {
        const visible = menu.classList.contains('active') && !document.hidden && dialog.hidden
            && !document.querySelector('.account-dialog:not([hidden])');
        if (!visible || bird.classList.contains('is-flying')) return;
        const fromLeft = Math.random() < 0.5;
        // The band above the logo, under the account chip.
        bird.style.setProperty('--bird-top', `${7 + Math.random() * 9}%`);
        bird.classList.toggle('is-leftward', !fromLeft);
        bird.classList.add('is-flying');
        bird.tabIndex = 0;
    }
    bird.addEventListener('animationend', (event) => {
        if (event.target !== bird) return;
        bird.classList.remove('is-flying');
        bird.tabIndex = -1;
    });
    setTimeout(() => {
        fly();
        setInterval(fly, EVERY_MS);
    }, FIRST_MS);

    return { open, close, fly };
}
