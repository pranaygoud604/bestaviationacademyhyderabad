const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');

const COURSES = ['PPL','CPL','ATPL','IR','ME','Diploma','Ground School'];

// GET /api/aviation/pipeline — leads filtered by course with aviation info
router.get('/pipeline', async (req, res) => {
  const { course, stage, medicalStatus, dgcaStage } = req.query;

  let q = supabase
    .from('leads')
    .select(`
      id,name,phone,email,source,score,pipeline_stage,conversion_probability,
      course,course_interest,medical_status,dgca_stage,batch_id,interview_date,
      total_fees,paid_amount,assigned_to,follow_up_date,created_at,
      employees!assigned_to(id,name,avatar),
      batches!batch_id(id,name,course,start_date,status)
    `)
    .not('pipeline_stage', 'eq', 'lost')
    .order('score', { ascending: false });

  if (course)        q = q.eq('course_interest', course).or(`course.eq.${course}`);
  if (stage)         q = q.eq('pipeline_stage', stage);
  if (medicalStatus) q = q.eq('medical_status', medicalStatus);
  if (dgcaStage)     q = q.eq('dgca_stage', dgcaStage);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // Group by course
  const byCourse = {};
  for (const course of COURSES) byCourse[course] = [];

  for (const lead of data || []) {
    const c = lead.course_interest || lead.course || 'Unknown';
    if (byCourse[c]) byCourse[c].push(lead);
    else byCourse['Unknown'] = [...(byCourse['Unknown'] || []), lead];
  }

  res.json({ leads: data || [], byCourse });
});

