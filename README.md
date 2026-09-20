# OfficeCRM Backend API

This is the backend service for the internal Office CRM / Agency Management System.

> **CRITICAL ARCHITECTURAL NOTE**:
> The frontend and backend are completely separate, decoupled applications:
> - Frontend location: `E:\CRM DUL\CRM front` (Vite + React)
> - Backend location: `E:\CRM DUL\CRM Backend` (Node.js + Express + TypeScript + Prisma + PostgreSQL)
> 
> Neither application shares dependencies, node_modules, or package configurations.

---

## 🛠 Tech Stack

- **Runtime**: Node.js (v20+)
- **Language**: TypeScript (ES2022)
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma ORM
- **Validation**: Zod
- **Security**: Helmet, CORS
- **Authentication**: JWT (`jsonwebtoken`) & `bcrypt` password hashing
- **Real-Time Ready**: Prepared for Socket.IO (HTTP server wrapper)

---

## 📁 Project Structure

```
CRM Backend/
├── prisma/
│   └── schema.prisma         # PostgreSQL schema & Prisma client configuration
├── src/
│   ├── config/
│   │   ├── env.ts            # Zod-validated environment configuration
│   │   └── database.ts       # Reusable singleton PrismaClient instance
│   ├── controllers/
│   │   └── health.controller.ts # Health check controller
│   ├── middleware/
│   │   ├── auth.middleware.ts     # JWT authenticate & capability-based authorize middleware
│   │   ├── error.middleware.ts    # 404 handler and centralized error handler
│   │   └── validate.middleware.ts # Reusable Zod request validation middleware
│   ├── modules/
│   │   └── README.md         # Planned domain modules documentation
│   ├── routes/
│   │   ├── api.router.ts     # Aggregate router under /api
│   │   └── health.router.ts  # /api/health route
│   ├── types/
│   │   ├── api.types.ts          # Standardized API response interfaces
│   │   ├── auth.types.ts         # User vs Employee architecture & JWT types
│   │   └── permissions.types.ts  # Capability-based permission system & roles
│   ├── utils/
│   │   ├── api-response.ts   # sendSuccess, sendError, and AppError helpers
│   │   ├── jwt.ts            # Access and refresh token sign/verify utilities
│   │   └── password.ts       # bcrypt password hashing and verification
│   ├── app.ts                # Express application configuration
│   └── server.ts             # HTTP server bootstrap & graceful shutdown
├── .env                      # Local environment variables (git-ignored)
├── .env.example              # Template for environment variables
├── .gitignore                # Git ignore rules
├── package.json              # Project dependencies and scripts
├── tsconfig.json             # TypeScript compiler configuration
└── README.md                 # Project documentation
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Application environment (`development`, `test`, `production`) | `development` |
| `PORT` | HTTP server listening port | `5000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/officecrm?schema=public` |
| `JWT_ACCESS_SECRET` | Secret key for signing Access Tokens (min 16 chars, 32+ recommended) | (Secure random secret) |
| `JWT_REFRESH_SECRET` | Secret key for signing Refresh Tokens (min 16 chars, 32+ recommended) | (Secure random secret) |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifespan | `15m` |
| `JWT_REFRESH_EXPIRES_IN`| Refresh token lifespan | `7d` |
| `FRONTEND_URL` | Allowed origin for CORS | `http://localhost:5173` |

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Prisma Client
```bash
npm run prisma:generate
```

### 3. Type Checking
```bash
npm run typecheck
```

### 4. Build for Production
```bash
npm run build
```

### 5. Run Development Server
```bash
npm run dev
```

### 6. Run Production Server
```bash
npm run start
```

---

## 🩺 Health Endpoint

Verify the API server is operational:

- **Method**: `GET`
- **URL**: `http://localhost:5000/api/health`
- **Auth**: Public (No authentication required)
- **Response**:
```json
{
  "success": true,
  "message": "OfficeCRM API is running"
}
```

---

## 🏛 Core Architectural Principles

### 1. User vs Employee Separation
- **Employee**: Business profile (name, department, job title, contact details, work history).
- **User**: Authentication credential account (login email, password hash, status, role).
- **Relationship**: 1 Employee <-> 0..1 User account.
- **Passwords are never stored directly on Employee profiles.**

### 2. Capability-Based Permissions
- No hard-coded role checks like `if (role === 'Admin')`.
- Only **Super Admin** bypasses permission checks.
- All other roles (including Admin) and custom roles use granular capability permissions (`module.action`).
- Effective permission evaluation:
  1. `IF user is Super Admin` -> Allow
  2. `ELSE IF User Permission Override exists` -> Use individual override
  3. `ELSE` -> Use Role Permission default

### 3. Database & Storage Architecture
- **PostgreSQL**: Exclusively used for structured relational data.
- **Object Storage**: Will be used for file binaries (documents, avatars, project files); PostgreSQL stores metadata only.
- **Socket.IO**: Real-time messaging will attach directly to the existing HTTP server instance in future iterations.

---

## 🗄 Database Schema & Entity Relationships

The PostgreSQL database schema consists of 35 models and 11 enums, fully structured for relational integrity:

### 1. Identity & Permissions
- `Employee` (1) ⟷ (0..1) `User`: Staff business profiles are strictly decoupled from authentication accounts.
- `User` (N) ⟶ (1) `Role`: Each user belongs to a system or custom role.
- `Role` (1) ⟷ (N) `RolePermission` (N) ⟷ (1) `Permission`: Granular capability permissions mapped to roles.
- `User` (1) ⟷ (N) `UserPermissionOverride` (N) ⟷ (1) `Permission`: User-level explicit GRANT/DENY overrides.

### 2. CRM Pipeline & Clients
- `Lead` (1) ⟶ (0..1) `Client`: Prospect records track qualification and can convert into official clients (`sourceLeadId`).
- `Employee` (1) ⟶ (N) `Lead`: Sales staff assignment.
- `Employee` (1) ⟶ (N) `Client`: Account manager assignment.

### 3. Project Management & Delivery
- `Client` (1) ⟶ (N) `Project`: Projects are executed for clients (`onDelete: Restrict`).
- `Employee` (1) ⟶ (N) `Project`: Project manager assignment (`onDelete: SetNull`).
- `Project` (1) ⟷ (N) `ProjectMember` (N) ⟷ (1) `Employee`: Relational team membership join table.
- `Project` (1) ⟶ (N) `Task`: Tasks are organized under projects (`onDelete: Cascade`).
- `Task` (1) ⟷ (N) `TaskAssignee` (N) ⟷ (1) `Employee`: Multi-employee task assignment join table.
- `Task` (1) ⟶ (N) `TaskChecklistItem`: Subtask checklist tracking.
- `Task` (1) ⟶ (N) `TaskComment`: Threaded user comments (`parentId` self-relation).
- `Task` (1) ⟶ (N) `TaskActivity`: Audit log of status/priority/assignee changes.

