require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { db, init } = require('./db');
const { encryptFile, decryptFile } = require('./utils/crypto');
const { stringify } = require('csv-stringify/sync');

const app = express();
app.use(cors());
app.use(express.json());
// Serve the frontend from the project `public` folder at root
app.use(express.static(path.join(__dirname, 'public')));
// servir também a pasta de imagens da raiz (ex.: img/justpontologo.png)
app.use('/img', express.static(path.join(__dirname, 'img')));

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

init();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: (process.env.MAX_FILE_MB ? Number(process.env.MAX_FILE_MB) : 5) * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) return cb(new Error('Formato de arquivo não permitido'));
  cb(null, true);
} });

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Sem token' });
  const token = auth.split(' ')[1];
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET || 'algumsegredoseguro');
    req.user = data;
    next();
  } catch (e) { res.status(401).json({ error: 'Token inválido' }); }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.perfil)) return res.status(403).json({ error: 'Acesso negado' });
    next();
  };
}

// Mock login (in prod, integrate SSO providers)
app.post('/auth/login', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email necessário' });
  db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) {
      const token = jwt.sign({ id: row.id, email: row.email, perfil: row.perfil }, process.env.JWT_SECRET || 'algumsegredoseguro');
      return res.json({ token, user: row });
    }
    return res.status(404).json({ error: 'Usuário não encontrado. Registre-se primeiro.' });
  });
});

// Registration endpoint (required fields)
app.post('/auth/register', (req, res) => {
  const { nome, email, data_nascimento, cpf, perfil, genero } = req.body;
  const allowed = ['FUNCIONARIO', 'GESTOR', 'RH'];
  if (!nome || !email || !data_nascimento || !cpf || !perfil) return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  if (!allowed.includes(perfil)) return res.status(400).json({ error: 'Perfil inválido' });
  // validação de ano de nascimento mínimo
  const bDate = new Date(data_nascimento);
  if (isNaN(bDate.getTime())) return res.status(400).json({ error: 'Data de nascimento inválida.' });
  const ano = bDate.getFullYear();
  if (ano < 1925) return res.status(400).json({ error: 'Ano de nascimento inválido. Informe um ano igual ou posterior a 1925.' });
  // validação de idade mínima (>13)
  const today = new Date();
  let age = today.getFullYear() - bDate.getFullYear();
  const m = today.getMonth() - bDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) age--;
  if (age <= 13) return res.status(400).json({ error: 'Cadastro não permitido para menores de 14 anos.' });
  // check unique email
  db.get('SELECT id FROM usuarios WHERE email = ?', [email], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (existing) return res.status(400).json({ error: 'E-mail já cadastrado' });
    db.run('INSERT INTO usuarios (nome, email, perfil, data_nascimento, cpf, genero) VALUES (?,?,?,?,?,?)', [nome, email, perfil, data_nascimento, cpf, genero || null], function(err2){
      if (err2) return res.status(500).json({ error: err2.message });
      db.get('SELECT * FROM usuarios WHERE id = ?', [this.lastID], (e,r) => {
        if (e) return res.status(500).json({ error: e.message });
        const token = jwt.sign({ id: r.id, email: r.email, perfil: r.perfil }, process.env.JWT_SECRET || 'algumsegredoseguro');
        res.json({ token, user: r });
      });
    });
  });
});

// Get current user profile
app.get('/users/me', requireAuth, (req, res) => {
  db.get('SELECT id, nome, email, perfil, gestor_id, data_nascimento, cpf, genero, criado_em FROM usuarios WHERE id = ?', [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(row);
  });
});

// Update current user profile
app.put('/users/me', requireAuth, (req, res) => {
  const { nome, data_nascimento, cpf, genero } = req.body;
  if (data_nascimento) {
    const bDate = new Date(data_nascimento);
    if (isNaN(bDate.getTime())) return res.status(400).json({ error: 'Data de nascimento inválida.' });
    const ano = bDate.getFullYear();
    if (ano < 1925) return res.status(400).json({ error: 'Ano de nascimento inválido. Informe um ano igual ou posterior a 1925.' });
    const today = new Date();
    let age = today.getFullYear() - bDate.getFullYear();
    const m = today.getMonth() - bDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) age--;
    if (age <= 13) return res.status(400).json({ error: 'Atualização não permitida para menores de 14 anos.' });
  }
  db.run('UPDATE usuarios SET nome = COALESCE(?, nome), data_nascimento = COALESCE(?, data_nascimento), cpf = COALESCE(?, cpf), genero = COALESCE(?, genero) WHERE id = ?', [nome || null, data_nascimento || null, cpf || null, genero || null, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT id, nome, email, perfil, gestor_id, data_nascimento, cpf, genero, criado_em FROM usuarios WHERE id = ?', [req.user.id], (e, row) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json(row);
    });
  });
});

