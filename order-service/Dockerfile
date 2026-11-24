# Stage 1: Build application
FROM maven:3.9-eclipse-temurin-21-alpine AS build

WORKDIR /app

# Copy Maven configuration
COPY pom.xml .

# Download dependencies
RUN mvn -B dependency:go-offline

# Copy application source
COPY src ./src

# Build executable JAR
RUN mvn -B clean package -DskipTests

# Stage 2: Production runtime
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S spring && adduser -S spring -G spring

# Copy JAR from build stage
COPY --from=build --chown=spring:spring /app/target/order-service.jar app.jar

# Run as non-root user
USER spring

EXPOSE 8082

ENTRYPOINT ["java", "-jar", "app.jar"]
