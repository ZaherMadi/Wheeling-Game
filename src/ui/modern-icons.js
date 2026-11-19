// Metallic chrome SVG icon sprite for Modern UI (HUD Carbon Fiber 3D + Boutique 51).
// Symbols are injected once into document.body and referenced cleanly via <use>.

const GRADIENTS = `
  <defs>
    <linearGradient id="ui-m-chrome" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="35%" stop-color="#dce2eb"/>
      <stop offset="68%" stop-color="#7c8594"/>
      <stop offset="100%" stop-color="#edf1f7"/>
    </linearGradient>
    <linearGradient id="ui-m-steel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a1acc0"/>
      <stop offset="55%" stop-color="#4e586b"/>
      <stop offset="100%" stop-color="#1e2533"/>
    </linearGradient>
    <linearGradient id="ui-m-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="45%" stop-color="#f6c416"/>
      <stop offset="100%" stop-color="#c27a08"/>
    </linearGradient>
    <linearGradient id="ui-m-orange" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#c2410c"/>
      <stop offset="50%" stop-color="#ff8c1a"/>
      <stop offset="100%" stop-color="#fde047"/>
    </linearGradient>
    <linearGradient id="ui-m-violet" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#6b21a8"/>
      <stop offset="55%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#f0abfc"/>
    </linearGradient>
    <linearGradient id="ui-m-red" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff6b6b"/>
      <stop offset="50%" stop-color="#e53935"/>
      <stop offset="100%" stop-color="#8e1b18"/>
    </linearGradient>
    <linearGradient id="ui-m-silver" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="55%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>
    <linearGradient id="ui-m-gold-rich" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff4b8"/>
      <stop offset="28%" stop-color="#fbcf4a"/>
      <stop offset="68%" stop-color="#d49312"/>
      <stop offset="100%" stop-color="#7c4d06"/>
    </linearGradient>
    <linearGradient id="ui-m-obsidian" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#272c38"/>
      <stop offset="55%" stop-color="#11141c"/>
      <stop offset="100%" stop-color="#05070b"/>
    </linearGradient>
    <linearGradient id="ui-m-silver-coin" x1="0.15" y1="0.1" x2="0.85" y2="0.95">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="28%" stop-color="#e2e8f0"/>
      <stop offset="62%" stop-color="#94a3b8"/>
      <stop offset="86%" stop-color="#64748b"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
  </defs>
`;

