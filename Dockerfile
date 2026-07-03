# Builds and serves the docs site (guide + API reference + in-browser
# playground). Build context must be the repo root (not docs/) because docs
# depends on helix via `file:../helix` - npm needs helix's source and its
# built dist/ present to link and compile against.
#
#   docker build -t compiler-docs -f Dockerfile .
#   docker run -d -p 8080:80 compiler-docs

FROM node:22-slim AS build
WORKDIR /repo

COPY helix/package*.json helix/
RUN npm --prefix helix ci

COPY helix helix
RUN npm --prefix helix run build

COPY docs/package*.json docs/
RUN npm --prefix docs ci

COPY docs docs
RUN npm --prefix docs run build

FROM nginx:alpine AS serve
COPY --from=build /repo/docs/.vitepress/dist /usr/share/nginx/html
EXPOSE 80
