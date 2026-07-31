import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve("src/pages/teams/CreateTeamPage.tsx"),
  "utf8",
);

for (const marker of [
  'const LEADER_RUNTIME_TYPE: RuntimeType = "openclaw"',
  'item.instance_type === "hermes"',
  'runtime_type: runtimeType',
  'image_registry: imageForRuntime(runtimeType)',
  'updateWorkerRuntime(member.id, runtimeType)',
  'OpenClaw Leader · Lite Worker 可选',
  'Hermes Lite',
]) {
  assert.ok(source.includes(marker), `CreateTeamPage missing ${marker}`);
}

assert.ok(
  source.includes('member.isLeader ? LEADER_RUNTIME_TYPE : member.runtimeType'),
  "Leader runtime must remain fixed while Worker runtime stays selectable",
);
assert.ok(
  !source.includes("runtime_type: FIXED_RUNTIME_TYPE"),
  "Team payload must not overwrite every Worker runtime with OpenClaw",
);
assert.ok(
  !source.includes("image_registry: openClawLiteImage"),
  "Team payload must resolve images per member runtime",
);

console.log("create Team mixed-runtime contract passed");
