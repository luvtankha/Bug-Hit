package io.bughit;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;

public final class ApiTypes {
    private ApiTypes() {}

    public record Signup(@NotBlank @Size(max = 80) String name, @NotBlank @Email @Size(max = 254) String email,
                         @NotBlank @Size(min = 12, max = 72) String password) {}
    public record Login(@NotBlank @Email @Size(max = 254) String email, @NotBlank @Size(max = 72) String password) {}
    public record UserView(Long id, String name, String email) {}
    public record AccountSession(String token, UserView user, Instant expiresAt) {}
    public record ProjectCreate(@NotBlank @Size(max = 100) String name, @NotBlank @Pattern(regexp = "[A-Za-z][A-Za-z0-9]{1,7}") String key,
                                @Size(max = 1000) String description) {}
    public record ProjectEdit(@NotBlank @Size(max = 100) String name, @Size(max = 1000) String description) {}
    public record ProjectView(Long id, String key, String name, String description, Long ownerId, Role role, Instant createdAt) {}
    public record MemberInput(@NotBlank @Email @Size(max = 254) String email, @NotNull Role role) {}
    public record RoleInput(@NotNull Role role) {}
    public record MemberView(Long id, String name, String email, Role role, boolean owner) {}
    public record IssueInput(@NotBlank @Size(max = 150) String title, @Size(max = 12000) String description,
                             @NotNull IssueType type, @NotNull IssueStatus status, @NotNull Priority priority, Long assigneeId) {}
    public record MoveInput(@NotNull IssueStatus status) {}
    public record IssueView(Long id, String key, String title, String description, IssueType type, IssueStatus status, Priority priority,
                            Long reporterId, String reporterName, Long assigneeId, String assigneeName, Instant createdAt, Instant updatedAt) {}
    public record CommentInput(@NotBlank @Size(max = 4000) String body) {}
    public record CommentView(Long id, Long authorId, String authorName, String body, Instant createdAt) {}
    public record AttachmentView(Long id, String filename, String contentType, int sizeBytes, Instant createdAt) {}
    public record PageView<T>(List<T> items, int page, long total, boolean hasMore) {}
}
