FROM node:20-alpine

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

ENV NODE_ENV=production

# Expose default leaderboard port (can be overridden by env)
EXPOSE 5000

CMD ["node", "src/index.js"]
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "src/index.js"]
