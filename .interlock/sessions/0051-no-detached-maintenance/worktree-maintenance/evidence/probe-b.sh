set -eu
P=$(cd "$1" && pwd); T=$(cd "$2" && pwd)
S="git -c maintenance.auto=false"
export GIT_AUTHOR_NAME=p GIT_AUTHOR_EMAIL=p@p GIT_COMMITTER_NAME=p GIT_COMMITTER_EMAIL=p@p
$S init -q -b main "$P/repo"; cd "$P/repo"
echo a > a; $S add a; $S -c commit.gpgsign=false commit -qm a
$S worktree add -q --detach "$P/wt" HEAD
A="$P/repo/.git/worktrees/wt"
FORCE=(-c maintenance.geometric-repack.auto=-1 -c maintenance.reflog-expire.auto=-1 -c maintenance.commit-graph.auto=-1 -c maintenance.worktree-prune.auto=-1 -c maintenance.rerere-gc.auto=-1 -c rerere.enabled=true)
cd "$P/wt"
true
echo "== before: admin logs/HEAD inode $(stat -f %i "$A/logs/HEAD"); packs $(ls "$P/repo/.git/objects/pack" | wc -l)"
echo b > b; $S add b
export PROBE_MARK="probe-b-$$"
GIT_TRACE2_EVENT="$T/b-commit.trace" git "${FORCE[@]}" -c commit.gpgsign=false commit -qm b
echo "== commit returned; admin logs/HEAD inode $(stat -f %i "$A/logs/HEAD")"
echo "== descendants carrying marker:"; ps eww -axo pid,ppid,command | grep "PROBE_MARK=$PROBE_MARK" | grep -v grep | awk '{print $1, $2, $3, $4, $5, $6, $7, $8}' || true
