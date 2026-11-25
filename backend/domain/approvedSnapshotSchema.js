'use strict';
const APPROVED_SNAPSHOT_SCHEMA_VERSION = 2;

const REPORT_FIELDS = [
  'id','source_temp_id','worker_id','process_id',
  'work_date','entry_date','shift','operation_type','operation_mode',
  'machine_no','product_name',
  'total_time','actual_time','deduction_time',
  'standard_output','standard_version_id','machine_standard_id',
  'actual_output','tt_ok','tt_ng',
  // Legacy approved aggregate columns remain business state until a later cleanup wave removes them.
  'kqd_dap_lai','kqd_tuot','vo_do_long','xuoc_do_long','cong_gay','xoay','khong_dut',
  'bavia_hut','ppcm','loi_cao_su','ng_kich_thuoc','cat_lem',
  'note','extra_data','status','review_note',
  'training_percent_snapshot','exclude_kqd_from_tt_snapshot'
];

const MACHINE_LINE_FIELDS = [
  'machine_event_id','machine_id','machine_code',
  'product_standard_id','standard_version_id','machine_standard_id','product_code',
  'machine_time_hours','standard_output','maximum_output','standard_time_seconds','standard_source',
  'deduction_time_hours','deductions_json','counted_output','earned_standard_hours',
  'ok_quantity','ng_quantity','exclude_kqd_from_tt',
  'defects_json','sort_order'
];

module.exports = { APPROVED_SNAPSHOT_SCHEMA_VERSION, REPORT_FIELDS, MACHINE_LINE_FIELDS };
