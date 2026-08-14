import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const modulesDir = join(root, 'modules');
const moduleNames = readdirSync(modulesDir)
  .filter((name) => statSync(join(modulesDir, name)).isDirectory())
  .filter((name) => existsSync(join(modulesDir, name, 'package.json')))
  .sort();

for (const name of moduleNames) {
  const cwd = join(modulesDir, name);
  console.log(`\n::group::${name}`);
  for (const args of [['ci'], ['test'], ['run', 'typecheck']]) {
    const result = spawnSync('npm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.error) {
      console.error(`${name}: unable to run npm ${args.join(' ')}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(`${name}: npm ${args.join(' ')} failed with exit code ${result.status}`);
      process.exit(result.status ?? 1);
    }
  }
  console.log('::endgroup::');
}

console.log(`\nAll checks passed for ${moduleNames.length} modules.`);
