# Prueba frontend — Tienda de dispositivos móviles

Miniaplicación para comprar teléfonos móviles: listado de productos con búsqueda y ficha de
detalle con selección de opciones y añadido a la cesta.

SPA con enrutado en cliente, sin renderizado en servidor y sin navegación entre documentos.

## Cómo ejecutarlo

Requiere Node 20 o superior.

```bash
npm install
npm start          # modo desarrollo, en http://localhost:5173
```

> **La primera carga tarda unos 40 segundos.** No es la aplicación: la API de la prueba está
> alojada en el plan gratuito de Render, que apaga el servicio cuando no recibe tráfico, y la
> primera petición tiene que arrancarlo. La aplicación lo explica en pantalla mientras espera,
> y guarda la respuesta en caché para no repetir la espera. Está medido, no estimado.

### Scripts

| Script | Qué hace |
| --- | --- |
| `npm start` | Modo desarrollo con recarga en caliente |
| `npm run build` | Compilación para producción (comprueba tipos y empaqueta) |
| `npm test` | Ejecuta la batería de tests una vez |
| `npm run lint` | Comprobación de código (falla ante cualquier aviso) |
| `npm run test:watch` | Tests en modo continuo |
| `npm run test:coverage` | Tests con informe de cobertura |
| `npm run typecheck` | Solo comprobación de tipos |

La URL de la API se puede cambiar con `VITE_API_BASE_URL`; ver [`.env.example`](./.env.example).

## Stack

| Pieza | Elección | Motivo |
| --- | --- | --- |
| Framework | React 19 | Exigido por el enunciado |
| Lenguaje | TypeScript en modo estricto | La API devuelve datos irregulares; los tipos son lo que obliga a tratarlos |
| Empaquetador | Vite 8 | Arranque inmediato en desarrollo y configuración mínima |
| Enrutado | React Router 8 | Estándar de facto para SPA |
| Estilos | CSS Modules + variables CSS | Ámbito local sin dependencias ni tiempo de ejecución |
| Tests | Vitest + Testing Library | Comparte configuración con Vite, sin un segundo pipeline |
| Linter | oxlint | El que instala Vite por defecto; incluye reglas de accesibilidad |

**Sin librería de componentes ni de estado.** El enunciado valora el nivel de detalle de la
propuesta de diseño, y con Material UI el diseño sería el de la librería. Para el estado,
React basta: el de la cesta es un contador y el del catálogo lo resuelve la capa de datos.

## Cómo está organizado

```
src/
├── api/          Cliente HTTP, validación de respuestas y capa de datos con caché
├── cart/         Estado de la cesta y su persistencia
├── components/   Componentes de interfaz reutilizables
├── domain/       Modelo de dominio y lógica de búsqueda (sin React ni red)
├── hooks/        Hooks de carga asíncrona y de retardo
├── lib/          Caché con expiración, formateo y utilidades de validación
├── pages/        Las dos vistas, cargadas en diferido
└── test/         Utilidades de test y fixtures con respuestas reales de la API
```

El criterio es que **nada de React entre en `domain/` ni en `lib/`**: son funciones puras y
clases sin dependencias de la interfaz, lo que las hace triviales de probar y reutilizables.

## Decisiones que merecen explicación

### La caché de cliente con expiración de una hora

Es el requisito más específico del enunciado, así que está implementada como una pieza propia
y aislada en [`src/lib/cache/`](./src/lib/cache).

Cada entrada se guarda en un sobre con la versión del formato, el instante de expiración y los
datos. Cuatro decisiones de diseño:

1. **Se valida al leer, no solo al escribir.** `get()` exige un parser. Lo que sale de
   `localStorage` es texto que el usuario puede editar desde la consola del navegador, o que
   escribió una versión anterior de la aplicación: tratarlo como dato de confianza es lo que
   convierte una caché en un problema de seguridad.
2. **Al expirar se descarta y se revalida** contra la API, que es literalmente lo que pide el
   enunciado. Se consideró servir el dato caducado mientras se revalida en segundo plano
   (*stale-while-revalidate*), pero eso muestra información vencida.
3. **Las claves llevan namespace y versión.** Subir la versión invalida de golpe todo lo
   cacheado en los navegadores, que es lo que hay que poder hacer cuando cambia la forma de los
   datos: sin esto, quien ya tuviera datos guardados seguiría leyendo el formato antiguo.
