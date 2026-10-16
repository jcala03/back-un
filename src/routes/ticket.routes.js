const express = require('express');
const { list, create, detail, update } = require('../controllers/ticket.controller');
const { list: listMessages, create: createMessage } = require('../controllers/message.controller');
const { list: listTasks, create: createTask } = require('../controllers/task.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.use(requireAuth);
router.get('/', list);
router.post('/', create);
router.get('/:id/messages', listMessages);
router.post('/:id/messages', createMessage);
router.get('/:id/tasks', listTasks);
router.post('/:id/tasks', requireRole('support'), createTask);
router.get('/:id', detail);
router.patch('/:id', requireRole('support'), update);

module.exports = router;
