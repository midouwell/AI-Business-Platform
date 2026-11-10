# AI Business Platform frontend

Standalone Angular 22 application for signing in, managing persisted conversations, and chatting with the NestJS API.

## Run locally

Start the backend on port `3000`, with its database and local Ollama model available. In a separate terminal:

```powershell
cd C:\Dev\AI-Business-Platform\frontend
npm install
npm start
```

Open `http://localhost:4200`. The development-server proxy in `proxy.conf.json` forwards `/api` requests to `http://localhost:3000`. Sign in with an existing backend account or register a new one. The workspace chat uses the backend's persisted conversation endpoints; model inference is performed by the backend.

For production, serve the NestJS API on the same origin under `/api` or configure a reverse proxy. The frontend does not contain API credentials or connect directly to Ollama/PostgreSQL.

## Verify

```powershell
npm run build
npm test -- --watch=false
```

The API endpoint inventory and currently unavailable backend functionality are documented in [docs/api-integration.md](./docs/api-integration.md). The route and service structure is described in [docs/frontend-architecture.md](./docs/frontend-architecture.md).
