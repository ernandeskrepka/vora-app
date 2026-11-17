import clsx from "clsx";
import Link from "next/link";
import { ROTULO_STATUS, type PostStatus } from "@/domain/post-status.ts";
import {
  IconeAlerta,
  IconeCheck,
  IconeFacebook,
  IconeInfo,
  IconeInstagram,
  IconeVazio,
} from "@/components/icones.tsx";

/* ------------------------------------------------------------ cabecalho */

/**
 * Cabecalho de pagina: sobre-titulo opcional, titulo, uma linha de contexto
 * e as acoes a direita. Todo titulo de pagina do painel passa por aqui.
 */
export function CabecalhoPagina({
  sobre,
  titulo,
  descricao,
  acoes,
}: {
  sobre?: React.ReactNode;
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {sobre && <p className="sobre mb-2">{sobre}</p>}
        <h1>{titulo}</h1>
        {descricao && (
          <p className="mt-1.5 text-sm text-tinta-3">{descricao}</p>
        )}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}

/* --------------------------------------------------------------- status */

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
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        `status-${status}`,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--st)]" />
      {ROTULO_STATUS[status]}
    </span>
  );
}

/* --------------------------------------------------------------- cartao */

export function Cartao({
  titulo,
  descricao,
  acao,
  contador,
  children,
  className,
}: {
  titulo?: string;
  /** Uma linha explicando o cartao, acima do conteudo. */
  descricao?: string;
  acao?: React.ReactNode;
  /** Numero ao lado do titulo (quantos itens ha no cartao). */
  contador?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const temCabecalho = Boolean(titulo || acao);
  return (
    <section
      className={clsx(
        "vidro rounded-2xl border border-linha bg-superficie shadow-cartao",
        className,
      )}
    >
      {temCabecalho && (
        <header className="flex min-h-12 items-center justify-between gap-3 px-5 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            {titulo && (
              <h2 className="truncate text-[13px] font-semibold tracking-tight text-tinta">
                {titulo}
              </h2>
            )}
            {typeof contador === "number" && (
              <span className="num rounded-full bg-superficie-3 px-1.5 py-px text-[11px] font-medium text-tinta-3">
                {contador}
              </span>
            )}
          </div>
          {acao}
        </header>
      )}
      <div className={clsx("px-5 pb-5", temCabecalho ? "pt-2" : "pt-5")}>
        {descricao && (
          <p className="mb-3 max-w-3xl text-sm leading-relaxed text-tinta-3">
            {descricao}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- botoes */

const BASE_BOTAO =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTE_BOTAO = {
  primario: "bg-acao text-acao-texto shadow-cartao hover:bg-acao-hover",
  secundario:
    "border border-linha-forte bg-superficie text-tinta hover:bg-superficie-2",
  perigo: "border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100",
  fantasma: "text-tinta-2 hover:bg-superficie-3",
} as const;

export function Botao({
  children,
  variante = "primario",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: keyof typeof VARIANTE_BOTAO;
}) {
  return (
    <button
      {...props}
      className={clsx(BASE_BOTAO, VARIANTE_BOTAO[variante], className)}
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
  variante?: "primario" | "secundario" | "fantasma";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={clsx(BASE_BOTAO, VARIANTE_BOTAO[variante], className)}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------ formulario */

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
      <span className="mb-1.5 block text-[13px] font-medium text-tinta-2">
        {rotulo}
      </span>
      {children}
      {dica && !erro && (
        <span className="mt-1.5 block text-xs leading-relaxed text-tinta-3">
          {dica}
        </span>
      )}
      {erro && <span className="mt-1.5 block text-xs text-rose-700">{erro}</span>}
    </label>
  );
}

export const classeInput =
  "w-full rounded-lg border border-linha-forte bg-superficie px-3 py-2 text-sm text-tinta outline-none transition-colors placeholder:text-tinta-4 hover:border-tinta-4 focus:border-destaque focus:ring-2 focus:ring-[var(--anel)]";

/* ---------------------------------------------------------------- aviso */

const ICONE_DO_TOM = {
  info: IconeInfo,
  erro: IconeAlerta,
  sucesso: IconeCheck,
  atencao: IconeAlerta,
} as const;

export function Aviso({
  tom = "info",
  titulo,
  children,
}: {
  tom?: keyof typeof ICONE_DO_TOM;
  titulo?: string;
  children?: React.ReactNode;
}) {
  const Icone = ICONE_DO_TOM[tom];
  return (
    <div
      className={clsx(
        "aviso flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        `aviso-${tom}`,
      )}
    >
      <Icone tamanho={16} className="mt-0.5 shrink-0 text-[var(--tom)]" />
      <div className="min-w-0">
        {titulo && <p className="font-semibold text-tinta">{titulo}</p>}
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- vazio */

/**
 * Estado vazio: diz o que falta e, quando faz sentido, o proximo passo.
 * Cartao em branco nao ajuda ninguem.
 */
export function Vazio({
  children,
  acao,
}: {
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-7 text-center">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-superficie-3 text-tinta-4">
        <IconeVazio tamanho={16} />
      </span>
      <p className="max-w-sm text-sm text-tinta-3">{children}</p>
      {acao}
    </div>
  );
}

/* ---------------------------------------------------------------- redes */

export function IconeRede({ network }: { network: "INSTAGRAM" | "FACEBOOK" }) {
  const Icone = network === "INSTAGRAM" ? IconeInstagram : IconeFacebook;
  return (
    <span
      title={network === "INSTAGRAM" ? "Instagram" : "Facebook"}
      className="inline-grid h-6 w-6 place-items-center rounded-md bg-superficie-3 text-tinta-3"
    >
      <Icone tamanho={13} />
    </span>
  );
}

/* --------------------------------------------------------------- avatar */

const CORES_AVATAR = [
  "#0f9d6b",
  "#2f8fd8",
  "#8b5cf6",
  "#e0455e",
  "#d98a00",
  "#0e9aa7",
  "#c2410c",
  "#64748b",
];

function corDoNome(nome: string): string {
  let soma = 0;
  for (const letra of nome) soma = (soma * 31 + letra.charCodeAt(0)) % 9973;
  return CORES_AVATAR[soma % CORES_AVATAR.length];
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/** Bolinha com as iniciais, na cor derivada do nome (sempre a mesma). */
export function Avatar({
  nome,
  tamanho = 28,
  className,
}: {
  nome: string;
  tamanho?: number;
  className?: string;
}) {
  const cor = corDoNome(nome);
  return (
    <span
      title={nome}
      style={{
        width: tamanho,
        height: tamanho,
        fontSize: Math.max(9, Math.round(tamanho * 0.38)),
        backgroundColor: `color-mix(in srgb, ${cor} 16%, var(--superficie))`,
        color: `color-mix(in srgb, ${cor} 75%, var(--tinta))`,
      }}
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold select-none",
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  );
}

/* -------------------------------------------------------------- metrica */

const TOM_METRICA = {
  neutro: "text-tinta",
  bom: "text-destaque",
  atencao: "text-amber-700",
  erro: "text-rose-700",
} as const;

/**
 * Numero de decisao: o que a pessoa precisa saber antes de qualquer coisa.
 * O cartao inteiro e um link para onde se resolve.
 */
export function Metrica({
  rotulo,
  valor,
  detalhe,
  href,
  tom = "neutro",
  icone,
}: {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  href?: string;
  tom?: keyof typeof TOM_METRICA;
  icone?: React.ReactNode;
}) {
  const corpo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-tinta-3">{rotulo}</p>
        {icone && <span className="text-tinta-4">{icone}</span>}
      </div>
      <p
        className={clsx(
          "titulo num mt-2 text-[2rem] leading-none",
          TOM_METRICA[tom],
        )}
      >
        {valor}
      </p>
      {detalhe && (
        <p className="mt-2 truncate text-xs text-tinta-3">{detalhe}</p>
      )}
    </>
  );
  const classe =
    "vidro block rounded-2xl border border-linha bg-superficie p-4 shadow-cartao transition-colors";
  return href ? (
    <Link href={href} className={clsx(classe, "hover:border-linha-forte")}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}
