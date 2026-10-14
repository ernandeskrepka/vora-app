"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const ITENS = [
  { href: "", rotulo: "Visao geral" },
  { href: "/planejamento", rotulo: "Planejamento" },
  { href: "/perfil", rotulo: "Perfil" },
  { href: "/materiais", rotulo: "Materiais" },
  { href: "/posts", rotulo: "Posts" },
  { href: "/relatorio", rotulo: "Relatorio" },
  { href: "/conexoes", rotulo: "Conexoes" },
  { href: "/ajustes", rotulo: "Ajustes" },
];

export function MenuCliente({ clienteId, pendencias }: { clienteId: string; pendencias?: Record<string, number> }) {
  const caminho = usePathname();
  const base = `/clientes/${clienteId}`;

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-zinc-200 pb-px">
      {ITENS.map((item) => {
        const href = `${base}${item.href}`;
        const ativo = item.href === "" ? caminho === base : caminho.startsWith(href);
        const contador = pendencias?.[item.rotulo];
        return (
          <Link
            key={item.rotulo}
            href={href}
            className={clsx(
              "relative shrink-0 rounded-t-lg px-3 py-2 text-sm whitespace-nowrap transition",
              ativo
                ? "border-b-2 border-vora-preto font-semibold text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800",
            )}
          >
            {item.rotulo}
            {contador ? (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                {contador}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
