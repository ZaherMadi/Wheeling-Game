// The shop's core (no UI): what can be bought, what the player owns, wears,
// has given away, and has come across. Every feature registers its own
// articles here (characters, outfits, cars, music...) and the shop screen
// (src/shop/shop.js) shows them by category.
//
// Ownership is kept on the device (localStorage) and synced with the
// player's profile on every device (src/profile.js: "shop:<id>" in owned).
//
// An article:
//   {
//     id: 'cars:golf-8',            // '<category>:<slug>', [a-z0-9-] only, ≤ 34 characters
//     category: 'cars',             // one of CATEGORIES' ids
//     name: 'Golfe 8 GTI',          // shown
//     price: 450000,                // cumulative points
//     tagline: 'La compacte qui…',  // optional, one line
//     icon: '/shop/x.webp',         // optional picture (else the preview draws it)
//     preview: { type: 'character' | 'outfit' | 'car' | 'music' | 'image', ...whatever the type needs },
//     secret: false,                // true: hidden ("???") until seen(id) (the cars met in free roam)
//     available: () => true,        // optional: can it be bought now (else `locked` explains why)
//     locked: 'Gagne l’événement',  // optional: why it cannot be bought yet
//     giftable: true,               // default true: once bought, it can be given once (a code)
//     slot: 'character',            // optional: what equipping it replaces (one per slot)
//     onEquip: (on) => {},          // optional: called when equipped / unequipped
//   }
export const CATEGORIES = [
    { id: 'characters', name: 'Persos', icon: '🧍' },
    { id: 'outfits', name: 'Tenues', icon: '👕' },
    { id: 'cars', name: 'Voitures', icon: '🚗' },
    { id: 'music', name: 'Musiques', icon: '💿' },
    { id: 'extras', name: 'Extras', icon: '✨' }
];

const OWNED_KEY = 'wheelie_shop_owned';
const EQUIPPED_KEY = 'wheelie_shop_equipped';
const GIFTED_KEY = 'wheelie_shop_gifted';
const SEEN_KEY = 'wheelie_shop_seen';
// ("shop:" + the id must stay within the profile's 40 characters.)
const ID_SHAPE = /^[a-z]+:[a-z0-9-]{1,30}$/;
export const ID_PATTERN = { test: (id) => typeof id === 'string' && id.length <= 34 && ID_SHAPE.test(id) };

const registry = new Map();
let config = { points: () => 0, spend: () => false, stat: () => {} };

export function configureShop(options) {
    config = { ...config, ...options };
}

function readJson(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        return value ?? fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Kept for this visit only.
    }
}

const readList = (key) => {
    const list = readJson(key, []);
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string' && ID_PATTERN.test(id)) : [];
};

function changed(detail = {}) {
    document.dispatchEvent(new CustomEvent('wheelie:shop', { detail }));
}

export function registerItems(list) {
    for (const entry of list) {
        if (!entry || !ID_PATTERN.test(entry.id) || !CATEGORIES.some((category) => category.id === entry.category)) {
            console.warn('Shop: article refused', entry?.id);
            continue;
        }
        registry.set(entry.id, { giftable: true, secret: false, ...entry });
    }
    changed({ registered: true });
}

export const item = (id) => registry.get(id) || null;
export const items = (category = null) => [...registry.values()].filter((entry) => !category || entry.category === category);

export const owns = (id) => !!registry.get(id)?.free || readList(OWNED_KEY).includes(id);
export const ownedIds = () => readList(OWNED_KEY);

// Given by a code (a gift, a shop code) or by the profile of another device.
export function grant(id, source = 'code') {
    if (!ID_PATTERN.test(id) || owns(id)) return false;
    writeJson(OWNED_KEY, [...readList(OWNED_KEY), id]);
    if (source !== 'silent') config.stat(source === 'buy' ? 'shopBought' : source === 'sync' ? 'shopSynced' : 'shopRedeemed');
    changed({ id, source });
    return true;
}

export function canBuy(id) {
    const entry = item(id);
    if (!entry || owns(id)) return false;
    if (entry.secret && !seen(id)) return false;
    if (entry.available && !entry.available()) return false;
    return config.points() >= entry.price;
}

// Takes the points and gives the article (false: not possible).
export function buy(id) {
    if (!canBuy(id)) return false;
    if (!config.spend(item(id).price)) return false;
    grant(id, 'buy');
    return true;
}

// Wearing / using: one article per slot (character, music, car...).
export function equipped(slot) {
    const all = readJson(EQUIPPED_KEY, {});
    const id = all && typeof all === 'object' ? all[slot] : null;
    return typeof id === 'string' && owns(id) ? id : null;
}

export function equip(slot, id) {
    const all = { ...(readJson(EQUIPPED_KEY, {}) || {}) };
    const before = all[slot] || null;
    if (id && !owns(id)) return false;
    all[slot] = id || null;
    writeJson(EQUIPPED_KEY, all);
    if (before && before !== id) item(before)?.onEquip?.(false);
    if (id) item(id)?.onEquip?.(true);
    changed({ slot, id });
    return true;
}

// A gift can be made once per article.
export const gifted = (id) => readList(GIFTED_KEY).includes(id);
export function markGifted(id) {
    if (gifted(id)) return;
    writeJson(GIFTED_KEY, [...readList(GIFTED_KEY), id]);
    changed({ id, gifted: true });
}

// The secret articles (the cars) show once met.
export const seen = (id) => readList(SEEN_KEY).includes(id);
export function noteSeen(id) {
    if (!ID_PATTERN.test(id) || seen(id)) return false;
    writeJson(SEEN_KEY, [...readList(SEEN_KEY), id]);
    config.stat('shopSeen');
    changed({ id, seen: true });
    return true;
}

// Profile sync (src/profile.js): "shop:<id>" for each article owned.
export const profileOwned = () => ownedIds().map((id) => `shop:${id}`);
export function applyProfileOwned(list) {
    let any = false;
    for (const name of list) {
        if (typeof name === 'string' && name.startsWith('shop:') && grant(name.slice(5), 'sync')) any = true;
    }
    return any;
}

export const points = () => config.points();
