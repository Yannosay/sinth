## new

* git add .
* git commit -m "release v1.9.0"
* git push
* git tag -a v1.9.0 -m "release v1.9.0"
* git push origin v1.9.0
* git checkout v1.9.0
* git checkout -b release/1.9.x
* git push origin release/1.9.x
* git checkout main

## update

* git checkout release/1.9.x
* git add .
* git commit -m "fix: description"
* git push
* git tag -a v1.9.1 -m "release v1.9.1"
* git push origin v1.9.1
* git checkout main