// Lista solicitações da equipe (criados por outros funcionários)
app.get('/solicitacoes/equipe', requireAuth, (req, res) => {
  // Funcionários não podem visualizar solicitações de terceiros
  if (req.user.perfil === 'FUNCIONARIO') return res.status(403).json({ error: 'Acesso negado' });
  db.all('SELECT s.*, u.nome as solicitante_nome, u.email as solicitante_email FROM solicitacoes s JOIN usuarios u ON s.usuario_id = u.id WHERE s.usuario_id != ? ORDER BY s.criado_em DESC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Deferir solicitação (RH ou Chefe/GESTOR)
app.post('/solicitacoes/:id/deferir', requireAuth, requireRole(['RH','GESTOR']), (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM solicitacoes WHERE id = ?', [id], (err,row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Solicitação não encontrada' });
    // impedir deferir se já deferido ou aprovado
    if (row.status === 'DEFERIDO' || row.status === 'APROVADO') return res.status(400).json({ error: 'Solicitação já deferida' });
    // atualizar status
    db.run('UPDATE solicitacoes SET status = ? WHERE id = ?', ['DEFERIDO', id], function(e){
      if (e) return res.status(500).json({ error: e.message });
      db.run('INSERT INTO trilha_auditoria (solicitacao_id, usuario_acao_id, acao_realizada, dados_anteriores) VALUES (?,?,?,?)', [id, req.user.id, 'Deferido', null]);
      res.json({ ok: true });
    });
  });
});

// Create solicitacao
app.post('/solicitacoes', requireAuth, (req, res) => {
  const { data_evento, tipo_ocorrencia, horario_proposto, descricao } = req.body;
  if (!data_evento || !tipo_ocorrencia) return res.status(400).json({ error: 'Dados incompletos' });
  // Validação de ano: não permite anos anteriores
  const anoEvento = new Date(data_evento).getFullYear();
  const anoAtual = new Date().getFullYear();
  if (anoEvento < anoAtual) return res.status(400).json({ error: 'Não é possível solicitar justificativa para batida de ponto em anos anteriores' });

  // horario_proposto pode ser um array de horários ou string CSV
  let horarios = [];
  if (Array.isArray(horario_proposto)) horarios = horario_proposto;
  else if (typeof horario_proposto === 'string' && horario_proposto.trim() !== '') horarios = horario_proposto.split(',').map(s => s.trim()).filter(Boolean);

  // calcular horas se houver exatamente 2 horários
  let horas_calculadas = null;
  if (horarios.length === 2) {
    try {
      const [t1, t2] = horarios;
      const [h1,m1] = t1.split(':').map(Number);
      const [h2,m2] = t2.split(':').map(Number);
      const dt1 = new Date(2000,0,1,h1,m1);
      const dt2 = new Date(2000,0,1,h2,m2);
      let diffMs = dt2 - dt1;
      if (diffMs < 0) diffMs += 24*60*60*1000;
      horas_calculadas = Math.round((diffMs/3600000)*100)/100; // duas casas
    } catch(e){ horas_calculadas = null; }
  }

  db.run('INSERT INTO solicitacoes (usuario_id, data_evento, tipo_ocorrencia, horario_proposto, descricao, horas_calculadas, status) VALUES (?,?,?,?,?,?,?)', [req.user.id, data_evento, tipo_ocorrencia, horarios.join(','), descricao || null, horas_calculadas, 'PENDENTE'], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const solicitacao_id = this.lastID;
    // salvar horários na tabela normalizada
    const stmt = db.prepare('INSERT INTO solicitacao_horarios (solicitacao_id, horario) VALUES (?,?)');
    horarios.forEach(h => stmt.run(solicitacao_id, h));
    stmt.finalize();
    db.run('INSERT INTO trilha_auditoria (solicitacao_id, usuario_acao_id, acao_realizada, dados_anteriores) VALUES (?,?,?,?)', [solicitacao_id, req.user.id, 'Solicitação Criada', null]);
    res.json({ id: solicitacao_id, horas_calculadas });
  });
});

