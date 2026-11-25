'use strict';
const { masterWriteFields } = require('../domain/masterResourceDefinition');
async function readMasterResources(executor,cfg,scoped) {
  const sql = cfg.table === 'processes'
    ? `SELECT t.* FROM processes t WHERE 1=1 ${scoped.clause} ORDER BY ${cfg.order}`
    : `SELECT t.*, p.process_code, p.process_name FROM ${cfg.table} t LEFT JOIN processes p ON p.id=t.process_id WHERE 1=1 ${scoped.clause} ORDER BY ${cfg.order}`;
  const [rows] = await executor.query(sql,scoped.params);
  return rows;
}
async function insertMasterResource(executor,cfg,payload) {
  const {fields,values} = masterWriteFields(cfg,payload);
  const [result] = await executor.query(`INSERT INTO ${cfg.table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,values);
  return result;
}
async function updateMasterResource(executor,cfg,id,payload) {
  const {fields,values} = masterWriteFields(cfg,payload);
  const [result] = await executor.query(`UPDATE ${cfg.table} SET ${fields.map(field => field + '=?').join(', ')} WHERE id=?`,[...values,id]);
  return result;
}
async function deactivateMasterResource(executor,cfg,id) {
  return executor.query(`UPDATE ${cfg.table} SET status='inactive' WHERE id=?`,[id]);
}
module.exports = {readMasterResources,insertMasterResource,updateMasterResource,deactivateMasterResource};
