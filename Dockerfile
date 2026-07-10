# ── build stage: compile better-sqlite3 + build the React frontend ──────────
FROM node:20-alpine AS build
# py3-setuptools provides the distutils shim node-gyp 9.x needs — Alpine's
# python3 is 3.12+, which dropped distutils from the standard library, and
# without this the native build silently fails at gyp's configure step.
RUN apk add --no-cache python3 py3-setuptools make g++
WORKDIR /app
COPY package.json package-lock.json* ./
COPY scripts ./scripts
RUN npm install
COPY . .
RUN npm run build && npm prune --omit=dev

# ── runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5374 \
    DB_PATH=/app/data/door-tracker.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json
VOLUME /app/data
EXPOSE 5374
CMD ["node", "server/index.js"]
