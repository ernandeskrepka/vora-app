import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { montarPrevia } from "@/services/perfil.ts";
import { assinaturaDoPerfilValida } from "@/services/perfil-link.ts";
import { formatarDataHora } from "@/lib/datetime.ts";
import { CelularComGrade, FilaDoPerfil } from "@/components/previa-perfil.tsx";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seu perfil | VORA",
  robots: { index: false, follow: false },
};

/**
 * O perfil como vai ficar, para o cliente acompanhar sem login.
 *
 * Mostra a grade com o que ja saiu e o que esta a caminho (so o que ja tem
 * arte). Nada interno entra aqui: status, versao, quem subiu, auditoria.
 */
export default async function PerfilDoClientePublico({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ a?: string }>;
}) {
  const { clienteId } = await params;
  const { a } = await searchParams;
  if (!a || !assinaturaDoPerfilValida(clienteId, a)) notFound();

  const previa = await montarPrevia({ clienteId, interno: false });
  if (!previa) notFound();

  return (
    <main className="min-h-screen bg-vora-claro px-4 py-8 text-zinc-900">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <img src="/marca/vora-logo.svg" alt="VORA" className="h-6 w-auto" />
            <h1 className="mt-3 text-2xl font-semibold">{previa.cliente.nome}</h1>
            <p className="text-sm text-zinc-600">Como o seu perfil esta ficando</p>
          </div>
          {previa.atualizadoEm && (
            <p className="text-xs text-zinc-500">
              Atualizado em {formatarDataHora(previa.atualizadoEm, previa.cliente.fuso)}
            </p>
          )}
        </header>

        <p className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-700">
          A grade mostra o que ja foi publicado e, com a borda amarela, o que esta a caminho com a
          data prevista. Conforme a equipe da VORA sobe o planejamento, esta pagina se atualiza
          sozinha: e so abrir o mesmo link. A aprovacao de cada post continua chegando pelo
          WhatsApp.
        </p>

        <div className="grid gap-8 md:grid-cols-[320px_1fr]">
          <CelularComGrade previa={previa} interno={false} />
          <section>
            <h2 className="text-sm font-semibold">A caminho</h2>
            <div className="mt-2 rounded-xl border border-zinc-200 bg-white px-4">
              <FilaDoPerfil previa={previa} interno={false} />
            </div>
          </section>
        </div>

        <footer className="mt-10 text-center text-xs text-zinc-400">
          VORA · vorabr.com
        </footer>
      </div>
    </main>
  );
}
