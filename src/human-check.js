// Human check before ranked runs, once per visit. When the API is asked for
// a ranked session without a valid pass, it answers 403 with the check to
// run:
//  - { mode: 'turnstile', sitekey }: the Cloudflare box;
//  - { mode: 'home', challenge, bits }: the home-made check, until the
//    Cloudflare keys are set. A small proof of work for the server, plus
//    checks only a browser can do: no automated browser; on a computer, a
//    button held down with a real mouse that moved around; on a phone,
//    nothing to do (it runs unseen).
// The answer is traded at /human-check for a pass valid an hour, kept for
// the visit (sessionStorage) and sent with every ranked session request.
const PASS_KEY = 'wheelie_human_pass';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// Also the action the server expects in Cloudflare's answer.
const ACTION = 'ranked';
const HOLD_MS = 1500;
const MIN_MOUSE_MOVES = 15;

export class HumanCheckRequired extends Error {
    constructor(check) {
        super('vérification anti-robot à faire');
        this.check = check.mode ? check : { mode: 'turnstile', ...check };
    }
}

export function storedPass() {
    try {
        return sessionStorage.getItem(PASS_KEY) || null;
    } catch {
        return null;
    }
}

function storePass(pass) {
    try {
        if (pass) sessionStorage.setItem(PASS_KEY, pass);
        else sessionStorage.removeItem(PASS_KEY);
    } catch {
        // Private mode without storage: the check comes back next run.
    }
}

export function forgetPass() {
    storePass(null);
}

// Real mouse movement since the page opened (a person reaching for buttons
// makes dozens; a driven cursor jumps from point to point).
let mouseMoves = 0;
let lastMove = '';
window.addEventListener('pointermove', (event) => {
    if (!event.isTrusted || event.pointerType !== 'mouse') return;
    const at = `${Math.round(event.clientX)},${Math.round(event.clientY)}`;
    if (at !== lastMove) mouseMoves += 1;
    lastMove = at;
}, { passive: true });

function automated() {
    return navigator.webdriver === true || /HeadlessChrome|PhantomJS|Electron/i.test(navigator.userAgent);
}

let scriptPromise = null;
function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = SCRIPT_URL;
            script.async = true;
            script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile absent')));
            script.onerror = () => {
                scriptPromise = null;
                script.remove();
                reject(new Error('script Cloudflare injoignable'));
            };
            document.head.appendChild(script);
        });
    }
    return scriptPromise;
}

