// Dynamic weather system for Free Roam & Boutique 51 (clean skies through rare chaotic storms).
import * as THREE from 'three';
import './weather.css';
import { createRain } from '../event/rain.js';
import { createPuddles } from '../event/puddles.js';
import { equipped, registerItems } from '../shop/store.js';

export const WEATHER_PRESETS = [
    {
        id: 'weather:sunny',
        name: 'Beau temps',
        price: 35000,
        badge: 'Clair',
        accent: '#38bdf8',
        tagline: 'Grand ciel bleu lumineux, visibilité maximale et route parfaitement sèche.',
        ambience: 'day',
        dusk: 0,
        rain: 0,
        puddles: 0,
        wind: 0,
        storm: 0,
        weight: 30,
        duration: [40, 65],
        iconKind: 'sunny'
    },
    {
        id: 'weather:golden',
        name: 'Soleil doré',
        price: 45000,
        badge: 'Ambiance',
        accent: '#f59e0b',
        tagline: 'Lumière chaude de fin de journée et reflets dorés sur toute l’avenue.',
        ambience: 'golden',
        dusk: 0.08,
        rain: 0,
        puddles: 0,
        wind: 0,
        storm: 0,
        weight: 28,
        duration: [40, 65],
        iconKind: 'golden'
    },
    {
        id: 'weather:overcast',
        name: 'Ciel couvert',
        price: 55000,
        badge: 'Nuageux',
        accent: '#94a3b8',
        tagline: 'Voile nuageux dense et brume fraîche sur la ville sans précipitations.',
        ambience: 'overcast',
        dusk: 0.16,
        rain: 0,
        puddles: 0,
        wind: 0.1,
        storm: 0,
        weight: 18,
        duration: [32, 50],
        iconKind: 'overcast'
    },
    {
        id: 'weather:rain',
        name: 'Pluie fine',
        price: 75000,
        badge: 'Pluie',
        accent: '#60a5fa',
        tagline: 'Averse régulière, ciel assombri et flaques qui éclaboussent sous les roues.',
        ambience: 'overcast',
        dusk: 0.42,
        rain: 0.45,
        puddles: 0.45,
        wind: 0.18,
        storm: 0,
        weight: 13,
        duration: [30, 48],
        iconKind: 'rain'
    },
    {
        id: 'weather:downpour',
        name: 'Pluie battante',
        price: 110000,
        badge: 'Orage',
        accent: '#4f46e5',
        tagline: 'Pluie dense à la tombée du soir, grandes flaques et chaussée détrempée.',
        ambience: 'overcast',
        dusk: 0.82,
        rain: 0.9,
        puddles: 0.72,
        wind: 0.32,
        storm: 0,
        weight: 7,
        duration: [25, 40],
        iconKind: 'downpour'
    },
    {
        id: 'weather:storm',
        name: 'Tempête émotionnelle',
        price: 180000,
        badge: 'Rare',
        accent: '#a855f7',
        tagline: 'Éclairs, tonnerre, pluie violente et rafales imprévisibles qui font dévier tous les véhicules.',
        ambience: 'overcast',
        dusk: 0.96,
        rain: 1.0,
        puddles: 0.85,
        wind: 1.0,
        storm: 1.0,
        weight: 4,
        duration: [24, 36],
        iconKind: 'storm'
    }
];

const PRESET_MAP = new Map(WEATHER_PRESETS.map((p) => [p.id, p]));

export const weatherPresetById = (id) => PRESET_MAP.get(id) || WEATHER_PRESETS[0];

export function equippedWeatherId() {
    const id = equipped('weather');
    return id && PRESET_MAP.has(id) ? id : null;
}