// GET /api/aviation/documents/:leadId — documents for a lead
router.get('/documents/:leadId', async (req, res) => {
  const { data, error } = await supabase
    .from('aviation_documents')
    .select('*, employees!verified_by(id,name)')
    .eq('lead_id', req.params.leadId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Check completeness
  const required = ['medical_class1','id_proof','education','dgca_student'];
  const submitted = new Set((data || []).filter(d => d.status !== 'pending').map(d => d.type));
  const verified  = new Set((data || []).filter(d => d.status === 'verified').map(d => d.type));
  const missing   = required.filter(r => !submitted.has(r));

  res.json({
    documents: data || [],
    completeness: Math.round((verified.size / required.length) * 100),
    missing,
    allVerified: missing.length === 0,
  });
});

// POST /api/aviation/documents — add document record
router.post('/documents', async (req, res) => {
  const { leadId, type, name, url, expiryDate, notes } = req.body;
  if (!leadId || !type || !name) {
    return res.status(400).json({ error: 'leadId, type, name required' });
  }

  const { data, error } = await supabase
    .from('aviation_documents')
    .insert({
      lead_id:     leadId,
      type,
      name,
      url:         url         || null,
      expiry_date: expiryDate  || null,
      notes:       notes       || null,
      status:      'submitted',
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from('lead_activities').insert({
    lead_id:     leadId,
    type:        'document_submitted',
    description: `Document submitted: ${name} (${type})`,
  }).then(null, () => {});

  res.status(201).json(data);
});

// PATCH /api/aviation/documents/:id — update document status
router.patch('/documents/:id', async (req, res) => {
  const { status, verifiedBy, notes, expiryDate } = req.body;

  const patch = { updated_at: new Date().toISOString() };
  if (status)     patch.status      = status;
  if (notes)      patch.notes       = notes;
  if (expiryDate) patch.expiry_date = expiryDate;
  if (status === 'verified') {
    patch.verified_by = verifiedBy || null;
    patch.verified_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('aviation_documents')
    .update(patch)
    .eq('id', req.params.id)
    .select('*, leads!lead_id(name)')
    .single();

  if (error || !data) return res.status(404).json({ error: error?.message || 'Document not found' });

  await supabase.from('lead_activities').insert({
    lead_id:     data.lead_id,
    type:        'document_updated',
    description: `Document ${status}: ${data.name}`,
  }).then(null, () => {});

  res.json(data);
});

// GET /api/aviation/batches — list all batches
router.get('/batches', async (req, res) => {
  const { status, course } = req.query;

  let q = supabase
    .from('batches')
    .select('*')
    .order('start_date', { ascending: true });

  if (status) q = q.eq('status', status);
  if (course) q = q.eq('course', course);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // Enrich with enrolled count from leads
  const enriched = await Promise.all((data || []).map(async (batch) => {
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id);
    return { ...batch, enrolledCount: count || 0, spotsLeft: Math.max(0, batch.capacity - (count || 0)) };
  }));

  res.json(enriched);
});

// POST /api/aviation/batches — create batch
router.post('/batches', async (req, res) => {
  const { name, course, startDate, endDate, capacity, instructor, location, fees, notes } = req.body;
  if (!name || !course) return res.status(400).json({ error: 'name and course required' });

  const { data, error } = await supabase
    .from('batches')
    .insert({
      name,
      course,
      start_date: startDate  || null,
      end_date:   endDate    || null,
      capacity:   capacity   || 20,
      instructor: instructor || null,
      location:   location   || 'Hyderabad',
      fees:       fees       || null,
      notes:      notes      || null,
      status:     'upcoming',
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/aviation/batches/:id
router.patch('/batches/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('batches')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: error?.message || 'Batch not found' });
  res.json(data);
});

// POST /api/aviation/batches/:id/assign — assign lead to batch
router.post('/batches/:id/assign', async (req, res) => {
  const { leadId } = req.body;
  if (!leadId) return res.status(400).json({ error: 'leadId required' });

  const { data: batch } = await supabase.from('batches').select('*').eq('id', req.params.id).single();
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  const { count: enrolled } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', req.params.id);

  if ((enrolled || 0) >= batch.capacity) {
    return res.status(400).json({ error: 'Batch is full' });
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ batch_id: req.params.id })
    .eq('id', leadId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from('lead_activities').insert({
    lead_id:     leadId,
    type:        'batch_assigned',
    description: `Assigned to batch: ${batch.name} (${batch.course})`,
  }).then(null, () => {});

  res.json(data);
});

// GET /api/aviation/interviews — list interviews
router.get('/interviews', async (req, res) => {
  const { status, conductedBy, leadId } = req.query;

  let q = supabase
    .from('interviews')
    .select('*, leads!lead_id(id,name,phone,course_interest), employees!conducted_by(id,name,avatar)')
    .order('scheduled_at', { ascending: true });

  if (status)      q = q.eq('status', status);
  if (conductedBy) q = q.eq('conducted_by', conductedBy);
  if (leadId)      q = q.eq('lead_id', leadId);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/aviation/interviews — schedule interview
router.post('/interviews', async (req, res) => {
  const { leadId, conductedBy, scheduledAt, notes } = req.body;
  if (!leadId || !scheduledAt) return res.status(400).json({ error: 'leadId and scheduledAt required' });

  const { data, error } = await supabase
    .from('interviews')
    .insert({
      lead_id:      leadId,
      conducted_by: conductedBy || null,
      scheduled_at: scheduledAt,
      notes:        notes       || null,
      status:       'scheduled',
    })
    .select('*, leads!lead_id(name), employees!conducted_by(name)')
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from('leads').update({ interview_date: scheduledAt }).eq('id', leadId).then(null, () => {});

  await supabase.from('lead_activities').insert({
    lead_id:     leadId,
    type:        'interview_scheduled',
    description: `Interview scheduled for ${new Date(scheduledAt).toLocaleString()}`,
  }).then(null, () => {});

  res.status(201).json(data);
});

// PATCH /api/aviation/interviews/:id — update interview outcome
router.patch('/interviews/:id', async (req, res) => {
  const { status, outcome, notes, completedAt } = req.body;

  const patch = { updated_at: new Date().toISOString() };
  if (status)      patch.status       = status;
  if (outcome)     patch.outcome      = outcome;
  if (notes)       patch.notes        = notes;
  if (completedAt || status === 'completed') {
    patch.completed_at = completedAt || new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('interviews')
    .update(patch)
    .eq('id', req.params.id)
    .select('*, leads!lead_id(id,name)')
    .single();

  if (error || !data) return res.status(404).json({ error: error?.message || 'Interview not found' });

  if (data.lead_id) {
    await supabase.from('lead_activities').insert({
      lead_id:     data.lead_id,
      type:        'interview_updated',
      description: `Interview ${status}${outcome ? ': ' + outcome : ''}`,
    }).then(null, () => {});
  }

  res.json(data);
});

// GET /api/aviation/dgca-progress — DGCA stage distribution
router.get('/dgca-progress', async (req, res) => {
  const dgcaStages = ['not_started','applied','exam_pending','exam_passed','license_pending','licensed'];

  const counts = await Promise.all(dgcaStages.map(async (stage) => {
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('dgca_stage', stage);
    return { stage, count: count || 0 };
  }));

  res.json(counts);
});

// PATCH /api/aviation/leads/:id — update aviation-specific lead fields
router.patch('/leads/:id', async (req, res) => {
  const { medicalStatus, dgcaStage, courseInterest, totalFees, interviewDate } = req.body;

  const patch = {};
  if (medicalStatus  !== undefined) patch.medical_status  = medicalStatus;
  if (dgcaStage      !== undefined) patch.dgca_stage      = dgcaStage;
  if (courseInterest !== undefined) patch.course_interest = courseInterest;
  if (totalFees      !== undefined) patch.total_fees      = totalFees;
  if (interviewDate  !== undefined) patch.interview_date  = interviewDate;
  patch.last_activity_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: error?.message || 'Lead not found' });
  res.json(data);
});

module.exports = router;
