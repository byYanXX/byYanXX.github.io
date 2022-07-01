---
title: '【疑难杂症】NoClassDefFoundError'
date: 2022-07-01
permalink: /Blogs/2022/07/01/NoClassDefFoundError
---

{% include base_path %}

问题描述
---
执行如下代码：
```
public class Main {
    public static void main(String[] args) {
        for (String arg : args) {
            if ("-version".equals(arg)) {
                System.out.println("v 1.0");
                break;
            }
        }
    }
}
```

编译可以通过：
```
javac Main.java
```

但在执行时：
```
java Main -version
```
会报错；
```
错误: 找不到或无法加载主类 Main
原因: java.lang.NoClassDefFoundError: java基础/Main (wrong name: Main)
```

原因
---
问题主要在于包组织，应该根据源代码中的包分类正确地将类安排在文件夹中。

解决
---
1. 首先 java 文件路径：~/HelloJava/src/Base/Main.java

2. 接着 在 Base 目录下编译： `javac Main.java`

3. 最后 在 src 目录下运行：`java Base.Main -version`


参考连接
---
[Please click here](https://stackoverflow.com/questions/17973970/how-can-i-solve-java-lang-noclassdeffounderror)
