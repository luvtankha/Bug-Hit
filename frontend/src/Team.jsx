import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Pencil, Plus, Trash2, UserRoundMinus, UsersRound } from 'lucide-react';
import { api, errorText } from './api';
import { Avatar, Busy, Dialog, ErrorBanner, Select, roles } from './ui';
import { ProjectTabs } from './Board';
import { ProjectForm } from './App';
import { ConfirmDelete } from './Ticket';

export default function Team({ project, user, onProjectsChanged }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const path = `/projects/${project.id}`;
  const admin = project.role === 'ADMIN';

  const refresh = useCallback(async () => {
    try { const { data } = await api.get(`${path}/members`); setMembers(data); }
    catch (failure) { setError(errorText(failure)); }
  }, [path]);
  useEffect(() => { refresh(); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [refresh]);

  async function invite(event) {
    event.preventDefault();
    if (busy) return;
    setError(''); setBusy(true);
    try { await api.post(`${path}/members`, Object.fromEntries(new FormData(event.currentTarget))); setModal(null); await refresh(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  async function change(member, role) {
    if (busy) return;
    setError(''); setBusy(true);
    try { await api.patch(`${path}/members/${member.id}`, { role }); await refresh(); onProjectsChanged(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  return <section className="work-content team-content">
    <div className="content-head"><div><Link className="back-link" to={`/projects/${project.id}`}><ChevronLeft size={15} /> {project.name}</Link>
      <h1>Project team</h1><p>Manage membership and permissions for {project.name}.</p></div>
      {admin && <button className="button primary" onClick={() => { setError(''); setModal('invite'); }}><Plus size={18} /> Add member</button>}</div>
    <ProjectTabs project={project} tab="team" />
    {modal !== 'invite' && <ErrorBanner>{error}</ErrorBanner>}
    {!members ? !error && <Busy>Loading team…</Busy> : <div className="team-card">
      <h2><UsersRound size={19} /> Team members <span>{members.length}</span></h2>
      <ul className="member-list">{members.map((member) => <li key={member.id}><Avatar name={member.name} />
        <div className="member-detail"><strong>{member.name}{user.id === member.id ? ' (you)' : ''}</strong><small>{member.email}</small></div>
        {admin && !member.owner ? <><Select label={`Role for ${member.name}`} options={roles} value={member.role} disabled={busy} onChange={(event) => change(member, event.target.value)} />
          <button className="icon-btn" aria-label={`Remove ${member.name}`} onClick={() => setModal(member)}><UserRoundMinus size={17} /></button></>
          : <span className="role-tag">{member.owner ? 'Owner · Admin' : roles[member.role]}</span>}
      </li>)}</ul>
    </div>}
    {project.role !== 'DEVELOPER' && <div className="team-card project-settings"><div><h2>Project settings</h2><p className="muted">Update the project details or manage its lifecycle.</p></div>
      <div><button className="button secondary" onClick={() => setModal('edit')}><Pencil size={15} /> Edit project</button>
        {project.ownerId === user.id && <button className="button danger-subtle" onClick={() => setModal('delete')}><Trash2 size={15} /> Delete project</button>}</div></div>}
    {modal === 'invite' && <Dialog title="Add a team member" onClose={() => { setModal(null); setError(''); }}>
      <form className="dialog-body form-stack" onSubmit={invite}>
        <label>Email address<input name="email" type="email" required placeholder="teammate@example.com" maxLength={254} /><small>Use the email on their Bug Hit account.</small></label>
        <label>Role<Select label="Project role" name="role" options={roles} defaultValue="DEVELOPER" /></label>
        <ErrorBanner>{error}</ErrorBanner><div className="form-actions"><button className="button secondary" type="button" onClick={() => { setModal(null); setError(''); }}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button></div>
      </form>
    </Dialog>}
    {modal === 'edit' && <ProjectForm project={project} onClose={() => setModal(null)} onSaved={() => { setModal(null); onProjectsChanged(); }} />}
    {modal === 'delete' && <ConfirmDelete title={`Delete ${project.name}?`} onClose={() => setModal(null)} onConfirm={async () => {
      await api.delete(path); onProjectsChanged(); navigate('/projects');
    }}>This removes the project, team membership, issues, comments, and screenshots.</ConfirmDelete>}
    {modal && typeof modal === 'object' && <Dialog title={`Remove ${modal.name}?`} onClose={() => { setModal(null); setError(''); }}>
      <div className="dialog-body form-stack"><p className="muted">They lose project access and their assigned issues become unassigned.</p>
        <ErrorBanner>{error}</ErrorBanner><div className="form-actions"><button className="button secondary" onClick={() => { setModal(null); setError(''); }}>Cancel</button>
          <button className="button danger" disabled={busy} onClick={async () => {
            setError(''); setBusy(true);
            try { await api.delete(`${path}/members/${modal.id}`); setModal(null); await refresh(); onProjectsChanged(); }
            catch (failure) { setError(errorText(failure)); }
            finally { setBusy(false); }
          }}>{busy ? 'Removing…' : 'Remove member'}</button></div></div>
    </Dialog>}
  </section>;
}
