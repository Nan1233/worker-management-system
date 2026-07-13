export interface MenuItem {

    label:string;

    icon:string;

    path:string;

    end?:boolean;

}


export const menuConfig:{[key:string]:MenuItem[]}={


worker:[

{
    label:"Công đoạn",
    icon:"🏭",
    path:"/worker",
    end:true
},

{
    label:"Lịch sử",
    icon:"📋",
    path:"/worker/history"
},

{
    label:"Tài khoản",
    icon:"👤",
    path:"/worker/profile"
}

],



manager:[

{
    label:"Dashboard",
    icon:"📊",
    path:"/manager",
    end:true
},


{
    label:"Báo cáo chờ duyệt",
    icon:"📋",
    path:"/manager/reports"
},


{
    label:"Báo cáo đã duyệt",
    icon:"✅",
    path:"/manager/approved"
},


{
    label:"Tải báo cáo",
    icon:"📥",
    path:"/manager/export"
},


{
    label:"Thống kê",
    icon:"📈",
    path:"/manager/statistics"
},


{
    label:"Nhân viên",
    icon:"👥",
    path:"/manager/workers"
}


]


};