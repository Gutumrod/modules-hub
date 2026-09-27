/// <reference types="vite/client" />

/**
 * Documentation contract guard.
 *
 * Asserts the customer-facing documentation of this module from the files on disk, so the
 * README/TH contract cannot silently regress (a deleted or renamed section fails this suite).
 * All documents and the example are imported with `?raw`, which the module's vite/vitest
 * setup supports.
 */

import { describe, expect, it } from 'vitest';

import moduleDoc from '../MODULE.md?raw';
import packageJsonText from '../package.json?raw';
import readmeEn from '../README.md?raw';
import readmeTh from '../README.th.md?raw';
import exampleSource from '../examples/run.ts?raw';

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
    const match = /^## ([a-z]+) — (.+)$/.exec(lines[index] ?? '');
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

const readmeEnSections = parseSections(readmeEn);
const readmeThSections = parseSections(readmeTh);

const packageJson = JSON.parse(packageJsonText) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe('docs contract', () => {
  it('ships both customer READMEs, each with the eight required sections in order', () => {
    expect(readmeEnSections.map((section) => section.key)).toEqual([...EXPECTED_SECTION_KEYS]);
    expect(readmeThSections.map((section) => section.key)).toEqual([...EXPECTED_SECTION_KEYS]);
  });

  it('declares every required section exactly once', () => {
    for (const key of EXPECTED_SECTION_KEYS) {
      expect(readmeEnSections.filter((section) => section.key === key)).toHaveLength(1);
      expect(readmeThSections.filter((section) => section.key === key)).toHaveLength(1);
    }
  });

  it('gives every document section a non-empty body and title', () => {
    for (const sections of [readmeEnSections, readmeThSections]) {
      for (const section of sections) {
        expect(section.title.length).toBeGreaterThan(0);
        expect(section.body.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('describes install as copy-and-own in at most three numbered steps', () => {
    for (const sections of [readmeEnSections, readmeThSections]) {
      const install = sectionByKey(sections, 'install');
      const steps = numberedSteps(install.body);
      expect(steps.length).toBeGreaterThanOrEqual(1);
      expect(steps.length).toBeLessThanOrEqual(3);
      expect(install.body).not.toContain('npm install @module-hub/');
    }
  });

  it('keeps the Thai README in Thai script with at least two limitation bullets', () => {
    expect(thaiLineCount(readmeTh)).toBeGreaterThanOrEqual(5);
    expect(bulletItems(sectionByKey(readmeThSections, 'limitations').body).length).toBeGreaterThanOrEqual(2);
    expect(bulletItems(sectionByKey(readmeEnSections, 'limitations').body).length).toBeGreaterThanOrEqual(2);
  });

  it('states at least two evidenced strengths and the runtime facts', () => {
    expect(bulletItems(sectionByKey(readmeEnSections, 'strengths').body).length).toBeGreaterThanOrEqual(2);
    expect(bulletItems(sectionByKey(readmeThSections, 'strengths').body).length).toBeGreaterThanOrEqual(2);
    expect(sectionByKey(readmeEnSections, 'runtime').body.length).toBeGreaterThan(0);
  });

  it('states that the TypeScript entry point needs a TS-aware runner in both languages', () => {
    expect(readmeEn).toMatch(/plain Node\s+ESM cannot import this source entry point directly/);
    expect(readmeTh).toContain('Node ESM');
    expect(readmeEn).toContain('npm run example');
    expect(readmeTh).toContain('npm run example');
  });

  it('wires the example through the package.json scripts and names the runnable file', () => {
    const exampleScript = packageJson.scripts?.['example'];
    const testScript = packageJson.scripts?.['test'];

    expect(testScript).toBe('vitest run');
    expect(exampleScript).toBe('vite-node examples/run.ts');
    expect(exampleScript).toContain('/run.ts');
    // The `?raw` import above only resolves when examples/run.ts exists on disk.
    expect(exampleSource.length).toBeGreaterThan(0);
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
