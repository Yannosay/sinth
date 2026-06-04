## new — minor or major release from `main`

```bash
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
git stash
git checkout release/1.10
git merge main
git add .
git commit -m "fix: description"
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
git stash
git checkout release/1.9
git add .
git commit -m "fix: description"
git push
git tag -a v1.9.1 -m "release v1.9.1"
git push origin v1.9.1
git checkout main
git stash pop
```