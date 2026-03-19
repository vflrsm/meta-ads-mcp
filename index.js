import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";
import cors from "cors";

const META_TOKEN = process.env.META_ACCESS_TOKEN;
const META_API = "https://graph.facebook.com/v25.0";

// ── helpers ──────────────────────────────────────────────────────────────────

async function metaGet(path, params = {}) {
  const url = new URL(`${META_API}${path}`);
  url.searchParams.set("access_token", META_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const json = await res.json();

  if (json.error) throw new Error(`Meta API: ${json.error.message}`);
  return json;
}

function text(obj) {
  return [{ type: "text", text: JSON.stringify(obj, null, 2) }];
}

// ── MCP server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "meta-ads-csco",
  version: "1.0.0",
});

// Tool 1 — listar cuentas de anuncios
server.tool(
  "get_ad_accounts",
  "Lista todas las cuentas de anuncios de Meta disponibles con nombre, moneda y estado.",
  {},
  async () => {
    const data = await metaGet("/me/adaccounts", {
      fields: "id,name,currency,account_status,spend_cap",
    });
    return { content: text(data) };
  }
);

// Tool 2 — campañas de una cuenta
server.tool(
  "get_campaigns",
  "Devuelve las campañas de una cuenta de anuncios específica.",
  {
    account_id: z.string().describe("ID de la cuenta. Ej: act_1295766891808765"),
    status: z.enum(["ACTIVE", "PAUSED", "ALL"]).default("ALL").describe("Filtrar por estado"),
  },
  async ({ account_id, status }) => {
    const params = {
      fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time",
    };
    if (status !== "ALL") params.effective_status = `["${status}"]`;

    const data = await metaGet(`/${account_id}/campaigns`, params);
    return { content: text(data) };
  }
);

// Tool 3 — métricas / insights de una cuenta
server.tool(
  "get_insights",
  "Devuelve métricas de rendimiento (gasto, ROAS, CTR, CPC, resultados) de una cuenta.",
  {
    account_id: z.string().describe("ID de la cuenta. Ej: act_1295766891808765"),
    date_preset: z
      .enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"])
      .default("last_30d")
      .describe("Rango de fechas"),
    level: z
      .enum(["account", "campaign", "adset", "ad"])
      .default("campaign")
      .describe("Nivel de desglose"),
  },
  async ({ account_id, date_preset, level }) => {
    const data = await metaGet(`/${account_id}/insights`, {
      fields:
        "campaign_name,adset_name,spend,impressions,clicks,ctr,cpc,cpm,actions,action_values,roas",
      date_preset,
      level,
      limit: 20,
    });
    return { content: text(data) };
  }
);

// Tool 4 — comparar todas las marcas CSCO
server.tool(
  "compare_brands",
  "Compara métricas de gasto y ROAS entre todas las marcas CSCO para un período.",
  {
    date_preset: z
      .enum(["last_7d", "last_14d", "last_30d", "this_month", "last_month"])
      .default("last_30d")
      .describe("Rango de fechas"),
  },
  async ({ date_preset }) => {
    const ACCOUNTS = {
      FLORSHEIM:    "act_1035473470918187",
      LOS_MUCHACHOS: "act_1225637271950600",
      ISOLA:        "act_855059636556891",
      PUMA:         "act_1295766891808765",
      COLE_HAAN:    "act_432698772427150",
    };

    const results = await Promise.all(
      Object.entries(ACCOUNTS).map(async ([brand, id]) => {
        try {
          const data = await metaGet(`/${id}/insights`, {
            fields: "spend,impressions,clicks,ctr,actions,action_values",
            date_preset,
            level: "account",
          });
          const d = data.data?.[0] || {};
          const spend = parseFloat(d.spend || 0);
          const purchaseValue = d.action_values
            ?.find((a) => a.action_type === "purchase")?.value || 0;
          const roas = spend > 0 ? (parseFloat(purchaseValue) / spend).toFixed(2) : "N/A";

          return { brand, spend: `$${spend.toFixed(2)}`, roas, ctr: d.ctr, impressions: d.impressions };
        } catch (e) {
          return { brand, error: e.message };
        }
      })
    );

    return { content: text({ period: date_preset, brands: results }) };
  }
);

// Tool 5 — adsets de una campaña
server.tool(
  "get_adsets",
  "Devuelve los adsets (conjuntos de anuncios) de una campaña específica.",
  {
    campaign_id: z.string().describe("ID de la campaña"),
  },
  async ({ campaign_id }) => {
    const data = await metaGet(`/${campaign_id}/adsets`, {
      fields:
        "id,name,status,daily_budget,lifetime_budget,targeting,optimization_goal,billing_event,start_time,end_time",
    });
    return { content: text(data) };
  }
);

// ── Express + transporte HTTP ─────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meta Ads MCP server corriendo en puerto ${PORT}`));
