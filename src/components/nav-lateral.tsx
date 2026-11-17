"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  IconeCalendario,
  IconeClientes,
  IconeConexoes,
  IconeConfig,
  IconeNovo,
  IconePainel,
  IconeResultados,
} from "@/components/icones.tsx";

type Item = {
  href: string;
  rotulo: string;
  icone: (p: { tamanho?: number; className?: string }) => React.ReactNode;
  /** Casa so com o caminho exato (a raiz casaria com tudo). */
  exato?: boolean;
};

const SECOES: Array<{ titulo: string; itens: Item[] }> = [
  {
    titulo: "Operacao",
    itens: [
      { href: "/", rotulo: "Dashboard", icone: IconePainel, exato: true },
      { href: "/calendario", rotulo: "Calendario", icone: IconeCalendario },
      { href: "/posts/novo", rotulo: "Novo post", icone: IconeNovo },
    ],
  },
  {
    titulo: "Carteira",
    itens: [
      { href: "/clientes", rotulo: "Clientes", icone: IconeClientes },
      { href: "/relatorios", rotulo: "Resultados", icone: IconeResultados },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { href: "/conexoes", rotulo: "Conexoes Meta", icone: IconeConexoes },
      { href: "/configuracoes", rotulo: "Configuracoes", icone: IconeConfig },
    ],
  },
];

/**
 * Menu do painel. No computador e a coluna da esquerda, em secoes; no
 * celular vira uma faixa que rola de lado. O item da pagina atual fica
 * marcado - o resto recua para o conteudo aparecer.
 */
export function NavLateral() {
  const caminho = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-5 lg:overflow-visible">
      {SECOES.map((secao) => (
        <div key={secao.titulo} className="flex gap-1 lg:flex-col lg:gap-0.5">
          <p className="sobre mb-1.5 hidden px-2.5 text-barra-texto-fraco lg:block">
            {secao.titulo}
          </p>
          {secao.itens.map((item) => {
            const ativo = item.exato
              ? caminho === item.href
              : caminho === item.href || caminho.startsWith(`${item.href}/`);
            const Icone = item.icone;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={clsx(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors",
                  ativo
                    ? "bg-barra-ativo font-semibold text-tinta shadow-cartao"
                    : "font-medium text-barra-texto hover:bg-barra-hover hover:text-tinta",
                )}
              >
                <Icone
                  tamanho={16}
                  className={ativo ? "text-destaque" : "text-barra-texto-fraco"}
                />
                {item.rotulo}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
