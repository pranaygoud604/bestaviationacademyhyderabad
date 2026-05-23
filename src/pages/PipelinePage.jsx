import React, { useState, useEffect, useRef } from 'react';
import { Flame, Thermometer, Snowflake, User, ChevronRight, RefreshCw, Filter, MoreHorizontal, Clock, TrendingUp } from 'lucide-react';

const BACKEND = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

const STAGES = [
  { id: 'new',        label: 'New',        color: 'slate',  hex: '#94a3b8', icon: '🆕' },
  { id: 'contacted',  label: 'Contacted',  color: 'blue',   hex: '#3b82f6', icon: '📞' },
  { id: 'interested', label: 'Interested', color: 'cyan',   hex: '#06b6d4', icon: '💡' },
  { id: 'demo',       label: 'Demo',       color: 'purple', hex: '#a855f7', icon: '🎯' },
  { id: 'documents',  label: 'Documents',  color: 'yellow', hex: '#eab308', icon: '📋' },
  { id: 'payment',    label: 'Payment',    color: 'orange', hex: '#f97316', icon: '💳' },
  { id: 'enrolled',   label: 'Enrolled',   color: 'green',  hex: '#22c55e', icon: '✅' },
  { id: 'lost',       label: 'Lost',       color: 'red',    hex: '#ef4444', icon: '❌' },
];

const STAGE_COLORS = {
  slate:  { bg: 'bg-slate-500/10',  border: 'border-slate-500/30',  text: 'text-slate-400',  badge: 'bg-slate-500/20 text-slate-300' },
  blue:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   badge: 'bg-blue-500/20 text-blue-300' },
  cyan:   { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   text: 'text-cyan-400',   badge: 'bg-cyan-500/20 text-cyan-300' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
  yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300' },
  orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' },
  green:  { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  badge: 'bg-green-500/20 text-green-300' },
  red:    { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    badge: 'bg-red-500/20 text-red-300' },
};

function ScoreBadge({ score }) {
  if (score >= 70) return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs font-bold">
      <Flame size={10} /> {score}
    </span>
  );
  if (score >= 40) return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full text-xs font-bold">
      <Thermometer size={10} /> {score}
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs font-bold">
      <Snowflake size={10} /> {score}
    </span>
  );
}

