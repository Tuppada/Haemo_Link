# HaemoLink — Full-Stack Blood Bank Platform

HaemoLink connects hospitals, donors, and inventory with Dijkstra emergency routing and Claude AI assistance.

## Architecture

- **Backend:** Spring Boot 3 + H2 (in-memory) + JDBC
- **Frontend:** React + Vite app in `haemolink-frontend/`
- **AI:** Anthropic Claude via backend proxy (`POST /api/ai/chat`)

## Quick Start

### 1. Start the backend

```powershell
cd c:\Users\Shreya\OneDrive\Desktop\haemolink_backend_fixed
.\mvnw.cmd spring-boot:run
```

Backend runs at **http://localhost:8080**

Health check: http://localhost:8080/api/health

Demo passwords are hashed with BCrypt on startup automatically.

### 2. (Optional) Enable AI

Set your Anthropic API key before starting the backend:

**Windows PowerShell:**
```powershell
$env:ANTHROPIC_API_KEY="your-key-here"
.\mvnw.cmd spring-boot:run
```

**macOS/Linux:**
```bash
export ANTHROPIC_API_KEY=your-key-here
./mvnw spring-boot:run
```

Without a key, the backend returns helpful fallback responses for demos.

### 3. Start the frontend

```powershell
cd c:\Users\Shreya\OneDrive\Desktop\haemolink_backend_fixed\haemolink-frontend
npm install
npm run dev
```

Then open the Vite URL shown in the terminal, usually `http://localhost:5173`.

### 3. Configure the frontend API URL

Create `haemolink-frontend/.env.local` or copy from `haemolink-frontend/.env.example`:

```env
VITE_API_URL=http://localhost:8080/api
```

You can also start both services on Windows with:

```powershell
cd c:\Users\Shreya\OneDrive\Desktop\haemolink_backend_fixed
.\start-dev.ps1
```

### 4. Optional: set Anthropic API key for AI

**Windows PowerShell:**
```powershell
$env:ANTHROPIC_API_KEY="your-key-here"
.\mvnw.cmd spring-boot:run
```

**macOS/Linux:**
```bash
export ANTHROPIC_API_KEY=your-key-here
./mvnw.cmd spring-boot:run
```

Without a key, the backend will still run and serve the UI, but AI assistant responses will fall back gracefully.

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@hemolink.in | admin123 |
| Manipal Hospital | manipal@hemolink.in | Manipal@123 |
| Fortis Healthcare | fortis@hemolink.in | Fortis@123 |
| Apollo Hospitals | apollo@hemolink.in | Apollo@123 |
| AIIMS Delhi | aiims@hemolink.in | AIIMS@123 |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/state` | Full app state (donors, inventory, requests, etc.) |
| POST | `/api/auth/login` | Login (returns JWT + user) |
| GET | `/api/auth/me` | Current user (requires `Authorization: Bearer <token>`) |
| POST | `/api/auth/register-donor` | Register donor account |
| PUT | `/api/hospitals/{id}/capacity` | Set blood capacity targets (admin or own hospital) |
| POST | `/api/donors` | Admin: add donor |
| PATCH | `/api/donors/{id}/clearance` | Toggle medical clearance |
| POST | `/api/inventory` | Add blood unit |
| POST | `/api/requests` | Submit blood request (+ Dijkstra routing if needed) |
| POST | `/api/requests/{id}/fulfill` | Fulfill pending request |
| POST | `/api/organ-donors` | Register organ donor |
| POST | `/api/matches` | Find nearest compatible hospitals |
| GET | `/api/appointments?userId=` | List donor appointments |
| POST | `/api/appointments` | Book appointment |
| DELETE | `/api/appointments/{id}?userId=` | Cancel appointment |
| POST | `/api/ai/chat` | AI assistant |

## What Was Wired Up

1. Frontend calls backend for all data mutations (no more localStorage as source of truth)
2. AI requests go through backend (API key never exposed to browser)
3. BCrypt password hashing with demo account migration on startup
4. **JWT authentication** — all `/api/*` routes except login/register require a Bearer token
5. **Role-based access** — admin / hospital / donor permissions enforced on the server
6. Hospital network distances stored in `hospital_edges` table (Dijkstra loads from DB)
7. Hospitals can add their own inventory via the **Inventory** tab
8. Appointments stored in database
9. `/api/state` no longer exposes user passwords
10. Global JSON error responses for the frontend

### PostgreSQL (optional)

```bash
.\mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=postgres
```

Configure connection in `src/main/resources/application-postgres.properties`.

## Run Tests

```bash
.\mvnw.cmd test
```
