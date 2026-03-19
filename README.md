# Meta Ads MCP Server — DEVAL

MCP server que conecta Meta Ads API directo a Claude.ai como conector nativo.

## Tools disponibles

| Tool | Qué hace |
|---|---|
| `get_ad_accounts` | Lista todas las cuentas CSCO |
| `get_campaigns` | Campañas de una cuenta (filtrar por ACTIVE/PAUSED) |
| `get_insights` | Métricas: gasto, ROAS, CTR, CPC por campaña/adset/ad |
| `compare_brands` | Comparativa de las 5 marcas en un período |
| `get_adsets` | Adsets de una campaña específica |

## Deploy en Railway (5 minutos)

### 1. Sube el código a GitHub
```bash
git init
git add .
git commit -m "meta ads mcp server"
git remote add origin https://github.com/TU_USUARIO/meta-ads-mcp.git
git push -u origin main
```

### 2. Crea el proyecto en Railway
- Ve a railway.app → New Project → Deploy from GitHub
- Selecciona el repo

### 3. Agrega la variable de entorno
En Railway → tu proyecto → Variables:
```
META_ACCESS_TOKEN = tu_long_lived_token_aqui
```

### 4. Obtén la URL pública
Railway te da algo como: `https://meta-ads-mcp-production.up.railway.app`

### 5. Conéctalo en Claude.ai
Settings → Connectors → Add MCP Server:
```
URL: https://tu-app.up.railway.app/mcp
```

## Uso en Claude

Una vez conectado puedes preguntarle directamente:
- "¿Cuál campaña de PUMA tiene mejor ROAS este mes?"
- "Compara el gasto de todas las marcas la última semana"
- "¿Qué campañas de Los Muchachos están activas?"
- "Dame los insights de COLE HAAN en los últimos 14 días"

## Variables de entorno

| Variable | Descripción |
|---|---|
| `META_ACCESS_TOKEN` | Long-lived token de Meta (60 días) |
| `PORT` | Puerto (Railway lo asigna automático) |
