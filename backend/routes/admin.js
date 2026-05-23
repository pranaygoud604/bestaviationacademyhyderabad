const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');

// GET /api/admin/kpis — real-time KPI summary
router.get('/kpis', async (req, res) => {
  const now = new Date();
  const m   = now.getMonth() + 1;
  const y   = now.getFullYear();

  const startOfMonth = new Date(y, m - 1, 1).toISOString();
  const startOfDay   = new Date(now.setHours(0,0,0,0)).toISOString();
  now.setHours(23,59,59,999);
  const endOfDay = now.toISOString();
  now.setHours(0,0,0,0);

  const [
    { count: totalLeads },
    { count: newToday },
    { count: enrolled },
    { count: lost },
    { count: unassigned },
    { count: overdueTasks },
    { count: activeEmployees },
    { data: revenueData },
    { count: pendingDocs },
    { count: scheduledInterviews },
  ] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay).lte('created_at', endOfDay),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('pipeline_stage', 'enrolled'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('pipeline_stage', 'lost'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).is('assigned_to', null).not('pipeline_stage', 'in', '(enrolled,lost)'),
    supabase.from('follow_up_tasks').select('id', { count: 'exact', head: true }).in('status', ['overdue','pending']).lt('due_date', new Date().toISOString()),
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('revenue_records').select('amount').gte('payment_date', startOfMonth.split('T')[0]),
    supabase.from('aviation_documents').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabase.from('interviews').select('id', { count: 'exact', head: true }).eq('status', 'scheduled').gte('scheduled_at', new Date().toISOString()),
  ]);

  const monthRevenue = (revenueData || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  // Conversion rate
  const { count: active } = await supabase
    .from('leads').select('id', { count: 'exact', head: true })
    .not('pipeline_stage', 'in', '(enrolled,lost)');

  const totalActive = (active || 0) + (enrolled || 0);
  const conversionRate = totalActive > 0 ? Math.round(((enrolled || 0) / totalActive) * 100) : 0;

  // Average lead score
  const { data: scoreData } = await supabase
    .from('leads').select('score').not('pipeline_stage', 'in', '(lost)').limit(500);
  const avgScore = scoreData?.length
    ? Math.round(scoreData.reduce((s, l) => s + (l.score || 50), 0) / scoreData.length)
    : 50;

  res.json({
    totalLeads:          totalLeads       || 0,
    newToday:            newToday         || 0,
    enrolled:            enrolled         || 0,
    lost:                lost             || 0,
    unassigned:          unassigned       || 0,
    overdueTasks:        overdueTasks     || 0,
    activeEmployees:     activeEmployees  || 0,
    monthRevenue,
    conversionRate,
    avgScore,
    pendingDocs:         pendingDocs      || 0,
    scheduledInterviews: scheduledInterviews || 0,
  });
});

// GET /api/admin/team-health — per-employee health score and workload
router.get('/team-health', async (req, res) => {
  const { data: employees } = await supabase
    .from('employees')
    .select('id,name,avatar,role,sla_hours,target_monthly')
    .neq('status', 'inactive');

  const health = await Promise.all((employees || []).map(async (emp) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { count: activeLeads },
      { count: overdueTasks },
      { count: pendingTasks },
      { count: enrollments },
      { data: revenueData },
    ] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('assigned_to', emp.id).not('pipeline_stage', 'in', '(enrolled,lost)'),
      supabase.from('follow_up_tasks').select('id', { count: 'exact', head: true })
        .eq('assigned_to', emp.id).eq('status', 'overdue'),
      supabase.from('follow_up_tasks').select('id', { count: 'exact', head: true })
        .eq('assigned_to', emp.id).eq('status', 'pending'),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('assigned_to', emp.id).eq('pipeline_stage', 'enrolled')
        .gte('updated_at', monthStart),
      supabase.from('revenue_records').select('amount')
        .eq('employee_id', emp.id).gte('payment_date', monthStart.split('T')[0]),
    ]);

    const revenue   = (revenueData || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const target    = emp.target_monthly || 500000;
    const targetPct = Math.round((revenue / target) * 100);

    // Health score: higher active leads is good, overdue tasks is bad
    const healthScore = Math.max(0, Math.min(100,
      50 +
      Math.min(20, (enrollments || 0) * 5) -
      Math.min(30, (overdueTasks || 0) * 5) +
      Math.min(20, targetPct / 5) -
      (activeLeads > 30 ? 10 : 0) // overloaded penalty
    ));

    return {
      ...emp,
      activeLeads:  activeLeads  || 0,
      overdueTasks: overdueTasks || 0,
      pendingTasks: pendingTasks || 0,
      enrollments:  enrollments  || 0,
      revenue,
      targetPct,
      healthScore,
      status: healthScore >= 70 ? 'healthy' : healthScore >= 40 ? 'at_risk' : 'critical',
    };
  }));

  res.json(health);
});

