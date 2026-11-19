FROM node:22-alpine

WORKDIR /app

# Zero external runtime dependencies — copy only runtime files
COPY package.json ./
COPY bin ./bin
COPY src ./src

RUN chown -R node:node /app
USER node

ENTRYPOINT ["node", "bin/arch-guard-mcp.mjs"]
