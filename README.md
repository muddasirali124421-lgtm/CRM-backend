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


