import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, rectIntersection, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Bug, Check, CircleDot, GripVertical, LayoutGrid, List, Plus, Search, UsersRound, Zap } from 'lucide-react';
import { api, errorText, token } from './api';
import { Avatar, Busy, ErrorBanner, Select, priorities, statuses, types } from './ui';
import { TicketForm, TicketPanel } from './Ticket';

const typeIcons = { BUG: Bug, TASK: Check, STORY: Zap };
const priorityIcons = { LOW: ArrowDown, MEDIUM: ArrowRight, HIGH: ArrowUp, URGENT: Zap };
const filterDefaults = { q: '', priority: '', status: '', type: '', assignee: '' };

export function TypeTag({ type }) {
  const Icon = typeIcons[type];
  return <span className={`tag type-${type.toLowerCase()}`}><Icon size={12} />{types[type]}</span>;
}

export function PriorityTag({ priority }) {
  const Icon = priorityIcons[priority];
  return <span className={`priority priority-${priority.toLowerCase()}`}><Icon size={13} />{priorities[priority]}</span>;
}

export function canEdit(project, user, issue) {
  return project.role !== 'DEVELOPER' || issue.reporterId === user.id || issue.assigneeId === user.id;
}

export function ProjectTabs({ project, tab }) {
  return <nav className="project-tabs" aria-label="Project views">
    <Link to={`/projects/${project.id}`} aria-current={tab === 'board' ? 'page' : undefined}><LayoutGrid size={16} /> Issues</Link>
    <Link to={`/projects/${project.id}/team`} aria-current={tab === 'team' ? 'page' : undefined}><UsersRound size={16} /> Team</Link>
  </nav>;
}

