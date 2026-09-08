# Frontend test — Mobile device store

Small shopping application for mobile phones: a product list with search, and a detail page with
option selection and add-to-cart.

Single-page application with client-side routing, no server rendering and no document navigation.

**Live demo: https://vesquinas.github.io/itx-technical-test/** — published from this repository on
every push to `main`, so it can be tried without installing anything. The API allows cross-origin
requests, so the demo is fully functional, adding products to the cart included.

## Language

Code, comments and documentation are in English. **The user-facing copy is in Spanish**, because
that is the language of the market and of the specification, which names the controls in Spanish
("botón de Añadir", "añadir a la cesta"). In a real project that copy would live behind an i18n
layer instead of being embedded in the components.

## How to run it

Requires **Node `^20.19.0` or `>=22.12.0`**, which is what Vite 8 demands. Node 20.0–20.18 and the
whole 21 branch will not work: the requirement is declared in `engines` in `package.json`, so
`npm install` warns before anything breaks.

```bash
npm install
npm start          # development mode, on http://localhost:5173
```

> **The first load takes about 40 seconds.** That is not the application: the test API is hosted on
> Render's free tier, which shuts the service down when it receives no traffic, and the first
> request has to start it back up. The application explains this on screen while it waits, and
> caches the response so the wait is not repeated. This is measured, not estimated.

### Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Development mode with hot reload |
| `npm run build` | Production build (type-checks and bundles) |
| `npm test` | Runs the test suite once |
| `npm run lint` | Code checks (fails on any warning) |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests with a coverage report |
| `npm run typecheck` | Type checking only |
| `npm run check:csp` | Verifies the Content-Security-Policy of the built HTML |
| `npm run check:api` | Validates the parsers against the real API, all 100 products (needs network) |

The API URL can be changed with `VITE_API_BASE_URL`; see [`.env.example`](./.env.example).

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Framework | React 19 | Required by the brief |
| Language | TypeScript in strict mode | The API returns irregular data; types are what force you to deal with it |
| Bundler | Vite 8 | Instant start in development and minimal configuration |
| Routing | React Router 8 | The de facto standard for SPAs |
| Styling | CSS Modules + CSS custom properties | Local scope, no dependencies and no runtime |
| Tests | Vitest + Testing Library | Shares configuration with Vite, so there is no second build pipeline |
| Linter | oxlint | The one Vite installs by default; ships accessibility rules |

**No component library and no state library.** The brief says the level of detail of the design
proposal is taken into account, and with Material UI the design would be the library's. As for
state, React is enough: the cart's state is a counter and the catalogue's is handled by the data
layer.

## How the code is organised

```
src/
├── api/          HTTP client, response validation and the cached data layer
├── cart/         Cart state and its persistence
├── components/   Reusable interface components
├── domain/       Domain model and search logic (no React, no network)
├── hooks/        Async loading and delay hooks
├── lib/          Expiring cache, formatting and validation helpers
├── pages/        The two views, lazily loaded
└── test/         Test helpers and fixtures holding real API responses
```

The rule is that **no React may enter `domain/` or `lib/`**: they are pure functions and classes
with no interface dependencies, which makes them trivial to test and to reuse.

## Decisions worth explaining

### The one-hour client-side cache

This is the most specific requirement of the brief, so it is built as its own isolated unit in
[`src/lib/cache/`](./src/lib/cache).

Every entry is stored in an envelope carrying the format version, the expiry instant and the data.
Four design decisions:

1. **Validation happens on read, not only on write.** `get()` demands a parser. What comes out of
   `localStorage` is text the user can edit from the browser console, or that an earlier version of
   the application wrote: treating it as trusted data is what turns a cache into a security problem.
2. **On expiry the entry is discarded and revalidated** against the API, which is literally what
   the brief asks for. Serving the stale value while revalidating in the background
   (*stale-while-revalidate*) was considered, but that shows out-of-date information.
3. **Keys carry a namespace and a version.** Bumping the version invalidates everything cached in
   every browser at once, which is what you need to be able to do when the shape of the data
   changes: without it, anyone who already had data stored would keep reading the old format.
4. **No storage failure ever propagates.** The cache is an optimisation. When the quota runs out it
   frees its own entries and retries once; if `localStorage` is unavailable — Safari private
   browsing, third-party cookies blocked — it degrades to memory and the application keeps working.

The clock is injectable, so the tests check expiry by advancing a fake clock instead of waiting an
hour: it serves just before the hour, expires on the hour, and after revalidating starts counting a
fresh hour.

### The API and its surprises

The API's data has real defects. They are fixed **in a single place**
([`src/api/schema.ts`](./src/api/schema.ts)), translating into a domain model of our own, rather
than scattering those workarounds across the components:

