import * as m from "@/paraglide/messages.js";

export function PrivacyPage() {
  return (
    <main id="main-content" className="py-6">
      <div className="mx-auto max-w-5xl px-3">
        <section className="rounded-xl border border-border bg-background shadow-sm overflow-hidden">
          <div className="px-6 py-6 md:px-12">
            <div className="mb-6">
              <div className="uppercase text-sm text-muted-foreground font-semibold mb-2">
                {m.privacy_page_eyebrow()}
              </div>
              <h1 className="text-2xl mb-2">{m.privacy_page_title()}</h1>
              <p className="text-muted-foreground mb-0">{m.privacy_page_intro()}</p>
            </div>

            <div className="grid gap-6">
              <section>
                <h2 className="text-lg">{m.privacy_page_storage_title()}</h2>
                <p className="mb-2">{m.privacy_page_storage_intro()}</p>
                <ul className="mb-0">
                  <li>{m.privacy_page_storage_accounts()}</li>
                  <li>{m.privacy_page_storage_work_data()}</li>
                  <li>{m.privacy_page_storage_preferences()}</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_signin_title()}</h2>
                <p className="mb-0">{m.privacy_page_signin_body()}</p>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_access_title()}</h2>
                <ul className="mb-0">
                  <li>{m.privacy_page_access_you()}</li>
                  <li>{m.privacy_page_access_admins()}</li>
                  <li>{m.privacy_page_access_infra()}</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_thirdparty_title()}</h2>
                <p className="mb-2">{m.privacy_page_thirdparty_intro()}</p>
                <ul className="mb-0">
                  <li>{m.privacy_page_thirdparty_identity()}</li>
                  <li>{m.privacy_page_thirdparty_holidays()}</li>
                  <li>{m.privacy_page_thirdparty_errors()}</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_notifications_title()}</h2>
                <p className="mb-0">{m.privacy_page_notifications_body()}</p>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_diagnostics_title()}</h2>
                <p className="mb-0">{m.privacy_page_diagnostics_body()}</p>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_retention_title()}</h2>
                <p className="mb-0">{m.privacy_page_retention_body()}</p>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_rights_title()}</h2>
                <ul className="mb-0">
                  <li>{m.privacy_page_rights_export()}</li>
                  <li>{m.privacy_page_rights_delete()}</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_children_title()}</h2>
                <p className="mb-0">{m.privacy_page_children_body()}</p>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_changes_title()}</h2>
                <p className="mb-0">{m.privacy_page_changes_body()}</p>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_contact_title()}</h2>
                <p className="mb-0">{m.privacy_page_contact_body()}</p>
              </section>

              <section>
                <h2 className="text-lg">{m.privacy_page_tracking_title()}</h2>
                <p className="mb-0">{m.privacy_page_tracking_body()}</p>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
