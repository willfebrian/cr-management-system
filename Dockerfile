# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    SAPNWRFC_HOME=/usr/local/sap/nwrfcsdk \
    LD_LIBRARY_PATH=/usr/local/sap/nwrfcsdk/lib

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 make g++ libuuid1 \
    && rm -rf /var/lib/apt/lists/*

# The SAP NW RFC SDK is supplied as a local Docker build context. It is never
# copied into Git, but is required while node-rfc is installed and at runtime.
COPY --from=sapnwrfcsdk / /usr/local/sap/nwrfcsdk/
RUN printf '%s\n' /usr/local/sap/nwrfcsdk/lib > /etc/ld.so.conf.d/sapnwrfc.conf && ldconfig

WORKDIR /app
COPY package.json package-lock.json ./
# The production image still starts TypeScript through tsx, and the build
# requires type packages, so install the complete locked dependency set.
RUN npm ci --include=dev

COPY . .
RUN npm run build \
    && npm cache clean --force \
    && chown -R node:node /app

USER node
EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=4s --start-period=20s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["./node_modules/.bin/tsx", "src/server/index.ts"]
