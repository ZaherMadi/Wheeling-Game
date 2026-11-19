// Outfits (Tenues) and gameplay Extras registered in the unified shop,
// synchronized bidirectionally with Love&Faith and legacy unlock keys.
import { equipped, grant, owns, registerItems } from './store.js';
import { createGarmentThumbnail } from '../v2/clothing-pbr.js';

const FREE_TRICKS_KEY = 'wheelie_free_tricks';
const LOVE_EVENT_KEY = 'wheelie_love_event';
const LOVE_SHOP_KEY = 'wheelie_love_shop';
const LOVE_BAND_KEY = 'wheelie_love_band';

const BAND_COLORS = {
    rouge: ['#c90025', '#ffffff'],
    noir: ['#111111', '#f4ede9'],
    blanc: ['#f4ede9', '#c90025'],
    rose: ['#ff8fb1', '#7a0016'],
    bleu: ['#2f5fd0', '#ffffff'],
    or: ['#c9a45c', '#1a0e05']
};

function readLocal(key, fallback = '') {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function writeLocal(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function readLoveShop() {
    try {
        const list = JSON.parse(readLocal(LOVE_SHOP_KEY, '[]'));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function bandColors() {
    const id = readLocal(LOVE_BAND_KEY) || 'rouge';
    const [color, ink] = BAND_COLORS[id] || BAND_COLORS.rouge;
    return { color, ink };
}

function outfitSwatchSvg(colors) {
    const [primary, secondary, accent] = colors;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${secondary}"/></linearGradient></defs>
      <rect width="96" height="96" rx="18" fill="#101219"/>
      <path d="M22 36l14-12h24l14 12-9 11-5-4v33H36V43l-5 4z" fill="url(#g)" stroke="${accent}" stroke-width="2.4" stroke-linejoin="round"/>
      <circle cx="48" cy="49" r="9" fill="${accent}" fill-opacity="0.25" stroke="${accent}" stroke-width="2"/>
      <text x="48" y="53" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="11" font-weight="800">51</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function extraCardSvg(emoji, accent) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <defs><radialGradient id="eg" cx="50%" cy="40%" r="65%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.38"/><stop offset="100%" stop-color="#0f1118"/></radialGradient></defs>
      <rect width="96" height="96" rx="18" fill="url(#eg)" stroke="${accent}" stroke-opacity="0.4" stroke-width="2"/>
      <text x="48" y="58" text-anchor="middle" font-size="38">${emoji}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const thumb = (garmentId, fallbackColors) => {
    try {
        return createGarmentThumbnail(garmentId);
    } catch {
        return outfitSwatchSvg(fallbackColors);
    }
};

export const OUTFITS = [
    {
        id: 'outfits:puffer-grey-5hc',
        name: 'Doudoune Monogramme 5HC',
        price: 220000,
        badge: 'Doudoune 5HC',
        accent: '#cbd5e1',
        tagline: 'Doudoune oversize gris chiné en relief jacquard 5HC intégral.',
        icon: thumb('puffer-grey-5hc', ['#8d9299', '#3b3f47', '#cbd5e1']),
        look: {
            isOutfit: true,
            garment: 'puffer-grey-5hc',
            headwear: 'helmet',
            livery: { hoodie: '#8d9299', helmet: '#1a1d24', pants: '#1e2128', shoes: '#e2e8f0', glove: '#1f232b', visor: '#94a3b8' }
        }
    },
    {
        id: 'outfits:puffer-check-5hc',
        name: 'Doudoune Check Beige 5HC',
        price: 240000,
        badge: 'Doudoune 5HC',
        accent: '#cbb58f',
        tagline: 'Coupe courte matelassée beige à carreaux, zip doré & poignets noirs.',
        icon: thumb('puffer-check-5hc', ['#c9b390', '#181a1f', '#c44532']),
        look: {
            isOutfit: true,
            garment: 'puffer-check-5hc',
            headwear: 'helmet',
            livery: { hoodie: '#c9b390', helmet: '#14151a', pants: '#13151a', shoes: '#14151a', glove: '#14151a', visor: '#d4a644' }
        }
    },
    {
        id: 'outfits:tracksuit-bvb-5hc',
        name: 'Survêtement Dortmund 5HC',
        price: 180000,
        badge: 'Club 5HC',
        accent: '#f5de16',
        tagline: 'Ensemble noir & jaune graphique avec écusson brodé 5HC et logo moto.',
        icon: thumb('tracksuit-bvb-5hc', ['#111317', '#f5de16', '#f5de16']),
        look: {
            isOutfit: true,
            garment: 'tracksuit-bvb-5hc',
            headwear: 'helmet',
            livery: { hoodie: '#111317', helmet: '#101216', pants: '#101216', shoes: '#f5de16', glove: '#111317', visor: '#f5de16' }
        }
    },
    {
        id: 'outfits:tracksuit-volt-5hc',
        name: 'Survêtement Volt 5HC',
        price: 185000,
        badge: 'Club 5HC',
        accent: '#d9f11b',
        tagline: 'Veste technique jaune fluo à 3 bandes noires et pantalon fuseau noir.',
        icon: thumb('tracksuit-volt-5hc', ['#d9f11b', '#121418', '#d9f11b']),
        look: {
            isOutfit: true,
            garment: 'tracksuit-volt-5hc',
            headwear: 'helmet',
            livery: { hoodie: '#d9f11b', helmet: '#121418', pants: '#131519', shoes: '#d9f11b', glove: '#121418', visor: '#d9f11b' }
        }
    },
    {
        id: 'outfits:tracksuit-royal-5hc',
        name: 'Survêtement Royal Bleu 5HC',
        price: 175000,
        badge: 'Club 5HC',
        accent: '#3b82f6',
        tagline: 'Ensemble bleu royal & blanc athlétique, écusson 5HC et emblème moto.',
        icon: thumb('tracksuit-royal-5hc', ['#0e429c', '#0b1e44', '#f8fafc']),
        look: {
            isOutfit: true,
            garment: 'tracksuit-royal-5hc',
            headwear: 'helmet',
            livery: { hoodie: '#0e429c', helmet: '#0b1e44', pants: '#0b1e44', shoes: '#f8fafc', glove: '#0b1e44', visor: '#38bdf8' }
        }
    },
    {
        id: 'outfits:jersey-bianconero-5hc',
        name: 'Maillot Bianconero 5HC',
        price: 165000,
        badge: 'Maillot 5HC',
        accent: '#f8fafc',
        tagline: 'Maillot respirant rayé noir & blanc, 3 étoiles or et écusson 5HC Racing.',
        icon: thumb('jersey-bianconero-5hc', ['#101216', '#f4f5f7', '#eab308']),
        look: {
            isOutfit: true,
            garment: 'jersey-bianconero-5hc',
            headwear: 'helmet',
            livery: { hoodie: '#f3f4f6', helmet: '#101216', pants: '#101216', shoes: '#f4f5f7', glove: '#101216', visor: '#e2e8f0' }
        }
    },
    {
        id: 'outfits:noir-or',
        name: 'Or & Carbone',
        price: 90000,
        badge: 'Prestige',
        accent: '#c9a45c',
        tagline: 'Ensemble carbone mat en molleton épais, gants et visière champagne.',
        icon: thumb('fleece-noir-or', ['#14151a', '#262933', '#c9a45c']),
        look: {
            isOutfit: true,
            garment: 'fleece-noir-or',
            headwear: 'helmet',
            livery: { hoodie: '#14151a', helmet: '#121318', pants: '#121318', shoes: '#c9a45c', glove: '#c9a45c', visor: '#c9a45c' }
        }
    },
    {
        id: 'outfits:glacier',
        name: 'Pack Glacier',
        price: 110000,
        badge: 'Frais',
        accent: '#38bdf8',
        tagline: 'Molleton argenté, casque bleu arctique et visière glacée.',
        icon: thumb('fleece-glacier', ['#e2e8f0', '#0284c7', '#38bdf8']),
        look: {
            isOutfit: true,
            garment: 'fleece-glacier',
            headwear: 'helmet',
            livery: { hoodie: '#e2e8f0', helmet: '#0284c7', pants: '#1e293b', shoes: '#f8fafc', glove: '#38bdf8', visor: '#38bdf8' }
        }
    },
    {
        id: 'outfits:venom',
        name: 'Venom Vert',
        price: 140000,
        badge: 'Circuit',
        accent: '#22c55e',
        tagline: 'Noir profond relevé d’un vert acide sur piste.',
        icon: thumb('fleece-venom', ['#0a110d', '#166534', '#22c55e']),
        look: {
            isOutfit: true,
            garment: 'fleece-venom',
            headwear: 'helmet',
            livery: { hoodie: '#0b100d', helmet: '#15803d', pants: '#0c120e', shoes: '#22c55e', glove: '#22c55e', visor: '#4ade80' }
        }
    },
    {
        id: 'outfits:crimson',
        name: 'Rouge 51',
        price: 160000,
        badge: 'Corsa',
        accent: '#ef4444',
        tagline: 'Tenue rouge sang en molleton avec bottes blanches de GP.',
        icon: thumb('fleece-crimson', ['#991b1b', '#14151a', '#ef4444']),
        look: {
            isOutfit: true,
            garment: 'fleece-crimson',
            headwear: 'helmet',
            livery: { hoodie: '#b91c1c', helmet: '#111216', pants: '#111318', shoes: '#f8fafc', glove: '#ef4444', visor: '#ef4444' }
        }
    },
    {
        id: 'outfits:sweat-lva',
        legacyLoveId: 'sweat-lva',
        name: 'Sweat LVA',
        price: 150000,
        badge: 'Love&Faith',
        accent: '#c90025',
        tagline: 'Création Love&Faith portée sur ton Pilote 51.',
        icon: '/event/love/icon-lva.webp',
        look: { isOutfit: true, parts: { print: 'lva', head: false } }
    },
    {
        id: 'outfits:sweat-plva',
        legacyLoveId: 'sweat-plva',
        name: 'Sweat PLVA',
        price: 150000,
        badge: 'Love&Faith',
        accent: '#c90025',
        tagline: 'Édition Pour les vrais amoureux sur Pilote 51.',
        icon: '/event/love/icon-plva.webp',
        look: { isOutfit: true, parts: { print: 'plva', head: false } }
    },
    {
        id: 'outfits:sweat-world-love',
        legacyLoveId: 'sweat-world-love',
        name: 'Sweat World Love',
        price: 150000,
        badge: 'Love&Faith',
        accent: '#c90025',
        tagline: 'Love rules the world en molleton blanc brodé.',
        icon: '/event/love/icon-world-love.webp',
        look: { isOutfit: true, parts: { print: 'world-love', head: false } }
    },
    {
        id: 'outfits:sweat-fabulous',
        legacyLoveId: 'sweat-fabulous-love-and-faith',
        name: 'Sweat Fabulous',
        price: 150000,
        badge: 'Love&Faith',
        accent: '#c90025',
        tagline: 'Édition signature Fabulous Love&Faith.',
        icon: '/event/love/icon-fabulous-love-and-faith.webp',
        look: { isOutfit: true, parts: { print: 'fabulous-love-and-faith', head: false } }
    },
    {
        id: 'outfits:bonnet',
        legacyLoveId: 'bonnet',
        name: 'Bonnet & bandeau',
        price: 120000,
        badge: 'Love&Faith',
        accent: '#ff8fb1',
        tagline: 'Bonnet tricoté + bandeau Love&Faith sur ton pilote.',
        icon: '/event/love/beanie.jpg',
        look: { isOutfit: true, parts: { print: null, head: true } }
    }
];

export const EXTRAS = [
    {
        id: 'extras:free-tricks',
        name: 'Figures en mode libre',
        price: 50000,
        badge: 'Gameplay',
        accent: '#f6c416',
        tagline: 'Débloque toutes les figures et combos en mode libre (×2 points).',
        icon: extraCardSvg('🤸', '#f6c416'),
        preview: { type: 'image', src: extraCardSvg('🤸', '#f6c416') }
    },
    {
        id: 'extras:love-event',
        name: 'Pass Love&Faith',
        price: 25000,
        badge: 'Événement',
        accent: '#e11d48',
        tagline: 'Ouvre l’événement spécial Love&Faith sur l’écran d’accueil.',
        icon: '/event/love/logo-heart.png',
        preview: { type: 'image', src: '/event/love/logo-heart.png' }
    }
];

export function outfitLookFor(id) {
    const entry = OUTFITS.find((o) => o.id === id);
    if (!entry) return null;
    if (entry.look?.parts) {
        return { ...entry.look, band: bandColors() };
    }
    return entry.look;
}

export function applyEquippedOutfit(v2) {
    if (!v2) return;
    const eq = equipped('outfit');
    v2.setBaseOutfit?.(eq ? outfitLookFor(eq) : null);
}

export function syncLegacyShopKeys() {
    if (readLocal(FREE_TRICKS_KEY) === '1' && !owns('extras:free-tricks')) {
        grant('extras:free-tricks', 'silent');
    }
    if (readLocal(LOVE_EVENT_KEY) === '1' && !owns('extras:love-event')) {
        grant('extras:love-event', 'silent');
    }
    const loveBought = readLoveShop();
    for (const outfit of OUTFITS) {
        if (outfit.legacyLoveId && loveBought.includes(outfit.legacyLoveId) && !owns(outfit.id)) {
            grant(outfit.id, 'silent');
        }
    }
}

export function registerOutfitsAndExtras(getV2, { onLoveUnlock = () => {}, onFreeTricksUnlock = () => {} } = {}) {
    syncLegacyShopKeys();
    registerItems([
        ...OUTFITS.map((outfit) => ({
            id: outfit.id,
            category: 'outfits',
            slot: 'outfit',
            name: outfit.name,
            price: outfit.price,
            badge: outfit.badge,
            accent: outfit.accent,
            tagline: outfit.tagline,
            icon: outfit.icon,
            preview: { type: 'outfit', look: outfit.look, icon: outfit.icon },
            onEquip() {
                applyEquippedOutfit(getV2?.());
            }
        })),
        ...EXTRAS.map((extra) => ({ ...extra, category: 'extras' }))
    ]);

    document.addEventListener('wheelie:shop', (event) => {
        const id = event.detail?.id;
        if (id === 'extras:free-tricks' && owns('extras:free-tricks') && readLocal(FREE_TRICKS_KEY) !== '1') {
            writeLocal(FREE_TRICKS_KEY, '1');
            onFreeTricksUnlock();
        }
        if (id === 'extras:love-event' && owns('extras:love-event') && readLocal(LOVE_EVENT_KEY) !== '1') {
            writeLocal(LOVE_EVENT_KEY, '1');
            onLoveUnlock();
        }
        const loveOutfit = OUTFITS.find((o) => o.id === id && o.legacyLoveId);
        if (loveOutfit && owns(id)) {
            const list = readLoveShop();
            if (!list.includes(loveOutfit.legacyLoveId)) {
                writeLocal(LOVE_SHOP_KEY, JSON.stringify([...list, loveOutfit.legacyLoveId]));
            }
        }
    });
}
