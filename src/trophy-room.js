// Trophy room (from the leaderboard): podium medals, the "first for..."
// trophies (the month is the biggest), then everything cumulative points
// unlock, secret until reached. Both versions.
import { rewards } from './unlocks.js';

const MEDALS = [
    ['gold', '1re place', '#f6c416', '#b8860b'],
    ['silver', '2e place', '#e3e7ec', '#8f98a3'],
    ['bronze', '3e place', '#e09a62', '#8a4a1f']
];
const LEADER = [
    ['first_3_days', '1er pendant 3 jours', 64],
    ['first_week', '1er pendant 1 semaine', 78],
    ['first_month', '1er pendant 1 mois', 100]
];

function medal(face, rim, label) {
    return `<svg viewBox="0 0 64 80" width="56" height="70" aria-hidden="true">
        <path d="M18 2h12l6 26H24zM34 2h12l-6 26h-12z" fill="#2d5bd6"/><path d="M30 2h4l2 26h-8z" fill="#e8282e"/>
        <circle cx="32" cy="50" r="22" fill="${rim}"/><circle cx="32" cy="50" r="17.5" fill="${face}"/>
        <text x="32" y="57" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="19" fill="${rim}">${label}</text>
    </svg>`;
}

function cup(size) {
    return `<svg viewBox="0 0 64 72" width="${size}" height="${Math.round(size * 1.12)}" aria-hidden="true">
        <path d="M14 6h36v14c0 13-8 22-18 22S14 33 14 20z" fill="#f6c416"/>
        <path d="M14 10H5c0 11 5 17 12 18M50 10h9c0 11-5 17-12 18" fill="none" stroke="#f6c416" stroke-width="4"/>
        <path d="M27 41h10v10H27z" fill="#d9a21b"/><path d="M18 51h28v7H18zM14 58h36v8H14z" fill="#b8860b"/>
        <path d="M22 10h6v14c0 6-3 9-6 10z" fill="#fff3b0" opacity=".55"/>
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

// data: { trophies: API answer or null, points, nickname, error }
export function renderTrophyRoom(container, { trophies, points, nickname, error }) {
    container.textContent = '';

    const podium = element('section', 'trophy-section');
    podium.append(element('h2', 'trophy-section__title', 'Podium'));
    const medals = element('div', 'trophy-row');
    MEDALS.forEach(([key, label, face, rim], index) => {
        const won = !!trophies?.medals?.[key];
        const item = element('div', `trophy-item ${won ? 'is-won' : 'is-locked'}`);
        item.innerHTML = medal(won ? face : '#3a3d44', won ? rim : '#24262b', String(index + 1));
        item.append(element('span', 'trophy-item__label', label));
        medals.append(item);
    });
    podium.append(medals);

    const leader = element('section', 'trophy-section');
    leader.append(element('h2', 'trophy-section__title', 'Premier du classement'));
    const cups = element('div', 'trophy-row trophy-row--cups');
    for (const [key, label, size] of LEADER) {
        const won = !!trophies?.leader?.[key];
        const item = element('div', `trophy-item ${won ? 'is-won' : 'is-locked'}`);
        item.innerHTML = cup(size);
        item.append(element('span', 'trophy-item__label', label));
        cups.append(item);
    }
    leader.append(cups);
    if (trophies) {
        const facts = [];
        if (trophies.rank) facts.push(`Place actuelle : ${trophies.rank}${trophies.rank === 1 ? 're' : 'e'}`);
        facts.push(`Temps passé premier : ${duration(trophies.leader_seconds || 0)}`);
        leader.append(element('p', 'trophy-note', facts.join(' · ')));
    } else {
        leader.append(element('p', 'trophy-note', error || (nickname
            ? 'Trophées indisponibles pour le moment.'
            : 'Joue une partie classée avec un pseudo pour gagner des trophées.')));
    }

    const unlocks = element('section', 'trophy-section');
    unlocks.append(element('h2', 'trophy-section__title', `À débloquer · ${points} pts cumulés`));
    const list = element('ul', 'trophy-unlocks');
    for (const reward of rewards()) {
        const open = points >= reward.points;
        const row = element('li', `trophy-unlock ${open ? 'is-open' : ''}`);
        row.append(element('span', 'trophy-unlock__points', `${reward.points.toLocaleString('fr-FR')} pts`));
        // Vehicles are known (the garage shows them); the rest stays secret.
        const name = open || reward.kind === 'car' ? reward.name : reward.hint;
        row.append(element('span', 'trophy-unlock__name', name));
        row.append(element('span', 'trophy-unlock__state', open ? '✓' : '🔒'));
        list.append(row);
    }
    unlocks.append(list);

    container.append(podium, leader, unlocks);
}
