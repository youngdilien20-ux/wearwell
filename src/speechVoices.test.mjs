import assert from "node:assert/strict";
import test from "node:test";
import { speechVoiceId, speechVoiceOptionsForLanguage } from "./speechVoices.mjs";

const voices = [
  { name: "English UK One", lang: "en-GB", voiceURI: "en-uk-1" },
  { name: "English US", lang: "en-US", voiceURI: "en-us-1" },
  { name: "English UK Two", lang: "en-GB", voiceURI: "en-uk-2" },
  { name: "French", lang: "fr-FR", voiceURI: "fr-1" },
];

test("offers at most two additional voices matching the selected language", () => {
  assert.deepEqual(
    speechVoiceOptionsForLanguage(voices, "en-GB").map((voice) => voice.voiceURI),
    ["en-uk-1", "en-us-1"],
  );
  assert.deepEqual(
    speechVoiceOptionsForLanguage(voices, "fr-FR").map((voice) => voice.voiceURI),
    ["fr-1"],
  );
});

test("keeps the selected installed voice among the available choices", () => {
  assert.deepEqual(
    speechVoiceOptionsForLanguage(voices, "en-GB", "en-uk-2").map((voice) => voice.voiceURI),
    ["en-uk-2", "en-uk-1"],
  );
});

test("uses a language-qualified fallback id when a voice has no URI", () => {
  assert.equal(speechVoiceId({ name: "System Voice", lang: "en-GB" }), "System Voice\u001fen-GB");
});