### 4. Invoicing & Financial Operations
- `Client` (1) ⟶ (N) `Invoice`: Client invoices (`onDelete: Restrict` prevents accidental cascade deletion of billing records).
- `Project` (1) ⟶ (N) `Invoice`: Optional project billing link.
- `Invoice` (1) ⟶ (N) `InvoiceItem`: Precise line items using PostgreSQL `Decimal` types.
- `Invoice` (1) ⟶ (N) `Payment`: Recorded payments with `Decimal` amounts, timestamps, and audit references.

### 5. File Management & Assets
- `FileFolder` (1) ⟶ (N) `FileFolder`: Self-referencing hierarchical folder tree.
- `FileAsset`: Binary metadata (size, MIME, S3 storage key, access levels).
- `FileAsset` (1) ⟷ (N) `FileShare` (N) ⟷ (1) `User`: Granular specific-user file sharing.

### 6. Real-Time Chat & Communications
- `ChatChannel`: Public, team, and project channels (`ChannelMember` join table).
- `ChatConversation`: 1-on-1 private direct messaging between two users.
- `ChatMessage`: Messages with thread support (`parentMessageId`), reactions (`ChatReaction`), and mentions (`ChatMention`).

### 7. Notifications, Preferences & System Audit
- `Notification`: In-app notification queue linked to recipient `User` and actor `User`.
- `NotificationPreference`: User configurable notification categories.
- `WorkspaceSetting`: Organization profile, logo, timezone, and default currency.
- `AuditLog`: Append-only audit trail capturing security and business events across all entities.
- `RefreshSession`: Database-backed refresh token tracking storing SHA-256 hashes for session revocation and rotation.

---

## 🔐 Authentication & Authorization

### 1. Super Admin Bootstrap
Because OfficeCRM does not allow public registration, the initial Super Admin account is bootstrapped via a dedicated CLI script:

```bash
npm run bootstrap:superadmin
```
- Collects First Name, Last Name, Email, and Password securely with masked terminal input.
- Automatically generates the next unique employee code (e.g. `EMP-0001`).
- Links the new `Employee` (in the `Management` department) with the `User` account within an atomic database transaction.
- Strictly protected against duplicate Super Admin creation.

### 2. Authentication Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public (Rate Limited) | Authenticates email + password, issues access token and sets HttpOnly refresh cookie |
| `POST` | `/api/auth/refresh` | Public / Cookie | Rotates refresh session in database and issues new access token |
| `POST` | `/api/auth/logout` | Authenticated / Cookie | Revokes refresh session in database and clears HttpOnly cookie |
| `GET` | `/api/auth/me` | Authenticated (`Bearer`) | Returns safe current user profile, linked employee, role, and effective permissions |

### 3. Token Architecture
- **Access Token**: Short-lived JWT (default `15m`) signed with `JWT_ACCESS_SECRET`. Passed in requests via `Authorization: Bearer <token>`.
- **Refresh Token**: High-entropy 40-byte opaque token (default `7d`) stored in the `RefreshSession` table as a SHA-256 hash. Delivered via an HttpOnly cookie (`officecrm_refresh_token`) with SameSite protection.
- **Rotation & Revocation**: Every refresh request rotates the token and marks the previous session revoked (`revokedAt`). Logout immediately revokes the session.

### 4. Permission Authorization Engine
- Protected routes use `authenticate` and `authorize('module.action')`.
- **Enforcement Rules**:
  1. If `user.role.isSuperAdmin === true` ➔ **ALLOW** (Root bypass).
  2. Else if `UserPermissionOverride` exists for `module.action` ➔ use `override.allowed` (Explicit Grant/Deny).
  3. Else if `RolePermission` exists for `module.action` ➔ use `rolePermission.allowed`.
  4. Else ➔ **DENY** (Default deny).

---

## 👥 Employee & User Account Management APIs

All endpoints require authentication (`Bearer <token>`) and enforce capability-based authorization.

### 1. Employee Directory

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/employees` | `employees.view` | Filterable list with pagination, search, status, role, and department filters |
| `POST` | `/api/employees` | `employees.create` | Creates employee with auto-generated code (`EMP-XXXX`) and email collision validation |
| `GET` | `/api/employees/:id` | `employees.view` | Detailed employee profile with department, linked user summary, and project/task counts |
| `PATCH` | `/api/employees/:id` | `employees.edit` | Updates employee profile (does not modify credentials or roles) |
| `DELETE` | `/api/employees/:id` | `employees.delete` | Safe deactivation if historical records exist; deletes clean records; protects last Super Admin |

### 2. User Account Management

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/employees/:id/account` | `settings.manage_users` | Creates login account for employee with temporary password (enforces password policy) |
| `PATCH` | `/api/employees/:id/account` | `settings.manage_users` | Updates login email, role, or account status (`ACTIVE`, `INACTIVE`, `SUSPENDED`) |
| `POST` | `/api/employees/:id/account/reset-password` | `settings.manage_users` | Administrative password reset with immediate session revocation |

### 3. Permission Overrides & Role Configuration

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/employees/:id/permissions` | `settings.manage_permissions` | Retrieves role defaults, user overrides, and calculated effective capabilities |
| `PUT` | `/api/employees/:id/permissions` | `settings.manage_permissions` | Configures explicit `ALLOW`, `DENY`, or reset to role default for individual users |
| `GET` | `/api/roles` | `authenticate` | Lists system and custom roles |
| `GET` | `/api/roles/:id/permissions` | `settings.manage_permissions` | Lists permissions and allowed status for a specific role |
| `PUT` | `/api/roles/:id/permissions` | `settings.manage_permissions` | Updates capabilities for non-Super-Admin roles (Super Admin is protected) |
| `GET` | `/api/departments` | `authenticate` | Lists departments for employee creation dropdowns |

### 4. Security & Super Admin Protections
- **Role Assignment**: Only an active Super Admin (`isSuperAdmin: true`) can assign the Super Admin role.
- **Account Modification**: Non-Super Admin users cannot modify or demote a Super Admin account.
- **Lockout Prevention**: The last active Super Admin cannot be suspended, deactivated, deleted, or demoted.
- **Self-Protection**: A Super Admin cannot suspend or demote their own account.
- **Session Revocation**: Suspending an account, changing an employee's role, or resetting their password immediately revokes all active refresh sessions.

---

## 🎯 Leads Management APIs

All Lead endpoints require authentication (`Bearer <token>`) and enforce capability-based authorization. Super Admin (`isSuperAdmin === true`) retains full bypass access.

### 1. Lead Endpoints

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/leads` | `leads.view` | Filterable list with pagination, multi-field search, status/priority/source/assignee/date filters |
| `POST` | `/api/leads` | `leads.create` | Creates a new lead with auto-generated code (`LEAD-XXXX`) and Zod validation |
| `GET` | `/api/leads/:id` | `leads.view` | Detailed lead record with assigned employee profile, notes, and conversion status |
| `PATCH` | `/api/leads/:id` | `leads.edit` | Updates business fields and status transitions (manual conversion to `CONVERTED` is disallowed) |
| `DELETE` | `/api/leads/:id` | `leads.delete` | Safe lead deletion; converted leads are permanently retained for audit history (returns 409) |
| `PATCH` | `/api/leads/:id/assign` | `leads.assign` | Assigns lead to an active employee; validates employee existence and suitability |
| `POST` | `/api/leads/:id/convert` | `leads.edit` + `clients.create` | Atomic database transaction converting a qualified lead into an official Client (`CL-XXXX`) |

