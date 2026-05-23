import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Target, Users, ArrowUpRight, RefreshCw, Plus } from 'lucide-react';

const BACKEND = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function KPICard({ label, value, sub, trend, color = 'blue' }) {
  const colors = {
    blue:   'from-blue-500/10 to-cyan-500/10 border-blue-500/20',
    green:  'from-green-500/10 to-emerald-500/10 border-green-500/20',
    purple: 'from-purple-500/10 to-pink-500/10 border-purple-500/20',
    orange: 'from-orange-500/10 to-red-500/10 border-orange-500/20',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-5`}>
      <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <div className="flex items-center gap-2">
        {trend !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend)}% MoM
          </span>
        )}
        {sub && <span className="text-xs text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

function MiniBar({ value, max, color = 'blue' }) {
  const pct = Math.min(100, max > 0 ? Math.round((value / max) * 100) : 0);
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    cyan: 'bg-cyan-500',
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-700 rounded-full h-2">
        <div className={`h-2 rounded-full ${colors[color] || colors.blue} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

function SparkLine({ data, height = 40 }) {
  if (!data || data.length < 2) return null;
  const values = data.map(d => d.revenue || 0);
  const max    = Math.max(...values, 1);
  const w      = 100 / (values.length - 1);
  const points = values.map((v, i) => `${i * w},${height - (v / max) * (height - 4)}`).join(' ');
  const area   = `0,${height} ${points} ${(values.length - 1) * w},${height}`;

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#grad)" />
      <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RevenuePage({ currentUser }) {
  const [dashboard, setDashboard]   = useState(null);
  const [forecast, setForecast]     = useState(null);
  const [funnel, setFunnel]         = useState(null);
  const [sources, setSources]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState('overview');
  const [month, setMonth]           = useState(new Date().getMonth() + 1);
  const [year, setYear]             = useState(new Date().getFullYear());
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordForm, setRecordForm] = useState({ leadId: '', amount: '', type: 'enrollment', course: '', description: '' });
  const [leads, setLeads]           = useState([]);

  useEffect(() => {
    fetchAll();
  }, [month, year]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [dashRes, forecastRes, funnelRes, srcRes] = await Promise.all([
        fetch(`${BACKEND}/api/revenue/dashboard?month=${month}&year=${year}`),
        fetch(`${BACKEND}/api/revenue/forecast`),
        fetch(`${BACKEND}/api/revenue/funnel`),
        fetch(`${BACKEND}/api/revenue/by-source`),
      ]);
      const [dash, fore, fun, src] = await Promise.all([dashRes.json(), forecastRes.json(), funnelRes.json(), srcRes.json()]);
      setDashboard(dash);
      setForecast(fore);
      setFunnel(fun);
      setSources(Array.isArray(src) ? src : []);
    } catch (e) {
      console.error('[Revenue]', e.message);
    }
    setLoading(false);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    await fetch(`${BACKEND}/api/revenue/record`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        leadId:      recordForm.leadId,
        employeeId:  currentUser?.id || null,
        amount:      parseFloat(recordForm.amount),
        type:        recordForm.type,
        course:      recordForm.course,
        description: recordForm.description,
      }),
    });
    setShowRecordModal(false);
    setRecordForm({ leadId: '', amount: '', type: 'enrollment', course: '', description: '' });
    fetchAll();
  };

  const loadLeads = () => {
    fetch(`${BACKEND}/api/leads?status=assigned&limit=100`)
      .then(r => r.json())
      .then(d => setLeads(d.leads || []));
  };

  const funnelStages = funnel?.funnel || [];
  const maxFunnelCount = funnelStages[0]?.count || 1;

  const COURSE_COLORS = ['blue','cyan','purple','orange','green','red'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Revenue Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Revenue • Forecast • Funnel • ROI</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
          >
            {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
          >
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => { setShowRecordModal(true); loadLeads(); }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm transition-all"
          >
            <Plus size={14} /> Record Payment
          </button>
          <button onClick={fetchAll} className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-all">
            <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : 'text-slate-400'} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-blue-400" /></div>
      ) : (
        <>
          {/* KPI Cards */}
          {dashboard && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="Monthly Revenue" value={`₹${((dashboard.totalRevenue || 0) / 100000).toFixed(1)}L`} trend={dashboard.mom} color="green" />
              <KPICard label="Target Achievement" value={`${dashboard.targetAchievement || 0}%`} sub={`₹${((dashboard.totalTarget || 0) / 100000).toFixed(1)}L target`} color="blue" />
              <KPICard label="Enrollments" value={dashboard.enrolledThisMonth || 0} sub="This month" color="purple" />
              <KPICard label="Cost Per Lead" value={`₹${(dashboard.costPerLead || 0).toLocaleString('en-IN')}`} sub={`ROI: ${dashboard.roi || 0}%`} color="orange" />
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
            {['overview','funnel','sources','forecast'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all capitalize ${
                  activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && dashboard && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Revenue by course */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">Revenue by Course</h3>
                {Object.keys(dashboard.byCourse || {}).length === 0 ? (
                  <p className="text-slate-500 text-sm">No data yet</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(dashboard.byCourse || {})
                      .sort(([,a],[,b]) => b - a)
                      .map(([course, amount], i) => (
                        <div key={course}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-300">{course}</span>
                            <span className="text-white font-medium">₹{Number(amount).toLocaleString('en-IN')}</span>
                          </div>
                          <MiniBar value={amount} max={dashboard.totalRevenue} color={COURSE_COLORS[i % COURSE_COLORS.length]} />
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Employee revenue contribution */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">Employee Contribution</h3>
                {(dashboard.employeeRevenue || []).length === 0 ? (
                  <p className="text-slate-500 text-sm">No revenue recorded yet</p>
                ) : (
                  <div className="space-y-3">
                    {(dashboard.employeeRevenue || []).map((emp, i) => (
                      <div key={emp.id} className="flex items-center gap-3">
                        <span className="text-xl">{emp.avatar || '👤'}</span>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-300">{emp.name}</span>
                            <span className="text-green-400 font-medium">₹{Number(emp.amount).toLocaleString('en-IN')}</span>
                          </div>
                          <MiniBar value={emp.amount} max={dashboard.totalRevenue} color={COURSE_COLORS[i % COURSE_COLORS.length]} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Funnel Tab */}
          {activeTab === 'funnel' && funnel && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-6">Conversion Funnel</h3>
              <div className="space-y-3">
                {funnelStages.map((stage, i) => {
                  const widthPct = maxFunnelCount > 0 ? Math.round((stage.count / maxFunnelCount) * 100) : 0;
                  const avgHours = funnel.stageTimings?.[stage.stage];
                  const stageColors = ['bg-blue-500','bg-cyan-500','bg-teal-500','bg-purple-500','bg-yellow-500','bg-orange-500','bg-green-500'];
                  return (
                    <div key={stage.stage}>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm text-slate-400 w-24 capitalize">{stage.stage}</span>
                        <div className="flex-1 bg-slate-800 rounded-full h-8 relative overflow-hidden">
                          <div
                            className={`h-full ${stageColors[i] || 'bg-blue-500'} rounded-full transition-all flex items-center pl-3`}
                            style={{ width: `${widthPct}%` }}
                          >
                            <span className="text-white text-sm font-bold">{stage.count}</span>
                          </div>
                        </div>
                        <span className="text-sm text-slate-400 w-24 text-right">
                          {avgHours ? `~${avgHours}h avg` : ''}
                        </span>
                        {stage.dropOff > 0 && (
                          <span className="text-xs text-red-400 w-16 text-right">-{stage.dropOff}%</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="bg-slate-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{funnelStages.find(s => s.stage === 'enrolled')?.count || 0}</p>
                  <p className="text-xs text-slate-500 mt-1">Total Enrolled</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">
                    {funnelStages[0]?.count > 0 ? Math.round(((funnelStages.find(s => s.stage === 'enrolled')?.count || 0) / funnelStages[0].count) * 100) : 0}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Overall Conversion</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-purple-400">{funnelStages[0]?.count || 0}</p>
                  <p className="text-xs text-slate-500 mt-1">Total in Pipeline</p>
                </div>
              </div>
            </div>
          )}

          {/* Sources Tab */}
          {activeTab === 'sources' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Revenue & ROI by Source</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs">
                      <th className="text-left pb-3">Source</th>
                      <th className="text-right pb-3">Leads</th>
                      <th className="text-right pb-3">Enrolled</th>
                      <th className="text-right pb-3">Conv. Rate</th>
                      <th className="text-right pb-3">Revenue</th>
                      <th className="text-right pb-3">ROI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {sources.map(src => (
                      <tr key={src.source}>
                        <td className="py-3 text-white font-medium">{src.source}</td>
                        <td className="py-3 text-right text-slate-300">{src.total}</td>
                        <td className="py-3 text-right text-slate-300">{src.enrolled}</td>
                        <td className="py-3 text-right">
                          <span className={`font-medium ${src.conversionRate >= 20 ? 'text-green-400' : src.conversionRate >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {src.conversionRate}%
                          </span>
                        </td>
                        <td className="py-3 text-right text-green-400 font-medium">
                          ₹{Number(src.revenue).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 text-right">
                          <span className={`font-medium ${src.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {src.roi}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {sources.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-500">No revenue data yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Forecast Tab */}
          {activeTab === 'forecast' && forecast && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-white font-semibold">6-Month Revenue Trend</h3>
                    <p className="text-slate-400 text-sm mt-0.5">Linear projection for next month</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-400">₹{((forecast.projected || 0) / 100000).toFixed(1)}L</p>
                    <p className="text-xs text-slate-500">Projected next month</p>
                  </div>
                </div>

                <div className="h-40">
                  <SparkLine data={forecast.months || []} height={140} />
                </div>

                <div className="grid grid-cols-6 gap-2 mt-4">
                  {(forecast.months || []).map(m => (
                    <div key={`${m.year}-${m.month}`} className="text-center">
                      <p className="text-xs text-white font-medium">₹{((m.revenue || 0) / 100000).toFixed(1)}L</p>
                      <p className="text-xs text-slate-500">{m.label}</p>
                      <p className="text-xs text-blue-400">{m.enrolled}✓</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {(forecast.months || []).slice(-3).map(m => (
                  <div key={`${m.year}-${m.month}`} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <p className="text-xs text-slate-400 mb-1">{m.label}</p>
                    <p className="text-xl font-bold text-white">₹{((m.revenue || 0) / 100000).toFixed(1)}L</p>
                    <p className="text-sm text-slate-400">{m.enrolled} enrolled · {m.newLeads} leads</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Record Payment Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-5">Record Payment</h3>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Lead *</label>
                <select required value={recordForm.leadId}
                  onChange={e => setRecordForm(p => ({ ...p, leadId: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select lead...</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.name} — {l.phone}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Amount (₹) *</label>
                  <input required type="number" value={recordForm.amount}
                    onChange={e => setRecordForm(p => ({ ...p, amount: e.target.value }))}
                    placeholder="250000"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Type</label>
                  <select value={recordForm.type}
                    onChange={e => setRecordForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  >
                    {['enrollment','installment','partial','refund'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Course</label>
                <select value={recordForm.course}
                  onChange={e => setRecordForm(p => ({ ...p, course: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select course...</option>
                  {['PPL','CPL','ATPL','IR','ME','Diploma','Ground School'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Notes</label>
                <input value={recordForm.description}
                  onChange={e => setRecordForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Payment reference, invoice no..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowRecordModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition-all">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium transition-all">
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
