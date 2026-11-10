# Frontend architecture

The application is a standalone Angular application organized by feature:

- `core/auth`: session state, guards, and the bearer-token/refresh interceptor.
- `core/models`: typed API response contracts.
- `core/services`: REST client and conversation-list state.
- `core/errors`: centralized NestJS/network error messages.
- `features/auth`: sign-in and registration forms.
- `features/workspace`: authenticated shell, navigation, conversation history, and sign-out.
- `features/chat`: persisted conversation history and message composition.
- `features/home`: workspace landing page.
- `features/account`: read-only account details returned by the API.

The router lazy-loads each feature and protects the workspace. The REST client uses `/api`; Angular's development-server proxy forwards it to the local backend. No UI library or Markdown renderer is added: the interface uses native controls and renders model output as escaped text.

There are no backend endpoints for editing profile settings, managing agents, deleting conversations, streaming, or RAG, so those operations are intentionally not included.
