# Wheelie King - Banlieue Edition 🏍️

A 3D motorcycle wheelie game built with Three.js.

## Features
- **Two versions, one game**: the realistic V2 and the original V1 look ship
  together and can be switched at any time (see below).
- **Wheelie physics**: balance the bike with throttle, brake and gravity.
- **Rider voice**: the rider reacts in French or English (ElevenLabs, voice
  "Young Jamal").
- **Layered sound**: engine with a simulated gearbox, wind, wet-road tyre hiss,
  city ambience, skids, landings, close passes, crashes.
- **Verified ranking**: ranked runs use a one-use API session and submit recorded
  controls; the server computes the leaderboard score.

## Controls
- **Arrow Up**: Accelerate
- **Arrow Down**: Brake
- **Arrow Left/Right**: Steer
- **Space + Arrow Up**: Wheelie (Pull back)

## Game versions

`Paramètres → Version du jeu` switches between:

- **Réaliste (V2)**, the default: golden-hour city with a wet road, a rebuilt
  articulated rider (#51 jersey), particles, crash sequence, new HUD and the
  rider's own voice.
- **Classique (V1)**: the original scenery, rider model, HUD and commentary.

The choice is stored on the device; `?version=classic` or `?version=v2` in the
URL forces it. Both versions run the exact same simulation, scoring and ranked
replay (`main.js`), so scores are comparable. Everything specific to V2 lives
in `src/v2/` and is only downloaded when V2 is selected:

| File | Role |
| --- | --- |
| `src/v2/textures.js` | Procedural textures (sky, wet road, facades, shops) |
| `src/v2/world.js` | Block variants (themes, side streets), materials, lights, LOD, pool, obstacles |
| `src/v2/geometry.js` | Batching: merged vertex-coloured meshes, two levels of detail |
| `src/v2/buildings.js` | Facades: windows, balconies, cornices, mansards, curtain walls, shop fronts |
| `src/v2/street.js` | Kerbs, parking bays, crossings, lamps, lights, furniture, terraces, baked shadows |
| `src/v2/vegetation.js` | Trees (skeleton + leaf cards), shrubs, hedges, flowers |
| `src/v2/cars.js` | Parked cars extruded from side profiles |
| `src/v2/cityatlas.js`, `citytextures.js` | Painted atlases: walls, windows, shops, signs, prints, decals, foliage |
| `src/v2/rider.js` | Bike and rider rig (51Wheling livery), IK, body language, suspension, crash |
| `src/v2/fx.js` | Spray, smoke and spark particles |
| `src/ui/ui.js`, `ui.css`, `icons.js` | V2 racing interface: menu, panels, HUD, touch controls, SVG icons |

V2 only changes what is drawn and heard. Do not change the physics constants
in `main.js` without updating the server replay (`wheelie_replay.py` in the
API), or ranked scores will stop matching.

## Ramps and tricks

From 20 s on, ramps appear on the road. Riding over the lip above 30 km/h
launches the bike; holding FIGURE (`F` on the keyboard, the purple pad on
phones) in the air scores points, and releasing it before landing adds a
bonus. Landing with the trick held is a crash. From 35 s on, tricks also work
on the ground, but touching any obstacle during one ends the run at once.
Ranked replays carry two extra flags for this (`0x20` takeoff, `0x40` trick);
the rules and constants (`JUMP` in `main.js`) are mirrored by the server.

## Generate character voice and sound effects

The game plays prerecorded ElevenLabs clips. Audio is generated locally and is
never requested from ElevenLabs by players.

1. Create `.env.local` with your API key and the character's voice ID:

   ```text
   ELEVENLABS_API_KEY=your_api_key
   ELEVENLABS_VOICE_ID=your_selected_voice_id
   ```

2. Edit the lines in `src/voice-lines.json` (`fr`, `en`) or the effect prompts
   in `src/sound-effects.json`, then run `npm run generate:audio`. Only new or
   changed entries are generated. To redo specific clips:
   `npm run generate:audio -- fr_start_1 skid --force`.
3. Commit the generated MP3 files and `public/audio/manifest.json` so they ship
   with the game. Never commit `.env.local`.

Speech uses `eleven_v4`; sound effects use `eleven_text_to_sound_v2`. Override
with `ELEVENLABS_MODEL_ID` and `ELEVENLABS_SFX_MODEL_ID`. When `ffmpeg` is
installed, voice lines and one-shot effects are trimmed and levelled; loops are
made seamless and levelled by the game when it loads them.

The `classic` group in `src/voice-lines.json` is the V1 commentary: those clips
are kept as they are and never regenerated.

## Tech Stack
- Three.js
- Vite
- Vanilla JavaScript
