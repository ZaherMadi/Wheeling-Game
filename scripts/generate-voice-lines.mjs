import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { streetClips } from '../src/street-lines.js';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'public', 'audio');
const sourcePath = path.join(root, 'src', 'voice-lines.json');
const soundEffectsPath = path.join(root, 'src', 'sound-effects.json');
const streetLinesPath = path.join(root, 'src', 'street-lines.json');
const riderVoicesPath = path.join(root, 'src', 'rider-voices.json');
const manifestPath = path.join(outputDirectory, 'manifest.json');
const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_v4';
const soundModelId = process.env.ELEVENLABS_SFX_MODEL_ID || 'eleven_text_to_sound_v2';
const onlyIds = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const force = process.argv.includes('--force');

// "classic" holds the V1 commentary clips. They are frozen: kept in the
// manifest when the file exists, never regenerated.
const FROZEN_GROUPS = new Set(['classic']);
const CONCURRENCY = 2;

if (!apiKey || !voiceId) {
  throw new Error('Configure ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.local before generating audio.');
}

const lineGroups = JSON.parse(await readFile(sourcePath, 'utf8'));
const soundEffects = JSON.parse(await readFile(soundEffectsPath, 'utf8'));
const streetLines = JSON.parse(await readFile(streetLinesPath, 'utf8'));
const riderVoices = JSON.parse(await readFile(riderVoicesPath, 'utf8'));
// The rider's voices: the project's own (voiceId "env") and the extra ones
// the player can pick; each extra voice says every line under its prefix.
const riderVoiceList = Object.entries(riderVoices.voices).map(([key, voice]) => ({
  key, ...voice, voiceId: voice.voiceId === 'env' ? voiceId : voice.voiceId
}));
const lineEntries = [];
const frozenIds = [];
for (const [language, groups] of Object.entries(lineGroups)) {
  for (const line of Object.values(groups).flat()) {
    if (FROZEN_GROUPS.has(language)) {
      frozenIds.push(line.id);
      continue;
    }
    // Group names may carry a point of view (fr_self): the language comes first.
    const lang = language.split('_')[0];
    for (const voice of riderVoiceList) {
      if (!voice.prefix) lineEntries.push({ ...line, language: lang });
      else {
        lineEntries.push({
          id: voice.prefix + line.id, text: voice.overrides?.[line.id] ?? line.text, language: lang,
          voiceId: voice.voiceId, settings: voice.settings
        });
      }
    }
  }
}
// A short sample of each voice for the settings screen.
for (const voice of riderVoiceList) {
  for (const [lang, text] of Object.entries(riderVoices.preview)) {
    lineEntries.push({ id: `voice_preview_${voice.key}_${lang}`, text, language: lang, voiceId: voice.voiceId, settings: voice.prefix ? voice.settings : undefined });
  }
}

// Street dialogue (free roam): passers-by and police have their own voices,
// the main character speaks with the voice the player picked.
const riderStreetVoices = riderVoiceList.map((voice) => (voice.prefix ? `rider_${voice.key}` : 'rider'));
for (const clip of streetClips(streetLines, riderStreetVoices)) {
  if (clip.group === 'rider') {
    const voice = riderVoiceList.find((item) => (item.prefix ? `rider_${item.key}` : 'rider') === clip.voice);
    lineEntries.push({ id: clip.id, text: clip.text, language: 'fr', voiceId: voice.voiceId, settings: voice.prefix ? voice.settings : undefined });
    continue;
  }
  const voice = streetLines.voices[clip.voice];
  lineEntries.push({ id: clip.id, text: clip.text, language: 'fr', voiceId: voice.voiceId });
}

const activeIds = new Set([...lineEntries, ...soundEffects].map(({ id }) => id).concat(frozenIds));
const previousManifest = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, 'utf8'))
  : { available: [], hashes: {} };
const hashes = Object.fromEntries(
  Object.entries(previousManifest.hashes || {}).filter(([id]) => activeIds.has(id))
);
const available = new Set((previousManifest.available || []).filter((id) => activeIds.has(id)));
for (const id of frozenIds) {
  if (existsSync(path.join(outputDirectory, `${id}.mp3`))) available.add(id);
  else available.delete(id);
}

