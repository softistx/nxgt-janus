# @nxgt/janus-webhooks-redis — documentation

The [README](../README.md) shows the whole wiring in one example; these pages
give the detail. The words — delivery, claim, lease, endpoint id, orphan —
are `@nxgt/janus-webhooks`'s, defined in
[its index](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-webhooks/docs/README.md#words).

| Page | Read it when |
| --- | --- |
| [Wiring the queue to Redis](guide/wiring.md) | You are passing the queue to `webhooks()`, choosing a prefix and the connection's options, configuring Redis, reading what Redis holds and how each method stays atomic, or handling what a failure throws |
| [Troubleshooting](troubleshooting.md) | You have an error message and want its cause and its fix |
| [Roadmap](roadmap.md) | You want to know what is coming, what shipped, and what is deliberately not planned |
