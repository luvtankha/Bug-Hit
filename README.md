# Bug Hit

Bug Hit is a team issue tracker with a React and Tailwind frontend and a Java 21 Spring Boot API. Create projects, assign bugs and tasks, and move them through **To Do → In Progress → Done**. Comments, screenshots, and ticket changes stay with the project.

## Run locally

Install Java 21, Maven 3.9+, and Node.js 24. Open two terminals from the repository root.

```sh
mvn spring-boot:run
```

```sh
cd frontend
npm ci
npm run dev
```

Open [Bug Hit locally](http://127.0.0.1:5173) and create an account. By default, the API listens on port 8080 and uses a file-backed H2 database under `.local/`. To run against PostgreSQL, set `DATABASE_URL` to a JDBC URL and supply `DB_USER` and `DB_PASSWORD`. Flyway applies the schema at startup. `JWT_SECRET` accepts at least 32 characters. When it is omitted in local development, restarting the backend signs users out.

## Workflow and access

| Project role | Actions |
| --- | --- |
| Admin | Add or remove members, set roles, update project settings, and manage all issues. A project's owner can also delete the project. |
| Manager | Update project details and create, assign, change, or delete issues. |
| Developer | Create issues, edit and move issues they reported or are assigned to, and add comments and screenshots. |

Project members can read the board and issue details. Administrators add existing Bug Hit accounts by email. Removing a member ends access and clears their assignments. The owner always retains the Admin role.

Use the grip on a ticket to drag it between columns, or use its status menu. Search by issue ID, title, or description. Filters can be combined across priority, status, issue type, and assignee. Issues also have a list view. Screenshot uploads accept PNG and JPEG files up to 5 MB and 4,096 pixels per side.

## API and verification

- Interactive Swagger UI is available at `/swagger-ui/index.html`, with OpenAPI JSON at `/v3/api-docs`. Sign up or sign in, then use the returned token as an `Authorization: Bearer` credential. [API guide](docs/API.md)
- `mvn verify` runs the API integration suite. Set `TEST_DATABASE_URL`, `DB_USER`, and `DB_PASSWORD` to run it against PostgreSQL instead of the isolated H2 test database.
- From `frontend`, run `npx playwright install chromium firefox webkit` and `npm run test:e2e` after `mvn package`. The suite starts the app and covers Chromium, Firefox, and mobile WebKit emulation.
- GitHub Actions runs the tests against PostgreSQL 17, builds the production container, and checks its health and a direct React route.
- The demo shows a ticket moving across the board, a comment on the issue, and the project team. [Watch the demo](docs/bug-hit-demo.webm)

## Deploy on Render

The [Render Blueprint](render.yaml) provisions one Docker web service and a private PostgreSQL database in the same region. The container serves both the React bundle and Spring Boot API from one HTTPS origin. Render generates the JWT secret and injects the database connection settings.

1. Import this GitHub repository as a Render Blueprint and review the proposed service and database.
2. Apply the first sync. Wait for the web service to become live and check `/actuator/health`.
3. Open the service URL, create an account, create a project, and move an issue on its board.

The Blueprint uses Render's Free plans for a demo deployment. Free web services can spin down when idle, and the Free PostgreSQL database expires 30 days after creation. [Render free-tier limits](https://render.com/docs/free)
