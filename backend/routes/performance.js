const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');

// GET /api/performance — all employee metrics with rankings
router.get('/', async (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const m   = parseInt(month || now.getMonth() + 1);
  const y   = parseInt(year  || now.getFullYear());

  const startOfMonth = new Date(y, m - 1, 1).toISOString();
  const endOfMonth   = new Date(y, m, 0, 23, 59, 59).toISOString();

  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('*')
    .neq('status', 'inactive');

  if (empErr) return res.status(500).json({ error: empErr.message });

  const metrics = await Promise.all(employees.map(async (emp) => {
    // Leads assigned this month
    const { count: leadsAssigned } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', emp.id)
      .gte('assigned_at', startOfMonth)
      .lte('assigned_at', endOfMonth);

    // Enrolled (converted) leads this month
    const { count: enrollments } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', emp.id)
      .eq('pipeline_stage', 'enrolled')
      .gte('updated_at', startOfMonth)
      .lte('updated_at', endOfMonth);

    // Revenue this month
    const { data: revData } = await supabase
      .from('revenue_records')
      .select('amount')
      .eq('employee_id', emp.id)
      .gte('payment_date', startOfMonth.split('T')[0])
      .lte('payment_date', endOfMonth.split('T')[0]);

    const revenue = (revData || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);

    // Commission earned
    const commissionRate = emp.commission_rate || 5;
    const commission = (revenue * commissionRate) / 100;

    // Target this month
    const { data: targetRow } = await supabase
      .from('employee_targets')
      .select('revenue_target,conversion_target,leads_target')
      .eq('employee_id', emp.id)
      .eq('month', m)
      .eq('year', y)
      .maybeSingle();

    const revenueTarget    = targetRow?.revenue_target    || emp.target_monthly || 500000;
    const conversionTarget = targetRow?.conversion_target || 10;
    const leadsTarget      = targetRow?.leads_target      || 30;

    // SLA compliance: leads responded to within sla_hours
    const slaHours = emp.sla_hours || 4;
    const { data: assignedLeads } = await supabase
      .from('leads')
      .select('id,created_at,last_activity_at')
      .eq('assigned_to', emp.id)
      .gte('assigned_at', startOfMonth)
      .lte('assigned_at', endOfMonth);

    let slaCompliant = 0, slaBreached = 0;
    for (const lead of assignedLeads || []) {
      if (!lead.last_activity_at) { slaBreached++; continue; }
      const hrs = (new Date(lead.last_activity_at) - new Date(lead.created_at)) / 3_600_000;
      if (hrs <= slaHours) slaCompliant++;
      else slaBreached++;
    }
    const slaTotal = slaCompliant + slaBreached;
    const slaRate  = slaTotal ? Math.round((slaCompliant / slaTotal) * 100) : 100;

    // Follow-up adherence: completed tasks / total due tasks
    const { count: tasksDue } = await supabase
      .from('follow_up_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', emp.id)
      .gte('due_date', startOfMonth)
      .lte('due_date', endOfMonth);

    const { count: tasksCompleted } = await supabase
      .from('follow_up_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', emp.id)
      .eq('status', 'completed')
      .gte('due_date', startOfMonth)
      .lte('due_date', endOfMonth);

    const followUpRate = tasksDue ? Math.round(((tasksCompleted || 0) / tasksDue) * 100) : 100;

    // Active leads in pipeline (workload)
    const { count: activeLeads } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', emp.id)
      .not('pipeline_stage', 'in', '(enrolled,lost)');

    // Productivity score (0-100): weighted composite
    const productivityScore = Math.round(
      (slaRate * 0.3) +
      (followUpRate * 0.3) +
      (Math.min(100, ((enrollments || 0) / Math.max(1, conversionTarget)) * 100) * 0.25) +
      (Math.min(100, (revenue / Math.max(1, revenueTarget)) * 100) * 0.15)
    );

    return {
      ...emp,
      month: m,
      year:  y,
      leadsAssigned:    leadsAssigned  || 0,
      enrollments:      enrollments    || 0,
      revenue,
      commission,
      revenueTarget,
      conversionTarget,
      leadsTarget,
      revenueAchievement: Math.round((revenue / Math.max(1, revenueTarget)) * 100),
      conversionAchievement: Math.round(((enrollments || 0) / Math.max(1, conversionTarget)) * 100),
      slaRate,
      followUpRate,
      activeLeads:      activeLeads    || 0,
      productivityScore,
    };
  }));

  // Sort by productivity score desc
  metrics.sort((a, b) => b.productivityScore - a.productivityScore);

  res.json(metrics);
});

