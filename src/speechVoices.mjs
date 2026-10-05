export function speechVoiceId(voice) {
  if (!voice || typeof voice !== "object") return "";
  if (typeof voice.voiceURI === "string" && voice.voiceURI) return voice.voiceURI;
  const name = typeof voice.name === "string" ? voice.name.trim() : "";
  const language = typeof voice.lang === "string" ? voice.lang.trim() : "";
  return name && language ? `${name}\u001f${language}` : "";
}

export function speechVoiceOptionsForLanguage(voices, language, selectedVoiceId = "") {
  if (!Array.isArray(voices) || typeof language !== "string" || !language.trim()) return [];

  const requestedLanguage = language.trim().toLowerCase();
  const languageRoot = requestedLanguage.split("-")[0];
  const matching = [];
  const seen = new Set();

  for (const voice of voices) {
    const voiceId = speechVoiceId(voice);
    const voiceLanguage = typeof voice?.lang === "string" ? voice.lang.toLowerCase() : "";
    const matchesLanguage =
      voiceLanguage === requestedLanguage ||
      voiceLanguage === languageRoot ||
      voiceLanguage.startsWith(`${languageRoot}-`);
    if (!voiceId || !matchesLanguage || seen.has(voiceId)) continue;
    seen.add(voiceId);
    matching.push(voice);
  }

  const selectedVoice = matching.find((voice) => speechVoiceId(voice) === selectedVoiceId);
  const ordered = selectedVoice
    ? [selectedVoice, ...matching.filter((voice) => speechVoiceId(voice) !== selectedVoiceId)]
    : matching;

  // Browser default is the third choice; expose up to two additional device voices.
  return ordered.slice(0, 2);
}