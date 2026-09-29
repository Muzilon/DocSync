# 0006 — Nome do produto e lista de áreas

- **Data:** 2026-09-28
- **Status:** Aprovada pelo Eric

## Decisão
- O produto se chama **DocSync** na interface e no repositório.
- Áreas iniciais (lista mantida, não texto livre; resolve o P-11): Comercial, Custos, Engenharia, Qualidade, Saúde Ocupacional, Segurança do Trabalho, Sistema de Gestão Ambiental, Suprimentos.
- **Em todos os formulários e filtros, as áreas aparecem em ordem alfabética pt-BR** (comparação com `localeCompare` em `pt-BR`, sem diferenciar acentos). A ordem é calculada, nunca fixa no código.
- Novas áreas serão criadas pelo Administrador (fatia F11). Área é inativada, nunca apagada.
