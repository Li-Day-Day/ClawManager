#!/bin/sh
# Emit only the two public download API locations, inside the frontend server.
# This script does not start a runtime or admit its configuration.
set -eu

reject() {
  echo 'Invalid system backup download proxy configuration' >&2
  exit 1
}

case "${SYSTEM_BACKUP_DOWNLOAD_PROXY_ENABLED:-false}" in
  false) enabled=false ;;
  true) enabled=true ;;
  *) reject ;;
esac

if [ "$enabled" = true ]; then
  upstream_host="${SYSTEM_BACKUP_DOWNLOAD_PROXY_HOST:-}"
  upstream_port="${SYSTEM_BACKUP_DOWNLOAD_PROXY_PORT:-9443}"
  server_name="${SYSTEM_BACKUP_DOWNLOAD_PROXY_SERVER_NAME:-}"
  ca_file="${SYSTEM_BACKUP_DOWNLOAD_PROXY_CA_FILE:-}"

  dns_name() {
    [ "${#1}" -le 253 ] || return 1
    case "$1" in ''|*[!A-Za-z0-9.-]*|.*|*.|*..*) return 1 ;; esac
    printf '%s\n' "$1" | LC_ALL=C awk -F. '
      { for (i=1; i<=NF; i++) {
          if (length($i)>63 || $i ~ /^-/ || $i ~ /-$/) exit 1
        }
      }'
  }
  dns_name "$upstream_host" || reject
  dns_name "$server_name" || reject
  case "$upstream_port" in ''|*[!0-9]*) reject ;; esac
  [ "${#upstream_port}" -le 5 ] || reject
  [ "$upstream_port" -ge 1 ] && [ "$upstream_port" -le 65535 ] || reject
  case "$ca_file" in /*) ;; *) reject ;; esac
  case "$ca_file" in *[!A-Za-z0-9/._-]*) reject ;; esac
  [ -f "$ca_file" ] && [ -r "$ca_file" ] && [ -s "$ca_file" ] || reject
fi

for route in '= /api/v1/admin/system-backup-strong-auth/proof' '^~ /api/v1/admin/system-backup-evidence/'; do
  printf 'location %s {\n' "$route"
  if [ "$enabled" = false ]; then
    cat <<'CONF'
    default_type application/json;
    add_header Cache-Control "no-store" always;
    return 503 '{"code":"not_ready","message":"not_ready"}';
}
CONF
    continue
  fi

  # All interpolated values have a closed character set. Resolve the Service
  # at request time using nginx's configured cluster DNS resolver, so an absent
  # download Service cannot prevent the rest of the application from starting.
  printf '    set $system_backup_download_upstream "%s:%s";\n' "$upstream_host" "$upstream_port"
  printf '    proxy_ssl_name "%s";\n' "$server_name"
  printf '    proxy_ssl_trusted_certificate "%s";\n' "$ca_file"
  cat <<'CONF'
    proxy_ssl_verify on;
    proxy_ssl_verify_depth 3;
    proxy_ssl_server_name on;
    proxy_ssl_protocols TLSv1.2 TLSv1.3;
    proxy_pass https://$system_backup_download_upstream$request_uri;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-ClawManager-Runtime-Origin "";
    proxy_set_header Connection "";
    proxy_set_header Accept-Encoding "";
    proxy_set_header Referer "";
    proxy_connect_timeout 5s;
    proxy_read_timeout 40s;
    proxy_send_timeout 40s;
    proxy_next_upstream off;
    proxy_redirect off;
    proxy_intercept_errors off;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_max_temp_file_size 0;
    proxy_cache off;
    proxy_store off;
    gzip off;
    client_max_body_size 256k;
    client_body_buffer_size 256k;
    proxy_hide_header Cache-Control;
    add_header Cache-Control "no-store" always;
}
CONF
done
