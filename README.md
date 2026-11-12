# Wheelie King - Banlieue Edition 🏍️

A 3D motocross wheelie game built with Three.js.

## Features
- **Realistic Physics**: Balance your bike with acceleration and gravity.
- **Urban Environment**: Ride through a detailed city with dynamic day-night cycles.
- **Tricks**: Perform wheelies and maintain balance for high scores.
- **Customization**: Rider with #51 jersey and backwards cap.
- **Voice commentary**: Optional French rider commentary generated with ElevenLabs.

## Controls
- **Arrow Up**: Accelerate
- **Arrow Down**: Brake
- **Arrow Left/Right**: Steer
- **Space + Arrow Up**: Wheelie (Pull back)

## Generate voice commentary

The game uses prerecorded ElevenLabs clips, so the API key is only needed on your
own machine during generation and is never sent to players or committed.

1. In ElevenLabs, choose a French-speaking youthful masculine voice, then create
   `.env.local` with your API key and that voice's ID:

   ```text
   ELEVENLABS_API_KEY=your_api_key
   ELEVENLABS_VOICE_ID=your_selected_voice_id
   ```

2. Run `npm run generate:voice`. This uses the current `eleven_v4` model by
   default; the optional `ELEVENLABS_MODEL_ID` setting in `.env.local` can
   override it.
3. Commit the generated MP3 files and `public/audio/manifest.json` so they ship
   with the game. Never commit `.env.local`.

## Tech Stack
- Three.js
- Vite
- Vanilla JavaScript
