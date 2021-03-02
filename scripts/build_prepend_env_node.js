const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');
const ENV_TEXT = '#!/usr/bin/env node';
const BIN_FILE_PATH = resolve(__dirname, '../dist/vsproj_crud_watcher.js');

const content = `${ENV_TEXT}\n${readFileSync(BIN_FILE_PATH, 'utf-8')}`;
writeFileSync(BIN_FILE_PATH, content);
