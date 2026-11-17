// Custom controls: the touch pads where the player wants them, each at its
// own size. Saved on this device (fractions of the screen, so a turned
// phone keeps them in place). Edited on an overlay: drag a pad to move it,
// touch it to pick it, then its size on the slider.
const KEY = 'wheelie_pad_layout';
export const PADS = [
    { id: 'analog-stick-container', label: 'Joystick' },
    { id: 'analog-gas', label: 'Gaz' },
    { id: 'analog-brake', label: 'Frein' },
    { id: 'analog-wheelie', label: 'Wheelie' },
    { id: 'analog-trick', label: 'Figure' },
    { id: 'analog-boost', label: 'Boost' }
];
const SIZE = { min: 0.6, max: 1.6 };
const PROPS = ['position', 'left', 'top', 'right', 'bottom', 'transform', 'animation'];

function load() {
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
        return stored && typeof stored === 'object' ? stored : {};
    } catch {
        return {};
    }
}

function save(layout) {
    try {
        localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
        // Kept for this visit.
    }
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function place(element, spot) {
    element.style.setProperty('position', 'fixed', 'important');
    element.style.setProperty('left', `${(spot.x * 100).toFixed(2)}%`, 'important');
    element.style.setProperty('top', `${(spot.y * 100).toFixed(2)}%`, 'important');
    element.style.setProperty('right', 'auto', 'important');
    element.style.setProperty('bottom', 'auto', 'important');
    element.style.setProperty('transform', `translate(-50%, -50%) scale(${spot.s})`, 'important');
    element.style.setProperty('animation', 'none', 'important');
}

function unplace(element) {
    PROPS.forEach((prop) => element.style.removeProperty(prop));
}

// on: the custom layout (custom controls), else the usual places.
export function applyPadLayout(on) {
    const layout = on ? load() : {};
    for (const { id } of PADS) {
        const element = document.getElementById(id);
        if (!element) continue;
        unplace(element);
        if (layout[id]) place(element, layout[id]);
    }
}

// Where a pad is now, as a spot (its centre on the screen, its size).
function spotOf(element, layout, id) {
    if (layout[id]) return { ...layout[id] };
    const box = element.getBoundingClientRect();
    return {
        x: (box.left + box.width / 2) / window.innerWidth,
        y: (box.top + box.height / 2) / window.innerHeight,
        s: 1
    };
}

// onClose(): back to the settings. The pads are shown (even on a
// computer) while editing, then put back as they were.
export function openPadEditor({ onClose = () => {} } = {}) {
    const mobile = document.getElementById('mobile-controls');
    const analog = document.getElementById('analog-controls');
    const before = { mobile: mobile?.style.display, analog: analog?.style.display };
    const hidden = new Map();
    if (mobile) mobile.style.display = 'block';
    if (analog) analog.style.display = 'block';
    document.body.classList.add('pad-editing');
    const layout = load();
    const pads = PADS.map(({ id, label }) => ({ id, label, element: document.getElementById(id) })).filter((pad) => pad.element);
    for (const pad of pads) {
        hidden.set(pad.id, pad.element.hidden);
        pad.element.hidden = false;
        pad.element.style.removeProperty('display');
        layout[pad.id] = spotOf(pad.element, layout, pad.id);
        place(pad.element, layout[pad.id]);
    }

    const editor = document.createElement('div');
    editor.id = 'pad-editor';
    editor.innerHTML = `
        <div class="pad-editor__bar" role="dialog" aria-label="Personnaliser les touches">
            <p class="pad-editor__title">PERSONNALISER LES TOUCHES</p>
            <p class="pad-editor__hint">Glisse un bouton pour le placer · touche-le puis règle sa taille</p>
            <label class="pad-editor__size"><span class="pad-editor__name">Choisis un bouton</span>
                <input type="range" min="${SIZE.min * 100}" max="${SIZE.max * 100}" step="5" value="100" disabled aria-label="Taille du bouton">
                <output>100 %</output></label>
            <div class="pad-editor__actions">
                <button type="button" class="pad-editor__reset">RÉINITIALISER</button>
                <button type="button" class="pad-editor__done">TERMINÉ</button>
            </div>
        </div>`;
    document.body.append(editor);
    const slider = editor.querySelector('input');
    const output = editor.querySelector('output');
    const name = editor.querySelector('.pad-editor__name');
    let selected = null;
    const select = (pad) => {
        selected = pad;
        pads.forEach((other) => other.element.classList.toggle('is-picked', other === pad));
        name.textContent = pad.label;
        slider.disabled = false;
        slider.value = String(Math.round(layout[pad.id].s * 100));
        output.textContent = `${slider.value} %`;
    };
    slider.addEventListener('input', () => {
        if (!selected) return;
        layout[selected.id].s = clamp(Number(slider.value) / 100, SIZE.min, SIZE.max);
        output.textContent = `${slider.value} %`;
        place(selected.element, layout[selected.id]);
        save(layout);
    });

    // Dragging: caught before the pads' own handlers (no input to the game).
    let drag = null;
    const down = (event) => {
        const pad = pads.find((item) => item.element.contains(event.target));
        if (!pad) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        select(pad);
        const spot = layout[pad.id];
        drag = { pad, id: event.pointerId, dx: spot.x * window.innerWidth - event.clientX, dy: spot.y * window.innerHeight - event.clientY };
    };
    const move = (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const spot = layout[drag.pad.id];
        spot.x = clamp((event.clientX + drag.dx) / window.innerWidth, 0.04, 0.96);
        spot.y = clamp((event.clientY + drag.dy) / window.innerHeight, 0.08, 0.96);
        place(drag.pad.element, spot);
    };
    const up = (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        event.stopImmediatePropagation();
        drag = null;
        save(layout);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);

    editor.querySelector('.pad-editor__reset').addEventListener('click', () => {
        try {
            localStorage.removeItem(KEY);
        } catch {
            // Nothing kept anyway.
        }
        for (const pad of pads) unplace(pad.element);
        for (const pad of pads) {
            delete layout[pad.id];
            layout[pad.id] = spotOf(pad.element, {}, pad.id);
            place(pad.element, layout[pad.id]);
        }
        if (selected) select(selected);
    });
    editor.querySelector('.pad-editor__done').addEventListener('click', () => {
        save(layout);
        window.removeEventListener('pointerdown', down, true);
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        editor.remove();
        document.body.classList.remove('pad-editing');
        for (const pad of pads) {
            pad.element.classList.remove('is-picked');
            pad.element.hidden = hidden.get(pad.id);
        }
        if (mobile) mobile.style.display = before.mobile ?? '';
        if (analog) analog.style.display = before.analog ?? '';
        onClose();
    });
}
