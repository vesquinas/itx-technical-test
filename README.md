# Prueba técnica — Frontend + Backend

Este repositorio contiene las dos pruebas técnicas en un único proyecto, cada una en su
carpeta y con su propia documentación:

| Carpeta | Prueba | Stack | Documentación |
| --- | --- | --- | --- |
| [`frontend/`](./frontend) | Miniaplicación de compra de dispositivos móviles (PLP + PDP) | React 19 · TypeScript · Vite | [frontend/README.md](./frontend/README.md) |
| [`backend/`](./backend) | API REST de productos similares | Java 21 · Spring Boot | [backend/README.md](./backend/README.md) |

## Arranque rápido

```bash
# Frontend
cd frontend && npm install && npm start

# Backend
cd backend && ./mvnw spring-boot:run
```

## Cómo está organizado el trabajo

El historial de commits sigue los hitos del desarrollo, de manera que se puede leer la
evolución del proyecto en orden. Cada hito deja la aplicación en un estado que compila,
pasa el linter y pasa los tests.

## Documentación de decisiones

Las decisiones de diseño, los compromisos asumidos y las particularidades encontradas en
las APIs están explicadas en el README de cada prueba. Merece la pena destacar dos que
condicionan el resto del código:

- **La caché de cliente con expiración de una hora** es el requisito más específico de la
  prueba de frontend y está implementada como una pieza propia, aislada y testeada.
  Ver [`frontend/src/lib/cache`](./frontend/src/lib/cache).
- **Los datos que devuelve la API de la prueba de frontend no son de fiar**: hay campos con
  el nombre mal escrito y dos campos con el contenido intercambiado. Se validan y se
  normalizan en el borde de la aplicación en lugar de propagar esos defectos por la interfaz.
  Ver [`frontend/README.md`](./frontend/README.md#la-api-y-sus-sorpresas).

## Licencia

Código escrito para un proceso de selección. Sin licencia de uso.
