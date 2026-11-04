'use strict';

const toPositiveInteger = (value) => {
    const numberValue = Number(value);
    return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const getVietnamDateKey = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(
        parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
    );
    return \`\${values.year}-\${values.month}-\${values.day}\`;
};

const dateKeyToUtcDay = (dateKey) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const value = Date.UTC(year, month - 1, day);
    const date = new Date(value);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return Math.floor(value / 86400000);
};

const validateWorkerWorkDate = (workDate) => {
    const selectedDay = dateKeyToUtcDay(workDate);
    const todayDay = dateKeyToUtcDay(getVietnamDateKey());
    if (selectedDay === null || todayDay === null) return 'Ngày làm việc không hợp lệ';
    if (selectedDay > todayDay) return 'Không được gửi báo cáo cho ngày trong tương lai';
    if (selectedDay < todayDay - 14) return 'Chỉ được gửi báo cáo trong vòng 14 ngày gần nhất';
    return null;
};

module.exports = {
    toPositiveInteger,
    getVietnamDateKey,
    dateKeyToUtcDay,
    validateWorkerWorkDate,
};
