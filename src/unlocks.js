// What cumulative points unlock (points earned in competitive runs, see
// src/v2/freeroam.js totalPoints). Shown in the trophy room, secret until
// reached; new rewards are added here as they are thought of.
import { CAR_NAMES, CAR_UNLOCKS } from './v2/cars.js';

export const PLATE_POINTS = 4000;
export const SHOP_POINTS = 10000;
// A small gift every GIFT_STEP points after the plate (up to GIFT_UNTIL).
export const GIFT_STEP = 2000;
const GIFT_UNTIL = 20000;

// [{ points, name, kind, hint }] in order. `name` is shown once unlocked,
// `hint` (or "???") before.
export function rewards() {
    const list = Object.entries(CAR_UNLOCKS)
        .filter(([, points]) => points > 0)
        .map(([model, points]) => ({ points, name: CAR_NAMES[model], kind: 'car', hint: 'Véhicule' }));
    list.push({ points: PLATE_POINTS, name: 'Plaque personnalisée', kind: 'plate', hint: '???' });
    for (let points = PLATE_POINTS + GIFT_STEP; points <= GIFT_UNTIL; points += GIFT_STEP) {
        if (points === SHOP_POINTS) list.push({ points, name: 'Boutique des casques', kind: 'shop', hint: '???' });
        else list.push({ points, name: 'Cadeau surprise (bientôt)', kind: 'gift', hint: '???' });
    }
    return list.sort((a, b) => a.points - b.points);
}

export function nextReward(points) {
    return rewards().find((reward) => reward.points > points) || null;
}
