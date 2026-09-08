# ---------- Build ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# The pom first: as long as the dependencies do not change, Docker reuses this layer and does
# not download them again on every build.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q -DskipTests package

# ---------- Runtime ----------
# An image with no JDK and no build tooling: less attack surface and a much smaller image than
# the build one.
FROM eclipse-temurin:21-jre-alpine AS runtime

# Unprivileged user: a compromised process should not be root inside the container. It is the
# cheapest hardening measure that fits here.
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

WORKDIR /app
COPY --from=build --chown=spring:spring /build/target/*.jar app.jar

EXPOSE 5000

# `MaxRAMPercentage` instead of a fixed `-Xmx`: the JVM sizes itself to the container's memory
# limit rather than to the host machine's memory.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
