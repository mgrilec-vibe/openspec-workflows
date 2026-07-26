---
description: Initialize a private GitHub repository with APM and OpenSpec workflows.
input:
  - directory: Project directory to initialize
argument-hint: "<project directory>"
---

Initialize `${input:directory}` as a private GitHub repository. Use the `openspec-init-repository` skill to create its APM setup, install `mgrilec-vibe/openspec-workflows`, verify deployed skills, commit the initialized project, and push it under the directory name.
