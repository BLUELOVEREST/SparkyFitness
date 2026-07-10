# Eric Customization

This branch contains Eric's customized SparkyFitness build.

## Upstream Base

- Repository: https://github.com/CodeWithCJ/SparkyFitness
- Version: 0.17.3
- Base commit: cc9fd258fbaa6407740f5b3942c12a64d6deb9f2
- Upstream branch at last sync: dev2

## Eric Release Line

- Branch: sparky-custom-eric-flow
- Current release tag format: `v<upstream-version>-eric.<global-release-number>`
- First direct-source release tag: `v0.17.3-eric.4`

The `eric.<number>` suffix is a global Eric release counter and does not reset
when the upstream SparkyFitness version changes.

## Current Customizations

- Adds a carb cycle planner to SparkyFitness Goals.
- Adds Gitea Actions image publishing for Eric's Gitea registry.
- Removes the backend Dockerfile frontend syntax directive to avoid pulling the
  Dockerfile frontend image before builds on the local runner.

## Syncing Upstream

Fetch the official SparkyFitness repository and merge the desired upstream
branch into this branch:

```bash
git checkout sparky-custom-eric-flow
git remote add sparky-upstream https://github.com/CodeWithCJ/SparkyFitness.git
git fetch sparky-upstream
git merge sparky-upstream/dev2
```

After resolving conflicts and validating the build, update this file's upstream
version and base commit, then publish the next Eric release tag.
