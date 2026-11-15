// Trophy room (from the leaderboard): podium medals, then two pages to swipe
// between, the "first for..." trophies (the month is the biggest) and the
// 24H leaderboard's, then everything cumulative points unlock, secret until
// reached. A trophy won, tapped: why and when, and the trophy turning in 3D.
// Both versions.
import { rewards } from './unlocks.js';
import { showTrophy3D } from './trophy-3d.js';

// [key, label, face, rim, why it is won, how to win it]
const MEDALS = [
    ['gold', '1re place', '#f6c416', '#b8860b', 'atteint la 1re place du classement général', 'Prends la 1re place du classement général.'],
    ['silver', '2e place', '#e3e7ec', '#8f98a3', 'atteint la 2e place (ou mieux) du classement général', 'Monte à la 2e place du classement général.'],
    ['bronze', '3e place', '#e09a62', '#8a4a1f', 'atteint le podium du classement général', 'Monte sur le podium du classement général.']
];
const LEADER = [
    ['first_3_days', '1er pendant 3 jours', 64, 'gardé la 1re place du classement pendant 3 jours au total', 'Reste 1er du classement 3 jours au total.'],
    ['first_week', '1er pendant 1 semaine', 78, 'gardé la 1re place du classement pendant 1 semaine au total', 'Reste 1er du classement 1 semaine au total.'],
    ['first_month', '1er pendant 1 mois', 100, 'gardé la 1re place du classement pendant 1 mois au total', 'Reste 1er du classement 1 mois au total.']
];
const DAILY = [
    ['daily_podium', 'Podium 24H', 64, 'Termine dans les 3 premiers d’un Classement 24H (à 6:00 GMT).'],
    ['daily_first', '1er d’un 24H', 78, 'Termine 1er d’un Classement 24H (à 6:00 GMT).'],
    ['daily_first_3', '3 victoires 24H', 100, 'Termine 1er de trois Classements 24H.']
];
const DAILY_COLOR = '#58c8f0';
const place = (rank) => (rank === 1 ? '1er' : `${rank}e`);

function medal(face, rim, label) {
    return `<svg viewBox="0 0 64 80" width="56" height="70" aria-hidden="true">
        <path d="M18 2h12l6 26H24zM34 2h12l-6 26h-12z" fill="#2d5bd6"/><path d="M30 2h4l2 26h-8z" fill="#e8282e"/>
        <circle cx="32" cy="50" r="22" fill="${rim}"/><circle cx="32" cy="50" r="17.5" fill="${face}"/>
        <text x="32" y="57" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="19" fill="${rim}">${label}</text>
    </svg>`;
}

function cup(size, color = '#f6c416', dark = '#b8860b', mark = '') {
    return `<svg viewBox="0 0 64 72" width="${size}" height="${Math.round(size * 1.12)}" aria-hidden="true">
        <path d="M14 6h36v14c0 13-8 22-18 22S14 33 14 20z" fill="${color}"/>
        <path d="M14 10H5c0 11 5 17 12 18M50 10h9c0 11-5 17-12 18" fill="none" stroke="${color}" stroke-width="4"/>
        <path d="M27 41h10v10H27z" fill="${dark}"/><path d="M18 51h28v7H18zM14 58h36v8H14z" fill="${dark}"/>
        <path d="M22 10h6v14c0 6-3 9-6 10z" fill="#fff" opacity=".45"/>
        ${mark ? `<text x="32" y="27" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="12" fill="${dark}">${mark}</text>` : ''}
    </svg>`;
}

