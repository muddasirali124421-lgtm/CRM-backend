# OfficeCRM Backend — Complete API Inventory

**Base URL**: `http://localhost:5000/api`  
**Frontend Dev URL**: `http://localhost:5173`  
**Authorization**: `Authorization: Bearer <accessToken>`  
**Unconditional Super Admin Bypass**: `Role.isSuperAdmin === true`

---

## 1. System & Health

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | None | Health check & DB connectivity probe |

---

## 2. Authentication (`/api/auth`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | None (Rate-limited) | Authenticate staff user; issues access JWT & HttpOnly refresh cookie |
| `POST` | `/api/auth/refresh` | Public | Valid Refresh Token | Rotates refresh session & issues fresh access token |
| `POST` | `/api/auth/logout` | Authenticated | None | Invalidates/revokes database refresh session & clears cookie |
| `GET` | `/api/auth/me` | Authenticated | None | Returns user profile, linked employee, role, and effective permissions |

---

## 3. Dashboard Analytics (`/api/dashboard`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard/overview` | Authenticated | None (Financial masked) | Overall CRM counts; financial summary masked if lacking payment perms |
| `GET` | `/api/dashboard/activity` | Authenticated | None | Organization-wide recent activity timeline from audit log |
| `GET` | `/api/dashboard/my-work` | Authenticated | None | User's personal active projects, tasks, due today, and overdue items |

---

## 4. Employees (`/api/employees`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/employees` | Authenticated | `employees.view` | Paginated employee list with search, department, and status filters |
| `POST` | `/api/employees` | Authenticated | `employees.create` | Create new staff profile with auto-generated `EMP-xxxx` code |
| `GET` | `/api/employees/:id` | Authenticated | `employees.view` | Retrieve detailed employee profile and active relations count |
| `PATCH` | `/api/employees/:id` | Authenticated | `employees.edit` | Update employee professional details |
| `DELETE` | `/api/employees/:id` | Authenticated | `employees.delete` | Delete or deactivate employee (safeguarded against last Super Admin) |
| `POST` | `/api/employees/:id/account` | Authenticated | `settings.manage_users` | Provision login account for an existing employee |
| `PATCH` | `/api/employees/:id/account` | Authenticated | `settings.manage_users` | Update login email, role, or account status (Super Admin protected) |
| `POST` | `/api/employees/:id/account/reset-password` | Authenticated | `settings.manage_users` | Reset login password for an employee account |
| `GET` | `/api/employees/:id/permissions` | Authenticated | `settings.manage_permissions` | Get employee role default permissions and custom overrides |
| `PUT` | `/api/employees/:id/permissions` | Authenticated | `settings.manage_permissions` | Set explicit ALLOW, DENY, or remove overrides for an employee |

---

## 5. Roles & Permissions (`/api/roles`, `/api/permissions`, `/api/users`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/roles` | Authenticated | None / Dropdowns | List all system and custom roles with user counts |
| `GET` | `/api/roles/:id` | Authenticated | `settings.view` / `settings.manage_roles` | Retrieve role details and configured capability permissions |
| `POST` | `/api/roles` | Authenticated | `settings.manage_roles` | Create a new custom role (`isSuperAdmin: false`) |
| `PATCH` | `/api/roles/:id` | Authenticated | `settings.manage_roles` | Update custom role name or description |
| `DELETE` | `/api/roles/:id` | Authenticated | `settings.manage_roles` | Delete custom role (Super Admin, system, and assigned roles protected) |
| `GET` | `/api/roles/:id/permissions` | Authenticated | `settings.manage_permissions` | Get capability permissions matrix for a role |
| `PUT` | `/api/roles/:id/permissions` | Authenticated | `settings.manage_permissions` | Configure capability permissions for a role (Super Admin protected) |
| `GET` | `/api/permissions` | Authenticated | `settings.view` / `settings.manage_permissions` | Full catalog of system permissions grouped by module |
| `GET` | `/api/users` | Authenticated | `settings.manage_users` / `settings.view` | List all user login accounts with role and linked employee |
| `GET` | `/api/users/:id` | Authenticated | `settings.manage_users` / `settings.view` | Retrieve single user login account profile |
| `GET` | `/api/users/:id/permissions` | Authenticated | `settings.manage_permissions` | Get user's effective permissions and individual overrides |
| `PUT` | `/api/users/:id/permissions` | Authenticated | `settings.manage_permissions` | Set explicit ALLOW or DENY override directly by user ID |

