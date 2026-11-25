package io.bughit;

import jakarta.persistence.criteria.Predicate;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static io.bughit.ApiErrors.error;
import static io.bughit.ApiTypes.*;

record ProjectChanged(long projectId) {}

@Service @Transactional(readOnly = true)
class Workspace {
    private final Projects projects;
    private final Members members;
    private final Accounts accounts;
    private final Issues issues;
    private final Comments comments;
    private final Attachments attachments;
    private final ApplicationEventPublisher events;

    Workspace(Projects projects, Members members, Accounts accounts, Issues issues, Comments comments,
              Attachments attachments, ApplicationEventPublisher events) {
        this.projects = projects; this.members = members; this.accounts = accounts; this.issues = issues;
        this.comments = comments; this.attachments = attachments; this.events = events;
    }

    private static String clean(String value) { return value == null ? "" : value.strip(); }
    private static ProjectView view(Project p, Role role) {
        return new ProjectView(p.id, p.projectKey, p.name, p.description, p.ownerId, role, p.createdAt);
    }

    Role role(long project, long user) {
        return members.findByProjectIdAndAccountId(project, user).map(m -> m.role)
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Project not found."));
    }

    private Project lock(long project) {
        return projects.lockById(project).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Project not found."));
    }

    private static void need(boolean allowed) {
        if (!allowed) throw error(HttpStatus.FORBIDDEN, "Your project role does not allow this action.");
    }

    private void changed(long project) { events.publishEvent(new ProjectChanged(project)); }

    List<ProjectView> projects(long user) {
        var roles = members.findByAccountId(user).stream().collect(Collectors.toMap(m -> m.projectId, m -> m.role));
        return projects.findForAccount(user).stream().filter(p -> roles.containsKey(p.id)).map(p -> view(p, roles.get(p.id))).toList();
    }

    ProjectView project(long project, long user) {
        Role role = role(project, user);
        return projects.findById(project).map(p -> view(p, role)).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Project not found."));
    }

    @Transactional ProjectView createProject(long user, ProjectCreate request) {
        var p = projects.saveAndFlush(new Project(request.key().toUpperCase(Locale.ROOT), request.name().strip(), clean(request.description()), user));
        members.save(new Member(p.id, user, Role.ADMIN));
        return view(p, Role.ADMIN);
    }

    @Transactional ProjectView editProject(long project, long user, ProjectEdit request) {
        Project p = lock(project);
        Role role = role(project, user);
        need(role.managesIssues());
        p.name = request.name().strip(); p.description = clean(request.description());
        changed(project);
        return view(p, role);
    }

    @Transactional void deleteProject(long project, long user) {
        Project p = lock(project);
        role(project, user);
        need(p.ownerId.equals(user));
        projects.delete(p);
        changed(project);
    }

    private Map<Long, Account> accountsFor(Collection<Long> ids) {
        return accounts.findAllById(ids).stream().collect(Collectors.toMap(a -> a.id, Function.identity()));
    }

    List<MemberView> team(long project, long user) {
        var p = project(project, user);
        var rows = members.findByProjectIdOrderById(project);
        var people = accountsFor(rows.stream().map(m -> m.accountId).toList());
        return rows.stream().map(m -> memberView(m, people.get(m.accountId), p.ownerId())).toList();
    }

    private static MemberView memberView(Member member, Account account, long owner) {
        return new MemberView(account.id, account.name, account.email, member.role, account.id.equals(owner));
    }

