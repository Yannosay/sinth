## new (use when releasing a new major or minor version)

* git add .
* git commit -m "release v1.9.0"
* git push
* git tag -a v1.9.0 -m "release v1.9.0"
* git push origin v1.9.0
* git checkout v1.9.0
* git checkout -b release/1.9
* git push origin release/1.9
* git checkout main

## update (use when releasing a patch - bugfixes or security fixes only)

* git checkout release/1.9
* git add .
* git commit -m "fix: description"
* git push
* git tag -a v1.9.1 -m "release v1.9.1"
* git push origin v1.9.1
* git checkout main