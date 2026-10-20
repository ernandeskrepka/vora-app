"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_TEMA, normalizarTema } from "@/lib/tema.ts";

const UM_ANO = 60 * 60 * 24 * 365;

/** Troca o layout do painel para quem esta neste navegador. */
export async function acaoTrocarTema(formData: FormData) {
  const tema = normalizarTema(String(formData.get("tema") ?? ""));
  const jar = await cookies();
  jar.set(COOKIE_TEMA, tema, {
    path: "/",
    maxAge: UM_ANO,
    sameSite: "lax",
    httpOnly: false,
  });
  revalidatePath("/", "layout");
}
