const cors = require('cors');
const express = require('express');
const { pool } = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const ticketRoutes = require('./routes/ticket.routes');
const taskRoutes = require('./routes/task.routes');
const { notFound, errorHandler } = require('./middleware/error.middleware');

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173',
}));
app.use(express.json({ limit: '32kb' }));

app.get('/health', (request, response) => {
  pool.query('SELECT 1')
    .then(() => response.json({ status: 'ok', database: 'connected' }))
    .catch((error) => {
      console.error(`Health check database query failed: ${error.message}`);
      response.status(503).json({ status: 'error', database: 'unavailable' });
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/tasks', taskRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
