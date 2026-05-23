import React, { useState, useEffect, useRef } from 'react';
import { Menu, X, Search, Bell, Plus, ChevronDown, MoreHorizontal, Zap, BarChart3, Users, MessageSquare, Settings, LogOut, Home, TrendingUp, Phone, Mail, Calendar, Clock, CheckCircle, AlertCircle, ArrowRight, Filter, Download, Eye, Edit, Trash2, Send, Paperclip, Smile, Flame, MapPin, Briefcase, Target, UserCheck, Shuffle, Lock, EyeOff, Megaphone, Layers, Award, ListChecks, DollarSign, Plane, Shield } from 'lucide-react';
import { supabase } from './lib/supabase';
import PipelinePage        from './pages/PipelinePage';
import PerformancePage     from './pages/PerformancePage';
import FollowUpsPage       from './pages/FollowUpsPage';
import RevenuePage         from './pages/RevenuePage';
import AviationPage        from './pages/AviationPage';
import AdminDashboardPage  from './pages/AdminDashboardPage';

const VALID_SOURCES = new Set(['Facebook Ad', 'Instagram Ad', 'WhatsApp Direct', 'Meta Lead Ad', 'Manual']);

function formatRelativeTime(iso) {
  if (!iso) return 'N/A';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PremiumSkyHostCRM() {
  const [currentUser, setCurrentUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeModule, setActiveModule] = useState('dashboard');
  const [showLoginModal, setShowLoginModal] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState({
    employees: [],
    leads: [],
    metaLeads: [],
    messages: [],
    notes: []
  });

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    // Seed employees on first run if table is empty
    const { data: existing } = await supabase.from('employees').select('id').limit(1);
    if (!existing?.length) {
      await supabase.from('employees').insert([
        { name: 'Rajesh Singh', email: 'rajesh@skyhost.com', role: 'Senior Sales Executive', avatar: '👨‍💼', conversions: 12, revenue: 180000, commission: 45000, performance: 85, status: 'active' },
        { name: 'Priya Sharma', email: 'priya@skyhost.com', role: 'Sales Executive', avatar: '👩‍💼', conversions: 15, revenue: 225000, commission: 75000, performance: 92, status: 'active' },
        { name: 'Amit Patel', email: 'amit@skyhost.com', role: 'Relationship Manager', avatar: '👨‍💼', conversions: 18, revenue: 270000, commission: 85000, performance: 95, status: 'active' },
      ]);
    }

    const [{ data: employees, error: empErr }, { data: allLeads, error: leadsErr }] = await Promise.all([
      supabase.from('employees').select('*').order('performance', { ascending: false }),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
    ]);

    if (empErr) console.error('employees fetch error:', empErr.message);
    if (leadsErr) console.error('leads fetch error:', leadsErr.message);

    const mapLead = (l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email || '',
      course: l.course || '',
      source: l.source,
      // priority → temperature badge, status → pipeline stage
      status: l.priority === 'high' ? 'hot' : l.priority === 'medium' ? 'warm' : 'cold',
      stage: l.status,
      assignedTo: l.assigned_to,
      priority: l.priority,
      lastContact: formatRelativeTime(l.updated_at),
      notes: Array.isArray(l.notes) ? l.notes.map(n => n.text || n).join(' | ') : (l.notes || ''),
      notesRaw: Array.isArray(l.notes) ? l.notes : (l.notes ? [{ text: l.notes }] : []),
      adName: l.ad_name,
      waMessageId: l.whatsapp_message_id,
      message: l.first_message,
      campaign: l.campaign,
      receivedAt: formatRelativeTime(l.created_at),
    });

    const mapped = (allLeads || []).map(mapLead);
    setData({
      employees: employees || [],
      leads: mapped,
      metaLeads: mapped.filter(l => l.source !== 'Manual'),
      messages: [],
      notes: [],
    });
  };

  const handleAssignMetaLead = async (leadId, employeeId) => {
    // Find the lead to check its source — PostgreSQL re-evaluates ALL CHECK constraints
    // on every UPDATE, so a lead with source='Meta Ads' (invalid) would block the update.
    const lead = data.metaLeads.find(l => l.id === leadId) || data.leads.find(l => l.id === leadId);
    const patch = {
      assigned_to: employeeId,
      status: 'assigned',
    };
    if (lead && !VALID_SOURCES.has(lead.source)) {
      patch.source = 'Meta Lead Ad'; // normalize webhook-provided source to satisfy constraint
    }

    const { data: updated, error } = await supabase
      .from('leads')
      .update(patch)
      .eq('id', leadId)
      .select('id');

    if (error) {
      console.error('Assignment error:', error.code, error.message);
      return { ok: false, msg: error.message };
    }
    if (!updated?.length) {
      console.error('Assignment: 0 rows updated — lead not found:', leadId);
      return { ok: false, msg: 'Lead not found in database. Try refreshing the page.' };
    }

    setData(prev => ({
      ...prev,
      leads: prev.leads.map(l => l.id === leadId
        ? { ...l, assignedTo: employeeId, stage: 'assigned', ...(patch.source ? { source: patch.source } : {}) }
        : l),
      metaLeads: prev.metaLeads.map(l => l.id === leadId
        ? { ...l, assignedTo: employeeId, stage: 'assigned', ...(patch.source ? { source: patch.source } : {}) }
        : l),
    }));
    return { ok: true };
  };

  const handleAutoAssignAll = async () => {
    const { employees, metaLeads } = data;
    if (!employees.length) return;

    const loadMap = {};
    employees.forEach(e => { loadMap[e.id] = 0; });
    metaLeads.forEach(l => { if (l.assignedTo) loadMap[l.assignedTo] = (loadMap[l.assignedTo] || 0) + 1; });

    const updates = [];
    const updatedMetaLeads = metaLeads.map(l => {
      if (l.assignedTo) return l;
      const sorted = [...employees].sort((a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0));
      const chosen = sorted[0];
      loadMap[chosen.id] = (loadMap[chosen.id] || 0) + 1;
      updates.push({ id: l.id, employeeId: chosen.id });
      return { ...l, assignedTo: chosen.id, stage: 'assigned' };
    });

    if (!updates.length) return;

    const results = await Promise.all(updates.map(({ id, employeeId }) => {
      const lead = metaLeads.find(l => l.id === id);
      const patch = { assigned_to: employeeId, status: 'assigned' };
      if (lead && !VALID_SOURCES.has(lead.source)) patch.source = 'Meta Lead Ad';
      return supabase.from('leads').update(patch).eq('id', id).select('id');
    }));

    const failed = results.filter(r => r.error);
    if (failed.length) {
      console.error('Auto-assign errors:', failed.map(r => r.error.message));
      await fetchData();
      return;
    }

    setData(prev => ({
      ...prev,
      leads: prev.leads.map(l => {
        const u = updates.find(u => u.id === l.id);
        return u ? { ...l, assignedTo: u.employeeId, stage: 'assigned' } : l;
      }),
      metaLeads: updatedMetaLeads,
    }));
  };

  const handleSimulateNewLead = async () => {
    const names = ['Rohan Gupta', 'Ananya Verma', 'Varun Patel', 'Divya Reddy', 'Aryan Sharma', 'Pooja Iyer'];
    const sources = ['Facebook Ad', 'Instagram Ad', 'Facebook Ad', 'Instagram Ad'];
    const adNames = ['Learn to Fly – PPL 2026', 'Aviation Career Fast Track', 'CPL in 18 Months', 'Fly High with SkyHost'];
    const campaigns = ['Aviation Jan 2026', 'Sky High Feb 2026', 'Pilot Dreams 2026'];
    const messages = [
      'Hi! I want to know about your PPL course fees and duration',
      'Interested in aviation training, can you share the full details?',
      'Saw your ad, please tell me more about the eligibility and fees',
      'Want to become a commercial pilot. What courses do you offer?',
      'Please send brochure for PPL training program',
    ];
    const courses = ['PPL', 'CPL', 'ATPL', 'Diploma'];
    const r = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const { data: inserted } = await supabase.from('leads').insert({
      name: r(names),
      phone: `+91${Math.floor(9000000000 + Math.random() * 999999999)}`,
      source: r(sources),
      ad_name: r(adNames),
      campaign: r(campaigns),
      whatsapp_message_id: `wamid.${Math.random().toString(36).substr(2, 9)}`,
      first_message: r(messages),
      course: r(courses),
      status: 'new',
      priority: 'medium',
      email: '',
    }).select().single();

    if (inserted) {
      const newLead = {
        id: inserted.id,
        name: inserted.name,
        phone: inserted.phone,
        source: inserted.source,
        adName: inserted.ad_name,
        campaign: inserted.campaign,
        waMessageId: inserted.whatsapp_message_id,
        message: inserted.first_message,
        course: inserted.course,
        assignedTo: null,
        status: 'warm',
        stage: 'new',
        priority: 'medium',
        lastContact: 'Just now',
        receivedAt: 'Just now',
      };
      setData(prev => ({ ...prev, leads: [newLead, ...prev.leads], metaLeads: [newLead, ...prev.metaLeads] }));
    }
  };

  const handleUpdateLeadStage = async (leadId, displayStage) => {
    const dbStatus =
      displayStage === 'completed' ? 'converted' :
      displayStage === 'following' ? 'contacted' : 'assigned';
    const { error } = await supabase.from('leads').update({ status: dbStatus }).eq('id', leadId);
    if (error) {
      console.error('Stage update error:', error.message);
      return { ok: false, msg: error.message };
    }
    setData(prev => ({
      ...prev,
      leads: prev.leads.map(l => l.id === leadId ? { ...l, stage: dbStatus } : l),
      metaLeads: prev.metaLeads.map(l => l.id === leadId ? { ...l, stage: dbStatus } : l),
    }));
    return { ok: true };
  };

  const handleAddLeadNote = async (leadId, text) => {
    const lead = data.leads.find(l => l.id === leadId) || data.metaLeads.find(l => l.id === leadId);
    const existing = lead?.notesRaw || [];
    const newNotes = [...existing, { text, createdAt: new Date().toISOString() }];
    const { error } = await supabase.from('leads').update({ notes: newNotes }).eq('id', leadId);
    if (error) {
      console.error('Note save error:', error.message);
      return { ok: false, msg: error.message };
    }
    setData(prev => ({
      ...prev,
      leads: prev.leads.map(l => l.id === leadId ? { ...l, notesRaw: newNotes } : l),
      metaLeads: prev.metaLeads.map(l => l.id === leadId ? { ...l, notesRaw: newNotes } : l),
    }));
    return { ok: true };
  };

  const handleAddLead = async (form) => {
    const { error, data: inserted } = await supabase.from('leads').insert({
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      course: form.course.trim() || null,
      source: 'Manual',
      status: form.assignedTo ? 'assigned' : 'new',
      priority: 'medium',
      assigned_to: form.assignedTo || null,
      notes: [],
    }).select('id').single();
    if (error) return { ok: false, msg: error.message };
    await fetchData();
    return { ok: true };
  };

  const handleLogin = async (user) => {
    let finalUser = user;
    if (!user.isAdmin) {
      const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();
      if (emp) finalUser = { ...user, id: emp.id };
    }
    setCurrentUser(finalUser);
    setShowLoginModal(false);
  };

  if (showLoginModal) {
    return <PremiumLoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} activeModule={activeModule} setActiveModule={setActiveModule} currentUser={currentUser} onLogout={() => { setCurrentUser(null); setShowLoginModal(true); }} unassignedCount={currentUser?.isAdmin ? data.metaLeads.filter(l => !l.assignedTo).length : 0} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Navbar */}
        <TopNavbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentUser={currentUser} searchQuery={searchQuery} setSearchQuery={setSearchQuery} setActiveModule={setActiveModule} onAddLead={handleAddLead} data={data} />

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            {activeModule === 'dashboard'   && <DashboardPage data={data} currentUser={currentUser} setActiveModule={setActiveModule} />}
            {activeModule === 'pipeline'    && <PipelinePage currentUser={currentUser} />}
            {activeModule === 'leads'       && <LeadsPage leads={data.leads} employees={data.employees} currentUser={currentUser} onUpdateStage={handleUpdateLeadStage} onAddNote={handleAddLeadNote} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
            {activeModule === 'followups'   && <FollowUpsPage currentUser={currentUser} />}
            {activeModule === 'aviation'    && <AviationPage currentUser={currentUser} />}
            {activeModule === 'employees'   && currentUser?.isAdmin && <EmployeesPage employees={data.employees} leads={data.leads} />}
            {activeModule === 'performance' && currentUser?.isAdmin && <PerformancePage currentUser={currentUser} />}
            {activeModule === 'revenue'     && currentUser?.isAdmin && <RevenuePage currentUser={currentUser} />}
            {activeModule === 'adminhq'     && currentUser?.isAdmin && <AdminDashboardPage />}
            {activeModule === 'whatsapp'    && <WhatsAppPage employees={data.employees} currentUser={currentUser} />}
            {activeModule === 'metaleads'   && <MetaLeadsPage metaLeads={data.metaLeads} employees={data.employees} onAssign={handleAssignMetaLead} onAutoAssign={handleAutoAssignAll} onSimulateNew={handleSimulateNewLead} currentUser={currentUser} />}
            {activeModule === 'automations' && currentUser?.isAdmin && <AutomationsPage />}
            {activeModule === 'reports'     && currentUser?.isAdmin && <ReportsPage data={data} />}
            {activeModule === 'settings'    && <SettingsPage currentUser={currentUser} isAdmin={currentUser?.isAdmin} onEmployeeCreated={fetchData} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ COMPONENTS ============

function Sidebar({ open, setOpen, activeModule, setActiveModule, currentUser, onLogout, unassignedCount }) {
  const isAdmin = currentUser?.isAdmin;
  const menuItems = [
    { id: 'dashboard',   label: 'Dashboard',   icon: Home },
    { id: 'pipeline',    label: 'Pipeline',    icon: Layers },
    { id: 'leads',       label: 'Leads',       icon: TrendingUp },
    { id: 'followups',   label: 'Follow-ups',  icon: ListChecks },
    ...(isAdmin ? [{ id: 'aviation', label: 'Aviation', icon: Plane }] : []),
    { id: 'metaleads',   label: 'Meta Ad Leads', icon: Target, badge: unassignedCount },
    { id: 'whatsapp',    label: 'Broadcasts',  icon: Megaphone },
    ...(isAdmin ? [{ id: 'performance', label: 'Performance', icon: Award }] : []),
    ...(isAdmin ? [{ id: 'revenue',     label: 'Revenue',     icon: DollarSign }] : []),
    ...(isAdmin ? [{ id: 'adminhq',     label: 'Admin HQ',    icon: Shield }] : []),
    ...(isAdmin ? [{ id: 'employees',   label: 'Employees',   icon: Users }] : []),
    ...(isAdmin ? [{ id: 'automations', label: 'Automations', icon: Zap }] : []),
    ...(isAdmin ? [{ id: 'reports',     label: 'Reports',     icon: BarChart3 }] : []),
    { id: 'settings',    label: 'Settings',    icon: Settings },
  ];

  return (
    <div className={[
      'fixed lg:static inset-y-0 left-0 z-50 h-full',
      'bg-slate-900 border-r border-slate-800 flex flex-col',
      'transition-all duration-300 ease-out',
      open
        ? 'w-72 translate-x-0'
        : 'w-72 -translate-x-full lg:translate-x-0 lg:w-20',
    ].join(' ')}>
      {/* Logo */}
      <div className="h-16 lg:h-20 flex items-center justify-between px-4 border-b border-slate-800 flex-shrink-0">
        <div className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 truncate">
          {open ? '✈️ SkyHost' : '✈️'}
        </div>
        <button onClick={() => setOpen(false)} className="lg:hidden p-1.5 hover:bg-slate-800 rounded-lg text-slate-400">
          <X size={18} />
        </button>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { setActiveModule(item.id); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <div className="relative flex-shrink-0">
                <Icon size={20} />
                {item.badge > 0 && !open && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full" />
                )}
              </div>
              {open && <span className="text-sm font-medium flex-1 text-left truncate">{item.label}</span>}
              {open && item.badge > 0 && (
                <span className="ml-auto px-2 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full text-xs font-bold flex-shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-3 border-t border-slate-800 flex-shrink-0">
        {open && (
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-3 mb-2 border border-slate-700">
            <p className="text-white font-semibold text-sm truncate">{currentUser.name}</p>
            <p className="text-slate-400 text-xs mt-0.5 truncate">{currentUser.role}</p>
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
        >
          <LogOut size={18} className="flex-shrink-0" />
          {open && <span className="text-sm">Logout</span>}
        </button>
      </div>
    </div>
  );
}

function TopNavbar({ sidebarOpen, setSidebarOpen, currentUser, searchQuery, setSearchQuery, setActiveModule, onAddLead, data }) {
  const [showNotifs, setShowNotifs] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', course: '', assignedTo: '' });
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);

  const employees = data?.employees || [];
  const leads = data?.leads || [];
  const isAdmin = currentUser?.isAdmin;

  // Admin: unassigned + hot leads alerts
  // Employee: only new leads assigned to them
  const myNewLeads = !isAdmin
    ? leads.filter(l => l.assignedTo === currentUser?.id && l.stage === 'new')
    : [];

  const unassigned = isAdmin ? leads.filter(l => !l.assignedTo).length : 0;
  const hotLeads = isAdmin ? leads.filter(l => l.status === 'hot').length : 0;
  const notifCount = isAdmin
    ? unassigned + (hotLeads > 0 ? 1 : 0)
    : myNewLeads.length;

  const notifications = isAdmin
    ? [
        ...(unassigned > 0 ? [{ id: 'unassigned', type: 'warn', text: `${unassigned} lead${unassigned > 1 ? 's' : ''} unassigned`, action: 'metaleads' }] : []),
        ...(hotLeads > 0 ? [{ id: 'hot', type: 'hot', text: `${hotLeads} hot lead${hotLeads > 1 ? 's' : ''} need attention`, action: 'leads' }] : []),
      ]
    : myNewLeads.map(l => ({
        id: `new-${l.id}`,
        type: 'info',
        text: `New lead assigned: ${l.name}${l.phone ? ` · ${l.phone}` : ''}`,
        action: 'leads',
      }));

  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
    if (e.target.value.trim()) setActiveModule('leads');
  };

  const handleAddField = (k, v) => { setAddForm(f => ({ ...f, [k]: v })); setAddError(''); };

  const handleSubmitLead = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) { setAddError('Name is required'); return; }
    if (!addForm.phone.trim()) { setAddError('Phone is required'); return; }
    setAddSaving(true);
    const result = await onAddLead(addForm);
    setAddSaving(false);
    if (!result.ok) { setAddError(result.msg); return; }
    setAddSuccess(true);
    setAddForm({ name: '', phone: '', email: '', course: '', assignedTo: '' });
    setTimeout(() => { setAddSuccess(false); setShowAddLead(false); }, 1500);
  };

  return (
    <>
      <div className="h-14 sm:h-16 bg-slate-900 border-b border-slate-800 px-3 sm:px-5 flex items-center justify-between sticky top-0 z-40 gap-2">
        {/* Left: hamburger + search */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg transition-all flex-shrink-0">
            <Menu size={20} />
          </button>
          {/* Search — hidden on mobile, shown on md+ */}
          <div className="relative hidden md:block w-64 lg:w-96">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search leads..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <X size={13} />
              </button>
            )}
          </div>
          {/* Mobile search icon */}
          <button
            onClick={() => { setActiveModule('leads'); }}
            className="md:hidden p-2 hover:bg-slate-800 rounded-lg transition-all text-slate-400"
          >
            <Search size={18} />
          </button>
        </div>

        {/* Right: bell + add + user */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Bell */}
          <div className="relative">
            <button onClick={() => setShowNotifs(v => !v)} className="relative p-2 hover:bg-slate-800 rounded-lg transition-all">
              <Bell size={20} className="text-slate-300" />
              {notifCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                  {notifCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="fixed sm:absolute right-0 sm:right-0 top-14 sm:top-12 left-0 sm:left-auto w-full sm:w-80 bg-slate-800 border border-slate-700 rounded-none sm:rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Notifications</span>
                  <button onClick={() => setShowNotifs(false)} className="text-slate-500 hover:text-white"><X size={14} /></button>
                </div>
                <div className="divide-y divide-slate-700/50 max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">All caught up!</p>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => { if (n.action) { setActiveModule(n.action); setShowNotifs(false); } }}
                      className={`px-4 py-3 flex items-start gap-3 ${n.action ? 'cursor-pointer hover:bg-slate-700/50' : ''} transition-colors`}
                    >
                      <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.type === 'hot' ? 'bg-red-400' : n.type === 'warn' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                      <p className="text-sm text-slate-300">{n.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add Lead — admin only */}
          {isAdmin && (
            <button
              onClick={() => { setShowAddLead(true); setShowNotifs(false); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-lg text-white font-medium transition-all text-sm"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Add Lead</span>
            </button>
          )}

          {/* User avatar */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-700 ml-1">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-white leading-tight">{currentUser.name}</p>
              <p className="text-xs text-slate-500 leading-tight">{currentUser.role}</p>
            </div>
            <div className="text-xl sm:text-2xl">{currentUser.avatar}</div>
          </div>
        </div>
      </div>

      {/* Add Lead Modal */}
      {showAddLead && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddLead(false)}>
          <div className="w-full sm:max-w-md bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/20 rounded-lg"><Plus size={18} className="text-blue-400" /></div>
                <h3 className="text-base font-semibold text-white">Add New Lead</h3>
              </div>
              <button onClick={() => setShowAddLead(false)} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
            </div>

            {addSuccess ? (
              <div className="px-6 py-12 text-center">
                <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
                <p className="text-white font-semibold">Lead added successfully!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitLead} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name *</label>
                    <input required value={addForm.name} onChange={e => handleAddField('name', e.target.value)}
                      placeholder="e.g. Arjun Sharma"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Phone *</label>
                    <input required value={addForm.phone} onChange={e => handleAddField('phone', e.target.value)}
                      placeholder="+91 9876543210"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                  <input value={addForm.email} onChange={e => handleAddField('email', e.target.value)}
                    type="email" placeholder="arjun@example.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Course Interest</label>
                    <select value={addForm.course} onChange={e => handleAddField('course', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-all">
                      <option value="">Select course</option>
                      {['PPL', 'CPL', 'ATPL', 'IR', 'ME', 'Diploma', 'Ground School'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Assign To</label>
                    <select value={addForm.assignedTo} onChange={e => handleAddField('assignedTo', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-all">
                      <option value="">Unassigned</option>
                      {employees.filter(e => e.status !== 'inactive').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                </div>

                {addError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{addError}</p>}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowAddLead(false)}
                    className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-sm font-medium transition-all">
                    Cancel
                  </button>
                  <button type="submit" disabled={addSaving}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-all">
                    {addSaving ? 'Adding...' : 'Add Lead'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const LOGIN_CREDENTIALS = {
  'admin@skyhost.com': { password: 'admin@123', user: { id: 0, name: 'Admin', email: 'admin@skyhost.com', role: 'Admin', avatar: '🛡️', isAdmin: true } },
  'rajesh@skyhost.com': { password: 'sky@123', user: { id: 1, name: 'Rajesh Singh', email: 'rajesh@skyhost.com', role: 'Senior Sales Executive', avatar: '👨‍💼', isAdmin: false } },
  'priya@skyhost.com': { password: 'sky@123', user: { id: 2, name: 'Priya Sharma', email: 'priya@skyhost.com', role: 'Sales Executive', avatar: '👩‍💼', isAdmin: false } },
  'amit@skyhost.com': { password: 'sky@123', user: { id: 3, name: 'Amit Patel', email: 'amit@skyhost.com', role: 'Relationship Manager', avatar: '👨‍💼', isAdmin: false } },
};

function PremiumLoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Check hardcoded admin/seed credentials first
    const entry = LOGIN_CREDENTIALS[email.toLowerCase().trim()];
    if (entry && entry.password === password) {
      onLogin(entry.user);
      return;
    }

    // Fall back to Supabase for dynamically-created employee accounts
    const { data: emp } = await supabase
      .from('employees')
      .select('id, name, email, role, avatar, password')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (emp && emp.password && emp.password === password) {
      onLogin({ id: emp.id, name: emp.name, email: emp.email, role: emp.role, avatar: emp.avatar, isAdmin: false });
      return;
    }

    setError('Invalid email or password');
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/20 to-slate-950">
      <div className="w-full max-w-md px-4">
        <div className="backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">✈️</div>
            <h1 className="text-3xl font-bold text-white mb-2">SkyHost CRM</h1>
            <p className="text-slate-400">Premium Aviation Training Platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@skyhost.com"
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-12 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-lg text-white font-semibold transition-all mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>


          <p className="text-center text-slate-500 text-xs mt-4">
            Secure access to your aviation training CRM
          </p>
        </div>
      </div>
    </div>
  );
}

function DashboardPage({ data, currentUser, setActiveModule }) {
  const { employees, leads: allLeads } = data;
  const isAdmin = currentUser?.isAdmin;

  // For employees, ONLY show their own leads — never other employees' data
  const myEmp = isAdmin ? null : employees.find(e => e.id === currentUser?.id);
  const leads = isAdmin ? allLeads : allLeads.filter(l => l.assignedTo === currentUser?.id);

  // Calculate metrics — employees only see their own numbers
  const totalLeads = leads.length;
  const hotLeads = leads.filter(l => l.status === 'hot').length;
  const pendingFollowUps = leads.filter(l => l.stage !== 'converted').length;
  const completedLeads = leads.filter(l => l.stage === 'converted').length;

  // Admin-only aggregate metrics
  const totalRevenue = employees.reduce((sum, emp) => sum + (emp.total_revenue || 0), 0);
  const activeEmployees = employees.filter(e => e.status === 'active').length;

  // Top performer: highest total_revenue, with conversions counted from leads
  const topEmp = employees.length > 0
    ? [...employees].sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))[0]
    : null;
  const topEmpConversions = topEmp
    ? leads.filter(l => l.assignedTo === topEmp.id && (l.stage === 'enrolled' || l.stage === 'converted')).length
    : 0;

  const adminKpis = [
    { label: 'Total Leads', value: totalLeads, trend: '+12%', icon: TrendingUp, color: 'from-blue-600 to-blue-700' },
    { label: 'Hot Leads 🔥', value: hotLeads, trend: '+24%', icon: Flame, color: 'from-red-600 to-red-700' },
    { label: 'Revenue', value: `₹${(totalRevenue/100000).toFixed(1)}L`, trend: '+18%', icon: BarChart3, color: 'from-emerald-600 to-emerald-700' },
    { label: 'Active Employees', value: activeEmployees, trend: '+2', icon: Users, color: 'from-cyan-600 to-cyan-700' },
    { label: 'Completed', value: completedLeads, trend: '+8%', icon: CheckCircle, color: 'from-emerald-600 to-emerald-700' },
    { label: 'Pending Follow-ups', value: pendingFollowUps, trend: '-5%', icon: Clock, color: 'from-orange-600 to-orange-700' },
  ];

  const empKpis = [
    { label: 'My Leads', value: totalLeads, icon: TrendingUp, color: 'from-blue-600 to-blue-700' },
    { label: 'Hot Leads 🔥', value: hotLeads, icon: Flame, color: 'from-red-600 to-red-700' },
    { label: 'Completed', value: completedLeads, icon: CheckCircle, color: 'from-emerald-600 to-emerald-700' },
    { label: 'Pending Follow-ups', value: pendingFollowUps, icon: Clock, color: 'from-orange-600 to-orange-700' },
  ];

  const kpis = isAdmin ? adminKpis : empKpis;

  const pipelineStages = [
    { stage: 'New',       count: leads.filter(l => l.stage === 'new' || l.stage === 'assigned').length, color: 'bg-slate-700' },
    { stage: 'Contacted', count: leads.filter(l => l.stage === 'contacted').length,  color: 'bg-blue-700' },
    { stage: 'Interested',count: leads.filter(l => l.stage === 'interested').length, color: 'bg-cyan-700' },
    { stage: 'Demo',      count: leads.filter(l => l.stage === 'demo').length,       color: 'bg-purple-700' },
    { stage: 'Docs',      count: leads.filter(l => l.stage === 'documents').length,  color: 'bg-yellow-700' },
    { stage: 'Payment',   count: leads.filter(l => l.stage === 'payment').length,    color: 'bg-orange-700' },
    { stage: 'Enrolled',  count: leads.filter(l => l.stage === 'enrolled' || l.stage === 'converted').length, color: 'bg-emerald-700' },
    { stage: 'Lost',      count: leads.filter(l => l.stage === 'lost').length,       color: 'bg-red-800' },
  ];

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">
          {isAdmin ? 'Overview' : `My Dashboard`}
        </h2>
        <div className={`grid grid-cols-2 ${isAdmin ? 'lg:grid-cols-3' : 'sm:grid-cols-4'} gap-3 sm:gap-6`}>
          {kpis.map((kpi, idx) => {
            const Icon = kpi.icon;
            return (
              <div
                key={idx}
                className="group backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 hover:border-slate-600 rounded-xl p-4 sm:p-6 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`bg-gradient-to-br ${kpi.color} p-2 sm:p-3 rounded-lg`}>
                    <Icon size={18} className="text-white sm:hidden" />
                    <Icon size={22} className="text-white hidden sm:block" />
                  </div>
                </div>
                <p className="text-slate-400 text-xs sm:text-sm mb-1">{kpi.label}</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">{kpi.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pipeline & Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline */}
        <div className="lg:col-span-2 backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            {isAdmin ? 'Lead Pipeline' : 'My Lead Pipeline'}
          </h3>
          <div className="overflow-x-auto -mx-2 px-2 pb-1">
            <div className="flex items-end gap-2 min-w-max">
              {pipelineStages.map((item, idx) => (
                <div key={idx} className="w-20 sm:w-24 flex-shrink-0">
                  <div className="flex flex-col items-center gap-1 mb-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.color}`}></div>
                    <span className="text-xs text-slate-400 text-center leading-tight">{item.stage}</span>
                  </div>
                  <div className={`${item.color} h-10 rounded-lg flex items-center justify-center`}>
                    <span className="text-white font-semibold text-sm">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel: Top Performer (admin) or My Performance (employee) */}
        <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6">
          {isAdmin ? (
            <>
              <h3 className="text-lg font-semibold text-white mb-6">Top Performer</h3>
              {topEmp ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="text-4xl">{topEmp.avatar}</div>
                    <div>
                      <p className="font-semibold text-white">{topEmp.name}</p>
                      <p className="text-xs text-slate-400">{topEmp.role}</p>
                    </div>
                  </div>
                  <div className="space-y-2 pt-4 border-t border-slate-700">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Conversions</span>
                      <span className="text-white font-semibold">{topEmpConversions}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Revenue</span>
                      <span className="text-emerald-400 font-semibold">₹{((topEmp.total_revenue || 0) / 1000).toFixed(0)}K</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No employees yet</p>
              )}
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-white mb-6">My Performance</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="text-4xl">{currentUser?.avatar || '👤'}</div>
                  <div>
                    <p className="font-semibold text-white">{currentUser?.name}</p>
                    <p className="text-xs text-slate-400">{currentUser?.role}</p>
                  </div>
                </div>
                <div className="space-y-2 pt-4 border-t border-slate-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Total Leads</span>
                    <span className="text-white font-semibold">{totalLeads}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Completed</span>
                    <span className="text-emerald-400 font-semibold">{completedLeads}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Following</span>
                    <span className="text-blue-400 font-semibold">
                      {leads.filter(l => ['contacted','interested','demo'].includes(l.stage)).length}
                    </span>
                  </div>
                  {myEmp && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Performance</span>
                      <span className="text-white font-semibold">{myEmp.performance}%</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent Leads — employees only see their own leads, no Employee column */}
      <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">
            {isAdmin ? 'Recent Leads' : 'My Recent Leads'}
          </h3>
          <button onClick={() => setActiveModule('leads')} className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-all">View All →</button>
        </div>

        {leads.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">No leads assigned yet</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Name</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Course</th>
                    {isAdmin && <th className="text-left py-3 px-4 text-slate-400 font-medium">Employee</th>}
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Last Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 5).map((lead) => {
                    const emp = employees.find(e => e.id === lead.assignedTo);
                    return (
                      <tr key={lead.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-all">
                        <td className="py-3 px-4 text-white font-medium">{lead.name}</td>
                        <td className="py-3 px-4 text-slate-300">{lead.course || '—'}</td>
                        {isAdmin && <td className="py-3 px-4">{emp?.avatar} {emp?.name}</td>}
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            lead.status === 'hot' ? 'bg-red-500/20 text-red-400' :
                            lead.status === 'warm' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-slate-700/50 text-slate-300'
                          }`}>
                            {lead.status?.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400">{lead.lastContact}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {leads.slice(0, 5).map((lead) => {
                const emp = employees.find(e => e.id === lead.assignedTo);
                return (
                  <div key={lead.id} className="flex items-center justify-between gap-3 py-3 border-b border-slate-700/50">
                    <div className="min-w-0">
                      <p className="text-white font-medium text-sm truncate">{lead.name}</p>
                      <p className="text-slate-500 text-xs truncate">{lead.course || lead.phone}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        lead.status === 'hot' ? 'bg-red-500/20 text-red-400' :
                        lead.status === 'warm' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-slate-700/50 text-slate-300'
                      }`}>{lead.status?.toUpperCase()}</span>
                      <span className="text-xs text-slate-500">{lead.lastContact}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LeadsPage({ leads: allLeads, employees, currentUser, onUpdateStage, onAddNote, searchQuery = '', setSearchQuery }) {
  const [filter, setFilter] = useState('all');
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  const [noteInput, setNoteInput] = useState({});
  const [savingNote, setSavingNote] = useState(new Set());
  const [updatingStage, setUpdatingStage] = useState(new Set());
  const [noteError, setNoteError] = useState({});
  const [stageError, setStageError] = useState({});

  const isAdmin = currentUser?.isAdmin;
  const leads = isAdmin ? allLeads : allLeads.filter(l => l.assignedTo === currentUser?.id);

  const stageCategory = (stage) => {
    if (stage === 'converted' || stage === 'enrolled') return 'completed';
    if (['contacted', 'interested', 'demo', 'documents', 'payment'].includes(stage)) return 'following';
    if (stage === 'lost') return 'lost';
    return 'new';
  };

  const q = searchQuery.toLowerCase().trim();
  const searchFiltered = q
    ? leads.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.course || '').toLowerCase().includes(q)
      )
    : leads;

  const counts = {
    all: searchFiltered.length,
    new: searchFiltered.filter(l => stageCategory(l.stage) === 'new').length,
    following: searchFiltered.filter(l => stageCategory(l.stage) === 'following').length,
    completed: searchFiltered.filter(l => stageCategory(l.stage) === 'completed').length,
  };

  const filteredLeads = filter === 'all' ? searchFiltered : searchFiltered.filter(l => stageCategory(l.stage) === filter);

  const toggleNotes = (id) => setExpandedNotes(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const handleAddNote = async (leadId) => {
    const text = noteInput[leadId]?.trim();
    if (!text) return;
    setSavingNote(prev => new Set(prev).add(leadId));
    setNoteError(prev => ({ ...prev, [leadId]: '' }));
    const result = await onAddNote(leadId, text);
    if (result?.ok === false) {
      setNoteError(prev => ({ ...prev, [leadId]: result.msg || 'Failed to save note' }));
    } else {
      setNoteInput(prev => ({ ...prev, [leadId]: '' }));
    }
    setSavingNote(prev => { const n = new Set(prev); n.delete(leadId); return n; });
  };

  const handleStage = async (leadId, newStage) => {
    setUpdatingStage(prev => new Set(prev).add(leadId));
    setStageError(prev => ({ ...prev, [leadId]: '' }));
    const result = await onUpdateStage(leadId, newStage);
    if (result?.ok === false) {
      setStageError(prev => ({ ...prev, [leadId]: result.msg || 'Failed to update status' }));
    }
    setUpdatingStage(prev => { const n = new Set(prev); n.delete(leadId); return n; });
  };

  const stageBadgeCls = (stage) => {
    const cat = stageCategory(stage);
    if (cat === 'completed') return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    if (cat === 'following') return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
  };

  const stageLabel = (stage) => {
    const cat = stageCategory(stage);
    if (cat === 'completed') return 'Completed';
    if (cat === 'following') return 'Following';
    return 'New';
  };

  const tabs = [
    { key: 'all',       label: `All (${counts.all})` },
    { key: 'new',       label: `New (${counts.new})` },
    { key: 'following', label: `Following (${counts.following})` },
    { key: 'completed', label: `Completed (${counts.completed})` },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-xl sm:text-2xl font-bold text-white">Leads</h2>
        <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 flex-wrap">
          <span className="px-2 py-1 bg-orange-500/10 text-orange-400 rounded-lg border border-orange-500/20">{counts.new} New</span>
          <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">{counts.following} Following</span>
          <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">{counts.completed} Done</span>
        </div>
      </div>
      {/* Mobile search */}
      <div className="md:hidden relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery && setSearchQuery(e.target.value); }}
          placeholder="Search leads..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
        />
      </div>

      {/* Filter tabs + search indicator */}
      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
              filter === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {q && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 rounded-lg text-sm text-blue-300">
            <Search size={13} />
            Searching: "{searchQuery}"
            <button onClick={() => setSearchQuery && setSearchQuery('')} className="ml-1 hover:text-white"><X size={13} /></button>
          </div>
        )}
      </div>

      {/* Lead list */}
      {filteredLeads.length === 0 ? (
        <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-16 text-center">
          <Users size={40} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">{q ? `No leads matching "${searchQuery}"` : 'No leads in this category'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLeads.map(lead => {
            const emp = employees.find(e => e.id === lead.assignedTo);
            const cat = stageCategory(lead.stage);
            const notesOpen = expandedNotes.has(lead.id);
            const noteCount = lead.notesRaw?.length || 0;
            const busy = updatingStage.has(lead.id);

            return (
              <div
                key={lead.id}
                className={`backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border rounded-xl p-5 transition-all duration-200 ${
                  cat === 'completed' ? 'border-emerald-500/20' :
                  cat === 'following' ? 'border-blue-500/20' :
                  'border-slate-700/50 hover:border-slate-600'
                }`}
              >
                {/* ── Main row ── */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <h4 className="text-sm sm:text-base font-semibold text-white">{lead.name}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${stageBadgeCls(lead.stage)}`}>
                        {stageLabel(lead.stage)}
                      </span>
                      {lead.source && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-slate-700/50 text-slate-400 border border-slate-600/50">
                          {lead.source}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1"><Phone size={12} />{lead.phone}</span>
                      {lead.course && <span className="flex items-center gap-1"><Briefcase size={12} />{lead.course}</span>}
                      {lead.email && <span className="hidden sm:flex items-center gap-1"><Mail size={12} />{lead.email}</span>}
                      <span className="flex items-center gap-1"><Clock size={12} />{lead.lastContact}</span>
                      {emp && isAdmin && <span className="flex items-center gap-1">{emp.avatar} <span className="text-slate-500">{emp.name}</span></span>}
                    </div>
                    {lead.message && (
                      <p className="mt-1.5 text-xs text-slate-600 italic truncate">"{lead.message}"</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0 sm:justify-end">
                    {cat !== 'following' && cat !== 'completed' && (
                      <button
                        onClick={() => handleStage(lead.id, 'following')}
                        disabled={busy}
                        className="px-3 py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-50 text-blue-400 border border-blue-500/30 rounded-lg transition-all font-medium"
                      >
                        Mark Following
                      </button>
                    )}
                    {cat === 'following' && (
                      <button
                        onClick={() => handleStage(lead.id, 'new')}
                        disabled={busy}
                        className="px-3 py-1.5 text-xs bg-slate-700/50 hover:bg-slate-600/50 disabled:opacity-50 text-slate-400 border border-slate-600/50 rounded-lg transition-all font-medium"
                      >
                        Back to New
                      </button>
                    )}
                    {cat !== 'completed' && (
                      <button
                        onClick={() => handleStage(lead.id, 'completed')}
                        disabled={busy}
                        className="px-3 py-1.5 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 text-emerald-400 border border-emerald-500/30 rounded-lg transition-all font-medium flex items-center gap-1"
                      >
                        <CheckCircle size={11} /> {busy ? 'Saving…' : 'Completed'}
                      </button>
                    )}
                    {cat === 'completed' && (
                      <button
                        onClick={() => handleStage(lead.id, 'following')}
                        disabled={busy}
                        className="px-3 py-1.5 text-xs bg-slate-700/50 hover:bg-slate-600/50 disabled:opacity-50 text-slate-400 border border-slate-600/50 rounded-lg transition-all font-medium"
                      >
                        Reopen
                      </button>
                    )}
                    <button
                      onClick={() => toggleNotes(lead.id)}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-all font-medium flex items-center gap-1 ${
                        notesOpen
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:bg-slate-700'
                      }`}
                    >
                      Notes{noteCount > 0 ? ` (${noteCount})` : ''}
                    </button>
                  </div>
                </div>

                {/* ── Notes panel ── */}
                {notesOpen && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    {noteCount > 0 ? (
                      <div className="space-y-2 mb-3 max-h-48 overflow-y-auto pr-1">
                        {lead.notesRaw.map((note, idx) => (
                          <div key={idx} className="flex items-start gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
                            <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm text-slate-300 leading-snug">{note.text || note}</p>
                              {note.createdAt && (
                                <p className="text-xs text-slate-600 mt-0.5">{formatRelativeTime(note.createdAt)}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600 mb-3 italic">No notes yet — add one below</p>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={noteInput[lead.id] || ''}
                        onChange={e => setNoteInput(prev => ({ ...prev, [lead.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddNote(lead.id); }}
                        placeholder="Add a note… (Enter to save)"
                        className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-all"
                      />
                      <button
                        onClick={() => handleAddNote(lead.id)}
                        disabled={!noteInput[lead.id]?.trim() || savingNote.has(lead.id)}
                        className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 disabled:bg-slate-700 text-amber-400 disabled:text-slate-500 border border-amber-500/30 disabled:border-slate-700 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                      >
                        {savingNote.has(lead.id) ? 'Saving…' : 'Save Note'}
                      </button>
                    </div>
                    {noteError[lead.id] && (
                      <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                        <AlertCircle size={11} /> {noteError[lead.id]}
                      </p>
                    )}
                    {stageError[lead.id] && (
                      <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                        <AlertCircle size={11} /> {stageError[lead.id]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmployeesPage({ employees, leads }) {
  const [selectedEmp, setSelectedEmp] = useState(null);

  const STAGE_LABELS = {
    new: 'New', contacted: 'Contacted', interested: 'Interested', demo: 'Demo',
    documents: 'Documents', payment: 'Payment', enrolled: 'Enrolled', lost: 'Lost',
    converted: 'Enrolled',
  };
  const STAGE_COLORS = {
    new: 'bg-slate-500/20 text-slate-300',
    contacted: 'bg-blue-500/20 text-blue-300',
    interested: 'bg-indigo-500/20 text-indigo-300',
    demo: 'bg-purple-500/20 text-purple-300',
    documents: 'bg-yellow-500/20 text-yellow-300',
    payment: 'bg-orange-500/20 text-orange-300',
    enrolled: 'bg-emerald-500/20 text-emerald-300',
    converted: 'bg-emerald-500/20 text-emerald-300',
    lost: 'bg-red-500/20 text-red-300',
  };

  const stageCategory = (stage) => {
    if (['enrolled', 'converted'].includes(stage)) return 'completed';
    if (['contacted', 'interested', 'demo', 'documents', 'payment'].includes(stage)) return 'following';
    if (stage === 'lost') return 'lost';
    return 'new';
  };

  const empLeadStats = (empId) => {
    const empLeads = (leads || []).filter(l => l.assignedTo === empId);
    return {
      all: empLeads,
      total: empLeads.length,
      newCount: empLeads.filter(l => stageCategory(l.stage || l.pipeline_stage) === 'new').length,
      followingCount: empLeads.filter(l => stageCategory(l.stage || l.pipeline_stage) === 'following').length,
      completedCount: empLeads.filter(l => stageCategory(l.stage || l.pipeline_stage) === 'completed').length,
      lostCount: empLeads.filter(l => stageCategory(l.stage || l.pipeline_stage) === 'lost').length,
    };
  };

  const detailStats = selectedEmp ? empLeadStats(selectedEmp.id) : null;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Team Members</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {employees.map((emp) => {
          const stats = empLeadStats(emp.id);
          return (
            <div
              key={emp.id}
              onClick={() => setSelectedEmp(emp)}
              className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4 mb-5">
                <div className="text-5xl">{emp.avatar || '👨‍💼'}</div>
                <div className="flex-1">
                  <p className="font-semibold text-white">{emp.name}</p>
                  <p className="text-xs text-slate-400">{emp.role}</p>
                  <span className={`inline-block mt-2 px-2 py-1 text-xs rounded-full font-medium ${emp.status === 'inactive' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {emp.status === 'inactive' ? 'Inactive' : 'Active'}
                  </span>
                </div>
                <div className="text-slate-500 text-xs">View →</div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-2 py-2 text-center">
                  <p className="text-lg font-bold text-orange-400">{stats.newCount}</p>
                  <p className="text-xs text-slate-500 mt-0.5">New</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-2 py-2 text-center">
                  <p className="text-lg font-bold text-blue-400">{stats.followingCount}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Active</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-2 text-center">
                  <p className="text-lg font-bold text-emerald-400">{stats.completedCount}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Enrolled</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700/50">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Total Leads</p>
                  <p className="text-2xl font-bold text-white">{stats.total}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Email</p>
                  <p className="text-xs text-slate-300 truncate">{emp.email}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Employee Detail Modal */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 backdrop-blur-sm" onClick={() => setSelectedEmp(null)}>
          <div
            className="w-full max-w-2xl h-full bg-slate-900 border-l border-slate-700 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-4xl">{selectedEmp.avatar || '👨‍💼'}</div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedEmp.name}</h3>
                  <p className="text-sm text-slate-400">{selectedEmp.role}</p>
                </div>
              </div>
              <button onClick={() => setSelectedEmp(null)} className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Profile Info */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-3">
                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Profile</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Full Name</p>
                    <p className="text-sm text-white font-medium">{selectedEmp.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Role</p>
                    <p className="text-sm text-white font-medium">{selectedEmp.role}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Email</p>
                    <p className="text-sm text-blue-400">{selectedEmp.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Phone</p>
                    <p className="text-sm text-white">{selectedEmp.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Status</p>
                    <span className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${selectedEmp.status === 'inactive' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {selectedEmp.status === 'inactive' ? 'Inactive' : 'Active'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">SLA Hours</p>
                    <p className="text-sm text-white">{selectedEmp.sla_hours || 4}h response target</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Commission Rate</p>
                    <p className="text-sm text-white">{selectedEmp.commission_rate || 5}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Monthly Target</p>
                    <p className="text-sm text-emerald-400">₹{((selectedEmp.target_monthly || 0) / 1000).toFixed(0)}K</p>
                  </div>
                </div>
              </div>

              {/* Lead Stats */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Lead Overview</h4>
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-slate-700/40 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-white">{detailStats.total}</p>
                    <p className="text-xs text-slate-400 mt-1">Total</p>
                  </div>
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-orange-400">{detailStats.newCount}</p>
                    <p className="text-xs text-slate-400 mt-1">New</p>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-400">{detailStats.followingCount}</p>
                    <p className="text-xs text-slate-400 mt-1">Active</p>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{detailStats.completedCount}</p>
                    <p className="text-xs text-slate-400 mt-1">Enrolled</p>
                  </div>
                </div>
                {detailStats.lostCount > 0 && (
                  <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Lost Leads</span>
                    <span className="text-sm font-bold text-red-400">{detailStats.lostCount}</span>
                  </div>
                )}
              </div>

              {/* Assigned Leads List */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                  Assigned Leads ({detailStats.total})
                </h4>
                {detailStats.all.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">No leads assigned yet</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {detailStats.all.map(lead => {
                      const stage = lead.pipeline_stage || lead.stage || 'new';
                      return (
                        <div key={lead.id} className="flex items-center justify-between bg-slate-700/30 hover:bg-slate-700/50 rounded-lg px-4 py-3 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{lead.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{lead.phone} {lead.course_interest ? `· ${lead.course_interest}` : ''}</p>
                          </div>
                          <div className="ml-3 flex items-center gap-2">
                            {lead.score != null && (
                              <span className="text-xs text-slate-400">{lead.score}</span>
                            )}
                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${STAGE_COLORS[stage] || STAGE_COLORS.new}`}>
                              {STAGE_LABELS[stage] || stage}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WhatsAppPage({ employees, currentUser }) {
  const BACKEND = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

  const [bCampaign, setBCampaign]         = useState('');
  const [bFilter, setBFilter]             = useState({ status: '', source: '' });
  const [bPreviewCount, setBPreviewCount] = useState(null);
  const [bSending, setBSending]           = useState(false);
  const [bResult, setBResult]             = useState(null);
  const [syncing, setSyncing]             = useState(false);
  const [syncResult, setSyncResult]       = useState(null);

  const fetchBroadcastPreview = async (filter) => {
    const f = filter || bFilter;
    const params = new URLSearchParams();
    if (f.status) params.set('status', f.status);
    if (f.source) params.set('source', f.source);
    try {
      const res = await fetch(`${BACKEND}/api/campaigns/preview?${params}`);
      const d = await res.json();
      setBPreviewCount(d.count ?? 0);
    } catch (e) {
      console.error('[BroadcastPreview]', e.message);
    }
  };

  useEffect(() => { fetchBroadcastPreview(); }, []);

  const handleSyncAiSensy = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${BACKEND}/api/leads/sync-aisensy`, { method: 'POST' });
      const d = await res.json();
      setSyncResult(res.ok ? { ok: true, ...d } : { ok: false, error: d.error });
    } catch (e) {
      setSyncResult({ ok: false, error: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!bCampaign.trim() || bSending) return;
    setBSending(true);
    setBResult(null);
    try {
      const res = await fetch(`${BACKEND}/api/campaigns/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ campaignName: bCampaign, filter: bFilter }),
      });
      const d = await res.json();
      setBResult(res.ok ? { ok: true, ...d } : { ok: false, error: d.error });
    } catch (e) {
      setBResult({ ok: false, error: e.message });
    } finally {
      setBSending(false);
    }
  };

  return (
    <div className="space-y-5 h-[calc(100vh-140px)] overflow-y-auto pr-1">

      {/* ── Header / AiSensy link ─────────────────────────────────────────── */}
      <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
              <Megaphone size={20} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">WhatsApp Broadcasts</h3>
              <p className="text-xs text-slate-400 mt-0.5">Send AiSensy template campaigns to your leads</p>
            </div>
          </div>
          <a
            href="https://app.aisensy.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-medium hover:bg-emerald-600/30 transition-all flex-shrink-0"
          >
            <MessageSquare size={12} />
            Open AiSensy Live Chat
          </a>
        </div>
        <p className="text-xs text-slate-500 mt-4 bg-slate-900/40 rounded-lg px-3 py-2.5">
          Live chat with leads is managed in AiSensy's inbox. Use this page to send broadcast campaigns to your leads via AiSensy templates.
        </p>
      </div>

      {/* ── Sync from AiSensy ─────────────────────────────────────────────── */}
      <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h4 className="font-medium text-white text-sm">Import Contacts from AiSensy</h4>
            <p className="text-xs text-slate-400 mt-0.5">Pull all AiSensy contacts and create them as leads in the CRM</p>
          </div>
          <button
            onClick={handleSyncAiSensy}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl text-white text-sm font-medium transition-all flex-shrink-0"
          >
            {syncing ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Syncing…</>
            ) : (
              <><Download size={14} />Sync Leads from AiSensy</>
            )}
          </button>
        </div>
        {syncResult && (
          <div className={`mt-3 px-3 py-2.5 rounded-lg text-xs font-medium ${syncResult.ok ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
            {syncResult.ok
              ? `✓ ${syncResult.message} (${syncResult.skipped} already existed)`
              : `✗ ${syncResult.error}`}
          </div>
        )}
      </div>

      {/* ── Broadcast form ────────────────────────────────────────────────── */}
      <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 space-y-5">
        <h4 className="font-medium text-white text-sm">Send Broadcast Campaign</h4>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            AiSensy Campaign Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={bCampaign}
            onChange={e => setBCampaign(e.target.value)}
            placeholder="e.g. pilot-training-jan-2026"
            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all"
          />
          <p className="text-xs text-slate-500 mt-1.5">Must match a campaign name configured in your AiSensy dashboard</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Filter by Status</label>
            <select
              value={bFilter.status}
              onChange={e => { const v = e.target.value; const next = { ...bFilter, status: v }; setBFilter(next); fetchBroadcastPreview(next); }}
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-all"
            >
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="assigned">Assigned</option>
              <option value="contacted">Contacted</option>
              <option value="interested">Interested</option>
              <option value="demo">Demo</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Filter by Source</label>
            <select
              value={bFilter.source}
              onChange={e => { const v = e.target.value; const next = { ...bFilter, source: v }; setBFilter(next); fetchBroadcastPreview(next); }}
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-all"
            >
              <option value="">All sources</option>
              <option value="Facebook Ad">Facebook Ad</option>
              <option value="Instagram Ad">Instagram Ad</option>
              <option value="WhatsApp Direct">WhatsApp Direct</option>
              <option value="Meta Lead Ad">Meta Lead Ad</option>
              <option value="Manual">Manual</option>
            </select>
          </div>
        </div>

        {bPreviewCount !== null && (
          <div className="flex items-center gap-3 p-3 bg-blue-600/10 border border-blue-500/30 rounded-xl">
            <Users size={16} className="text-blue-400 flex-shrink-0" />
            <p className="text-sm text-blue-300">
              <span className="font-bold text-white">{bPreviewCount}</span> lead{bPreviewCount !== 1 ? 's' : ''} match the filter and have a phone number
            </p>
          </div>
        )}

        {bResult && (
          <div className={`flex items-start gap-3 p-3 rounded-xl border ${bResult.ok ? 'bg-emerald-600/10 border-emerald-500/30' : 'bg-red-600/10 border-red-500/30'}`}>
            {bResult.ok
              ? <CheckCircle size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              : <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />}
            <div className="text-sm">
              {bResult.ok ? (
                <>
                  <p className="font-semibold text-emerald-300">Campaign sent!</p>
                  <p className="text-slate-400 mt-0.5">{bResult.sent} sent · {bResult.failed} failed · {bResult.total} total</p>
                </>
              ) : (
                <p className="text-red-300">{bResult.error}</p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleSendBroadcast}
          disabled={!bCampaign.trim() || bSending || bPreviewCount === 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl text-white font-semibold transition-all"
        >
          {bSending ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Megaphone size={16} />
              Send Broadcast{bPreviewCount !== null ? ` (${bPreviewCount} contacts)` : ''}
            </>
          )}
        </button>
      </div>

    </div>
  );
}

function MetaLeadsPage({ metaLeads: allMetaLeads, employees, onAssign, onAutoAssign, onSimulateNew, currentUser }) {
  const [filter, setFilter] = useState('all');
  const [assignDropdown, setAssignDropdown] = useState({});
  const [reassigning, setReassigning] = useState(new Set());
  const [assigningId, setAssigningId] = useState(null);
  const [assignError, setAssignError] = useState('');

  const isAdmin = currentUser?.isAdmin;
  const metaLeads = isAdmin ? allMetaLeads : allMetaLeads.filter(l => l.assignedTo === currentUser?.id);

  const unassignedCount = metaLeads.filter(l => !l.assignedTo).length;
  const assignedCount = metaLeads.length - unassignedCount;

  const filteredLeads = metaLeads.filter(l => {
    if (filter === 'unassigned') return !l.assignedTo;
    if (filter === 'assigned') return !!l.assignedTo;
    return true;
  });

  const handleAssign = async (leadId) => {
    const empId = assignDropdown[leadId];
    if (!empId) return;
    setAssigningId(leadId);
    setAssignError('');
    try {
      const result = await onAssign(leadId, empId);
      if (result?.ok) {
        setAssignDropdown(prev => ({ ...prev, [leadId]: '' }));
        setReassigning(prev => { const n = new Set(prev); n.delete(leadId); return n; });
      } else {
        setAssignError(result?.msg || 'Assignment failed. Please try again.');
      }
    } catch (e) {
      console.error('Unexpected assignment error:', e);
      setAssignError('Unexpected error. Please try again.');
    } finally {
      setAssigningId(null);
    }
  };

  const toggleReassign = (leadId) => {
    setReassigning(prev => {
      const n = new Set(prev);
      n.has(leadId) ? n.delete(leadId) : n.add(leadId);
      return n;
    });
  };

  const sourceBadge = (source = '') => {
    if (source.includes('FB') || source.includes('Facebook'))
      return 'bg-blue-600/20 text-blue-400 border border-blue-500/30';
    if (source.includes('IG') || source.includes('Instagram'))
      return 'bg-pink-600/20 text-pink-400 border border-pink-500/30';
    return 'bg-slate-700/50 text-slate-300 border border-slate-600/50';
  };

  const employeeQueue = employees
    .map(emp => ({ ...emp, queueCount: allMetaLeads.filter(l => l.assignedTo === emp.id).length }))
    .sort((a, b) => b.queueCount - a.queueCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Meta Ads Leads</h2>
            {unassignedCount > 0 && (
              <span className="px-2.5 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full text-sm font-semibold">
                {unassignedCount} unassigned
              </span>
            )}
          </div>
          <p className="text-slate-400 text-xs sm:text-sm">
            Leads captured via WhatsApp from Meta Ad campaigns → auto-queued for assignment
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onSimulateNew}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/30 rounded-lg text-purple-400 font-medium transition-all text-xs sm:text-sm"
            >
              <Zap size={14} />
              <span className="hidden xs:inline">Simulate </span>Incoming Lead
            </button>
            <button
              onClick={onAutoAssign}
              disabled={unassignedCount === 0}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-lg text-white font-medium transition-all text-xs sm:text-sm"
            >
              <Shuffle size={14} />
              Auto-Assign ({unassignedCount})
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Captured', value: metaLeads.length, border: 'border-slate-700/50', text: 'text-white' },
          { label: 'Unassigned', value: unassignedCount, border: 'border-orange-500/20', text: 'text-orange-400' },
          { label: 'Assigned', value: assignedCount, border: 'border-emerald-500/20', text: 'text-emerald-400' },
          { label: 'Assignment Rate', value: `${metaLeads.length ? Math.round((assignedCount / metaLeads.length) * 100) : 0}%`, border: 'border-blue-500/20', text: 'text-blue-400' },
        ].map((s, i) => (
          <div key={i} className={`backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border ${s.border} rounded-xl p-4`}>
            <p className="text-slate-400 text-xs mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.text}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Lead Queue */}
        <div className="xl:col-span-3 space-y-4">
          {/* Error banner */}
          {assignError && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
              <AlertCircle size={14} />
              {assignError}
              <button onClick={() => setAssignError('')} className="ml-auto text-red-400 hover:text-red-300"><X size={14} /></button>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {[
              { key: 'all', label: `All (${metaLeads.length})` },
              { key: 'unassigned', label: `Unassigned (${unassignedCount})` },
              { key: 'assigned', label: `Assigned (${assignedCount})` },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all text-xs sm:text-sm whitespace-nowrap flex-shrink-0 ${
                  filter === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredLeads.length === 0 ? (
            <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-16 text-center">
              <Target size={40} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No leads in this category</p>
              <p className="text-slate-500 text-sm mt-1">Click "Simulate Incoming Lead" to test the flow</p>
            </div>
          ) : (
            filteredLeads.map(lead => {
              const assignedEmp = employees.find(e => e.id === lead.assignedTo);
              const isReassigning = reassigning.has(lead.id);
              const showAssignPanel = !lead.assignedTo || isReassigning;

              return (
                <div
                  key={lead.id}
                  className={`backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border rounded-xl p-5 transition-all duration-300 ${
                    showAssignPanel ? 'border-orange-500/30 hover:border-orange-500/50' : 'border-slate-700/50 hover:border-emerald-500/20'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                    {/* Lead Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h4 className="text-sm sm:text-base font-semibold text-white">{lead.name}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${sourceBadge(lead.source)}`}>
                          {lead.source}
                        </span>
                        {!lead.assignedTo && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            NEW
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-400 mb-3 flex-wrap">
                        <span className="flex items-center gap-1.5"><Phone size={12} />{lead.phone}</span>
                        <span className="flex items-center gap-1.5"><Clock size={12} />{lead.receivedAt}</span>
                        {lead.course && <span className="flex items-center gap-1.5"><Briefcase size={12} />{lead.course}</span>}
                      </div>

                      {/* WhatsApp message preview */}
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2 mb-2">
                        <span className="text-emerald-400 text-xs font-medium">WhatsApp: </span>
                        <span className="text-slate-300 text-xs sm:text-sm">"{lead.message}"</span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1"><Target size={11} />{lead.adName}</span>
                        <span>• {lead.campaign}</span>
                      </div>
                    </div>

                    {/* Assignment Panel */}
                    <div className="w-full sm:w-44 flex-shrink-0">
                      {assignedEmp && !isReassigning ? (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                          <p className="text-xs text-emerald-400 mb-2 font-medium flex items-center gap-1">
                            <UserCheck size={12} /> Assigned
                          </p>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">{assignedEmp.avatar}</span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{assignedEmp.name}</p>
                              <p className="text-xs text-slate-400">{assignedEmp.role}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleReassign(lead.id)}
                            className="w-full px-2 py-1.5 text-xs bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-all"
                          >
                            Reassign
                          </button>
                        </div>
                      ) : (
                        <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3">
                          <p className="text-xs text-orange-400 mb-2 font-medium">
                            {isReassigning ? 'Reassign Lead' : 'Assign Lead'}
                          </p>
                          <select
                            value={assignDropdown[lead.id] || ''}
                            onChange={e => setAssignDropdown(prev => ({ ...prev, [lead.id]: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white mb-2 focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Select employee</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleAssign(lead.id)}
                              disabled={!assignDropdown[lead.id] || assigningId === lead.id}
                              className="flex-1 px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-all font-medium flex items-center justify-center gap-1"
                            >
                              <UserCheck size={11} /> {assigningId === lead.id ? 'Saving…' : 'Assign'}
                            </button>
                            {isReassigning && (
                              <button
                                onClick={() => toggleReassign(lead.id)}
                                className="px-2 py-1.5 text-xs bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-all"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Employee Queue Summary */}
        <div className="xl:col-span-1">
          <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-4 sticky top-4">
            <h3 className="font-semibold text-white mb-4 text-sm">Employee Queue</h3>
            <div className="space-y-3">
              {employeeQueue.map(emp => (
                <div key={emp.id} className="flex items-center gap-2">
                  <span className="text-xl">{emp.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{emp.name}</p>
                    <div className="h-1.5 bg-slate-700/50 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-500"
                        style={{ width: metaLeads.length ? `${Math.min((emp.queueCount / metaLeads.length) * 100, 100)}%` : '0%' }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-bold text-white w-4 text-right">{emp.queueCount}</span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

const AUTOMATION_DEFAULTS = [
  { id: 'a1', name: 'Daily Lead Import',   trigger: 'daily_8am',          action: 'auto_assign_leads',   status: 'active', last_run: null },
  { id: 'a2', name: 'Hot Lead Alert',      trigger: 'on_lead_created',    action: 'flag_hot_leads',      status: 'active', last_run: null },
  { id: 'a3', name: 'Follow-up Reminder', trigger: 'after_24h_inactive', action: 'send_followup_alert', status: 'active', last_run: null },
];

function loadAutomations() {
  try {
    const raw = localStorage.getItem('skyhost_automations');
    if (raw) return JSON.parse(raw);
  } catch {}
  return AUTOMATION_DEFAULTS;
}

function saveAutomations(list) {
  localStorage.setItem('skyhost_automations', JSON.stringify(list));
}

function AutomationsPage() {
  const TRIGGER_LABELS = {
    daily_8am:          'Daily 8:00 AM',
    on_lead_created:    'On Lead Created',
    after_24h_inactive: 'After 24h Inactive',
    on_stage_change:    'On Stage Change',
    weekly_monday:      'Weekly (Mon 9 AM)',
  };
  const ACTION_LABELS = {
    auto_assign_leads:   'Auto-Assign Leads',
    flag_hot_leads:      'Flag Hot Leads',
    send_followup_alert: 'Send Follow-up Alert',
    score_all_leads:     'Re-score All Leads',
    generate_report:     'Generate Weekly Report',
  };

  const [automations, setAutomations] = React.useState(loadAutomations);
  const [running, setRunning]         = React.useState(null);
  const [showModal, setShowModal]     = React.useState(false);
  const [form, setForm]               = React.useState({ name: '', trigger: 'daily_8am', action: 'auto_assign_leads' });

  function persist(next) {
    setAutomations(next);
    saveAutomations(next);
  }

  function toggleStatus(auto) {
    const next = auto.status === 'active' ? 'paused' : 'active';
    persist(automations.map(a => a.id === auto.id ? { ...a, status: next } : a));
  }

  function runNow(auto) {
    setRunning(auto.id);
    setTimeout(() => {
      persist(automations.map(a => a.id === auto.id ? { ...a, last_run: new Date().toISOString() } : a));
      setRunning(null);
    }, 800);
  }

  function deleteAuto(id) {
    persist(automations.filter(a => a.id !== id));
  }

  function createAuto() {
    if (!form.name.trim()) return;
    const item = {
      id:       `a${Date.now()}`,
      name:     form.name.trim(),
      trigger:  form.trigger,
      action:   form.action,
      status:   'active',
      last_run: null,
    };
    persist([...automations, item]);
    setShowModal(false);
    setForm({ name: '', trigger: 'daily_8am', action: 'auto_assign_leads' });
  }

  function formatLastRun(ts) {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Automations</h2>
          <p className="text-sm text-slate-400 mt-1">{automations.filter(a => a.status === 'active').length} active workflows</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-lg text-white font-medium transition-all"
        >
          <Plus size={18} />
          New Workflow
        </button>
      </div>

      {automations.length === 0 ? (
        <div className="text-center text-slate-500 py-16">
          <Zap size={40} className="mx-auto mb-3 opacity-30" />
          <p>No automations yet. Click "+ New Workflow" to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {automations.map(auto => (
            <div
              key={auto.id}
              className={`backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border rounded-xl p-6 transition-all ${
                auto.status === 'active' ? 'border-slate-700/50' : 'border-slate-700/30 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="text-base font-semibold text-white truncate">{auto.name}</h4>
                    <span className={`shrink-0 inline-block px-2 py-0.5 text-xs rounded-full font-semibold ${
                      auto.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-600/40 text-slate-400'
                    }`}>
                      {auto.status === 'active' ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                    <span>Trigger: <span className="text-slate-300">{TRIGGER_LABELS[auto.trigger] || auto.trigger}</span></span>
                    <span>Action: <span className="text-blue-400">{ACTION_LABELS[auto.action] || auto.action}</span></span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
                    <span>Last run: {formatLastRun(auto.last_run)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => runNow(auto)}
                    disabled={running === auto.id}
                    className="px-3 py-1.5 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-all disabled:opacity-50"
                  >
                    {running === auto.id ? '…' : '▶ Run'}
                  </button>
                  <button
                    onClick={() => toggleStatus(auto)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                      auto.status === 'active'
                        ? 'bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400'
                        : 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400'
                    }`}
                  >
                    {auto.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => deleteAuto(auto.id)}
                    className="px-3 py-1.5 text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="backdrop-blur-lg bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-5">New Workflow</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g. Weekly Score Refresh"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && createAuto()}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Trigger</label>
                <select
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  value={form.trigger}
                  onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}
                >
                  {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Action</label>
                <select
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  value={form.action}
                  onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
                >
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setForm({ name: '', trigger: 'daily_8am', action: 'auto_assign_leads' }); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={createAuto}
                disabled={!form.name.trim()}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportsPage({ data }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Reports & Analytics</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="font-semibold text-white mb-4">Revenue Trend</h3>
          <div className="h-40 bg-slate-700/20 rounded-lg flex items-end justify-around gap-2 p-4">
            {[45, 52, 48, 65, 72, 68, 81].map((val, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-blue-600 to-cyan-600 rounded-t-lg transition-all hover:from-blue-700 hover:to-cyan-700"
                style={{height: `${(val/100)*100}%`}}
                title={`₹${val}K`}
              ></div>
            ))}
          </div>
        </div>

        <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="font-semibold text-white mb-4">Conversion Rate</h3>
          <div className="space-y-3">
            {[
              { stage: 'New', rate: 65, color: 'bg-blue-600' },
              { stage: 'Contacted', rate: 45, color: 'bg-cyan-600' },
              { stage: 'Interested', rate: 72, color: 'bg-purple-600' },
              { stage: 'Demo', rate: 88, color: 'bg-emerald-600' },
            ].map((item, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300">{item.stage}</span>
                  <span className="text-white font-semibold">{item.rate}%</span>
                </div>
                <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  <div className={`h-full ${item.color}`} style={{width: `${item.rate}%`}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ currentUser, isAdmin, onEmployeeCreated }) {
  const ROLES = ['Admin', 'Manager', 'Telecaller'];
  const AVATARS = ['👨‍💼', '👩‍💼', '🧑‍💼', '👨‍✈️', '👩‍✈️'];

  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'Telecaller', password: '', avatar: '👨‍💼' });
  const [showPass, setShowPass] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const handleField = (k, v) => { setForm(f => ({ ...f, [k]: v })); setCreateError(''); setCreateSuccess(''); };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    if (form.password.length < 4) { setCreateError('Password must be at least 4 characters'); return; }
    if (!form.phone.trim()) { setCreateError('Phone number is required'); return; }
    setCreating(true);
    setCreateError('');
    setCreateSuccess('');

    const { error } = await supabase.from('employees').insert({
      name: form.name.trim(),
      email: form.email.toLowerCase().trim(),
      phone: form.phone.trim(),
      password: form.password,
      role: form.role,
      avatar: form.avatar,
      status: 'active',
    });

    setCreating(false);
    if (error) {
      setCreateError(error.message.includes('unique') ? 'An employee with this email already exists.' : error.message);
    } else {
      setCreateSuccess(`Employee "${form.name}" created. They can log in with ${form.email}.`);
      setForm({ name: '', email: '', phone: '', role: 'Telecaller', password: '', avatar: '👨‍💼' });
      onEmployeeCreated();
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Settings</h2>

      {/* Profile card */}
      <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-white">My Account</h3>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Name</label>
          <input
            type="text"
            defaultValue={currentUser.name}
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
          <input
            type="email"
            defaultValue={currentUser.email}
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-all"
          />
        </div>
        <button className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-lg text-white font-medium transition-all">
          Save Changes
        </button>
      </div>

      {/* Admin: Create Employee */}
      {isAdmin && (
        <div className="backdrop-blur-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <UserCheck size={18} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Create Employee Account</h3>
              <p className="text-xs text-slate-400 mt-0.5">New employee will be able to log in with the credentials you set</p>
            </div>
          </div>

          <form onSubmit={handleCreateEmployee} className="space-y-4">
            {/* Avatar picker */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Avatar</label>
              <div className="flex gap-2">
                {AVATARS.map(av => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => handleField('avatar', av)}
                    className={`text-2xl w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                      form.avatar === av
                        ? 'bg-blue-600/30 border-2 border-blue-500'
                        : 'bg-slate-800 border border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={e => handleField('name', e.target.value)}
                  placeholder="e.g. Kavya Nair"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                <select
                  value={form.role}
                  onChange={e => handleField('role', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-all text-sm"
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Login Email</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={e => handleField('email', e.target.value)}
                    placeholder="employee@skyhost.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number</label>
                <input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={e => handleField('phone', e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Login Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  required
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => handleField('password', e.target.value)}
                  placeholder="Min. 4 characters"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-10 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {createError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle size={14} />
                {createError}
              </div>
            )}
            {createSuccess && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <CheckCircle size={14} />
                {createSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={creating}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              {creating ? 'Creating…' : 'Create Employee'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
