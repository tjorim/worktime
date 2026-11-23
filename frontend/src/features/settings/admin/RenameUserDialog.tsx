import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminUserRow } from "@/features/settings/admin/AdminUsersTable";
import * as m from "@/paraglide/messages.js";

interface RenameUserDialogProps {
  user: AdminUserRow;
  onSave: (userId: number, username: string) => Promise<string | null>;
  onClose: () => void;
}

export function RenameUserDialog({ user, onSave, onClose }: RenameUserDialogProps) {
  const [draft, setDraft] = useState(user.username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {m.account_admin_users_rename_user({ username: user.username })}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (saving || draft === user.username) return;
            setSaving(true);
            setError(null);
            const message = await onSave(user.id, draft);
            if (message === null) {
              onClose();
            } else {
              setError(message);
              setSaving(false);
            }
          }}
        >
          <div className="space-y-2 p-4">
            <Label htmlFor="admin-rename-username">{m.account_admin_users_username()}</Label>
            <Input
              id="admin-rename-username"
              autoCapitalize="none"
              spellCheck={false}
              value={draft}
              disabled={saving}
              onChange={(event) => setDraft(event.target.value)}
            />
            {error && <Alert variant="destructive">{error}</Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" disabled={saving} onClick={onClose}>
              {m.cancel()}
            </Button>
            <Button type="submit" disabled={saving || draft === user.username}>
              {m.save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
