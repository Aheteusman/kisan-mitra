const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { getMe, updateMe, updateMeSchema } = require('./users.service');

const router = express.Router();

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const data = await getMe(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put('/me', authenticate, validate(updateMeSchema), async (req, res, next) => {
  try {
    const data = await updateMe(req.user.id, req.body);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;