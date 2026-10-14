import { env } from "@/env";
import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { formatarDataHora } from "@/lib/datetime.ts";
import { obterConfiguracoes } from "@/services/configuracoes.ts";
import {
  acaoAlternarUsuario,
  acaoCriarUsuario,
  acaoSalvarConfiguracoes,
} from "@/app/actions/configuracoes.ts";
import { FormAcao } from "@/components/form-acao.tsx";
import { Campo, Cartao, classeInput } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function Configuracoes() {
  const usuario = await exigirUsuario();
  const [config, usuarios] = await Promise.all([
    obterConfiguracoes(),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">Configuracoes</h1>
        <p className="text-sm text-zinc-500">Lembretes, canal de aviso interno e equipe.</p>
      </header>

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
