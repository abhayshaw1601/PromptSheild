/**
 * ============================================================
 *  CleanScribe — Licensed Code Test Fixtures
 *  File: test/fixtures/licensed-code-samples.js
 *
 *  Save this file in VS Code → CleanScribe will flag every
 *  section. Each sample mirrors a real-world scenario where
 *  a developer accidentally pastes or copies GPL'd code.
 *
 *  Run via CLI:
 *    node test/fixtures/run-fixture-check.js
 * ============================================================
 */

'use strict';

const cleanScribe = require('../../cleanScribeCore');

// ─────────────────────────────────────────────────────────────
//  FIXTURE 1 — Standard GPL-3.0 Boilerplate Header
//  The most common copyleft marker — the standard "This program
//  is free software" paragraph that appears at the top of every
//  GNU-licensed file. Triggers "GPL (Boilerplate)" detection.
// ─────────────────────────────────────────────────────────────

const FIXTURE_GPL3_BOILERPLATE = `
/*
 * sortlib.js — Fast sorting utilities
 *
 * This program is free software: you can redistribute it
 * and/or modify it under the terms of the GNU General Public
 * License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be
 * useful, but WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
 * PURPOSE. See the GNU General Public License for more details.
 */

function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
  return arr;
}

module.exports = { bubbleSort };
`.trim();

// ─────────────────────────────────────────────────────────────
//  FIXTURE 2 — SPDX Identifier (Most Common in Modern Code)
//  SPDX-License-Identifier lines are added by linters/tools
//  like `license-checker`, `addlicense`, or copy-paste from
//  GitHub. A single line is enough to legally bind the file.
// ─────────────────────────────────────────────────────────────

const FIXTURE_SPDX_AGPL = `
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024 OpenSource Foundation

const express = require('express');
const router  = express.Router();

router.get('/users', async (req, res) => {
  const users = await db.query('SELECT * FROM users');
  res.json(users);
});

router.post('/users', async (req, res) => {
  const { name, email } = req.body;
  const result = await db.query(
    'INSERT INTO users (name, email) VALUES (?, ?)',
    [name, email]
  );
  res.status(201).json({ id: result.insertId });
});

module.exports = router;
`.trim();

// ─────────────────────────────────────────────────────────────
//  FIXTURE 3 — GPL-2.0 Linux-Style Header
//  Common in kernel modules, driver code, or any C/systems code
//  ported to Node.js. GPL-2.0 is NOT compatible with GPL-3.0
//  and creates dual-licensing conflicts in mixed codebases.
// ─────────────────────────────────────────────────────────────

const FIXTURE_GPL2_LINUX_STYLE = `
/**
 * scheduler.js
 *
 * Licensed under the GPL version 2 or later.
 * GNU General Public License version 2
 *
 * Copyright (C) 2023 Linux Foundation Contributors
 */

class TaskScheduler {
  constructor() {
    this.queue   = [];
    this.running = false;
  }

  enqueue(task) {
    this.queue.push({ task, priority: task.priority ?? 0 });
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  async run() {
    this.running = true;
    while (this.queue.length > 0) {
      const { task } = this.queue.shift();
      try {
        await task.execute();
      } catch (err) {
        console.error('Task failed:', err);
        throw err;
      }
    }
    this.running = false;
  }
}

module.exports = TaskScheduler;
`.trim();

// ─────────────────────────────────────────────────────────────
//  FIXTURE 4 — AGPL-3.0 SaaS Trap (Most Dangerous for Startups)
//  AGPL is the "network copyleft" license — even running the
//  code as a web service requires you to open-source your entire
//  application stack. This is the highest-risk copyleft license.
// ─────────────────────────────────────────────────────────────

const FIXTURE_AGPL_SAAS_TRAP = `
/*
 * auth-service.js
 *
 * GNU Affero General Public License v3.0
 *
 * This software is licensed under the GNU Affero General
 * Public License. If you run a modified version of this
 * software as a network service, you must make the source
 * of your modified version available to users of that service.
 *
 * See <https://www.gnu.org/licenses/agpl-3.0.html>
 */

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcrypt');

async function authenticateUser(email, password, userRepo) {
  const user = await userRepo.findByEmail(email);
  if (!user) throw new Error('User not found');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

module.exports = { authenticateUser };
`.trim();

// ─────────────────────────────────────────────────────────────
//  FIXTURE 5 — LGPL (Lesser GPL) — Library Code
//  LGPL is slightly more permissive than GPL — you can link to
//  an LGPL library without open-sourcing your app. But if you
//  MODIFY the LGPL code and distribute it, the modifications
//  must be open-sourced. Still a significant legal risk.
// ─────────────────────────────────────────────────────────────

