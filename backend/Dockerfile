# ---------- Compilacion ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Primero solo el pom: mientras no cambien las dependencias, Docker reutiliza esta
# capa y no vuelve a descargarlas en cada compilacion.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q -DskipTests package

# ---------- Ejecucion ----------
# Imagen sin JDK ni herramientas de compilacion: menos superficie de ataque y una
# imagen mucho mas pequena que la de compilacion.
FROM eclipse-temurin:21-jre-alpine AS runtime

# Usuario sin privilegios: un proceso comprometido no debe ser root dentro del
# contenedor. Es la medida de endurecimiento mas rentable de las que caben aqui.
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

WORKDIR /app
COPY --from=build --chown=spring:spring /build/target/*.jar app.jar

EXPOSE 5000

# `MaxRAMPercentage` en lugar de un `-Xmx` fijo: la JVM se ajusta al limite de
# memoria del contenedor en lugar de a la memoria de la maquina anfitriona.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