### 2. Search, Filter & Pagination Query Parameters (`GET /api/leads`)

- **Pagination**: `page` (default `1`), `limit` (default `20`, max `100`).
- **Sorting**: `sortBy` (`createdAt`, `followUpAt`, `estimatedValue`, `firstName`, `company`), `sortOrder` (`asc`, `desc`).
- **Search**: `search` matches against `leadCode`, `firstName`, `lastName`, `company`, `email`, and `phone`.
- **Status Filter**: `status` (`NEW`, `CONTACTED`, `FOLLOW_UP`, `QUALIFIED`, `CONVERTED`, `LOST`).
- **Priority Filter**: `priority` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`).
- **Source Filter**: `source` (exact match or string query).
- **Assignment Filter**: `assignedToId` (Employee ID).
- **Follow-up Range Filter**: `followUpRange`:
  - `overdue`: `followUpAt` is before today (00:00:00 UTC).
  - `today`: `followUpAt` falls within today.
  - `upcoming`: `followUpAt` is scheduled after today.
- **Date Range Filters**: `createdFrom`, `createdTo`, `followUpFrom`, `followUpTo` (ISO date strings).

### 3. Lead Status Lifecycle & Transitions

```
    [ NEW ] ───► [ CONTACTED ] ───► [ FOLLOW_UP ] ───► [ QUALIFIED ] ───► [ CONVERTED ] (via /convert)
       │                 │                  │                │
       ▼                 ▼                  ▼                ▼
     [ LOST ]          [ LOST ]           [ LOST ]         [ LOST ]
```

- Status transitions are validated sensibly.
- Setting status directly to `CONVERTED` via `PATCH /api/leads/:id` is blocked (400) — conversion requires creating an official Client via `POST /api/leads/:id/convert`.

### 4. Atomic Lead ➔ Client Conversion (`POST /api/leads/:id/convert`)

- **Permissions**: Requires **both** `leads.edit` and `clients.create` (Super Admin bypasses both).
- **Execution Lifecycle**:
  1. Locates the target lead and checks that it has not already been converted. If already converted, returns **409 Conflict**.
  2. Generates the next sequential unique client code (e.g. `CL-0001`, `CL-0002`).
  3. Executes an atomic Prisma transaction (`prisma.$transaction`):
     - Creates the `Client` record inheriting `name` (Lead first + last name), `company`, `email`, `phone`, and optional client-specific conversion fields (`website`, `addressLine1`, `city`, `state`, `country`, `postalCode`).
     - Links `Client.sourceLeadId` directly to `Lead.id`.
     - Updates `Lead.status` to `CONVERTED`.
  4. Preserves the original Lead record for audit, reporting, and marketing analytics.
  5. Records an immutable `LEAD_CONVERTED` event in `AuditLog`.
  6. Returns the newly generated Client summary and updated Lead status.

### 5. Safe Financial Values (`estimatedValue`)
- Prisma `Decimal` fields are serialized safely as standard JavaScript numbers in API responses.
- Floating-point discrepancies and string type confusion are eliminated across all endpoints.

---

## 🏢 Clients Management APIs

All Client endpoints require authentication (`Bearer <token>`) and enforce capability-based authorization. Super Admin (`isSuperAdmin === true`) retains full bypass access.

### 1. Client Endpoints

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/clients` | `clients.view` | Filterable list with pagination metadata, search, status/assignee filters, date ranges, sorting, or lightweight compact mode (`compact=true`) |
| `POST` | `/api/clients` | `clients.create` | Creates a new Client directly (without a lead) with server-generated code (`CL-XXXX`) and Zod validation |
| `GET` | `/api/clients/:id` | `clients.view` | Detailed client record with assigned employee profile, source lead summary, and summary counts (`projects`, `openProjects`, `tasks`, `invoices`, `outstandingInvoices`) |
| `PATCH` | `/api/clients/:id` | `clients.edit` | Updates whitelisted client business fields (name, contact, address, status, assignedToId) |
| `PATCH` | `/api/clients/:id/assign` | `clients.assign` | Dedicated assignment endpoint; verifies assigned employee exists and is active |
| `DELETE` | `/api/clients/:id` | `clients.delete` | Safe archive/delete: clients with historical records (`sourceLeadId`, projects, tasks, invoices) are archived (`status = INACTIVE`); unlinked clients are cleanly deleted |

### 2. Search, Filter & Pagination Query Parameters (`GET /api/clients`)

- **Pagination**: `page` (default `1`), `limit` (default `20`, max `100`).
- **Sorting**: `sortBy` (`createdAt`, `name`, `company`, `clientCode`, `status`), `sortOrder` (`asc`, `desc`).
- **Search**: `search` matches against `clientCode`, `name`, `company`, `email`, and `phone`.
- **Status Filter**: `status` (`ACTIVE`, `INACTIVE`, `LEAD`).
- **Assignment Filter**: `assignedToId` (Employee ID).
- **Conversion Filter**: `isConverted` (`true` for clients converted from leads, `false` for direct clients).
- **Date Range Filters**: `startDate`, `endDate` (ISO date strings).
- **Compact Mode**: `compact=true` returns lightweight objects (`id`, `clientCode`, `name`, `company`, `status`) sorted alphabetically for dropdowns and pickers.

### 3. Direct Client vs Converted Client

- **Direct Clients**: Created via `POST /api/clients` with `sourceLeadId = null`.
- **Converted Clients**: Created via `POST /api/leads/:id/convert` with `sourceLeadId` linked to the originating Lead record. Retain origin metadata and allow bi-directional tracking without modifying the preserved Lead record.

### 4. Safe Archive vs Clean Delete Behavior

- When `DELETE /api/clients/:id` is requested:
  - If the client has historical relations (`sourceLeadId !== null`, projects > 0, tasks > 0, or invoices > 0):
    - Destructive deletion is blocked to prevent cascading loss of business history.
    - Status is updated to `INACTIVE`.
    - Returns `{ archived: true, client: ..., message: 'Client has historical records and was archived (status set to INACTIVE).' }`.
    - Logs `CLIENT_ARCHIVED` in `AuditLog`.
  - If the client is completely unlinked:
    - Hard-deletes the record.
    - Returns `{ deleted: true, message: 'Client deleted successfully.' }`.
    - Logs `CLIENT_DELETED` in `AuditLog`.

---

## 🚀 Projects Management APIs

All Project endpoints require authentication (`Bearer <token>`) and enforce capability-based authorization. Super Admin (`isSuperAdmin === true`) retains full bypass access.

