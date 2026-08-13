const service = require('../services/machineProductionEventService');
const { publicMessage } = require('../utils/httpError');

function actor(req){ return { id:Number(req.user?.id), role:String(req.user?.role||'').toLowerCase() }; }
function fail(res,error,fallback){ return res.status(error.status||500).json({success:false,code:error.code||undefined,message:publicMessage(error,fallback)}); }

exports.list=async(req,res)=>{try{return res.json({success:true,data:await service.listEvents({actor:actor(req),filters:req.query||{}})});}catch(e){return fail(res,e,'Không thể tải production events');}};
exports.get=async(req,res)=>{try{return res.json({success:true,data:await service.getEvent(Number(req.params.id),actor(req))});}catch(e){return fail(res,e,'Không thể tải production event');}};
exports.create=async(req,res)=>{try{return res.status(201).json({success:true,data:await service.createEvent({actor:actor(req),data:req.body||{},req})});}catch(e){return fail(res,e,'Không thể tạo production event');}};
exports.update=async(req,res)=>{try{return res.json({success:true,data:await service.updateEvent({id:Number(req.params.id),actor:actor(req),patch:req.body||{},req})});}catch(e){return fail(res,e,'Không thể cập nhật production event');}};
exports.link=async(req,res)=>{try{return res.json({success:true,data:await service.linkParticipants({id:Number(req.params.id),actor:actor(req),tempMachineLineIds:req.body?.temp_machine_line_ids||[],req})});}catch(e){return fail(res,e,'Không thể liên kết worker với production event');}};
exports.approve=async(req,res)=>{try{return res.json({success:true,data:await service.approveEvent({id:Number(req.params.id),actor:actor(req),req})});}catch(e){return fail(res,e,'Không thể duyệt production event');}};