---

## 6. Departments (`/api/departments`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/departments` | Authenticated | `employees.view` | List all departments with employee counts |
| `POST` | `/api/departments` | Authenticated | `employees.create` | Create a department |
| `GET` | `/api/departments/:id` | Authenticated | `employees.view` | Retrieve department profile |
| `PATCH` | `/api/departments/:id` | Authenticated | `employees.edit` | Update department details |
| `DELETE` | `/api/departments/:id` | Authenticated | `employees.delete` | Delete department (reassigns employees) |

---

## 7. Leads (`/api/leads`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/leads` | Authenticated | `leads.view` | Search and filter sales leads with pagination |
| `POST` | `/api/leads` | Authenticated | `leads.create` | Create prospect lead with auto-generated `LD-xxxx` code |
| `GET` | `/api/leads/:id` | Authenticated | `leads.view` | Retrieve lead details |
| `PATCH` | `/api/leads/:id` | Authenticated | `leads.edit` | Update lead details, stage, or priority |
| `PATCH` | `/api/leads/:id/assign` | Authenticated | `leads.assign` | Assign lead to sales employee |
| `PATCH` | `/api/leads/:id/status` | Authenticated | `leads.edit` | Update lead workflow status |
| `POST` | `/api/leads/:id/convert` | Authenticated | `leads.edit` | Convert qualified lead to client (transactional) |
| `DELETE` | `/api/leads/:id` | Authenticated | `leads.delete` | Delete lead |

---

## 8. Clients (`/api/clients`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/clients` | Authenticated | `clients.view` | Search, filter, and paginate client accounts |
| `POST` | `/api/clients` | Authenticated | `clients.create` | Create business customer with auto-generated `CL-xxxx` code |
| `GET` | `/api/clients/:id` | Authenticated | `clients.view` | Detailed client profile with project, task, and invoice relations |
| `PATCH` | `/api/clients/:id` | Authenticated | `clients.edit` | Update client profile, company, or address |
| `PATCH` | `/api/clients/:id/assign` | Authenticated | `clients.assign` | Assign account manager employee to client |
| `DELETE` | `/api/clients/:id` | Authenticated | `clients.delete` | Delete or deactivate client (safeguards related projects) |

---

## 9. Projects (`/api/projects`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/projects` | Authenticated | `projects.view` | List projects with status, client, manager, and date filters |
| `POST` | `/api/projects` | Authenticated | `projects.create` | Create project with auto-generated `PRJ-xxxx` code |
| `GET` | `/api/projects/:id` | Authenticated | `projects.view` | Retrieve project profile, milestones, and task counts |
| `PATCH` | `/api/projects/:id` | Authenticated | `projects.edit` | Update project status, dates, budget, or priority |
| `PATCH` | `/api/projects/:id/manager` | Authenticated | `projects.assign` | Assign/reassign project manager employee |
| `GET` | `/api/projects/:id/members` | Authenticated | `projects.view` | List assigned project team members |
| `POST` | `/api/projects/:id/members` | Authenticated | `projects.assign` | Add employee to project team with role |
| `DELETE` | `/api/projects/:id/members/:employeeId` | Authenticated | `projects.assign` | Remove member from project team |
| `DELETE` | `/api/projects/:id` | Authenticated | `projects.delete` | Delete or archive project |

---

