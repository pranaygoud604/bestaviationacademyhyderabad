// AiSensy API wrapper — replaces direct Meta WhatsApp Cloud API calls.
// Docs: https://help.aisensy.com/developer/api-documentation
//
// Required env vars:
//   AISENSY_API_KEY   — found in AiSensy dashboard → Settings → API Keys

const AISENSY_BASE = 'https://backend.aisensy.com';

function key() {
  return process.env.AISENSY_API_KEY;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function campaignPost(body) {
  const res = await fetch(`${AISENSY_BASE}/campaign/t1/api/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || data.message || `AiSensy error ${res.status}`);
  }
  return data; // { success: true, msgId: 'wamid.xxx' }
}

async function directPost(endpoint, body) {
  const res = await fetch(`${AISENSY_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `AiSensy error ${res.status}`);
  return data;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp template message via a pre-configured AiSensy campaign.
 * The campaignName must match a campaign created in the AiSensy dashboard.
 *
 * @param {string}   destination   - Recipient phone with country code (e.g. "919876543210")
 * @param {string}   campaignName  - Campaign name as configured in AiSensy dashboard
 * @param {string[]} templateParams - Values to inject into template variables {{1}}, {{2}} …
 * @param {string}   userName      - Contact's display name (used for personalisation)
 * @param {object|null} media      - Optional: { url, filename } for document/image templates
 */
async function sendTemplateMessage(destination, campaignName, templateParams = [], userName = '', media = null) {
  if (!key()) throw new Error('AISENSY_API_KEY not configured');

  const body = {
    apiKey:         key(),
    campaignName,
    destination,
    userName:       userName || 'Customer',
    templateParams,
    source:         'SkyHost CRM',
    buttons:        [],
    carouselCards:  [],
    location:       {},
  };
  if (media) body.media = media;

  return campaignPost(body);
}

/**
 * Send a plain-text session message (works within the 24-hour conversation window).
 * Uses AiSensy's direct messaging API.
 *
 * @param {string} destination - Recipient phone with country code
 * @param {string} text        - Message body
 * @param {string} userName    - Contact name (optional, for display)
 */
async function sendTextMessage(destination, text, userName = '') {
  if (!key()) throw new Error('AISENSY_API_KEY not configured');

  // Attempt the direct live-chat endpoint first; falls back to campaign name env var
  // if a AISENSY_TEXT_CAMPAIGN_NAME is set (useful if the direct endpoint isn't available on your plan).
  const textCampaign = process.env.AISENSY_TEXT_CAMPAIGN_NAME;
  if (textCampaign) {
    return sendTemplateMessage(destination, textCampaign, [text], userName);
  }

  return directPost('/direct-apis/t1/messages', {
    to:   destination,
    type: 'text',
    text: { body: text },
  });
}

/**
 * Send an image message.
 *
 * @param {string} destination - Recipient phone with country code
 * @param {string} imageUrl    - Publicly accessible image URL
 * @param {string} caption     - Optional caption text
 */
async function sendImageMessage(destination, imageUrl, caption = '') {
  if (!key()) throw new Error('AISENSY_API_KEY not configured');

  const imageCampaign = process.env.AISENSY_IMAGE_CAMPAIGN_NAME;
  if (imageCampaign) {
    return sendTemplateMessage(destination, imageCampaign, [caption].filter(Boolean), '', {
      url: imageUrl, filename: 'image.jpg',
    });
  }

  return directPost('/direct-apis/t1/messages', {
    to:    destination,
    type:  'image',
    image: { link: imageUrl, caption },
  });
}

/**
 * Send a document message.
 */
async function sendDocumentMessage(destination, docUrl, filename = 'document', caption = '') {
  if (!key()) throw new Error('AISENSY_API_KEY not configured');

  return directPost('/direct-apis/t1/messages', {
    to:       destination,
    type:     'document',
    document: { link: docUrl, filename, caption },
  });
}

/**
 * Create or update a contact in AiSensy.
 * Called automatically when a new lead is created in the CRM.
 *
 * @param {string} phone        - Phone with country code (e.g. "919876543210")
 * @param {string} name         - Full name
 * @param {string} email        - Email address (optional)
 * @param {object} customParams - Extra key→value pairs stored on the contact
 */
async function syncContact(phone, name = '', email = '', customParams = {}) {
  if (!key()) return; // Silent no-op — contact sync is best-effort

  const [firstName = '', ...rest] = (name || '').trim().split(' ');
  const lastName = rest.join(' ');

  const custom = Object.entries(customParams)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => ({ name: k, value: String(v) }));

  try {
    const res = await fetch(`${AISENSY_BASE}/contact/t1/api/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key()}`,
      },
      body: JSON.stringify({ phone, firstName, lastName, email: email || '', customParams: custom }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      console.warn('[AiSensy] contact sync failed:', d.message || res.status);
    }
  } catch (e) {
    console.warn('[AiSensy] contact sync error:', e.message);
  }
}

/**
 * Send a broadcast campaign to multiple contacts.
 * Each contact can have its own per-contact templateParams override.
 *
 * @param {string}   campaignName - AiSensy campaign name
 * @param {Array}    contacts     - [{ phone, name, params? }]
 * @param {string[]} defaultParams - Default template params if contact has none
 * @returns {{ sent, failed, total }}
 */
async function sendBroadcast(campaignName, contacts, defaultParams = []) {
  if (!key()) throw new Error('AISENSY_API_KEY not configured');
  if (!contacts?.length) return { sent: 0, failed: 0, total: 0 };

  const results = await Promise.allSettled(
    contacts.map(({ phone, name, params }) =>
      sendTemplateMessage(phone, campaignName, params || defaultParams, name)
    )
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  if (failed > 0) {
    const firstErr = results.find(r => r.status === 'rejected')?.reason?.message;
    console.warn(`[AiSensy] broadcast: ${failed} failed. First error: ${firstErr}`);
  }

  return { sent, failed, total: contacts.length };
}

// Kept for API compatibility with whatsapp.js callers that use markAsRead
// AiSensy handles read receipts internally — this is a no-op.
async function markAsRead(_messageId) {}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  sendImageMessage,
  sendDocumentMessage,
  syncContact,
  sendBroadcast,
  markAsRead,
};
