import { Outlet } from "react-router-dom";
import PokettoRealTemplateShell from "./PokettoRealTemplateShell";

type ManagementRole = "lead" | "manager" | "admin";

/**
 * Presentation-only shell adapter.
 * KTC routes, permissions, APIs and page business logic remain unchanged;
 * the visual workspace is provided by the Poketto reference shell.
 */
function ManagementLayout({ role }: { role: ManagementRole }) {
  return (
    <PokettoRealTemplateShell role={role}>
      <Outlet />
    </PokettoRealTemplateShell>
  );
}

export default ManagementLayout;
