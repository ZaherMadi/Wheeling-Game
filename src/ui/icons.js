// SVG icon set for the interface. Drawn on a 24 x 24 grid with round 2 px
// strokes in currentColor, so CSS sets their colour and glow.
const ICONS = {
    play: '<path d="M8 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/><circle cx="12" cy="12" r="6.6"/>',
    trophy: '<path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3 4M16.5 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M9.5 17h5"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/>',
    back: '<path d="M19 12H6M11 6l-6 6 6 6"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    throttle: '<path d="M13.5 2.5 5 13.5h6l-1.5 8 9-11.5h-6z" fill="currentColor" stroke-linejoin="round"/>',
    brake: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 4a8 8 0 0 1 7.6 5.5" stroke-width="4" opacity=".75"/>',
    wheelie: '<circle cx="6.5" cy="17" r="3.5"/><circle cx="16" cy="7.5" r="3.5"/><path d="M6.5 17l4.5-4 4-1.5 1-4M11 13l3.5 1.5M9.5 9.5l3 1"/>',
    trick: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/><path d="M12 8.5l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="currentColor" stroke-width="1"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h13l-2.5 4L18 12H5" fill="currentColor" fill-opacity=".18"/><path d="M9 4v8M13 4v8M5 8h13"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor" fill-opacity=".25"/>',
    gamepad: '<path d="M7 8h10a4 4 0 0 1 4 4v1.5a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.3A3 3 0 0 1 3 13.5V12a4 4 0 0 1 4-4z"/><path d="M7.5 10.5v3M6 12h3"/><circle cx="16" cy="11" r=".6" fill="currentColor"/><circle cx="17.5" cy="13" r=".6" fill="currentColor"/>',
    sliders: '<path d="M5 4v16M12 4v16M19 4v16"/><rect x="3" y="13" width="4" height="3" rx="1" fill="currentColor"/><rect x="10" y="7" width="4" height="3" rx="1" fill="currentColor"/><rect x="17" y="15" width="4" height="3" rx="1" fill="currentColor"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    layers: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 13l9 4.5 9-4.5"/>',
    replay: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4v4.5h4.5"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    helmet: '<path d="M4 15a8 8 0 0 1 16-2v4H9.5a2 2 0 0 1-2-2H4z"/><path d="M12 13h8"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    rotate: '<path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M18 3v4h-4M6 21v-4h4"/>'
};

let installed = false;

// Puts the symbols in the page once; icons then reference them with <use>.
export function installIcons() {
    if (installed) return;
    installed = true;
    const symbols = Object.entries(ICONS).map(([name, body]) =>
        `<symbol id="ui-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`
    ).join('');
    const sprite = document.createElement('div');
    sprite.setAttribute('aria-hidden', 'true');
    sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    sprite.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${symbols}</svg>`;
    document.body.prepend(sprite);
}

export function icon(name, className = 'ui-icon') {
    return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#ui-${name}"/></svg>`;
}
