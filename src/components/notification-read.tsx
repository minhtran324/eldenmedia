"use client";
import { useActionState } from "react";
import type { ActionState } from "@/features/accounts/actions";
import { readNotification } from "@/features/notifications/actions";
import { SubmitButton } from "./account-forms";
export function NotificationRead({ id }: { id: string }) {
  const [state, action] = useActionState(async (previous: ActionState, form: FormData) => {
    const result = await readNotification(previous, form);
    if (result.success) window.dispatchEvent(new Event("notifications-changed"));
    return result;
  }, {});
  return <form action={action}><input type="hidden" name="id" value={id} /><SubmitButton secondary>Đánh dấu đã đọc</SubmitButton>{state.error && <p role="alert">{state.error}</p>}</form>;
}
