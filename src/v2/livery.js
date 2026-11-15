// Rider customisation for the realistic version: number on the hoodie and
// helmet, hoodie, helmet and bike colours. Saved in this browser only.
const KEY = 'wheelie_rider_livery';

import { ARAI_POINTS, PLATE_POINTS, SHOES_POINTS } from '../unlocks.js';

export const LIVERY_DEFAULT = {
    number: '51', hoodie: '#f6c416', helmet: '#0a0a0c', bike: '#f2c014', plate: true, plateText: '',
    helmetStyle: 'classic', shoes: '#f2f2f0'
};
// Helmet shapes (the Arai from ARAI_POINTS).
const HELMET_STYLES = [['classic', 'Classique'], ['arai', 'Arai']];
const SHOE_COLORS = [
    ['#f2f2f0', 'Blanc'], ['#1a1b1f', 'Noir'], ['#e8282e', 'Rouge'], ['#1f6fe0', 'Bleu'],
    ['#f6c416', 'Jaune'], ['#17a35a', 'Vert'], ['#ff7a1a', 'Orange'], ['#ff6fb5', 'Rose']
];

const PALETTES = {
    hoodie: [
        ['#f6c416', 'Jaune'], ['#e8282e', 'Rouge'], ['#1f6fe0', 'Bleu'], ['#17a35a', 'Vert'],
        ['#7a3cd6', 'Violet'], ['#ff7a1a', 'Orange'], ['#f2f2f0', 'Blanc'], ['#1a1b1f', 'Noir']
    ],
    helmet: [
        ['#0a0a0c', 'Noir'], ['#f2f2f0', 'Blanc'], ['#e8282e', 'Rouge'], ['#1f6fe0', 'Bleu'],
        ['#f6c416', 'Jaune'], ['#8a8f98', 'Gris']
    ],
    bike: [
        ['#f2c014', 'Jaune'], ['#121316', 'Noir'], ['#e8282e', 'Rouge'], ['#1f6fe0', 'Bleu'],
        ['#17a35a', 'Vert'], ['#f2f2f0', 'Blanc'], ['#ff7a1a', 'Orange']
    ]
};
const LABELS = { hoodie: 'Sweat', helmet: 'Casque', bike: 'Moto' };

export function loadLivery() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved && typeof saved === 'object') return { ...LIVERY_DEFAULT, ...saved };
    } catch {
        // Unreadable or blocked storage: defaults.
    }
    return { ...LIVERY_DEFAULT };
}

function saveLivery(livery) {
    try {
        localStorage.setItem(KEY, JSON.stringify(livery));
    } catch {
        // Not saved: still applied for this session.
    }
}

// Plate text: 8 characters, letters, digits, dash and space.
export function cleanPlateText(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 8);
}

