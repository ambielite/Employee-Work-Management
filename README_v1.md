# Employee Work Management System — V1

Production-oriented internal Employee Work Management, Attendance, Time Tracking and Task Management application.

## What it does

- Three roles: ADMIN, MANAGER, EMPLOYEE

- WFO/WFH check-in and check-out

- Full login-to-logout work-session measurement

- Separate Logged-in Time, Active Browser Time, Break Time, Idle Time and Task Tracked Time

- Configurable idle detection with lightweight browser activity heartbeats

- Multiple breaks and cumulative break-limit warnings

- Required-hours shortage/overtime calculation

- Late-login grace period

- Task management and one-active-task-timer rule

- Projects

- Leave requests and manager/admin approval

- Holiday and leave-type management APIs

- Notifications and audit-log storage/API

- Company settings

- Attendance/productivity reports and CSV attendance export API

- PostgreSQL + Prisma

- JWT authentication and role guards

- Docker Compose PostgreSQL

- Seed data and critical business-rule tests

## Important terminology

The application intentionally does **not** claim that a browser being open proves that an employee is working. It reports:

- Logged-in Time

- Active Browser Time

- Idle Time

- Break Time

- Task Tracked Time

- Unallocated Active Time

Core calculation:

`Active Working Time = Logged-in Time - Break Time - Idle Time`

`Shortage = max(Required Working Time - Active Working Time, 0)`

`Overtime = max(Active Working Time - Required Working Time, 0)`

Task time is informational and does not replace active working time.

## Stack

### Frontend

React + TypeScript + Vite + React Router + TanStack Query + React Hook Form-ready architecture + Zod-ready architecture + Lucide + Recharts-ready chart layer.

### Backend

Node.js + NestJS + TypeScript + REST + JWT + bcryptjs + class-validator pipeline + Helmet.

### Database

PostgreSQL 16 + Prisma.

## Project structure

```text

employee-work-management/

├── backend/

│   ├── prisma/

│   │   ├── schema.prisma

│   │   └── seed.ts

│   ├── src/

│   │   ├── auth/

│   │   ├── attendance/

│   │   ├── breaks/

│   │   ├── idle-tracking/

│   │   ├── leaves/

│   │   ├── projects/

│   │   ├── task-timers/

│   │   ├── tasks/

│   │   ├── work-sessions/

│   │   ├── common/

│   │   ├── admin.module.ts

│   │   ├── app.module.ts

│   │   ├── main.ts

│   │   └── prisma.service.ts

│   └── test/

├── frontend/

│   └── src/

│       ├── api/

│       ├── components/

│       ├── hooks/

│       ├── pages/

│       ├── types/

│       └── utils/

├── docker-compose.yml

└── README.md

```

## Database models

User, Employee, Department, Attendance, WorkSession, BreakSession, IdleSession, WorkEvent, Task, TaskTimerSession, Project, TaskComment, LeaveType, LeaveRequest, Holiday, Notification, CompanySetting and AuditLog.

\*\*## Employee Features

The Employee role is limited to the employee's own work, attendance, tasks, projects, leave requests, notifications and profile information.

Employee Dashboard

The Employee dashboard provides a personal view of:

Today's attendance and current work state

WFO/WFH work mode

Logged-in Time

Active Working Time

Break Time

Idle Time

Task Tracked Time

Shortage

Overtime

Today's tasks

Personal work/activity summary

My Tasks

Employees can work with tasks assigned to them, including task number, title, description, project, priority, status, dates, estimated time, actual tracked time, task timers and task comments. Employees do not receive company-wide task management access.

Time Tracking

Employees can check in, check out, view their current work state, view logged-in/active/break/idle/task time, shortage and overtime, and view their work-event timeline. Backend timestamps remain the source of truth.

My Attendance

Employees can view their own attendance history including date, work mode, status, login/logout, logged-in minutes, active minutes, break minutes, idle minutes, task minutes, shortage and overtime. Employees cannot access company-wide attendance management.

My Projects

Employees can view projects associated with their assigned tasks and related task progress. Project administration remains restricted to management roles.

