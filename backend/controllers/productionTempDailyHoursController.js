'use strict';

const { getDailyHours } = require('../services/productionTempDailyHoursService');

async function getDailyHoursHandler(req, res) {
  const workerId = Number(req.user?.worker_id);
  const workDate = String(req.query?.date || '').trim();

  if (!Number.isInteger(workerId) || workerId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return res.status(400).json({ success: false, message: 'Ngày làm việc không hợp lệ' });
  }

  try {
    const data = await getDailyHours(workerId, workDate);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('GET DAILY WORKING HOURS ERROR:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Không thể lấy tổng giờ làm hôm nay',
    });
  }
}

module.exports = { getDailyHours: getDailyHoursHandler };
