const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');

// GET /api/employees — all non-inactive employees with live queue count
router.get('/', async (req, res) => {
  const { data: employees, error } = await supabase
    .from('employees')
    .select('*')
    .neq('status', 'inactive');

  if (error) return res.status(500).json({ error: error.message });

  const withQueue = await Promise.all(
    employees.map(async (emp) => {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', emp.id)
        .not('status', 'in', '(converted,lost)');
      return { ...emp, queueCount: count || 0 };
    })
  );

  res.json(withQueue);
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  const { data: emp, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !emp) return res.status(404).json({ error: 'Employee not found' });
  res.json(emp);
});

// POST /api/employees — create
router.post('/', async (req, res) => {
  const { data: emp, error } = await supabase
    .from('employees')
    .insert(req.body)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(emp);
});

// PATCH /api/employees/:id — update
router.patch('/:id', async (req, res) => {
  const { data: emp, error } = await supabase
    .from('employees')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !emp) return res.status(404).json({ error: 'Employee not found' });
  res.json(emp);
});

module.exports = router;
