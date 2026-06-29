import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
copyFileSync('dist-cli/index.js', 'dist/cli.js');
copyFileSync('dist-cli/index.js.map', 'dist/cli.js.map');
rmSync('dist-cli', { recursive: true, force: true });
