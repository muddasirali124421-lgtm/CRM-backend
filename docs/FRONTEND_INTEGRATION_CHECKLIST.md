# OfficeCRM — Frontend API Integration Checklist

This document details the recommended implementation sequence for connecting the React frontend (`E:\CRM DUL\CRM front`) to the production-hardened Node.js/PostgreSQL backend (`E:\CRM DUL\CRM Backend`).

> [!IMPORTANT]
> **Do not modify the React frontend during backend steps.** This checklist is for execution in the subsequent frontend integration phase.

---

## Ordered Integration Sequence

### Phase 1: Core Client & Authentication
- [ ] **Step 1: API Client & Base Configuration**
  - Configure Axios / Fetch client with `baseURL = http://localhost:5000/api`.
  - Set `withCredentials = true` to allow browser storage of the HttpOnly refresh cookie.
  - Establish standard request & response interceptors.
- [ ] **Step 2: Authentication (Login Flow)**
  - Connect `POST /api/auth/login`.
  - Save `accessToken` in memory / secure React context state (never in localStorage).
  - Handle rate limiting (`429`) and invalid credential (`401`) errors cleanly.
- [ ] **Step 3: Session Persistence & Silent Refresh**
  - Implement silent refresh interceptor calling `POST /api/auth/refresh` on `401` access token expiry.
  - Implement `POST /api/auth/logout` to clear server sessions and cookies on user sign-out.
- [ ] **Step 4: `/auth/me` Profile Initialization**
  - Call `GET /api/auth/me` on application boot.
  - Store current `user`, linked `employee`, and `role` in the global user store.
- [ ] **Step 5: Frontend Route Protection**
  - Guard protected routes with authentication gates.
  - Redirect unauthenticated sessions to `/login`.
- [ ] **Step 6: Effective Capability-Based Permissions**
  - Ingest `effectivePermissions` array from `/auth/me`.
  - Provide a permission utility: `can(permissionKey) => isSuperAdmin || permissions.includes(permissionKey)`.
  - Conditionally render action buttons (create, edit, delete, export) according to capabilities.

---

### Phase 2: Operations & Pipeline
- [ ] **Step 7: Dashboard Overview & My Work**
  - Connect `GET /api/dashboard/overview`.
  - Gracefully render operational counters and omit/mask financial charts if `financial === null`.
  - Connect `GET /api/dashboard/my-work` for personal tasks due today, overdue, and in progress.
  - Connect `GET /api/dashboard/activity` for the live audit timeline.
- [ ] **Step 8: Employees & User Management**
  - Connect `GET /api/employees` (search, department filter, pagination).
  - Connect employee create, edit, deactivate, and account provisioning (`/api/employees/:id/account`).
- [ ] **Step 9: Leads Management**
  - Connect `GET /api/leads` (status filters, search, sorting).
  - Connect lead creation, status updates, and lead assignment.
  - Connect transactional lead-to-client conversion: `POST /api/leads/:id/convert`.
- [ ] **Step 10: Clients Management**
  - Connect `GET /api/clients` and client profile view (`/api/clients/:id`).
  - Wire client create, update, and assigned account manager.
- [ ] **Step 11: Projects Management**
  - Connect `GET /api/projects` and project detail view.
  - Wire project manager assignment and team member roster management (`/api/projects/:id/members`).
- [ ] **Step 12: Tasks & Kanban Board**
  - Connect `GET /api/tasks` and `GET /api/tasks/kanban`.
  - Connect drag-and-drop status transitions (`PATCH /api/tasks/:id/status`).
  - Wire checklists, assignees, subtasks, and threaded task comments.

---

### Phase 3: Finance, Assets & Communications
- [ ] **Step 13: Invoices & Payments**
  - Connect `GET /api/invoices` and invoice detail view.
  - Connect invoice creation (`POST /api/invoices`) with line items.
  - Connect payment recording (`POST /api/invoices/:id/payments`) and financial summary widget.
- [ ] **Step 14: Files & Storage**
  - Connect `GET /api/files` and folder tree (`/api/file-folders`).
  - Wire drag-and-drop file upload (`POST /api/files/upload`) via `FormData`.
  - Connect secure file download (`GET /api/files/:id/download`).
- [ ] **Step 15: Internal Chat & Socket.IO**
  - Establish Socket.IO client connection to `http://localhost:5000` with `auth: { token: accessToken }`.
  - Connect direct messaging (`/api/chat/dm`), channels, and project chats.
  - Listen for real-time events: `chat:message:new`, `chat:message:edited`, `chat:typing:start`, `chat:typing:stop`.
- [ ] **Step 16: Notifications & Preferences**
  - Connect in-app bell notification dropdown (`GET /api/notifications`).
  - Subscribe to live Socket.IO room `user:<userId>` for `notification:new` and `notification:unread-count`.
  - Connect category alert preferences (`/api/notification-preferences`).

---

### Phase 4: Business Intelligence, Settings & Hardening
- [ ] **Step 17: Reports & Analytics**
  - Connect Leads, Clients, Projects, Tasks, and Employee operational reports.
  - Connect Financial report (`GET /api/reports/financial`) with permission checks.
  - Connect server-side CSV export trigger (`GET /api/reports/:reportType/export?format=csv`).
- [ ] **Step 18: Workspace Settings & Permission Matrix**
  - Connect `GET /api/settings/workspace` and `PATCH /api/settings/workspace`.
  - Connect role administration and permission matrix grid (`GET /api/permissions`, `PUT /api/roles/:id/permissions`).
  - Connect individual user overrides (`PUT /api/users/:id/permissions`).
- [ ] **Step 19: Mock Data Purge**
  - Systematically remove static/mock JSON data files from the React frontend.
  - Verify all components render cleanly with empty or loading database states.
- [ ] **Step 20: Full End-to-End User Verification**
  - Run full user flow across Super Admin, Admin, Manager, and Staff roles.
  - Validate mobile responsiveness, dark mode, and error toast notifications.
