import express from "express";
import cors from "cors";

const META_TOKEN = process.env.META_ACCESS_TOKEN;
const META_API = "https://graph.facebook.com/v25.0";

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json());
app.options("*", cors());

async function metaGet(path, params = {}) {
  const url = new URL(`${META_API}${path}`);
  url.searchParams.set("access_token", META_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) throw new Error(`Meta API: ${json.error.message}`);
  return json;
}

const TOOLS = [
  {
    name: "get_ad_accounts",
    description: "Lista todas las cuentas de anuncios de Meta disponibles con nombre, moneda y estado.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_campaigns",
    description: "Devuelve las campañas de una cuenta de anuncios específica.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "ID de la cuenta. Ej: act_1295766891808765" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED", "ALL"], default: "ALL" },
      },
      required: ["account_id"],
    },
  },
  {
    name: "get_insights",
    description: "Devuelve métricas de rendimiento (gasto, ROAS, CTR, CPC) de una cuenta de Meta Ads.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "ID de la cuenta. Ej: act_1295766891808765" },
        date_preset: {
          type: "string",
          enum: ["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"],
          default: "last_30d",
        },
        level: {
          type: "string",
          enum: ["account", "campaign", "adset", "ad"],
          default: "campaign",
        },
      },
      required: ["account_id"],
    },
  },
  {
    name: "compare_brands",
    description: "Compara métricas de gasto y ROAS entre todas las marcas CSCO: FLORSHEIM, LOS MUCHACHOS, ISOLA, PUMA, COLE HAAN.",
    inputSchema: {
      type: "object",
      properties: {
        date_preset: {
          type: "string",
          enum: ["last_7d", "last_14d", "last_30d", "this_month", "last_month"],
          default: "this_month",
        },
      },
      required: [],
    },
  },
  {
    name: "get_adsets",
    description: "Devuelve los adsets de una campaña específica.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "ID de la campaña" },
      },
      required: ["campaign_id"],
    },
  },
];

async function callTool(name, args) {
  const ACCOUNTS = {
    FLORSHEIM:     "act_1035473470918187",
    LOS_MUCHACHOS: "act_1225637271950600",
    ISOLA:         "act_855059636556891",
    PUMA:          "act_1295766891808765",
    COLE_HAAN:     "act_432698772427150",
  };

  if (name === "get_ad_accounts") {
    return metaGet("/me/adaccounts", { fields: "id,name,currency,account_status" });
  }
  if (name === "get_campaigns") {
    const params = { fields: "id,name,status,objective,daily_budget,lifetime_budget" };
    if (args.status && args.status !== "ALL") params.effective_status = `["${args.status}"]`;
    return metaGet(`/${args.account_id}/campaigns`, params);
  }
  if (name === "get_insights") {
    return metaGet(`/${args.account_id}/insights`, {
      fields: "campaign_name,adset_name,spend,impressions,clicks,ctr,cpc,cpm,actions,action_values",
      date_preset: args.date_preset || "last_30d",
      level: args.level || "campaign",
      limit: 20,
    });
  }
  if (name === "compare_brands") {
    const preset = args.date_preset || "this_month";
    const results = await Promise.all(
      Object.entries(ACCOUNTS).map(async ([brand, id]) => {
        try {
          const data = await metaGet(`/${id}/insights`, {
            fields: "spend,impressions,clicks,ctr,actions,action_values",
            date_preset: preset,
            level: "account",
          });
          const d = data.data?.[0] || {};
          const spend = parseFloat(d.spend || 0);
          const purchaseValue = parseFloat(
            d.action_values?.find((a) => a.action_type === "purchase")?.value || 0
          );
          const roas = spend > 0 ? (purchaseValue / spend).toFixed(2) : "N/A";
          return { brand, spend: `$${spend.toFixed(2)}`, roas, ctr: d.ctr ? `${parseFloat(d.ctr).toFixed(2)}%` : "N/A", impressions: d.impressions || "0" };
        } catch (e) {
          return { brand, error: e.message };
        }
      })
    );
    return { period: preset, brands: results };
  }
  if (name === "get_adsets") {
    return metaGet(`/${args.campaign_id}/adsets`, {
      fields: "id,name,status,daily_budget,targeting,optimization_goal,start_time,end_time",
    });
  }
  throw new Error(`Tool not found: ${name}`);
}

function mcpReply(res, id, result) {
  res.json({ jsonrpc: "2.0", id, result });
}
function mcpError(res, id, code, message) {
  res.json({ jsonrpc: "2.0", id, error: { code, message } });
}

app.get("/mcp", (req, res) => {
  res.json({ status: "ok", server: "meta-ads-csco", version: "1.0.0" });
});

app.post("/mcp", async (req, res) => {
  const { id, method, params } = req.body;
  try {
    if (method === "initialize") {
      return mcpReply(res, id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "meta-ads-csco", version: "1.0.0" },
      });
    }
    if (method === "notifications/initialized") return res.status(200).json({});
    if (method === "tools/list") return mcpReply(res, id, { tools: TOOLS });
    if (method === "tools/call") {
      const { name, arguments: args } = params;
      const result = await callTool(name, args || {});
      return mcpReply(res, id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    }
    return mcpError(res, id, -32601, `Method not found: ${method}`);
  } catch (e) {
    return mcpError(res, id, -32603, e.message);
  }
});

app.get("/", (_, res) => res.json({ status: "ok", server: "Meta Ads MCP - DEVAL" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meta Ads MCP server running on port ${PORT}`));
