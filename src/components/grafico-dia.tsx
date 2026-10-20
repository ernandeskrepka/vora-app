import { formatarDiaUTC } from "@/lib/datetime.ts";

export type PontoDoDia = { data: Date; valor: number };

/**
 * Barra por dia, uma serie so.
 *
 * SVG direto, sem biblioteca de grafico: a pagina e renderizada no servidor e
 * imprime em PDF, entao nada aqui pode depender de JavaScript no navegador. O
 * passar o mouse usa <title>, que o proprio SVG resolve.
 *
 * Investimento e resultado vao em graficos separados de proposito: os dois no
 * mesmo desenho exigiriam dois eixos verticais, e dois eixos fazem o leitor
 * comparar alturas que nao sao comparaveis.
 */
export function GraficoDia({
  titulo,
  pontos,
  formatar,
  cor = "#01a076",
}: {
  titulo: string;
  pontos: PontoDoDia[];
  formatar: (valor: number) => string;
  cor?: string;
}) {
  if (pontos.length === 0) return null;

  const largura = 640;
  const altura = 150;
  const base = altura - 22;
  const topo = 12;
  const maximo = Math.max(...pontos.map((p) => p.valor), 1);
  const passo = largura / pontos.length;
  const larguraBarra = Math.max(2, Math.min(18, passo - 3));
  const indiceMaior = pontos.reduce((m, p, i) => (p.valor > pontos[m].valor ? i : m), 0);
  const total = pontos.reduce((t, p) => t + p.valor, 0);

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-tinta">{titulo}</span>
        <span className="text-xs text-tinta-3">total {formatar(total)}</span>
      </figcaption>

      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`${titulo}: ${pontos.length} dias, maior em ${formatarDiaUTC(pontos[indiceMaior].data)} com ${formatar(pontos[indiceMaior].valor)}`}
      >
        {/* Grade recessiva: so a linha de base e o meio. */}
        <line x1="0" y1={base} x2={largura} y2={base} stroke="#e4e4e7" strokeWidth="1" />
        <line
          x1="0"
          y1={(base + topo) / 2}
          x2={largura}
          y2={(base + topo) / 2}
          stroke="#f4f4f5"
          strokeWidth="1"
        />

        {pontos.map((ponto, i) => {
          const alturaBarra = ponto.valor <= 0 ? 0 : Math.max(2, ((base - topo) * ponto.valor) / maximo);
          const x = i * passo + (passo - larguraBarra) / 2;
          return (
            <g key={ponto.data.toISOString()}>
              <rect
                x={x}
                y={base - alturaBarra}
                width={larguraBarra}
                height={alturaBarra}
                rx="3"
                fill={cor}
                opacity={i === indiceMaior ? 1 : 0.75}
              >
                <title>{`${formatarDiaUTC(ponto.data)}: ${formatar(ponto.valor)}`}</title>
              </rect>
            </g>
          );
        })}

        {/* Rotulo direto so no maior dia, para nao poluir. */}
        <text
          x={Math.min(largura - 60, indiceMaior * passo + passo / 2)}
          y={Math.max(10, base - ((base - topo) * pontos[indiceMaior].valor) / maximo - 4)}
          fontSize="10"
          fill="#52525b"
          textAnchor="middle"
        >
          {formatar(pontos[indiceMaior].valor)}
        </text>

        <text x="0" y={altura - 4} fontSize="10" fill="#a1a1aa">
          {formatarDiaUTC(pontos[0].data)}
        </text>
        <text x={largura} y={altura - 4} fontSize="10" fill="#a1a1aa" textAnchor="end">
          {formatarDiaUTC(pontos[pontos.length - 1].data)}
        </text>
      </svg>
    </figure>
  );
}
