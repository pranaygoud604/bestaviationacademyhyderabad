import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, TrendingUp, Users, Clock, CheckCircle, RefreshCw, Activity, Zap, BarChart2 } from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const SEVERITY_CONFIG = {
  critical: { color: 'border-red-500/50 bg-red-500/5',    badge: 'bg-red-500/20 text-red-400',    dot: 'bg-red-500' },
  high:     { color: 'border-orange-500/50 bg-orange-500/5', badge: 'bg-orange-500/20 text-orange-400', dot: 'bg-orange-500' },
  medium:   { color: 'border-yellow-500/50 bg-yellow-500/5', badge: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-500' },
  low:      { color: 'border-slate-700 bg-slate-900',        badge: 'bg-slate-700 text-slate-400',    dot: 'bg-slate-500' },
};

function KpiTile({ label, value, sub, color = 'default', large = false }) {
  const colors = {
    default: 'bg-slate-900 border-slate-800 text-white',
    green:   'bg-green-500/10 border-green-500/30 text-green-400',
    blue:    'bg-blue-500/10 border-blue-500/30 text-blue-400',
    orange:  'bg-orange-500/10 border-orange-500/30 text-orange-400',
    red:     'bg-red-500/10 border-red-500/30 text-red-400',
    purple:  'bg-purple-500/10 border-purple-500/30 text-purple-400',
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <p className={`${large ? 'text-4xl' : 'text-3xl'} font-bold`}>{value}</p>
      <p className="text-sm font-medium mt-1 opacity-80">{label}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

function HealthBar({ score, label }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-300">{label}</span>
          <span className={score >= 70 ? 'text-green-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'}>{score}</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ activity }) {
  const typeColors = {
    lead_created:           'bg-blue-500/20 text-blue-400',
    stage_change:           'bg-purple-500/20 text-purple-400',
    follow_up_completed:    'bg-green-500/20 text-green-400',
    follow_up_escalated:    'bg-red-500/20 text-red-400',
    payment_received:       'bg-green-500/20 text-green-400',
    document_submitted:     'bg-yellow-500/20 text-yellow-400',
    interview_scheduled:    'bg-cyan-500/20 text-cyan-400',
    batch_assigned:         'bg-purple-500/20 text-purple-400',
  };
  const timeAgo = (iso) => {
    const m = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-800/50 last:border-0">
      <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 mt-0.5 ${typeColors[activity.type] || 'bg-slate-700 text-slate-400'}`}>
        {activity.type?.replace(/_/g, ' ')}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 leading-tight">{activity.description}</p>
        {activity.leads?.name && <p className="text-xs text-slate-500 mt-0.5">{activity.leads.name}</p>}
      </div>
      <span className="text-xs text-slate-600 flex-shrink-0">{timeAgo(activity.created_at)}</span>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [kpis, setKpis]         = useState(null);
  const [teamHealth, setTeamHealth] = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [velocity, setVelocity] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [kpisRes, healthRes, alertRes, bottleRes, actRes, velRes] = await Promise.all([
        fetch(`${BACKEND}/api/admin/kpis`),
        fetch(`${BACKEND}/api/admin/team-health`),
        fetch(`${BACKEND}/api/admin/risk-alerts`),
        fetch(`${BACKEND}/api/admin/bottlenecks`),
        fetch(`${BACKEND}/api/admin/activity-feed?limit=20`),
        fetch(`${BACKEND}/api/admin/pipeline-velocity`),
      ]);
      const [k, h, a, b, act, vel] = await Promise.all([kpisRes.json(), healthRes.json(), alertRes.json(), bottleRes.json(), actRes.json(), velRes.json()]);
      setKpis(k);
      setTeamHealth(Array.isArray(h) ? h : []);
      setAlerts(Array.isArray(a) ? a : []);
      setBottlenecks(Array.isArray(b) ? b : []);
      setActivity(Array.isArray(act) ? act : []);
      setVelocity(vel);
    } catch (e) {
      console.error('[AdminDashboard]', e.message);
    }
    setLoading(false);
  };

  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield size={24} className="text-blue-400" />
            Admin Command Center
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Real-time KPIs · Risk Alerts · Team Health · Bottlenecks</p>
        </div>
        <div className="flex items-center gap-3">
          {criticalAlerts > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 border border-red-500/40 rounded-lg">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-red-400 text-sm font-medium">{criticalAlerts} critical</span>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-blue-500" />
            Auto-refresh
          </label>
          <button onClick={fetchAll} className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-400' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !kpis ? (
        <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-blue-400" /></div>
      ) : (
        <>
          {/* KPI Grid */}
          {kpis && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <KpiTile label="Total Leads" value={kpis.totalLeads} color="blue" />
              <KpiTile label="New Today" value={kpis.newToday} color="blue" />
              <KpiTile label="Enrolled" value={kpis.enrolled} color="green" />
              <KpiTile label="Month Revenue" value={`₹${((kpis.monthRevenue || 0) / 100000).toFixed(1)}L`} color="green" />
              <KpiTile label="Conversion Rate" value={`${kpis.conversionRate}%`} color={kpis.conversionRate >= 20 ? 'green' : kpis.conversionRate >= 10 ? 'orange' : 'red'} />
              <KpiTile label="Avg Lead Score" value={kpis.avgScore} color={kpis.avgScore >= 60 ? 'green' : kpis.avgScore >= 40 ? 'orange' : 'red'} />
              <KpiTile label="Unassigned" value={kpis.unassigned} color={kpis.unassigned > 5 ? 'red' : 'orange'} sub="Hot leads waiting" />
              <KpiTile label="Overdue Tasks" value={kpis.overdueTasks} color={kpis.overdueTasks > 0 ? 'red' : 'green'} />
              <KpiTile label="Active Agents" value={kpis.activeEmployees} color="blue" />
              <KpiTile label="Pending Docs" value={kpis.pendingDocs} color={kpis.pendingDocs > 10 ? 'orange' : 'default'} />
              <KpiTile label="Interviews" value={kpis.scheduledInterviews} color="purple" sub="Upcoming" />
              <KpiTile label="Pipeline Velocity" value={velocity ? `${velocity.avgDaysToClose}d` : '—'} color="blue" sub="Avg days to enroll" />
            </div>
          )}

          {/* 3-column layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

            {/* Risk Alerts */}
            <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={18} className="text-orange-400" />
                <h3 className="font-semibold text-white">Risk Alerts</h3>
                <span className="ml-auto px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded-full">{alerts.length}</span>
              </div>
              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle size={28} className="mx-auto mb-2 text-green-500" />
                  <p className="text-slate-500 text-sm">All clear — no active alerts</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {alerts.map((alert, i) => {
                    const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low;
                    return (
                      <div key={i} className={`border rounded-xl p-3 flex items-start gap-3 ${cfg.color}`}>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${cfg.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 leading-tight">{alert.message}</p>
                          {alert.employee && <p className="text-xs text-slate-500 mt-0.5">{alert.employee}</p>}
                        </div>
                        <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${cfg.badge}`}>{alert.severity}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Team Health */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-blue-400" />
                <h3 className="font-semibold text-white">Team Health</h3>
              </div>
              <div className="space-y-4">
                {teamHealth.map(emp => (
                  <div key={emp.id}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xl">{emp.avatar || '👤'}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-white">{emp.name}</p>
                          <span className={`text-xs font-medium ${emp.status === 'healthy' ? 'text-green-400' : emp.status === 'at_risk' ? 'text-yellow-400' : 'text-red-400'}`}>
                            {emp.status === 'healthy' ? '✓ Healthy' : emp.status === 'at_risk' ? '⚠ At Risk' : '🔴 Critical'}
                          </span>
                        </div>
                        <HealthBar score={emp.healthScore} label={`${emp.activeLeads} active · ${emp.overdueTasks} overdue tasks`} />
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs pl-9">
                      <span className="text-slate-500">{emp.enrollments} enrolled</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-green-400">₹{((emp.revenue || 0) / 1000).toFixed(0)}K</span>
                      <span className="text-slate-600">·</span>
                      <span className={emp.targetPct >= 100 ? 'text-green-400' : emp.targetPct >= 50 ? 'text-yellow-400' : 'text-red-400'}>{emp.targetPct}% target</span>
                    </div>
                  </div>
                ))}
                {teamHealth.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No employees found</p>}
              </div>
            </div>
          </div>

          {/* Bottlenecks + Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Bottlenecks */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Zap size={18} className="text-yellow-400" />
                <h3 className="font-semibold text-white">Pipeline Bottlenecks</h3>
                <span className="ml-auto text-xs text-slate-500">Leads stuck too long in a stage</span>
              </div>
              {bottlenecks.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">No bottlenecks detected</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {bottlenecks.map(lead => (
                    <div key={lead.id} className="flex items-center gap-3 py-2 border-b border-slate-800/50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{lead.name}</p>
                        <p className="text-xs text-slate-500">{lead.employees?.name || 'Unassigned'} · <span className="text-yellow-400 capitalize">{lead.pipeline_stage}</span></p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-red-400">{lead.hoursStuck}h</p>
                        <p className="text-xs text-slate-500">stuck</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity Feed */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={18} className="text-cyan-400" />
                <h3 className="font-semibold text-white">Live Activity Feed</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {activity.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-6">No recent activity</p>
                ) : (
                  activity.map(a => <ActivityItem key={a.id} activity={a} />)
                )}
              </div>
            </div>
          </div>

          {/* Pipeline Velocity */}
          {velocity && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={18} className="text-purple-400" />
                <h3 className="font-semibold text-white">Pipeline Velocity</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-400">{velocity.avgDaysToClose}d</p>
                  <p className="text-xs text-slate-400 mt-1">Avg days to enroll</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-red-400">{velocity.avgDaysToLose}d</p>
                  <p className="text-xs text-slate-400 mt-1">Avg days to lose</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-400">{velocity.sampleSize}</p>
                  <p className="text-xs text-slate-400 mt-1">Enrolled sample size</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
