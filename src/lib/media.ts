import { createGateway } from "@ai-sdk/gateway";
import { experimental_generateVideo as generateVideo, generateImage } from "ai";
import { heldFor, hold } from "./budget.ts";
import { catalog, priceFor, typeFor } from "./catalog.ts";
import { apiError, ECHO_MODEL, settleTokens, upstream, type Caller } from "./gateway.ts";
import { getBalance } from "./ledger.ts";
import { creditsFor, creditsForUsd, estimateTokens, type ModelPrice, videoRate } from "./pricing.ts";

// Images and video, made through Vercel AI Gateway's own SDK (the only way it
// serves video) and billed like everything else: the worst case is held while
// the call runs, the real usage is charged when it ends.

// GPT Image bills by token. Until the provider says otherwise, assume its
// largest picture, so the hold can cover it.
const ASSUMED_IMAGE_OUTPUT_TOKENS = 4160;

type Ready = { price: ModelPrice; gateway: ReturnType<typeof createGateway> } | Response;

// Everything both kinds of call check first: a provider that can do it, a
// priced model of the right kind, and a balance above zero.
async function prepare(caller: Caller, model: string, kind: "image" | "video", error = apiError): Promise<Ready> {
  if (getBalance(caller.address) <= 0) {
    return error(402, "You are out of credits. Earn more on your Kredit dashboard.", "insufficient_credits");
  }
  const { baseUrl, apiKey } = upstream();
  if (!apiKey) {
    return error(503, `No AI provider is configured on this server yet. Use "${ECHO_MODEL}" on /v1/chat/completions to test your key.`, "provider_not_configured");
  }
  if (!baseUrl.includes("ai-gateway.vercel.sh")) {
    return error(503, `${kind === "image" ? "Images" : "Video"} need Vercel AI Gateway as the provider.`, "provider_not_configured");
  }
  const type = await typeFor(model);
  if (type && type !== kind) return error(400, `"${model}" is not ${kind === "image" ? "an image" : "a video"} model.`, "model_not_supported");
  const price = await priceFor(model);
  if (!price) {
    if (!(await catalog()).live) {
      return error(502, "The AI provider's model list could not be read. Try again in a moment.", "provider_unreachable");
    }
    return error(404, `Unknown model "${model}". GET /v1/models lists the ones you can use.`, "model_not_found");
  }
  // The SDK knows the gateway's own base (a newer API version than the
  // OpenAI-compatible /v1 the rest of Kredit talks to); only the key is ours.
  return { price, gateway: createGateway({ apiKey }) };
}

const refuse = (needed: number, held: number, error = apiError) =>
  error(
    402,
    `This call needs about ${needed} credits, more than your balance covers${held > 0 ? " while your other calls are still running" : ""}. Pick a cheaper model or earn more on your Kredit dashboard.`,
    "insufficient_credits",
  );

// A provider failure, in the caller's shape, with nothing charged.
const providerFailed = (caught: unknown, error = apiError) => {
  const message = caught instanceof Error ? caught.message : String(caught);
  return error(502, `The AI provider could not make it: ${message.slice(0, 300)}. You were not charged.`, "provider_error");
};

export type ImageRequest = { model: string; prompt: string; n?: number; size?: string; aspectRatio?: string };

