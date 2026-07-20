const positiveInt = value => Number.isInteger(Number(value)) && Number(value) > 0;

const validate = (schema) => (req, res, next) => {
  const errors = {};
  for (const [field, rules] of Object.entries(schema || {})) {
    const source = rules.in === 'params' ? req.params : rules.in === 'query' ? req.query : req.body;
    const value = source?.[field];
    if (rules.required && (value === undefined || value === null || value === '')) errors[field] = `${field} là bắt buộc`;
    else if (value !== undefined && rules.type === 'positiveInt' && !positiveInt(value)) errors[field] = `${field} không hợp lệ`;
    else if (value !== undefined && rules.type === 'array' && !Array.isArray(value)) errors[field] = `${field} phải là danh sách`;
    else if (Array.isArray(value) && rules.minItems && value.length < rules.minItems) errors[field] = `${field} phải có ít nhất ${rules.minItems} phần tử`;
    else if (Array.isArray(value) && rules.maxItems && value.length > rules.maxItems) errors[field] = `${field} chỉ được tối đa ${rules.maxItems} phần tử`;
    else if (Array.isArray(value) && rules.itemType === 'positiveInt' && value.some(item => !positiveInt(item))) errors[field] = `${field} chứa phần tử không hợp lệ`;
    else if (Array.isArray(value) && rules.unique && new Set(value.map(String)).size !== value.length) errors[field] = `${field} không được chứa phần tử trùng`;
    else if (value !== undefined && rules.maxLength && String(value).length > rules.maxLength) errors[field] = `${field} vượt quá ${rules.maxLength} ký tự`;
  }
  if (Object.keys(errors).length) return res.status(422).json({ success:false, message:'Dữ liệu yêu cầu không hợp lệ', errors });
  next();
};
module.exports = validate;
