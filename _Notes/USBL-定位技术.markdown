---
title: "【技术介绍】USBL 定位技术"
collection: Notes
permalink: /Notes/USBL-定位技术
excerpt: '水下声音定位之超短基线定位（USBL）'
tags:
 - 2022.06.29
---

* TOC
{:toc}

基本介绍
---
水声定位系统按应答器基阵基线长度分为长基线（LBL）、短基线（SBL）、超短基线（USBL）。
基线长度越长，精度越高。超短基线一般为 <1 米。

USBL 基本组成：发射换能器、接收基阵、应答器。
被定位的目标携带应答器。水面船体携带发射换能器、接收基阵。

工作原理
---
水面船体的发射换能器发出声音，水下被定位的目标的应答器接收到声信号后，回发声信号，该信号被水面船体的接收基阵捕捉。
由 X，Y 两个方向的相位差，及声音的到达时间计算出水下目标到基阵的距离，从而得到水平坐标与深度信息。

元件设计
---



评价
---
评价指标：

优势：

劣势：


参考资料
---
[水声定位方法研究进展](https://m.thepaper.cn/baijiahao_13669265)

[USBL & Underwater Positioning - Concept and Basic](https://www.youtube.com/watch?v=op6M6C7kKgE)
