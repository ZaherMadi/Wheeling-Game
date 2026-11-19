// The shop's core (no UI): what can be bought, what the player owns, wears,
// has given away, and has come across, plus live catalog overrides synced from
// the API (price, promo, temporary block/hide, secret/code-only/giftable flags).
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
const CATALOG_OVERRIDES_KEY = 'wheelie_shop_catalog_overrides';
// ("shop:" + the id must stay within the profile's 40 characters.)
const ID_SHAPE = /^[a-z]+:[a-z0-9-]{1,30}$/;
export const ID_PATTERN = { test: (id) => typeof id === 'string' && id.length <= 34 && ID_SHAPE.test(id) };

const baseRegistry = new Map();
const remoteOverrides = new Map();
let config = { points: () => 0, spend: () => false, stat: () => {} };
let lastCatalogSyncAt = 0;
let catalogSyncPromise = null;

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

function hydrateCachedOverrides() {
    const cached = readJson(CATALOG_OVERRIDES_KEY, null);
    if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return;
    for (const [id, ov] of Object.entries(cached)) {
        if (ID_PATTERN.test(id) && ov && typeof ov === 'object' && !Array.isArray(ov)) {
            remoteOverrides.set(id, ov);
        }
    }
}

hydrateCachedOverrides();

function flagActive(flag, untilIso, nowMs) {
    if (!flag) return false;
    if (!untilIso) return true;
    const end = Date.parse(untilIso);
    return Number.isFinite(end) ? end > nowMs : false;
}

function resolveItem(base) {
    if (!base) return null;
    const ov = remoteOverrides.get(base.id);
    if (!ov) {
        return {
            ...base,
            defaultPrice: base.price,
            defaultFree: !!base.free,
            promoLabel: '',
            featured: false,
            codeOnly: !!base.codeOnly,
            giftable: base.giftable !== false,
            hidden: false,
            hiddenUntil: null,
            blocked: false,
            blockedUntil: null,
            blockedReason: ''
        };
    }

    const nowMs = Date.now();
    const hidden = flagActive(ov.hidden, ov.hidden_until, nowMs);
    const blocked = flagActive(ov.blocked, ov.blocked_until, nowMs);
    const hasPrice = ov.price !== undefined && ov.price !== null && Number.isFinite(Number(ov.price));
    const free = ov.free !== undefined ? !!ov.free : (!!base.free || (hasPrice && Number(ov.price) === 0));
    const rawPrice = hasPrice ? Math.max(0, Math.floor(Number(ov.price))) : base.price;

    return {
        ...base,
        defaultPrice: base.price,
        defaultFree: !!base.free,
        name: ov.name || base.name,
        badge: ov.badge !== undefined ? ov.badge : base.badge,
        tagline: ov.tagline || base.tagline,
        price: free ? 0 : rawPrice,
        free,
        promoLabel: ov.promo_label || '',
        featured: !!ov.featured,
        secret: ov.secret !== undefined ? !!ov.secret : !!base.secret,
        codeOnly: ov.code_only !== undefined ? !!ov.code_only : !!base.codeOnly,
        giftable: ov.giftable !== undefined ? !!ov.giftable : (base.giftable !== false),
        hidden,
        hiddenUntil: hidden && ov.hidden_until ? ov.hidden_until : null,
        blocked,
        blockedUntil: blocked && ov.blocked_until ? ov.blocked_until : null,
        blockedReason: blocked ? (ov.blocked_reason || 'Temporairement indisponible') : ''
    };
}

export function applyCatalogOverrides(overridesMap) {
    remoteOverrides.clear();
    const clean = {};
    if (overridesMap && typeof overridesMap === 'object') {
        for (const [id, ov] of Object.entries(overridesMap)) {
            if (ID_PATTERN.test(id) && ov && typeof ov === 'object' && !Array.isArray(ov)) {
                remoteOverrides.set(id, ov);
                clean[id] = ov;
            }
        }
    }
    writeJson(CATALOG_OVERRIDES_KEY, clean);
    changed({ catalog: true });
}

export async function loadCatalogOverrides(apiBase, apiFetch, { force = false } = {}) {
    if (!apiBase || !apiFetch) return null;
    const now = Date.now();
    if (!force && now - lastCatalogSyncAt < 10_000) return null;
    if (catalogSyncPromise) return catalogSyncPromise;

    lastCatalogSyncAt = now;
    catalogSyncPromise = (async () => {
        try {
            const res = await apiFetch(`${apiBase}/shop/catalog`, { cache: 'no-store' }, 5000);
            if (!res.ok) return null;
            const data = await res.json().catch(() => null);
            if (data && typeof data.overrides === 'object' && data.overrides !== null) {
                applyCatalogOverrides(data.overrides);
                return data.overrides;
            }
        } catch {
            // Keep cached/default catalog when offline.
        } finally {
            catalogSyncPromise = null;
        }
        return null;
    })();
    return catalogSyncPromise;
}

export function registerItems(list) {
    for (const entry of list) {
        if (!entry || !ID_PATTERN.test(entry.id) || !CATEGORIES.some((category) => category.id === entry.category)) {
            console.warn('Shop: article refused', entry?.id);
            continue;
        }
        baseRegistry.set(entry.id, { giftable: true, secret: false, codeOnly: false, ...entry });
    }
    changed({ registered: true });
}

export const item = (id) => resolveItem(baseRegistry.get(id));

export function items(category = null, { includeHidden = false } = {}) {
    const out = [];
    for (const base of baseRegistry.values()) {
        if (category && base.category !== category) continue;
        const resolved = resolveItem(base);
        if (!includeHidden && resolved.hidden) continue;
        out.push(resolved);
    }
    out.sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
    return out;
}

export const owns = (id) => !!baseRegistry.get(id)?.free || readList(OWNED_KEY).includes(id);
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
    if (!entry || owns(id) || entry.hidden || entry.blocked || entry.codeOnly) return false;
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
