import type { ComponentType } from "react";
import { Account, Billing, Embeddings, Errors, Evaluations, Images, Limits, Models, OpenApi, Videos } from "./api-more";
import { Authentication, ChatCompletions, Messages, Responses, Streaming } from "./api-core";
import { Claims, Record, ReferralsPage, Scoring, StreaksPage, TopUps } from "./earn";
import { HowItWorks, QuickstartPage, Rules } from "./getting-started";
import { Integrations } from "./integrations";
import { Dashboard, Distribution, Playground, Security, SignIn } from "./platform";
import { Configuration, Data, Docker, Render, Testing } from "./self-hosting";

// Slug → page. The slugs must match nav.ts; the route 404s for anything else.
export const pages: Record<string, ComponentType> = {
  quickstart: QuickstartPage,
  "how-it-works": HowItWorks,
  rules: Rules,
  "earn/record": Record,
  "earn/scoring": Scoring,
  "earn/streaks": StreaksPage,
  "earn/referrals": ReferralsPage,
  "earn/claims": Claims,
  "earn/top-ups": TopUps,
  "api/authentication": Authentication,
  "api/chat-completions": ChatCompletions,
  "api/responses": Responses,
  "api/messages": Messages,
  "api/embeddings": Embeddings,
  "api/evaluations": Evaluations,
  "api/images": Images,
  "api/videos": Videos,
  "api/models": Models,
  "api/streaming": Streaming,
  "api/billing": Billing,
  "api/errors": Errors,
  "api/limits": Limits,
  "api/account": Account,
  "api/openapi": OpenApi,
  integrations: Integrations,
  "platform/sign-in": SignIn,
  "platform/dashboard": Dashboard,
  "platform/playground": Playground,
  "platform/distribution": Distribution,
  "platform/security": Security,
  "self-hosting/configuration": Configuration,
  "self-hosting/docker": Docker,
  "self-hosting/render": Render,
  "self-hosting/data": Data,
  "self-hosting/testing": Testing,
};
