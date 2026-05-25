const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');

// GET /api/followups — list tasks with filters
// Query: assignedTo, status, priority, type, date (today|tomorrow|week|overdue), leadId
router.get('/', async (req, res) => {
  const { assignedTo, status, priority, type, date, leadId, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Mark overdue first
  await supabase
    .from('follow_up_tasks')
    .update({ status: 'overdue', updated_at: new Date().toISOString() })
    .eq('status', 'pending')
    .lt('due_date', new Date().toISOString())
    .then(null, () => {});

  let q = supabase
    .from('follow_up_tasks')
    .select(`
      *,
      leads!lead_id(id,name,phone,pipeline_stage,source),
      employees!assigned_to(id,name,avatar),
      escalated_emp:employees!escalated_to(id,name,avatar)
    `, { count: 'exact' })
    .order('due_date', { ascending: true })
    .range(offset, offset + parseInt(limit) - 1);

  if (assignedTo) q = q.eq('assigned_to', assignedTo);
  if (status)     q = q.eq('status', status);
  if (priority)   q = q.eq('priority', priority);
  if (type)       q = q.eq('type', type);
  if (leadId)     q = q.eq('lead_id', leadId);

  if (date === 'today') {
    const start = new Date(); start.setHours(0,0,0,0);
    const end   = new Date(); end.setHours(23,59,59,999);
    q = q.gte('due_date', start.toISOString()).lte('due_date', end.toISOString());
  } else if (date === 'tomorrow') {
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(0,0,0,0);
    const end   = new Date(start); end.setHours(23,59,59,999);
    q = q.gte('due_date', start.toISOString()).lte('due_date', end.toISOString());
  } else if (date === 'week') {
    const start = new Date(); start.setHours(0,0,0,0);
    const end   = new Date(); end.setDate(end.getDate() + 7); end.setHours(23,59,59,999);
    q = q.gte('due_date', start.toISOString()).lte('due_date', end.toISOString());
  } else if (date === 'overdue') {
    q = q.lt('due_date', new Date().toISOString()).in('status', ['pending','overdue']);
  }

  const { data, count, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ tasks: data || [], total: count, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/followups/summary — counts by status for current user
router.get('/summary', async (req, res) => {
  const { assignedTo } = req.query;

  const now   = new Date();
  const today = new Date(now); today.setHours(0,0,0,0);
  const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999);

  await supabase
    .from('follow_up_tasks')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_date', now.toISOString())
    .then(null, () => {});

  const base = () => {
    let q = supabase.from('follow_up_tasks').select('id', { count: 'exact', head: true });
    if (assignedTo) q = q.eq('assigned_to', assignedTo);
    return q;
  };

  const [pending, overdue, todayTasks, completed] = await Promise.all([
    base().eq('status', 'pending').then(r => r.count || 0),
    base().eq('status', 'overdue').then(r => r.count || 0),
    base().in('status',['pending','overdue']).gte('due_date', today.toISOString()).lte('due_date', todayEnd.toISOString()).then(r => r.count || 0),
    base().eq('status', 'completed').gte('completed_at', today.toISOString()).then(r => r.count || 0),
  ]);

  res.json({ pending, overdue, today: todayTasks, completedToday: completed });
});

// POST /api/followups — create task
router.post('/', async (req, res) => {
  const { leadId, assignedTo, title, description, dueDate, priority, type } = req.body;
  if (!leadId || !title || !dueDate) {
    return res.status(400).json({ error: 'leadId, title, dueDate required' });
  }

  const { data, error } = await supabase
    .from('follow_up_tasks')
    .insert({
      lead_id:     leadId,
      assigned_to: assignedTo || null,
      title,
      description: description || null,
      due_date:    dueDate,
      priority:    priority || 'medium',
      type:        type     || 'call',
      status:      'pending',
    })
    .select(`
      *,
      leads!lead_id(id,name,phone),
      employees!assigned_to(id,name,avatar)
    `)
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Update lead follow_up_date
  await supabase.from('leads')
    .update({ follow_up_date: dueDate, last_activity_at: new Date().toISOString() })
    .eq('id', leadId)
    .then(null, () => {});

  // Log activity
  await supabase.from('lead_activities').insert({
    lead_id: leadId,
    type:    'follow_up_scheduled',
    description: `Follow-up scheduled: ${title} due ${new Date(dueDate).toLocaleDateString()}`,
  }).then(null, () => {});

  res.status(201).json(data);
});

// PATCH /api/followups/:id — update task (complete, reschedule, escalate)
router.patch('/:id', async (req, res) => {
  const { status, completedAt, dueDate, priority, notes, escalatedTo } = req.body;

  const patch = { updated_at: new Date().toISOString() };
  if (status)      patch.status      = status;
  if (dueDate)     patch.due_date    = dueDate;
  if (priority)    patch.priority    = priority;
  if (notes)       patch.description = notes;
  if (escalatedTo) patch.escalated_to = escalatedTo;

  if (status === 'completed') {
    patch.completed_at = completedAt || new Date().toISOString();
  }
  if (status === 'escalated' && escalatedTo) {
    patch.escalated_to = escalatedTo;
  }

  const { data, error } = await supabase
    .from('follow_up_tasks')
    .update(patch)
    .eq('id', req.params.id)
    .select('*, leads!lead_id(id,name)')
    .single();

  if (error || !data) return res.status(404).json({ error: error?.message || 'Task not found' });

  if (status === 'completed' && data.lead_id) {
    await supabase.from('lead_activities').insert({
      lead_id:     data.lead_id,
      type:        'follow_up_completed',
      description: `Follow-up completed: ${data.title}`,
    }).then(null, () => {});
  }

  res.json(data);
});

// DELETE /api/followups/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('follow_up_tasks').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/followups/escalate-overdue — batch escalate all overdue tasks
router.post('/escalate-overdue', async (req, res) => {
  const { managerId } = req.body;

  const { data: overdueTasks } = await supabase
    .from('follow_up_tasks')
    .select('id,lead_id,title,assigned_to')
    .eq('status', 'overdue');

  if (!overdueTasks?.length) return res.json({ escalated: 0 });

  const updates = overdueTasks.map(t => ({
    id:           t.id,
    status:       'escalated',
    escalated_to: managerId || null,
    updated_at:   new Date().toISOString(),
  }));

  await Promise.all(updates.map(u =>
    supabase.from('follow_up_tasks').update(u).eq('id', u.id)
  ));

  // Log activities
  const activityInserts = overdueTasks.map(t => ({
    lead_id:     t.lead_id,
    type:        'follow_up_escalated',
    description: `Follow-up escalated to manager: ${t.title}`,
  }));
  await supabase.from('lead_activities').insert(activityInserts).then(null, () => {});

  res.json({ escalated: overdueTasks.length });
});

module.exports = router;
