# Offline builder variant. Build context must contain only a verified Linux
# amd64 `clawmanager-agent` produced from the pinned AgentsRuntime commit.
# The deployment base must be the exact immutable running image manifest.
ARG BASE_IMAGE=registry.invalid/required-pinned-runtime:missing
FROM ${BASE_IMAGE}
ARG AGENT_REVISION
LABEL org.opencontainers.image.revision="${AGENT_REVISION}" \
      io.clawmanager.backup.agent.protocol="isolated-backup.v1"
COPY --chmod=0555 clawmanager-agent /usr/local/bin/clawmanager-agent
