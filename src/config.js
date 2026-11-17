// Configuração do ProFoco.
// Cole aqui o "ID do cliente OAuth" (tipo: Aplicativo da Web) criado no Google Cloud Console.
// Passo a passo no README.md. Esse ID é público por natureza: não é segredo.
export const GOOGLE_CLIENT_ID = "";

// Nome do arquivo salvo na pasta oculta do app (appDataFolder) no Google Drive de cada usuário.
export const DATA_FILE = "profoco-data.json";

// Escopos pedidos ao usuário. drive.appdata só dá acesso à pasta privada do próprio app.
export const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.appdata",
];
