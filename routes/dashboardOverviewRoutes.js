const express = require('express');
const router = express.Router();
const {
    getDashboardData,
    refreshBalance,
    getQuickActions
} = require('../controllers/dashboardOverviewController');
const auth = require('../middleware/authe');

router.get('/', /*auth,*/ getDashboardData);
router.post('/refresh-balance', /*auth,*/ refreshBalance);
router.get('/quick-actions',/* auth,*/ getQuickActions);

module.exports = router;