const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

class EmailService {
  static async sendReceiptEmail({ email, orderNumber, amount, items, paymentMethod, transactionReference, date }) {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Payment Receipt - Order #${orderNumber}`,
      html: `
        <h2>Thank you for your purchase!</h2>
        <p>Your payment has been processed successfully.</p>
        <h3>Order Details:</h3>
        <ul>
          <li>Order Number: ${orderNumber}</li>
          <li>Amount: ₦${amount.toLocaleString()}</li>
          <li>Payment Method: ${paymentMethod}</li>
          <li>Transaction Reference: ${transactionReference}</li>
          <li>Date: ${date.toLocaleDateString()}</li>
        </ul>
      `
    };

    await transporter.sendMail(mailOptions);
  }

  static async sendWelcomeEmail({ email, name, planName, features }) {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Welcome to ${planName} Plan!`,
      html: `
        <h2>Welcome aboard, ${name}!</h2>
        <p>Your ${planName} subscription is now active.</p>
        <h3>Your plan includes:</h3>
        <ul>
          ${features.map(feature => `<li>${feature}</li>`).join('')}
        </ul>
      `
    };

    await transporter.sendMail(mailOptions);
  }
}

module.exports = EmailService;