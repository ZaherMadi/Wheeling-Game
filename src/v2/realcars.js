// Realistic worked-on cars (approximate parody names, hidden prices until
// met in free roam, varied paints, sunroofs, custom engine profiles, plus
// exclusive shop-code GT 51 Cabrio unlocked with 5HPORSHE).
import { owns, registerItems, seen } from '../shop/store.js';

const PAINT_STORAGE_KEY = 'wheelie_car_paints';

export function savedCarPaint(model) {
    try {
        const raw = JSON.parse(localStorage.getItem(PAINT_STORAGE_KEY) || '{}');
        const val = raw && typeof raw === 'object' ? raw[model] : null;
        return typeof val === 'number' && Number.isFinite(val) ? val : null;
    } catch {
        return null;
    }
}

export function saveCarPaint(model, colourHex) {
    if (!model || !Number.isFinite(Number(colourHex))) return;
    try {
        const raw = JSON.parse(localStorage.getItem(PAINT_STORAGE_KEY) || '{}');
        const next = raw && typeof raw === 'object' ? { ...raw } : {};
        next[model] = Number(colourHex);
        localStorage.setItem(PAINT_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Ignore storage errors in private browsing.
    }
}

export const REAL_CARS = [
    {
        id: 'cars:gt-cabrio-5hc',
        model: 'gt-cabrio-5hc',
        name: 'GT 51 Cabrio',
        price: 950000,
        badge: 'CODE 5HPORSHE',
        codeOnly: true,
        tagline: 'Cabriolet sportif jaune métallisé, capote toile noire, jantes 10 branches & étriers jaunes',
        roof: 'softtop',
        sound: 'flat6_cabrio',
        topSpeed: 0.92,
        accel: 6.4,
        colours: [0xffd510, 0xf8e055, 0xd6d4cc, 0xd41c24, 0x16294a, 0x14161a]
    },
    {
        id: 'cars:citron-c5-air',
        model: 'citron-c5-air',
        name: 'Citron C5 Air',
        price: 115000,
        tagline: 'SUV confortable à bulles latérales et toit vitré ouvrant',
        roof: 'sunroof',
        sound: 'comfort',
        topSpeed: 0.64,
        accel: 3.1,
        colours: [0xe8ecee, 0x1e3a5f, 0x385746, 0x7b838c, 0x16181c, 0x8f2424]
    },
    {
        id: 'cars:reno-3009',
        model: 'reno-3009',
        name: 'Reno 3009 GT',
        price: 140000,
        tagline: 'SUV coupé au regard félin, toit noir flottant et toit ouvrant',
        roof: 'sunroof',
        sound: 'suv',
        topSpeed: 0.67,
        accel: 3.4,
        colours: [0xc49562, 0xf2f2ef, 0x26466d, 0x5c636b, 0x991b22, 0x15171b]
    },
    {
        id: 'cars:kupra-formento',
        model: 'kupra-formento',
        name: 'Kupra Formento VZ',
        price: 180000,
        tagline: 'Crossover nerveux aux finitions cuivre et quadruple sortie',
        roof: 'sunroof',
        sound: 'sport4',
        topSpeed: 0.72,
        accel: 4.0,
        colours: [0x1c3a47, 0x5c6268, 0x14161a, 0x2a4538, 0x8a1d24, 0xd8dadf]
    },
    {
        id: 'cars:golfe-8',
        model: 'golfe-8',
        name: 'Golfe 8 GTI',
        price: 210000,
        tagline: 'Compacte mythique, calandre signature LED et toit ouvrant',
        roof: 'sunroof',
        sound: 'gti',
        topSpeed: 0.74,
        accel: 4.3,
        colours: [0x929aa1, 0xc81d25, 0x1c57a8, 0xf2f2f0, 0x141518, 0xe0b226]
    },
    {
        id: 'cars:audo-rs3',
        model: 'audo-rs3',
        name: 'Audo RS3 Sport',
        price: 360000,
        tagline: '5 cylindres rageur, ailes élargies et sorties ovales RS',
        roof: 'sunroof',
        sound: 'inline5',
        topSpeed: 0.80,
        accel: 5.0,
        colours: [0x82888f, 0x4ca62a, 0xc81e24, 0x15171b, 0x204d9e, 0xeaeae6]
    },
    {
        id: 'cars:merso-a45',
        model: 'merso-a45',
        name: 'Merso A45 AMG',
        price: 390000,
        tagline: 'Équivalent compacte extrême, aileron aero et calandre verticale',
        roof: 'sunroof',
        sound: 'amg',
        topSpeed: 0.81,
        accel: 5.1,
        colours: [0xe6b81c, 0x626870, 0x141619, 0xb81d24, 0xf0f0ee, 0x1b467a]
    },
    {
        id: 'cars:audo-rsq3',
        model: 'audo-rsq3',
        name: 'Audo RSQ3',
        price: 420000,
        tagline: 'SUV coupé 5 cylindres, bouclier nid d’abeille et toit panoramique',
        roof: 'sunroof',
        sound: 'inline5_suv',
        topSpeed: 0.79,
        accel: 4.9,
        colours: [0xde6420, 0x1f62b5, 0x868b91, 0xf0efeb, 0x16181c, 0x3e6935]
    },
    {
        id: 'cars:bm-m340',
        model: 'bm-m340',
        name: 'BM M3 Comp',
        price: 540000,
        tagline: 'Équivalent berline musclée 6 cylindres, quadruple échappement',
        roof: 'sunroof',
        sound: 'inline6',
        topSpeed: 0.83,
        accel: 5.4,
        colours: [0x1c593c, 0x8c9299, 0xd4dc36, 0x141619, 0x1e4c96, 0x9c1c24]
    },
    {
        id: 'cars:porsh-makane',
        model: 'porsh-makane',
        name: 'Porsh Makane GTS',
        price: 650000,
        tagline: 'Équivalent SUV sportif V6 bi-turbo et bandeau arrière LED',
        roof: 'sunroof',
        sound: 'v6',
        topSpeed: 0.84,
        accel: 5.5,
        colours: [0x9e1c24, 0xd2d0c8, 0x1b3c73, 0x131417, 0x4b535c, 0xd8a828]
    },
    {
        id: 'cars:porsh-911',
        model: 'porsh-911',
        name: 'Porsh 911 GT',
        price: 850000,
        tagline: 'Équivalent ultra-sportive flat-6, aileron GT et toit targa ouvrant',
        roof: 'sunroof',
        sound: 'flat6',
        topSpeed: 0.88,
        accel: 6.0,
        colours: [0xd42228, 0xebbf1c, 0xd4d2cc, 0x9aa0a8, 0x182b4d, 0x15171b]
    },
    {
        id: 'cars:lambo-uruz',
        model: 'lambo-uruz',
        name: 'Lambo Uruz',
        price: 900000,
        tagline: 'Super-SUV V8 agressif aux entrées d’air en Y et toit ouvrant',
        roof: 'sunroof',
        sound: 'v8',
        topSpeed: 0.89,
        accel: 6.1,
        colours: [0xf2c618, 0x39a828, 0x767b82, 0x141518, 0xe86418, 0xf2f2ef]
    }
];

const BY_MODEL = Object.fromEntries(REAL_CARS.map((car) => [car.model, car]));
// AI parked & traffic pool excludes exclusive code-only showcase models.
export const REAL_CAR_MODELS = REAL_CARS.filter((car) => !car.codeOnly).map((car) => car.model);
export const MAX_REAL_CAR_PRICE = Math.max(...REAL_CARS.map((car) => car.price));
export const MIN_REAL_CAR_PRICE = Math.min(...REAL_CARS.map((car) => car.price));

export const isRealCar = (model) => Boolean(BY_MODEL[model]);
export const realCarInfo = (model) => BY_MODEL[model] || null;

export function pickRealCarPaint(model) {
    const info = BY_MODEL[model];
    if (!info) return 0xf2f2f0;
    const chosen = savedCarPaint(model);
    if (chosen !== null && info.colours.includes(chosen)) return chosen;
    if (info.codeOnly) return info.colours[0];
    return info.colours[Math.floor(Math.random() * info.colours.length)];
}

export function ownsRealCar(model) {
    const info = BY_MODEL[model];
    return info ? owns(info.id) : false;
}

export function ownedCars() {
    return REAL_CARS.filter((car) => owns(car.id)).map((car) => ({
        id: car.id,
        model: car.model,
        name: car.name,
        price: car.price,
        paint: savedCarPaint(car.model) ?? car.colours[0]
    }));
}

export function registerRealCars() {
    registerItems(REAL_CARS.map((car) => ({
        id: car.id,
        category: 'cars',
        name: car.name,
        price: car.price,
        tagline: car.tagline,
        badge: car.badge || undefined,
        secret: !car.codeOnly,
        available: car.codeOnly ? () => false : () => seen(car.id),
        locked: car.codeOnly ? 'Entre le code 5HPORSHE dans la boutique' : 'Croise-la en mode libre pour révéler son prix',
        giftable: !car.codeOnly,
        slot: 'car',
        preview: {
            type: 'car',
            model: car.model,
            colour: car.colours[0]
        }
    })));
}
