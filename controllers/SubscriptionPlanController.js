const SubscriptionPlan = require('../models/SubscriptionPlan');

// @desc    Get all active subscription plans
// @route   GET /api/subscription-plans
// @access  Public
exports.getAllPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true })
      .sort({ displayOrder: 1, createdAt: 1 });
    
    res.json({
      success: true,
      data: plans,
      message: 'Subscription plans fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching plans'
    });
  }
};

// @desc    Get single subscription plan by ID
// @route   GET /api/subscription-plans/:id
// @access  Public
exports.getPlanById = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findOne({ 
      _id: req.params.id, 
      isActive: true 
    });
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }
    
    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    console.error('Error fetching subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching plan'
    });
  }
};

// @desc    Create new subscription plan (Admin only)
// @route   POST /api/subscription-plans
// @access  Private/Admin
exports.createPlan = async (req, res) => {
  try {
    const plan = new SubscriptionPlan(req.body);
    await plan.save();
    
    res.status(201).json({
      success: true,
      data: plan,
      message: 'Subscription plan created successfully'
    });
  } catch (error) {
    console.error('Error creating subscription plan:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Plan name already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while creating plan'
    });
  }
};

// @desc    Update subscription plan (Admin only)
// @route   PUT /api/subscription-plans/:id
// @access  Private/Admin
exports.updatePlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }
    
    res.json({
      success: true,
      data: plan,
      message: 'Subscription plan updated successfully'
    });
  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating plan'
    });
  }
};

// @desc    Delete subscription plan (Admin only) - Soft delete
// @route   DELETE /api/subscription-plans/:id
// @access  Private/Admin
exports.deletePlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Subscription plan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting plan'
    });
  }
};

// @desc    Restore deleted subscription plan (Admin only)
// @route   PATCH /api/subscription-plans/:id/restore
// @access  Private/Admin
exports.restorePlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }
    
    res.json({
      success: true,
      data: plan,
      message: 'Subscription plan restored successfully'
    });
  } catch (error) {
    console.error('Error restoring subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while restoring plan'
    });
  }
};

// @desc    Get all plans including inactive (Admin only)
// @route   GET /api/subscription-plans/admin/all
// @access  Private/Admin
exports.getAllPlansAdmin = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find()
      .sort({ displayOrder: 1, createdAt: 1 });
    
    res.json({
      success: true,
      data: plans,
      message: 'All subscription plans fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching all subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching plans'
    });
  }
};

// @desc    Update plan display order (Admin only)
// @route   PUT /api/subscription-plans/admin/update-order
// @access  Private/Admin
exports.updatePlanOrder = async (req, res) => {
  try {
    const { plans } = req.body;
    
    if (!Array.isArray(plans)) {
      return res.status(400).json({
        success: false,
        message: 'Plans array is required'
      });
    }

    const bulkOperations = plans.map(plan => ({
      updateOne: {
        filter: { _id: plan.id },
        update: { displayOrder: plan.displayOrder }
      }
    }));

    await SubscriptionPlan.bulkWrite(bulkOperations);

    res.json({
      success: true,
      message: 'Plan display order updated successfully'
    });
  } catch (error) {
    console.error('Error updating plan order:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating plan order'
    });
  }
};

// @desc    Get plans by type
// @route   GET /api/subscription-plans/type/:type
// @access  Public
exports.getPlansByType = async (req, res) => {
  try {
    const { type } = req.params;
    const validTypes = ['preset', 'custom', 'one-time'];
    
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan type'
      });
    }

    const plans = await SubscriptionPlan.find({ 
      type: type,
      isActive: true 
    }).sort({ displayOrder: 1 });

    res.json({
      success: true,
      data: plans,
      message: `${type} plans fetched successfully`
    });
  } catch (error) {
    console.error('Error fetching plans by type:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching plans by type'
    });
  }
};

// @desc    Toggle plan popularity status (Admin only)
// @route   PATCH /api/subscription-plans/:id/toggle-popular
// @access  Private/Admin
exports.togglePlanPopular = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    plan.isPopular = !plan.isPopular;
    await plan.save();

    res.json({
      success: true,
      data: plan,
      message: `Plan ${plan.isPopular ? 'marked as' : 'unmarked from'} popular`
    });
  } catch (error) {
    console.error('Error toggling plan popularity:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating plan popularity'
    });
  }
};

// @desc    Get popular plans
// @route   GET /api/subscription-plans/popular
// @access  Public
exports.getPopularPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ 
      isActive: true, 
      isPopular: true 
    }).sort({ displayOrder: 1 });

    res.json({
      success: true,
      data: plans,
      message: 'Popular plans fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching popular plans:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching popular plans'
    });
  }
};