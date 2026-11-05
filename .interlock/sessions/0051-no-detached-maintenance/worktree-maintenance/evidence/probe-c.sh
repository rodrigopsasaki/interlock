set -u
P=$(cd "$1" && pwd)
S="git -c maintenance.auto=false -c commit.gpgsign=false"
export GIT_AUTHOR_NAME=p GIT_AUTHOR_EMAIL=p@p GIT_COMMITTER_NAME=p GIT_COMMITTER_EMAIL=p@p
$S init -q -b main "$P/repo"; cd "$P/repo"
echo a > a; $S add a; $S commit -qm a
$S worktree add -q --detach "$P/A" HEAD; $S worktree add -q --detach "$P/B" HEAD
for i in $(seq 1 400); do echo "o$i" | $S hash-object -w --stdin >/dev/null; done
CA="$P/repo/.git/worktrees/A"; CB="$P/repo/.git/worktrees/B"
lock() { chmod -R a-w "$@"; }; unlock() { chmod -R u+w "$@"; }
cd "$P/A"
lock "$P/A" "$CA" "$P/B" "$CB"
echo "== C1 detached task set from A, both worktrees and admin dirs read-only"
git maintenance run --no-detach --quiet --task=geometric-repack --task=commit-graph --task=worktree-prune --task=rerere-gc; echo "exit $?"
echo "packs: $(ls $P/repo/.git/objects/pack | tr '\n' ' ')"; ls $P/repo/.git/objects/info
echo "== C2 reflog-expire from A, both locked"
git maintenance run --no-detach --quiet --task=reflog-expire; echo "exit $?"
unlock "$CA" "$P/A"
echo "== C2b reflog-expire from A, only B locked"
git maintenance run --no-detach --task=reflog-expire; echo "exit $?"
lock "$P/A" "$CA"
echo "== C3 rerere-gc with rerere.enabled=true from A, A locked"
git -c rerere.enabled=true maintenance run --no-detach --task=rerere-gc; echo "exit $?"
unlock "$P/A" "$CA" "$P/B" "$CB"
