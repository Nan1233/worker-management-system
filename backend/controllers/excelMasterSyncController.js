const service = require('../services/excelMasterSyncService');

function sendError(res, error) {
  console.error('EXCEL_MASTER_SYNC_ERROR', error);
  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Đồng bộ Excel thất bại',
    details: error.details || undefined
  });
}

exports.preview = async (req, res) => {
  try {
    const data = await service.preview(req.body || {});
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
};

exports.apply = async (req, res) => {
  try {
    const data = await service.apply(req.body || {}, req.user?.id);
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
};

exports.listBatches = async (req, res) => {
  try {
    const data = await service.listBatches(req.query.limit);
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
};

exports.getBatchLogs = async (req, res) => {
  try {
    const data = await service.getBatchLogs(Number(req.params.id));
    res.json({ success: true, data });
  } catch (error) { sendError(res, error); }
};