export async function makeImages(caller: Caller, request: ImageRequest, signal?: AbortSignal, error = apiError) {
  const ready = await prepare(caller, request.model, "image", error);
  if (ready instanceof Response) return ready;
  const { price, gateway } = ready;
  const n = Math.min(Math.max(Math.trunc(request.n ?? 1), 1), 4);

  // Worst case up front: per image where the model is sold that way, otherwise by tokens.
  const promptTokens = estimateTokens(request.prompt);
  const worstCase =
    price.perImage !== undefined
      ? creditsForUsd(n * price.perImage)
      : creditsFor(price, { inputTokens: promptTokens, outputTokens: n * ASSUMED_IMAGE_OUTPUT_TOKENS });
  const held = heldFor(caller.address);
  if (getBalance(caller.address) - held < worstCase) return refuse(worstCase, held, error);
  const release = hold(caller.address, worstCase);

  try {
    const result = await generateImage({
      model: gateway.imageModel(request.model),
      prompt: request.prompt,
      n,
      ...(request.size && /^\d+x\d+$/.test(request.size) && { size: request.size as `${number}x${number}` }),
      ...(request.aspectRatio && /^\d+:\d+$/.test(request.aspectRatio) && { aspectRatio: request.aspectRatio as `${number}:${number}` }),
      abortSignal: signal,
    });
    const images = result.images.map((image) => ({ base64: image.base64, mediaType: image.mediaType }));
    const usd =
      price.perImage !== undefined
        ? images.length * price.perImage
        : undefined;
    const tokens = {
      inputTokens: result.usage.inputTokens ?? promptTokens,
      outputTokens: result.usage.outputTokens ?? images.length * ASSUMED_IMAGE_OUTPUT_TOKENS,
    };
    const charge = settleTokens(caller, request.model, price, tokens, usd);
    return { images, charge, usage: tokens };
  } catch (caught) {
    if (signal?.aborted) return error(499, "The request was cancelled.", "cancelled");
    return providerFailed(caught, error);
  } finally {
    release();
  }
}

// "720p" and "16:9" -> "1280x720", the form the SDK takes. A WxH value passes through.
function pixels(resolution: string, aspectRatio: string): `${number}x${number}` {
  if (/^\d+x\d+$/.test(resolution)) return resolution as `${number}x${number}`;
  const short = resolution === "4k" ? 2160 : Number(/^(\d+)p$/.exec(resolution)?.[1] ?? 720);
  const [w, h] = aspectRatio.split(":").map(Number);
  const long = Math.round((short * Math.max(w, h)) / Math.min(w, h) / 2) * 2;
  return (w >= h ? `${long}x${short}` : `${short}x${long}`) as `${number}x${number}`;
}

export type VideoRequest = {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  generateAudio?: boolean;
};

// Video is priced by the second before it is made, so the charge is known up
// front; what is held is what is charged.
export async function makeVideo(caller: Caller, request: VideoRequest, signal?: AbortSignal, error = apiError) {
  const ready = await prepare(caller, request.model, "video", error);
  if (ready instanceof Response) return ready;
  const { price, gateway } = ready;

  const duration = Math.min(Math.max(Math.trunc(request.duration ?? 4), 1), 20);
  const resolution = request.resolution ?? "720p";
  const aspectRatio = request.aspectRatio && /^\d+:\d+$/.test(request.aspectRatio) ? request.aspectRatio : "16:9";
  const generateAudio = request.generateAudio ?? false;
  const rate = videoRate(price, { resolution, audio: generateAudio });
  if (!rate) {
    const offered = [...new Set((price.perSecond ?? []).map((entry) => entry.resolution))].join(", ");
    return error(400, `"${request.model}" does not offer ${resolution}${generateAudio ? " with audio" : ""}. It offers: ${offered}.`, "invalid_body");
  }
  const credits = creditsForUsd(duration * rate.usd);
  const held = heldFor(caller.address);
  if (getBalance(caller.address) - held < credits) return refuse(credits, held, error);
  const release = hold(caller.address, credits);

  try {
    const result = await generateVideo({
      model: gateway.videoModel(request.model),
      prompt: request.prompt,
      duration,
      resolution: pixels(resolution, aspectRatio),
      aspectRatio: aspectRatio as `${number}:${number}`,
      generateAudio,
      abortSignal: signal,
      // One request held open while the gateway renders. Its background-job
      // flow (`poll`) is not served on every gateway yet.
    });
    const videos = result.videos.map((video) => ({ base64: video.base64, mediaType: video.mediaType }));
    const charge = settleTokens(caller, request.model, price, { inputTokens: 0, outputTokens: 0 }, duration * rate.usd);
    return { videos, charge, duration, resolution: rate.resolution, generateAudio };
  } catch (caught) {
    if (signal?.aborted) return error(499, "The request was cancelled.", "cancelled");
    return providerFailed(caught, error);
  } finally {
    release();
  }
}
