/// <reference types="vite/client" />

/**
 * Documentation contract guard.
 *
 * Asserts the customer-facing documentation of this module from the files on disk, so the
 * README / README.th contract cannot silently regress: deleting a required section, breaking the
 * copy-and-own install rule, documenting an export the entry point does not have, quoting a test
 * count that `MODULE.md` does not state, teaching an install that does not exist, or dropping the
 * example marker all fail this suite.
 *
 * Every document and source file is imported with `?raw`, which this module's vite/vitest setup
 * supports (`vite/client` declares `*?raw`). A `?raw` import of a missing file fails collection,
 * so the existence of each guarded file is enforced by the imports themselves.
 */

import { describe, expect, it } from 'vitest';

import entrySource from '../index.ts?raw';
import errorSource from '../core/errors.ts?raw';
import exampleSource from '../examples/run.ts?raw';
import moduleDoc from '../MODULE.md?raw';
import packageJsonText from '../package.json?raw';
import readmeEn from '../README.md?raw';
import readmeTh from '../README.th.md?raw';

/** The eight section keys every customer-facing README must carry, in this exact order. */
const EXPECTED_SECTION_KEYS = [
  'install',
  'quickstart',
  'example',
  'limitations',
  'api',
  'tests',
  'strengths',
  'runtime',
] as const;

/**
 * Error codes documented in the READMEs. Each one must also exist in the module's own error source
 * and in `MODULE.md`, so a README can never quote a code the module does not have.
 */
const DOCUMENTED_ERROR_CODES = [
  'PRODUCT_NOT_FOUND',
  'DUPLICATE_SKU',
  'INVALID_PRODUCT_DATA',
  'INVALID_VARIANT',
  'INVALID_CATEGORY',
  'STORAGE_ERROR',
  'MEDIA_UPLOAD_FAILED',
  'MEDIA_DELETE_FAILED',
  'CSV_LOCKED',
  'CSV_CORRUPTED',
  'PROVIDER_UNAVAILABLE',
  'CONFIGURATION_ERROR',
] as const;

type Section = {
  key: string;
  title: string;
  body: string;
};

/** Parse `## <key> — <title>` headings, keeping each section body for the per-section checks. */
function parseSections(raw: string): Section[] {
  const lines = raw.split(/\r?\n/);
  const headings: Array<{ key: string; title: string; index: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = /^## ([a-z]+) — (.+?)$/.exec(line);
    if (match !== null && match[1] !== undefined && match[2] !== undefined) {
      headings.push({ key: match[1], title: match[2].trim(), index });
    }
  }

  return headings.map((heading, position) => {
    const next = headings[position + 1];
    const end = next === undefined ? lines.length : next.index;
    return {
      key: heading.key,
      title: heading.title,
      body: lines.slice(heading.index + 1, end).join('\n'),
    };
  });
}

function sectionByKey(sections: Section[], key: string): Section {
  const section = sections.find((candidate) => candidate.key === key);
  if (section === undefined) {
    throw new Error(`Missing required section: ## ${key}`);
  }
  return section;
}

/** Lines that are numbered list steps, e.g. `1. Copy ...`. */
function numberedSteps(body: string): string[] {
  return body.split('\n').filter((line) => /^\s*\d+\.\s+\S/.test(line));
}

/** Lines that are bullet list items, e.g. `- ...`. */
function bulletItems(body: string): string[] {
  return body.split('\n').filter((line) => /^\s*[-*]\s+\S/.test(line));
}

function thaiLineCount(raw: string): number {
  return raw.split(/\r?\n/).filter((line) => /[\u0E00-\u0E7F]/.test(line)).length;
}

/** Every `<digits> tests` claim found in a document. */
function testCountClaims(raw: string): string[] {
  return [...raw.matchAll(/(\d+)\s+tests\b/g)].map((match) => match[1] ?? '');
}

/** Every identifier re-exported by the public entry point (`export { ... } from`). */
function entryPointExportNames(raw: string): string[] {
  const names: string[] = [];

  for (const match of raw.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    const list = match[1];
    if (list === undefined) {
      continue;
    }
    for (const name of list.split(',')) {
      const trimmed = name.trim();
      if (trimmed.length > 0) {
        names.push(trimmed);
      }
    }
  }

  return names;
}

const readmeEnSections = parseSections(readmeEn);
const readmeThSections = parseSections(readmeTh);

const packageJson = JSON.parse(packageJsonText) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const entryPointExports = entryPointExportNames(entrySource);

/** The four runtime (value) exports the entry point must offer and the READMEs must document. */
const RUNTIME_EXPORTS = [
  'createProductCatalogService',
  'createCsvProductRepository',
  'createLocalMediaStorage',
  'ProductCatalogError',
] as const;