// Upload atestado (only for ATESTADO_MEDICO)
app.post('/solicitacoes/:id/upload', requireAuth, upload.single('file'), async (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM solicitacoes WHERE id = ?', [id], async (err,row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (row.usuario_id !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });
    if (row.tipo_ocorrencia !== 'ATESTADO_MEDICO') return res.status(400).json({ error: 'Tipo incorreto' });
    const filePath = req.file.path;
    const encPath = filePath + '.enc';
    try {
      await encryptFile(filePath, encPath);
      fs.unlinkSync(filePath);
      db.run('INSERT INTO atestados_saude (solicitacao_id, arquivo_path_criptografado, data_inicio, data_fim, dias_afastamento, cid) VALUES (?,?,?,?,?,?)', [id, encPath, req.body.data_inicio || null, req.body.data_fim || null, req.body.dias_afastamento || null, req.body.cid || null], function(e){
        if (e) return res.status(500).json({ error: e.message });
        db.run('UPDATE solicitacoes SET status = ? WHERE id = ?', ['EM_ANALISE_RH', id]);
        db.run('INSERT INTO trilha_auditoria (solicitacao_id, usuario_acao_id, acao_realizada, dados_anteriores) VALUES (?,?,?,?)', [id, req.user.id, 'Atestado Enviado', null]);
        res.json({ ok: true });
      });
    } catch (ex) { res.status(500).json({ error: ex.message }); }
  });
});

