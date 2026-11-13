// Street dialogue clips: every line of src/street-lines.json, one clip per
// voice. Shared by the game and scripts/generate-voice-lines.mjs so the
// clip ids always match.
export function streetClips(data) {
    const clips = [];
    const add = (voice, group, category, lines) => lines.forEach((text, index) => {
        clips.push({ id: `st_${voice}_${category}_${index + 1}`, voice, group, category, text });
    });
    for (const voice of data.pedestrianVoices) {
        for (const [category, lines] of Object.entries(data.pedestrian)) add(voice, 'pedestrian', category, lines);
    }
    for (const voice of data.policeVoices) {
        for (const [category, lines] of Object.entries(data.police)) add(voice, 'police', category, lines);
    }
    // The main character speaks with the project's own voice.
    for (const [category, lines] of Object.entries(data.rider)) add('rider', 'rider', category, lines);
    return clips;
}
