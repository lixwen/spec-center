import { cookies, headers } from "next/headers";
import { getMessages, localeCookieName, normalizeLocale, type Locale } from "./i18n";

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(localeCookieName)?.value;

  if (saved) {
    return normalizeLocale(saved);
  }

  const headerStore = await headers();
  return normalizeLocale(headerStore.get("accept-language"));
}

export async function getRequestMessages() {
  const locale = await getRequestLocale();
  return {
    locale,
    messages: getMessages(locale)
  };
}
