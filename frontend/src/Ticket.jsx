import { useEffect, useState } from 'react';
import { Download, ImagePlus, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorText } from './api';
import { Avatar, Busy, Dialog, ErrorBanner, Select, localTime, priorities, statuses, types } from './ui';
import { PriorityTag, TypeTag, canEdit } from './Board';

export function TicketForm({ project, user, members, initialStatus, issue, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const manager = project.role !== 'DEVELOPER';
  const assignees = manager ? members : members.filter((member) => member.id === user.id);
  const options = Object.fromEntries(assignees.map((member) => [member.id, member.name]));

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const draft = Object.fromEntries(new FormData(event.currentTarget));
    draft.assigneeId = !manager && issue ? issue.assigneeId : draft.assigneeId ? Number(draft.assigneeId) : null;
    setBusy(true); setError('');
    try {
      const path = `/projects/${project.id}/issues`;
      const { data } = issue ? await api.put(`${path}/${issue.id}`, draft) : await api.post(path, draft);
      onSaved(data);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  return <Dialog title={issue ? `Edit ${issue.key}` : 'Create issue'} onClose={onClose} id="issue-form-heading">
    <form className="form-stack dialog-body" onSubmit={submit}>
      <label>Title<input name="title" placeholder="Give this issue a clear title" required maxLength={150} defaultValue={issue?.title} /></label>
      <label>Description<textarea name="description" placeholder="What happened? What did you expect?" maxLength={12000} rows={4} defaultValue={issue?.description} /></label>
      <div className="form-grid"><label>Type<Select label="Issue type" name="type" options={types} defaultValue={issue?.type || 'BUG'} /></label>
        <label>Priority<Select label="Issue priority" name="priority" options={priorities} defaultValue={issue?.priority || 'MEDIUM'} /></label>
        <label>Status<Select label="Issue status" name="status" options={statuses} defaultValue={issue?.status || initialStatus || 'TODO'} /></label>
        {(manager || !issue) && <label>Assignee<Select label="Issue assignee" name="assigneeId" all="Unassigned" options={options} defaultValue={issue?.assigneeId || ''} /></label>}</div>
      <ErrorBanner>{error}</ErrorBanner>
      <div className="form-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : issue ? 'Save issue' : 'Create issue'}</button></div>
    </form>
  </Dialog>;
}

export function ConfirmDelete({ title, children, onClose, onConfirm }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <Dialog title={title} id="delete-heading" onClose={onClose}>
    <div className="dialog-body form-stack"><p className="muted">{children}</p><ErrorBanner>{error}</ErrorBanner>
      <div className="form-actions"><button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button danger" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try { await onConfirm(); }
          catch (failure) { setError(errorText(failure)); setBusy(false); }
        }}>{busy ? 'Deleting…' : 'Confirm delete'}</button></div>
    </div>
  </Dialog>;
}

