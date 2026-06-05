# SecureVote for MediaWiki

[English README](README.md)

SecureVote 是一个用于 MediaWiki 驱动 wiki 的轻量级私有投票工具。它适用于没有 SecurePoll 扩展权限、但希望实现类似“普通用户无法看到票数和投票人、授权查验员可以后台计票”的社区。

它的基本原理是：用户提交投票时，脚本会向一个专用提交页面发送结构化载荷；隐藏 AbuseFilter 捕获这次编辑尝试，将其写入私有 AbuseLog，并阻止页面保存。因此不会产生公开修订。授权查验员通过后台读取私有 AbuseLog，并按照“同一用户同一投票最后一票有效”的规则计票。

这只是本地近似方案，不是加密级 SecurePoll。服务器维护者、拥有高阶站点配置权限、站点 JS 权限或 AbuseFilter 高权限的人理论上仍可能干预或接触相关数据。

## 文件说明

- `src/MediaWiki_Gadget-SecureVote.js`：主 JavaScript 源码。
- `wiki/Template_SecureVote.wikitext`：投票表单锚点模板。
- `wiki/Project_SecureVote_Admin.wikitext`：查验员后台页面。
- `wiki/Project_SecureVote_Submit.wikitext`：私有提交端点页面。
- `wiki/MediaWiki_SecureVote-config.example.json`：投票配置示例。
- `wiki/MediaWiki_Securevote-vote-received.wikitext`：AbuseFilter 禁止保存提示消息。
- `wiki/AbuseFilter_SecureVote.rules.txt`：AbuseFilter 条件示例。
- `wiki/Gadgets-definition.example.wikitext`：可选 Gadget 定义。
- `wiki/Common.js.example`：推荐的全站加载方式。
- `docs/security-notes.md`：安全模型和限制说明。

## 前期要求

你需要有权限：

- 编辑 `MediaWiki:` 界面页面；
- 创建或编辑项目命名空间页面；
- 创建和管理 AbuseFilter；
- 创建隐藏/私有 AbuseFilter；
- 给少数可信用户授予私有 AbuseLog 查看权限；
- 启用站点 JavaScript，或通过默认 Gadget 加载脚本。

在 Miraheze 托管的 wiki 上，这通常需要行政员/wiki-manager 类权限，以及 AbuseFilter 管理权限；在其他 MediaWiki 安装中，请使用等效的界面管理员和 AbuseFilter 权限。

## 权限设置

建议创建一个专用查验员用户组，例如：

- 组名：`securevote-scrutineer`
- 显示名：`SecureVote scrutineer` 或本地语言名称

给这个组授予读取私有 AbuseFilter 日志所需的权限。不同版本具体名称可能略有不同，通常包括：

- `abusefilter-log`
- `abusefilter-log-detail`
- `abusefilter-log-private`
- `abusefilter-view-private`

也可以给行政员或负责监督投票的人授予同样权限。

不要把私有 AbuseFilter 日志权限授予普通管理员，除非你希望他们也能看到投票人和投票内容。

## 安装步骤

### 1. 创建 JavaScript 页面

创建：

`MediaWiki:Gadget-SecureVote.js`

粘贴：

`src/MediaWiki_Gadget-SecureVote.js`

### 2. 创建投票模板

创建：

`Template:SecureVote`

粘贴：

`wiki/Template_SecureVote.wikitext`

投票页使用：

`{{SecureVote|id=example-2026-01}}`

### 3. 创建提交端点

在本 wiki 的项目命名空间创建：

`Project:SecureVote/Submit`

很多 wiki 中 `Project:` 是项目命名空间的别名；如果你的 wiki 显示的是站点自己的项目命名空间名称，请使用实际名称。粘贴：

`wiki/Project_SecureVote_Submit.wikitext`

### 4. 创建查验后台

创建：

`Project:SecureVote/Admin`

粘贴：

