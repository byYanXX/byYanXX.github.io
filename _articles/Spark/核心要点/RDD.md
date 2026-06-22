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

![一个 RDD 在逻辑上是一个数据集，物理上由多个 partition 组成，调度到不同 Executor 上并行计算。](/assets/images/spark/rdd-partitions.svg)

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

![窄依赖与宽依赖：前者父子分区 1:1，可在同节点 pipeline；后者要 shuffle 重排，是 stage 切分点。](/assets/images/spark/rdd-dependencies.svg)

下图把一段典型的 `textFile → filter → map → reduceByKey → collect` 翻译成 stage DAG：

![Stage 1 由窄依赖 textFile/filter/map 组成，遇到 reduceByKey 触发 shuffle，进入 Stage 2，再被 collect 拉回 driver。](/assets/images/spark/rdd-stages.svg)

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

## 面试自测

试着不看正文答这几题，再回去对照：

<details markdown="1">
<summary><strong>1. RDD 的 5 个内部属性是哪些？哪些必备、哪些可选？</strong></summary>

必备 3 个：

1. **A list of partitions** —— 分区列表
2. **A function for computing each split** —— 每个分区的计算函数
3. **A list of dependencies on other RDDs** —— 对父 RDD 的依赖

可选 2 个：

4. **Partitioner**（仅 K-V 类型 RDD，如 `HashPartitioner`、`RangePartitioner`）
5. **Preferred locations** —— 数据本地性提示

</details>

<details markdown="1">
<summary><strong>2. Transformation 和 Action 的本质区别？为什么 Spark 选择懒执行？</strong></summary>

Transformation 返回新 RDD 但不计算，只记录依赖关系；Action 触发实际计算并返回值或落盘。

懒执行让 Spark 拿到完整的 DAG 后再做整体优化：合并连续的窄依赖到同一个 task（pipeline）、选择最佳的物理算子、决定哪里要 shuffle。如果是 eager，每个 transformation 都立刻执行，没法做这些跨算子优化。

</details>

<details markdown="1">
<summary><strong>3. Narrow dependency 和 wide dependency 的区别？Spark 怎么用这个区分？</strong></summary>

- **Narrow**：每个父 partition 最多被一个子 partition 消费（`map` / `filter` / 同分区 `union`）
- **Wide**：多个子 partition 依赖同一个父 partition（`groupByKey` / `reduceByKey` / 跨分区 `join`），必须 shuffle

调度器按宽依赖切 stage：一个 stage 内全是窄依赖、可以在 executor 内 pipeline 执行；stage 之间通过 shuffle 衔接，shuffle write 把数据按 key 落盘 / 跨网络拉取。

**容错的不对称性**：窄依赖丢失一个 partition 只需重算对应父 partition；宽依赖丢失要重算所有相关父 partition——这也是为什么长 lineage 加宽依赖时建议 `cache` 或 `checkpoint`。

</details>

<details markdown="1">
<summary><strong>4. groupByKey 和 reduceByKey，哪个性能更好？为什么？</strong></summary>

`reduceByKey` 更好。

两者都做 shuffle，但 `reduceByKey` 在 **map 端先做局部 combine**（每个分区内同 key 先 reduce 一次），shuffle 阶段传输的数据量大幅减少；`groupByKey` 是把同 key 的所有 value 原样收集再走 shuffle，数据量大。

只要 reduce 操作满足结合律和交换律，能用 `reduceByKey` 就别用 `groupByKey`。同理 `aggregateByKey` / `combineByKey` 也支持 map-side combine。

</details>

<details markdown="1">
<summary><strong>5. cache 和 checkpoint 有什么本质区别？什么场景下应该用 checkpoint？</strong></summary>

| 维度 | cache / persist | checkpoint |
|---|---|---|
| 存储位置 | 内存或本地磁盘 | 可靠存储（HDFS / S3） |
| 是否保留 lineage | 保留（丢了可以重算） | 截断（不再依赖父 RDD） |
| 可靠性 | 不可靠（executor 挂了就丢） | 可靠 |
| 性能 | 快（内存命中） | 慢（要写远端存储） |

**用 checkpoint 的场景**：lineage 很长 + 包含多个宽依赖时（比如迭代算法 PageRank / 图计算），lineage 重算成本太高，需要主动截断。

**实践**：通常组合用 `rdd.cache(); rdd.checkpoint(); rdd.count()`。先 cache 避免 checkpoint 时再算一遍。

</details>

<details markdown="1">
<summary><strong>6. RDD 是怎么容错的？一个 partition 在执行中丢了怎么恢复？</strong></summary>

RDD 不存数据副本，存 **lineage**——这个 RDD 是从哪个父 RDD、用什么函数算出来的。

partition 丢失（如 executor 挂掉），Spark 沿 lineage 反向找到能产出该 partition 的最近一份持久化（cache / checkpoint / 输入文件），从那里**重新计算**这个 partition。

窄依赖时重算代价小（只算丢失对应的那个父 partition）；宽依赖时可能要重算所有相关父 partition——这是宽依赖比窄依赖"贵"的另一个原因。

</details>

<details markdown="1">
<summary><strong>7. Job / Stage / Task 三者的关系？</strong></summary>

- **Job**：一次 action 触发一个 job
- **Stage**：一个 job 按宽依赖切分成多个 stage，每个 stage 是一段窄依赖链
- **Task**：一个 stage 内每个 partition 对应一个 task，是 Spark 调度的最小单位

举例：`textFile.filter.map.reduceByKey.collect` 这条链，假设 textFile 有 3 个 partition、reduceByKey 后有 3 个分区——

- 一个 job（`collect` 是 action）
- 两个 stage（被 `reduceByKey` 的 shuffle 切开）
- Stage 1 有 3 个 task，Stage 2 有 3 个 task

</details>

<details markdown="1">
<summary><strong>8. shuffle 什么时候发生？为什么是性能拐点？</strong></summary>

宽依赖算子触发 shuffle：`*ByKey` 系列、`join`（除非两侧已经按相同 key 分区）、`repartition`、`sortBy` 等。

shuffle 的代价：

- **跨网络传输**：map 端写本地磁盘，reduce 端跨网络拉数据
- **磁盘 I/O**：shuffle write 一定要落盘（区别于 transformation 的内存 pipeline）
- **序列化 / 反序列化**
- **可能的内存溢出**：reduce 端聚合时数据可能超过内存

性能调优重点就是减少 shuffle 数据量：用 `reduceByKey` 替 `groupByKey`、广播小表代替 shuffle join、合理选择分区数、用 `Tungsten` 优化的 DataFrame API。

</details>

<details markdown="1">
<summary><strong>9. 现在大家都用 DataFrame / Dataset 了，RDD 还有什么场景值得直接用？</strong></summary>

绝大多数业务代码都应该用 DataFrame / Dataset——Catalyst 优化器和 Tungsten 引擎能做很多手写 RDD 做不了的优化。

但下面这些场景 RDD 仍然合理：

- **非结构化数据的复杂处理**：日志解析、二进制数据、需要任意函数式变换
- **细粒度控制 partition / partitioner**：DataFrame 的物理计划是黑盒，需要精确控制分区时 RDD 更直接
- **自定义类型** 且不愿写 encoder 时
- **与现有 RDD 代码集成**

实际项目里 `df.rdd` 和 `rdd.toDF()` 经常混用，但主流仍以 DataFrame 为骨架。

</details>
