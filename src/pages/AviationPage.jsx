import React, { useState, useEffect } from 'react';
import { Plane, FileText, Calendar, Users, CheckCircle, AlertCircle, Plus, RefreshCw, ChevronDown, X } from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const COURSES = ['PPL','CPL','ATPL','IR','ME','Diploma','Ground School'];

const DOC_TYPES = {
  medical_class1: { label: 'Medical Class 1', required: true },
  medical_class2: { label: 'Medical Class 2', required: false },
  id_proof:       { label: 'ID Proof', required: true },
  education:      { label: 'Education Certificate', required: true },
  dgca_student:   { label: 'DGCA Student Registration', required: true },
  dgca_exam:      { label: 'DGCA Exam Result', required: false },
  logbook:        { label: 'Logbook', required: false },
  passport:       { label: 'Passport', required: false },
  others:         { label: 'Others', required: false },
};

const MEDICAL_STATUSES = ['pending','cleared','failed','expired','not_required'];
const DGCA_STAGES      = ['not_started','applied','exam_pending','exam_passed','license_pending','licensed'];

const DOC_STATUS_COLORS = {
  pending:   'bg-slate-700 text-slate-300',
  submitted: 'bg-blue-500/20 text-blue-300',
  verified:  'bg-green-500/20 text-green-300',
  rejected:  'bg-red-500/20 text-red-300',
  expired:   'bg-orange-500/20 text-orange-300',
};

