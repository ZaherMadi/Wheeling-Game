// Session live (the API's live_rooms.py): friends in one room by a code.
// The first to type the code is the host (le maître); he sets the session
// and starts it. Each one rides in turn (a competitive run); the others
// watch it live and react; a fall: the next one. At the end: a winner, a
// podium with poses to make fun of each other, session trophies.
//
// The rider's game sends what it shows (src: main.js liveRecord*), a batch
// a second; the others poll the room once a second and play it back two
// seconds late (main.js spectator). Reactions show the one reacting small
// at the side (reactor.js), in his look, with his voice.
//
// Locked at first: 1 000 000 cumulative points, or the code 51FRIENDS
// (the beta).
import './live.css';
import { createReactor } from './reactor.js';

export const LIVE_PRICE = 1000000;
const LIVE_CODE = '51FRIENDS';
const UNLOCK_KEY = 'wheelie_live_unlocked';
const POSE_KEY = 'wheelie_live_pose';
const LAST_KEY = 'wheelie_live_last';
const POLL_MS = 1000;
const CRASH_WAIT = 3600;

export const PHRASES = {
    e1: 'Allez, t’es chaud !', e2: 'Lâche rien, frérot !', e3: 'Quelle bavette, la classe !',
    e4: 'C’est carré, continue !', e5: 'Le boss de la route !', e6: 'Respect, t’es trop fort !',
    d1: 'Ça sent la chute…', d2: 'Attention l’obstacle ! … Non j’rigole.', d3: 'T’as les mains qui tremblent ?',
    d4: 'Même ma grand-mère roule mieux !', d5: 'Bouuuh, la honte !', d6: 'Tu vas tomber, tu vas tomber…'
};
const REACTS = [
    { kind: 'laugh', emoji: '😂', label: 'MDR', text: 'MDRRR 😂' },
    { kind: 'boo', emoji: '👎', label: 'BOUUU', text: 'BOUUUUUH 👎' },
    { kind: 'cheer', emoji: '🔥', label: 'ALLEZ', text: 'ALLEZ ALLEZ ! 🔥' },
    { kind: 'clap', emoji: '👏', label: 'BRAVO', text: 'BRAVO ! 👏' }
];
// Clips said in the voice of the one reacting (street-lines.json, rider).
const CLIP_COUNTS = { live_laugh: 2, live_boo: 2, live_cheer: 2, live_clap: 2 };
export const SESSION_POSES = [
    ['mock', 'Le moqueur'], ['loser', 'Le L sur le front'], ['tears', 'Fausses larmes'], ['champion', 'Champion'], ['yawn', 'Le blasé']
];
const REASONS = {
    crash: 'chute', hit: 'chute', loop: 'retourné', bavette: 'bavette ratée', flip: 'flip raté', slow: 'arrêté par la police',
    earlyGas: 'trop de gaz', absent: 'absent', skipped: 'tour passé', left: 'parti'
};
const SLIDES = [
    { art: '⚡🏍️⚡', title: 'SESSION LIVE', text: 'Joue en direct avec tes potes. Tout le monde tape le même code de session : le premier à l’entrer devient le maître de la partie.' },
    { art: '🎥👀', title: 'CHACUN SON TOUR', text: 'Le maître lance quand il veut. Un joueur roule, les autres le regardent en direct. À chaque chute : au suivant !' },
    { art: '😂👎🔥', title: 'RÉAGIS', text: 'MDR, BOUUU, ALLEZ, BRAVO, ou une phrase toute prête pour encourager… ou déstabiliser. Ton perso apparaît sur l’écran du joueur, avec ta voix.' },
    { art: '🏆🎖️', title: 'UN GAGNANT', text: 'Un nombre de parties par joueur, ou illimité ; arrêt par le maître ou au vote du groupe. À la fin : un podium avec des poses pour se moquer, des trophées de session et tes stats.' }
];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (value) => Math.floor(Number(value) || 0).toLocaleString('fr-FR');
const readLocal = (key) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};
const writeLocal = (key, value) => {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Kept for this visit only.
    }
};

export function liveUnlocked() {
    return !!readLocal(UNLOCK_KEY);
}

