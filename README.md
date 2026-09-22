# Art Supabase SCM · 供应链管理

本仓是 [Art Supabase Pro](https://gitee.com/wangyanghub/art-supabase-pro) 的供应链管理（SCM）业务子仓，位于主仓的 `modules/art-supabase-scm`，通过 Git submodule 独立维护。

## 职责边界

SCM 负责供应链领域的业务页面、API、类型和规则。认证、租户、菜单、权限、布局、公共组件及 Supabase 公共客户端由主平台统一提供。业务功能上线时，应沿用现有子应用的独立运行和平台宿主接入方式，并在服务端落实租户与权限校验。

## 已接入的销售功能

- 销售报价：报价费用定义、报价项分类、销售报价单、项目报价。
- 销售管理：销售合同、销售订单、发货通知单、发货装车。
- 六类销售单据共用租户隔离、来源单据关联、明细计价、状态流转与详情视图；数据库端复核金额、来源关系和发货剩余数量。
- 项目报价可从已生效报价生成销售合同草稿。采购申请与 MES 生产计划尚未接入，“生成计划”会明确提示当前暂不可执行。

本地独立开发使用 `pnpm dev`，默认端口为 `3021`；与主平台联调时按主仓说明安装并启动托管模块。

## 与主仓协作

1. 在本仓提交供应链业务变更。
2. 在主仓更新 `modules/art-supabase-scm` 的子模块指针。
3. 主仓克隆时使用 `git clone --recurse-submodules`，已有工作区使用 `git submodule update --init --recursive`。

远端仓库：[art-supabase-scm](https://gitee.com/wangyanghub/art-supabase-scm)。
