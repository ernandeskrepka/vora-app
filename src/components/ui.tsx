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
        "vidro rounded-xl border border-linha bg-superficie shadow-sm",
        className,
      )}
    >
      {(titulo || acao) && (
        <header className="flex items-center justify-between gap-3 border-b border-linha-suave px-5 py-3">
          {titulo && (
            <h2 className="text-sm font-semibold text-tinta">{titulo}</h2>
          )}
          {acao}
        </header>
      )}
      <div className="p-5">
        {descricao && <p className="mb-3 text-sm text-tinta-3">{descricao}</p>}
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
        variante === "primario" && "bg-acao text-acao-texto hover:bg-acao-hover",
        variante === "secundario" &&
          "border border-linha-forte bg-superficie text-tinta hover:bg-superficie-2",
        variante === "perigo" &&
          "border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100",
        variante === "fantasma" && "text-tinta-2 hover:bg-superficie-3",
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
        variante === "primario" && "bg-acao text-acao-texto hover:bg-acao-hover",
        variante === "secundario" &&
          "border border-linha-forte bg-superficie text-tinta hover:bg-superficie-2",
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
      <span className="mb-1 block text-sm font-medium text-tinta-2">
        {rotulo}
      </span>
      {children}
      {dica && !erro && (
        <span className="mt-1 block text-xs text-tinta-3">{dica}</span>
      )}
      {erro && <span className="mt-1 block text-xs text-rose-700">{erro}</span>}
    </label>
  );
}

export const classeInput =
  "w-full rounded-lg border border-linha-forte bg-superficie px-3 py-2 text-sm text-tinta outline-none focus:border-vora-verde focus:ring-2 focus:ring-vora-verde/30";

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
        tom === "info" && "aviso-info border-sky-200 bg-sky-50 text-sky-900",
        tom === "erro" && "aviso-erro border-rose-200 bg-rose-50 text-rose-900",
        tom === "sucesso" &&
          "aviso-sucesso border-emerald-200 bg-emerald-50 text-emerald-900",
        tom === "atencao" && "aviso-atencao border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children}
    </div>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-tinta-3">{children}</p>;
}

export function IconeRede({ network }: { network: "INSTAGRAM" | "FACEBOOK" }) {
  return (
    <span
      title={network === "INSTAGRAM" ? "Instagram" : "Facebook"}
      className="inline-flex h-5 w-5 items-center justify-center rounded border border-linha-forte bg-superficie text-[10px] font-bold text-tinta-2"
    >
      {network === "INSTAGRAM" ? "IG" : "FB"}
    </span>
  );
}
