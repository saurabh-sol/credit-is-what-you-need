import { ECHO_MODEL, preflight, RATE_LIMIT, v1 } from "@/lib/gateway";
import { CREDITS_PER_USD, MARGIN } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";

// The API described in OpenAPI 3.1, for generating clients and for tools that
// read a spec. Public: it says how to call, never who may.

const bearer = [{ bearerAuth: [] }];
const errorBody = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
const passthrough = (what: string) => ({
  description: `${what}. The body is passed to the model provider as is, apart from provider-routing fields, which are ignored.`,
  required: true,
  content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
});
const common = {
  401: errorBody("The key is missing, mistyped or revoked."),
  402: errorBody("The balance cannot cover this call."),
  404: errorBody("No model of that id is on this server."),
  429: errorBody(`More than ${RATE_LIMIT} requests in a minute on one key.`),
  502: errorBody("The provider could not be reached. Nothing was charged."),
};
const charged = {
  "x-kredit-credits-charged": { schema: { type: "integer" }, description: "What this call cost, in credits." },
  "x-kredit-balance": { schema: { type: "integer" }, description: "The balance after the charge." },
  "x-request-id": { schema: { type: "string" }, description: "An id for this request, for support." },
};

export const GET = v1(() => {
  // The public address, not the request's: behind Render the request's origin is an internal port.
  const origin = SITE_URL;
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Kredit API",
      version: "1",
      description: [
        "AI model calls paid with Kredit credits. 1,000 credits = $1 of usage.",
        `Calls are billed at the provider's price with a ${Math.round(MARGIN * 100)}% fee, rounded up to a whole credit.`,
        "Three dialects, one key: OpenAI Chat Completions, OpenAI Responses and Anthropic Messages. Point any of their SDKs at this base URL.",
        `The model "${ECHO_MODEL}" answers without a provider and can be used to test a key.`,
      ].join(" "),
    },
    servers: [{ url: `${origin}/v1` }],
    security: bearer,
    paths: {
      "/chat/completions": {
        post: {
          summary: "OpenAI Chat Completions",
          operationId: "createChatCompletion",
          requestBody: passthrough("An OpenAI chat completion request"),
          responses: {
            200: {
              description: "The provider's answer, in OpenAI's shape. Streams end with a chunk carrying `kredit.credits_charged` and `kredit.balance` before `[DONE]`.",
              headers: charged,
              content: { "application/json": { schema: { type: "object", additionalProperties: true } }, "text/event-stream": { schema: { type: "string" } } },
            },
            400: errorBody("The body is missing `model` or `messages`, or the model is not a chat model."),
            ...common,
          },
        },
      },
      "/completions": {
        post: {
          summary: "OpenAI legacy text completions",
          operationId: "createCompletion",
          requestBody: passthrough("An OpenAI text completion request: `model`, `prompt` and the usual options. The prompt is answered as one chat turn."),
          responses: {
            200: { description: "A `text_completion`, or a stream of them.", headers: charged, content: { "application/json": { schema: { type: "object", additionalProperties: true } }, "text/event-stream": { schema: { type: "string" } } } },
            400: errorBody("The body is missing `model` or `prompt`, or the model is not a chat model."),
            ...common,
          },
        },
      },
      "/responses": {
        post: {
          summary: "OpenAI Responses",
          operationId: "createResponse",
          requestBody: passthrough("An OpenAI Responses request"),
          responses: {
            200: { description: "The provider's answer, in the Responses shape.", headers: charged, content: { "application/json": { schema: { type: "object", additionalProperties: true } }, "text/event-stream": { schema: { type: "string" } } } },
            400: errorBody("The body is missing `model` or `input`."),
            ...common,
          },
        },
      },
      "/messages": {
        post: {
          summary: "Anthropic Messages",
          operationId: "createMessage",
          description: "The key may also be sent as `x-api-key`. Errors use Anthropic's shape.",
          security: [{ bearerAuth: [] }, { anthropicKey: [] }],
          requestBody: passthrough("An Anthropic Messages request; `max_tokens` is required"),
          responses: {
            200: { description: "The provider's answer, in Anthropic's shape.", headers: charged, content: { "application/json": { schema: { type: "object", additionalProperties: true } }, "text/event-stream": { schema: { type: "string" } } } },
            400: { description: "The body is missing `model`, `max_tokens` or `messages`.", content: { "application/json": { schema: { $ref: "#/components/schemas/AnthropicError" } } } },
            ...common,
          },
        },
      },
      "/systemone": {
        post: {
          summary: "TypeSafe evaluation (Jev)",
          operationId: "createEvaluation",
          requestBody: passthrough("A TypeSafe System One request: `model`, `state` and named `questions` of type noul, choice or score. Also served at /typesafe/v1/systemone."),
          responses: {
            200: { description: "The answers, in TypeSafe's shape. Billed on input tokens.", headers: charged, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
            400: errorBody("The body is missing `model`, `state` or `questions`, or the model is not an evaluation model."),
            ...common,
          },
        },
      },
      "/embeddings": {
        post: {
          summary: "OpenAI embeddings",
          operationId: "createEmbedding",
          requestBody: passthrough("An OpenAI embeddings request"),
          responses: {
            200: { description: "The vectors, in OpenAI's shape. Billed on input tokens.", headers: charged, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
            400: errorBody("The body is missing `model` or `input`, or the model is not an embedding model."),
            ...common,
          },
        },
      },
      "/images/generations": {
        post: {
          summary: "Generate images",
          operationId: "createImage",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["model", "prompt"],
                  properties: {
                    model: { type: "string", examples: ["openai/gpt-image-2"] },
                    prompt: { type: "string" },
                    n: { type: "integer", minimum: 1, maximum: 4, default: 1 },
                    size: { type: "string", examples: ["1024x1024", "1536x1024"] },
                    aspect_ratio: { type: "string", examples: ["16:9"] },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "The pictures, base64 encoded, and the tokens used where the model bills by token.",
              headers: charged,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      created: { type: "integer" },
                      data: { type: "array", items: { type: "object", properties: { b64_json: { type: "string" }, media_type: { type: "string" } } } },
                      usage: { type: "object", properties: { input_tokens: { type: "integer" }, output_tokens: { type: "integer" } } },
                    },
                  },
                },
              },
            },
            400: errorBody("The body is missing `model` or `prompt`, or the model is not an image model."),
            ...common,
          },
        },
      },
      "/videos/generations": {
        post: {
          summary: "Generate a video",
          operationId: "createVideo",
          description: "The request stays open until the clip is ready, usually under two minutes. The price is fixed before it starts: seconds times the model's per-second rate for the resolution and sound chosen.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["model", "prompt"],
                  properties: {
                    model: { type: "string", examples: ["google/veo-3.1-fast-generate-001"] },
                    prompt: { type: "string" },
                    duration: { type: "integer", default: 4, description: "Seconds. What each model allows varies." },
                    resolution: { type: "string", default: "720p", examples: ["720p", "1080p", "1280x720"] },
                    aspect_ratio: { type: "string", default: "16:9" },
                    generate_audio: { type: "boolean", default: false },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "The clip, base64 encoded.",
              headers: charged,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      created: { type: "integer" },
                      data: { type: "array", items: { type: "object", properties: { b64_json: { type: "string" }, media_type: { type: "string" } } } },
                      duration: { type: "integer" },
                      resolution: { type: "string" },
                      generate_audio: { type: "boolean" },
                    },
                  },
                },
              },
            },
            400: errorBody("The body is missing `model` or `prompt`, the model is not a video model, or it does not offer that resolution."),
            ...common,
          },
        },
      },
      "/models": {
        get: {
          summary: "List models",
          operationId: "listModels",
          responses: {
            200: { description: "Every model this key can call, with prices.", content: { "application/json": { schema: { $ref: "#/components/schemas/ModelList" } } } },
            401: common[401],
            429: common[429],
          },
        },
      },
      "/models/{id}": {
        get: {
          summary: "One model",
          operationId: "retrieveModel",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "The model id, such as openai/gpt-4o (the slash may be sent as %2F)." }],
          responses: {
            200: { description: "The model, with its price.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
            401: common[401],
            404: errorBody("No model has that id."),
            429: common[429],
          },
        },
      },
      "/account": {
        get: {
          summary: "The balance behind this key",
          operationId: "getAccount",
          responses: {
            200: { description: "Balance, credits held by running calls, and this key's name.", content: { "application/json": { schema: { $ref: "#/components/schemas/Account" } } } },
            401: common[401],
            429: common[429],
          },
        },
      },
      "/usage": {
        get: {
          summary: "Calls this wallet paid for",
          operationId: "listUsage",
          parameters: [
            { name: "from", in: "query", schema: { type: "string", format: "date-time" }, description: "Start of the period (inclusive)." },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" }, description: "End of the period (exclusive)." },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
            { name: "before", in: "query", schema: { type: "integer" }, description: "Continue from the `next` of the previous page." },
          ],
          responses: {
            200: { description: "The calls, newest first, and spend per model over the period.", content: { "application/json": { schema: { $ref: "#/components/schemas/UsageList" } } } },
            400: errorBody("`from` or `to` is not a date."),
            401: common[401],
            429: common[429],
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "A Kredit API key (`kred_sk_…`) from the dashboard." },
        anthropicKey: { type: "apiKey", in: "header", name: "x-api-key", description: "The same key, as Anthropic clients send it." },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: { message: { type: "string" }, type: { type: "string" }, code: { type: "string" } },
              required: ["message", "type", "code"],
            },
          },
          required: ["error"],
        },
        AnthropicError: {
          type: "object",
          properties: {
            type: { const: "error" },
            error: { type: "object", properties: { type: { type: "string" }, message: { type: "string" }, code: { type: "string" } } },
          },
        },
        Model: {
          type: "object",
          properties: {
            id: { type: "string", examples: ["anthropic/claude-sonnet-4.5"] },
            object: { const: "model" },
            owned_by: { type: "string" },
            name: { type: "string" },
            type: { type: "string", enum: ["language", "embedding", "image", "video", "evaluation", "other"] },
            context_window: { type: "integer" },
            pricing: {
              type: ["object", "null"],
              description: `Margin included, ${CREDITS_PER_USD} credits = $1. Language and embedding models list credits per million tokens; image models credits per image (or per million tokens, for the ones sold that way); video models credits per second at their cheapest resolution.`,
              properties: {
                credits_per_million_input: { type: "number" },
                credits_per_million_output: { type: "number" },
                credits_per_image: { type: "number" },
                credits_per_second_from: { type: "number" },
                at_resolution: { type: "string" },
              },
            },
          },
          required: ["id", "object", "owned_by", "type"],
        },
        ModelList: {
          type: "object",
          properties: { object: { const: "list" }, data: { type: "array", items: { $ref: "#/components/schemas/Model" } } },
        },
        Account: {
          type: "object",
          properties: {
            object: { const: "account" },
            address: { type: "string", description: "The wallet this key belongs to." },
            key: { type: "object", properties: { name: { type: "string" }, prefix: { type: "string" } } },
            balance: { type: "integer" },
            held: { type: "integer", description: "Credits promised to calls still running." },
            available: { type: "integer" },
            usd_value: { type: "number" },
            total_spent: { type: "integer" },
            rate_limit: { type: "object", properties: { requests_per_minute: { type: "integer" } } },
          },
        },
        UsageRow: {
          type: "object",
          properties: {
            id: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
            key: { type: "string", description: "The key's id, or `playground`." },
            model: { type: "string" },
            input_tokens: { type: "integer" },
            output_tokens: { type: "integer" },
            credits: { type: "integer" },
          },
        },
        UsageList: {
          type: "object",
          properties: {
            object: { const: "list" },
            period: { type: "object", properties: { from: { type: ["string", "null"] }, to: { type: ["string", "null"] } } },
            total_credits: { type: "integer" },
            by_model: {
              type: "array",
              items: {
                type: "object",
                properties: { model: { type: "string" }, calls: { type: "integer" }, input_tokens: { type: "integer" }, output_tokens: { type: "integer" }, credits: { type: "integer" } },
              },
            },
            data: { type: "array", items: { $ref: "#/components/schemas/UsageRow" } },
            has_more: { type: "boolean" },
            next: { type: ["integer", "null"] },
          },
        },
      },
    },
  };
  return Response.json(spec, { headers: { "cache-control": "public, max-age=3600" } });
});

export const OPTIONS = preflight;
