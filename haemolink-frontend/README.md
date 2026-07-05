# HaemoLink Frontend

This is the React + Vite frontend for the HaemoLink prototype.

## Start the frontend

```powershell
cd haemolink-frontend
npm install
npm run dev
```

Open the URL shown in the terminal, usually `http://localhost:5173`.

## Configure the backend API

Create `haemolink-frontend/.env.local` or copy from `haemolink-frontend/.env.example`:

```env
VITE_API_URL=http://localhost:8080/api
```

## Scripts

- `npm run dev` — start the Vite development server
- `npm run build` — build production assets
- `npm run lint` — run ESLint