| What happens | Detail | How it is handled |
| --- | --- | --- |
| Two fields with swapped contents | `displayResolution` carries **inches** and `displaySize` carries **pixels**, the opposite of what their names say | They are crossed back when translating, into `screenSize` and `screenResolution` |
| Misspelled names at the source | `dimentions` and `secondaryCmera` | Read under their real names and exposed spelled correctly |
| Ten fields change type per product | `cpu`, `os`, `sim`, `primaryCamera`, `wlan`, `sensors`… arrive as text or as a list | Always normalised to `string[]` |
| Empty price | `price` is text and comes as `""` in 6 of the 100 products | Translated to `null`, and the interface shows "Precio no disponible" |
| Empty fields | `nfc` arrives empty in every product of the catalogue | Rows with no value are dropped from the optional part of the spec sheet |
| Options with no name | `M900` and `DX650` deliver their only storage as `{ code: 2000, name: " " }` | The option is kept, because the code is valid and the code is all that is sent to the cart; the interface labels it "Estándar" |

The type-changing one is not cosmetic: **React renders an array by concatenating its elements with
no separator**, so an implementation that prints `product.cpu` directly shows
`"Deca-core (2x2.3 GHz Cortex-A724x1.9 GHz Cortex-A53"`.

These quirks were not found by reading the API but by walking through all of it. The script
`npm run check:api` pushes **the whole 100-product catalogue** through the same parsers the
application uses and reports two things: a product that cannot be translated, and any of these
quirks no longer holding — which would mean the API has been fixed and the translation needs
revisiting on purpose. It is not in continuous integration because it needs network and the API
takes about 40 seconds to wake up.

The test fixtures are real responses copied verbatim, so the tests double as executable
documentation: if the API is ever corrected, they will fail and the translation will have to be
adjusted deliberately.

### The cart counter

The brief asks to display **the value returned by the API** on add, and to persist it. That is what
the application does: the API is the source of truth and no parallel count is kept on the client.

Worth knowing: **`POST /api/cart` in this test always answers `{"count": 1}`**, including when
adding the second or third product (checked with successive requests). That is why the counter
stays at 1 while using the application: it is the mock's behaviour, not an implementation defect.
Against a real API reporting the true basket size, the code would work unchanged.

### The search term lives in the URL

It is reflected in the `?q=` parameter, which buys three things for free: the search can be shared
as a link, the browser's back button behaves as the user expects, and coming back from a detail
page restores the filtered list exactly as it was.

The input also keeps its own local state so typing is instant; only the URL write is delayed, and
with `replace` so no history entry is left behind for every keystroke. Filtering is **not** delayed:
the products are already in memory and delaying it would only add artificial latency.

The search ignores accents and requires every word, in any order, so "liquid acer" finds the "Acer
Liquid Z6".

### The spec sheet shows the required attributes even with no data

The brief asks to display "at least" eleven specific attributes. Hiding one because the API does not
provide it breaks the requirement, and **it is not a rare case**: across the 100 products of the
catalogue, 1 in 5 has at least one of those eleven empty (weight is missing in 7 products, RAM in 4,
the front camera in 4, battery and CPU in 1 each).

So the eleven required rows are always rendered, and when there is no data they say "No disponible".
That informs more than making the row disappear, which leaves the user unsure whether the data does
not exist or the page is incomplete. The **additional** attributes are dropped when empty: `nfc`,
for instance, arrives empty in all 100 products, and a label with nothing next to it adds nothing.

### The order of the second column comes from the wireframe

On the detail page, the description sits above the actions. Commercially the opposite is arguable —
the buy button as high as possible — but the brief asks to follow the structure of the screenshots,
and that outranks personal preference. A test asserts the order in the DOM so a refactor cannot
silently flip it.

### The option pickers

Radio groups inside a `fieldset` with a `legend`, not lists of buttons and not a `<select>`. That is
the element that matches a mutually exclusive choice: a screen reader announces "Color, group,
option 1 of 2" and the keyboard moves with the arrow keys without a line of code.

With a single option it is preselected, as the brief asks. With several, **none** is preselected and
the button stays disabled with an explanation next to it: colour and capacity determine which
product is being bought, and choosing on the user's behalf invites adding something other than what
they wanted.

## Performance

- **Route-level lazy loading.** Each view ends up in its own chunk, so opening the list does not
  download the detail page's code. That is why no manual chunking needs configuring.
- **Lazy images with space reserved.** The container declares its aspect ratio in CSS, so the grid
  does not shift as the photos arrive.
- **Memoised filtering** and a stable reference when there is no search, so the grid is not rebuilt
  for nothing.
- **In-flight request deduplication.** If two components ask for the same resource at once the cache
  cannot help, because no request has finished; a registry of pending promises makes the second one
  wait for the first.
- **`Intl` formatters created once** at module level, not per card.

**The list is deliberately not virtualised.** There are 100 products. Virtualising would add a
dependency, break the browser's find-in-page and complicate accessibility, all to solve a problem
that does not exist at this scale. Past a few thousand items the right answer is not virtualisation,
it is server-side pagination.

## Accessibility

- "Skip to content" link as the first focusable element of the document.
- Semantic structure: breadcrumbs as a `nav` plus an ordered list with `aria-current`, the spec sheet
  as a definition list, the catalogue as a list with an accessible name.