// GET /api/performance/:id — single employee detailed metrics
router.get('/:id', async (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const m   = parseInt(month || now.getMonth() + 1);
  const y   = parseInt(year  || now.getFullYear());

  const startOfMonth = new Date(y, m - 1, 1).toISOString();
  const endOfMonth   = new Date(y, m, 0, 23, 59, 59).toISOString();

  const { data: emp } = await supabase.from('employees').select('*').eq('id', req.params.id).single();
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  // Stage distribution of assigned leads
  const { data: stageLeads } = await supabase
    .from('leads')
    .select('pipeline_stage')
    .eq('assigned_to', emp.id)
    .not('status', 'eq', 'lost');

  const stageBreakdown = {};
  for (const l of stageLeads || []) {
    stageBreakdown[l.pipeline_stage || 'new'] = (stageBreakdown[l.pipeline_stage || 'new'] || 0) + 1;
  }

  // Monthly revenue trend (last 6 months)
  const monthlyRevenue = [];
  for (let i = 5; i >= 0; i--) {
    const d  = new Date(y, m - 1 - i, 1);
    const mn = d.getMonth() + 1;
    const yr = d.getFullYear();
    const { data: revData } = await supabase
      .from('revenue_records')
      .select('amount')
      .eq('employee_id', emp.id)
      .gte('payment_date', `${yr}-${String(mn).padStart(2,'0')}-01`)
      .lte('payment_date', `${yr}-${String(mn).padStart(2,'0')}-${new Date(yr, mn, 0).getDate()}`);
    const total = (revData || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    monthlyRevenue.push({ month: mn, year: yr, revenue: total });
  }

  // Recent activities
  const { data: activities } = await supabase
    .from('lead_activities')
    .select('*, leads!lead_id(name,phone)')
    .in('lead_id',
      (await supabase.from('leads').select('id').eq('assigned_to', emp.id)).data?.map(l => l.id) || []
    )
    .order('created_at', { ascending: false })
    .limit(20);

  res.json({ employee: emp, stageBreakdown, monthlyRevenue, recentActivities: activities || [] });
});

// GET /api/performance/leaderboard/current — current month leaderboard
router.get('/leaderboard/current', async (req, res) => {
  const now = new Date();
  const m   = now.getMonth() + 1;
  const y   = now.getFullYear();

  const startOfMonth = new Date(y, m - 1, 1).toISOString();
  const endOfMonth   = new Date(y, m, 0, 23, 59, 59).toISOString();

  const { data: employees } = await supabase
    .from('employees')
    .select('id,name,avatar,role')
    .neq('status', 'inactive');

  const board = await Promise.all((employees || []).map(async (emp) => {
    const { count: enrollments } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', emp.id)
      .eq('pipeline_stage', 'enrolled')
      .gte('updated_at', startOfMonth)
      .lte('updated_at', endOfMonth);

    const { data: revData } = await supabase
      .from('revenue_records')
      .select('amount')
      .eq('employee_id', emp.id)
      .gte('payment_date', startOfMonth.split('T')[0]);

    const revenue = (revData || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);

    return { ...emp, enrollments: enrollments || 0, revenue };
  }));

  board.sort((a, b) => b.revenue - a.revenue);
  board.forEach((e, i) => { e.rank = i + 1; });

  res.json(board);
});

// POST /api/performance/targets — upsert monthly targets
router.post('/targets', async (req, res) => {
  const { employeeId, month, year, revenueTarget, conversionTarget, leadsTarget } = req.body;
  if (!employeeId || !month || !year) {
    return res.status(400).json({ error: 'employeeId, month, year required' });
  }

  const { data, error } = await supabase
    .from('employee_targets')
    .upsert({
      employee_id:       employeeId,
      month:             parseInt(month),
      year:              parseInt(year),
      revenue_target:    revenueTarget    || 0,
      conversion_target: conversionTarget || 0,
      leads_target:      leadsTarget      || 0,
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'employee_id,month,year' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/performance/sla/report — SLA breach report
router.get('/sla/report', async (req, res) => {
  const { data: leads } = await supabase
    .from('leads')
    .select('id,name,phone,assigned_to,created_at,last_activity_at,pipeline_stage,employees!assigned_to(id,name,sla_hours)')
    .not('assigned_to', 'is', null)
    .not('pipeline_stage', 'in', '(enrolled,lost)')
    .order('created_at', { ascending: false })
    .limit(200);

  const breached = (leads || []).filter(lead => {
    const slaHours = lead.employees?.sla_hours || 4;
    const activityAt = lead.last_activity_at || new Date(0).toISOString();
    const hrs = (new Date(activityAt) - new Date(lead.created_at)) / 3_600_000;
    return hrs > slaHours;
  }).map(lead => ({
    ...lead,
    hoursOverdue: Math.round((Date.now() - new Date(lead.last_activity_at || lead.created_at)) / 3_600_000),
  }));

  res.json(breached);
});

module.exports = router;
