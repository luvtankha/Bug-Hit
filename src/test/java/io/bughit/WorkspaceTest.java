package io.bughit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WorkspaceTest {
    @Autowired TestRestTemplate client;
    @LocalServerPort int port;
    static final String password = "long-test-password-123";

    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv().getOrDefault("TEST_DATABASE_URL",
                "jdbc:h2:mem:bughit_test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"));
    }

    record Session(String token, int id, String email) {}

    @SuppressWarnings("rawtypes")
    private ResponseEntity<Map> request(HttpMethod method, String path, Session as, Object body) {
        var headers = new HttpHeaders();
        if (as != null) headers.setBearerAuth(as.token);
        if (body != null) headers.setContentType(MediaType.APPLICATION_JSON);
        return client.exchange(path, method, new HttpEntity<>(body, headers), Map.class);
    }

    private Session signup(String display) {
        String email = UUID.randomUUID() + "@example.com";
        var response = request(HttpMethod.POST, "/api/auth/signup", null, Map.of("name", display, "email", email, "password", password));
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        Map<?, ?> user = (Map<?, ?>) response.getBody().get("user");
        return new Session((String) response.getBody().get("token"), (int) user.get("id"), email);
    }

    private Map<String, Object> issueInput(String title, String type, String priority, Integer user) {
        var body = new HashMap<String, Object>();
        body.put("title", title); body.put("description", "Repro detail for " + title); body.put("type", type);
        body.put("priority", priority); body.put("status", "TODO"); body.put("assigneeId", user);
        return body;
    }

    @Test void managesTeamsAndTicketsWithScopedAuthorization() throws Exception {
        client.getRestTemplate().setRequestFactory(new JdkClientHttpRequestFactory());
        var admin = signup("Project Owner");
        var dev = signup("Developer");
        var manager = signup("Manager");
        var outsider = signup("Outside user");
        assertThat(request(HttpMethod.GET, "/api/projects", null, null).getStatusCode().value()).isEqualTo(401);
        assertThat(request(HttpMethod.POST, "/api/auth/login", null, Map.of("email", admin.email, "password", "wrong")).getStatusCode().value()).isEqualTo(401);
        assertThat(request(HttpMethod.POST, "/api/auth/login", null, Map.of("email", admin.email, "password", password)).getStatusCode().value()).isEqualTo(200);
        String key = "T" + UUID.randomUUID().toString().substring(0, 7).toUpperCase(Locale.ROOT);
        var created = request(HttpMethod.POST, "/api/projects", admin, Map.of("key", key, "name", "Main project", "description", "Testing"));
        assertThat(created.getStatusCode().value()).isEqualTo(201);
        String base = "/api/projects/" + created.getBody().get("id");
        String tickets = base + "/issues";
        assertThat(request(HttpMethod.GET, tickets, outsider, null).getStatusCode().value()).isEqualTo(404);
        assertThat(request(HttpMethod.POST, base + "/members", admin, Map.of("email", dev.email, "role", "DEVELOPER")).getStatusCode().value()).isEqualTo(201);
        assertThat(request(HttpMethod.POST, base + "/members", admin, Map.of("email", manager.email, "role", "MANAGER")).getStatusCode().value()).isEqualTo(201);
        assertThat(request(HttpMethod.PATCH, base + "/members/" + admin.id, admin, Map.of("role", "DEVELOPER")).getStatusCode().value()).isEqualTo(400);
        assertThat(request(HttpMethod.POST, base + "/members", manager, Map.of("email", outsider.email, "role", "DEVELOPER")).getStatusCode().value()).isEqualTo(403);
        assertThat(request(HttpMethod.PUT, base, manager, Map.of("name", "Renamed project", "description", "Updated")).getBody().get("name")).isEqualTo("Renamed project");
        assertThat(request(HttpMethod.DELETE, base, manager, null).getStatusCode().value()).isEqualTo(403);
        assertThat(request(HttpMethod.POST, tickets, admin, issueInput("Invalid assignee", "TASK", "HIGH", outsider.id)).getStatusCode().value()).isEqualTo(400);
        var bug = request(HttpMethod.POST, tickets, manager, issueInput("Checkout submits twice", "BUG", "HIGH", dev.id));
        assertThat(bug.getStatusCode().value()).isEqualTo(201);
        assertThat(bug.getBody().get("key")).isEqualTo(key + "-1");
        String ticket = tickets + "/" + bug.getBody().get("id");
        assertThat(request(HttpMethod.PATCH, ticket + "/status", dev, Map.of("status", "IN_PROGRESS")).getBody().get("status")).isEqualTo("IN_PROGRESS");
        assertThat(request(HttpMethod.PUT, ticket, dev, issueInput("Reassignment denied", "BUG", "HIGH", manager.id)).getStatusCode().value()).isEqualTo(403);
        assertThat(request(HttpMethod.DELETE, ticket, dev, null).getStatusCode().value()).isEqualTo(403);
        assertThat(request(HttpMethod.POST, ticket + "/comments", dev, Map.of("body", "I reproduced it on mobile.")).getStatusCode().value()).isEqualTo(201);
        assertThat(((List<?>) request(HttpMethod.GET, ticket + "/comments", manager, null).getBody().get("items"))).hasSize(1);
        assertThat(request(HttpMethod.GET, tickets + "?q=CHECKOUT&priority=HIGH&type=BUG&status=IN_PROGRESS&assignee=" + dev.id, admin, null).getBody().get("total")).isEqualTo(1);
        assertThat(request(HttpMethod.GET, tickets + "?q=CHECKOUT&priority=LOW", admin, null).getBody().get("total")).isEqualTo(0);

        var png = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(32, 16, BufferedImage.TYPE_INT_RGB), "png", png);
        var photo = upload(ticket, dev, png.toByteArray());
        assertThat(photo.getStatusCode().value()).isEqualTo(201);
        String asset = ticket + "/attachments/" + photo.getBody().get("id");
        var headers = new HttpHeaders(); headers.setBearerAuth(admin.token);
        var retrieved = client.exchange(asset, HttpMethod.GET, new HttpEntity<>(headers), byte[].class);
        assertThat(retrieved.getBody()).containsExactly(png.toByteArray());
        assertThat(retrieved.getHeaders().getContentType()).isEqualTo(MediaType.IMAGE_PNG);
        assertThat(upload(ticket, dev, "not a screenshot".getBytes()).getStatusCode().value()).isEqualTo(400);
        assertThat(request(HttpMethod.GET, asset, outsider, null).getStatusCode().value()).isEqualTo(404);

        try (var pool = Executors.newFixedThreadPool(3)) {
            var replies = new ArrayList<Future<String>>();
            for (int index = 0; index < 3; index++) {
                final int n = index;
                replies.add(pool.submit(() -> (String) request(HttpMethod.POST, tickets, admin, issueInput("Concurrent task " + n, "TASK", "LOW", null)).getBody().get("key")));
            }
            var keys = new HashSet<String>();
            for (var reply : replies) keys.add(reply.get(15, TimeUnit.SECONDS));
            assertThat(keys).containsExactlyInAnyOrder(key + "-2", key + "-3", key + "-4");
        }

        assertThat(request(HttpMethod.DELETE, base + "/members/" + dev.id, admin, null).getStatusCode().value()).isEqualTo(204);
        assertThat(request(HttpMethod.GET, ticket, dev, null).getStatusCode().value()).isEqualTo(404);
        assertThat(request(HttpMethod.GET, ticket, admin, null).getBody().get("assigneeId")).isNull();
        assertThat(request(HttpMethod.DELETE, ticket, manager, null).getStatusCode().value()).isEqualTo(204);
        assertThat(request(HttpMethod.GET, asset, admin, null).getStatusCode().value()).isEqualTo(404);
        assertThat(request(HttpMethod.DELETE, base, admin, null).getStatusCode().value()).isEqualTo(204);
        assertThat(request(HttpMethod.POST, "/api/auth/logout", admin, null).getStatusCode().value()).isEqualTo(204);
        assertThat(request(HttpMethod.GET, "/api/auth/me", admin, null).getStatusCode().value()).isEqualTo(401);
        assertThat(client.getForEntity("/v3/api-docs", String.class).getBody()).contains("Bug Hit API", "bearerAuth", "/api/projects/{project}/issues");
        assertThat(client.getForEntity("/actuator/health", String.class).getBody()).contains("UP");
    }

    @SuppressWarnings("rawtypes")
    private ResponseEntity<Map> upload(String ticket, Session user, byte[] data) {
        var headers = new HttpHeaders(); headers.setBearerAuth(user.token); headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        var form = new LinkedMultiValueMap<String, Object>();
        form.add("file", new ByteArrayResource(data) { @Override public String getFilename() { return "checkout.png"; } });
        return client.exchange(ticket + "/attachments", HttpMethod.POST, new HttpEntity<>(form, headers), Map.class);
    }
}
