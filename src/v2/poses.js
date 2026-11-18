// Poses on the podium, bought with cumulative points (the same points the
// police fines take). The chosen one travels with the player's ranked runs
// and is how the others see them when they are in the top three.
import { spendPoints, totalPoints } from './freeroam.js';

export const POSES = [
    { id: 'classique', name: 'Mains sur les hanches', price: 0 },
    { id: 'victoire', name: 'Bras en V', price: 500 },
    { id: 'cestmoi', name: 'C’est moi !', price: 1000 },
    { id: 'muscles', name: 'Biceps', price: 1500 },
    { id: 'maillot', name: 'Le maillot brandi', price: 2500 },
    { id: 'numero1', name: 'Numéro 1', price: 3500 },
    { id: 'dab', name: 'Dab', price: 5000 },
    // Only for those who have the jetpack (its code typed).
    { id: 'jetpack', name: 'Jetpack landing', price: 1000000, jetpack: true }
];
const OWNED_KEY = 'wheelie_podium_poses';
const CHOSEN_KEY = 'wheelie_podium_pose';

export const poseById = (id) => POSES.find((pose) => pose.id === id) || POSES[0];

function read(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
    } catch {
        return fallback;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Not kept: still applied for this visit.
    }
}

export function ownedPoses() {
    const owned = read(OWNED_KEY, []);
    return new Set(['classique', ...(Array.isArray(owned) ? owned : [])]);
}

export function chosenPose() {
    const id = read(CHOSEN_KEY, 'classique');
    return ownedPoses().has(id) ? poseById(id).id : 'classique';
}

export function choosePose(id) {
    if (!ownedPoses().has(id)) return false;
    write(CHOSEN_KEY, id);
    document.dispatchEvent(new CustomEvent('wheelie:pose', { detail: { id } }));
    return true;
}

// 'bought', 'owned' (already had it) or 'short' (not enough points).
export function buyPose(id) {
    const pose = poseById(id);
    const owned = ownedPoses();
    if (owned.has(pose.id)) {
        choosePose(pose.id);
        return 'owned';
    }
    if (totalPoints() < pose.price || !spendPoints(pose.price)) return 'short';
    owned.add(pose.id);
    write(OWNED_KEY, [...owned].filter((poseId) => poseId !== 'classique'));
    choosePose(pose.id);
    return 'bought';
}
