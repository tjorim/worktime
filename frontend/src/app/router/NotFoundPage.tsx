import { Link } from "@tanstack/react-router";
import { SearchXIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import * as m from "@/paraglide/messages.js";

export function NotFoundPage() {
  return (
    <main id="main-content" className="mx-auto max-w-2xl py-12">
      <h1 className="text-center text-2xl">{m.not_found_title()}</h1>
      <EmptyState
        icon={SearchXIcon}
        title="404"
        description={
          <>
            <p>{m.not_found_description()}</p>
            <Link to="/">{m.back_to_worktime()}</Link>
          </>
        }
      />
    </main>
  );
}
