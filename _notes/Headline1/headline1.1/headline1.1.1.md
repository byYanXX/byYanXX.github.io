---
title: headline1.1.1
category: Headline1
subcategory: headline1.1
---

这是 **Headline1 / headline1.1 / headline1.1.1** 路径下的叶子笔记示例。

## 如何使用三级目录

每篇笔记的 frontmatter 需要三个字段：

```yaml
---
title: 叶子标题（侧栏第三级显示）
category: 一级标题（侧栏第一级分组）
subcategory: 二级标题（侧栏第二级分组）
---
```

侧栏会根据 `category` 和 `subcategory` 自动分组，按字母排序。

## 文件位置

文件可以放在 `_notes/` 下的任意路径。约定上建议跟侧栏结构一致，便于管理：

```
_notes/
└── Headline1/
    └── headline1.1/
        ├── headline1.1.1.md
        └── headline1.1.2.md
```

但实际分组由 frontmatter 决定，跟物理目录无关。