### 1. Project Endpoints

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/projects` | `projects.view` | Filterable list with pagination metadata, multi-field search, status/priority/client/manager/team filters, date ranges, and sorting |
| `POST` | `/api/projects` | `projects.create` | Creates a new Project linked to a valid Client with server-generated code (`PRJ-XXXX`) and Zod validation |
| `GET` | `/api/projects/:id` | `projects.view` | Detailed project record with safe client summary, manager summary, team members list, and task status summary counts |
| `PATCH` | `/api/projects/:id` | `projects.edit` | Updates whitelisted project business fields (name, description, status, priority, dates, budget, currency, managerId) |
| `PATCH` | `/api/projects/:id/manager` | `projects.assign` | Assigns or reassigns Project Manager; validates employee is active |
| `GET` | `/api/projects/:id/team` | `projects.view` | Lists assigned team members with safe employee profiles |
| `POST` | `/api/projects/:id/team` | `projects.assign` | Adds an active employee as a team member; prevents duplicate membership (`409 Conflict`) |
| `DELETE` | `/api/projects/:id/team/:employeeId` | `projects.assign` | Removes employee from project team without deleting the employee profile |
| `DELETE` | `/api/projects/:id` | `projects.delete` | Safe archive/delete: projects with historical records (tasks, invoices) are archived (`status = CANCELLED`); clean unlinked projects are safely hard-deleted |

### 2. Search, Filter & Pagination Query Parameters (`GET /api/projects`)

- **Pagination**: `page` (default `1`), `limit` (default `20`, max `100`).
- **Sorting**: `sortBy` (`createdAt`, `name`, `projectCode`, `status`, `priority`, `startDate`, `dueDate`, `budget`), `sortOrder` (`asc`, `desc`).
- **Search**: `search` matches against `projectCode`, project `name`, and client `name` / `company`.
- **Status Filter**: `status` (`PLANNING`, `IN_PROGRESS`, `QA_REVIEW`, `REVISION`, `COMPLETED`, `ON_HOLD`, `CANCELLED`).
- **Priority Filter**: `priority` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`).
- **Client Filter**: `clientId` (returns all projects belonging to a client; powers Client Profile → Projects tab).
- **Manager Filter**: `managerId` (returns projects managed by an employee).
- **Team Member Filter**: `teamMemberId` (returns projects assigned to a team member).
- **Date Range Filters**: `startDateFrom`, `startDateTo`, `dueDateFrom`, `dueDateTo` (ISO date strings).

### 3. Project Status Lifecycle & Automatic Completion Timestamps

- Supported statuses: `PLANNING`, `IN_PROGRESS`, `QA_REVIEW`, `REVISION`, `COMPLETED`, `ON_HOLD`, `CANCELLED`.
- When transitioning to `COMPLETED`: `completedAt` timestamp is automatically set if not provided.
- When reopening away from `COMPLETED`: `completedAt` timestamp is automatically cleared to `null`.
- Status transitions are audited in `AuditLog` via `PROJECT_STATUS_CHANGED`.

### 4. Client & Staff Relations

- **Client Relation**: Every project is relationally bound to a valid `Client` (`clientId`). Invalid client IDs are rejected with `400 Bad Request`.
- **Project Manager**: Relation to `Employee` (`managerId`). Assignee must exist and have `employmentStatus === 'ACTIVE'`.
- **Team Members**: Relational many-to-many join via `ProjectMember` (`projectId`, `employeeId`, `projectRole`, `joinedAt`). Prevents duplicate membership (`409 Conflict`) and verifies staff is active.

### 5. Safe Archive vs Clean Delete Behavior

- When `DELETE /api/projects/:id` is requested:
  - If project has historical tasks or invoices (`tasks > 0 || invoices > 0`):
    - Hard delete is prohibited to protect historical tracking.
    - Project is archived by setting `status = CANCELLED`.
    - Returns `{ archived: true, project: ..., message: 'Project has historical records and was archived (status set to CANCELLED).' }`.
    - Logs `PROJECT_ARCHIVED` in `AuditLog`.
  - If project has zero tasks and zero invoices:
    - Hard-deletes the project and its `ProjectMember` join records (`onDelete: Cascade`), leaving Client and Employee records intact.
    - Returns `{ deleted: true, message: 'Project deleted successfully.' }`.
    - Logs `PROJECT_DELETED` in `AuditLog`.

---

## 📋 Tasks & Kanban Management APIs

All Task endpoints require authentication (`Bearer <token>`) and enforce capability-based authorization. Super Admin (`isSuperAdmin === true`) retains full bypass access.