My Leaves

Employees can submit leave requests, select a leave type and date range, request a half-day where supported, provide a reason, view leave history and status, and view reviewer information/review comments when available. Approval and rejection remain manager/admin operations.

Holidays

Employees can view company holidays. Holiday creation and management remain restricted to management roles.

Notifications

Employees can view their notifications and read/unread state. Notifications are stored in the application.

My Profile

Employees can view available employee information including Employee ID, name, profile photo, email, phone, joining date, designation, department, reporting manager, employment status, work mode eligibility, standard working minutes, shift, office location and account status. Company-level configuration and employee account administration remain restricted to authorized management roles.

Employee Access Boundaries

Employees do not receive access to all-employee management, employee activation/deactivation, company attendance management, company-wide task management, all leave-request management, department management, project administration, holiday administration, leave-type administration, company settings administration, management reports or audit logs.

Requirements\*\*

- Node.js LTS (Node 22 recommended)

- Docker Desktop

- Git

## Local setup

### 1. Start PostgreSQL

```bash

docker compose up -d postgres

```

### 2. Backend environment

```bash

cd backend

cp .env.example .env

npm install

npx prisma generate

npx prisma migrate dev --name init

npm run seed

npm run start:dev

```

Backend: `http://localhost:3000`

### 3. Frontend

Open another terminal:

```bash

cd frontend

cp .env.example .env

npm install

npm run dev

```

Vite normally serves the application at `http://localhost:5173`.

## Development credentials

These are **DEVELOPMENT ONLY** credentials created by the seed:

| Role | Email | Password |

|---|---|---|

| Admin | admin@example.com | REMOVED_DEMO_PASSWORD |

| Manager | manager@example.com | REMOVED_DEMO_PASSWORD |

| Employee | employee@example.com | REMOVED_DEMO_PASSWORD |

Change these before production. Passwords are stored as bcrypt hashes; no plaintext passwords are stored in the database.

## Environment variables

Backend `.env`:

```env

DATABASE_URL="postgresql://employee_work:employee_work_dev@localhost:5432/employee_work?schema=public"

JWT_SECRET="change-me-in-production"

JWT_EXPIRES_IN="8h"

PORT=3000

FRONTEND_URL="http://localhost:5173"

CORS_ORIGIN="http://localhost:5173"

TIMEZONE="Asia/Kolkata"

```

Frontend `.env`:

```env

VITE_API_URL="http://localhost:3000/api"

```

Never commit real `.env` files or production secrets.

## Prisma commands

```bash

npm run prisma:generate

npm run prisma:migrate

npm run prisma:studio

npm run seed

```

Database reset for development:

```bash

npx prisma migrate reset

npm run seed

```

## NPM scripts

Backend:

```text

npm run start:dev

npm run build

npm run start

npm run prisma:generate

npm run prisma:migrate

npm run prisma:studio

npm run seed

npm run test

```

Frontend:

```text

npm run dev

npm run build

npm run preview

```

## Key API endpoints

Authentication:

```text

POST /api/auth/login

POST /api/auth/logout

GET  /api/auth/me

```

Attendance:

```text

POST /api/attendance/check-in

POST /api/attendance/check-out

GET  /api/attendance/today

GET  /api/attendance/history

GET  /api/attendance/company

```

Breaks and idle:

```text

POST /api/breaks/start

POST /api/breaks/end

GET  /api/breaks/today

POST /api/idle/heartbeat

GET  /api/idle/today

```

Tasks:

```text

GET  /api/tasks

POST /api/tasks

PATCH /api/tasks/:id

DELETE /api/tasks/:id

POST /api/tasks/:id/timer/start

POST /api/tasks/:id/timer/pause

POST /api/tasks/:id/timer/resume

POST /api/tasks/:id/timer/stop

GET  /api/task-timers/active

```

Leave/holiday/settings:

```text

GET/POST /api/leaves

PATCH /api/leaves/:id/approve

PATCH /api/leaves/:id/reject

GET/POST /api/leave-types

GET/POST /api/holidays

GET/PATCH /api/settings

```

