FROM node:24-bookworm-slim AS frontend
WORKDIR /build/ui
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /build/api
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline
COPY src/ ./src/
COPY --from=frontend /build/ui/dist/ ./src/main/resources/static/
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=backend /build/api/target/bug-hit-1.0.0.jar ./bug-hit.jar
USER 10001
EXPOSE 10000
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=50", "-XX:ActiveProcessorCount=2", "-jar", "/app/bug-hit.jar"]
