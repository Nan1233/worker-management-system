const version = require('../config/version');
exports.getVersion = (_req, res) => res.json({ success: true, data: version });
