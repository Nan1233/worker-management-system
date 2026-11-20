/** Shared, pure metadata for the role-aware production master catalog.
 * Keep the field and role definitions here instead of re-creating them on each render.
 */
export type Row=Record<string,unknown>&{id?:number;status?:string;role?:string};
export type Resource='users'|'processes'|'defects'|'deductions'|'machines'|'standards';
export type Field={key:string;label:string;type?:'text'|'number'|'select';required?:boolean;min?:number;step?:number;options?:{value:string;label:string}[]};
export type ProcessOption={id:number;process_code:string;process_name:string};
export const allTabs:{key:Resource;label:string;description:string;roles:string[]}[]=[
{key:'users',label:'Người dùng',description:'Tài khoản, hồ sơ công nhân và phân công công đoạn',roles:['lead','manager','admin']},
{key:'processes',label:'Công đoạn',description:'Gia công và các công đoạn sản xuất',roles:['manager','admin']},
{key:'machines',label:'Máy',description:'Máy theo từng công đoạn',roles:['lead','manager','admin_ops','admin']},
{key:'standards',label:'Sản phẩm & định mức',description:'Mã sản phẩm và sản lượng chuẩn',roles:['lead','manager','admin_ops','admin']},
{key:'defects',label:'Lỗi NG',description:'Danh mục lỗi theo công đoạn',roles:['manager','admin']},
{key:'deductions',label:'Trừ giờ',description:'Lý do và thứ tự hiển thị',roles:['lead','manager','admin_ops','admin']}];
export const baseFields:Record<Exclude<Resource,'users'>,Field[]>={
processes:[{key:'process_code',label:'Mã công đoạn',required:true},{key:'process_name',label:'Tên công đoạn',required:true},{key:'description',label:'Mô tả'}],
machines:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'machine_code',label:'Mã máy',required:true},{key:'machine_name',label:'Tên máy',required:true}],
standards:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'product_code',label:'Mã sản phẩm',required:true},{key:'standard_output',label:'Định mức',type:'number',required:true,min:0.000001,step:0.000001}],
defects:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'defect_code',label:'Mã lỗi',required:true},{key:'defect_name',label:'Tên lỗi',required:true},{key:'sort_order',label:'Thứ tự',type:'number'}],
deductions:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'deduction_code',label:'Mã trừ giờ',required:true},{key:'deduction_name',label:'Tên trừ giờ',required:true},{key:'sort_order',label:'Thứ tự',type:'number'}]};
export const roleLabels:Record<string,string>={manager:'Quản lý',lead:'Tổ trưởng',worker:'Công nhân'};
export const codes:Partial<Record<Resource,string>>={standards:'product_code',defects:'defect_code',deductions:'deduction_code',machines:'machine_code',processes:'process_code'};
export const guide:Partial<Record<Resource,string>>={
 standards:'Mã sản phẩm và định mức sản lượng/giờ theo từng công đoạn.',
 defects:'Danh sách lỗi NG riêng cho từng công đoạn và thứ tự hiển thị.',
 deductions:'Danh sách lý do trừ giờ theo công đoạn, có thứ tự hiển thị.'
};
export const normalizedCode=(v:unknown)=>String(v??'').trim().toLocaleUpperCase('vi-VN');
export function parseProcessIds(value:unknown):string[]{if(Array.isArray(value))return value.map(String);return String(value||'').split(',').map(item=>item.trim()).filter(Boolean)}
