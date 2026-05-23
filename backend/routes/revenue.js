const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');

// GET /api/revenue/dashboard — full revenue summary
router.get('/dashboard', async (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const m   = parseInt(month || now.getMonth() + 1);
  const y   = parseInt(year  || now.getFullYear());

  const startOfMonth  = new Date(y, m - 1, 1).toISOString();
  const endOfMonth    = new Date(y, m, 0, 23, 59, 59).toISOString();
  const startStr      = startOfMonth.split('T')[0];
  const endStr        = endOfMonth.split('T')[0];

  // Revenue this month
  const { data: thisMonthRev } = await supabase
    .from('revenue_records')
    .select('amount,type,course,employee_id')
    .gte('payment_date', startStr)
    .lte('payment_date', endStr);

  const totalRevenue  = (thisMonthRev || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const enrollmentRev = (thisMonthRev || []).filter(r => r.type === 'enrollment')
    .reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  // Revenue last month for comparison
  const prevStart = new Date(y, m - 2, 1).toISOString().split('T')[0];
  const prevEnd   = new Date(y, m - 1, 0).toISOString().split('T')[0];
  const { data: prevRev } = await supabase
    .from('revenue_records')
    .select('amount')
    .gte('payment_date', prevStart)
    .lte('payment_date', prevEnd);
  const prevTotal = (prevRev || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const mom = prevTotal > 0 ? Math.round(((totalRevenue - prevTotal) / prevTotal) * 100) : 0;

  // Total enrolled this month
  const { count: enrolledThisMonth } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_stage', 'enrolled')
    .gte('updated_at', startOfMonth)
    .lte('updated_at', endOfMonth);

  // Total leads this month (for CPL calc)
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfMonth)
    .lte('created_at', endOfMonth);

  // Estimated ad spend (configurable — default per-lead cost heuristic)
  const estimatedAdSpend = (totalLeads || 0) * 800; // ₹800 CPL default
  const costPerLead      = totalLeads ? Math.round(estimatedAdSpend / totalLeads) : 0;
  const roi              = estimatedAdSpend > 0 ? Math.round(((totalRevenue - estimatedAdSpend) / estimatedAdSpend) * 100) : 0;

  // Revenue by course
  const byCourse = {};
  for (const r of thisMonthRev || []) {
    const c = r.course || 'Unknown';
    byCourse[c] = (byCourse[c] || 0) + parseFloat(r.amount || 0);
  }

  // Revenue by employee
  const byEmployee = {};
  for (const r of thisMonthRev || []) {
    if (r.employee_id) {
      byEmployee[r.employee_id] = (byEmployee[r.employee_id] || 0) + parseFloat(r.amount || 0);
    }
  }

  // Enrich employee names
  const empIds = Object.keys(byEmployee);
  let empNames = {};
  if (empIds.length) {
    const { data: emps } = await supabase.from('employees').select('id,name,avatar').in('id', empIds);
    (emps || []).forEach(e => { empNames[e.id] = { name: e.name, avatar: e.avatar }; });
  }

  const employeeRevenue = Object.entries(byEmployee).map(([id, amount]) => ({
    id,
    name:   empNames[id]?.name   || 'Unknown',
    avatar: empNames[id]?.avatar || '👤',
    amount,
  })).sort((a, b) => b.amount - a.amount);

  // Monthly targets
  const { data: allTargets } = await supabase
    .from('employee_targets')
    .select('revenue_target')
    .eq('month', m)
    .eq('year', y);

  const totalTarget = (allTargets || []).reduce((s, t) => s + parseFloat(t.revenue_target || 0), 0);

  res.json({
    month: m, year: y,
    totalRevenue,
    enrollmentRevenue: enrollmentRev,
    totalTarget,
    targetAchievement: totalTarget ? Math.round((totalRevenue / totalTarget) * 100) : 0,
    enrolledThisMonth: enrolledThisMonth || 0,
    totalLeads: totalLeads || 0,
    costPerLead,
    estimatedAdSpend,
    roi,
    mom,
    byCourse,
    employeeRevenue,
  });
});

// GET /api/revenue/forecast — 6-month trend + linear projection
router.get('/forecast', async (req, res) => {
  const now = new Date();
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mn = d.getMonth() + 1;
    const yr = d.getFullYear();
    const start = `${yr}-${String(mn).padStart(2,'0')}-01`;
    const end   = `${yr}-${String(mn).padStart(2,'0')}-${new Date(yr, mn, 0).getDate()}`;

    const { data: revData } = await supabase
      .from('revenue_records')
      .select('amount')
      .gte('payment_date', start)
      .lte('payment_date', end);

    const { count: enrolled } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_stage', 'enrolled')
      .gte('updated_at', `${start}T00:00:00`)
      .lte('updated_at', `${end}T23:59:59`);

    const { count: newLeads } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${start}T00:00:00`)
      .lte('created_at', `${end}T23:59:59`);

    months.push({
      month: mn, year: yr,
      label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      revenue: (revData || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0),
      enrolled: enrolled || 0,
      newLeads:  newLeads || 0,
    });
  }

  // Linear regression for next month projection
  const values   = months.map(m => m.revenue);
  const n        = values.length;
  const sumX     = values.reduce((_, __, i) => _ + i, 0);
  const sumY     = values.reduce((s, v) => s + v, 0);
  const sumXY    = values.reduce((s, v, i) => s + i * v, 0);
  const sumXX    = values.reduce((s, _, i) => s + i * i, 0);
  const slope    = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
  const intercept = (sumY - slope * sumX) / n;
  const projected  = Math.max(0, Math.round(intercept + slope * n));

  res.json({ months, projected, slope: Math.round(slope) });
});

// GET /api/revenue/funnel — conversion funnel with drop-off rates
router.get('/funnel', async (req, res) => {
  const stages = ['new','contacted','interested','demo','documents','payment','enrolled'];

  const counts = await Promise.all(stages.map(async (stage) => {
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_stage', stage);
    return { stage, count: count || 0 };
  }));

  // Enrich with drop-off %
  const enriched = counts.map((c, i) => ({
    ...c,
    dropOff: i > 0 && counts[i-1].count > 0
      ? Math.round((1 - c.count / counts[i-1].count) * 100)
      : 0,
  }));

  // Average time in stage (from pipeline_history)
  const stageTimings = {};
  for (const stage of stages) {
    const { data: history } = await supabase
      .from('pipeline_history')
      .select('time_in_stage_hours')
      .eq('to_stage', stage)
      .not('time_in_stage_hours', 'is', null)
      .limit(100);
    const avg = history?.length
      ? Math.round(history.reduce((s, h) => s + parseFloat(h.time_in_stage_hours || 0), 0) / history.length)
      : null;
    stageTimings[stage] = avg;
  }

  res.json({ funnel: enriched, stageTimings });
});

// POST /api/revenue/record — record a payment
router.post('/record', async (req, res) => {
  const { leadId, employeeId, amount, type, course, description, paymentDate } = req.body;
  if (!leadId || !amount) return res.status(400).json({ error: 'leadId and amount required' });

  const { data, error } = await supabase
    .from('revenue_records')
    .insert({
      lead_id:      leadId,
      employee_id:  employeeId || null,
      amount:       parseFloat(amount),
      type:         type        || 'enrollment',
      course:       course      || null,
      description:  description || null,
      payment_date: paymentDate || new Date().toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Update lead paid_amount and pipeline_stage
  await supabase.rpc
    ? supabase.from('leads')
        .select('paid_amount,total_fees')
        .eq('id', leadId)
        .single()
        .then(async ({ data: lead }) => {
          if (!lead) return;
          const newPaid = (parseFloat(lead.paid_amount || 0) + parseFloat(amount)).toFixed(2);
          const updates = { paid_amount: newPaid };
          if (newPaid >= (lead.total_fees || 0) && lead.total_fees > 0) {
            updates.pipeline_stage = 'enrolled';
            updates.status = 'converted';
          }
          await supabase.from('leads').update(updates).eq('id', leadId);
        })
    : null;

  await supabase.from('lead_activities').insert({
    lead_id:     leadId,
    type:        'payment_received',
    description: `Payment recorded: ₹${Number(amount).toLocaleString('en-IN')} (${type || 'enrollment'})`,
  }).catch(() => {});

  res.status(201).json(data);
});

// GET /api/revenue/by-source — CPL and ROI by lead source
router.get('/by-source', async (req, res) => {
  const { data: leads } = await supabase
    .from('leads')
    .select('id,source,pipeline_stage,total_fees,paid_amount');

  const sourceMap = {};
  for (const l of leads || []) {
    const s = l.source || 'Unknown';
    if (!sourceMap[s]) sourceMap[s] = { total: 0, enrolled: 0, revenue: 0, estimatedCPL: 800 };
    sourceMap[s].total++;
    if (l.pipeline_stage === 'enrolled') {
      sourceMap[s].enrolled++;
      sourceMap[s].revenue += parseFloat(l.paid_amount || l.total_fees || 0);
    }
  }

  const result = Object.entries(sourceMap).map(([source, data]) => ({
    source,
    ...data,
    conversionRate: data.total ? Math.round((data.enrolled / data.total) * 100) : 0,
    roi:            data.estimatedCPL * data.total > 0
      ? Math.round(((data.revenue - data.estimatedCPL * data.total) / (data.estimatedCPL * data.total)) * 100)
      : 0,
  })).sort((a, b) => b.revenue - a.revenue);

  res.json(result);
});

module.exports = router;
