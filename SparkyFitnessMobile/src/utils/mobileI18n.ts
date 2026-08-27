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
  | 'kitchen.weeklyPrep'
  | 'kitchen.weeklyPrepSubtitle'
  | 'kitchen.updating'
  | 'kitchen.selectDay'
  | 'kitchen.macroSummary'
  | 'kitchen.mealMacroSummary'
  | 'kitchen.caloriesUnit'
  | 'foodSummary.tapToAddFood'
  | 'foodSummary.target'
  | 'foodSummary.loggedFromPlan'
  | 'foodSummary.logFromPlan'
  | 'foodSummary.plannedMealDetails'
  | 'foodSummary.macroTarget'
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
  | 'mealPlan.loadingWeight'
  | 'mealPlan.defaultName'
  | 'mealPlan.datePlaceholder'
  | 'mealPlan.carbsPerKg'
  | 'mealPlan.proteinPerKg'
  | 'mealPlan.fatPerKg'
  | 'mealPlan.loadingTrainingFocus'
  | 'mealPlan.target'
  | 'mealPlan.total'
  | 'mealPlan.change'
  | 'mealPlan.selectRole'
  | 'mealPlan.clear'
  | 'mealPlan.selectFood'
  | 'mealPlan.searching'
  | 'mealPlan.foodLoadFailed'
  | 'mealPlan.noRoleFoods'
  | 'mealPlan.loadMoreFailed'
  | 'mealPlan.caloriesSummary'
  | 'mealPlan.foodNutrition'
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
  | 'workoutPlan.mainRequired'
  | 'workoutPlan.mainPrefix'
  | 'workoutPlan.rest'
  | 'workoutPlan.customFocus'
  | 'workoutPlan.sessionCount'
  | 'workoutPlan.summaryLine';

const ZH_CN: Partial<Record<MobileTranslationKey, string>> = {
  'common.retry': '重试',
  'common.loadingMore': '加载更多...',
  'kitchen.title': '厨房',
  'kitchen.loading': '正在加载厨房计划...',
  'kitchen.failedTitle': '厨房计划加载失败',
  'kitchen.failedSubtitle': '请检查网络连接后重试。',
  'kitchen.noPlannedMeals': '没有计划餐',
  'kitchen.noPlannedMealsSubtitle':
    '请先在 Web 端创建并启用一个碳水循环饮食计划。',
  'kitchen.activeMealPlan': '当前饮食计划',
  'kitchen.ingredientSummary': '食材汇总',
  'kitchen.ingredientSummarySubtitle': '所选日期需要准备的总量。',
  'kitchen.weeklyPrep': '本周备菜',
  'kitchen.weeklyPrepSubtitle': '当前周需要准备的每种食材总量。',
  'kitchen.updating': '更新中...',
  'kitchen.selectDay': '选择{{day}}，{{date}}',
  'kitchen.macroSummary':
    '{{calories}} 千卡 · 碳水 {{carbs}} · 蛋白质 {{protein}} · 脂肪 {{fat}}',
  'kitchen.mealMacroSummary':
    '碳水 {{carbs}} · 蛋白质 {{protein}} · 脂肪 {{fat}}',
  'kitchen.caloriesUnit': '千卡',
  'foodSummary.tapToAddFood': '点击添加食物',
  'foodSummary.target': '目标',
  'foodSummary.loggedFromPlan': '已按计划记录',
  'foodSummary.logFromPlan': '按计划记录',
  'foodSummary.plannedMealDetails': '{{label}}计划餐详情',
  'foodSummary.macroTarget':
    '{{target}}：碳水 {{carbs}} / 蛋白质 {{protein}} / 脂肪 {{fat}}',
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
  'mealPlan.noTrainingFocusPlan':
    '当前开始日期没有覆盖的训练重点计划。生成目标时会按休息日餐名处理。',
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
  'mealPlan.loadingWeight': '正在加载体重...',
  'mealPlan.defaultName': '碳水循环 {{date}}',
  'mealPlan.datePlaceholder': 'YYYY-MM-DD',
  'mealPlan.carbsPerKg': '每公斤体重碳水',
  'mealPlan.proteinPerKg': '每公斤体重蛋白质',
  'mealPlan.fatPerKg': '每公斤体重脂肪',
  'mealPlan.loadingTrainingFocus': '正在加载训练重点计划...',
  'mealPlan.target': '目标',
  'mealPlan.total': '合计',
  'mealPlan.change': '更换',
  'mealPlan.selectRole': '选择{{role}}',
  'mealPlan.clear': '清除',
  'mealPlan.selectFood': '选择{{role}}食物',
  'mealPlan.searching': '搜索中...',
  'mealPlan.foodLoadFailed': '无法加载食物库。',
  'mealPlan.noRoleFoods': '没有找到{{role}}食物。',
  'mealPlan.loadMoreFailed': '无法加载更多食物。',
  'mealPlan.caloriesSummary': '{{calories}} 千卡',
  'mealPlan.foodNutrition':
    '碳水 {{carbs}} · 蛋白质 {{protein}} · 脂肪 {{fat}} / {{serving}}',
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
  'workoutPlan.mainPrefix': '主训练 · {{focus}}',
  'workoutPlan.rest': '休息',
  'workoutPlan.customFocus': '自定义训练重点',
  'workoutPlan.sessionCount': '{{count}} 次训练',
  'workoutPlan.summaryLine': '{{day}} · {{sessions}} · 主训练：{{slot}}',
};

