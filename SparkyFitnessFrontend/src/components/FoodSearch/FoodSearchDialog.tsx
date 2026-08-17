import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import type { Food } from '@/types/food';
import type { Meal } from '@/types/meal';
import EnhancedFoodSearch from './FoodSearch';

interface FoodSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFoodSelect: (item: Food | Meal, type: 'food' | 'meal') => void;
  title?: string;
  description?: string;
  hideDatabaseTab?: boolean;
  hideMealTab?: boolean;
  localDatabaseOnly?: boolean;
  mealType?: string;
  macroRoleFilter?: Food['macro_role'];
}

const FoodSearchDialog = ({
  open,
  onOpenChange,
  onFoodSelect,
  title = 'Search and Add Food',
  description = 'Search for foods to add to your database.',
  hideDatabaseTab = false,
  hideMealTab = false,
  localDatabaseOnly = false,
  mealType = undefined,
  macroRoleFilter = undefined,
}: FoodSearchDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('foodSearchDialog.title', title)}</DialogTitle>
          <DialogDescription>
            {t('foodSearchDialog.description', description)}
          </DialogDescription>
        </DialogHeader>
        <EnhancedFoodSearch
          onFoodSelect={onFoodSelect}
          hideDatabaseTab={hideDatabaseTab}
          hideMealTab={hideMealTab}
          localDatabaseOnly={localDatabaseOnly}
          mealType={mealType}
          macroRoleFilter={macroRoleFilter}
        />
      </DialogContent>
    </Dialog>
  );
};

export default FoodSearchDialog;
