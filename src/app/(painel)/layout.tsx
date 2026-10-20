import Link from "next/link";
import { cookies } from "next/headers";
import { exigirUsuario } from "@/lib/auth.ts";
import { acaoLogout } from "@/app/actions/auth.ts";
import { acaoTrocarTema } from "@/app/actions/tema.ts";
import { env } from "@/env";
import {
  COOKIE_TEMA,
  ROTULO_TEMA,
  TEMAS,
  normalizarTema,
} from "@/lib/tema.ts";

const MENU = [
  { href: "/", rotulo: "Dashboard" },
  { href: "/calendario", rotulo: "Calendario" },
  { href: "/posts/novo", rotulo: "Novo post" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/conexoes", rotulo: "Conexoes Meta" },
  { href: "/relatorios", rotulo: "Resultados" },
  { href: "/configuracoes", rotulo: "Configuracoes" },
];

export default async function LayoutPainel({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await exigirUsuario();
  const tema = normalizarTema((await cookies()).get(COOKIE_TEMA)?.value);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-r border-barra-borda bg-barra px-5 py-6 lg:w-60">
        <Link href="/" className="mb-6 block">
          <img src="/marca/vora-logo.svg" alt="VORA" className="h-6 w-auto" />
          <span className="mt-1.5 block text-[11px] uppercase tracking-widest text-barra-texto-fraco vora:font-mono">
            Aprovacao e postagem
          </span>
        </Link>

        <nav className="flex flex-wrap gap-1 lg:flex-col">
          {MENU.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-barra-texto transition hover:bg-barra-hover hover:text-tinta"
            >
              {/* Indice numerado, so no layout VORA (linguagem do site). */}
              <span className="hidden font-mono text-[11px] tracking-wider text-barra-texto-fraco vora:inline">
                {String(i + 1).padStart(2, "0")}
              </span>
              {item.rotulo}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-6">
          {(env.META_DRY_RUN || env.WHATSAPP_MODE === "log") && (
            <div className="mb-4 hidden rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-200 lg:block">
              {env.META_DRY_RUN && (
                <p>Meta em DRY-RUN: nada e publicado de verdade.</p>
              )}
              {env.WHATSAPP_MODE === "log" && (
                <p>WhatsApp em modo log: mensagens nao saem.</p>
              )}
            </div>
          )}

          {/* Seletor de layout: a escolha vale para este navegador. */}
          <form
            action={acaoTrocarTema}
            className="mb-4 flex items-center gap-1 rounded-lg border border-barra-borda bg-barra-hover/60 p-1"
            title="Layout do painel"
          >
            <span className="px-2 text-[10px] tracking-widest text-barra-texto-fraco uppercase vora:font-mono">
              Layout
            </span>
            {TEMAS.map((t) => (
              <button
                key={t}
                type="submit"
                name="tema"
                value={t}
                aria-pressed={t === tema}
                className={
                  t === tema
                    ? "rounded-md bg-acao px-2.5 py-1 text-[11px] font-semibold text-acao-texto"
                    : "rounded-md px-2.5 py-1 text-[11px] font-medium text-barra-texto hover:text-tinta"
                }
              >
                {ROTULO_TEMA[t]}
              </button>
            ))}
          </form>

          <div className="hidden lg:block">
            <p className="truncate text-xs text-barra-texto">{usuario.name}</p>
            <p className="truncate text-[11px] text-barra-texto-fraco">
              {usuario.email}
            </p>
            <form action={acaoLogout}>
              <button
                type="submit"
                className="mt-2 text-xs text-barra-texto underline hover:text-tinta"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
