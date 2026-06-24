const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbFile = path.join(__dirname, 'justponto.db');
const db = new sqlite3.Database(dbFile);

function init() {
  db.serialize(() => {
    db.run(`PRAGMA foreign_keys = ON;`);

    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      email TEXT UNIQUE,
      perfil TEXT,
      gestor_id INTEGER,
      data_nascimento DATE,
      genero TEXT,
      cpf TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(gestor_id) REFERENCES usuarios(id)
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS solicitacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      data_evento DATE,
      tipo_ocorrencia TEXT,
      horario_proposto TEXT,
      descricao TEXT,
      horas_calculadas REAL,
      status TEXT,
      justificativa_recusa TEXT,
      gestor_aprovador_id INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY(gestor_aprovador_id) REFERENCES usuarios(id)
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS solicitacao_horarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id INTEGER,
      horario TEXT,
      FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes(id)
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS atestados_saude (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id INTEGER,
      arquivo_path_criptografado TEXT,
      data_inicio DATE,
      data_fim DATE,
      dias_afastamento INTEGER,
      cid TEXT,
      FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes(id)
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS trilha_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id INTEGER,
      usuario_acao_id INTEGER,
      acao_realizada TEXT,
      timestamp_oficial DATETIME DEFAULT CURRENT_TIMESTAMP,
      dados_anteriores TEXT,
      FOREIGN KEY(solicitacao_id) REFERENCES solicitacoes(id),
      FOREIGN KEY(usuario_acao_id) REFERENCES usuarios(id)
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS configuracoes_prazos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dias_limite_funcionario INTEGER DEFAULT 5,
      dias_limite_gestor INTEGER DEFAULT 3,
      atualizado_por INTEGER,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(atualizado_por) REFERENCES usuarios(id)
    );`);

    // Ensure existing databases get the new columns (ALTER TABLE ADD COLUMN if missing)
    function addColumnIfNotExists(table, columnDef, callback) {
      const colName = columnDef.split(' ')[0];
      db.all(`PRAGMA table_info(${table});`, (err, cols) => {
        if (err) return callback(err);
        const exists = cols && cols.some(c => c.name === colName);
        if (!exists) {
          db.run(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`, callback);
        } else callback(null);
      });
    }

    addColumnIfNotExists('usuarios', 'data_nascimento DATE', (e)=>{});
    addColumnIfNotExists('usuarios', 'cpf TEXT', (e)=>{});
    addColumnIfNotExists('usuarios', 'genero TEXT', (e)=>{});
    addColumnIfNotExists('usuarios', 'password_hash TEXT', (e)=>{});
    // Antes de criar índice único, limpar possíveis CPFs duplicados existentes
    db.all(`SELECT cpf FROM usuarios WHERE cpf IS NOT NULL GROUP BY cpf HAVING COUNT(*) > 1;`, (err, rows) => {
      if (err) return; // nada a fazer se falhar
      if (!rows || rows.length === 0) {
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_cpf_unique ON usuarios(cpf);`);
        return;
      }
      // Para cada CPF duplicado, manter apenas o registro com menor id e limpar os demais (setar NULL)
      rows.forEach(r => {
        const cpfVal = r.cpf;
        db.all('SELECT id FROM usuarios WHERE cpf = ? ORDER BY id ASC', [cpfVal], (e2, ids) => {
          if (e2 || !ids || ids.length <= 1) return;
          const keep = ids[0].id;
          const toNull = ids.slice(1).map(x => x.id);
          const stmt = db.prepare('UPDATE usuarios SET cpf = NULL WHERE id = ?');
          toNull.forEach(id => stmt.run(id));
          stmt.finalize(() => {
            // tentar criar índice após limpar esse grupo (criação tentada cada vez, but IF NOT EXISTS avoids errors)
            db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_cpf_unique ON usuarios(cpf);`);
          });
        });
      });
    });
    addColumnIfNotExists('solicitacoes', 'descricao TEXT', (e)=>{});
    addColumnIfNotExists('solicitacoes', 'horas_calculadas REAL', (e)=>{});

  });
}

module.exports = { db, init };
