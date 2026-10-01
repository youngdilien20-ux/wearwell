---
name: Android CI SDK packages
description: The legacy default package list in android-actions/setup-android@v3 fails with current Android SDK tools.
---

When using `android-actions/setup-android@v3`, explicitly override its `packages` input instead of relying on the default `tools platform-tools`; the retired `tools` package causes `sdkmanager` to fail before Gradle runs.

**Why:** The GitHub-hosted runner's current command-line tools report that the `tools` package cannot be found.

**How to apply:** Set `packages` to `platform-tools` or the specific modern SDK components needed by the project.