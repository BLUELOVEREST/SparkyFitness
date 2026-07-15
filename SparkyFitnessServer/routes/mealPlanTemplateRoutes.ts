import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import mealPlanTemplateService from '../services/mealPlanTemplateService.js';
const router = express.Router();
// --- Meal Plan Template Routes ---
/**
 * @swagger
 * /meal-plan-templates:
 *   post:
 *     summary: Create a new meal plan template
 *     tags: [Nutrition & Meals]
 *     description: Creates a new meal plan template for the authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MealPlanTemplate'
 *     responses:
 *       201:
 *         description: The meal plan template was created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MealPlanTemplate'
 *       403:
 *         description: User does not have permission to create a meal plan template.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const newPlan = await mealPlanTemplateService.createMealPlanTemplate(
      req.userId,
      req.body
    );
    res.status(201).json(newPlan);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /meal-plan-templates:
 *   get:
 *     summary: Get all meal plan templates for a user
 *     tags: [Nutrition & Meals]
 *     description: Retrieves all meal plan templates owned by the authenticated user.
 *     responses:
 *       200:
 *         description: A list of meal plan templates.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MealPlanTemplate'
 *       403:
 *         description: User does not have permission to access this resource.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const plans = await mealPlanTemplateService.getMealPlanTemplates(
      req.userId
    );
    res.status(200).json(plans);
  } catch (error) {
    next(error);
  }
});

router.get('/active/day', authenticate, async (req, res, next) => {
  try {
    const { date } = req.query;
    if (typeof date !== 'string' || !date) {
      return res.status(400).json({ error: 'date is required.' });
    }

    const dayView = await mealPlanTemplateService.getActiveMealPlanDay(
      req.userId,
      date
    );
    res.status(200).json(dayView);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/active/log-meal-to-diary',
  authenticate,
  async (req, res, next) => {
    try {
      const { date, mealTypeId } = req.body;
      if (!date || !mealTypeId) {
        return res
          .status(400)
          .json({ error: 'date and mealTypeId are required.' });
      }

      const loggedMeal =
        await mealPlanTemplateService.logActiveMealPlanMealToDiary(
          req.userId,
          date,
          mealTypeId
        );
      res.status(201).json(loggedMeal);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'This planned meal has already been logged.') {
          return res.status(409).json({ error: error.message });
        }
        if (
          error.message ===
            'No active carb cycle meal plan found for this date.' ||
          error.message === 'No planned meal found for this meal type.' ||
          error.message === 'No planned foods found for this meal.'
        ) {
          return res.status(404).json({ error: error.message });
        }
      }
      next(error);
    }
  }
);
/**
 * @swagger
 * /meal-plan-templates/{id}:
 *   put:
 *     summary: Update a meal plan template
 *     tags: [Nutrition & Meals]
 *     description: Updates an existing meal plan template.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal plan template to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MealPlanTemplate'
 *     responses:
 *       200:
 *         description: The meal plan template was updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MealPlanTemplate'
 *       403:
 *         description: User does not have permission to update this meal plan template.
 *       404:
 *         description: Meal plan template not found.
 */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const updatedPlan = await mealPlanTemplateService.updateMealPlanTemplate(
      req.params.id,

      req.userId,
      req.body
    );
    res.status(200).json(updatedPlan);
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /meal-plan-templates/{id}:
 *   delete:
 *     summary: Delete a meal plan template
 *     tags: [Nutrition & Meals]
 *     description: Deletes a specific meal plan template.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the meal plan template to delete.
 *     responses:
 *       204:
 *         description: Meal plan template deleted successfully.
 *       403:
 *         description: User does not have permission to delete this meal plan template.
 *       404:
 *         description: Meal plan template not found.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { currentClientDate } = req.query;
    await mealPlanTemplateService.deleteMealPlanTemplate(
      req.params.id,

      req.userId,
      currentClientDate
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
export default router;
