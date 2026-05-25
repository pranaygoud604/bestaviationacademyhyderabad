// Campaign (broadcast) routes — send AiSensy template messages to multiple leads at once.
// All endpoints: /api/campaigns

const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');
const { sendBroadcast } = require('../utils/aisensy');

// ── POST /api/campaigns/send ──────────────────────────────────────────────────
// Send a broadcast campaign to a filtered set of leads.
//
// Body:
//   campaignName  {string}   — AiSensy campaign name (must exist in dashboard)
//   templateParams {string[]} — default template variable values
//   filter         {object}  — optional: { status, source, assignedTo }
//   leadIds        {string[]} — optional: target specific lead IDs (overrides filter)
//
// Response: { sent, failed, total, campaignName }
router.post('/send', async (req, res) => {
  const { campaignName, templateParams = [], filter = {}, leadIds } = req.body;

  if (!campaignName) return res.status(400).json({ error: 'campaignName is required' });

  let query = supabase
    .from('leads')
    .select('id, name, phone, email, status, source, assigned_to')
    .not('phone', 'is', null)
    .neq('phone', '');

  if (leadIds?.length) {
    query = query.in('id', leadIds);
  } else {
    if (filter.status)     query = query.eq('status', filter.status);
    if (filter.source)     query = query.eq('source', filter.source);
    if (filter.assignedTo) query = query.eq('assigned_to', filter.assignedTo);
  }

  const { data: leads, error } = await query.limit(1000);
  if (error) return res.status(500).json({ error: error.message });
  if (!leads?.length) return res.json({ sent: 0, failed: 0, total: 0, campaignName });

  const contacts = leads.map(l => ({
    phone: l.phone,
    name:  l.name || '',
  }));

  let result;
  try {
    result = await sendBroadcast(campaignName, contacts, templateParams);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  // Log campaign activity for each lead (best-effort, non-blocking)
  const activities = leads.map(l => ({
    lead_id:     l.id,
    type:        'campaign_sent',
    description: `Broadcast campaign "${campaignName}" sent`,
    metadata:    { campaignName, templateParams },
  }));
  supabase.from('lead_activities').insert(activities).then(null, () => {});

  res.json({ ...result, campaignName });
});

// ── GET /api/campaigns/preview ────────────────────────────────────────────────
// Count how many leads match a filter without sending anything.
//
// Query params: status, source, assignedTo
router.get('/preview', async (req, res) => {
  const { status, source, assignedTo } = req.query;

  let query = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .not('phone', 'is', null)
    .neq('phone', '');

  if (status)     query = query.eq('status', status);
  if (source)     query = query.eq('source', source);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);

  const { count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ count: count || 0 });
});

module.exports = router;
