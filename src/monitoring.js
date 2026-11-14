// Sentry for the game: every uncaught error, plus the situations worth
// knowing about even when the game carries on (a run that could not be
// ranked, a score the server refused, a missing asset, a lost WebGL
// context, a frame rate that stays low...). Each report has a kind (tag
// "kind") and a description, sent in the "description" context.
//
// Off on a local address unless ?sentry=1 (tests do not reach Sentry).
import * as Sentry from '@sentry/browser';

const DSN = import.meta.env.VITE_SENTRY_DSN
    || 'https://28222afca23ba878004f0961d128a7ef@o4511532022038528.ingest.de.sentry.io/4512427587928144';
const API_ORIGIN = 'https://51-games-api.vercel.app';

export const KINDS = {
    unhandled: 'Erreur JavaScript non gérée dans le jeu.',
    'ranking.unranked': 'Une partie compétitive (30 points ou plus) a fini sans être classée. La raison est dans le message et dans « details ».',
    'ranking.rejected': 'Le serveur a refusé un score classé. Si un joueur normal tombe dessus, le jeu (main.js) et le serveur (wheelie_replay.py) ne calculent plus le score de la même façon.',
    'ranking.submit_failed': 'Le score n’a pas pu être envoyé après 3 essais (réseau ou serveur en panne). Il est gardé et renvoyé à la partie suivante.',
    'ranking.session': 'Impossible d’ouvrir une session classée au départ d’une partie (serveur lent, en erreur ou injoignable).',
    'ranking.rate_limited': 'Le serveur a refusé une session : trop de parties lancées depuis la même adresse en 5 minutes.',
    'ranking.leaderboard': 'Le classement n’a pas pu être chargé.',
    'ranking.player': 'Les statistiques d’un joueur ou le changement d’apparence du pseudo ont échoué.',
    'voice.player': 'La voix du pseudo du joueur (ElevenLabs, côté serveur) n’a pas pu être récupérée ou générée.',
    'asset.audio': 'Des sons ou des voix du jeu n’ont pas pu être chargés ou décodés.',
    'asset.model': 'Le modèle 3D de la moto n’a pas pu être chargé (le jeu tourne avec une moto de secours).',
    'asset.data': 'Un fichier de données du jeu (graffitis...) n’a pas pu être chargé.',
    'asset.video': 'La vidéo 5HC de l’abribus n’a pas pu être lue.',
    'asset.image': 'Une image du jeu (logo des abribus sponsorisés...) n’a pas pu être chargée.',
    'render.webgl_lost': 'Le navigateur a perdu le contexte WebGL (mémoire graphique saturée, onglet en arrière-plan) : l’image du jeu se fige.',
    'performance.low_fps': 'Le jeu tourne sous 25 images par seconde pendant plus de 10 secondes sur cet appareil.',
    'storage.unavailable': 'Le stockage local du navigateur est indisponible (navigation privée, quota) : pseudo, réglages ou score en attente ne sont pas gardés.',
    feedback: 'Un joueur a signalé un problème depuis les Paramètres.',
};

let enabled = false;
let snapshot = null;
const sentOnce = new Set();

function isLocal() {
    return /^(localhost|127\.0\.0\.1|\[::1\]|.*\.local(host)?)$/.test(location.hostname);
}

function environment() {
    if (isLocal()) return 'development';
    if (/(^|\.)51games\.fr$/.test(location.hostname)) return 'production';
    return 'preview';
}