const MODERN_ICONS = {
    // Gas: stacked metallic chevrons with golden speed edge (24x24)
    throttle: {
        box: '0 0 24 24',
        body: `
          <path d="M5.5 14.2 12 7.4l6.5 6.8-2.3 2.1L12 12l-4.2 4.3z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.9" stroke-linejoin="round"/>
          <path d="M6.5 19.6 12 13.8l5.5 5.8-2.1 1.8L12 17.8l-3.4 3.6z" fill="url(#ui-m-gold)" stroke="#0d1117" stroke-width="0.8" stroke-linejoin="round"/>
          <path d="M8 5.2 12 1.8l4 3.4" fill="none" stroke="url(#ui-m-gold)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
    },
    // Brake: drilled metallic rotor + red performance caliper (24x24)
    brake: {
        box: '0 0 24 24',
        body: `
          <circle cx="11.5" cy="12" r="8.2" fill="none" stroke="url(#ui-m-chrome)" stroke-width="2.6"/>
          <circle cx="11.5" cy="12" r="4.2" fill="url(#ui-m-steel)" stroke="#0d1117" stroke-width="0.8"/>
          <circle cx="11.5" cy="12" r="1.7" fill="#0d1117"/>
          <g fill="#0d1117">
            <circle cx="11.5" cy="6.2" r="0.65"/><circle cx="7.4" cy="7.9" r="0.65"/>
            <circle cx="5.7" cy="12" r="0.65"/><circle cx="7.4" cy="16.1" r="0.65"/>
            <circle cx="11.5" cy="17.8" r="0.65"/>
          </g>
          <path d="M15.8 4.4a8.8 8.8 0 0 1 4.6 7.8l-3 .6a5.8 5.8 0 0 0-3-5.2z" fill="url(#ui-m-red)" stroke="#0d1117" stroke-width="0.9" stroke-linejoin="round"/>`
    },
    // Boost: metallic lightning bolt with orange bevel accent (24x24)
    boost: {
        box: '0 0 24 24',
        body: `
          <path d="M14.2 2 5.2 13.4h5.6L9.4 22l9.4-11.8h-5.6z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.1" stroke-linejoin="round"/>
          <path d="M13.6 3.8 8.2 12.2h3.6l-.9 6.6 5.8-7.4h-3.6z" fill="url(#ui-m-orange)" opacity="0.82"/>`
    },
    // Pause: chamfered metallic bars (24x24)
    pause: {
        box: '0 0 24 24',
        body: `
          <rect x="6" y="4.5" width="4.4" height="15" rx="1.2" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.9"/>
          <rect x="13.6" y="4.5" width="4.4" height="15" rx="1.2" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.9"/>`
    },
    // Freestyle stunt icon matching public/icons/icone-figure.svg (120x120)
    trick: {
        box: '0 0 120 120',
        body: `
          <path d="M16 96c15-3 28-14 39-27-8 16-20 27-39 27z" fill="url(#ui-m-violet)" opacity="0.95"/>
          <path d="M24 100c14-1 26-8 34-18-10 8-22 14-34 18z" fill="url(#ui-m-violet)" opacity="0.55"/>
          <g stroke="#0d1117" stroke-width="2">
            <circle cx="46" cy="84" r="14.5" fill="url(#ui-m-steel)"/>
            <circle cx="46" cy="84" r="9.5" fill="#11161f"/>
            <circle cx="46" cy="84" r="4.5" fill="url(#ui-m-chrome)"/>
            <circle cx="96" cy="70" r="14.5" fill="url(#ui-m-steel)"/>
            <circle cx="96" cy="70" r="9.5" fill="#11161f"/>
            <circle cx="96" cy="70" r="4.5" fill="url(#ui-m-chrome)"/>
          </g>
          <path d="M46 84l17-6 12-16 14 2 7 6M75 62l-2-15 16-5 15 3-10 2" fill="none" stroke="url(#ui-m-chrome)" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M48 73l14-8 14-15 14 2-6 10-16 11z" fill="url(#ui-m-steel)" stroke="#0d1117" stroke-width="1.6"/>
          <path d="M52 67c8-4 18-8 28-14l-5-7c-10 3-20 8-29 14z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.5"/>
          <path d="M84 44l14-6c5 0 10 3 13 6-6-1-12 0-17 4z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.4"/>
          <path d="M77 45l-12-9c-6-4-14-4-21-2l-19-8-6 4 15 10c-2 2-1 5 2 6l-14 11 4 6 19-12c8-2 15-4 22-8l11 5z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="M62 24c4-5 12-6 16-2 3 3 3 8 0 11l-7 2-8-3c-2-2-2-5-1-8z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.7"/>
          <path d="M70 23l9-2-3 4z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.2"/>
          <path d="M71 26l6-1-1 5-6 1z" fill="#11161f"/>`
    },
    // Wheelie icon matching public/icons/icone-wheelie.svg (120x120)
    wheelie: {
        box: '0 0 120 120',
        body: `
          <path d="M18 100c22-4 46-5 72-1-24-2-48 0-72 5z" fill="url(#ui-m-orange)"/>
          <path d="M40 105c18-3 36-3 52 1-16-2-34-1-52 2z" fill="url(#ui-m-orange)" opacity="0.72"/>
          <g stroke="#0d1117" stroke-width="2">
            <circle cx="44" cy="86" r="15.5" fill="url(#ui-m-steel)"/>
            <circle cx="44" cy="86" r="10.2" fill="#11161f"/>
            <circle cx="44" cy="86" r="4.8" fill="url(#ui-m-chrome)"/>
            <circle cx="94" cy="48" r="15" fill="url(#ui-m-steel)"/>
            <circle cx="94" cy="48" r="9.8" fill="#11161f"/>
            <circle cx="94" cy="48" r="4.6" fill="url(#ui-m-chrome)"/>
          </g>
          <path d="M44 86l19-14 14-24 17 0" fill="none" stroke="url(#ui-m-chrome)" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M51 74l13-13 13-18 6 7-13 18-12 10z" fill="url(#ui-m-steel)" stroke="#0d1117" stroke-width="1.6"/>
          <path d="M23 73c12-4 24-8 38-17l13-14-7-5-16 14c-10 8-19 14-31 19z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.5"/>
          <path d="M77 32l12-10c6 1 11 4 14 9-6-2-12-1-17 3z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.4"/>
          <path d="M44 59c-4-7-3-16 1-23l13 2 14 1v6l-13 2-5 10 10 10-4 7-14-8z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="M55 68l10 11 9-1-6 6-14-3z" fill="url(#ui-m-steel)" stroke="#0d1117" stroke-width="1.3"/>
          <path d="M43 22c3-5 11-7 16-3 3 3 3 8 0 12l-8 2-8-3c-1-3-1-6 0-8z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.7"/>
          <path d="M52 21l9-2-3 4z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="1.2"/>
          <path d="M53 24l6-1-1 5-6 1z" fill="#11161f"/>`
    },
    back: {
        box: '0 0 24 24',
        body: '<path d="M16 4.5 7.5 12 16 19.5V15h-3.6L16 12l-3.6-3H16z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.9" stroke-linejoin="round"/>'
    },
    chevron: {
        box: '0 0 24 24',
        body: '<path d="M8 4.5 16.5 12 8 19.5V15h3.6L8 12l3.6-3H8z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.9" stroke-linejoin="round"/>'
    },
    user: {
        box: '0 0 24 24',
        body: '<circle cx="12" cy="8.2" r="3.6" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.8"/><path d="M5 20a7 7 0 0 1 14 0z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.9"/>'
    },
    jet: {
        box: '0 0 24 24',
        body: `
          <rect x="6.5" y="4.5" width="4.2" height="12" rx="1.6" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.8"/>
          <rect x="13.3" y="4.5" width="4.2" height="12" rx="1.6" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.8"/>
          <path d="M7.2 17.5 8.6 22l1.4-4.5M14 17.5 15.4 22l1.4-4.5" fill="url(#ui-m-orange)"/>`
    },
    // Boutique 51 UI icons
    basket: {
        box: '0 0 40 32',
        body: '<ellipse cx="20" cy="27.2" rx="12.5" ry="2.2" fill="#000000" fill-opacity="0.52"/>' +
            '<path d="M8.5 11.2h23l-3.1 13.8a1.4 1.4 0 0 1-1.36 1.08H12.96a1.4 1.4 0 0 1-1.36-1.08z" fill="#090b10"/>' +
            '<path d="M12.2 12.6C13.6 5.2 26.4 5.2 27.8 12.6" fill="none" stroke="url(#ui-m-gold-rich)" stroke-width="2.1" stroke-linecap="round"/>' +
            '<path d="M13.5 11.8C15.1 6.4 24.9 6.4 26.5 11.8" fill="none" stroke="#fff7cf" stroke-opacity="0.55" stroke-width="0.7" stroke-linecap="round"/>' +
            '<path d="M6.4 12.2L22.8 13.8l-1.9 11.9-11.9-1.7z" fill="url(#ui-m-obsidian)" stroke="url(#ui-m-gold-rich)" stroke-width="1.25" stroke-linejoin="round"/>' +
            '<path d="M22.8 13.8L33.4 11.4l-2.3 11.2-10.2 3.1z" fill="#080a0f" stroke="url(#ui-m-gold-rich)" stroke-width="1.2" stroke-linejoin="round"/>' +
            '<path d="M6.4 12.2L17.4 10l16 1.4-10.6 2.4z" fill="#131722" fill-opacity="0.88" stroke="url(#ui-m-gold-rich)" stroke-width="1.3" stroke-linejoin="round"/>' +
            '<path d="M7.3 15.8l14.9 1.3M8 19.3l13.6 1.2M8.7 22.6l12.4 1M10.4 12.7l1.9 11.6M14.3 13.1l1.4 11.7M18.4 13.5l0.9 11.8" fill="none" stroke="url(#ui-m-gold-rich)" stroke-width="0.85" stroke-opacity="0.92"/>' +
            '<path d="M22.4 16.9l10.2-2.2M21.9 20.1l9.8-2.3M21.4 23.1l9.4-2.5M26.2 13.1l-1.5 11.1M29.8 12.3l-1.9 10.9" fill="none" stroke="url(#ui-m-gold-rich)" stroke-width="0.82" stroke-opacity="0.8"/>' +
            '<path d="M12.9 12.4C14.8 4.4 25.4 4.4 27.3 12.4" fill="none" stroke="#181205" stroke-opacity="0.35" stroke-width="3.2" stroke-linecap="round"/>' +
            '<path d="M12.9 12.4C14.8 4.4 25.4 4.4 27.3 12.4" fill="none" stroke="url(#ui-m-gold-rich)" stroke-width="1.8" stroke-linecap="round"/>' +
            '<path d="M14.4 10.2c2.1-3.3 9.1-3.3 11.2 0" fill="none" stroke="#fff9d9" stroke-opacity="0.72" stroke-width="0.65" stroke-linecap="round"/>'
    },
    crown: {
        box: '0 0 24 24',
        body: '<path d="M3 18h18l-1.5-9.5-4.8 4-2.7-6-2.7 6-4.8-4z" fill="url(#ui-m-gold)" stroke="#1a1204" stroke-width="1" stroke-linejoin="round"/><rect x="4" y="19.2" width="16" height="2" rx="1" fill="url(#ui-m-gold)"/>'
    },
    coin: {
        box: '0 0 26 26',
        body: '<circle cx="13" cy="13.5" r="10.4" fill="#05070b" fill-opacity="0.55"/>' +
            '<circle cx="13" cy="13" r="10.4" fill="url(#ui-m-silver-coin)" stroke="#334155" stroke-width="0.95"/>' +
            '<circle cx="13" cy="13" r="8.2" fill="none" stroke="#475569" stroke-width="0.85"/>' +
            '<circle cx="13" cy="13" r="7.5" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="0.65"/>' +
            '<path d="M6.2 7.8A8.6 8.6 0 0 1 18.8 6.8" fill="none" stroke="#ffffff" stroke-opacity="0.78" stroke-width="1.15" stroke-linecap="round"/>' +
            '<text x="12.7" y="16.5" text-anchor="middle" font-family="system-ui,sans-serif" font-style="italic" font-size="9.4" font-weight="950" letter-spacing="-0.4" fill="#f8fafc" fill-opacity="0.65">51</text>' +
            '<text x="12.3" y="16" text-anchor="middle" font-family="system-ui,sans-serif" font-style="italic" font-size="9.4" font-weight="950" letter-spacing="-0.4" fill="#1e293b">51</text>'
    },
    tow: {
        box: '0 0 28 24',
        body: '<path d="M2.5 16.5h15.5l2.5-6.5h3.8a1.5 1.5 0 0 1 1.4 1v5.5h-2.2" fill="none" stroke="url(#ui-m-gold-rich)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M2 16.5h23.5v2H2z" fill="url(#ui-m-gold-rich)" stroke="#1a1204" stroke-width="0.55"/>' +
            '<path d="M5 14l5.8-6.2h5.2" fill="none" stroke="url(#ui-m-chrome)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M16 7.8c0 2-1.4 3.4-1.4 4.2a1.4 1.4 0 1 0 2.8 0" fill="none" stroke="url(#ui-m-gold-rich)" stroke-width="1.55" stroke-linecap="round"/>' +
            '<circle cx="7" cy="19.2" r="2.6" fill="#0f172a" stroke="url(#ui-m-chrome)" stroke-width="1.45"/>' +
            '<circle cx="21" cy="19.2" r="2.6" fill="#0f172a" stroke="url(#ui-m-chrome)" stroke-width="1.45"/>'
    },
    fastfwd: {
        box: '0 0 24 24',
        body: '<path d="M4.5 6.2L11.6 12l-7.1 5.8zM12.4 6.2L19.5 12l-7.1 5.8z" fill="url(#ui-m-gold-rich)" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.65" stroke-linejoin="round"/>'
    },
    'cat-characters': {
        box: '0 0 24 24',
        body: '<circle cx="12" cy="7.8" r="3.6" fill="url(#ui-m-gold)"/><path d="M5.2 20a6.8 6.8 0 0 1 13.6 0z" fill="url(#ui-m-chrome)"/>'
    },
    'cat-outfits': {
        box: '0 0 24 24',
        body: '<path d="M7.5 4h9L21 8.2l-2.6 2.8-1.9-1.5V20h-9V9.5L5.6 11 3 8.2z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.9" stroke-linejoin="round"/>'
    },
    'cat-cars': {
        box: '0 0 24 24',
        body: '<path d="M4.5 13.2 6.8 7.8h10.4l2.3 5.4H21v4.2h-2v1.3h-2.8v-1.3H7.8v1.3H5v-1.3H3v-4.2z" fill="url(#ui-m-chrome)" stroke="#0d1117" stroke-width="0.9" stroke-linejoin="round"/><circle cx="7.4" cy="14.8" r="1.4" fill="url(#ui-m-gold)"/><circle cx="16.6" cy="14.8" r="1.4" fill="url(#ui-m-gold)"/>'
    },
    'cat-music': {
        box: '0 0 24 24',
        body: '<circle cx="12" cy="12" r="9" fill="url(#ui-m-steel)" stroke="url(#ui-m-chrome)" stroke-width="1.2"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="0.9"/><circle cx="12" cy="12" r="2.6" fill="url(#ui-m-gold)"/><circle cx="12" cy="12" r="0.9" fill="#0d1117"/>'
    },
    'cat-extras': {
        box: '0 0 24 24',
        body: '<path d="M12 2.5 14.3 9l6.7 2.3-6.7 2.3L12 20.5l-2.3-6.9L3 11.3 9.7 9z" fill="url(#ui-m-gold)"/><path d="M18.6 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="url(#ui-m-chrome)"/>'
    },
    gift: {
        box: '0 0 24 24',
        body: '<rect x="3.5" y="10" width="17" height="10" rx="1.6" fill="url(#ui-m-red)" stroke="#111" stroke-width="0.9"/><rect x="2.5" y="7" width="19" height="3.6" rx="1.2" fill="url(#ui-m-gold)"/><rect x="10.6" y="7" width="2.8" height="13" fill="url(#ui-m-gold)"/><path d="M12 7c-2.8-3.4-5.5-2.6-4.5 0zm0 0c2.8-3.4 5.5-2.6 4.5 0z" fill="url(#ui-m-gold)"/>'
    },
    lock: {
        box: '0 0 24 24',
        body: '<path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke="url(#ui-m-chrome)" stroke-width="2" stroke-linecap="round"/><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2" fill="url(#ui-m-steel)" stroke="url(#ui-m-chrome)" stroke-width="1"/>'
    },
    check: {
        box: '0 0 24 24',
        body: '<path d="M5 12.6 9.6 17 19 7.2" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'
    },
    close: {
        box: '0 0 24 24',
        body: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
    }
};

let installed = false;

export function installModernIcons() {
    if (installed || typeof document === 'undefined' || !document.body) return;
    installed = true;
    const symbols = Object.entries(MODERN_ICONS)
        .map(([name, def]) => `<symbol id="ui-m-${name}" viewBox="${def.box}">${def.body}</symbol>`)
        .join('');
    const sprite = document.createElement('div');
    sprite.id = 'ui-modern-sprite';
    sprite.setAttribute('aria-hidden', 'true');
    sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    sprite.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${GRADIENTS}${symbols}</svg>`;
    document.body.prepend(sprite);
}

export function modernIcon(name, className = 'ui-icon ui-icon--modern') {
    if (typeof document !== 'undefined' && !installed && document.body) installModernIcons();
    return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#ui-m-${name}"/></svg>`;
}
