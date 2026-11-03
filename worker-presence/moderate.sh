#!/bin/sh
# Moderate the desktop chat and guestbook (rsb-presence /admin endpoints).
# The admin token is read from the macOS Keychain item "rsb-presence-admin",
# the same value set as the Worker's ADMIN_TOKEN secret.
#
#   ./moderate.sh list chat|guestbook
#   ./moderate.sh delete chat|guestbook <id>

set -eu

BASE="${RSB_PRESENCE_URL:-https://rsb-presence.eduardoyi.workers.dev}"
action="${1:-}"
kind="${2:-}"
id="${3:-}"

usage() {
  echo "Usage: $0 list chat|guestbook" >&2
  echo "       $0 delete chat|guestbook <id>" >&2
  exit 1
}

case "$kind" in chat|guestbook) ;; *) usage ;; esac

TOKEN=$(security find-generic-password -s rsb-presence-admin -w 2>/dev/null) || {
  echo "No admin token in the Keychain (item \"rsb-presence-admin\")." >&2
  exit 1
}

case "$action" in
  list)
    curl -fsS -H "Authorization: Bearer $TOKEN" "$BASE/admin/$kind" | node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        const rows = JSON.parse(s);
        if (!rows.length) return console.log("(empty)");
        for (const r of rows) {
          const when = new Date(r.ts).toISOString().slice(0, 16).replace("T", " ");
          console.log(`${String(r.id).padStart(5)}  ${when}  ${r.name}: ${r.text}`);
        }
      });'
    ;;
  delete)
    case "$id" in ''|*[!0-9]*) usage ;; esac
    status=$(curl -sS -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $TOKEN" "$BASE/admin/$kind/$id")
    case "$status" in
      204) echo "Deleted $kind $id. It disappears for everyone right away." ;;
      404) echo "No $kind entry with id $id." >&2; exit 1 ;;
      *)   echo "Failed (HTTP $status)." >&2; exit 1 ;;
    esac
    ;;
  *) usage ;;
esac
