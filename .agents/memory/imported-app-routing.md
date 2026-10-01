---
name: Imported app routing
description: Replit preview and root-clone behavior for imported web apps.
---

When importing an existing app into this project, put the runnable artifact under the destination project's top-level `artifacts/<slug>` directory. A repository cloned beneath another folder can be recognized and its process can start while the shared preview proxy still returns "Backend Not Configured."

**Why:** A nested artifact workflow can report ready while the preview proxy has no route to it. A cloned `.replit-artifact/artifact.toml` alone does not register a new artifact or create its managed workflow in the destination project; artifact registration is separate platform state. The `.conversation` directory is mounted and cannot be removed during a bulk sync.

**How to apply:** Ask before replacing the starter scaffold unless the user explicitly requests a root clone. For a requested root clone, copy the repository's `.git` and source files, but preserve Replit-mounted `.local`, `.cache`, and `.conversation`; install from the imported lockfile. If an imported artifact directory exists but is absent from the artifact registry, preserve its source, call `createArtifact()` with its slug and preview path, then restore the source while retaining the newly registered `.replit-artifact/artifact.toml`. Verify artifact registration, the managed workflow, and the preview. For source-only imports, retain the destination's Git and artifact metadata.