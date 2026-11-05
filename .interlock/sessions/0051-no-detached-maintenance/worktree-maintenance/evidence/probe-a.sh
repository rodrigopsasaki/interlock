set -eu
P=$(cd "$1" && pwd); T=$(cd "$2" && pwd)
S="git -c maintenance.auto=false"
export GIT_AUTHOR_NAME=p GIT_AUTHOR_EMAIL=p@p GIT_COMMITTER_NAME=p GIT_COMMITTER_EMAIL=p@p
$S init -q -b main "$P/repo"
cd "$P/repo"
echo a > a; $S add a; $S commit -qm a
$S worktree add -q --detach "$P/wt" HEAD
cd "$P/wt"
echo "== paths"; git rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir
echo "== effective maintenance/gc config (all scopes)"; git config --show-scope --show-origin --get-regexp '^(maintenance|gc)\.' || echo "(none set)"
i=0; while [ $i -lt 1500 ]; do echo "obj $i" ; i=$((i+1)); done | while read l; do echo "$l" | $S hash-object -w --stdin >/dev/null; done
echo "== loose in objects/17: $(ls "$P/repo/.git/objects/17" 2>/dev/null | wc -l)"
echo "== is-needed per task (0=needed)"
for t in gc commit-graph prefetch loose-objects incremental-repack geometric-repack pack-refs reflog-expire rerere-gc worktree-prune; do
  set +e; git maintenance is-needed --auto --task=$t 2>/dev/null; r=$?; set -e; echo "$t $r"; done
set +e; git maintenance is-needed --auto; echo "default-set $?"; set -e
echo b > b; $S add b
GIT_TRACE2_EVENT="$T/a-commit.trace" git -c maintenance.autoDetach=false commit -qm b
echo "== children of commit"
grep -o '"event":"child_start"[^}]*"argv":\[[^]]*\]' "$T/a-commit.trace" | sed 's/.*"argv"://'
echo "== all child argv in trace tree"
grep -o '"argv":\[[^]]*\]' "$T/a-commit.trace" | sort | uniq -c
