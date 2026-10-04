# Addon-Variante (Stremio Addon Protocol), siehe README
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# rebuild providers/ from src/ like the Pages workflow, then drop esbuild
RUN node build.js && npm prune --omit=dev
ENV PORT=7000
EXPOSE 7000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:$PORT/health || exit 1
USER node
CMD ["node", "addon/server.js"]