4. **Ningún fallo del almacén se propaga.** La caché es una optimización. Cuando se agota la
   cuota libera lo suyo y reintenta una vez; si `localStorage` no está disponible —navegación
   privada de Safari, cookies de terceros bloqueadas— degrada a memoria y la aplicación sigue
   funcionando.

El reloj es inyectable, así que los tests comprueban la expiración avanzando un reloj falso en
lugar de esperar una hora: sirve justo antes de cumplirse, caduca al cumplirse, y tras
revalidar vuelve a contar una hora nueva.

### La API y sus sorpresas

Los datos de la API tienen defectos reales. Se corrigen **en un único punto**
([`src/api/schema.ts`](./src/api/schema.ts)), traduciendo a un modelo de dominio propio, en
lugar de repartir esos arreglos por los componentes:

| Qué pasa | Detalle | Cómo se resuelve |
| --- | --- | --- |
| Dos campos con el contenido intercambiado | `displayResolution` trae las **pulgadas** y `displaySize` los **píxeles**, al revés de lo que dicen sus nombres | Se cruzan al traducir, a `screenSize` y `screenResolution` |
| Nombres mal escritos en el origen | `dimentions` y `secondaryCmera` | Se leen con su nombre real y se exponen bien escritos |
| Diez campos cambian de tipo según el producto | `cpu`, `os`, `sim`, `primaryCamera`, `wlan`, `sensors`… llegan como texto o como lista | Se normalizan siempre a `string[]` |
| Precio vacío | `price` es texto y viene `""` en 6 de los 100 productos | Se traduce a `null`, y la interfaz muestra «Precio no disponible» |
| Campos vacíos | `nfc` viene vacío en todos los productos muestreados | Las filas sin valor se omiten de la ficha |

Lo del tipo variable no es cosmético: **React renderiza un array concatenando sus elementos
sin separador**, así que una implementación que pinte `product.cpu` directamente muestra
`"Deca-core (2x2.3 GHz Cortex-A724x1.9 GHz Cortex-A53"`.

Las fixtures de los tests son respuestas reales copiadas tal cual, de modo que los tests valen
como documentación ejecutable: si algún día la API se corrige, fallarán y habrá que ajustar la
traducción a propósito.

### El contador de la cesta

El enunciado pide mostrar en la cabecera **el valor que devuelve la API** al añadir, y
persistirlo. Es lo que hace la aplicación: la API es la fuente de la verdad y no se lleva una
cuenta paralela en el cliente.

Conviene saber que **`POST /api/cart` de la prueba responde siempre `{"count": 1}`**, también
al añadir el segundo o el tercer producto (comprobado con peticiones sucesivas). Por eso el
contador se queda en 1 al usar la aplicación: es el comportamiento del simulador, no un fallo
de la implementación. Contra una API real que informara el tamaño verdadero de la cesta, el
código funcionaría sin cambios.

### El término de búsqueda vive en la URL

Se refleja en el parámetro `?q=`, lo que da tres cosas gratis: la búsqueda se puede compartir
por enlace, el botón de atrás del navegador se comporta como el usuario espera, y volver desde
la ficha recupera la lista filtrada tal y como estaba.

El campo mantiene además su propio estado local para que escribir sea instantáneo; solo la
escritura en la URL lleva retardo, y con `replace` para no dejar una entrada de historial por
cada letra. El filtrado **no** se retrasa: los productos ya están en memoria y retrasarlo solo
añadiría latencia artificial.

La búsqueda ignora los acentos y exige todas las palabras en cualquier orden, así que «liquid
acer» encuentra el «Acer Liquid Z6».

### Los selectores de opciones

Grupos de radios dentro de un `fieldset` con `legend`, no listas de botones ni `<select>`. Es
el elemento que corresponde a una elección excluyente: el lector de pantalla anuncia «Color,
grupo, opción 1 de 2» y el teclado se mueve con las flechas sin necesidad de escribir código.

Con una sola opción se preselecciona, como pide el enunciado. Con varias **no** se
preselecciona ninguna y el botón permanece deshabilitado, con una explicación al lado: el
color y la capacidad determinan qué producto se compra, y elegirlos por el usuario invita a
añadir a la cesta algo distinto de lo que quería.

## Rendimiento