// SHA-256 of an ASCII string, first 32 bits only (enough to count leading
// zero bits up to 32). Plain JS: tens of thousands a second without the
// promise of crypto.subtle for each one.
const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const W = new Uint32Array(64);
function sha256Head(text) {
    const length = text.length;
    const blocks = ((length + 8) >> 6) + 1;
    const words = new Uint32Array(blocks * 16);
    for (let i = 0; i < length; i++) words[i >> 2] |= (text.charCodeAt(i) & 0xff) << (24 - (i & 3) * 8);
    words[length >> 2] |= 0x80 << (24 - (length & 3) * 8);
    words[blocks * 16 - 1] = length * 8;
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    for (let block = 0; block < blocks; block++) {
        for (let t = 0; t < 16; t++) W[t] = words[block * 16 + t];
        for (let t = 16; t < 64; t++) {
            const a = W[t - 15], b = W[t - 2];
            const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
            const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
            W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let t = 0; t < 64; t++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0;
            d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    return h0 >>> 0;
}

// The nonce whose SHA-256 with the challenge starts with `bits` zero bits
// (up to 32), worked out in slices so the page keeps running.
async function solve(challenge, bits) {
    if (!/^[\x20-\x7e]+$/.test(challenge) || bits > 32) throw new Error('défi illisible');
    const prefix = `${challenge}:`;
    for (let nonce = 0; nonce < 2 ** 26;) {
        const until = performance.now() + 12;
        while (performance.now() < until) {
            for (let i = 0; i < 64; i++, nonce++) {
                if (Math.clz32(sha256Head(prefix + nonce)) >= bits) return String(nonce);
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error('pas de solution');
}

async function askPass(apiBase, apiFetch, body) {
    const response = await apiFetch(`${apiBase}/human-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }, 12000);
    if (!response.ok) return response.status === 403 ? 'refused' : 'unavailable';
    const data = await response.json().catch(() => ({}));
    storePass(data.human_pass || null);
    return 'passed';
}

// Runs the check. Resolves 'passed' (pass stored), 'unranked' (play without
// ranking) or 'cancel' (back to the menu).
export function runHumanCheck({ check, phone = false, apiBase, apiFetch, onEvent = () => {} }) {
    const home = check.mode === 'home';
    // Home-made check on a phone: nothing shown, unless something is wrong.
    if (home && phone && !automated()) {
        return solve(check.challenge, check.bits)
            .then((nonce) => askPass(apiBase, apiFetch, { challenge: check.challenge, nonce }))
            .catch(() => 'unavailable')
            .then((result) => {
                if (result === 'passed') {
                    onEvent('passed');
                    return 'passed';
                }
                return showCheck({ check, apiBase, apiFetch, onEvent, failed: result });
            });
    }
    return showCheck({ check, apiBase, apiFetch, onEvent });
}

function showCheck({ check, apiBase, apiFetch, onEvent, failed = null }) {
    const screen = document.getElementById('human-check-screen');
    const box = document.getElementById('human-check-box');
    const hold = document.getElementById('human-check-hold');
    const status = document.getElementById('human-check-status');
    const unranked = document.getElementById('human-check-unranked');
    const cancel = document.getElementById('human-check-cancel');
    if (!screen || !box || !hold) return Promise.resolve('unranked');
    const home = check.mode === 'home';

    return new Promise((resolve) => {
        let widgetId = null;
        let done = false;
        const setStatus = (text) => {
            if (!status) return;
            status.textContent = text;
            status.hidden = !text;
        };
        const finish = (result) => {
            if (done) return;
            done = true;
            if (widgetId !== null) {
                try { window.turnstile.remove(widgetId); } catch { /* already gone */ }
            }
            box.replaceChildren();
            hold.onpointerdown = hold.onpointerup = hold.onpointerleave = hold.onpointercancel = null;
            unranked.onclick = null;
            cancel.onclick = null;
            screen.classList.remove('active');
            onEvent(result);
            resolve(result);
        };
        const explain = (result) => {
            onEvent(result);
            setStatus(result === 'refused'
                ? 'Vérification refusée. Réessaie.'
                : 'Vérification indisponible pour le moment. Tu peux jouer sans classement.');
        };

        unranked.onclick = () => finish('unranked');
        cancel.onclick = () => finish('cancel');
        setStatus(failed ? 'Vérification indisponible pour le moment. Tu peux jouer sans classement.' : '');
        box.replaceChildren();
        box.hidden = home;
        hold.hidden = !home || failed !== null;
        screen.classList.add('active');

        if (home) {
            if (automated()) {
                hold.hidden = true;
                onEvent('automated');
                setStatus('Navigateur automatisé détecté : les parties classées sont réservées aux humains.');
                return;
            }
            if (failed) return;
            // The work starts at once; the press decides when it is sent.
            const work = solve(check.challenge, check.bits).catch(() => null);
            const fill = hold.querySelector('.human-check-hold__fill');
            let started = 0;
            let frame = 0;
            const reset = () => {
                cancelAnimationFrame(frame);
                started = 0;
                if (fill) fill.style.transform = 'scaleX(0)';
            };
            const complete = async (pointerType) => {
                reset();
                if (pointerType === 'mouse' && mouseMoves < MIN_MOUSE_MOVES) {
                    onEvent('still-mouse');
                    setStatus('Bouge la souris, puis maintiens à nouveau le bouton.');
                    return;
                }
                hold.disabled = true;
                setStatus('Vérification…');
                const nonce = await work;
                const result = nonce ? await askPass(apiBase, apiFetch, { challenge: check.challenge, nonce }).catch(() => 'unavailable')
                    : 'unavailable';
                hold.disabled = false;
                if (result === 'passed') finish('passed');
                else explain(result);
            };
            hold.onpointerdown = (event) => {
                if (!event.isTrusted || hold.disabled) return;
                event.preventDefault();
                const pointerType = event.pointerType;
                started = performance.now();
                const tick = () => {
                    const progress = Math.min(1, (performance.now() - started) / HOLD_MS);
                    if (fill) fill.style.transform = `scaleX(${progress})`;
                    if (progress >= 1) complete(pointerType);
                    else frame = requestAnimationFrame(tick);
                };
                frame = requestAnimationFrame(tick);
            };
            hold.onpointerup = hold.onpointerleave = hold.onpointercancel = () => {
                if (started && performance.now() - started < HOLD_MS) setStatus('Maintiens le bouton jusqu’au bout.');
                reset();
            };
            return;
        }

        const onToken = async (token) => {
            setStatus('Vérification…');
            const result = await askPass(apiBase, apiFetch, { token }).catch(() => 'unavailable');
            if (result === 'passed') {
                finish('passed');
                return;
            }
            explain(result);
            // Tokens are single use: a fresh box for the next try.
            if (!done && widgetId !== null) window.turnstile.reset(widgetId);
        };
        loadTurnstile().then((turnstile) => {
            if (done) return;
            widgetId = turnstile.render(box, {
                sitekey: check.sitekey,
                action: ACTION,
                theme: 'dark',
                language: 'fr',
                size: 'flexible',
                callback: onToken,
                'error-callback': () => {
                    setStatus('La vérification n’a pas abouti. Réessaie, ou joue sans classement.');
                },
                'expired-callback': () => {
                    if (!done) turnstile.reset(widgetId);
                }
            });
        }).catch(() => {
            onEvent('script');
            setStatus('Impossible de charger la vérification. Tu peux jouer sans classement.');
        });
    });
}
