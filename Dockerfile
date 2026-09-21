# 本 demo 为 Vite React + npm。离线静态产物放在 public/（含 vendor/）。
FROM node:20-alpine AS build-stage

WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN test -d public/vendor || (echo "缺少 public/vendor，请将离线产物放入 public/" && exit 1)
RUN npm run build

# 若要开启 gzip_static 请将 nginx 镜像改为完整包
FROM nginx:1.19.1-alpine AS production-stage

COPY --from=build-stage /app/html /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
