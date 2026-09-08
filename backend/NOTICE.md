# Ficheros de terceros

Parte del contenido de esta carpeta **no es obra propia**: proviene del repositorio que el
enunciado de la prueba indica como punto de partida, y se conserva sin modificar para que la
evaluación se pueda ejecutar tal y como está descrita allí.

**Origen:** [dalogax/backendDevTest](https://github.com/dalogax/backendDevTest)
**Licencia:** Apache License 2.0 — texto completo en [`LICENSE-APACHE-2.0`](./LICENSE-APACHE-2.0)

## Ficheros copiados sin modificar

| Fichero | Para qué sirve |
| --- | --- |
| `similarProducts.yaml` | Contrato de la operación que hay que implementar |
| `existingApis.yaml` | Contrato de las dos APIs existentes que se consumen |
| `docker-compose.yaml` | Levanta los simuladores, InfluxDB y Grafana, y ejecuta k6 |
| `shared/simulado/mocks.json` | Definición de los simuladores, con sus retardos, 404 y 500 |
| `shared/k6/test.js` | La prueba de carga: cinco escenarios, 200 usuarios cada uno |
| `shared/grafana/**` | Panel y origen de datos para ver los resultados |

Ninguno de estos ficheros se ha tocado, a propósito: son el banco de pruebas con el que se
evalúa la solución, y modificarlos invalidaría la comparación.

## Obra propia

Todo lo demás de esta carpeta es implementación propia: `src/`, `pom.xml`, `Dockerfile`,
`README.md`, el Maven Wrapper y este mismo fichero.
