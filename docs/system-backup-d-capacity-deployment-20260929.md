# D：容量采集器部署接线与只读现场预检

本次交付对应“D 第二项”。只补部署组合、容量采集边界和只读检查；未登录 `root@10.130.14.23`，未 apply、创建账号、授权、改 MySQL 数据卷权限、重启 MySQL、完成 MFA 或激活配置。目标 namespace 仍为 `clawmanager-zhanghui08-system`，交互 SSH 由管理员本人完成。A/B/C adapter、registry、typed ref 和审核保持原归属。

## 交付入口

| 文件 | 用途 |
| --- | --- |
| `deployments/k8s/system-backup-capacity.template.json` | 公开输入模板；现场 UID、节点、镜像、凭据引用留空，空模板不能生成清单 |
| `scripts/system-backup-d-capacity-deployment.mjs` | 离线生成 ServiceAccount、immutable source ConfigMap、初始 replicas=0 的 collector Deployment |
| `scripts/system-backup-d-runtime-preflight.mjs` | 只读现场预检；JSON 输出，0=本次 D 范围通过，2=阻断，1=输入错误 |
| `scripts/system-backup-d-capacity-validation.ps1` | 无安装、禁止下载的本地测试与 Linux collector 编译；finally 清理自有产物 |

从仓库根目录运行，所需 Node、kubectl 必须已安装，不由脚本安装：

```sh
node scripts/system-backup-d-capacity-deployment.mjs --input capacity.public.json
node scripts/system-backup-d-capacity-deployment.mjs --input capacity.public.json --output capacity.manifest.json
node scripts/system-backup-d-runtime-preflight.mjs --input capacity.public.json
node scripts/system-backup-d-runtime-preflight.mjs --input capacity.public.json --fresh-reference fresh-reference.json --collector-pod ACTUAL_COLLECTOR_POD
```

生成清单使用独占写入，不覆盖既有文件。以上没有 apply 命令。第三条可在 collector 部署前使用，报告缺少 schema 基线和运行中 collector 的阻断是预期结果，不代表可以跳过。第四条在相同目标完成实际部署后使用。JSON 报告不包含 DSN、Secret 数据、原始 driver 错误或表列 default 字面量。

## 部署与共享存储方案

采用独立 collector Pod，固定到当前 MySQL Pod 所在节点；MySQL 不需要增加 sidecar 或修改 Pod 模板。输入绑定 namespace UID、MySQL Pod 名/UID、container、节点、数据库 UUID/库名及 `@@datadir`。预检前后检查 Pod UID、container ID、restartCount；MySQL 迁移节点或换 Pod 后必须重新核对公开输入，不能沿用旧读数。

| 挂载 | collector | HTTP/bootstrap | 要求 |
| --- | --- | --- | --- |
| 现有 MySQL 数据 PVC | PVC 与 volumeMount 均只读，挂载到实际 `@@datadir` | 不挂载 | RWO 同节点或 RWX；本方案拒绝 RWOP、块卷。subPath 必须与现有 MySQL 挂载完全相同；不支持 subPathExpr |
| 独立报告 PVC | 挂载到 `/run/system-backup/capacity`，可写 | 同一个 PVC，只读挂载到相同目录 | 已供给的 RWX 文件系统卷，支持原子 rename 和跨 Pod 及时可见；报告卷不能复用 MySQL PVC/PV |
| source ConfigMap | 只读 | 不挂载 | 内容 SHA-256 固定，包含预期 DB 身份、datadir、账号与完整统计表名单 |
| 专用 collector Secret 的 `dsn` | 只读 | 不挂载 | 必须与 migration、bootstrap、HTTP 的账号和 Secret 分离，不填内联 DSN |

现有 HTTP 生成器输入的 `bindings.capacity_pvc` 填本模板的 `report_pvc`；两个模板的 namespace、镜像、catalog、数据库 UUID/库名必须一致。HTTP/bootstrap 已按只读方式消费 `report.json`。这一步不要求补造完整 A/B/C 配置；它们未齐备时仅交付 collector 组合和缺项报告。

