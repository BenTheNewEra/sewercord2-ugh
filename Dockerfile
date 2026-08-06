FROM node:20-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && apt-get clean

WORKDIR /app

# Copy package files and install deps
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Create data directory (Railway volume will mount here)
RUN mkdir -p /app/data

CMD ["node", "index.js"]
