const asyncHandler = require('../middleware/async-handler');
const { pool } = require('../config/db');

const ticketStatuses = ['open', 'in_progress', 'resolved', 'closed'];
const priorities = ['low', 'medium', 'high', 'urgent'];

function validId(value) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function parseId(value, response) {
  if (!validId(value)) {
    response.status(400).json({ error: 'Ticket id must be a positive integer.' });
    return null;
  }
  return Number(value);
}

async function findAccessibleTicket(ticketId, user) {
  const values = [ticketId];
  let ownership = '';
  if (user.role === 'client') {
    values.push(user.id);
    ownership = 'AND t.user_id = $2';
  }
  const result = await pool.query(
    `SELECT t.id, t.title, t.description, t.status, t.priority, t.user_id,
            t.assigned_to, t.created_at, t.updated_at,
            json_build_object('id', owner.id, 'name', owner.name, 'email', owner.email, 'role', owner.role) AS client,
            CASE WHEN assignee.id IS NULL THEN NULL
              ELSE json_build_object('id', assignee.id, 'name', assignee.name, 'email', assignee.email, 'role', assignee.role)
            END AS assignee
     FROM tickets t
     JOIN users owner ON owner.id = t.user_id
     LEFT JOIN users assignee ON assignee.id = t.assigned_to
     WHERE t.id = $1 ${ownership}`,
    values,
  );
  return result.rows[0] || null;
}

const list = asyncHandler(async (request, response) => {
  const { status, priority, search } = request.query;
  if (status && !ticketStatuses.includes(status)) {
    return response.status(422).json({ error: 'Invalid ticket status filter.' });
  }
  if (priority && !priorities.includes(priority)) {
    return response.status(422).json({ error: 'Invalid ticket priority filter.' });
  }
  if (search !== undefined && (typeof search !== 'string' || search.length > 120)) {
    return response.status(422).json({ error: 'Search must be at most 120 characters.' });
  }

  const conditions = [];
  const values = [];
  if (request.user.role === 'client') {
    values.push(request.user.id);
    conditions.push(`t.user_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`t.status = $${values.length}`);
  }
  if (priority) {
    values.push(priority);
    conditions.push(`t.priority = $${values.length}`);
  }
  if (search) {
    values.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    conditions.push(`t.title ILIKE $${values.length} ESCAPE '\\'`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT t.id, t.title, t.description, t.status, t.priority, t.user_id,
            t.assigned_to, t.created_at, t.updated_at,
            json_build_object('id', owner.id, 'name', owner.name, 'email', owner.email, 'role', owner.role) AS client,
            CASE WHEN assignee.id IS NULL THEN NULL
              ELSE json_build_object('id', assignee.id, 'name', assignee.name, 'email', assignee.email, 'role', assignee.role)
            END AS assignee
     FROM tickets t JOIN users owner ON owner.id = t.user_id
     LEFT JOIN users assignee ON assignee.id = t.assigned_to
     ${where}
     ORDER BY t.created_at DESC, t.id DESC`,
    values,
  );
  return response.json({ data: result.rows });
});

const create = asyncHandler(async (request, response) => {
  const title = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
  const description = typeof request.body?.description === 'string'
    ? request.body.description.trim()
    : '';
  const priority = request.body?.priority === undefined ? 'medium' : request.body.priority;
  if (!title || !description) {
    return response.status(400).json({ error: 'Title and description are required.' });
  }
  if (title.length > 180 || description.length > 10000) {
    return response.status(422).json({ error: 'Title or description exceeds the maximum length.' });
  }
  if (!priorities.includes(priority)) {
    return response.status(422).json({ error: 'Invalid ticket priority.' });
  }

  const result = await pool.query(
    `INSERT INTO tickets (title, description, priority, user_id, status)
     VALUES ($1, $2, $3, $4, 'open')
     RETURNING id, title, description, status, priority, user_id, assigned_to, created_at, updated_at`,
    [title, description, priority, request.user.id],
  );
  return response.status(201).json({ data: result.rows[0] });
});

const detail = asyncHandler(async (request, response) => {
  const id = parseId(request.params.id, response);
  if (!id) return;
  const ticket = await findAccessibleTicket(id, request.user);
  if (!ticket) {
    return response.status(404).json({ error: 'Ticket not found.' });
  }
  return response.json({ data: ticket });
});

const update = asyncHandler(async (request, response) => {
  const id = parseId(request.params.id, response);
  if (!id) return;
  if (request.user.role !== 'support') {
    return response.status(403).json({ error: 'Only support can update tickets.' });
  }

  const allowedFields = ['status', 'priority', 'assigned_to'];
  const providedFields = Object.keys(request.body || {});
  if (providedFields.some((field) => !allowedFields.includes(field))) {
    return response.status(400).json({ error: 'Only status, priority, and assigned_to can be updated.' });
  }
  if (providedFields.length === 0) {
    return response.status(400).json({ error: 'At least one ticket field is required.' });
  }
  if (request.body.status !== undefined && !ticketStatuses.includes(request.body.status)) {
    return response.status(422).json({ error: 'Invalid ticket status.' });
  }
  if (request.body.priority !== undefined && !priorities.includes(request.body.priority)) {
    return response.status(422).json({ error: 'Invalid ticket priority.' });
  }
  const assignedTo = request.body.assigned_to;
  if (assignedTo !== undefined && assignedTo !== null) {
    if (!Number.isSafeInteger(assignedTo) || assignedTo <= 0) {
      return response.status(422).json({ error: 'assigned_to must be a support user id or null.' });
    }
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [assignedTo]);
    if (userResult.rowCount === 0 || userResult.rows[0].role !== 'support') {
      return response.status(422).json({ error: 'assigned_to must reference an existing support user.' });
    }
  }

  const values = [];
  const assignments = [];
  for (const field of allowedFields) {
    if (request.body[field] !== undefined) {
      values.push(request.body[field]);
      assignments.push(`${field} = $${values.length}`);
    }
  }
  values.push(id);
  const result = await pool.query(
    `UPDATE tickets SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${values.length}
     RETURNING id, title, description, status, priority, user_id, assigned_to, created_at, updated_at`,
    values,
  );
  if (result.rowCount === 0) {
    return response.status(404).json({ error: 'Ticket not found.' });
  }
  return response.json({ data: result.rows[0] });
});

module.exports = { list, create, detail, update, findAccessibleTicket, parseId };