`collector_uid` 必须是现场已能读取 MySQL `auto.cnf` 的非 root UID。通常取 MySQL 文件实际属主，但不能凭镜像名猜 UID。collector 主组固定 65532，与既有 HTTP/bootstrap 消费进程一致。没有 fsGroup、init chown 或 chmod MySQL 数据目录，避免 kubelet 更改数据卷属主。投影凭据采用 0444，仅投影到独立 collector 容器；Pod 不挂 API token、不开放服务端口、根文件系统只读、drop ALL capabilities。

报告 PVC 由部署/存储操作者提前准备：根目录 group=65532、mode=2770（setgid），且 collector UID 可写。新报告经临时文件 fsync 和同目录 rename 发布，mode=0640；因此实际 MySQL UID 与 HTTP UID 不同也能通过组读取。预检只检查权限，不创建文件或替操作者调整权限。报告 PVC 应专供 collector 写入，禁止其他应用或租户以可写方式挂载；仅用 PVC 名不同无法证明存储后端物理隔离。

预检检查 PVC Bound/Filesystem/accessModes，拒绝相同 PV 和可识别的同一 CSI/NFS/hostPath 后端标识；报告卷只接受 CSI/NFS 类型，不将声称 RWX 的 hostPath 当作跨节点共享存储。CSI/NFS 驱动的后端路径映射、额外租户挂载和缓存时延仍需存储侧确认。若现场只有 RWO/hostPath 报告存储，保持阻断；不自动改 HTTP/Job 调度、申请新存储或重启 MySQL。

## 采集账号与运行约束

source ConfigMap 的 `tables` 从当前 schema registry 自动筛选 `system_backup_*`、`system_restore_*` 与 `audit_logs`，不根据受限账号可见的 information_schema 反推名单。collector 每次在同一 SQL connection 上检查 CURRENT_USER/CURRENT_ROLE 和 SHOW GRANTS：只允许这些表的直接 SELECT（以及 USAGE），拒绝角色、库/全局通配权限、写权限、额外表、授权转授和无法识别的语法。不创建账号、不执行 GRANT，也不读业务记录。

配置中的用户名必须与 DSN 和 CURRENT_USER 一致；DSN 库名、数据库 UUID、datadir、数据卷内 auto.cnf server UUID 均须匹配。统计表可见数量也必须与源名单一致，避免部分权限得到不完整容量统计。source JSON 的字节 SHA 不符时不连接数据库。原有无配置的 `--collect-capacity` 用法现在会拒绝，需要本轮新镜像。

collector 每秒写真实物理空闲空间、表分配字节和数据库 UTC 时间。错误退出后由 Deployment 重启；旧报告超过 5 秒即不再满足消费者准入，不能手工刷新时间或写健康样例。`--check-capacity-source` 只执行 SELECT/SHOW、读取 auto.cnf/statfs，不写报告或数据库；作为 collector readiness 和预检中的身份/权限/挂载检查入口。

## 只读数据库与 schema 预检

在操作者指定且 UID 匹配的现有 MySQL Pod/container 内，使用其已有 `MYSQL_USER`/`MYSQL_PASSWORD` 环境调用 mysql CLI。密码留在 Pod 内，不出现在 kubectl argv 或报告。此身份是观察身份，不能用它的权限通过替代 collector 自身的专用账号校验。环境或权限不足时明确阻断，不降级为 root、不读取其它 Secret、不安装 mysql client。

预检包含：

