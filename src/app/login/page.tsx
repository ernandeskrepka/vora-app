import { garantirPrimeiroUsuario } from "@/services/primeiro-acesso.ts";
import { FormularioLogin } from "@/components/formulario-login.tsx";

export const dynamic = "force-dynamic";

export default async function PaginaLogin() {
  // Instalacao nova: cria o primeiro usuario a partir das variaveis de
  // ambiente, se ainda nao houver nenhum.
  await garantirPrimeiroUsuario();
  return <FormularioLogin />;
}
