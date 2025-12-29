# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

- migration(dom-canvas): Switch canvas to DOM-based rendering and zooming
  - Use CSS `zoom` for visual scaling
  - Add hand (pan) tool that enables pointer-based panning and shows slim scrollbars
  - Prevent native page scroll unless hand tool is active; Ctrl+wheel retains zoom
  - Add `.canvas-scrollbar` styles for thin scrollbars
  - NOTE: an experimental wrapper for layout-sized scaling was reverted due to syntax issues; a safe reintroduction will follow.

- feat(puter): Add Puter (Claude Sonnet) client integration
  - Add CDN script tag (https://js.puter.com/v2/) to `client/index.html` for quick testing
  - Install `@heyputer/puter.js` package as a fallback
  - Add `client/src/lib/puter-client.ts` helper that calls `puter.ai.chat` (prefers CDN global, falls back to dynamic import)

## [2025-11-xx] migration-canvas-to-dom

- Commit: migration(dom-canvas): migrate canvas from transform/konva to DOM-based zoom & panning
