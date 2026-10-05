export function transcriptFromRecognitionResults(results) {
  return Array.from(results || [])
    .map((result) => result?.[0]?.transcript || "")
    .filter((segment) => typeof segment === "string" && segment.trim())
    .map((segment) => segment.trim())
    .join(" ");
}