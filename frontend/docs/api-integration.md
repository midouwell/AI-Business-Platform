# Backend API integration inventory

The Angular application calls the NestJS API through the relative `/api` path. The local `ng serve` proxy forwards that path to `http://localhost:3000`; production must serve the API on the same origin or configure an appropriate reverse proxy. No backend code or endpoints are changed by this frontend.

All endpoints below are prefixed with `/api`. Protected routes require `Authorization: Bearer <accessToken>`. Requests with JSON bodies use `Content-Type: application/json`.

| Method and route                   | Access    | Request                                    | Response and frontend use                                                                                       |
| ---------------------------------- | --------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`              | Public    | `{ email, password, firstName, lastName }` | `{ user, accessToken, refreshToken }`; account creation and sign-in                                             |
| `POST /auth/login`                 | Public    | `{ email, password }`                      | Same session response; sign-in                                                                                  |
| `POST /auth/refresh`               | Public    | `{ refreshToken }`                         | New session response; refresh rotates the one-time refresh token                                                |
| `GET /`                            | Protected | No body                                    | `"Hello World!"`; basic API connectivity only                                                                   |
| `POST /ai/chat`                    | Protected | `{ message }`                              | `{ model, response }`; one-off chat API client method                                                           |
| `POST /conversations`              | Protected | Optional `{ title, agentId }`              | Conversation including its agent and messages; create conversation                                              |
| `GET /conversations`               | Protected | No body                                    | Current user's conversations, ordered by recent activity and including messages and agent; conversation sidebar |
| `GET /conversations/:id`           | Protected | UUID path parameter                        | Conversation with ordered message history; open conversation                                                    |
| `GET /conversations/:id/messages`  | Protected | UUID path parameter                        | Same conversation-history structure; alternate history route                                                    |
| `POST /conversations/:id/messages` | Protected | `{ content }`                              | `{ conversationId, userMessage, assistantMessage }`; send and display a chat turn                               |

## Validation and error handling

- Global DTO validation rejects unknown fields. Email fields must be valid; registration trims names and normalizes email to lowercase.
- Registration password must match `^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{12,72}$`; names are required and at most 100 characters.
- Conversation title is optional and at most 200 characters. An optional `agentId` must be a UUID.
- Chat `message` and conversation `content` must be non-empty strings of at most 4,000 characters.
- Expected failures include validation `400`, invalid credentials or expired/invalid tokens `401`, duplicate registration `409`, inaccessible conversation `403`, missing conversation/agent `404`, and inference or server failures `502`/`503`/`500`.
- The frontend displays NestJS error messages when supplied and provides safe messages for network and generic server failures.

## Response types used by the client

- Auth user: `{ id, email, role, firstName, lastName }`.
- Session: `{ user, accessToken, refreshToken }`.
- Conversation and message shapes correspond to the Prisma `Conversation` and `Message` records returned by the controllers; message roles include `SYSTEM`, `USER`, `ASSISTANT`, and `TOOL`.
- One-off chat response: `{ model, response }`.

## Implemented frontend coverage

The UI uses login/register, conversation creation/listing/history, and persisted conversation message routes. It also exposes a typed one-off chat API method for the supported endpoint. Access tokens are attached to protected API requests; a `401` triggers a single shared refresh attempt and retries the failed request once. Session tokens are held in browser `sessionStorage`. Since the backend has no logout/revocation endpoint, signing out clears the local browser session but does not revoke the server-side refresh token.

## Backend capabilities not available

The inspected backend does not expose agent listing/management, conversation deletion/renaming, user profile or password updates, streaming responses, embeddings, vector search, or document/RAG endpoints. The UI does not simulate these operations; the account page is read-only. Chat inference is performed by the backend through its configured local Ollama service.

The backend entry point does not enable CORS. The development proxy avoids a cross-origin browser request during local development. A production deployment must route `/api` to NestJS on the same origin or explicitly configure backend/deployment CORS as appropriate.
