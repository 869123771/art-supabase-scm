# Art Supabase SCM · 供应链管理

本仓是 [Art Supabase Pro](https://gitee.com/wangyanghub/art-supabase-pro) 的供应链管理（SCM）业务子仓，位于主仓的 `modules/art-supabase-scm`，通过 Git submodule 独立维护。

## 职责边界

SCM 负责供应链领域的业务页面、API、类型和规则。认证、租户、菜单、权限、布局、公共组件及 Supabase 公共客户端由主平台统一提供。业务功能上线时，应沿用现有子应用的独立运行和平台宿主接入方式，并在服务端落实租户与权限校验。

当前仓库已完成 Git 子仓初始化；供应链业务功能尚未实现。请勿将占位内容当作可用业务数据。

## 与主仓协作

1. 在本仓提交供应链业务变更。
2. 在主仓更新 `modules/art-supabase-scm` 的子模块指针。
3. 主仓克隆时使用 `git clone --recurse-submodules`，已有工作区使用 `git submodule update --init --recursive`。

远端仓库：[art-supabase-scm](https://gitee.com/wangyanghub/art-supabase-scm)。
