# CLAUDE.md

This file exists so Claude Code picks up this repository's agent instructions.
It deliberately holds no guidance of its own.

## Read AGENTS.md first

**[AGENTS.md](./AGENTS.md) is the single source of truth.** Everything that
applies to any coding agent working in this repository lives there:

- Why this repository has a persistence port when `nxgt-data` forbids one, and
  the three other divergences declared so a review pass does not re-flag them
- The inherited invariant — *an absence is `null`, a failure throws* — and why it
  moved from an SDK function into the contract of the port
- The casing rule (no `snake_case`, anywhere) and the Biome rule that holds it
- How type safety is **measured** rather than claimed, and where the count lives
- The packaging risk: one definition of `StoreFailure`, and the three guard rails
- The house rules: imports without extensions, generated code in `generated/`,
  adapters peering what they wrap, the verifying order, `bun.lock`, and the
  commit form

## Per-package instructions

Each package under `packages/` has a README that is its npm page and carries
the **API** and **Traps** sections; AGENTS.md's *Layout* says what else it
carries and what goes in its `docs/`. Start with
[`packages/janus`](./packages/janus/README.md), the core every other package
peers.

## Keeping it that way

Add new agent guidance to `AGENTS.md`, never here. This file should only ever
grow content that is genuinely Claude Code-specific — skills, slash commands,
hooks, or settings that would make no sense to a different agent.
