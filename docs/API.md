# Bug Hit API

Protected routes accept `Authorization: Bearer <token>`. `POST /api/auth/signup` returns a user and token from `{ name, email, password }`. `POST /api/auth/login` uses `{ email, password }`. The session lasts eight hours. `GET /api/auth/me` returns the current account, and `POST /api/auth/logout` revokes the session.

| Method and path | Purpose |
| --- | --- |
| `GET /api/projects` | List the projects available to the current user |
| `POST /api/projects` | Create a project with `{ key, name, description }` |
| `GET`, `PUT`, `DELETE /api/projects/{project}` | Read, update, or delete a project |
| `GET`, `POST /api/projects/{project}/members` | List members or add an existing account with `{ email, role }` |
| `PATCH`, `DELETE /api/projects/{project}/members/{account}` | Change `{ role }` or remove a member |
| `GET`, `POST /api/projects/{project}/issues` | Search issues or create a ticket |
| `GET`, `PUT`, `DELETE /api/projects/{project}/issues/{issue}` | Read, edit, or delete a ticket |
| `PATCH /api/projects/{project}/issues/{issue}/status` | Move a ticket using `{ status }` |
| `GET`, `POST /api/projects/{project}/issues/{issue}/comments` | Read comments or submit `{ body }` |
| `GET`, `POST /api/projects/{project}/issues/{issue}/attachments` | List screenshot metadata or upload a multipart `file` |
| `GET /api/projects/{project}/issues/{issue}/attachments/{attachment}` | Download a screenshot |

Ticket bodies use `{ title, description, type, status, priority, assigneeId }`. Use `BUG`, `TASK`, or `STORY` for `type`. Status values are `TODO`, `IN_PROGRESS`, and `DONE`. Priority values are `LOW`, `MEDIUM`, `HIGH`, and `URGENT`. Use a project member's account ID for `assigneeId` or `null` for an unassigned ticket.

Issue list queries accept `q`, `status`, `priority`, `type`, `assignee`, `page`, and `size`. Use `assignee=0` for unassigned issues. Pages start at zero. Paginated responses use `{ items, page, total, hasMore }`.

Live boards open `/ws/connect` on the app origin and send `{ projectId, token }` as the first message. The server sends `ready` after authentication and project authorization, then `refresh` after a committed project change. The client reloads protected REST data on each notification.

The interactive API reference is available at `/swagger-ui/index.html`. Render probes `/actuator/health` to verify that the app and its database are ready.
