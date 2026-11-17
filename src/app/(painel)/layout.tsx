import Link from "next/link";
import { cookies } from "next/headers";
import { exigirUsuario } from "@/lib/auth.ts";
import { acaoLogout } from "@/app/actions/auth.ts";
import { acaoTrocarTema } from "@/app/actions/tema.ts";
import { env } from "@/env";
import { ROTULO_FUNCAO } from "@/domain/equipe.ts";
import { COOKIE_TEMA, ROTULO_TEMA, normalizarTema } from "@/lib/tema.ts";
import { NavLateral } from "@/components/nav-lateral.tsx";
import { Avatar } from "@/components/ui.tsx";
import { IconeLua, IconeSair, IconeSol } from "@/components/icones.tsx";

export default async function LayoutPainel({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await exigirUsuario();
  const tema = normalizarTema((await cookies()).get(COOKIE_TEMA)?.value);
  const emTeste = env.META_DRY_RUN || env.WHATSAPP_MODE === "log";

  // Troca de tema: um botao so, que leva para o outro tema.
  const outroTema = tema === "vora" ? "padrao" : "vora";
  const trocarTema = (
    <form action={acaoTrocarTema}>
      <button
        type="submit"
        name="tema"
        value={outroTema}
        title={`Mudar para o tema ${ROTULO_TEMA[outroTema].toLowerCase()}`}
        aria-label={`Mudar para o tema ${ROTULO_TEMA[outroTema].toLowerCase()}`}
        className="grid h-7 w-7 place-items-center rounded-lg text-barra-texto transition-colors hover:bg-barra-hover hover:text-tinta"
      >
        {tema === "vora" ? <IconeSol tamanho={16} /> : <IconeLua tamanho={16} />}
      </button>
    </form>
  );
  const sair = (
    <form action={acaoLogout}>
      <button
        type="submit"
        title="Sair"
        aria-label="Sair"
        className="grid h-7 w-7 place-items-center rounded-lg text-barra-texto transition-colors hover:bg-barra-hover hover:text-tinta"
      >
        <IconeSair tamanho={16} />
      </button>
    </form>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="nao-imprimir flex shrink-0 flex-col gap-4 border-b border-barra-borda bg-barra px-3 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-[232px] lg:gap-6 lg:border-r lg:border-b-0 lg:px-3 lg:py-5">
        <div className="flex items-center justify-between px-2.5">
          <Link href="/" aria-label="VORA - inicio" className="block">
            <span className="logo-vora h-[18px]" />
          </Link>
          {/* No celular as acoes ficam aqui em cima. */}
          <div className="flex items-center lg:hidden">
            {trocarTema}
            {sair}
          </div>
        </div>

        <NavLateral />

        <div className="mt-auto hidden space-y-3 lg:block">
          {emTeste && (
            <div
              className="flex items-start gap-2 rounded-lg border border-barra-borda px-2.5 py-2 text-[11px] leading-snug text-barra-texto"
              title={[
                env.META_DRY_RUN ? "Meta em DRY-RUN: nada e publicado de verdade." : "",
                env.WHATSAPP_MODE === "log" ? "WhatsApp em modo log: mensagens nao saem." : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>
                <strong className="font-semibold text-tinta">Modo de teste.</strong>{" "}
                {env.META_DRY_RUN ? "Nada e publicado" : "Publicacao ativa"}
                {env.WHATSAPP_MODE === "log" ? " e o WhatsApp nao envia." : "."}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg px-1.5 py-1">
            <Avatar nome={usuario.name} tamanho={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-tinta">
                {usuario.name}
              </p>
              <p className="truncate text-[11px] text-barra-texto-fraco">
                {ROTULO_FUNCAO[usuario.funcao]}
              </p>
            </div>
            {trocarTema}
            {sair}
          </div>
        </div>
      </aside>

      <main className="painel min-w-0 flex-1 overflow-x-clip px-4 py-6 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
