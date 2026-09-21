# Se instala con npm ci y no con npm install, y el motivo es el mismo por el
# que el bloqueo de dependencias se genera dentro de un contenedor Linux:
# npm install puede resolver un árbol distinto del bloqueado, así que todo ese
# trabajo no llegaba a aplicarse a lo que de verdad se despliega. npm ci exige
# que el bloqueo cuadre con package.json y falla si no, que es justo lo que se
# quiere de una construcción reproducible.
FROM node:22-alpine AS builder
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
# aplicación arranca y migra sin necesitar el fuente. Sembrar sí lo necesita,
# y por eso no se hace desde aquí: se ejecuta desde una máquina con el
# repositorio, que es como está documentado.
FROM node:22-alpine AS runner
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
