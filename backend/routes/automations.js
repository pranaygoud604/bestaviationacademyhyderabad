const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const DATA_DIR  = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'automations.json');

const DEFAULTS = [
  { id: '1', name: 'Daily Lead Import',   trigger: 'daily_8am',          action: 'auto_assign_leads',   status: 'active', success_rate: 98,  last_run: null },
  { id: '2', name: 'Hot Lead Alert',      trigger: 'on_lead_created',    action: 'flag_hot_leads',      status: 'active', success_rate: 100, last_run: null },
  { id: '3', name: 'Follow-up Reminder', trigger: 'after_24h_inactive', action: 'send_followup_alert', status: 'active', success_rate: 95,  last_run: null },
];

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULTS, null, 2));
      return DEFAULTS;
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeData(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET /api/automations
router.get('/', (_req, res) => {
  res.json(readData());
});

// POST /api/automations
router.post('/', (req, res) => {
  const { name, trigger, action } = req.body;
  if (!name || !trigger || !action) {
    return res.status(400).json({ error: 'name, trigger, and action are required' });
  }
  const data = readData();
  const item = {
    id:           crypto.randomUUID(),
    name,
    trigger,
    action,
    status:       'active',
    success_rate: 0,
    last_run:     null,
    created_at:   new Date().toISOString(),
  };
  data.push(item);
  writeData(data);
  res.json(item);
});

// PATCH /api/automations/:id  (toggle status, rename, etc.)
router.patch('/:id', (req, res) => {
  const data = readData();
  const idx  = data.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Automation not found' });
  data[idx] = { ...data[idx], ...req.body };
  writeData(data);
  res.json(data[idx]);
});

// DELETE /api/automations/:id
router.delete('/:id', (req, res) => {
  const data = readData().filter(a => a.id !== req.params.id);
  writeData(data);
  res.json({ success: true });
});

// POST /api/automations/:id/run — manual run, updates last_run
router.post('/:id/run', (req, res) => {
  const data = readData();
  const idx  = data.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Automation not found' });
  data[idx].last_run = new Date().toISOString();
  writeData(data);
  res.json({ success: true, ran_at: data[idx].last_run, automation: data[idx] });
});

module.exports = router;
