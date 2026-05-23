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

// POST /api/leads/sync-aisensy — pull contacts from AiSensy and import as leads
router.post('/sync-aisensy', async (req, res) => {
  const apiKey = process.env.AISENSY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AISENSY_API_KEY not configured' });

  let allContacts = [];
  let page = 1;
  const pageSize = 100;

  // Paginate through all AiSensy contacts
  while (true) {
    const resp = await fetch(
      `https://backend.aisensy.com/contact/t1/api/contacts?page=${page}&limit=${pageSize}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(502).json({ error: err.message || `AiSensy API error ${resp.status}` });
    }
    const json = await resp.json().catch(() => ({}));
    const contacts = json.contacts || json.data || (Array.isArray(json) ? json : []);
    if (!contacts.length) break;
    allContacts = allContacts.concat(contacts);
    if (contacts.length < pageSize) break;
    page++;
  }

  if (!allContacts.length) {
    return res.json({ imported: 0, skipped: 0, message: 'No contacts found in AiSensy' });
  }

  // Fetch existing phones from Supabase to avoid duplicates
  const { data: existing } = await supabase.from('leads').select('phone');
  const existingPhones = new Set((existing || []).map(l => l.phone));

  const { assignLead } = require('../utils/leadAssignment');
  let imported = 0;
  let skipped  = 0;

  for (const c of allContacts) {
    const phone = c.phone || c.waId || c.phoneNumber || '';
    if (!phone || existingPhones.has(phone)) { skipped++; continue; }

    const firstName = c.firstName || c.first_name || '';
    const lastName  = c.lastName  || c.last_name  || '';
    const name      = (firstName + ' ' + lastName).trim() || c.name || 'AiSensy Contact';
    const email     = c.email || '';

    const employee = await assignLead();

    const { error } = await supabase.from('leads').insert({
      name,
      phone,
      email,
      source:      'WhatsApp (AiSensy)',
      status:      employee ? 'assigned' : 'new',
      priority:    'medium',
      assigned_to: employee?.id  || null,
      assigned_at: employee ? new Date().toISOString() : null,
    });

    if (!error) {
      existingPhones.add(phone); // prevent duplicates within this batch
      imported++;
    }
  }

  res.json({ imported, skipped, total: allContacts.length, message: `Imported ${imported} new leads from AiSensy` });
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('leads').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Lead deleted' });
});

module.exports = router;
