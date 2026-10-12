---
name: GitHub CLI authentication
description: How Git remote authentication behaved versus the GitHub CLI in this workspace.
---

In this workspace, the connected GitHub account allowed `git ls-remote` against a provided repository URL, but `gh repo list` reported that `gh auth login` was needed. Do not ask for a personal access token as a workaround. Use Git remote operations for repo-specific connectivity; if the remote URL is unknown, ask the user rather than guessing.

**Why:** Avoid exposing credentials or treating a GitHub CLI authentication failure as proof that Git transport is unavailable.

**How to apply:** When setting up GitHub remotes in this Repl, test the user-supplied URL with read-only `git ls-remote`, then proceed only if the repo is accessible.
