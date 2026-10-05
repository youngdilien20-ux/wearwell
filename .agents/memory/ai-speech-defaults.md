---
name: AI and speech defaults
description: User-directed defaults and opt-out behavior for AI assistance and spoken replies.
---

AI assistance and spoken replies default to ON. Users can turn either one OFF, and that choice should persist rather than being reset on later launches or syncs. Legacy mobile OFF values that came from the previous default should be migrated to ON once.

**Why:** The user requires AI to be on by default and only turned off when a user chooses to disable AI or speech.

**How to apply:** Keep missing preferences enabled across app initialization and cloud sync; preserve explicit OFF values after the one-time legacy migration.