// Builds the settings panel inside `container`; onChange(livery) on every
// edit. points(): cumulative points (the plate and the shop unlock).
export function mountLiveryPanel(container, onChange, { points = () => 0 } = {}) {
    if (!container) return;
    const livery = loadLivery();
    const earned = points();
    container.classList.add('ui-livery');
    container.innerHTML = '';

    const numberRow = document.createElement('label');
    numberRow.className = 'ui-livery__row';
    numberRow.innerHTML = '<span class="ui-livery__label">Numéro</span>';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 2;
    input.value = livery.number;
    input.className = 'ui-livery__number';
    input.setAttribute('aria-label', 'Numéro du pilote');
    input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '').slice(0, 2);
        input.value = digits;
        if (!digits) return;
        livery.number = digits;
        saveLivery(livery);
        onChange(livery);
    });
    // The game listens to the keyboard: typing a number must not ride the bike.
    input.addEventListener('keydown', (event) => event.stopPropagation());
    numberRow.append(input);
    container.append(numberRow);

    for (const [part, colors] of Object.entries(PALETTES)) {
        const row = document.createElement('div');
        row.className = 'ui-livery__row';
        row.innerHTML = `<span class="ui-livery__label">${LABELS[part]}</span>`;
        const swatches = document.createElement('div');
        swatches.className = 'ui-livery__swatches';
        for (const [color, name] of colors) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'ui-swatch';
            swatch.style.setProperty('--swatch', color);
            swatch.title = name;
            swatch.setAttribute('aria-label', `${LABELS[part]} ${name}`);
            swatch.classList.toggle('active', livery[part] === color);
            swatch.addEventListener('click', () => {
                livery[part] = color;
                swatches.querySelectorAll('.ui-swatch').forEach((other) => other.classList.toggle('active', other === swatch));
                saveLivery(livery);
                onChange(livery);
            });
            swatches.append(swatch);
        }
        row.append(swatches);
        container.append(row);
    }

    // Number plate: secret until 4000 points, then on/off and its text.
    if (earned >= PLATE_POINTS) {
        const row = document.createElement('div');
        row.className = 'ui-livery__row';
        row.innerHTML = '<span class="ui-livery__label">Plaque</span>';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'ui-livery__toggle';
        const text = document.createElement('input');
        text.type = 'text';
        text.maxLength = 8;
        text.placeholder = '51-WHEEL';
        text.value = livery.plateText || '';
        text.className = 'ui-livery__plate';
        text.setAttribute('aria-label', 'Texte de la plaque (8 caractères)');
        const show = () => {
            toggle.textContent = livery.plate ? 'OUI' : 'NON';
            toggle.classList.toggle('active', !!livery.plate);
            toggle.setAttribute('aria-pressed', String(!!livery.plate));
            text.disabled = !livery.plate;
        };
        toggle.addEventListener('click', () => {
            livery.plate = !livery.plate;
            show();
            saveLivery(livery);
            onChange(livery);
        });
        text.addEventListener('input', () => {
            const cleaned = cleanPlateText(text.value);
            if (cleaned !== text.value) text.value = cleaned;
            livery.plateText = cleaned;
            saveLivery(livery);
            onChange(livery);
        });
        text.addEventListener('keydown', (event) => event.stopPropagation());
        show();
        row.append(toggle, text);
        container.append(row);
    }

    // Helmet shape: secret until the Arai is unlocked.
    if (earned >= ARAI_POINTS) {
        const row = document.createElement('div');
        row.className = 'ui-livery__row';
        row.innerHTML = '<span class="ui-livery__label ui-livery__label--long">Modèle casque</span>';
        const choices = document.createElement('div');
        choices.className = 'ui-livery__swatches';
        for (const [style, name] of HELMET_STYLES) {
            const choice = document.createElement('button');
            choice.type = 'button';
            choice.className = 'ui-livery__toggle';
            choice.textContent = name.toUpperCase();
            choice.classList.toggle('active', (livery.helmetStyle || 'classic') === style);
            choice.addEventListener('click', () => {
                livery.helmetStyle = style;
                choices.querySelectorAll('button').forEach((other) => other.classList.toggle('active', other === choice));
                saveLivery(livery);
                onChange(livery);
            });
            choices.append(choice);
        }
        row.append(choices);
        container.append(row);
    }

    // Shoe colours: secret until unlocked.
    if (earned >= SHOES_POINTS) {
        const row = document.createElement('div');
        row.className = 'ui-livery__row';
        row.innerHTML = '<span class="ui-livery__label ui-livery__label--long">Chaussures</span>';
        const swatches = document.createElement('div');
        swatches.className = 'ui-livery__swatches';
        for (const [color, name] of SHOE_COLORS) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'ui-swatch';
            swatch.style.setProperty('--swatch', color);
            swatch.title = name;
            swatch.setAttribute('aria-label', `Chaussures ${name}`);
            swatch.classList.toggle('active', (livery.shoes || '#f2f2f0') === color);
            swatch.addEventListener('click', () => {
                livery.shoes = color;
                swatches.querySelectorAll('.ui-swatch').forEach((other) => other.classList.toggle('active', other === swatch));
                saveLivery(livery);
                onChange(livery);
            });
            swatches.append(swatch);
        }
        row.append(swatches);
        container.append(row);
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'setting-btn';
    reset.textContent = 'LOOK 51WHELING';
    reset.addEventListener('click', () => {
        Object.assign(livery, {
            ...LIVERY_DEFAULT, plate: livery.plate, plateText: livery.plateText,
            helmetStyle: livery.helmetStyle, shoes: livery.shoes
        });
        saveLivery(livery);
        mountLiveryPanel(container, onChange, { points });
        onChange(livery);
    });
    container.append(reset);
}
