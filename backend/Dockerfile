FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY backend/package.json backend/package-lock.json* backend/tsconfig.json ./
RUN npm install

FROM deps AS builder
COPY backend/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=2567

COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 2567

CMD ["node", "dist/index.js"]
