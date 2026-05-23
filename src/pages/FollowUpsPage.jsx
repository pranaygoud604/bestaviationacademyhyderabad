import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle, Clock, AlertCircle, Phone, Mail, MessageSquare, Users, RefreshCw, Trash2, ChevronDown, Calendar } from 'lucide-react';

const BACKEND = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

const TASK_TYPES = {
  call:      { label: 'Call',      icon: Phone,        color: 'blue' },
  meeting:   { label: 'Meeting',   icon: Users,        color: 'purple' },
  email:     { label: 'Email',     icon: Mail,         color: 'cyan' },
  whatsapp:  { label: 'WhatsApp',  icon: MessageSquare,color: 'green' },
  demo:      { label: 'Demo',      icon: Users,        color: 'orange' },
  follow_up: { label: 'Follow-up', icon: Clock,        color: 'yellow' },
};

const PRIORITY_COLORS = {
  low:    'bg-slate-700 text-slate-300',
  medium: 'bg-blue-500/20 text-blue-300',
  high:   'bg-orange-500/20 text-orange-300',
  urgent: 'bg-red-500/20 text-red-400',
};

function formatDueDate(iso) {
  if (!iso) return 'No date';
  const d    = new Date(iso);
  const now  = new Date();
  const diff = (d - now) / 3_600_000; // hours
  if (diff < -24) return `${Math.round(-diff / 24)}d overdue`;
  if (diff < 0)   return `${Math.round(-diff)}h overdue`;
  if (diff < 1)   return 'Due now';
  if (diff < 24)  return `Due in ${Math.round(diff)}h`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function TaskCard({ task, onComplete, onDelete, onEscalate, isAdmin }) {
  const type      = TASK_TYPES[task.type] || TASK_TYPES.follow_up;
  const Icon      = type.icon;
  const isOverdue = task.status === 'overdue';
  const isDone    = task.status === 'completed';

  return (
    <div className={`bg-slate-900 border rounded-xl p-4 transition-all ${
      isDone    ? 'border-green-500/20 opacity-60' :
      isOverdue ? 'border-red-500/40' :
                  'border-slate-800 hover:border-slate-700'
    }`}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => !isDone && onComplete(task.id)}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
            isDone ? 'bg-green-500 border-green-500' : 'border-slate-600 hover:border-green-500'
          }`}
        >
          {isDone && <CheckCircle size={12} className="text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-sm font-medium ${isDone ? 'line-through text-slate-500' : 'text-white'}`}>
              {task.title}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}`}>
              {task.priority}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-400 flex items-center gap-1`}>
              <Icon size={10} /> {type.label}
            </span>
          </div>

          {task.leads && (
            <p className="text-sm text-blue-400 mb-1">{task.leads.name} • {task.leads.phone}</p>
          )}

          {task.description && (
            <p className="text-xs text-slate-500 mb-2">{task.description}</p>
          )}

          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400 font-medium' : 'text-slate-500'}`}>
              <Clock size={10} />
              {formatDueDate(task.due_date)}
            </span>
            {task.employees && (
              <span className="text-slate-500 flex items-center gap-1">
                <span>{task.employees.avatar || '👤'}</span>
                {task.employees.name?.split(' ')[0]}
              </span>
            )}
            {task.leads?.pipeline_stage && (
              <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">{task.leads.pipeline_stage}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isOverdue && isAdmin && (
            <button
              onClick={() => onEscalate(task.id)}
              className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-lg hover:bg-orange-500/30 transition-all"
            >
              Escalate
            </button>
          )}
          <button
            onClick={() => onDelete(task.id)}
            className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FollowUpsPage({ currentUser }) {
  const [tasks, setTasks]         = useState([]);
  const [summary, setSummary]     = useState({});
  const [loading, setLoading]     = useState(true);
  const [activeFilter, setActiveFilter] = useState('today');
  const [showForm, setShowForm]   = useState(false);
  const [employees, setEmployees] = useState([]);
  const [leads, setLeads]         = useState([]);
  const [form, setForm]           = useState({
    leadId: '', assignedTo: '', title: '', description: '',
    dueDate: '', priority: 'medium', type: 'call',
  });
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = currentUser?.isAdmin;

  useEffect(() => {
    fetchTasks();
    fetchSummary();
    if (isAdmin) {
      fetch(`${BACKEND}/api/employees`).then(r => r.json()).then(d => setEmployees(Array.isArray(d) ? d : [])).catch(() => {});
    }
    fetch(`${BACKEND}/api/leads?limit=100`).then(r => r.json()).then(d => setLeads(d.leads || [])).catch(() => {});
  }, [activeFilter]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: activeFilter });
      if (!isAdmin && currentUser?.id) params.set('assignedTo', currentUser.id);
      const res = await fetch(`${BACKEND}/api/followups?${params}`);
      const d   = await res.json();
      setTasks(d.tasks || []);
    } catch (e) {
      console.error('[FollowUps]', e.message);
    }
    setLoading(false);
  };

  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams();
      if (!isAdmin && currentUser?.id) params.set('assignedTo', currentUser.id);
      const res = await fetch(`${BACKEND}/api/followups/summary?${params}`);
      const d   = await res.json();
      setSummary(d);
    } catch (e) {}
  };

  const handleComplete = async (id) => {
    await fetch(`${BACKEND}/api/followups/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'completed' }),
    });
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'completed' } : t));
    fetchSummary();
  };

  const handleDelete = async (id) => {
    await fetch(`${BACKEND}/api/followups/${id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== id));
    fetchSummary();
  };

  const handleEscalate = async (id) => {
    await fetch(`${BACKEND}/api/followups/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'escalated' }),
    });
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'escalated' } : t));
  };

  const handleEscalateAll = async () => {
    await fetch(`${BACKEND}/api/followups/escalate-overdue`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    });
    fetchTasks();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.leadId || !form.title || !form.dueDate) return;
    setSubmitting(true);
    try {
      await fetch(`${BACKEND}/api/followups`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          leadId:      form.leadId,
          assignedTo:  form.assignedTo || currentUser?.id || null,
          title:       form.title,
          description: form.description,
          dueDate:     form.dueDate,
          priority:    form.priority,
          type:        form.type,
        }),
      });
      setForm({ leadId: '', assignedTo: '', title: '', description: '', dueDate: '', priority: 'medium', type: 'call' });
      setShowForm(false);
      fetchTasks();
      fetchSummary();
    } catch (e) {
      console.error('[CreateTask]', e.message);
    }
    setSubmitting(false);
  };

  const filters = [
    { id: 'today',    label: 'Today',    count: summary.today },
    { id: 'overdue',  label: 'Overdue',  count: summary.overdue },
    { id: 'week',     label: 'This Week', count: null },
    { id: 'tomorrow', label: 'Tomorrow', count: null },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Follow-ups & Tasks</h1>
          <p className="text-slate-400 text-sm mt-0.5">Track, complete, and escalate follow-ups</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && summary.overdue > 0 && (
            <button
              onClick={handleEscalateAll}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500/20 border border-orange-500/40 text-orange-400 rounded-lg text-sm hover:bg-orange-500/30 transition-all"
            >
              <AlertCircle size={14} />
              Escalate All Overdue ({summary.overdue})
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-all"
          >
            <Plus size={14} />
            New Task
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Today\'s Tasks', value: summary.today || 0, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
          { label: 'Overdue',        value: summary.overdue || 0, color: 'text-red-400',  bg: 'bg-red-500/10 border-red-500/20' },
          { label: 'Pending',        value: summary.pending || 0, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
          { label: 'Done Today',     value: summary.completedToday || 0, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
        ].map(c => (
          <div key={c.label} className={`border rounded-xl p-4 ${c.bg}`}>
            <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFilter === f.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {f.label}
            {f.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeFilter === f.id ? 'bg-white/20' : 'bg-slate-700'}`}>
                {f.count}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={fetchTasks}
          className="ml-auto p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-all"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-blue-400' : 'text-slate-400'} />
        </button>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-blue-400" /></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <CheckCircle size={40} className="mx-auto mb-3 text-green-500/50" />
          <p className="text-lg font-medium">All clear!</p>
          <p className="text-sm mt-1">No tasks for this filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleComplete}
              onDelete={handleDelete}
              onEscalate={handleEscalate}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Create Task Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold text-white mb-5">Create Follow-up Task</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Lead *</label>
                <select
                  required
                  value={form.leadId}
                  onChange={e => setForm(p => ({ ...p, leadId: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select lead...</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>{l.name} — {l.phone}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Task Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Follow up on PPL course interest"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  >
                    {Object.entries(TASK_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Due Date & Time *</label>
                <input
                  required
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {isAdmin && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Assign To</label>
                  <select
                    value={form.assignedTo}
                    onChange={e => setForm(p => ({ ...p, assignedTo: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select employee...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-1">Notes</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Add context or instructions..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-white font-medium transition-all"
                >
                  {submitting ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
