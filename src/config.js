// Configuração do ProFoco.
// Cole aqui o "ID do cliente OAuth" (tipo: Aplicativo da Web) criado no Google Cloud Console.
// Passo a passo no README.md. Esse ID é público por natureza: não é segredo.
export const GOOGLE_CLIENT_ID = "898513177063-adtf14hd7re5vi4sl6cphom7cdhu2a44.apps.googleusercontent.com";

// Chave Pix para apoio voluntário (e-mail, telefone, CPF/CNPJ ou chave aleatória).
// Deixe vazio ("") para esconder os avisos de apoio. Atenção: o repositório é público, então esta chave também fica pública.
export const PIX_KEY = "52f372e5-8e7a-4682-9cc4-13976c74a847";

// Nome do arquivo salvo na pasta oculta do app (appDataFolder) no Google Drive de cada usuário.
export const DATA_FILE = "profoco-data.json";

// Escopos pedidos ao usuário. drive.appdata só dá acesso à pasta privada do próprio app.
export const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.appdata",
];
