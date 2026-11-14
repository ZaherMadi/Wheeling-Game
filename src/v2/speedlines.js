// Speed lines: thin streaks rushing out from the middle of the screen, drawn
// on a 2D overlay only while going fast (free roam above ~95 km/h, boosts).
export function createSpeedLines() {
    const canvas = document.createElement('canvas');
    canvas.id = 'speed-lines';
    Object.assign(canvas.style, {
        position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '5'
    });
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    const streaks = Array.from({ length: 46 }, () => ({ angle: 0, distance: 0, speed: 0, length: 0 }));
    const reset = (streak, spread = true) => {
        streak.angle = Math.random() * Math.PI * 2;
        streak.distance = spread ? 0.15 + Math.random() * 0.8 : 0.15 + Math.random() * 0.1;
        streak.speed = 0.9 + Math.random() * 1.4;
        streak.length = 0.05 + Math.random() * 0.12;
    };
    streaks.forEach((streak) => reset(streak));
    let level = 0;
    let shown = false;

    function update(dt, intensity) {
        level += (intensity - level) * Math.min(1, dt * 4);
        if (level < 0.02) {
            if (shown) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                shown = false;
            }
            return;
        }
        const width = Math.floor(window.innerWidth * Math.min(1.5, window.devicePixelRatio || 1));
        const height = Math.floor(window.innerHeight * Math.min(1.5, window.devicePixelRatio || 1));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        shown = true;
        ctx.clearRect(0, 0, width, height);
        const cx = width / 2;
        const cy = height * 0.45;
        const reach = Math.hypot(width, height) * 0.55;
        ctx.lineCap = 'round';
        for (const streak of streaks) {
            streak.distance += streak.speed * dt * (0.6 + level * 1.4);
            if (streak.distance > 1.1) reset(streak, false);
            const inner = streak.distance * reach;
            const outer = (streak.distance + streak.length * (0.6 + level)) * reach;
            const cos = Math.cos(streak.angle);
            const sin = Math.sin(streak.angle);
            // Fainter near the middle (where the bike is), stronger at the edges.
            const alpha = level * 0.5 * Math.min(1, Math.max(0, (streak.distance - 0.25) * 2.2));
            if (alpha <= 0.01) continue;
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 1 + streak.distance * 2.2;
            ctx.beginPath();
            ctx.moveTo(cx + cos * inner, cy + sin * inner * 0.75);
            ctx.lineTo(cx + cos * outer, cy + sin * outer * 0.75);
            ctx.stroke();
        }
    }

    function hide() {
        level = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        shown = false;
    }

    return { update, hide };
}
