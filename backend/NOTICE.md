# Third-party files

Part of the content of this folder **is not original work**: it comes from the repository that the
test brief points to as a starting point, and it is kept unmodified so that the evaluation can be
run exactly as described there.

**Source:** [dalogax/backendDevTest](https://github.com/dalogax/backendDevTest)
**Licence:** Apache License 2.0 — full text in [`LICENSE-APACHE-2.0`](./LICENSE-APACHE-2.0)

## Files copied unmodified

| File | What it is for |
| --- | --- |
| `similarProducts.yaml` | Contract of the operation to implement |
| `existingApis.yaml` | Contract of the two existing APIs being consumed |
| `docker-compose.yaml` | Brings up the mocks, InfluxDB and Grafana, and runs k6 |
| `shared/simulado/mocks.json` | Mock definitions, with their delays, 404s and 500s |
| `shared/k6/test.js` | The load test: five scenarios, 200 virtual users each |
| `shared/grafana/**` | Dashboard and datasource used to read the results |

None of these files has been touched, on purpose: they are the test bench the solution is judged
with, and modifying them would invalidate the comparison.

## Original work

Everything else in this folder is original: `src/`, `pom.xml`, `Dockerfile`, `README.md`, the Maven
Wrapper and this very file.