function weatherCardSvg(preset) {
    const kind = preset.iconKind;
    const skies = {
        sunny: ['#0ea5e9', '#bae6fd'],
        golden: ['#b45309', '#fde68a'],
        overcast: ['#334155', '#94a3b8'],
        rain: ['#1e3a5f', '#64748b'],
        downpour: ['#172554', '#334155'],
        storm: ['#0f1024', '#3b1d5e']
    };
    const [top, bot] = skies[kind] || skies.sunny;
    const sun = (kind === 'sunny' || kind === 'golden')
        ? `<circle cx="72" cy="34" r="14" fill="${kind === 'golden' ? '#fbbf24' : '#fef08a'}" opacity="0.95"/>
           <circle cx="72" cy="34" r="22" fill="${kind === 'golden' ? '#f59e0b' : '#fde047'}" opacity="0.22"/>`
        : '';
    const clouds = (kind !== 'sunny')
        ? `<path d="M36 52h56a10 10 0 0 0 2-19.8A15 15 0 0 0 65 26a13 13 0 0 0-24 5.5A10.5 10.5 0 0 0 36 52z" fill="${kind === 'golden' ? '#fef3c7' : kind === 'storm' ? '#475569' : '#cbd5e1'}" opacity="${kind === 'golden' ? '0.68' : '0.92'}"/>`
        : '';
    const rainDrops = (kind === 'rain' || kind === 'downpour' || kind === 'storm')
        ? Array.from({ length: kind === 'rain' ? 5 : 8 }, (_, i) => {
            const x = 38 + i * (kind === 'rain' ? 11 : 7);
            const y = 55 + (i % 2) * 5;
            return `<line x1="${x}" y1="${y}" x2="${x - 5}" y2="${y + 16}" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" opacity="0.85"/>`;
        }).join('')
        : '';
    const bolt = kind === 'storm'
        ? '<path d="M68 38l-9 16h7l-4 17 14-19h-7z" fill="#fde047" stroke="#f59e0b" stroke-width="1"/>'
        : '';
    const gusts = kind === 'storm'
        ? '<path d="M16 42q20-6 36-2M78 60q18-5 34 0" fill="none" stroke="#e2e8f0" stroke-width="1.6" stroke-linecap="round" opacity="0.65"/>'
        : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 88">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${top}"/><stop offset="100%" stop-color="${bot}"/></linearGradient></defs>
      <rect width="128" height="88" rx="12" fill="url(#g)"/>
      <rect x="0" y="72" width="128" height="16" fill="rgba(8,11,18,0.45)"/>
      ${sun}${clouds}${rainDrops}${bolt}${gusts}
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function registerWeatherItems() {
    registerItems(WEATHER_PRESETS.map((preset) => {
        const icon = weatherCardSvg(preset);
        return {
            id: preset.id,
            category: 'weather',
            slot: 'weather',
            name: preset.name,
            price: preset.price,
            badge: preset.badge,
            accent: preset.accent,
            tagline: preset.tagline,
            icon,
            preview: { type: 'weather', weatherId: preset.id, icon }
        };
    }));
}

function createStormAudio() {
    let context = null;
    function getCtx() {
        if (typeof window === 'undefined') return null;
        if (!context) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            try { context = new Ctx(); } catch { return null; }
        }
        if (context.state === 'suspended') {
            context.resume().catch(() => {});
        }
        return context.state === 'running' ? context : null;
    }

    function thunder(strength = 1) {
        const c = getCtx();
        if (!c) return;
        try {
            const length = 2.4;
            const buffer = c.createBuffer(1, Math.floor(c.sampleRate * length), c.sampleRate);
            const data = buffer.getChannelData(0);
            let last = 0;
            for (let i = 0; i < data.length; i++) {
                const t = i / c.sampleRate;
                last = (last + (Math.random() * 2 - 1) * 0.08) * 0.985;
                const crack = t < 0.11 ? (Math.random() * 2 - 1) * (1 - t / 0.11) * 0.72 : 0;
                data[i] = (last * 5.2 * Math.exp(-t * 1.45) * (0.7 + 0.3 * Math.sin(t * 7))) + crack;
            }
            const source = c.createBufferSource();
            source.buffer = buffer;
            const filter = c.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 820;
            const gain = c.createGain();
            gain.gain.value = 0.24 * Math.min(1.2, strength);
            source.connect(filter).connect(gain).connect(c.destination);
            source.start();
        } catch {
            // Audio unavailable or blocked before gesture.
        }
    }

    function splash(strength = 0.8) {
        const c = getCtx();
        if (!c) return;
        try {
            const length = 0.45;
            const buffer = c.createBuffer(1, Math.floor(c.sampleRate * length), c.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                const t = i / data.length;
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * (t < 0.02 ? t / 0.02 : 1);
            }
            const source = c.createBufferSource();
            source.buffer = buffer;
            const filter = c.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1500, c.currentTime);
            filter.frequency.exponentialRampToValueAtTime(680, c.currentTime + length);
            filter.Q.value = 0.7;
            const gain = c.createGain();
            gain.gain.value = 0.18 * Math.min(1.1, strength);
            source.connect(filter).connect(gain).connect(c.destination);
            source.start();
        } catch {
            // Ignore audio errors.
        }
    }

    return { thunder, splash };
}