// deps: { post, identity, setNickname, points, spend, stat, toast, say,
// voiceOn, game: { ride, watch: { begin, push, end, stop, done, active },
// podium, stopAll }, menu }
export function createLive(deps) {
    const root = document.createElement('div');
    root.id = 'live-root';
    root.innerHTML = `
        <div class="live-screen" id="live-screen" hidden><div class="live-card" id="live-panel"></div></div>
        <div id="live-watch" hidden>
            <div class="live-watch-top"><span class="live-badge">LIVE</span><i class="live-avatar" id="live-watch-avatar"></i>
                <b id="live-watch-name"></b><span class="live-score" id="live-watch-score">0</span><small id="live-watch-info"></small></div>
            <div class="live-host-tools" id="live-tools"></div>
            <div class="live-phrases" id="live-phrases" hidden></div>
            <div class="live-reacts" id="live-reacts"></div>
        </div>
        <div id="live-ride" hidden><div class="live-ride-badge"><span class="live-badge">LIVE</span><span id="live-ride-info"></span></div></div>
        <div class="live-interlude" id="live-interlude" hidden></div>
        <div id="live-reactors"></div>`;
    document.body.append(root);
    const $ = (id) => root.querySelector(`#${id}`);
    const panel = $('live-panel');
    const screen = $('live-screen');
    const reactor = createReactor($('live-reactors'));

    // --- The room -----------------------------------------------------------------
    let room = null;
    let seat = null;
    let me = null;
    let code = null;
    let lastSeq = -1;
    let cursor = { run: null, batch: -1 };
    let timer = null;
    let busy = false;
    let failures = 0;
    let view = 'closed';
    // Riding my turn: the run, the batches to send.
    const ride = { run: null, n: 0, frames: [], spawns: [], marks: [], lastSent: 0, sending: false, refused: false };
    const startedRuns = new Set();
    let crashUntil = 0;
    let watchRun = null;
    let watchEndedAt = 0;
    let interludeTimer = null;
    let endedSeen = null;
    let phrasesOpen = false;
    let lastWatchScore = 0;

    const players = () => (room ? room.players : []);
    const player = (id) => players().find((p) => p.id === id) || null;
    const isHost = () => !!room && room.host === me;

    function show(name) {
        view = name;
        screen.hidden = !['join', 'lobby', 'results', 'intro'].includes(name);
        screen.classList.toggle('is-results', name === 'results');
        panel.classList.toggle('live-card--wide', name === 'results');
        $('live-watch').hidden = name !== 'watch';
        $('live-ride').hidden = name !== 'ride';
        if (name !== 'results') deps.game.podium(null);
        if (name !== 'watch') {
            phrasesOpen = false;
            $('live-phrases').hidden = true;
        }
        document.body.classList.toggle('live-on', name !== 'closed');
        document.body.classList.toggle('live-panel', ['join', 'lobby', 'results', 'intro'].includes(name));
        document.body.classList.toggle('live-watching', name === 'watch');
    }

    function avatar(p) {
        const look = p?.look || {};
        return `<i class="live-avatar" style="--c:${esc(look.hoodie || '#f6c416')};--h:${esc(look.helmet || '#0a0a0c')}">${esc(look.number || '51')}</i>`;
    }

    // --- Requests -------------------------------------------------------------------
    async function call(path, body) {
        return deps.post(`live/${path}`, { code, seat, ...body });
    }

    function errorText(error) {
        if (error?.data?.account === 'code_required') return 'Ce pseudo est protégé : ouvre « Mon compte » sur cet appareil et entre ton mot de passe.';
        if (error?.status === 409 && /full/i.test(error?.data?.detail || '')) return 'Cette session est pleine (8 joueurs).';
        if (error?.status === 422) return 'Le code fait 3 à 12 lettres ou chiffres.';
        if (error?.status === 429) return 'Trop d’essais, réessaie dans un moment.';
        return 'Le serveur ne répond pas, réessaie.';
    }

    async function join(wanted) {
        const who = deps.identity();
        if (!who.nickname) return 'nickname';
        const look = { ...(who.look || {}), livePose: readLocal(POSE_KEY) || 'mock' };
        const answer = await deps.post('live/join', { code: wanted, nickname: who.nickname, device_token: who.device_token, look, voice: who.voice });
        code = answer.room.code;
        seat = answer.seat;
        me = answer.me;
        room = answer.room;
        lastSeq = room.seq;
        cursor = { run: null, batch: -1 };
        writeLocal(LAST_KEY, JSON.stringify({ code, at: Date.now() }));
        deps.stat(answer.created ? 'liveRooms' : 'liveJoins');
        startPolling();
        update();
        return 'ok';
    }

    function startPolling() {
        clearInterval(timer);
        timer = setInterval(tick, POLL_MS);
    }

    function stopPolling() {
        clearInterval(timer);
        timer = null;
    }

    async function tick() {
        if (busy || !code) return;
        busy = true;
        try {
            if (ride.run !== null) await flush(false);
            const riding = ride.run !== null;
            const answer = await call('poll', {
                run: riding ? ride.run : cursor.run, batch: riding ? 1e9 : cursor.batch, events: lastSeq
            });
            failures = 0;
            receive(answer);
        } catch (error) {
            failures++;
            if (error?.status === 404) {
                end('Cette session n’existe plus (6 h sans activité, ou terminée).');
            } else if (error?.status === 403 && code) {
                // The seat was replaced (another device, a reload): join again.
                try {
                    await join(code);
                } catch {
                    end('Tu n’es plus dans cette session.');
                }
            }
        } finally {
            busy = false;
        }
    }

    function receive(answer) {
        room = answer;
        for (const event of answer.events || []) {
            if (event.seq <= lastSeq) continue;
            lastSeq = event.seq;
            onEvent(event);
        }
        const frames = answer.frames;
        if (frames && watchRun !== null && frames.run === watchRun) {
            for (const batch of frames.batches || []) {
                if (cursor.run === watchRun && batch.n <= cursor.batch) continue;
                deps.game.watch.push(batch);
                cursor = { run: watchRun, batch: batch.n };
            }
        }
        update();
    }

    function onEvent(event) {
        const who = player(event.player);
        if (event.kind === 'react' && event.player !== me) {
            showReaction(who, event.react, event.phrase);
        } else if (event.kind === 'result' && event.run === watchRun) {
            deps.game.watch.end(event);
            watchEndedAt = performance.now();
            const reason = REASONS[event.reason] || 'chute';
            interlude(`${who?.name || '?'} : ${fmt(event.score)} pts`, reason.toUpperCase(), false, 2600);
        } else if ((event.kind === 'join' || event.kind === 'back') && event.player !== me && who) {
            deps.toast('SESSION LIVE', `${who.name} est là`);
        } else if (event.kind === 'leave' && event.player !== me) {
            deps.toast('SESSION LIVE', 'Un joueur est parti');
        } else if (event.kind === 'host' && event.player === me) {
            deps.toast('👑 MAÎTRE DE LA PARTIE', 'C’est toi qui mènes la session maintenant');
        }
    }

    function showReaction(who, kind, phraseId) {
        const meta = REACTS.find((r) => r.kind === kind);
        const text = kind === 'phrase' ? PHRASES[phraseId] || '' : meta?.text || '';
        reactor.show({ name: who?.name || '?', look: who?.look, kind, text });
        // In his voice (a ready-made clip), when the voices are on.
        if (deps.voiceOn()) {
            const voice = !who?.voice || who.voice === 'jamal' ? 'rider' : `rider_${who.voice}`;
            const category = kind === 'phrase' ? `live_${phraseId}` : `live_${kind}`;
            const count = CLIP_COUNTS[category] || 1;
            deps.say(`st_${voice}_${category}_${1 + Math.floor(Math.random() * count)}`);
        }
    }

    // --- What to show, from the room ----------------------------------------------------
    function update() {
        if (!room) return;
        const turn = room.turn;
        const now = performance.now();
        if (ride.run !== null) {
            refreshRide();
            return;
        }
        if (now < crashUntil) return;
        if (room.status === 'lobby') {
            stopWatching();
            if (view !== 'lobby') show('lobby');
            renderLobby();
        } else if (room.status === 'playing') {
            if (turn && turn.id === me) {
                if (!startedRuns.has(turn.run) && !waitingForCrash()) myTurn(turn.run);
            } else if (turn) {
                if (watchRun !== turn.run && !waitingForCrash()) beginWatch(turn);
                if (view === 'watch') refreshWatch();
            } else if (view === 'watch') {
                refreshWatch();
            }
        } else if (room.status === 'finished') {
            if (waitingForCrash()) return;
            stopWatching();
            if (view !== 'results' || endedSeen !== room.ended?.at) showResults();
        }
    }

    // A fall being watched: it plays out (or 6 s) before the next.
    function waitingForCrash() {
        if (!watchEndedAt) return false;
        const done = deps.game.watch.done() || performance.now() - watchEndedAt > 6000;
        if (done) watchEndedAt = 0;
        return !done;
    }

    function stopWatching() {
        if (watchRun !== null) deps.game.watch.stop();
        watchRun = null;
        watchEndedAt = 0;
    }

    function interlude(title, small, mine = false, ms = 2400, text = '') {
        const box = $('live-interlude');
        box.innerHTML = `<div class="live-interlude__card ${mine ? 'is-me' : ''}"><small>${esc(small)}</small><strong>${esc(title)}</strong>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
        box.hidden = false;
        clearTimeout(interludeTimer);
        interludeTimer = setTimeout(() => { box.hidden = true; }, ms);
    }

    function runsLeft(id) {
        const limit = room.settings.runs;
        if (!limit) return 'parties illimitées';
        const done = player(id)?.played || 0;
        return `partie ${Math.min(limit, done + 1)} sur ${limit}`;
    }

    function beginWatch(turn) {
        const rider = player(turn.id);
        watchRun = turn.run;
        watchEndedAt = 0;
        cursor = { run: turn.run, batch: -1 };
        lastWatchScore = 0;
        deps.game.watch.begin(turn.run);
        show('watch');
        renderReacts();
        interlude(rider?.name || '?', 'Au tour de', false, 2600, runsLeft(turn.id));
        refreshWatch();
    }

    function refreshWatch() {
        const turn = room?.turn;
        const rider = turn ? player(turn.id) : null;
        const avatarBox = $('live-watch-avatar');
        if (rider) {
            avatarBox.style.setProperty('--c', rider.look?.hoodie || '#f6c416');
            avatarBox.style.setProperty('--h', rider.look?.helmet || '#0a0a0c');
            avatarBox.textContent = rider.look?.number || '51';
        }
        $('live-watch-name').textContent = rider ? rider.name : 'Au suivant…';
        const watchers = players().filter((p) => !p.away && p.id !== turn?.id).length;
        $('live-watch-info').textContent = `${watchers} ${watchers > 1 ? 'spectateurs' : 'spectateur'}`;
        renderTools();
    }

    // Each frame of the watched run (main.js spectator).
    function watchFrame({ score, kmh }) {
        if (view !== 'watch') return;
        if (score !== lastWatchScore) {
            lastWatchScore = score;
            $('live-watch-score').textContent = fmt(score);
        }
        $('live-watch-info').dataset.kmh = Math.round(kmh);
    }

    function renderReacts() {
        const bar = $('live-reacts');
        bar.innerHTML = REACTS.map((r) => `<button type="button" class="live-react" data-kind="${r.kind}"><span>${r.emoji}</span>${r.label}</button>`).join('')
            + '<button type="button" class="live-react" data-kind="phrases"><span>💬</span>PHRASES</button>';
        const sheet = $('live-phrases');
        const list = (prefix) => Object.entries(PHRASES).filter(([id]) => id.startsWith(prefix))
            .map(([id, text]) => `<button type="button" class="live-phrase ${prefix === 'd' ? 'is-bad' : ''}" data-phrase="${id}">${esc(text)}</button>`).join('');
        sheet.innerHTML = `<div><h5>Encourager</h5>${list('e')}</div><div><h5>Déstabiliser</h5>${list('d')}</div>`;
        sheet.style.gridTemplateColumns = '1fr 1fr';
        sheet.querySelectorAll('div').forEach((column) => { column.style.display = 'grid'; column.style.gap = '6px'; column.style.alignContent = 'start'; });
    }

    function renderTools() {
        const tools = $('live-tools');
        const parts = [];
        if (isHost()) {
            parts.push('<button type="button" class="live-tool" data-act="skip">⏭ Passer le tour</button>');
            parts.push('<button type="button" class="live-tool" data-act="end">⏹ Terminer</button>');
        }
        if (room?.settings?.stop === 'vote') {
            const votes = room.votes || { count: 0, needed: 1, mine: false };
            parts.push(`<button type="button" class="live-tool" data-act="vote">${votes.mine ? '✅' : '🗳'} Arrêter (${votes.count}/${votes.needed})</button>`);
        }
        parts.push('<button type="button" class="live-tool" data-act="leave">🚪 Quitter</button>');
        const html = parts.join('');
        if (tools.innerHTML !== html) tools.innerHTML = html;
    }

    async function react(kind, phraseId = null) {
        if (!room || room.status !== 'playing' || !room.turn || room.turn.id === me) return;
        const mine = player(me);
        showReaction(mine, kind, phraseId);
        deps.stat('liveReactions');
        try {
            await call('react', { kind, phrase: phraseId });
        } catch {
            // Too fast, or the turn just ended: nothing to say.
        }
    }

    // --- My turn ----------------------------------------------------------------------
    function myTurn(run) {
        startedRuns.add(run);
        stopWatching();
        show('ride');
        const who = deps.identity();
        interlude(`À TOI, ${who.nickname || ''} !`, 'Session live', true, 1800, runsLeft(me));
        deps.stat('liveTurns');
        setTimeout(() => {
            if (!room || room.status !== 'playing' || room.turn?.run !== run || room.turn?.id !== me) return;
            Object.assign(ride, { run, n: 0, frames: [], spawns: [], marks: [], lastSent: performance.now(), refused: false });
            refreshRide();
            deps.game.ride(run);
        }, 1700);
    }

    function refreshRide() {
        const watchers = players().filter((p) => !p.away && p.id !== me).length;
        $('live-ride-info').textContent = watchers ? `${watchers} ${watchers > 1 ? 'te regardent' : 'te regarde'}` : 'en direct';
    }

    async function flush(final) {
        if (ride.run === null || ride.sending || ride.refused) return;
        const now = performance.now();
        const nothing = !ride.frames.length && !ride.spawns.length && !ride.marks.length;
        // A heartbeat every 2 s even when paused (else the turn is passed).
        if (nothing && !final && now - ride.lastSent < 2000) return;
        const batch = { run: ride.run, n: ride.n, frames: ride.frames.splice(0, 30), spawns: ride.spawns.splice(0, 40), marks: ride.marks.splice(0, 10) };
        ride.sending = true;
        try {
            await call('frames', batch);
            ride.n++;
            ride.lastSent = now;
        } catch (error) {
            if (error?.status === 409) {
                // Not my turn any more (passed by the host, or too long).
                ride.refused = true;
                deps.toast('SESSION LIVE', 'Ton tour a été passé : finis ta partie, elle ne compte plus pour la session');
            }
        } finally {
            ride.sending = false;
        }
    }

    // main.js, while riding a live turn.
    function recordFrame(values) {
        if (ride.run === null) return;
        ride.frames.push(values);
        if (ride.frames.length > 90) ride.frames.splice(0, ride.frames.length - 90);
    }
    function recordSpawn(item) {
        if (ride.run !== null) ride.spawns.push(item);
    }
    function recordMark(frame, title, text = '') {
        if (ride.run !== null && ride.marks.length < 20) ride.marks.push([frame, String(title ?? '').slice(0, 24), String(text ?? '').slice(0, 40)]);
    }

    // main.js, at the fall: true when it was a live turn (no game-over screen).
    function turnOver({ score, reason, seconds, kmh }) {
        if (ride.run === null) return false;
        const run = ride.run;
        const refused = ride.refused;
        crashUntil = performance.now() + CRASH_WAIT;
        (async () => {
            await flush(true);
            ride.run = null;
            if (refused) return;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const answer = await call('turn-end', { run, score: Math.max(0, Math.floor(score)), reason, seconds, kmh });
                    room = answer;
                    break;
                } catch {
                    await new Promise((resolve) => setTimeout(resolve, 800));
                }
            }
        })();
        setTimeout(update, CRASH_WAIT + 50);
        return true;
    }

    // --- Panels ------------------------------------------------------------------------------
    function renderJoin(message = '') {
        show('join');
        const who = deps.identity();
        let last = null;
        try {
            last = JSON.parse(readLocal(LAST_KEY) || 'null');
        } catch {
            last = null;
        }
        const recent = last && Date.now() - last.at < 6 * 3600 * 1000 ? last.code : null;
        panel.innerHTML = `
            <button type="button" class="live-close" data-act="close" aria-label="Fermer">✕</button>
            <h2 class="live-title">SESSION <em>LIVE</em></h2>
            <p class="live-text">Tape le code de ta session. <b>Le premier à l’entrer est le maître de la partie</b> : il la règle et la lance quand il veut.</p>
            ${who.nickname ? '' : '<input class="live-input live-input--small" id="live-nickname" maxlength="15" placeholder="Ton pseudo" autocomplete="nickname">'}
            <input class="live-input" id="live-code" maxlength="12" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false">
            <button type="button" class="live-btn live-btn--primary" data-act="join">⚡ REJOINDRE</button>
            <div class="live-row">
                <button type="button" class="live-btn live-btn--ghost" data-act="random">🎲 Code au hasard</button>
                ${recent ? `<button type="button" class="live-btn live-btn--ghost" data-act="rejoin">↩ Revenir dans ${esc(recent)}</button>` : ''}
            </div>
            <p class="live-error" id="live-error">${esc(message)}</p>`;
        const input = $('live-code');
        input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
        input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submitJoin(); });
        panel.dataset.recent = recent || '';
    }

    async function submitJoin(wanted = null) {
        const nickInput = $('live-nickname');
        if (nickInput) {
            const name = nickInput.value.trim();
            if (!name || name.length > 15) {
                $('live-error').textContent = 'Choisis d’abord un pseudo (15 caractères max).';
                return;
            }
            deps.setNickname(name);
        }
        const value = (wanted || $('live-code')?.value || '').toUpperCase();
        if (value.length < 3) {
            $('live-error').textContent = 'Le code fait 3 à 12 lettres ou chiffres.';
            return;
        }
        $('live-error').textContent = 'Connexion…';
        try {
            const result = await join(value);
            if (result === 'nickname') $('live-error').textContent = 'Choisis d’abord un pseudo.';
        } catch (error) {
            const box = $('live-error');
            if (box) box.textContent = errorText(error);
        }
    }

    function renderLobby() {
        const host = isHost();
        const list = players().map((p) => `<li class="live-player ${p.away ? 'is-away' : ''} ${p.id === me ? 'is-me' : ''}">${avatar(p)}<div><b>${esc(p.name)}</b>
            <small>${p.host ? '👑 maître' : 'joueur'}${p.id === me ? ' · toi' : ''}${p.away ? ' · absent' : ''}</small></div></li>`).join('');
        const runs = room.settings.runs;
        const chip = (value, label, on, act, disabled) => `<button type="button" class="live-chip ${on ? 'is-on' : ''}" data-act="${act}" data-value="${value}" ${disabled ? 'disabled' : ''}>${label}</button>`;
        const pose = readLocal(POSE_KEY) || 'mock';
        const html = `
            <div class="live-head"><span class="live-badge">LIVE</span><span class="live-code">${esc(code)}</span>
                <button type="button" class="live-share" data-act="share">Partager le code</button></div>
            <p class="live-waiting">EN ATTENTE DE JOUEURS<i></i><i></i><i></i></p>
            <ul class="live-players">${list}</ul>
            <div class="live-settings">
                <h4>Parties par joueur ${host ? '' : '(réglé par le maître)'}</h4>
                <div class="live-chips">${[1, 2, 3, 5, 0].map((v) => chip(v, v ? v : '∞ illimité', runs === v, 'runs', !host)).join('')}</div>
                <h4>Fin de la session</h4>
                <div class="live-chips">${chip('host', '👑 Le maître décide', room.settings.stop === 'host', 'stop', !host)}${chip('vote', '🗳 Vote du groupe', room.settings.stop === 'vote', 'stop', !host)}</div>
                <h4>Ta pose sur le podium de la session</h4>
                <div class="live-chips">${SESSION_POSES.map(([id, label]) => chip(id, label, pose === id, 'pose', false)).join('')}</div>
            </div>
            ${host
        ? '<button type="button" class="live-btn live-btn--yellow" data-act="start">▶ LANCER LA SESSION</button>'
        : '<p class="live-text">Le maître lance la session quand il veut…</p>'}
            <button type="button" class="live-btn live-btn--ghost" data-act="leave">🚪 Quitter la session</button>
            <p class="live-error" id="live-error"></p>`;
        if (panel.dataset.html !== html) {
            panel.dataset.html = html;
            panel.innerHTML = html;
        }
    }

    function showResults() {
        const ended = room.ended || { standings: [], trophies: [] };
        endedSeen = ended.at;
        show('results');
        const name = (id) => player(id)?.name || ended.standings.find((s) => s.id === id)?.name || '?';
        const winner = ended.winner ? name(ended.winner) : null;
        const standings = ended.standings.map((s) => `<li>${avatar(player(s.id) || {})}<b>${esc(s.name)}</b><small>${s.runs} partie${s.runs > 1 ? 's' : ''} · record ${fmt(s.best)}</small><em>${fmt(s.total)}</em></li>`).join('');
        const trophies = ended.trophies.map((t) => `<div class="live-trophy"><b>${t.emoji} ${esc(t.name)}</b>${esc(name(t.player))}${t.id === 'express' ? ` · ${t.value} s` : ''}</div>`).join('');
        panel.dataset.html = '';
        panel.innerHTML = `
            <div class="live-results">
                <div id="live-stage"></div>
                <div>
                    <h2 class="live-title">${winner ? `🏆 <em>${esc(winner)}</em>` : 'SESSION <em>TERMINÉE</em>'}</h2>
                    <p class="live-text">${winner ? 'remporte la session !' : 'Personne n’a marqué de points.'}</p>
                    <ol class="live-standings">${standings || '<li><b>Aucune partie jouée</b></li>'}</ol>
                    <div class="live-trophies">${trophies}</div>
                    ${isHost() ? '<button type="button" class="live-btn live-btn--yellow" data-act="again">↻ REJOUER (même code)</button>' : '<p class="live-text">Le maître peut relancer une session avec le même code.</p>'}
                    <button type="button" class="live-btn live-btn--ghost" data-act="leave">🚪 Quitter</button>
                </div>
            </div>`;
        // The session podium: the top three, in their session poses, each
        // making fun of the one beside (BLOCKS: 1st in the middle).
        const targets = [1, -1, 1];
        const entries = ended.standings.slice(0, 3).map((s, rank) => {
            const p = player(s.id);
            return { key: `live:${s.id}`, name: s.name, score: s.total, look: { ...(p?.look || {}), pose: p?.look?.livePose || 'mock', target: targets[rank] } };
        });
        requestAnimationFrame(() => deps.game.podium(entries));
        // Counted once per session end, for "Mes stats".
        const counted = `live_end_${code}_${ended.at}`;
        if (!readLocal(counted)) {
            writeLocal(counted, '1');
            deps.stat('liveEnds');
            deps.stat('liveSessions');
            if (ended.winner === me) deps.stat('liveWins');
            const mine = ended.trophies.filter((t) => t.player === me).length;
            if (mine) deps.stat('liveTrophies', mine);
        }
    }

    function end(message = '') {
        stopPolling();
        stopWatching();
        deps.game.podium(null);
        reactor.clear();
        room = null;
        seat = null;
        me = null;
        code = null;
        ride.run = null;
        if (message) renderJoin(message);
        else close();
    }

    function close() {
        show('closed');
        deps.menu();
    }

    async function leave() {
        if (code && seat) {
            try {
                await call('leave', {});
            } catch {
                // Gone anyway (it expires).
            }
        }
        writeLocal(LAST_KEY, null);
        end();
    }

    // --- Presentation and unlocking -----------------------------------------------------------
    let slide = 0;
    function renderIntro(after = null) {
        show('intro');
        const last = slide >= SLIDES.length;
        const dots = Array.from({ length: SLIDES.length + 1 }, (_, i) => `<i class="${i === slide ? 'is-on' : ''}"></i>`).join('');
        const points = deps.points();
        const body = last ? `
            <div class="live-slide"><div class="live-slide__art">🔒</div><h3>DÉBLOQUER LA SESSION LIVE</h3>
                <p class="live-text">${fmt(LIVE_PRICE)} points cumulés, ou le code de la bêta.</p>
                <button type="button" class="live-btn live-btn--yellow" data-act="buy" ${points < LIVE_PRICE ? 'aria-disabled="true"' : ''}>
                    ${after === 'confirm' ? `TOUCHE ENCORE : −${fmt(LIVE_PRICE)} PTS` : `DÉBLOQUER · ${fmt(LIVE_PRICE)} PTS`}</button>
                ${points < LIVE_PRICE ? `<p class="live-text" style="margin-top:6px">Il te manque ${fmt(LIVE_PRICE - points)} points.</p>` : ''}
                <input class="live-input live-input--small" id="live-unlock-code" maxlength="20" placeholder="Code de la bêta" autocomplete="off" autocapitalize="characters" spellcheck="false">
                <button type="button" class="live-btn live-btn--primary" data-act="code">VALIDER LE CODE</button>
                <p class="live-error" id="live-error"></p></div>`
            : `<div class="live-slide"><div class="live-slide__art">${SLIDES[slide].art}</div><h3>${SLIDES[slide].title}</h3><p class="live-text">${SLIDES[slide].text}</p></div>`;
        panel.dataset.html = '';
        panel.innerHTML = `
            <button type="button" class="live-close" data-act="close" aria-label="Fermer">✕</button>
            <h2 class="live-title">SESSION <em>LIVE</em></h2>
            <div class="live-slides">${body}</div>
            <div class="live-dots">${dots}</div>
            <div class="live-row">
                <button type="button" class="live-btn live-btn--ghost" data-act="prev" ${slide === 0 ? 'disabled' : ''}>← Précédent</button>
                ${last ? '' : '<button type="button" class="live-btn live-btn--primary" data-act="next">Suivant →</button>'}
            </div>`;
    }

    function unlocked(how) {
        writeLocal(UNLOCK_KEY, how);
        deps.stat(how === 'code' ? 'liveUnlockCode' : 'liveUnlockPoints');
        refreshEntry();
        document.dispatchEvent(new CustomEvent('wheelie:points'));
        panel.dataset.html = '';
        panel.innerHTML = `
            <h2 class="live-title">SESSION <em>LIVE</em> DÉBLOQUÉE</h2>
            <div class="live-slide__art" style="text-align:center">⚡🔓⚡</div>
            ${how === 'code' ? '<p class="live-warning">⚠️ Cette fonctionnalité est débloquée pendant la bêta du jeu. La version illimitée sera réservée aux joueurs premium.</p>'
        : '<p class="live-text">Bonne session ! Invite tes potes avec un code.</p>'}
            <button type="button" class="live-btn live-btn--primary" data-act="understood">COMPRIS</button>`;
    }

    // --- The entry on the mode screen ---------------------------------------------------------
    function refreshEntry() {
        const entry = document.getElementById('select-live');
        if (!entry) return;
        const open = liveUnlocked();
        entry.classList.toggle('is-locked', !open);
        entry.querySelector('.live-entry__lock').hidden = open;
        entry.querySelector('.live-entry__sub').textContent = open ? 'Entre potes · chacun son tour · en direct'
            : `Verrouillé · ${fmt(LIVE_PRICE)} pts ou code`;
    }

    function installEntry() {
        const free = document.getElementById('select-freemode');
        if (!free || document.getElementById('select-live')) return;
        const entry = document.createElement('button');
        entry.type = 'button';
        entry.id = 'select-live';
        entry.className = 'live-entry';
        entry.innerHTML = '<span class="live-entry__lock" aria-hidden="true">🔒</span><span class="live-entry__title">SESSION <em>LIVE</em></span><span class="live-entry__sub"></span>';
        free.after(entry);
        entry.addEventListener('click', () => open());
        refreshEntry();
    }

    function open() {
        if (!liveUnlocked()) {
            slide = 0;
            deps.stat('liveSlides');
            renderIntro();
            return;
        }
        deps.game.stopAll();
        if (room && code) {
            update();
            if (view === 'closed') show(room.status === 'finished' ? 'results' : 'lobby');
            return;
        }
        renderJoin();
    }

    // --- Taps ---------------------------------------------------------------------------------------
    root.addEventListener('click', async (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-act], [data-kind], [data-phrase]') : null;
        if (!target || target.disabled) return;
        if (target.dataset.phrase) {
            phrasesOpen = false;
            $('live-phrases').hidden = true;
            react('phrase', target.dataset.phrase);
            return;
        }
        if (target.dataset.kind) {
            if (target.dataset.kind === 'phrases') {
                phrasesOpen = !phrasesOpen;
                $('live-phrases').hidden = !phrasesOpen;
                return;
            }
            target.classList.add('is-sent');
            setTimeout(() => target.classList.remove('is-sent'), 180);
            react(target.dataset.kind);
            return;
        }
        const act = target.dataset.act;
        try {
            if (act === 'close') {
                if (view === 'intro') close();
                else if (view === 'join') close();
            } else if (act === 'join') {
                submitJoin();
            } else if (act === 'random') {
                const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
                const pick = () => letters[Math.floor(Math.random() * letters.length)];
                $('live-code').value = `${pick()}${pick()}${pick()}${pick()}${Math.floor(10 + Math.random() * 90)}`;
            } else if (act === 'rejoin') {
                submitJoin(panel.dataset.recent);
            } else if (act === 'share') {
                const text = `Rejoins ma session live sur 51Wheling : code ${code} → https://www.51games.fr`;
                if (navigator.share) navigator.share({ text }).catch(() => {});
                else navigator.clipboard?.writeText(text).then(() => deps.toast('CODE COPIÉ', code)).catch(() => {});
            } else if (act === 'runs' || act === 'stop') {
                const settings = { runs: room.settings.runs, stop: room.settings.stop };
                if (act === 'runs') settings.runs = Number(target.dataset.value);
                else settings.stop = target.dataset.value;
                room = { ...room, settings };
                renderLobby();
                receive({ ...(await call('settings', settings)), events: [], frames: null });
            } else if (act === 'pose') {
                writeLocal(POSE_KEY, target.dataset.value);
                const who = deps.identity();
                renderLobby();
                receive({ ...(await call('look', { look: { ...(who.look || {}), livePose: target.dataset.value } })), events: [], frames: null });
            } else if (act === 'start' || act === 'again') {
                deps.stat('liveStarts');
                receive({ ...(await call('start', {})), events: [], frames: null });
            } else if (act === 'leave') {
                await leave();
            } else if (act === 'skip') {
                receive({ ...(await call('skip', {})), events: [], frames: null });
            } else if (act === 'end') {
                receive({ ...(await call('end', {})), events: [], frames: null });
            } else if (act === 'vote') {
                receive({ ...(await call('vote', { stop: !room.votes?.mine })), events: [], frames: null });
            } else if (act === 'next') {
                slide = Math.min(SLIDES.length, slide + 1);
                renderIntro();
            } else if (act === 'prev') {
                slide = Math.max(0, slide - 1);
                renderIntro();
            } else if (act === 'buy') {
                if (deps.points() < LIVE_PRICE) return;
                if (target.dataset.confirm !== '1') {
                    renderIntro('confirm');
                    panel.querySelector('[data-act="buy"]').dataset.confirm = '1';
                    return;
                }
                if (deps.spend(LIVE_PRICE)) unlocked('points');
            } else if (act === 'code') {
                const value = ($('live-unlock-code')?.value || '').trim().toUpperCase();
                if (value === LIVE_CODE) unlocked('code');
                else $('live-error').textContent = 'Code incorrect.';
            } else if (act === 'understood') {
                renderJoin();
            }
        } catch (error) {
            const box = $('live-error');
            if (box) box.textContent = errorText(error);
            else deps.toast('SESSION LIVE', errorText(error));
        }
    });

    installEntry();
    document.addEventListener('wheelie:points', refreshEntry);

    return {
        open, refreshEntry, recordFrame, recordSpawn, recordMark, turnOver, watchFrame,
        renderReactors: (renderer) => reactor.render(renderer),
        // main.js: what the player is doing (for the owner's stats).
        activity() {
            if (ride.run !== null) return 'live-play';
            if (view === 'watch') return 'live-watch';
            if (view === 'results') return 'live-results';
            if (view === 'lobby' || view === 'join' || view === 'intro') return 'live-lobby';
            return null;
        },
        get riding() { return ride.run !== null; },
        get active() { return view !== 'closed'; },
        get watching() { return view === 'watch'; },
        // Tests.
        debug: { get room() { return room; }, get me() { return me; }, get view() { return view; }, get ride() { return ride; }, tick }
    };
}
