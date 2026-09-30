# Se instala con npm ci y no con npm install, y el motivo es el mismo por el
# que el bloqueo de dependencias se genera dentro de un contenedor Linux:
# npm install puede resolver un árbol distinto del bloqueado, así que todo ese
# trabajo no llegaba a aplicarse a lo que de verdad se despliega. npm ci exige
# que el bloqueo cuadre con package.json y falla si no, que es justo lo que se
# quiere de una construcción reproducible.
# Versión y resumen fijos: con «22-alpine» a secas, dos construcciones del
# mismo commit podían salir con Node o Alpine distintos, según el día.
# Dependabot propone la siguiente (ver .github/dependabot.yml).
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Segunda etapa: solo lo que hace falta para ejecutar.
#
# Antes la imagen era de una sola etapa y llevaba dentro el código fuente, las
# dependencias de desarrollo y el compilador. Nada de eso se usa al servir, y
# todo suma superficie de ataque y tamaño.
#
# Las migraciones se resuelven contra dist/database/migrations, así que la
# aplicación arranca y migra sin necesitar el fuente. La semilla también va
# compilada, en dist/database/seeds/run-seed.js, y se puede lanzar dentro del
# contenedor: es lo que hace el README con Docker Compose.
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=node:node /app/dist ./dist

# Sin esto el proceso corre como root dentro del contenedor. No hace falta
# para nada: no escribe en disco ni abre puertos privilegiados.
USER node

EXPOSE 3001
CMD ["node", "dist/main.js"]
