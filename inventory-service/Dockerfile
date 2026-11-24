# ==========================================
# Stage 1: Build the Go application
# ==========================================
FROM golang:1.26-alpine AS builder

WORKDIR /src

# Copy dependency files first for better layer caching
COPY go.mod go.sum ./

# Download Go dependencies
RUN go mod download

# Copy application source code
COPY main.go .

# Compile a statically linked Linux executable
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" \
    -o /out/inventory .


# ==========================================
# Stage 2: Minimal production runtime
# ==========================================
FROM scratch

WORKDIR /

# Copy only the compiled application
COPY --from=builder /out/inventory /inventory

# Application port
EXPOSE 8081

# Docker health check using the application's
# built-in healthcheck functionality
HEALTHCHECK --interval=30s --timeout=5s \
    --start-period=10s --retries=3 \
    CMD ["/inventory", "-healthcheck"]

# Run the application
ENTRYPOINT ["/inventory"]