import { createRoot } from "react-dom/client";
import "@/styles/tailwind.css";
import { AdminUsersTable } from "@/components/settings/admin/AdminUsersTable";
import { SettingsAuditTrailSection } from "@/components/settings/account/SettingsAuditTrailSection";
import { setLocale } from "@/paraglide/runtime.js";

const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") ?? "light");
setLocale(params.get("lang") === "nl" ? "nl" : "en", { reload: false });
const timestamp = "2026-11-04T09:00:00Z";
createRoot(document.getElementById("root")!).render(
  <main className="p-3 space-y-4">
    <AdminUsersTable
      users={[
        {
          id: 1,
          username: "alex",
          display_name: "Alex Example",
          created_at: timestamp,
          updated_at: timestamp,
        },
      ]}
      currentAccountId={null}
      deletingAdminUserId={null}
      onRequestDelete={() => {}}
    />
    <SettingsAuditTrailSection
      entries={[
        {
          id: 1,
          actor_user_id: 1,
          subject: "alex",
          request_id: null,
          action: "event_updated",
          resource_type: "event",
          resource_id: "1",
          actor_label: "Alex Example",
          auth_source: "oidc",
          created_at: timestamp,
          details: { note: "Annual leave" },
        },
      ]}
      isLoading={false}
      isLoadingMore={false}
      error={null}
      hasMore
      onLoadMore={() => {}}
    />
  </main>,
);
