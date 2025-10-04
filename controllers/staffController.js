const express = require('express');
// const router = express.Router();
// const auth = require('../middleware/auth');
const Order = require('../models/Order');
const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');

// @route   GET api/staff/dashboard
// @desc    Get staff dashboard data
// @access  Private (Staff)
exports.getStaffDashboard = async (req, res) => {
    try {
        // Check if user is staff
        if (req.user.role !== 'staff') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        
        // Get assigned orders
        const assignedOrders = await Order.find({
            assignedTo: req.user.id,
            status: { $in: ['assigned', 'in-transit'] }
        }).sort({ deliveryDate: 1 }).populate('user', 'name phone');
        
        // Get pending deliveries
        const pendingDeliveries = await Order.find({
            assignedTo: req.user.id,
            status: 'assigned'
        }).countDocuments();
        
        // Get assigned support tickets
        const assignedTickets = await SupportTicket.find({
            assignedTo: req.user.id,
            status: { $ne: 'closed' }
        }).sort({ createdAt: -1 }).limit(5);
        
        res.json({
            assignedOrders,
            pendingDeliveries,
            assignedTickets
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   PUT api/staff/orders/:id/status
// @desc    Update order status
// @access  Private (Staff)
exports.updateOrderStatus = async (req, res) => {
    try {
        // Check if user is staff
        if (req.user.role !== 'staff') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        
        const { status, notes } = req.body;
        
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        
        // Check if order is assigned to this staff
        if (order.assignedTo.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }
        
        // Validate status transition
        const validTransitions = {
            'assigned': ['in-transit', 'cancelled'],
            'in-transit': ['delivered', 'cancelled']
        };
        
        if (!validTransitions[order.status] || !validTransitions[order.status].includes(status)) {
            return res.status(400).json({ msg: 'Invalid status transition' });
        }
        
        // Update order
        order.status = status;
        
        if (status === 'delivered') {
            order.deliveredAt = Date.now();
        }
        
        if (notes) {
            order.staffNotes = notes;
        }
        
        await order.save();
        
        res.json(order);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   GET api/staff/tickets
// @desc    Get assigned support tickets
// @access  Private (Staff)
exports.getAssignedSupport = async (req, res) => {
    try {
        // Check if user is staff
        if (req.user.role !== 'staff') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        
        const tickets = await SupportTicket.find({
            assignedTo: req.user.id,
            status: { $ne: 'closed' }
        }).sort({ priority: -1, createdAt: -1 })
          .populate('customer', 'name email phone');
        
        res.json(tickets);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   PUT api/staff/tickets/:id
// @desc    Update support ticket
// @access  Private (Staff)
exports.updateSupportTicket = async (req, res) => {
    try {
        // Check if user is staff
        if (req.user.role !== 'staff') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        
        const { status, response, escalate } = req.body;
        
        const ticket = await SupportTicket.findById(req.params.id);
        
        if (!ticket) {
            return res.status(404).json({ msg: 'Ticket not found' });
        }
        
        // Check if ticket is assigned to this staff
        if (ticket.assignedTo.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }
        
        // Update ticket
        if (status) ticket.status = status;
        
        if (response) {
            ticket.responses.push({
                responder: req.user.id,
                response,
                isStaff: true,
                respondedAt: Date.now()
            });
        }
        
        if (escalate) {
            ticket.priority = 'high';
            ticket.escalated = true;
        }
        
        await ticket.save();
        
        res.json(ticket);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @route   GET api/staff/schedule
// @desc    Get staff schedule
// @access  Private (Staff)
exports.getStaffSchedule = async (req, res) => {
    try {
        // Check if user is staff
        if (req.user.role !== 'staff') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        
        const user = await User.findById(req.user.id).select('schedule');
        
        res.json(user.schedule);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
