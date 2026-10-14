import { describe, expect, it } from "vitest";
import { idDeJobValido, idLembrete, idPublicar, idSemResposta } from "./ids.ts";

const POST_ID = "cmv7b28k3000ioh7do98j6r9h";

describe("ids de job", () => {
  it("nao usam ':' (o BullMQ recusa)", () => {
    const ids = [idPublicar(POST_ID), idSemResposta(POST_ID), idLembrete(POST_ID, 24)];
    for (const id of ids) {
      expect(id).not.toContain(":");
      expect(idDeJobValido(id)).toBe(true);
    }
  });

  it("sao estaveis por post, para que reagendar substitua o job", () => {
    expect(idPublicar(POST_ID)).toBe(idPublicar(POST_ID));
    expect(idPublicar(POST_ID)).not.toBe(idPublicar("outro-post"));
  });

  it("separam um lembrete por offset de horas", () => {
    expect(idLembrete(POST_ID, 24)).not.toBe(idLembrete(POST_ID, 2));
  });

  it("nao confundem os tipos de job entre si", () => {
    const ids = new Set([idPublicar(POST_ID), idSemResposta(POST_ID), idLembrete(POST_ID, 2)]);
    expect(ids.size).toBe(3);
  });

  it("reprova id com ':'", () => {
    expect(idDeJobValido("publish-post:abc")).toBe(false);
  });
});
