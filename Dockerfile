FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm install

FROM base AS dev
ENV NODE_ENV=development
ENV PORT=3001
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3001
ENTRYPOINT ["sh", "./scripts/docker-entrypoint.sh"]
