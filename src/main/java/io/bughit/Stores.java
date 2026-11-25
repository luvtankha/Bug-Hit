package io.bughit;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface Accounts extends JpaRepository<Account, Long> {
    Optional<Account> findByEmail(String email);
}

interface Sessions extends JpaRepository<AuthSession, UUID> {
    boolean existsByIdAndAccountIdAndExpiresAtAfter(UUID id, Long accountId, Instant now);
    @Modifying @Query("delete from AuthSession s where s.expiresAt < :now")
    void expire(@Param("now") Instant now);
}

interface Projects extends JpaRepository<Project, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select p from Project p where p.id = :id")
    Optional<Project> lockById(@Param("id") long id);

    @Query("select p from Project p, Member m where m.projectId = p.id and m.accountId = :accountId order by p.name, p.id")
    List<Project> findForAccount(@Param("accountId") long accountId);
}

interface Members extends JpaRepository<Member, Long> {
    Optional<Member> findByProjectIdAndAccountId(Long projectId, Long accountId);
    List<Member> findByProjectIdOrderById(Long projectId);
    List<Member> findByAccountId(Long accountId);
}

interface Issues extends JpaRepository<Issue, Long>, JpaSpecificationExecutor<Issue> {
    Optional<Issue> findByProjectIdAndId(Long projectId, Long id);
    @Modifying @Query("update Issue i set i.assigneeId = null, i.updatedAt = :now, i.version = i.version + 1 where i.projectId = :project and i.assigneeId = :account")
    void clearAssignment(@Param("project") long project, @Param("account") long account, @Param("now") Instant now);
}

interface Comments extends JpaRepository<Comment, Long> {
    Page<Comment> findByIssueIdOrderByIdDesc(long issueId, Pageable pageable);
    long countByIssueId(long issueId);
}

interface Attachments extends JpaRepository<Attachment, Long> {
    @Query("select new io.bughit.ApiTypes$AttachmentView(a.id, a.filename, a.contentType, a.sizeBytes, a.createdAt) from Attachment a where a.issueId = :issueId order by a.id")
    List<ApiTypes.AttachmentView> listMetadata(@Param("issueId") long issueId);
    Optional<Attachment> findByIssueIdAndId(long issueId, long id);
    long countByIssueId(long issueId);
}
