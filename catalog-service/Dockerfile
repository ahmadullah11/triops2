
# Use Node.js 24 Alpine Linux as the base image
FROM node:24-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy dependency definitions first
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source code
COPY server.js ./

# Run as the non-root node user
USER node

# Document the application port
EXPOSE 3000

# Health check: verify the application responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the application
CMD ["npm", "start"]