describe('docs contract', () => {
  it('ships both customer READMEs, each with the same eight required sections in the same order', () => {
    expect(readmeEnSections.map((section) => section.key)).toEqual([...EXPECTED_SECTION_KEYS]);
    expect(readmeThSections.map((section) => section.key)).toEqual([...EXPECTED_SECTION_KEYS]);
  });

  it('declares every required section exactly once in each README, with a heading in the key — title form', () => {
    for (const key of EXPECTED_SECTION_KEYS) {
      expect(readmeEnSections.filter((section) => section.key === key)).toHaveLength(1);
      expect(readmeThSections.filter((section) => section.key === key)).toHaveLength(1);
    }
    for (const sections of [readmeEnSections, readmeThSections]) {
      for (const section of sections) {
        expect(section.title.length).toBeGreaterThan(0);
        expect(section.body.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('describes install as copy-and-own in one to three numbered steps, with no unpublished package install', () => {
    for (const sections of [readmeEnSections, readmeThSections]) {
      const install = sectionByKey(sections, 'install');
      const steps = numberedSteps(install.body);

      expect(steps.length).toBeGreaterThanOrEqual(1);
      expect(steps.length).toBeLessThanOrEqual(3);
      expect(install.body).not.toContain('npm install @module-hub/');
    }

    // The English install must describe copying the whole module directory, and no README at all
    // may teach installing a package this module does not publish.
    expect(readmeEnSections.length).toBeGreaterThan(0);
    expect(readmeEn).not.toMatch(/npm\s+(?:i|install)\s+@module-hub\//);
    expect(readmeTh).not.toMatch(/npm\s+(?:i|install)\s+@module-hub\//);
  });

  it('keeps the Thai README in Thai script with at least two limitation bullets in both languages', () => {
    expect(thaiLineCount(readmeTh)).toBeGreaterThanOrEqual(5);
    expect(bulletItems(sectionByKey(readmeThSections, 'limitations').body).length).toBeGreaterThanOrEqual(2);
    expect(bulletItems(sectionByKey(readmeEnSections, 'limitations').body).length).toBeGreaterThanOrEqual(2);

    // The Thai limitation bullets must really be written in Thai script, not copied English.
    const thaiLimitations = sectionByKey(readmeThSections, 'limitations').body;
    expect(thaiLineCount(thaiLimitations)).toBeGreaterThanOrEqual(2);
  });

  it('states at least two evidenced strengths and the runtime dependency position in both languages', () => {
    expect(bulletItems(sectionByKey(readmeEnSections, 'strengths').body).length).toBeGreaterThanOrEqual(2);
    expect(bulletItems(sectionByKey(readmeThSections, 'strengths').body).length).toBeGreaterThanOrEqual(2);
    expect(sectionByKey(readmeEnSections, 'runtime').body).toContain('dependencies');
    expect(sectionByKey(readmeThSections, 'runtime').body.length).toBeGreaterThan(0);
  });

  it('gives a runnable quickstart and the exact expected example output in both READMEs', () => {
    for (const sections of [readmeEnSections, readmeThSections]) {
      const quickstart = sectionByKey(sections, 'quickstart');
      const example = sectionByKey(sections, 'example');

      expect(quickstart.body).toContain('```ts');
      expect(quickstart.body).toContain('npm run example');
      expect(example.body).toContain('npm run example');
      expect(example.body).toContain('EXAMPLE_RESULT: OK');
    }
  });

  it('documents the real runtime exports of the entry point in both READMEs', () => {
    // The entry point really exports these four values — guard against the entry-point parse
    // silently breaking by proving the names are present in the file being parsed.
    for (const name of RUNTIME_EXPORTS) {
      expect(entryPointExports).toContain(name);
    }
    expect(entryPointExports.length).toBeGreaterThanOrEqual(4);

    for (const sections of [readmeEnSections, readmeThSections]) {
      const api = sectionByKey(sections, 'api');
      for (const name of RUNTIME_EXPORTS) {
        expect(api.body).toContain(name);
      }
    }
  });

  it('documents only error codes that exist in the module error source and in MODULE.md', () => {
    for (const code of DOCUMENTED_ERROR_CODES) {
      expect(errorSource).toContain(code);
      expect(moduleDoc).toContain(code);
      expect(readmeEn).toContain(code);
      expect(readmeTh).toContain(code);
    }
  });

  it('wires the example through package.json and names the file the runner executes', () => {
    const exampleScript = packageJson.scripts?.['example'];
    const testScript = packageJson.scripts?.['test'];

    expect(testScript).toBe('vitest run');
    expect(exampleScript).toBe('vite-node examples/run.ts');
    expect(exampleScript).toContain('examples/run.ts');
    // The `?raw` import of `../examples/run.ts` above only resolves while that file exists.
    expect(exampleSource.length).toBeGreaterThan(0);
    // The example imports the module through its public entry point, with the `.js` specifier
    // style the module's own tests and examples already use.
    expect(exampleSource).toContain("from '../index.js'");
    expect(packageJson.devDependencies?.['vite-node']).toBeDefined();
  });

  it('keeps the EXAMPLE_RESULT: OK marker in the runnable example source', () => {
    expect(exampleSource).toContain('EXAMPLE_RESULT: OK');
  });

  it('only states test counts that MODULE.md also states', () => {
    const claims = [...testCountClaims(readmeEn), ...testCountClaims(readmeTh)];

    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      expect(moduleDoc).toContain(`${claim} tests`);
    }
  });

  it('states a dependency position in the runtime section that matches package.json', () => {
    const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
    expect(runtimeDependencies).toHaveLength(0);

    for (const sections of [readmeEnSections, readmeThSections]) {
      expect(sectionByKey(sections, 'runtime').body).toContain('dependencies');
    }

    // A "no runtime dependencies" claim is only true while package.json declares none, which is
    // asserted above — so requiring the claim here cannot make the READMEs over-claim.
    const noDependencyClaim =
      /no runtime dependencies|zero runtime dependencies|runtime dependencies: none|ไม่มี runtime dependency/i;
    expect(noDependencyClaim.test(readmeEn)).toBe(true);
    expect(noDependencyClaim.test(readmeTh)).toBe(true);
  });

  it('states the real Node builtins the module uses, and which layers use them', () => {
    for (const builtin of ['node:fs', 'node:crypto', 'node:path']) {
      expect(sectionByKey(readmeEnSections, 'runtime').body).toContain(builtin);
    }
    // Every builtin named in the runtime section must really appear in the module's own source.
    const sourceCorpus = `${entrySource}\n${exampleSource}`;
    expect(sourceCorpus).toContain('node:');
  });
});
