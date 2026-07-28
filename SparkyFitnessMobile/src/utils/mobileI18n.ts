type MobileTranslationKey =
  | 'common.retry'
  | 'common.loadingMore'
  | 'kitchen.title'
  | 'kitchen.loading'
  | 'kitchen.failedTitle'
  | 'kitchen.failedSubtitle'
  | 'kitchen.noPlannedMeals'
  | 'kitchen.noPlannedMealsSubtitle'
  | 'kitchen.activeMealPlan'
  | 'kitchen.ingredientSummary'
  | 'kitchen.ingredientSummarySubtitle'
  | 'foodSummary.tapToAddFood'
  | 'foodSummary.target'
  | 'foodSummary.loggedFromPlan'
  | 'foodSummary.logFromPlan'
  | 'mealPlan.newTitle'
  | 'mealPlan.subtitle'
  | 'mealPlan.currentBodyWeight'
  | 'mealPlan.noWeightRecorded'
  | 'mealPlan.planDetails'
  | 'mealPlan.planName'
  | 'mealPlan.description'
  | 'mealPlan.optionalNotes'
  | 'mealPlan.weekStartDate'
  | 'mealPlan.endDate'
  | 'mealPlan.inputs'
  | 'mealPlan.trainingFocusPlan'
  | 'mealPlan.noTrainingFocusPlan'
  | 'mealPlan.generate'
  | 'mealPlan.generating'
  | 'mealPlan.weeklyPreview'
  | 'mealPlan.foodSelection'
  | 'mealPlan.save'
  | 'mealPlan.saving'
  | 'mealPlan.searchFoodDatabase'
  | 'mealPlan.cancelSelection'
  | 'mealPlan.loadMoreFoods'
  | 'mealPlan.loadingMoreFoods'
  | 'workoutPlan.newTitle'
  | 'workoutPlan.editTitle'
  | 'workoutPlan.subtitle'
  | 'workoutPlan.planName'
  | 'workoutPlan.planNamePlaceholder'
  | 'workoutPlan.description'
  | 'workoutPlan.optional'
  | 'workoutPlan.startDate'
  | 'workoutPlan.endDate'
  | 'workoutPlan.setActive'
  | 'workoutPlan.sessions'
  | 'workoutPlan.active'
  | 'workoutPlan.weeklySummary'
  | 'workoutPlan.focus'
  | 'workoutPlan.mainSession'
  | 'workoutPlan.setAsMain'
  | 'workoutPlan.saving'
  | 'workoutPlan.save'
  | 'workoutPlan.planNameRequired'
  | 'workoutPlan.mainRequired';

const ZH_CN: Partial<Record<MobileTranslationKey, string>> = {
  'common.retry': '重试',
  'common.loadingMore': '加载更多...',
  'kitchen.title': '厨房',
  'kitchen.loading': '正在加载厨房计划...',
  'kitchen.failedTitle': '厨房计划加载失败',
  'kitchen.failedSubtitle': '请检查网络连接后重试。',
  'kitchen.noPlannedMeals': '没有计划餐',
  'kitchen.noPlannedMealsSubtitle': '请先在 Web 端创建并启用一个碳水循环饮食计划。',
  'kitchen.activeMealPlan': '当前饮食计划',
  'kitchen.ingredientSummary': '食材汇总',
  'kitchen.ingredientSummarySubtitle': '所选日期需要准备的总量。',
  'foodSummary.tapToAddFood': '点击添加食物',
  'foodSummary.target': '目标',
  'foodSummary.loggedFromPlan': '已按计划记录',
  'foodSummary.logFromPlan': '按计划记录',
  'mealPlan.newTitle': '新建碳水循环计划',
  'mealPlan.subtitle': '根据最近体重生成每周饮食目标。',
  'mealPlan.currentBodyWeight': '当前体重',
  'mealPlan.noWeightRecorded': '还没有体重记录',
  'mealPlan.planDetails': '计划信息',
  'mealPlan.planName': '计划名称',
  'mealPlan.description': '描述',
  'mealPlan.optionalNotes': '可选备注',
  'mealPlan.weekStartDate': '周开始日期',
  'mealPlan.endDate': '结束日期',
  'mealPlan.inputs': '碳水循环输入',
  'mealPlan.trainingFocusPlan': '训练重点计划',
  'mealPlan.noTrainingFocusPlan': '当前开始日期没有覆盖的训练重点计划。生成目标时会按休息日餐名处理。',
  'mealPlan.generate': '生成碳水循环目标',
  'mealPlan.generating': '生成中...',
  'mealPlan.weeklyPreview': '每周预览',
  'mealPlan.foodSelection': '食物选择',
  'mealPlan.save': '保存饮食计划',
  'mealPlan.saving': '保存中...',
  'mealPlan.searchFoodDatabase': '搜索食物库',
  'mealPlan.cancelSelection': '取消选择',
  'mealPlan.loadMoreFoods': '加载更多食物',
  'mealPlan.loadingMoreFoods': '正在加载更多食物...',
  'workoutPlan.newTitle': '新建训练计划',
  'workoutPlan.editTitle': '编辑训练计划',
  'workoutPlan.subtitle': '按星期和时段配置每天的训练重点。',
  'workoutPlan.planName': '计划名称',
  'workoutPlan.planNamePlaceholder': '训练重点计划',
  'workoutPlan.description': '描述',
  'workoutPlan.optional': '可选',
  'workoutPlan.startDate': '开始日期',
  'workoutPlan.endDate': '结束日期',
  'workoutPlan.setActive': '设为当前启用计划',
  'workoutPlan.sessions': '训练重点时段',
  'workoutPlan.active': '个启用',
  'workoutPlan.weeklySummary': '每周摘要',
  'workoutPlan.focus': '训练重点',
  'workoutPlan.mainSession': '主训练时段',
  'workoutPlan.setAsMain': '设为主训练',
  'workoutPlan.saving': '保存中...',
  'workoutPlan.save': '保存训练计划',
  'workoutPlan.planNameRequired': '请输入计划名称',
  'workoutPlan.mainRequired': '需要设置主训练时段',
};

