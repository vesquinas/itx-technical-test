/**
 * Verifies the factual claims this README makes.
 *
 * ## Why this exists
 *
 * The first version of this project documented as *done* three things that were not true: that the
 * cart worked (it could not, cross-origin), that error responses did not repeat the request back
 * (they did), and that the API URL was configurable (configuring it broke the build). All three
 * were in the most extensively written sections. An external review put it exactly right: **the
 * confidence of the documentation was inversely correlated with its verification** — and the
 * corrections happened because a person read it, not because anything would have caught them.
 *
 * The rule it asked for is the rule this script enforces: **no claim in a README without a command
 * that proves it.** Behavioural claims are proved by the test suites; the numbers are proved here,
 * because numbers are what rot silently — a test added last week leaves a README a week wrong, and
 * nothing complains.
 *
 * ## What it can and cannot do
 *
 * It checks that every number and list this README states matches reality, and that the claims and
 * their proofs have not drifted apart in either direction. What it cannot do is notice a *new*
 * sentence that asserts something unverified: a script cannot tell prose from a claim. That is why
 * both READMEs carry a table pairing each substantive claim with the command that proves it, and
 * why this script verifies that every command that table names actually exists. The remaining gap
 * is honest and stated rather than pretended away.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const README = readFileSync('README.md', 'utf8');
const PACKAGE = JSON.parse(readFileSync('package.json', 'utf8'));
const ARTEFACTS = '.claims';

const problems = [];
const passed = [];

function check(description, condition, detail = '') {
  if (condition) {
    passed.push(description);
  } else {
    problems.push(`${description}${detail === '' ? '' : ` — ${detail}`}`);
  }
}

/** The single number a pattern captures in the README, or `undefined` if it is not there. */
function claimed(pattern) {
  const match = pattern.exec(README);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

// ---------------------------------------------------------------------------
// The suite: run once, with both reports, and read the numbers out of them.
// ---------------------------------------------------------------------------

mkdirSync(ARTEFACTS, { recursive: true });
const testReport = join(ARTEFACTS, 'tests.json');

console.log('  ..  running the suite to count what it actually contains');
execFileSync(
  'npx',
  [
    'vitest',
    'run',
    '--reporter=json',
    `--outputFile=${testReport}`,
    '--coverage',
    '--coverage.reporter=json-summary',
    '--coverage.reportsDirectory=' + join(ARTEFACTS, 'coverage'),
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);

const report = JSON.parse(readFileSync(testReport, 'utf8'));
const actualTests = report.numTotalTests;
const actualFailures = report.numFailedTests;

check('the suite passes', actualFailures === 0, `${actualFailures} failing`);

const claimedTests = claimed(/^(\d+) tests\./m);
check(
  `the README's test count is right (says ${claimedTests ?? '—'}, suite has ${actualTests})`,
  claimedTests === actualTests,
);

const coverage = JSON.parse(
  readFileSync(join(ARTEFACTS, 'coverage', 'coverage-summary.json'), 'utf8'),
).total;
const claimedStatements = claimed(/(\d+)% statement coverage/);
check(
  `the claimed statement coverage is not above the real one (says ${claimedStatements ?? '—'}%, is ${coverage.statements.pct.toFixed(1)}%)`,
  claimedStatements !== undefined && claimedStatements <= Math.round(coverage.statements.pct),
);
const claimsFullFunctions = /100% function coverage/.test(README);
check(
  `function coverage is 100% as claimed (is ${coverage.functions.pct}%)`,
  !claimsFullFunctions || coverage.functions.pct === 100,
);

// ---------------------------------------------------------------------------
// The compliance table: every test it cites as proof has to exist.
// ---------------------------------------------------------------------------

/**
 * The compliance table, row by row, and every proof it names.
 *
 * The first version of this extracted citations with a regex, `[a-z][a-z0-9 ,'\-—()]{10,}`, and
 * that class has no capitals in it — so three of the twenty-four names it should have checked were
 * discarded before being checked, all three because they contain "API", and the output said nothing
 * about having skipped them. A review proved it by replacing one with `teleports the API counter to
 * Mars`, which passed.
 *
 * The lesson is not that the class needed `A-Z`. It is that **a checker must not get to decide in
 * silence what it checks**: anything it cannot classify is now reported, and a row whose proof it
 * cannot make sense of fails. Whatever the next unclassifiable proof looks like, it will be loud.
 */
const complianceTable = README.split('## What the brief asks')[1]?.split('\n## ')[0] ?? '';
const complianceRows = complianceTable
  .split('\n')
  .filter((line) => line.startsWith('|') && !/^\|\s*-+/.test(line) && !line.includes('| The brief asks |'));

const testNames = new Set(
  report.testResults.flatMap((file) => file.assertionResults.map((result) => result.title)),
);

/** A proof that names a command to run rather than a test to look up. */
const isCommand = (proof) => /^(npm|git|\.\/mvnw|docker)\b/.test(proof);
/** A proof that names a file or a symbol in the code. */
const isCodeReference = (proof) => proof.includes('/') || /\.\w+$/.test(proof) || !proof.includes(' ');

let citedTests = 0;
let namedCommands = 0;
const provedByProse = [];

for (const row of complianceRows) {
  const cells = row.split('|').map((cell) => cell.trim());
  const proofCell = cells.at(-2) ?? '';
  const quoted = [...proofCell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

  if (quoted.length === 0) {
    provedByProse.push(`${cells[1]?.slice(0, 48) ?? '?'} → ${proofCell.slice(0, 40)}`);
    continue;
  }

  for (const proof of quoted) {
    if (isCommand(proof)) {
      namedCommands += 1;
      const script = /^npm (?:run )?([\w:]+)$/.exec(proof)?.[1];
      if (script !== undefined) {
        check(`the proof \`${proof}\` names a real script`, Object.hasOwn(PACKAGE.scripts, script));
      }
    } else if (isCodeReference(proof)) {
      // A path or a symbol: checked by the file existing, not by a test name.
      check(`the proof \`${proof}\` points at a file that exists`, !proof.includes('/') || existsSync(proof));
    } else {
      citedTests += 1;
      check(`the test cited as proof exists: "${proof}"`, testNames.has(proof));
    }
  }
}

check(
  `every citation in the compliance table was classified (${citedTests} tests, ${namedCommands} commands)`,
  citedTests + namedCommands > 0,
);
check(
  `the compliance table still cites at least twenty tests (${citedTests})`,
  citedTests >= 20,
);
if (provedByProse.length > 0) {
  console.log(
    `  ..  ${provedByProse.length} row(s) of the compliance table are proved by prose rather than by a command:`,
  );
  for (const row of provedByProse) console.log(`        ${row}`);
}

// ---------------------------------------------------------------------------
// The scripts table: drift in either direction is a defect.
// ---------------------------------------------------------------------------

const documentedScripts = new Set(
  [...README.matchAll(/^\| `npm (?:run )?([\w:]+)`/gm)].map((match) => match[1]),
);
const realScripts = new Set(Object.keys(PACKAGE.scripts));
// `dev` is an alias of `start` for anyone arriving from Vite's conventions, and documenting both
// would be noise. It is the one deliberate omission.
realScripts.delete('dev');

for (const script of realScripts) {
  check(`\`${script}\` is documented`, documentedScripts.has(script));
}
for (const script of documentedScripts) {
  check(`the documented \`${script}\` exists`, realScripts.has(script));
}

/** The four the brief requires by name. */
for (const required of ['start', 'build', 'test', 'lint']) {
  check(`the brief's \`${required}\` script exists`, realScripts.has(required));
}

// ---------------------------------------------------------------------------
// The endpoints: what the README lists has to be what the code calls.
// ---------------------------------------------------------------------------

const sourceOf = (path) => readFileSync(path, 'utf8');
const productsSource = sourceOf('src/api/products.ts');
/**
 * The paths the code builds, with the variable segments normalised to `:param`.
 *
 * A quoted segment is a literal path element; anything else is a variable, and the difference is
 * the quotes — which is why they are tested for before being stripped. Getting that backwards was
 * this script's own first bug, and it reported a path of `/api/product/id`.
 */
const calledPaths = new Set(
  [...productsSource.matchAll(/buildUrl\(\[([^\]]+)\]\)/g)].map((match) =>
    match[1]
      .split(',')
      .map((raw) => raw.trim())
      .map((segment) =>
        segment.startsWith("'") ? segment.replaceAll("'", '') : ':param',
      )
      .join('/'),
  ),
);

/** The endpoints the README's table documents, normalised the same way. */
const documentedPaths = new Set(
  [...README.matchAll(/`(?:GET|POST) \/(api\/[\w:/]+)`/g)].map(([, path]) =>
    path.replace(/:\w+/g, ':param'),
  ),
);

for (const path of calledPaths) {
  check(`the endpoint /${path} is in the README's table`, documentedPaths.has(path));
}
for (const path of documentedPaths) {
  check(`the documented endpoint /${path} is one the code calls`, calledPaths.has(path));
}

// ---------------------------------------------------------------------------
// Comment density: the figure the README states, computed the same way.
// ---------------------------------------------------------------------------

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function density(paths) {
  let comments = 0;
  let lines = 0;
  for (const path of paths) {
    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      const line = raw.trim();
      if (line === '') continue;
      lines += 1;
      if (/^(\/\/|\/\*|\*)/.test(line)) comments += 1;
    }
  }
  return (100 * comments) / lines;
}

const allSources = sourceFiles('src');
const isTest = (path) => /\.test\.tsx?$/.test(path) || path.includes(`src${'/'}test${'/'}`);
const withTests = density(allSources);
const applicationOnly = density(allSources.filter((path) => !isTest(path)));

// One point of tolerance: the README states whole numbers, and a couple of lines either way should
// not fail a build. Ten points of drift should.
const claimedWithTests = claimed(/(\d+)% of the lines of `src` counting the tests/);
check(
  `the density claim including tests is current (says ${claimedWithTests ?? '—'}%, is ${withTests.toFixed(1)}%)`,
  claimedWithTests !== undefined && Math.abs(claimedWithTests - withTests) <= 1,
);
const claimedApplication = claimed(/(\d+)% of the application code alone/);
check(
  `the density claim for the application is current (says ${claimedApplication ?? '—'}%, is ${applicationOnly.toFixed(1)}%)`,
  claimedApplication !== undefined && Math.abs(claimedApplication - applicationOnly) <= 1,
);

// ---------------------------------------------------------------------------
// The CSP check count, and that the proof commands named in the README exist.
// ---------------------------------------------------------------------------

/**
 * The origin the build in `dist` was made for, read out of its own policy.
 *
 * Without this the check depended on how `dist` happened to be built: continuous integration
 * builds a second time against a configured origin, and this script then ran the CSP check with no
 * origin configured and reported five failures that were an artefact of its own ordering. Asking
 * the artefact which origin it was built for makes the check independent of that.
 */
function originOfTheBuild() {
  const html = readFileSync(join('dist', 'index.html'), 'utf8');
  const policy = (/content="([^"]*connect-src[^"]*)"/.exec(html)?.[1] ?? '')
    // The entities have to go first: `&#39;` ends in a semicolon, so a pattern that stops at the
    // directive separator cannot cross one. That was this function's second bug.
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
  return /connect-src [^;]*?(https?:\/\/[^\s;']+)/.exec(policy)?.[1];
}

if (existsSync('dist')) {
  const builtFor = originOfTheBuild();
  const cspOutput = execFileSync('node', ['scripts/check-csp.mjs'], {
    encoding: 'utf8',
    env: builtFor === undefined ? process.env : { ...process.env, VITE_API_BASE_URL: builtFor },
  });
  const reported = /(\d+) CSP checks passed/.exec(cspOutput)?.[1];
  const claimedChecks = /Eighteen checks/.test(README) ? 18 : undefined;
  check(
    `the README's count of CSP checks is right (says ${claimedChecks ?? '—'}, script reports ${reported ?? '—'})`,
    claimedChecks !== undefined && String(claimedChecks) === reported,
  );
} else {
  check('dist exists so the CSP claim can be checked', false, 'run `npm run build` first');
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// The numbers measured against the API, and the number of commits.
//
// These are the ones this check used to miss, and a review proved it by falsifying five of them
// and watching both gates pass. The pattern was that everything coming from configuration was
// covered and everything coming from *measurement* was not — which is the wrong way round, since
// configuration is stable and a measurement moves.
//
// The fix is a single source of truth: `scripts/api-facts.json`. `npm run check:api` asserts those
// numbers against the live API; this asserts the READMEs quote them. Neither half is any use alone.
// ---------------------------------------------------------------------------

const FACTS = JSON.parse(readFileSync('scripts/api-facts.json', 'utf8'));
const rootReadme = readFileSync('../README.md', 'utf8');

const numbersFromTheApi = [
  ['products in the catalogue', /all (\d+) products, no pagination/, FACTS.products],
  ['products in the endpoint table', /The catalogue: \*\*(\d+) products\*\*/, FACTS.products],
  ['products with no price', /comes as `""` in (\d+) of the 100 products/, FACTS.withoutPrice],
  ['products with no NFC value', /`nfc` arrives empty in (\d+) of the 100 products/, FACTS.withoutNfc],
  ['products with a blank option name', /`\{ code: 2000, name: " " \}`/, undefined],
];

for (const [name, pattern, expected] of numbersFromTheApi) {
  if (expected === undefined) continue;
  const stated = claimed(pattern);
  check(
    `the stated ${name} matches api-facts.json (says ${stated ?? '—'}, facts say ${expected})`,
    stated === expected,
  );
}

/**
 * And **every** mention of the catalogue's size, not the first one that happens to match.
 *
 * A review made this point against the backend's checker, where asserting that a README
 * "contains" a string was satisfied by any one of its three occurrences while the others said
 * something else. The same weakness was here: the size of the catalogue is written eight times and
 * two of them were being checked. What matters is that none of them disagrees.
 */
const productCounts = [...README.matchAll(/(\d+) products/g)].map((match) => Number(match[1]));
check(
  `all ${productCounts.length} mentions of the catalogue's size agree with api-facts.json`,
  productCounts.length > 0 && productCounts.every((count) => count === FACTS.products),
  [...new Set(productCounts)].join(', '),
);

/**
 * The number of commits, which the READMEs both state.
 *
 * Skipped rather than failed on a shallow clone: continuous integration checks out with a depth of
 * one by default, and a check that cannot run is not the same as a check that fails.
 */
const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim();
if (shallow === 'true') {
  console.log('  ..  skipping the commit count: this is a shallow clone');
} else {
  const commits = Number(
    execFileSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim(),
  );
  for (const [label, markdown] of [['README.md', README], ['../README.md', rootReadme]]) {
    const stated = Number(/(\d+) commits/.exec(markdown)?.[1]);
    check(
      `${label}: the stated number of commits is right (says ${stated || '—'}, there are ${commits})`,
      // The count grows with the commit that updates it, so it is right or one behind.
      stated === commits || stated === commits + 1,
    );
  }
}

// A single page, rendered in the browser: what "SPA, no MPA, no SSR" means in the artefact.
//
// The behavioural half — that a view change is a client-side navigation — is a test. This half
// cannot be: it is a property of what the build produces, and the review that read the test bodies
// was right that an `href` assertion proved neither.
// ---------------------------------------------------------------------------

if (existsSync('dist')) {
  const pages = readdirSync('dist').filter((entry) => entry.endsWith('.html'));
  check(`the build is a single HTML page, not several (${pages.join(', ')})`, pages.length === 1);

  const html = readFileSync(join('dist', pages[0] ?? 'index.html'), 'utf8');
  const root = /<div id="root">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? 'missing';
  check(
    'the served HTML carries no pre-rendered markup, so nothing is server-rendered',
    root.trim() === '',
    `#root contains ${root.trim().slice(0, 40)}`,
  );
  check(
    'the application is loaded as a module script',
    /<script type="module"[^>]*src="[^"]+"/.test(html),
  );
}

// ---------------------------------------------------------------------------
// Internal links: a section that was renamed leaves a link that goes nowhere.
// ---------------------------------------------------------------------------

/** GitHub's own slugs: lower-cased, punctuation dropped, spaces to hyphens. */
function sectionsOf(markdown) {
  return new Set(
    [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) =>
      heading
        .toLowerCase()
        .replaceAll(/[`*[\]()]/g, '')
        .replaceAll(/[^\w\s-]/g, '')
        .trim()
        // Each space becomes a hyphen, not each run of them: an em dash between spaces leaves a
        // double hyphen in GitHub's slug, and collapsing them makes this check lie.
        .replaceAll(/\s/g, '-'),
    ),
  );
}

for (const file of ['README.md', '../README.md']) {
  const markdown = readFileSync(file, 'utf8');
  const sections = sectionsOf(markdown);
  for (const [, label, target] of markdown.matchAll(/\[([^\]]+)\]\(#([^)]+)\)/g)) {
    check(`${file}: the link "${label}" points at a section that exists`, sections.has(target));
  }
}

// ---------------------------------------------------------------------------
// Node version and dependencies, both stated in the README.
// ---------------------------------------------------------------------------

const claimedEngines = /\^20\.19\.0 \|\| >=22\.12\.0/.test(README);
check(
  "the README's Node requirement matches package.json",
  !claimedEngines || PACKAGE.engines.node === '^20.19.0 || >=22.12.0',
  PACKAGE.engines?.node,
);

const productionDependencies = Object.keys(PACKAGE.dependencies ?? {}).toSorted();
check(
  `the production dependencies are the three the README names (${productionDependencies.join(', ')})`,
  JSON.stringify(productionDependencies) === JSON.stringify(['react', 'react-dom', 'react-router']),
);

// ---------------------------------------------------------------------------

for (const description of passed) {
  console.log(`  ok  ${description}`);
}
for (const problem of problems) {
  console.error(`  FAIL  ${problem}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} claim(s) in the README are not true.`);
  process.exit(1);
}
console.log(`\n${passed.length} claims verified.`);
