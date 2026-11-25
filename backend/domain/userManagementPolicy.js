'use strict';
const ROLE_CREATE_RULES = {
  admin: ['manager', 'lead', 'worker'],
  admin_ops: ['lead', 'worker'],
  manager: ['lead', 'worker'],
  lead: ['worker']
};

const manageableRoles = (role) => ROLE_CREATE_RULES[role] || [];
const normalizeStatus = (value) => value === 'inactive' ? 'inactive' : 'active';
const normalizeProcessIds = (value) => [...new Set((Array.isArray(value) ? value : [])
  .map(Number).filter((id) => Number.isInteger(id) && id > 0))];
module.exports={manageableRoles,normalizeStatus,normalizeProcessIds};
