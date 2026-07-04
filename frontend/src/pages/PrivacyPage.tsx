import * as m from "@/paraglide/messages.js";

export function PrivacyPage() {
  return (
    <main id="main-content" className="py-4">
      <div className="mx-auto" style={{ maxWidth: "960px" }}>
        <section className="rounded-4 border bg-body shadow-sm overflow-hidden">
          <div className="px-4 py-4 px-md-5">
            <div className="mb-4">
              <div className="text-uppercase small text-muted fw-semibold mb-2">
                {m.privacy_page_eyebrow()}
              </div>
              <h1 className="h3 mb-2">{m.privacy_page_title()}</h1>
              <p className="text-muted mb-0">{m.privacy_page_intro()}</p>
            </div>

            <div className="d-grid gap-4">
              <section>
                <h2 className="h5">{m.privacy_page_storage_title()}</h2>
                <p className="mb-2">{m.privacy_page_storage_intro()}</p>
                <ul className="mb-0">
                  <li>{m.privacy_page_storage_accounts()}</li>
                  <li>{m.privacy_page_storage_work_data()}</li>
                  <li>{m.privacy_page_storage_preferences()}</li>
                </ul>
              </section>

              <section>
                <h2 className="h5">{m.privacy_page_signin_title()}</h2>
                <p className="mb-0">{m.privacy_page_signin_body()}</p>
              </section>

              <section>
                <h2 className="h5">{m.privacy_page_access_title()}</h2>
                <ul className="mb-0">
                  <li>{m.privacy_page_access_you()}</li>
                  <li>{m.privacy_page_access_admins()}</li>
                  <li>{m.privacy_page_access_infra()}</li>
                </ul>
              </section>

              <section>
                <h2 className="h5">{m.privacy_page_thirdparty_title()}</h2>
                <p className="mb-2">{m.privacy_page_thirdparty_intro()}</p>
                <ul className="mb-0">
                  <li>{m.privacy_page_thirdparty_identity()}</li>
                  <li>{m.privacy_page_thirdparty_holidays()}</li>
                  <li>{m.privacy_page_thirdparty_errors()}</li>
                </ul>
              </section>

              <section>
                <h2 className="h5">{m.privacy_page_notifications_title()}</h2>
                <p className="mb-0">{m.privacy_page_notifications_body()}</p>
              </section>

              <section>
                <h2 className="h5">{m.privacy_page_diagnostics_title()}</h2>
                <p className="mb-0">{m.privacy_page_diagnostics_body()}</p>
              </section>

              <section>
                <h2 className="h5">{m.privacy_page_retention_title()}</h2>
                <p className="mb-0">{m.privacy_page_retention_body()}</p>
              </section>

              <section>
                <h2 className="h5">{m.privacy_page_rights_title()}</h2>
                <ul className="mb-0">
                  <li>{m.privacy_page_rights_export()}</li>
                  <li>{m.privacy_page_rights_delete()}</li>
                </ul>
              </section>

              <section>
                <h2 className="h5">{m.privacy_page_contact_title()}</h2>
                <p className="mb-0">
                  {m.privacy_page_contact_body()}{" "}
                  <a
                    href="https://github.com/tjorim/worktime/issues/new/choose"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {m.privacy_page_contact_link()}
                  </a>
                </p>
              </section>

              <section>
                <h2 className="h5">{m.privacy_page_tracking_title()}</h2>
                <p className="mb-0">{m.privacy_page_tracking_body()}</p>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
