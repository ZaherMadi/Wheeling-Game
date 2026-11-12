import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'public', 'audio');
const sourcePath = path.join(root, 'src', 'voice-lines.json');
const manifestPath = path.join(outputDirectory, 'manifest.json');
const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_v4';

if (!apiKey || !voiceId) {
  throw new Error('Configure ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.local before generating voice clips.');
}

const lineGroups = JSON.parse(await readFile(sourcePath, 'utf8'));
const previousManifest = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, 'utf8'))
  : { available: [], hashes: {} };
const hashes = { ...previousManifest.hashes };
const available = new Set(previousManifest.available);

await mkdir(outputDirectory, { recursive: true });

for (const lines of Object.values(lineGroups)) {
  for (const { id, text } of lines) {
    const hash = createHash('sha256').update(`${modelId}\0${voiceId}\0${text}`).digest('hex');
    const outputPath = path.join(outputDirectory, `${id}.mp3`);

    if (hashes[id] === hash && existsSync(outputPath)) continue;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg'
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          language_code: 'fr',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.25,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`ElevenLabs failed for "${id}" (${response.status}): ${details}`);
    }

    const temporaryPath = `${outputPath}.tmp`;
    await writeFile(temporaryPath, Buffer.from(await response.arrayBuffer()));
    await rename(temporaryPath, outputPath);
    hashes[id] = hash;
    available.add(id);
    console.log(`Generated ${id}`);
  }
}

await writeFile(
  manifestPath,
  `${JSON.stringify({ available: [...available], hashes }, null, 2)}\n`
);
