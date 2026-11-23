FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./package.json
COPY scripts/build.js ./scripts/build.js
COPY src/ ./src/
COPY web/ ./web/
RUN node scripts/build.js

FROM nginx:alpine
ARG TAIKO_COMMIT=unknown
LABEL org.opencontainers.image.revision=$TAIKO_COMMIT
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
