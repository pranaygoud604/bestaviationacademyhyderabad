const GRAPH_URL = 'https://graph.facebook.com/v20.0';

function creds() {
  return {
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    token:   process.env.WHATSAPP_ACCESS_TOKEN,
  };
}

async function graphPost(endpoint, body) {
  const { token } = creds();
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN not configured');

  const res = await fetch(`${GRAPH_URL}/${endpoint}`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Meta API error ${res.status}`);
  return data;
}

async function sendTextMessage(to, text) {
  const { phoneId } = creds();
  if (!phoneId) throw new Error('WHATSAPP_PHONE_NUMBER_ID not configured');
  return graphPost(`${phoneId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
}

async function sendTemplateMessage(to, templateName, langCode = 'en_US', components = []) {
  const { phoneId } = creds();
  if (!phoneId) throw new Error('WHATSAPP_PHONE_NUMBER_ID not configured');
  return graphPost(`${phoneId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type:     'template',
    template: { name: templateName, language: { code: langCode }, components },
  });
}

async function sendImageMessage(to, imageUrl, caption = '') {
  const { phoneId } = creds();
  if (!phoneId) throw new Error('WHATSAPP_PHONE_NUMBER_ID not configured');
  return graphPost(`${phoneId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type:  'image',
    image: { link: imageUrl, caption },
  });
}

async function sendDocumentMessage(to, docUrl, filename = 'document', caption = '') {
  const { phoneId } = creds();
  if (!phoneId) throw new Error('WHATSAPP_PHONE_NUMBER_ID not configured');
  return graphPost(`${phoneId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type:     'document',
    document: { link: docUrl, filename, caption },
  });
}

// Best-effort read receipt — never throws
async function markAsRead(messageId) {
  const { phoneId, token } = creds();
  if (!phoneId || !token) return;
  graphPost(`${phoneId}/messages`, {
    messaging_product: 'whatsapp',
    status:     'read',
    message_id: messageId,
  }).then(null, () => {});
}

// Returns { url, mime_type, sha256, file_size, id } from Meta media endpoint
async function getMediaUrl(mediaId) {
  const { token } = creds();
  if (!token) return { url: null };
  const res = await fetch(`${GRAPH_URL}/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return { url: null };
  return res.json();
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  sendImageMessage,
  sendDocumentMessage,
  markAsRead,
  getMediaUrl,
};