## 10. Tasks & Kanban (`/api/tasks`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/tasks` | Authenticated | `tasks.view` | Paginated task list with project, client, assignee, and date filters |
| `GET` | `/api/tasks/kanban` | Authenticated | `tasks.view` | Group tasks by status columns (`TODO`, `IN_PROGRESS`, `QA`, `REVISION`, `COMPLETED`) |
| `POST` | `/api/tasks` | Authenticated | `tasks.create` | Create task with auto-generated `TSK-xxxx` code |
| `GET` | `/api/tasks/:id` | Authenticated | `tasks.view` | Retrieve task details, checklists, assignees, and comments |
| `PATCH` | `/api/tasks/:id` | Authenticated | `tasks.edit` | Update task title, description, priority, or due date |
| `PATCH` | `/api/tasks/:id/status` | Authenticated | `tasks.edit` | Transition workflow status (updates `completedAt` on COMPLETED) |
| `POST` | `/api/tasks/:id/assignees` | Authenticated | `tasks.assign` | Assign employee(s) to task |
| `DELETE` | `/api/tasks/:id/assignees/:employeeId` | Authenticated | `tasks.assign` | Remove assignee from task |
| `POST` | `/api/tasks/:id/checklist` | Authenticated | `tasks.edit` | Add checklist item to task |
| `PATCH` | `/api/tasks/:id/checklist/:itemId` | Authenticated | `tasks.edit` | Toggle checklist completion or reorder |
| `DELETE` | `/api/tasks/:id/checklist/:itemId` | Authenticated | `tasks.edit` | Remove checklist item |
| `POST` | `/api/tasks/:id/comments` | Authenticated | `tasks.create` | Post comment or threaded reply |
| `GET` | `/api/tasks/:id/comments` | Authenticated | `tasks.view` | Retrieve threaded comments |
| `GET` | `/api/tasks/:id/subtasks` | Authenticated | `tasks.view` | List subtasks linked to parent task |
| `POST` | `/api/tasks/:id/subtasks` | Authenticated | `tasks.create` | Create subtask under parent task |
| `GET` | `/api/tasks/:id/activities` | Authenticated | `tasks.view` | Retrieve audit history for task |
| `DELETE` | `/api/tasks/:id` | Authenticated | `tasks.delete` | Delete task |

---

## 11. Invoices & Payments (`/api/invoices`, `/api/payments`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/invoices` | Authenticated | `payments.view` | List invoices with client, project, status, and date filters |
| `POST` | `/api/invoices` | Authenticated | `payments.create_invoice` | Create invoice with line items, auto `INV-xxxx` code & Decimal math |
| `GET` | `/api/invoices/:id` | Authenticated | `payments.view` | Retrieve invoice details with line items and payment history |
| `PATCH` | `/api/invoices/:id` | Authenticated | `payments.edit_invoice` | Update invoice (DRAFT/SENT only) |
| `DELETE` | `/api/invoices/:id` | Authenticated | `payments.cancel_invoice` | Cancel/void invoice (blocked if payments exist) |
| `POST` | `/api/invoices/:id/payments` | Authenticated | `payments.record_payment` | Record payment against invoice; updates balance due atomically |
| `GET` | `/api/payments` | Authenticated | `payments.view` | List payment transactions |
| `GET` | `/api/payments/:id` | Authenticated | `payments.view` | Retrieve payment receipt details |
| `GET` | `/api/payments/summary` | Authenticated | `payments.view` | Compact revenue summary (invoiced, paid, outstanding, overdue) |

---

## 12. Files & Attachments (`/api/files`, `/api/file-folders`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/files` | Authenticated | `files.view` | List files with folder, related entity, and access filters |
| `POST` | `/api/files/upload` | Authenticated | `files.upload` | Upload file asset (`multipart/form-data`) with MIME/size validation |
| `GET` | `/api/files/:id` | Authenticated | `files.view` | Get file metadata |
| `GET` | `/api/files/:id/download` | Authenticated | `files.download` | Download file with authorization check and safe stream headers |
| `DELETE` | `/api/files/:id` | Authenticated | `files.delete` | Delete file asset and remove binary from storage |
| `POST` | `/api/files/:id/share` | Authenticated | `files.share` | Share private file with another user |
| `GET` | `/api/file-folders` | Authenticated | `files.view` | List hierarchical file folders |
| `POST` | `/api/file-folders` | Authenticated | `files.manage_folders` | Create folder |
| `PATCH` | `/api/file-folders/:id` | Authenticated | `files.manage_folders` | Rename folder or change parent |
| `DELETE` | `/api/file-folders/:id` | Authenticated | `files.manage_folders` | Delete folder |

---