### 1. Task Endpoints Summary

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tasks` | `tasks.view` | Filterable task list with pagination, search, status/priority/project/client/assignee/creator/due-date/overdue filters, sorting, and Kanban view support (`?view=kanban`) |
| `POST` | `/api/tasks` | `tasks.create` | Creates a new Task linked to a Project; auto-derives client, validates assignees, generates collision-safe code (`TASK-XXXX`), and records `TASK_CREATED` activity |
| `GET` | `/api/tasks/:id` | `tasks.view` | Complete Task Details payload including project, client, creator, assignees, checklist, subtasks, threaded comments, activity history, and file attachments metadata |
| `PATCH` | `/api/tasks/:id` | `tasks.edit` | Validated updates for task business fields (title, description, priority, dates) with change auditing |
| `DELETE` | `/api/tasks/:id` | `tasks.delete` | Deletes a task record, cascading its checklist, comments, activities, and subtasks while creating an `AuditLog` entry |
| `PATCH` | `/api/tasks/:id/status` | `tasks.edit` / `tasks.approve` | Dedicated Kanban drag/drop status movement; idempotent; enforces `tasks.approve` when transitioning from `QA` to `COMPLETED` |
| `GET` | `/api/tasks/:id/assignees` | `tasks.view` | Retrieves list of assigned employees with safe profile summaries |
| `POST` | `/api/tasks/:id/assignees` | `tasks.assign` | Assigns an active project member to the task; prevents duplicate assignment (`409 Conflict`) |
| `DELETE` | `/api/tasks/:id/assignees/:employeeId` | `tasks.assign` | Removes an assignee from the task without affecting employee profiles |
| `GET` | `/api/tasks/:id/checklist` | `tasks.view` | Lists checklist items ordered by position |
| `POST` | `/api/tasks/:id/checklist` | `tasks.edit` | Adds a new checklist item with automatic next position calculation |
| `PATCH` | `/api/tasks/:id/checklist/reorder` | `tasks.edit` | Reorders checklist items sequentially according to provided item IDs array |
| `PATCH` | `/api/tasks/:id/checklist/:itemId` | `tasks.edit` | Updates checklist item title or completed state; logs `TASK_CHECKLIST_COMPLETED` when completed |
| `DELETE` | `/api/tasks/:id/checklist/:itemId` | `tasks.edit` | Deletes a checklist item from the task |
| `GET` | `/api/tasks/:id/subtasks` | `tasks.view` | Lists subtasks linked via Prisma self-relation (`parentTaskId`) |
| `POST` | `/api/tasks/:id/subtasks` | `tasks.create` | Creates a subtask as a real Task record inheriting project & client from parent task |
| `GET` | `/api/tasks/:id/comments` | `tasks.view` | Lists top-level comments with nested replies and safe author details |
| `POST` | `/api/tasks/:id/comments` | `tasks.view` | Posts a new comment or threaded reply (`parentId`) with author pinned to authenticated user |
| `PATCH` | `/api/tasks/:id/comments/:commentId` | `tasks.view` | Updates comment content; restricted to comment author or Super Admin (`403 Forbidden` otherwise) |
| `DELETE` | `/api/tasks/:id/comments/:commentId` | `tasks.view` | Deletes comment and its replies; restricted to comment author, Super Admin, or users with `tasks.delete` |
| `GET` | `/api/tasks/:id/activity` | `tasks.view` | Returns chronological activity timeline for the task (`newest first`) |

### 2. Kanban View & Idempotent Status Movements

- **Dual-View Power**: The same underlying `Task` records power both List View and Kanban View. No separate Kanban storage is created.
- **Kanban Grouping**: `GET /api/tasks?view=kanban` returns tasks grouped into columns:
  - `TODO`
  - `IN_PROGRESS`
  - `QA`
  - `REVISION`
  - `COMPLETED`
- **Idempotent Movement**: `PATCH /api/tasks/:id/status` returns the task immediately if `status` is already the requested value, avoiding redundant activity events or completedAt timestamp overwrites.
- **QA Approval Rule**: Moving a task from `QA` to `COMPLETED` requires elevated `tasks.approve` capability (or `isSuperAdmin === true`). Moving without this capability returns `403 Forbidden`.
- **Completion & Reopen Lifecycle**:
  - Transition to `COMPLETED`: automatically sets `completedAt = now()` and logs `TASK_COMPLETED`.
  - Transition away from `COMPLETED`: automatically resets `completedAt = null` and logs `TASK_REOPENED`.

### 3. Project Validation & Team Assignment Architecture

- **Project Integrity**: Tasks must reference an existing, non-cancelled Project.
- **Client Derivation**: The task's `clientId` is automatically derived from `project.clientId`. Supplying a mismatched `clientId` is rejected with `400 Bad Request`.
- **Team Assignment Policy**: Assignees must be active employees and must belong to the project team (as Project Manager or Project Member). Assigning an employee outside the project team is rejected with `400 Bad Request` with an explicit, informative error message.

### 4. Overdue Calculation

- Dynamic calculation: `isOverdue = dueDate < now && status !== 'COMPLETED'`.
- Not permanently stored as a static boolean; calculated dynamically and exposed on all safe task payloads.
- Filterable in list queries via `?overdue=true` or `?overdue=false`.

### 5. Subtasks & Checklist Architecture

- **Subtasks as Real Tasks**: Implemented via clean Prisma self-relation (`parentTaskId` on `Task`), inheriting project and client contexts while maintaining their own status, assignees, dates, and collision-safe `TASK-XXXX` codes.
- **Checklists**: Backed by `TaskChecklistItem`, featuring integer-based positions, reordering support, and automatic completion timeline auditing.

---

## 💰 Invoices & Payments APIs

All Invoice and Payment endpoints require authentication (`Bearer <token>`) and enforce capability-based authorization. Super Admin (`isSuperAdmin === true`) retains full bypass access.

### 1. Invoice Endpoints Summary

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/invoices` | `payments.view` | Filterable list of invoices with pagination metadata, multi-field search, status/client/project/date/overdue filters, and sorting |
| `POST` | `/api/invoices` | `payments.create_invoice` / `payments.create` | Creates a new Invoice with line items; validates client & project; calculates line totals, subtotal, tax, discount, total, and balanceDue server-side |
| `GET` | `/api/invoices/:id` | `payments.view` | Complete safe Invoice Details payload including client summary, project summary, line items, and payment history |
| `PATCH` | `/api/invoices/:id` | `payments.edit_invoice` / `payments.edit` | Validated update for invoice fields and line items; recalculates totals server-side and guards against total < amountPaid |
| `DELETE` | `/api/invoices/:id` | `payments.cancel_invoice` / `payments.delete` | Safe cancellation: if invoice has payment history, it is marked `CANCELLED`; if zero payments exist, it is cleanly deleted |
| `POST` | `/api/invoices/:id/payments` | `payments.record_payment` / `payments.create` | Records a payment against the invoice inside a transaction; recalculates `amountPaid` and `balanceDue`; auto-transitions status |

### 2. Payment Endpoints Summary

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/payments` | `payments.view` | Filterable list of payments with pagination metadata, search, client/project/invoice/method/date filters, and sorting |
| `GET` | `/api/payments/summary` | `payments.view` | Financial dashboard summary returning total invoiced, total paid, total outstanding, overdue amount, and status counts |
| `GET` | `/api/payments/:id` | `payments.view` | Detailed payment record including invoice summary, client, project, and recordedBy user/employee summary |
| `PATCH` | `/api/payments/:id` | `payments.record_payment` / `payments.edit` | Edits payment details (amount, date, method, reference, notes) with transactional recalculation of invoice totals and status |
| `DELETE` | `/api/payments/:id` | `payments.cancel_invoice` / `payments.delete` / `payments.record_payment` | Deletes a payment record and transactionally recalculates parent invoice `amountPaid`, `balanceDue`, and `status` |

### 3. Financial Safety & Exact Decimal Calculations

- **No Floating-Point Arithmetic**: All monetary fields (`subtotal`, `discount`, `tax`, `total`, `amountPaid`, `balanceDue`, `unitPrice`, `quantity`, `lineTotal`) use `Prisma.Decimal` arbitrary-precision arithmetic.
- **Server-Side Calculations**: Line totals (`quantity * unitPrice`), invoice subtotal, tax, discount, and total are computed strictly on the server. Client-supplied totals are ignored.
- **Serialization**: Financial values are formatted consistently as 2-decimal strings (e.g. `"1050.00"`, `"0.00"`).

### 4. Partial & Full Payment Workflow

- **Status Progression**:
  - Unpaid: `DRAFT` or `SENT` (or `OVERDUE` dynamically when past due date).
  - First / Subsequent Partial Payment: Transitions to `PARTIAL` when `0 < amountPaid < total`.
  - Full Settlement: Transitions to `PAID` when `balanceDue === 0`.
- **Overpayment Prevention**: Payments exceeding the current `balanceDue` are rejected with `400 Bad Request`.

### 5. Dynamic Overdue Logic

- **Calculated State**: An invoice is overdue if:
  `dueDate < now && balanceDue > 0 && status !== 'PAID' && status !== 'CANCELLED'`.
- Not stored as a brittle static boolean; calculated dynamically and exposed on all safe payloads.
- Filterable in invoice queries via `?overdue=true`.

### 6. Client & Project Integrity

- Invoices must link to an existing `Client`.
- If an optional `projectId` is provided, the project must exist and belong to the selected client. Mismatched client-project combinations are rejected with `400 Bad Request`.

### 7. Safe Cancellation vs Clean Deletion

- When deleting an invoice via `DELETE /api/invoices/:id`:
  - If payments exist, hard deletion is blocked; the invoice status is updated to `CANCELLED`.
  - If no payments exist, the invoice and its line items are cleanly deleted.
  - Clients and Projects are never deleted.

---

## 📁 Files & Attachments Management APIs

All File and Folder endpoints require authentication (`Bearer <token>`) and enforce capability-based authorization. Super Admin (`isSuperAdmin === true`) retains full bypass access.

### 1. File Endpoints Summary

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/files` | `files.view` | Filterable list of file assets with pagination metadata, search, folder/client/project/task/employee/date/starred/category filters, and sorting |
| `POST` | `/api/files` | `files.create` / `files.upload` | Multipart file upload (`multipart/form-data`); validates MIME type, magic bytes, and file size; runs malware hook; generates safe unique key; stores binary via storage provider and saves metadata in PostgreSQL |
| `GET` | `/api/files/:id` | `files.view` | Retrieves safe metadata for a single file asset, including folder summary, uploader profile, and resolved linked entity details |
| `GET` | `/api/files/:id/download` | `files.download` / `files.view` | Streams file binary from storage provider with secure download headers (`Content-Disposition: attachment`, `nosniff`) and sanitized filename |
| `PATCH` | `/api/files/:id` | `files.edit` / `files.upload` | Updates whitelisted file metadata (display name, folder assignment, starred status, access level, entity relation) with validation and audit logging |
| `DELETE` | `/api/files/:id` | `files.delete` | Coordinates deletion between PostgreSQL database metadata and underlying physical/object storage; audits deletion |

