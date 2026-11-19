// Playable & previewable rider characters for #rider-screen and the boutique.
// Syncs bidirectional ownership with Love&Faith (`wheelie_love_owned` / `wear`).
import { equip, equipped, grant, item, owns, registerItems } from './store.js';

const LOVE_OWNED_KEY = 'wheelie_love_owned';
const LOVE_WEAR_KEY = 'wheelie_love_wear';
const LOVE_OUTFIT_KEY = 'wheelie_love_outfit';
const LOVE_BAND_KEY = 'wheelie_love_band';
const LOVE_HAIR_KEY = 'wheelie_love_hair';

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
    try { localStorage.setItem(key, value); } catch { /* ignore storage quota errors */ }
}

function readLoveOwned() {
    try {
        const parsed = JSON.parse(readLocal(LOVE_OWNED_KEY, '[]'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function loveOverrides(gender) {
    const print = readLocal(LOVE_OUTFIT_KEY) || 'lva';
    const bandId = readLocal(LOVE_BAND_KEY) || 'rouge';
    const [color, ink] = BAND_COLORS[bandId] || BAND_COLORS.rouge;
    const hair = gender === 'girl' ? (readLocal(LOVE_HAIR_KEY) === 'afro' ? 'afro' : 'vanilles') : 'none';
    return { print, band: { color, ink }, hair };
}

export const CHARACTERS = [
    {
        id: 'characters:default',
        name: 'Pilote 51',
        price: 0,
        free: true,
        giftable: false,
        tagline: 'Ton casque et ta livrée personnalisable.',
        badge: 'Origine',
        accent: '#f6c416',
        look: null,
        portrait: { skin: '#c98a5b', hoodie: '#f6c416', headwear: 'helmet', helmet: '#121318', visor: '#00d4ff', glasses: 'none' }
    },
    {
        id: 'characters:kamel',
        name: 'Kamel',
        price: 120000,
        tagline: 'Casquette sombre, lunettes fumées et style rue.',
        badge: 'Street',
        accent: '#f59e0b',
        look: {
            character: true,
            gender: 'boy',
            build: 'athletic',
            headwear: 'cap',
            capColor: '#181a20',
            capTrim: '#f59e0b',
            skin: '#9c633c',
            beard: 'stubble',
            hair: 'short',
            glasses: 'dark',
            band: null,
            print: null,
            livery: { hoodie: '#1b1d24', pants: '#1d222c', shoes: '#f4f4f0', glove: '#181a20' }
        },
        portrait: { skin: '#9c633c', hoodie: '#1b1d24', headwear: 'cap', cap: '#181a20', trim: '#f59e0b', beard: 'stubble', glasses: 'dark' }
    },
    {
        id: 'characters:ines',
        name: 'Inès',
        price: 150000,
        tagline: 'Vanilles libres, verres rosés et sweat fuchsia.',
        badge: 'Style',
        accent: '#ec4899',
        look: {
            character: true,
            gender: 'girl',
            build: 'girl',
            headwear: 'hair',
            skin: '#b87b52',
            beard: 'none',
            hair: 'vanilles',
            glasses: 'rose',
            band: null,
            print: null,
            livery: { hoodie: '#ec4899', pants: '#171921', shoes: '#fafafa', glove: '#db2777' }
        },
        portrait: { skin: '#b87b52', hoodie: '#ec4899', headwear: 'hair', hair: 'vanilles', glasses: 'rose', girl: true }
    },
    {
        id: 'characters:moussa',
        name: 'Moussa',
        price: 180000,
        tagline: 'Carrure solide, bonnet ardoise et barbe épaisse.',
        badge: 'Costaud',
        accent: '#14b8a6',
        look: {
            character: true,
            gender: 'boy',
            build: 'heavy',
            headwear: 'beanie',
            beanieColor: '#1e293b',
            skin: '#4f2b16',
            beard: 'full',
            hair: 'afro',
            glasses: 'none',
            band: null,
            print: null,
            livery: { hoodie: '#0f766e', pants: '#16181d', shoes: '#f59e0b', glove: '#0f766e' }
        },
        portrait: { skin: '#4f2b16', hoodie: '#0f766e', headwear: 'beanie', beanie: '#1e293b', beard: 'full', hair: 'afro' }
    },
    {
        id: 'characters:alya',
        name: 'Alya',
        price: 220000,
        tagline: 'Casquette blanche, afro dorée et lunettes cyan.',
        badge: 'Horizon',
        accent: '#38bdf8',
        look: {
            character: true,
            gender: 'girl',
            build: 'girl',
            headwear: 'cap',
            capColor: '#f8fafc',
            capTrim: '#38bdf8',
            skin: '#8b5130',
            beard: 'none',
            hair: 'afro',
            glasses: 'cyan',
            band: null,
            print: null,
            livery: { hoodie: '#0284c7', pants: '#e2e8f0', shoes: '#38bdf8', glove: '#0284c7' }
        },
        portrait: { skin: '#8b5130', hoodie: '#0284c7', headwear: 'cap', cap: '#f8fafc', trim: '#38bdf8', hair: 'afro', glasses: 'cyan', girl: true }
    },
    {
        id: 'characters:ghost',
        name: 'Fantôme',
        price: 280000,
        tagline: 'Cagoule intégrale noire, silhouette affûtée.',
        badge: 'Ombre',
        accent: '#ef4444',
        look: {
            character: true,
            gender: 'boy',
            build: 'slim',
            headwear: 'mask',
            maskColor: '#111216',
            skin: '#d8b498',
            beard: 'none',
            hair: 'short',
            glasses: 'dark',
            band: null,
            print: null,
            livery: { hoodie: '#16181f', pants: '#0f1116', shoes: '#ef4444', glove: '#ef4444' }
        },
        portrait: { skin: '#d8b498', hoodie: '#16181f', headwear: 'mask', mask: '#111216', glasses: 'dark' }
    },
    {
        id: 'characters:samir',
        name: 'Samir',
        price: 320000,
        tagline: 'Cheveux courts, monture or et blouson rouge sang.',
        badge: 'Asphalte',
        accent: '#dc2626',
        look: {
            character: true,
            gender: 'boy',
            build: 'athletic',
            headwear: 'open',
            skin: '#c48d65',
            beard: 'stubble',
            hair: 'short',
            glasses: 'gold',
            band: null,
            print: null,
            livery: { hoodie: '#dc2626', pants: '#15171c', shoes: '#facc15', glove: '#dc2626' }
        },
        portrait: { skin: '#c48d65', hoodie: '#dc2626', headwear: 'open', hair: 'short', beard: 'stubble', glasses: 'gold' }
    },
    {
        id: 'characters:cyber',
        name: 'Cyber 51',
        price: 450000,
        tagline: 'Casque Arai néon, visière cyan et armure nocturne.',
        badge: 'Néon',
        accent: '#00e5ff',
        look: {
            character: true,
            gender: 'boy',
            build: 'athletic',
            headwear: 'helmet',
            skin: '#c89b78',
            beard: 'none',
            hair: 'none',
            glasses: 'none',
            band: null,
            print: null,
            livery: { hoodie: '#0b1020', helmet: '#00e5ff', helmetStyle: 'arai', pants: '#0f172a', shoes: '#00e5ff', glove: '#00e5ff', visor: '#00e5ff', number: '51' }
        },
        portrait: { skin: '#c89b78', hoodie: '#0b1020', headwear: 'helmet', helmet: '#0f172a', visor: '#00e5ff', glasses: 'none' }
    },
    {
        id: 'characters:gold-king',
        name: 'Roi d’Or',
        price: 520000,
        tagline: 'Cagoule dorée, verres or et gants champagne.',
        badge: 'Prestige',
        accent: '#eab308',
        look: {
            character: true,
            gender: 'boy',
            build: 'heavy',
            headwear: 'mask',
            maskColor: '#c9a45c',
            skin: '#7c4827',
            beard: 'full',
            hair: 'none',
            glasses: 'gold',
            band: null,
            print: null,
            livery: { hoodie: '#121215', pants: '#121215', shoes: '#facc15', glove: '#c9a45c' }
        },
        portrait: { skin: '#7c4827', hoodie: '#121215', headwear: 'mask', mask: '#c9a45c', glasses: 'gold', beard: 'full' }
    },
    {
        id: 'characters:love-boy',
        name: 'Garçon Love&Faith',
        price: 600000,
        loveGender: 'boy',
        tagline: 'Bandeau Love&Faith, bonnet signature et sweat brodé.',
        badge: 'Love&Faith',
        accent: '#c90025',
        look: {
            character: true,
            gender: 'boy',
            build: 'standard',
            headwear: 'beanie',
            skin: '#7a4524',
            beard: 'stubble',
            hair: 'none',
            glasses: 'none',
            band: { color: '#c90025', ink: '#ffffff' },
            print: 'lva',
            livery: { hoodie: '#f1f0ec', pants: '#16181d', shoes: '#f4f4f2', glove: '#7a4524' }
        },
        portrait: { skin: '#7a4524', hoodie: '#f1f0ec', headwear: 'beanie', beanie: '#141416', band: '#c90025', beard: 'stubble' }
    },
    {
        id: 'characters:love-girl',
        name: 'Fille Love&Faith',
        price: 600000,
        loveGender: 'girl',
        tagline: 'Vanilles aux perles, bandeau et sweat Love&Faith.',
        badge: 'Love&Faith',
        accent: '#ff8fb1',
        look: {
            character: true,
            gender: 'girl',
            build: 'girl',
            headwear: 'beanie',
            skin: '#7a4524',
            beard: 'none',
            hair: 'vanilles',
            glasses: 'none',
            band: { color: '#c90025', ink: '#ffffff' },
            print: 'lva',
            livery: { hoodie: '#f1f0ec', pants: '#16181d', shoes: '#f4f4f2', glove: '#7a4524' }
        },
        portrait: { skin: '#7a4524', hoodie: '#f1f0ec', headwear: 'beanie', beanie: '#141416', band: '#c90025', hair: 'vanilles', girl: true }
    }
];

export function characterById(id) {
    return CHARACTERS.find((entry) => entry.id === id) || null;
}

export function characterLookFor(id) {
    const entry = characterById(id);
    if (!entry || !entry.look) return null;
    if (!entry.loveGender) return entry.look;
    return { ...entry.look, ...loveOverrides(entry.loveGender) };
}

export function isCharacterOwned(id) {
    if (id === 'characters:default') return true;
    const entry = characterById(id);
    if (entry?.loveGender && readLoveOwned().includes(entry.loveGender)) return true;
    return owns(id);
}

export function equippedCharacterId() {
    const fromStore = equipped('character');
    if (fromStore && isCharacterOwned(fromStore)) return fromStore;
    const legacy = readLocal(LOVE_WEAR_KEY);
    if ((legacy === 'boy' || legacy === 'girl') && isCharacterOwned(`characters:love-${legacy}`)) {
        return `characters:love-${legacy}`;
    }
    return 'characters:default';
}

function syncLegacyLoveWear(id) {
    const entry = characterById(id);
    writeLocal(LOVE_WEAR_KEY, entry?.loveGender || '');
    if (entry?.loveGender) {
        const list = readLoveOwned();
        if (!list.includes(entry.loveGender)) writeLocal(LOVE_OWNED_KEY, JSON.stringify([...list, entry.loveGender]));
    }
}

export function applyCharacter(v2, id = equippedCharacterId()) {
    if (!v2) return;
    v2.setCharacterLook?.(characterLookFor(id));
}

export function previewCharacter(v2, id) {
    if (!v2) return;
    v2.previewLook?.(characterLookFor(id));
}

export function equipCharacter(v2, id) {
    if (!isCharacterOwned(id)) return false;
    syncLegacyLoveWear(id);
    equip('character', id);
    applyCharacter(v2, id);
    return true;
}

export function syncLoveCharacters() {
    for (const gender of readLoveOwned()) {
        const id = gender === 'girl' ? 'characters:love-girl' : 'characters:love-boy';
        if (!owns(id)) grant(id, 'silent');
    }
    const legacyWear = readLocal(LOVE_WEAR_KEY);
    if ((legacyWear === 'boy' || legacyWear === 'girl') && !equipped('character')) {
        equip('character', `characters:love-${legacyWear}`);
    }
}

export function registerCharacters(getV2) {
    syncLoveCharacters();
    registerItems(CHARACTERS.map((char) => ({
        id: char.id,
        category: 'characters',
        name: char.name,
        price: char.price,
        free: !!char.free,
        giftable: char.giftable !== false,
        tagline: char.tagline,
        badge: char.badge,
        accent: char.accent,
        slot: 'character',
        preview: { type: 'character', look: char.look, characterId: char.id },
        onEquip(on) {
            if (!on) return;
            syncLegacyLoveWear(char.id);
            applyCharacter(getV2?.(), char.id);
        }
    })));
}

// Inline SVG portrait for character cards (greyed out via CSS when unowned).
export function characterPortraitSvg(id) {
    const char = characterById(id) || CHARACTERS[0];
    const p = char.portrait || {};
    const accent = char.accent || '#f6c416';
    const skin = p.skin || '#9c633c';
    const hoodie = p.hoodie || '#181a20';
    const hair = p.hair === 'vanilles'
        ? '<path d="M22 44c0-18 10-28 26-28s26 10 26 28l-6 26h-8V46H36v24h-8z" fill="#18120e"/><circle cx="30" cy="68" r="2.2" fill="#e8d08e"/><circle cx="66" cy="68" r="2.2" fill="#e8d08e"/>'
        : p.hair === 'afro'
        ? '<circle cx="48" cy="34" r="24" fill="#17120e"/><circle cx="32" cy="30" r="10" fill="#1d1712"/><circle cx="64" cy="30" r="10" fill="#1d1712"/>'
        : p.hair === 'short'
        ? '<path d="M29 36c1-14 10-20 19-20s18 6 19 20c-5-6-13-8-19-8s-14 2-19 8z" fill="#151210"/>'
        : '';
    const head = p.headwear === 'helmet'
        ? `<circle cx="48" cy="38" r="21" fill="${p.helmet || '#121318'}" stroke="${accent}" stroke-width="2.2"/><path d="M32 34h32l-3 11H35z" fill="${p.visor || '#00d4ff'}"/><path d="M40 20h16l-2 6H42z" fill="${accent}"/>`
        : p.headwear === 'mask'
        ? `${hair}<circle cx="48" cy="38" r="18" fill="${p.mask || '#111216'}"/><rect x="35" y="31" width="26" height="9" rx="4" fill="${skin}"/><circle cx="42" cy="35.5" r="2" fill="#111"/><circle cx="54" cy="35.5" r="2" fill="#111"/>`
        : `${hair}<circle cx="48" cy="40" r="17" fill="${skin}"/>`;
    const beard = p.headwear !== 'helmet' && p.headwear !== 'mask'
        ? (p.beard === 'full'
            ? '<path d="M32 42c1 12 8 17 16 17s15-5 16-17c-4 5-10 7-16 7s-12-2-16-7z" fill="#14100d"/>'
            : p.beard === 'stubble'
            ? '<path d="M34 45c2 9 7 12 14 12s12-3 14-12" fill="none" stroke="rgba(20,16,13,0.45)" stroke-width="3.2" stroke-linecap="round"/>'
            : '')
        : '';
    const eyes = (p.headwear === 'beanie' || p.headwear === 'cap' || p.headwear === 'hair' || p.headwear === 'open')
        ? (p.band
            ? `<rect x="30" y="31" width="36" height="10" rx="4" fill="${p.band}"/><path d="M64 36l9 5-4 4-6-6z" fill="${p.band}"/>`
            : `<circle cx="41.5" cy="38.5" r="2" fill="#16110e"/><circle cx="54.5" cy="38.5" r="2" fill="#16110e"/>`)
        : '';
    const glasses = p.glasses && p.glasses !== 'none'
        ? (() => {
            const fill = { dark: '#0b0e14', gold: '#eab308', cyan: '#22d3ee', rose: '#fb7185' }[p.glasses] || '#0b0e14';
            return `<rect x="33.5" y="33.5" width="12.5" height="7.5" rx="2.5" fill="${fill}" stroke="#ffffff" stroke-opacity="0.45"/><rect x="50" y="33.5" width="12.5" height="7.5" rx="2.5" fill="${fill}" stroke="#ffffff" stroke-opacity="0.45"/><line x1="46" y1="36.5" x2="50" y2="36.5" stroke="#fff" stroke-width="1.4"/>`;
        })()
        : '';
    const top = p.headwear === 'beanie'
        ? `<path d="M29 33c0-13 8-20 19-20s19 7 19 20H29z" fill="${p.beanie || '#15161a'}"/><rect x="28" y="29" width="40" height="7" rx="3.5" fill="${p.beanie || '#1d1f25'}"/>`
        : p.headwear === 'cap'
        ? `<path d="M30 33c0-11 8-17 18-17s18 6 18 17H30z" fill="${p.cap || '#181a20'}"/><path d="M28 32h44l-6 4H30z" fill="${p.trim || accent}"/>`
        : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <defs><radialGradient id="g" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.34"/><stop offset="100%" stop-color="#0d0f16"/></radialGradient></defs>
      <rect width="96" height="96" rx="18" fill="url(#g)"/>
      <path d="M16 96c2-22 14-31 32-31s30 9 32 31z" fill="${hoodie}"/>
      <path d="M39 65h18l-2 10H41z" fill="rgba(0,0,0,0.22)"/>
      ${head}${beard}${eyes}${glasses}${top}
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
