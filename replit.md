# Workspace

## Overview

npm workspace monorepo using TypeScript. Each package manages its own dependencies, all hoisted to the root `node_modules`.

## Stack

- **Monorepo tool**: npm workspaces
- **Node.js version**: 24
- **Package manager**: npm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS + Wouter (routing) + React Query

## Project: HealthChain — Secure Medical Records

A blockchain-inspired secure health record management system for hackathon demo.

### Features
- Patient registration with secure Health IDs (HC-XXXXXXXX format)
- AES-256 encryption of medical data before storage
- SHA-256 hashing of records (simulates blockchain)
- QR code generation per patient for emergency access
- Emergency view — shows only critical data (blood group, allergies, diseases)
- Doctor authentication (demo: doctor1/doctor2/doctor3, password: health123)
- Full access mode — authenticated doctor access with audit logging
- AI Chatbot — powered by Gemini 2.5 Flash via Replit AI Integrations
- Audit trail — immutable log of all doctor access events
- Sign In / Sign Up page at `/auth`

### Demo Flow
1. Dashboard shows stats and recent patients
2. Register a new patient → get Health ID + QR code
3. Upload medical records (encrypted + hashed)
4. Click emergency QR icon → Emergency view (red UI for first responders)
5. Doctor Login → Full Access → view complete records with reason
6. Chatbot → ask health questions (Gemini-powered, patient-context-aware)
7. Audit Logs → see all access events

### Demo Credentials
- Doctor ID: `doctor1`, `doctor2`, or `doctor3` — Password: `health123`

## Key Commands

- `npm run typecheck` — full typecheck across all packages
- `npm run build` — typecheck + build all packages
- `npm -w @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `npm -w @workspace/db run push` — push DB schema changes (dev only)
- `npm -w @workspace/api-server run dev` — run API server locally

## Artifacts

- `artifacts/health-records` — React + Vite frontend, served at `/`
- `artifacts/api-server` — Express 5 API server, served at `/api`

## Package Manager Notes

- Workspace is managed by npm workspaces (root `package.json` has `"workspaces"` field)
- Root `.npmrc` has `legacy-peer-deps=true`
- All deps hoisted to root `node_modules/`
- `pnpm-workspace.yaml` and `pnpm-lock.yaml` have been removed
- Run `npm install --legacy-peer-deps` from root to install all dependencies
- Workspace packages referenced with `"*"` instead of `"workspace:*"` (pnpm syntax)
