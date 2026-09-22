# Changelog

All notable changes to Specter AI are documented in this file.

## [1.5.0] - 2026-09-22

### Added
- Interview Profile (Dashboard > Interview): company + role, job description paste (20k chars), CV/resume paste or PDF/TXT upload, Interview Mode toggle, voice auto-answer toggle. Includes JD↔CV keyword match preview so you can see grounding coverage before the call
- Voice auto-answer: while the overlay mic is recording, each transcribed chunk is checked for interview questions and answered automatically in first person from your CV, mirroring JD language. 8s cooldown + duplicate detection, garbled audio returns "No question detected." Overlay status bar shows interview target, listening state, and last heard question
- JD/CV-grounded prompts: job description + resume are injected ahead of screen/transcript context (system prompt + user message) whenever Interview Mode is on; answers never invent jobs, dates, or skills not on the resume
- Regression tests for question detection, last-question extraction, and JD/CV grounding order

## [1.4.0] - 2026-08-27

### Added
- First-run setup wizard: provider selection (OpenRouter / OpenAI / Codex plan), API key validation with auto-detection (sk-or-/sk-proj-/legacy sk-), model picker with curated choices per provider, live end-to-end test query, hotkey walkthrough. Skippable via "Skip" — re-runnable from the tray menu ("Run Setup Wizard")
- Auto-update: silent background checks against GitHub Releases every 6 hours, with an overlay restart toast (confirms before restarting during active recording)
- Download website (/site): OS auto-detecting download button (incl. Apple Silicon via User-Agent Client Hints), mobile routing, install walkthroughs, FAQ. Deploys via GitHub Actions (site.yml) with Pages enablement
- Windows CI code-signing support via WINDOWS_CSC_LINK / WINDOWS_CSC_KEY_PASSWORD secrets (unsigned path unchanged when secrets absent)
- Stable, version-less release artifact names: specter-setup.exe, specter-portable.exe, specter-mac-{arch}.zip, specter-linux-{arch}.AppImage/.deb — permanent download links
- Codex CLI detection util and API-key provider detection util, unit tested
- Vitest test infrastructure; tests run in CI alongside typecheck

## [1.3.0] - 2026-08-23

### Added
- Send live screenshots to vision-capable OpenRouter models instead of relying only on OCR text
- Windows NSIS installer and portable `.exe` artifacts with distinct filenames
- Overlay error when screen capture fails, instead of silently sending empty context

### Changed
- Screen capture now uses Electron `desktopCapturer` first so packaged Windows builds work without external screenshot binaries
- OCR is best-effort: a Tesseract failure no longer drops the screenshot
- Native modules (`koffi`, `tesseract.js`, `screenshot-desktop`) are unpacked from the asar archive

### Fixed
- Packaged `.exe` builds failing to take screenshots
- Send doing nothing when a screenshot was attached with no typed question
- Active-window crop depending on the `sharp` devDependency, which is missing in production