1. namespace/Pod/container/节点与数据库身份绑定；不符时立即停止依赖这些身份的检查。
2. migration ledger **文件名集合**与当前目录完整比较，缺项、额外历史项、重复项均阻断。文件名相符不证明 SQL 原文或现存表正确。
3. 复用现有 `compareDSchemaRecords`，只比较 D 所属表的 columns、indexes、foreign keys 及 MySQL server version；输出差异路径，不输出定义或默认值。它不是 A/B/C 表审核，也不是所有引擎选项/触发器的完整 schema 审计。
4. 已部署 collector 的镜像/命令/source pin、卷投影、节点、UID/GID 与安全上下文；之后才 exec source 检查、只读文件权限检查及新鲜度检查。报告年龄使用目标数据库时间计算，不信任 SSH 主机时钟。

`fresh-reference.json` 必须来自**当前 catalog 的可信干净 migration replay**，格式如下。`records` 是既有 `schema-hash-capture.mysql.sql` 的完整 TSV 字符串；不能用当前目标库自我比较，也不能把旧 95 表回执改成新 catalog。

```json
{
  "catalog_sha256": "干净重放回执中的64位摘要",
  "records_sha256": "records的UTF-8字节摘要",
  "records": "完整metadata/table/column/index/foreign_key等TSV记录"
}
```

包装已有可信 TSV 的命令（不连接数据库）：

```sh
# FRESH_CATALOG_SHA256 取重放回执；不要用当前源码摘要覆盖旧回执。
FRESH_TSV=/approved/fresh.tsv FRESH_CATALOG_SHA256=ACTUAL_RECEIPT_DIGEST node --input-type=module <<'NODE'
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const records=readFileSync(process.env.FRESH_TSV,'utf8');
const result={catalog_sha256:process.env.FRESH_CATALOG_SHA256,records_sha256:createHash('sha256').update(records).digest('hex'),records};
writeFileSync('fresh-reference.json',JSON.stringify(result),{flag:'wx',mode:0o600});
NODE
```

工具验证字节摘要和 catalog 一致，不能从输入本身认证重放回执的来源，报告明确标注 operator_supplied，正式上线仍应核查回执。原始 schema 可能含配置默认值，基线文件按敏感运维材料保管；工具只在内存读取，不产生远端/本地临时捕获文件。

## 现场顺序与回退

1. 管理员 SSH 到既定目标，核对 live UID、node、datadir、UID、PVC 和既有迁移回执，填写公开输入；以新镜像内 `system-backup-migrate --catalog-only` 核对 image catalog。生成器的 source catalog 校验不代表实际镜像已核实。
2. 只读预检，处理明确阻断项。需要新建存储或账号时按现场职责准备，D 脚本不代办 A/B/C 材料或授权。
3. 具备实际新镜像和挂载资源后，review 并部署生成清单，再启动一个 collector 副本。此文档没有自动 apply/scale，当前交付停在本地脚本阶段。
4. 使用真实 collector Pod 和可信 fresh-reference 运行完整预检。后续 HTTP/bootstrap 消费同一 report PVC，并由真实容量准入验证各自读取路径；单次 D 预检不替代跨节点持续新鲜度验收。
5. 停用时将 collector 停止；保留共享 PVC、凭据和数据库。报告自然过期后消费者拒绝容量准入。只有身份/路径/权限兼容时才能回退旧镜像，旧无 source pin 的采集方式不能作为等价验收。

## 本地验证范围

`system-backup-d-capacity-validation.ps1` 使用现有依赖，GOPROXY/GOSUMDB=off、GOTOOLCHAIN=local、模块只读；Node 测试使用内存 kubectl/MySQL 模拟。Go 测试包含实际文件原子替换/失败清理、SHA 校验、精确直接权限与拒绝案例；Linux registration/collector 交叉编译。本次不把模拟或编译结果表述为真实 Kubernetes、MySQL/NFS、Linux chmod 或跨节点共享验收。Windows 下不声称验证 Unix mode 位。

结果见 `docs/evidence/system-backup-d-capacity-local-20260929.json`；自有 `.tmp-d-capacity-*` 测试缓存和二进制由 finally 校验绝对路径后清理。
