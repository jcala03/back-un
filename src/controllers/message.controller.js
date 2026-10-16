const asyncHandler = require('../middleware/async-handler');
const { pool } = require('../config/db');
const { findAccessibleTicket, parseId } = require('./ticket.controller');

const list = asyncHandler(async (request, response) => {
  const ticketId = parseId(request.params.id, response);
  if (!ticketId) return;
  const ticket = await findAccessibleTicket(ticketId, request.user);
  if (!ticket) {
    return response.status(404).json({ error: 'Ticket not found.' });
  }

  const result = await pool.query(
    `SELECT m.id, m.body, m.created_at,
            json_build_object('id', author.id, 'name', author.name, 'role', author.role) AS user
     FROM messages m JOIN users author ON author.id = m.user_id
     WHERE m.ticket_id = $1
     ORDER BY m.created_at ASC, m.id ASC`,
    [ticketId],
  );
  return response.json({ data: result.rows });
});

const create = asyncHandler(async (request, response) => {
  const ticketId = parseId(request.params.id, response);
  if (!ticketId) return;
  const body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
  if (!body) {
    return response.status(400).json({ error: 'Message body is required.' });
  }
  if (body.length > 5000) {
    return response.status(422).json({ error: 'Message body must be at most 5000 characters.' });
  }

  const ticket = await findAccessibleTicket(ticketId, request.user);
  if (!ticket) {
    return response.status(404).json({ error: 'Ticket not found.' });
  }

  const result = await pool.query(
    `INSERT INTO messages (body, ticket_id, user_id)
     VALUES ($1, $2, $3)
     RETURNING id, body, created_at`,
    [body, ticketId, request.user.id],
  );
  return response.status(201).json({
    data: { ...result.rows[0], user: { id: request.user.id, name: request.user.name, role: request.user.role } },
  });
});

module.exports = { list, create };
