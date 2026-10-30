# Build context contains only the Linux/amd64 custody binary from the pinned commit.
FROM alpine:3.22
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
COPY --chmod=0555 system-backup-seal-custody /system-backup-seal-custody
RUN ln -s /system-backup-seal-custody /usr/local/bin/system-backup-seal-custody
USER 65532:65532
ENTRYPOINT ["/system-backup-seal-custody"]
