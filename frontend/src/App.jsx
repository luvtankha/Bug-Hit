import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ChevronRight, CircleHelp, FolderKanban, LayoutGrid, LogOut, Menu, Plus, RefreshCw, X } from 'lucide-react';
import { api, errorText, storeToken, token } from './api';
import { Avatar, Busy, Dialog, ErrorBanner, Logo, roles } from './ui';
import Board from './Board';
import Team from './Team';

function AuthScreen({ onAuth }) {
  const [signup, setSignup] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try { const { data } = await api.post(`/auth/${signup ? 'signup' : 'login'}`, body); storeToken(data.token); onAuth(data.user); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <div className="auth-main">
      <Logo />
      <div className="auth-form-wrap">
        <h1>{signup ? 'Create your account' : 'Welcome back'}</h1><p>{signup ? 'Start tracking issues with your team.' : 'Sign in to your issue tracker.'}</p>
        <form className="form-stack" onSubmit={submit}>
          {signup && <label>Name<input name="name" required maxLength={80} autoComplete="name" /></label>}
          <label>Email address<input name="email" type="email" required maxLength={254} placeholder="you@company.com" autoComplete="email" /></label>
          <label>Password<input name="password" type="password" required maxLength={72} minLength={signup ? 12 : undefined}
            placeholder={signup ? 'At least 12 characters' : 'Your password'} autoComplete={signup ? 'new-password' : 'current-password'} /></label>
          <ErrorBanner>{error}</ErrorBanner>
          <button className="button primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></button>
        </form>
        <p className="auth-switch">{signup ? 'Already have an account?' : 'New to Bug Hit?'}{' '}
          <button className="text-link" onClick={() => { setSignup(!signup); setError(''); }}>{signup ? 'Sign in' : 'Create an account'}</button>
        </p>
      </div>
    </div>
    <div className="auth-hero" aria-hidden="true">
      <div className="auth-grid" /><div className="hero-badge"><FolderKanban size={32} /></div>
      <div className="hero-board"><div><span /><i /><i /></div><div><span /><i /><i /><i /></div><div><span /><i /></div></div>
      <div className="hero-copy">Catch issues.<br />Keep work moving.</div>
    </div>
  </main>;
}

export function ProjectForm({ project, onClose, onSaved }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const draft = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try { const { data } = project ? await api.put(`/projects/${project.id}`, draft) : await api.post('/projects', draft); onSaved(data); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  return <Dialog title={project ? 'Edit project' : 'Create project'} onClose={onClose}>
    <form className="form-stack dialog-body" onSubmit={submit}>
      <label>Project name<input name="name" placeholder="Website redesign" maxLength={100} defaultValue={project?.name} required /></label>
      {!project && <label>Project key<input name="key" placeholder="WEB" pattern="[A-Za-z][A-Za-z0-9]{1,7}" minLength={2} maxLength={8}
        value={key} onChange={(event) => setKey(event.target.value.toUpperCase())} required /><small>Used in issue IDs, such as WEB-12.</small></label>}
      <label>Description<textarea name="description" placeholder="What is this project about?" maxLength={1000} rows={3} defaultValue={project?.description} /></label>
      <ErrorBanner>{error}</ErrorBanner>
      <div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Saving…' : project ? 'Save project' : 'Create project'}</button></div>
    </form>
  </Dialog>;
}

function ProjectsHome({ projects, loading, error, retry, create }) {
  return <section className="work-content home-content">
    <div className="content-head"><div><h1>Projects</h1><p>Open a project to see its board, issues, and team.</p></div>
      <button className="button primary" onClick={create}><Plus size={18} /> New project</button></div>
    <ErrorBanner>{error && <>{error} <button className="text-link" onClick={retry}>Retry</button></>}</ErrorBanner>
    {loading && !projects.length ? <Busy>Loading projects…</Busy> : projects.length ? <div className="project-grid">
      {projects.map((project) => <Link key={project.id} to={`/projects/${project.id}`} className="project-card">
        <div className="project-card-top"><span className="project-emblem"><FolderKanban size={21} /></span><span className="project-open"><ArrowDownRight size={20} /></span></div>
        <h2>{project.name}</h2><p>{project.description || 'Open board'}</p>
        <div className="project-card-bottom"><span className="project-key">{project.key}</span><span className="muted">{roles[project.role]}</span></div>
      </Link>)}
    </div> : !error && <div className="empty-state"><span className="empty-icon"><FolderKanban size={26} /></span>
      <h2>Create your first project</h2><p>Start a board for your team and add the issues you want to track.</p><button className="button primary" onClick={create}><Plus size={17} /> Create project</button></div>}
  </section>;
}

function ProjectScreen({ projects, user, retry, view }) {
  const { id } = useParams();
  const fromList = projects.find((p) => String(p.id) === id);
  const [detail, setDetail] = useState({ id: null, project: null, error: '' });
  useEffect(() => {
    let active = true;
    api.get(`/projects/${id}`).then(({ data }) => { if (active) setDetail({ id, project: data, error: '' }); })
      .catch((error) => { if (active) setDetail({ id, project: null, error: errorText(error) }); });
    return () => { active = false; };
  }, [id]);
  if (detail.id === id && detail.error) return <section className="work-content"><ErrorBanner>{detail.error}</ErrorBanner><Link className="text-link" to="/projects">Back to projects</Link></section>;
  const project = fromList || (detail.id === id && detail.project);
  if (!project) return <section className="work-content"><Busy>Opening project…</Busy></section>;
  return view === 'team' ? <Team key={id} user={user} project={project} onProjectsChanged={retry} /> : <Board key={id} user={user} project={project} onProjectsChanged={retry} />;
}

function Workspace({ user, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const sequence = useRef(0);
  const location = useLocation();
  const navigate = useNavigate();
  const currentId = location.pathname.match(/^\/projects\/(\d+)/)?.[1];
  const selected = projects.find((project) => String(project.id) === currentId);

  const refresh = useCallback(async () => {
    const run = ++sequence.current;
    try { const { data } = await api.get('/projects'); if (run === sequence.current) { setProjects(data); setError(''); } }
    catch (failure) { if (run === sequence.current) setError(errorText(failure)); }
    finally { if (run === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    refresh(); window.addEventListener('focus', refresh);
    return () => { ++sequence.current; window.removeEventListener('focus', refresh); };
  }, [refresh]);

  function open(path) { setSidebar(false); navigate(path); }
  async function logout() {
    try { await api.post('/auth/logout'); onLogout(); }
    catch (failure) { if (failure.response?.status !== 401) setLogoutError(errorText(failure)); }
  }

  return <div className="shell">
    {sidebar && <button className="shade" aria-label="Close navigation" onClick={() => setSidebar(false)} />}
    <aside className={`side ${sidebar ? 'side-open' : ''}`} aria-label="Workspace navigation">
      <div className="side-top"><Link to="/projects" onClick={() => setSidebar(false)}><Logo /></Link>
        <button className="icon-btn side-close" aria-label="Close menu" onClick={() => setSidebar(false)}><X size={20} /></button></div>
      <nav className="side-nav" aria-label="Projects">
        <NavLink to="/projects" end onClick={() => setSidebar(false)}><LayoutGrid size={17} /> All projects</NavLink>
        <div className="side-group"><span>Your projects</span><button className="icon-btn" aria-label="New project" onClick={() => { setSidebar(false); setCreate(true); }}><Plus size={17} /></button></div>
        {projects.map((project) => <Link key={project.id} to={`/projects/${project.id}`} aria-current={String(project.id) === currentId ? 'page' : undefined} onClick={() => setSidebar(false)}>
          <span className="side-project-icon">{project.key.slice(0, 2)}</span><span className="truncate">{project.name}</span></Link>)}
        {!projects.length && !loading && <span className="side-empty">Projects you join appear here.</span>}
      </nav>
      <div className="side-footer"><a href="/swagger-ui/index.html" target="_blank" rel="noreferrer"><CircleHelp size={17} /> API reference</a>
        <div className="profile"><Avatar name={user.name} /><div className="profile-label"><strong>{user.name}</strong><small>{user.email}</small></div>
          <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={logout}><LogOut size={17} /></button></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="crumbs"><button className="icon-btn menu-toggle" aria-label="Open navigation" onClick={() => setSidebar(true)}><Menu size={21} /></button>
        <Link to="/projects">Workspace</Link><ChevronRight size={13} /><span>{selected?.name || 'Projects'}</span></div>
        <button className="icon-btn top-refresh" aria-label="Refresh projects" title="Refresh projects" onClick={refresh}><RefreshCw size={17} /></button>
      </header>
      <ErrorBanner>{logoutError}</ErrorBanner>
      <Routes>
        <Route path="/projects" element={<ProjectsHome projects={projects} error={error} loading={loading} retry={refresh} create={() => setCreate(true)} />} />
        <Route path="/projects/:id" element={<ProjectScreen projects={projects} user={user} retry={refresh} view="board" />} />
        <Route path="/projects/:id/team" element={<ProjectScreen projects={projects} user={user} retry={refresh} view="team" />} />
        <Route path="*" element={<Navigate replace to="/projects" />} />
      </Routes>
    </div>
    {create && <ProjectForm onClose={() => setCreate(false)} onSaved={(project) => {
      setProjects((old) => [...old.filter((item) => item.id !== project.id), project]); setCreate(false); open(`/projects/${project.id}`); refresh();
    }} />}
  </div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(token()));
  const location = useLocation();
  const navigate = useNavigate();
  const expire = useCallback(() => { storeToken(null); setUser(null); }, []);

  useEffect(() => {
    let current = true;
    if (token()) api.get('/auth/me').then(({ data }) => { if (current) setUser(data); })
      .catch(() => { if (current) expire(); }).finally(() => { if (current) setLoading(false); });
    window.addEventListener('bug-hit-session-ended', expire);
    return () => { current = false; window.removeEventListener('bug-hit-session-ended', expire); };
  }, [expire]);

  if (loading) return <div className="full-loading"><Logo /><Busy>Opening workspace…</Busy></div>;
  if (!user) return <AuthScreen onAuth={(account) => { setUser(account); if (!location.pathname.startsWith('/projects')) navigate('/projects', { replace: true }); }} />;
  return <Workspace key={user.id} user={user} onLogout={expire} />;
}
