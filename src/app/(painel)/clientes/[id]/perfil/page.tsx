import { notFound } from "next/navigation";
import { montarPrevia } from "@/services/perfil.ts";
import { linkDoPerfil } from "@/services/perfil-link.ts";
import { CelularComGrade, FilaDoPerfil } from "@/components/previa-perfil.tsx";
import { CopiarLink } from "@/components/copiar-link.tsx";
import { Cartao } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function PerfilDoCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const previa = await montarPrevia({ clienteId: id, interno: true });
  if (!previa) notFound();

  return (
    <div className="space-y-5">
      <Cartao titulo="Como o perfil vai ficar">
        <p className="text-sm text-tinta-2">
          A grade abaixo junta o que ja foi publicado com o que esta a caminho, na ordem em que o
          feed vai mostrar. O que ainda nao saiu aparece destacado, com a data prevista - serve para
          conferir ritmo, cor e repeticao antes de mandar para o cliente.
        </p>

        <div className="mt-5 grid gap-6 lg:grid-cols-[320px_1fr]">
          <CelularComGrade previa={previa} interno />
          <div>
            <h3 className="text-sm font-semibold text-tinta">Proximos a entrar</h3>
            <div className="mt-2">
              <FilaDoPerfil previa={previa} interno />
            </div>
          </div>
        </div>
      </Cartao>

      <Cartao
        titulo="Link do perfil para o cliente"
        descricao="O cliente abre sem login e ve a grade como vai ficar: o que ja saiu e o que esta a caminho com a data prevista. So entra post que ja tem arte, e nada interno (status, quem subiu, versao). Conforme a equipe sobe o planejamento, o mesmo link mostra o perfil tomando forma."
      >
        <CopiarLink url={linkDoPerfil(id)} rotulo="Copiar link do perfil" />
      </Cartao>
    </div>
  );
}
