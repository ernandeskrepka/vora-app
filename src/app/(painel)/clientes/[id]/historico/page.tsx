import { atividadeRecente } from "@/services/historico.ts";
import { ListaDeAtividade } from "@/components/atividade.tsx";
import { Cartao } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

/** Tudo que a equipe (e o cliente) fez com esse cliente, do mais novo ao mais antigo. */
export default async function HistoricoDoCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventos = await atividadeRecente({ clienteId: id, limite: 150, tudo: true });

  return (
    <Cartao
      titulo="Historico"
      descricao="Quem fez o que, e quando: cadastro, pautas, material subido, posts, decisoes do cliente e publicacoes. Nada aqui e apagado."
    >
      <ListaDeAtividade eventos={eventos} mostrarCliente={false} />
    </Cartao>
  );
}
