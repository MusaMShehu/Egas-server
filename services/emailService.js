// services/emailService.js
const sgMail = require("@sendgrid/mail");

class EmailService {
  constructor() {
    this.companyName = "E-Gas Nigeria Limited";
    this.fromEmail =
      process.env.SENDGRID_FROM_EMAIL || "musamohammedshehu@gmail.com";

    // Initialize SendGrid
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      this.isEnabled = true;
      console.log("✅ SendGrid email service initialized");
    } else {
      console.warn(
        "⚠️ SENDGRID_API_KEY not found. Emails will be logged but not sent."
      );
      this.isEnabled = false;
    }
  }

  /**
   * Core email sending method
   */
  async sendEmail({ to, subject, html, text = null }) {
    try {
      // If SendGrid is not configured, log and return mock response
      if (!this.isEnabled) {
        console.log("📧 [MOCK] Email would be sent:", { to, subject });
        return {
          success: true,
          messageId: `mock-${Date.now()}`,
          status: "logged_only",
        };
      }

      const msg = {
        to,
        from: {
          email: this.fromEmail,
          name: this.companyName,
        },
        subject,
        html,
        text: text || this.htmlToText(html),
      };

      const response = await sgMail.send(msg);
      console.log("✅ Email sent successfully to:", to);

      return {
        success: true,
        messageId: response[0].headers["x-message-id"],
        response: response[0],
      };
    } catch (error) {
      console.error("❌ Error sending email:", {
        to,
        subject,
        error: error.message,
        response: error.response?.body,
      });

      // Don't throw in production to avoid breaking the main flow
      if (process.env.NODE_ENV === "production") {
        return {
          success: false,
          error: error.message,
        };
      }
      throw error;
    }
  }

  htmlToText(html) {
    return html.replace(/<[^>]*>/g, "");
  }

  // ==================== EMAIL TEMPLATES ====================

  // Account Created
  async sendAccountCreatedEmail(user) {
    const subject = `Welcome to ${this.companyName}! Your Account is Ready`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .container { max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; }
          .header { background: #2E8B57; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { padding: 20px; text-align: center; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${this.companyName}!</h1>
          </div>
          <div class="content">
            <h2>Hello ${user.firstName},</h2>
            <p>Your account has been successfully created. Welcome to our family of satisfied customers!</p>
            <p>With your account, you can:</p>
            <ul>
              <li>Order gas cylinders easily</li>
              <li>Track your deliveries in real-time</li>
              <li>Set up subscription plans</li>
              <li>Manage your wallet and payments</li>
            </ul>
            <p>If you have any questions, feel free to contact our support team.</p>
          </div>
          <div class="footer">
            <p>Thank you for choosing ${this.companyName}</p>
            <p>© ${new Date().getFullYear()} ${
      this.companyName
    }. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Order Created
  async sendOrderCreatedEmail(order, user) {
    const subject = `Order Confirmed - #${order.orderId}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #2E8B57; color: white; padding: 20px; text-align: center;">
          <h1>Order Confirmed!</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your order has been received and is being processed.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Order Details:</h3>
            <p><strong>Order Number:</strong> ${order.orderId}</p>
            <p><strong>Gas Type:</strong> ${order.productName}</p>
            <p><strong>Quantity:</strong> ${order.quantity}</p>
            <p><strong>Total Amount:</strong> ₦${order.totalAmount}</p>
            <p><strong>Delivery Address:</strong> ${order.deliveryAddress}</p>
          </div>
          <p>We'll notify you when your order is out for delivery.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Order Confirmation
  async sendOrderConfirmationEmail(order, user) {
    const subject = `Order Processing - #${order.orderId}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #FFA500; color: white; padding: 20px; text-align: center;">
          <h1>Order Processing</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your order is being prepared for delivery.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Order Summary:</h3>
            <p><strong>Order Number:</strong> ${order.orderId}</p>
            <p><strong>Estimated Delivery:</strong> ${order.estimatedDelivery}</p>
            <p><strong>Total Amount:</strong> ₦${order.totalAmount}</p>
          </div>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Order Out for Delivery
  async sendOrderOutForDeliveryEmail(order, user) {
    const subject = `🚚 Your Order is Out for Delivery - #${order.orderId}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #4169E1; color: white; padding: 20px; text-align: center;">
          <h1>Out for Delivery!</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Great news! Your gas cylinder is on its way to you.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Delivery Information:</h3>
            <p><strong>Order Number:</strong> ${order.orderId}</p>
            <p><strong>Driver Name:</strong> ${order.deliveryAgent}</p>
            <p><strong>Estimated Arrival:</strong> ${order.estimatedArrival}</p>
          </div>
          <p>Please ensure someone is available to receive the delivery.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Order Delivered Success
  async sendOrderDeliveredEmail(order, user) {
    const subject = `✅ Delivery Successful - #${order.orderId}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #32CD32; color: white; padding: 20px; text-align: center;">
          <h1>Delivery Successful!</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your order has been successfully delivered. Thank you for your business!</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Delivery Details:</h3>
            <p><strong>Order Number:</strong> ${order.orderId}</p>
            <p><strong>Delivered At:</strong> ${order.deliveredAt}</p>
            <p><strong>Delivered To:</strong> ${order.deliveryAddress}</p>
          </div>
          <p>We hope to serve you again soon!</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Subscription Created
  async sendSubscriptionCreatedEmail(subscription, user) {
    const subject = `🔄 Subscription Activated - ${subscription.planName}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #9370DB; color: white; padding: 20px; text-align: center;">
          <h1>Subscription Activated!</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your gas subscription has been successfully activated.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Subscription Details:</h3>
            <p><strong>Plan:</strong> ${subscription.planName}</p>
            <p><strong>Gas Type:</strong> ${subscription.gasType}</p>
            <p><strong>Delivery Frequency:</strong> ${subscription.frequency}</p>
            <p><strong>Next Delivery:</strong> ${subscription.nextDeliveryDate}</p>
            <p><strong>Billing Cycle:</strong> ${subscription.billingCycle}</p>
          </div>
          <p>You'll receive notifications before each delivery.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Subscription Delivery Reminder (1 day before)
  async sendSubscriptionDeliveryReminder(subscription, user) {
    const subject = `🔔 Delivery Reminder - Tomorrow ${subscription.deliveryDate}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #FFD700; color: black; padding: 20px; text-align: center;">
          <h1>Delivery Tomorrow!</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>This is a friendly reminder that your scheduled gas delivery is tomorrow.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Delivery Schedule:</h3>
            <p><strong>Delivery Date:</strong> ${subscription.deliveryDate}</p>
            <p><strong>Time Window:</strong> ${subscription.deliveryWindow}</p>
            <p><strong>Gas Type:</strong> ${subscription.gasType}</p>
            <p><strong>Quantity:</strong> ${subscription.quantity}</p>
          </div>
          <p>Please ensure someone is available to receive the delivery.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Subscription Delivery Fulfilled
  async sendSubscriptionDeliveryFulfilled(subscription, user) {
    const subject = `✅ Subscription Delivery Completed`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #32CD32; color: white; padding: 20px; text-align: center;">
          <h1>Delivery Completed!</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your scheduled gas delivery has been successfully completed.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Delivery Details:</h3>
            <p><strong>Delivery Date:</strong> ${subscription.deliveryDate}</p>
            <p><strong>Gas Type:</strong> ${subscription.gasType}</p>
            <p><strong>Next Delivery:</strong> ${subscription.nextDeliveryDate}</p>
          </div>
          <p>Thank you for your continued trust in our service.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Wallet Top-up Success
  async sendWalletTopupSuccess(user, transaction) {
    const subject = `💰 Wallet Top-up Successful`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #228B22; color: white; padding: 20px; text-align: center;">
          <h1>Top-up Successful!</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your wallet has been successfully topped up.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Transaction Details:</h3>
            <p><strong>Amount Added:</strong> ₦${transaction.amount}</p>
            <p><strong>Transaction ID:</strong> ${transaction.id}</p>
            <p><strong>Payment Method:</strong> ${transaction.paymentMethod}</p>
            <p><strong>New Balance:</strong> ₦${transaction.newBalance}</p>
            <p><strong>Date:</strong> ${transaction.date}</p>
          </div>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Subscription Ending Alert
  async sendSubscriptionEndingAlert(subscription, user, daysLeft) {
    const subject = `⚠️ Subscription Ending in ${daysLeft} days`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #FF8C00; color: white; padding: 20px; text-align: center;">
          <h1>Subscription Ending Soon</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your gas subscription will end in ${daysLeft} days.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Subscription Details:</h3>
            <p><strong>Plan:</strong> ${subscription.planName}</p>
            <p><strong>End Date:</strong> ${subscription.endDate}</p>
            <p><strong>Days Remaining:</strong> ${daysLeft}</p>
          </div>
          <p>Renew your subscription to continue enjoying uninterrupted gas delivery service.</p>
          <a href="${
            process.env.APP_URL || "https://egas.com"
          }/subscriptions/renew" style="background: #2E8B57; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Renew Subscription</a>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Subscription Paused
  async sendSubscriptionPausedEmail(subscription, user) {
    const subject = `⏸️ Subscription Paused`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #696969; color: white; padding: 20px; text-align: center;">
          <h1>Subscription Paused</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your gas subscription has been paused as requested.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Subscription Status:</h3>
            <p><strong>Plan:</strong> ${subscription.planName}</p>
            <p><strong>Pause Duration:</strong> ${subscription.pauseDuration}</p>
            <p><strong>Resume Date:</strong> ${subscription.resumeDate}</p>
          </div>
          <p>You can resume your subscription anytime from your account dashboard.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Subscription Resumed
  async sendSubscriptionResumedEmail(subscription, user) {
    const subject = `▶️ Subscription Resumed`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #2E8B57; color: white; padding: 20px; text-align: center;">
          <h1>Subscription Resumed!</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your gas subscription has been successfully resumed.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Subscription Details:</h3>
            <p><strong>Plan:</strong> ${subscription.planName}</p>
            <p><strong>Next Delivery:</strong> ${subscription.nextDeliveryDate}</p>
            <p><strong>Delivery Frequency:</strong> ${subscription.frequency}</p>
          </div>
          <p>Welcome back! Your regular delivery schedule has been restored.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Subscription Cancelled
  async sendSubscriptionCancelledEmail(subscription, user) {
    const subject = `❌ Subscription Cancelled`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #DC143C; color: white; padding: 20px; text-align: center;">
          <h1>Subscription Cancelled</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your gas subscription has been cancelled as requested.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Cancellation Details:</h3>
            <p><strong>Plan:</strong> ${subscription.planName}</p>
            <p><strong>Cancellation Date:</strong> ${
              subscription.cancellationDate
            }</p>
            <p><strong>Refund Amount (if applicable):</strong> ₦${
              subscription.refundAmount || 0
            }</p>
          </div>
          <p>We're sorry to see you go. If you change your mind, you can always create a new subscription anytime.</p>
          <p>Thank you for being our valued customer.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }

  // Support Resolved
  async sendSupportResolvedEmail(ticket, user) {
    const subject = `✅ Support Ticket Resolved - #${ticket.ticketNumber}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #32CD32; color: white; padding: 20px; text-align: center;">
          <h1>Support Ticket Resolved</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          <p>Your support ticket has been resolved by our team.</p>
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Ticket Details:</h3>
            <p><strong>Ticket Number:</strong> ${ticket.ticketNumber}</p>
            <p><strong>Subject:</strong> ${ticket.subject}</p>
            <p><strong>Resolution Date:</strong> ${ticket.resolvedAt}</p>
            <p><strong>Resolved By:</strong> ${ticket.resolvedBy}</p>
          </div>
          <div style="background: #f0f8ff; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h4>Resolution Notes:</h4>
            <p>${ticket.resolutionNotes}</p>
          </div>
          <p>If you need further assistance, please don't hesitate to create a new support ticket.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }


  // Password Reset Request
  async sendPasswordResetEmail(userData) {
    const subject = `🔐 Password Reset Request - ${this.companyName}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #2E8B57; color: white; padding: 20px; text-align: center;">
          <h1>Password Reset Request</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${userData.name},</h2>
          <p>We received a request to reset the password for your ${
            this.companyName
          } account.</p>
          <p>Click the button below to create a new password:</p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${
              userData.resetUrl
            }" style="background: #2E8B57; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              🔑 Reset Your Password
            </a>
          </div>
          
          <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Or copy this link:</strong></p>
            <p style="word-break: break-all; color: #666; font-size: 14px;">${
              userData.resetUrl
            }</p>
          </div>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h4 style="color: #856404;">⚠️ Important Security Notice:</h4>
            <ul style="color: #856404; font-size: 14px;">
              <li>This link will expire in ${
                userData.expiryTime || "10 minutes"
              }</li>
              <li>If you didn't request this, please ignore this email</li>
              <li>Never share your password reset link with anyone</li>
              <li>Our team will never ask for your password</li>
            </ul>
          </div>
          
          <p>If you need help, contact our support team at <a href="mailto:${
            this.supportEmail
          }">${this.supportEmail}</a></p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p>© ${new Date().getFullYear()} ${
      this.companyName
    }. All rights reserved.</p>
          <p>This is an automated message, please do not reply.</p>
        </div>
      </div>
    `;

    const text = `Password Reset Request - ${this.companyName}

Hello ${userData.name},

We received a request to reset the password for your ${
      this.companyName
    } account.

Reset your password by clicking this link:
${userData.resetUrl}

IMPORTANT:
- This link will expire in ${userData.expiryTime || "10 minutes"}
- If you didn't request this, please ignore this email
- Never share your password reset link with anyone

Need help? Contact our support team at ${this.supportEmail}

Best regards,
The ${this.companyName} Team

© ${new Date().getFullYear()} ${this.companyName}. All rights reserved.
This is an automated message, please do not reply.`;

    return this.sendEmail({
      to: userData.email,
      subject,
      html,
      text,
    });
  }

  // Password Reset Success
  async sendPasswordResetSuccessEmail(userData) {
    const subject = `✅ Password Successfully Reset - ${this.companyName}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #32CD32; color: white; padding: 20px; text-align: center;">
          <h1>Password Reset Successful!</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${userData.name},</h2>
          <p>Your ${
            this.companyName
          } account password has been successfully reset!</p>
          
          <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; padding: 15px; margin: 15px 0;">
            <h4 style="color: #155724;">🔒 Security Update:</h4>
            <p style="color: #155724;">
              Password changed on ${
                userData.resetDate || new Date().toLocaleDateString()
              } at 
              ${userData.resetTime || new Date().toLocaleTimeString()}
            </p>
          </div>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h4 style="color: #856404;">🔐 Security Recommendations:</h4>
            <ul style="color: #856404; font-size: 14px;">
              <li>Your new password is now active across all devices</li>
              <li>Use a unique password for your ${
                this.companyName
              } account</li>
              <li>Consider enabling two-factor authentication</li>
              <li>If you didn't make this change, contact us immediately</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${
              this.appUrl
            }/login" style="background: #32CD32; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              🚀 Log In to Your Account
            </a>
          </div>
          
          <p>If you have any questions or didn't reset your password, please contact our support team immediately at <a href="mailto:${
            this.supportEmail
          }">${this.supportEmail}</a></p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p>© ${new Date().getFullYear()} ${
      this.companyName
    }. All rights reserved.</p>
          <p>This is an automated security notification.</p>
        </div>
      </div>
    `;

    const text = `Password Successfully Reset - ${this.companyName}

Hello ${userData.name},

Your ${this.companyName} account password has been successfully reset!

🔒 Security Update:
Password changed on ${userData.resetDate || new Date().toLocaleDateString()} at 
${userData.resetTime || new Date().toLocaleTimeString()}

🔐 Security Recommendations:
• Your new password is now active across all devices
• Use a unique password for your ${this.companyName} account
• Consider enabling two-factor authentication
• If you didn't make this change, contact us immediately

Next Steps:
Log in to your account: ${this.appUrl}/login

⚠️ If you have any questions or didn't reset your password, please contact our support team immediately at ${
      this.supportEmail
    }

Best regards,
The ${this.companyName} Security Team

© ${new Date().getFullYear()} ${this.companyName}. All rights reserved.
This is an automated security notification.`;

    return this.sendEmail({
      to: userData.email,
      subject,
      html,
      text,
    });
  }

  // Suspicious Activity Alert
  async sendSuspiciousActivityAlert(userData) {
    const subject = `⚠️ Suspicious Password Reset Attempt - ${this.companyName}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #DC143C; color: white; padding: 20px; text-align: center;">
          <h1>Suspicious Activity Alert</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${userData.name},</h2>
          <p>We detected a password reset attempt for your ${
            this.companyName
          } account.</p>
          
          <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 5px; padding: 15px; margin: 15px 0;">
            <h4 style="color: #721c24;">🚨 Security Alert:</h4>
            <p style="color: #721c24;">
              If you didn't request this password reset, someone may be trying to access your account.
            </p>
          </div>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h4 style="color: #856404;">🛡️ Immediate Actions Required:</h4>
            <ul style="color: #856404; font-size: 14px;">
              <li>If you requested this, you can ignore this alert</li>
              <li>If NOT, change your password immediately</li>
              <li>Enable two-factor authentication if available</li>
              <li>Check your recent account activity</li>
              <li>Contact support if you see unfamiliar activity</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${
              this.appUrl
            }/security" style="background: #DC143C; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              🔒 Review Account Security
            </a>
          </div>
          
          <p><strong>Contact our security team immediately if:</strong></p>
          <ul style="font-size: 14px;">
            <li>You notice any unauthorized activity</li>
            <li>You need help securing your account</li>
            <li>You have any security concerns</li>
          </ul>
          
          <p>Email: <a href="mailto:${this.supportEmail}">${
      this.supportEmail
    }</a></p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p>© ${new Date().getFullYear()} ${
      this.companyName
    }. All rights reserved.</p>
          <p>This is an automated security alert.</p>
        </div>
      </div>
    `;

    const text = `Suspicious Password Reset Attempt - ${this.companyName}

Hello ${userData.name},

We detected a password reset attempt for your ${this.companyName} account.

🚨 Security Alert:
If you didn't request this password reset, someone may be trying to access your account.

🛡️ Immediate Actions Required:
• If you requested this, you can ignore this alert
• If NOT, change your password immediately
• Enable two-factor authentication if available
• Check your recent account activity
• Contact support if you see unfamiliar activity

Review Account Security: ${this.appUrl}/security

Contact our security team immediately if:
• You notice any unauthorized activity
• You need help securing your account
• You have any security concerns

Email: ${this.supportEmail}

Best regards,
The ${this.companyName} Security Team

© ${new Date().getFullYear()} ${this.companyName}. All rights reserved.
This is an automated security alert.`;

    return this.sendEmail({
      to: userData.email,
      subject,
      html,
      text,
    });
  }

  // Account Locked Alert (for too many failed attempts)
  async sendAccountLockedAlert(userData) {
    const subject = `🔒 Account Temporarily Locked - ${this.companyName}`;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: #FF8C00; color: white; padding: 20px; text-align: center;">
          <h1>Account Temporarily Locked</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${userData.name},</h2>
          <p>Your ${
            this.companyName
          } account has been temporarily locked for security reasons.</p>
          
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 15px 0;">
            <h4 style="color: #856404;">ℹ️ What Happened:</h4>
            <p style="color: #856404;">
              Multiple incorrect password attempts were detected on your account. 
              This is a security measure to protect your account from unauthorized access.
            </p>
            <p style="color: #856404;"><strong>Lock Duration:</strong> ${
              userData.lockDuration || "30 minutes"
            }</p>
          </div>
          
          <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h4 style="color: #0056b3;">🔄 What to Do:</h4>
            <ul style="color: #0056b3; font-size: 14px;">
              <li>Wait ${
                userData.lockDuration || "30 minutes"
              } for the lock to expire</li>
              <li>Use the "Forgot Password" option if you've forgotten your password</li>
              <li>Create a strong, unique password</li>
              <li>Consider using a password manager</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${
              this.appUrl
            }/reset-password" style="background: #FF8C00; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              🔑 Reset Password
            </a>
          </div>
          
          <p><strong>If you didn't attempt to log in:</strong></p>
          <ul style="font-size: 14px;">
            <li>Contact our security team immediately</li>
            <li>Review your account activity</li>
            <li>Change your password after the lock expires</li>
          </ul>
          
          <p>Contact security: <a href="mailto:${this.supportEmail}">${
      this.supportEmail
    }</a></p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 14px;">
          <p>© ${new Date().getFullYear()} ${
      this.companyName
    }. All rights reserved.</p>
          <p>This is an automated security notification.</p>
        </div>
      </div>
    `;

    const text = `Account Temporarily Locked - ${this.companyName}

Hello ${userData.name},

Your ${
      this.companyName
    } account has been temporarily locked for security reasons.

ℹ️ What Happened:
Multiple incorrect password attempts were detected on your account. 
This is a security measure to protect your account from unauthorized access.

Lock Duration: ${userData.lockDuration || "30 minutes"}

🔄 What to Do:
• Wait ${userData.lockDuration || "30 minutes"} for the lock to expire
• Use the "Forgot Password" option if you've forgotten your password
• Create a strong, unique password
• Consider using a password manager

Reset Password: ${this.appUrl}/reset-password

If you didn't attempt to log in:
• Contact our security team immediately
• Review your account activity
• Change your password after the lock expires

Contact security: ${this.supportEmail}

Best regards,
The ${this.companyName} Security Team

© ${new Date().getFullYear()} ${this.companyName}. All rights reserved.
This is an automated security notification.`;

    return this.sendEmail({
      to: userData.email,
      subject,
      html,
      text,
    });
  }

  // Promotional Email
  async sendPromotionalEmail(user, promotion) {
    const subject = promotion.subject;
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
          <h1>${promotion.title}</h1>
          <p style="font-size: 18px; margin-top: 10px;">${promotion.subtitle}</p>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2>Hello ${user.firstName},</h2>
          ${promotion.content}
          <div style="text-align: center; margin: 25px 0;">
            <a href="${promotion.ctaLink}" style="background: #FF6B6B; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">${promotion.ctaText}</a>
          </div>
          <p style="text-align: center; color: #666; font-size: 12px;">${promotion.terms}</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      html,
    });
  }
}

// Create and export singleton instance
const emailService = new EmailService();
module.exports = emailService;