const EN: Record<MobileTranslationKey, string> = {
  'common.retry': 'Retry',
  'common.loadingMore': 'Loading more...',
  'kitchen.title': 'Kitchen',
  'kitchen.loading': 'Loading kitchen plan...',
  'kitchen.failedTitle': 'Failed to load Kitchen',
  'kitchen.failedSubtitle': 'Please check your connection and try again.',
  'kitchen.noPlannedMeals': 'No planned meals',
  'kitchen.noPlannedMealsSubtitle': 'Create and activate a carb-cycle meal plan on Web first.',
  'kitchen.activeMealPlan': 'Active Meal Plan',
  'kitchen.ingredientSummary': 'Ingredient Summary',
  'kitchen.ingredientSummarySubtitle': 'Total amount needed for the selected day.',
  'foodSummary.tapToAddFood': 'Tap to add food',
  'foodSummary.target': 'Target',
  'foodSummary.loggedFromPlan': 'Logged from Plan',
  'foodSummary.logFromPlan': 'Log from Plan',
  'mealPlan.newTitle': 'New Carb Cycle Plan',
  'mealPlan.subtitle': 'Generate weekly meal targets from your latest body weight.',
  'mealPlan.currentBodyWeight': 'Current body weight',
  'mealPlan.noWeightRecorded': 'No weight recorded',
  'mealPlan.planDetails': 'Plan details',
  'mealPlan.planName': 'Plan name',
  'mealPlan.description': 'Description',
  'mealPlan.optionalNotes': 'Optional notes',
  'mealPlan.weekStartDate': 'Week start date',
  'mealPlan.endDate': 'End date',
  'mealPlan.inputs': 'Carb cycle inputs',
  'mealPlan.trainingFocusPlan': 'Training Focus Plan',
  'mealPlan.noTrainingFocusPlan': 'No active Training Focus Plan covers this start date. Carb cycle targets will use rest-day meal naming until a plan is active.',
  'mealPlan.generate': 'Generate Carb Cycle Targets',
  'mealPlan.generating': 'Generating...',
  'mealPlan.weeklyPreview': 'Weekly Preview',
  'mealPlan.foodSelection': 'Food Selection',
  'mealPlan.save': 'Save Meal Plan',
  'mealPlan.saving': 'Saving...',
  'mealPlan.searchFoodDatabase': 'Search food database',
  'mealPlan.cancelSelection': 'Cancel selection',
  'mealPlan.loadMoreFoods': 'Load more foods',
  'mealPlan.loadingMoreFoods': 'Loading more foods...',
  'workoutPlan.newTitle': 'New Workout Plan',
  'workoutPlan.editTitle': 'Edit Workout Plan',
  'workoutPlan.subtitle': 'Configure body-part training focus by weekday and time slot.',
  'workoutPlan.planName': 'Plan Name',
  'workoutPlan.planNamePlaceholder': 'Training Focus Plan',
  'workoutPlan.description': 'Description',
  'workoutPlan.optional': 'Optional',
  'workoutPlan.startDate': 'Start Date',
  'workoutPlan.endDate': 'End Date',
  'workoutPlan.setActive': 'Set as active plan',
  'workoutPlan.sessions': 'Training Focus Sessions',
  'workoutPlan.active': 'active',
  'workoutPlan.weeklySummary': 'Weekly Summary',
  'workoutPlan.focus': 'Focus',
  'workoutPlan.mainSession': 'Main Session',
  'workoutPlan.setAsMain': 'Set as Main',
  'workoutPlan.saving': 'Saving...',
  'workoutPlan.save': 'Save Workout Plan',
  'workoutPlan.planNameRequired': 'Plan name is required',
  'workoutPlan.mainRequired': 'Main training session required',
};

function isSimplifiedChinese(language?: string | null) {
  return language?.toLowerCase().startsWith('zh') ?? false;
}

export function createMobileTranslator(language?: string | null) {
  const dictionary = isSimplifiedChinese(language) ? ZH_CN : {};
  return (key: MobileTranslationKey) => dictionary[key] ?? EN[key];
}
