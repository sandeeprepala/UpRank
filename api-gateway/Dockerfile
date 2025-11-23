FROM node:20-alpine

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

ENV NODE_ENV=production

# Expose default gateway port (can be overridden by env)
EXPOSE 3000

CMD ["node", "src/index.js"]
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 4000
CMD ["node", "src/index.js"]
