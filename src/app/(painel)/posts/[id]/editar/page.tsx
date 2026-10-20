import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth.ts";
import { prisma } from "@/lib/db.ts";
import { storage } from "@/lib/storage/index.ts";
import { paraInputLocal } from "@/lib/datetime.ts";
import { carregarPost } from "@/services/posts.ts";
import { podeEditar, type PostStatus } from "@/domain/post-status.ts";
import { FormularioPost } from "@/components/formulario-post.tsx";
import { acaoAtualizarPost } from "@/app/actions/posts.ts";
import { Aviso } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function EditarPost({ params }: { params: Promise<{ id: string }> }) {
  await exigirUsuario();
  const { id } = await params;

  const existe = await prisma.post.findUnique({ where: { id }, select: { id: true } });
  if (!existe) notFound();

  const post = await carregarPost(id);
  const clientes = [{ id: post.clientId, name: post.client.name }];

  if (!podeEditar(post.status as PostStatus)) {
    return (
      <Aviso tom="erro" titulo="Esse post nao pode ser editado">
        Status atual: {post.status}.
      </Aviso>
    );
  }

  const midiaExistente = await Promise.all(
    post.media.map(async (m) => ({
      id: m.id,
      kind: m.kind as "IMAGEM" | "VIDEO",
      url: await storage.urlTemporaria(m.storageKey),
    })),
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-tinta">Editar post - {post.client.name}</h1>
        <p className="text-sm text-tinta-3">Versao atual: {post.version}</p>
      </header>

      <FormularioPost
        modo="editar"
        acao={acaoAtualizarPost}
        clientes={clientes}
        midiaExistente={midiaExistente}
        inicial={{
          postId: post.id,
          clientId: post.clientId,
          caption: post.caption,
          formato: post.format,
          networks: post.networks,
          dataHora: paraInputLocal(post.scheduledAt, post.client.timezone),
        }}
      />
    </div>
  );
}
