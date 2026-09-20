# OfficeCRM Backend Module Architecture

This directory is structured to host domain modules cleanly as the CRM backend evolves.

## Planned Modules

| Module | Purpose | Future Route Prefix |
| :--- | :--- | :--- |
| `auth` | Authentication, JWT issue/refresh, sessions, password reset | `/api/auth` |
| `users` | Security login accounts, status management, credentials | `/api/users` |
| `employees` | Staff business profiles, departments, job titles, records | `/api/employees` |
| `roles` | Role definitions, permissions mapping | `/api/roles` |
| `permissions`| Capability-based permission matrix & user overrides | `/api/permissions` |
| `leads` | Lead pipeline, qualification, contact records, conversion | `/api/leads` |
| `clients` | Company & individual client profiles, contracts | `/api/clients` |
| `projects` | Project tracking, status, team assignments, milestones | `/api/projects` |
| `tasks` | Task assignments, subtasks, kanban states, approvals | `/api/tasks` |
| `chat` | Internal messaging, direct & channel chats, Socket.IO | `/api/chat` + WS |
| `payments` | Invoicing, payment records, billing logs | `/api/payments` |
| `reports` | Financial & operational reports, aggregations, exports | `/api/reports` |
| `files` | S3/object storage metadata & upload/download signing | `/api/files` |
| `notifications` | System notifications, alerts, push/in-app delivery | `/api/notifications` |
| `settings` | System-wide configuration, organization settings | `/api/settings` |
| `audit` | Activity logs, security audit trail | `/api/audit` |

## Standard Internal Structure per Module

Each module will follow a modular pattern:
```
modules/<module_name>/
  ├── <module_name>.controller.ts
  ├── <module_name>.service.ts
  ├── <module_name>.routes.ts
  ├── <module_name>.validation.ts
  └── <module_name>.types.ts
```
