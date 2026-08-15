import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const modulesDir = join(root, 'modules');
const registryPath = join(modulesDir, 'REGISTRY.md');
const errors = [];
const modules = new Map();

const read = (path) => readFileSync(path, 'utf8');
const fail = (moduleName, message) => errors.push(`${moduleName}: ${message}`);

function exportedPaths(packageJson) {
  const paths = [];
  if (typeof packageJson.main === 'string') paths.push(packageJson.main);
  if (typeof packageJson.exports === 'string') paths.push(packageJson.exports);
  if (packageJson.exports && typeof packageJson.exports === 'object') {
    for (const value of Object.values(packageJson.exports)) {
      if (typeof value === 'string') paths.push(value);
      else if (value && typeof value === 'object') {
        for (const target of Object.values(value)) if (typeof target === 'string') paths.push(target);
      }
    }
  }
  return paths.map((path) => path.replace(/^\.\//, ''));
}

for (const name of readdirSync(modulesDir).sort()) {
  const directory = join(modulesDir, name);
  if (!statSync(directory).isDirectory()) continue;
  const packagePath = join(directory, 'package.json');
  if (!existsSync(packagePath)) continue;

  const versionPath = join(directory, 'VERSION');
  const moduleDocPath = join(directory, 'MODULE.md');
  const lockPath = join(directory, 'package-lock.json');
  if (!existsSync(versionPath)) fail(name, 'missing VERSION');
  if (!existsSync(moduleDocPath)) fail(name, 'missing MODULE.md');
  if (!existsSync(lockPath)) fail(name, 'missing package-lock.json required by npm ci');

  let packageJson;
  try {
    packageJson = JSON.parse(read(packagePath));
  } catch (error) {
    fail(name, `invalid package.json (${error.message})`);
    continue;
  }

  const version = existsSync(versionPath) ? read(versionPath).trim() : '';
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(name, `VERSION must be exact SemVer, received ${JSON.stringify(version)}`);
  if (packageJson.version !== version) fail(name, `package.json ${packageJson.version} != VERSION ${version}`);
  if (!packageJson.scripts?.test) fail(name, 'package.json is missing test script');
  if (!packageJson.scripts?.typecheck) fail(name, 'package.json is missing typecheck script');

  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(read(lockPath));
      if (lock.version !== version) fail(name, `package-lock.json ${lock.version} != VERSION ${version}`);
      if (lock.packages?.['']?.version !== version) {
        fail(name, `package-lock root ${lock.packages?.['']?.version} != VERSION ${version}`);
      }
    } catch (error) {
      fail(name, `invalid package-lock.json (${error.message})`);
    }
  }

  if (existsSync(moduleDocPath) && !read(moduleDocPath).includes(version)) {
    fail(name, `MODULE.md does not mention source version ${version}`);
  }

  const declaredEntries = exportedPaths(packageJson);
  const fallbackEntries = ['index.ts', 'core/index.ts', 'core/client.ts'];
  const entries = declaredEntries.length > 0 ? declaredEntries : fallbackEntries.filter((path) => existsSync(join(directory, path)));
  if (entries.length === 0) fail(name, 'missing public entry point');
  for (const entry of entries) if (!existsSync(join(directory, entry))) fail(name, `entry point does not exist: ${entry}`);

  modules.set(name, version);
}

const registry = read(registryPath);
const registryRows = new Map();
for (const line of registry.split('\n')) {
  const cells = line.split('|').map((cell) => cell.trim());
  if (!/^\d+$/.test(cells[1] ?? '')) continue;
  const modulePath = (cells[3] ?? '').replaceAll('`', '');
  const status = cells[5] ?? '';
  const version = cells[6] ?? '';
  if (registryRows.has(modulePath)) fail(modulePath, 'duplicate REGISTRY row');
  registryRows.set(modulePath, { status, version });
}

for (const [name, version] of modules) {
  const row = registryRows.get(name);
  if (!row) {
    fail(name, 'missing REGISTRY row');
    continue;
  }
  if (row.version !== version) fail(name, `REGISTRY ${row.version} != VERSION ${version}`);
  if (row.status.includes('✅') && (!existsSync(join(modulesDir, name, 'tests')) || !existsSync(join(modulesDir, name, 'tsconfig.json')))) {
    fail(name, 'REGISTRY says Completed but tests or tsconfig.json is missing');
  }
}

for (const name of registryRows.keys()) if (!modules.has(name)) fail(name, 'REGISTRY points to a module without package.json');

if (errors.length > 0) {
  console.error(`Module consistency check failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Module consistency check passed for ${modules.size} modules.`);
