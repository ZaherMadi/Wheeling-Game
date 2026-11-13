// Game audio: layered motorcycle engine driven by a simulated gearbox, road /
// wind / city beds, and one-shot effects. Everything plays from prerecorded
// clips in /audio (see scripts/generate-voice-lines.mjs).

const GEAR_TOP_KMH = [45, 80, 120, 165, 215, 300];
const LOOP_IDS = ['engine_idle', 'engine_mid', 'engine_high', 'wind', 'tire_wet', 'city_ambience', 'scrape'];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

// Clips are decoded on an offline context: decoding needs no user gesture,
// so every sound is ready before the first ride. The buffers then play on
// the live context, which can only start after a tap or a key press.
let decoder = null;
function getDecoder() {
    if (!decoder) {
        const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        decoder = Offline ? new Offline(2, 1, 44100) : null;
    }
    return decoder;
}

function createBuffer(channels, length, sampleRate) {
    if (typeof AudioBuffer === 'function') {
        try {
            return new AudioBuffer({ numberOfChannels: channels, length, sampleRate });
        } catch {
            // Old Safari: fall through to the decoder context.
        }
    }
    return getDecoder().createBuffer(channels, length, sampleRate);
}

// MP3 encoding pads both ends of a clip with silence, which makes a looped
// buffer click. Trim the padding and fold the tail into the head.
function makeSeamless(buffer) {
    const threshold = 0.002;
    const length = buffer.length;
    let start = length;
    let end = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        let first = 0;
        while (first < length && Math.abs(data[first]) < threshold) first++;
        let last = length - 1;
        while (last > first && Math.abs(data[last]) < threshold) last--;
        start = Math.min(start, first);
        end = Math.max(end, last + 1);
    }
    const fade = Math.floor(buffer.sampleRate * 0.12);
    const usable = end - start;
    if (usable < fade * 4) return buffer;

    const outLength = usable - fade;
    const out = createBuffer(buffer.numberOfChannels, outLength, buffer.sampleRate);
    let sumSquares = 0;
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const source = buffer.getChannelData(channel);
        const target = out.getChannelData(channel);
        for (let i = 0; i < outLength; i++) target[i] = source[start + i];
        for (let i = 0; i < fade; i++) {
            const t = i / fade;
            target[i] = source[start + i] * Math.sin(t * Math.PI / 2) +
                source[start + outLength + i] * Math.cos(t * Math.PI / 2);
        }
        for (let i = 0; i < outLength; i++) {
            sumSquares += target[i] * target[i];
            peak = Math.max(peak, Math.abs(target[i]));
        }
    }
    // Generated beds come back at very different levels (the city ambience is
    // ~25 dB quieter than the engine): bring them all to the same loudness so
    // the mix in update() means what it says.
    const rms = Math.sqrt(sumSquares / (outLength * buffer.numberOfChannels));
    if (rms > 0) {
        const gain = Math.min(0.1 / rms, 0.98 / peak, 16);
        for (let channel = 0; channel < out.numberOfChannels; channel++) {
            const target = out.getChannelData(channel);
            for (let i = 0; i < outLength; i++) target[i] *= gain;
        }
    }
    return out;
}