function LeadCard({ lead, onDragStart }) {
  const hoursAgo = lead.created_at
    ? Math.round((Date.now() - new Date(lead.created_at).getTime()) / 3_600_000)
    : 0;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      className="bg-slate-800 border border-slate-700 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-slate-600 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-white leading-tight">{lead.name}</p>
        <ScoreBadge score={lead.score || 50} />
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs text-slate-400">{lead.phone}</span>
      </div>

      {(lead.course_interest || lead.course) && (
        <span className="inline-block px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded-full mb-2">
          {lead.course_interest || lead.course}
        </span>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1">
          {lead.employees ? (
            <>
              <span className="text-base leading-none">{lead.employees.avatar || '👤'}</span>
              <span className="truncate max-w-[80px]">{lead.employees.name?.split(' ')[0]}</span>
            </>
          ) : (
            <span className="text-slate-600">Unassigned</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {hoursAgo < 24 ? `${hoursAgo}h` : `${Math.floor(hoursAgo/24)}d`}
        </span>
      </div>

      {lead.conversion_probability > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-slate-500 mb-0.5">
            <span>Conv. prob.</span>
            <span>{lead.conversion_probability}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1">
            <div
              className="h-1 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
              style={{ width: `${lead.conversion_probability}%` }}
            />
          </div>
        </div>
      )}

      {lead.total_fees > 0 && (
        <p className="text-xs text-green-400 mt-1.5 font-medium">
          ₹{Number(lead.total_fees).toLocaleString('en-IN')}
        </p>
      )}
    </div>
  );
}

export default function PipelinePage({ currentUser }) {
  const [grouped, setGrouped]         = useState({});
  const [stats, setStats]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [dragOver, setDragOver]       = useState(null);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [employees, setEmployees]     = useState([]);
  const [movingLead, setMovingLead]   = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);

  useEffect(() => {
    fetchPipeline();
    fetch(`${BACKEND}/api/employees`)
      .then(r => r.json())
      .then(d => setEmployees(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [filterEmployee]);

  const fetchPipeline = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEmployee) params.set('assignedTo', filterEmployee);
      const res = await fetch(`${BACKEND}/api/pipeline?${params}`);
      const d   = await res.json();
      setGrouped(d.grouped || {});
      setStats(d.stats   || []);
    } catch (e) {
      console.error('[Pipeline]', e.message);
    }
    setLoading(false);
  };

  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData('leadId', leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(stageId);
  };

  const handleDrop = async (e, toStage) => {
    e.preventDefault();
    setDragOver(null);
    const leadId = e.dataTransfer.getData('leadId');
    if (!leadId) return;

    setMovingLead(leadId);
    try {
      const res = await fetch(`${BACKEND}/api/pipeline/${leadId}/stage`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stage: toStage, changedBy: currentUser?.id }),
      });
      if (res.ok) {
        // Optimistic update
        setGrouped(prev => {
          const next = { ...prev };
          let movedLead = null;
          for (const stage of Object.keys(next)) {
            const idx = next[stage].findIndex(l => l.id === leadId);
            if (idx >= 0) {
              movedLead = { ...next[stage][idx], pipeline_stage: toStage };
              next[stage] = next[stage].filter(l => l.id !== leadId);
              break;
            }
          }
          if (movedLead) {
            next[toStage] = [movedLead, ...(next[toStage] || [])];
          }
          return next;
        });
        // Re-score in background
        fetch(`${BACKEND}/api/pipeline/score/${leadId}`, { method: 'POST' }).catch(() => {});
      }
    } catch (e) {
      console.error('[Move lead]', e.message);
    }
    setMovingLead(null);
  };

  const totalLeads = Object.values(grouped).flat().length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admissions Pipeline</h1>
          <p className="text-slate-400 text-sm mt-0.5">{totalLeads} leads across {STAGES.length} stages</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterEmployee}
            onChange={e => setFilterEmployee(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Agents</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
          <button
            onClick={fetchPipeline}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition-all text-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => fetch(`${BACKEND}/api/pipeline/score-all`, { method: 'POST' }).then(fetchPipeline)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-all"
          >
            <TrendingUp size={14} />
            Re-score All
          </button>
        </div>
      </div>

      {/* Stage Stats Bar */}
      <div className="grid grid-cols-8 gap-2">
        {stats.map((s, i) => {
          const stage = STAGES[i];
          const colors = STAGE_COLORS[stage?.color || 'slate'];
          return (
            <div key={s.stage} className={`${colors.bg} border ${colors.border} rounded-lg p-3 text-center`}>
              <p className="text-xl font-bold text-white">{s.count}</p>
              <p className={`text-xs ${colors.text} font-medium truncate`}>{stage?.icon} {s.stage}</p>
              {s.conversionRate !== null && (
                <p className="text-xs text-slate-500 mt-1">{s.conversionRate}% →</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw size={24} className="animate-spin text-blue-400" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
          {STAGES.map((stage) => {
            const colors   = STAGE_COLORS[stage.color];
            const leads    = grouped[stage.id] || [];
            const isOver   = dragOver === stage.id;

            return (
              <div
                key={stage.id}
                onDragOver={e => handleDragOver(e, stage.id)}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, stage.id)}
                className={`flex-shrink-0 w-64 rounded-xl border transition-all ${
                  isOver
                    ? `${colors.bg} ${colors.border} border-2`
                    : 'bg-slate-900/50 border-slate-800'
                }`}
              >
                {/* Column header */}
                <div className={`px-3 py-2.5 border-b ${isOver ? colors.border : 'border-slate-800'} flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{stage.icon}</span>
                    <span className={`text-sm font-semibold ${colors.text}`}>{stage.label}</span>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${colors.badge}`}>
                    {leads.length}
                  </span>
                </div>

                {/* Lead cards */}
                <div className="p-2 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                  {leads.length === 0 ? (
                    <p className="text-center text-slate-600 text-xs py-8">Drop leads here</p>
                  ) : (
                    leads.map(lead => (
                      <div key={lead.id} className={movingLead === lead.id ? 'opacity-50' : ''}>
                        <LeadCard lead={lead} onDragStart={handleDragStart} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
