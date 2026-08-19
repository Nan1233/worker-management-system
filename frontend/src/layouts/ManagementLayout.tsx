import { Outlet } from "react-router-dom";
import PokettoRealTemplateShell from "./PokettoRealTemplateShell";
export default function ManagementLayout({role}:{role:"lead"|"manager"|"admin"}){return <PokettoRealTemplateShell role={role}><Outlet/></PokettoRealTemplateShell>;}