- **Carga diferida por ruta.** Cada vista acaba en su propio fragmento, así que quien abre el
  listado no descarga el código de la ficha. Es el motivo por el que no hace falta configurar
  el troceado manual del empaquetador.
- **Imágenes en diferido y con espacio reservado.** El contenedor declara su proporción en
  CSS, de modo que la rejilla no se desplaza a medida que llegan las fotos.
- **Filtrado memoizado** y una referencia estable cuando no hay búsqueda, para no rehacer la
  rejilla sin motivo.
- **Deduplicación de peticiones en vuelo.** Si dos componentes piden el mismo recurso a la
  vez, la caché no ayuda porque ninguna petición ha terminado; un registro de promesas en
  curso hace que la segunda espere a la primera.
- **Formateadores de `Intl` creados una sola vez** a nivel de módulo, no en cada tarjeta.

**No se virtualiza la lista, a propósito.** Son 100 productos. Virtualizar añadiría una
dependencia, rompería la búsqueda del navegador y complicaría la accesibilidad para resolver
un problema que a esta escala no existe. A partir de unos miles de elementos la respuesta
correcta no es virtualizar, es paginar en el servidor.

## Accesibilidad

- Enlace «Saltar al contenido» como primer elemento enfocable.
- Estructura semántica: migas de pan como `nav` + lista ordenada con `aria-current`, ficha
  técnica como lista de definiciones, catálogo como lista con nombre accesible.
- Regiones vivas que anuncian el número de resultados al filtrar, el estado de carga y el
  resultado de añadir a la cesta.
- Radios nativos ocultos visualmente pero presentes en el árbol de accesibilidad y en el orden
  de tabulación, de modo que se conserva todo el comportamiento nativo con el diseño propio.
- Un único estilo de foco visible, con `:focus-visible`, en modo claro y oscuro.
- Se respeta `prefers-reduced-motion`: el movimiento puede provocar mareo y migraña.
- Las reglas de `jsx-a11y` están activas en el linter, que falla ante cualquier aviso.

## Seguridad

El alcance real es limitado y conviene decirlo: es una SPA estática contra una API pública sin
autenticación, sin sesiones ni datos personales. Lo que sí aplica:

- **No se usa `dangerouslySetInnerHTML` en ningún sitio**, y el linter lo prohíbe por
  configuración. React escapa el texto por defecto; el riesgo de XSS aparece justo al salirse
  de ese camino.
- **No se confía en ningún dato externo**: ni en las respuestas de la API ni en el contenido de
  `localStorage`, que es editable por el usuario. Todo pasa por validación en ejecución. Es la
  medida más real de este proyecto.
- **Las URLs se construyen codificando cada segmento**, de modo que un identificador que
  contenga `../` o `?` no pueda alterar la ruta ni añadir parámetros. Hay un test que lo
  comprueba.
- **Enlaces externos con `rel="noreferrer"`**, obligado por el linter.
- **Dependencias mínimas**: react, react-dom y react-router en producción. Menos dependencias,
  menos superficie de cadena de suministro. Se auditan en integración continua.
- No se guarda nada sensible en el navegador: solo el catálogo, que es público, y el contador
  de la cesta.

## Tests

134 tests. 97% de cobertura de sentencias y 100% de funciones.

```bash
npm test
npm run test:coverage
```

Se reparten en tres niveles:

- **Unitarios** sobre la caché con expiración, los parsers, la búsqueda y el formateo.
- **De contrato** sobre la traducción de la API, con fixtures reales, que documentan sus
  defectos y avisarán si cambian.
- **De integración** sobre las dos vistas con Testing Library, recorriendo los flujos de
  verdad: filtrar, no encontrar nada y salir del estado vacío, seleccionar opciones, añadir a
  la cesta y ver el contador en la cabecera, y los fallos de red, 404 y respuesta malformada
  con su reintento.

Las consultas se hacen por rol y por nombre accesible, no por clase CSS ni por identificador
de test: si un test encuentra el botón como lo encontraría un lector de pantalla, la
accesibilidad queda comprobada de paso.

## Qué haría con más tiempo

- Tests de extremo a extremo con Playwright sobre los dos recorridos completos.
- Internacionalización: los textos están incrustados en los componentes.
- Mover la caché a IndexedDB si el catálogo creciera, porque `localStorage` es sincrónico y
  serializar bloquea el hilo principal.
