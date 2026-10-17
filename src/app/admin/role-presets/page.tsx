import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ModalForm } from "@/components/modal";
import { RoleFields } from "@/components/settings/forms";
import { requireUser } from "@/lib/auth/context";
import { getRolePresets } from "@/lib/role-presets";
import { saveRolePresetAction } from "../actions";

export const metadata: Metadata = { title: "Role presets · Administration" };

/** Spec §5.13 Role presets: edit preset ability sets (owner fixed), create presets; changes sync into all companies. */
export default async function RolePresetsPage() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") return null;
  const presets = await getRolePresets();
  return (
    <Card>
      <CardHeader
        title="Role presets"
        description="Presets are copied into every company. Saving a preset updates the matching role in all companies."
        actions={
          <ModalForm
            trigger={
              <>
                <Plus className="h-4 w-4" aria-hidden="true" /> New preset
              </>
            }
            title="New role preset"
            action={saveRolePresetAction}
            size="sm"
            wide
          >
            <RoleFields />
          </ModalForm>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Preset</Th>
            <Th className="text-right">Abilities</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {presets.map((p) => (
            <tr key={p.name}>
              <Td className="font-medium">
                {p.title} {p.isOwner ? <Badge>Fixed</Badge> : null}
              </Td>
              <Td className="tabular text-right">{p.abilities.length}</Td>
              <Td>
                <div className="flex justify-end">
                  {p.isOwner ? (
                    <span className="text-xs text-muted">Holds every ability</span>
                  ) : (
                    <ModalForm trigger={<Pencil className="h-4 w-4" aria-label={`Edit ${p.title}`} />} title={`Edit ${p.title}`} action={saveRolePresetAction} variant="ghost" size="sm" wide>
                      <input type="hidden" name="name" value={p.name} />
                      <RoleFields role={{ id: 0, title: p.title, abilities: p.abilities }} />
                    </ModalForm>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
