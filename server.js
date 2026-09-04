const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_KEY = process.env.ADMIN_KEY;

if (!MONGODB_URI) {
  console.error("MONGODB_URI não configurada");
  process.exit(1);
}
if (!ADMIN_KEY) {
  console.error("ADMIN_KEY não configurada");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);
let db;
let bucket;

function adminAuth(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(401).json({ erro: "Não autorizado." });
  }
  next();
}

app.post("/api/admin/login", (req, res) => {
  const { key } = req.body || {};
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ erro: "Chave de administrador incorreta." });
  }
  res.json({ ok: true, mensagem: "Login autorizado." });
});

async function conectar() {
  await client.connect();
  db = client.db("achadinhos");
  bucket = new GridFSBucket(db, { bucketName: "imagens" });
  await db.collection("categorias").createIndex({ nome: 1 }, { unique: true });
  console.log("MongoDB conectado com sucesso!");
  console.log("Banco de dados pronto!");
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    mensagem: "API Achadinhos funcionando!",
    mongodb: db ? "conectado" : "desconectado"
  });
});

app.get("/api/categorias", async (req, res) => {
  try {
    res.json(
      await db.collection("categorias").find({}).sort({ nome: 1 }).toArray()
    );
  } catch {
    res.status(500).json({ erro: "Erro ao buscar categorias." });
  }
});

app.post("/api/categorias", adminAuth, async (req, res) => {
  try {
    const nome = (req.body.nome || "").trim();
    if (!nome) return res.status(400).json({ erro: "O nome da categoria é obrigatório." });
    const c = { nome, criadaEm: new Date() };
    const r = await db.collection("categorias").insertOne(c);
    res.status(201).json({ _id: r.insertedId, ...c });
  } catch (e) {
    res.status(e.code === 11000 ? 409 : 500).json({
      erro: e.code === 11000 ? "Essa categoria já existe." : "Erro ao criar categoria."
    });
  }
});

app.delete("/api/categorias/:id", adminAuth, async (req, res) => {
  try {
    const r = await db.collection("categorias").deleteOne({
      _id: new ObjectId(req.params.id)
    });
    if (!r.deletedCount) return res.status(404).json({ erro: "Categoria não encontrada." });
    res.json({ mensagem: "Categoria excluída com sucesso." });
  } catch {
    res.status(400).json({ erro: "ID inválido." });
  }
});

/* Upload de imagens:
   A imagem fica no próprio MongoDB (GridFS), então não depende de Imgur/Postimage. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Apenas arquivos de imagem são permitidos."));
    }
    cb(null, true);
  }
});

app.post("/api/upload", adminAuth, upload.array("imagens", 10), async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ erro: "Nenhuma imagem enviada." });
    }

    const urls = [];

    for (const file of req.files) {
      const safeName = (file.originalname || "imagem")
        .replace(/[^\w.\- ]/g, "_")
        .slice(0, 100);

      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
      const uploadStream = bucket.openUploadStream(filename, {
        contentType: file.mimetype,
        metadata: { originalName: file.originalname }
      });

      await new Promise((resolve, reject) => {
        uploadStream.on("error", reject);
        uploadStream.on("finish", resolve);
        uploadStream.end(file.buffer);
      });

      urls.push(`/api/imagens/${uploadStream.id.toString()}`);
    }

    res.status(201).json({ urls });
  } catch (e) {
    console.error("Erro no upload:", e);
    res.status(500).json({ erro: e.message || "Erro ao enviar imagem." });
  }
});

app.get("/api/imagens/:id", async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);
    const files = await db.collection("imagens.files").find({ _id: id }).toArray();

    if (!files.length) return res.status(404).end();

    res.setHeader("Content-Type", files[0].contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    bucket.openDownloadStream(id).on("error", () => res.status(404).end()).pipe(res);
  } catch {
    res.status(400).end();
  }
});

app.get("/api/produtos", async (req, res) => {
  try {
    res.json(
      await db.collection("produtos").find({}).sort({ criadoEm: -1 }).toArray()
    );
  } catch {
    res.status(500).json({ erro: "Erro ao buscar produtos." });
  }
});

app.get("/api/produtos/:id", async (req, res) => {
  try {
    const p = await db.collection("produtos").findOne({
      _id: new ObjectId(req.params.id)
    });
    if (!p) return res.status(404).json({ erro: "Produto não encontrado." });
    res.json(p);
  } catch {
    res.status(400).json({ erro: "ID inválido." });
  }
});

app.post("/api/produtos", adminAuth, async (req, res) => {
  try {
    const {
  nome,
  categoria,
  preco,
  imagem,
  imagens,
  descricao,
  especificacoes,
  linkAmazon,
  etiqueta,
  destaque
} = req.body;

    if (!nome || !imagem || !linkAmazon) {
      return res.status(400).json({
        erro: "Nome, imagem e link da Amazon são obrigatórios."
      });
    }

    const p = {
      nome: nome.trim(),
      categoria: categoria || "",
      preco: preco || "",
      imagem: imagem.trim(),
      imagens: Array.isArray(imagens) ? imagens : [],
      descricao: descricao || "",
      especificacoes: especificacoes || "",
      linkAmazon: linkAmazon.trim(),
      etiqueta: etiqueta || "",
      destaque: destaque === true,
      criadoEm: new Date(),
      atualizadoEm: new Date()
    };

    const r = await db.collection("produtos").insertOne(p);
    res.status(201).json({ _id: r.insertedId, ...p });
  } catch {
    res.status(500).json({ erro: "Erro ao criar produto." });
  }
});

app.put("/api/produtos/:id", adminAuth, async (req, res) => {
  try {
    const d = { ...req.body, atualizadoEm: new Date() };
    delete d._id;
    delete d.criadoEm;

    const r = await db.collection("produtos").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: d }
    );

    if (!r.matchedCount) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    res.json({ mensagem: "Produto atualizado com sucesso." });
  } catch {
    res.status(400).json({ erro: "ID inválido." });
  }
});

app.delete("/api/produtos/:id", adminAuth, async (req, res) => {
  try {
    const r = await db.collection("produtos").deleteOne({
      _id: new ObjectId(req.params.id)
    });
    if (!r.deletedCount) return res.status(404).json({ erro: "Produto não encontrado." });
    res.json({ mensagem: "Produto excluído com sucesso." });
  } catch {
    res.status(400).json({ erro: "ID inválido." });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ erro: "Imagem muito grande ou quantidade de imagens excedida. Máximo: 5 MB por imagem e 10 imagens." });
  }
  if (err) {
    return res.status(400).json({ erro: err.message || "Erro no servidor." });
  }
  next();
});

async function iniciar() {
  try {
    await conectar();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (e) {
    console.error("Erro ao conectar ao MongoDB:", e);
    process.exit(1);
  }
}

iniciar();
