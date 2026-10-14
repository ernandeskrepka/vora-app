import Link from "next/link";
import { exigirUsuario } from "@/lib/auth.ts";
import { acaoLogout } from "@/app/actions/auth.ts";
import { env } from "@/env";

const MENU = [
  { href: "/", rotulo: "Dashboard" },
  { href: "/calendario", rotulo: "Calendario" },
  { href: "/posts/novo", rotulo: "Novo post" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/conexoes", rotulo: "Conexoes Meta" },
  { href: "/relatorios", rotulo: "Relatorios" },
  { href: "/configuracoes", rotulo: "Configuracoes" },
];

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col bg-vora-preto px-5 py-6 lg:w-60">
        <Link href="/" className="mb-6 block">
          <span className="text-2xl font-bold tracking-tight text-vora-verde">VORA</span>
          <span className="mt-0.5 block text-[11px] uppercase tracking-widest text-zinc-500">
            Aprovacao e postagem
          </span>
        </Link>

        <nav className="flex flex-wrap gap-1 lg:flex-col">
          {MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>

        <div className="mt-auto hidden pt-6 lg:block">
          {(env.META_DRY_RUN || env.WHATSAPP_MODE === "log") && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-200">
              {env.META_DRY_RUN && <p>Meta em DRY-RUN: nada e publicado de verdade.</p>}
              {env.WHATSAPP_MODE === "log" && <p>WhatsApp em modo log: mensagens nao saem.</p>}
            </div>
          )}
          <p className="truncate text-xs text-zinc-400">{usuario.name}</p>
          <p className="truncate text-[11px] text-zinc-600">{usuario.email}</p>
          <form action={acaoLogout}>
            <button type="submit" className="mt-2 text-xs text-zinc-400 underline hover:text-white">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
