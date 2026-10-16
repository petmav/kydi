import { ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/primitives";

export function Forbidden({ message }: { message?: string }) {
  return (
    <Card>
      <EmptyState
        icon={<ShieldAlert className="h-6 w-6" aria-hidden="true" />}
        title="You don't have access to this page"
        description={message ?? "Ask a company administrator to grant your role the required permission."}
        action={
          <ButtonLink href="/dashboard" variant="secondary">
            Go to dashboard
          </ButtonLink>
        }
      />
    </Card>
  );
}
