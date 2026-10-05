---
name: Startup permission scope
description: Wearwell's first-launch permission requests and scope boundaries.
---

At first launch, request microphone and speech-recognition access for voice chat and camera/photo-library access for wardrobe photos. Microphone access for Wearwell voice chat is crucial; the app must trigger the native permission dialog, not only display instructions. Leave the current location permission flow unchanged. Do not request broad file storage or unrelated permissions when the app does not need them; keep feature-triggered requests available if a user denies an upfront request.

**Why:** The user said microphone access for voice chat is crucial, wants relevant permissions requested after launch, and confirmed location access is already working.

**How to apply:** When changing device features, keep startup permission requests limited to actual capabilities the app uses, make OS permission descriptions explain the first-launch prompt, and preserve feature-level recovery when a permission is denied.

**Android microphone caveat:** Do not set `expo-image-picker`'s `microphonePermission` to `false` while voice chat uses the microphone. That option blocks `RECORD_AUDIO` in the merged manifest and can override the speech-recognition plugin's permission declaration. Use an accurate purpose string instead and verify the generated Android manifest.

**Why:** Without `RECORD_AUDIO`, Android cannot grant microphone access; a saved one-time request marker can also suppress retry after fixing the manifest. The user clarified that source-only changes did not fix the installed app.

**How to apply:** After correcting a permission configuration, reset or version the affected startup marker, leave thrown requests unmarked, regenerate the native project, confirm the manifest, and rebuild/install the custom APK. `expo-speech-recognition` requires a native build; Expo Go or a JavaScript reload cannot add `RECORD_AUDIO`. Do not claim the installed-app issue is fixed until the updated native build is available.