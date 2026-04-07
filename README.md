# Railhead

A desktop client for [Railway](https://railway.app) — manage your projects, services, deployments, and environments without leaving your desktop.

> **Disclaimer:** Railhead is an independent, community-made project. It is not affiliated with, maintained by, or endorsed by Railway Corp. "Railway" is a trademark of Railway Corp.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- **Projects** — browse and link Railway projects to local directories
- **Deploy** — deploy local code, commit & deploy, or push & deploy
- **Deployments** — view history, rollback, remove, compare diffs
- **Services** — monitor status, manage domains, restart, redeploy
- **Logs** — live streaming with deploy/build/HTTP tabs and filtering
- **Environment variables** — CRUD, import/export `.env` files, cross-environment diff
- **Terminal** — full PTY terminal with local shell, SSH, and `railway run`
- **Git integration** — status, commit, push, pull from within the app
- **System tray** — health indicator that tracks deploy lifecycle in real time
- **Desktop notifications** — configurable alerts for deploy success/failure, service crashes

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Node.js** | v18 or later ([nodejs.org](https://nodejs.org)) |
| **npm** | Included with Node.js |
| **Railway account** | [railway.app](https://railway.app) — the CLI is invoked via `npx @railway/cli` automatically |

### Platform-specific build tools

`node-pty` (used for the terminal) is a native module that must be compiled during `npm install`. Each platform needs a C/C++ toolchain:

<details>
<summary><strong>Linux</strong></summary>

```bash
# Debian / Ubuntu
sudo apt install build-essential python3

# Fedora
sudo dnf groupinstall "Development Tools"

# Arch / CachyOS
sudo pacman -S base-devel
```

</details>

<details>
<summary><strong>macOS</strong></summary>

```bash
xcode-select --install
```

This installs the Xcode Command Line Tools (clang, make, etc.).

</details>

<details>
<summary><strong>Windows</strong></summary>

Install the Visual Studio C++ build tools. The easiest method:

```powershell
npm install -g windows-build-tools
```

Or install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) manually and select the "Desktop development with C++" workload.

</details>

---

## Quick start (development)

```bash
git clone https://github.com/YOUR_USERNAME/railhead.git
cd railhead
npm install
npm run dev
```

This launches the app in development mode with hot-reload.

---

## Building for production

```bash
npm run build      # compile TypeScript + bundle with Vite
npm run package    # build + package distributable for your current OS
```

`npm run package` runs electron-builder, which auto-detects your OS and produces the appropriate artifacts.

### Output by platform

| Platform | Artifacts | Location |
|---|---|---|
| **Linux** | `.AppImage`, `.deb` | `dist/` |
| **macOS** | `.dmg`, `.zip` | `dist/` |
| **Windows** | `.exe` (installer), `.exe` (portable) | `dist/` |

> electron-builder auto-generates `.icns` (macOS) and `.ico` (Windows) from `resources/icon.png`.

---

## Installing

### Linux

**AppImage** (recommended — works on any distro):

```bash
chmod +x dist/Railhead-*.AppImage
./dist/Railhead-*.AppImage
```

To make it available system-wide:

```bash
cp dist/Railhead-*.AppImage ~/.local/bin/Railhead.AppImage
```

**Debian / Ubuntu** (`.deb`):

```bash
sudo dpkg -i dist/railhead_*.deb
```

### macOS

Open the `.dmg` from `dist/` and drag Railhead to your Applications folder.

> On first launch, macOS may block the app. Go to **System Settings > Privacy & Security** and click **Open Anyway**, or run:
> ```bash
> xattr -cr /Applications/Railhead.app
> ```

### Windows

**Installer**: Run the `.exe` from `dist/` and follow the prompts. Supports custom install directory.

**Portable**: Run the portable `.exe` directly — no installation needed.

---

## Usage

1. Launch Railhead
2. Click **Login** and authenticate with your Railway account
3. Select or link a project to a local directory
4. Manage services, deployments, logs, and environment variables from the sidebar

The system tray icon reflects your deployment state:
- **Purple** — idle / all services healthy
- **Yellow** — deployment in progress
- **Green** (30s flash) — deployment succeeded
- **Red** (sticky) — deployment failed or service crashed, clears when services recover

---

## Technical notes

- Wraps the official [`@railway/cli`](https://docs.railway.app/reference/cli-api) for most operations
- Some features (domains, deployment diffs, rollback, notification polling) use Railway's GraphQL API directly
- Auth tokens are encrypted at rest via Electron's `safeStorage` API, backed by your OS credential store (GNOME Keyring / KWallet on Linux, Keychain on macOS, DPAPI on Windows). Tokens are never transmitted anywhere other than Railway's own endpoints
- Project-directory mappings are persisted in Electron's `userData` so linked directories are remembered across sessions

---

## License

[MIT](LICENSE)
