// Catalog and procedural vinyl sleeve + record artwork for the anasheed shop tracks.

export const NASHEED_TRACKS = [
    {
        id: 'music:victory-march',
        slug: 'victory-march',
        title: 'Victory March',
        artist: 'Anasheed · 51 Editions',
        mood: 'Triomphal',
        price: 150000,
        tagline: 'Marche héroïque, idéale pour lancer le run.',
        palette: ['#f59e0b', '#7c2d12', '#fef08a']
    },
    {
        id: 'music:steady-motivation',
        slug: 'steady-motivation',
        title: 'Steady Motivation',
        artist: 'Anasheed · 51 Editions',
        mood: 'Rythme régulier',
        price: 150000,
        tagline: 'Tempo constant pour enchaîner les wheelings.',
        palette: ['#38bdf8', '#0c4a6e', '#bae6fd']
    },
    {
        id: 'music:peaceful-contemplation',
        slug: 'peaceful-contemplation',
        title: 'Peaceful Contemplation',
        artist: 'Anasheed · 51 Editions',
        mood: 'Apaisant',
        price: 180000,
        tagline: 'Atmosphère claire et posée pour le mode libre.',
        palette: ['#34d399', '#064e3b', '#a7f3d0']
    },
    {
        id: 'music:gentle-reflection',
        slug: 'gentle-reflection',
        title: 'Gentle Reflection',
        artist: 'Anasheed · 51 Editions',
        mood: 'Mélodique',
        price: 180000,
        tagline: 'Chœurs doux avec nappes profondes.',
        palette: ['#c084fc', '#4c1d95', '#e9d5ff']
    },
    {
        id: 'music:focused-determination',
        slug: 'focused-determination',
        title: 'Focused Determination',
        artist: 'Anasheed · 51 Editions',
        mood: 'Intense',
        price: 220000,
        tagline: 'Concentration maximale pour la compétition.',
        palette: ['#fb7185', '#881337', '#fecdd3']
    }
];

export const trackSrc = (slug) => `/event/love/music/${slug}.mp3`;

// Generates a vinyl-record disc SVG (spin-friendly in the UI).
export function createVinylDiscUrl(track) {
    const [primary, deep, light] = track.palette || ['#f6c416', '#18181b', '#fef08a'];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <radialGradient id="vg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#22252f"/>
          <stop offset="55%" stop-color="#0d0e13"/>
          <stop offset="100%" stop-color="#191c26"/>
        </radialGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
          <stop offset="45%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="100%" stop-color="${primary}" stop-opacity="0.18"/>
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r="76" fill="url(#vg)" stroke="#2e3240" stroke-width="2"/>
      <circle cx="80" cy="80" r="68" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      <circle cx="80" cy="80" r="59" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <circle cx="80" cy="80" r="50" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      <circle cx="80" cy="80" r="41" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <circle cx="80" cy="80" r="74" fill="url(#shine)"/>
      <circle cx="80" cy="80" r="28" fill="${primary}" stroke="${deep}" stroke-width="3"/>
      <circle cx="80" cy="80" r="21" fill="none" stroke="${light}" stroke-opacity="0.5" stroke-width="1.2"/>
      <path d="M80 56a24 24 0 0 1 20.8 12" fill="none" stroke="${deep}" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="80" cy="80" r="5.5" fill="#090a0f" stroke="${light}" stroke-width="1.4"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Generates a stylized square sleeve + peeking vinyl cover data URL for cards.
export function createVinylCoverUrl(track) {
    const [primary, deep, light] = track.palette || ['#f6c416', '#18181b', '#fef08a'];
    const label = track.title.split(' ').slice(0, 2).join(' ').replace(/&/g, '&amp;');
    const mood = (track.mood || 'Anasheed').replace(/&/g, '&amp;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 176">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${deep}"/>
          <stop offset="65%" stop-color="#11131a"/>
          <stop offset="100%" stop-color="${primary}" stop-opacity="0.72"/>
        </linearGradient>
        <radialGradient id="vinyl" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#22252f"/>
          <stop offset="65%" stop-color="#0b0c10"/>
          <stop offset="100%" stop-color="#1b1e28"/>
        </radialGradient>
      </defs>
      <!-- Peeking vinyl record -->
      <circle cx="152" cy="88" r="62" fill="url(#vinyl)" stroke="#2e3342" stroke-width="2"/>
      <circle cx="152" cy="88" r="52" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>
      <circle cx="152" cy="88" r="42" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
      <circle cx="152" cy="88" r="32" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>
      <circle cx="152" cy="88" r="22" fill="${primary}" stroke="${deep}" stroke-width="2.5"/>
      <circle cx="152" cy="88" r="5" fill="#0b0c10"/>
      <!-- Album sleeve -->
      <rect x="8" y="10" width="144" height="156" rx="14" fill="url(#bg)" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>
      <circle cx="80" cy="72" r="38" fill="none" stroke="${primary}" stroke-opacity="0.55" stroke-width="2"/>
      <polygon points="80,40 107,72 80,104 53,72" fill="none" stroke="${light}" stroke-opacity="0.65" stroke-width="1.6"/>
      <circle cx="80" cy="72" r="14" fill="${primary}" fill-opacity="0.25" stroke="${light}" stroke-width="1.5"/>
      <text x="20" y="30" fill="${light}" font-family="system-ui,Segoe UI,sans-serif" font-size="9.5" font-weight="800" letter-spacing="1.6">51 VINYLE · ${mood.toUpperCase()}</text>
      <text x="20" y="142" fill="#ffffff" font-family="system-ui,Segoe UI,sans-serif" font-size="12.5" font-weight="800">${label}</text>
      <rect x="20" y="150" width="44" height="3" rx="1.5" fill="${primary}"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
