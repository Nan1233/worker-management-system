exports.createReport = async(req,res)=>{


try{


if(!req.body.process_id){

return res.status(400).json({

message:"Thiếu công đoạn"

});

}



workerModel.getWorkerByUserId(

req.user.id,

async(err,result)=>{


if(err){

return res.status(500).json({

message:err.message

});

}



if(result.length===0){

return res.status(404).json({

message:"Không tìm thấy công nhân"

});

}



await Production.create({

...req.body,

worker_id:result[0].id

});



res.status(201).json({

success:true,

message:"Lưu báo cáo thành công"

});


}


);



}

catch(err){


res.status(500).json({

message:err.message

});


}


};