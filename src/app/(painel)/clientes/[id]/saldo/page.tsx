import { prisma } from "@/lib/db.ts";
import { formatarData } from "@/lib/datetime.ts";
import { saldoDoCliente, cobrancaDeRecarga, valorSugerido } from "@/services/saldo.ts";
import { acaoRegistrarRecarga } from "@/app/actions/saldo.ts";
import { FormAcao } from "@/components/form-acao.tsx";
import { CopiarLink } from "@/components/copiar-link.tsx";
import { Aviso, Campo, Cartao, Vazio, classeInput } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

function moeda(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default async function SaldoDoCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [saldo, recargas] = await Promise.all([
    saldoDoCliente(id),
    prisma.adAccountTopUp.findMany({
      where: { clientId: id },
      orderBy: { occurredAt: "desc" },
      take: 10,
    }),
  ]);

  const ultimoValor = recargas.length > 0 ? Number(recargas[0].amount) : 300;
  const sugerido = saldo.acompanhando ? valorSugerido(saldo, ultimoValor) : ultimoValor;

  // So monta a cobranca quando ela e util: saldo no limite ou abaixo dele.
  const cobranca =
    saldo.acompanhando && saldo.abaixoDoLimite
      ? await cobrancaDeRecarga({ clienteId: id, valor: sugerido }).catch((erro) => ({
          erro: erro instanceof Error ? erro.message : String(erro),
        }))
      : null;

  return (
    <div className="space-y-5">
      <Cartao titulo="Saldo da conta de anuncios">
        {!saldo.acompanhando ? (
          <Aviso tom="info">
            Sem recarga registrada, nao da para dizer o saldo desse cliente. A Meta nao entrega o
            saldo pre-pago pela API, entao o controle aqui e: voce registra quanto foi colocado na
            conta e o sistema desconta o gasto diario que ja coleta para o relatorio.
          </Aviso>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <div
                className={`rounded-lg border p-3 ${saldo.abaixoDoLimite ? "border-rose-300 bg-rose-50" : "border-linha"}`}
              >
                <p className="text-xs text-tinta-3">Saldo estimado</p>
                <p
                  className={`text-2xl font-semibold ${saldo.abaixoDoLimite ? "text-rose-800" : "text-tinta"}`}
                >
                  {moeda(saldo.saldo)}
                </p>
                <p className="text-xs text-tinta-3">avisa abaixo de {moeda(saldo.limite)}</p>
              </div>
              <div className="rounded-lg border border-linha p-3">
                <p className="text-xs text-tinta-3">Recarregado</p>
                <p className="text-lg font-semibold text-tinta">{moeda(saldo.recarregado)}</p>
                <p className="text-xs text-tinta-3">
                  desde {saldo.desde ? formatarData(saldo.desde) : "-"}
                </p>
              </div>
              <div className="rounded-lg border border-linha p-3">
                <p className="text-xs text-tinta-3">Gasto no periodo</p>
                <p className="text-lg font-semibold text-tinta">{moeda(saldo.gasto)}</p>
                <p className="text-xs text-tinta-3">{moeda(saldo.gastoPorDia)} por dia</p>
              </div>
              <div className="rounded-lg border border-linha p-3">
                <p className="text-xs text-tinta-3">Dura mais</p>
                <p className="text-lg font-semibold text-tinta">
                  {saldo.diasRestantes === null ? "-" : `${saldo.diasRestantes} dia(s)`}
                </p>
                <p className="text-xs text-tinta-3">no ritmo dos ultimos 7 dias</p>
              </div>
            </div>

            {saldo.abaixoDoLimite && (
              <div className="mt-4">
                <Aviso tom="atencao" titulo="Hora de pedir recarga">
                  O saldo chegou ao limite. Abaixo esta o PIX pronto para mandar no WhatsApp do
                  cliente.
                </Aviso>
              </div>
            )}
          </>
        )}
      </Cartao>

      {cobranca && "erro" in cobranca && <Aviso tom="erro">{cobranca.erro}</Aviso>}

      {cobranca && !("erro" in cobranca) && (
        <Cartao titulo={`PIX de recarga - ${moeda(cobranca.valor ?? 0)}`}>
          <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
            <div
              className="rounded-xl border border-linha bg-superficie p-2 [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: cobranca.qrSvg }}
            />
            <div className="min-w-0">
              <p className="text-sm text-tinta-2">
                Recebedor: <strong>{cobranca.recebedor.nome}</strong> · {cobranca.recebedor.cidade}
              </p>
              <p className="mt-1 text-xs text-tinta-3">
                Valor sugerido para recompor o patamar da ultima recarga ({moeda(ultimoValor)}).
                O cliente pode pagar outro valor: e so pedir que ele digite no app.
              </p>
              <p className="mt-3 mb-1 text-xs font-medium text-tinta-2">PIX copia e cola</p>
              <CopiarLink url={cobranca.payload} rotulo="Copiar codigo PIX" abrir={false} />
            </div>
          </div>
        </Cartao>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Registrar recarga">
          <FormAcao acao={acaoRegistrarRecarga} textoBotao="Registrar" variante="primario">
            <input type="hidden" name="clienteId" value={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Valor (R$)">
                <input
                  name="valor"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  className={classeInput}
                  placeholder="300,00"
                />
              </Campo>
              <Campo rotulo="Quando" dica="Em branco usa hoje.">
                <input name="quando" type="date" className={classeInput} />
              </Campo>
            </div>
            <Campo rotulo="Observacao (opcional)">
              <input name="observacao" className={classeInput} placeholder="Pago por PIX" />
            </Campo>
          </FormAcao>
        </Cartao>

        <Cartao titulo="Recargas registradas">
          {recargas.length === 0 ? (
            <Vazio>Nenhuma recarga ainda.</Vazio>
          ) : (
            <ul className="divide-y divide-linha-suave">
              {recargas.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-tinta">{moeda(Number(r.amount))}</p>
                    {r.note && <p className="text-xs text-tinta-3">{r.note}</p>}
                  </div>
                  <span className="text-xs text-tinta-3">{formatarData(r.occurredAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </div>
  );
}
