const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { assignLead, assignLeadToEmployee, autoAssignAllUnassigned } = require('../utils/leadAssignment');
const { syncContact } = require('../utils/aisensy');

// GET /api/leads — list with optional filters
// Query params: status, assignedTo ("unassigned" | uuid), source, page, limit
router.get('/', async (req, res) => {
  const { status, assignedTo, source, page = 1, limit = 50 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = supabase
    .from('leads')
    .select('*, employees!assigned_to(id, name, email, avatar, role)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (status) query = query.eq('status', status);
  if (source) query = query.eq('source', source);
  if (assignedTo === 'unassigned') query = query.is('assigned_to', null);
  else if (assignedTo) query = query.eq('assigned_to', assignedTo);

  const { data: leads, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ leads, total: count, page: Number(page), limit: Number(limit) });
});

// GET /api/leads/:id — single lead
router.get('/:id', async (req, res) => {
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*, employees!assigned_to(id, name, email, avatar, role)')
    .eq('id', req.params.id)
    .single();

  if (error || !lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

// POST /api/leads — create manually
router.post('/', async (req, res) => {
  const { data: lead, error } = await supabase
    .from('leads')
    .insert(req.body)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Sync to AiSensy contacts (best-effort, never blocks the response)
  syncContact(lead.phone, lead.name, lead.email, {
    leadId: lead.id,
    source: lead.source || '',
    status: lead.status || 'new',
  }).then(null, () => {});

  res.status(201).json(lead);
});

// PATCH /api/leads/:id/assign — assign lead to an employee
router.patch('/:id/assign', async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'employeeId required' });

  const lead = await assignLeadToEmployee(req.params.id, employeeId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

// PATCH /api/leads/:id — update status, priority, notes, etc.
router.patch('/:id', async (req, res) => {
  const { data: lead, error } = await supabase
    .from('leads')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

// POST /api/leads/auto-assign — round-robin assign all unassigned leads
router.post('/auto-assign', async (req, res) => {
  const assigned = await autoAssignAllUnassigned();
  res.json({ message: `Auto-assigned ${assigned.length} leads`, leads: assigned });
});

// POST /api/leads/whatsapp-add — quick-add a WhatsApp lead by phone number
// Used from the Broadcasts page when a user copies a number from AiSensy inbox.
router.post('/whatsapp-add', async (req, res) => {
  const { phone, name, email = '' } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });

  // Skip if already exists
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'Lead with this phone number already exists' });

  const employee = await assignLead();

  const { data: lead, error } = await supabase.from('leads').insert({
    name:        name || 'WhatsApp Lead',
    phone,
    email,
    source:      'WhatsApp Direct',
    status:      employee ? 'assigned' : 'new',
    priority:    'medium',
    assigned_to: employee?.id  || null,
    assigned_at: employee ? new Date().toISOString() : null,
  }).select().single();

  if (error) return res.status(400).json({ error: error.message });

  if (employee) {
    try { await supabase.from('lead_assignments').insert({ lead_id: lead.id, employee_id: employee.id, assignment_type: 'auto' }); } catch {}
  }

  try {
    await supabase.from('lead_activities').insert({ lead_id: lead.id, type: 'lead_created', description: 'Lead created via WhatsApp Direct' });
  } catch {}

  res.status(201).json(lead);
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('leads').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Lead deleted' });
});

module.exports = router;
