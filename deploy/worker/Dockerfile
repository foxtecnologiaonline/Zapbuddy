# Build context é a raiz do monorepo (ver docker-compose.yml: context: ../..)
# porque o worker depende de @zapbuddy/core e @zapbuddy/db via npm workspaces —
# nenhum deles é publicado, então o build precisa dos 3 diretórios juntos.
# Node 22+ é necessário: @supabase/supabase-js tenta inicializar um
# WebSocket nativo ao criar o client (mesmo sem usar Supabase Realtime) —
# em Node 20 isso falha com "Node.js detected but native WebSocket not
# found", derrubando toda query (findUserById, etc.) nos 3 handlers.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/worker/package.json apps/worker/package.json

# --omit=dev: tsx (runtime, já é dependency do worker) transpila TS sozinho,
# não precisa do pacote "typescript" (devDependency) presente em build/prod.
RUN npm ci --omit=dev

COPY packages/core packages/core
COPY packages/db packages/db
COPY apps/worker apps/worker

CMD ["npm", "run", "start", "--workspace=@zapbuddy/worker"]
