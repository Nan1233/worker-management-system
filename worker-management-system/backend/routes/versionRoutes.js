const router = require('express').Router();
const { getVersion } = require('../controllers/versionController');
router.get('/', getVersion);
module.exports = router;
