# 可信前台工具

API: CliElement
`CliElement.constructor` 设置 timeoutMs、maxOutputBytes；`CliElement#run` 接受可信 executable 与独立参数数组，返回成功 stdout，非零/超时/输出超限/清理失败拒绝 Promise，稳定 CLI_* 错误。无 shell，stdin 忽略，stdout/stderr 合计限制。Linux 管理实际启动进程组，其它平台仅直接子进程。不是沙箱或授权器，不保证逃逸后代、后台服务、任意管道或持久恢复。领域选择工具、验证专业输出和权限、处理文件与清理。例：[真实 Node 前台命令](../examples/cli.mts)。

[完整能力及成员目录](../capabilities.md)。
