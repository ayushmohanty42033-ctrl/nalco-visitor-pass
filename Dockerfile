# Build stage
FROM maven:3.9.6-eclipse-temurin-21-alpine AS build
WORKDIR /app
COPY pom.xml .
# Cache dependencies for faster subsequent builds
RUN mvn dependency:go-offline -B
COPY src ./src
# Build the Spring Boot application JAR
RUN mvn clean package -DskipTests

# Run stage
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
# Copy the built JAR from the previous stage
COPY --from=build /app/target/*.jar app.jar
# Expose the standard Render web port
EXPOSE 8080
# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