function useLiveBoard(projectId, onUpdate) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let socket;
    let timer;
    let closed = false;
    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${location.host}/ws/connect`);
      socket.onopen = () => socket.send(JSON.stringify({ projectId, token: token() }));
      socket.onmessage = (event) => {
        if (closed) return;
        if (event.data === 'ready') { setConnected(true); onUpdate(); }
        if (event.data === 'refresh') onUpdate();
      };
      socket.onclose = (event) => {
        if (closed) return;
        setConnected(false);
        if (event.code === 1008) onUpdate();
        else timer = setTimeout(connect, 4500);
      };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); socket?.close(); };
  }, [projectId, onUpdate]);
  return connected;
}

function Card({ issue, open, movable = false, overlay = false }) {
  const drag = useDraggable({ id: issue.id, disabled: !movable });
  const transform = drag.transform;
  return <article className={`ticket-card${overlay ? ' ticket-overlay' : ''}${drag.isDragging ? ' dragging' : ''}`} ref={drag.setNodeRef}
    style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined}>
    <div className="ticket-card-head"><span className="issue-key">{issue.key}</span>
      {movable && <button ref={drag.setActivatorNodeRef} className="grip icon-btn" type="button" aria-label={`Drag ${issue.key}`}
        {...drag.attributes} {...drag.listeners} title="Drag to move"><GripVertical size={17} /></button>}</div>
    <h3>{overlay ? issue.title : <button className="ticket-link" onClick={() => open(issue.id)}>{issue.title}</button>}</h3>
    <div className="ticket-card-bottom"><div className="flex items-center gap-2"><TypeTag type={issue.type} /><PriorityTag priority={issue.priority} /></div>
      <Avatar name={issue.assigneeName} size="small" /></div>
  </article>;
}

function Column({ status, issues, open, add, movable }) {
  const drop = useDroppable({ id: status });
  const done = status === 'DONE';
  return <section aria-label={statuses[status]} className={`board-column column-${status.toLowerCase()}${drop.isOver ? ' column-over' : ''}`} ref={drop.setNodeRef} data-testid={`column-${status}`}>
    <div className="column-header"><span className="column-dot">{done && <Check size={10} strokeWidth={3} />}</span>
      <h2>{statuses[status]}</h2><span className="column-count">{issues.length}</span>
      <button className="icon-btn" aria-label={`Add issue to ${statuses[status]}`} onClick={() => add(status)}><Plus size={17} /></button></div>
    <div className="column-body">{issues.length ? issues.map((issue) => <Card key={issue.id} issue={issue} open={open} movable={movable(issue)} />)
      : <div className="column-empty">No issues here</div>}</div>
  </section>;
}

function IssuesTable({ issues, open }) {
  return <div className="table-wrap"><table className="issue-table">
    <thead><tr><th>Issue</th><th>Type</th><th>Priority</th><th>Status</th><th>Assignee</th></tr></thead>
    <tbody>{issues.map((issue) => <tr key={issue.id}>
      <td><span className="issue-key">{issue.key}</span><button className="ticket-link" onClick={() => open(issue.id)}>{issue.title}</button></td>
      <td><TypeTag type={issue.type} /></td><td><PriorityTag priority={issue.priority} /></td>
      <td>{statuses[issue.status]}</td><td>{issue.assigneeName || 'Unassigned'}</td>
    </tr>)}</tbody>
  </table>{!issues.length && <p className="table-empty">No matching issues.</p>}</div>;
}

export default function Board({ project, user, onProjectsChanged }) {
  const [filter, setFilter] = useState(filterDefaults);
  const [view, setView] = useState('board');
  const [add, setAdd] = useState(null);
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [rows, setRows] = useState({ items: [], page: 0, total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [moving, setMoving] = useState(null);
  const [drag, setDrag] = useState(null);
  const [version, setVersion] = useState(0);
  const fetchId = useRef(0);
  const filtersRef = useRef(false);
  const projectPath = `/projects/${project.id}`;
  const issuePath = `${projectPath}/issues`;
  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  const connected = useLiveBoard(project.id, refresh);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }), useSensor(KeyboardSensor));

  useEffect(() => {
    let current = true;
    api.get(`${projectPath}/members`).then(({ data }) => { if (current) setMembers(data); }).catch((error) => {
      if (current) setFailure(errorText(error));
    });
    return () => { current = false; };
  }, [projectPath, version]);

  const fetchIssues = useCallback(async (page = 0) => {
    const serial = ++fetchId.current;
    if (page === 0) setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filter).filter(([, value]) => value !== ''));
      const { data } = await api.get(issuePath, { params: { ...params, size: 60, page } });
      if (serial !== fetchId.current) return;
      setRows((old) => {
        if (!page) return data;
        const merged = new Map([...old.items, ...data.items].map((issue) => [issue.id, issue]));
        return { ...data, items: [...merged.values()] };
      });
    } catch (error) { if (serial === fetchId.current) setFailure(errorText(error)); }
    finally { if (serial === fetchId.current) setLoading(false); }
  }, [filter, issuePath]);

  useEffect(() => {
    const timer = setTimeout(() => { filtersRef.current = false; fetchIssues(); }, filtersRef.current ? 180 : 0);
    return () => { clearTimeout(timer); ++fetchId.current; };
  }, [fetchIssues, version]);

  const mutate = async (id, status) => {
    setMoving(id); setFailure('');
    try { await api.patch(`${issuePath}/${id}/status`, { status }); refresh(); }
    catch (error) { setFailure(errorText(error)); }
    finally { setMoving(null); }
  };
  const set = (key, value) => { filtersRef.current = true; setFailure(''); setFilter((old) => ({ ...old, [key]: value })); };
  const filtered = Object.values(filter).some(Boolean);
  const people = { 0: 'Unassigned', ...Object.fromEntries(members.map((m) => [m.id, m.name])) };
  const dragging = rows.items.find((item) => item.id === drag);

  return <section className="work-content board-content">
    <div className="content-head board-head">
      <div><div className="board-eyebrow"><span className="project-key">{project.key}</span><span className="live-state" role="status"><i className={connected ? 'live' : ''} />{connected ? 'Live updates' : 'Updates on refresh'}</span></div>
        <h1>{project.name}</h1><p>{project.description || 'Track issues from report to resolution.'}</p></div>
      <button className="button primary" onClick={() => setAdd('TODO')}><Plus size={18} /> New issue</button>
    </div>
    <ProjectTabs project={project} tab="board" />
    <div className="issue-toolbar">
      <label className="search"><Search size={16} /><input aria-label="Search issues" placeholder="Search issues…" maxLength={150} value={filter.q} onChange={(e) => set('q', e.target.value)} /></label>
      <div className="filters">
        <Select label="Filter by priority" options={priorities} all="Priority" value={filter.priority} onChange={(e) => set('priority', e.target.value)} />
        <Select label="Filter by status" options={statuses} all="Status" value={filter.status} onChange={(e) => set('status', e.target.value)} />
        <Select label="Filter by type" options={types} all="Type" value={filter.type} onChange={(e) => set('type', e.target.value)} />
        <Select label="Filter by assignee" options={people} all="Assignee" value={filter.assignee} onChange={(e) => set('assignee', e.target.value)} />
        {filtered && <button className="text-link clear" onClick={() => { setFailure(''); setFilter(filterDefaults); }}>Clear</button>}
      </div>
      <div className="view-switch" aria-label="Issue layout"><button className="icon-btn" aria-pressed={view === 'board'} aria-label="Board view" onClick={() => setView('board')}><LayoutGrid size={17} /></button>
        <button className="icon-btn" aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}><List size={18} /></button></div>
    </div>
    <ErrorBanner>{failure && <>{failure} <button className="text-link" onClick={() => { setFailure(''); refresh(); onProjectsChanged(); }}>Retry</button></>}</ErrorBanner>
    <div className="board-caption"><span><CircleDot size={15} /> {loading && !rows.items.length ? 'Loading issues' : `${rows.total} ${rows.total === 1 ? 'issue' : 'issues'}`}</span>
      {view === 'board' && rows.items.length > 0 && <span className="board-hint">Drag a card to move it <ArrowUpRight size={13} /></span>}</div>
    {view === 'list' ? <IssuesTable issues={rows.items} open={setSelected} /> : <DndContext sensors={sensors} collisionDetection={rectIntersection}
      onDragStart={(event) => setDrag(event.active.id)} onDragCancel={() => setDrag(null)} onDragEnd={(event) => {
        setDrag(null);
        const issue = rows.items.find((item) => item.id === event.active.id);
        const status = event.over?.id;
        if (issue && statuses[status] && issue.status !== status && !moving) mutate(issue.id, status);
      }}>
      <div className="board-grid">{Object.keys(statuses).map((status) => <Column status={status} key={status}
        issues={rows.items.filter((issue) => issue.status === status)} open={setSelected} add={setAdd}
        movable={(issue) => !moving && canEdit(project, user, issue)} />)}</div>
      <DragOverlay dropAnimation={null}>{dragging && <article className="ticket-card ticket-overlay"><span className="issue-key">{dragging.key}</span><h3>{dragging.title}</h3></article>}</DragOverlay>
    </DndContext>}
    {rows.hasMore && <button className="button secondary load-more" onClick={() => fetchIssues(rows.page + 1)}>Load more issues</button>}
    {loading && rows.items.length === 0 && <Busy />}
    {add && <TicketForm project={project} user={user} members={members} initialStatus={add} onClose={() => setAdd(null)}
      onSaved={(issue) => { setAdd(null); setSelected(issue.id); refresh(); }} />}
    {selected && <TicketPanel key={selected} id={selected} project={project} user={user} members={members} version={version}
      onClose={() => setSelected(null)} onChanged={refresh} />}
  </section>;
}