function DocStatusBadge({ status }) {
  return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${DOC_STATUS_COLORS[status] || DOC_STATUS_COLORS.pending}`}>{status}</span>;
}

export default function AviationPage({ currentUser }) {
  const [activeTab, setActiveTab]   = useState('pipeline');
  const [leads, setLeads]           = useState([]);
  const [batches, setBatches]       = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [dgcaStats, setDgcaStats]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filterCourse, setFilterCourse] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadDocs, setLeadDocs]         = useState(null);
  const [showBatchForm, setShowBatchForm]   = useState(false);
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [showDocForm, setShowDocForm]           = useState(false);
  const [employees, setEmployees] = useState([]);

  const [batchForm, setBatchForm]   = useState({ name:'', course:'PPL', startDate:'', endDate:'', capacity:20, instructor:'', location:'Hyderabad', fees:'' });
  const [intForm, setIntForm]       = useState({ leadId:'', conductedBy:'', scheduledAt:'', notes:'' });
  const [docForm, setDocForm]       = useState({ leadId:'', type:'medical_class1', name:'', url:'', expiryDate:'', notes:'' });

  useEffect(() => {
    fetchAll();
    fetch(`${BACKEND}/api/employees`).then(r => r.json()).then(d => setEmployees(Array.isArray(d) ? d : [])).catch(() => {});
  }, [filterCourse]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = filterCourse ? `?course=${filterCourse}` : '';
      const [leadsRes, batchRes, intRes, dgcaRes] = await Promise.all([
        fetch(`${BACKEND}/api/aviation/pipeline${params}`),
        fetch(`${BACKEND}/api/aviation/batches`),
        fetch(`${BACKEND}/api/aviation/interviews`),
        fetch(`${BACKEND}/api/aviation/dgca-progress`),
      ]);
      const [leadsD, batchD, intD, dgcaD] = await Promise.all([leadsRes.json(), batchRes.json(), intRes.json(), dgcaRes.json()]);
      setLeads(leadsD.leads || []);
      setBatches(Array.isArray(batchD) ? batchD : []);
      setInterviews(Array.isArray(intD) ? intD : []);
      setDgcaStats(Array.isArray(dgcaD) ? dgcaD : []);
    } catch (e) {
      console.error('[Aviation]', e.message);
    }
    setLoading(false);
  };

  const loadLeadDocs = async (leadId) => {
    const res = await fetch(`${BACKEND}/api/aviation/documents/${leadId}`);
    const d   = await res.json();
    setLeadDocs(d);
  };

  const openLeadDetail = async (lead) => {
    setSelectedLead(lead);
    await loadLeadDocs(lead.id);
  };

  const handleUpdateDoc = async (docId, status) => {
    await fetch(`${BACKEND}/api/aviation/documents/${docId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status, verifiedBy: currentUser?.id }),
    });
    if (selectedLead) await loadLeadDocs(selectedLead.id);
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    await fetch(`${BACKEND}/api/aviation/batches`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: batchForm.name, course: batchForm.course, startDate: batchForm.startDate, endDate: batchForm.endDate, capacity: parseInt(batchForm.capacity), instructor: batchForm.instructor, location: batchForm.location, fees: batchForm.fees ? parseFloat(batchForm.fees) : null }),
    });
    setShowBatchForm(false);
    setBatchForm({ name:'', course:'PPL', startDate:'', endDate:'', capacity:20, instructor:'', location:'Hyderabad', fees:'' });
    fetchAll();
  };

  const handleScheduleInterview = async (e) => {
    e.preventDefault();
    await fetch(`${BACKEND}/api/aviation/interviews`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: intForm.leadId, conductedBy: intForm.conductedBy, scheduledAt: intForm.scheduledAt, notes: intForm.notes }),
    });
    setShowInterviewForm(false);
    setIntForm({ leadId:'', conductedBy:'', scheduledAt:'', notes:'' });
    fetchAll();
  };

  const handleAddDoc = async (e) => {
    e.preventDefault();
    await fetch(`${BACKEND}/api/aviation/documents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: docForm.leadId, type: docForm.type, name: docForm.name, url: docForm.url, expiryDate: docForm.expiryDate, notes: docForm.notes }),
    });
    setShowDocForm(false);
    setDocForm({ leadId:'', type:'medical_class1', name:'', url:'', expiryDate:'', notes:'' });
    if (selectedLead && docForm.leadId === selectedLead.id) await loadLeadDocs(selectedLead.id);
  };

  const handleUpdateAviationLead = async (leadId, field, value) => {
    await fetch(`${BACKEND}/api/aviation/leads/${leadId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, [field]: value } : l));
    if (selectedLead?.id === leadId) setSelectedLead(prev => ({ ...prev, [field]: value }));
  };

  const medicalColor = (s) => ({
    cleared: 'text-green-400', failed: 'text-red-400', expired: 'text-orange-400', pending: 'text-yellow-400', not_required: 'text-slate-400',
  }[s] || 'text-slate-400');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Plane size={24} /> Aviation Operations</h1>
          <p className="text-slate-400 text-sm mt-0.5">PPL · CPL · ATPL · Documents · DGCA · Batches · Interviews</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
          >
            <option value="">All Courses</option>
            {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setShowInterviewForm(true)} className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm transition-all">
            <Calendar size={14} /> Schedule Interview
          </button>
          <button onClick={() => setShowBatchForm(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-all">
            <Plus size={14} /> New Batch
          </button>
          <button onClick={fetchAll} className="p-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-400' : 'text-slate-400'} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {['pipeline','batches','interviews','dgca'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'dgca' ? 'DGCA Progress' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw size={24} className="animate-spin text-blue-400" /></div>
      ) : (
        <>
          {/* Pipeline Tab */}
          {activeTab === 'pipeline' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-800">
                    <th className="text-left pb-3 pl-2">Lead</th>
                    <th className="text-left pb-3">Course</th>
                    <th className="text-left pb-3">Stage</th>
                    <th className="text-left pb-3">Medical</th>
                    <th className="text-left pb-3">DGCA</th>
                    <th className="text-left pb-3">Fees</th>
                    <th className="text-left pb-3">Agent</th>
                    <th className="text-left pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {leads.map(lead => (
                    <tr key={lead.id} className="hover:bg-slate-800/30 transition-all">
                      <td className="py-3 pl-2">
                        <p className="font-medium text-white">{lead.name}</p>
                        <p className="text-xs text-slate-500">{lead.phone}</p>
                      </td>
                      <td className="py-3">
                        <select
                          value={lead.course_interest || lead.course || ''}
                          onChange={e => handleUpdateAviationLead(lead.id, 'course_interest', e.target.value)}
                          className="bg-transparent text-blue-400 text-xs focus:outline-none cursor-pointer"
                        >
                          <option value="">— Select —</option>
                          {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded-full capitalize">{lead.pipeline_stage || 'new'}</span>
                      </td>
                      <td className="py-3">
                        <select
                          value={lead.medical_status || 'pending'}
                          onChange={e => handleUpdateAviationLead(lead.id, 'medical_status', e.target.value)}
                          className={`bg-transparent text-xs focus:outline-none cursor-pointer ${medicalColor(lead.medical_status)}`}
                        >
                          {MEDICAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="py-3">
                        <select
                          value={lead.dgca_stage || 'not_started'}
                          onChange={e => handleUpdateAviationLead(lead.id, 'dgca_stage', e.target.value)}
                          className="bg-transparent text-slate-300 text-xs focus:outline-none cursor-pointer"
                        >
                          {DGCA_STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                        </select>
                      </td>
                      <td className="py-3 text-green-400 font-medium">
                        {lead.total_fees ? `₹${Number(lead.total_fees).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="py-3 text-slate-400 text-xs">{lead.employees?.name?.split(' ')[0] || '—'}</td>
                      <td className="py-3">
                        <button
                          onClick={() => openLeadDetail(lead)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-all"
                        >
                          Docs
                        </button>
                      </td>
                    </tr>
                  ))}
                  {leads.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-slate-500">No aviation leads found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Batches Tab */}
          {activeTab === 'batches' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {batches.map(batch => (
                <div key={batch.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-white">{batch.name}</p>
                      <span className="inline-block px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded-full mt-1">{batch.course}</span>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      batch.status === 'active' ? 'bg-green-500/20 text-green-300' :
                      batch.status === 'completed' ? 'bg-slate-700 text-slate-400' :
                      'bg-yellow-500/20 text-yellow-300'
                    }`}>{batch.status}</span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    {batch.instructor && <p className="text-slate-400">Instructor: <span className="text-white">{batch.instructor}</span></p>}
                    {batch.start_date && <p className="text-slate-400">Starts: <span className="text-white">{new Date(batch.start_date).toLocaleDateString('en-IN')}</span></p>}
                    {batch.location && <p className="text-slate-400">Location: <span className="text-white">{batch.location}</span></p>}
                    {batch.fees && <p className="text-slate-400">Fees: <span className="text-green-400 font-medium">₹{Number(batch.fees).toLocaleString('en-IN')}</span></p>}
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Enrolled</span>
                      <span>{batch.enrolledCount || 0} / {batch.capacity}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-blue-500"
                        style={{ width: `${Math.min(100, ((batch.enrolledCount || 0) / batch.capacity) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{batch.spotsLeft || 0} spots left</p>
                  </div>
                </div>
              ))}
              {batches.length === 0 && (
                <div className="col-span-3 text-center py-12 text-slate-500">
                  <p>No batches yet.</p>
                  <button onClick={() => setShowBatchForm(true)} className="mt-2 text-blue-400 text-sm underline">Create first batch</button>
                </div>
              )}
            </div>
          )}

          {/* Interviews Tab */}
          {activeTab === 'interviews' && (
            <div className="space-y-2">
              {interviews.map(interview => (
                <div key={interview.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                  <div className="text-2xl">{interview.employees?.avatar || '👤'}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white">{interview.leads?.name}</p>
                    <p className="text-sm text-slate-400">{interview.leads?.phone} · {interview.leads?.course_interest}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">{new Date(interview.scheduled_at).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</p>
                    <p className="text-xs text-slate-500">{interview.employees?.name}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    interview.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                    interview.status === 'cancelled' ? 'bg-red-500/20 text-red-300' :
                    'bg-blue-500/20 text-blue-300'
                  }`}>{interview.status}</span>
                  {interview.outcome && (
                    <span className={`px-2 py-0.5 text-xs rounded-full ${interview.outcome === 'passed' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                      {interview.outcome}
                    </span>
                  )}
                </div>
              ))}
              {interviews.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Calendar size={32} className="mx-auto mb-2" />
                  <p>No interviews scheduled.</p>
                </div>
              )}
            </div>
          )}

          {/* DGCA Progress Tab */}
          {activeTab === 'dgca' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {dgcaStats.map(stat => {
                const labels = { not_started:'Not Started', applied:'Applied', exam_pending:'Exam Pending', exam_passed:'Exam Passed', license_pending:'License Pending', licensed:'Licensed' };
                const colors = { not_started:'slate', applied:'blue', exam_pending:'yellow', exam_passed:'cyan', license_pending:'orange', licensed:'green' };
                const c = colors[stat.stage] || 'slate';
                const colorMap = { slate:'text-slate-300 bg-slate-500/10 border-slate-500/20', blue:'text-blue-300 bg-blue-500/10 border-blue-500/20', yellow:'text-yellow-300 bg-yellow-500/10 border-yellow-500/20', cyan:'text-cyan-300 bg-cyan-500/10 border-cyan-500/20', orange:'text-orange-300 bg-orange-500/10 border-orange-500/20', green:'text-green-300 bg-green-500/10 border-green-500/20' };
                return (
                  <div key={stat.stage} className={`border rounded-xl p-4 ${colorMap[c]}`}>
                    <p className="text-3xl font-bold">{stat.count}</p>
                    <p className="text-sm mt-1">{labels[stat.stage] || stat.stage}</p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Lead Documents Side Panel */}
      {selectedLead && leadDocs && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-end z-50">
          <div className="bg-slate-900 border-l border-slate-700 w-full max-w-lg h-full overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedLead.name}</h3>
                <p className="text-sm text-slate-400">{selectedLead.phone} · {selectedLead.course_interest || selectedLead.course || 'No course'}</p>
              </div>
              <button onClick={() => { setSelectedLead(null); setLeadDocs(null); }} className="p-2 hover:bg-slate-800 rounded-lg transition-all">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* Document completeness */}
            <div className="bg-slate-800 rounded-xl p-4 mb-5">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm text-slate-300 font-medium">Document Completeness</p>
                <span className={`text-lg font-bold ${leadDocs.completeness >= 100 ? 'text-green-400' : leadDocs.completeness >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {leadDocs.completeness}%
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className={`h-2 rounded-full ${leadDocs.completeness >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${leadDocs.completeness}%` }} />
              </div>
              {leadDocs.missing?.length > 0 && (
                <p className="text-xs text-red-400 mt-2">Missing: {leadDocs.missing.map(m => DOC_TYPES[m]?.label).join(', ')}</p>
              )}
            </div>

            {/* Add document button */}
            <button
              onClick={() => { setShowDocForm(true); setDocForm(p => ({ ...p, leadId: selectedLead.id })); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm mb-4 transition-all"
            >
              <Plus size={14} /> Add Document
            </button>

            {/* Documents list */}
            <div className="space-y-2">
              {(leadDocs.documents || []).map(doc => (
                <div key={doc.id} className="bg-slate-800 rounded-xl p-3 flex items-center gap-3">
                  <FileText size={16} className="text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{doc.name}</p>
                    <p className="text-xs text-slate-500">{DOC_TYPES[doc.type]?.label || doc.type}</p>
                    {doc.expiry_date && <p className="text-xs text-orange-400">Expires: {new Date(doc.expiry_date).toLocaleDateString('en-IN')}</p>}
                  </div>
                  <DocStatusBadge status={doc.status} />
                  {doc.status === 'submitted' && currentUser?.isAdmin && (
                    <div className="flex gap-1">
                      <button onClick={() => handleUpdateDoc(doc.id, 'verified')} className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-lg hover:bg-green-500/30 transition-all">✓</button>
                      <button onClick={() => handleUpdateDoc(doc.id, 'rejected')} className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-lg hover:bg-red-500/30 transition-all">✗</button>
                    </div>
                  )}
                </div>
              ))}
              {(leadDocs.documents || []).length === 0 && (
                <p className="text-center text-slate-500 text-sm py-4">No documents added yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch Form Modal */}
      {showBatchForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-5">Create Batch</h3>
            <form onSubmit={handleCreateBatch} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Batch Name *</label>
                  <input required value={batchForm.name} onChange={e => setBatchForm(p=>({...p,name:e.target.value}))} placeholder="PPL Batch Jan 2026" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Course *</label>
                  <select required value={batchForm.course} onChange={e => setBatchForm(p=>({...p,course:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
                    {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                  <input type="date" value={batchForm.startDate} onChange={e => setBatchForm(p=>({...p,startDate:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Capacity</label>
                  <input type="number" value={batchForm.capacity} onChange={e => setBatchForm(p=>({...p,capacity:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Instructor</label>
                  <input value={batchForm.instructor} onChange={e => setBatchForm(p=>({...p,instructor:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fees (₹)</label>
                  <input type="number" value={batchForm.fees} onChange={e => setBatchForm(p=>({...p,fees:e.target.value}))} placeholder="350000" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowBatchForm(false)} className="flex-1 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm hover:bg-slate-700 transition-all">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-all">Create Batch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interview Form Modal */}
      {showInterviewForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-5">Schedule Interview</h3>
            <form onSubmit={handleScheduleInterview} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Lead *</label>
                <select required value={intForm.leadId} onChange={e => setIntForm(p=>({...p,leadId:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
                  <option value="">Select lead...</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.name} — {l.phone}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Conducted By</label>
                <select value={intForm.conductedBy} onChange={e => setIntForm(p=>({...p,conductedBy:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
                  <option value="">Select employee...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Date & Time *</label>
                <input required type="datetime-local" value={intForm.scheduledAt} onChange={e => setIntForm(p=>({...p,scheduledAt:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes</label>
                <textarea value={intForm.notes} onChange={e => setIntForm(p=>({...p,notes:e.target.value}))} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowInterviewForm(false)} className="flex-1 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm hover:bg-slate-700 transition-all">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm font-medium transition-all">Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showDocForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-5">Add Document</h3>
            <form onSubmit={handleAddDoc} className="space-y-3">
              {!docForm.leadId && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Lead *</label>
                  <select required value={docForm.leadId} onChange={e => setDocForm(p=>({...p,leadId:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
                    <option value="">Select lead...</option>
                    {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Document Type *</label>
                <select required value={docForm.type} onChange={e => setDocForm(p=>({...p,type:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
                  {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}{v.required ? ' *' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Document Name *</label>
                <input required value={docForm.name} onChange={e => setDocForm(p=>({...p,name:e.target.value}))} placeholder="Medical Certificate Class 1" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">URL / Link</label>
                  <input value={docForm.url} onChange={e => setDocForm(p=>({...p,url:e.target.value}))} placeholder="https://..." className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Expiry Date</label>
                  <input type="date" value={docForm.expiryDate} onChange={e => setDocForm(p=>({...p,expiryDate:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowDocForm(false)} className="flex-1 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm hover:bg-slate-700 transition-all">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-all">Add Document</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