export function TicketPanel({ id, project, user, members, version, onClose, onChanged }) {
  const path = `/projects/${project.id}/issues/${id}`;
  const [issue, setIssue] = useState(null);
  const [comments, setComments] = useState({ items: [], page: 0, hasMore: false });
  const [files, setFiles] = useState([]);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.get(path), api.get(`${path}/comments`), api.get(`${path}/attachments`)]).then(([ticket, messages, screenshots]) => {
      if (active) { setIssue(ticket.data); setComments(messages.data); setFiles(screenshots.data); }
    }).catch((failure) => {
      if (active) {
        setError(errorText(failure));
        if (failure.response?.status === 404) setIssue(null);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, version]);

  async function run(label, callback) {
    if (saving) return;
    setSaving(label); setError('');
    try { await callback(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setSaving(''); }
  }

  function postComment(event) {
    event.preventDefault();
    if (!comment.trim()) return;
    run('comment', async () => {
      const { data } = await api.post(`${path}/comments`, { body: comment });
      setComments((old) => ({ ...old, items: [data, ...old.items.filter((item) => item.id !== data.id)] }));
      setComment(''); onChanged();
    });
  }

  function upload(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Screenshots must be 5 MB or smaller.'); return; }
    run('upload', async () => {
      const form = new FormData(); form.append('file', file);
      const { data } = await api.post(`${path}/attachments`, form);
      setFiles((old) => [...old.filter((item) => item.id !== data.id), data]); onChanged();
    });
  }

  function download(file) {
    run('download', async () => {
      const { data } = await api.get(`${path}/attachments/${file.id}`, { responseType: 'blob' });
      const href = URL.createObjectURL(data);
      const link = document.createElement('a'); link.href = href; link.download = file.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
    });
  }

  const editable = issue && canEdit(project, user, issue);
  return <>
    <Dialog title={issue?.key || 'Issue details'} onClose={onClose} sheet id="ticket-panel-heading">
      <div className="dialog-body ticket-details"><ErrorBanner>{error}</ErrorBanner>
        {loading && !issue && <Busy>Opening issue…</Busy>}
        {issue && <>
          <div className="ticket-detail-title"><h1>{issue.title}</h1><div className="ticket-actions">
            {editable && <button className="icon-btn" aria-label="Edit issue" title="Edit issue" onClick={() => setEditing(true)}><Pencil size={17} /></button>}
            {project.role !== 'DEVELOPER' && <button className="icon-btn" aria-label="Delete issue" title="Delete issue" onClick={() => setDeleting(true)}><Trash2 size={17} /></button>}
          </div></div>
          <div className="ticket-meta"><TypeTag type={issue.type} /><PriorityTag priority={issue.priority} />
            <Select label="Move issue to status" options={statuses} value={issue.status} disabled={!editable || Boolean(saving)} onChange={(event) => {
              const status = event.target.value;
              run('move', async () => { const { data } = await api.patch(`${path}/status`, { status }); setIssue(data); onChanged(); });
            }} />
          </div>
          <div className="ticket-fields"><div><span>Assignee</span><strong><Avatar name={issue.assigneeName} size="small" />{issue.assigneeName || 'Unassigned'}</strong></div>
            <div><span>Reporter</span><strong><Avatar name={issue.reporterName} size="small" />{issue.reporterName}</strong></div></div>
          <section><h2>Description</h2><p className="ticket-description">{issue.description || 'No description provided.'}</p></section>
          <section><div className="detail-section-head"><h2><ImagePlus size={17} /> Screenshots</h2>
            <label className="button secondary file-picker" aria-disabled={Boolean(saving)}><Plus size={15} />{saving === 'upload' ? 'Uploading…' : 'Add screenshot'}
              <input type="file" aria-label="Add screenshot" accept="image/png,image/jpeg" onChange={upload} disabled={Boolean(saving)} /></label></div>
            {files.length ? <ul className="file-list">{files.map((file) => <li key={file.id}>
              <button className="file-row" onClick={() => download(file)} disabled={Boolean(saving)}><ImagePlus size={17} /><span>{file.filename}<small>{Math.max(1, Math.round(file.sizeBytes / 1024))} KB</small></span><Download size={16} /></button></li>)}</ul>
              : <p className="muted">PNG or JPEG, up to 5 MB each.</p>}</section>
          <section><div className="detail-section-head"><h2><MessageSquare size={17} /> Comments</h2></div>
            <form className="comment-form" onSubmit={postComment}><textarea aria-label="Write a comment" placeholder="Add an update or ask a question…"
              rows={3} maxLength={4000} value={comment} onChange={(event) => setComment(event.target.value)} />
              <button className="button primary" disabled={!comment.trim() || Boolean(saving)}>{saving === 'comment' ? 'Posting…' : 'Post comment'}</button></form>
            <ul className="comments">{comments.items.map((message) => <li key={message.id}><Avatar name={message.authorName} size="small" />
              <div><strong>{message.authorName}</strong><small>{localTime(message.createdAt)}</small><p>{message.body}</p></div></li>)}</ul>
            {comments.hasMore && <button className="text-link" disabled={Boolean(saving)} onClick={() => run('more', async () => {
              const { data } = await api.get(`${path}/comments`, { params: { page: comments.page + 1 } });
              setComments((old) => ({ ...data, items: [...new Map([...old.items, ...data.items].map((row) => [row.id, row])).values()] }));
            })}>Load earlier comments</button>}</section>
        </>}
      </div>
    </Dialog>
    {editing && issue && <TicketForm project={project} user={user} members={members} issue={issue} onClose={() => setEditing(false)}
      onSaved={(data) => { setIssue(data); setEditing(false); onChanged(); }} />}
    {deleting && issue && <ConfirmDelete title={`Delete ${issue.key}?`} onClose={() => setDeleting(false)} onConfirm={async () => {
      await api.delete(path); onClose(); onChanged();
    }}>This removes the issue, comments, and screenshots from the project.</ConfirmDelete>}
  </>;
}
