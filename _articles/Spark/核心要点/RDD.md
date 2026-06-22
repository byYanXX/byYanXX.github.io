---
title: RDD
category: Spark
subcategory: 核心要点
tags: [spark]
date: 2026-06-23
---

RDD（**Resilient Distributed Dataset**，弹性分布式数据集）是 Spark 的核心抽象。理解 RDD 是理解 Spark 一切高层 API（DataFrame、Dataset、Structured Streaming）的起点——它们最终都会被翻译成 RDD 上的算子来执行。

## 三个关键词

把名字拆开看：

- **Resilient（弹性）**：通过 **lineage（血缘）** 容错。某个分区在节点故障时丢失，Spark 不依赖副本，而是顺着 lineage 重算这个分区。
- **Distributed（分布式）**：数据被切分成多个 **partition**，分散在集群各 executor 上并行计算。
- **Dataset（数据集）**：一个不可变的元素集合，对外暴露函数式 API（`map` / `filter` / `reduce` …）。

> RDD 是 **只读** 的。任何 "修改" 操作都会返回一个新 RDD，旧 RDD 不变。这是它能用 lineage 容错的前提。

## RDD 的 5 个内部属性

在 Spark 源码里，`RDD` 是一个抽象类，每个具体子类都要回答 5 个问题（前 3 个必备、后 2 个可选）：

1. **A list of partitions** —— 这个 RDD 由哪些分区组成（决定并行度）
2. **A function for computing each split** —— 给一个分区，怎么算出它的元素
3. **A list of dependencies on other RDDs** —— 依赖了哪些父 RDD
4. **(Optional) A Partitioner for key-value RDDs** —— 对 (K, V) 类型 RDD，分区是怎么分布的（如 `HashPartitioner`、`RangePartitioner`）
5. **(Optional) A list of preferred locations** —— 计算每个分区时，倾向调度到哪些节点（数据本地性）

理解这 5 个属性，你就理解了 RDD 的整个对象模型。后面所有调度逻辑都建立在它们之上。

## 创建 RDD 的两种方式

```scala
// 1. 把驱动器（driver）端的本地集合并行化
val rdd1 = sc.parallelize(Seq(1, 2, 3, 4, 5))

// 2. 从外部存储读取（HDFS、S3、本地文件…）
val rdd2 = sc.textFile("hdfs://path/to/file.txt")
```

第二种是更常见的入口。`textFile` 会按 HDFS block 切分成多个分区。

## Transformation vs Action

RDD 上的算子分两类，区分两者是用好 Spark 的关键：

| 类别 | 是否触发计算 | 返回 | 示例 |
|---|---|---|---|
| **Transformation** | 否（懒执行） | 新的 RDD | `map`、`filter`、`flatMap`、`groupByKey`、`reduceByKey`、`join`、`union`、`distinct` |
| **Action** | 是（立即执行） | 一个值或副作用 | `collect`、`count`、`reduce`、`take`、`first`、`saveAsTextFile`、`foreach` |

懒执行让 Spark 拿到完整的 transformation 链路（DAG）后再优化执行，比如把多个 `map` 在同一个 task 内 pipeline 起来。

```scala
val rdd = sc.textFile("input")
  .filter(_.nonEmpty)      // transformation, 不计算
  .map(_.toUpperCase)      // transformation, 不计算
rdd.count()                // action -> 提交 job, 真正执行
```

只调 transformation 不调 action，Spark 什么也不会做。

## 窄依赖 vs 宽依赖

依赖关系决定了能不能 pipeline 执行，也决定了在哪里要 shuffle。

- **窄依赖（narrow dependency）**：每个父 partition 最多被一个子 partition 消费。例：`map`、`filter`、`union`、同分区 `join`。可以在 executor 本地 pipeline 处理，不跨网络。
- **宽依赖（wide dependency / shuffle dependency）**：多个子 partition 依赖同一个父 partition。例：`groupByKey`、`reduceByKey`、`sortByKey`、跨分区 `join`。会触发 **shuffle**——把数据按 key 重新分区，跨网络重排。

Spark 调度时按宽依赖切 **stage**：一个 stage 内全是窄依赖、可流水线；stage 之间通过 shuffle 衔接。一次 action 触发的 job 在物理上就是一个 DAG of stages。

