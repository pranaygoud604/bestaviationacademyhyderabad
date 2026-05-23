// Lead intelligence: scoring, classification, conversion probability

const SOURCE_SCORES = {
  'Referral':         30,
  'Website':          25,
  'WhatsApp Direct':  22,
  'Meta Lead Ad':     20,
  'Facebook Ad':      18,
  'Instagram Ad':     16,
  'Manual':           10,
};

const STAGE_SCORES = {
  enrolled:   35,
  payment:    30,
  documents:  25,
  demo:       20,
  interested: 15,
  contacted:  10,
  new:         5,
  lost:        0,
};

const STAGE_PROBABILITY = {
  enrolled:   100,
  payment:     85,
  documents:   65,
  demo:        40,
  interested:  25,
  contacted:   12,
  new:          5,
  lost:         0,
};

function calculateScore(lead) {
  let score = 0;

  // Source quality (0-30)
  score += SOURCE_SCORES[lead.source] || 12;

  // Pipeline stage (0-35)
  score += STAGE_SCORES[lead.pipeline_stage] || STAGE_SCORES[lead.status] || 5;

  // Recency of engagement (0-20)
  const hoursOld = lead.created_at
    ? (Date.now() - new Date(lead.created_at).getTime()) / 3_600_000
    : 999;
  if (hoursOld < 1)  score += 20;
  else if (hoursOld < 6)  score += 15;
  else if (hoursOld < 24) score += 10;
  else if (hoursOld < 72) score += 5;

  // Priority (0-15)
  if (lead.priority === 'high')   score += 15;
  else if (lead.priority === 'medium') score += 8;
  else if (lead.priority === 'low')    score += 3;

  // Course interest specified (0-10)
  if (lead.course_interest || lead.course) score += 10;

  // Email provided (0-5)
  if (lead.email && lead.email.includes('@')) score += 5;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function classifyLead(score) {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

function calculateConversionProbability(lead) {
  const stage   = lead.pipeline_stage || lead.status || 'new';
  const base    = STAGE_PROBABILITY[stage] ?? 5;
  const boost   = Math.round(((lead.score || 50) - 50) / 10); // -5 to +5
  return Math.min(100, Math.max(0, base + boost));
}

function detectDuplicate(lead, existingLeads) {
  if (!lead.phone) return null;
  const normalized = lead.phone.replace(/\D/g, '').slice(-10);
  return existingLeads.find(l => {
    if (l.id === lead.id) return false;
    const lNorm = (l.phone || '').replace(/\D/g, '').slice(-10);
    if (lNorm === normalized) return true;
    if (lead.email && l.email && lead.email.toLowerCase() === l.email.toLowerCase()) return true;
    return false;
  }) || null;
}

async function enrichAndScore(supabase, leadId) {
  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
  if (!lead) return null;

  const score = calculateScore(lead);
  const conversion_probability = calculateConversionProbability({ ...lead, score });

  const { data: updated } = await supabase
    .from('leads')
    .update({ score, conversion_probability, last_activity_at: new Date().toISOString() })
    .eq('id', leadId)
    .select()
    .single();

  return updated;
}

module.exports = {
  calculateScore,
  classifyLead,
  calculateConversionProbability,
  detectDuplicate,
  enrichAndScore,
};
