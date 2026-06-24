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
O sistema utiliza um modelo relacional simples para controlar usuários, solicitações, horários normalizados, atestados e a trilha de auditoria. Tabelas principais e campos relevantes:

- `usuarios`:
	- `id` INTEGER PRIMARY KEY AUTOINCREMENT
	- `nome` TEXT
	- `email` TEXT UNIQUE
	- `perfil` TEXT (ex.: `FUNCIONARIO`, `GESTOR`, `RH`)
	- `gestor_id` INTEGER (FK para `usuarios.id`)
	- `data_nascimento` DATE
	- `genero` TEXT
	- `cpf` TEXT (único, indexado)
	- `password_hash` TEXT
	- `criado_em` DATETIME DEFAULT CURRENT_TIMESTAMP

- `solicitacoes`:
	- `id` INTEGER PRIMARY KEY AUTOINCREMENT
	- `usuario_id` INTEGER (FK → `usuarios.id`)
	- `data_evento` DATE
	- `tipo_ocorrencia` TEXT (ex.: `ESQUECIMENTO`, `ATESTADO_MEDICO`, ...)
	- `horario_proposto` TEXT (CSV de horários)
	- `descricao` TEXT
	- `horas_calculadas` REAL (calculada quando há exatamente 2 horários)
	- `status` TEXT (valores usados: `PENDENTE`, `EM_ANALISE_RH`, `DEFERIDO`, `APROVADO`, `RECUSADO`)
	- `justificativa_recusa` TEXT
	- `gestor_aprovador_id` INTEGER (FK → `usuarios.id`)
	- `criado_em` DATETIME DEFAULT CURRENT_TIMESTAMP

- `solicitacao_horarios` (normalização de horários):
	- `id` INTEGER PRIMARY KEY AUTOINCREMENT
	- `solicitacao_id` INTEGER (FK → `solicitacoes.id`)
	- `horario` TEXT

- `atestados_saude` (dados sensíveis isolados e arquivos criptografados):
	- `id` INTEGER PRIMARY KEY AUTOINCREMENT
	- `solicitacao_id` INTEGER (FK → `solicitacoes.id`)
	- `arquivo_path_criptografado` TEXT (arquivo armazenado criptografado em `uploads/`)
	- `data_inicio` DATE
	- `data_fim` DATE
	- `dias_afastamento` INTEGER
	- `cid` TEXT (aplicar mascaramento para exibição conforme LGPD)

- `trilha_auditoria` (append-only):
	- `id` INTEGER PRIMARY KEY AUTOINCREMENT
	- `solicitacao_id` INTEGER (pode ser NULL para eventos globais)
	- `usuario_acao_id` INTEGER (FK → `usuarios.id`, pode ser NULL)
	- `acao_realizada` TEXT
	- `timestamp_oficial` DATETIME DEFAULT CURRENT_TIMESTAMP
	- `dados_anteriores` TEXT (JSON com snapshot anterior quando aplicável)

- `configuracoes_prazos` (parametrização administrativa):
	- `id` INTEGER PRIMARY KEY AUTOINCREMENT
	- `dias_limite_funcionario` INTEGER DEFAULT 5
	- `dias_limite_gestor` INTEGER DEFAULT 3
	- `atualizado_por` INTEGER (FK → `usuarios.id`)
	- `atualizado_em` DATETIME DEFAULT CURRENT_TIMESTAMP

Observações:
- Arquivos de atestado são criptografados com AES-256 antes de serem persistidos no disco; apenas o RH pode descriptografar para download temporário.
- Campos sensíveis (ex.: CID) são mascarados conforme regras de acesso (RH/medicina têm visão completa).
- A aplicação mantém índices e rotinas de migração para adicionar colunas a bases existentes (`scripts/add_columns.js`).

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