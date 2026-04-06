# Railhead

A desktop client for [Railway](https://railway.app) — manage your projects, services, deployments, and environments without leaving your desktop.

> **Disclaimer:** Railhead is an independent, community-made project. It is not affiliated with, maintained by, or endorsed by Railway Corp. "Railway" is a trademark of Railway Corp.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- **Projects** — browse and link Railway projects
- **Deployments** — view history, redeploy, rollback
- **Services** — monitor status, restart, redeploy
- **Logs** — live log streaming with filtering
- **Environment variables** — list, set, delete; import/export `.env` files
- **Environments** — switch between Railway environments
- **Terminal** — full PTY terminal with SSH access to services
- **Git integration** — status, commit, push, pull from within the app
- **Tray icon** — system tray with health status indicator (healthy / deploying / error)
- **Notifications** — desktop push notifications for deployment events

---

## Prerequisites

- **Node.js** 18 or later
- **Railway account** — [railway.app](https://railway.app)
- The Railway CLI is invoked via `npx @railway/cli` automatically — no separate install needed

---

## Installation

### Run from source

```bash
git clone https://github.com/YOUR_USERNAME/railhead.git
cd railhead
npm install
npm run dev
```

### Build

```bash
npm run build    # compile
npm run package  # produces an AppImage in the out/ directory
```

---

## Usage

1. Launch the app
2. Click **Login** and authenticate with your Railway account
3. Select or link a project
4. Manage services, deployments, logs, and environment variables from the sidebar

---

## Technical notes

- Wraps the official [`@railway/cli`](https://docs.railway.app/reference/cli-api) for most operations
- Some features (deployment diffs, rollback, notification polling) use Railway's GraphQL API directly
- Auth tokens are stored locally in your OS keychain / config directory and are never transmitted anywhere other than Railway's own endpoints

---

## License

[MIT](LICENSE)