// GET /api/admin/bottlenecks — leads stuck in stages
router.get('/bottlenecks', async (req, res) => {
  const STUCK_HOURS = {
    new:        48,
    contacted:  72,
    interested: 96,
    demo:       120,
    documents:  168,
    payment:    48,
  };

  const bottlenecks = [];
  for (const [stage, hours] of Object.entries(STUCK_HOURS)) {
    const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
    const { data: stuck } = await supabase
      .from('leads')
      .select('id,name,phone,pipeline_stage,score,assigned_to,last_activity_at,employees!assigned_to(name,avatar)')
      .eq('pipeline_stage', stage)
      .lt('last_activity_at', cutoff)
      .order('last_activity_at', { ascending: true })
      .limit(20);

    for (const lead of stuck || []) {
      const hoursStuck = Math.round(
        (Date.now() - new Date(lead.last_activity_at || lead.created_at).getTime()) / 3_600_000
      );
      bottlenecks.push({ ...lead, hoursStuck, stuckThreshold: hours });
    }
  }

  bottlenecks.sort((a, b) => b.hoursStuck - a.hoursStuck);
  res.json(bottlenecks);
});

// GET /api/admin/risk-alerts — combined risk feed
router.get('/risk-alerts', async (req, res) => {
  const alerts = [];

  // 1. Overdue follow-up tasks
  const { data: overdueTasks } = await supabase
    .from('follow_up_tasks')
    .select('id,title,due_date,lead_id,assigned_to,leads!lead_id(name,phone),employees!assigned_to(name)')
    .eq('status', 'overdue')
    .order('due_date', { ascending: true })
    .limit(10);

  for (const t of overdueTasks || []) {
    const hoursLate = Math.round((Date.now() - new Date(t.due_date).getTime()) / 3_600_000);
    alerts.push({
      type:     'overdue_task',
      severity: hoursLate > 24 ? 'critical' : 'high',
      message:  `Overdue follow-up: "${t.title}" — ${t.leads?.name} (${hoursLate}h late)`,
      employee: t.employees?.name,
      leadId:   t.lead_id,
      data:     t,
    });
  }

  // 2. High-score leads unassigned
  const { data: hotUnassigned } = await supabase
    .from('leads')
    .select('id,name,phone,score,source,created_at')
    .is('assigned_to', null)
    .gte('score', 65)
    .not('pipeline_stage', 'in', '(enrolled,lost)')
    .order('score', { ascending: false })
    .limit(5);

  for (const l of hotUnassigned || []) {
    alerts.push({
      type:     'hot_lead_unassigned',
      severity: 'critical',
      message:  `Hot lead unassigned: ${l.name} (score ${l.score}) — ${l.source}`,
      leadId:   l.id,
      data:     l,
    });
  }

  // 3. Leads in payment stage > 48h without conversion
  const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const { data: stalePay } = await supabase
    .from('leads')
    .select('id,name,phone,total_fees,paid_amount,assigned_to,last_activity_at,employees!assigned_to(name)')
    .eq('pipeline_stage', 'payment')
    .lt('last_activity_at', cutoff)
    .limit(5);

  for (const l of stalePay || []) {
    alerts.push({
      type:     'stale_payment',
      severity: 'high',
      message:  `Payment stalled for ${Math.round((Date.now() - new Date(l.last_activity_at).getTime()) / 3_600_000)}h: ${l.name}`,
      employee: l.employees?.name,
      leadId:   l.id,
      data:     l,
    });
  }

  // 4. Employees with 0 activity today
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const { data: employees } = await supabase
    .from('employees').select('id,name').eq('status', 'active');

  for (const emp of employees || []) {
    const { count } = await supabase
      .from('lead_activities')
      .select('id', { count: 'exact', head: true })
      .in('lead_id',
        (await supabase.from('leads').select('id').eq('assigned_to', emp.id)).data?.map(l => l.id) || ['00000000-0000-0000-0000-000000000000']
      )
      .gte('created_at', todayStart.toISOString());

    if ((count || 0) === 0) {
      alerts.push({
        type:     'no_activity',
        severity: 'medium',
        message:  `${emp.name} has no activity logged today`,
        employee: emp.name,
        data:     emp,
      });
    }
  }

  // Sort by severity
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((a, b) => (order[a.severity] || 3) - (order[b.severity] || 3));

  res.json(alerts);
});

// GET /api/admin/activity-feed — recent activities across all leads
router.get('/activity-feed', async (req, res) => {
  const { limit = 30 } = req.query;

  const { data, error } = await supabase
    .from('lead_activities')
    .select('*, leads!lead_id(id,name,phone,assigned_to,employees!assigned_to(name,avatar))')
    .order('created_at', { ascending: false })
    .limit(parseInt(limit));

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/admin/pipeline-velocity — avg days to close
router.get('/pipeline-velocity', async (req, res) => {
  const { data: enrolled } = await supabase
    .from('leads')
    .select('id,created_at,updated_at,pipeline_stage')
    .eq('pipeline_stage', 'enrolled')
    .order('updated_at', { ascending: false })
    .limit(50);

  const avgDays = (enrolled || []).reduce((s, l) => {
    const days = (new Date(l.updated_at) - new Date(l.created_at)) / 86_400_000;
    return s + days;
  }, 0) / Math.max(1, enrolled?.length || 1);

  const { data: lostLeads } = await supabase
    .from('leads')
    .select('id,created_at,updated_at')
    .eq('pipeline_stage', 'lost')
    .limit(50);

  const avgDaysToLose = (lostLeads || []).reduce((s, l) => {
    return s + (new Date(l.updated_at) - new Date(l.created_at)) / 86_400_000;
  }, 0) / Math.max(1, lostLeads?.length || 1);

  res.json({
    avgDaysToClose: Math.round(avgDays),
    avgDaysToLose:  Math.round(avgDaysToLose),
    sampleSize:     enrolled?.length || 0,
  });
});

module.exports = router;