const FIXTURE_LGPL_LIBRARY = `
/**
 * vector-math.js
 * Released under the GNU Lesser General Public License v2.1
 *
 * This library is free software; you can redistribute it
 * and/or modify it under the terms of the GNU Lesser
 * General Public License as published by the Free Software
 * Foundation.
 */

function dotProduct(a, b) {
  if (a.length !== b.length) throw new RangeError('Vector length mismatch');
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

function magnitude(v) {
  return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
}

function normalize(v) {
  const mag = magnitude(v);
  if (mag === 0) throw new Error('Cannot normalize zero vector');
  return v.map(val => val / mag);
}

function cosineSimilarity(a, b) {
  return dotProduct(a, b) / (magnitude(a) * magnitude(b));
}

module.exports = { dotProduct, magnitude, normalize, cosineSimilarity };
`.trim();

// ─────────────────────────────────────────────────────────────
//  FIXTURE 6 — Worst Case: GPL Code + Leaked API Key
//  This is the most severe combined violation — copyleft license
//  AND a hard-coded secret in the same file. This would trigger
//  CRITICAL severity on both counts simultaneously.
// ─────────────────────────────────────────────────────────────

const FIXTURE_COMBINED_WORST_CASE = `
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2024 Open Source AI Project

const OpenAI = require('openai');

// ⚠ WARNING: This key should be in .env — left here for "testing"
const client = new OpenAI({ apiKey: 'sk-proj-MockKey12345678901234567890' });

/**
 * This program is free software: you can redistribute it and/or
 * modify it under the terms of the GNU General Public License.
 */
async function summarize(text) {
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a summarization assistant.' },
      { role: 'user',   content: \`Summarize this: \${text}\` },
    ],
  });
  return res.choices[0].message.content;
}

module.exports = { summarize };
`.trim();

// ─────────────────────────────────────────────────────────────
//  RUN ALL FIXTURE CHECKS
// ─────────────────────────────────────────────────────────────

const FIXTURES = [
  { name: 'GPL-3.0 Boilerplate Header',    code: FIXTURE_GPL3_BOILERPLATE,   lang: 'javascript' },
  { name: 'AGPL-3.0 SPDX Identifier',      code: FIXTURE_SPDX_AGPL,          lang: 'javascript' },
  { name: 'GPL-2.0 Linux-Style Header',    code: FIXTURE_GPL2_LINUX_STYLE,   lang: 'javascript' },
  { name: 'AGPL-3.0 SaaS Trap',           code: FIXTURE_AGPL_SAAS_TRAP,     lang: 'javascript' },
  { name: 'LGPL-2.1 Library Code',        code: FIXTURE_LGPL_LIBRARY,       lang: 'javascript' },
  { name: 'GPL + Leaked Key (CRITICAL)',   code: FIXTURE_COMBINED_WORST_CASE, lang: 'javascript' },
];

console.log('\n' + '═'.repeat(65));
console.log('  CleanScribe — Licensed Code Detection Report');
console.log('═'.repeat(65));

let totalViolations = 0;

for (const { name, code, lang } of FIXTURES) {
  const result = cleanScribe.scanDocument(code, lang);
  totalViolations += result.violations.length;

  // Header
  const icon = result.clean ? '✅' : (result.severity === 'CRITICAL' ? '🚨' : '⚠️ ');
  console.log(`\n${icon}  ${name}`);
  console.log('   ' + '─'.repeat(55));

  if (result.clean) {
    console.log('   No violations detected.');
  } else {
    console.log(`   Severity:   ${result.severity}`);
    console.log(`   Violations: ${result.violations.length}`);
    console.log(`   Scan time:  ${result.scanDurationMs}ms`);
    console.log('');

    for (const v of result.violations) {
      const typeIcon = v.type === 'LICENSE' ? '📄' : v.type === 'SECRET' ? '🔑' : '⚠️ ';
      console.log(`   ${typeIcon} [${v.severity.padEnd(8)}] ${v.label}`);
      console.log(`             Line ${v.lineIndex + 1}: "${v.matchText.slice(0, 55)}${v.matchText.length > 55 ? '…' : ''}"`);
    }

    // Show a snippet of the generated AI fix prompt
    console.log('');
    console.log('   📋 AI Fix Prompt Preview (first 200 chars):');
    console.log('   ' + result.refactorPrompt.slice(0, 200).replace(/\n/g, '\n   '));
    console.log('   …');
  }
}

console.log('\n' + '═'.repeat(65));
console.log(`  Total violations found: ${totalViolations} across ${FIXTURES.length} fixtures`);
console.log('═'.repeat(65) + '\n');
