// Human check before ranked runs (Cloudflare Turnstile), once per visit.
// When the API is asked for a ranked session without a valid pass, it
// answers 403 with the widget's site key. The Cloudflare box is shown then;
// its token is traded at /human-check for a pass valid an hour, kept for the
// visit (sessionStorage) and sent with every ranked session request.
const PASS_KEY = 'wheelie_human_pass';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// Also the action the server expects in Cloudflare's answer.
const ACTION = 'ranked';

export class HumanCheckRequired extends Error {
    constructor(sitekey) {
        super('vérification anti-robot à faire');
        this.sitekey = sitekey;
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

// Shows the check over everything. Resolves 'passed' (pass stored),
// 'unranked' (play without ranking) or 'cancel' (back to the menu).
export function runHumanCheck({ sitekey, apiBase, apiFetch, onEvent = () => {} }) {
    const screen = document.getElementById('human-check-screen');
    const box = document.getElementById('human-check-box');
    const status = document.getElementById('human-check-status');
    const unranked = document.getElementById('human-check-unranked');
    const cancel = document.getElementById('human-check-cancel');
    if (!screen || !box) return Promise.resolve('unranked');

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
            unranked.onclick = null;
            cancel.onclick = null;
            screen.classList.remove('active');
            onEvent(result);
            resolve(result);
        };
        const onToken = async (token) => {
            setStatus('Vérification…');
            try {
                const response = await apiFetch(`${apiBase}/human-check`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                }, 12000);
                if (response.ok) {
                    const data = await response.json().catch(() => ({}));
                    storePass(data.human_pass || null);
                    finish('passed');
                    return;
                }
                onEvent(response.status === 403 ? 'refused' : 'unavailable');
                setStatus(response.status === 403
                    ? 'Vérification refusée. Réessaie.'
                    : 'Vérification indisponible pour le moment. Tu peux jouer sans classement.');
            } catch {
                onEvent('unavailable');
                setStatus('Serveur injoignable. Tu peux jouer sans classement.');
            }
            // Tokens are single use: a fresh box for the next try.
            if (!done && widgetId !== null) window.turnstile.reset(widgetId);
        };

        unranked.onclick = () => finish('unranked');
        cancel.onclick = () => finish('cancel');
        setStatus('');
        box.replaceChildren();
        screen.classList.add('active');
        loadTurnstile().then((turnstile) => {
            if (done) return;
            widgetId = turnstile.render(box, {
                sitekey,
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
