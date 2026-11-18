// Words written as with a fountain pen: the ink comes letter by letter at a
// writing pace (a pause between words), the nib follows the line, the fresh
// ink shines a moment behind it and dries. Love&Faith event (love.js).
export const INK_FONT = 'Parisienne';

const PACE = { letter: 0.07, space: 0.17, mark: 0.14 };
const NIB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21l3.6-9.4L15.4 2.8a2 2 0 0 1 2.8 0l3 3a2 2 0 0 1 0 2.8L12.4 17.4 3 21z" fill="currentColor"/><path d="M6.6 11.6l5.8 5.8M3 21l5.6-5.6" stroke="#0b0b0b" stroke-width="1.2" fill="none"/></svg>';

let measureCtx = null;
function measure(text, size) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `${size}px "${INK_FONT}", cursive`;
    const widths = [0];
    for (let i = 1; i <= text.length; i++) widths.push(measureCtx.measureText(text.slice(0, i)).width);
    return widths;
}

// When each letter is written (seconds from the start).
function timing(text) {
    const at = [0];
    let t = 0;
    for (const char of text) {
        t += char === ' ' ? PACE.space : /[.,!?…'’]/.test(char) ? PACE.mark : PACE.letter * (0.8 + Math.random() * 0.45);
        at.push(t);
    }
    return at;
}

export function createInk(layer) {
    const fontReady = document.fonts?.load ? document.fonts.load(`40px "${INK_FONT}"`).catch(() => null) : Promise.resolve();
    const live = new Set();

    // tone: 'love' (red ink on a card), 'sad' (dark ink, greyed card),
    // 'thought' (a bubble, white ink); place: { x, y } in pixels or a
    // function giving it each frame; hold: seconds once written.
    function write(text, { tone = 'love', size = 34, place = null, hold = 1.4, className = '' } = {}) {
        const note = document.createElement('div');
        note.className = `ink ink--${tone} ${className}`;
        note.innerHTML = `<div class="ink__line"><span class="ink__dry"></span><span class="ink__wet"></span></div><i class="ink__nib">${NIB}</i>`;
        const line = note.querySelector('.ink__line');
        note.querySelector('.ink__dry').textContent = text;
        note.querySelector('.ink__wet').textContent = text;
        note.style.setProperty('--ink-size', `${size}px`);
        layer.append(note);
        const entry = { note, line, text, place, start: 0, widths: null, at: timing(text), hold, done: null, ended: false };
        let finish;
        entry.done = new Promise((resolve) => { finish = resolve; });
        entry.finish = finish;
        live.add(entry);
        fontReady.then(() => {
            entry.widths = measure(text, size);
            note.style.setProperty('--ink-width', `${Math.ceil(entry.widths[entry.widths.length - 1]) + 8}px`);
            entry.start = performance.now() / 1000;
            note.classList.add('is-on');
        });
        return entry;
    }

    // Each frame: the pen moves on, the bubbles follow what they point at.
    function update() {
        const now = performance.now() / 1000;
        for (const entry of live) {
            const { note, line, widths, at, text } = entry;
            if (entry.place) {
                const p = typeof entry.place === 'function' ? entry.place() : entry.place;
                if (p) note.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
            }
            if (!widths) continue;
            const t = now - entry.start;
            const total = at[at.length - 1];
            let index = at.findIndex((time) => time > t);
            if (index === -1) index = at.length - 1;
            const a = at[Math.max(0, index - 1)];
            const b = at[index];
            const k = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 1;
            const x = widths[Math.max(0, index - 1)] + (widths[index] - widths[Math.max(0, index - 1)]) * k;
            const writing = t < total;
            line.style.setProperty('--ink-x', `${x.toFixed(1)}px`);
            // The nib: on the line, its tip bobbing as the letters go up and down.
            note.style.setProperty('--nib-x', `${x.toFixed(1)}px`);
            note.style.setProperty('--nib-y', `${(Math.sin(t * 38) * 0.18 + Math.sin(t * 13) * 0.12).toFixed(3)}em`);
            note.classList.toggle('is-writing', writing);
            if (!writing && !entry.ended && t > total + entry.hold) {
                entry.ended = true;
                note.classList.add('is-gone');
                setTimeout(() => {
                    note.remove();
                    live.delete(entry);
                    entry.finish();
                }, 650);
            }
            if (text.length === 0) entry.ended = true;
        }
    }

    function clear() {
        for (const entry of live) {
            entry.note.remove();
            entry.finish();
        }
        live.clear();
    }

    return { write, update, clear, get count() { return live.size; } };
}
