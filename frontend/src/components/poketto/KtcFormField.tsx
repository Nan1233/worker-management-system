import type { InputHTMLAttributes } from "react";
import { Input } from "../../poketto-template/ui/input";
export function KtcFormField({label,error,...props}:{label:string;error?:string}&InputHTMLAttributes<HTMLInputElement>){
 return <label className="grid gap-1.5 text-sm font-medium"><span>{label}</span><Input {...props} aria-invalid={!!error}/>{error&&<span className="text-xs font-normal text-destructive">{error}</span>}</label>;
}
