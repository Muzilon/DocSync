# 0007 — Cadastro de pessoas e perfis de acesso

- **Data:** 2026-09-28
- **Status:** Aprovada pelo Eric em 2026-09-28

## Contexto
O login será pelo Entra ID (conta Microsoft da Monto). O documento 02 sugeria perfis vindos de app roles ou grupos do Entra, o que obrigaria a TI a agir a cada pessoa nova. O Eric quer usar o sistema normalmente e cadastrar pessoas ele mesmo.

## Opções
1. **Perfis no Entra (app roles ou grupos):** a TI atribui cada pessoa. Menos autonomia para o Eric.
2. **O Entra só prova a identidade; perfil e área ficam no DocSync:** o Administrador cadastra e altera pessoas dentro do sistema.

## Decisão: opção 2
- Qualquer pessoa com conta Microsoft da Monto consegue **entrar**, mas só **usa** o sistema depois que um Administrador der perfil e área. Até lá vê "Acesso ainda não liberado. Peça ao administrador do DocSync."
- O Administrador pode **pré-cadastrar** uma pessoa pelo e-mail corporativo; no primeiro login ela já entra com o perfil certo. O vínculo definitivo é pelo ID do objeto no Entra (o e-mail só serve para a primeira associação).
- O primeiro Administrador (Eric) vem da variável de ambiente `ADMINISTRADORES_INICIAIS` (e-mail, não é segredo), usada só enquanto não houver nenhum Administrador no banco.
- Pessoa desligada: desativada no Entra, perde o login automaticamente; no DocSync é inativada, nunca apagada (o histórico continua com o nome dela).
- Pessoas de fora da Monto só entram se a TI as convidar como convidadas no Entra.
- A tela de pessoas entra já na F1, em versão mínima (listar, pré-cadastrar, definir perfil e área, inativar), porque sem ela ninguém além do Eric consegue testar. A F11 completa a administração (áreas e tipos).

## Consequências
A API consulta o perfil no banco a cada requisição (não confia em claims do navegador). Troca de perfil vale na requisição seguinte e gera registro de auditoria. Isso antecipa para a F1 uma parte do banco de dados (tabela de usuários).
