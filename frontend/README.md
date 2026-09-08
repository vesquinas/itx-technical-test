# Frontend test — Mobile device store

Small shopping application for mobile phones: a product list with search, and a detail page with
option selection and add-to-cart.

Single-page application with client-side routing, no server rendering and no document navigation.

> **How to read this.** The demo link below and [How to run it](#how-to-run-it) are all you need to
> try it. The rest is why things are the way they are, and it is long on purpose: the decisions are
> the interesting part of this exercise. If you read one section, read
> [The API and its surprises](#the-api-and-its-surprises) — the data has real defects and they are
> corrected in one place.

**Live demo: https://victor-esquinas-itx.netlify.app/** — published from this repository on every
push to `main`, so it can be tried without installing anything. It is **fully functional, cart
included**.

That last part took a proxy to achieve, and the reason is worth reading:
[the cart counter](#the-cart-counter-and-why-it-needs-a-proxy). The short version is that the API
keeps the basket in a session cookie a browser will not send across origins, so the demo is hosted
somewhere that can forward `/api` from the application's own origin. The configuration is four
lines of [`netlify.toml`](../netlify.toml), and the same arrangement is what `npm start` and
`npm run preview:deployed` reproduce locally.

Verified against the deployed site: the application answers 200, the API answers through the same
origin, four consecutive add-to-cart requests on one session return 1, 2, 3, 4, a deep link such as
`/product/<id>` answers 200, and the security headers a meta-tag policy cannot express are in
place.

## Language

Code, comments and documentation are in English. **The user-facing copy is in Spanish**, because
that is the language of the market and of the specification, which names the controls in Spanish
("botón de Añadir", "añadir a la cesta"). In a real project that copy would live behind an i18n
layer instead of being embedded in the components.

One consequence of that is visible in the spec sheet, where Spanish labels sit next to English
values that come straight from the API. It is deliberate and the reasoning is spelled out in
[its own section](#spanish-labels-english-values-a-deliberate-mix).

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
| `npm run check:claims` | Verifies that what this README claims is true — see [below](#every-claim-here-has-a-command-that-proves-it) |
| `npm run preview` | Serves the production build |
| `npm run preview:deployed` | Builds and serves the production build from one origin that also proxies the API — the topology of a real deployment |

The API URL can be changed with `VITE_API_BASE_URL`; see [`.env.example`](./.env.example).

**Everything origin-dependent is derived from that one value**, and it took a review to get there.
`index.html` used to carry a hard-coded `preconnect` to the default API while the
Content-Security-Policy was generated from the configured one, so building with
`VITE_API_BASE_URL=https://api.example.com` produced a document pointing at an origin its own policy
did not allow — and `npm run check:csp`, which is a gate in continuous integration, failed. In other
words, the documented way of configuring the application broke its own build.

The hints are now injected by a Vite plugin from the resolved origin, and continuous integration
builds **twice**: once with the default and once with a configured origin, running the CSP check on
both. A hard-coded value and a generated one drift apart the moment either changes; the only fix
that lasts is having a single source.

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

## The API

Base URL `https://itx-frontend-test.onrender.com`, configurable with `VITE_API_BASE_URL`. Three
endpoints, and the application uses all three:

| Endpoint | Answers | Used by |
| --- | --- | --- |
| `GET /api/product` | The catalogue: **100 products** with `id`, `brand`, `model`, `price`, `imgUrl` | The list view, and — since a review — as evidence for telling "does not exist" from "failed", see [below](#it-does-not-exist-arrives-as-a-server-error) |
| `GET /api/product/:id` | One product's detail: **38 fields**, including `options.colors` and `options.storages` | The detail view and its spec sheet |
| `POST /api/cart` | `{"count": n}`, the number of items in the basket | Add to cart, which displays the number the API returns |

`POST /api/cart` takes `{"id": "...", "colorCode": 1000, "storageCode": 2000}` — the **codes**, not
the names.

Four things about it are worth knowing before reading any of the code, because between them they
explain most of the decisions in this document:

- **It keeps the basket in a server-side session**, identified by an `HttpOnly` cookie with no
  `SameSite=None`. Without that cookie every `POST /api/cart` opens a fresh session and answers
  `{"count": 1}` for ever; with it, the same call answers 1, 2, 3. Verified with a shared cookie jar.
  That single fact is why the application is served from an origin that proxies `/api`:
  [the cart counter](#the-cart-counter-and-why-it-needs-a-proxy).
- **A product that does not exist answers 500**, not 404 — checked with five made-up identifiers.
- **The images come from the API's own origin** (`/images/<id>.jpg`), which is why that origin has to
  be allowed in `img-src` as well as in `connect-src` in the
  [Content-Security-Policy](#security).
- **It sleeps.** It is hosted on a free tier, so the first request after a while takes around 40
  seconds while the instance wakes up; afterwards it answers in about 150 ms. That is what the
  "this is taking longer than usual" notice is for, and why the client's timeout is generous.

The data also has real defects, corrected in one place: [the next section](#the-api-and-its-surprises).

## Decisions worth explaining

### The one-hour client-side cache

This is the most specific requirement of the brief, so it is built as its own isolated unit in
[`src/lib/cache/`](./src/lib/cache).

Every entry is stored in an envelope carrying the format version, the expiry instant and the data.
Four design decisions:

1. **Validation happens on read, not only on write.** `get()` demands a parser. What comes out of
   `localStorage` is text the user can edit from the browser console, or that an earlier version of
   the application wrote: treating it as trusted data is what turns a cache into a security problem.

   A corollary that cost a real defect to learn: **what gets cached is the API's own response, not
   the translated model.** Validating on read means the parser runs on whatever was stored, and the
   parser reads the API's field names (`imgUrl`, `cpu`, `displaySize`). While the cache stored the
   translated model, that validation silently stripped every field whose name differs — the images
   and the entire spec sheet — so a product revisited within the hour came back gutted. Caching the
   raw response means there is one parser and one translation point, applied identically whether
   the data comes from the network or from the cache.
2. **On expiry the entry is discarded and revalidated** against the API, which is literally what
   the brief asks for. Serving the stale value while revalidating in the background
   (*stale-while-revalidate*) was considered, but that shows out-of-date information.
3. **Keys carry a namespace and a version.** Bumping the version invalidates everything cached in
   every browser at once, which is what you need to be able to do when the shape of the data
   changes: without it, anyone who already had data stored would keep reading the old format. It
   has already earned its keep: the fix described above needed a version bump, because otherwise
   every browser that had loaded the application before it would have kept serving the broken
   entries for up to an hour.
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
| A product that does not exist answers **500**, not 404 | `GET /api/product/<made-up-id>` returns `{"message":"An Unexpected Error Occurred","code":0}` with status 500 | The catalogue already in the cache is used as evidence to tell the two apart; see below |

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

#### "It does not exist" arrives as a server error

The interface distinguishes a product that is not in the catalogue ("Producto no encontrado", with a
way back) from a failure of the API ("Algo ha ido mal", with a retry). The distinction is right, and
against this API it was **unreachable**: five made-up identifiers were tried and all five answered
500, never 404.

Trusting the status code alone would therefore show a retry button for something no retry can fix.
So when a detail request fails, the cached product list is consulted: if the catalogue is there and
the identifier is not in it, the failure is reclassified as "not found". If there is no catalogue
cached, the error is left as it is — the check **never fetches** anything, because a request that
already failed is not a good moment to start another one.

It is deliberately conservative: it only ever turns a failure into a 404 with the catalogue in hand
as evidence, and the day the API returns a proper 404 the whole thing becomes a no-op.

**The cost of that trade, stated plainly.** The cached catalogue can be up to an hour old, so a
product added since it was cached, *and* whose detail request happens to fail, is reported to the
user as non-existent. It needs both halves to go wrong at once, the window is one hour, and the
alternative is trusting a status code that is known to be wrong — which misleads more often, since
every 500 would be reported as a real failure with a retry that cannot work. It is the compromise
this application chooses; it was chosen knowingly and it belongs here rather than only in the code.

### The cart counter, and why it needs a proxy

The brief asks to display **the value returned by the API** on add, and to persist it. That is what
the application does: the API is the source of truth and no parallel count is kept on the client.

The interesting part is what it took to make that actually work.

**The API keeps the basket in a server-side session**, identified by a cookie it sets on the first
request:

```
set-cookie: session_id=s%3AGhYybA0Epp...; Path=/; HttpOnly
```

Sent without that cookie, every `POST /api/cart` opens a fresh session and the answer is
`{"count": 1}` for ever. Sent with it, the same endpoint answers 1, 2, 3, 4 — a real basket.

And **two independent things stop a browser from ever sending that cookie across origins**:

| Blocker | Why it blocks |
| --- | --- |
| The cookie carries no `SameSite=None; Secure` | Modern browsers treat it as `SameSite=Lax` and do not attach it to cross-site requests at all |
| The API answers `Access-Control-Allow-Origin: *` with no `Access-Control-Allow-Credentials` | The CORS specification forbids credentialed requests against a wildcard origin, so the browser would reject the response even if the cookie were sent |

Neither is something a client can work around. **The fix is to stop being cross-origin**: the
development server proxies `/api`, so the requests are same-origin, the browser sends the cookie,
the session persists and the counter climbs.

No cookie rewriting is needed, and it is worth saying why, because this document claimed the
opposite for a while: the cookie carries **no `Domain` attribute**, so it is host-only and the
browser scopes it to whoever answered — the proxy. Measured both ways, with and without
`cookieDomainRewrite`, the session accumulates identically. It would only be needed if the API
started pinning the cookie to its own domain.

So `npm start` gives a fully working cart. See `server.proxy` in [`vite.config.ts`](./vite.config.ts).

**And that is how the public demo is hosted**: on a host that can forward `/api` from the
application's own origin, in [`netlify.toml`](../netlify.toml).

That forwarding is **three rules, one per endpoint** — `/api/product`, `/api/product/:productId`
and `/api/cart` — and not a `/api/*` wildcard, which is what it was until a review pointed out what
a wildcard means: any path anyone put after `/api/` would be relayed to that host from this
deployment. It is a public API and there is no credential here to lend, so the exposure was
bandwidth rather than access — but a relay for three known paths is strictly better than a relay for
any path, and it cost two extra rules. Anything else under `/api/` now answers 404. Static hosting cannot
do it — GitHub Pages, where this was first deployed, left the counter stuck at 1 with no way to fix
it. The counter working there and not there is **not a code difference**. It is the same build.
Only the origin changes.

#### How long the basket lasts, which is not one answer but three

Worth spelling out, because three things with three different lifetimes are involved and none of
them is the one-hour cache:

| What | Where it lives | How long |
| --- | --- | --- |
| The **number shown in the header** | `localStorage`, under `itx-cart-count` | **It does not expire.** It survives closing the browser and restarting the machine |
| The **session that identifies the basket** | The `session_id` cookie | Until the **browser** closes: the cookie carries no `Expires` and no `Max-Age`, which makes it a session cookie |
| The **basket itself** | Server-side, in the API | As long as the API keeps that session. It is a free instance that spins down when idle, so in practice a while |

The one-hour expiry belongs to the **product cache** and has nothing to do with the cart: the
counter is stored separately for exactly that reason — it is not cached API data, it is the state of
the user's session.

The consequence is that the two can **diverge**: after closing and reopening the browser the header
still shows 3, because that is what the API last reported and the brief asks for it to be persisted,
while the API has no session any more and the next add answers 1. Measured: the same session
answers 1, 2, 3, 4 across requests, and a request with no cookie answers 1.

That is the behaviour the brief specifies — display the value the API returns, and persist it — and
where the API is the source of truth there is no honest way to keep a client-side count in step with
a basket the client cannot see. What the application does **not** do is invent a count of its own,
which is the alternative and a worse one: it would show a number the server does not agree with.

#### How we know it works

Measured against the deployed site itself, not inferred:

| Checked | Result |
| --- | --- |
| The application is served | 200 |
| The API answers through the same origin | 200, 16.6 kB |
| Four consecutive add-to-cart requests on one session | **1, 2, 3, 4** |
| A deep link such as `/product/<id>` | 200 — on static hosting the same build answered 404 |
| The bundle | contains no absolute API URL: it calls its own origin, which is what routes it through the proxy |
| Security headers | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS |

The same topology can be reproduced locally, without deploying anything:

```bash
npm run preview:deployed
```

That builds with a relative API base and serves the result from one origin that also forwards
`/api` — which is what a deployment behind a gateway looks like, and what the host above provides.

**What none of that covers** is a real browser attaching the cookie on its own, because those
checks were made with an HTTP client. That step is specified rather than measured, and all four
conditions for it hold:

1. The cookie has no `Domain`, so it is host-only and the browser scopes it to the deployment.
2. It has no `SameSite`, so it is treated as `Lax` — which blocks cross-site requests and allows
   same-site ones.
3. The request to `/api` is same-origin.
4. `fetch` defaults to `credentials: 'same-origin'`, which sends cookies on same-origin requests.

### Spanish labels, English values: a deliberate mix

In the spec sheet the labels are in Spanish and the values arrive in English —
`Batería: Removable Li-Po 3400 mAh battery`. It does look odd, and it is worth explaining why it
stays that way.

**The labels come from the brief.** It lists the attributes that have to be shown by name, in
Spanish: Marca, Modelo, Precio, CPU, RAM, Sistema Operativo, Resolución de pantalla, Batería,
Cámaras, Dimensiones, Peso. Renaming them would be drifting away from the requirement for a
cosmetic reason.

**The values come from the API, and they are English free-form text.** Measured across the 100
products of the catalogue:

| Attribute | Values containing English prose | Example |
| --- | --- | --- |
| Batería | **99 of 99** | `Removable Li-Po 1530 mAh battery` |
| Resolución de pantalla | **100 of 100** | `480 x 640 pixels (~286 ppi pixel density)` |
| Memoria RAM | **97 of 97** | `128 MB RAM` |
| Cámara principal | 70 of 100 | `3.15 MP autofocus LED flash` |
| Procesador | 68 of 99 | `533 MHz Samsung S3C 6410` |

Dimensions, weight and operating system are either language-neutral or proper nouns.

**Translating those values is not on the table.** They are unstructured technical strings, not
enumerated terms: there is no dictionary to map `Non-removable Li-Ion 3400 mAh battery (12.92 Wh)`
through. Machine-translating product data is how a catalogue ends up claiming a phone has a
"batería de iones de litio no desmontable de 3400 mAh (12,92 Wh)" in one product and something
subtly different in the next, and how technical figures get mangled. The safe thing with data you
do not own is to show it as it came.

So the mix is the consequence of two decisions that are individually right: honour the attribute
names the brief specifies, and do not touch the source's data. **In a real project this is solved
upstream**, not in the interface: the catalogue delivers the values already localised for the
market, and the interface copy goes through i18n. Neither of those is available here.

The same situation applies, more mildly, to the option pickers: the legends are in Spanish
("Almacenamiento", "Color") and the values come from the API in English ("Black", "16 GB").

### Scroll position across views

A single-page application does not reload the document, so the browser keeps the scroll position
when the view changes. Left alone, that means opening a product from halfway down the catalogue
shows its detail page already scrolled down — which is what happened, and it was reported from the
deployed demo rather than caught here.

The two views want opposite things, so they get opposite treatment:

- **The detail page always opens at the top**, and goes back to the top when a different product is
  opened. It uses a layout effect rather than a normal one, so the scroll happens before the
  browser paints and the page never flashes at the wrong position on its way up.
- **The catalogue returns the user to where they left it.** That matters because the detail page's
  "back to the list" link is a new navigation and not a browser back, so without remembering the
  position the user would land at the top of a hundred-product grid every time.

Two details of the restore are worth explaining. It waits for the data to be ready, because the
position cannot be applied while the content is still a skeleton: the document is not tall enough
and the browser would clamp the scroll. And it happens once per visit, because filtering rewrites
the URL on every keystroke and an unguarded restore would keep yanking the page back while the user
is reading the results. There is a test for exactly that.

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
  wait for the first. The shared request takes **no caller's abort signal**, and that is the point:
  a deduplicated request belongs to the cache, not to whoever asked first. See
  [the defect that taught it](#the-test-harness-has-to-render-the-same-tree-as-the-application).
- **`Intl` formatters created once** at module level, not per card.

**The list is deliberately not virtualised.** There are 100 products. Virtualising would add a
dependency, break the browser's find-in-page and complicate accessibility, all to solve a problem
that does not exist at this scale. Past a few thousand items the right answer is not virtualisation,
it is server-side pagination.

## On the comments, since there are many

Comments here carry the **non-obvious why**: why the cache stores the API's response and not the
translated model, why a shared request takes no caller's abort signal, why the context lives in its
own module, why `auto-fill` is not used for the grid. What none of them do is restate what the code
says — a rule that a review found was not being applied evenly, so the paragraphs that described the
code were removed and one hook's comment stopped apologising for its own name.

The density is **23% of the lines of `src` counting the tests**, 33% of the application code alone.
That figure went the wrong way first — it rose while review findings were being fixed, because each
fix arrived with its own rationale — and what brought it back down was not deleting the reasoning
but moving the part that is *history* into this README, where it belongs, and saying the rest in
fewer words.

Read it with care rather than as a target: several of the densest files are fifteen lines long,
where one paragraph of rationale dominates the ratio. The test of a comment is not the ratio but
whether it survives the question *does this say something the code does not?*

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
- **A lint rule guards external links** — `react/jsx-no-target-blank` — and it is worth being
  precise about what that means: **there is no external link in the application**. The only anchor
  is the internal skip link of the layout. The rule protects the day someone adds one, which is a
  guard and not a measure in place, and it was listed as the latter until a review pointed it out.
- **Minimal dependencies**: react, react-dom and react-router in production. Fewer dependencies mean
  less supply-chain surface. They are audited in continuous integration.
- Nothing sensitive is stored in the browser: only the catalogue, which is public, and the cart
  counter.

## Tests

177 tests. 97% statement coverage and 100% function coverage.

**Coverage tells you which lines run, not whether the tests would notice a break.** To check that,
ten realistic defects were injected into the code — expiring the cache one millisecond late, no
longer crossing back the API's swapped fields, requiring one search word instead of all of them, no
longer encoding URL segments, sending the option's name to the cart instead of its code — and it was
measured which of them broke the suite. Nine out of ten. The one that slipped through was **removing
the persistence of the cart counter**: nothing checked it, and persisting it is a requirement of the
brief, so it could have been lost in a refactor without anyone noticing. With the missing test, ten
out of ten.

An external review then ran its own mutations and found two the suite did not catch: **the cache's
hour turned into ten hours**, and **the grid's four columns into six**. Both are the same kind of
gap, and the same one a third mutation found in the backend with its port — the requirements the
brief states as a *number*. The behaviour was tested; the arithmetic was not, because a test written
around behaviour does not notice a figure changing.

The cache one was worse than a gap, and it is worth saying plainly: the expiry tests advanced the
clock by `ONE_HOUR_MS`, **the very constant the production code uses**. A test titled "uses one hour
as the default time to live" that takes the hour from the same place as the code does not verify an
hour — it verifies that the code agrees with itself, which it always will. The hour and the columns
now have tests that write the numbers out in full, and each was confirmed to fail when the number is
changed.

#### What these tests cannot cover

The four columns are checked by **reading the stylesheet**, not by rendering. jsdom parses CSS but
lays nothing out and does not apply media queries, so no rendering test can see how many cards a row
holds; that needs a real browser, and it is on the list of what is left undone. What the test can do
is check that the stylesheet still declares what the brief asks — and, as a bonus a rendering test
could not give, that the loading skeleton uses the same ladder as the real grid, which is what stops
the layout from jumping when the data arrives.

It is worth naming that boundary rather than leaving the impression that a green suite covers the
layout. It does not.

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

### The test harness has to render the same tree as the application

An external review of this repository found a defect the whole suite was blind to: **the
application failed on its very first load** under `npm start`, showing "Algo ha ido mal" instead of
the catalogue, with no way to recover short of a reload.

React's strict mode — which `main.tsx` enables, and which every development build honours —
deliberately mounts, unmounts and remounts every component. The unmount aborted the in-flight
request for the product list. The remount then joined *that same request*, because it was still in
the deduplication registry, and inherited its abort.

The tests could not see it for **two** reasons, and both were harness faults rather than luck:

1. **The harness did not render under strict mode.** `main.tsx` had it and the tests did not, so
   the suite was exercising a tree the application never uses. It renders under strict mode now, so
   every one of these tests goes through the mount-unmount-remount that broke this.
2. **The `fetch` stub ignored the `AbortSignal`.** A stub that resolves with data even after the
   request was aborted cannot reproduce an abort-related defect. Adding strict mode alone was not
   enough: all the tests still passed. There is a faithful stub now
   ([`src/test/fetchStub.ts`](./src/test/fetchStub.ts)) that rejects with an `AbortError` the way
   the platform does, and with it the defect reproduced immediately.

The fix was to stop tying a shared request to one consumer's lifetime: an abandoned request runs to
completion and leaves its result in the cache, bounded by the HTTP client's own timeout. Nothing in
the application aborts a request any more — only its time limit does — and the `signal` plumbing
is gone rather than left lying around.

It is the same decision the backend makes about the calls it stops waiting for, and for the same
reason: cancelling throws away work that was about to make the next read instant.

## Every claim here has a command that proves it

This section is the answer to the most uncomfortable thing a review said about this project, and it
is worth quoting rather than paraphrasing: the first version **documented as done three things that
were not** — that the cart worked, that error responses did not repeat the request back, that the
API URL was configurable — and all three sat in its most extensively written sections. *The
confidence of the documentation was inversely correlated with its verification.* They were corrected
because a person read them, not because anything would have caught them.

So the rule is now: **no claim in this README without a command that proves it.**

| Claim | Proof |
| --- | --- |
| 177 tests pass; 97% of statements, 100% of functions | `npm test`, `npm run test:coverage` |
| The API's defects are handled — swapped fields, ten fields that change type, empty prices | `npm run check:api`, which walks all 100 products of the live catalogue |
| The Content-Security-Policy covers everything the page loads and needs no `unsafe-inline` | `npm run check:csp` — 18 checks, in continuous integration |
| Configuring `VITE_API_BASE_URL` does not break the build | continuous integration builds twice, with the default origin and with a configured one |
| The cart accumulates when the application is served from one origin | `npm run preview:deployed`, then four adds |
| The catalogue grid is capped at four columns, and the skeleton matches it | `npm test` — ProductGrid.columns.test.ts |
| The cache expires at one hour, to the millisecond | `npm test` — ttlCache.test.ts |
| No accessibility violations on either view | `npm test` — accessibility.test.tsx, which runs axe |
| The types are strict and the linter passes with no warnings | `npm run typecheck`, `npm run lint` |
| Every number in this README is the current one | `npm run check:claims` |

**Two limits of this, stated rather than papered over.** The layout itself — that a wide screen
really shows four cards per row — is not proved by any of these: jsdom lays nothing out, so the test
reads the stylesheet instead, and only a real browser could close that gap. It is on the list below.
And no script can tell prose from a claim: `check:claims` catches a number that has rotted, a script
that has drifted out of the table and an endpoint the code no longer calls, but a new sentence
asserting something unverified would pass it. The table is what closes that gap, by making the
pairing explicit enough that an empty right-hand column is visible.

## What I would do with more time

- End-to-end tests with Playwright over both complete journeys. That is also the only way to check
  the layout itself — that a wide screen really shows four cards per row — which jsdom cannot see.
- Internationalisation: the copy is embedded in the components.
- Move the cache to IndexedDB if the catalogue grew, because `localStorage` is synchronous and
  serialising blocks the main thread.
