// Webhook routes
//   POST /webhook/meta        — Meta Lead Ads (free, receives form submissions)
//   GET  /webhook/meta        — Meta hub verification
//
// WhatsApp inbound messages are NOT handled here.
// Live chat is managed in AiSensy's own inbox (webhook subscription not purchased).
// AiSensy is used only for outbound: /api/messages/send, /api/campaigns/send.

const express  = require('express');
const crypto   = require('crypto');
const router   = express.Router();
const supabase = require('../db/supabase');
const { assignLead } = require('../utils/leadAssignment');

// ── Meta signature verification ───────────────────────────────────────────────
function verifyMetaSignature(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // skip in dev when APP_SECRET is not set

  const sig = req.headers['x-hub-signature-256'];
  if (!sig || !req.rawBody) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Meta Lead Ads — GET (hub verification) ───────────────────────────────────
router.get('/meta', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('[Webhook] Meta hub verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── Meta Lead Ads — POST ──────────────────────────────────────────────────────
router.post('/meta', async (req, res) => {
  if (!verifyMetaSignature(req)) {
    console.warn('[Webhook] Meta signature invalid');
    return res.sendStatus(401);
  }
  const body = req.body;
  if (body.object !== 'page') return res.sendStatus(404);

  res.sendStatus(200); // respond to Meta within 5 s

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === 'leadgen') {
        handleMetaLeadForm(change.value).catch(err =>
          console.error('[Meta Lead] error:', err.message)
        );
      }
    }
  }
});

// ── Meta Lead Ad form submission ──────────────────────────────────────────────
async function handleMetaLeadForm(leadData) {
  const fields = {};
  (leadData.field_data || []).forEach(f => { fields[f.name] = f.values?.[0] || ''; });

  const employee = await assignLead();

  const { data: lead, error } = await supabase.from('leads').insert({
    name:        `${fields.first_name || ''} ${fields.last_name || ''}`.trim() || 'Unknown',
    phone:       fields.phone_number || fields.phone || '',
    email:       fields.email || '',
    source:      'Meta Lead Ad',
    ad_id:       leadData.ad_id         || '',
    ad_name:     leadData.ad_name       || '',
    campaign:    leadData.campaign_name || '',
    status:      employee ? 'assigned' : 'new',
    priority:    'medium',
    assigned_to: employee?.id  || null,
    assigned_at: employee ? new Date().toISOString() : null,
  }).select().single();

  if (error) throw error;

  if (employee) {
    await supabase.from('lead_assignments').insert({
      lead_id: lead.id, employee_id: employee.id, assignment_type: 'auto',
    }).catch(() => {});
  }

  await supabase.from('lead_activities').insert({
    lead_id:     lead.id,
    type:        'lead_created',
    description: `Lead created via Meta Lead Ad: ${leadData.ad_name || 'Unknown Ad'}`,
  }).catch(() => {});

  // Also sync the new lead to AiSensy contacts (best-effort)
  const { syncContact } = require('../utils/aisensy');
  syncContact(lead.phone, lead.name, lead.email, {
    leadId: lead.id, source: 'Meta Lead Ad', adName: leadData.ad_name || '',
  }).catch(() => {});

  console.log(`[Meta Lead] "${lead.name}" → ${employee?.name || 'unassigned'}`);
  return lead;
}

module.exports = router;
