require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { login, requireAuth } = require('./auth');
const kvRouter = require('./kv');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' })); // student photos are base64, can be large

app.post('/api/auth/login', login);
app.use('/api/kv', requireAuth, kvRouter);

// Serve the untouched frontend (index.html, login.html, app.js, all assets)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Swami Abhyasika (v20 full-stack) running at http://localhost:${PORT}`);
});
