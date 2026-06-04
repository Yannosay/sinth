## new (minor or major release from main)

* git add .
* git commit -m "release v1.10.0"
* git push
* git tag -a v1.10.0 -m "release v1.10.0"
* git push origin v1.10.0
* git checkout v1.10.0
* git checkout -b release/1.10
* git push origin release/1.10
* git checkout main

## update (patch to the current version line — merge back into main)

* git add .
* git commit -m "clean up working directory"
* git push
* git checkout release/1.10
* git add .
* git commit -m "fix: description"
* git push
* git tag -a v1.10.1 -m "release v1.10.1"
* git push origin v1.10.1
* git checkout main
* git merge release/1.10
* git push

## backport (patch to an older version line — no merge into main)

* git add .
* git commit -m "clean up working directory"
* git push
* git checkout release/1.9
* git add .
* git commit -m "fix: description"
* git push
* git tag -a v1.9.1 -m "release v1.9.1"
* git push origin v1.9.1
* git checkout main