## 13. Internal Chat (`/api/chat` + Socket.IO)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/chat/conversations` | Authenticated | `chat.view` | List active DMs, channels, and project conversations |
| `GET` | `/api/chat/unread` | Authenticated | `chat.view` | Get unread message count badge totals |
| `GET` | `/api/chat/search?q=...` | Authenticated | `chat.view` | Search message contents with access isolation |
| `POST` | `/api/chat/dm` | Authenticated | `chat.view`, `chat.send_messages` | Open or create 1-to-1 direct message conversation |
| `GET` | `/api/chat/channels` | Authenticated | `chat.view` | List chat channels |
| `POST` | `/api/chat/channels` | Authenticated | `chat.create_channels` | Create a new channel or group chat |
| `GET` | `/api/chat/channels/:id` | Authenticated | `chat.view` | Get channel details |
| `PATCH` | `/api/chat/channels/:id` | Authenticated | `chat.manage_channels` | Update channel name/description |
| `DELETE` | `/api/chat/channels/:id` | Authenticated | `chat.manage_channels` | Delete or archive channel |
| `GET` | `/api/chat/channels/:id/members` | Authenticated | `chat.view` | List channel members |
| `POST` | `/api/chat/channels/:id/members` | Authenticated | `chat.manage_channels` | Add staff member to channel |
| `DELETE` | `/api/chat/channels/:id/members/:userId` | Authenticated | `chat.view` | Remove member or leave channel |
| `GET` | `/api/chat/projects/:projectId` | Authenticated | `chat.view` | Get or create project discussion channel |
| `GET` | `/api/chat/conversations/:id/messages` | Authenticated | `chat.view` | Cursor-based message history |
| `POST` | `/api/chat/conversations/:id/messages` | Authenticated | `chat.send_messages` | Send message (threads, reactions, attachments) |
| `POST` | `/api/chat/conversations/:id/read` | Authenticated | `chat.view` | Mark conversation messages as read |
| `PATCH` | `/api/chat/messages/:id` | Authenticated | `chat.send_messages` | Edit own message |
| `DELETE` | `/api/chat/messages/:id` | Authenticated | `chat.delete_messages` | Soft-delete message |
| `POST` | `/api/chat/messages/:id/reactions` | Authenticated | `chat.send_messages` | Add emoji reaction |
| `DELETE` | `/api/chat/messages/:id/reactions/:emoji` | Authenticated | `chat.send_messages` | Remove emoji reaction |

---

## 14. Notifications & Preferences (`/api/notifications`, `/api/notification-preferences`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/notifications` | Authenticated | None (Owner scope) | Paginated list of user's own notifications |
| `GET` | `/api/notifications/unread-count` | Authenticated | None (Owner scope) | Get current unread notification count |
| `PATCH` | `/api/notifications/:id/read` | Authenticated | None (Owner scope) | Mark single notification as read |
| `PATCH` | `/api/notifications/read-all` | Authenticated | None (Owner scope) | Mark all notifications as read |
| `DELETE` | `/api/notifications/:id` | Authenticated | None (Owner scope) | Dismiss single notification |
| `POST` | `/api/notifications/system` | Authenticated | `settings.view` / `settings.manage_users` | Broadcast system notice to users |
| `GET` | `/api/notification-preferences` | Authenticated | None (Owner scope) | Get user's category notification preferences |
| `PATCH` | `/api/notification-preferences` | Authenticated | None (Owner scope) | Update category notification preferences |

---

## 15. Reports & Analytics (`/api/reports`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/reports/leads` | Authenticated | `reports.view` / `reports.view_sales` | Total leads, stage counts, conversion rate, sources, trend |
| `GET` | `/api/reports/clients` | Authenticated | `reports.view` / `reports.view_sales` | Total clients, new clients in period, source breakdown, trend |
| `GET` | `/api/reports/projects` | Authenticated | `reports.view` / `reports.view_projects` | Project status breakdown, completion rate, budget sum, trend |
| `GET` | `/api/reports/tasks` | Authenticated | `reports.view` / `reports.view_projects` | Task status breakdown, priority distribution, overdue, trend |
| `GET` | `/api/reports/employees` | Authenticated | `reports.view` / `reports.view_team` | Factual operational task and project load per employee |
| `GET` | `/api/reports/financial` | Authenticated | `reports.view` + (`reports.view_financial` / `payments.view`) | Invoiced, received, outstanding, overdue, revenue trend |
| `GET` | `/api/reports/:reportType/export?format=csv` | Authenticated | `reports.export` + underlying report capability | Server-side streaming CSV export with formula injection protection |

---

## 16. Workspace Settings (`/api/settings`)

| Method | Path | Auth | Capability Permission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/settings/workspace` | Authenticated | `settings.view` | Retrieve organization name, email, phone, timezone, currency |
| `PATCH` | `/api/settings/workspace` | Authenticated | `settings.edit_general` | Update workspace settings with IANA timezone & ISO currency validation |
