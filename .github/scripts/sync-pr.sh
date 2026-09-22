#!/usr/bin/env bash
# Brings one pull request branch up to date with its base branch.
#   sync-pr.sh <pr number> <head branch> <base branch>
#
# - merges cleanly            -> run the checks, push the merge
# - conflict in package-lock  -> rebuild the lockfile, run the checks, push
# - conflict anywhere else    -> leave the branch alone and say so on the pull request
#
# Set DRY_RUN=1 to try it in a throwaway clone: nothing is pushed and nothing is
# posted. It switches branches and discards uncommitted changes, so not in your
# working copy.
set -euo pipefail

pr="$1" head="$2" base="$3"
marker="<!-- sync-pull-requests -->"

# Files that are generated, so a conflict in them can be rebuilt rather than read.
is_generated() { [ "$1" = "package-lock.json" ]; }

# One comment per pull request, updated in place. With "quiet", only an
# existing comment is updated, so a branch that never had trouble stays clean.
report() {
  local body quiet="${2:-}" id
  body="$marker"$'\n'"$1"
  if [ -n "${DRY_RUN:-}" ]; then printf '%s\n' "--- comment on #$pr ---" "$1"; return; fi
  id=$(gh api "repos/$GITHUB_REPOSITORY/issues/$pr/comments" --paginate \
    --jq ".[] | select(.body | contains(\"$marker\")) | .id" | tail -n 1)
  if [ -n "$id" ]; then
    gh api --method PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -f body="$body" >/dev/null
  elif [ -z "$quiet" ]; then
    gh pr comment "$pr" --body "$body" >/dev/null
  fi
}

# Whatever the previous pull request left behind (generated types, say) goes first.
git reset --quiet --hard
git fetch --quiet origin "$head" "$base"
git checkout --quiet -B "$head" "origin/$head"

if git merge-base --is-ancestor "origin/$base" HEAD; then
  echo "#$pr already contains $base."
  exit 0
fi

rebuilt=""
if ! git merge --no-edit -m "Merge $base into $head" "origin/$base"; then
  conflicted=$(git diff --name-only --diff-filter=U)
  by_hand=""
  while IFS= read -r file; do
    is_generated "$file" || by_hand+="- \`$file\`"$'\n'
  done <<<"$conflicted"

  if [ -n "$by_hand" ]; then
    git merge --abort
    report "**\`$base\` moved and this branch now conflicts with it.** These files were changed on both sides, so they need a person:

$by_hand
\`\`\`
git fetch origin
git checkout $head
git merge origin/$base
# fix the files above, then
git add -A && git commit && git push
\`\`\`"
    echo "#$pr needs a manual merge."
    exit 0
  fi

  # Only the lockfile: start from the base's copy and let npm reconcile it with
  # the merged package.json.
  git checkout --theirs package-lock.json
  npm install --package-lock-only --ignore-scripts --no-audit --no-fund
  git add package-lock.json
  git commit --quiet --no-edit
  rebuilt=" The \`package-lock.json\` conflict was rebuilt with npm."
fi

# A merge with no conflicts can still be broken (a renamed function, a moved
# file), so nothing is pushed until the merged code passes the checks.
if ! (npm ci --no-audit --no-fund && npm run lint && npx next typegen && npx tsc --noEmit && npm test); then
  report "**\`$base\` merges into this branch without conflicts, but the merged code fails the checks**, so it was not pushed. Merge \`origin/$base\` locally and run \`npm run lint\`, \`npx tsc --noEmit\` and \`npm test\` to see what broke."
  echo "#$pr merges cleanly but fails the checks."
  exit 0
fi

if [ -n "${DRY_RUN:-}" ]; then
  echo "#$pr would be pushed: $(git log -1 --format=%s)"
  exit 0
fi
if ! git push --quiet origin "HEAD:$head"; then
  # The Actions token may not push a merge that brings in workflow changes, for one.
  report "**\`$base\` merges into this branch and the checks pass, but the push was refused.** Run \`git merge origin/$base\` on this branch and push it yourself."
  echo "#$pr could not be pushed."
  exit 0
fi
report "Merged \`$base\` into this branch and the checks pass.$rebuilt" quiet
echo "#$pr is up to date with $base."
