# Vivid

The web presence of Vivid, a voice AI with a female identity. One full-viewport
particle figure — the Presence — and a command Hub. She speaks English, Yorùbá,
Igbo, Hausa and Pidgin.

`docs/DESIGN-BRIEF.md` is the specification. Read it before touching the
figure; it was extracted frame by frame from the reference footage and every
constraint in it is there for a reason.

## Requirements

Node 22 (pinned in `.tool-versions`) and pnpm. Node 24 breaks `pnpm install`.

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## Scripts

| Command          | What it does     |
| ---------------- | ---------------- |
| `pnpm dev`       | Dev server       |
| `pnpm build`     | Production build |
| `pnpm lint`      | ESLint           |
| `pnpm typecheck` | `tsc --noEmit`   |

## Structure

```
app/                     routes. page.tsx is the Presence.
components/presence/     the one client component that mounts the canvas.
lib/vivid/               framework-free core: scene, geometry, audio, state.
docs/DESIGN-BRIEF.md     the specification.
```

React owns the chrome and never the render loop. Everything under `lib/vivid/`
must stay importable outside React, so the figure can be developed and tested
standalone.

Voice keys will live in route handlers under `app/api/`, never in the client.