- Live regions announcing the number of results while filtering, the loading state and the outcome
  of adding to the cart.
- Native radios hidden visually but present in the accessibility tree and in the tab order, so all
  the native behaviour is kept alongside a custom design.
- One single focus style across the application, with `:focus-visible`, in both light and dark mode.
- `prefers-reduced-motion` is honoured: motion can cause nausea and migraine.
- The `jsx-a11y` rules are enabled in the linter, which fails on any warning.

**And it is verified, not claimed.** There is an automated audit with `axe-core` — the engine behind
the usual accessibility tooling — over both views and in the states normally left unchecked: loading,
errored, and search with no results. Zero violations. The linter checks static code; axe checks the
resulting tree, which is where the real problems show up. (The contrast rule is disabled because
jsdom computes neither styles nor geometry; contrast was chosen by hand in the design system.)

## Security

The real attack surface is limited and it is worth saying so: this is a static SPA against a public
API with no authentication, no sessions and no personal data. What does apply:

- **Content-Security-Policy** on the production build, generated from the configured API origin. It
  is strict — `script-src 'self'` and `style-src 'self'`, no `unsafe-inline` — because the
  application was verified to contain not a single inline script or style: the styles are CSS
  Modules, which come out as linked files, and the `style` attribute is not used in any component.
  It is injected at build time only, because the development server needs inline scripts for hot
  reload.

  With one limitation worth stating: `frame-ancestors`, `report-uri` and `sandbox` **are ignored**
  when the policy arrives in a `<meta>` tag rather than an HTTP header. Clickjacking protection and
  HSTS have to be configured by whoever serves the files; a directive that would do nothing is not
  included.

  **The policy is verified on every build** with `npm run check:csp`, which also runs in continuous
  integration. Against the built HTML it checks that the policy exists with its eight directives,
  that there is no inline script or style — the condition that allows doing without `unsafe-inline`
  — that the document references no undeclared origin, and that the API origin is allowed both for
  connections and for images. Eighteen checks. It exists because a badly tuned CSP does not warn:
  the browser blocks the resource silently, and the policy is not applied in development, so the
  failure would show up in production and in the user's browser.
- **`dangerouslySetInnerHTML` is not used anywhere**, and the linter forbids it by configuration.
  React escapes text by default; the XSS risk appears precisely when you step off that path.
- **No external data is trusted**: neither the API responses nor the contents of `localStorage`,
  which the user can edit. Everything goes through runtime validation. This is the most real measure
  in the project.
- **URLs are built by encoding each segment**, so an identifier containing `../` or `?` cannot alter
  the path or add parameters. A test checks it.
- **Image URLs from the API are validated**: only absolute `http` or `https` URLs are accepted. Those
  URLs end up in an image's `src` attribute, and checking the scheme prevents a compromised — or
  simply mistaken — source from slipping in a `javascript:`, a `data:` or a `blob:` where a photo
  should be. Current browsers do not execute `javascript:` in an `<img>`, but relying on that is
  relying on the browser rather than on your own code.
- **External links carry `rel="noreferrer"`**, enforced by the linter.
- **Minimal dependencies**: react, react-dom and react-router in production. Fewer dependencies mean
  less supply-chain surface. They are audited in continuous integration.
- Nothing sensitive is stored in the browser: only the catalogue, which is public, and the cart
  counter.

## Tests

151 tests. 97% statement coverage and 100% function coverage.

**Coverage tells you which lines run, not whether the tests would notice a break.** To check that,
ten realistic defects were injected into the code — expiring the cache one millisecond late, no
longer crossing back the API's swapped fields, requiring one search word instead of all of them, no
longer encoding URL segments, sending the option's name to the cart instead of its code — and it was
measured which of them broke the suite. Nine out of ten. The one that slipped through was **removing
the persistence of the cart counter**: nothing checked it, and persisting it is a requirement of the
brief, so it could have been lost in a refactor without anyone noticing. With the missing test, ten
out of ten.

```bash
npm test
npm run test:coverage
```

They come in three layers:

- **Unit tests** over the expiring cache, the parsers, the search and the formatting.
- **Contract tests** over the API translation, with real fixtures, documenting its defects and
  warning if they change.
- **Integration tests** over both views with Testing Library, walking the real flows: filtering,
  finding nothing and getting out of the empty state, selecting options, adding to the cart and
  seeing the counter in the header, plus network, 404 and malformed-response failures with their
  retry.

One of them deserves a mention because it covers a real race that showed up in the final review: if
the user changed colour while the add request was in flight, the arrival of the response announced
"product added" for a selection other than the one that had been sent. The pickers are now disabled
while sending, and the test checks it by leaving the request unresolved.

Queries go by role and accessible name, not by CSS class or test id: if a test finds the button the
way a screen reader would, accessibility is checked along the way.

## What I would do with more time

- End-to-end tests with Playwright over both complete journeys.
- Internationalisation: the copy is embedded in the components.
- Move the cache to IndexedDB if the catalogue grew, because `localStorage` is synchronous and
  serialising blocks the main thread.
