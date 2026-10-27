import Link from "next/link";
import { exigirUsuario } from "@/lib/auth.ts";
import { ROTULO_FUNCAO } from "@/domain/equipe.ts";
import { acaoTrocarSenha } from "@/app/actions/configuracoes.ts";
import { acaoLogout } from "@/app/actions/auth.ts";
import { FormAcao } from "@/components/form-acao.tsx";
import { Aviso, Campo, Cartao, classeInput } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

/**
 * Troca de senha. E a unica tela liberada enquanto a senha inicial nao for
 * trocada; depois disso, fica acessivel pelo menu (Configuracoes).
 */
export default async function TrocarSenha() {
  const usuario = await exigirUsuario({ permitirSenhaPendente: true });

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center text-center">
          <img src="/marca/vora-logo.svg" alt="VORA" className="h-7 w-auto" />
          <p className="mt-3 text-sm text-tinta-3">
            {usuario.name} · {ROTULO_FUNCAO[usuario.funcao]}
          </p>
        </div>

        {usuario.mustChangePassword && (
          <Aviso tom="atencao" titulo="Primeiro acesso">
            Essa e a senha inicial que a equipe te passou. Escolha a sua antes de
            continuar: so voce vai saber.
          </Aviso>
        )}

        <Cartao titulo={usuario.mustChangePassword ? "Escolha sua senha" : "Trocar senha"}>
          <FormAcao acao={acaoTrocarSenha} textoBotao="Salvar nova senha" variante="primario">
            <div className="space-y-3">
              <Campo rotulo="Senha atual">
                <input
                  name="senhaAtual"
                  type="password"
                  autoComplete="current-password"
                  required
                  className={classeInput}
                />
              </Campo>
              <Campo rotulo="Nova senha" dica="Pelo menos 10 caracteres, misturando letras e numeros.">
                <input
                  name="novaSenha"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  className={classeInput}
                />
              </Campo>
            </div>
          </FormAcao>
          <div className="mt-4 flex items-center justify-between text-xs text-tinta-3">
            {usuario.mustChangePassword ? (
              <span>Depois de salvar, o painel abre normalmente.</span>
            ) : (
              <Link href="/configuracoes" className="underline">
                voltar para Configuracoes
              </Link>
            )}
            <form action={acaoLogout}>
              <button type="submit" className="underline">
                sair
              </button>
            </form>
          </div>
        </Cartao>
      </div>
    </main>
  );
}