export function createAudioEngine({ effects, getManifest }) {
    const loopIds = new Set(effects.filter((effect) => effect.loop).map((effect) => effect.id));
    const buffers = new Map();
    const loops = new Map();
    let context = null;
    let master = null;
    let output = null;
    let engineBus = null;
    let engineFilter = null;
    let voiceBus = null;
    let voice = null;
    let enabled = true;
    let running = false;

    const sim = {
        gear: 0,
        rpm: 0.12,
        shiftCut: 0,
        throttle: 0,
        wasThrottle: false,
        wasBraking: false,
        wasGrounded: true,
        peakAngle: 0,
        lastBackfire: -10,
        lastBrake: -10,
        lastSplash: 0,
        nextSplash: 8,
        nextHorn: 20,
        time: 0
    };

    function getContext() {
        if (!context) {
            const Constructor = window.AudioContext || window.webkitAudioContext;
            if (!Constructor) return null;
            context = new Constructor({ latencyHint: 'interactive' });
            const limiter = context.createDynamicsCompressor();
            limiter.threshold.value = -10;
            limiter.knee.value = 12;
            limiter.ratio.value = 6;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.2;
            master = context.createGain();
            master.gain.value = enabled ? 1 : 0;
            master.connect(limiter);
            limiter.connect(context.destination);
            output = limiter;
            // The voice has its own switch: it bypasses the effects master.
            voiceBus = context.createGain();
            voiceBus.gain.value = 0.9;
            voiceBus.connect(output);

            engineFilter = context.createBiquadFilter();
            engineFilter.type = 'lowpass';
            engineFilter.frequency.value = 2500;
            engineFilter.Q.value = 0.4;
            engineBus = context.createGain();
            engineBus.gain.value = 1;
            engineFilter.connect(engineBus);
            engineBus.connect(master);
        }
        return context;
    }

    function decode(data) {
        const target = getDecoder() || getContext();
        if (!target) return Promise.resolve(null);
        // Old Safari only has the callback form.
        return new Promise((resolve, reject) => {
            const result = target.decodeAudioData(data, resolve, reject);
            if (result && result.then) result.then(resolve, reject);
        });
    }

    function load(id) {
        if (buffers.has(id)) return buffers.get(id);
        const promise = getManifest().then(async ({ available, hashes }) => {
            if (!available.has(id)) return null;
            const version = hashes[id] ? `?v=${hashes[id]}` : '';
            const response = await fetch(`/audio/${id}.mp3${version}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const decoded = await decode(await response.arrayBuffer());
            if (!decoded) return null;
            return loopIds.has(id) ? makeSeamless(decoded) : decoded;
        }).catch((error) => {
            console.warn(`Could not load sound effect "${id}":`, error);
            buffers.delete(id);
            return null;
        });
        buffers.set(id, promise);
        return promise;
    }

    // Starts the live context. Browsers only allow it during a user gesture;
    // iOS also wants a sound started in that same gesture.
    let primed = false;
    function unlock() {
        const audioContext = getContext();
        if (!audioContext) return;
        if (audioContext.state !== 'running') {
            audioContext.resume().catch((error) => console.warn('Could not enable game audio:', error));
        }
        if (!primed) {
            primed = true;
            const silence = audioContext.createBufferSource();
            silence.buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
            silence.connect(audioContext.destination);
            silence.start(0);
        }
    }
    const GESTURES = ['pointerdown', 'touchend', 'keydown', 'click'];
    const onGesture = () => {
        unlock();
        if (context && context.state === 'running') {
            GESTURES.forEach((type) => window.removeEventListener(type, onGesture, true));
        }
    };
    GESTURES.forEach((type) => window.addEventListener(type, onGesture, true));

    // Downloads and decodes clips ahead of time (no gesture needed).
    function warmUp(extraIds = []) {
        effects.forEach(({ id }) => load(id));
        extraIds.forEach((id) => load(id));
    }

    function prepare() {
        unlock();
        warmUp();
    }

    function play(id, { volume = 1, rate = 1, pan = 0, delay = 0 } = {}) {
        if (!enabled) return;
        const audioContext = getContext();
        if (!audioContext) return;
        if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
        load(id).then((buffer) => {
            if (!buffer || !enabled) return;
            const source = audioContext.createBufferSource();
            const gain = audioContext.createGain();
            source.buffer = buffer;
            source.playbackRate.value = rate;
            gain.gain.value = volume;
            source.connect(gain);
            if (pan && audioContext.createStereoPanner) {
                const panner = audioContext.createStereoPanner();
                panner.pan.value = Math.max(-1, Math.min(1, pan));
                gain.connect(panner);
                panner.connect(master);
            } else {
                gain.connect(master);
            }
            source.start(audioContext.currentTime + delay);
        });
    }

    function startLoop(id) {
        if (loops.has(id)) return;
        const placeholder = { source: null, gain: null };
        loops.set(id, placeholder);
        load(id).then((buffer) => {
            if (!buffer || !running || loops.get(id) !== placeholder) {
                if (loops.get(id) === placeholder) loops.delete(id);
                return;
            }
            const source = context.createBufferSource();
            const gain = context.createGain();
            source.buffer = buffer;
            source.loop = true;
            gain.gain.value = 0;
            source.connect(gain);
            gain.connect(id.startsWith('engine_') ? engineFilter : master);
            // Random phase so layered loops never line up their seams.
            source.start(0, Math.random() * buffer.duration);
            placeholder.source = source;
            placeholder.gain = gain;
        });
    }

    function setLoop(id, volume, rate) {
        const loop = loops.get(id);
        if (!loop || !loop.source) return;
        const now = context.currentTime;
        loop.gain.gain.setTargetAtTime(volume, now, 0.06);
        if (rate) loop.source.playbackRate.setTargetAtTime(rate, now, 0.05);
    }

    function startRun() {
        if (!enabled || running) return;
        if (!getContext()) return;
        if (context.state !== 'running') context.resume().catch(() => {});
        running = true;
        Object.assign(sim, {
            gear: 0, rpm: 0.12, shiftCut: 0, throttle: 0, wasThrottle: false, wasBraking: false,
            wasGrounded: true, peakAngle: 0, time: 0, lastBackfire: -10, lastBrake: -10,
            lastSplash: 0, nextSplash: 6 + Math.random() * 8, nextHorn: 12 + Math.random() * 20
        });
        engineBus.gain.cancelScheduledValues(context.currentTime);
        engineBus.gain.setValueAtTime(1, context.currentTime);
        LOOP_IDS.forEach(startLoop);
    }

    function stopRun() {
        running = false;
        if (!context) return;
        const now = context.currentTime;
        loops.forEach((loop, id) => {
            if (!loop.source) return;
            loop.gain.gain.cancelScheduledValues(now);
            loop.gain.gain.setTargetAtTime(0, now, 0.05);
            loop.source.stop(now + 0.4);
            loop.source.onended = () => {
                loop.source.disconnect();
                loop.gain.disconnect();
            };
        });
        loops.clear();
    }

    // frame: { kmh, throttle 0..1, braking, angleRatio 0..1, skidding }
    function update(dt, frame) {
        if (!running || !context) return;
        sim.time += dt;
        const { kmh, braking, angleRatio, skidding } = frame;
        const throttle = clamp01(frame.throttle);
        sim.throttle += (throttle - sim.throttle) * Math.min(1, dt * 12);

        // Gearbox
        let rpmTarget = kmh / GEAR_TOP_KMH[sim.gear];
        if (rpmTarget > 0.95 && sim.gear < GEAR_TOP_KMH.length - 1 && throttle > 0.1) {
            sim.gear++;
            sim.shiftCut = 0.14;
            play('gear_shift', { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
        } else if (rpmTarget < 0.5 && sim.gear > 0) {
            sim.gear--;
            if (kmh > 15) play('gear_shift', { volume: 0.3, rate: 0.85 });
        }
        rpmTarget = kmh / GEAR_TOP_KMH[sim.gear];
        if (kmh < 6 && throttle > 0) rpmTarget = Math.max(rpmTarget, 0.25 + throttle * 0.3);
        if (angleRatio > 0.1 && throttle > 0) rpmTarget += 0.05;
        rpmTarget = Math.max(0.12, Math.min(1.05, rpmTarget));
        sim.rpm += (rpmTarget - sim.rpm) * Math.min(1, dt * (rpmTarget > sim.rpm ? 9 : 6));
        sim.shiftCut = Math.max(0, sim.shiftCut - dt);

        const rpm = sim.rpm;
        const load = (0.5 + sim.throttle * 0.5) * (sim.shiftCut > 0 ? 0.45 : 1);
        const idleWeight = clamp01(1 - (rpm - 0.14) / 0.24);
        const highWeight = clamp01((rpm - 0.52) / 0.3);
        const midWeight = clamp01(1 - idleWeight - highWeight);
        setLoop('engine_idle', Math.sqrt(idleWeight) * 0.42 * load, 0.92 + rpm * 1.3);
        setLoop('engine_mid', Math.sqrt(midWeight) * 0.5 * load, 0.62 + rpm * 0.9);
        setLoop('engine_high', Math.sqrt(highWeight) * 0.46 * load, 0.52 + rpm * 0.62);
        engineFilter.frequency.setTargetAtTime(1500 + sim.throttle * 5200 + rpm * 4200, context.currentTime, 0.08);

        const speedRatio = clamp01(kmh / 250);
        setLoop('wind', Math.pow(speedRatio, 1.5) * 0.55, 0.8 + speedRatio * 0.5);
        setLoop('tire_wet', clamp01(kmh / 110) * 0.22, 0.75 + speedRatio * 0.5);
        setLoop('city_ambience', 0.16 - speedRatio * 0.09, 1);
        setLoop('scrape', angleRatio > 0.93 && kmh > 10 ? 0.4 : 0, 0.9 + speedRatio * 0.3);

        // Events
        const throttleOn = throttle > 0.1;
        if (!throttleOn && sim.wasThrottle && rpm > 0.62 && sim.time - sim.lastBackfire > 2.5 && Math.random() < 0.7) {
            play('backfire', { volume: 0.4, rate: 0.9 + Math.random() * 0.25, delay: 0.08 });
            sim.lastBackfire = sim.time;
        }
        if (braking && !sim.wasBraking && kmh > 55 && sim.time - sim.lastBrake > 1.2) {
            play('brake', { volume: 0.18 + clamp01(kmh / 200) * 0.3 });
            sim.lastBrake = sim.time;
        }
        const grounded = angleRatio < 0.01;
        if (!grounded) sim.peakAngle = Math.max(sim.peakAngle, angleRatio);
        if (grounded && !sim.wasGrounded) {
            if (sim.peakAngle > 0.22) play('landing', { volume: 0.3 + sim.peakAngle * 0.6 });
            sim.peakAngle = 0;
        }
        if (!skidding && kmh > 60 && sim.time - sim.lastSplash > sim.nextSplash) {
            play('splash', { volume: 0.3, rate: 0.9 + Math.random() * 0.3, pan: Math.random() - 0.5 });
            sim.lastSplash = sim.time;
            sim.nextSplash = 7 + Math.random() * 14;
        }
        if (sim.time > sim.nextHorn) {
            play('horn_distant', { volume: 0.12, pan: Math.random() * 1.6 - 0.8 });
            sim.nextHorn = sim.time + 30 + Math.random() * 45;
        }
        sim.wasThrottle = throttleOn;
        sim.wasBraking = braking;
        sim.wasGrounded = grounded;
    }

    function setEnabled(value) {
        enabled = value;
        if (master && context) master.gain.setTargetAtTime(value ? 1 : 0, context.currentTime, 0.05);
        if (!value) stopRun();
    }

    // Pull the engine down a little while the rider talks.
    function duck(active) {
        if (!engineBus || !context) return;
        engineBus.gain.setTargetAtTime(active ? 0.55 : 1, context.currentTime, 0.12);
    }

    // Rider's voice: one line at a time, the engine dips underneath.
    function speak(id, { volume = 1 } = {}) {
        const audioContext = getContext();
        if (!audioContext) return Promise.resolve(false);
        if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
        if (voice && voice.source) {
            try {
                voice.source.stop();
            } catch {
                // Already finished.
            }
        }
        const request = {};
        voice = { request, source: null };
        return load(id).then((buffer) => {
            if (!buffer || !voice || voice.request !== request) return false;
            const source = audioContext.createBufferSource();
            const gain = audioContext.createGain();
            source.buffer = buffer;
            gain.gain.value = volume;
            source.connect(gain);
            gain.connect(voiceBus);
            source.onended = () => {
                gain.disconnect();
                if (voice && voice.source === source) {
                    voice = null;
                    duck(false);
                }
            };
            voice.source = source;
            duck(true);
            source.start();
            return true;
        });
    }

    function stopVoice() {
        if (voice && voice.source) {
            try {
                voice.source.stop();
            } catch {
                // Already finished.
            }
        }
        voice = null;
        duck(false);
    }

    // Resolves with what actually decoded, for diagnostics.
    async function status() {
        const loaded = [];
        for (const [id, promise] of buffers) {
            if (await promise) loaded.push(id);
        }
        const activeLoops = [...loops].filter(([, loop]) => loop.source).map(([id]) => id);
        return { context: context ? context.state : 'none', loaded, activeLoops };
    }

    return {
        prepare, warmUp, unlock, play, speak, stopVoice, startRun, stopRun, update, setEnabled, duck, status,
        get running() { return running; },
        get speaking() { return Boolean(voice); },
        get gear() { return sim.gear + 1; },
        get rpm() { return sim.rpm; }
    };
}
