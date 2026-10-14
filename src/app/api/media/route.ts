import { NextResponse } from "next/server";
import { storage } from "@/lib/storage/index.ts";
import { assinaturaValida } from "@/lib/storage/assinatura.ts";
import { env } from "@/env";

/**
 * Serve os criativos no driver local, imitando a URL assinada do S3/R2.
 * Em producao com STORAGE_DRIVER=s3 essa rota nao e usada.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig");

  if (!key || !sig || !Number.isFinite(exp)) {
    return NextResponse.json({ erro: "Parametros invalidos." }, { status: 400 });
  }
  if (env.STORAGE_DRIVER !== "local") {
    return NextResponse.json({ erro: "Rota disponivel apenas no driver local." }, { status: 404 });
  }
  if (!assinaturaValida(key, exp, sig)) {
    return NextResponse.json({ erro: "Link expirado ou invalido." }, { status: 403 });
  }

  try {
    const conteudo = await storage.ler(key);
    const tipo = key.endsWith(".mp4")
      ? "video/mp4"
      : key.endsWith(".mov")
        ? "video/quicktime"
        : "image/jpeg";

    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        "Content-Type": tipo,
        "Cache-Control": "private, max-age=600",
        "Content-Length": String(conteudo.byteLength),
      },
    });
  } catch {
    return NextResponse.json({ erro: "Arquivo nao encontrado." }, { status: 404 });
  }
}
