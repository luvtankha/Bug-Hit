package io.bughit;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static io.bughit.ApiTypes.*;
import static io.bughit.AuthService.id;

@RestController @RequestMapping("/api/projects") @SecurityRequirement(name = "bearerAuth")
class ProjectController {
    private final Workspace work;
    ProjectController(Workspace work) { this.work = work; }

    @GetMapping List<ProjectView> list(@AuthenticationPrincipal Jwt jwt) { return work.projects(id(jwt)); }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    ProjectView create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProjectCreate input) { return work.createProject(id(jwt), input); }

    @GetMapping("/{project}")
    ProjectView project(@PathVariable long project, @AuthenticationPrincipal Jwt jwt) { return work.project(project, id(jwt)); }

    @PutMapping("/{project}")
    ProjectView edit(@PathVariable long project, @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProjectEdit input) {
        return work.editProject(project, id(jwt), input);
    }

    @DeleteMapping("/{project}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable long project, @AuthenticationPrincipal Jwt jwt) { work.deleteProject(project, id(jwt)); }

    @GetMapping("/{project}/members")
    List<MemberView> members(@PathVariable long project, @AuthenticationPrincipal Jwt jwt) { return work.team(project, id(jwt)); }

    @PostMapping("/{project}/members") @ResponseStatus(HttpStatus.CREATED)
    MemberView invite(@PathVariable long project, @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody MemberInput input) {
        return work.invite(project, id(jwt), input);
    }

    @PatchMapping("/{project}/members/{member}")
    MemberView role(@PathVariable long project, @PathVariable long member, @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RoleInput input) {
        return work.changeRole(project, id(jwt), member, input.role());
    }

    @DeleteMapping("/{project}/members/{member}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@PathVariable long project, @PathVariable long member, @AuthenticationPrincipal Jwt jwt) { work.remove(project, id(jwt), member); }
}

@RestController @RequestMapping("/api/projects/{project}/issues") @SecurityRequirement(name = "bearerAuth")
class IssueController {
    private final Workspace work;
    IssueController(Workspace work) { this.work = work; }

    @GetMapping PageView<IssueView> search(@PathVariable long project, @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) @Size(max = 150) String q, @RequestParam(required = false) IssueStatus status,
            @RequestParam(required = false) Priority priority, @RequestParam(required = false) IssueType type,
            @RequestParam(required = false) @Min(0) Long assignee, @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page,
            @RequestParam(defaultValue = "50") @Min(1) @Max(120) int size) {
        return work.issues(project, id(jwt), q, status, priority, type, assignee, page, size);
    }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    IssueView create(@PathVariable long project, @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody IssueInput input) {
        return work.createIssue(project, id(jwt), input);
    }

    @GetMapping("/{issue}") IssueView issue(@PathVariable long project, @PathVariable long issue, @AuthenticationPrincipal Jwt jwt) {
        return work.readIssue(project, id(jwt), issue);
    }

    @PutMapping("/{issue}") IssueView edit(@PathVariable long project, @PathVariable long issue, @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody IssueInput input) { return work.editIssue(project, id(jwt), issue, input); }

    @PatchMapping("/{issue}/status") IssueView move(@PathVariable long project, @PathVariable long issue, @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody MoveInput input) { return work.move(project, id(jwt), issue, input.status()); }

    @DeleteMapping("/{issue}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable long project, @PathVariable long issue, @AuthenticationPrincipal Jwt jwt) { work.deleteIssue(project, id(jwt), issue); }

    @GetMapping("/{issue}/comments") PageView<CommentView> comments(@PathVariable long project, @PathVariable long issue,
            @AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page) {
        return work.comments(project, id(jwt), issue, page);
    }

    @PostMapping("/{issue}/comments") @ResponseStatus(HttpStatus.CREATED)
    CommentView comment(@PathVariable long project, @PathVariable long issue, @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CommentInput input) { return work.comment(project, id(jwt), issue, input); }

    @GetMapping("/{issue}/attachments") List<AttachmentView> attachments(@PathVariable long project, @PathVariable long issue,
            @AuthenticationPrincipal Jwt jwt) { return work.attachments(project, id(jwt), issue); }

    @PostMapping(path = "/{issue}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE) @ResponseStatus(HttpStatus.CREATED)
    AttachmentView upload(@PathVariable long project, @PathVariable long issue, @AuthenticationPrincipal Jwt jwt,
            @RequestPart("file") MultipartFile file) throws IOException { return work.upload(project, id(jwt), issue, file); }

    @GetMapping("/{issue}/attachments/{attachment}") ResponseEntity<byte[]> download(@PathVariable long project, @PathVariable long issue,
            @PathVariable long attachment, @AuthenticationPrincipal Jwt jwt) {
        Attachment file = work.download(project, id(jwt), issue, attachment);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.contentType)).contentLength(file.sizeBytes).cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.filename, StandardCharsets.UTF_8).build().toString())
                .body(file.data);
    }
}

@Controller
class SpaRoutes {
    @GetMapping({"/login", "/projects", "/projects/{project:[0-9]+}", "/projects/{project:[0-9]+}/team"})
    String index() { return "forward:/index.html"; }
}
