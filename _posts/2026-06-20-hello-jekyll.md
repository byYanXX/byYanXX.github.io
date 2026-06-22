---
title: Jekyll 上手小记
date: 2026-06-20 14:30:00 +0800
---

Jekyll 是 GitHub Pages 默认支持的静态站点生成器，特点是几乎零配置。

## 本地预览

```bash
bundle install
bundle exec jekyll serve
```

打开浏览器访问 `http://localhost:4000`。

## 草稿

`_drafts/` 下的文件不会被发布。要预览草稿：

```bash
bundle exec jekyll serve --drafts
```
