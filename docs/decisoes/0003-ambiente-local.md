# 0003 — Ambiente de desenvolvimento e testes local, sem Azure por enquanto

- **Data:** 2026-09-28
- **Status:** Aprovada pelo Eric (a forma de rodar o banco local é fechada no início da F2)

## Contexto
A Monto tem assinatura Azure, mas ela não será usada durante a implementação e os testes (até cerca de 1.000 arquivos). Depois de testes bem-sucedidos, a TI avalia a hospedagem no Azure.

## Decisão
- A aplicação roda localmente (`localhost`) durante a construção.
- **Login real pelo Entra ID** desde a F1. O registro de aplicativo no Entra é gratuito e não exige assinatura Azure; a TI cria o registro de desenvolvimento apontando para `http://localhost`.
- **Arquivos** gravados numa pasta local, fora do Git, atrás de uma interface de armazenamento. Quando o SharePoint for liberado, troca-se só a implementação dessa interface, sem mexer nas telas.
- **Banco:** PostgreSQL local. Não há Docker nesta máquina; a forma de rodar (instalação nativa do PostgreSQL ou PGlite embutido) é definida no início da F2 e registrada aqui.

## Consequências
Nenhuma URL de produção nem segredo real no repositório. A ida para o Azure será uma decisão nova, em fatia própria.