### 2. File Folders Endpoints Summary

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/file-folders` | `files.view` | Lists folders and subfolders with counts of contained files and subfolders |
| `POST` | `/api/file-folders` | `files.manage_folders` / `files.create` / `files.upload` | Creates a new folder with optional parent folder ID (`parentId`) |
| `PATCH` | `/api/file-folders/:id` | `files.manage_folders` / `files.edit` | Renames a folder or moves it to a new parent folder with circular reference checks |
| `DELETE` | `/api/file-folders/:id` | `files.manage_folders` / `files.delete` | Safe folder deletion: blocks deletion with `400 Bad Request` if folder contains files or subfolders |

### 3. Storage Abstraction Architecture

The storage layer is decoupled from controller and service logic using an `IStorageProvider` abstraction:

```typescript
export interface IStorageProvider {
  upload(options: UploadFileOptions): Promise<UploadResult>;
  delete(storageKey: string): Promise<boolean>;
  getDownload(storageKey: string): Promise<DownloadResult>;
  exists(storageKey: string): Promise<boolean>;
}
```

- **Local Storage Provider (`LocalStorageProvider`)**:
  - Used in local development environments.
  - Stores files in `storage/uploads/` (outside source code and ignored by Git).
  - Uses date-partitioned paths (`YYYY-MM/prefix/uuid.ext`) to avoid filesystem directory bloat.
  - Strict path traversal prevention: rejects keys containing `..` or absolute paths and enforces containment within `baseDir`.
- **Cloud / S3-Compatible Storage Provider (Future Roadmap)**:
  - Can be activated in production by configuring `STORAGE_DRIVER=s3` and implementing `S3StorageProvider` without altering application routes or database queries.

### 4. Upload Validation & Security Measures

- **File Size Limits**: Configurable via `MAX_UPLOAD_SIZE_MB` (default: 25 MB). Enforced by streaming middleware before buffer exhaustion.
- **Allowed MIME Types**: Whitelisted for typical agency workflow files (PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, JPG, PNG, WEBP, GIF, SVG, ZIP).
- **Dangerous Extensions Blocked**: Strict denial of executable/script extensions (`.exe`, `.php`, `.phtml`, `.phar`, `.sh`, `.bat`, `.cmd`, `.ps1`, `.js`, `.htaccess`, `.env`, etc.).
- **Magic Byte Inspection**: Verifies binary headers for PDF (`%PDF-`), PNG, JPEG, GIF, and ZIP-based archives to thwart MIME-type spoofing.
- **Safe Keys**: Original filenames are preserved strictly as display metadata (`originalName`). Physical storage keys use randomly generated UUIDs.
- **No Path Leaks**: Absolute server filesystem paths are never returned in API payloads or error messages.

### 5. Malware Scanning Hook

The upload pipeline includes an `IMalwareScanner` hook. For local development, `NoOpMalwareScanner` evaluates uploads without blocking. In production, this can be seamlessly swapped for ClamAV or VirusTotal daemon integrations.

### 6. Relational Entity Linking

Files can be uploaded as general workspace files or linked to specific CRM entities:
- **Client Files**: `relatedType = 'CLIENT'`, `relatedId = clientId` (powers Client Profile → Files).
- **Project Files**: `relatedType = 'PROJECT'`, `relatedId = projectId` (powers Project Details → Files).
- **Task Attachments**: `relatedType = 'TASK'`, `relatedId = taskId` (powers Task Details modal → Attachments).
- **Employee Documents**: `relatedType = 'EMPLOYEE'`, `relatedId = employeeId` (powers Employee Profile → Files).
- **Chat Attachments**: `relatedType = 'CHAT_MESSAGE'`, `relatedId = messageId` (powers File Attachments in Chat).

Cross-entity validation verifies that linked targets exist and ensures that conflicting relationships are blocked.

---

## 💬 14. Internal Staff Chat & Socket.IO (Step 12)

The internal staff chat system enables real-time messaging, channels, direct messages (DMs), project conversations, replies/threads, emoji reactions, @mentions, file attachments, and typing indicators.

### 1. Chat REST Endpoints Summary

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/chat/conversations` | `chat.view` | Lists all active DMs, channels, and project chats accessible to user |
| `GET` | `/api/chat/unread` | `chat.view` | Retrieves total unread count and per-conversation counts for UI badges |
| `GET` | `/api/chat/search?q=...` | `chat.view` | Searches message content with access isolation and filters |
| `POST` | `/api/chat/dm` | `chat.view`, `chat.send_messages` | Gets or creates canonical 1-to-1 direct message conversation |
| `GET` | `/api/chat/channels` | `chat.view` | Lists available chat channels |
| `POST` | `/api/chat/channels` | `chat.create_channels` | Creates a new chat channel or group conversation |
| `GET` | `/api/chat/channels/:id` | `chat.view` | Retrieves channel details and member count |
| `PATCH` | `/api/chat/channels/:id` | `chat.manage_channels` | Updates channel name or description (author/admin only) |
| `DELETE` | `/api/chat/channels/:id` | `chat.manage_channels` | Deletes or archives chat channel |
| `GET` | `/api/chat/channels/:id/members` | `chat.view` | Lists members of a channel |
| `POST` | `/api/chat/channels/:id/members` | `chat.manage_channels` | Adds a staff user to channel |
| `DELETE` | `/api/chat/channels/:id/members/:userId` | `chat.view` | Removes a member or leaves channel |
| `GET` | `/api/chat/projects/:projectId` | `chat.view` | Retrieves or creates canonical project discussion channel |
| `GET` | `/api/chat/conversations/:id/messages` | `chat.view` | Cursor-based message history with pagination |
| `POST` | `/api/chat/conversations/:id/messages` | `chat.send_messages` | Sends a new message (supports replies, mentions, attachments) |
| `POST` | `/api/chat/conversations/:id/read` | `chat.view` | Updates user's read pointer timestamp |
| `PATCH` | `/api/chat/messages/:id` | `chat.send_messages` | Edits own message (Super Admin moderation bypass) |
| `DELETE` | `/api/chat/messages/:id` | `chat.view` / `chat.delete_messages` | Soft-deletes a message |
| `POST` | `/api/chat/messages/:id/reactions` | `chat.send_messages` | Adds emoji reaction (idempotent) |
| `DELETE` | `/api/chat/messages/:id/reactions/:emoji` | `chat.send_messages` | Removes emoji reaction |