    @Transactional MemberView invite(long project, long actor, MemberInput input) {
        Project p = lock(project);
        need(role(project, actor) == Role.ADMIN);
        Account account = accounts.findByEmail(AuthService.email(input.email()))
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "That person needs a Bug Hit account before they can be added."));
        if (members.findByProjectIdAndAccountId(project, account.id).isPresent()) throw error(HttpStatus.CONFLICT, "That person is already a project member.");
        Member member = members.save(new Member(project, account.id, input.role()));
        changed(project);
        return memberView(member, account, p.ownerId);
    }

    private Member editableMember(Project p, long actor, long target) {
        need(role(p.id, actor) == Role.ADMIN);
        if (p.ownerId.equals(target)) throw error(HttpStatus.BAD_REQUEST, "The project owner stays an Admin.");
        return members.findByProjectIdAndAccountId(p.id, target).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Member not found."));
    }

    @Transactional MemberView changeRole(long project, long actor, long target, Role role) {
        var p = lock(project);
        Member member = editableMember(p, actor, target);
        member.role = role;
        changed(project);
        return memberView(member, accounts.findById(target).orElseThrow(), p.ownerId);
    }

    @Transactional void remove(long project, long actor, long target) {
        var p = lock(project);
        members.delete(editableMember(p, actor, target));
        issues.clearAssignment(project, target, Instant.now());
        changed(project);
    }

    private Issue issue(long project, long id) {
        return issues.findByProjectIdAndId(project, id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Issue not found."));
    }

    private static IssueView issueView(Issue i, Map<Long, Account> people, boolean details) {
        Account reporter = people.get(i.reporterId);
        Account assignee = i.assigneeId == null ? null : people.get(i.assigneeId);
        return new IssueView(i.id, i.issueKey, i.title, details ? i.description : null, i.type, i.status, i.priority,
            i.reporterId, reporter == null ? null : reporter.name, i.assigneeId, assignee == null ? null : assignee.name, i.createdAt, i.updatedAt);
    }

    private Map<Long, Account> issuePeople(List<Issue> rows) {
        var ids = new HashSet<Long>();
        for (var i : rows) { ids.add(i.reporterId); if (i.assigneeId != null) ids.add(i.assigneeId); }
        return accountsFor(ids);
    }

    private IssueView detail(Issue i) { return issueView(i, issuePeople(List.of(i)), true); }

    PageView<IssueView> issues(long project, long user, String q, IssueStatus status, Priority priority, IssueType type,
                              Long assignee, int page, int size) {
        role(project, user);
        String search = clean(q).toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        Specification<Issue> where = (root, query, cb) -> {
            var terms = new ArrayList<Predicate>();
            terms.add(cb.equal(root.get("projectId"), project));
            if (!search.isBlank()) {
                String pattern = "%" + search + "%";
                terms.add(cb.or(cb.like(cb.lower(root.get("title")), pattern, '\\'), cb.like(cb.lower(root.get("issueKey")), pattern, '\\'),
                        cb.like(cb.lower(root.get("description")), pattern, '\\')));
            }
            if (status != null) terms.add(cb.equal(root.get("status"), status));
            if (priority != null) terms.add(cb.equal(root.get("priority"), priority));
            if (type != null) terms.add(cb.equal(root.get("type"), type));
            if (assignee != null) terms.add(assignee == 0 ? cb.isNull(root.get("assigneeId")) : cb.equal(root.get("assigneeId"), assignee));
            return cb.and(terms.toArray(Predicate[]::new));
        };
        var found = issues.findAll(where, PageRequest.of(page, size, Sort.by(Sort.Order.desc("updatedAt"), Sort.Order.desc("id"))));
        var people = issuePeople(found.getContent());
        return new PageView<>(found.getContent().stream().map(i -> issueView(i, people, false)).toList(), page, found.getTotalElements(), found.hasNext());
    }

    IssueView readIssue(long project, long user, long issueId) { role(project, user); return detail(issue(project, issueId)); }

    private static boolean canEdit(Role role, Issue issue, long user) {
        return role.managesIssues() || issue.reporterId.equals(user) || Objects.equals(issue.assigneeId, user);
    }

    private void assign(long project, Long assignee) {
        if (assignee != null && members.findByProjectIdAndAccountId(project, assignee).isEmpty()) {
            throw error(HttpStatus.BAD_REQUEST, "Select a member of this project as the assignee.");
        }
    }

    private static void setIssue(Issue i, IssueInput in) {
        i.title = in.title().strip(); i.description = clean(in.description()); i.type = in.type();
        i.priority = in.priority(); i.status = in.status(); i.assigneeId = in.assigneeId(); i.updatedAt = Instant.now();
    }

    @Transactional IssueView createIssue(long project, long user, IssueInput input) {
        Project p = lock(project);
        Role role = role(project, user);
        need(role.managesIssues() || input.assigneeId() == null || input.assigneeId().equals(user));
        assign(project, input.assigneeId());
        var i = new Issue();
        i.projectId = project; i.reporterId = user; i.issueKey = p.projectKey + "-" + p.nextNumber++;
        setIssue(i, input);
        issues.saveAndFlush(i);
        changed(project);
        return detail(i);
    }

    @Transactional IssueView editIssue(long project, long user, long id, IssueInput input) {
        lock(project);
        Role role = role(project, user);
        var i = issue(project, id);
        need(canEdit(role, i, user));
        need(role.managesIssues() || Objects.equals(i.assigneeId, input.assigneeId()));
        assign(project, input.assigneeId());
        setIssue(i, input);
        changed(project);
        return detail(i);
    }

    @Transactional IssueView move(long project, long user, long id, IssueStatus status) {
        lock(project);
        Role role = role(project, user);
        var i = issue(project, id);
        need(canEdit(role, i, user));
        if (i.status != status) { i.status = status; i.updatedAt = Instant.now(); changed(project); }
        return detail(i);
    }

    @Transactional void deleteIssue(long project, long user, long id) {
        lock(project);
        need(role(project, user).managesIssues());
        issues.delete(issue(project, id));
        changed(project);
    }

    private static CommentView commentView(Comment c, Account author) {
        return new CommentView(c.id, c.authorId, author.name, c.body, c.createdAt);
    }

    PageView<CommentView> comments(long project, long user, long id, int page) {
        role(project, user); issue(project, id);
        var rows = comments.findByIssueIdOrderByIdDesc(id, PageRequest.of(page, 25));
        var authors = accountsFor(rows.stream().map(c -> c.authorId).toList());
        return new PageView<>(rows.stream().map(c -> commentView(c, authors.get(c.authorId))).toList(), page, rows.getTotalElements(), rows.hasNext());
    }

    @Transactional CommentView comment(long project, long user, long id, CommentInput input) {
        lock(project); role(project, user); issue(project, id);
        Comment comment = comments.save(new Comment(id, user, input.body().strip()));
        changed(project);
        return commentView(comment, accounts.findById(user).orElseThrow());
    }

    List<AttachmentView> attachments(long project, long user, long id) {
        role(project, user); issue(project, id);
        return attachments.listMetadata(id);
    }

    private static String imageType(byte[] bytes) {
        try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(stream);
            if (readers.hasNext()) {
                var reader = readers.next();
                try {
                    reader.setInput(stream, true, true);
                    String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                    if ((format.equals("png") || format.equals("jpeg")) && reader.getWidth(0) <= 4096 && reader.getHeight(0) <= 4096) {
                        return "image/" + format;
                    }
                } finally { reader.dispose(); }
            }
        } catch (IOException | RuntimeException ignored) { /* Malformed image. */ }
        throw error(HttpStatus.BAD_REQUEST, "Upload a PNG or JPEG screenshot up to 4,096 px on each side.");
    }

    @Transactional AttachmentView upload(long project, long user, long id, MultipartFile file) throws IOException {
        role(project, user); issue(project, id);
        if (file.isEmpty()) throw error(HttpStatus.BAD_REQUEST, "Choose a screenshot first.");
        if (file.getSize() > 5 * 1024 * 1024) throw error(HttpStatus.PAYLOAD_TOO_LARGE, "Screenshots must be 5 MB or smaller.");
        byte[] contents = file.getBytes();
        String contentType = imageType(contents);
        lock(project); role(project, user); issue(project, id);
        if (attachments.countByIssueId(id) >= 5) throw error(HttpStatus.CONFLICT, "This issue already has five screenshots.");
        String raw = Objects.toString(file.getOriginalFilename(), "screenshot").replace('\\', '/');
        String name = raw.substring(raw.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").strip();
        if (name.isBlank()) name = "screenshot";
        name = name.substring(0, Math.min(name.length(), 180));
        var value = new Attachment();
        value.issueId = id; value.authorId = user; value.filename = name; value.contentType = contentType;
        value.data = contents; value.sizeBytes = contents.length;
        attachments.save(value);
        changed(project);
        return new AttachmentView(value.id, name, contentType, contents.length, value.createdAt);
    }

    Attachment download(long project, long user, long issueId, long id) {
        role(project, user); issue(project, issueId);
        return attachments.findByIssueIdAndId(issueId, id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Screenshot not found."));
    }
}
