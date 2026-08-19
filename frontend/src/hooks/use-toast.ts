import * as React from "react";

export type Toast={id:string;title?:React.ReactNode;description?:React.ReactNode;action?:React.ReactNode;open?:boolean};

const ToastContext=React.createContext({toasts:[] as Toast[]});

export function useToast(){return React.useContext(ToastContext);}
