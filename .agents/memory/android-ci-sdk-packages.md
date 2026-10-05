---
name: Android CI and standalone APKs
description: Avoid the retired setup-android SDK package and make downloadable Android APKs run without Metro.
---

When using `android-actions/setup-android@v3`, explicitly override its `packages` input instead of relying on the default `tools platform-tools`; the retired `tools` package causes `sdkmanager` to fail before Gradle runs.

For APKs that people install without a running Metro server, build the release variant rather than debug: debug expects Metro and does not include the app's JS bundle. In this app's generated Android configuration, release is signed with the debug keystore, so it remains installable for internal sideloading, but it is not a Play Store signing setup.

**Why:** The GitHub-hosted runner's current command-line tools report that the `tools` package cannot be found, and a debug APK installed away from Metro fails to load its script.

**How to apply:** Set `packages` to `platform-tools` or the specific modern SDK components needed by the project. Use `assembleRelease` for a self-contained APK and confirm the generated release variant is signed before calling it installable.