import clsx from "clsx";
import Link from "next/link";
import { ROTULO_STATUS, type PostStatus } from "@/domain/post-status.ts";

export function Etiqueta({
  status,
  className,
}: {
  status: PostStatus;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        `status-${status}`,
        className,
      )}
    >
      {ROTULO_STATUS[status]}
    </span>
  );
}

export function Cartao({
  titulo,
  descricao,
  acao,
  children,
  className,
}: {
  titulo?: string;
  /** Uma linha explicando o cartao, acima do conteudo. */
  descricao?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "rounded-xl border border-zinc-200 bg-white shadow-sm",
        className,
      )}
    >
      {(titulo || acao) && (
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3">
          {titulo && (
            <h2 className="text-sm font-semibold text-zinc-800">{titulo}</h2>
          )}
          {acao}
        </header>
      )}
      <div className="p-5">
        {descricao && <p className="mb-3 text-sm text-zinc-500">{descricao}</p>}
        {children}
      </div>
    </section>
  );
}

export function Botao({
  children,
  variante = "primario",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "perigo" | "fantasma";
}) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variante === "primario" && "bg-vora-preto text-white hover:bg-zinc-800",
        variante === "secundario" &&
          "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
        variante === "perigo" &&
          "border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100",
        variante === "fantasma" && "text-zinc-600 hover:bg-zinc-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BotaoLink({
  href,
  children,
  variante = "secundario",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variante?: "primario" | "secundario";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
        variante === "primario" && "bg-vora-preto text-white hover:bg-zinc-800",
        variante === "secundario" &&
          "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Campo({
  rotulo,
  dica,
  erro,
  children,
}: {
  rotulo: string;
  dica?: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">
        {rotulo}
      </span>
      {children}
      {dica && !erro && (
        <span className="mt-1 block text-xs text-zinc-500">{dica}</span>
      )}
      {erro && <span className="mt-1 block text-xs text-rose-700">{erro}</span>}
    </label>
  );
}

export const classeInput =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-vora-verde focus:ring-2 focus:ring-vora-verde/30";

export function Aviso({
  tom = "info",
  titulo,
  children,
}: {
  tom?: "info" | "erro" | "sucesso" | "atencao";
  titulo?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border px-4 py-3 text-sm",
        tom === "info" && "border-sky-200 bg-sky-50 text-sky-900",
        tom === "erro" && "border-rose-200 bg-rose-50 text-rose-900",
        tom === "sucesso" &&
          "border-emerald-200 bg-emerald-50 text-emerald-900",
        tom === "atencao" && "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children}
    </div>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-zinc-500">{children}</p>;
}

export function IconeRede({ network }: { network: "INSTAGRAM" | "FACEBOOK" }) {
  return (
    <span
      title={network === "INSTAGRAM" ? "Instagram" : "Facebook"}
      className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-300 bg-white text-[10px] font-bold text-zinc-700"
    >
      {network === "INSTAGRAM" ? "IG" : "FB"}
    </span>
  );
}