export function initMonitoring() {
    let forced = false;
    try {
        forced = new URLSearchParams(location.search).get('sentry') === '1';
    } catch {
        forced = false;
    }
    if (!DSN || (isLocal() && !forced)) return;
    const env = environment();
    // Session Replay is costly on phones: kept for computers, and only
    // around an error.
    const desktop = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
    const integrations = [
        Sentry.browserTracingIntegration(),
        Sentry.feedbackIntegration({
            autoInject: false,
            colorScheme: 'dark',
            showBranding: false,
            formTitle: 'Signaler un problème',
            submitButtonLabel: 'Envoyer',
            cancelButtonLabel: 'Annuler',
            nameLabel: 'Pseudo',
            namePlaceholder: 'Ton pseudo',
            emailLabel: 'E-mail',
            emailPlaceholder: 'ton@email.fr (facultatif)',
            isRequiredLabel: '(obligatoire)',
            messageLabel: 'Que s’est-il passé ?',
            messagePlaceholder: 'Ex. : mon score de 1463 n’a pas été classé',
            successMessageText: 'Merci, c’est envoyé !',
            showEmail: true,
            isEmailRequired: false,
        }),
    ];
    if (desktop) integrations.push(Sentry.replayIntegration());
    Sentry.init({
        dsn: DSN,
        // ?sentry=1 on a local address: Sentry explains itself in the console.
        debug: forced && isLocal(),
        environment: env,
        release: typeof __SENTRY_RELEASE__ === 'string' ? __SENTRY_RELEASE__ : undefined,
        integrations,
        tracesSampleRate: env === 'production' ? 0.1 : 1.0,
        // The ranking API: its traces join the game's.
        tracePropagationTargets: [API_ORIGIN, /^\/(?!\/)/],
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: desktop ? 1.0 : 0,
        enableLogs: true,
        sendDefaultPii: false,
        // Browser extensions and the browser's own noise.
        denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari(-web)?-extension:\/\//],
        ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications'],
        beforeSend(event) {
            const tags = (event.tags = event.tags || {});
            if (!tags.kind) tags.kind = event.type === 'feedback' ? 'feedback' : 'unhandled';
            event.contexts = event.contexts || {};
            event.contexts.description = { kind: tags.kind, text: KINDS[tags.kind] || '' };
            if (snapshot) {
                try {
                    event.contexts.partie = snapshot();
                } catch {
                    // The game state is half built: send without it.
                }
            }
            return event;
        },
    });
    enabled = true;
}

// What the game is doing, added to every report (called when one is sent).
export function setGameSnapshot(fn) {
    snapshot = fn;
}

export function setPlayer(nickname) {
    if (!enabled) return;
    Sentry.setUser(nickname ? { username: nickname } : null);
}

export function setGameTags(tags) {
    if (!enabled) return;
    Sentry.setTags(tags);
}

// A notable situation: one issue per kind (and per group when given).
export function report(kind, message, { level = 'warning', details, group, once = false } = {}) {
    if (!enabled) return;
    const key = `${kind}|${group || ''}`;
    if (once && sentOnce.has(key)) return;
    sentOnce.add(key);
    Sentry.withScope((scope) => {
        scope.setTag('kind', kind);
        scope.setLevel(level);
        scope.setFingerprint(group ? [kind, String(group)] : [kind]);
        if (details) scope.setContext('details', details);
        Sentry.captureMessage(message);
    });
}

export function reportError(kind, error, { details, once = false } = {}) {
    if (!enabled) return;
    if (once && sentOnce.has(kind)) return;
    sentOnce.add(kind);
    Sentry.withScope((scope) => {
        scope.setTag('kind', kind);
        if (details) scope.setContext('details', details);
        Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
}

// A line in Sentry's Logs (searchable), not an issue.
export function logEvent(message, attributes = {}) {
    if (!enabled) return;
    try {
        Sentry.logger.info(message, attributes);
    } catch {
        // Logs unavailable: nothing to do.
    }
}

// The player's own report (Paramètres › Signaler un problème).
export async function openFeedback() {
    if (!enabled) return false;
    const feedback = Sentry.getFeedback();
    if (!feedback) return false;
    const form = await feedback.createForm();
    form.appendToDom();
    form.open();
    return true;
}

export function monitoringEnabled() {
    return enabled;
}

// Low frame rate for more than 10 s in a row: reported once per visit.
let slowSince = 0;
let frames = 0;
let windowStart = 0;
export function trackFrame(now, extra) {
    if (!enabled) return;
    if (!windowStart) windowStart = now;
    frames++;
    const span = now - windowStart;
    if (span < 2000) return;
    const fps = (frames * 1000) / span;
    frames = 0;
    windowStart = now;
    if (document.hidden || fps >= 25) {
        slowSince = 0;
        return;
    }
    if (!slowSince) slowSince = now;
    else if (now - slowSince > 10000) {
        report('performance.low_fps', `Jeu lent : ${Math.round(fps)} images/s`, {
            level: 'info', once: true, details: { fps: Math.round(fps), ...(extra ? extra() : {}) },
        });
    }
}

initMonitoring();
