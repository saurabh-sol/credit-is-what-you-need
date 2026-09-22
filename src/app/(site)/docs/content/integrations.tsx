import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { snippets } from "@/lib/snippets";
import { BaseUrl, OriginCode, OriginTabs } from "../quickstart";
import { Callout, Doc, H2, Table } from "../ui";

// One page for every place a Kredit key drops in. Snippets come from
// src/lib/snippets.ts, the same ones the landing page runs.

export function Integrations() {
  return (
    <Doc slug="integrations" lede="A Kredit key works anywhere that speaks the OpenAI or Anthropic API. Change the base URL, paste the key, keep everything else.">
      <BaseUrl />

      <H2>OpenAI SDKs</H2>
      <p>
        Pass <code>base_url</code> (Python) or <code>baseURL</code> (Node) and your key as <code>api_key</code>. Chat
        Completions, Responses, embeddings and images all go through.
      </p>
      <OriginTabs
        tabs={[
          { name: "Python", code: snippets.Python({ origin: "{origin}", model: "openai/gpt-4o", message: "Explain a receipt in one line." }) },
          { name: "Node", code: snippets.Node({ origin: "{origin}", model: "openai/gpt-4o", message: "Explain a receipt in one line." }) },
        ]}
      />

      <H2>Anthropic SDKs</H2>
      <p>
        Same idea. The SDK sends the key in <code>x-api-key</code>, which Kredit accepts, and errors come back in
        Anthropic&apos;s shape.
      </p>
      <OriginCode title="Node" code={snippets.Anthropic({ origin: "{origin}" })} />

      <H2>Command line</H2>
      <p>
        The Kredit CLI talks to any model, shows your balance and reads your bill from a terminal. It installs straight
        from this server, so there is nothing to sign up for. Node 22 or newer.
      </p>
      <OriginCode
        title="Shell"
        code={`npm install -g {origin}/cli/kredit-cli.tgz
kredit login                                  # paste a key from the dashboard
kredit chat "explain gas fees in one line"
kredit chat -m anthropic/claude-haiku-4.5     # a conversation, turn by turn
cat notes.md | kredit chat -s "summarize"     # pipe text in
kredit models claude                          # find a model and its price
kredit usage --from 2026-09-01                # what this month cost`}
      />
      <p>
        Every command takes <code>--json</code> for scripts; the cost of each call goes to stderr, so stdout stays clean
        for pipes. <code>KREDIT_API_KEY</code> and <code>KREDIT_BASE_URL</code> in the environment override the saved
        settings.
      </p>

      <H2>Claude Code</H2>
      <p>
        Point Claude Code at this host&apos;s <code>/v1</code> with two environment variables, and pick a model id from{" "}
        <Link href="/docs/api/models">the model list</Link>.
      </p>
      <OriginCode title="Shell" code={snippets["Claude Code"]({ origin: "{origin}" })} />

      <H2>Vercel AI SDK</H2>
      <OriginTabs
        tabs={[
          { name: "OpenAI-compatible", code: snippets["AI SDK"]({ origin: "{origin}", model: "openai/gpt-4o", message: "hi" }) },
          {
            name: "Anthropic provider",
            code: `import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

const kredit = createAnthropic({ baseURL: "{origin}/v1", apiKey: process.env.KREDIT_KEY });
const { text } = await generateText({ model: kredit("anthropic/claude-sonnet-4.5"), prompt: "hi" });`,
          },
        ]}
      />

      <H2>Editors and desktop tools</H2>
      <Table
        head={["Tool", "Where to put it"]}
        rows={[
          ["Cursor", "Settings → Models → OpenAI API key: paste the key, turn on “Override OpenAI base URL” and enter this host's /v1. Add model ids by name."],
          ["Continue", "In config, an openai provider with apiBase set to this host's /v1 and apiKey set to the key."],
          ["Open WebUI", "Connections → OpenAI API: base URL this host's /v1, key the Kredit key."],
          ["Postman", "Import /v1/openapi.json, set the bearer token to the key."],
        ]}
        min="30rem"
      />

      <H2>Frameworks</H2>
      <OriginTabs
        tabs={[
          {
            name: "LangChain",
            code: `from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="openai/gpt-4o", openai_api_base="{origin}/v1", openai_api_key="kred_sk_…")
print(llm.invoke("hi").content)`,
          },
          {
            name: "LiteLLM",
            code: `import litellm

reply = litellm.completion(
    model="openai/openai/gpt-4o",          # "openai/" tells LiteLLM the dialect; the rest is the Kredit id
    api_base="{origin}/v1",
    api_key="kred_sk_…",
    messages=[{"role": "user", "content": "hi"}],
)`,
          },
          {
            name: "curl",
            code: snippets.curl({ origin: "{origin}", model: "openai/gpt-4o", message: "hi" }),
          },
        ]}
      />

      <H2>Reading the bill in code</H2>
      <p>Most SDKs expose raw response headers. Two lines keep your app aware of its balance:</p>
      <CodeBlock
        title="Node"
        code={`const { data, response } = await client.chat.completions.create({ /* … */ }).withResponse();
console.log(response.headers.get("x-kredit-credits-charged"), response.headers.get("x-kredit-balance"));`}
      />
      <Callout kind="tip">
        <p>
          Give each tool its own key. When a laptop is lost or a key leaks, revoke that one on the dashboard and
          nothing else stops working.
        </p>
      </Callout>
    </Doc>
  );
}
