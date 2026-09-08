# Prueba backend — API de productos similares

Servicio REST que, dado un producto, devuelve el detalle de sus productos similares. Compone la
respuesta a partir de dos APIs existentes: una que da los identificadores de los similares y otra
que da el detalle de un producto.

Expone [el contrato acordado](./similarProducts.yaml) en el puerto 5000.

## Cómo ejecutarlo

Requiere Java 21 y Docker. No hace falta instalar Maven: el proyecto incluye el wrapper.

```bash
# 1. Levantar los simuladores de las APIs existentes y la infraestructura de medición
docker compose up -d simulado influxdb grafana

# 2. Arrancar el servicio
./mvnw spring-boot:run

# 3. Comprobar
curl http://localhost:5000/product/1/similar
```

### Tests

```bash
./mvnw test
```

22 tests. No necesitan Docker: la API existente se sustituye por un doble de WireMock que
reproduce los mismos casos que el simulador, con sus retardos, sus 404 y sus 500.

### Prueba de carga

```bash
docker compose run --rm k6 run scripts/test.js
```

Resultados en el [panel de Grafana](http://localhost:3000/d/Le2Ku9NMk/k6-performance-test).

## Qué hace el servicio ante cada caso

Los cinco escenarios de la prueba de carga cubren un caso distinto cada uno. Esto es lo que
devuelve el servicio, medido contra el simulador:

| Petición | Similares | Qué tiene de particular | Respuesta |
| --- | --- | --- | --- |
| `/product/1/similar` | 2, 3, 4 | nada | 200 con los 3 productos |
| `/product/2/similar` | 3, 100, 1000 | retardos de 100 ms, 1 s y 5 s | 200 con los 3; el lento entra en cuanto está cacheado |
| `/product/3/similar` | 100, 1000, 10000 | el 10000 tarda **50 s** | 200 con los 2 disponibles; el inalcanzable se omite |
| `/product/4/similar` | 1, 2, 5 | el 5 responde **404** | 200 con los 2 que existen |
| `/product/5/similar` | 1, 2, 6 | el 6 responde **500** | 200 con los 2 que responden |

Y los casos de error de la petición en sí:

| Situación | Respuesta | Por qué |
| --- | --- | --- |
| El producto de la petición no existe | **404** | Lo indica el contrato |
| La API existente falla al dar los similares | **502** | El fallo es de una dependencia, no nuestro. Un 500 diría que el error es del servicio, y un 200 con lista vacía mentiría diciendo que ese producto no tiene similares |

## Las tres decisiones que determinan el rendimiento

### 1. En paralelo, no en serie

Los detalles se piden todos a la vez. En serie, la latencia sería la **suma** de las llamadas; en
paralelo es el **máximo**. Con los retardos del simulador para el producto 2 (100 ms, 1 s y 5 s),
la diferencia es de más de seis segundos a poco más de cinco.

Cada llamada va en un hilo virtual, así que no hay ningún pool que dimensionar y bloquearse
esperando a la red deja de ser caro. El servidor también atiende cada petición en un hilo virtual
(`spring.threads.virtual.enabled`).

### 2. Presupuesto de tiempo corto, pero sin cancelar el trabajo

Hay un presupuesto para toda la petición (1,5 s). Lo que no llega dentro de él se omite de la
respuesta, porque un solo producto lento no debe decidir la latencia de la respuesta entera.

Lo importante es lo que **no** se hace: la llamada descartada **no se cancela**. Sigue su curso y,
al terminar, deja el producto en la caché, de modo que las peticiones siguientes lo incluyen. La
primera versión sí la cancelaba, y eso tiraba justamente el trabajo que iba a acelerar todo lo
demás: cada ciclo volvía a pagar la espera desde cero.

El coste de no cancelar está acotado por dos lados: por el límite de tiempo de lectura del cliente
HTTP, y porque la caché deduplica por producto, así que nunca hay más de una llamada en vuelo para
el mismo identificador.

### 3. La caché es asíncrona, y ese detalle lo cambia todo

Esta es la decisión que más rendimiento aportó, y la encontré midiendo.

La caché sincrónica de Caffeine se apoya en `ConcurrentHashMap.computeIfAbsent`, que ejecuta la
función de carga **dentro de un bloque `synchronized`**. En Java 21, un hilo virtual que se
bloquea dentro de un monitor **fija su hilo portador**: no se desmonta, y ese hilo de plataforma
queda inutilizable mientras dure el bloqueo. Como la carga hace una llamada de red que puede
tardar segundos, unas pocas cargas simultáneas bastan para clavar todos los portadores del
planificador y dejar la aplicación sin atender peticiones.

Medido con la prueba de carga del propio ejercicio, 200 usuarios y caché vacía:

| Métrica | Caché sincrónica | Caché asíncrona |
| --- | --- | --- |
| Peticiones completadas | 1.608 | **16.400** |
| Throughput | 17,8/s | **272,2/s** |
| Latencia mediana | 15,3 ms | **5,7 ms** |
| Latencia media | 1,63 s | **120 ms** |
| Percentil 90 | 6,50 s | **60,5 ms** |
| Percentil 95 | 6,56 s | 1,51 s |
| Errores HTTP | 0 | **0** |

Quince veces más throughput y un percentil 90 que baja de seis segundos y medio a sesenta
milisegundos. El percentil 95 que queda (1,51 s) es exactamente el presupuesto de la petición: son
las peticiones que caen en la ventana en la que un producto lento todavía no está cacheado.

La caché asíncrona guarda en el mapa un futuro —operación inmediata, sin bloqueo bajo el
monitor— y ejecuta la llamada fuera. Conserva la deduplicación y elimina la fijación.

## Resiliencia

### Deduplicación de llamadas idénticas

La caché guarda la llamada **en curso**, no solo su resultado. Doscientas peticiones simultáneas
que necesiten el mismo producto generan **una** llamada al origen. Sin esto, el arranque de cada
escenario de la prueba de carga lanza doscientas llamadas idénticas contra un origen lento.

### Cortacircuitos con granularidad por producto

No se usa una librería de cortacircuitos, y es una decisión deliberada: sus interruptores son por
nombre, y aquí el fallo es **por producto**. El producto 10000 tarda 50 segundos pero el 100
responde en uno; un interruptor compartido abierto por el primero dejaría de servir el segundo,
que está perfectamente sano.

En su lugar, el resultado de consultar un producto se modela como un tipo sellado con tres casos, y
cada uno tiene su propia expiración en caché:

| Resultado | Expiración | Razonamiento |
| --- | --- | --- |
| `Found` | 5 min | Un dato bueno se puede reutilizar |
| `Missing` (404) | 1 min | Que un producto no exista es estable: no va a aparecer de golpe |
| `Unavailable` (fallo o tiempo agotado) | 10 s | Es transitorio: se recuerda poco y se vuelve a intentar |

El efecto es el de un cortacircuitos en el sitio correcto: el primer intento paga la espera, y
durante los segundos siguientes ese producto se descarta al instante mientras el resto se sigue
atendiendo con normalidad.

### Resultados parciales antes que ningún resultado

Un similar que no existe, que falla o que tarda demasiado se omite de la respuesta. El contrato
define una lista de similares, y que uno de ellos haya desaparecido del catálogo no invalida los
demás. La alternativa —fallar la respuesta entera— convertiría el fallo de un producto en el fallo
de todos.

### Límites de tiempo separados

Conectar y leer son fallos distintos: una conexión rechazada se sabe al instante (1 s), mientras
que un origen lento puede tardar lo que quiera (6 s). El límite de lectura se eligió por encima
del producto que tarda 5 segundos, para que llegue a responder y quede cacheado, y muy por debajo
del que tarda 50, que nunca merece la espera.

## Seguridad

- **Imagen sin privilegios.** El contenedor corre como usuario `spring`, no como root, y la imagen
  final lleva solo el JRE: sin JDK ni herramientas de compilación.
- **Endpoints de gestión restringidos** a salud, información y métricas. Exponerlos todos publica
  la configuración, las variables de entorno y los volcados de hilos.
- **Los detalles de salud no se publican** (`show-details: never`): revelan los servicios de los
  que depende el sistema.
- **No se anuncia el servidor ni su versión** en las respuestas. Es información que solo le sirve a
  quien busca una vulnerabilidad conocida.
- **Los mensajes de error no incluyen la excepción ni su traza.** Los errores son una vía habitual
  de filtración: rutas del sistema, nombres de host internos, versiones de librerías. El detalle
  técnico va al registro del servidor.
- **Los identificadores se pasan como variables de plantilla de URI** (`/product/{productId}`), no
  concatenados, de modo que el cliente HTTP los codifica y no pueden alterar la ruta.
- **Dependencias mínimas**: web, caché, actuator y validación. Menos superficie de cadena de
  suministro.

## Cómo está organizado

```
src/main/java/com/itx/similarproducts/
├── catalog/    Acceso a la API existente, caché y tipos de resultado
├── config/     Cliente HTTP, ejecutor y propiedades
├── domain/     El modelo del contrato
├── service/    Composición en paralelo con presupuesto de tiempo
└── web/        Controlador y traducción de errores a HTTP
```

Un detalle de configuración que merece explicación: el ejecutor de hilos virtuales es un **bean
compartido**, no uno creado por petición. Desde que `ExecutorService` implementa `AutoCloseable`,
cerrarlo en un `try-with-resources` **espera a que terminen todas las tareas**, lo que anularía el
presupuesto de tiempo: tras descartar una llamada lenta, el cierre del ejecutor se quedaría
esperándola igualmente.

## Qué haría con más tiempo

- Un *bulkhead* que limite las llamadas concurrentes al origen. Ahora las acotan la caché y el
  pool de conexiones, que basta a esta escala, pero no es un límite explícito.
- Métricas propias de aciertos de caché y de similares omitidos por tiempo agotado, que es lo que
  querría vigilar en producción.
- Contract testing contra el `similarProducts.yaml`, para que el contrato se verifique solo.
