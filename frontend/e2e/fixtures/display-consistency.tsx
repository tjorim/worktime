import { createRoot } from "react-dom/client";
import "@/styles/tailwind.css";
import { SettingsAuditTrailSection } from "@/components/settings/account/SettingsAuditTrailSection";
import { setLocale } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";
const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light");
setLocale(params.get("lang") === "nl" ? "nl" : "en", { reload: false });
const state = params.get("state") ?? "populated";
const populated = ["populated", "team", "loading-more", "error-more"].includes(state);
const entry = {
  id: 1,
  actor_user_id: 7,
  actor_label: "user:7",
  subject: null,
  auth_source: "keycloak_user",
  action: "create_task",
  resource_type: "time_tracking_task",
  resource_id: "a8ff-Ae1d1c24",
  resource_display_name: "Prepare quarterly report",
  request_id: null,
  details: { source: "web" },
  created_at: "2026-11-02T22:24:00",
};
createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-settings bg-background text-foreground">
    <SettingsAuditTrailSection
      entries={
        populated
          ? [
              entry,
              {
                ...entry,
                id: 2,
                resource_display_name: undefined,
                actor_user_id: 8,
                actor_label: "user:8",
                action: "delete_task",
              },
            ]
          : []
      }
      users={[{ id: 7, display_name: "Alex Taylor" }]}
      isLoading={state === "loading"}
      isLoadingMore={state === "loading-more"}
      error={state === "error" || state === "error-more" ? m.audit_trail_load_failed() : null}
      hasMore={populated}
      teamWide={state === "team"}
      onLoadMore={() => {}}
    />
  </main>,
);
