# Technical test — Frontend + Backend

**Live demo of the frontend: https://victor-esquinas-itx.netlify.app/**

> The first load takes about 40 seconds. That is not the application: the test API is hosted on
> Render's free tier, which shuts the service down when it receives no traffic, and the first
> request has to start it back up. The application says so on screen while it waits.

This repository holds both technical tests in a single project, each one in its own folder with
its own documentation:

| Folder | Test | Stack | Documentation |
| --- | --- | --- | --- |
| [`frontend/`](./frontend) | Small shopping app for mobile devices (PLP + PDP) | React 19 · TypeScript · Vite | [frontend/README.md](./frontend/README.md) |
| [`backend/`](./backend) | Similar-products REST API | Java 21 · Spring Boot | [backend/README.md](./backend/README.md) |

## Quick start

```bash
# Frontend
cd frontend && npm install && npm start

# Backend (needs the mocks of the existing APIs)
cd backend && docker compose up -d simulado && ./mvnw spring-boot:run
```

## A note on language

**Code, comments and documentation are in English**; the user-facing copy of the frontend is in
Spanish. That split is deliberate: English keeps the codebase readable for any engineer, while the
interface speaks the language of its market — and of the specification, which names the controls
in Spanish ("botón de Añadir"). In a real project that copy would go through an i18n layer instead
of being embedded in the components.

The **commit history**, on the other hand, is not in English for its first thirteen commits. The
decision to write everything in English was taken partway through the project — `9b1b039` is the
commit that carries it out — and the history is left as it happened rather than rewritten to look
as though the decision had always been there. `git log --oneline` shows the seam.

## Does it do what was asked?

Each test's README opens with a table that takes the brief **requirement by requirement** and says
where each one is met and which test proves it, along with the places where the solution departs
from the letter of the brief and why:

- [What the frontend brief asks, and where it is met](./frontend/README.md#what-the-brief-asks-and-where-it-is-met)
- [What the backend brief asks, and where it is met](./backend/README.md#what-the-brief-asks-and-where-it-is-met)

## How the work is organised

The commit history follows the milestones of the development, so the evolution of the project can
be read in order — 49 commits, the first of which already carries this README, as the brief asks.

Continuous integration has run on **every push since it was introduced**: 26 runs across the 32
commits that followed it, checkable with `gh run list`. Two of those runs failed, and they are left
in the history on purpose — one of them is a flaky test whose diagnosis and fix are written up in
the frontend README, and a green wall that hid it would be worth less than the story.

## Design decisions

Design decisions, trade-offs and the quirks found in the APIs are explained in each test's README.
Three of them shape the rest of the code:

- **The one-hour client-side cache** is the most specific requirement of the frontend test, and it
  is built as its own isolated, tested unit. See [`frontend/src/lib/cache`](./frontend/src/lib/cache).
- **The data returned by the frontend test API cannot be trusted**: some fields are misspelled at
  the source and two of them have their contents swapped. Everything is validated and normalised at
  the edge of the application instead of letting those defects spread through the interface. See
  [`frontend/README.md`](./frontend/README.md#the-api-and-its-surprises).
- **On the backend, the cache has to be asynchronous.** Caffeine's synchronous cache runs its
  loading function inside a `synchronized` block, and in Java 21 a virtual thread that blocks
  inside a monitor pins its carrier thread. With virtual threads and slow network calls that sinks
  the service: measured, 1 request in 90 seconds versus 16,400. See
  [`backend/README.md`](./backend/README.md#3-the-cache-is-asynchronous-and-that-detail-changes-everything).

## Licence and attribution

The code in this repository was written for a recruitment process and carries no licence of use.

The exception are the files under `backend/` that come from
[dalogax/backendDevTest](https://github.com/dalogax/backendDevTest) — the API contract, the mocks
and the load test — which are under the Apache License 2.0 and are kept unmodified. See
[`backend/NOTICE.md`](./backend/NOTICE.md).
