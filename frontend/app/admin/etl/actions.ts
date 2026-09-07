"use server";

import { redirect } from "next/navigation";

import {
  checkPassword,
  clearEtlSession,
  etlPassword,
  setEtlSession,
} from "@/lib/admin-auth";

// Server Actions are reachable by direct POST, so both actions re-check the
// deployment flag themselves instead of trusting the page that rendered them.

export async function loginAction(formData: FormData): Promise<void> {
  const configured = etlPassword();
  if (!configured) redirect("/admin/etl");

  const submitted = String(formData.get("password") ?? "");
  if (!checkPassword(submitted)) redirect("/admin/etl?blad=1");

  await setEtlSession(configured);
  redirect("/admin/etl");
}

export async function logoutAction(): Promise<void> {
  await clearEtlSession();
  redirect("/admin/etl");
}
