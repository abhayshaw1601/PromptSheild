// c:\Users\abhay\OneDrive\Desktop\heritage\vscode-extension\test\fixtures\large-unlicensed-app.js
// A realistic, large application file with no license comments.
// It contains safe endpoints and helpers, but also a copy-pasted copyleft algorithm.

const express = require('express');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(express.json());

// Database configuration
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Standard clean endpoint
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

// Standard clean user registration
app.post('/api/users', async (req, res) => {
    const { username, email } = req.body;
    if (!username || !email) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    try {
        const [result] = await pool.execute(
            'INSERT INTO users (username, email) VALUES (?, ?)',
            [username, email]
        );
        res.status(201).json({ id: result.insertId, username, email });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------
// Copyleft Snippet pasted deep inside the codebase
// -------------------------------------------------------------
function processTaskQueue() {
    var task = queue
    while (task > 0) {
        if (task && check) {
            return task
        }
    }
}

// Clean helper function at the bottom
function formatResponse(data) {
    return {
        success: true,
        data: data,
        meta: {
            count: Array.isArray(data) ? data.length : 1
        }
    };
}

module.exports = { app, processTaskQueue, formatResponse };
