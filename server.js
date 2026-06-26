const express = require("express");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const QRCode = require("qrcode");

const app = express();
app.use(express.json());

let sock = null;
let qrCodeAtual = null;
let conectado = false;

async function iniciarWhatsapp() {

    const { state, saveCreds } = await useMultiFileAuthState("./auth");

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {

        const { connection, lastDisconnect, qr } = update;

        if (qr) {

            qrCodeAtual = await QRCode.toDataURL(qr);

            console.log("=====================================");
            console.log("NOVO QR CODE GERADO");
            console.log("Acesse: /qrcode");
            console.log("=====================================");
        }

        if (connection === "open") {

            conectado = true;
            qrCodeAtual = null;

            console.log("=====================================");
            console.log("WHATSAPP CONECTADO!");
            console.log("=====================================");
        }

        if (connection === "close") {

            conectado = false;

            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            console.log("Conexão fechada.");

            if (shouldReconnect) {

                console.log("Reconectando...");

                iniciarWhatsapp();
            }
        }

    });

    sock.ev.on("messages.update", (updates) => {
        console.log("========== MESSAGES.UPDATE ==========");
        console.dir(updates, { depth: null });
    });


    sock.ev.on("messages.upsert", (m) => {
        console.log("messages.upsert");
        console.dir(m, { depth: null });
    });

    sock.ev.on("message-receipt.update", (m) => {
        console.log("message-receipt.update");
        console.dir(m, { depth: null });
    });

}

iniciarWhatsapp();

app.get("/qrcode", (req, res) => {

    if (conectado) {

        return res.send(`
            <h2 style="font-family:Arial">
                WhatsApp conectado com sucesso!
            </h2>
        `);

    }

    if (!qrCodeAtual) {

        return res.send(`
            <h2 style="font-family:Arial">
                Aguardando geração do QRCode...
            </h2>
        `);

    }

    res.send(`
        <div style="text-align:center;font-family:Arial;margin-top:50px;">
            <h2>Escaneie o QR Code</h2>

            <img
                src="${qrCodeAtual}"
                style="width:320px;border:1px solid #999;padding:10px;border-radius:10px;"
            >

            <p>Atualize a página se ele expirar.</p>
        </div>
    `);

});

app.post("/enviar-mensagem", async (req, res) => {

    try {

        console.log("======================================");
        console.log("Nova requisição recebida");
        console.log(req.body);
        console.log("======================================");

        if (!conectado) {
            console.log("WhatsApp não conectado.");

            return res.status(500).json({
                status: "error",
                message: "WhatsApp não conectado."
            });
        }

        let { phone, message } = req.body;

        console.log("Número recebido:", phone);
        console.log("Mensagem:", message);

        let numero = phone.replace(/\D/g, "");

        console.log("Número limpo:", numero);

        // Remove o 9 após o DDD
        if (numero.length === 13 && numero.startsWith("55")) {
            numero = numero.slice(0, 4) + numero.slice(5);
        }

        console.log("Número convertido:", numero);

        console.log("Consultando WhatsApp...");

        const resultado = await sock.onWhatsApp(numero);

        console.log("Resultado onWhatsApp:");
        console.dir(resultado, { depth: null });

        const usuario = resultado[0];

        if (!usuario?.exists) {

            console.log("Número NÃO possui WhatsApp.");

            return res.status(404).json({
                status: "error",
                message: "Número não possui WhatsApp."
            });
        }

        console.log("Número encontrado.");
        console.log("JID:", usuario.jid);

        console.log("Enviando mensagem...");

        const retorno = await sock.sendMessage(usuario.jid, {
            text: message
        });

        console.log("Mensagem enviada!");

        console.dir(retorno, { depth: null });

        res.json({
            status: "success",
            retorno
        });

    } catch (err) {

        console.log("======================================");
        console.log("ERRO AO ENVIAR");
        console.error(err);
        console.log("======================================");

        res.status(500).json({
            status: "error",
            message: err.message
        });

    }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`Servidor rodando na porta ${PORT}`);

});