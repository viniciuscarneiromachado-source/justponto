# ⏳ JustPonto

O **JustPonto** é uma plataforma corporativa de autoatendimento voltada para a gestão e justificativa de frequência de colaboradores. O sistema centraliza, digitaliza e audita solicitações de correção de ponto, abono de faltas e validação de atestados médicos, automatizando o fluxo de aprovação entre o funcionário, a gestão direta e o Departamento Pessoal.

## Integrantes
- Vinicius
- Amanda

## Problema
Processos de ajuste de frequência ainda dependem de papel, e-mails e controles manuais, gerando retrabalho, risco jurídico e baixo rastreamento de evidências.

## Objetivo
Centralizar e auditar solicitações de correção de ponto e atestados, reduzindo riscos trabalhistas, eliminando papel e oferecendo transparência a funcionários, gestores e RH.

## Público-alvo
- Colaboradores (solicitantes)
- Gestores diretos (aprovadores)
- Departamento Pessoal / RH (administradores)

## Funcionalidades
- Login e controle por perfis (RBAC)
- Envio de solicitações de ajuste de ponto
- Upload criptografado de atestados (AES-256)
- Painel de aprovação para gestores
- Validação completa de atestados pelo RH
- Trilha de auditoria append-only
- Exportação de dados aprovados em CSV/JSON

## Tecnologias
- Node.js
- Express
- SQLite
- JavaScript (backend e frontend)
- HTML/CSS
- AES-256 para criptografia de arquivos
- Git/GitHub

## Pilares de Segurança e Conformidade
- LGPD: mascaramento de dados sensíveis (CID) para gestores; acesso completo apenas para RH/medicina do trabalho.
- Trilha de auditoria imutável: registros append-only com timestamp de servidor (NTP).
- Proteção de uploads: tipos permitidos `.pdf`, `.png`, `.jpg`, `.jpeg` e tamanho máximo de 5MB.

## Modelagem (resumo)
O sistema utiliza um modelo relacional simples para controlar usuários, solicitações e atestados. Tabelas principais:

- `usuarios`: armazena `id`, `nome`, `email`, `perfil` (FUNCIONARIO/GESTOR/RH), `gestor_id`, `criado_em`.

- `solicitacoes`: armazena `id`, `usuario_id`, `data_evento`, `tipo_occorrencia`, `horario_proposto`, `status` (PENDENTE/EM_ANALISE_RH/APROVADO/RECUSADO), `justificativa_recusa`, `gestor_aprovador_id`, `criado_em`.

- `atestados_saude`: isolada por LGPD, contém `id`, `solicitacao_id`, `arquivo_path_criptografado`, `data_inicio`, `data_fim`, `cid_mascarado`, `observacoes`, `criado_em`.

## Como executar
1. Instale dependências:

```bash
npm install
```

2. Inicie a aplicação (porta padrão `3000`):

```bash
npm start
```

3. Acesse a aplicação no navegador: `http://localhost:3000` (frontend estático em `public/index.html`).

## Estrutura do repositório
- `server.js` - backend em Express
- `db.js` - inicializa banco SQLite e esquema
- `utils/crypto.js` - funções de criptografia de arquivos (AES-256)
- `public/index.html` - frontend estático
- `uploads/` - diretório de arquivos criptografados (configurável via `UPLOAD_DIR`)

## Observações de implementação
- Endpoint `/auth/login` cria/retorna usuários por email para propósito de desenvolvimento/testes. Para produção, integrar SSO corporativo/OIDC/SAML conforme política da organização.
- Acesso a atestados: somente usuários com perfil `RH` podem baixar o PDF original via endpoint `/rh/atestados/:id/download`. Gestores visualizam informações mascaradas.
- Trilha de auditoria é tratada como append-only pela aplicação (não há endpoints para exclusão/alteração).
- Exportação: `/export?format=csv|json` para dados aprovados.
