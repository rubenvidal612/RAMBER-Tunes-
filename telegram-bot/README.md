# lucianamusic Telegram Bot

## Requisitos

- Node.js 18+ (recomendado 20)
- PM2 (para mantenerlo activo)

## Configuración

1) Entra a la carpeta:

```bash
cd telegram-bot
```

2) Instala dependencias:

```bash
npm install
```

3) Crea el archivo `.env` (en `telegram-bot/.env`) copiando desde `.env.example` y llenando valores:

```bash
cp .env.example .env
```

- `TELEGRAM_BOT_TOKEN`: token real del bot (BotFather)
- `TELEGRAM_BOT_SECRET`: el mismo valor que tengas configurado en Vercel como `TELEGRAM_BOT_SECRET`
- `BASE_URL`: `https://ramber-tunes.vercel.app`

## Ejecutar en desarrollo

```bash
npm start
```

## Ejecutar en VPS con PM2

1) Instala PM2 (si no lo tienes):

```bash
npm i -g pm2
```

2) Inicia el bot:

```bash
pm2 start index.js --name lucianamusic-bot
```

3) Guardar el estado y auto-arranque:

```bash
pm2 save
pm2 startup
```

## Comandos del bot

- `/vincular`: vincula tu Telegram con tu cuenta web usando código de 6 dígitos
- `/creditos`: muestra tu saldo de créditos
- `/cancion`: flujo guiado para generar una canción
- `/cover`: flujo guiado para hacer cover con audio del cliente
