import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { formatarDataHora } from "@/lib/datetime.ts";
import { obterConfiguracoes } from "@/services/configuracoes.ts";
import {
  acaoAlternarUsuario,
  acaoCarregarDemonstracao,
  acaoCriarUsuario,
  acaoImportarCarteira,
  acaoSalvarConfiguracoes,
} from "@/app/actions/configuracoes.ts";
import { carregarCarteira } from "@/services/carteira-arquivo.ts";
import { acaoSalvarPix } from "@/app/actions/saldo.ts";
import { obterConfiguracoesDeSaldo } from "@/services/saldo.ts";
import { FormAcao } from "@/components/form-acao.tsx";
import { Campo, Cartao, classeInput } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function Configuracoes() {
  const usuario = await exigirUsuario();
  const [config, usuarios, carteira, clientesNoBanco, saldoConfig] = await Promise.all([
    obterConfiguracoes(),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    carregarCarteira().catch(() => []),
    prisma.client.findMany({ select: { slug: true } }),
    obterConfiguracoesDeSaldo(),
  ]);
  const jaNoBanco = new Set(clientesNoBanco.map((c) => c.slug));
  const faltando = carteira.filter((c) => !jaNoBanco.has(c.slug ?? ""));
  const comPendencia = carteira.filter((c) => c.pendencia);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">Configuracoes</h1>
        <p className="text-sm text-zinc-500">Lembretes, canal de aviso interno e equipe.</p>
      </header>

      {carteira.length > 0 && (
        <Cartao titulo="Carteira de clientes (ativos da Meta)">
          <p className="text-sm text-zinc-600">
            {carteira.length} cliente(s) no arquivo <code>dados/clientes-meta.json</code>, levantados
            direto na Meta. Importar cria quem falta e atualiza nome de ativo; nunca apaga nem troca
            ativo ja conectado. O Instagram entra depois, descoberto pela Pagina.
          </p>

          <ul className="mt-3 divide-y divide-zinc-100 text-sm">
            {carteira.map((c) => (
              <li key={c.slug ?? c.nome} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-zinc-800">
                  {c.nome}
                  <span className="ml-2 text-xs text-zinc-500">
                    {c.ativos.length === 0
                      ? "sem ativo localizado"
                      : c.ativos.map((a) => (a.tipo === "AD_ACCOUNT" ? "anuncios" : "pagina")).join(" + ")}
                  </span>
                </span>
                <span className="text-xs text-zinc-500">
                  {jaNoBanco.has(c.slug ?? "") ? "ja cadastrado" : "sera criado"}
                  {c.pendencia ? " · pendencia" : ""}
                </span>
              </li>
            ))}
          </ul>

          {comPendencia.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-medium">{comPendencia.length} cliente(s) precisam da sua confirmacao:</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {comPendencia.map((c) => (
                  <li key={`p-${c.slug ?? c.nome}`}>
                    <strong>{c.nome}</strong>: {c.pendencia}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <FormAcao
              acao={acaoImportarCarteira}
              textoBotao={faltando.length > 0 ? `Importar ${faltando.length} cliente(s)` : "Reaplicar carteira"}
              variante="primario"
            >
              <span className="sr-only">Importar a carteira do arquivo</span>
            </FormAcao>
          </div>
        </Cartao>
      )}

      <Cartao titulo="PIX de recarga e aviso de saldo">
        <p className="text-sm text-zinc-600">
          Quando o saldo de anuncios de um cliente chega no limite, o painel avisa e ja monta o PIX
          de recarga com estes dados. A chave fica guardada so aqui e nao entra na auditoria.
        </p>
        <div className="mt-3">
          <FormAcao acao={acaoSalvarPix} textoBotao="Salvar PIX" variante="primario">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Chave PIX" dica="CPF/CNPJ, e-mail, telefone ou chave aleatoria.">
                <input
                  name="chave"
                  defaultValue={saldoConfig.recebedor?.chave ?? ""}
                  className={classeInput}
                  placeholder="financeiro@vorabr.com"
                />
              </Campo>
              <Campo rotulo="Nome do recebedor" dica="Ate 25 caracteres, sem acento (padrao do PIX).">
                <input
                  name="nome"
                  defaultValue={saldoConfig.recebedor?.nome ?? ""}
                  className={classeInput}
                  placeholder="VORA Marketing"
                />
              </Campo>
              <Campo rotulo="Cidade" dica="Ate 15 caracteres.">
                <input
                  name="cidade"
                  defaultValue={saldoConfig.recebedor?.cidade ?? ""}
                  className={classeInput}
                  placeholder="Fraiburgo"
                />
              </Campo>
              <Campo rotulo="Avisar abaixo de (R$)" dica="Vale para todo cliente sem limite proprio.">
                <input
                  name="limite"
                  type="number"
                  step="1"
                  min="1"
                  defaultValue={saldoConfig.limite}
                  className={classeInput}
                />
              </Campo>
            </div>
          </FormAcao>
        </div>
      </Cartao>

      <Cartao titulo="Demonstracao para a equipe">
        <p className="text-sm text-zinc-600">
          Enche o sistema com uma semana tipica da agencia usando material de verdade: artes do
          Drive, legendas das campanhas e numeros dos anuncios. Serve para mostrar o fluxo inteiro
          funcionando antes de ligar a Meta. Pode rodar quantas vezes quiser - nao duplica nada.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Nenhuma regra e burlada: post publicado aqui tem decisao de aprovacao registrada antes,
          post sem resposta nao tem publicacao, e tudo entra na auditoria. As publicacoes ficam
          marcadas como dry-run, entao nada foi para a Meta.
        </p>
        <div className="mt-4">
          <FormAcao acao={acaoCarregarDemonstracao} textoBotao="Carregar demonstracao" variante="primario">
            <span className="sr-only">Carregar a demonstracao</span>
          </FormAcao>
        </div>
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Lembretes e avisos">
          <FormAcao acao={acaoSalvarConfiguracoes} textoBotao="Salvar" variante="primario">
            <div className="space-y-4">
              <Campo
                rotulo="Lembretes (horas antes do post)"
                dica={`Separe por virgula. Hoje: ${config.lembretesHoras.join(", ")} (${config.origem.lembretes}).`}
              >
                <input
                  name="lembretes"
                  defaultValue={config.lembretesHoras.join(", ")}
                  className={classeInput}
                  placeholder="24, 2"
                />
              </Campo>

              <Campo
                rotulo="Canal de aviso interno"
                dica={`Hoje: ${config.canalInterno} (${config.origem.canal}).`}
              >
                <select name="canal" defaultValue={config.canalInterno} className={classeInput}>
                  <option value="log">Somente log do servidor</option>
                  <option value="whatsapp">WhatsApp interno</option>
                  <option value="slack">Slack</option>
                </select>
              </Campo>

              <p className="text-xs text-zinc-500">
                O destino do WhatsApp interno vem de INTERNAL_NOTIFY_WHATSAPP_TO e o do Slack de
                SLACK_WEBHOOK_URL.
              </p>
            </div>
          </FormAcao>
        </Cartao>

        <Cartao titulo="Ambiente (somente leitura)">
          <dl className="space-y-2 text-sm">
            {[
              ["Versao da Graph API", env.META_GRAPH_VERSION],
              ["Publicacao na Meta", env.META_DRY_RUN ? "DRY-RUN (nao publica)" : "ativa"],
              ["WhatsApp", env.WHATSAPP_MODE === "log" ? "modo log (nao envia)" : "Cloud API"],
              ["Armazenamento", env.STORAGE_DRIVER],
              ["Fuso do sistema", env.APP_TIMEZONE],
              ["Validade do link de aprovacao", `${env.APPROVAL_TOKEN_TTL_HOURS} h`],
              ["Tentativas de publicacao", String(env.PUBLISH_MAX_ATTEMPTS)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="flex justify-between gap-3 border-b border-zinc-100 pb-1.5">
                <dt className="text-zinc-600">{rotulo}</dt>
                <dd className="font-medium text-zinc-900">{valor}</dd>
              </div>
            ))}
          </dl>
        </Cartao>

        <Cartao titulo="Equipe" className="lg:col-span-2">
          <ul className="mb-4 divide-y divide-zinc-100">
            {usuarios.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium text-zinc-800">
                    {u.name} {u.id === usuario.id && <span className="text-xs text-zinc-400">(voce)</span>}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {u.email} - {u.role === "ADMIN" ? "administrador" : "editor"}
                    {u.lastLoginAt ? ` - ultimo acesso ${formatarDataHora(u.lastLoginAt)}` : ""}
                    {!u.active ? " - inativo" : ""}
                  </p>
                </div>
                {usuario.role === "ADMIN" && u.id !== usuario.id && (
                  <form action={acaoAlternarUsuario}>
                    <input type="hidden" name="usuarioId" value={u.id} />
                    <button type="submit" className="text-xs underline">
                      {u.active ? "desativar" : "reativar"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>

          {usuario.role === "ADMIN" ? (
            <FormAcao acao={acaoCriarUsuario} textoBotao="Criar usuario" className="border-t border-zinc-100 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Nome">
                  <input name="nome" required className={classeInput} />
                </Campo>
                <Campo rotulo="E-mail">
                  <input name="email" type="email" required className={classeInput} />
                </Campo>
                <Campo rotulo="Senha" dica="Minimo 10 caracteres.">
                  <input name="senha" type="password" required className={classeInput} />
                </Campo>
                <Campo rotulo="Papel">
                  <select name="papel" className={classeInput} defaultValue="EDITOR">
                    <option value="EDITOR">Editor</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </Campo>
              </div>
            </FormAcao>
          ) : (
            <p className="text-xs text-zinc-500">Somente administradores criam usuarios.</p>
          )}
        </Cartao>
      </div>
    </div>
  );
}
