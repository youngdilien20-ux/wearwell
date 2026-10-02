---
name: Startup permission scope
description: Wearwell's first-launch permission requests and scope boundaries.
---

At first launch, request microphone and speech-recognition access for voice chat and camera/photo-library access for wardrobe photos. Leave the current location permission flow unchanged. Do not request broad file storage or unrelated permissions when the app does not need them; keep feature-triggered requests available if a user denies an upfront request.

**Why:** The user wants relevant permissions requested after launch and confirmed location access is already working.

**How to apply:** When changing device features, keep startup permission requests limited to actual capabilities the app uses, make OS permission descriptions explain the first-launch prompt, and preserve feature-level recovery when a permission is denied.