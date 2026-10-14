import { formatarData } from "@/lib/datetime.ts";
import { listarMateriais } from "@/services/materiais.ts";
import { acaoAdicionarMateriais } from "@/app/actions/cliente-area.ts";
import { BibliotecaMateriais, type MaterialCliente } from "@/components/biblioteca-materiais.tsx";
import { FormAcao } from "@/components/form-acao.tsx";
import { Campo, Cartao, Vazio, classeInput } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

function tamanho(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export default async function Materiais({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itens = await listarMateriais(id);

  const lista: MaterialCliente[] = itens.map((i) => ({
    id: i.id,
    kind: i.kind as MaterialCliente["kind"],
    url: i.url,
    nome: i.originalFilename ?? "arquivo",
    tamanho: tamanho(i.sizeBytes),
    quando: formatarData(i.createdAt),
    rotulo: i.label,
  }));

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        Tudo que a equipe for juntando para esse cliente: fotos da sessao, artes prontas, briefing.
        Na hora de montar o post, e so escolher daqui.
      </p>

      <Cartao titulo="Subir arquivos">
        <FormAcao acao={acaoAdicionarMateriais} textoBotao="Enviar para a biblioteca" variante="primario">
          <input type="hidden" name="clienteId" value={id} />
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Campo
              rotulo="Arquivos"
              dica="Imagens e videos viram criativo; PDF e texto ficam como referencia."
            >
              <input
                type="file"
                name="arquivos"
                multiple
                accept="image/*,video/mp4,video/quicktime,application/pdf,text/plain,text/markdown"
                className="w-full rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-sm"
              />
            </Campo>
            <Campo rotulo="Rotulo (opcional)" dica="Ex.: Sessao de outubro">
              <input name="rotulo" className={classeInput} />
            </Campo>
          </div>
        </FormAcao>
      </Cartao>

      {lista.length === 0 ? (
        <Cartao>
          <Vazio>Biblioteca vazia. Suba os arquivos acima.</Vazio>
        </Cartao>
      ) : (
        <BibliotecaMateriais clienteId={id} itens={lista} />
      )}
    </div>
  );
}
