# Destek Merkezi sunucusu (Docker / VPS)
#   docker build -t destek-merkezi .
#   docker run -d --name destek --env-file .env -p 127.0.0.1:8080:8080 -v destek-data:/data destek-merkezi
# Ayrıntı: docs/SUNUCU_KURULUMU.md

# 1. aşama: tarayıcı arayüzünü derle
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app ./app
COPY lib ./lib
COPY public ./public
RUN npm run build

# 2. aşama: yalnızca sunucu. Sunucu Node'un yerleşik modülleriyle çalışır; node_modules gerekmez.
FROM node:24-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY lib ./lib
COPY --from=build /app/public ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.mjs"]