// Employee: list own requests
app.get('/solicitacoes', requireAuth, (req, res) => {
  db.all('SELECT * FROM solicitacoes WHERE usuario_id = ? ORDER BY criado_em DESC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Delete solicitacao (owner can delete their pending requests)
app.delete('/solicitacoes/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM solicitacoes WHERE id = ?', [id], (err,row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (row.usuario_id !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });
    if (row.status !== 'PENDENTE') return res.status(400).json({ error: 'Só é possível excluir solicitações pendentes' });
    // Delete dependent records in correct order to satisfy FK constraints
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      // remove atestado file and record
      db.get('SELECT arquivo_path_criptografado FROM atestados_saude WHERE solicitacao_id = ?', [id], (e,aRow) => {
        if (e) return db.run('ROLLBACK', ()=> res.status(500).json({ error: e.message }));
        if (aRow && aRow.arquivo_path_criptografado) {
          try { if (fs.existsSync(aRow.arquivo_path_criptografado)) fs.unlinkSync(aRow.arquivo_path_criptografado); } catch(ex){}
        }
        db.run('DELETE FROM atestados_saude WHERE solicitacao_id = ?', [id], (e2) => {
          if (e2) return db.run('ROLLBACK', ()=> res.status(500).json({ error: e2.message }));
          db.run('DELETE FROM trilha_auditoria WHERE solicitacao_id = ?', [id], (e3) => {
            if (e3) return db.run('ROLLBACK', ()=> res.status(500).json({ error: e3.message }));
            db.run('DELETE FROM solicitacao_horarios WHERE solicitacao_id = ?', [id], (e4) => {
              if (e4) return db.run('ROLLBACK', ()=> res.status(500).json({ error: e4.message }));
              db.run('DELETE FROM solicitacoes WHERE id = ?', [id], function(e5){
                if (e5) return db.run('ROLLBACK', ()=> res.status(500).json({ error: e5.message }));
                // registro de exclusão sem referenciar o id da solicitação (evita FK contraint quando solicitacao já foi removida)
                db.run('INSERT INTO trilha_auditoria (solicitacao_id, usuario_acao_id, acao_realizada, dados_anteriores) VALUES (?,?,?,?)', [null, req.user.id, 'Solicitação Excluída', null], (e6) => {
                  if (e6) return db.run('ROLLBACK', ()=> res.status(500).json({ error: e6.message }));
                  db.run('COMMIT', (ec) => {
                    if (ec) return res.status(500).json({ error: ec.message });
                    res.json({ ok: true });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

// Gestor: pendências de sua equipe
app.get('/gestor/pendencias', requireAuth, requireRole(['GESTOR']), (req, res) => {
  db.all('SELECT s.*, u.nome as solicitante_nome, u.email as solicitante_email FROM solicitacoes s JOIN usuarios u ON s.usuario_id = u.id WHERE u.gestor_id = ? AND s.status = ? ORDER BY s.criado_em DESC', [req.user.id, 'PENDENTE'], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Gestor decide
app.post('/solicitacoes/:id/decide', requireAuth, requireRole(['GESTOR']), (req, res) => {
  const id = req.params.id;
  const { acao, justificativa } = req.body; // acao: 'APROVAR'|'RECUSAR'
  if (!acao) return res.status(400).json({ error: 'Ação necessária' });
  db.get('SELECT s.*, u.gestor_id FROM solicitacoes s JOIN usuarios u ON s.usuario_id = u.id WHERE s.id = ?', [id], (err,row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (row.gestor_id !== req.user.id) return res.status(403).json({ error: 'Não é gestor desta pessoa' });
    if (acao === 'RECUSAR' && (!justificativa || justificativa.trim() === '')) return res.status(400).json({ error: 'Justificativa obrigatória para recusa' });
    const novoStatus = acao === 'APROVAR' ? 'APROVADO' : 'RECUSADO';
    db.run('UPDATE solicitacoes SET status = ?, justificativa_recusa = ?, gestor_aprovador_id = ? WHERE id = ?', [novoStatus, acao === 'RECUSAR' ? justificativa : null, req.user.id, id], function(e){
      if (e) return res.status(500).json({ error: e.message });
      db.run('INSERT INTO trilha_auditoria (solicitacao_id, usuario_acao_id, acao_realizada, dados_anteriores) VALUES (?,?,?,?)', [id, req.user.id, acao === 'APROVAR' ? 'Aprovado pelo Gestor' : 'Recusado pelo Gestor', JSON.stringify({ justificativa })]);
      res.json({ ok: true });
    });
  });
});

// RH: visualizar e validar atestado (descriptografar e enviar para download temporário)
app.get('/rh/atestados/:solicitacaoId/download', requireAuth, requireRole(['RH']), (req, res) => {
  const id = req.params.solicitacaoId;
  db.get('SELECT a.* FROM atestados_saude a WHERE a.solicitacao_id = ?', [id], async (err,row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Atestado não encontrado' });
    const tmp = path.join(UPLOAD_DIR, `tmp-${Date.now()}-${path.basename(row.arquivo_path_criptografado)}.dec`);
    try {
      await decryptFile(row.arquivo_path_criptografado, tmp);
      res.download(tmp, (err2) => { fs.unlinkSync(tmp); });
    } catch (ex) { res.status(500).json({ error: ex.message }); }
  });
});

// RH: aprovar atestado (apenas RH)
app.post('/rh/atestados/:solicitacaoId/aprovar', requireAuth, requireRole(['RH']), (req, res) => {
  const id = req.params.solicitacaoId;
  // verificar existência do atestado e da solicitação
  db.get('SELECT s.* FROM atestados_saude a JOIN solicitacoes s ON s.id = a.solicitacao_id WHERE a.solicitacao_id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Atestado não encontrado' });
    // atualizar status para APROVADO e registrar na trilha
    db.run('UPDATE solicitacoes SET status = ?, gestor_aprovador_id = ? WHERE id = ?', ['APROVADO', req.user.id, id], function(e){
      if (e) return res.status(500).json({ error: e.message });
      db.run('INSERT INTO trilha_auditoria (solicitacao_id, usuario_acao_id, acao_realizada, dados_anteriores) VALUES (?,?,?,?)', [id, req.user.id, 'Aprovado pelo RH', null]);
      res.json({ ok: true });
    });
  });
});

// Export dados para folha
app.get('/export', requireAuth, requireRole(['RH']), (req, res) => {
  const format = (req.query.format || 'csv').toLowerCase();
  db.all('SELECT s.*, u.nome, u.email FROM solicitacoes s JOIN usuarios u ON s.usuario_id = u.id WHERE s.status = ?', ['APROVADO'], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (format === 'json') return res.json(rows);
    const columns = Object.keys(rows[0] || {});
    const csv = stringify(rows, { header: true, columns });
    res.setHeader('Content-Disposition', 'attachment; filename=export.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  });
});

// Trilha de auditoria (apenas leitura)
app.get('/trilha/:solicitacaoId', requireAuth, (req, res) => {
  const id = req.params.solicitacaoId;
  // somente proprietário, RH ou gestor direto podem ver a trilha
  db.get('SELECT s.usuario_id, u.gestor_id FROM solicitacoes s JOIN usuarios u ON s.usuario_id = u.id WHERE s.id = ?', [id], (err, info) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!info) return res.status(404).json({ error: 'Solicitação não encontrada' });
    const isOwner = info.usuario_id === req.user.id;
    const isRH = req.user.perfil === 'RH';
    const isGestor = req.user.perfil === 'GESTOR' && info.gestor_id === req.user.id;
    if (!isOwner && !isRH && !isGestor) return res.status(403).json({ error: 'Acesso negado' });
    db.all('SELECT t.*, u.nome as usuario_nome FROM trilha_auditoria t LEFT JOIN usuarios u ON t.usuario_acao_id = u.id WHERE t.solicitacao_id = ? ORDER BY t.timestamp_oficial ASC', [id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
});

// Ensure root path serves the SPA
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
