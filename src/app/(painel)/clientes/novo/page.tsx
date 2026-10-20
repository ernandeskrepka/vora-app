"use client";

import { useActionState } from "react";
import { acaoCriarCliente, type EstadoSimples } from "@/app/actions/clientes.ts";
import { Aviso, Botao, Campo, Cartao, classeInput } from "@/components/ui.tsx";

export default function NovoCliente() {
  const [estado, acao, enviando] = useActionState<EstadoSimples, FormData>(acaoCriarCliente, null);

  return (
    <div className="max-w-xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-tinta">Novo cliente</h1>
        <p className="text-sm text-tinta-3">
          Depois de criar, cadastre as conexoes da Meta na tela do cliente.
        </p>
      </header>

      <form action={acao}>
        <Cartao>
          <div className="space-y-4">
            {estado?.erro && <Aviso tom="erro">{estado.erro}</Aviso>}

            <Campo rotulo="Nome do cliente">
              <input name="nome" required className={classeInput} placeholder="Danieli Moveis" />
            </Campo>

            <Campo rotulo="Nome do contato aprovador">
              <input name="contatoNome" required className={classeInput} placeholder="Danieli" />
            </Campo>

            <Campo rotulo="WhatsApp do aprovador" dica="DDD + numero. Ex.: 49 99999-9999">
              <input name="contatoTelefone" required className={classeInput} placeholder="49 99999-9999" />
            </Campo>

            <Campo rotulo="Observacoes (opcional)">
              <textarea name="notas" rows={3} className={classeInput} />
            </Campo>

            <Botao type="submit" variante="primario" disabled={enviando}>
              {enviando ? "Criando..." : "Criar cliente"}
            </Botao>
          </div>
        </Cartao>
      </form>
    </div>
  );
}
