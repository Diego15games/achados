const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERRO: MONGODB_URI não foi configurada.");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);

let db;

async function conectarMongoDB() {
  try {
    await client.connect();

    db = client.db("achadinhos");

    console.log("MongoDB conectado com sucesso!");

    await db.collection("categorias").createIndex(
      { nome: 1 },
      { unique: true }
    );

    console.log("Banco de dados pronto!");
  } catch (erro) {
    console.error("Erro ao conectar ao MongoDB:", erro);
    process.exit(1);
  }
}

/* =========================
   TESTE DA API
========================= */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    mensagem: "API Achadinhos funcionando!",
    mongodb: db ? "conectado" : "desconectado"
  });
});

/* =========================
   CATEGORIAS
========================= */

// Listar categorias
app.get("/api/categorias", async (req, res) => {
  try {
    const categorias = await db
      .collection("categorias")
      .find({})
      .sort({ nome: 1 })
      .toArray();

    res.json(categorias);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao buscar categorias." });
  }
});

// Criar categoria
app.post("/api/categorias", async (req, res) => {
  try {
    const { nome } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({
        erro: "O nome da categoria é obrigatório."
      });
    }

    const categoria = {
      nome: nome.trim(),
      criadaEm: new Date()
    };

    const resultado = await db
      .collection("categorias")
      .insertOne(categoria);

    res.status(201).json({
      _id: resultado.insertedId,
      ...categoria
    });
  } catch (erro) {
    if (erro.code === 11000) {
      return res.status(409).json({
        erro: "Essa categoria já existe."
      });
    }

    res.status(500).json({
      erro: "Erro ao criar categoria."
    });
  }
});

// Excluir categoria
app.delete("/api/categorias/:id", async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);

    const resultado = await db
      .collection("categorias")
      .deleteOne({ _id: id });

    if (resultado.deletedCount === 0) {
      return res.status(404).json({
        erro: "Categoria não encontrada."
      });
    }

    res.json({
      mensagem: "Categoria excluída com sucesso."
    });
  } catch (erro) {
    res.status(400).json({
      erro: "ID da categoria inválido."
    });
  }
});

/* =========================
   PRODUTOS
========================= */

// Listar produtos
app.get("/api/produtos", async (req, res) => {
  try {
    const produtos = await db
      .collection("produtos")
      .find({})
      .sort({ criadoEm: -1 })
      .toArray();

    res.json(produtos);
  } catch (erro) {
    res.status(500).json({
      erro: "Erro ao buscar produtos."
    });
  }
});

// Buscar produto por ID
app.get("/api/produtos/:id", async (req, res) => {
  try {
    const produto = await db
      .collection("produtos")
      .findOne({
        _id: new ObjectId(req.params.id)
      });

    if (!produto) {
      return res.status(404).json({
        erro: "Produto não encontrado."
      });
    }

    res.json(produto);
  } catch (erro) {
    res.status(400).json({
      erro: "ID do produto inválido."
    });
  }
});

// Criar produto
app.post("/api/produtos", async (req, res) => {
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
      etiqueta
    } = req.body;

    if (!nome || !imagem || !linkAmazon) {
      return res.status(400).json({
        erro: "Nome, imagem e link da Amazon são obrigatórios."
      });
    }

    const produto = {
      nome: nome.trim(),
      categoria: categoria || "",
      preco: preco || "",
      imagem: imagem.trim(),
      imagens: Array.isArray(imagens) ? imagens : [],
      descricao: descricao || "",
      especificacoes: especificacoes || "",
      linkAmazon: linkAmazon.trim(),
      etiqueta: etiqueta || "",
      criadoEm: new Date(),
      atualizadoEm: new Date()
    };

    const resultado = await db
      .collection("produtos")
      .insertOne(produto);

    res.status(201).json({
      _id: resultado.insertedId,
      ...produto
    });
  } catch (erro) {
    console.error(erro);

    res.status(500).json({
      erro: "Erro ao criar produto."
    });
  }
});

// Editar produto
app.put("/api/produtos/:id", async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);

    const dados = {
      ...req.body,
      atualizadoEm: new Date()
    };

    delete dados._id;

    const resultado = await db
      .collection("produtos")
      .updateOne(
        { _id: id },
        { $set: dados }
      );

    if (resultado.matchedCount === 0) {
      return res.status(404).json({
        erro: "Produto não encontrado."
      });
    }

    res.json({
      mensagem: "Produto atualizado com sucesso."
    });
  } catch (erro) {
    res.status(400).json({
      erro: "ID do produto inválido."
    });
  }
});

// Excluir produto
app.delete("/api/produtos/:id", async (req, res) => {
  try {
    const id = new ObjectId(req.params.id);

    const resultado = await db
      .collection("produtos")
      .deleteOne({
        _id: id
      });

    if (resultado.deletedCount === 0) {
      return res.status(404).json({
        erro: "Produto não encontrado."
      });
    }

    res.json({
      mensagem: "Produto excluído com sucesso."
    });
  } catch (erro) {
    res.status(400).json({
      erro: "ID do produto inválido."
    });
  }
});

/* =========================
   INICIAR SERVIDOR
========================= */

async function iniciar() {
  await conectarMongoDB();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

iniciar();
