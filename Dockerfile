# MAZ Fishing — app + API gestion locative
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000
VOLUME /data
CMD ["node", "server.js"]
