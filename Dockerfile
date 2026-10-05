FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY index*.html manifest.webmanifest sw.js ./
COPY assets ./assets
COPY ai ./ai
COPY data ./data
RUN mkdir -p /app/data/memory
ENV NODE_ENV=production
ENV PORT=8123
EXPOSE 8123
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8123/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]