const EN: Record<MobileTranslationKey, string> = {
  'common.retry': 'Retry',
  'common.loadingMore': 'Loading more...',
  'kitchen.title': 'Kitchen',
  'kitchen.loading': 'Loading kitchen plan...',
  'kitchen.failedTitle': 'Failed to load Kitchen',
  'kitchen.failedSubtitle': 'Please check your connection and try again.',
  'kitchen.noPlannedMeals': 'No planned meals',
  'kitchen.noPlannedMealsSubtitle':
    'Create and activate a carb-cycle meal plan on Web first.',
  'kitchen.activeMealPlan': 'Active Meal Plan',
  'kitchen.ingredientSummary': 'Ingredient Summary',
  'kitchen.ingredientSummarySubtitle':
    'Total amount needed for the selected day.',
  'kitchen.weeklyPrep': 'Weekly Prep',
  'kitchen.weeklyPrepSubtitle': 'Total amount needed for the current week.',
  'kitchen.updating': 'Updating...',
  'kitchen.selectDay': 'Select {{day}}, {{date}}',
  'kitchen.macroSummary':
    '{{calories}} Cal · C {{carbs}} · P {{protein}} · F {{fat}}',
  'kitchen.mealMacroSummary': 'C {{carbs}} · P {{protein}} · F {{fat}}',
  'kitchen.caloriesUnit': 'Cal',
  'foodSummary.tapToAddFood': 'Tap to add food',
  'foodSummary.target': 'Target',
  'foodSummary.loggedFromPlan': 'Logged from Plan',
  'foodSummary.logFromPlan': 'Log from Plan',
  'foodSummary.plannedMealDetails': '{{label}} planned meal details',
  'foodSummary.macroTarget':
    '{{target}}: C {{carbs}} / P {{protein}} / F {{fat}}',
  'mealPlan.newTitle': 'New Carb Cycle Plan',
  'mealPlan.subtitle':
    'Generate weekly meal targets from your latest body weight.',
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
  'mealPlan.noTrainingFocusPlan':
    'No active Training Focus Plan covers this start date. Carb cycle targets will use rest-day meal naming until a plan is active.',
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
  'mealPlan.loadingWeight': 'Loading body weight...',
  'mealPlan.defaultName': 'Carb Cycle {{date}}',
  'mealPlan.datePlaceholder': 'YYYY-MM-DD',
  'mealPlan.carbsPerKg': 'Carbs / kg',
  'mealPlan.proteinPerKg': 'Protein / kg',
  'mealPlan.fatPerKg': 'Fat / kg',
  'mealPlan.loadingTrainingFocus': 'Loading training focus plan...',
  'mealPlan.target': 'Target',
  'mealPlan.total': 'Total',
  'mealPlan.change': 'Change',
  'mealPlan.selectRole': 'Select {{role}}',
  'mealPlan.clear': 'Clear',
  'mealPlan.selectFood': 'Select {{role}} Food',
  'mealPlan.searching': 'Searching...',
  'mealPlan.foodLoadFailed': 'Unable to load food database.',
  'mealPlan.noRoleFoods': 'No {{role}} foods found.',
  'mealPlan.loadMoreFailed': 'Unable to load more foods.',
  'mealPlan.caloriesSummary': '{{calories}} kcal',
  'mealPlan.foodNutrition':
    'C {{carbs}} · P {{protein}} · F {{fat}} / {{serving}}',
  'workoutPlan.newTitle': 'New Workout Plan',
  'workoutPlan.editTitle': 'Edit Workout Plan',
  'workoutPlan.subtitle':
    'Configure body-part training focus by weekday and time slot.',
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
  'workoutPlan.mainPrefix': 'Main · {{focus}}',
  'workoutPlan.rest': 'rest',
  'workoutPlan.customFocus': 'Custom focus',
  'workoutPlan.sessionCount': '{{count}} sessions',
  'workoutPlan.summaryLine': '{{day}} · {{sessions}} · Main: {{slot}}',
};

function isSimplifiedChinese(language?: string | null) {
  return language?.toLowerCase().startsWith('zh') ?? false;
}

export function createMobileTranslator(language?: string | null) {
  const dictionary = isSimplifiedChinese(language) ? ZH_CN : {};
  return (
    key: MobileTranslationKey,
    options?: { defaultValue?: string } & Record<string, unknown>,
  ) => {
    const template = dictionary[key] ?? EN[key] ?? options?.defaultValue ?? key;
    return template.replace(/{{(\w+)}}/g, (_match, name: string) =>
      options?.[name] === undefined ? `{{${name}}}` : String(options[name]),
    );
  };
}
