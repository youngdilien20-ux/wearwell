---
name: Imported app routing
description: Replit preview and root-clone behavior for imported web apps.
---

When importing an existing web app into this project, put the runnable artifact under the destination project's top-level `artifacts/<slug>` directory. A repository cloned beneath another folder can be recognized and its Vite process can start while the shared preview proxy still returns "Backend Not Configured."

**Why:** A nested artifact workflow can report ready while the preview proxy has no route to it. For an explicit root clone, the repository's Git metadata and artifact manifest can be imported and registered so the shared preview routes correctly. The `.conversation` directory is mounted and cannot be removed during a bulk sync.

**How to apply:** Ask before replacing the starter scaffold unless the user explicitly requests a root clone. For a requested root clone, copy the repository's `.git` and artifact manifest, but preserve Replit-mounted `.agents`, `.local`, `.cache`, and `.conversation`; install from the imported lockfile, then verify artifact registration, the managed workflow, and the preview. For source-only imports, retain the destination's Git and artifact metadata.