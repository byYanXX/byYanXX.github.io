---
title: "【Java】01 程序基础"
collection: Notes
permalink: /Notes/java-01-基础
tags:
 - 2022.06.30
---

{% include base_path %}

Hello, world!
---
```
public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello, world!");
    }
}
```

编程规范
---
1. 类名首字母大写，驼峰命名
2. 变量名首字母小写
3. final 常数名全大写

两种数据类型
---
1. 基本类型：
  - 整型：byte(1个字节)、short(2个字节)、int(4个字节)、long(8个字节)，一个字节就是 1byte，1024 字节就是 1K
  - 浮点型：float(4个字节)、double(8个字节)
  - 布尔型：boolean (理论上存储布尔类型只需要1 bit，但是通常JVM内部会把boolean表示为4字节整数)
2. 引用类型：
