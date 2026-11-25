import { useEffect, useRef } from 'react';
import { Bug, X } from 'lucide-react';

export const statuses = { TODO: 'To Do', IN_PROGRESS: 'In Progress', DONE: 'Done' };
export const types = { BUG: 'Bug', TASK: 'Task', STORY: 'Story' };
export const priorities = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' };
export const roles = { ADMIN: 'Admin', MANAGER: 'Manager', DEVELOPER: 'Developer' };

export function Logo() {
  return <span className="wordmark"><span className="brand-icon"><Bug size={21} strokeWidth={2.35} /></span>Bug Hit<span className="brand-period">.</span></span>;
}

export function Avatar({ name, size = '' }) {
  const words = name?.trim().split(/\s+/).slice(0, 2) || [];
  const initials = words.map((word) => Array.from(word)[0]).join('').toUpperCase();
  const palette = (name?.codePointAt(0) || 0) % 4;
  return <span title={name || 'Unassigned'} aria-hidden="true" className={`avatar tone-${palette} ${size}`}>{initials || '–'}</span>;
}

export function Select({ label, options, all, ...props }) {
  return <select aria-label={label} {...props}>
    {all && <option value="">{all}</option>}
    {Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
  </select>;
}

export function Dialog({ title, children, onClose, sheet = false, id = 'dialog-heading' }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className={`dialog ${sheet ? 'sheet' : ''}`} aria-labelledby={id}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="dialog-heading"><h2 id={id}>{title}</h2><button className="icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}

export function ErrorBanner({ children }) { return children ? <div role="alert" className="error-banner">{children}</div> : null; }
export function Busy({ children = 'Loading…' }) { return <p className="loading" role="status"><span className="spinner" />{children}</p>; }

const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export function localTime(value) { return value ? date.format(new Date(value)) : ''; }
