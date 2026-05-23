import React, { useState, useEffect } from 'react';
import { Trophy, TrendingUp, Target, Clock, CheckSquare, AlertTriangle, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';

const BACKEND = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ProgressBar({ value, max = 100, color = 'blue' }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  const colors = {
    blue:   'from-blue-500 to-cyan-500',
    green:  'from-green-500 to-emerald-500',
    purple: 'from-purple-500 to-pink-500',
    orange: 'from-orange-500 to-red-500',
  };
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5">
      <div
        className={`h-1.5 rounded-full bg-gradient-to-r ${colors[color] || colors.blue} transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MetricCard({ label, value, sub, color = 'blue', icon: Icon }) {
  const colors = {
    blue:   'from-blue-500/10 to-cyan-500/10 border-blue-500/20 text-blue-400',
    green:  'from-green-500/10 to-emerald-500/10 border-green-500/20 text-green-400',
    purple: 'from-purple-500/10 to-pink-500/10 border-purple-500/20 text-purple-400',
    orange: 'from-orange-500/10 to-red-500/10 border-orange-500/20 text-orange-400',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={16} className="opacity-70" />}
        <p className="text-xs text-slate-400 font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="text-slate-500 font-bold text-lg">#{rank}</span>;
}

export default function PerformancePage({ currentUser }) {
  const [metrics, setMetrics]     = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [slaBreaches, setSlaBreaches] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [month, setMonth]         = useState(new Date().getMonth() + 1);
  const [year, setYear]           = useState(new Date().getFullYear());
  const [targetModal, setTargetModal] = useState(null);
  const [targetForm, setTargetForm]   = useState({ revenueTarget: '', conversionTarget: '', leadsTarget: '' });

  useEffect(() => {
    fetchAll();
  }, [month, year]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [perfRes, lbRes, slaRes] = await Promise.all([
        fetch(`${BACKEND}/api/performance?month=${month}&year=${year}`),
        fetch(`${BACKEND}/api/performance/leaderboard/current`),
        fetch(`${BACKEND}/api/performance/sla/report`),
      ]);
      const [perf, lb, sla] = await Promise.all([perfRes.json(), lbRes.json(), slaRes.json()]);
      setMetrics(Array.isArray(perf) ? perf : []);
      setLeaderboard(Array.isArray(lb) ? lb : []);
      setSlaBreaches(Array.isArray(sla) ? sla : []);
    } catch (e) {
      console.error('[Performance]', e.message);
    }
    setLoading(false);
  };

  const saveTarget = async () => {
    if (!targetModal) return;
    await fetch(`${BACKEND}/api/performance/targets`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        employeeId:        targetModal.id,
        month, year,
        revenueTarget:     parseFloat(targetForm.revenueTarget || 0),
        conversionTarget:  parseInt(targetForm.conversionTarget || 0),
        leadsTarget:       parseInt(targetForm.leadsTarget || 0),
      }),
    });
    setTargetModal(null);
    fetchAll();
  };

  const totalRevenue     = metrics.reduce((s, m) => s + (m.revenue || 0), 0);
  const totalEnrollments = metrics.reduce((s, m) => s + (m.enrollments || 0), 0);
  const avgProductivity  = metrics.length
    ? Math.round(metrics.reduce((s, m) => s + (m.productivityScore || 0), 0) / metrics.length)
    : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Team Performance</h1>
          <p className="text-slate-400 text-sm mt-0.5">Leaderboard • SLA • Commission • Productivity</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
          >
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={fetchAll} className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-all">
            <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : 'text-slate-400'} />
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Team Revenue" value={`₹${(totalRevenue / 100000).toFixed(1)}L`} sub={`${MONTHS[month-1]} ${year}`} color="green" icon={TrendingUp} />
        <MetricCard label="Enrollments" value={totalEnrollments} sub="This month" color="blue" icon={Target} />
        <MetricCard label="Avg Productivity" value={`${avgProductivity}%`} sub="Team score" color="purple" icon={Trophy} />
        <MetricCard label="SLA Breaches" value={slaBreaches.length} sub="Active breaches" color="orange" icon={AlertTriangle} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {['leaderboard', 'details', 'sla'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'sla' ? 'SLA Breaches' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-blue-400" /></div>
      ) : (
        <>
          {/* Leaderboard Tab */}
          {activeTab === 'leaderboard' && (
            <div className="space-y-3">
              {leaderboard.map((emp, i) => (
                <div key={emp.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 text-center flex-shrink-0">
                    <RankBadge rank={emp.rank || i + 1} />
                  </div>
                  <div className="text-2xl">{emp.avatar || '👤'}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white">{emp.name}</p>
                    <p className="text-xs text-slate-400">{emp.role}</p>
                  </div>
                  <div className="text-center px-4">
                    <p className="text-lg font-bold text-green-400">₹{(emp.revenue / 100000).toFixed(1)}L</p>
                    <p className="text-xs text-slate-500">Revenue</p>
                  </div>
                  <div className="text-center px-4">
                    <p className="text-lg font-bold text-blue-400">{emp.enrollments}</p>
                    <p className="text-xs text-slate-500">Enrolled</p>
                  </div>
                </div>
              ))}
              {leaderboard.length === 0 && (
                <p className="text-center text-slate-500 py-8">No data yet for this period</p>
              )}
            </div>
          )}

          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {metrics.map(emp => (
                <div key={emp.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{emp.avatar || '👤'}</span>
                      <div>
                        <p className="font-bold text-white text-lg">{emp.name}</p>
                        <p className="text-sm text-slate-400">{emp.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${emp.productivityScore >= 70 ? 'text-green-400' : emp.productivityScore >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {emp.productivityScore}
                        </div>
                        <div className="text-xs text-slate-500">Score</div>
                      </div>
                      {currentUser?.isAdmin && (
                        <button
                          onClick={() => { setTargetModal(emp); setTargetForm({ revenueTarget: emp.revenueTarget, conversionTarget: emp.conversionTarget, leadsTarget: emp.leadsTarget }); }}
                          className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 hover:bg-slate-700 transition-all"
                        >
                          Set Targets
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Revenue vs Target</p>
                      <p className="text-sm font-semibold text-white">
                        ₹{(emp.revenue / 1000).toFixed(0)}K / ₹{(emp.revenueTarget / 1000).toFixed(0)}K
                      </p>
                      <ProgressBar value={emp.revenue} max={emp.revenueTarget} color="green" />
                      <p className="text-xs text-slate-500 mt-0.5">{emp.revenueAchievement}% achieved</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Enrollments</p>
                      <p className="text-sm font-semibold text-white">{emp.enrollments} / {emp.conversionTarget}</p>
                      <ProgressBar value={emp.enrollments} max={emp.conversionTarget} color="blue" />
                      <p className="text-xs text-slate-500 mt-0.5">{emp.conversionAchievement}% achieved</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">SLA Compliance</p>
                      <p className="text-sm font-semibold text-white">{emp.slaRate}%</p>
                      <ProgressBar value={emp.slaRate} max={100} color={emp.slaRate >= 80 ? 'green' : 'orange'} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Follow-up Rate</p>
                      <p className="text-sm font-semibold text-white">{emp.followUpRate}%</p>
                      <ProgressBar value={emp.followUpRate} max={100} color={emp.followUpRate >= 80 ? 'green' : 'orange'} />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Active Leads', value: emp.activeLeads },
                      { label: 'Leads Assigned', value: emp.leadsAssigned },
                      { label: 'Commission', value: `₹${(emp.commission / 1000).toFixed(1)}K` },
                      { label: 'Workload', value: emp.activeLeads > 25 ? '🔴 Heavy' : emp.activeLeads > 15 ? '🟡 Normal' : '🟢 Light' },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-800 rounded-lg p-2.5 text-center">
                        <p className="text-sm font-bold text-white">{item.value}</p>
                        <p className="text-xs text-slate-500">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SLA Tab */}
          {activeTab === 'sla' && (
            <div className="space-y-2">
              {slaBreaches.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <CheckSquare size={32} className="mx-auto mb-2 text-green-500" />
                  <p>No SLA breaches — team is on track!</p>
                </div>
              ) : (
                slaBreaches.map(lead => (
                  <div key={lead.id} className="bg-slate-900 border border-red-500/30 rounded-xl p-4 flex items-center gap-4">
                    <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white">{lead.name}</p>
                      <p className="text-sm text-slate-400">{lead.phone}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-red-400">{lead.hoursOverdue}h overdue</p>
                      <p className="text-xs text-slate-500">{lead.employees?.name}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      lead.pipeline_stage === 'new' ? 'bg-slate-700 text-slate-300' : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {lead.pipeline_stage}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Target Modal */}
      {targetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">
              Set Targets — {targetModal.name} ({MONTHS[month-1]} {year})
            </h3>
            <div className="space-y-4">
              {[
                { key: 'revenueTarget', label: 'Revenue Target (₹)', placeholder: '500000' },
                { key: 'conversionTarget', label: 'Enrollment Target', placeholder: '10' },
                { key: 'leadsTarget', label: 'Leads Target', placeholder: '30' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm text-slate-400 mb-1">{f.label}</label>
                  <input
                    type="number"
                    value={targetForm[f.key]}
                    onChange={e => setTargetForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setTargetModal(null)} className="flex-1 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition-all">
                Cancel
              </button>
              <button onClick={saveTarget} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-all">
                Save Targets
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