await mkdir(outputDirectory, { recursive: true });

let ffmpegAvailable = true;
try {
  await run('ffmpeg', ['-version']);
} catch {
  ffmpegAvailable = false;
  console.warn('ffmpeg not found: clips are kept as returned by ElevenLabs (no trim / loudness pass).');
}

async function saveManifest() {
  const ordered = [...activeIds].filter((id) => available.has(id));
  await writeFile(manifestPath, `${JSON.stringify({ available: ordered, hashes }, null, 2)}\n`);
}

async function request(requestUrl, body) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body)
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    const details = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= 4) throw new Error(`${response.status}: ${details}`);
    await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
  }
}

// One-shots and voice clips: strip the silent head/tail so they fire on the
// frame they are triggered, and level them. Loops are left untouched (the
// game builds the seamless loop itself when it decodes them).
async function postProcess(inputPath, outputPath, kind) {
  const trim = 'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.01';
  const filters = kind === 'voice'
    ? `${trim},areverse,${trim},areverse,loudnorm=I=-17:TP=-1.5:LRA=11`
    : `${trim},areverse,${trim},areverse,afade=t=in:d=0.004,loudnorm=I=-18:TP=-1.5:LRA=11`;
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', inputPath,
    '-af', filters, '-ar', '44100', '-ac', kind === 'voice' ? '1' : '2',
    '-codec:a', 'libmp3lame', '-b:a', kind === 'voice' ? '96k' : '128k', '-f', 'mp3', outputPath
  ]);
}

async function generateAudio({ id, hash, kind, requestUrl, body }) {
  const outputPath = path.join(outputDirectory, `${id}.mp3`);
  if (!force && hashes[id] === hash && existsSync(outputPath)) {
    available.add(id);
    return 'cached';
  }

  const audio = await request(requestUrl, body);
  const rawPath = `${outputPath}.raw.tmp`;
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(rawPath, audio);
  if (ffmpegAvailable && kind !== 'loop') {
    await postProcess(rawPath, temporaryPath, kind);
    await unlink(rawPath);
  } else {
    await rename(rawPath, temporaryPath);
  }
  await rename(temporaryPath, outputPath);
  hashes[id] = hash;
  available.add(id);
  return 'generated';
}

const jobs = [];
const DEFAULT_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
for (const { id, text, language, voiceId: lineVoice = voiceId, settings } of lineEntries) {
  // Lines with the default settings keep their original hash (no regeneration).
  const tuned = settings ? `\0${JSON.stringify(settings)}` : '';
  jobs.push({
    id,
    kind: 'voice',
    hash: createHash('sha256').update(`${modelId}\0${lineVoice}\0${language}\0${text}${tuned}`).digest('hex'),
    requestUrl: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(lineVoice)}?output_format=mp3_44100_128`,
    body: {
      text,
      model_id: modelId,
      language_code: language,
      voice_settings: settings || DEFAULT_SETTINGS
    }
  });
}
for (const { id, text, durationSeconds, loop } of soundEffects) {
  jobs.push({
    id,
    kind: loop ? 'loop' : 'sfx',
    hash: createHash('sha256').update(`${soundModelId}\0${text}\0${durationSeconds}\0${loop}`).digest('hex'),
    requestUrl: 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
    body: { text, model_id: soundModelId, duration_seconds: durationSeconds, loop, prompt_influence: 0.4 }
  });
}

const queue = jobs.filter(({ id }) => onlyIds.length === 0 || onlyIds.includes(id));
const failures = [];
let generated = 0;
async function worker() {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try {
      if (await generateAudio(job) === 'generated') {
        generated++;
        console.log(`Generated ${job.id}`);
        await saveManifest();
      }
    } catch (error) {
      failures.push(job.id);
      console.error(`FAILED ${job.id}: ${error.message}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await saveManifest();

console.log(`Done: ${generated} generated, ${available.size}/${activeIds.size} clips available.`);
if (failures.length) {
  console.error(`Failed: ${failures.join(', ')}`);
  process.exitCode = 1;
}
