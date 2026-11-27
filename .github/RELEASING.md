## new — minor or major release from `main`

```bash
# 1. Bump version in package.json (e.g., "1.10.0")
git add .
git commit -m "release v1.10.0"
git push
git tag -a v1.10.0 -m "release v1.10.0"
git push origin v1.10.0
git checkout v1.10.0
git checkout -b release/1.10
git push origin release/1.10
git checkout main
```

## update — patch to the current release line (merged into `main`)

```bash
# 1. Bump version in package.json (e.g., "1.10.1")
git stash
git checkout release/1.10
git add .
git commit -m "release v1.10.1"
git push
git tag -a v1.10.1 -m "release v1.10.1"
git push origin v1.10.1
git checkout main
git merge release/1.10
git push
git stash pop
```

If you need to bring in changes from `main` first (e.g., someone merged a PR there), add `git merge main` before committing:

```bash
# 1. Bump version in package.json (e.g., "1.10.1")
git stash
git checkout release/1.10
git merge main
git add .
git commit -m "release v1.10.1"
git push
git tag -a v1.10.1 -m "release v1.10.1"
git push origin v1.10.1
git checkout main
git merge release/1.10
git push
git stash pop
```

## backport — patch to an older release line (no merge into `main`)

```bash
# 1. Bump version in package.json (e.g., "1.9.5")
git stash
git checkout release/1.9
git add .
git commit -m "release v1.9.5"
git push
git tag -a v1.9.5 -m "release v1.9.5"
git push origin v1.9.5
git checkout main
git stash pop
```

## via Visual Interface on GitHub

### 1. Work on branch:

```bash
# 1. Bump version in package.json (e.g., "1.9.5")
git add .
git commit -m "release v1.9.5"
git push
```

### 2. Create release on GitHub:

* Go to Releases → "Create a new release"
* Choose tag (e.g., `v1.9.5`) - must match the version you put in package.json
* Publish

### 3. Sync main:

```bash
git checkout release/1.11
git merge main
git push
git fetch --tags
```