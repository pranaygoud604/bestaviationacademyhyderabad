const supabase = require('../db/supabase');

async function assignLead() {
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .eq('status', 'active');

  if (!employees?.length) return null;

  const counts = await Promise.all(
    employees.map(async (emp) => {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', emp.id)
        .not('status', 'in', '(converted,lost)');
      return { employee: emp, count: count || 0 };
    })
  );

  counts.sort((a, b) => a.count - b.count);
  return counts[0].employee;
}

async function assignLeadToEmployee(leadId, employeeId) {
  const { data: lead } = await supabase
    .from('leads')
    .update({ assigned_to: employeeId, assigned_at: new Date().toISOString(), status: 'assigned' })
    .eq('id', leadId)
    .select('*, employees!assigned_to(id, name, email, avatar, role)')
    .single();
  return lead;
}

async function autoAssignAllUnassigned() {
  const { data: unassigned } = await supabase
    .from('leads')
    .select('*')
    .is('assigned_to', null)
    .eq('status', 'new')
    .order('created_at', { ascending: true });

  if (!unassigned?.length) return [];

  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .eq('status', 'active');

  if (!employees?.length) return [];

  const loadMap = {};
  employees.forEach((e) => { loadMap[e.id] = 0; });

  const { data: existing } = await supabase
    .from('leads')
    .select('assigned_to')
    .in('assigned_to', employees.map((e) => e.id))
    .not('status', 'in', '(converted,lost)');

  (existing || []).forEach((l) => {
    if (l.assigned_to) loadMap[l.assigned_to] = (loadMap[l.assigned_to] || 0) + 1;
  });

  const results = [];
  for (const lead of unassigned) {
    const sorted = employees.slice().sort(
      (a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0)
    );
    const chosen = sorted[0];
    loadMap[chosen.id]++;

    const { data: updated } = await supabase
      .from('leads')
      .update({ assigned_to: chosen.id, assigned_at: new Date().toISOString(), status: 'assigned' })
      .eq('id', lead.id)
      .select('*, employees!assigned_to(id, name, email, avatar, role)')
      .single();

    if (updated) results.push(updated);
  }

  return results;
}

module.exports = { assignLead, assignLeadToEmployee, autoAssignAllUnassigned };
