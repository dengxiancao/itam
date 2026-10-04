#!/usr/bin/env bash
#
# 本地 → GitHub 单向自动同步。
#
# 谁调用它：
#   · 计划任务 ITAM-Repo-Sync，每 5 分钟一次（兜底，忘了提交也不会丢）
#   · .githooks/post-commit，你主动提交时立刻推（快）
# 两者撞车时靠文件锁让后来者直接退出，不会并发跑两个 git。
#
# 为什么是 bash 而不是 node：
#   node 在本环境无法创建子进程（沙箱对 spawnSync/execSync 回 EBUSY），git 操作全交给 bash；
#   敏感信息扫描交给 scripts/repo-sync-gate.mjs（纯文件 I/O，零子进程）。
#
# 两道保险丝（任何一道触发都撤销暂存、不提交、不推送）：
#   1. 不该入库的路径混进暂存区（数据库 / 现场照片 / 密钥 / 内部运维资料）
#   2. 安全闸门发现真实部署信息或凭据
#
# 用法：
#   scripts/repo-sync.sh              # 正常同步
#   scripts/repo-sync.sh --dry        # 只跑到「提交前」，不 commit / 不 push
#   scripts/repo-sync.sh --status     # 打印上次结果后退出
#   第一个非选项参数可显式指定仓库根目录（计划任务用得上）
#
set -u

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT=""
DRY=0
for a in "$@"; do
  case "$a" in
    --dry) DRY=1 ;;
    --status) ;;
    --*) ;;
    *) ROOT="$a" ;;
  esac
done
[ -n "$ROOT" ] || ROOT="$(cd "$SELF_DIR/.." && pwd)"
cd "$ROOT" 2>/dev/null || { echo "进不了仓库目录: $ROOT" >&2; exit 1; }

LOG="$ROOT/logs/repo-sync.log"
STATUS="$ROOT/logs/repo-sync-status.txt"
LOCK="$ROOT/logs/repo-sync.lock"
TMPLIST="$ROOT/logs/.repo-sync-staged.txt"
REMOTE_BRANCH="main"
LOCK_STALE=600          # 锁超过 10 分钟视为陈旧（上次跑挂了），允许接管
PUSH_TIMEOUT=150

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }
setstatus() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" > "$STATUS"; }

if [ "${1:-}" = "--status" ]; then
  [ -f "$STATUS" ] && cat "$STATUS" || echo "(还没有运行记录)"
  exit 0
fi

mkdir -p "$ROOT/logs"

