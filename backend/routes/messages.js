const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');
const {
  sendTextMessage,
  sendTemplateMessage,
  sendImageMessage,
  sendDocumentMessage,
} = require('../utils/aisensy');

// ── GET /api/messages/conversations ──────────────────────────────────────────
// All conversations ordered by most recent message, joined with lead info.
router.get('/conversations', async (req, res) => {
  const { data, error } = await supabase
    .from('conversations')
    .select('*, leads(id, name, phone, source, status, priority, assigned_to)')
    .order('last_message_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── GET /api/messages/conversation/:leadId ───────────────────────────────────
// Full message thread for one lead (paginated, oldest-first for chat display).
router.get('/conversation/:leadId', async (req, res) => {
  const { leadId } = req.params;
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Number(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const { data: messages, count, error } = await supabase
    .from('whatsapp_messages')
    .select('*', { count: 'exact' })
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  // Reset unread counter when an employee opens the thread
  await supabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('lead_id', leadId);

  res.json({ messages: messages || [], total: count, page });
});

// ── GET /api/messages/activities/:leadId ─────────────────────────────────────
router.get('/activities/:leadId', async (req, res) => {
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('lead_id', req.params.leadId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── GET /api/messages/templates ──────────────────────────────────────────────
router.get('/templates', async (req, res) => {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('status', 'active')
    .order('display_name');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── POST /api/messages/send ───────────────────────────────────────────────────
// Send a WhatsApp message from an employee to a lead.
router.post('/send', async (req, res) => {
  const {
    leadId, type = 'text',
    text,
    templateName, campaignName, templateParams = [], langCode = 'en', components = [],
    imageUrl, caption,
    docUrl, filename,
  } = req.body;

  if (!leadId) return res.status(400).json({ error: 'leadId required' });

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, phone, name')
    .eq('id', leadId)
    .single();

  if (leadErr || !lead) return res.status(404).json({ error: 'Lead not found' });
  if (!lead.phone)       return res.status(400).json({ error: 'Lead has no phone number' });

  let waResult, content;

  try {
    switch (type) {
      case 'text':
        if (!text) return res.status(400).json({ error: 'text required' });
        waResult = await sendTextMessage(lead.phone, text, lead.name);
        content  = text;
        break;

      case 'template': {
        // AiSensy uses campaignName; fall back to templateName for backwards compat
        const campaign = campaignName || templateName;
        if (!campaign) return res.status(400).json({ error: 'campaignName required' });
        waResult = await sendTemplateMessage(lead.phone, campaign, templateParams, lead.name);
        content  = `[Template: ${campaign}]`;
        break;
      }

      case 'image':
        if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' });
        waResult = await sendImageMessage(lead.phone, imageUrl, caption);
        content  = caption || '[Image]';
        break;

      case 'document':
        if (!docUrl) return res.status(400).json({ error: 'docUrl required' });
        waResult = await sendDocumentMessage(lead.phone, docUrl, filename, caption);
        content  = `[Document: ${filename || 'file'}]`;
        break;

      default:
        return res.status(400).json({ error: `Unsupported type: ${type}` });
    }
  } catch (err) {
    console.error('[Messages] WhatsApp API error:', err.message);
    return res.status(502).json({ error: err.message });
  }

  // AiSensy returns { success, msgId }; Meta Cloud API returns { messages[0].id }
  const waMessageId = waResult?.msgId || waResult?.messages?.[0]?.id;

  // Persist to DB
  const { data: savedMsg, error: saveErr } = await supabase
    .from('whatsapp_messages')
    .insert({
      lead_id:       leadId,
      wa_message_id: waMessageId,
      direction:     'outbound',
      type,
      content,
      status:        'sent',
      sender_type:   'employee',
    })
    .select()
    .single();

  if (saveErr) console.error('[Messages] save error:', saveErr.message);

  // Update conversation preview
  await supabase.from('conversations').upsert({
    lead_id:         leadId,
    last_message:    content.substring(0, 200),
    last_message_at: new Date().toISOString(),
    updated_at:      new Date().toISOString(),
  }, { onConflict: 'lead_id' });

  // Activity log
  await supabase.from('lead_activities').insert({
    lead_id:     leadId,
    type:        'message_sent',
    description: `Sent WhatsApp ${type}: ${content.substring(0, 100)}`,
  }).catch(() => {});

  res.json({ message: savedMsg, waMessageId });
});

// ── POST /api/messages/followup ───────────────────────────────────────────────
// Schedule a follow-up reminder for a lead.
router.post('/followup', async (req, res) => {
  const { leadId, assignedTo, scheduledAt, type = 'whatsapp', message } = req.body;
  if (!leadId || !scheduledAt)
    return res.status(400).json({ error: 'leadId and scheduledAt required' });

  const { data, error } = await supabase
    .from('followups')
    .insert({
      lead_id:      leadId,
      assigned_to:  assignedTo || null,
      scheduled_at: scheduledAt,
      type,
      message,
      status:       'pending',
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

module.exports = router;