`wiki/Project_SecureVote_Admin.wikitext`

只有拥有私有 AbuseLog 权限的用户才能看到投票记录。

### 5. 创建配置页

创建：

`MediaWiki:SecureVote-config.json`

粘贴并修改：

`wiki/MediaWiki_SecureVote-config.example.json`

配置页的 `polls` 里每个键就是一个投票 ID。模板里的 ID 必须与这里完全一致。

### 6. 创建 AbuseFilter 提示消息

创建：

`MediaWiki:Securevote-vote-received`

粘贴：

`wiki/MediaWiki_Securevote-vote-received.wikitext`

### 7. 创建隐藏 AbuseFilter

新建 AbuseFilter，条件参考：

`wiki/AbuseFilter_SecureVote.rules.txt`

重要设置：

- 启用：是
- 隐藏/私有：是
- 动作：禁止保存 / disallow
- 禁止保存消息：`securevote-vote-received`
- 过滤器必须匹配 SecureVote 提交端点页面。

请把规则里的 `YOUR_PROJECT_NAMESPACE` 换成本 wiki 实际的项目命名空间前缀。

该过滤器必须禁止保存。如果只是标记或警告，投票载荷可能成为公开页面修订。

### 8. 全站加载脚本

推荐编辑 `MediaWiki:Common.js`，添加：

`wiki/Common.js.example`

这样所有用户都会自动加载 SecureVote。匿名用户仍不能投票，脚本会检查登录状态和编辑权限。

也可以通过 Gadget 管理加载，参考：

`wiki/Gadgets-definition.example.wikitext`

小型本地部署通常使用 Common.js 更简单。

## 创建投票

1. 创建普通投票页面，例如 `Project:Votes/Example vote`。
2. 写清楚投票事项、资格、开始/结束时间和计票规则。
3. 放置投票表单：

`{{SecureVote|id=example-2026-01}}`

4. 在 `MediaWiki:SecureVote-config.json` 中添加同 ID 的投票配置。
5. 确认登录用户能看到表单。
6. 确认匿名用户不能提交。

## 配置字段

每个投票支持：

- `title`：表单和后台显示的标题。
- `description`：简短说明；长规则应写在投票页面正文。
- `enabled`：`true` 允许提交，`false` 关闭或暂停。
- `start`：开始时间，例如 `2026-06-05T00:00:00+08:00`。
- `end`：结束时间。
- `allowReason`：`true` 显示理由框。
- `options`：选项列表，包含内部 `id` 和显示 `label`。

正式投票 ID 不要复用。

## 计票方式

打开：

`Project:SecureVote/Admin`

后台首页会列出所有已配置或已有日志的投票项目，包括已结束和已关闭项目。每项会显示：

- 状态：未开始、正在进行中、已结束、已关闭、配置异常或配置缺失；
- 开始/结束时间；
- 有效票数；
- 全部提交数；
- 异常提交数。

点击某个投票后，只查看该投票自己的结果：

- 汇总：显示有效票合计、各选项票数和占比。
- 有效投票：每名用户当前计入结果的最后一票。
- 全部可解析提交：用于审计重复投票和改票。
- 异常提交：投票或选项不再匹配配置的提交。
- CSV 导出：只导出当前投票的有效票。

默认计票规则是：同一用户 + 同一投票 = 最后一张有效票计入结果。

## 测试清单

正式使用前建议：

1. 创建一个试用投票 ID。
2. 用注册用户提交试用票。
3. 检查提交端点页面历史中没有投票载荷。
4. 检查隐藏 AbuseLog 中有提交记录。
5. 检查后台能看到该票。
6. 同一用户再投一次，确认只计最后一票。
7. 测试已结束投票和已关闭投票。
8. 检查桌面端和移动端显示。
9. 正式投票前按需要移除或归档测试配置。

## 隐私和安全说明

见 `docs/security-notes.md`。

## 许可证

MIT License。见 `LICENSE`。
