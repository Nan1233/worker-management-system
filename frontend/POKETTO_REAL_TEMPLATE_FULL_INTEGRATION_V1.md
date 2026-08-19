# Poketto Real Template — Full Web Integration V1

The real Poketto template primitives are now the authenticated application shell for all four roles:
- Worker
- Lead
- Manager
- Admin

Routing and business page components remain unchanged. Only the authenticated shell/layout boundary was replaced:
- SidebarProvider
- Sidebar
- SidebarMenu
- SidebarMenuButton
- SidebarInset
- SidebarTrigger
- template tokens/globals

Legacy layout CSS imports were removed from the old layout adapters. Page-specific styles remain untouched so business UI behavior is not accidentally changed.

No API, authentication, permissions, database, validation, Approve/Reject, Excel, or notification business logic was changed.
