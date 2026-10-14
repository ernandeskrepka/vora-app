// Imprime o link assinado do relatorio de um cliente/quinzena (uso local).
import { linkDoRelatorio } from "../../src/services/relatorio-link.ts";
const [clienteId, quinzena] = process.argv.slice(2);
linkDoRelatorio(clienteId, quinzena).then((l) => console.log(l));
