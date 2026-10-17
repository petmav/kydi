import type { Metadata } from "next";
import { Card, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/context";
import { APP_VERSION } from "@/lib/version";

export const metadata: Metadata = { title: "System · Administration" };

const ROWS: [string, string][] = [
  ["PDF generation", "Built-in renderer with A4 pages and three templates per document type. An external rendering service is not supported."],
  ["Fonts", "PDFs use the bundled DejaVu Sans font (Latin, Latin Extended, Greek and Cyrillic). Changing the PDF font is not supported."],
  ["File disks", "Files are stored on the local disk set by UPLOAD_DIR (a named volume in the container). Remote disks are not supported."],
  ["Backups", "Not available in the application. Back up the PostgreSQL database and the uploads volume with your hosting tools."],
  ["Currencies", "The ISO 4217 list built into the runtime is used; editing currencies is not supported."],
  ["Update app", `Version ${APP_VERSION}. Updates are installed by deploying a new image.`],
];

/** Spec §5.13 settings that this version implements as fixed behaviour (see §11 for the optional items). */
export default async function SystemPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") return null;
  return (
    <Card>
      <CardHeader title="System" description="Installation settings that are fixed in this version." />
      <Table>
        <thead>
          <tr>
            <Th>Area</Th>
            <Th>Behaviour</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ROWS.map(([k, v]) => (
            <tr key={k}>
              <Td className="font-medium">{k}</Td>
              <Td className="whitespace-normal text-ink-2">{v}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
