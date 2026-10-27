import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { formatarDataHora } from "@/lib/datetime.ts";
import { obterConfiguracoes } from "@/services/configuracoes.ts";
import Link from "next/link";
import {
  acaoAlterarFuncao,
  acaoAlternarUsuario,
  acaoCarregarDemonstracao,
  acaoCriarEquipe,
  acaoCriarUsuario,
  acaoImportarCarteira,
  acaoRedefinirSenha,
  acaoSalvarConfiguracoes,
} from "@/app/actions/configuracoes.ts";
import { FUNCOES, ROTULO_FUNCAO } from "@/domain/equipe.ts";
import { acaoAdicionarBase, acaoRemoverBase } from "@/app/actions/tarefas.ts";
import { BASE_SUGERIDA, basesConfiguradas, ultimaLeituraDeTarefas } from "@/services/tarefas-notion.ts";
import { carregarCarteira } from "@/services/carteira-arquivo.ts";
import { acaoSalvarPix } from "@/app/actions/saldo.ts";
import { obterConfiguracoesDeSaldo } from "@/services/saldo.ts";
import { FormAcao } from "@/components/form-acao.tsx";
import { Campo, Cartao, classeInput } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function Configuracoes() {
  const usuario = await exigirUsuario();
  const [config, usuarios, carteira, clientesNoBanco, saldoConfig, bases, tarefasLidasEm] =
    await Promise.all([
      obterConfiguracoes(),
      prisma.user.findMany({ orderBy: { name: "asc" } }),
      carregarCarteira().catch(() => []),
      prisma.client.findMany({ select: { slug: true } }),
      obterConfiguracoesDeSaldo(),
      basesConfiguradas(),
      ultimaLeituraDeTarefas(),
    ]);
  const jaNoBanco = new Set(clientesNoBanco.map((c) => c.slug));
  const faltando = carteira.filter((c) => !jaNoBanco.has(c.slug ?? ""));
  const comPendencia = carteira.filter((c) => c.pendencia);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-tinta">Configuracoes</h1>
        <p className="text-sm text-tinta-3">Lembretes, canal de aviso interno e equipe.</p>
      </header>

      {carteira.length > 0 && (
        <Cartao titulo="Carteira de clientes (ativos da Meta)">
          <p className="text-sm text-tinta-2">
            {carteira.length} cliente(s) no arquivo <code>dados/clientes-meta.json</code>, levantados
            direto na Meta. Importar cria quem falta e atualiza nome de ativo; nunca apaga nem troca
            ativo ja conectado. O Instagram entra depois, descoberto pela Pagina.
          </p>

          <ul className="mt-3 divide-y divide-linha-suave text-sm">
            {carteira.map((c) => (
              <li key={c.slug ?? c.nome} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-tinta">
                  {c.nome}
                  <span className="ml-2 text-xs text-tinta-3">
                    {c.ativos.length === 0
                      ? "sem ativo localizado"
                      : c.ativos.map((a) => (a.tipo === "AD_ACCOUNT" ? "anuncios" : "pagina")).join(" + ")}
                  </span>
                </span>
                <span className="text-xs text-tinta-3">
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

      <Cartao titulo="Tarefas da equipe (bases do Notion)">
        <p className="text-sm text-tinta-2">
          As bases de tarefas que o Notion Calendar mostra entram no dashboard de todo mundo. Para o
          sistema enxergar uma base, abra-a no Notion, menu <strong>...</strong> &gt;{" "}
          <strong>Conexoes</strong>, e compartilhe com a integracao da VORA (a mesma do NOTION_TOKEN).
          {!env.NOTION_TOKEN && (
            <span className="text-amber-700"> NOTION_TOKEN ainda nao esta configurado no ambiente.</span>
          )}
        </p>
        {bases.length === 0 ? (
          <p className="mt-3 text-xs text-tinta-3">
            Nenhuma base ainda. Sugestao: a base <strong>{BASE_SUGERIDA.nome}</strong>, ID{" "}
            <code>{BASE_SUGERIDA.id}</code>.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-linha-suave text-sm">
            {bases.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-tinta">
                  {b.nome} <span className="text-xs text-tinta-4">{b.id}</span>
                </span>
                {usuario.role === "ADMIN" && (
                  <form action={acaoRemoverBase}>
                    <input type="hidden" name="id" value={b.id} />
                    <button type="submit" className="text-xs text-rose-700 underline">
                      remover
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-tinta-3">
          {tarefasLidasEm ? `Ultima leitura ${formatarDataHora(tarefasLidasEm)}.` : "Nunca lido."} O
          sistema rele de hora em hora; o dashboard tem o botao para ler agora.
        </p>
        {usuario.role === "ADMIN" && (
          <div className="mt-3">
            <FormAcao acao={acaoAdicionarBase} textoBotao="Adicionar base" variante="primario">
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                <Campo rotulo="Link ou ID da base" dica="Abra a base no Notion e copie o link da barra de enderecos.">
                  <input name="link" required className={classeInput} placeholder={`https://www.notion.so/${BASE_SUGERIDA.id.replace(/-/g, "")}`} />
                </Campo>
                <Campo rotulo="Nome (opcional)" dica="Sem nome, usa o titulo da base.">
                  <input name="nome" className={classeInput} />
                </Campo>
              </div>
            </FormAcao>
          </div>
        )}
      </Cartao>

      <Cartao titulo="PIX de recarga e aviso de saldo">
        <p className="text-sm text-tinta-2">
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
        <p className="text-sm text-tinta-2">
          Enche o sistema com uma semana tipica da agencia usando material de verdade: artes do
          Drive, legendas das campanhas e numeros dos anuncios. Serve para mostrar o fluxo inteiro
          funcionando antes de ligar a Meta. Pode rodar quantas vezes quiser - nao duplica nada.
        </p>
        <p className="mt-2 text-xs text-tinta-3">
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

              <p className="text-xs text-tinta-3">
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
              <div key={rotulo} className="flex justify-between gap-3 border-b border-linha-suave pb-1.5">
                <dt className="text-tinta-2">{rotulo}</dt>
                <dd className="font-medium text-tinta">{valor}</dd>
              </div>
            ))}
          </dl>
        </Cartao>

        <Cartao titulo="Equipe" className="lg:col-span-2">
          <p className="mb-3 text-sm text-tinta-2">
            Um login por pessoa: cada acao no sistema fica com o nome de quem fez.
            Gestao e coordenacao administram (equipe, configuracoes, conexoes); as
            outras funcoes editam. Senha inicial e trocada na primeira entrada.
          </p>
          <ul className="mb-4 divide-y divide-linha-suave">
            {usuarios.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium text-tinta">
                    {u.name} {u.id === usuario.id && <span className="text-xs text-tinta-4">(voce)</span>}
                  </p>
                  <p className="text-xs text-tinta-3">
                    {u.email} - {ROTULO_FUNCAO[u.funcao]} - {u.role === "ADMIN" ? "administra" : "edita"}
                    {u.lastLoginAt ? ` - ultimo acesso ${formatarDataHora(u.lastLoginAt)}` : " - nunca entrou"}
                    {u.mustChangePassword ? " - senha inicial" : ""}
                    {!u.active ? " - inativo" : ""}
                  </p>
                </div>
                {usuario.role === "ADMIN" && u.id !== usuario.id && (
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={acaoAlterarFuncao} className="flex items-center gap-1">
                      <input type="hidden" name="usuarioId" value={u.id} />
                      <select name="funcao" defaultValue={u.funcao} className="rounded-lg border border-linha-forte bg-superficie px-2 py-1 text-xs">
                        {FUNCOES.map((f) => (
                          <option key={f} value={f}>
                            {ROTULO_FUNCAO[f]}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs underline">
                        salvar
                      </button>
                    </form>
                    <details className="text-xs">
                      <summary className="cursor-pointer underline">redefinir senha</summary>
                      <FormAcao acao={acaoRedefinirSenha} textoBotao="Redefinir" className="mt-2">
                        <input type="hidden" name="usuarioId" value={u.id} />
                        <input
                          name="senha"
                          type="text"
                          placeholder="senha temporaria (10+)"
                          className="rounded-lg border border-linha-forte bg-superficie px-2 py-1 text-xs"
                        />
                      </FormAcao>
                    </details>
                    <form action={acaoAlternarUsuario}>
                      <input type="hidden" name="usuarioId" value={u.id} />
                      <button type="submit" className="text-xs underline">
                        {u.active ? "desativar" : "reativar"}
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="mb-4 flex flex-wrap items-center gap-3 border-t border-linha-suave pt-4 text-sm">
            <Link href="/senha" className="underline">
              Trocar a minha senha
            </Link>
            {usuario.role === "ADMIN" && (
              <FormAcao acao={acaoCriarEquipe} textoBotao="Criar as contas da equipe da VORA">
                <span className="text-xs text-tinta-3">
                  Ernande, Pamela, Victor, Natalia e Guilherme, cada um com sua funcao. Quem ja
                  existe nao e mexido.
                </span>
              </FormAcao>
            )}
          </div>

          {usuario.role === "ADMIN" ? (
            <FormAcao acao={acaoCriarUsuario} textoBotao="Criar usuario" className="border-t border-linha-suave pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Nome">
                  <input name="nome" required className={classeInput} />
                </Campo>
                <Campo rotulo="E-mail">
                  <input name="email" type="email" required className={classeInput} />
                </Campo>
                <Campo rotulo="Senha inicial" dica="Minimo 10 caracteres, letras e numeros. A pessoa troca ao entrar.">
                  <input name="senha" type="password" required className={classeInput} />
                </Campo>
                <Campo rotulo="Funcao" dica="Gestao e coordenacao administram o sistema.">
                  <select name="funcao" className={classeInput} defaultValue="DESIGN">
                    {FUNCOES.map((f) => (
                      <option key={f} value={f}>
                        {ROTULO_FUNCAO[f]}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            </FormAcao>
          ) : (
            <p className="text-xs text-tinta-3">Somente gestao e coordenacao criam usuarios.</p>
          )}
        </Cartao>
      </div>
    </div>
  );
}
