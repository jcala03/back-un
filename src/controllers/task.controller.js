const asyncHandler = require('../middleware/async-handler');
const { pool } = require('../config/db');
const { findAccessibleTicket, parseId } = require('./ticket.controller');

const taskStatuses = ['pending', 'in_progress', 'completed'];

function validateDueDate(value) {
  if (value === null || value === '') return { valid: true, value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return { valid: false };
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? { valid: false } : { valid: true, value: date.toISOString() };
}

async function validateAssignee(value) {
  if (value === null) return true;
  if (!Number.isSafeInteger(value) || value <= 0) return false;
  const result = await pool.query('SELECT role FROM users WHERE id = $1', [value]);
  return result.rowCount > 0 && result.rows[0].role === 'support';
}

const list = asyncHandler(async (request, response) => {
  const ticketId = parseId(request.params.id, response);
  if (!ticketId) return;
  const ticket = await findAccessibleTicket(ticketId, request.user);
  if (!ticket) {
    return response.status(404).json({ error: 'Ticket not found.' });
  }
  const result = await pool.query(
    `SELECT t.id, t.title, t.description, t.status, t.ticket_id, t.assigned_to,
            t.due_date, t.created_at, t.updated_at,
            CASE WHEN assignee.id IS NULL THEN NULL
              ELSE json_build_object('id', assignee.id, 'name', assignee.name, 'role', assignee.role)
            END AS assignee
     FROM tasks t LEFT JOIN users assignee ON assignee.id = t.assigned_to
     WHERE t.ticket_id = $1 ORDER BY t.created_at ASC, t.id ASC`,
    [ticketId],
  );
  return response.json({ data: result.rows });
});

const create = asyncHandler(async (request, response) => {
  if (request.user.role !== 'support') {
    return response.status(403).json({ error: 'Only support can create tasks.' });
  }
  const ticketId = parseId(request.params.id, response);
  if (!ticketId) return;
  const ticket = await findAccessibleTicket(ticketId, request.user);
  if (!ticket) {
    return response.status(404).json({ error: 'Ticket not found.' });
  }

  const title = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
  const description = request.body?.description === undefined || request.body.description === null
    ? null
    : (typeof request.body.description === 'string' ? request.body.description.trim() : undefined);
  const assignedTo = request.body?.assigned_to === undefined ? null : request.body.assigned_to;
  const dueDate = validateDueDate(request.body?.due_date ?? null);
  if (!title) {
    return response.status(400).json({ error: 'Task title is required.' });
  }
  if (title.length > 180 || description === undefined || (description && description.length > 10000)) {
    return response.status(422).json({ error: 'Task title or description is invalid.' });
  }
  if (!dueDate.valid) {
    return response.status(422).json({ error: 'due_date must be a valid ISO date-time or null.' });
  }
  if (!(await validateAssignee(assignedTo))) {
    return response.status(422).json({ error: 'assigned_to must reference an existing support user or be null.' });
  }

  const result = await pool.query(
    `INSERT INTO tasks (title, description, ticket_id, assigned_to, due_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, title, description, status, ticket_id, assigned_to, due_date, created_at, updated_at`,
    [title, description, ticketId, assignedTo, dueDate.value],
  );
  return response.status(201).json({ data: result.rows[0] });
});

const update = asyncHandler(async (request, response) => {
  if (request.user.role !== 'support') {
    return response.status(403).json({ error: 'Only support can update tasks.' });
  }
  const id = parseId(request.params.id, response);
  if (!id) return;

  const allowedFields = ['title', 'description', 'status', 'assigned_to', 'due_date'];
  const fields = Object.keys(request.body || {});
  if (!fields.length) {
    return response.status(400).json({ error: 'At least one task field is required.' });
  }
  if (fields.some((field) => !allowedFields.includes(field))) {
    return response.status(400).json({ error: 'Only title, description, status, assigned_to, and due_date can be updated.' });
  }
  const existing = await pool.query('SELECT id FROM tasks WHERE id = $1', [id]);
  if (existing.rowCount === 0) {
    return response.status(404).json({ error: 'Task not found.' });
  }

  const updates = { ...request.body };
  if (updates.title !== undefined) {
    if (typeof updates.title !== 'string' || !updates.title.trim() || updates.title.trim().length > 180) {
      return response.status(422).json({ error: 'Task title must contain 1 to 180 characters.' });
    }
    updates.title = updates.title.trim();
  }
  if (updates.description !== undefined && updates.description !== null) {
    if (typeof updates.description !== 'string' || updates.description.length > 10000) {
      return response.status(422).json({ error: 'Task description must be at most 10000 characters or null.' });
    }
    updates.description = updates.description.trim();
  }
  if (updates.status !== undefined && !taskStatuses.includes(updates.status)) {
    return response.status(422).json({ error: 'Invalid task status.' });
  }
  if (updates.assigned_to !== undefined && !(await validateAssignee(updates.assigned_to))) {
    return response.status(422).json({ error: 'assigned_to must reference an existing support user or be null.' });
  }
  if (updates.due_date !== undefined) {
    const dueDate = validateDueDate(updates.due_date);
    if (!dueDate.valid) {
      return response.status(422).json({ error: 'due_date must be a valid ISO date-time or null.' });
    }
    updates.due_date = dueDate.value;
  }

  const values = [];
  const assignments = [];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      values.push(updates[field]);
      assignments.push(`${field} = $${values.length}`);
    }
  }
  values.push(id);
  const result = await pool.query(
    `UPDATE tasks SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${values.length}
     RETURNING id, title, description, status, ticket_id, assigned_to, due_date, created_at, updated_at`,
    values,
  );
  return response.json({ data: result.rows[0] });
});

module.exports = { list, create, update };
