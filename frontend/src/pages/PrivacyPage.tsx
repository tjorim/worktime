import * as m from "@/paraglide/messages.js";

export function PrivacyPage() {
  return (
    <main id="main-content" className="tw:py-6">
      <div className="tw:mx-auto tw:max-w-5xl tw:px-3">
        <section className="tw:rounded-xl tw:border tw:border-border tw:bg-background tw:shadow-sm tw:overflow-hidden">
          <div className="tw:px-6 tw:py-6 tw:md:px-12">
            <div className="tw:mb-6">
              <div className="tw:uppercase tw:text-sm tw:text-muted-foreground tw:font-semibold tw:mb-2">
                {m.privacy_page_eyebrow()}
              </div>
              <h1 className="tw:text-2xl tw:mb-2">{m.privacy_page_title()}</h1>
              <p className="tw:text-muted-foreground tw:mb-0">{m.privacy_page_intro()}</p>
            </div>

            <div className="tw:grid tw:gap-6">
              <section>
                <h2 className="tw:text-lg">{m.privacy_page_storage_title()}</h2>
                <p className="tw:mb-2">{m.privacy_page_storage_intro()}</p>
                <ul className="tw:mb-0">
                  <li>{m.privacy_page_storage_accounts()}</li>
                  <li>{m.privacy_page_storage_work_data()}</li>
                  <li>{m.privacy_page_storage_preferences()}</li>
                </ul>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_signin_title()}</h2>
                <p className="tw:mb-0">{m.privacy_page_signin_body()}</p>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_access_title()}</h2>
                <ul className="tw:mb-0">
                  <li>{m.privacy_page_access_you()}</li>
                  <li>{m.privacy_page_access_admins()}</li>
                  <li>{m.privacy_page_access_infra()}</li>
                </ul>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_thirdparty_title()}</h2>
                <p className="tw:mb-2">{m.privacy_page_thirdparty_intro()}</p>
                <ul className="tw:mb-0">
                  <li>{m.privacy_page_thirdparty_identity()}</li>
                  <li>{m.privacy_page_thirdparty_holidays()}</li>
                  <li>{m.privacy_page_thirdparty_errors()}</li>
                </ul>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_notifications_title()}</h2>
                <p className="tw:mb-0">{m.privacy_page_notifications_body()}</p>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_diagnostics_title()}</h2>
                <p className="tw:mb-0">{m.privacy_page_diagnostics_body()}</p>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_retention_title()}</h2>
                <p className="tw:mb-0">{m.privacy_page_retention_body()}</p>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_rights_title()}</h2>
                <ul className="tw:mb-0">
                  <li>{m.privacy_page_rights_export()}</li>
                  <li>{m.privacy_page_rights_delete()}</li>
                </ul>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_children_title()}</h2>
                <p className="tw:mb-0">{m.privacy_page_children_body()}</p>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_changes_title()}</h2>
                <p className="tw:mb-0">{m.privacy_page_changes_body()}</p>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_contact_title()}</h2>
                <p className="tw:mb-0">{m.privacy_page_contact_body()}</p>
              </section>

              <section>
                <h2 className="tw:text-lg">{m.privacy_page_tracking_title()}</h2>
                <p className="tw:mb-0">{m.privacy_page_tracking_body()}</p>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
