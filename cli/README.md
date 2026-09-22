# Kredit CLI

Kredit from the terminal: chat with any model, check your balance, read your bill.

```
npm install -g @kredit/cli
kredit login
kredit chat "explain gas fees in one line"
```

Needs Node 22 or newer. Keys come from [usekredit.space/dashboard/keys](https://usekredit.space/dashboard/keys).

## Commands

| Command | What it does |
| --- | --- |
| `kredit login [key]` | Saves a key on this machine (`~/.config/kredit/config.json`, readable by you alone). Without an argument it asks, and never echoes the key. |
| `kredit logout` | Forgets the saved key. |
| `kredit whoami` | Your wallet, key, balance, what is held by running calls, and what you have spent. |
| `kredit chat [prompt]` | Asks a model and streams the reply. Pipe text in, or give no prompt to start a conversation (`/model` switches, `/new` starts over, `/quit` leaves). |
| `kredit models [search]` | The catalog, grouped by maker. An exact id shows one model in full, with the command that takes it. |
| `kredit usage` | What your key spent, by model and call by call. `--from` and `--to` narrow the period. |
| `kredit eval <text>` | Typed questions to TypeSafe AI's Jev: `--yes-no`, `--choice` and `--score`, each repeatable. |
| `kredit embed <text>` | A vector for the text. |
| `kredit image <prompt>` | Makes a picture and saves it here (or in `--out`). |
| `kredit config` | Where the key and server come from. `kredit config set-url` points at another server. |

Every command takes `--json` for scripts. After each paid call the cost and what is left are printed on stderr, so stdout stays clean for pipes.

## Examples

```sh
# A quick question, then a longer conversation with a particular model
kredit chat "what is a nonce?"
kredit chat -m anthropic/claude-haiku-4.5

# Summarize a file
cat notes.md | kredit chat -s "Summarize in five bullets."

# Find a model and see what it costs
kredit models gemini --type chat
kredit models google/gemini-2.5-flash-lite

# Route a support message
kredit eval "I was charged twice and want a refund" \
  --yes-no 'refund: Is the customer asking for money back?' \
  --choice 'team: Which team handles this? [billing=charges and refunds, technical=bugs]' \
  --score 'urgency: How urgent is this? [can wait, today, blocked right now]'

# This month's bill
kredit usage --from 2026-09-01
```

## Settings

`KREDIT_API_KEY` and `KREDIT_BASE_URL` in the environment win over the saved file, so CI and scripts never touch it. `--key` and `--url` win over both, for one run. `NO_COLOR` turns colors off.

## Errors

Failures print the server's message and, where there is one, the thing to do about it:

```
✗ You are out of credits. Earn more on your Kredit dashboard.
  Earn credits at https://usekredit.space/dashboard/earn or buy some at https://usekredit.space/dashboard/credits.
  request 8f1c…
```

The exit code is 1 whenever a command did not do what was asked.
