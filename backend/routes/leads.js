const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { assignLeadToEmployee, autoAssignAllUnassigned } = require('../utils/leadAssignment');
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
  }).catch(() => {});

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

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('leads').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Lead deleted' });
});

module.exports = router;