> 性能调优常看 stage 数和 shuffle 数据量。能用 `reduceByKey` 就别用 `groupByKey`——前者在 map 端先做了 combine，shuffle 数据量更小。

## Lineage 与容错

RDD 不存数据，**只记 lineage**：「我是从哪个父 RDD、用什么函数算出来的」。这条计算路径是一个 DAG。

当节点故障导致某个 partition 丢失时，Spark 沿 lineage 反向回溯，重新算出这个 partition 即可。这就是 "弹性" 的含义。

但 lineage 也有成本：

- 链路很长时，重算代价高
- 宽依赖丢失时可能要重算多个父分区
- 反复访问的中间 RDD 不持久化的话每次 action 都重算

这些场景下要主动 **持久化**。

## 持久化（cache / persist）

```scala
rdd.cache()                              // 等价于 persist(MEMORY_ONLY)
rdd.persist(StorageLevel.MEMORY_AND_DISK)
rdd.unpersist()                          // 显式释放
```

常用存储级别：

| 级别 | 含义 |
|---|---|
| `MEMORY_ONLY` | 仅 JVM 堆内存（默认） |
| `MEMORY_AND_DISK` | 优先内存，溢出写磁盘 |
| `MEMORY_ONLY_SER` | 内存中以序列化字节存（更省空间，反序列化有 CPU 开销） |
| `MEMORY_AND_DISK_SER` | 上面的混合版 |
| `DISK_ONLY` | 仅磁盘 |
| `*_2` | 加 `_2` 后缀表示双副本，节点挂了也不丢 |
| `OFF_HEAP` | 堆外内存 |

注意 `persist` 只是 *标记*；只有第一次对它执行 action 时才会真正缓存。

## Checkpoint：lineage 的 "重启"

`rdd.checkpoint()` 把 RDD 物化到可靠存储（如 HDFS），**截断 lineage**。下次访问从 checkpoint 读，不再依赖父 RDD。

`cache` 和 `checkpoint` 的关键差别：

- `cache` 在内存/本地磁盘，不可靠（executor 挂了就丢）；lineage 仍保留，丢了能重算
- `checkpoint` 在可靠存储，可靠；lineage 被截断，无法回溯（这正是目的：避免长 lineage 重算）

一般组合用：先 `cache`，再 `checkpoint`，避免 checkpoint 时重新触发一次完整计算。

## 共享变量

driver 和 executor 之间传东西，普通闭包变量会被复制一份到每个 task。Spark 提供两类共享变量：

- **Broadcast variable**：driver 上的只读数据广播到每个 executor，task 共享一份。适合广播小表做 map-side join。
- **Accumulator**：从 executor 累加到 driver 的只写变量，常用作计数器。注意只有 action 触发的累加才保证只执行一次，transformation 内累加可能因为重算被多次累加。

```scala
val bc = sc.broadcast(smallMap)
rdd.map(x => bc.value(x.key))     // 每个 executor 只拉一份 smallMap
```

## 与 DataFrame / Dataset 的关系

Spark 1.3 引入 DataFrame，1.6 引入 Dataset：

- **DataFrame** = `Dataset[Row]`，带 schema 的结构化数据，类似一张表
- **Dataset[T]** = 强类型版 DataFrame，编译期类型检查（Scala / Java）

两者底层都基于 RDD 执行，但中间多了一层 **Catalyst 优化器**（逻辑/物理计划重写）和 **Tungsten 引擎**（堆外二进制格式 + 代码生成）。结构化 API 能让 Spark 更多地理解你的计算意图、做更激进的优化。

实践建议：

> 业务代码优先用 **DataFrame / Dataset**。只有在需要细粒度控制（自定义分区、特殊容错策略、非结构化数据复杂逻辑）时才直接写 RDD。

## 小结一句话

RDD 用 **不可变 + lineage** 提供容错，用 **分区 + 函数式 API** 提供并行，用 **懒执行 + DAG** 提供性能。`reduceByKey` 优于 `groupByKey`，长 lineage 要 `cache` 或 `checkpoint`，宽依赖是 shuffle 拐点——这些经验都源自 RDD 这层抽象。

理解了 RDD，再去看 DataFrame / Dataset、Spark SQL、Catalyst、Structured Streaming，就只是逐层加抽象的过程。
