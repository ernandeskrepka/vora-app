import { prisma } from "@/lib/db.ts";
import { exigirUsuario } from "@/lib/auth.ts";
import { paraInputLocal } from "@/lib/datetime.ts";
import { storage } from "@/lib/storage/index.ts";
import { FormularioPost } from "@/components/formulario-post.tsx";
import { acaoCriarPost } from "@/app/actions/posts.ts";
import { Aviso } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function NovoPost({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; pauta?: string; materiais?: string }>;
}) {
  await exigirUsuario();
  const { cliente: clienteId, pauta: pautaId, materiais } = await searchParams;

  const clientes = await prisma.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Material escolhido na biblioteca, na ordem em que foi selecionado.
  const ids = (materiais ?? "").split(",").filter(Boolean);
  const assets = ids.length > 0 ? await prisma.clientAsset.findMany({ where: { id: { in: ids } } }) : [];
  const porId = new Map(assets.map((a) => [a.id, a]));
  const escolhidos = await Promise.all(
    ids
      .map((id) => porId.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a) && a!.kind !== "DOCUMENTO")
      .map(async (a) => ({
        id: a.id,
        kind: a.kind as "IMAGEM" | "VIDEO",
        url: await storage.urlTemporaria(a.storageKey),
        nome: a.originalFilename ?? "material",
      })),
  );

  const pauta = pautaId
    ? await prisma.planningItem.findUnique({ where: { id: pautaId } })
    : null;

  // Padrao: amanha as 10h, horario de Brasilia.
  const amanha = new Date(Date.now() + 86_400_000);
  amanha.setUTCHours(13, 0, 0, 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="titulo text-xl text-tinta">Novo post</h1>
        <p className="text-sm text-tinta-3">
          Suba o criativo, escolha o cliente e o horario. O cliente aprova pelo WhatsApp.
        </p>
      </header>

      {pauta && (
        <Aviso tom="info" titulo={`A partir da pauta: ${pauta.title}`}>
          Quando o post for criado, a pauta sai do quadro e passa a apontar para ele.
          {pauta.notes ? ` Notas: ${pauta.notes}` : ""}
        </Aviso>
      )}

      {clientes.length === 0 ? (
        <Aviso tom="atencao" titulo="Nenhum cliente cadastrado">
          Cadastre um cliente e o WhatsApp do aprovador antes de criar posts.
        </Aviso>
      ) : (
        <FormularioPost
          modo="criar"
          acao={acaoCriarPost}
          clientes={clientes}
          materiais={escolhidos}
          pautaId={pautaId}
          inicial={{
            dataHora: paraInputLocal(amanha),
            clientId: clienteId,
            caption: pauta?.notes ?? undefined,
            formato: escolhidos.length > 1 ? "CARROSSEL" : undefined,
          }}
        />
      )}
    </div>
  );
}
