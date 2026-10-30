# Build context: the patched AgentsRuntime repository root, not ClawManager.
# BASE_IMAGE must be the exact deployed runtime image digest. This only replaces
# the Agent binary; the entrypoint, runtime language stack and defaults remain
# from that immutable base image.
ARG BASE_IMAGE=registry.invalid/required-pinned-runtime:missing
ARG GO_IMAGE=golang:1.26.8-bookworm@sha256:9fdc884aacc3bec89b20ffc69f4bb369c78210e3e4f600387b5128b12c199f81
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS agent-builder
ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG AGENT_KIND
ARG AGENT_REVISION
COPY clawmanager-agent/ /src/clawmanager-agent/
COPY openclaw/ /src/openclaw/
COPY hermes/ /src/hermes/
RUN case "${AGENT_KIND}" in openclaw|hermes) ;; *) exit 1 ;; esac \
    && test -n "${AGENT_REVISION}" \
    && cd "/src/${AGENT_KIND}" \
    && go mod download \
    && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
       go build -trimpath -ldflags="-s -w -X main.version=${AGENT_REVISION}" \
       -o /out/clawmanager-agent "./cmd/${AGENT_KIND}-lite-agent"

FROM ${BASE_IMAGE}
ARG AGENT_REVISION
LABEL org.opencontainers.image.revision="${AGENT_REVISION}" \
      io.clawmanager.backup.agent.protocol="isolated-backup.v1"
COPY --from=agent-builder --chmod=0555 /out/clawmanager-agent /usr/local/bin/clawmanager-agent
