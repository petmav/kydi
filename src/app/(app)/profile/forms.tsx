"use client";

import { Field, Form, SubmitButton } from "@/components/form";
import { ConfirmButton } from "@/components/confirm";
import { initials } from "@/lib/utils";
import { changePasswordAction, signOutOtherSessionsAction, updateAvatarAction, updateProfileAction } from "./actions";

export function AvatarForm({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <Form action={updateAvatarAction} className="flex flex-wrap items-center gap-5" resetOnSuccess>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={`${name} profile photo`} className="h-20 w-20 rounded-full border border-line object-cover" />
      ) : (
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-700 text-xl font-semibold text-white" aria-hidden="true">
          {initials(name)}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-3">
        <Field name="avatar" label="Profile photo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hint="JPG, PNG, GIF or WebP up to 2 MB. Shown as a square crop." />
        <div className="flex gap-2">
          <SubmitButton size="sm" pendingLabel="Uploading…">Upload photo</SubmitButton>
          {avatarUrl ? (
            <SubmitButton size="sm" variant="secondary" name="remove" value="1">
              Remove photo
            </SubmitButton>
          ) : null}
        </div>
      </div>
    </Form>
  );
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  return (
    <Form action={updateProfileAction} className="space-y-4">
      <Field name="name" label="Full name" defaultValue={name} required autoComplete="name" />
      <Field name="email" type="email" label="Email" defaultValue={email} required autoComplete="email" />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </Form>
  );
}

export function PasswordForm() {
  return (
    <Form action={changePasswordAction} className="space-y-4" resetOnSuccess>
      <Field name="current" type="password" label="Current password" required autoComplete="current-password" />
      <Field name="password" type="password" label="New password" required autoComplete="new-password" hint="At least 8 characters." />
      <Field name="confirm" type="password" label="Confirm new password" required autoComplete="new-password" />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
      </div>
    </Form>
  );
}

export function SessionsCard() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">Lost a device or used a shared computer? Sign out everywhere except here.</p>
      <ConfirmButton
        action={signOutOtherSessionsAction}
        title="Sign out other sessions?"
        description="All other browsers and devices will need to sign in again."
        confirmLabel="Sign out others"
      >
        Sign out other sessions
      </ConfirmButton>
    </div>
  );
}
