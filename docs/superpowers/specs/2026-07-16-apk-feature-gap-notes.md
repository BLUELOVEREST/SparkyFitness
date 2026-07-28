# APK 功能缺口记录

## 背景

当前定制版 SparkyFitness 的 Web 端已经支持碳水循环、Training Focus Plan、Kitchen 预览、Diary 计划餐记录等核心流程。APK 端已经补了一部分能力，但还没有完全对齐 Web 端。本文记录 APK 端当前缺口，作为后续移动端补全的任务清单。

## 已完成的 APK 能力

- `Kitchen`：可以查看当前激活 carb-cycle meal plan 的当天计划，并支持当前周日期切换。
- `Diary`：可以读取 carb-cycle active meal plan，并把计划餐展示到饮食记录区域。
- `Meal Plans`：可以从 Library 进入 Meal Plans 列表。
- `Meal Plan 创建`：可以基于最近体重生成 carb-cycle targets，并为每餐的 `Carbs / Protein / Fat` 选择本地 Food Database 食物。
- `Meal Plan 编辑`：可以打开已有模板，查看已有 assignment，替换或清除某个宏量食物，并保存回服务端。
- `Meal Plan 基础信息编辑`：移动端可以编辑计划名称、描述、开始日期和结束日期。
- `Meal Plan 重新生成`：编辑模式下可以重新生成 carb-cycle targets，并自动清除旧食物 assignment，避免旧计划污染新目标。
- `Meal Plan 食物选择状态`：移动端宏量食物选择器支持空结果提示、分页加载更多、加载中和加载失败提示。
- `Meal Plan 食物替换/清除`：已选食物后使用紧凑 `Change` / `Clear` 操作，选择器支持取消选择。
- `计划餐记录 API`：移动端已有 `logActiveMealPlanMealToDiary(date, mealTypeId)` API hook。
- `Diary 一键记录计划餐`：计划餐可直接写入 Diary，已记录餐会合并展示为对应餐段，并刷新 active meal plan 与 daily summary。
- `Workout Plans`：可以从 Library 进入 Training Focus Plan 列表，创建/编辑每天四个训练时段，并保存到后端现有 workout plan template 接口。
- `Kitchen 食材汇总`：可以按当天计划餐聚合同名同单位食材，展示当天厨房称量总量。
- `Meal Plan Total vs Target`：移动端 Meal Plan 食物选择时，可以看到每餐当前已选食物 C/P/F 合计与目标对比。
- `Meal Plan / Workout Plan 联动展示`：移动端 carb-cycle 生成页会读取 start date 覆盖的 active Training Focus Plan，并展示计划名和周一到周日训练摘要。
- `Workout Plan 摘要与描述体验`：Training Focus Plan 表单支持描述保存，并在编辑页直接展示周一到周日训练摘要。
- `新增 APK 文案中文化`：Workout Plan、Meal Plan、Kitchen 和 Diary 计划餐相关新增核心文案会根据用户语言偏好显示简体中文。

## 仍缺失或需要继续完善的 APK 能力

### P0：Diary 一键记录计划餐闭环（已完成基础闭环）

目标是让 APK 当天执行流程完整闭环：打开 Diary，看到当天每一餐计划，点击按钮即可把这一餐计划写入 Diary。

当前状态：

- `FoodSummary` 已有 `Log from Plan` 按钮。
- `DiaryScreen` 已把 `useLogActiveMealPlanMeal` 接入 `FoodSummary`。
- 已补测试覆盖按钮展示、点击调用、已记录状态、空计划禁用和刷新逻辑。
- 已修复计划餐记录后，计划卡片和已记录餐段重复展示的问题。

验收点：

- 有计划餐且未记录时，显示 `Log from Plan`。
- 点击后调用 `logActiveMealPlanMeal({ date, mealTypeId })`。
- 已记录餐显示 `Logged from Plan` 并禁用。
- 没有 `mealTypeId` 或没有计划 items 时禁用，避免无效请求。
- 成功后刷新 active meal plan 和 daily summary，避免重复记录。

### P1：Workout Plan 移动端补全（基础闭环已完成）

Web 端已经支持 Training Focus Plan：

- 每天多个训练时段。
- 每天有且只有一个主训练时段。
- Rest day 自动影响餐次数和餐名。

APK 端当前已补：

- Training Focus Plan 列表。
- 创建/编辑每天训练时段。
- 每天 main session 校验。
- 只有一个训练时段时自动设为 main。
- 通过后端现有 `/api/workout-plan-templates` 保存 `plan_mode = training_focus` 和 `focus_sessions`。

后续还需要继续增强：

- Workout Plan 表单可以继续优化为原生日期选择器，减少手动输入日期。

### P1：Meal Plan 编辑体验增强（基础闭环已完成）

当前 APK 已支持创建、编辑、重新生成、基础信息编辑、食物选择状态展示和每餐 `Total C/P/F` 与 `Target C/P/F` 对比。后续主要是更精细的交互和中文本地化。

### P2：Kitchen 厨房模式增强

当前 APK Kitchen 是按天预览，后续可以增强：

- 已补按食材汇总当天所有餐的总重量。
- 显示已记录状态。
- 允许快速跳转 Diary 记录。
- 更适合厨房称量的紧凑布局。

### P2：中文本地化（核心新增文案已完成）

Workout Plan、Meal Plan、Kitchen 和 Diary 计划餐相关新增核心文案已接入简体中文。后续如果要进一步完善，需要把旧版原生页面中原本就存在的英文文案也纳入统一 i18n。

### P3：APK 构建发布流程

当前暂不做自动 APK 构建。后续如果需要正式使用 APK，需要补：

- Android 本地构建说明。
- 签名配置。
- 可选 Gitea Actions 产出 APK artifact。

## 当前优先级

1. 增强 Kitchen 与 Diary 的跳转和记录状态展示。
2. 优化 Workout Plan 日期输入为原生日期选择器。
3. 补 APK 构建发布说明和签名配置。
