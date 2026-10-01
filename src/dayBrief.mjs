function normalizePhrase(value) {
  const phrase = value.replace(/\s+/g, " ").trim();
  return phrase ? phrase[0].toUpperCase() + phrase.slice(1) : "";
}

function isNegatedBefore(text, index) {
  const prefix = text.slice(Math.max(0, index - 36), index);
  return /\b(?:not|never|avoid(?:ing)?|without|do not|don't|doesn't)(?:\s+(?:really|too|very|want|need|to|wear|dress|my|me|it|that|a|something))*\s*$/i.test(prefix);
}

function matchExplicit(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && !isNegatedBefore(text, match.index)) return normalizePhrase(match[0]);
  }
  return "";
}

function extractTimeWindow(text) {
  const match = /\b(?:from\s+)?(\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:–|—|-|to)\s*(\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)?)\b/i.exec(text);
  if (!match) return "";
  const cleanTime = (value) => value.trim().replace(/\s*(a\.?m\.?|p\.?m\.?)$/i, (_, period) => " " + period.replace(/\./g, "").toLowerCase());
  return cleanTime(match[1]) + "–" + cleanTime(match[2]);
}

function extractDuration(text) {
  const match = /\b(?:for\s+)?(\d+(?:\.\d+)?|a couple of|a few|one|two|three|four|five|six|seven|eight|nine|ten)\s*(hours?|hrs?|minutes?|mins?)\b/i.exec(text);
  return match ? match[1].toLowerCase() + " " + match[2].toLowerCase() : "";
}

function extractDressCode(text) {
  const match = /\b(?:dress code(?:\s+is|:)?|(?:i|we)\s+(?:need|want|prefer)(?:\s+to\s+(?:wear|dress))?|(?:please\s+)?wear|the\s+(?:event|occasion)\s+is)\s+(?:something\s+|a\s+)?(white tie|black tie|business formal|business casual|smart casual|semi-formal|semi formal|formal|casual)\b/i.exec(text);
  if (!match) return "";
  const valueIndex = match.index + match[0].lastIndexOf(match[1]);
  return isNegatedBefore(text, valueIndex) ? "" : normalizePhrase(match[1]);
}

function extractMood(text) {
  const match = /\b(?:i\s+feel|i['’]m\s+feeling|i\s+am\s+feeling|feeling)\s+([^,.!?;\n]{1,60})/i.exec(text);
  return match ? normalizePhrase(match[1]) : "";
}

export function extractDayBrief(rawText, selectedOccasion) {
  const text = typeof rawText === "string" ? rawText : "";
  const occasion = typeof selectedOccasion === "string" ? selectedOccasion.trim() : "";

  return {
    occasion,
    timeWindow: extractTimeWindow(text),
    duration: extractDuration(text),
    movement: matchExplicit(text, [
      /\b(?:no|without) walking\b/i,
      /\b(?:limited|minimal|little) walking\b/i,
      /\bmostly (?:seated|sitting)\b/i,
      /\bmostly standing\b/i,
      /\bon my feet (?:most of the day|all day)\b/i,
      /\b(?:a long walk|long walk|hike|lots of walking|a lot of walking)\b/i,
      /\b(?:some walking|walking|walk|hike)\b/i,
    ]),
    dressCode: extractDressCode(text),
    mood: extractMood(text),
    comfortNeeds: matchExplicit(text, [
      /\broom to move\b/i,
      /\beasy movement\b/i,
      /\bnot scratchy\b/i,
      /\bnon-itchy\b/i,
      /\bcomfortable fit\b/i,
      /\bcomfortable\b/i,
      /\bcomfy\b/i,
      /\bsoft\b/i,
      /\bbreathable\b/i,
      /\b(?:loose|relaxed) fit\b/i,
    ]),
    coverageNeeds: matchExplicit(text, [
      /\b(?:my\s+)?(?:shoulders?|arms?|legs?|chest|back|neck)\s+covered\b/i,
      /\bcover(?:ing)?\s+my\s+(?:shoulders?|arms?|legs?|chest|back|neck)\b/i,
      /\b(?:more|extra) coverage\b/i,
    ]),
  };
}
