# Public B adapter

`NewPublicRunner(Dependencies)` implements the original
`systembackupdispatch.Runner` ABI. `NewLinuxDispatcher` constructs the concrete
SELECT-only Linux profile plus the shared Dispatcher. Neither constructor opens
credentials, runs migrations or starts an independent controller.

The required profile factories build original writer handles. `BuildCapturePart`
reuses the real workspace/database Job builders to freeze immutable Job specs;
it never dispatches them. All writer ACKs and CheckPaused precede EnsureJob.
D supplies the authoritative Ports and encrypted plan journal; A supplies
authenticated worker identities/grants/results; C supplies immutable seals and
public artifact/finalizer/catalog services. Missing dependencies fail closed.

Use `DescribePlan` with the original persisted Plan to assemble invocation
ConfigMaps/grants. `BuildPartResult` converts an already authenticated worker
receipt plus an observed immutable C seal into public module data. Neither
helper authenticates a caller or creates evidence. The SHA on a report always
refers to its original bytes; a typed projection must not reuse that signature
after re-encoding or modifying fields.

`Capture` handles initial source capture and completed sealed-set reuse. An
incomplete existing Job set is left to D recovery/reconcile. `Recover` consumes
the original complete pause/Job ledger and stops collectors before source
resume. Each planned unit must have an original binding or an explicit journal
proof of never having been dispatched (`RecoverySnapshot.Undispatched`); an
absent Kubernetes object is not sufficient. Source-only preflight has no resource mutation. Target descriptors and
relay/checkpoint schemas remain owner-review candidates; target restore and
acceptance are not enabled by these helpers.

See [the complete handoff](../../../../docs/system-backup-b-public-runner-handoff-20261028.md)
for actual call positions, input fields, safety invariants, limitations and test
scope. No private SQLStore/Vault/task/publication fallback is imported here.
