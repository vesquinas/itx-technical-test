# Backend test — Similar products API

REST service that, given a product, returns the detail of its similar products. It composes the
response from two existing APIs: one that provides the ids of the similar products and one that
provides a product's detail.

It exposes [the agreed contract](./similarProducts.yaml) on port 5000.

> **How to read this.** [How to run it](#how-to-run-it) is the whole of what you need to try it. The
> rest is why things are the way they are, and it is long on purpose: the interesting part of this
> exercise is not the code but the decisions — the three that determine the performance, each with
> the measurement that chose it, are in [one section](#the-three-decisions-that-determine-the-performance).
> Everything else is skippable.

## How to run it

Requires Java 21 and Docker. Maven does not need installing: the project ships the wrapper.

```bash
# 1. Bring up the mocks of the existing APIs and the measurement infrastructure
docker compose up -d simulado influxdb grafana

# 2. Start the service
./mvnw spring-boot:run

# 3. Check
curl http://localhost:5000/product/1/similar
```

The API listens on **5000**. The management endpoints live on **5001**
(`http://localhost:5001/actuator/health`), separated on purpose: see [Security](#security).

### In a container

```bash
docker compose -f docker-compose.yaml -f docker-compose.app.yaml up -d --build app
```

Same ports, same checks. It is a second compose file rather than an edit to
[`docker-compose.yaml`](./docker-compose.yaml), which comes from the exercise's repository and is
kept unmodified.

**Why it needs a file of its own and not just `docker run`.** The default
`existing-api.base-url` is `http://localhost:3001`, which is right when the service runs on the host
and means *this same container* when it runs inside one. Built and run as it stood, the image
answered 502 with nothing saying why — a review found that, and it is worth being blunt about the
lesson: the Dockerfile had been written and tested, and the image it produces had not. To run it by
hand the override is one variable:

```bash
docker run -p 5000:5000 -p 5001:5001 -e EXISTING_API_BASE_URL=http://simulado \
  --network backend_default $(docker build -q .)
```

### Tests

```bash
./mvnw test
```

61 tests. They do not need Docker: the existing API is replaced by a WireMock double that reproduces
the same cases as the mock service, with its delays, its 404s and its 500s.

To check that the tests are worth something — and not merely that they execute lines — nine
realistic defects were injected and it was measured which of them broke the suite: fetching the
details serially instead of in parallel, treating any 4xx as "not found", removing the cap on
similar products, reporting a dependency failure as our own error. Eight out of nine. The one that
slipped through was **cancelling the abandoned call again**, which is precisely the decision that
holds up the performance, so it now has a test of its own.

An external review then ran its own set of mutations and found three more the suite did not catch —
the cache's hour turned into ten, the catalogue's four columns into six, and this service's port
5000 into 8080 — and the three of them were the same kind of thing. **The behaviour was tested; the
figures the brief spells out were not.** A test written around behaviour does not notice a number
changing, because the behaviour is the same at any number. Worse, the tests that looked like they
covered the hour advanced the clock by the same constant the production code uses, so they verified
that the cache agreed with itself. Those figures now have tests that write the numbers out —
[`ConfigurationTest`](./src/test/java/com/itx/similarproducts/ConfigurationTest.java) here, and the
equivalent for the hour and the columns in the frontend — and each was confirmed to fail when the
number is changed.

#### What these tests cannot cover, and what covers it instead

The decision this service's performance depends on the most — an **asynchronous** cache instead of
the synchronous one — is not covered by any test here, and it cannot be. What separates the two is
whether a virtual thread blocks inside a monitor and pins its carrier, which needs load, real
latency and a thread scheduler under pressure to show up at all: with two requests both versions
behave identically. A unit test that swaps the executor for a single-threaded one measures the
parallelism, which is a different property.

So what guards it is not a test but a **reproducible measurement**: the load test of the brief, the
two columns of the table further down, and the note in
[`ProductCatalog`](./src/main/java/com/itx/similarproducts/catalog/ProductCatalog.java) saying not
to go back. That is the honest answer for this class of decision, and it is worth being explicit
that a green suite says nothing about it.

### Load test

```bash
docker compose run --rm k6 run scripts/test.js
```

Results on the [Grafana dashboard](http://localhost:3000/d/Le2Ku9NMk/k6-performance-test), which
graphs request count and mean duration. Verified end to end: k6 writes into InfluxDB and the
dashboard is provisioned at that URL.

## The endpoints

| Endpoint | Port | Answers |
| --- | --- | --- |
| `GET /product/{productId}/similar` | 5000 | The detail of the similar products, in order of similarity. The only operation of the service, and it is [the agreed contract](./similarProducts.yaml) unchanged |
| `GET /actuator/health` | 5001 | `{"status":"UP"}`, with no detail of what it depends on |
| `GET /actuator/info`, `GET /actuator/metrics` | 5001 | Build data and metrics |

Two responses of that first endpoint carry more than the contract says, without breaking it:

- `Similar-Products-Complete: true|false` — whether the list is all of them. A caller receiving two
  products cannot otherwise tell whether that is all there is, and the contract's body is a bare
  array with nowhere to put a flag. When it is `false` the response also carries
  `Cache-Control: no-store`, so an incomplete answer is not cached by anyone downstream. The
  reasoning, and why not a 206, is in [Partial results](#partial-results-rather-than-no-results--and-saying-so).

The management endpoints being on **5001** is the point, not an accident: the public port serves the
API and nothing else. Verified — `/actuator/metrics` on 5000 answers 404. See [Security](#security).

> **One response escapes the uniform format, and it is not reachable from here.** A path containing
> an encoded slash or backslash (`%2F`, `%5C`) is rejected by Tomcat before the request reaches
> Spring, so it answers **`text/html`** with the container's own page instead of
> `application/problem+json`. A client that parses every error as JSON chokes exactly there. It
> leaks nothing — 435 bytes, no version, no trace, no echo of the path — so this is a consistency
> defect and not a security one, and the fix is not in the application: it is
> `server.tomcat.relaxed-path-chars`, or the gateway normalising the path first. Left as it is, and
> written down, rather than papered over with an error page filter that would have to reimplement
> the format.

## What the service does in each case

The five scenarios of the load test each cover a different case. This is what the service returns,
measured against the mock service:

| Request | Similar ids | What is tricky about it | Response |
| --- | --- | --- | --- |
| `/product/1/similar` | 2, 3, 4 | nothing | 200 with all 3 products |
| `/product/2/similar` | 3, 100, 1000 | delays of 100 ms, 1 s and 5 s | 200 with all 3; the slow one joins as soon as it is cached |
| `/product/3/similar` | 100, 1000, 10000 | 10000 takes **50 s** | 200 with the 2 reachable ones; the unreachable one is left out |
| `/product/4/similar` | 1, 2, 5 | 5 answers **404** | 200 with the 2 that exist |
| `/product/5/similar` | 1, 2, 6 | 6 answers **500** | 200 with the 2 that answer |

And the failure cases of the request itself:

| Situation | Response | Why |
| --- | --- | --- |
| The requested product does not exist (404 from the source) | **404** | The contract says so |
| The existing API fails or rate-limits (500, 429, 403…) | **502** | The failure belongs to a dependency, not to us. A 500 would claim the service is at fault, and a 200 with an empty list would lie by saying the product has no similar products |
| Identifier longer than 128 characters | **400** | Rejected before being forwarded to the source and before becoming a cache key |
| Unknown path | **404** | With a generic message, without echoing back the received path |

**Only a 404 means "does not exist".** A 429 or a 403 are problems of the dependency, and turning
them into a 404 would tell the client the product does not exist when what actually happened is that
we could not ask. The distinction also matters because each case is remembered in the cache for a
different length of time: one minute for "does not exist", ten seconds for "it failed".

## The three decisions that determine the performance

### 1. In parallel, not serially

All the details are requested at once. Serially the latency would be the **sum** of the calls; in
parallel it is the **maximum**. With the mock's delays for product 2 (100 ms, 1 s and 5 s), that is
the difference between more than six seconds and a little over five.

Every call runs on a virtual thread, so there is no pool to size and blocking on the network stops
being expensive. The server also serves each request on a virtual thread
(`spring.threads.virtual.enabled`).

### 2. A short time budget, but without cancelling the work

There is a budget for the whole request (600 ms). Whatever does not arrive within it is left out of
the response, because a single slow product must not decide the latency of the entire response. It
is the value that fixes the service's worst case, and it is chosen below one second: similar
products are a complement to the product page, not its main content.

What matters is what is **not** done: the abandoned call **is not cancelled**. It runs to completion
and leaves the product in the cache, so subsequent requests include it. The first version did cancel
it, and that threw away exactly the work that was about to speed everything else up: every cycle
paid the wait again from scratch.

The cost of not cancelling is bounded from two sides: by the HTTP client's read timeout, and because
the cache deduplicates per product, so there is never more than one in-flight call for the same
identifier.

#### How the value was chosen, and a counter-intuitive reading

Two budgets were measured with the load test:

| Metric | 1.5 s budget | 600 ms budget |
| --- | --- | --- |
| Requests | 16,322 (270.8/s) | **17,200 (285.2/s)** |
| Mean latency | 123 ms | **92 ms** |
| Median latency | **6.1 ms** | 7.7 ms |
| 90th percentile | **65 ms** | 602 ms |
| 95th percentile | 1.51 s | **609 ms** |
| Worst case | 1.53 s | **649 ms** (see the note below) |

The 95th percentile improves and the 90th gets worse. That is not a contradiction, and the
explanation matters:

**the load test is closed-loop.** It is 200 virtual users that wait for the response and then sleep
half a second, so a slow request throttles itself: while a user is waiting, it generates no more
requests. With the long budget, slow requests last longer and are therefore recorded **fewer**
times, so they occupy a smaller slice of the distribution and the 90th percentile looks better. It
is not that the experience is better: it is that the bad responses are counted fewer times.

With real traffic, where arrivals do not depend on how long the service takes, the affected fraction
is determined by how long the window in which the slow product is uncached lasts, not by how long
each response takes. In that model the short budget wins unambiguously: the same proportion of users
waits less than half as long.

What does not depend on the load model is the **worst case**: about 650 ms versus 1.53 s. And
completeness does not suffer, because the abandoned call keeps running and leaves the product in the
cache: once it is warm, responses carry every reachable similar product again. This was verified
product by product.

> **A note on that worst case, because a reproduction of these numbers exceeded it.** An independent
> run of the same load test measured a maximum of **822 ms** against a 600 ms budget — everything
> else matching within 5%. That is not a broken budget: the budget bounds **how long the service
> waits for the source**, not how long a response takes end to end. On top of it sit the queueing
> and scheduling of 200 concurrent users on a machine that is also running the load generator, the
> mock and the database it writes to. Across the runs measured so far the maximum has landed between
> **630 ms and 822 ms** for the same 600 ms budget, and the figure moves with the machine. What holds
> across all of them is the comparison — one budget produces a worst case near the budget, the other
> near 1.5 s — and that is what the table is for. The single-figure claim was tighter than the
> evidence supported.

### 3. The cache is asynchronous, and that detail changes everything

This is the decision that contributed the most performance, and it was found by measuring.

Caffeine's synchronous cache relies on `ConcurrentHashMap.computeIfAbsent`, which runs the loading
function **inside a `synchronized` block**. In Java 21, a virtual thread that blocks inside a monitor
**pins its carrier thread**: it is not unmounted, and that platform thread is unusable for as long
as the block lasts. Since the load makes a network call that can take seconds, a handful of
concurrent loads is enough to pin every carrier in the scheduler and leave the application unable to
serve requests.

Measured with the exercise's own load test, 200 virtual users and a cold cache:

| Metric | Synchronous cache | Asynchronous cache |
| --- | --- | --- |
| Completed requests | 1,608 | **16,400** |
| Throughput | 17.8/s | **272.2/s** |
| Median latency | 15.3 ms | **5.7 ms** |
| Mean latency | 1.63 s | **120 ms** |
| 90th percentile | 6.50 s | **60.5 ms** |
| HTTP errors | 0 | **0** |

Fifteen times the throughput, and a 90th percentile that drops from six and a half seconds to sixty
milliseconds. (Both columns were measured with the 1.5 s budget, to compare a single variable; the
budget was tuned afterwards.)

**And it does not accumulate resources.** Since the abandoned call is not cancelled, there was a
question of whether threads or memory piled up. Measured over two consecutive runs of the load test:
live threads go from 23 to 29 on the first run and **stay at 29** on the second; memory rises to
178 MB and falls back to 147 MB once the collector reclaims it. The second run is also faster
(308 requests per second versus 285) because the cache is already warm. 35,814 responses, no 5xx.

The asynchronous cache stores a future in the map — an immediate operation, with no blocking under
the monitor — and runs the call outside it. It keeps the deduplication and removes the pinning.

## Resilience

### Deduplication of identical calls

The cache stores the **in-flight** call, not just its result. Two hundred simultaneous requests
needing the same product produce **one** call to the source. Without this, the start of every
scenario of the load test fires two hundred identical calls at a slow source.

### A circuit breaker with per-product granularity

No circuit-breaker library is used, and that is deliberate: their breakers are per name, and here the
failure is **per product**. Product 10000 takes 50 seconds while product 100 answers in one; a shared
breaker opened by the first would stop serving the second, which is perfectly healthy.

Instead, the outcome of looking a product up is modelled as a sealed type with three cases, each with
its own cache expiry:

| Outcome | Expiry | Reasoning |
| --- | --- | --- |
| `Found` | 5 min | A good value can be reused |
| `Missing` (404) | 1 min | A product not existing is a stable fact: it will not appear out of nowhere |
| `Unavailable` (failure or timeout) | 10 s | It is transient: remember it briefly and try again |

The effect is a circuit breaker in the right place: the first attempt pays the wait, and for the next
few seconds that product is skipped instantly while everything else is served normally.

**Both lookups follow that policy, not just the detail.** The list of similar identifiers used to let
its exceptions escape the loading function, and a loading function that throws leaves nothing behind:
Caffeine discards a failed future. In-flight deduplication hides that under load — the requests
overlap — but it does nothing for requests that arrive one after another. Measured with 25 sequential
requests for the same made-up product, counting the calls that reach the source:

| | Calls to the source |
| --- | --- |
| Outcome escaping as an exception | 25 |
| Outcome returned as a value (`Lookup`) | **1** |

That is why the outcome travels as a *value* through both caches and the exception is raised by the
caller afterwards: an outcome that is thrown cannot be remembered. The type is the generic
`Lookup<T>`, shared by the two caches with a single `LookupExpiry`, so the two cannot drift apart —
which is exactly how they had drifted in the first place.

### A cap on the number of similar products

Without a limit, **one** request to this service turns into as many calls to the source as the
similar-ids list has entries, and that number is decided by the source, not by us. It is an
amplification worth bounding: there is a configurable cap (50 by default) and, since the list comes
ordered by similarity, the trim keeps the closest matches.

The list is also sanitised before being cached: null and empty identifiers are dropped and duplicates
are removed while preserving order. The null part is not hypothetical: a `null` inside the JSON array
arrives as a null list element, and `List.copyOf` rejects nulls with `NullPointerException`, so **a
single null at the source brought the request down with a 500**.

### Partial results rather than no results — and saying so

A similar product that does not exist, that fails or that takes too long is left out of the response.
The contract defines a list of similar products, and one of them having disappeared from the
catalogue does not invalidate the others. The alternative — failing the whole response — would turn
one product's failure into everybody's.

But a caller that receives two products needs to be able to tell **"this product has two similar
products"** from **"we could not fetch the third"**, and the body alone cannot say which. So every
response carries a header:

```
Similar-Products-Complete: true | false
```

**And absent is not the same as unavailable**, which is the distinction that makes the header worth
having. Measured against the mock service:

| Request | Returns | `Complete` | Why |
| --- | --- | --- | --- |
| `/product/4/similar` — one similar answers **404** | 2 | **true** | That product is gone from the catalogue. There is nothing more to fetch, so the list really is all of them |
| `/product/5/similar` — one similar answers **500** | 2 | **false** | That product may well exist and we failed to get it |

Both return two products; only now can the caller tell them apart. Marking the 404 case incomplete
would cry wolf on the commonest case in the catalogue.

An incomplete response also carries `Cache-Control: no-store`, because it is provisional: a later
request may return more. Letting a cache keep it would freeze the gap for as long as it lived there.
And the flag corrects itself — `/product/2/similar` answers `1 product, complete=false` on a cold
cache and `3 products, complete=true` once the slow one has been fetched.

**Why a header and not the body, and not a 206.** The body stays exactly what the contract
declares, a bare array with no wrapper: changing the shape of an operation that was *agreed with
the front-end applications* is not a unilateral decision, and the contract file is part of the test
bench and kept unmodified. A 206 looks like the obvious answer and is the wrong one — RFC 9110
defines it as the response to a range request and requires a `Content-Range`; sending it without
one is a protocol violation that confuses caches. In a real project this header would be the
proposal to take to that agreement. (No `X-` prefix, per RFC 6648.)

### Separate timeouts

Connecting and reading are different failures: a refused connection is known instantly (1 s), whereas
a slow source can take as long as it likes (6 s). The read timeout was chosen above the product that
takes 5 seconds, so that it gets to answer and be cached, and well below the one that takes 50, which
is never worth waiting for.

## Security

- **Unprivileged image.** The container runs as the `spring` user, not as root, and the final image
  ships only the JRE: no JDK and no build tooling.
- **The management endpoints live on their own port** (5001), which in a real deployment stays
  reachable only from the internal network. The public port serves nothing but the API. This matters
  more than it looks: `/actuator/metrics` lets you enumerate 44 metrics without authenticating, among
  them free disk space and JVM internals.
- **And even there, only what is needed**: health, info and metrics. Exposing them all publishes the
  configuration, the environment variables and thread and heap dumps.
- **Health details are not published** (`show-details: never`): they enumerate the services the
  system depends on.
- **The identifier size is capped** at 128 characters. Each identifier that arrives is forwarded to
  the source and becomes a cache key, so its length is the length of something we store and
  something we send on: with the cap the ten thousand entries of the cache cannot be made to hold
  more than about 3 MB of keys, and without it the ceiling is what the container accepts in a
  request line — 8 KB, which is 150 MB. Verified at the edges: 128 characters are accepted, 129
  answer 400, and past 8 KB the container answers before the application does, with a 431-byte page
  that reflects nothing and does not name itself.

  **What the cap does not do is bound the number of distinct identifiers**, which is what evicts the
  good entries: ten thousand short made-up ones do it as well as long ones. It makes each abusive
  request cheap, not a campaign of them — that needs a request limit per client, which belongs to
  the gateway and is listed below among the things left undone. Said plainly here because the
  earlier wording implied the cap solved it.
- **The detail arriving from the source is validated** before being accepted. A product missing the
  fields the contract declares mandatory is dropped: returning it would make us the origin of the
  breach for our own clients.
- **Error messages carry neither the exception nor its stack trace.** Errors are a common leak
  channel: system paths, internal host names, library versions. The technical detail goes to the
  server log.

- **And they do not repeat back what the caller sent** — which is here because a review found the
  claim was false, and it is the most useful entry in this list. Four channels were reflecting the
  request, not one:

  | Channel | What came back | Now |
  | --- | --- | --- |
  | `instance` of every `ProblemDetail` | The full request URI: a 2,000-character identifier produced a 2,017-character field | The route template, `/product/{productId}/similar` |
  | `detail` of a 405 | `Method 'PROPFIND' is not supported.` | `Method not allowed`, keeping the `Allow` header |
  | `detail` of an unknown path | `No static resource <path>.` | `Resource not found` |
  | An unexpected exception | Spring Boot's error dispatch, with `"path":"/product/…/similar"` and a shape unlike every other error | The same `ProblemDetail` as the rest, with nothing in it |

  Two things are worth more than the fix. The first: the `instance` case survived because the fix
  had been applied **handler by handler** — the unknown path was corrected and the rest assumed
  fine — while two of those responses are built by Spring's own advice and never passed through our
  handlers at all. It is now done in one place on the way out ([`ProblemDetailInstances`](./src/main/java/com/itx/similarproducts/web/ProblemDetailInstances.java)),
  which is the only way it covers what we did not think of.

  The second: the test that was supposed to cover this asserted `doesNotContain("static resource")`.
  It checked that Spring's wording was gone, not that the path was — so it passed while the path
  came back in a different field, and it read like coverage. Its replacement sends a long marker and
  requires that **no fragment of it returns**, over every error the service can produce, plus the
  exception message and the stack trace. Naming the field you are checking is how a test becomes a
  place to hide.

  The risk itself is modest and worth saying so: the amplification is about 1:1 and a path the
  caller wrote holds no secret. What is not modest is the habit — a response that repeats the
  request is the channel the serious leaks travel through.

- **Neither the server nor its version is advertised** in the responses, and the honest version of
  this one is that `server.server-header: ""` **changes nothing**: measured with the key removed,
  the responses carry no `Server` header either, because Spring Boot does not send one with Tomcat.
  The setting stays as a deliberate pin — Jetty and Undertow do announce themselves — and what
  guards the behaviour is not the line of configuration but a test asserting the header is absent.
- **Minimal dependencies**: web, cache, actuator and validation. Less supply-chain surface.

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
| 61 tests pass, with no Docker needed | `./mvnw test` |
| Only a 404 means "does not exist"; a 429 or a 403 do not | `./mvnw test` — ProductCatalogTest |
| 25 sequential requests for a made-up product cost **one** call to the source | `./mvnw test` — the negative-caching tests |
| Error responses repeat nothing the caller sent, and carry no exception or trace | `./mvnw test` — ErrorResponsesTest, UnexpectedErrorTest |
| No response announces the server it runs on | `./mvnw test` — ErrorResponsesTest |
| An identifier of 128 characters is accepted and 129 is rejected | `./mvnw test` |
| The ports, the three expiries, the budget and the cap are the numbers stated here | `./mvnw test` — ConfigurationTest |
| Every endpoint the service maps is documented above | `./mvnw test` — ReadmeClaimsTest |
| Every number in this README is the current one | `./mvnw test` — ReadmeClaimsTest |
| The five scenarios of the mock behave as the table says | `docker compose up -d simulado`, then the five `curl`s |
| The asynchronous cache is what the throughput figures say | `docker compose run --rm k6 run scripts/test.js` |

**Two limits of this, stated rather than papered over.** The last row is a *measurement* and not a
test, because what separates the asynchronous cache from the synchronous one only appears under load
— that is [explained above](#what-these-tests-cannot-cover-and-what-covers-it-instead) and it is why
the numbers are published with the command that reproduces them. And no script can tell prose from a
claim: `ReadmeClaimsTest` catches a number that has rotted and an endpoint that has drifted, but a
new sentence asserting something unverified would pass it. The table is what closes that gap, by
making the pairing explicit enough that an empty right-hand column is visible.

## Third-party files

The contract, the mocks and the load test come from the repository the brief points to,
[dalogax/backendDevTest](https://github.com/dalogax/backendDevTest), and are kept **unmodified**:
they are the test bench the solution is judged with, and touching them would invalidate the
comparison.

They are under the Apache License 2.0. Which file belongs to whom is detailed in
[`NOTICE.md`](./NOTICE.md), and the licence text is in
[`LICENSE-APACHE-2.0`](./LICENSE-APACHE-2.0).

## On the comments, since there are many

Comments here carry the **non-obvious why**: the pinning of carrier threads, the semantics of
`ExecutorService.close()`, why the resilience lives in the cache instead of in a circuit-breaker
library, why a 404 and a 502 are cached for different lengths of time. What none of them do is
restate what the code says.

That rule was applied properly only after a review pointed at the cost of not applying it: the
javadoc of `ProductCatalog` had grown into a near-copy of this README's section on the asynchronous
cache — the same reasoning written in three places, which is three places to update and two that
will quietly go stale. The class now keeps the warning not to go back to the synchronous cache, and
the reasoning lives here, once.

The density is **41% of the lines of `src/main`** and 18% of the tests. That figure went the wrong
way first: the classes added while fixing review findings came with their own rationale, and it rose
to 44% under a commit that claimed to be removing dead weight. What brought it down was not deleting
the reasoning but moving the part that is *history* — how a defect was found, which review found it
— into this README, where it belongs, and saying the rest in fewer words.

Read the figure with care rather than as a target: on a four-line record a single paragraph of
rationale is 75% of the file. The test of a comment is not the ratio but whether it survives the
question *does this say something the code does not?*

## How the code is organised

```
src/main/java/com/itx/similarproducts/
├── catalog/    Access to the existing API, cache and result types
├── config/     HTTP client, executor and properties
├── domain/     The contract's model
├── service/    Parallel composition with a time budget
└── web/        Controller and error-to-HTTP translation
```

One configuration detail deserves explaining: the virtual-thread executor is a **shared bean**, not
one created per request. Since `ExecutorService` implements `AutoCloseable`, closing it in a
`try-with-resources` **waits for every task to finish**, which would defeat the time budget: after
abandoning a slow call, closing the executor would wait for it anyway.

## What I would do with more time

- A bulkhead limiting concurrent calls to the source. Today they are bounded by the cache, the cap on
  similar products and the connection pool, which is enough at this scale, but it is not an explicit
  limit.
- Rate limiting per client. The cap on similar products bounds the amplification per request, but not
  the number of requests, and a client asking for distinct identifiers non-stop can still evict the
  cache. That belongs to the gateway rather than to this service, but it is worth saying it is not
  here.
- Custom metrics for cache hits and for similar products dropped on timeout, which is what I would
  want to watch in production.
- Contract testing against `similarProducts.yaml`, so the contract verifies itself.