function duration(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days) return `${days} j ${hours} h`;
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// "Obtenu le 15/11/2026 à 07:00" (the player's own clock).
function when(iso) {
    const date = iso ? new Date(iso) : null;
    if (!date || Number.isNaN(date.getTime())) return null;
    return `le ${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

function day(name) {
    const [year, month, date] = String(name || '').split('-');
    return year && month && date ? `${date}/${month}/${year}` : name;
}

// Why a daily trophy was won, from the server's details.
function dailyReason(key, detail) {
    const score = Number.isFinite(detail?.score) ? ` avec ${detail.score.toLocaleString('fr-FR')} points` : '';
    if (key === 'daily_first_3') return `terminé 1er de ${detail?.wins || 3} Classements 24H (le dernier, celui du ${day(detail?.day)}${score})`;
    return `terminé ${place(detail?.rank || 1)} du Classement 24H du ${day(detail?.day)}${score}`;
}

// data: { trophies: API answer or null, points, nickname, error }
export function renderTrophyRoom(container, { trophies, points, nickname, error }) {
    container.textContent = '';
    const details = trophies?.details || {};
    let closeDetail = () => {};

    // A trophy: a button. Won: its story below, turning in 3D. Not yet: how.
    function trophy(item, { key, label, won, picture, reason, how, shape }) {
        // Not a <button>: the game's buttons carry a heavy look of their own.
        item.className = `trophy-item ${won ? 'is-won' : 'is-locked'}`;
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.innerHTML = picture;
        item.append(element('span', 'trophy-item__label', label));
        item.setAttribute('aria-expanded', 'false');
        item.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            item.click();
        });
        item.addEventListener('click', () => {
            const section = item.closest('.trophy-section');
            const open = item.getAttribute('aria-expanded') === 'true';
            closeDetail();
            if (open) return;
            const box = element('div', 'trophy-detail');
            box.setAttribute('role', 'status');
            let free = () => {};
            if (won) {
                const stage = element('div', 'trophy-detail__stage');
                box.append(stage);
                free = showTrophy3D(stage, shape);
                const earned = when(details[key]?.earned_at);
                box.append(element('p', 'trophy-detail__text',
                    `Car vous avez ${reason}. ${earned ? `Obtenu ${earned}, félicitations !` : 'Félicitations !'}`));
                if (!earned) box.append(element('p', 'trophy-detail__small', 'Obtenu avant que les dates soient gardées.'));
            } else {
                box.append(element('p', 'trophy-detail__text', `Pas encore. ${how}`));
            }
            section.append(box);
            item.setAttribute('aria-expanded', 'true');
            item.classList.add('is-shown');
            closeDetail = () => {
                free();
                box.remove();
                item.setAttribute('aria-expanded', 'false');
                item.classList.remove('is-shown');
                closeDetail = () => {};
            };
        });
        return item;
    }

    const podium = element('section', 'trophy-section');
    podium.append(element('h2', 'trophy-section__title', 'Podium'));
    const medals = element('div', 'trophy-row');
    MEDALS.forEach(([key, label, face, rim, reason, how], index) => {
        const won = !!trophies?.medals?.[key];
        medals.append(trophy(element('div'), {
            key, label, won, reason, how,
            picture: medal(won ? face : '#3a3d44', won ? rim : '#24262b', String(index + 1)),
            shape: { kind: 'medal', color: face, label: String(index + 1) }
        }));
    });
    podium.append(medals);

    // Two pages side by side: swipe (or the dots) from one to the other.
    const pages = element('div', 'trophy-pages');
    const leader = element('section', 'trophy-section trophy-page');
    leader.append(element('h2', 'trophy-section__title', 'Premier du classement'));
    const cups = element('div', 'trophy-row trophy-row--cups');
    for (const [key, label, size, reason, how] of LEADER) {
        const won = !!trophies?.leader?.[key];
        cups.append(trophy(element('div'), { key, label, won, reason, how, picture: cup(size), shape: { kind: 'cup', color: '#f6c416' } }));
    }
    leader.append(cups);
    const unavailable = error || (nickname
        ? 'Trophées indisponibles pour le moment.'
        : 'Joue une partie classée avec un pseudo pour gagner des trophées.');
    if (trophies) {
        const facts = [];
        if (trophies.rank) facts.push(`Place actuelle : ${trophies.rank}${trophies.rank === 1 ? 're' : 'e'}`);
        facts.push(`Temps passé premier : ${duration(trophies.leader_seconds || 0)}`);
        leader.append(element('p', 'trophy-note', facts.join(' · ')));
    } else {
        leader.append(element('p', 'trophy-note', unavailable));
    }

    const daily = element('section', 'trophy-section trophy-page');
    daily.append(element('h2', 'trophy-section__title', 'Classement quotidien'));
    const dailyCups = element('div', 'trophy-row trophy-row--cups');
    for (const [key, label, size, how] of DAILY) {
        const won = !!trophies?.daily?.[key];
        dailyCups.append(trophy(element('div'), {
            key, label, won, how, reason: dailyReason(key, details[key]),
            picture: cup(size, DAILY_COLOR, '#1f7fa8', '24H'), shape: { kind: 'cup', color: DAILY_COLOR }
        }));
    }
    daily.append(dailyCups);
    daily.append(element('p', 'trophy-note', trophies
        ? `Victoires : ${trophies.daily_wins || 0} · Podiums : ${trophies.daily_podiums || 0} · un classement par jour, arrêté à 6:00 GMT`
        : unavailable));
    pages.append(leader, daily);

    const dots = element('div', 'trophy-dots');
    dots.setAttribute('role', 'tablist');
    const tabs = [[leader, 'Premier du classement'], [daily, 'Classement quotidien']].map(([page, name], index) => {
        const dot = element('div', 'trophy-dot', name);
        dot.setAttribute('role', 'tab');
        dot.tabIndex = 0;
        dot.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            dot.click();
        });
        dot.addEventListener('click', () => {
            closeDetail();
            pages.scrollTo({ left: index * pages.clientWidth, behavior: 'smooth' });
        });
        dots.append(dot);
        return dot;
    });
    const showPage = () => {
        const current = Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth));
        tabs.forEach((dot, index) => {
            dot.classList.toggle('is-current', index === current);
            dot.setAttribute('aria-selected', String(index === current));
        });
    };
    pages.addEventListener('scroll', showPage, { passive: true });
    showPage();
    const swipe = element('div', 'trophy-swipe');
    swipe.append(dots, pages);

    const unlocks = element('section', 'trophy-section');
    unlocks.append(element('h2', 'trophy-section__title', `À débloquer · ${points} pts cumulés`));
    const list = element('ul', 'trophy-unlocks');
    for (const reward of rewards()) {
        const open = points >= reward.points;
        const row = element('li', `trophy-unlock ${open ? 'is-open' : ''}`);
        row.append(element('span', 'trophy-unlock__points', `${reward.points.toLocaleString('fr-FR')} pts`));
        // Vehicles are known (the garage shows them); the rest stays secret.
        const name = open || reward.kind === 'car' ? reward.name : reward.hint;
        const label = element('span', 'trophy-unlock__name', name);
        // Unlocked: how to use it.
        if (open && reward.how) label.append(element('small', 'trophy-unlock__how', reward.how));
        row.append(label);
        row.append(element('span', 'trophy-unlock__state', open ? '✓' : '🔒'));
        list.append(row);
    }
    unlocks.append(list);

    container.append(podium, swipe, unlocks);
}
