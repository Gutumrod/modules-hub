/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

import readmeEn from '../README.md?raw';
import readmeTh from '../README.th.md?raw';
import moduleDoc from '../MODULE.md?raw';
import packageJsonRaw from '../package.json?raw';
import exampleSource from '../examples/run.ts?raw';

/**
 * Documentation contract guard.
 *
 * The customer-facing documentation contract is identical for every module in
 * this repository, so it is checked by a script and not by eye. These
 * assertions read the real files from disk (through Vite's `?raw` imports, so a
 * deleted or renamed file makes this test file fail to load at all).
 *
 * Deleting a required README section, dropping the Thai README, adding a
 * forbidden install command, or pointing the example script at a missing file
 * all make this test fail.
 */

// Keys must appear in this order in both README files.
const SECTION_KEYS = [
  'install',
  'quickstart',
  'example',
  'limitations',
  'api',
  'tests',
  'strengths',
  'runtime',
] as const;

const EXPECTED_KEYS = SECTION_KEYS.join(',');

// The marker the runnable example prints on its final line.
const EXAMPLE_MARKER = 'EXAMPLE_RESULT: OK';

// Any Thai-script codepoint.
const THAI_SCRIPT = /[\u0E00-\u0E7F]/;

// A numbered step line: "1. ...", "2. ...", "3. ...".
const NUMBERED_STEP = /^\s*\d+\.\s+\S/;

// A markdown bullet line.
const BULLET = /^\s*[-*]\s+\S/;

// A forbidden unpublished-package install line.
const FORBIDDEN_INSTALL = 'npm install @module-hub/';

type Section = { key: string; title: string; body: string };

/** Parse `## <key> — <title>` sections in document order. */
function parseSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let current: { key: string; title: string; lines: string[] } | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      if (current) {
        sections.push({ key: current.key, title: current.title, body: current.lines.join('\n') });
      }
      const heading = line.slice(3).trim();
      const separator = heading.indexOf(' — ');
      current = {
        key: separator === -1 ? heading : heading.slice(0, separator).trim(),
        title: separator === -1 ? '' : heading.slice(separator + ' — '.length).trim(),
        lines: [],
      };
      continue;
    }
    if (current) current.lines.push(line);
  }

  if (current) {
    sections.push({ key: current.key, title: current.title, body: current.lines.join('\n') });
  }

  return sections;
}

function sectionKeys(markdown: string): string {
  return parseSections(markdown).map((section) => section.key).join(',');
}

function sectionByKey(markdown: string, key: string): Section {
  const section = parseSections(markdown).find((candidate) => candidate.key === key);
  expect(section, `README section "## ${key} — ..." is missing`).toBeDefined();
  return section as Section;
}

function bulletsOf(body: string): string[] {
  return body.split(/\r?\n/).filter((line) => BULLET.test(line));
}

function numberedStepsOf(body: string): string[] {
  return body.split(/\r?\n/).filter((line) => NUMBERED_STEP.test(line));
}

function testCountsIn(text: string): string[] {
  return [...text.matchAll(/(\d+)\s+tests?\b/g)].map((match) => match[1]);
}

// Real paths of the files under examples/ (module resolution proof of existence).
const exampleFiles = import.meta.glob('../examples/*', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const packageJson = JSON.parse(packageJsonRaw) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
};

describe('documentation contract', () => {
  it('ships both README files with the same eight section keys in the same order', () => {
    expect(readmeEn.trim().length).toBeGreaterThan(0);
    expect(readmeTh.trim().length).toBeGreaterThan(0);

    expect(sectionKeys(readmeEn)).toBe(EXPECTED_KEYS);
    expect(sectionKeys(readmeTh)).toBe(EXPECTED_KEYS);

    for (const section of [...parseSections(readmeEn), ...parseSections(readmeTh)]) {
      expect(section.title.length, `section "${section.key}" has no title`).toBeGreaterThan(0);
    }
  });

  it('ships a Thai README that really carries Thai script and at least two limitation bullets', () => {
    const thaiLines = readmeTh.split(/\r?\n/).filter((line) => THAI_SCRIPT.test(line));
    expect(thaiLines.length).toBeGreaterThanOrEqual(5);

    const limitations = sectionByKey(readmeTh, 'limitations');
    expect(bulletsOf(limitations.body).length).toBeGreaterThanOrEqual(2);
  });

  it('documents a copy-and-own install in at most three steps and never an unpublished package install', () => {
    for (const readme of [readmeEn, readmeTh]) {
      const steps = numberedStepsOf(sectionByKey(readme, 'install').body);
      expect(steps.length).toBeGreaterThanOrEqual(1);
      expect(steps.length).toBeLessThanOrEqual(3);
      expect(readme).not.toContain(FORBIDDEN_INSTALL);
    }

    const installEn = sectionByKey(readmeEn, 'install').body;
    expect(installEn).toMatch(/copy/i);
    expect(installEn).toMatch(/module (directory|folder)/i);
  });

  it('states at least two real limitations on the first page of the English README', () => {
    expect(bulletsOf(sectionByKey(readmeEn, 'limitations').body).length).toBeGreaterThanOrEqual(2);
  });

  it('exposes example and test scripts whose referenced file really exists', () => {
    const exampleScript = packageJson.scripts?.example ?? '';
    const testScript = packageJson.scripts?.test ?? '';

    expect(exampleScript).not.toBe('');
    expect(testScript).not.toBe('');

    const examplePath = exampleScript.trim().split(/\s+/).pop() as string;
    expect(Object.keys(exampleFiles)).toContain(`../${examplePath}`);
    expect(exampleFiles[`../${examplePath}`].trim().length).toBeGreaterThan(0);
  });

  it('prints the EXAMPLE_RESULT: OK marker from the runnable example source', () => {
    expect(exampleSource).toContain(EXAMPLE_MARKER);
    // The marker must be the start of a printed line, not a stray comment.
    expect(exampleSource).toContain(`\`${EXAMPLE_MARKER}`);
    expect(exampleSource).toMatch(/console\.log\(/);
    // The example must reach the module through its public entry point.
    expect(exampleSource).toContain("from '../index.js'");
  });

  it('never claims a test count in a README that MODULE.md does not also state', () => {
    const documentedCounts = new Set(testCountsIn(moduleDoc));
    const readmeCounts = [...testCountsIn(readmeEn), ...testCountsIn(readmeTh)];

    expect(readmeCounts.length).toBeGreaterThan(0);
    for (const count of readmeCounts) {
      expect(documentedCounts.has(count), `README test count "${count}" is not stated in MODULE.md`).toBe(
        true
      );
    }
  });
});
