# Backend test — Similar products API

REST service that, given a product, returns the detail of its similar products. It composes the
response from two existing APIs: one that provides the ids of the similar products and one that
provides a product's detail.

It exposes [the agreed contract](./similarProducts.yaml) on port 5000.

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

### Tests

```bash
./mvnw test
```

39 tests. They do not need Docker: the existing API is replaced by a WireMock double that reproduces
the same cases as the mock service, with its delays, its 404s and its 500s.

To check that the tests are worth something — and not merely that they execute lines — nine
realistic defects were injected and it was measured which of them broke the suite: fetching the
details serially instead of in parallel, treating any 4xx as "not found", removing the cap on
similar products, reporting a dependency failure as our own error. Eight out of nine. The one that
slipped through was **cancelling the abandoned call again**, which is precisely the decision that
holds up the performance, so it now has a test of its own.

### Load test

```bash
docker compose run --rm k6 run scripts/test.js
```

Results on the [Grafana dashboard](http://localhost:3000/d/Le2Ku9NMk/k6-performance-test), which
graphs request count and mean duration. Verified end to end: k6 writes into InfluxDB and the
dashboard is provisioned at that URL.

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
| Worst case | 1.53 s | **649 ms** |

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

What does not depend on the load model is the **worst case**: 649 ms versus 1.53 s. And completeness
does not suffer, because the abandoned call keeps running and leaves the product in the cache: once
it is warm, responses carry every reachable similar product again. This was verified product by
product.

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
- **The identifier size is capped** at 128 characters. Without that limit anyone can ask for
  arbitrarily long identifiers, and each one is forwarded to the source and becomes a new cache key:
  a convenient way to evict the good entries and to force one call to the source per request received.
- **The detail arriving from the source is validated** before being accepted. A product missing the
  fields the contract declares mandatory is dropped: returning it would make us the origin of the
  breach for our own clients.
- **Error messages carry neither the exception nor its stack trace.** Errors are a common leak
  channel: system paths, internal host names, library versions. The technical detail goes to the
  server log. This includes the unknown-path case: by default Spring answers
  `"No static resource <path>."`, which reveals that there is a static resource server behind and
  hands the client back the path it sent.
- **Neither the server nor its version is advertised** in the responses (verified: there is no
  `Server` header).
- **Minimal dependencies**: web, cache, actuator and validation. Less supply-chain surface.

## Third-party files

The contract, the mocks and the load test come from the repository the brief points to,
[dalogax/backendDevTest](https://github.com/dalogax/backendDevTest), and are kept **unmodified**:
they are the test bench the solution is judged with, and touching them would invalidate the
comparison.

They are under the Apache License 2.0. Which file belongs to whom is detailed in
[`NOTICE.md`](./NOTICE.md), and the licence text is in
[`LICENSE-APACHE-2.0`](./LICENSE-APACHE-2.0).

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
