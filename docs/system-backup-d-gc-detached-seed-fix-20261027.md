# GC standalone 失败修复与 r5 重试入口

2026-10-27。15:35 的 `5c1c51457b1f42aa94223469a5f2ae92` 尝试在本地 standalone gate 失败，远端未启动。FullCollect seed 经普通 model loader 读取 checkout 的 canonical vectors；Profile／Lifecycle seed 通过。原失败日志、receiver 的零 phase 拒绝和 source owner 清理结果保留，不将该轮改记成功。

只修改 tagged `download_gc_full_collect_mysql_test.go`：新增私有 capsule model factory，并将 seed 和实际冷组 fixture 两个调用都切换到已验证 embedded／remote capsule 的 `EffectiveConfig`。原普通 loader 未改，原 Ref、owner policy、预留窗口、authority 构造、真实 model Admit／Finish、sealed group 和七条 SQL 断言保持。没有补 docs、Skip 测试或放宽 receiver。

Cold 文件从 `e9806c48...` / 23,173 变为 `4efec42b77082c31ea9d73f4274a9e2f06afa191d87c0a03d875a27001994505` / 25,657；逆向移除新增 fixture 与调用变更能精确恢复旧摘要。[源码证明](evidence/d-gc-full-collect-capsule-fix-source-ready-20261027-r1.json)由 A 独立复核。

## 已实际通过的回归

A 于 16:31 使用人类本轮已编译的同一 Windows evidence exe，分别从源码目录和真正 `empty/a/b` 目录执行 GC 三根 seed，实际为 3＋3 个 root 全部通过、无跳过。没有再次编译 Go，没有向空 cwd 或其 `../../../docs` 放入文件。冻结源码前后逐 tuple 核对通过，独立复制的 binary／临时目录已清理。D-GC 已读回核对日志 hash 和目录缺席。

- [准确 native 回执](evidence/a-gc-three-seeds-same-binary-native-20261027-r1.json)：SHA `7c455314da9f5cefe880c04f075cb4c80631731643e2ce100a3c0eabd0cb97cb`。
- 同一 binary SHA：`fee29569c5276341f0368c02beecc9b0b7aaffe73431a61fb6614d2d0e9e2e4a`。
- [源码目录日志](evidence/a-gc-three-seeds-same-binary-native-20261027-r1.source.log)与[真正空目录日志](evidence/a-gc-three-seeds-same-binary-native-20261027-r1.empty.log)各自记录三个实际 root。

这些是本地 seed 回归，不能记为 33／7／15 个实际 MySQL 场景通过。当前同来源 Linux 编译与 Owners SQL 仍由人类本轮接收；本聊天不重复 Go 或远测。

## 当前准确源码文件

D 候选为 r5，原始 1,720 / `dc79d81f74d6d6c293372f6c5404b2a673c3f469da1c4d14d4adc763199efa8e`，operator 1,721 / `f3ed3894471df5b01166a68f6e20ca7e77e4cabfcdb6a9c03a55fd0886aabf62`。正式 `ReviewedSourcePath` 必须是 [A r4 回执](evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r4.json)，SHA `ef981639951500b0cc37ace05f8168d5275b3c323d509922ec636e8874060f91`。旧 A r3／D r4 不适用于修复后的源码。

当前 A 文件是源码批准，创建时记录了 native 待验；16:31 的实际补测另附上述 native 回执，不回写已固定 hash 的 A 文件。任何进一步的 source／harness 变更都须新候选和新 A 复审，不能借用旧参数。

## 人类重试命令

仅在本轮 Owners 已终态、清理完成且 Root 确认释放唯一 Go 窗口后执行。下面前置检查不通过时停止；不删除他人目录或进程。若 Root 联合增量已落地导致 source review 重放失败，先取得新版本，不能跳过检查。

```powershell
$ErrorActionPreference = 'Stop'
$priorOwner = Join-Path $PWD '.tmp-d-index-cache-d9cec1f9ff704989b41ea30e453af991'
if (Test-Path -LiteralPath $priorOwner) { throw '当前 Owners 源目录尚未清理，暂不并行启动 GC' }
if (@(Get-Process -Name go -ErrorAction SilentlyContinue).Count) { throw '仍有 Go 窗口占用，请先完成协调' }

node .\docs\evidence\a-gc-lifecycle-operator-source-review-20261027-r4.mjs --check
if ($LASTEXITCODE -ne 0) { throw '当前源已变化，需新 candidate 和 A review，不能复用 r5' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$token = [guid]::NewGuid().ToString('N').Substring(0,8)
$gcReview = Join-Path $PWD 'docs/evidence/a-gc-lifecycle-operator-source-reviewed-20261027-r4.json'
$gcSource = Join-Path $PWD "docs/evidence/d-gc-full-lifecycle-retry-$stamp-$token-source.json"
$gcLog = Join-Path $PWD "docs/evidence/d-gc-full-lifecycle-retry-$stamp-$token.txt"
Start-Transcript -LiteralPath $gcLog
try {
    & .\docs\evidence\d-gc-full-lifecycle-operator-20261026.ps1 `
        -ReviewedSourcePath $gcReview `
        -SourceManifestPath $gcSource `
        -BuildParallelism 1 `
        -Remote
} finally {
    Stop-Transcript | Out-Null
}
```

本聊天未执行上述命令。正常 operator 仍保留自己的三根 source seed、真正 detached seed、Linux 编译、准确冻结后检／清理和 UID／hash gate；本修复没有绕过它们。实际 GC SQL、真实域 authority、真实物理容量与生产接收仍须各自准确证据。