Management/reporting:

```text

GET /api/employees

POST /api/employees

GET /api/departments

GET /api/projects

GET /api/reports/attendance

GET /api/reports/productivity

GET /api/reports/attendance.csv

GET /api/notifications

GET /api/audit-logs

```

## Business rules implemented

- One attendance record per employee per date.

- Duplicate check-in is rejected.

- A task employee can have only one open task timer.

- Break and idle sessions are closed before starting a conflicting state.

- Backend stores actual timestamps and calculates duration from timestamps; the frontend counter is not the source of truth.

- Refreshing the page does not reset a work session.

- Idle time remains part of logged-in time but is removed from active browser time.

- Break time is cumulative across multiple break sessions.

- Break violations do not automatically log the employee out and records are preserved.

- Logged-in employees are not marked absent merely because they have insufficient active hours.

- Sunday is not a required working day under the default Monday-Saturday configuration.

- Company settings are persisted instead of scattering working-rule constants throughout the application.

- Server-side role guards protect management endpoints.

## Browser activity model

The frontend listens for lightweight interaction signals such as mouse, keyboard, scroll, touch and focus/visibility-related activity. It does not store raw keystrokes, screenshots, webcam data, microphone recordings or screen recordings. Activity is aggregated and sent as a heartbeat rather than sending every mouse event.

Active browser time is a measurement of browser activity, not proof of productivity.

## Production considerations

Before production:

1. Replace all development credentials.

2. Generate a strong random JWT secret.

3. Put PostgreSQL behind private networking/firewall rules.

4. Run the backend behind HTTPS and a reverse proxy/load balancer.

5. Set an exact production CORS origin.

6. Add centralized structured logging and monitoring.

7. Add scheduled jobs for daily anomaly/absence processing if the company requires automatic attendance closure.

8. Add a production email/push provider for notifications if external delivery is required.

9. Add XLSX export if spreadsheet export is mandatory; CSV is already exposed.

10. Review local employment/privacy policies before enabling employee time/activity tracking.

## Docker

The included Compose file starts PostgreSQL for local development:

```bash

docker compose up -d postgres

```

Backend and frontend Dockerfiles are included for containerized builds. A production deployment should use a managed PostgreSQL database, secret manager, HTTPS reverse proxy and appropriate health checks.

## Testing

Run:

```bash

cd backend

npm test

```

The included tests cover core duration, active-time, shortage and overtime formulas. The acceptance checklist below should also be executed against a running database/application before release.

## Acceptance checklist

- Login at 09:30 starts the work timer.

- A 20-minute break is stored as 20 minutes.

- A 10-minute idle interval is excluded from active browser time.

- Activity resumes from idle.

- Multiple breaks accumulate and can exceed the configured limit without logout.

- Checkout stores login/logout and final summary values.

- Refresh retains the server-backed session.

- Multiple browser tabs cannot create duplicate attendance.

- Multiple task timers are rejected.

- Manager endpoints only expose their team.

- Employee access to admin endpoints is rejected with 403.

- Changing break limit in settings affects new calculations.

- Sunday is a weekly off under default settings.

- Holidays and approved leave can be represented without marking those days absent.

## Known V1 limitations

- The UI is intentionally compact and focuses on core workflows; richer chart visualizations and XLSX export can be layered on without changing the domain model.

- Automatic daily generation of ABSENT/WEEKLY_OFF/HOLIDAY/ON_LEAVE records is not run by a background scheduler in this local V1; the application avoids inventing absence records. A scheduled job can be added for payroll-grade daily closure.

- Browser activity cannot prove real work or productivity.

- External email/push notifications are not configured; notifications are stored in-app.

## Recommended next steps

1. Add a background scheduler for end-of-day attendance finalization.

2. Add full admin CRUD forms for employees, departments, projects, holidays and leave types.

3. Add richer Recharts analytics and XLSX export.

4. Add automated API/e2e tests using a disposable PostgreSQL database.

5. Add production observability, backups and deployment automation.