### 2. Socket.IO Real-Time Architecture

The Socket.IO server is attached to the existing HTTP server on the same port:
- **Handshake Authentication**: Authenticates via `socket.handshake.auth.token` using verified JWT access tokens.
- **Context Attached**: Safe authenticated user context (`userId`, `employeeId`, `roleId`, `isSuperAdmin`, `permissions`). Sensitive secrets like `passwordHash` or JWT secrets are never attached.
- **Rooms**:
  - `user:<userId>`: Individual user room for direct notifications and presence.
  - `conversation:<conversationId>`: Room for DM or Channel members. Joining requires record-level access verification.
- **Presence Tracking**: In-memory connection counting tracks multi-tab/device presence without writing transient state to PostgreSQL.
- **Typing Indicators**: Ephemeral `chat:typing:start` and `chat:typing:stop` broadcasted to the conversation room without database overhead.
- **Event Bus Integration**: Service methods persist writes to PostgreSQL first, then emit events over `chatEvents` that are broadcast by Socket.IO.

---

## 🔔 15. In-App Notifications & Preferences (Step 13)

The internal notifications system alerts staff users of critical events across tasks, projects, chat mentions, payments, and system notices.

### 1. Notifications & Preferences REST Endpoints Summary

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/notifications` | Authenticated | Lists user's own notifications with pagination and filters (`isRead`, `type`, `dateFrom`, `dateTo`) |
| `GET` | `/api/notifications/unread-count` | Authenticated | Retrieves current unread count for bell badge |
| `PATCH` | `/api/notifications/:id/read` | Authenticated (Owner) | Marks a single notification as read (idempotent) |
| `PATCH` | `/api/notifications/read-all` | Authenticated | Marks all unread notifications as read for current user |
| `DELETE` | `/api/notifications/:id` | Authenticated (Owner) | Deletes / dismisses a single notification |
| `GET` | `/api/notification-preferences` | Authenticated | Retrieves category-level in-app & email preferences |
| `PATCH` | `/api/notification-preferences` | Authenticated | Updates category notification preferences |
| `POST` | `/api/notifications/system` | `settings.view` / `settings.manage_users` | Dispatches targeted or organization-wide system notices |

### 2. Supported Notification Types & Navigation Metadata

| Notification Type | Category | Navigation Link | Trigger Condition |
| :--- | :--- | :--- | :--- |
| `TASK_ASSIGNED` | `TASKS` | `/tasks/:id` | Employee assigned to task |
| `TASK_STATUS_CHANGED` | `TASKS` | `/tasks/:id` | Task status transitioned |
| `TASK_DUE_SOON` | `TASKS` | `/tasks/:id` | Task due within 24h (deduplicated) |
| `TASK_OVERDUE` | `TASKS` | `/tasks/:id` | Task past due date (deduplicated) |
| `PROJECT_ASSIGNED` | `PROJECTS` | `/projects/:id` | Team member added to project |
| `PROJECT_MANAGER_ASSIGNED` | `PROJECTS` | `/projects/:id` | Project Manager assigned/reassigned |
| `CHAT_MENTION` | `CHAT` | Conversation ID | User @mentioned in chat |
| `CHAT_MESSAGE` | `CHAT` | Conversation ID | 1-on-1 Direct Message received |
| `PAYMENT_RECORDED` | `PAYMENTS` | Invoice ID | Payment successfully recorded |
| `SYSTEM` | `SYSTEM` | Optional | Admin broadcast (bypasses optional category preferences) |

### 3. Real-Time Delivery Architecture

Notifications are pushed over the existing Socket.IO connection:
- Emitted directly to the recipient's authenticated room: `user:<userId>`.
- Events:
  - `notification:new`: Transmits the full formatted notification payload.
  - `notification:unread-count`: Transmits the updated unread count for badge counters.
- Failure-isolated: database transactions commit first; Socket.IO emission failures never rollback core business operations.

### 4. Due / Overdue Job Runner & Deduplication

- Located in `NotificationService.processDueAndOverdueTasks()`.
- Designed for execution via cron jobs, workers, or cloud schedulers without running persistent `setInterval` timers inside the Express process.
- Strictly deduplicated: checks if a notification of the same type for that task was dispatched within the last 24 hours to prevent duplicate spam.

---

## 📊 16. Dashboard & Reports Analytics (Step 14)

Production-grade real-time analytical and operational intelligence engines powered by PostgreSQL aggregations. Zero mock data, safe `Prisma.Decimal` arithmetic, capability-based permission composition, personal work queue scoping, and CSV exports with formula-injection protection.

### 1. Dashboard REST Endpoints

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard/overview` | Authenticated | Organization-wide operational counts (employees, leads, clients, projects, tasks). Compact financial summary included *only* if user has financial permissions; otherwise returns `financial: null`. |
| `GET` | `/api/dashboard/activity` | Authenticated | Recent organization activity stream derived from `AuditLog` with safe actor profiles. |
| `GET` | `/api/dashboard/my-work` | Authenticated | Personal work queue: assigned active projects, assigned tasks, tasks due today, overdue tasks, in-progress tasks, and QA/revision queue for the calling employee. |

### 2. Reports REST Endpoints

