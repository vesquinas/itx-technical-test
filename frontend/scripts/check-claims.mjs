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

const namedProofs = [...README.matchAll(/^\| .*`(npm (?:run )?[\w:]+|\.\/mvnw[\w\s:-]*)`/gm)].map(
  (match) => match[1],
);
for (const proof of new Set(namedProofs)) {
  const script = /^npm (?:run )?([\w:]+)$/.exec(proof)?.[1];
  if (script === undefined) continue;
  check(`the proof \`${proof}\` names a real script`, Object.hasOwn(PACKAGE.scripts, script));
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
