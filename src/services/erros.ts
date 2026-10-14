import type { Problema } from "@/domain/formatos.ts";

/** Erro de regra de negocio: mensagem pronta para mostrar na interface. */
export class ErroDeRegra extends Error {
  constructor(
    message: string,
    readonly problemas: Problema[] = [],
  ) {
    super(message);
    this.name = "ErroDeRegra";
  }
}

/**
 * Alguem mudou o post entre a leitura e a escrita (dois usuarios, ou um
 * usuario e o worker). Melhor abortar do que publicar algo errado.
 */
export class ConflitoDeEstadoError extends Error {
  constructor(message = "O post mudou de status enquanto a acao era processada. Recarregue a pagina.") {
    super(message);
    this.name = "ConflitoDeEstadoError";
  }
}

export class NaoEncontradoError extends Error {
  constructor(message = "Registro nao encontrado.") {
    super(message);
    this.name = "NaoEncontradoError";
  }
}
