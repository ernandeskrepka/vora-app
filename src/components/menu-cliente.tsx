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
  { href: "/saldo", rotulo: "Saldo" },
  { href: "/conexoes", rotulo: "Conexoes" },
  { href: "/historico", rotulo: "Historico" },
  { href: "/ajustes", rotulo: "Ajustes" },
];

export function MenuCliente({ clienteId, pendencias }: { clienteId: string; pendencias?: Record<string, number> }) {
  const caminho = usePathname();
  const base = `/clientes/${clienteId}`;

  return (
    <nav className="flex gap-0.5 overflow-x-auto border-b border-linha">
      {ITENS.map((item) => {
        const href = `${base}${item.href}`;
        const ativo = item.href === "" ? caminho === base : caminho.startsWith(href);
        const contador = pendencias?.[item.rotulo];
        return (
          <Link
            key={item.rotulo}
            href={href}
            className={clsx(
              "relative -mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors",
              ativo
                ? "border-destaque font-semibold text-tinta"
                : "border-transparent font-medium text-tinta-3 hover:text-tinta",
            )}
          >
            {item.rotulo}
            {contador ? (
              <span className="num ml-1.5 rounded-full bg-superficie-3 px-1.5 py-px text-[11px] font-semibold text-tinta-2">
                {contador}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
