import { Construction } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={<Construction className="h-6 w-6" aria-hidden="true" />} title={`${title} is on its way`} description={description} />
      </Card>
    </>
  );
}