export function createFreeRoamWeather({ scene, world, camera }) {
    const mobile = typeof window !== 'undefined' && window.innerWidth < 820;
    const fxAudio = createStormAudio();

    let rain = null;
    let puddles = null;
    let overlay = null;
    let gustEl = null;
    let flashEl = null;
    let debrisMaterials = null;
    const debris = [];
    const MAX_DEBRIS = mobile ? 36 : 70;
    const shake = new THREE.Vector3();

    function ensureOverlay() {
        if (overlay || typeof document === 'undefined' || !document.body) return;
        overlay = document.createElement('div');
        overlay.id = 'weather-overlay';
        overlay.className = 'weather-overlay';
        overlay.hidden = true;
        gustEl = document.createElement('div');
        gustEl.className = 'weather-overlay__gust';
        flashEl = document.createElement('div');
        flashEl.className = 'weather-overlay__flash';
        overlay.append(gustEl, flashEl);
        document.body.append(overlay);
    }

    function ensureSceneSystems() {
        if (!rain) rain = createRain(scene);
        if (!puddles) puddles = createPuddles(scene);
        ensureOverlay();
    }

    function triggerFlash({ thunderSound = true } = {}) {
        ensureOverlay();
        if (flashEl) {
            flashEl.className = 'weather-overlay__flash';
            void flashEl.offsetWidth;
            flashEl.className = 'weather-overlay__flash is-lightning';
        }
        if (thunderSound) {
            fxAudio.thunder(0.75 + Math.random() * 0.45);
        }
    }

    function ensureDebrisMaterials() {
        if (debrisMaterials) return debrisMaterials;
        const make = (draw) => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 32;
            draw(canvas.getContext('2d'));
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        };
        debrisMaterials = [
            make((ctx) => { ctx.fillStyle = '#5a3a1a'; ctx.beginPath(); ctx.ellipse(16, 16, 13, 6, 0.6, 0, Math.PI * 2); ctx.fill(); }),
            make((ctx) => { ctx.fillStyle = '#6f5c28'; ctx.beginPath(); ctx.ellipse(16, 16, 11, 5, -0.4, 0, Math.PI * 2); ctx.fill(); }),
            make((ctx) => { ctx.fillStyle = '#e5e7eb'; ctx.fillRect(7, 9, 17, 13); })
        ];
        return debrisMaterials;
    }

    function clearDebris() {
        for (const item of debris) scene.remove(item.sprite);
        debris.length = 0;
    }

    function updateDebris(dt, cam, gustX, stormLevel) {
        if (stormLevel <= 0.08) {
            if (debris.length) clearDebris();
            return;
        }
        const mats = ensureDebrisMaterials();
        const want = Math.floor(MAX_DEBRIS * Math.min(1, stormLevel * 1.1));
        const dir = Math.sign(gustX) || (Math.random() < 0.5 ? -1 : 1);
        const speedBase = Math.max(12, Math.abs(gustX) * 2.9);

        while (debris.length < want) {
            const sprite = new THREE.Sprite(mats[Math.floor(Math.random() * mats.length)]);
            sprite.scale.setScalar(0.22 + Math.random() * 0.36);
            sprite.position.set(
                cam.position.x - dir * (16 + Math.random() * 14),
                0.35 + Math.random() * 6.5,
                cam.position.z - 2 - Math.random() * 44
            );
            scene.add(sprite);
            debris.push({
                sprite,
                vx: dir * (speedBase + Math.random() * 14),
                vy: (Math.random() - 0.35) * 3.2,
                spin: (Math.random() - 0.5) * 11
            });
        }

        for (let i = debris.length - 1; i >= 0; i--) {
            const d = debris[i];
            const driftX = gustX * 2.8 + (Math.sin(performance.now() * 0.002 + i) * 2.5);
            d.sprite.position.x += (d.vx * 0.35 + driftX) * dt;
            d.sprite.position.y += (d.vy + Math.sin(performance.now() * 0.005 + i) * 1.8) * dt;
            d.sprite.material.rotation += d.spin * dt;
            if (Math.abs(d.sprite.position.x - cam.position.x) > 30 || d.sprite.position.y < 0.1 || Math.abs(d.sprite.position.z - cam.position.z) > 62) {
                scene.remove(d.sprite);
                debris.splice(i, 1);
            }
        }
    }

    const state = {
        active: false,
        id: 'weather:golden',
        dynamic: true,
        forcedId: null,
        ambience: 'golden',
        dusk: 0,
        rain: 0,
        puddles: 0,
        wind: 0,
        storm: 0,
        nextChangeIn: 45,
        stormCooldown: 60,
        lastPuddleZ: null,
        lastRiderMode: null,
        clock: 0,
        gustDir: 1,
        gustStrength: 0,
        gustTarget: 0,
        nextGustAt: 0.9,
        nextFlashAt: 2.2
    };

    const previewState = {
        id: null,
        rain: 0,
        dusk: 0,
        storm: 0,
        wind: 0,
        ambience: 'golden',
        nextFlashAt: 2.4,
        clock: 0
    };

    const windVector = {
        gustX: 0,
        gustZ: 0,
        bikeYawTorque: 0,
        carYawTorque: 0,
        storm: 0,
        wind: 0
    };

    function resetWind() {
        windVector.gustX = 0;
        windVector.gustZ = 0;
        windVector.bikeYawTorque = 0;
        windVector.carYawTorque = 0;
        windVector.storm = 0;
        windVector.wind = 0;
        world?.setWind?.(0);
    }

    function clearShake() {
        if (shake.lengthSq() > 0 && camera) {
            camera.position.sub(shake);
        }
        shake.set(0, 0, 0);
    }

    function pickNextPreset(excludeId) {
        const pool = WEATHER_PRESETS.filter((p) => {
            if (p.id === excludeId) return false;
            if (p.id === 'weather:storm' && state.stormCooldown > 0) return false;
            return true;
        });
        const total = pool.reduce((sum, p) => sum + p.weight, 0);
        let roll = Math.random() * total;
        for (const p of pool) {
            roll -= p.weight;
            if (roll <= 0) return p;
        }
        return pool[0] || WEATHER_PRESETS[0];
    }

    function applyPreset(preset, { announce = true, immediate = false } = {}) {
        const prevId = state.id;
        state.id = preset.id;
        state.ambience = preset.ambience;
        if (immediate) {
            state.dusk = preset.dusk;
            state.rain = preset.rain;
            state.puddles = preset.puddles;
            state.wind = preset.wind;
            state.storm = preset.storm;
        }
        const [minD, maxD] = preset.duration;
        state.nextChangeIn = minD + Math.random() * (maxD - minD);
        if (preset.id === 'weather:storm') {
            state.nextFlashAt = 0.6 + Math.random() * 1.4;
            state.nextGustAt = 0.4;
            state.gustDir = Math.random() < 0.5 ? -1 : 1;
            state.gustTarget = state.gustDir * (0.85 + Math.random() * 0.45);
            if (immediate || prevId !== 'weather:storm') {
                triggerFlash({ thunderSound: true });
            }
        } else if (prevId === 'weather:storm') {
            state.stormCooldown = 180;
        }

        if (announce && prevId !== preset.id && typeof document !== 'undefined') {
            if (preset.id === 'weather:storm') {
                document.dispatchEvent(new CustomEvent('wheelie:toast', {
                    detail: {
                        title: '⛈️ TEMPÊTE ÉMOTIONNELLE',
                        text: 'Rafales violentes des deux côtés ! Tous les véhicules dévient.',
                        discreet: false
                    }
                }));
            } else {
                document.dispatchEvent(new CustomEvent('wheelie:toast', {
                    detail: {
                        title: `🌦️ MÉTÉO · ${preset.name.toUpperCase()}`,
                        text: preset.tagline,
                        discreet: true
                    }
                }));
            }
        }
    }

    function startFreeRoam() {
        ensureSceneSystems();
        clearShake();
        state.active = true;
        state.lastPuddleZ = null;
        const eq = equippedWeatherId();
        state.dynamic = !eq;
        state.forcedId = null;
        state.stormCooldown = 55;
        const initial = eq
            ? weatherPresetById(eq)
            : (Math.random() < 0.45 ? weatherPresetById('weather:sunny') : weatherPresetById('weather:golden'));
        applyPreset(initial, { announce: false, immediate: true });
        if (overlay) overlay.hidden = false;
    }

    function set(idOrNull) {
        ensureSceneSystems();
        if (!idOrNull) {
            state.forcedId = null;
            const eq = equippedWeatherId();
            state.dynamic = !eq;
            if (eq) applyPreset(weatherPresetById(eq), { announce: false, immediate: true });
            return;
        }
        const preset = PRESET_MAP.get(idOrNull);
        if (!preset) return;
        state.forcedId = preset.id;
        state.dynamic = false;
        applyPreset(preset, { announce: true, immediate: true });
        if (state.active) {
            updateWindField(0.016);
        }
    }

    function updateWindField(dt) {
        const storm = state.storm;
        if (storm <= 0.03) {
            state.gustStrength += (0 - state.gustStrength) * Math.min(1, dt * 3);
            windVector.gustX = 0;
            windVector.gustZ = 0;
            windVector.bikeYawTorque = 0;
            windVector.carYawTorque = 0;
            windVector.storm = 0;
            windVector.wind = state.wind;
            world?.setWind?.(state.wind * 0.35);
            return;
        }

        state.nextGustAt -= dt;
        if (state.nextGustAt <= 0) {
            state.nextGustAt = 0.7 + Math.random() * 0.9;
            // Flip direction often (~82%) so gusts push back and forth from both sides.
            if (Math.random() < 0.82) state.gustDir *= -1;
            else state.gustDir = Math.random() < 0.5 ? -1 : 1;
            state.gustTarget = state.gustDir * (0.7 + Math.random() * 0.65);
        }

        state.gustStrength += (state.gustTarget - state.gustStrength) * Math.min(1, dt * 4.2);
        const t = state.clock;
        const waveA = Math.sin(t * 2.55) * 0.42 + Math.sin(t * 5.1 + 0.9) * 0.24;
        const waveB = Math.cos(t * 1.95 + 1.4) * 0.62 + Math.sin(t * 3.9 + 0.4) * 0.32;

        const combined = state.gustStrength + waveA;
        windVector.gustX = Math.max(-7.5, Math.min(7.5, combined * 5.6 * storm));
        windVector.gustZ = Math.max(-2.0, Math.min(2.0, waveB * 1.8 * storm));
        windVector.bikeYawTorque = Math.max(-0.42, Math.min(0.42, (combined * 0.32 + Math.sin(t * 5.2) * 0.1) * storm));
        windVector.carYawTorque = Math.max(-0.28, Math.min(0.28, (combined * 0.22 + Math.cos(t * 3.8) * 0.07) * storm));
        windVector.storm = storm;
        windVector.wind = state.wind;

        world?.setWind?.(windVector.gustX * 0.14 + state.wind * 0.35);
    }

    function spawnPuddlesAlongRoad(focusZ, strength) {
        if (!puddles || strength <= 0.1) return;
        if (state.lastPuddleZ !== null && Math.abs(focusZ - state.lastPuddleZ) < 24) return;
        state.lastPuddleZ = focusZ;
        const baseZ = focusZ - 42 - Math.random() * 28;
        const big = Math.random() < (0.25 + strength * 0.35);
        const width = big ? 4.4 + Math.random() * 3.0 : 2.3 + Math.random() * 1.8;
        const length = big ? 9 + Math.random() * 6 : 4 + Math.random() * 4;
        const x = (Math.random() * 2 - 1) * (8.0 - width / 2);
        puddles.add(x, baseZ, width, length);
    }

    function frame(dt, { active = false, focus = null, speed = 0, rider = null, mode = 'bike', inLove = false } = {}) {
        if (!active || inLove) {
            if (state.active) stop();
            return null;
        }
        if (!state.active) startFreeRoam();
        ensureSceneSystems();

        // Respect any boutique equip change live
        const eq = state.forcedId ? null : equippedWeatherId();
        if (!state.forcedId) {
            if (eq && (state.dynamic || state.id !== eq)) {
                state.dynamic = false;
                applyPreset(weatherPresetById(eq), { announce: false, immediate: false });
            } else if (!eq && !state.dynamic) {
                state.dynamic = true;
            }
        }

        const safeDt = Math.max(0, Math.min(0.1, dt || 0));
        state.clock += safeDt;

        if (safeDt > 0 && state.dynamic) {
            state.stormCooldown = Math.max(0, state.stormCooldown - safeDt);
            state.nextChangeIn -= safeDt;
            if (state.nextChangeIn <= 0) {
                const next = pickNextPreset(state.id);
                applyPreset(next, { announce: true, immediate: false });
            }
        }

        const target = weatherPresetById(state.id);
        const ramp = safeDt > 0 ? Math.min(1, safeDt * 0.9) : 1;
        state.dusk += (target.dusk - state.dusk) * ramp;
        state.rain += (target.rain - state.rain) * ramp;
        state.puddles += (target.puddles - state.puddles) * ramp;
        state.wind += (target.wind - state.wind) * ramp;
        state.storm += (target.storm - state.storm) * ramp;
        state.ambience = target.ambience;

        if (safeDt > 0) updateWindField(safeDt);

        if (rain && camera) {
            rain.update(safeDt, camera, state.rain, speed, windVector.gustX * 3.8 + state.wind * 7);
        }

        if (puddles && focus && camera) {
            if (state.rain > 0.25 && state.puddles > 0.15) {
                if (safeDt > 0) spawnPuddlesAlongRoad(focus.z, state.puddles);
                if (safeDt > 0 && mode === 'bike' && rider?.rearContact && rider?.bikeGroup) {
                    const splash = puddles.step(safeDt, rider, speed);
                    if (splash > 0) fxAudio.splash(splash);
                }
                puddles.frame(safeDt, state.rain, focus.z + 65, camera.position.z);
            } else if (puddles.count > 0 && state.rain < 0.05) {
                puddles.clear();
                state.lastPuddleZ = null;
            } else if (puddles.count > 0) {
                puddles.frame(safeDt, state.rain, focus.z + 65, camera.position.z);
            }
        }

        clearShake();
        if (state.storm > 0.05) {
            if (safeDt > 0) {
                updateDebris(safeDt, camera, windVector.gustX, state.storm);
                state.nextFlashAt -= safeDt;
                if (state.nextFlashAt <= 0) {
                    state.nextFlashAt = 2.6 + Math.random() * 4.0;
                    triggerFlash({ thunderSound: true });
                }
            }
            const amount = state.storm * 0.065;
            shake.set((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount * 0.8, 0);
            camera.position.add(shake);
        } else if (debris.length) {
            clearDebris();
        }

        if (overlay) {
            overlay.hidden = state.storm <= 0.02 && (!flashEl || !flashEl.classList.contains('is-lightning'));
            overlay.style.setProperty('--storm-alpha', (state.storm * 0.85).toFixed(3));
        }

        return {
            id: state.id,
            sky: { ambience: state.ambience, dusk: state.dusk },
            rain: state.rain,
            storm: state.storm,
            wind: windVector
        };
    }

    function preview(idOrNull) {
        if (!idOrNull) {
            previewState.id = null;
            previewState.rain = 0;
            previewState.dusk = 0;
            previewState.storm = 0;
            previewState.wind = 0;
            previewState.ambience = 'golden';
            if (!state.active) {
                rain?.hide();
                clearDebris();
                resetWind();
                if (overlay) overlay.hidden = true;
            }
            return;
        }
        ensureSceneSystems();
        const preset = weatherPresetById(idOrNull);
        previewState.id = preset.id;
        previewState.rain = preset.rain;
        previewState.dusk = preset.dusk;
        previewState.storm = preset.storm;
        previewState.wind = preset.wind;
        previewState.ambience = preset.ambience;
        previewState.nextFlashAt = 1.1 + Math.random() * 1.4;
        if (preset.id === 'weather:storm') {
            triggerFlash({ thunderSound: false });
        }
    }

    function framePreview(dt, cam) {
        if (!previewState.id) return null;
        ensureSceneSystems();
        const safeDt = Math.max(0.008, Math.min(0.05, dt || 0.016));
        previewState.clock += safeDt;
        const previewGust = previewState.storm > 0.1
            ? Math.sin(previewState.clock * 2.4) * 7.2 * previewState.storm
            : 0;
        world?.setWind?.(previewGust * 0.14 + previewState.wind * 0.35);
        rain?.update(safeDt, cam, previewState.rain, 10, previewGust * 3.4 + previewState.wind * 6);
        updateDebris(safeDt, cam, previewGust || 4, previewState.storm);
        if (previewState.storm > 0.1) {
            previewState.nextFlashAt -= safeDt;
            if (previewState.nextFlashAt <= 0) {
                previewState.nextFlashAt = 2.8 + Math.random() * 2.5;
                triggerFlash({ thunderSound: false });
            }
        }
        if (overlay) {
            overlay.hidden = previewState.storm <= 0.02;
            overlay.style.setProperty('--storm-alpha', (previewState.storm * 0.72).toFixed(3));
        }
        return { ambience: previewState.ambience, dusk: previewState.dusk };
    }

    function stop() {
        state.active = false;
        state.forcedId = null;
        state.rain = 0;
        state.storm = 0;
        state.wind = 0;
        state.dusk = 0;
        state.puddles = 0;
        state.lastPuddleZ = null;
        clearShake();
        rain?.hide();
        puddles?.clear();
        clearDebris();
        resetWind();
        if (flashEl) flashEl.className = 'weather-overlay__flash';
        if (overlay) {
            overlay.style.setProperty('--storm-alpha', '0');
            overlay.hidden = true;
        }
    }

    return {
        startFreeRoam,
        stop,
        frame,
        preview,
        framePreview,
        set,
        get wind() { return windVector; },
        get state() {
            return {
                active: state.active,
                id: state.id,
                dynamic: state.dynamic,
                ambience: state.ambience,
                dusk: state.dusk,
                rain: state.rain,
                puddles: state.puddles,
                wind: state.wind,
                storm: state.storm,
                gustX: windVector.gustX,
                gustZ: windVector.gustZ
            };
        }
    };
}
