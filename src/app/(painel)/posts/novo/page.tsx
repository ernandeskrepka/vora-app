import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { paraInputLocal } from "@/lib/datetime.ts";
import { FormularioPost } from "@/components/formulario-post.tsx";
import { acaoCriarPost } from "@/app/actions/posts.ts";
import { Aviso } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function NovoPost() {
  await exigirUsuario();
  const clientes = await prisma.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Padrao: amanha as 10h, horario de Brasilia.
  const amanha = new Date(Date.now() + 86_400_000);
  amanha.setUTCHours(13, 0, 0, 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">Novo post</h1>
        <p className="text-sm text-zinc-500">
          Suba o criativo, escolha o cliente e o horario. O cliente aprova pelo WhatsApp.
        </p>
      </header>

      {clientes.length === 0 ? (
        <Aviso tom="atencao" titulo="Nenhum cliente cadastrado">
          Cadastre um cliente e o WhatsApp do aprovador antes de criar posts.
        </Aviso>
      ) : (
        <FormularioPost
          modo="criar"
          acao={acaoCriarPost}
          clientes={clientes}
          inicial={{ dataHora: paraInputLocal(amanha) }}
        />
      )}
    </div>
  );
}
