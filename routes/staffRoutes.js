const express = require ('express');
const staffRoute = express.Router();
// const { staffAuth } = require('../middlewares/staffAuth');

const { 
  getStaffDashboard,
  getAssignedSupport,
  getStaffSchedule,
  updateOrderStatus, 
  updateSupportTicket
} = require('../controllers/staffController');




staffRoute.get('/staff', /*staffAuth,*/ getStaffDashboard);

staffRoute.get('/staff', /*staffAuth,*/ getAssignedSupport);

staffRoute.get('/staff', /*staffAuth,*/ getStaffSchedule);

staffRoute.put('/staff', /*staffAuth,*/ updateOrderStatus);

staffRoute.put('/staff', /*staffAuth,*/ updateSupportTicket);


module.exports = staffRoute;

