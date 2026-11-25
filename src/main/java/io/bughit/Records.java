package io.bughit;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.UUID;

enum Role {
    ADMIN, MANAGER, DEVELOPER;
    boolean managesIssues() { return this != DEVELOPER; }
}

enum IssueStatus { TODO, IN_PROGRESS, DONE }
enum IssueType { BUG, TASK, STORY }
enum Priority { LOW, MEDIUM, HIGH, URGENT }

@Entity @Table(name = "accounts")
class Account {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @Column(nullable = false, unique = true, length = 254) String email;
    @Column(nullable = false, length = 80) String name;
    @Column(nullable = false, length = 100) String passwordHash;
    protected Account() {}
    Account(String email, String name, String passwordHash) {
        this.email = email; this.name = name; this.passwordHash = passwordHash;
    }
}

@Entity @Table(name = "auth_sessions")
class AuthSession {
    @Id UUID id;
    Long accountId;
    Instant expiresAt;
    protected AuthSession() {}
    AuthSession(UUID id, Long accountId, Instant expiresAt) {
        this.id = id; this.accountId = accountId; this.expiresAt = expiresAt;
    }
}

@Entity @Table(name = "projects")
class Project {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @Column(length = 8) String projectKey;
    String name;
    String description;
    Long ownerId;
    long nextNumber = 1;
    Instant createdAt = Instant.now();
    protected Project() {}
    Project(String projectKey, String name, String description, Long ownerId) {
        this.projectKey = projectKey; this.name = name; this.description = description; this.ownerId = ownerId;
    }
}

@Entity @Table(name = "members")
class Member {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    Long projectId;
    Long accountId;
    @Enumerated(EnumType.STRING) Role role;
    protected Member() {}
    Member(Long projectId, Long accountId, Role role) {
        this.projectId = projectId; this.accountId = accountId; this.role = role;
    }
}

@Entity @Table(name = "issues")
class Issue {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    Long projectId;
    String issueKey;
    String title;
    String description;
    @Enumerated(EnumType.STRING) @Column(name = "issue_type") IssueType type;
    @Enumerated(EnumType.STRING) IssueStatus status;
    @Enumerated(EnumType.STRING) Priority priority;
    Long reporterId;
    Long assigneeId;
    Instant createdAt = Instant.now();
    Instant updatedAt = createdAt;
    @Version long version;
    protected Issue() {}
}

@Entity @Table(name = "comments")
class Comment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    Long issueId;
    Long authorId;
    String body;
    Instant createdAt = Instant.now();
    protected Comment() {}
    Comment(Long issueId, Long authorId, String body) {
        this.issueId = issueId; this.authorId = authorId; this.body = body;
    }
}

@Entity @Table(name = "attachments")
class Attachment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    Long issueId;
    Long authorId;
    String filename;
    String contentType;
    int sizeBytes;
    Instant createdAt = Instant.now();
    @JdbcTypeCode(SqlTypes.VARBINARY) @Column(columnDefinition = "bytea") byte[] data;
    protected Attachment() {}
}
