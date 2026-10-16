const express = require('express');
const { update } = require('../controllers/task.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

router.patch('/:id', requireAuth, requireRole('support'), update);

module.exports = router;
