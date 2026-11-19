// Centralized UI theme manager supporting instant, persistent switching between
// the original ('classic') and redesigned ('modern') UI without touching player data.

export const MODERN_UI_ENABLED = true;

const UI_VERSION_KEY = 'wheelie_ui_version';
const listeners = new Set();

function readStoredVersion() {
    try {
        const stored = localStorage.getItem(UI_VERSION_KEY);
        if (stored === 'classic' || stored === 'modern') return stored;
    } catch {
        // Storage unavailable (private browsing): fall back to default.
    }
    return null;
}

function readUrlOverride() {
    try {
        const param = new URLSearchParams(window.location.search).get('ui');
        if (param === 'classic' || param === 'modern') return param;
    } catch {
        // Ignore malformed URLs in constrained environments.
    }
    return null;
}

export function getUIVersion() {
    if (!MODERN_UI_ENABLED) return 'classic';
    return readUrlOverride() || readStoredVersion() || 'modern';
}

export const isModernUI = () => getUIVersion() === 'modern';

export function applyUITheme(version = getUIVersion()) {
    const resolved = !MODERN_UI_ENABLED ? 'classic' : (version === 'classic' ? 'classic' : 'modern');
    if (typeof window !== 'undefined') window.gameUIVersion = resolved;
    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.uiVersion = resolved;
        document.body.classList.toggle('ui-modern', resolved === 'modern');
        document.body.classList.toggle('ui-classic', resolved === 'classic');
    }
    return resolved;
}

export function setUIVersion(version) {
    const requested = version === 'classic' ? 'classic' : 'modern';
    const resolved = !MODERN_UI_ENABLED ? 'classic' : requested;
    try {
        localStorage.setItem(UI_VERSION_KEY, requested);
    } catch {
        // Keep preference in memory for this visit only.
    }
    applyUITheme(resolved);
    listeners.forEach((fn) => {
        try { fn(resolved); } catch (err) { console.error('UI theme listener error:', err); }
    });
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('wheelie:ui-version', { detail: { version: resolved } }));
    }
    return resolved;
}

export function initUITheme() {
    const resolved = getUIVersion();
    applyUITheme(resolved);
    return resolved;
}

export function subscribeUITheme(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
}
