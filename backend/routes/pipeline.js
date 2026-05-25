const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');
const { calculateScore, calculateConversionProbability } = require('../utils/leadScoring');

const VALID_STAGES = ['new','contacted','interested','demo','documents','payment','enrolled','lost'];

// Map status values from older data into the 8-stage pipeline
function resolveStage(status) {
  if (VALID_STAGES.includes(status)) return status;
  if (status === 'assigned') return 'new';
  if (status === 'converted') return 'enrolled';
  return 'new';
}

// GET /api/pipeline
router.get('/', async (req, res) => {
  const { assignedTo, course } = req.query;

  let q = supabase
    .from('leads')
    .select('id,name,phone,email,source,score,status,conversion_probability,priority,course,course_interest,assigned_to,follow_up_date,total_fees,paid_amount,created_at,updated_at,employees!assigned_to(id,name,avatar)')
    .order('score', { ascending: false });

  if (assignedTo) q = q.eq('assigned_to', assignedTo);
  if (course)     q = q.eq('course_interest', course);

  const { data: leads, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const grouped = Object.fromEntries(VALID_STAGES.map(s => [s, []]));
  for (const lead of leads || []) {
    const stage = resolveStage(lead.status);
    grouped[stage].push({ ...lead, pipeline_stage: stage });
  }

  const stats = VALID_STAGES.map((stage, i) => {
    const arr      = grouped[stage] || [];
    const nextStage = VALID_STAGES[i + 1];
    const nextCount = nextStage ? (grouped[nextStage] || []).length : null;
    const conversionRate = arr.length && nextCount !== null
      ? Math.round((nextCount / (arr.length + nextCount)) * 100)
      : null;
    return {
      stage,
      count: arr.length,
      totalFees: arr.reduce((s, l) => s + (l.total_fees || 0), 0),
      avgScore:  arr.length ? Math.round(arr.reduce((s, l) => s + (l.score || 50), 0) / arr.length) : 0,
      conversionRate,
    };
  });

  res.json({ grouped, stats, total: leads?.length || 0 });
});

// PATCH /api/pipeline/:id/stage — drag-drop move
router.patch('/:id/stage', async (req, res) => {
  const { stage, notes, changedBy } = req.body;
  if (!VALID_STAGES.includes(stage)) {
    return res.status(400).json({ error: `Invalid stage. Valid: ${VALID_STAGES.join(', ')}` });
  }

  const { data: current } = await supabase
    .from('leads')
    .select('status,score,updated_at')
    .eq('id', req.params.id)
    .single();

  if (!current) return res.status(404).json({ error: 'Lead not found' });

  const prevAt = current.updated_at || new Date().toISOString();
  const timeInStageHours = parseFloat(
    ((Date.now() - new Date(prevAt).getTime()) / 3_600_000).toFixed(2)
  );

  const { data: updated, error } = await supabase
    .from('leads')
    .update({ status: stage, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !updated) return res.status(500).json({ error: error?.message || 'Update failed' });

  // Record history if pipeline_history table exists
  await supabase.from('pipeline_history').insert({
    lead_id:             req.params.id,
    from_stage:          resolveStage(current.status),
    to_stage:            stage,
    changed_by:          changedBy || null,
    time_in_stage_hours: timeInStageHours,
    notes,
  }).then(null, () => {});

  res.json({ ...updated, pipeline_stage: stage });
});

// GET /api/pipeline/stats — funnel analytics
router.get('/stats', async (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const m   = parseInt(month || now.getMonth() + 1);
  const y   = parseInt(year  || now.getFullYear());

  const startOfMonth = new Date(y, m - 1, 1).toISOString();
  const endOfMonth   = new Date(y, m, 0, 23, 59, 59).toISOString();

  const { data: leads } = await supabase
    .from('leads')
    .select('status,score,source,created_at,total_fees,conversion_probability')
    .gte('created_at', startOfMonth)
    .lte('created_at', endOfMonth);

  const stageCounts  = Object.fromEntries(VALID_STAGES.map(s => [s, 0]));
  const stageRevenue = Object.fromEntries(VALID_STAGES.map(s => [s, 0]));
  let totalScore = 0, totalProb = 0;

  for (const l of leads || []) {
    const s = resolveStage(l.status);
    stageCounts[s]  = (stageCounts[s]  || 0) + 1;
    stageRevenue[s] = (stageRevenue[s] || 0) + (l.total_fees || 0);
    totalScore += l.score || 50;
    totalProb  += l.conversion_probability || 0;
  }

  const total = leads?.length || 0;
  res.json({
    stageCounts,
    stageRevenue,
    total,
    avgScore:          total ? Math.round(totalScore / total) : 0,
    avgConversionProb: total ? Math.round(totalProb  / total) : 0,
    enrolledCount:     stageCounts.enrolled,
    enrolledRevenue:   stageRevenue.enrolled,
  });
});

// GET /api/pipeline/history/:leadId
router.get('/history/:leadId', async (req, res) => {
  const { data, error } = await supabase
    .from('pipeline_history')
    .select('*, employees!changed_by(name,avatar)')
    .eq('lead_id', req.params.leadId)
    .order('changed_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/pipeline/score/:id
router.post('/score/:id', async (req, res) => {
  const { data: lead } = await supabase.from('leads').select('*').eq('id', req.params.id).single();
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const score = calculateScore(lead);
  const conversion_probability = calculateConversionProbability({ ...lead, score });

  const { data: updated, error } = await supabase
    .from('leads')
    .update({ score, conversion_probability })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(updated);
});

// POST /api/pipeline/score-all
router.post('/score-all', async (req, res) => {
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .not('status', 'eq', 'lost');

  if (!leads?.length) return res.json({ updated: 0 });

  let updated = 0;
  for (const lead of leads) {
    const score = calculateScore(lead);
    const conversion_probability = calculateConversionProbability({ ...lead, score });
    const { error } = await supabase
      .from('leads')
      .update({ score, conversion_probability })
      .eq('id', lead.id);
    if (!error) updated++;
  }

  res.json({ updated, total: leads.length });
});

module.exports = router;
