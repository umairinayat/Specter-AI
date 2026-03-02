# Contributing to Specter AI

Thanks for your interest in contributing to Specter AI! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/specter-ai.git
   cd specter-ai
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Start the development server:**
   ```bash
   npm run dev
   ```

## Development Workflow

### Branch Naming

- `feat/description` -- new features
- `fix/description` -- bug fixes
- `docs/description` -- documentation changes
- `refactor/description` -- code refactoring
- `chore/description` -- maintenance tasks

### Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes
3. Test locally with `npm run dev`
4. Run the type checker:
   ```bash
   npm run typecheck
   ```
5. Build to verify no errors:
   ```bash
   npm run build
   ```
6. Commit your changes with a clear message:
   ```bash
   git commit -m "feat: add description of change"
   ```
7. Push and open a Pull Request

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` -- a new feature
- `fix:` -- a bug fix
- `docs:` -- documentation only changes
- `style:` -- formatting, missing semicolons, etc. (no code change)
- `refactor:` -- code change that neither fixes a bug nor adds a feature
- `perf:` -- performance improvement
- `test:` -- adding or fixing tests
- `chore:` -- maintenance tasks

## Project Structure

```
specter-ai/
  src/
    main/           -- Electron main process
    preload/        -- Preload scripts (IPC bridge)
    renderer/
      overlay/      -- Transparent overlay UI (React)
      dashboard/    -- Settings/dashboard UI (React)
    services/       -- Core service modules (OpenRouter, OCR, etc.)
    shared/         -- Shared types, constants, IPC channels
```

### Key Architecture Decisions

- **Main process** handles screen capture, audio, hotkeys, system tray
- **Renderer processes** are isolated (overlay + dashboard are separate windows)
- **IPC bridge** via preload scripts -- no `nodeIntegration` in renderers
- **OCR runs in a worker thread** to avoid blocking the main process
- **All AI calls go through OpenRouter** (OpenAI-compatible API)

## Code Style

- TypeScript strict mode -- no `any` unless absolutely necessary
- Components under 150 lines -- split if larger
- Use React hooks (`useState`, `useEffect`, `useRef`) -- no class components
- Tailwind CSS for styling -- no inline style objects unless dynamic

## Reporting Issues

When filing an issue, please include:

1. **OS and version** (e.g., Windows 11, macOS 14.2, Ubuntu 24.04)
2. **Specter AI version** (from Settings or `package.json`)
3. **Steps to reproduce** the issue
4. **Expected behavior** vs. **actual behavior**
5. **Relevant logs** (DevTools console, terminal output)

## Pull Request Guidelines

- Keep PRs focused -- one feature or fix per PR
- Update documentation if you change user-facing behavior
- Ensure the build passes (`npm run build`)
- Add a clear description of what changed and why

## Security

If you discover a security vulnerability, please **do not** open a public issue. Instead, email the maintainers or use GitHub's private vulnerability reporting feature.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