| Method | Endpoint | Required Capability | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reports/leads` | `reports.view` / `reports.view_sales` | Total leads, status breakdown, conversion rate (`converted / total`), acquisition source breakdown, and timeline trend. |
| `GET` | `/api/reports/clients` | `reports.view` / `reports.view_sales` | Total clients, new clients in period, status breakdown, active/inactive counts, and source origin breakdown (converted from lead vs direct). |
| `GET` | `/api/reports/projects` | `reports.view` / `reports.view_projects` | Total projects, status breakdown, active/completed/overdue counts, completion rate, budget sum, and timeline trend. |
| `GET` | `/api/reports/tasks` | `reports.view` / `reports.view_projects` | Total tasks, status breakdown, priority distribution, completed/pending/overdue counts, completion rate, and timeline trend. |
| `GET` | `/api/reports/employees` | `reports.view` / `reports.view_team` | Factual operational workloads: assigned tasks, completed tasks, pending tasks, overdue tasks, active projects count. (Strictly factual; no subjective scoring or auth leakage). |
| `GET` | `/api/reports/financial` | `reports.view` + (`reports.view_financial` / `payments.view`) | Invoiced vs Received vs Outstanding amounts, overdue balance, invoice counts, payment methods distribution, and monthly revenue trends. |
| `GET` | `/api/reports/:reportType/export?format=csv` | `reports.export` + underlying report capability | Server-side streaming CSV export with RFC 4180 compliance and CSV formula injection neutralization. |

### 3. Financial Definitions & Decimal Precision

- **Invoiced (`totalInvoiced`)**: Gross total value billed on all non-cancelled invoices (`status != CANCELLED`).
- **Received (`totalPaid`)**: Real payments successfully credited or recorded (`Invoice.amountPaid` / `Payment.amount`). Invoiced amounts are never conflated with realized cash revenue.
- **Outstanding (`totalOutstanding`)**: Unpaid invoice balance due (`balanceDue`) across active, non-cancelled invoices.
- **Overdue (`overdueAmount`)**: Sum of unpaid invoice balances where the invoice `dueDate` is strictly in the past, `balanceDue > 0`, and status is not `PAID` or `CANCELLED`.
- **Decimal Safety**: All arithmetic uses `Prisma.Decimal` instances (`.plus`, `.minus`, `.dividedBy`) to eliminate IEEE-754 floating-point inaccuracies. Outputs are formatted as fixed 2-decimal string representations.

### 4. Date Filtering & Chart Trends

Reports support flexible date filtering:
- **Explicit Range**: Query parameters `from` and `to` (ISO 8601 or `YYYY-MM-DD`). Boundaries are inclusive (`from` defaults to `00:00:00.000`, `to` defaults to `23:59:59.999`).
- **Preset Periods**: `preset=7d`, `preset=30d`, `preset=90d`, `preset=this_month`, `preset=this_year`.
- **Grouping**: `groupBy=day`, `groupBy=week`, `groupBy=month`. If omitted, automatically defaults to `day` for intervals <= 14 days, `week` for intervals <= 90 days, and `month` otherwise.
- **Trend Output**: Generic chart-agnostic array: `[{ "period": "2026-09", "invoiced": "1500.00", "received": "400.00" }]`.

### 5. Server-Side CSV Export & Security

- Whitelisted report types: `leads`, `clients`, `projects`, `tasks`, `employees`, `financial`.
- **Dual Permission Authorization**: Standard exports require `reports.export`. Financial exports additionally enforce `reports.view_financial` or `payments.view`.
- **Formula Injection Mitigation**: Any cell starting with `=, +, -, @, \t, \r` is prefixed with a single quote (`'`), neutralizing executable Excel DDE formulas without distorting presentation.
- **Audit Logging**: Successful exports trigger a `REPORT_EXPORTED` audit log entry detailing the report type, filters, and record count.

### 6. Performance & Aggregation Strategy

- Uses PostgreSQL native `COUNT`, `SUM`, and indexed lookups via Prisma aggregations (`count`, `aggregate`, `groupBy`). Tables are never pulled into Node memory for naive looping.
- Leverages existing indexes on `[status]`, `[createdAt]`, `[dueDate]`, `[clientId]`, `[projectId]`, `[managerId]`, and `[assignees]`.
- Empty databases return safe zero defaults (`0`, `[]`, `"0.00"`), never `NaN`, `Infinity`, or uncaught 500 exceptions.

---

## 🔌 17. Frontend Integration Contract (Step 15 Hardening)

This section serves as the definitive reference specification for the upcoming frontend integration phase with `E:\CRM DUL\CRM front`.

### 1. Connection & Environment Coordinates
- **Backend API Base URL**: `http://localhost:5000/api`
- **Socket.IO Real-Time Server**: `http://localhost:5000`
- **Frontend Development Origin**: `http://localhost:5173`
- **Cross-Origin Credentials**: Requests must include credentials (`withCredentials: true` in Axios / `credentials: 'include'` in Fetch) to support the secure `refreshToken` cookie.

### 2. Authentication & Session Lifecycle
1. **Sign In**: Send `POST /api/auth/login` with `{ email, password }`.
   - On success (`200`): Stores the returned `accessToken` in React application state (in-memory). An HttpOnly `refreshToken` cookie is automatically set on the client browser.
2. **Authorization Header**: Every authenticated HTTP request must include:
   ```http
   Authorization: Bearer <accessToken>
   ```
3. **Session Refresh**: When an access token expires (after 15 minutes, returning `401`), the frontend HTTP interceptor automatically calls `POST /api/auth/refresh` without passing a body (the browser provides the HttpOnly cookie).
4. **Sign Out**: `POST /api/auth/logout` revokes the refresh session in PostgreSQL and clears the browser cookie.
5. **Initial Bootstrap (`/auth/me`)**:
   - Calling `GET /api/auth/me` returns the authenticated identity:
   ```json
   {
     "success": true,
     "data": {
       "user": { "id": "...", "email": "...", "accountStatus": "ACTIVE" },
       "employee": { "id": "...", "employeeCode": "EMP-0001", "firstName": "...", "lastName": "..." },
       "role": { "id": "...", "name": "...", "isSuperAdmin": false },
       "permissions": ["projects.view", "tasks.create", ...],
       "effectivePermissions": ["projects.view", "tasks.create", ...]
     }
   }
   ```

### 3. Capability-Based Permissions in Frontend
- Super Admin: If `role.isSuperAdmin === true`, grant unconditional UI access.
- Non-Super Admin: Check membership in `effectivePermissions` (e.g. `effectivePermissions.includes('leads.export')`). Never evaluate role names (e.g. `role.name === 'Admin'`).

### 4. Real-Time Socket.IO Handshake
- Connect via Socket.IO client:
  ```javascript
  import { io } from 'socket.io-client';
  const socket = io('http://localhost:5000', {
    auth: { token: accessToken },
    withCredentials: true
  });
  ```
- **Rooms & Events**:
  - `user:<userId>`: Automatically joined for notifications (`notification:new`, `notification:unread-count`).
  - `conversation:<conversationId>`: Joined for chat messages (`chat:message:new`, `chat:message:edited`, `chat:typing:start`).

### 5. File Upload & Download Contracts
- **Upload**: Send `POST /api/files/upload` as `multipart/form-data` with form field `file`. Optional fields: `folderId`, `relatedType` (`PROJECT` | `TASK` | `CLIENT`), `relatedId`, `accessLevel`.
- **Download**: Call `GET /api/files/:id/download` with `Authorization: Bearer <token>`. Returns binary stream with proper `Content-Disposition`.

### 6. Standard API Response & Error Schema
- **Success (`200`, `201`)**:
  ```json
  {
    "success": true,
    "message": "Resource retrieved successfully",
    "data": { ... }
  }
  ```
- **Error (`400`, `401`, `403`, `404`, `409`, `429`, `500`)**:
  ```json
  {
    "success": false,
    "message": "Human-readable error explanation",
    "errors": [ ... ]
  }
  ```

### 7. Pagination Specification
Paginated listing endpoints return:
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 85,
    "totalPages": 5,
    "hasMore": true
  }
}
```
