# Guidance for coding agents

- Monorepo using npm workspaces: `packages/*`, `examples/*`.
- Everything is TypeScript + React 18. Core must stay dependency-free (React only).
- Animations are pure functions of the frame number. Never use `Date.now()` or `Math.random()` in compositions; use a seeded value instead.
- Build: `npm run build`. Typecheck: `npm run typecheck`. Tests: `npm test`.
