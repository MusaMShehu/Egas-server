
// Middleware to verify admin role with enhanced security
const adminAuth = (req, res, next) => {
    try {
        // 1. Check if user exists in request (from previous auth middleware)
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                message: 'Authentication required' 
            });
        }

        // 2. Verify user role
        if (req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'Admin privileges required',
                hint: 'Your role: ' + req.user.role 
            });
        }

        // 3. Additional security checks (optional)
        if (!req.user.isActive) {
            return res.status(403).json({ 
                success: false,
                message: 'Account deactivated' 
            });
        }

        // 4. Log admin access (optional but recommended)
        console.log(`Admin access granted to ${req.user.email} at ${new Date().toISOString()}`);

        next();
    } catch (err) {
        console.error('Admin auth error:', err);
        return res.status(500).json({ 
            success: false,
            message: 'Server error during authorization check' 
        });
    }
};

module.exports = adminAuth;