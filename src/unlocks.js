// What cumulative points unlock (points earned in competitive runs, see
// src/v2/freeroam.js totalPoints). Shown in the trophy room, secret ("???")
// until reached. Only what really exists is listed: a new reward is added
// here when its feature is in the game, never before ("coming soon" gives
// hope for nothing).
import { CAR_NAMES, CAR_UNLOCKS } from './v2/cars.js';

export const PLATE_POINTS = 4000;
export const DRIFT_POINTS = 6000;
export const ARAI_POINTS = 8000;
export const SHOES_POINTS = 10000;
// 12 000: the cross (dirt bike), when it is in the game.
export const GLIDER_POINTS = 14000;
export const TRICKS_CODE_POINTS = 16000;

// [{ points, name, kind, hint, how }] in order. `name` (and `how`, the way
// to use it) shown once unlocked, `hint` before.
export function rewards() {
    const list = Object.entries(CAR_UNLOCKS)
        .filter(([, points]) => points > 0)
        .map(([model, points]) => ({ points, name: CAR_NAMES[model], kind: 'car', hint: 'Véhicule' }));
    list.push(
        { points: PLATE_POINTS, name: 'Plaque personnalisée', kind: 'plate', hint: '???', how: 'Personnage › Plaque' },
        { points: DRIFT_POINTS, name: 'Dérapage en mode libre', kind: 'drift', hint: '???',
            how: 'Sur la moto en mode libre, lancé : frein + direction (↓ + ← ou →), dans le sens que tu veux' },
        { points: ARAI_POINTS, name: 'Casque Arai', kind: 'helmet', hint: '???', how: 'Personnage › Casque' },
        { points: SHOES_POINTS, name: 'Chaussures personnalisables', kind: 'shoes', hint: '???', how: 'Personnage › Chaussures' },
        { points: GLIDER_POINTS, name: 'Deltaplane', kind: 'glider', hint: '???',
            how: 'En mode libre sur la moto : gaz, frein, wheeling, puis 3 touches sur le compteur' },
        { points: TRICKS_CODE_POINTS, name: 'Code du mode figures', kind: 'code', hint: '???',
            how: 'Dans les 10 premières secondes d’une partie compétitive : gaz, frein, wheeling, puis 3 touches sur le compteur (partie non classée)' }
    );
    return list.sort((a, b) => a.points - b.points);
}

export function nextReward(points) {
    return rewards().find((reward) => reward.points > points) || null;
}
