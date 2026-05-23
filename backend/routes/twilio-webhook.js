const express   = require('express');
const twilio    = require('twilio');
const router    = express.Router();
const supabase  = require('../db/supabase');
const { assignLead }      = require('../utils/leadAssignment');
const { sendTextMessage } = require('../utils/aisensy');

// ── Signature verification ────────────────────────────────────────────────────
function verifySignature(req) {
  if (process.env.TWILIO_SKIP_SIGNATURE === 'true') return true;

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true;

  const sig = req.headers['x-twilio-signature'];
  if (!sig) return false;

  // Use forwarded proto/host so tunnel URLs verify correctly
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host']  || req.get('host');
  const url   = `${proto}://${host}${req.originalUrl}`;
  return twilio.validateRequest(authToken, sig, url, req.body);
}

// ── POST /webhook/twilio ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (!verifySignature(req)) {
    console.warn('[Twilio] Invalid signature');
    return res.sendStatus(403);
  }

  res.sendStatus(200); // Must reply quickly

  const body = req.body;

  // Delivery status callback
  if (body.MessageStatus) {
    handleStatusUpdate(body).catch(err =>
      console.error('[Twilio] status error:', err.message)
    );
    return;
  }

  // Inbound message
  if (body.From?.startsWith('whatsapp:')) {
    handleIncomingMessage(body).catch(err =>
      console.error('[Twilio] incoming error:', err.message)
    );
  }
});

// ── Parse inbound message payload ─────────────────────────────────────────────
function parseMessage(body) {
  const numMedia = parseInt(body.NumMedia || '0');
  if (numMedia === 0) return { type: 'text', content: body.Body || '' };

  const mime = body.MediaContentType0 || '';
  if (mime.startsWith('image/'))  return { type: 'image',    content: `[Image]${body.Body ? ': ' + body.Body : ''}`,    mediaUrl: body.MediaUrl0 };
  if (mime.startsWith('audio/'))  return { type: 'audio',    content: '[Voice message]',                                mediaUrl: body.MediaUrl0 };
  if (mime.startsWith('video/'))  return { type: 'video',    content: `[Video]${body.Body ? ': ' + body.Body : ''}`,    mediaUrl: body.MediaUrl0 };
  return                                 { type: 'document', content: `[Document]${body.Body ? ': ' + body.Body : ''}`, mediaUrl: body.MediaUrl0 };
}

// ── Strip "whatsapp:+" prefix → stored phone format (e.g. "919703522622") ────
function extractPhone(waFrom) {
  return waFrom.replace('whatsapp:', '').replace('+', '');
}

// ── Handle inbound message ─────────────────────────────────────────────────────
async function handleIncomingMessage(body) {
  const waId       = extractPhone(body.From);
  const name       = body.ProfileName || 'Unknown';
  const messageSid = body.MessageSid;
  const { type, content, mediaUrl } = parseMessage(body);

  const { lead, isNew } = await findOrCreateLead({ waId, name, messageSid, firstText: body.Body || '' });

  // Save message
  const { error: msgErr } = await supabase.from('whatsapp_messages').insert({
    lead_id:       lead.id,
    wa_message_id: messageSid,
    direction:     'inbound',
    type,
    content,
    media_id:      mediaUrl || null,
    status:        'delivered',
    sender_type:   'lead',
  });
  if (msgErr && !msgErr.message.includes('duplicate')) {
    console.error('[Twilio] save message error:', msgErr.message);
  }

  // Upsert conversation
  await supabase.from('conversations').upsert({
    lead_id:         lead.id,
    last_message:    content.substring(0, 200),
    last_message_at: new Date().toISOString(),
    status:          'open',
    updated_at:      new Date().toISOString(),
  }, { onConflict: 'lead_id' });

  try { await supabase.rpc('increment_unread', { p_lead_id: lead.id }); } catch(e) {}

  try {
    await supabase.from('lead_activities').insert({
      lead_id:     lead.id,
      type:        'message_received',
      description: `Received ${type}: ${content.substring(0, 100)}`,
    });
  } catch(e) {}

  if (isNew && !lead.assigned_to) await sendAutoReply(waId, name);

  console.log(`[Twilio] ${isNew ? 'NEW' : 'existing'} lead "${name}" (${waId}): ${content.substring(0, 60)}`);
}

// ── Find or create lead from phone number ────────────────────────────────────
async function findOrCreateLead({ waId, name, messageSid, firstText }) {
  const { data: existing } = await supabase
    .from('leads')
    .select('id, assigned_to, status')
    .eq('phone', waId)
    .not('status', 'in', '(converted,lost)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return { lead: existing, isNew: false };

  const employee = await assignLead();

  const { data: lead, error } = await supabase.from('leads').insert({
    name,
    phone:               waId,
    source:              'WhatsApp Direct',
    first_message:       firstText,
    whatsapp_message_id: messageSid,
    status:              employee ? 'assigned' : 'new',
    priority:            'medium',
    assigned_to:         employee?.id  || null,
    assigned_at:         employee ? new Date().toISOString() : null,
  }).select().single();

  if (error) throw error;

  if (employee) {
    try {
      await supabase.from('lead_assignments').insert({
        lead_id:         lead.id,
        employee_id:     employee.id,
        assignment_type: 'auto',
      });
    } catch(e) {}
  }

  try {
    await supabase.from('lead_activities').insert({
      lead_id:     lead.id,
      type:        'lead_created',
      description: 'Lead created via WhatsApp (Twilio)',
    });
  } catch(e) {}

  console.log(`[Twilio] Created lead "${name}" → ${employee?.name || 'unassigned'}`);
  return { lead, isNew: true };
}

// ── Status updates (delivered / read / failed) ────────────────────────────────
async function handleStatusUpdate({ MessageSid, MessageStatus }) {
  const map = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed', undelivered: 'failed' };
  const mapped = map[MessageStatus];
  if (!mapped) return;

  await supabase.from('whatsapp_messages')
    .update({ status: mapped, updated_at: new Date().toISOString() })
    .eq('wa_message_id', MessageSid);
}

// ── Auto-reply for brand-new leads ────────────────────────────────────────────
async function sendAutoReply(waId, name) {
  if (!process.env.TWILIO_ACCOUNT_SID) return;
  const first = name.split(' ')[0];
  const text  = `Hi ${first}! 👋 Thank you for reaching out to SkyHost Aviation Academy.\n\nOur team will get back to you shortly with all details about our pilot training programs.\n\nFeel free to ask us anything! ✈️`;
  await sendTextMessage(waId, text).catch(err =>
    console.error('[AutoReply] failed:', err.message)
  );
}

module.exports = router;
