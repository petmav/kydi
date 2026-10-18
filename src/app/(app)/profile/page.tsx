import type { Metadata } from "next";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { getCompanyContext } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { ProfileForm, PasswordForm, SessionsCard } from "./forms";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const ctx = await getCompanyContext();
  const sessions = await db.session.count({ where: { userId: ctx.user.id, expiresAt: { gt: new Date() } } });
  return (
    <>
      <PageHeader title="My profile" description="Manage your personal details and sign-in security." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-tour="profile-details">
          <CardHeader title="Personal details" description="Your name and email are shown to teammates." />
          <CardBody>
            <ProfileForm name={ctx.user.name} email={ctx.user.email} />
          </CardBody>
        </Card>
        <Card data-tour="profile-security">
          <CardHeader title="Change password" description="Use a long, unique password." />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2" data-tour="profile-sessions">
          <CardHeader title="Sessions" description={`You are signed in on ${sessions} device(s).`} />
          <CardBody>
            <SessionsCard />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2" data-tour="company-access">
          <CardHeader title="Company access" />
          <CardBody>
            <ul className="divide-y divide-line text-sm">
              {ctx.memberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <span className="font-medium">{m.company.name}</span>
                  <span className="text-muted">{m.company.ownerId === ctx.user.id ? "Owner" : m.role.title}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
