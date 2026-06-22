# byYanXX.github.io

yby 的博客 · 基于 Jekyll，部署在 GitHub Pages。

## 目录结构

```
.
├── _config.yml            # Jekyll 配置
├── Gemfile                # Ruby 依赖
├── index.html             # 主页（最近 5 篇文章）
├── notes.html             # 数据碎笔入口
├── archive.html           # 归档（按年时间线）
├── _layouts/              # 页面布局（default/post/note）
├── _includes/             # 局部组件（header/footer/sidebar）
├── _sass/                 # SCSS 样式（Vue 风格主题）
├── _posts/                # 📝 已发布文章
├── _drafts/               # ✏️ 草稿（不会发布）
├── _notes/                # 📒 数据碎笔（三级目录）
└── assets/
    ├── css/
    └── images/            # 🖼 图片资源
```

## 写一篇新文章

在 `_posts/` 下创建文件，命名 `YYYY-MM-DD-标题.md`：

```yaml
---
title: 我的新文章
date: 2026-07-01 12:00:00 +0800
---
正文内容...
```

## 写一篇数据碎笔

在 `_notes/` 下创建 markdown 文件（目录结构随意，建议跟侧栏层级一致便于管理）：

```yaml
---
title: 叶子标题
category: 一级分类
subcategory: 二级分类
---
正文内容...
```

侧栏会按 `category` → `subcategory` → `title` 自动分组排序。

## 草稿

放进 `_drafts/`，本地预览时加 `--drafts` 参数：

```bash
bundle exec jekyll serve --drafts
```

## 本地预览

```bash
bundle install
bundle exec jekyll serve
# 打开 http://localhost:4000
```

## 部署

推送到 `main` 分支即可，GitHub Pages 会自动构建并发布到 https://byyanxx.github.io
