#!/usr/bin/env node
const path = require('path');
const tsSource = path.join(__dirname, '..', 'src', 'sinth.ts');
require('ts-node').register({ project: path.join(__dirname, '..', 'tsconfig.json') });
require(tsSource);
