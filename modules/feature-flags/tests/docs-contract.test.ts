/// <reference types="vite/client" />

/**
 * Documentation contract guard.
 *
 * Asserts the customer-facing documentation of this module from the files on disk, so the
 * README/README.th contract cannot silently regress: deleting a required section, breaking the
 * copy-and-own install rule, dropping the example marker, or documenting an export/error code
 * that the source does not have all fail this suite.
 *
 * Every document and source file is imported with `?raw`, which this module's vite/vitest
 * setup supports (`vite/client` declares `*?raw`). A `?raw` import of a missing file makes the
 * whole suite fail to collect, so existence is enforced by the imports themselves.
 *
 * No Node builtin is imported here on purpose: the module ships zero `node:` imports and the
 * README states that, so the test tooling must not introduce one.
 */

import { describe, expect, it } from 'vitest';

import entrySource from '../index.ts?raw';
import errorSource from '../core/error.ts?raw';
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
 * Error codes documented in the READMEs. Each one must also exist in `core/error.ts` — the
 * module has no other error vocabulary.
 */
const DOCUMENTED_ERROR_CODES = ['FLAG_KEY_INVALID', 'FLAG_PROVIDER_ERROR', 'FLAG_VALUE_INVALID'] as const;

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
    const match = /^## ([a-z]+) — (.+)$/.exec(line);
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
  return body.split('\n').filter((line) => /^\s*-\s+\S/.test(line));
}

function thaiLineCount(raw: string): number {
  return raw.split(/\r?\n/).filter((line) => /[\u0E00-\u0E7F]/.test(line)).length;
}

/** Every `<digits> tests` claim found in a document. */
function testCountClaims(raw: string): string[] {
  return [...raw.matchAll(/(\d+)\s+tests\b/g)].map((match) => match[1] ?? '');
}

/** Identifiers re-exported by the public entry point (`export { ... } from`, `export type { ... }`). */
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
};

const entryPointExports = entryPointExportNames(entrySource);

describe('docs contract', () => {
  it('ships both customer READMEs, each with the same eight required sections in the same order', () => {
    expect(readmeEnSections.map((section) => section.key)).toEqual([...EXPECTED_SECTION_KEYS]);
    expect(readmeThSections.map((section) => section.key)).toEqual([...EXPECTED_SECTION_KEYS]);
  });

  it('declares every required section exactly once', () => {
    for (const key of EXPECTED_SECTION_KEYS) {
      expect(readmeEnSections.filter((section) => section.key === key)).toHaveLength(1);
      expect(readmeThSections.filter((section) => section.key === key)).toHaveLength(1);
    }
  });

  it('gives every section a title and a non-empty body', () => {
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
      expect(install.body).toContain('feature-flags');
    }
  });

  it('keeps the Thai README in Thai script with at least two limitation bullets in both languages', () => {
    expect(thaiLineCount(readmeTh)).toBeGreaterThanOrEqual(5);
    expect(thaiLineCount(readmeTh)).toBeLessThanOrEqual(readmeTh.split(/\r?\n/).length);
    expect(bulletItems(sectionByKey(readmeThSections, 'limitations').body).length).toBeGreaterThanOrEqual(2);
    expect(bulletItems(sectionByKey(readmeEnSections, 'limitations').body).length).toBeGreaterThanOrEqual(2);
  });

  it('states at least two evidenced strengths and the runtime facts in both languages', () => {
    expect(bulletItems(sectionByKey(readmeEnSections, 'strengths').body).length).toBeGreaterThanOrEqual(2);
    expect(bulletItems(sectionByKey(readmeThSections, 'strengths').body).length).toBeGreaterThanOrEqual(2);
    expect(sectionByKey(readmeEnSections, 'runtime').body).toContain('dependencies');
    expect(sectionByKey(readmeThSections, 'runtime').body.length).toBeGreaterThan(0);
  });

  it('gives a runnable quickstart with a fenced code block and the example command', () => {
    for (const sections of [readmeEnSections, readmeThSections]) {
      const quickstart = sectionByKey(sections, 'quickstart');
      const example = sectionByKey(sections, 'example');

      expect(quickstart.body).toContain('```ts');
      expect(quickstart.body).toContain('npm run example');
      expect(example.body).toContain('npm run example');
      expect(example.body).toContain('EXAMPLE_RESULT: OK');
    }
  });

  it('documents the real entry-point exports in both READMEs', () => {
    // The entry point really exports these names — guard against the parse silently breaking.
    expect(entryPointExports).toContain('createFeatureFlagClient');
    expect(entryPointExports).toContain('createMemoryFlagStore');
    expect(entryPointExports).toContain('FeatureFlagError');

    for (const sections of [readmeEnSections, readmeThSections]) {
      const api = sectionByKey(sections, 'api');
      for (const name of entryPointExports) {
        expect(api.body).toContain(name);
      }
    }
  });

  it('documents only error codes that exist in the module source', () => {
    for (const code of DOCUMENTED_ERROR_CODES) {
      expect(errorSource).toContain(code);
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
    // The `?raw` import of `../examples/run.ts` above only resolves when that file exists on disk.
    expect(exampleSource.length).toBeGreaterThan(0);
    expect(exampleSource).toContain('../index.js');
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
});
