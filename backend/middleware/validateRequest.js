const positiveInt = value => Number.isInteger(Number(value)) && Number(value) > 0;

const validate = (schema) => (req, res, next) => {
  const errors = {};
  for (const [field, rules] of Object.entries(schema || {})) {
    const source = rules.in === 'params' ? req.params : rules.in === 'query' ? req.query : req.body;
    const value = source?.[field];
    if (rules.required && (value === undefined || value === null || value === '')) errors[field] = `${field} là bắt buộc`;
    else if (value !== undefined && rules.type === 'positiveInt' && !positiveInt(value)) errors[field] = `${field} không hợp lệ`;
    else if (value !== undefined && rules.type === 'array' && !Array.isArray(value)) errors[field] = `${field} phải là danh sách`;
    else if (value !== undefined && rules.maxLength && String(value).length > rules.maxLength) errors[field] = `${field} vượt quá ${rules.maxLength} ký tự`;
  }
  if (Object.keys(errors).length) return res.status(422).json({ success:false, message:'Dữ liệu yêu cầu không hợp lệ', errors });
  next();
};
module.exports = validate;
