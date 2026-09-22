# Automation

Two GitHub Actions workflows live in `.github/workflows`.

## Checks (`ci.yml`)

Runs on every pull request and on every push to `premium-polish` or `main`:
install, lint, typecheck, unit tests, production build. It needs no secrets.

## Keep pull requests mergeable (`sync-pull-requests.yml`)

Most conflicts come from a branch falling behind. So each time `premium-polish` (or
`main`) moves, this workflow merges it into every open pull request aimed at it, using
`.github/scripts/sync-pr.sh`:

| What happens when the base is merged in | What the workflow does |
| --- | --- |
| No conflicts | Runs lint, typecheck and tests on the merged code, then pushes the merge to the pull request branch. |
| The only conflict is `package-lock.json` | Rebuilds the lockfile with npm, runs the checks, pushes. |
| Any other file conflicts | Leaves the branch untouched and comments on the pull request with the files and the commands to fix them. |
| It merges, but the checks fail | Pushes nothing and says so on the pull request. |

It never picks one side of a real conflict. When two people changed the same lines, or
one side moved a file the other edited, only a person knows which change should win;
guessing would silently throw work away.

Good to know:

- You can also run it by hand: Actions → "Keep pull requests mergeable" → Run workflow.
- It only touches branches in this repository, never branches from forks.
- A merge pushed by the workflow does not start the Checks workflow again (GitHub does
  not let one workflow's push trigger another), which is why it runs the checks itself
  before pushing.
- To try the script without pushing or commenting, run it with `DRY_RUN=1` in a
  throwaway clone: `DRY_RUN=1 bash .github/scripts/sync-pr.sh <pr> <branch> <base>`.
