import { cookies } from "next/headers";

export const FLASH_COOKIE = "halyard_flash";

/** Queue a toast to display after the next navigation (used before redirect()). */
export async function setFlash(message: string, variant: "success" | "error" | "info" = "success") {
  const jar = await cookies();
  jar.set(FLASH_COOKIE, encodeURIComponent(JSON.stringify({ message, variant })), {
    path: "/",
    maxAge: 30,
    sameSite: "lax",
    httpOnly: false,
  });
}
