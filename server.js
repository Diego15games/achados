const express=require("express");
const cors=require("cors");
const {MongoClient,ObjectId}=require("mongodb");
const app=express();
app.use(cors());
app.use(express.json());
const PORT=process.env.PORT||3000;
const MONGODB_URI=process.env.MONGODB_URI;
const ADMIN_KEY=process.env.ADMIN_KEY;
if(!MONGODB_URI){console.error("MONGODB_URI não configurada");process.exit(1)}
if(!ADMIN_KEY){console.error("ADMIN_KEY não configurada");process.exit(1)}
const client=new MongoClient(MONGODB_URI);let db;
function adminAuth(req,res,next){if(req.headers["x-admin-key"]!==ADMIN_KEY)return res.status(401).json({erro:"Não autorizado."});next()}
async function conectar(){await client.connect();db=client.db("achadinhos");await db.collection("categorias").createIndex({nome:1},{unique:true});console.log("MongoDB conectado com sucesso!");console.log("Banco de dados pronto!")}
app.get("/",(req,res)=>res.json({status:"online",mensagem:"API Achadinhos funcionando!",mongodb:db?"conectado":"desconectado"}));
app.get("/api/categorias",async(req,res)=>{try{res.json(await db.collection("categorias").find({}).sort({nome:1}).toArray())}catch(e){res.status(500).json({erro:"Erro ao buscar categorias."})}});
app.post("/api/categorias",adminAuth,async(req,res)=>{try{const nome=(req.body.nome||"").trim();if(!nome)return res.status(400).json({erro:"O nome da categoria é obrigatório."});const c={nome,criadaEm:new Date()};const r=await db.collection("categorias").insertOne(c);res.status(201).json({_id:r.insertedId,...c})}catch(e){res.status(e.code===11000?409:500).json({erro:e.code===11000?"Essa categoria já existe.":"Erro ao criar categoria."})}});
app.delete("/api/categorias/:id",adminAuth,async(req,res)=>{try{const r=await db.collection("categorias").deleteOne({_id:new ObjectId(req.params.id)});if(!r.deletedCount)return res.status(404).json({erro:"Categoria não encontrada."});res.json({mensagem:"Categoria excluída com sucesso."})}catch(e){res.status(400).json({erro:"ID inválido."})}});
app.get("/api/produtos",async(req,res)=>{try{res.json(await db.collection("produtos").find({}).sort({criadoEm:-1}).toArray())}catch(e){res.status(500).json({erro:"Erro ao buscar produtos."})}});
app.get("/api/produtos/:id",async(req,res)=>{try{const p=await db.collection("produtos").findOne({_id:new ObjectId(req.params.id)});if(!p)return res.status(404).json({erro:"Produto não encontrado."});res.json(p)}catch(e){res.status(400).json({erro:"ID inválido."})}});
app.post("/api/produtos",adminAuth,async(req,res)=>{try{const {nome,categoria,preco,imagem,imagens,descricao,especificacoes,linkAmazon,etiqueta}=req.body;if(!nome||!imagem||!linkAmazon)return res.status(400).json({erro:"Nome, imagem e link da Amazon são obrigatórios."});const p={nome:nome.trim(),categoria:categoria||"",preco:preco||"",imagem:imagem.trim(),imagens:Array.isArray(imagens)?imagens:[],descricao:descricao||"",especificacoes:especificacoes||"",linkAmazon:linkAmazon.trim(),etiqueta:etiqueta||"",criadoEm:new Date(),atualizadoEm:new Date()};const r=await db.collection("produtos").insertOne(p);res.status(201).json({_id:r.insertedId,...p})}catch(e){res.status(500).json({erro:"Erro ao criar produto."})}});
app.put("/api/produtos/:id",adminAuth,async(req,res)=>{try{const d={...req.body,atualizadoEm:new Date()};delete d._id;delete d.criadoEm;const r=await db.collection("produtos").updateOne({_id:new ObjectId(req.params.id)},{$set:d});if(!r.matchedCount)return res.status(404).json({erro:"Produto não encontrado."});res.json({mensagem:"Produto atualizado com sucesso."})}catch(e){res.status(400).json({erro:"ID inválido."})}});
app.delete("/api/produtos/:id",adminAuth,async(req,res)=>{try{const r=await db.collection("produtos").deleteOne({_id:new ObjectId(req.params.id)});if(!r.deletedCount)return res.status(404).json({erro:"Produto não encontrado."});res.json({mensagem:"Produto excluído com sucesso."})}catch(e){res.status(400).json({erro:"ID inválido."})}});
async function iniciar(){try{await conectar();app.listen(PORT,"0.0.0.0",()=>console.log(`Servidor rodando na porta ${PORT}`))}catch(e){console.error("Erro ao conectar ao MongoDB:",e);process.exit(1)}}iniciar();