# ---------- 单实例 ----------
if [ -f "$LOCK" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$age" -lt "$LOCK_STALE" ]; then
    log "另一实例在跑（锁建立于 ${age}s 前），本次跳过"
    exit 0
  fi
  log "锁已陈旧（${age}s），接管"
fi
echo "$$" > "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM

# ---------- 有没有活干 ----------
# 两种活：① 有未提交改动 → 提交后推；② 没有改动但本地领先远程 → 只推。
# 第二种不能省：用户手动 git commit 过、或钩子某次没跑成功时，提交会永远躺在本地。
DIRTY="$(git status --porcelain)"
if git rev-parse --verify --quiet "origin/$REMOTE_BRANCH" >/dev/null; then
  AHEAD=$(git rev-list --count "origin/$REMOTE_BRANCH..HEAD" 2>/dev/null || echo 0)
else
  AHEAD=1        # 还没有远程跟踪引用（首次推送），当成"需要推"
fi

if [ -z "$DIRTY" ] && [ "$AHEAD" -eq 0 ]; then
  setstatus "结果：无改动，与远程一致，跳过"
  exit 0
fi

COUNT=0
if [ -n "$DIRTY" ]; then
  git add -A
  git diff --cached --name-only > "$TMPLIST"
  COUNT=$(grep -c . "$TMPLIST" 2>/dev/null || echo 0)
fi

if [ "$COUNT" -gt 0 ]; then
  # ---------- 保险丝 1：不该入库的路径绝不能被 stage ----------
  # .gitignore 已经挡一层，这是第二层 —— 万一以后有人 git add -f 或改了 ignore 规则，
  # 也不能让真实数据库 / 现场照片 / 密钥 / 内部运维资料进公开仓库。
  FORBIDDEN_RE='^(data/|certs/|logs/|__patch/|_patch/|\.workbuddy/|_backup-|_redesign-preview|key\.txt|docs/网络与静态IP\.md|scripts/net-static\.ps1|scripts/net-dhcp\.ps1)'
  FORBIDDEN_EXT_RE='\.(pem|log|bak|bak[0-9]+|bak-[^/]*|orig|old)$'
  BAD=$(grep -E "$FORBIDDEN_RE|$FORBIDDEN_EXT_RE" "$TMPLIST" || true)
  if [ -n "$BAD" ]; then
    log "✘ 保险丝 1 触发：暂存区出现不该入库的路径，已撤销暂存"
    printf '%s\n' "$BAD" | sed 's/^/    /' >> "$LOG"
    git reset -q
    setstatus "结果：被保险丝 1 拦下（不该入库的路径），详见 logs/repo-sync.log"
    exit 1
  fi

  # ---------- 保险丝 2：安全闸门 ----------
  if ! node scripts/repo-sync-gate.mjs --list="$TMPLIST" >> "$LOG" 2>&1; then
    log "✘ 保险丝 2 触发：安全闸门拦下敏感信息，已撤销暂存（明细见上方闸门输出）"
    git reset -q
    setstatus "结果：被安全闸门拦下（发现敏感信息），详见 logs/repo-sync.log"
    exit 1
  fi
fi

# ---------- 提交（只在真有新改动时）----------
MSG="chore(sync): 自动同步 $(date '+%Y-%m-%d %H:%M')（${COUNT} 个文件）"
if [ "$COUNT" -gt 0 ]; then
  if [ "$DRY" = "1" ]; then
    log "[dry] 闸门通过，${COUNT} 个文件，本应提交并推送："
    sed 's/^/    /' "$TMPLIST" >> "$LOG"
    setstatus "结果：[dry-run] 闸门通过，未提交未推送"
    exit 0
  fi
  export ITAM_REPO_SYNC=1        # 让 post-commit 钩子知道「这是同步脚本自己在提交」，避免递归
  if ! git commit -q -m "$MSG" -m "$(sed 's/^/- /' "$TMPLIST" | head -40)" >> "$LOG" 2>&1; then
    log "✘ 提交失败，已撤销暂存"
    git reset -q
    setstatus "结果：提交失败，详见 logs/repo-sync.log"
    exit 1
  fi
  SHA=$(git rev-parse --short HEAD)
  log "已提交 $SHA：$MSG"
else
  [ "$DRY" = "1" ] && { setstatus "结果：[dry-run] 无新改动，但有 $AHEAD 个提交待推送"; exit 0; }
  SHA=$(git rev-parse --short HEAD)
  log "无新改动，但有 $AHEAD 个本地提交待推送（HEAD=$SHA）"
fi

# ---------- 推送 ----------
# 先 fetch：既让「远程有没有新提交」的判断准确，也避免拿着过期 ref 白推一次
timeout 60 git fetch --quiet origin "$REMOTE_BRANCH" >> "$LOG" 2>&1 || log "（fetch 失败，用现有 ref 继续）"

PUSHOUT=""
if ! PUSHOUT=$(timeout "$PUSH_TIMEOUT" git push origin "HEAD:$REMOTE_BRANCH" 2>&1); then
  log "✘ 推送失败：$PUSHOUT"
  case "$PUSHOUT" in
    *non-fast-forward*|*rejected*|*fetch\ first*|*behind*)
      log "    原因：远程有新提交，历史分叉。**不要强推**，先人工对齐："
      log "    git fetch && git log --oneline --graph origin/$REMOTE_BRANCH...HEAD"
      setstatus "结果：推送被拒（远程有新提交），需要人工对齐历史"
      ;;
    *)
      log "    原因：见上方 git 输出（网络不通 / 公钥未授权 / 超时）。本地提交已保留，下次会重试。"
      setstatus "结果：推送失败（本地已提交，下次重试），详见 logs/repo-sync.log"
      ;;
  esac
  exit 1
fi

log "✔ 已推送 → origin/$REMOTE_BRANCH（HEAD=$SHA）"
if [ "$COUNT" -gt 0 ]; then
  setstatus "结果：已推送 ${COUNT} 个文件（$SHA）"
else
  setstatus "结果：已推送 $AHEAD 个已有提交（$SHA）"
fi
exit 0
