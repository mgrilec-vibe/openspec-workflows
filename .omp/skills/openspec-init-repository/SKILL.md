---
name: openspec-init-repository
description: Initialize a project directory with APM, install OpenSpec workflows, and publish the project as a private GitHub repository. Use when the user wants to bootstrap a new repository with these workflows.
allowed-tools: Bash(apm:*), Bash(git:*), Bash(gh:*)
license: MIT
compatibility: Requires APM CLI, Git, and authenticated GitHub CLI.
metadata:
  author: openspec-workflows
  version: "1.1.0"
---

Initialize a project directory with APM, install this workflow package, verify the deployed skills, then create and push a private GitHub repository named after the directory.

**Input:** A project directory path. The directory name becomes the GitHub repository name.

## Workflow

1. **Resolve and preflight the project directory**
   - Resolve the supplied path to an absolute path and derive `repo_name` from its basename. The name must be valid for a GitHub repository.
   - Create the directory if it does not exist. If it exists, preserve project files but stop if it already contains `.git`, `apm.yml`, `apm.lock.yaml`, or an installed agent target directory such as `.agents/`; never overwrite an initialized project.
   - Confirm `apm`, `git`, and `gh` are available, then run `gh auth status`.
   - Resolve the authenticated GitHub owner with `gh api user --jq .login`. Before writing files, verify that `$owner/$repo_name` does not already exist with `gh repo view "$owner/$repo_name"`. If it exists, stop; never reuse or overwrite a GitHub repository.

2. **Initialize APM and install the workflow dependency**
   From the project directory, initialize a non-interactive APM manifest for every supported target plus the converged agent-skills path:
   ```bash
   apm init . --yes --target all,agent-skills
   apm install mgrilec-vibe/openspec-workflows --target all,agent-skills
   ```
   This persists `mgrilec-vibe/openspec-workflows` in `apm.yml`, resolves it into `apm.lock.yaml`, and deploys its prompts and skills. Do not hand-edit generated target files.

3. **Verify installed skills**
   Confirm all of the following before creating the GitHub repository:
   ```bash
   test -f apm.yml
   test -f apm.lock.yaml
   test -f .agents/skills/openspec-apply-change/SKILL.md
   ```
   If APM reports an install, deployment, or security-scan failure, stop and report it. Do not create a repository with partially installed workflows.

4. **Create the initial Git repository**
   Initialize a new `main` branch and commit the APM manifest, lockfile, and installed agent configuration:
   ```bash
   git init -b main
   git add -A
   git diff --cached --check
   git commit -m "chore: initialize APM workflows"
   ```
   Respect `.gitignore`; do not force-add `apm_modules/` or other ignored dependency caches. If the commit fails, stop before creating the GitHub repository.

5. **Create and push the private GitHub repository**
   Create a private repository under the authenticated account, configure `origin`, and push the initialized `main` branch:
   ```bash
   gh repo create "$owner/$repo_name" \
     --private \
     --source "$project_dir" \
     --remote origin \
     --push
   ```
   If repository creation or push fails, report the exact failure. Leave the local repository intact for recovery; never make the repository public, force-push, or delete an existing remote.

6. **Report the handoff**
   Show:
   - Local project directory
   - Private GitHub repository URL
   - Installed dependency: `mgrilec-vibe/openspec-workflows`
   - Verified agent-skills path
   - Next step: use `/opsx-propose` inside the new repository

## Guardrails

- The folder basename MUST be the GitHub repository name; do not derive a different name.
- Create only private GitHub repositories.
- Never overwrite an initialized directory, local Git repository, or existing GitHub repository.
- Never create the GitHub repository until APM installation, skill verification, and the initial local commit succeed.
- Install through APM so `apm.yml` and `apm.lock.yaml` remain the dependency source of truth.
- Stop on any preflight, APM, Git, GitHub, or verification failure.
